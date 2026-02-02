/**
 * FortiGate Integration Service
 * 
 * Supports three integration modes:
 * - SNMP: Interfaces, VLANs, routing basics, HA status
 * - REST API: Firewall policies, NAT, VIPs, zones, SD-WAN, VPNs
 * - Logs: Traffic and security events (optional)
 */

import { PrismaClient, DeviceType, DeviceStatus, DeviceCriticality } from '@prisma/client';

const prisma = new PrismaClient();

// Configuration Types
export interface FortiGateConfig {
  host: string;
  accessToken: string; // REST API token
  snmp?: {
    community: string;
    version: '2c' | '3';
    credentials?: {
      user: string;
      authPassword?: string;
      privPassword?: string;
      authProtocol?: 'MD5' | 'SHA';
      privProtocol?: 'DES' | 'AES';
    };
  };
  pollingInterval: number; // minutes
  syncMode: 'snmp' | 'rest' | 'both';
  enabledModules: {
    interfaces: boolean;
    vlans: boolean;
    policies: boolean;
    addresses: boolean;
    vips: boolean;
    sdwan: boolean;
  };
}

export interface FortiGateInterface {
  name: string;
  status: 'up' | 'down';
  speed: number;
  duplex: 'full' | 'half' | 'auto';
  ip: string;
  mask: string;
  mtu: number;
  interface: string; // Parent interface for VLANs
  vlanid?: number;
  type: 'physical' | 'vlan' | 'tunnel';
}

export interface FortiGateVlan {
  id: number;
  name: string;
  interface: string;
  vlanid: number;
  ip: string;
  mask: string;
  vrf: number;
}

export interface FortiGatePolicy {
  policyid: number;
  name: string;
  action: 'accept' | 'deny';
  srcintf: Array<{ name: string }>;
  dstintf: Array<{ name: string }>;
  srcaddr: Array<{ name: string }>;
  dstaddr: Array<{ name: string }>;
  service: Array<{ name: string }>;
  schedule: string;
  hit_count: number;
  last_used: string;
  status: 'enable' | 'disable';
}

export interface FortiGateAddress {
  name: string;
  type: 'ipmask' | 'fqdn' | 'geography' | 'group';
  subnet: string; // "x.x.x.x y.y.y.y" or FQDN
  fqdn?: string;
  interface: string;
  country?: string;
}

export interface FortiGateVIP {
  name: string;
  extip: string;
  extport: string;
  mappedip: string;
  protocol: 'tcp' | 'udp' | 'http' | 'https';
  port: string;
}

export interface FortiGateSDWAN {
  name: string;
  member: Array<{
    interface: string;
    gateway: string;
    priority: number;
    cost: number;
  }>;
  status: 'enable' | 'disable';
}

export interface FortiGateHA {
  mode: 'a-a' | 'a-p';
  group_name: string;
  password: string;
  ha_status: 'work' | 'break';
  master: string;
  slave: Array<string>;
}

export interface SyncResult {
  success: boolean;
  deviceId?: string;
  interfacesProcessed: number;
  vlansProcessed: number;
  policiesProcessed: number;
  addressesProcessed: number;
  errors: string[];
  duration: number;
}

// SNMP Helper (using node-snmp library concepts)
class SNMPClient {
  private community: string;
  private host: string;

  constructor(host: string, community: string, _version: '2c' | '3' = '2c') {
    this.host = host;
    this.community = community;
  }

  async get(oid: string): Promise<{ value: string }> {
    // In production, use actual SNMP library
    // This is a placeholder for the interface
    const response = await fetch(`http://${this.host}:161/snmp?oid=${oid}`, {
      headers: { 'Authorization': `Community ${this.community}` },
    });
    return response.json();
  }

  async walk(_baseOid: string): Promise<Array<{ oid: string; value: string }>> {
    // SNMP walk implementation
    return [];
  }
}

// FortiGate REST API Client
export class FortiGateService {
  private config: FortiGateConfig;
  private baseUrl: string;
  private snmpClient?: SNMPClient;

  constructor(config: FortiGateConfig) {
    this.config = config;
    this.baseUrl = `https://${config.host}/api/v2`;

    if (config.snmp) {
      this.snmpClient = new SNMPClient(config.host, config.snmp.community, config.snmp.version);
    }
  }

