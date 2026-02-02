/**
 * Zabbix Integration Service
 * 
 * Handles communication with Zabbix API for:
 * - Host discovery and inventory
 * - Interface information
 * - Trigger monitoring
 * - Item data collection
 */

import { PrismaClient, DeviceType, DeviceStatus } from '@prisma/client';

const prisma = new PrismaClient();

// Zabbix API Types
export interface ZabbixConfig {
  url: string;
  authToken: string;
  pollingInterval: number; // minutes
  enabledModules: {
    hosts: boolean;
    interfaces: boolean;
    triggers: boolean;
    items: boolean;
  };
}

export interface ZabbixHost {
  hostid: string;
  host: string;
  name: string;
  status: string;
  proxy_hostid?: string;
  inventory_mode: number;
  inventory?: Record<string, string>;
}

export interface ZabbixInterface {
  interfaceid: string;
  hostid: string;
  dns: string;
  ip: string;
  port: string;
  type: number; // 1=agent, 2=snmp, 3=ipmi, 4=jmx
  main: number;
  useip: number;
  details?: Record<string, unknown>;
}

export interface ZabbixTrigger {
  triggerid: string;
  description: string;
  expression: string;
  status: string;
  value: number;
  priority: number;
  lastchange: number;
  comments?: string;
  hosts: Array<{ hostid: string; host: string }>;
}

export interface ZabbixItem {
  itemid: string;
  name: string;
  key_: string;
  hostid: string;
  status: string;
  value_type: number;
  units?: string;
}

export interface ZabbixHostGroup {
  groupid: string;
  name: string;
}

export interface SyncResult {
  success: boolean;
  hostsCreated: number;
  hostsUpdated: number;
  interfacesProcessed: number;
  triggersProcessed: number;
  errors: string[];
  duration: number;
}

// Zabbix API Client
export class ZabbixService {
  private config: ZabbixConfig;
  private authToken: string | null = null;

  constructor(config: ZabbixConfig) {
    this.config = config;
  }

