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
import { SourceQueryError, withSourceDeadline } from './source-query-error';
import { inventorySyncOutcome, type InventorySyncOutcome } from './sync-outcome';
import { inventorySourceScope } from './inventory-source-scope';

const prisma = new PrismaClient();

// Zabbix API Types
export interface ZabbixConfig {
  integrationId?: string;
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

export interface SyncResult extends InventorySyncOutcome {
  hostsCreated: number;
  hostsUpdated: number;
  interfacesProcessed: number;
  triggersProcessed: number;
  errors: string[];
  duration: number;
}

// Zabbix API Client
export class ZabbixService {
  private readonly config: ZabbixConfig;
  private authToken: string | null = null;
  private authTransport: 'header' | 'body' | null = null;
  private apiVersion: string | null = null;
  private requestId = 0;
  private verification: Promise<boolean> | null = null;
  private authError: SourceQueryError | null = null;

  constructor(config: ZabbixConfig) {
    this.config = { ...config, enabledModules: { ...config.enabledModules } };
  }

  private endpoint(): string {
    try {
      const url = new URL(this.config.url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new Error('Invalid API URL');
      }
      const frontendPath = url.pathname.replace(/\/+$/, '');
      url.pathname = frontendPath.endsWith('/api_jsonrpc.php') ? frontendPath : `${frontendPath}/api_jsonrpc.php`;
      return url.toString();
    } catch { throw new SourceQueryError('ZABBIX_CONFIG_INVALID', 'Zabbix API URL is invalid'); }
  }