  /**
   * Make a request to the FortiGate REST API
   */
  private async apiRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: Record<string, unknown>
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.accessToken}`,
        'Accept': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`FortiGate API error: ${response.statusText} - ${await response.text()}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Fetch interfaces (REST API or SNMP)
   */
  async fetchInterfaces(): Promise<FortiGateInterface[]> {
    if (this.config.syncMode === 'snmp' && this.snmpClient) {
      return this.fetchInterfacesSNMP();
    }
    return this.fetchInterfacesREST();
  }

  private async fetchInterfacesREST(): Promise<FortiGateInterface[]> {
    try {
      const data = await this.apiRequest<{ results: Array<{
        name: string;
        status: 'up' | 'down';
        speed: number;
        duplex: 'full' | 'half' | 'auto';
        ip: string;
        mask: string;
        mtu: number;
        interface: string;
        vlanid?: number;
        type: string;
      }>}>('/cmdb/system/interface');

      return data.results.map(iface => ({
        name: iface.name,
        status: iface.status,
        speed: iface.speed,
        duplex: iface.duplex,
        ip: iface.ip,
        mask: iface.mask,
        mtu: iface.mtu,
        interface: iface.interface,
        vlanid: iface.vlanid,
        type: iface.type as 'physical' | 'vlan' | 'tunnel',
      }));
    } catch (error) {
      console.error('Failed to fetch interfaces:', error);
      return [];
    }
  }

  private async fetchInterfacesSNMP(): Promise<FortiGateInterface[]> {
    // SNMP implementation would use OIDs like:
    // IF-MIB::ifDescr, IF-MIB::ifOperStatus, IF-MIB::ifSpeed
    // FORTINET-CORE-MIB::fortiGateMib
    return [];
  }

  /**
   * Fetch VLANs
   */
  async fetchVLans(): Promise<FortiGateVlan[]> {
    if (!this.config.enabledModules.vlans) return [];

    try {
      const data = await this.apiRequest<{ results: Array<{
        name: string;
        vdom: string;
        interface: string;
        vlanid: number;
        ip: string;
        mask: string;
        vrf: number;
      }>}>('/cmdb/system/vlan');

      return data.results.map(vlan => ({
        id: vlan.vlanid,
        name: vlan.name,
        interface: vlan.interface,
        vlanid: vlan.vlanid,
        ip: vlan.ip,
        mask: vlan.mask,
        vrf: vlan.vrf,
      }));
    } catch (error) {
      console.error('Failed to fetch VLANs:', error);
      return [];
    }
  }

  /**
   * Fetch firewall policies
   */
  async fetchFirewallPolicies(): Promise<FortiGatePolicy[]> {
    if (!this.config.enabledModules.policies) return [];

    try {
      const data = await this.apiRequest<{ results: Array<{
        policyid: number;
        name: string;
        action: 'accept' | 'deny';
        srcintf: Array<{ name: string }>;
        dstintf: Array<{ name: string }>;
        srcaddr: Array<{ name: string }>;
        dstaddr: Array<{ name: string }>;
        service: Array<{ name: string }>;
        schedule: string;
        hit_count: number;
        last_used: string;
        status: 'enable' | 'disable';
      }>}>('/cmdb/firewall/policy');

      return data.results.map(policy => ({
        policyid: policy.policyid,
        name: policy.name,
        action: policy.action,
        srcintf: policy.srcintf,
        dstintf: policy.dstintf,
        srcaddr: policy.srcaddr,
        dstaddr: policy.dstaddr,
        service: policy.service,
        schedule: policy.schedule,
        hit_count: policy.hit_count,
        last_used: policy.last_used,
        status: policy.status,
      }));
    } catch (error) {
      console.error('Failed to fetch firewall policies:', error);
      return [];
    }
  }

  /**
   * Fetch address objects
   */
  async fetchAddressObjects(): Promise<FortiGateAddress[]> {
    if (!this.config.enabledModules.addresses) return [];

    try {
      const data = await this.apiRequest<{ results: Array<{
        name: string;
        type: 'ipmask' | 'fqdn' | 'geography' | 'group';
        subnet: string;
        fqdn?: string;
        interface: string;
        country?: string;
      }>}>('/cmdb/firewall/address');

      return data.results.map(addr => ({
        name: addr.name,
        type: addr.type,
        subnet: addr.subnet,
        fqdn: addr.fqdn,
        interface: addr.interface,
        country: addr.country,
      }));
    } catch (error) {
      console.error('Failed to fetch addresses:', error);
      return [];
    }
  }

  /**
   * Fetch VIPs (Virtual IPs)
   */
  async fetchVIPs(): Promise<FortiGateVIP[]> {
    if (!this.config.enabledModules.vips) return [];

    try {
      const data = await this.apiRequest<{ results: Array<{
        name: string;
        extip: string;
        extport: string;
        mappedip: string;
        protocol: 'tcp' | 'udp' | 'http' | 'https';
        port: string;
      }>}>('/cmdb/firewall/vip');

      return data.results.map(vip => ({
        name: vip.name,
        extip: vip.extip,
        extport: vip.extport,
        mappedip: vip.mappedip,
        protocol: vip.protocol,
        port: vip.port,
      }));
    } catch (error) {
      console.error('Failed to fetch VIPs:', error);
      return [];
    }
  }

  /**
   * Fetch SD-WAN configuration
   */
  async fetchSDWAN(): Promise<FortiGateSDWAN | null> {
    if (!this.config.enabledModules.sdwan) return null;

    try {
      const data = await this.apiRequest<{ results: Array<{
        name: string;
        member: Array<{
          interface: string;
          gateway: string;
          priority: number;
          cost: number;
        }>;
        status: 'enable' | 'disable';
      }>}>('/cmdb/system/sdwan');

      if (data.results.length > 0) {
        const result = data.results[0];
        return {
          name: result.name,
          member: result.member,
          status: result.status,
        };
      }
      return null;
    } catch (error) {
      console.error('Failed to fetch SD-WAN:', error);
      return null;
    }
  }

  /**
   * Fetch HA status
   */
  async fetchHAStatus(): Promise<FortiGateHA | null> {
    try {
      const data = await this.apiRequest<{ results: Array<{
        mode: 'a-a' | 'a-p';
        group_name: string;
        password: string;
        ha_status: 'work' | 'break';
        master: string;
        slave: string[];
      }>}>('/cmdb/system/ha');

      if (data.results.length > 0) {
        const ha = data.results[0];
        return {
          mode: ha.mode,
          group_name: ha.group_name,
          password: ha.password,
          ha_status: ha.ha_status,
          master: ha.master,
          slave: ha.slave,
        };
      }
      return null;
    } catch (error) {
      console.error('Failed to fetch HA status:', error);
      return null;
    }
  }

  /**
   * Get or create the FortiGate device record
   */
  private async getOrCreateDevice(_organizationId: string): Promise<string> {
    const existing = await prisma.device.findFirst({
      where: { fortiDeviceId: this.config.host },
    });

    if (existing) {
      return existing.id;
    }

    const device = await prisma.device.create({
      data: {
        name: `FortiGate-${this.config.host}`,
        type: DeviceType.FIREWALL,
        vendor: 'Fortinet',
        model: 'FortiGate',
        status: DeviceStatus.ACTIVE,
        criticality: DeviceCriticality.CRITICAL,
        fortiDeviceId: this.config.host,
        // organizationId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return device.id;
  }

  /**
   * Sync FortiGate data to our database
   */
  async syncToInventory(organizationId: string): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: false,
      interfacesProcessed: 0,
      vlansProcessed: 0,
      policiesProcessed: 0,
      addressesProcessed: 0,
      errors: [],
      duration: 0,
    };

    try {
      // Get or create device
      const deviceId = await this.getOrCreateDevice(organizationId);
      result.deviceId = deviceId;

      // Fetch and sync interfaces
      if (this.config.enabledModules.interfaces) {
        const interfaces = await this.fetchInterfaces();
        
        for (const iface of interfaces) {
          try {
            await prisma.networkInterface.upsert({
              where: {
                deviceId_name: {
                  deviceId,
                  name: iface.name,
                },
              },
              create: {
                deviceId,
                name: iface.name,
                type: iface.type === 'vlan' ? 'FIBER' : 'ETHERNET',
                ipv4: iface.ip ? `${iface.ip}/${iface.mask}` : null,
                status: iface.status === 'up' ? 'UP' : 'DOWN',
                // speed: BigInt(iface.speed),
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              update: {
                status: iface.status === 'up' ? 'UP' : 'DOWN',
                ipv4: iface.ip ? `${iface.ip}/${iface.mask}` : undefined,
                // speed: BigInt(iface.speed),
                updatedAt: new Date(),
              },
            });
            result.interfacesProcessed++;
          } catch (ifaceError) {
            result.errors.push(`Error syncing interface ${iface.name}: ${(ifaceError as Error).message}`);
          }
        }
      }

      // Fetch and sync VLANs
      if (this.config.enabledModules.vlans) {
        const vlans = await this.fetchVLans();
        
        for (const vlan of vlans) {
          try {
            await prisma.vlan.upsert({
              where: {
                id: vlan.id.toString(),
              },
              create: {
                id: vlan.id.toString(),
                organizationId,
                vlanId: vlan.vlanid,
                name: vlan.name,
                vrf: vlan.vrf.toString(),
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              update: {
                name: vlan.name,
                vrf: vlan.vrf.toString(),
                updatedAt: new Date(),
              },
            });
            result.vlansProcessed++;
          } catch (vlanError) {
            result.errors.push(`Error syncing VLAN ${vlan.name}: ${(vlanError as Error).message}`);
          }
        }
      }

      // Fetch and sync firewall policies
      if (this.config.enabledModules.policies) {
        const policies = await this.fetchFirewallPolicies();
        
        for (const policy of policies) {
          try {
            await prisma.firewallPolicy.upsert({
              where: {
                deviceId_policyId: {
                  deviceId,
                  policyId: policy.policyid,
                },
              },
              create: {
                deviceId,
                policyId: policy.policyid,
                name: policy.name,
                action: policy.action,
                srcInterface: policy.srcintf.map(i => i.name).join(','),
                dstInterface: policy.dstintf.map(i => i.name).join(','),
                srcAddresses: policy.srcaddr.map(a => a.name),
                dstAddresses: policy.dstaddr.map(a => a.name),
                services: policy.service.map(s => s.name),
                schedule: policy.schedule,
                hitCount: BigInt(policy.hit_count),
                lastHit: policy.last_used ? new Date(policy.last_used) : null,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              update: {
                name: policy.name,
                action: policy.action,
                hitCount: BigInt(policy.hit_count),
                lastHit: policy.last_used ? new Date(policy.last_used) : undefined,
                updatedAt: new Date(),
              },
            });
            result.policiesProcessed++;
          } catch (policyError) {
            result.errors.push(`Error syncing policy ${policy.name}: ${(policyError as Error).message}`);
          }
        }
      }

      // Fetch and sync address objects
      if (this.config.enabledModules.addresses) {
        const addresses = await this.fetchAddressObjects();
        
        for (const addr of addresses) {
          try {
            await prisma.firewallAddress.upsert({
              where: {
                id: `${deviceId}-${addr.name}`,
              },
              create: {
                id: `${deviceId}-${addr.name}`,
                deviceId,
                name: addr.name,
                type: addr.type,
                value: addr.subnet || addr.fqdn || addr.country || '',
                associatedInterface: addr.interface,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              update: {
                type: addr.type,
                value: addr.subnet || addr.fqdn || addr.country || '',
                associatedInterface: addr.interface,
                updatedAt: new Date(),
              },
            });
            result.addressesProcessed++;
          } catch (addrError) {
            result.errors.push(`Error syncing address ${addr.name}: ${(addrError as Error).message}`);
          }
        }
      }

      result.success = true;
    } catch (error) {
      result.errors.push(`FortiGate sync failed: ${(error as Error).message}`);
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Get connection status
   */
  async getStatus(): Promise<{ connected: boolean; version?: string; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/monitor/system/status`, {
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
        },
      });

      if (!response.ok) {
        return { connected: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json() as { version: string; name: string };
      return { connected: true, version: data.version };
    } catch (error) {
      return { connected: false, error: (error as Error).message };
    }
  }
}

export default FortiGateService;