  /**
   * Make a request to the Zabbix API
   */
  private async apiCall<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch(`${this.config.url}/api_jsonrpc.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.authToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id: Math.floor(Math.random() * 10000),
      }),
    });

    if (!response.ok) {
      throw new Error(`Zabbix API error: ${response.statusText}`);
    }

    const data = await response.json() as { result: T; error?: { message: string } };
    
    if (data.error) {
      throw new Error(`Zabbix API error: ${data.error.message}`);
    }

    return data.result;
  }

  /**
   * Authenticate with Zabbix API
   */
  async authenticate(): Promise<boolean> {
    try {
      this.authToken = await this.apiCall<string>('user.login', {
        username: this.config.url.split('/')[3]?.split(':')[0], // Extract from URL - not used with token auth
      }) as string;
      
      // For token-based auth, we use the config token directly
      if (this.config.authToken) {
        this.authToken = this.config.authToken;
        return true;
      }
      
      return !!this.authToken;
    } catch (error) {
      console.error('Zabbix authentication failed:', error);
      return false;
    }
  }

  /**
   * Fetch all hosts from Zabbix
   */
  async fetchHosts(): Promise<ZabbixHost[]> {
    return this.apiCall<ZabbixHost[]>('host.get', {
      output: ['hostid', 'host', 'name', 'status', 'inventory_mode'],
      selectInventory: true,
      selectHosts: true,
    });
  }

  /**
   * Fetch interfaces for specific hosts
   */
  async fetchInterfaces(hostIds: string[]): Promise<ZabbixInterface[]> {
    if (hostIds.length === 0) return [];
    
    return this.apiCall<ZabbixInterface[]>('hostinterface.get', {
      output: ['interfaceid', 'hostid', 'dns', 'ip', 'port', 'type', 'main', 'useip'],
      hostids: hostIds,
    });
  }

  /**
   * Fetch triggers with host information
   */
  async fetchTriggers(triggerIds?: string[]): Promise<ZabbixTrigger[]> {
    const params: Record<string, unknown> = {
      output: ['triggerid', 'description', 'expression', 'status', 'value', 'priority', 'lastchange', 'comments'],
      selectHosts: ['hostid', 'host'],
    };

    if (triggerIds && triggerIds.length > 0) {
      params.triggerids = triggerIds;
    } else {
      // Only get active triggers for efficiency
      params.filter = { status: '0' };
    }

    return this.apiCall<ZabbixTrigger[]>('trigger.get', params);
  }

  /**
   * Fetch host groups
   */
  async fetchHostGroups(): Promise<ZabbixHostGroup[]> {
    return this.apiCall<ZabbixHostGroup[]>('hostgroup.get', {
      output: ['groupid', 'name'],
    });
  }

  /**
   * Map Zabbix device type to our DeviceType enum
   */
  private mapDeviceType(host: ZabbixHost): DeviceType {
    const inventory = host.inventory || {};
    const type = inventory.type?.toLowerCase() || '';
    const name = host.name.toLowerCase();

    // Check for virtual machine indicators
    if (name.includes('vm') || name.includes('virtual') || type.includes('virtual')) {
      return DeviceType.VIRTUAL_MACHINE;
    }

    // Check for switch
    if (name.includes('switch') || type.includes('switch')) {
      return DeviceType.SWITCH;
    }

    // Check for firewall
    if (name.includes('firewall') || name.includes('forti') || type.includes('firewall')) {
      return DeviceType.FIREWALL;
    }

    // Check for router
    if (name.includes('router') || type.includes('router')) {
      return DeviceType.ROUTER;
    }

    // Default to physical server
    return DeviceType.PHYSICAL_SERVER;
  }

  /**
   * Map Zabbix status to our DeviceStatus enum
   */
  private mapStatus(status: string): DeviceStatus {
    return status === '0' ? DeviceStatus.ACTIVE : DeviceStatus.INACTIVE;
  }

  /**
   * Map Zabbix interface type to our type
   */
  private mapInterfaceType(type: number): string {
    switch (type) {
      case 1: return 'ETHERNET';
      case 2: return 'ETHERNET';  // SNMP interfaces are still ethernet physical
      case 3: return 'ETHERNET';
      case 4: return 'ETHERNET';
      default: return 'OTHER';
    }
  }

  /**
   * Sync Zabbix data to our database
   */
  async syncToInventory(_organizationId: string): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: false,
      hostsCreated: 0,
      hostsUpdated: 0,
      interfacesProcessed: 0,
      triggersProcessed: 0,
      errors: [],
      duration: 0,
    };

    try {
      // Authenticate
      const authenticated = await this.authenticate();
      if (!authenticated) {
        result.errors.push('Failed to authenticate with Zabbix');
        return result;
      }

      // Fetch hosts
      const hosts = await this.fetchHosts();
      
      // Fetch interfaces for all hosts
      const hostIds = hosts.map(h => h.hostid);
      const interfaces = await this.fetchInterfaces(hostIds);

      // Group interfaces by host
      const interfacesByHost = new Map<string, ZabbixInterface[]>();
      for (const iface of interfaces) {
        const existing = interfacesByHost.get(iface.hostid) || [];
        existing.push(iface);
        interfacesByHost.set(iface.hostid, existing);
      }

      // Process each host
      for (const host of hosts) {
        try {
          // Check if host already exists
          const existingDevice = await prisma.device.findFirst({
            where: { zabbixHostId: host.hostid },
          });

          const deviceData = {
            name: host.name || host.host,
            type: this.mapDeviceType(host),
            vendor: host.inventory?.vendor || null,
            model: host.inventory?.model || null,
            serialNumber: host.inventory?.serialnumber_a || null,
            operatingSystem: host.inventory?.os_short || host.inventory?.os || null,
            status: this.mapStatus(host.status),
            zabbixHostId: host.hostid,
            updatedAt: new Date(),
          };

          if (existingDevice) {
            // Update existing device
            await prisma.device.update({
              where: { id: existingDevice.id },
              data: deviceData,
            });
            result.hostsUpdated++;
          } else {
            // Create new device
            await prisma.device.create({
              data: {
                ...deviceData,
                // organizationId,
                createdAt: new Date(),
              },
            });
            result.hostsCreated++;
          }

          // Sync interfaces
          const hostInterfaces = interfacesByHost.get(host.hostid) || [];
          for (const iface of hostInterfaces) {
            const device = await prisma.device.findFirst({
              where: { zabbixHostId: host.hostid },
            });

            if (device) {
              const ifaceData = {
                name: `${iface.type}-${iface.port}`,
                type: this.mapInterfaceType(iface.type) as 'ETHERNET' | 'FIBER' | 'OTHER',
                ipv4: iface.ip || null,
                ipv6: iface.dns || null,
                macAddress: (iface.details?.mac as string) || null,
                deviceId: device.id,
                status: 'UP' as const,
                createdAt: new Date(),
                updatedAt: new Date(),
              };

              await prisma.networkInterface.upsert({
                where: {
                  deviceId_name: {
                    deviceId: device.id,
                    name: ifaceData.name,
                  },
                },
                create: ifaceData,
                update: { ...ifaceData, createdAt: undefined },
              });
              result.interfacesProcessed++;
            }
          }
        } catch (hostError) {
          result.errors.push(`Error processing host ${host.host}: ${(hostError as Error).message}`);
        }
      }

      // Sync triggers (if enabled)
      if (this.config.enabledModules.triggers) {
        try {
          const triggers = await this.fetchTriggers();
          
          for (const trigger of triggers) {
            for (const host of trigger.hosts) {
              const device = await prisma.device.findFirst({
                where: { zabbixHostId: host.hostid },
              });

              if (device) {
                await prisma.zabbixTrigger.upsert({
                  where: { id: trigger.triggerid },
                  create: {
                    id: trigger.triggerid,
                    triggerId: trigger.triggerid,
                    hostId: host.hostid,
                    description: trigger.description,
                    expression: trigger.expression,
                    priority: trigger.priority,
                    status: trigger.status,
                    value: trigger.value,
                    lastChange: trigger.lastchange ? new Date(trigger.lastchange * 1000) : null,
                    comments: trigger.comments,
                  },
                  update: {
                    priority: trigger.priority,
                    status: trigger.status,
                    value: trigger.value,
                    lastChange: trigger.lastchange ? new Date(trigger.lastchange * 1000) : null,
                  },
                });
                result.triggersProcessed++;
              }
            }
          }
        } catch (triggerError) {
          result.errors.push(`Error syncing triggers: ${(triggerError as Error).message}`);
        }
      }

      result.success = true;
    } catch (error) {
      result.errors.push(`Sync failed: ${(error as Error).message}`);
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

      // Get Zabbix version
      const version = await this.apiCall<string>('apiinfo.version');
      return { connected: true, version };
    } catch (error) {
      return { connected: false, error: (error as Error).message };
    }
  }
}

export default ZabbixService;
