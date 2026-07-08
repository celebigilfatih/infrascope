/**
 * FortiGate Integration Service
 * 
 * Supports three integration modes:
 * - SNMP: Interfaces, VLANs, routing basics, HA status
 * - REST API: Firewall policies, NAT, VIPs, zones, SD-WAN, VPNs
 * - Logs: Traffic and security events (optional)
 */

import { PrismaClient, DeviceType, DeviceStatus, DeviceCriticality } from '@prisma/client';
import * as https from 'https';
import * as querystring from 'querystring';
import { createLogger } from '@/lib/logger';
import { getHttpsRequestTlsOptions, secureFetch } from '@/lib/security/tls';

const log = createLogger('fortigate');
const prisma = new PrismaClient();

// Configuration Types
export interface FortiGateConfig {
  host: string;
  username?: string;   // Admin username for cookie-based auth
  password?: string;   // Admin password for cookie-based auth
  accessToken: string; // REST API token (fallback if no username/password)
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
  id: number;
  comment: string;
  type: string;
  extip: string;
  extintf: string;
  mappedip: Array<{ range: string }>;
  extport: string;
  mappedport: string;
  protocol: string;
  portforward: string;
  status: string;
  color: number;
  'src-filter': Array<{ range: string }>;
  'ssl-mode': string;
  'ssl-certificate': string;
  'arp-reply': string;
  'nat-source-vip': string;
  'portmapping-type': string;
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

  // Cookie-based session state
  private sessionCookie: string | null = null;
  private csrfToken: string | null = null;
  private csrfCookie: string | null = null;
  private sessionExpiry: number = 0;

  constructor(config: FortiGateConfig) {
    this.config = config;
    this.baseUrl = `https://${config.host}/api/v2`;

    if (config.snmp) {
      this.snmpClient = new SNMPClient(config.host, config.snmp.community, config.snmp.version);
    }
  }

  /**
   * Logout from FortiGate and invalidate the current session on the server side.
   * Called automatically before re-authentication to prevent session pile-up.
   */
  private async logout(): Promise<void> {
    if (!this.sessionCookie) return;
    const cookieHeader = this.csrfCookie
      ? `${this.sessionCookie}; ${this.csrfCookie}`
      : this.sessionCookie;

    return new Promise<void>((resolve) => {
      const options: https.RequestOptions = {
        hostname: this.config.host,
        port: 443,
        path: '/logout',
        method: 'GET',
        headers: { 'Cookie': cookieHeader },
        ...getHttpsRequestTlsOptions('FORTIGATE'),
      };
      const req = https.request(options, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => resolve()); // best-effort, ignore failures
      req.end();
    }).finally(() => {
      // Always clear local state regardless of logout success
      this.sessionCookie = null;
      this.csrfToken = null;
      this.csrfCookie = null;
      this.sessionExpiry = 0;
      log.info('Session logged out and cleared');
    });
  }

