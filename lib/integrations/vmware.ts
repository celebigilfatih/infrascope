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

const prisma = new PrismaClient();

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
    const response = await fetch(`https://${this.config.host}/rest/${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'vmware-use-header-authn': this.sessionCookie || '',
        ...options?.headers,
      },
    });

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
      // Try REST API authentication first (vCenter 6.5+)
      const response = await fetch(`https://${this.config.host}/rest/com/vmware/cis/session`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}`,
        },
      });

      if (response.ok) {
        const data = await response.json() as { value: string };
        this.sessionCookie = data.value;
        return true;
      }

      // Fall back to SOAP API
      const soapResponse = await this.soapRequest<{ value: string }>('Login', {
        userName: this.config.username,
        password: this.config.password,
      });

      this.sessionCookie = soapResponse.value;
      return true;
    } catch (error) {
      console.error('VMware authentication failed:', error);
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
    const result = await this.restRequest<{ value: Array<{
      cluster: { value: string };
      name: string;
      resourcePool?: { value: string };
      host?: Array<{ value: string }>;
      summary?: {
        totalCpu?: number;
        totalMemory?: number;
        numCpuCores?: number;
        numHosts?: number;
      };
    }>}>('vcenter/cluster');

    return result.value.map(c => ({
      cluster: c.cluster,
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
   */
  async fetchHosts(): Promise<VMwareHost[]> {
    const result = await this.restRequest<{ value: Array<{
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
        product?: { version?: string; build?: string; name?: string };
      };
    }>}>('vcenter/host');

    return result.value.map(h => ({
      host: h.host,
      name: h.name,
      parent: h.parent,
      summary: h.summary,
      config: h.config,
    }));
  }

  /**
   * Fetch virtual machines
   */
  async fetchVMs(): Promise<VMwareVM[]> {
    const result = await this.restRequest<{ value: Array<{
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
    }>}>('vcenter/vm');

    return result.value.map(v => ({
      vm: v.vm,
      name: v.name,
      parent: v.parent,
      summary: v.summary,
    }));
  }

  /**
   * Fetch datastores
   */
  async fetchDatastores(): Promise<VMwareDatastore[]> {
    const result = await this.restRequest<{ value: Array<{
      datastore: { value: string };
      name: string;
      parent?: { value: string };
      info?: { url?: string; type?: string };
      summary?: { capacity?: number; freeSpace?: number; uncommitted?: number; accessible?: boolean };
    }>}>('vcenter/datastore');

    return result.value.map(d => ({
      datastore: d.datastore,
      name: d.name,
      parent: d.parent,
      info: d.info,
      summary: d.summary,
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
}

export default VMwareService;
