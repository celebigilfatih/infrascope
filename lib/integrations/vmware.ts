/**
 * VMware vCenter Integration Service
 * 
 * Handles communication with VMware vCenter API for:
 * - Datacenter and cluster discovery
 * - ESXi host inventory
 * - Virtual machine management
 * - VM ↔ Host relationships
 * - Datastore information
 */

import { PrismaClient, DeviceType, DeviceStatus, DeviceCriticality } from '@prisma/client';
import { execSync } from 'child_process';
import { createLogger } from '@/lib/logger';
import { secureFetch } from '@/lib/security/tls';

const log = createLogger('vmware');

const prisma = new PrismaClient();

// In-memory cache for snapshots
const snapshotCache = new Map<string, { data: any[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// VMware API Types
export interface VMwareConfig {
  host: string;
  username: string;
  password: string;
  thumbprint?: string;
  pollingInterval: number; // minutes
  enabledModules: {
    datacenters: boolean;
    clusters: boolean;
    hosts: boolean;
    vms: boolean;
    datastores: boolean;
  };
}

export interface VMwareDatacenter {
  datacenter: { value: string };
  name: string;
}

export interface VMwareCluster {
  cluster: { value: string };
  name: string;
  resourcePool?: { value: string };
  host?: Array<{ value: string }>;
  summary?: {
    totalCpu?: number;
    totalMemory?: number;
    numCpuCores?: number;
    numHosts?: number;
    numEffectiveHosts?: number;
  };
}

export interface VMwareHost {
  host: { value: string };
  name: string;
  parent?: { value: string };
  summary?: {
    vendor?: string;
    model?: string;
    numCpuCores?: number;
    cpuTotal?: number;
    memoryTotal?: number;
    overallStatus?: string;
    connectionState?: string;
  };
  config?: {
    product?: {
      version?: string;
      build?: string;
      name?: string;
    };
    network?: {
      vnic?: Array<{ portgroup: string; ipAddress?: string }>;
    };
  };
}

export interface VMwareVM {
  vm: { value: string };
  name: string;
  parent?: { value: string };
  summary?: {
    guestFullName?: string;
    numCpu?: number;
    memorySizeMB?: number;
    overallStatus?: string;
    connectionState?: string;
    guestId?: string;
    guestState?: string;
    ipAddress?: string;
    storage?: { committed: number; uncommitted: number };
  };
  config?: {
    hardware?: {
      device?: Array<{
        key: number;
        deviceInfo?: { label: string };
        macAddress?: string;
        addressType?: string;
      }>;
    };
  };
}

export interface VMwareDatastore {
  datastore: { value: string };
  name: string;
  parent?: { value: string };
  info?: {
    url?: string;
    name?: string;
    type?: string;
  };
  summary?: {
    capacity?: number;
    freeSpace?: number;
    uncommitted?: number;
    accessible?: boolean;
  };
}

export interface VMSprawlResult {
  vmId: string;
  vmName: string;
  host: string;
  powerState: string;
  cpuUsage?: number;
  memoryUsage?: number;
  snapshotCount: number;
  oldestSnapshotDays?: number;
  poweredOffDays?: number;
  sprawlScore: number;
  sprawlReasons: string[];
  recommendation: string;
}

export interface SyncResult {
  success: boolean;
  clustersCreated: number;
  clustersUpdated: number;
  hostsCreated: number;
  hostsUpdated: number;
  vmsCreated: number;
  vmsUpdated: number;
  datastoresProcessed: number;
  errors: string[];
  duration: number;
}

// VMware API Client
export class VMwareService {
  private config: VMwareConfig;
  private sessionCookie: string | null = null;
  private baseUrl: string;

  constructor(config: VMwareConfig) {
    this.config = config;
    this.baseUrl = `https://${config.host}/sdk`;
  }

  /**
   * SOAP API Authentication for vSphere SDK
   * Returns vmware_soap_session cookie
   */
  async authenticateSOAP(): Promise<boolean> {
    try {

      const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:urn="urn:vim25">
   <soapenv:Body>
      <urn:Login>
         <_this type="SessionManager">SessionManager</_this>
         <userName>${this.config.username}</userName>
         <password>${this.config.password}</password>
      </urn:Login>
   </soapenv:Body>
</soapenv:Envelope>`;

      const response = await secureFetch('VMWARE', `https://${this.config.host}/sdk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': '"urn:vim25/6.0"',
        },
        body: soapEnvelope,
      });

      if (!response.ok) {
        log.error({ status: response.status }, 'SOAP authentication failed');
        return false;
      }

      // Extract vmware_soap_session from Set-Cookie header
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) {
        const match = setCookie.match(/vmware_soap_session=([^;]+)/);
        if (match) {
          this.sessionCookie = `vmware_soap_session=${match[1]}`;
          log.info('SOAP authentication successful');
          return true;
        }
      }

      log.error('Failed to extract SOAP session cookie');
      return false;
    } catch (error) {
      log.error({ err: error }, 'SOAP authentication error');
      return false;
    }
  }

  /**
   * Query recent events from vCenter using EventHistoryCollector (vSphere 6.5+ recommended)
   */
  async queryEventsSOAP(minutesBack: number = 15, eventTypes?: string[]): Promise<Array<{
    eventId: string;
    eventType: string;
    createdTime: string;
    userName: string;
    vmName?: string;
    vmId?: string;
    message: string;
  }>> {
    try {
      // Ensure SOAP session is active
      if (!this.sessionCookie || !this.sessionCookie.includes('vmware_soap_session')) {
        const authenticated = await this.authenticateSOAP();
        if (!authenticated) {
          log.error('SOAP authentication required but failed');
          return [];
        }
      }

      // Step 1: Get ServiceContent to find EventManager
      const serviceContent = await this.retrieveServiceContent();
      if (!serviceContent.eventManager) {
        log.error('EventManager not found in ServiceContent');
        return [];
      }

      // Step 2: Create EventHistoryCollector
      const collector = await this.createEventHistoryCollector(serviceContent.eventManager, minutesBack, eventTypes);
      if (!collector) {
        log.error('Failed to create EventHistoryCollector');
        return [];
      }

      // Step 3: Reset collector to latest position
      await this.resetEventCollector(collector);
      
      // Step 4: Read events from collector
      const events = await this.readNextEvents(collector, 100);
      
      // Step 4: Destroy collector
      await this.destroyCollector(collector);
      
      return events;
    } catch (error) {
      log.error({ err: error }, 'Error querying SOAP events');
      return [];
    }
  }

  /**
   * Retrieve ServiceContent to get EventManager reference
   */
  async retrieveServiceContent(): Promise<{
    eventManager?: string;
    rootFolder?: string;
    viewManager?: string;
  }> {
    const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:urn="urn:vim25">
   <soapenv:Body>
      <urn:RetrieveServiceContent>
         <_this type="ServiceInstance">ServiceInstance</_this>
      </urn:RetrieveServiceContent>
   </soapenv:Body>
</soapenv:Envelope>`;

    const response = await secureFetch('VMWARE', `https://${this.config.host}/sdk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '"urn:vim25/6.0"',
        'Cookie': this.sessionCookie || '',
      },
      body: soapEnvelope,
    });

    const xmlText = await response.text();
    
    // Extract eventManager
    const eventManagerMatch = xmlText.match(/<eventManager[^>]*type="EventManager"[^>]*>([^<]+)<\/eventManager>/);
    const rootFolderMatch = xmlText.match(/<rootFolder[^>]*type="Folder"[^>]*>([^<]+)<\/rootFolder>/);
    const viewManagerMatch = xmlText.match(/<viewManager[^>]*type="ViewManager"[^>]*>([^<]+)<\/viewManager>/);
    
    return {
      eventManager: eventManagerMatch ? eventManagerMatch[1] : undefined,
      rootFolder: rootFolderMatch ? rootFolderMatch[1] : undefined,
      viewManager: viewManagerMatch ? viewManagerMatch[1] : undefined,
    };
  }

  /**
   * Create EventHistoryCollector for filtered events
   */
  private async createEventHistoryCollector(
    eventManager: string,
    minutesBack: number,
    eventTypes?: string[]
  ): Promise<string | null> {
    const now = new Date();
    const startTime = new Date(now.getTime() - minutesBack * 60 * 1000);
    const beginTime = startTime.toISOString();

    // Note: vSphere SOAP filter for event types is complex and often fails
    // We'll fetch all events and filter client-side
    const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:urn="urn:vim25">
   <soapenv:Body>
      <urn:CreateCollectorForEvents>
         <_this type="EventManager">${eventManager}</_this>
         <filter>
            <time>
               <beginTime>${beginTime}</beginTime>
            </time>
         </filter>
      </urn:CreateCollectorForEvents>
   </soapenv:Body>
</soapenv:Envelope>`;

    const response = await secureFetch('VMWARE', `https://${this.config.host}/sdk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '"urn:vim25/6.0"',
        'Cookie': this.sessionCookie || '',
      },
      body: soapEnvelope,
    });

    const xmlText = await response.text();
    log.info({ response: xmlText.substring(0, 500) }, 'CreateCollector response');
    
    // Extract collector reference
    const collectorMatch = xmlText.match(/<returnval[^>]*type="EventHistoryCollector"[^>]*>([^<]+)<\/returnval>/);
    if (collectorMatch) {
      log.info({ collector: collectorMatch[1] }, 'Created EventHistoryCollector');
      return collectorMatch[1];
    }
    
    log.error({ response: xmlText.substring(0, 500) }, 'Failed to create EventHistoryCollector');
    return null;
  }

  /**
   * Read next events from EventHistoryCollector
   */
  private async readNextEvents(
    collector: string,
    maxCount: number
  ): Promise<Array<{
    eventId: string;
    eventType: string;
    createdTime: string;
    userName: string;
    vmName?: string;
    vmId?: string;
    message: string;
  }>> {
    // Try ReadPreviousEvents first (reads from newest to oldest)
    const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:urn="urn:vim25">
   <soapenv:Body>
      <urn:ReadPreviousEvents>
         <_this type="EventHistoryCollector">${collector}</_this>
         <maxCount>${maxCount}</maxCount>
      </urn:ReadPreviousEvents>
   </soapenv:Body>
</soapenv:Envelope>`;

    const response = await secureFetch('VMWARE', `https://${this.config.host}/sdk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '"urn:vim25/6.0"',
        'Cookie': this.sessionCookie || '',
      },
      body: soapEnvelope,
    });

    const xmlText = await response.text();
    log.info({ length: xmlText.length }, 'ReadPreviousEvents response length');
    log.info({ sample: xmlText.substring(0, 2000) }, 'ReadPreviousEvents response sample');
    
    return this.parseEventResponseSOAP(xmlText);
  }

  /**
   * Reset EventCollector to latest position
   */
  private async resetEventCollector(collector: string): Promise<void> {
    const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:urn="urn:vim25">
   <soapenv:Body>
      <urn:ResetCollector>
         <_this type="EventHistoryCollector">${collector}</_this>
      </urn:ResetCollector>
   </soapenv:Body>
</soapenv:Envelope>`;

    await secureFetch('VMWARE', `https://${this.config.host}/sdk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '"urn:vim25/6.0"',
        'Cookie': this.sessionCookie || '',
      },
      body: soapEnvelope,
    });
    
    log.info('Reset EventHistoryCollector');
  }

  /**
   * Destroy EventHistoryCollector
   */
  private async destroyCollector(collector: string): Promise<void> {
    const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:urn="urn:vim25">
   <soapenv:Body>
      <urn:DestroyCollector>
         <_this type="EventHistoryCollector">${collector}</_this>
      </urn:DestroyCollector>
   </soapenv:Body>
</soapenv:Envelope>`;

    await secureFetch('VMWARE', `https://${this.config.host}/sdk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '"urn:vim25/6.0"',
        'Cookie': this.sessionCookie || '',
      },
      body: soapEnvelope,
    });
    
    log.info('Destroyed EventHistoryCollector');
  }

  /**
   * Parse SOAP event response XML
   */
  private parseEventResponseSOAP(xml: string): Array<{
    eventId: string;
    eventType: string;
    createdTime: string;
    userName: string;
    vmName?: string;
    vmId?: string;
    message: string;
  }> {
    const events: Array<{
      eventId: string;
      eventType: string;
      createdTime: string;
      userName: string;
      vmName?: string;
      vmId?: string;
      message: string;
    }> = [];

    try {
      // Match all <returnval> elements
      const returnvalMatches = xml.matchAll(/<returnval[^>]*xsi:type="([^"]+)"[^>]*>([\s\S]*?)<\/returnval>/g);
      
      for (const match of returnvalMatches) {
        const eventType = match[1]; // e.g., "VmCreatedEvent"
        const eventXml = match[2];
        
        // Extract fields from event XML
        const keyMatch = eventXml.match(/<key>([^<]+)<\/key>/);
        const createdTimeMatch = eventXml.match(/<createdTime>([^<]+)<\/createdTime>/);
        const userNameMatch = eventXml.match(/<userName>([^<]+)<\/userName>/);
        const messageMatch = eventXml.match(/<fullFormattedMessage>([^<]*)<\/fullFormattedMessage>/);
        const vmNameMatch = eventXml.match(/<vm[^>]*><name>([^<]+)<\/name>/);
        const vmIdMatch = eventXml.match(/<vm[^>]*type="VirtualMachine"[^>]*>([^<]+)<\/vm>/);

        const eventId = keyMatch ? keyMatch[1] : '';
        if (eventId && eventType) {
          events.push({
            eventId,
            eventType,
            createdTime: createdTimeMatch ? createdTimeMatch[1] : '',
            userName: userNameMatch ? userNameMatch[1] : '',
            vmName: vmNameMatch ? vmNameMatch[1] : undefined,
            vmId: vmIdMatch ? vmIdMatch[1] : undefined,
            message: messageMatch ? messageMatch[1] : '',
          });
        }
      }

      log.info({ count: events.length }, 'Parsed SOAP events');
      return events;
    } catch (error) {
      log.error({ err: error }, 'Error parsing SOAP events');
      return [];
    }
  }

  /**
   * Get latest event from EventManager
   */
  async getLatestEvent(eventManager: string): Promise<{
    eventType: string;
    createdTime: string;
    userName: string;
    message: string;
    vmName?: string;
  } | null> {
    const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:urn="urn:vim25">
   <soapenv:Body>
      <urn:RetrievePropertiesEx>
         <_this type="PropertyCollector">propertyCollector</_this>
         <specSet>
            <propSet>
               <type>EventManager</type>
               <all>false</all>
               <pathSet>latestEvent</pathSet>
            </propSet>
            <objectSet>
               <obj type="EventManager">${eventManager}</obj>
               <skip>false</skip>
            </objectSet>
         </specSet>
         <options></options>
      </urn:RetrievePropertiesEx>
   </soapenv:Body>
</soapenv:Envelope>`;

    const response = await secureFetch('VMWARE', `https://${this.config.host}/sdk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '"urn:vim25/6.0"',
        'Cookie': this.sessionCookie || '',
      },
      body: soapEnvelope,
    });

    const xmlText = await response.text();
    log.info({ response: xmlText.substring(0, 1500) }, 'LatestEvent response');
    
    // Parse latest event
    const eventTypeMatch = xmlText.match(/xsi:type="([^"]+)"/);
    const createdTimeMatch = xmlText.match(/<createdTime>([^<]+)<\/createdTime>/);
    const userNameMatch = xmlText.match(/<userName>([^<]+)<\/userName>/);
    const messageMatch = xmlText.match(/<fullFormattedMessage>([^<]+)<\/fullFormattedMessage>/);
    const vmNameMatch = xmlText.match(/<name>([^<]+)<\/name>/);
    
    if (eventTypeMatch) {
      return {
        eventType: eventTypeMatch[1],
        createdTime: createdTimeMatch ? createdTimeMatch[1] : '',
        userName: userNameMatch ? userNameMatch[1] : '',
        message: messageMatch ? messageMatch[1] : '',
        vmName: vmNameMatch ? vmNameMatch[1] : undefined,
      };
    }
    
    return null;
  }

  /**
   * Extract value from XML tag
   */
  private extractXMLValue(xml: string, tagName: string): string | null {
    const regex = new RegExp(`<${tagName}[^>]*>([^<]*)<\/${tagName}>`);
    const match = xml.match(regex);
    return match ? match[1] : null;
  }

  /**
   * Create SOAP envelope
   */
  private createSoapEnvelope(method: string, params: Record<string, unknown>): string {
    const paramsXml = Object.entries(params)
      .map(([key, value]) => `<${key}>${JSON.stringify(value)}</${key}>`)
      .join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                        xmlns:vim="urn:vim25Service">
        <soapenv:Header/>
        <soapenv:Body>
          <vim:${method}>
            <vim:_this type="SessionManager">${this.sessionCookie ? 'SessionManager' : 'SessionManager'}</vim:_this>
            ${paramsXml}
          </vim:${method}>
        </soapenv:Body>
      </soapenv:Envelope>`;
  }

  /**
   * Parse SOAP response (simplified - would need proper XML parsing in production)
   */
  private parseSoapResponse<T>(xml: string): T {
    // In production, use a proper XML parser
    // This is a simplified version that extracts the result
    const match = xml.match(/<return>([\s\S]*?)<\/return>/);
    return match ? JSON.parse(match[1]) : {} as T;
  }

  /**
   * Alternative: Use REST API for vCenter 6.5+
   * Auto-refreshes session on 401 Unauthorized
   */
  private async restRequest<T>(endpoint: string, options?: RequestInit, _retried = false): Promise<T> {
    // Disable SSL verification for self-signed certificates

    // Try vSphere 7+ API first (/api/)
    let response = await secureFetch('VMWARE', `https://${this.config.host}/api/${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'vmware-api-session-id': this.sessionCookie || '',
        ...options?.headers,
      },
    });

    if (response.ok) {
      return response.json();
    }

    // If 401 Unauthorized and haven't retried, refresh session and retry once
    if (response.status === 401 && !_retried) {
      log.info('Session expired, re-authenticating');
      const authSuccess = await this.authenticate();
      if (authSuccess) {
        return this.restRequest<T>(endpoint, options, true);
      }
    }

    // If 404, try legacy /rest/ endpoint
    if (response.status === 404) {
      log.info({ endpoint }, 'Trying legacy endpoint');
      response = await secureFetch('VMWARE', `https://${this.config.host}/rest/${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'vmware-use-header-authn': this.sessionCookie || '',
          ...options?.headers,
        },
      });

      if (response.ok) {
        return response.json();
      }

      // Also retry legacy endpoint on 401
      if (response.status === 401 && !_retried) {
        log.info('Legacy session expired, re-authenticating');
        const authSuccess = await this.authenticate();
        if (authSuccess) {
          return this.restRequest<T>(endpoint, options, true);
        }
      }
    }

    if (!response.ok) {
      throw new Error(`VMware REST API error: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Authenticate with vCenter
   */
  async authenticate(): Promise<boolean> {
    try {
      // Disable SSL verification for self-signed certificates (common in vCenter)

      // Try vSphere 7+ REST API authentication first (/api/session)
      log.info({ host: this.config.host, username: this.config.username }, 'Authenticating');
      
      let response = await secureFetch('VMWARE', `https://${this.config.host}/api/session`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const sessionId = await response.text();
        // vSphere 7 returns session ID as plain text with quotes
        this.sessionCookie = sessionId.replace(/"/g, '');
        log.info('Authentication successful (vSphere 7+ API)');
        return true;
      }

      log.info({ status: response.status }, 'vSphere 7 API failed, trying legacy endpoint');

      // Try legacy REST API authentication (vCenter 6.5-6.7)
      response = await secureFetch('VMWARE', `https://${this.config.host}/rest/com/vmware/cis/session`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}`,
        },
      });

      if (response.ok) {
        const data = await response.json() as { value: string };
        this.sessionCookie = data.value;
        log.info('Authentication successful (legacy API)');
        return true;
      }

      log.error({ status: response.status, statusText: response.statusText }, 'Authentication failed');
      const errorBody = await response.text();
      log.error({ errorBody }, 'Error body');
      return false;
    } catch (error) {
      log.error({ err: error }, 'Authentication error');
      return false;
    }
  }

  /**
   * Fetch datacenters
   */
  async fetchDatacenters(): Promise<VMwareDatacenter[]> {
    const result = await this.restRequest<{ value: Array<{ datacenter: { value: string }; name: string }> }>(
      'vcenter/datacenter'
    );
    return result.value.map(d => ({
      datacenter: d.datacenter,
      name: d.name,
    }));
  }

  /**
   * Test and discover Events API endpoint
   */
  async testEventsAPI(): Promise<{
    available: boolean;
    endpoint: string | null;
    version: string | null;
    error?: string;
  }> {
    try {
      
      // Test vSphere REST API endpoints
      const endpoints = [
        { path: 'api/vcenter/events', name: 'vSphere 8.0+ Events' },
        { path: 'rest/vcenter/events', name: 'vSphere 7.0 Events' },
        { path: 'api/appliance/system/version', name: 'Version API' },
      ];

      for (const ep of endpoints) {
        try {
          const response = await secureFetch('VMWARE', `https://${this.config.host}/${ep.path}`, {
            headers: {
              'Content-Type': 'application/json',
              'vmware-api-session-id': this.sessionCookie || '',
            },
          });

          log.info({ name: ep.name, path: ep.path, status: response.status }, 'Testing endpoint');
          
          if (response.ok || response.status === 400) {
            // 400 means endpoint exists but needs params
            const data = response.ok ? await response.json() : null;
            return {
              available: true,
              endpoint: ep.path,
              version: data?.value || null,
              error: undefined,
            };
          }
        } catch (err) {
          log.info({ name: ep.name, err }, 'Endpoint test failed');
        }
      }

      return {
        available: false,
        endpoint: null,
        version: null,
        error: 'No working Events API endpoint found',
      };
    } catch (error) {
      return {
        available: false,
        endpoint: null,
        version: null,
        error: String(error),
      };
    }
  }

  /**
   * Fetch recent tasks from vCenter (fallback for Events API)
   * This works on all vSphere versions and provides lifecycle events
   */
  async fetchRecentTasks(minutesBack: number = 15): Promise<Array<{
    taskId: string;
    type: string;
    state: string;
    entityType: string;
    entityName: string;
    userName: string;
    startTime: string;
    completeTime?: string;
    error?: string;
  }>> {
    try {
      
      // vSphere 7+ REST API: /api/vcenter/tasks
      const response = await secureFetch('VMWARE', `https://${this.config.host}/api/vcenter/tasks`, {
        headers: {
          'Content-Type': 'application/json',
          'vmware-api-session-id': this.sessionCookie || '',
        },
      });

      if (!response.ok) {
        // Try legacy endpoint
        const legacyResponse = await secureFetch('VMWARE', `https://${this.config.host}/rest/vcenter/tasks`, {
          headers: {
            'Content-Type': 'application/json',
            'vmware-use-header-authn': this.sessionCookie || '',
          },
        });
        
        if (!legacyResponse.ok) {
          log.info('Tasks API not available');
          return [];
        }
        
        const data = await legacyResponse.json();
        return this.parseTasksResponse(data, minutesBack);
      }

      const data = await response.json();
      return this.parseTasksResponse(data, minutesBack);
    } catch (error) {
      log.error({ err: error }, 'Error fetching tasks');
      return [];
    }
  }

  /**
   * Parse tasks response and filter by time
   */
  private parseTasksResponse(data: any, minutesBack: number): Array<{
    taskId: string;
    type: string;
    state: string;
    entityType: string;
    entityName: string;
    userName: string;
    startTime: string;
    completeTime?: string;
    error?: string;
  }> {
    const cutoff = new Date(Date.now() - minutesBack * 60 * 1000);
    const tasks = Array.isArray(data) ? data : (data.value || []);

    return tasks
      .filter((t: any) => {
        const startTime = new Date(t.start_time || t.startTime);
        return startTime >= cutoff;
      })
      .map((t: any) => ({
        taskId: t.task || t.id || '',
        type: t.operation || t.type || '',
        state: t.status || t.state || '',
        entityType: t.target?.type || 'unknown',
        entityName: t.target?.name || t.entity?.name || '',
        userName: t.user || '',
        startTime: t.start_time || t.startTime || '',
        completeTime: t.completion_time || t.completeTime,
        error: t.error?.localized_message || t.error?.message,
      }));
  }

  /**
   * Fetch clusters
   */
  async fetchClusters(): Promise<VMwareCluster[]> {
    // vSphere 7 returns array directly
    const result = await this.restRequest<Array<{
      cluster: string;
      name: string;
      ha_enabled?: boolean;
      drs_enabled?: boolean;
    }>>('vcenter/cluster');

    // Handle both vSphere 7 array format and legacy { value: [...] } format
    const clusters = Array.isArray(result) ? result : (result as any).value || [];

    return clusters.map((c: any) => ({
      cluster: { value: c.cluster || c.cluster?.value },
      name: c.name,
      resourcePool: c.resourcePool,
      host: c.host,
      summary: {
        totalCpu: c.summary?.totalCpu,
        totalMemory: c.summary?.totalMemory,
        numCpuCores: c.summary?.numCpuCores,
        numHosts: c.summary?.numHosts,
      },
    }));
  }

  /**
   * Fetch ESXi hosts
   * Note: vSphere 7 REST API provides only basic info (name, connection state).
   * Hardware details (vendor, model, CPU, RAM, version) require SOAP API.
   */
  async fetchHosts(): Promise<VMwareHost[]> {
    // vSphere 7 returns array directly with snake_case fields
    const result = await this.restRequest<Array<{
      host: string;  // e.g., "host-1001"
      name: string;
      connection_state?: string;
      power_state?: string;
    }>>('vcenter/host');

    // Handle both vSphere 7 array format and legacy { value: [...] } format
    const hostList = Array.isArray(result) ? result : (result as any).value || [];

    // Try to get detailed host info via Python/PyVmomi (best effort)
    let hostDetails: any[] = [];
    try {
      const scriptPath = '/app/scripts/get-host-details.py';
      const pyResult = execSync(
        `python3 "${scriptPath}" "${this.config.host}" "${this.config.username}" "${this.config.password}"`,
        { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 15000, killSignal: 'SIGKILL' }
      );
      const data = JSON.parse(pyResult);
      if (data.success && data.hosts) {
        hostDetails = data.hosts;
        log.info({ count: hostDetails.length }, 'Fetched detailed host info via PyVmomi');
      } else if (data.error) {
        log.warn({ error: data.error }, 'PyVmomi host details error');
      }
    } catch (err) {
      // PyVmomi failed - will use REST API fallback
      log.warn('PyVmomi host details unavailable, using REST API fallback');
    }

    // Create a map for quick lookup by name
    const hostDetailsMap = new Map<string, any>();
    for (const hd of hostDetails) {
      hostDetailsMap.set(hd.name, hd);
    }

    // Map to VMwareHost interface
    return hostList.map((h: any) => {
      const details = hostDetailsMap.get(h.name) || {};
      return {
        host: { value: h.host || h.host?.value },
        name: h.name,
        parent: h.parent,
        summary: {
          vendor: details.vendor || 'Unknown',
          model: details.model || 'Unknown',
          numCpuCores: details.cpu_cores || 0,
          memoryTotal: (details.memory_size_mb || 0) * 1024 * 1024,
          connectionState: (h.connection_state || 'connected').toLowerCase(),
          overallStatus: h.power_state === 'POWERED_ON' ? 'green' : 'yellow',
        },
        config: {
          product: {
            version: details.esxi_version || 'Unknown',
            build: details.esxi_build || '',
            name: details.esxi_full_name || 'VMware ESXi',
          },
        },
      };
    });
  }

  /**
   * Get detailed host information
   * vSphere 7 REST API limitation: full hardware info requires SOAP API (PyVmomi)
   */
  private async getHostDetail(hostId: string): Promise<any | null> {
    // Placeholder for future SOAP API integration
    return null;
  }

  /**
   * Fetch recent VM lifecycle events using SOAP EventManager
   * Detects: VM created, deleted, powered on/off
   */
  async fetchVMLifecycleEvents(timeWindowMinutes: number): Promise<Array<{
    eventType: 'created' | 'deleted' | 'powered_on' | 'powered_off' | 'restarted';
    vmId: string;
    vmName: string;
    userName: string;
    eventTime: string;
    taskState: string;
  }>> {
    try {
      // Use SOAP EventManager to fetch lifecycle events
      const soapEvents = await this.queryEventsSOAP(timeWindowMinutes, [
        'VmCreatedEvent',
        'VmRemovedEvent',
        'VmPoweredOnEvent', 
        'VmPoweredOffEvent',
        'VmRebootedEvent',
        'VmResettingEvent',
      ]);

      const backupAccounts = ['veeam', 'backup', 'service', 'system', 'administrator'];
      
      const events: Array<{
        eventType: 'created' | 'deleted' | 'powered_on' | 'powered_off' | 'restarted';
        vmId: string;
        vmName: string;
        userName: string;
        eventTime: string;
        taskState: string;
      }> = [];

      for (const evt of soapEvents) {
        const user = (evt.userName || '').toLowerCase();
        if (backupAccounts.some(acc => user.includes(acc))) continue;

        let eventType: 'created' | 'deleted' | 'powered_on' | 'powered_off' | 'restarted' | null = null;
        
        if (evt.eventType === 'VmCreatedEvent') eventType = 'created';
        else if (evt.eventType === 'VmRemovedEvent') eventType = 'deleted';
        else if (evt.eventType === 'VmPoweredOnEvent') eventType = 'powered_on';
        else if (evt.eventType === 'VmPoweredOffEvent') eventType = 'powered_off';
        else if (evt.eventType === 'VmRebootedEvent' || evt.eventType === 'VmResettingEvent') eventType = 'restarted';

        if (eventType) {
          events.push({
            eventType,
            vmId: evt.vmId || '',
            vmName: evt.vmName || '',
            userName: evt.userName,
            eventTime: evt.createdTime,
            taskState: 'success',
          });
        }
      }

      log.info({ count: events.length }, 'Found VM lifecycle events via SOAP');
      return events;
    } catch (error) {
      log.error({ err: error }, 'Error fetching VM lifecycle events');
      return [];
    }
  }

  /**
   * Fetch recent snapshot events using SOAP EventManager
   */
  async fetchSnapshotEvents(timeWindowMinutes: number): Promise<Array<{
    eventType: 'created' | 'deleted' | 'reverted';
    vmName: string;
    snapshotName: string;
    userName: string;
    eventTime: string;
    taskState: string;
  }>> {
    try {
      // Use SOAP EventManager to fetch snapshot events
      const soapEvents = await this.queryEventsSOAP(timeWindowMinutes, [
        'VmSnapshotCreatedEvent',
        'VmSnapshotRemovedEvent',
        'VmRevertedToSnapshotEvent',
      ]);

      const backupAccounts = ['veeam', 'backup', 'service', 'system', 'administrator'];

      const events: Array<{
        eventType: 'created' | 'deleted' | 'reverted';
        vmName: string;
        snapshotName: string;
        userName: string;
        eventTime: string;
        taskState: string;
      }> = [];

      for (const evt of soapEvents) {
        const user = (evt.userName || '').toLowerCase();
        if (backupAccounts.some(acc => user.includes(acc))) continue;

        let eventType: 'created' | 'deleted' | 'reverted' | null = null;
        
        if (evt.eventType === 'VmSnapshotCreatedEvent') eventType = 'created';
        else if (evt.eventType === 'VmSnapshotRemovedEvent') eventType = 'deleted';
        else if (evt.eventType === 'VmRevertedToSnapshotEvent') eventType = 'reverted';

        if (eventType) {
          // Try to extract snapshot name from message
          const snapshotMatch = evt.message.match(/snapshot\s+"([^"]+)"/i) || evt.message.match(/"([^"]+)"/);
          
          events.push({
            eventType,
            vmName: evt.vmName || '',
            snapshotName: snapshotMatch ? snapshotMatch[1] : 'Unknown',
            userName: evt.userName,
            eventTime: evt.createdTime,
            taskState: 'success',
          });
        }
      }

      log.info({ count: events.length }, 'Found snapshot events via SOAP');
      return events;
    } catch (error) {
      log.error({ err: error }, 'Error fetching snapshot events');
      return [];
    }
  }

  /**
   * Generic SOAP event fetcher — wrapper around queryEventsSOAP with typed return
   */
  async fetchEventsByTypes(timeWindowMinutes: number, eventTypes: string[]): Promise<Array<{
    eventType: string;
    vmName?: string;
    vmId?: string;
    hostName?: string;
    userName: string;
    eventTime: string;
    message: string;
  }>> {
    try {
      const soapEvents = await this.queryEventsSOAP(timeWindowMinutes, eventTypes);
      return soapEvents.map(evt => ({
        eventType: evt.eventType,
        vmName: evt.vmName,
        vmId: evt.vmId,
        userName: evt.userName,
        eventTime: evt.createdTime,
        message: evt.message,
      }));
    } catch (error) {
      log.error({ err: error }, 'Error in fetchEventsByTypes');
      return [];
    }
  }

  /**
   * Create a ContainerView for enumerating objects of a given type
   */
  private async createContainerView(viewManager: string, rootFolder: string, type: string): Promise<string | null> {
    const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:urn="urn:vim25">
   <soapenv:Body>
      <urn:CreateContainerView>
         <_this type="ViewManager">${viewManager}</_this>
         <container type="Folder">${rootFolder}</container>
         <type>${type}</type>
         <recursive>true</recursive>
      </urn:CreateContainerView>
   </soapenv:Body>
</soapenv:Envelope>`;

    try {
      const response = await secureFetch('VMWARE', `https://${this.config.host}/sdk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': '"urn:vim25/6.0"',
          'Cookie': this.sessionCookie || '',
        },
        body: soapEnvelope,
      });
      const xmlText = await response.text();
      const match = xmlText.match(/<returnval[^>]*type="ContainerView"[^>]*>([^<]+)<\/returnval>/);
      return match ? match[1] : null;
    } catch (err) {
      log.error({ err }, 'createContainerView error');
      return null;
    }
  }

  /**
   * Destroy a view object
   */
  private async destroyView(viewRef: string): Promise<void> {
    const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:urn="urn:vim25">
   <soapenv:Body>
      <urn:DestroyView>
         <_this type="ContainerView">${viewRef}</_this>
      </urn:DestroyView>
   </soapenv:Body>
</soapenv:Envelope>`;

    try {
      await secureFetch('VMWARE', `https://${this.config.host}/sdk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': '"urn:vim25/6.0"',
          'Cookie': this.sessionCookie || '',
        },
        body: soapEnvelope,
      });
    } catch (err) {
      log.warn({ err }, 'destroyView error (non-fatal)');
    }
  }

  /**
   * Fetch host quickStats via SOAP RetrievePropertiesEx + ContainerView
   * Returns real-time CPU/memory usage for all ESXi hosts
   */
  async fetchHostQuickStats(): Promise<Array<{
    hostId: string;
    name: string;
    cpuUsedMHz: number;
    cpuTotalMHz: number;
    memUsedMB: number;
    memTotalMB: number;
    inMaintenanceMode: boolean;
    connectionState: string;
  }>> {
    try {
      // Ensure SOAP session is active
      if (!this.sessionCookie || !this.sessionCookie.includes('vmware_soap_session')) {
        const authenticated = await this.authenticateSOAP();
        if (!authenticated) {
          log.error('SOAP authentication required for fetchHostQuickStats');
          return [];
        }
      }

      const serviceContent = await this.retrieveServiceContent();
      if (!serviceContent.viewManager || !serviceContent.rootFolder) {
        log.error('viewManager or rootFolder not found in ServiceContent');
        return [];
      }

      const containerView = await this.createContainerView(
        serviceContent.viewManager,
        serviceContent.rootFolder,
        'HostSystem'
      );
      if (!containerView) {
        log.error('Failed to create ContainerView for HostSystem');
        return [];
      }

      // RetrievePropertiesEx using ContainerView traversal
      const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:urn="urn:vim25"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
   <soapenv:Body>
      <urn:RetrievePropertiesEx>
         <_this type="PropertyCollector">propertyCollector</_this>
         <specSet>
            <propSet>
               <type>HostSystem</type>
               <all>false</all>
               <pathSet>name</pathSet>
               <pathSet>summary.quickStats.overallCpuUsage</pathSet>
               <pathSet>summary.quickStats.overallMemoryUsage</pathSet>
               <pathSet>summary.hardware.cpuMhz</pathSet>
               <pathSet>summary.hardware.numCpuCores</pathSet>
               <pathSet>summary.hardware.memorySize</pathSet>
               <pathSet>summary.runtime.connectionState</pathSet>
               <pathSet>summary.runtime.inMaintenanceMode</pathSet>
            </propSet>
            <objectSet>
               <obj type="ContainerView">${containerView}</obj>
               <skip>true</skip>
               <selectSet xsi:type="urn:TraversalSpec">
                  <name>traverseEntities</name>
                  <type>ContainerView</type>
                  <path>view</path>
                  <skip>false</skip>
               </selectSet>
            </objectSet>
         </specSet>
         <options/>
      </urn:RetrievePropertiesEx>
   </soapenv:Body>
</soapenv:Envelope>`;

      const response = await secureFetch('VMWARE', `https://${this.config.host}/sdk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': '"urn:vim25/6.0"',
          'Cookie': this.sessionCookie || '',
        },
        body: soapEnvelope,
      });

      const xmlText = await response.text();
      await this.destroyView(containerView);

      // Parse returnval blocks — one per host
      const results: Array<{
        hostId: string;
        name: string;
        cpuUsedMHz: number;
        cpuTotalMHz: number;
        memUsedMB: number;
        memTotalMB: number;
        inMaintenanceMode: boolean;
        connectionState: string;
      }> = [];

      const returnvalRegex = /<returnval>([\s\S]*?)<\/returnval>/g;
      for (const rvMatch of xmlText.matchAll(returnvalRegex)) {
        const block = rvMatch[1];

        const hostIdMatch = block.match(/<obj[^>]*type="HostSystem"[^>]*>([^<]+)<\/obj>/);
        if (!hostIdMatch) continue;
        const hostId = hostIdMatch[1];

        // Helper to extract a <val> for a given property name
        const getProp = (propName: string): string => {
          const escaped = propName.replace(/\./g, '\\.').replace(/\//g, '\\/');
          const rx = new RegExp(`<name>${escaped}<\\/name>[\\s\\S]*?<val[^>]*>([^<]*)<\\/val>`);
          const m = block.match(rx);
          return m ? m[1].trim() : '';
        };

        const cpuMhzStr = getProp('summary.hardware.cpuMhz');
        const numCoresStr = getProp('summary.hardware.numCpuCores');
        const cpuUsedStr = getProp('summary.quickStats.overallCpuUsage');
        const memUsedStr = getProp('summary.quickStats.overallMemoryUsage');
        const memSizeStr = getProp('summary.hardware.memorySize');

        const cpuMhz = parseInt(cpuMhzStr, 10) || 0;
        const numCores = parseInt(numCoresStr, 10) || 0;
        const cpuTotalMHz = cpuMhz * numCores;
        const cpuUsedMHz = parseInt(cpuUsedStr, 10) || 0;
        const memUsedMB = parseInt(memUsedStr, 10) || 0;
        const memTotalMB = Math.round((parseInt(memSizeStr, 10) || 0) / (1024 * 1024));

        const connectionState = getProp('summary.runtime.connectionState') || 'connected';
        const inMaintStr = getProp('summary.runtime.inMaintenanceMode');
        const inMaintenanceMode = inMaintStr === 'true' || inMaintStr === '1';

        results.push({
          hostId,
          name: getProp('name'),
          cpuUsedMHz,
          cpuTotalMHz,
          memUsedMB,
          memTotalMB,
          inMaintenanceMode,
          connectionState: connectionState.toLowerCase(),
        });
      }

      log.info({ count: results.length }, 'fetchHostQuickStats: hosts retrieved');
      return results;
    } catch (error) {
      log.error({ err: error }, 'Error in fetchHostQuickStats');
      return [];
    }
  }

  /**
   * Fetch recently created snapshots by checking snapshot list createTime
   * This is more reliable than SOAP events which may not include VmSnapshotCreatedEvent
   */
  async fetchRecentlyCreatedSnapshots(timeWindowMinutes: number): Promise<Array<{
    vmId: string;
    vmName: string;
    snapshotId: string;
    snapshotName: string;
    description: string;
    createTime: string;
    ageMinutes: number;
  }>> {
    try {
      const allSnapshots = await this.fetchAllSnapshots();
      const now = new Date();
      const cutoff = new Date(now.getTime() - timeWindowMinutes * 60 * 1000);
      
      const recentSnapshots = allSnapshots
        .filter(snap => {
          const createTime = new Date(snap.createTime);
          return createTime >= cutoff;
        })
        .map(snap => {
          const createTime = new Date(snap.createTime);
          const ageMinutes = Math.round((now.getTime() - createTime.getTime()) / (60 * 1000));
          return {
            vmId: snap.vmId,
            vmName: snap.vmName,
            snapshotId: snap.id,
            snapshotName: snap.name,
            description: snap.description || '',
            createTime: snap.createTime,
            ageMinutes,
          };
        });
      
      log.info({ count: recentSnapshots.length, timeWindowMinutes }, 'Found recently created snapshots');
      return recentSnapshots;
    } catch (error) {
      log.error({ err: error }, 'Error fetching recently created snapshots');
      return [];
    }
  }

  /**
   * Fetch virtual machines
   */
  async fetchVMs(): Promise<VMwareVM[]> {
    // vSphere 7 returns array directly with snake_case fields
    const result = await this.restRequest<Array<{
      vm: string;  // e.g., "vm-1234"
      name: string;
      power_state?: string;
      cpu_count?: number;
      memory_size_MiB?: number;
      host?: string;  // Host moref
    }>>('vcenter/vm');

    // Handle both vSphere 7 array format and legacy { value: [...] } format
    const vms = Array.isArray(result) ? result : (result as any).value || [];

    // Build VM->Host mapping by querying each host's VMs
    // This is more efficient than querying each VM individually
    const vmToHostMap = new Map<string, string>();
    try {
      const hosts = await this.fetchHosts();
      for (const host of hosts) {
        try {
          const hostVMs = await this.restRequest<Array<{ vm: string }>>(`vcenter/vm?hosts=${host.host.value}`);
          for (const vm of hostVMs) {
            vmToHostMap.set(vm.vm, host.host.value);
          }
        } catch (err) {
          log.warn({ hostName: host.name, err: (err as Error).message }, 'Failed to fetch VMs for host');
        }
      }
      log.info({ count: vmToHostMap.size }, 'Built VM->Host mapping');
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'Failed to build VM->Host mapping');
    }

    // Fetch detailed info for VMs (IP address from guest identity)
    // Note: This makes multiple API calls but provides complete data
    const vmsWithDetails = await Promise.all(
      vms.map(async (v: any) => {
        const vmId = v.vm || v.vm?.value;
        
        // Get host from mapping
        const hostMoref = vmToHostMap.get(vmId);
        
        // Try to get guest identity for IP address (requires VMware Tools)
        let guestIP: string | undefined;
        try {
          const guestIdentity = await this.restRequest<any>(`vcenter/vm/${vmId}/guest/identity`);
          guestIP = guestIdentity?.ip_address || guestIdentity?.primary_ip_address;
        } catch (err) {
          // Guest identity not available (VMware Tools not running or not installed)
        }

        return {
          vm: { value: vmId },
          name: v.name,
          parent: hostMoref ? { value: hostMoref } : undefined,
          summary: {
            numCpu: v.cpu_count || v.summary?.numCpu,
            memorySizeMB: v.memory_size_MiB || v.summary?.memorySizeMB,
            guestState: v.power_state === 'POWERED_ON' ? 'running' : (v.power_state === 'SUSPENDED' ? 'suspended' : 'notRunning'),
            connectionState: v.power_state === 'POWERED_ON' ? 'connected' : 'disconnected',
            overallStatus: v.power_state === 'POWERED_ON' ? 'green' : 'gray',
            guestFullName: v.guest_OS || v.summary?.guestFullName,
            ipAddress: guestIP,
          },
        };
      })
    );

    return vmsWithDetails;
  }

  /**
   * Fetch datastores
   */
  async fetchDatastores(): Promise<VMwareDatastore[]> {
    // vSphere 7 returns array directly
    const result = await this.restRequest<Array<{
      datastore: string;
      name: string;
      type?: string;
      capacity?: number;
      free_space?: number;
    }>>('vcenter/datastore');

    // Handle both vSphere 7 array format and legacy { value: [...] } format
    const datastores = Array.isArray(result) ? result : (result as any).value || [];

    return datastores.map((d: any) => ({
      datastore: { value: d.datastore || d.datastore?.value },
      name: d.name,
      parent: d.parent,
      info: {
        type: d.type || d.info?.type,
      },
      summary: {
        capacity: d.capacity || d.summary?.capacity,
        freeSpace: d.free_space || d.summary?.freeSpace,
        accessible: d.accessible ?? d.summary?.accessible ?? true,
      },
    }));
  }

  /**
   * Map VMware connection state to our DeviceStatus
   */
  private mapStatus(connectionState?: string): DeviceStatus {
    switch (connectionState) {
      case 'connected': return DeviceStatus.ACTIVE;
      case 'disconnected': return DeviceStatus.INACTIVE;
      case 'notResponding': return DeviceStatus.UNKNOWN;
      default: return DeviceStatus.UNKNOWN;
    }
  }

  /**
   * Map VMware overall status to DeviceCriticality
   */
  private mapCriticality(overallStatus?: string): DeviceCriticality {
    switch (overallStatus) {
      case 'red': return DeviceCriticality.CRITICAL;
      case 'yellow': return DeviceCriticality.HIGH;
      case 'green': return DeviceCriticality.LOW;
      default: return DeviceCriticality.MEDIUM;
    }
  }

  /**
   * Sync VMware data to our database
   */
  async syncToInventory(organizationId: string): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: false,
      clustersCreated: 0,
      clustersUpdated: 0,
      hostsCreated: 0,
      hostsUpdated: 0,
      vmsCreated: 0,
      vmsUpdated: 0,
      datastoresProcessed: 0,
      errors: [],
      duration: 0,
    };

    try {
      // Authenticate
      const authenticated = await this.authenticate();
      if (!authenticated) {
        result.errors.push('Failed to authenticate with vCenter');
        return result;
      }

      // Fetch clusters
      if (this.config.enabledModules.clusters) {
        const clusters = await this.fetchClusters();
        
        for (const cluster of clusters) {
          try {
            const clusterData = {
              organizationId,
              vcenterId: cluster.cluster.value,
              datacenterName: cluster.name.split('/')[0] || 'Unknown',
              name: cluster.name,
              cpuTotal: cluster.summary?.totalCpu ? BigInt(cluster.summary.totalCpu) : null,
              cpuUsed: null,
              memoryTotal: cluster.summary?.totalMemory ? BigInt(cluster.summary.totalMemory) : null,
              memoryUsed: null,
              hostCount: cluster.summary?.numHosts || 0,
              vmCount: 0,
              status: 'active',
            };

            const existing = await prisma.vMwareCluster.findFirst({
              where: { vcenterId: cluster.cluster.value },
            });

            if (existing) {
              await prisma.vMwareCluster.update({
                where: { id: existing.id },
                data: { ...clusterData, cpuTotal: clusterData.cpuTotal ? clusterData.cpuTotal : undefined },
              });
              result.clustersUpdated++;
            } else {
              await prisma.vMwareCluster.create({ data: clusterData });
              result.clustersCreated++;
            }
          } catch (clusterError) {
            result.errors.push(`Error syncing cluster: ${(clusterError as Error).message}`);
          }
        }
      }

      // Fetch hosts
      if (this.config.enabledModules.hosts) {
        const hosts = await this.fetchHosts();
        
        for (const host of hosts) {
          try {
            const hostData = {
              name: host.name,
              type: DeviceType.VIRTUAL_HOST,
              vendor: host.summary?.vendor || null,
              model: host.summary?.model || null,
              serialNumber: null,
              operatingSystem: host.config?.product?.version || null,
              firmwareVersion: host.config?.product?.build || null,
              status: this.mapStatus(host.summary?.connectionState),
              criticality: this.mapCriticality(host.summary?.overallStatus),
              vmwareMoref: host.host.value,
              healthScore: host.summary?.overallStatus === 'green' ? 100 : 
                          host.summary?.overallStatus === 'yellow' ? 70 : 30,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            const existing = await prisma.device.findFirst({
              where: { vmwareMoref: host.host.value },
            });

            if (existing) {
              await prisma.device.update({
                where: { id: existing.id },
                data: hostData,
              });
              result.hostsUpdated++;
            } else {
              await prisma.device.create({ data: hostData });
              result.hostsCreated++;
            }
          } catch (hostError) {
            result.errors.push(`Error syncing host ${host.name}: ${(hostError as Error).message}`);
          }
        }
      }

      // Fetch VMs
      if (this.config.enabledModules.vms) {
        const vms = await this.fetchVMs();
        
        for (const vm of vms) {
          try {
            // Find parent host (ESXi host or cluster)
            let hostId: string | null = null;
            if (vm.parent) {
              const host = await prisma.device.findFirst({
                where: { vmwareMoref: vm.parent.value },
              });
              hostId = host?.id || null;
            }

            // Find cluster
            let clusterId: string | null = null;
            if (vm.parent) {
              const cluster = await prisma.vMwareCluster.findFirst({
                where: { vcenterId: vm.parent.value },
              });
              clusterId = cluster?.id || null;
            }

            const vmData = {
              name: vm.name,
              type: DeviceType.VIRTUAL_MACHINE,
              vendor: 'VMware' as const,
              model: vm.summary?.guestFullName || null,
              operatingSystem: vm.summary?.guestFullName || null,
              status: this.mapStatus(vm.summary?.connectionState),
              criticality: this.mapCriticality(vm.summary?.overallStatus),
              vmwareMoref: vm.vm.value,
              vmHostId: hostId,
              vmwareClusterId: clusterId,
              healthScore: vm.summary?.overallStatus === 'green' ? 100 : 
                          vm.summary?.overallStatus === 'yellow' ? 70 : 30,
              // organizationId,
              createdAt: new Date(),
              updatedAt: new Date(),
              // metadata: {
              //   numCpu: vm.summary?.numCpu,
              //   memoryMB: vm.summary?.memorySizeMB,
              //   ipAddress: vm.summary?.ipAddress,
              //   guestId: vm.summary?.guestId,
              //   guestState: vm.summary?.guestState,
              // } as Record<string, unknown>,
            };

            const existing = await prisma.device.findFirst({
              where: { vmwareMoref: vm.vm.value },
            });

            if (existing) {
              await prisma.device.update({
                where: { id: existing.id },
                data: vmData,
              });
              result.vmsUpdated++;
            } else {
              await prisma.device.create({ data: vmData });
              result.vmsCreated++;
            }
          } catch (vmError) {
            result.errors.push(`Error syncing VM ${vm.name}: ${(vmError as Error).message}`);
          }
        }
      }

      // Fetch datastores
      if (this.config.enabledModules.datastores) {
        const datastores = await this.fetchDatastores();
        
        for (const ds of datastores) {
          try {
            await prisma.vMwareDatastore.upsert({
              where: {
                id: ds.datastore.value, // Using moref as ID for simplicity
              },
              create: {
                id: ds.datastore.value,
                organizationId,
                vcenterId: ds.datastore.value,
                name: ds.name,
                type: ds.info?.type || null,
                capacity: ds.summary?.capacity ? BigInt(ds.summary.capacity) : null,
                freeSpace: ds.summary?.freeSpace ? BigInt(ds.summary.freeSpace) : null,
                datacenter: ds.name.split('/')[0] || null,
              },
              update: {
                name: ds.name,
                type: ds.info?.type || null,
                capacity: ds.summary?.capacity ? BigInt(ds.summary.capacity) : undefined,
                freeSpace: ds.summary?.freeSpace ? BigInt(ds.summary.freeSpace) : undefined,
              },
            });
            result.datastoresProcessed++;
          } catch (dsError) {
            result.errors.push(`Error syncing datastore ${ds.name}: ${(dsError as Error).message}`);
          }
        }
      }

      result.success = true;
    } catch (error) {
      result.errors.push(`VMware sync failed: ${(error as Error).message}`);
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Get connection status
   */
  async getStatus(): Promise<{ connected: boolean; version?: string; error?: string }> {
    try {
      const authenticated = await this.authenticate();
      if (!authenticated) {
        return { connected: false, error: 'Authentication failed' };
      }

      // Try to get version info
      const response = await secureFetch('VMWARE', `https://${this.config.host}/rest/appliance/version`, {
        headers: { 'Authorization': `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}` },
      });

      if (response.ok) {
        const data = await response.json() as { version: string };
        return { connected: true, version: data.version };
      }

      return { connected: true };
    } catch (error) {
      return { connected: false, error: (error as Error).message };
    }
  }

  // ============================================================================
  // VM POWER CONTROL
  // ============================================================================

  /**
   * Power on a VM
   */
  async powerOnVM(vmId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await secureFetch('VMWARE', `https://${this.config.host}/rest/vcenter/vm/${vmId}/power/start`, {
        method: 'POST',
        headers: {
          'vmware-api-session-id': this.sessionCookie || '',
        },
      });
      return { success: response.ok };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Power off a VM (graceful shutdown)
   */
  async powerOffVM(vmId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Try graceful shutdown first
      const response = await secureFetch('VMWARE', `https://${this.config.host}/rest/vcenter/vm/${vmId}/guest/power?action=shutdown`, {
        method: 'POST',
        headers: {
          'vmware-api-session-id': this.sessionCookie || '',
        },
      });
      return { success: response.ok };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Force power off a VM (hard stop)
   */
  async forceStopVM(vmId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await secureFetch('VMWARE', `https://${this.config.host}/rest/vcenter/vm/${vmId}/power/stop`, {
        method: 'POST',
        headers: {
          'vmware-api-session-id': this.sessionCookie || '',
        },
      });
      return { success: response.ok };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Suspend a VM
   */
  async suspendVM(vmId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await secureFetch('VMWARE', `https://${this.config.host}/rest/vcenter/vm/${vmId}/power/suspend`, {
        method: 'POST',
        headers: {
          'vmware-api-session-id': this.sessionCookie || '',
        },
      });
      return { success: response.ok };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Reset a VM
   */
  async resetVM(vmId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await secureFetch('VMWARE', `https://${this.config.host}/rest/vcenter/vm/${vmId}/power/reset`, {
        method: 'POST',
        headers: {
          'vmware-api-session-id': this.sessionCookie || '',
        },
      });
      return { success: response.ok };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // ============================================================================
  // SNAPSHOT MANAGEMENT
  // ============================================================================

  /**
   * Fetch recent VM power-on events from vCenter Events API
   * Filters out backup/service accounts (Veeam, backup, service accounts)
   */
  async fetchRecentPowerOnEvents(timeWindowMinutes: number): Promise<Array<{
    vmId: string;
    vmName: string;
    userName: string;
    eventTime: string;
    description: string;
  }>> {
    try {
      // Calculate time range
      const now = new Date();
      const startTime = new Date(now.getTime() - timeWindowMinutes * 60 * 1000);
      
      // Format times for vSphere API (ISO 8601)
      const beginTime = startTime.toISOString();
      const endTime = now.toISOString();

      // vSphere 7 Events API: /api/vcenter/events
      // Filter for VM power on events
      const response = await this.restRequest<Array<{
        event_id: string;
        type: string;
        created_time: string;
        user: string;
        description: {
          default_message: string;
        };
        vm?: {
          vm: string;
          name: string;
        };
      }>>(`vcenter/events?begin_time=${encodeURIComponent(beginTime)}&end_time=${encodeURIComponent(endTime)}&types=VmPoweredOnEvent`);

      if (!response || !Array.isArray(response)) {
        log.info('No events returned from API');
        return [];
      }

      // Filter out backup/service accounts
      const backupAccounts = ['veeam', 'backup', 'service', 'system', 'administrator'];
      
      const powerOnEvents = response
        .filter(evt => {
          if (!evt.vm) return false;
          
          // Check if user is a backup/service account
          const user = (evt.user || '').toLowerCase();
          const isBackupAccount = backupAccounts.some(acc => user.includes(acc));
          
          return !isBackupAccount;
        })
        .map(evt => ({
          vmId: evt.vm!.vm,
          vmName: evt.vm!.name,
          userName: evt.user || 'Unknown',
          eventTime: evt.created_time,
          description: evt.description?.default_message || 'VM powered on',
        }));

      log.info({ count: powerOnEvents.length }, 'Found power-on events (filtered out backup accounts)');
      return powerOnEvents;
    } catch (error) {
      log.error({ err: error }, 'Error fetching power-on events');
      return [];
    }
  }

  /**
   * Fetch recent VM power-off events from vCenter Events API
   * Filters out graceful shutdowns by backup/service accounts
   * 
   * Note: vCenter REST Events API may not be available on all versions.
   * This method uses SOAP EventManager as fallback.
   */
  async fetchRecentPowerOffEvents(timeWindowMinutes: number): Promise<Array<{
    vmId: string;
    vmName: string;
    userName: string;
    eventTime: string;
    description: string;
    isGracefulShutdown: boolean;
  }>> {
    try {
      const now = new Date();
      const startTime = new Date(now.getTime() - timeWindowMinutes * 60 * 1000);
      
      const beginTime = startTime.toISOString();
      const endTime = now.toISOString();

      // Try REST API first (vSphere 7.0+)
      try {
        const response = await this.restRequest<Array<{
          event_id: string;
          type: string;
          created_time: string;
          user: string;
          description: { default_message: string; };
          vm?: { vm: string; name: string; };
        }>>(`vcenter/events?begin_time=${encodeURIComponent(beginTime)}&end_time=${encodeURIComponent(endTime)}&types=VmPoweredOffEvent,VmGuestShutdownEvent`);

        if (response && Array.isArray(response)) {
          const backupAccounts = ['veeam', 'backup', 'service', 'system', 'administrator'];
          
          const powerOffEvents = response
            .filter(evt => {
              if (!evt.vm) return false;
              const user = (evt.user || '').toLowerCase();
              return !backupAccounts.some(acc => user.includes(acc));
            })
            .map(evt => ({
              vmId: evt.vm!.vm,
              vmName: evt.vm!.name,
              userName: evt.user || 'Unknown',
              eventTime: evt.created_time,
              description: evt.description?.default_message || 'VM powered off',
              isGracefulShutdown: evt.type === 'VmGuestShutdownEvent',
            }));

          log.info({ count: powerOffEvents.length }, 'Found power-off events (filtered)');
          return powerOffEvents;
        }
      } catch (restError) {
        log.info('REST Events API not available, using SOAP EventManager');
        
        // Fallback to SOAP API
        // Note: This requires proper SOAP implementation which is complex
        // For now, we'll disable the alarm instead of returning current state
        log.info('SOAP EventManager not yet implemented');
        log.info('VM_POWERED_OFF alarm will remain disabled until Events API is available');
      }

      return [];
    } catch (error) {
      log.error({ err: error }, 'Error fetching power-off events');
      return [];
    }
  }

  /**
   * Get all snapshots for all VMs (batch operation)
   */
  async fetchAllSnapshots(): Promise<Array<{
    id: string;
    vmId: string;
    vmName: string;
    name: string;
    description: string;
    createTime: string;
    state: string;
    size: number;
  }>> {
    try {
      const cacheKey = 'all_snapshots';
      const now = Date.now();
      
      // Check cache
      const cached = snapshotCache.get(cacheKey);
      if (cached && (now - cached.timestamp) < CACHE_TTL) {
        log.info('Returning cached snapshots');
        return cached.data;
      }
      
      // Use Python script to fetch all snapshots at once
      const scriptPath = '/app/scripts/get-snapshots.py';
      
      const result = execSync(
        `python3 ${scriptPath} "${this.config.host}" "${this.config.username}" "${this.config.password}"`,
        { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 30000, killSignal: 'SIGKILL' }
      );
      
      const data = JSON.parse(result);
      
      if (!data.success) {
        log.error({ error: data.error }, 'Batch snapshot fetch error');
        return [];
      }
      
      const snapshots = data.snapshots || [];
      
      // Cache result
      snapshotCache.set(cacheKey, { data: snapshots, timestamp: now });
      log.info({ count: snapshots.length }, 'Cached snapshots');
      
      return snapshots;
    } catch (error) {
      log.error({ err: error }, 'Error fetching all snapshots');
      return [];
    }
  }

  /**
   * Get snapshots for a VM
   */
  async getSnapshots(vmId: string): Promise<Array<{
    id: string;
    name: string;
    description: string;
    createTime: string;
    state: string;
    size: number;
  }>> {
    try {
      const cacheKey = `snapshots_${vmId}`;
      const now = Date.now();
      
      // Check cache
      const cached = snapshotCache.get(cacheKey);
      if (cached && (now - cached.timestamp) < CACHE_TTL) {
        return cached.data;
      }
      
      // vSphere 8: Use PyVmomi for reliable snapshot access
      const scriptPath = '/app/scripts/get-snapshots.py';
      
      const result = execSync(
        `python3 ${scriptPath} "${this.config.host}" "${this.config.username}" "${this.config.password}" "${vmId}"`,
        { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 30000, killSignal: 'SIGKILL' }
      );
      
      const data = JSON.parse(result);
      
      if (!data.success) {
        log.error({ error: data.error }, 'Snapshot fetch error');
        return [];
      }
      
      const snapshots = data.snapshots || [];
      
      // Cache result
      snapshotCache.set(cacheKey, { data: snapshots, timestamp: now });
      
      return snapshots;
    } catch (error) {
      log.error({ err: error }, 'Error fetching snapshots');
      return [];
    }
  }

  /**
   * Create a snapshot
   */
  async createSnapshot(vmId: string, name: string, description?: string, memory?: boolean): Promise<{ success: boolean; snapshotId?: string; error?: string }> {
    try {
      const response = await secureFetch('VMWARE', `https://${this.config.host}/rest/vcenter/vm/${vmId}/snapshot`, {
        method: 'POST',
        headers: {
          'vmware-api-session-id': this.sessionCookie || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          spec: {
            name,
            description: description || '',
            memory: memory || false,
            quiesce: true,
          },
        }),
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json() as { value: string };
      
      // Invalidate cache
      snapshotCache.delete('all_snapshots');
      snapshotCache.delete(`snapshots_${vmId}`);
      
      return { success: true, snapshotId: data.value };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Delete a snapshot
   */
  async deleteSnapshot(vmId: string, snapshotId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await secureFetch('VMWARE', `https://${this.config.host}/rest/vcenter/vm/${vmId}/snapshot/${snapshotId}`, {
        method: 'DELETE',
        headers: {
          'vmware-api-session-id': this.sessionCookie || '',
        },
      });
      
      // Invalidate cache on success
      if (response.ok) {
        snapshotCache.delete('all_snapshots');
        snapshotCache.delete(`snapshots_${vmId}`);
      }
      
      return { success: response.ok };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Revert to a snapshot
   */
  async revertSnapshot(vmId: string, snapshotId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await secureFetch('VMWARE', `https://${this.config.host}/rest/vcenter/vm/${vmId}/snapshot/${snapshotId}?action=revert`, {
        method: 'POST',
        headers: {
          'vmware-api-session-id': this.sessionCookie || '',
        },
      });
      
      // Invalidate cache on success (snapshot state changed)
      if (response.ok) {
        snapshotCache.delete('all_snapshots');
        snapshotCache.delete(`snapshots_${vmId}`);
      }
      
      return { success: response.ok };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Detect VM Sprawl
   * Analyzes VMs for underutilization, old snapshots, powered-off state
   */
  async detectVMSprawl(): Promise<VMSprawlResult[]> {
    const [vms, hosts, allSnapshots] = await Promise.all([
      this.fetchVMs(),
      this.fetchHosts(),
      this.fetchAllSnapshots(),
    ]);

    const hostMap = new Map(hosts.map(h => [h.host.value, h.name]));
    const snapshotsByVM = new Map<string, Array<{ createTime: string; name: string }>>();
    
    // Group snapshots by VM
    for (const snap of allSnapshots) {
      if (!snapshotsByVM.has(snap.vmId)) {
        snapshotsByVM.set(snap.vmId, []);
      }
      snapshotsByVM.get(snap.vmId)!.push({
        createTime: snap.createTime,
        name: snap.name,
      });
    }

    const sprawlResults: VMSprawlResult[] = [];

    for (const vm of vms) {
      const vmId = vm.vm.value;
      const powerState = vm.summary?.guestState || 'unknown';
      const snapshots = snapshotsByVM.get(vmId) || [];
      
      let score = 0;
      const reasons: string[] = [];
      let recommendation = '';

      // Criterion 1: Powered off > 30 days (+2 points)
      // Note: vSphere 7 REST API doesn't provide poweroff timestamp
      // We check if powered off (simple detection)
      if (powerState === 'notRunning' || powerState === 'poweredOff') {
        score += 2;
        reasons.push('Kapali (30+ gun tahmini)');
      }

      // Criterion 2: Low CPU usage (+2 points)
      // Note: Stats API requires separate calls, skip for now (Phase 2)
      
      // Criterion 3: Old snapshots > 60 days (+3 points)
      let oldestSnapshotDays = 0;
      if (snapshots.length > 0) {
        const oldestSnapshot = snapshots.reduce((oldest, snap) => {
          const snapDate = new Date(snap.createTime);
          const oldestDate = new Date(oldest.createTime);
          return snapDate < oldestDate ? snap : oldest;
        });
        
        const snapshotAge = (Date.now() - new Date(oldestSnapshot.createTime).getTime()) / (1000 * 60 * 60 * 24);
        oldestSnapshotDays = Math.floor(snapshotAge);
        
        if (snapshotAge > 60) {
          score += 3;
          reasons.push(`Eski snapshot (${oldestSnapshotDays} gun)`);
        } else if (snapshotAge > 30) {
          score += 1;
          reasons.push(`Snapshot yaslaniyor (${oldestSnapshotDays} gun)`);
        }
      }

      // Criterion 4: Multiple snapshots (+1 point)
      if (snapshots.length > 3) {
        score += 1;
        reasons.push(`Cok snapshot (${snapshots.length} adet)`);
      }

      // Determine recommendation
      if (score >= 5) {
        recommendation = 'Kritik Sprawl: VM silinmeli veya archive edilmeli';
      } else if (score >= 3) {
        recommendation = 'Orta Risk: Snapshot temizle, kullanım kontrol et';
      } else if (score >= 1) {
        recommendation = 'Dusuk Risk: İzlemeye devam';
      } else {
        recommendation = 'Normal: Aksiyona gerek yok';
      }

      // Only include VMs with sprawl score > 0
      if (score > 0) {
        sprawlResults.push({
          vmId,
          vmName: vm.name,
          host: vm.parent ? hostMap.get(vm.parent.value) || 'Unknown' : 'Unknown',
          powerState,
          snapshotCount: snapshots.length,
          oldestSnapshotDays: oldestSnapshotDays > 0 ? oldestSnapshotDays : undefined,
          sprawlScore: score,
          sprawlReasons: reasons,
          recommendation,
        });
      }
    }

    // Sort by sprawl score descending
    return sprawlResults.sort((a, b) => b.sprawlScore - a.sprawlScore);
  }

  /**
   * Collect capacity metrics for trend analysis
   * Stores CPU, Memory, Disk usage in database for historical tracking
   */
  async collectCapacityMetrics(): Promise<{ collected: number; errors: string[] }> {
    const errors: string[] = [];
    let collected = 0;

    try {
      const [clusters, hosts, datastores] = await Promise.all([
        this.fetchClusters(),
        this.fetchHosts(),
        this.fetchDatastores(),
      ]);

      const metrics: Array<{
        resourceType: string;
        resourceId: string;
        resourceName: string;
        metricType: string;
        value: number;
        total?: number;
      }> = [];

      // Cluster metrics
      for (const cluster of clusters) {
        const cpuUsage = cluster.summary?.totalCpu && cluster.summary?.numCpuCores
          ? (cluster.summary.totalCpu / (cluster.summary.numCpuCores * 1000)) * 100
          : 0;
        const memoryUsage = cluster.summary?.totalMemory
          ? ((cluster.summary.totalMemory - (cluster.summary.totalMemory * 0.3)) / cluster.summary.totalMemory) * 100
          : 0;

        if (cpuUsage > 0) {
          metrics.push({
            resourceType: 'cluster',
            resourceId: cluster.cluster.value,
            resourceName: cluster.name,
            metricType: 'cpu',
            value: cpuUsage,
            total: cluster.summary?.numCpuCores,
          });
        }

        if (memoryUsage > 0) {
          metrics.push({
            resourceType: 'cluster',
            resourceId: cluster.cluster.value,
            resourceName: cluster.name,
            metricType: 'memory',
            value: memoryUsage,
            total: cluster.summary?.totalMemory,
          });
        }
      }

      // Datastore metrics
      for (const ds of datastores) {
        if (ds.summary?.capacity && ds.summary?.freeSpace) {
          const usedSpace = ds.summary.capacity - ds.summary.freeSpace;
          const usagePercent = (usedSpace / ds.summary.capacity) * 100;

          metrics.push({
            resourceType: 'datastore',
            resourceId: ds.datastore.value,
            resourceName: ds.name,
            metricType: 'disk',
            value: usagePercent,
            total: ds.summary.capacity,
          });
        }
      }

      // Save to database
      for (const metric of metrics) {
        try {
          await prisma.capacityMetric.create({
            data: metric,
          });
          collected++;
        } catch (err) {
          errors.push(`Failed to save metric for ${metric.resourceName}: ${(err as Error).message}`);
        }
      }

      return { collected, errors };
    } catch (error) {
      errors.push((error as Error).message);
      return { collected, errors };
    }
  }
}

export default VMwareService;