  /**
   * Login to FortiGate with username/password and obtain a session cookie.
   */
  private async login(): Promise<void> {
    // Always logout existing session first to avoid session pile-up on FortiGate
    if (this.sessionCookie) {
      await this.logout();
    }
    // Use Node.js https module directly to bypass Next.js fetch patching which
    // strips HttpOnly cookies (APSCOOKIE) from Set-Cookie response headers.
    return new Promise((resolve, reject) => {
      const postData = querystring.stringify({
        username: this.config.username!,
        secretkey: this.config.password!,
      });

      const options: https.RequestOptions = {
        hostname: this.config.host,
        port: 443,
        path: '/logincheck',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
        },
        ...getHttpsRequestTlsOptions('FORTIGATE'),
      };

      const req = https.request(options, (res) => {
        res.resume(); // consume body

        // Node.js http.IncomingMessage always exposes set-cookie as string[]
        const rawCookies: string[] = (res.headers['set-cookie'] as string[]) || [];
        const cookiePairs = rawCookies.map((c) => c.split(';')[0].trim()).filter(Boolean);

        const apsRaw = cookiePairs.find((c) => /^APSCOOKIE_/i.test(c));
        if (!apsRaw) {
          reject(new Error('FortiGate login failed: no APSCOOKIE received (check credentials)'));
          return;
        }
        this.sessionCookie = apsRaw;

        // CSRF token lives in a separate ccsrftoken_* cookie (not inside APSCOOKIE).
        const csrfRaw = cookiePairs.find((c) => /^ccsrftoken_/i.test(c));
        if (csrfRaw) {
          this.csrfToken = csrfRaw.split('=').slice(1).join('=').replace(/^"|"$/g, '');
          this.csrfCookie = csrfRaw;
        } else {
          this.csrfToken = null;
          this.csrfCookie = null;
        }

        this.sessionExpiry = Date.now() + 25 * 60 * 1000;
        resolve();
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  /**
   * Return the correct authentication headers depending on config.
   * Uses cookie auth when username/password are set, Bearer token otherwise.
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    if (this.config.username && this.config.password) {
      if (!this.sessionCookie || Date.now() > this.sessionExpiry) {
        await this.login();
      }
      // Send both APSCOOKIE and ccsrftoken cookies; FortiGate requires both.
      const cookieHeader = this.csrfCookie
        ? `${this.sessionCookie!}; ${this.csrfCookie}`
        : this.sessionCookie!;
      return {
        'Cookie': cookieHeader,
        ...(this.csrfToken ? { 'X-CSRFTOKEN': this.csrfToken } : {}),
      };
    }
    return { 'Authorization': `Bearer ${this.config.accessToken}` };
  }

  /**
   * Make a request to the FortiGate REST API
   */
  private async apiRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: Record<string, unknown>
  ): Promise<T> {
    const authHeaders = await this.getAuthHeaders();
    const response = await secureFetch('FORTIGATE', `${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...authHeaders,
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
      const data = await this.apiRequest<{
        http_method: string;
        size: number;
        results: Array<{
          name: string;
          status?: 'up' | 'down';
          speed?: number;
          duplex?: 'full' | 'half' | 'auto';
          ip?: string;
          mask?: string;
          mtu?: number;
          interface?: string;
          vlanid?: number;
          type?: string;
          'cli-conn-status'?: number;
        }>;
      }>('/cmdb/system/interface');

      return data.results.map(iface => ({
        name: iface.name,
        status: iface.status || (iface['cli-conn-status'] === 1 ? 'up' : 'down'),
        speed: iface.speed || 0,
        duplex: iface.duplex || 'auto',
        ip: iface.ip || '',
        mask: iface.mask || '',
        mtu: iface.mtu || 1500,
        interface: iface.interface || '',
        vlanid: iface.vlanid,
        type: (iface.type || 'physical') as 'physical' | 'vlan' | 'tunnel',
      }));
    } catch (error) {
      log.error({ err: error }, 'Failed to fetch interfaces');
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
      log.error({ err: error }, 'Failed to fetch VLANs');
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
      log.error({ err: error }, 'Failed to fetch firewall policies');
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
      log.error({ err: error }, 'Failed to fetch addresses');
      return [];
    }
  }

  /**
   * Fetch VIPs (Virtual IPs)
   */
  async fetchVIPs(): Promise<FortiGateVIP[]> {
    if (!this.config.enabledModules.vips) return [];

    try {
      const data = await this.apiRequest<{ results: FortiGateVIP[] }>('/cmdb/firewall/vip');
      return data.results || [];
    } catch (error) {
      log.error({ err: error }, 'Failed to fetch VIPs');
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
      log.error({ err: error }, 'Failed to fetch SD-WAN');
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
      log.error({ err: error }, 'Failed to fetch HA status');
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
                hitCount: policy.hit_count ? BigInt(policy.hit_count) : BigInt(0),
                lastHit: policy.last_used ? new Date(policy.last_used) : null,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              update: {
                name: policy.name,
                action: policy.action,
                hitCount: policy.hit_count ? BigInt(policy.hit_count) : BigInt(0),
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
   * Get connection status with detailed system info
   */
  async getStatus(): Promise<{
    connected: boolean;
    version?: string;
    hostname?: string;
    model?: string;
    serial?: string;
    cpu?: number;
    memory?: number;
    session?: { current: number; percent: number };
    ha?: { enabled: boolean; role: string; serial: string };
    sdwan?: { interfaces: Array<{ name: string; link: string; session: number; tx_bandwidth: number; rx_bandwidth: number }> };
    license?: { status: string; support: string; expires: string };
    error?: string;
  }> {
    try {
      const authHeaders = await this.getAuthHeaders();
      // Get system status
      const statusRes = await secureFetch('FORTIGATE', `${this.baseUrl}/monitor/system/status`, {
        headers: authHeaders,
      });
      if (!statusRes.ok) {
        return { connected: false, error: `HTTP ${statusRes.status}` };
      }
      const statusData = await statusRes.json() as { version: string; hostname: string; model: string; serial: string };

      // Get resource usage
      const resourceRes = await secureFetch('FORTIGATE', `${this.baseUrl}/monitor/system/vdom-resource`, {
        headers: authHeaders,
      });
      const resourceData = resourceRes.ok ? await resourceRes.json() as {
        results: { cpu: number; memory: number; session: { current_usage: number; usage_percent: number } };
      } : null;

      // Get HA status
      const haRes = await secureFetch('FORTIGATE', `${this.baseUrl}/monitor/system/ha-checksums`, {
        headers: authHeaders,
      });
      const haData = haRes.ok ? await haRes.json() as {
        results: Array<{ is_root_primary: boolean; serial_no: string }>;
      } : null;

      // Get SD-WAN status
      const sdwanRes = await secureFetch('FORTIGATE', `${this.baseUrl}/monitor/virtual-wan/members`, {
        headers: authHeaders,
      });
      const sdwanData = sdwanRes.ok ? await sdwanRes.json() as {
        results: Record<string, { link: string; session: number; tx_bandwidth: number; rx_bandwidth: number }>;
      } : null;

      // Get license status
      const licenseRes = await secureFetch('FORTIGATE', `${this.baseUrl}/monitor/license/status`, {
        headers: authHeaders,
      });
      const licenseData = licenseRes.ok ? await licenseRes.json() as {
        results: { forticare: { registration_status: string; support: { enhanced: { support_level: string; expires: number } } } };
      } : null;

      // Parse SD-WAN interfaces
      const sdwanInterfaces = sdwanData?.results ? Object.entries(sdwanData.results).map(([name, data]) => ({
        name,
        link: data.link,
        session: data.session,
        tx_bandwidth: data.tx_bandwidth,
        rx_bandwidth: data.rx_bandwidth,
      })) : [];

      // Parse HA info
      const haMaster = haData?.results?.find(h => h.is_root_primary);
      const haSlave = haData?.results?.find(h => !h.is_root_primary);

      return {
        connected: true,
        version: statusData.version,
        hostname: statusData.hostname,
        model: statusData.model,
        serial: statusData.serial,
        cpu: resourceData?.results?.cpu,
        memory: resourceData?.results?.memory,
        session: resourceData?.results?.session ? {
          current: resourceData.results.session.current_usage,
          percent: resourceData.results.session.usage_percent,
        } : undefined,
        ha: haData?.results ? {
          enabled: haData.results.length > 1,
          role: haMaster ? 'Master' : 'Slave',
          serial: haSlave?.serial_no || '',
        } : undefined,
        sdwan: sdwanInterfaces.length > 0 ? { interfaces: sdwanInterfaces } : undefined,
        license: licenseData?.results?.forticare ? {
          status: licenseData.results.forticare.registration_status,
          support: licenseData.results.forticare.support?.enhanced?.support_level || 'Unknown',
          expires: licenseData.results.forticare.support?.enhanced?.expires ? 
            new Date(licenseData.results.forticare.support.enhanced.expires * 1000).toISOString().split('T')[0] : '',
        } : undefined,
      };
    } catch (error) {
      return { connected: false, error: (error as Error).message };
    }
  }

  /**
   * Get SSL-VPN connected users
   */
  async getSSLVPNUsers(): Promise<Array<{
    user_name: string;
    remote_host: string;
    last_login_timestamp: number;
    two_factor_auth: boolean;
    interface: string;
    duration: number;
    aip: string;
    in_bytes: number;
    out_bytes: number;
  }>> {
    try {
      const response = await secureFetch('FORTIGATE', `${this.baseUrl}/monitor/vpn/ssl`, {
        headers: await this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as {
        results: Array<{
          user_name: string;
          remote_host: string;
          last_login_timestamp: number;
          two_factor_auth: boolean;
          interface: string;
          duration: number;
          subsessions: Array<{
            aip: string;
            in_bytes: number;
            out_bytes: number;
          }>;
        }>;
      };

      return data.results.map(user => ({
        user_name: user.user_name,
        remote_host: user.remote_host,
        last_login_timestamp: user.last_login_timestamp,
        two_factor_auth: user.two_factor_auth,
        interface: user.interface,
        duration: user.duration,
        aip: user.subsessions?.[0]?.aip || '',
        in_bytes: user.subsessions?.[0]?.in_bytes || 0,
        out_bytes: user.subsessions?.[0]?.out_bytes || 0,
      }));
    } catch (error) {
      log.error({ err: error }, 'Failed to get SSL-VPN users');
      return [];
    }
  }

  // ── Per-cycle cache, request dedup & sequential queue to avoid 429 ──────────
  private _eventLogCache = new Map<string, { ts: number; data: Array<Record<string, any>> }>();
  private _eventLogCacheTTL = 5 * 60 * 1000; // 5 min TTL
  private _inflight = new Map<string, Promise<Array<Record<string, any>>>>();
  private _requestQueue: Promise<void> = Promise.resolve();
  private _requestDelay = 1000; // ms between requests

  /** Clear the per-cycle event log cache (call at the start of each alarm check cycle). */
  clearEventLogCache(): void {
    this._eventLogCache.clear();
    this._inflight.clear();
  }

  // ── CMDB Diff Snapshot Storage ───────────────────────────────────────────────
  // Maps endpoint path → JSON fingerprint of last known state.
  // On first call (no stored snapshot) → isFirstRun=true, alarm does NOT fire.
  // On subsequent calls → changed=true when fingerprint differs.
  private _cmdbSnapshotStore = new Map<string, string>(); // endpoint → fingerprint
  private _previousCmdbData = new Map<string, any>(); // endpoint → previous actual data (before this cycle's update)
  private _cmdbResponseCache = new Map<string, { ts: number; data: any }>(); // short-lived
  private readonly _cmdbResponseCacheTTL = 90_000; // 90s — covers one full alarm cycle

  /**
   * Poll a FortiGate CMDB endpoint and return whether the config changed since last call.
   *
   * Design:
   *  - First call per endpoint → initializes snapshot, returns { isFirstRun: true, changed: false }
   *  - Subsequent calls       → returns { isFirstRun: false, changed: <true if fingerprint differs> }
   *  - Per-cycle response cache (90s TTL) prevents duplicate HTTP calls when multiple alarm
   *    functions share the same endpoint (e.g. NEW_ADMIN_USER and ADMIN_PASSWORD_CHANGED both
   *    poll /cmdb/system/admin).
   *
   * @param endpoint   Path after /api/v2, e.g. '/cmdb/firewall/policy'
   */
  async getCmdbChanges(endpoint: string): Promise<{
    changed: boolean;
    isFirstRun: boolean;
    current: any[] | Record<string, any> | null;
  }> {
    // 1. Return cached response if available (avoids duplicate calls in same cycle)
    const cached = this._cmdbResponseCache.get(endpoint);
    if (cached && Date.now() - cached.ts < this._cmdbResponseCacheTTL) {
      // Use frozen snapshot from cycle start, not the live one (which may have been updated by another alarm)
      const stored = this._frozenSnapshots.get(endpoint) ?? this._cmdbSnapshotStore.get(endpoint);
      const fingerprint = JSON.stringify(cached.data);
      const isFirstRun = stored === undefined;
      const changed = !isFirstRun && stored !== fingerprint;
      return { changed, isFirstRun, current: cached.data };
    }

    try {
      const authH = await this.getAuthHeaders();
      const url = `${this.baseUrl}${endpoint}`;
      const res = await secureFetch('FORTIGATE', url, { headers: authH });

      if (!res.ok) {
        log.warn({ endpoint, status: res.status }, 'getCmdbChanges HTTP error');
        return { changed: false, isFirstRun: false, current: null };
      }

      const data = await res.json() as { results?: any; [k: string]: any };
      const current: any = data.results ?? data;

      // Preserve previous data BEFORE updating cache — needed for computeArrayDiff
      const prevCached = this._cmdbResponseCache.get(endpoint);
      if (prevCached && prevCached.data) {
        this._previousCmdbData.set(endpoint, prevCached.data);
      }

      // Cache the response
      this._cmdbResponseCache.set(endpoint, { ts: Date.now(), data: current });

      // Compute fingerprint and compare with FROZEN snapshot (from cycle start)
      const fingerprint = JSON.stringify(current);
      const stored = this._frozenSnapshots.get(endpoint) ?? this._cmdbSnapshotStore.get(endpoint);
      const isFirstRun = stored === undefined;
      const changed = !isFirstRun && stored !== fingerprint;

      // Update the live snapshot (for next cycle) and frozen snapshot (so this cycle's baseline is preserved)
      this._cmdbSnapshotStore.set(endpoint, fingerprint);
      if (changed) {
        log.info({ endpoint }, 'CMDB change detected');
      }

      return { changed, isFirstRun, current };
    } catch (error) {
      log.error({ err: error, endpoint }, 'getCmdbChanges error');
      return { changed: false, isFirstRun: false, current: null };
    }
  }

  /** @internal Frozen snapshots from the current cycle (set when response cache is cleared) */
  private _frozenSnapshots = new Map<string, string>();

  /**
   * Clear CMDB response cache — call at the start of each alarm check cycle
   * to ensure fresh data is fetched from FortiGate, not stale cached data.
   */
  clearCmdbResponseCache(): void {
    // Preserve current cached data as "previous" before clearing
    // This is needed for computeArrayDiff when a change is detected this cycle
    for (const [endpoint, cached] of this._cmdbResponseCache) {
      if (cached?.data) {
        this._previousCmdbData.set(endpoint, cached.data);
      }
    }
    this._cmdbResponseCache.clear();
    // Freeze current snapshots so all alarms in this cycle compare against the same baseline
    this._frozenSnapshots = new Map(this._cmdbSnapshotStore);
    log.info('CMDB response cache cleared for fresh cycle');
  }

  /**
   * Get CMDB snapshot — returns PREVIOUS data if a change was detected this cycle,
   * otherwise returns current cached data. Used by computeArrayDiff to compare
   * old vs new state.
   */
  getCmdbSnapshot(endpoint: string): { timestamp: number; data: any } | null {
    // If we have previous data (change was detected this cycle), return it
    const prevData = this._previousCmdbData.get(endpoint);
    if (prevData !== undefined) {
      return { timestamp: Date.now(), data: prevData };
    }

    // Otherwise return current cached data
    const cached = this._cmdbResponseCache.get(endpoint);
    if (cached?.data) {
      return {
        timestamp: cached.ts,
        data: cached.data,
      };
    }

    // Fallback: parse the fingerprint to recover the data
    const fingerprint = this._cmdbSnapshotStore.get(endpoint);
    if (!fingerprint) return null;
    try {
      const data = JSON.parse(fingerprint);
      return {
        timestamp: Date.now(),
        data,
      };
    } catch {
      return null;
    }
  }

  /**
   * Generic event log query from FortiGate REST API.
   *
   * Features:
   * - Per-cycle cache: identical filter+rows combos return cached results
   * - Request deduplication: concurrent calls for the same filter share one API call
   * - Sequential queue with delay: prevents HTTP 429 rate limiting
   *
   * @param filter  FortiGate filter expression, e.g.
   *   "subtype==system&&action==login&&status==failed"
   * @param rows    Max rows to return (default 1000)
   */
  async getEventLogs(filter: string, rows = 1000): Promise<Array<Record<string, any>>> {
    const cacheKey = `${filter}|${rows}`;

    // 1. Return from cache if available
    const cached = this._eventLogCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < this._eventLogCacheTTL) {
      return cached.data;
    }

    // 2. Return in-flight promise if another caller already queued the same request
    const inflight = this._inflight.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    // 3. Queue a new request
    const promise = new Promise<Array<Record<string, any>>>((resolve) => {
      this._requestQueue = this._requestQueue.then(async () => {
        // Double-check cache (might have been populated by a previous queued request)
        const cached2 = this._eventLogCache.get(cacheKey);
        if (cached2 && Date.now() - cached2.ts < this._eventLogCacheTTL) {
          resolve(cached2.data);
          return;
        }

        try {
          const params = new URLSearchParams({ rows: String(rows) });
          if (filter) params.set('filter', filter);

          const url = `${this.baseUrl}/monitor/log/event?${params}`;
          const authH = await this.getAuthHeaders();
          const response = await secureFetch('FORTIGATE', url, {
            headers: authH,
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const data = await response.json() as { results?: Array<Record<string, any>> };
          const logs = data.results || [];
          this._eventLogCache.set(cacheKey, { ts: Date.now(), data: logs });
          resolve(logs);
        } catch (error) {
          log.error({ err: error, filter }, 'getEventLogs failed');
          // Cache empty result briefly to avoid hammering a failing endpoint
          this._eventLogCache.set(cacheKey, { ts: Date.now(), data: [] });
          resolve([]);
        }
        // Delay before next request
        await new Promise(r => setTimeout(r, this._requestDelay));
      });
    });

    this._inflight.set(cacheKey, promise);
    // Clean up inflight entry after resolution
    promise.then(() => this._inflight.delete(cacheKey));

    return promise;
  }

  /**
   * Get admin login events from FortiGate system log.
   * Convenience wrapper around getEventLogs().
   */
  async getAdminLoginEvents(): Promise<Array<{
    user: string;
    srcip: string;
    timestamp: number;
    action: string;
    status: string;
    msg?: string;
  }>> {
    const logs = await this.getEventLogs('subtype==system&&action==login', 200);
    return logs.map(log => ({
      user: log.user || 'unknown',
      srcip: log.srcip || '',
      timestamp: log.timestamp || 0,
      action: log.action || 'login',
      status: log.status || 'unknown',
      msg: log.msg || '',
    }));
  }

  /**
   * Get IPsec VPN tunnels
   */
  async getIPsecTunnels(): Promise<Array<{
    name: string;
    comments: string;
    status: string;
    username: string;
    rgwy: string;
    incoming_bytes: number;
    outgoing_bytes: number;
    connection_count: number;
  }>> {
    try {
      const response = await secureFetch('FORTIGATE', `${this.baseUrl}/monitor/vpn/ipsec`, {
        headers: await this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as {
        results: Array<{
          name: string;
          comments: string;
          proxyid: Array<{ status: string }>;
          username: string;
          rgwy: string;
          incoming_bytes: number;
          outgoing_bytes: number;
          connection_count: number;
        }>;
      };

      return data.results.map(tunnel => ({
        name: tunnel.name,
        comments: tunnel.comments,
        status: tunnel.proxyid?.[0]?.status || 'unknown',
        username: tunnel.username,
        rgwy: tunnel.rgwy,
        incoming_bytes: tunnel.incoming_bytes,
        outgoing_bytes: tunnel.outgoing_bytes,
        connection_count: tunnel.connection_count,
      }));
    } catch (error) {
      log.error({ err: error }, 'Failed to get IPsec tunnels');
      return [];
    }
  }

  /**
   * Get configuration revisions (change history)
   */
  async getConfigRevisions(): Promise<{
    hasUnsavedChanges: boolean;
    revisions: Array<{
      id: number;
      time: number;
      admin: string;
      comment: string;
      version: string;
    }>;
  }> {
    try {
      const response = await secureFetch('FORTIGATE', `${this.baseUrl}/monitor/system/config-revision`, {
        headers: await this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as {
        results: {
          revisions: Array<{
            id: number;
            time: number;
            version_id: string;
            admin: string;
            comment: string;
          }>;
          current_config_unsaved: boolean;
        };
      };

      return {
        hasUnsavedChanges: data.results.current_config_unsaved,
        revisions: data.results.revisions.map(rev => ({
          id: rev.id,
          time: rev.time,
          admin: rev.admin,
          comment: rev.comment,
          version: rev.version_id,
        })),
      };
    } catch (error) {
      log.error({ err: error }, 'Failed to get config revisions');
      return { hasUnsavedChanges: false, revisions: [] };
    }
  }

  /**
   * Get interface statistics
   */
  async getInterfaceStats(): Promise<Array<{
    id: string;
    name: string;
    alias: string;
    mac: string;
    ip: string;
    link: boolean;
    speed: number;
    tx_packets: number;
    rx_packets: number;
    tx_bytes: number;
    rx_bytes: number;
    tx_errors: number;
    rx_errors: number;
  }>> {
    try {
      const response = await secureFetch('FORTIGATE', `${this.baseUrl}/monitor/system/interface`, {
        headers: await this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as {
        results: Record<string, {
          id: string;
          name: string;
          alias: string;
          mac: string;
          ip: string;
          link: boolean;
          speed: number;
          tx_packets: number;
          rx_packets: number;
          tx_bytes: number;
          rx_bytes: number;
          tx_errors: number;
          rx_errors: number;
        }>;
      };

      return Object.values(data.results).filter(iface => 
        iface.name && iface.name !== 'lo'
      );
    } catch (error) {
      log.error({ err: error }, 'Failed to get interface stats');
      return [];
    }
  }

  /**
   * Fetch quarantined (banned) IPs from FortiGate
   * GET /api/v2/monitor/user/banned
   */
  async fetchQuarantinedIPs(): Promise<FortiGateQuarantinedIP[]> {
    try {
      const data = await this.apiRequest<{
        http_method: string;
        results: Array<{
          ip_address?: string;
          ip_v4_address?: string;
          ip_v6_address?: string;
          ipv6?: string | number;
          created?: number;
          expires?: number;
          source?: string;
          service?: string;
          comment?: string;
          status?: string;
          vd?: string;
          interface?: string;
        }>;
        http_status: number;
        serial: string;
        vdom: string;
        path: string;
        name: string;
      }>('/monitor/user/banned');

      if (!data.results) return [];

      return data.results.map((entry, idx) => ({
        id: `quarantine-${idx}`,
        ip: entry.ip_address || entry.ip_v4_address || entry.ip_v6_address || 'unknown',
        ipv6: typeof entry.ipv6 === 'string' && entry.ipv6 ? entry.ipv6 : undefined,
        created: entry.created ? new Date(entry.created * 1000).toISOString() : null,
        expires: entry.expires ? new Date(entry.expires * 1000).toISOString() : null,
        source: entry.source || 'manual',
        service: entry.service || '-',
        comment: entry.comment || '',
        status: entry.status || 'banned',
        vdom: entry.vd || 'root',
        interface: entry.interface || '-',
      }));
    } catch (error) {
      log.error({ err: error }, 'Failed to fetch quarantined IPs');
      return [];
    }
  }

  /**
   * Release (unban) a quarantined IP
   * POST /api/v2/monitor/user/banned/clear_users
   */
  async releaseQuarantinedIP(ip: string): Promise<boolean> {
    try {
      await this.apiRequest('/monitor/user/banned/clear_users', 'POST', {
        ip_addresses: [ip],
      });
      return true;
    } catch (error) {
      log.error({ err: error, ip }, 'Failed to release quarantine');
      return false;
    }
  }

  /**
   * Add an IP to quarantine
   * POST /api/v2/monitor/user/banned/add_users
   */
  async addToQuarantine(ip: string, expiry_seconds?: number, comment?: string): Promise<boolean> {
    try {
      const payload: Record<string, unknown> = { ip_addresses: [ip] };
      if (expiry_seconds) payload.expiry = expiry_seconds;
      if (comment) payload.comment = comment;
      await this.apiRequest('/monitor/user/banned/add_users', 'POST', payload);
      return true;
    } catch (error) {
      log.error({ err: error, ip }, 'Failed to add to quarantine');
      return false;
    }
  }
}

export interface FortiGateQuarantinedIP {
  id: string;
  ip: string;
  ipv6?: string;
  created: string | null;
  expires: string | null;
  source: string;
  service: string;
  comment: string;
  status: string;
  vdom: string;
  interface: string;
}

export default FortiGateService;
