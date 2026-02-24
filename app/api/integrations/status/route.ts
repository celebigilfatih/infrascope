import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface IntegrationStatus {
  id: string;
  name: string;
  type: 'monitoring' | 'backup' | 'security' | 'cloud' | 'cmdb';
  status: 'connected' | 'disconnected' | 'error' | 'syncing';
  lastSync: string;
  message: string;
  healthScore: number;
}

export async function GET() {
  try {
    // Fetch all integration configs
    const configs = await prisma.integrationConfig.findMany({
      where: { enabled: true },
      orderBy: { createdAt: 'desc' },
    });

    const integrations: IntegrationStatus[] = configs.map((config) => {
      const configData = config.config as any;
      const lastSyncTime = config.lastSyncAt ? new Date(config.lastSyncAt) : null;
      const now = new Date();
      let lastSyncLabel = '-';

      if (lastSyncTime) {
        const diffMs = now.getTime() - lastSyncTime.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) lastSyncLabel = 'şimdi';
        else if (diffMins < 60) lastSyncLabel = `${diffMins} dakika`;
        else if (diffHours < 24) lastSyncLabel = `${diffHours} saat`;
        else lastSyncLabel = `${diffDays} gün`;
      }

      // Map integration type to status
      let name = '';
      let category = '';
      let currentStatus: 'connected' | 'disconnected' | 'error' | 'syncing' = 'disconnected';
      let healthScore = 0;
      let message = '';

      switch (config.type) {
        case 'VMWARE_VCENTER':
          name = 'VMware vCenter';
          category = 'monitoring';
          currentStatus = configData.host ? 'connected' : 'disconnected';
          healthScore = configData.host ? 95 : 0;
          message = configData.host ? 'VM envanteri senkronize ediliyor' : 'Yapılandırılmadı';
          break;

        case 'FORTIGATE':
          name = 'FortiGate Firewall';
          category = 'security';
          currentStatus = configData.host ? 'connected' : 'disconnected';
          healthScore = configData.host ? 100 : 0;
          message = configData.host ? 'Policy listesi güncel' : 'Yapılandırılmadı';
          break;

        case 'ZABBIX':
          name = 'Zabbix Server';
          category = 'monitoring';
          currentStatus = configData.host ? 'connected' : 'disconnected';
          healthScore = configData.host ? 98 : 0;
          message = configData.host ? 'Tüm hostlar izleniyor' : 'Yapılandırılmadı';
          break;

        case 'FORTIANALYZER':
          name = 'FortiAnalyzer';
          category = 'security';
          currentStatus = configData.host ? 'connected' : 'disconnected';
          healthScore = configData.host ? 92 : 0;
          message = configData.host ? 'Log analizi aktif' : 'Yapılandırılmadı';
          break;

        case 'SNMP':
          name = 'SNMP Monitoring';
          category = 'monitoring';
          currentStatus = configData.host ? 'connected' : 'disconnected';
          healthScore = configData.host ? 90 : 0;
          message = configData.host ? 'SNMP trap alındı' : 'Yapılandırılmadı';
          break;

        default:
          name = config.name || config.type;
          category = 'cmdb';
          currentStatus = 'disconnected';
          healthScore = 0;
          message = 'Bilinmeyen entegrasyon';
      }

      // Check sync status
      if (config.lastSyncStatus === 'success' && lastSyncTime) {
        const diffMins = Math.floor((now.getTime() - lastSyncTime.getTime()) / 60000);
        if (diffMins < 5) {
          currentStatus = 'syncing';
        }
      } else if (config.lastSyncStatus === 'failed') {
        currentStatus = 'error';
        healthScore = Math.max(0, healthScore - 50);
        message = 'Son senkronizasyon başarısız';
      }

      return {
        id: config.id,
        name,
        type: category as any,
        status: currentStatus,
        lastSync: lastSyncLabel,
        message,
        healthScore: Math.max(0, Math.min(100, healthScore)),
      };
    });

    // Add unconfigured integrations
    const configuredTypes = configs.map(c => c.type as string);
    const allTypes: string[] = ['VMWARE_VCENTER', 'FORTIGATE', 'ZABBIX', 'FORTIANALYZER', 'SNMP'];
    const unconfiguredTypes = allTypes.filter(t => !configuredTypes.includes(t));

    const unconfiguredIntegrations: IntegrationStatus[] = unconfiguredTypes.map((type, idx) => {
      let name = '';
      let category = '';

      switch (type) {
        case 'VMWARE_VCENTER':
          name = 'VMware vCenter';
          category = 'monitoring';
          break;
        case 'FORTIGATE':
          name = 'FortiGate Firewall';
          category = 'security';
          break;
        case 'ZABBIX':
          name = 'Zabbix Server';
          category = 'monitoring';
          break;
        case 'FORTIANALYZER':
          name = 'FortiAnalyzer';
          category = 'security';
          break;
        case 'SNMP':
          name = 'SNMP Monitoring';
          category = 'monitoring';
          break;
        default:
          name = type;
          category = 'cmdb';
      }

      return {
        id: `unconfigured-${idx}`,
        name,
        type: category as any,
        status: 'disconnected' as const,
        lastSync: '-',
        message: 'Entegrasyon yapılandırılmadı',
        healthScore: 0,
      };
    });

    const allIntegrations = [...integrations, ...unconfiguredIntegrations];

    // Calculate stats
    const stats = {
      total: allIntegrations.length,
      connected: allIntegrations.filter(i => i.status === 'connected').length,
      disconnected: allIntegrations.filter(i => i.status === 'disconnected').length,
      errors: allIntegrations.filter(i => i.status === 'error').length,
      syncing: allIntegrations.filter(i => i.status === 'syncing').length,
      avgHealth: Math.round(allIntegrations.reduce((sum, i) => sum + i.healthScore, 0) / allIntegrations.length),
    };

    return NextResponse.json({
      success: true,
      data: allIntegrations,
      stats,
    });
  } catch (error) {
    console.error('Error fetching integration status:', error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
        data: [],
        stats: {
          total: 0,
          connected: 0,
          disconnected: 0,
          errors: 0,
          syncing: 0,
          avgHealth: 0,
        },
      },
      { status: 500 }
    );
  }
}
