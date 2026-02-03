/**
 * Integration Services Index
 * 
 * Central export point for all integration services:
 * - Zabbix (monitoring and discovery)
 * - VMware vCenter (virtualization)
 * - FortiGate (firewall and security)
 * - FortiAnalyzer (event and threat logs)
 */

// Re-export service classes
export { ZabbixService } from './zabbix';
export { VMwareService } from './vmware';
export { FortiGateService } from './fortigate';
export { default as FortiAnalyzerService } from './fortianalyzer';

// Re-export types
export type { ZabbixConfig, ZabbixHost, ZabbixInterface, ZabbixTrigger } from './zabbix';
export type { VMwareConfig, VMwareCluster, VMwareHost, VMwareVM, VMwareDatastore } from './vmware';
export type { FortiGateConfig, FortiGateInterface, FortiGatePolicy, FortiGateAddress } from './fortigate';

import type FortiAnalyzerService from './fortianalyzer';
export type { default as FortiAnalyzerServiceType } from './fortianalyzer';

/**
 * Integration types for configuration management
 */
export type IntegrationType = 'zabbix' | 'vmware' | 'fortigate' | 'fortianalyzer';

export interface IntegrationStatus {
  type: IntegrationType;
  connected: boolean;
  version?: string;
  lastSync?: Date;
  error?: string;
}

export interface IntegrationConfig {
  id: string;
  type: IntegrationType;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
  pollingInterval: number;
  lastSyncAt?: Date;
  lastSyncStatus?: 'success' | 'partial' | 'failed';
}