  /** Version discovery is explicitly unauthenticated; protected reads use exactly one transport. */
  private async apiCall<T>(method: string, params: Record<string, unknown> | unknown[] = {}, authenticated = true): Promise<T> {
    if (authenticated && (!this.authToken || !this.authTransport)) {
      throw new SourceQueryError('ZABBIX_NOT_AUTHENTICATED', 'Zabbix token has not been verified');
    }
    const endpoint = this.endpoint();
    const id = ++this.requestId;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const body: Record<string, unknown> = { jsonrpc: '2.0', method, params, id };
    if (authenticated) {
      if (this.authTransport === 'header') headers.Authorization = `Bearer ${this.authToken}`;
      else body.auth = this.authToken;
    }
    try {
      return await withSourceDeadline(async signal => {
        const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal });
        if (!response.ok) {
          throw new SourceQueryError(response.status === 401 || response.status === 403 ? 'ZABBIX_ACCESS_DENIED' : 'ZABBIX_HTTP_ERROR',
            'Zabbix API returned an unsuccessful HTTP status');
        }
        let data: unknown;
        try { data = await response.json(); }
        catch { throw new SourceQueryError('ZABBIX_RESPONSE_INVALID', 'Zabbix API returned invalid JSON'); }
        if (typeof data !== 'object' || data === null || Array.isArray(data)) {
          throw new SourceQueryError('ZABBIX_RESPONSE_INVALID', 'Zabbix API returned an invalid envelope');
        }
        const envelope = data as Record<string, unknown>;
        const resultPresent = Object.prototype.hasOwnProperty.call(envelope, 'result');
        const errorPresent = Object.prototype.hasOwnProperty.call(envelope, 'error');
        if (envelope.jsonrpc !== '2.0' || envelope.id !== id || resultPresent === errorPresent) {
          throw new SourceQueryError('ZABBIX_RESPONSE_INVALID', 'Zabbix API returned an invalid envelope');
        }
        // Never include remote messages/data: they can echo credentials.
        if (errorPresent) throw new SourceQueryError('ZABBIX_RPC_ERROR', 'Zabbix API rejected the request');
        return envelope.result as T;
      }, 30_000);
    } catch (error) {
      if (error instanceof SourceQueryError) {
        if (error.code === 'SOURCE_TIMEOUT') throw new SourceQueryError('ZABBIX_TIMEOUT', 'Zabbix API request timed out');
        throw error;
      }
      throw new SourceQueryError('ZABBIX_NETWORK_ERROR', 'Zabbix API request failed');
    }
  }

  /** No password session exists in this configuration; verify the operator-owned API token. */
  async authenticate(): Promise<boolean> {
    if (this.verification) return this.verification;
    const attempt = this.verifyToken();
    this.verification = attempt;
    try { return await attempt; }
    finally { if (this.verification === attempt) this.verification = null; }
  }

  private async verifyToken(): Promise<boolean> {
    this.authToken = null;
    this.authTransport = null;
    this.apiVersion = null;
    this.authError = null;
    try {
      const token = typeof this.config.authToken === 'string' ? this.config.authToken.trim() : '';
      if (!token) throw new SourceQueryError('ZABBIX_TOKEN_REQUIRED', 'A Zabbix API token is required');
      if (/[\r\n]/.test(token)) throw new SourceQueryError('ZABBIX_CONFIG_INVALID', 'Zabbix API token contains invalid control characters');

      const version = await this.apiCall<unknown>('apiinfo.version', [], false);
      const parts = typeof version === 'string' ? /^(\d+)\.(\d+)\.(\d+)[a-zA-Z0-9.+-]*$/.exec(version) : null;
      if (!parts) throw new SourceQueryError('ZABBIX_RESPONSE_INVALID', 'Zabbix API version is invalid');
      const major = Number(parts[1]), minor = Number(parts[2]);
      if (major < 5 || (major === 5 && minor < 4)) {
        throw new SourceQueryError('ZABBIX_VERSION_UNSUPPORTED', 'This Zabbix version does not support configured API tokens');
      }
      this.authTransport = major > 6 || (major === 6 && minor >= 4) ? 'header' : 'body';
      this.authToken = token;
      const probe = await this.apiCall<unknown>('host.get', { output: ['hostid'], limit: 1 });
      if (!Array.isArray(probe) || !probe.every(host => typeof host === 'object' && host !== null &&
          typeof host.hostid === 'string' && host.hostid.length > 0)) {
        throw new SourceQueryError('ZABBIX_RESPONSE_INVALID', 'Zabbix token probe returned invalid host data');
      }
      this.apiVersion = version as string;
      return true;
    } catch (error) {
      this.authToken = null;
      this.authTransport = null;
      this.apiVersion = null;
      this.authError = error instanceof SourceQueryError ? error :
        new SourceQueryError('ZABBIX_AUTH_FAILED', 'Zabbix token verification failed');
      console.warn('Zabbix token verification failed', { code: this.authError.code });
      return false;
    }
  }

  private authenticationMessage(): string {
    switch (this.authError?.code) {
      case 'ZABBIX_TOKEN_REQUIRED': return 'Zabbix API tokenı gerekli.';
      case 'ZABBIX_CONFIG_INVALID': return 'Zabbix API adresi veya token ayarı geçersiz.';
      case 'ZABBIX_VERSION_UNSUPPORTED': return 'Bu Zabbix sürümü API tokenı ile bağlantıyı desteklemiyor.';
      case 'ZABBIX_RPC_ERROR':
      case 'ZABBIX_ACCESS_DENIED': return 'Zabbix tokenı doğrulanamadı; tokenın geçerliliğini, süresini ve API okuma yetkisini kontrol edin.';
      case 'ZABBIX_TIMEOUT': return 'Zabbix bağlantı süresi aşıldı.';
      case 'ZABBIX_RESPONSE_INVALID': return 'Zabbix API yanıtı geçersiz veya eksik.';
      default: return 'Zabbix bağlantısı doğrulanamadı; kaynak adresini ve ağ erişimini kontrol edin.';
    }
  }

  /**
   * Fetch all hosts from Zabbix
   */
  async fetchHosts(): Promise<ZabbixHost[]> {
    return this.apiCall<ZabbixHost[]>('host.get', {
      output: ['hostid', 'host', 'name', 'status', 'inventory_mode'],
      selectInventory: 'extend',
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
    void _organizationId; // Retain the existing caller contract; this path does not use this argument.
    const startTime = Date.now();
    const result: SyncResult = {
      success: false,
      status: 'failed', itemsProcessed: 0, itemsCreated: 0, itemsUpdated: 0, errorCount: 0,
      hostsCreated: 0,
      hostsUpdated: 0,
      interfacesProcessed: 0,
      triggersProcessed: 0,
      errors: [],
      duration: 0,
    };

    try {
      const sourceScope = inventorySourceScope('ZABBIX', this.config.integrationId, this.config.url);
      // Authenticate
      const authenticated = await this.authenticate();
      if (!authenticated) {
        result.errors.push(this.authError?.message || 'Zabbix token verification failed');
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
            where: { zabbixSourceScope: sourceScope, zabbixHostId: host.hostid },
          });

          const deviceData = {
            zabbixSourceScope: sourceScope,
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
              where: { zabbixSourceScope: sourceScope, zabbixHostId: host.hostid },
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
                where: { zabbixSourceScope: sourceScope, zabbixHostId: host.hostid },
              });

              if (device) {
                await prisma.zabbixTrigger.upsert({
                  where: { sourceScope_triggerId_hostId: { sourceScope, triggerId: trigger.triggerid, hostId: host.hostid } },
                  create: {
                    sourceScope,
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

    } catch (error) {
      result.errors.push(`Sync failed: ${(error as Error).message}`);
    } finally {
      Object.assign(result, inventorySyncOutcome(result.hostsCreated, result.hostsUpdated,
        result.interfacesProcessed + result.triggersProcessed, result.errors));
      result.duration = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Get connection status
   */
  async getStatus(): Promise<{ connected: boolean; version?: string; error?: string; code?: string }> {
    if (!await this.authenticate()) {
      return { connected: false, error: this.authenticationMessage(), code: this.authError?.code };
    }
    return { connected: true, version: this.apiVersion ?? undefined };
  }
}

export default ZabbixService;
