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
   * Make a SOAP request to the VMware API
   */
  private async soapRequest<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}/vimService.wsdl`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Cookie': this.sessionCookie || '',
        'SOAPAction': method,
      },
      body: this.createSoapEnvelope(method, params),
    });

    if (!response.ok) {
      throw new Error(`VMware API error: ${response.statusText}`);
    }

    // Parse XML response
    const xmlText = await response.text();
    return this.parseSoapResponse<T>(xmlText);
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
   */
  private async restRequest<T>(endpoint: string, options?: RequestInit): Promise<T> {
    // Disable SSL verification for self-signed certificates
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    // Try vSphere 7+ API first (/api/)
    let response = await fetch(`https://${this.config.host}/api/${endpoint}`, {
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

    // If 404, try legacy /rest/ endpoint
    if (response.status === 404) {
      console.log(`[VMware] Trying legacy endpoint for ${endpoint}`);
      response = await fetch(`https://${this.config.host}/rest/${endpoint}`, {
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
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

      // Try vSphere 7+ REST API authentication first (/api/session)
      console.log(`[VMware] Authenticating to ${this.config.host} as ${this.config.username}`);
      
      let response = await fetch(`https://${this.config.host}/api/session`, {
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
        console.log('[VMware] Authentication successful (vSphere 7+ API)');
        return true;
      }

      console.log(`[VMware] vSphere 7 API failed (${response.status}), trying legacy endpoint...`);

      // Try legacy REST API authentication (vCenter 6.5-6.7)
      response = await fetch(`https://${this.config.host}/rest/com/vmware/cis/session`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}`,
        },
      });

      if (response.ok) {
        const data = await response.json() as { value: string };
        this.sessionCookie = data.value;
        console.log('[VMware] Authentication successful (legacy API)');
        return true;
      }

      console.error(`[VMware] Authentication failed: ${response.status} ${response.statusText}`);
      const errorBody = await response.text();
      console.error(`[VMware] Error body: ${errorBody}`);
      return false;
    } catch (error) {
      console.error('[VMware] Authentication error:', error);
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

    return hostList.map((h: any) => ({
      host: { value: h.host || h.host?.value },
      name: h.name,
      parent: h.parent,
      summary: {
        connectionState: (h.connection_state || 'connected').toLowerCase(),
        overallStatus: h.power_state === 'POWERED_ON' ? 'green' : 'yellow',
        numCpuCores: 0,  // Not available in vSphere 7 REST API
        memoryTotal: 0,  // Not available in vSphere 7 REST API
      },
      config: {},  // Not available in vSphere 7 REST API
    }));
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

    // vSphere 7 REST API does not provide host assignment via basic endpoint
    // To get host info would require SOAP API (future enhancement)
    return vms.map((v: any) => ({
      vm: { value: v.vm || v.vm?.value },
      name: v.name,
      parent: v.parent,  // Not available in vSphere 7 REST API
      summary: {
        numCpu: v.cpu_count || v.summary?.numCpu,
        memorySizeMB: v.memory_size_MiB || v.summary?.memorySizeMB,
        guestState: v.power_state === 'POWERED_ON' ? 'running' : 'notRunning',
        connectionState: v.power_state === 'POWERED_ON' ? 'connected' : 'disconnected',
        overallStatus: v.power_state === 'POWERED_ON' ? 'green' : 'gray',
        guestFullName: v.guest_OS || v.summary?.guestFullName,
        ipAddress: v.summary?.ipAddress,
      },
    }));
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
              organizationId,
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
      const response = await fetch(`https://${this.config.host}/rest/appliance/version`, {
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
      const response = await fetch(`https://${this.config.host}/rest/vcenter/vm/${vmId}/power/start`, {
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
      const response = await fetch(`https://${this.config.host}/rest/vcenter/vm/${vmId}/guest/power?action=shutdown`, {
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
      const response = await fetch(`https://${this.config.host}/rest/vcenter/vm/${vmId}/power/stop`, {
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
      const response = await fetch(`https://${this.config.host}/rest/vcenter/vm/${vmId}/power/suspend`, {
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
      const response = await fetch(`https://${this.config.host}/rest/vcenter/vm/${vmId}/power/reset`, {
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
        console.log('[VMware] Returning cached snapshots');
        return cached.data;
      }
      
      // Use Python script to fetch all snapshots at once
      const scriptPath = '/app/scripts/get-snapshots.py';
      
      const result = execSync(
        `python3 ${scriptPath} "${this.config.host}" "${this.config.username}" "${this.config.password}"`,
        { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 30000 }
      );
      
      const data = JSON.parse(result);
      
      if (!data.success) {
        console.error(`[VMware] Batch snapshot fetch error: ${data.error}`);
        return [];
      }
      
      const snapshots = data.snapshots || [];
      
      // Cache result
      snapshotCache.set(cacheKey, { data: snapshots, timestamp: now });
      console.log(`[VMware] Cached ${snapshots.length} snapshots`);
      
      return snapshots;
    } catch (error) {
      console.error('[VMware] Error fetching all snapshots:', error);
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
        { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
      );
      
      const data = JSON.parse(result);
      
      if (!data.success) {
        console.error(`[VMware] Snapshot fetch error: ${data.error}`);
        return [];
      }
      
      const snapshots = data.snapshots || [];
      
      // Cache result
      snapshotCache.set(cacheKey, { data: snapshots, timestamp: now });
      
      return snapshots;
    } catch (error) {
      console.error('[VMware] Error fetching snapshots:', error);
      return [];
    }
  }

  /**
   * Create a snapshot
   */
  async createSnapshot(vmId: string, name: string, description?: string, memory?: boolean): Promise<{ success: boolean; snapshotId?: string; error?: string }> {
    try {
      const response = await fetch(`https://${this.config.host}/rest/vcenter/vm/${vmId}/snapshot`, {
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
      const response = await fetch(`https://${this.config.host}/rest/vcenter/vm/${vmId}/snapshot/${snapshotId}`, {
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
      const response = await fetch(`https://${this.config.host}/rest/vcenter/vm/${vmId}/snapshot/${snapshotId}?action=revert`, {
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
