import { PrismaClient } from '@prisma/client';

// Note: Prisma models (relationship, vMwareCluster, vlan, integrationSyncLog, zabbixTrigger)
// are accessed dynamically via $queryRaw to avoid TypeScript type issues

export interface InventoryReport {
  totalDevices: number;
  byType: Record<string, number>;
  byVendor: Record<string, number>;
  byStatus: Record<string, number>;
  byCriticality: Record<string, number>;
  recentlyAdded: Array<{ id: string; name: string; type: string; createdAt: Date }>;
  topVendors: Array<{ vendor: string; count: number }>;
}

export interface CapacityReport {
  totalRacks: number;
  usedRackSpace: number;
  totalRackUnits: number;
  usedRackUnits: number;
  rackUtilization: number;
  byRoom: Array<{ room: string; totalRacks: number; usedRacks: number; utilization: number }>;
  powerUtilization: { total: number; used: number; percentage: number };
  coolingUtilization: { total: number; used: number; percentage: number };
}

export interface VmwareReport {
  totalClusters: number;
  totalHosts: number;
  totalVMs: number;
  totalDatastores: number;
  hostCpuUsage: number;
  hostMemoryUsage: number;
  hostStorageUsage: number;
  vmDistribution: Array<{ cluster: string; vmCount: number }>;
  datastoreUtilization: Array<{ name: string; capacity: number; used: number; percentage: number }>;
}

export interface IntegrationReport {
  zabbix: { hosts: number; interfaces: number; triggers: number; items: number; lastSync: Date | null };
  vmware: { clusters: number; hosts: number; vms: number; datastores: number; lastSync: Date | null };
  fortigate: { interfaces: number; vlans: number; policies: number; addresses: number; lastSync: Date | null };
}

export interface AlertReport {
  totalAlerts: number;
  criticalAlerts: number;
  warningAlerts: number;
  infoAlerts: number;
  recentAlerts: Array<{ id: string; message: string; severity: string; device: string; timestamp: Date }>;
  topAlertingDevices: Array<{ device: string; alertCount: number }>;
}

export interface ReportOptions {
  organizationId?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Reports Service
 * 
 * Generates comprehensive reports for inventory, capacity, and integrations.
 */
export class ReportsService {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || new PrismaClient();
  }

  /**
   * Generate comprehensive inventory report
   */
  async getInventoryReport(_options: ReportOptions = {}): Promise<InventoryReport> {
    // Get all devices with aggregation using raw query
    const devices = await this.prisma.$queryRaw`
      SELECT id, name, type, vendor, model, status, criticality, "createdAt" 
      FROM "devices"
      ORDER BY "createdAt" DESC
      LIMIT 1000
    ` as Array<{
      id: string;
      name: string;
      type: string;
      vendor: string | null;
      model: string | null;
      status: string;
      criticality: string;
      createdAt: Date;
    }>;

    // Count by type
    const byType: Record<string, number> = {};
    for (const device of devices) {
      byType[device.type] = (byType[device.type] || 0) + 1;
    }

    // Count by vendor
    const byVendor: Record<string, number> = {};
    for (const device of devices) {
      if (device.vendor) {
        byVendor[device.vendor] = (byVendor[device.vendor] || 0) + 1;
      }
    }

    // Count by status
    const byStatus: Record<string, number> = {};
    for (const device of devices) {
      byStatus[device.status] = (byStatus[device.status] || 0) + 1;
    }

    // Count by criticality
    const byCriticality: Record<string, number> = {};
    for (const device of devices) {
      byCriticality[device.criticality] = (byCriticality[device.criticality] || 0) + 1;
    }

    // Recently added devices
    const recentlyAdded = devices.slice(0, 10).map(d => ({
      id: d.id,
      name: d.name,
      type: d.type,
      createdAt: d.createdAt
    }));

    // Top vendors
    const topVendors = Object.entries(byVendor)
      .map(([vendor, count]) => ({ vendor, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalDevices: devices.length,
      byType,
      byVendor,
      byStatus,
      byCriticality,
      recentlyAdded,
      topVendors
    };
  }

  /**
   * Generate capacity report
   */
  async getCapacityReport(): Promise<CapacityReport> {
    // Get all racks
    const racks = await this.prisma.$queryRaw`
      SELECT r.id, r."maxUnits", r."roomId", 
             json_agg(d.id) as devices
      FROM "racks" r
      LEFT JOIN "devices" d ON d."rackId" = r.id AND d."rackUnitPosition" IS NOT NULL
      GROUP BY r.id, r."maxUnits", r."roomId"
    ` as Array<{
      id: string;
      maxUnits: number;
      roomId: string | null;
      devices: string[] | null;
    }>;

    // Get room names
    const rooms = await this.prisma.$queryRaw`
      SELECT id, name FROM "rooms"
    ` as Array<{ id: string; name: string }>;
    const roomMap = new Map(rooms.map(r => [r.id, r.name]));

    // Calculate rack utilization
    let totalRackUnits = 0;
    let usedRackUnits = 0;
    const roomStats: Record<string, { total: number; used: number }> = {};

    for (const rack of racks) {
      const rackCapacity = rack.maxUnits || 42;
      totalRackUnits += rackCapacity;
      
      const usedUnits = rack.devices?.filter(Boolean).length || 0;
      usedRackUnits += usedUnits;

      const roomName = rack.roomId ? roomMap.get(rack.roomId) || 'Unknown' : 'Unknown';
      if (!roomStats[roomName]) {
        roomStats[roomName] = { total: 0, used: 0 };
      }
      roomStats[roomName].total += 1;
      if (usedUnits > 0) roomStats[roomName].used += 1;
    }

    const byRoom = Object.entries(roomStats).map(([room, data]) => ({
      room,
      totalRacks: data.total,
      usedRacks: data.used,
      utilization: data.total > 0 ? (data.used / data.total) * 100 : 0
    }));

    // Power utilization (estimated)
    const powerUtilization = {
      total: racks.length * 20,
      used: usedRackUnits * 0.5,
      percentage: 0
    };
    powerUtilization.percentage = powerUtilization.total > 0 
      ? (powerUtilization.used / powerUtilization.total) * 100 
      : 0;

    // Cooling utilization (estimated)
    const coolingUtilization = {
      total: racks.length * 15,
      used: usedRackUnits * 0.4,
      percentage: 0
    };
    coolingUtilization.percentage = coolingUtilization.total > 0
      ? (coolingUtilization.used / coolingUtilization.total) * 100
      : 0;

    return {
      totalRacks: racks.length,
      usedRackSpace: usedRackUnits,
      totalRackUnits,
      usedRackUnits,
      rackUtilization: totalRackUnits > 0 ? (usedRackUnits / totalRackUnits) * 100 : 0,
      byRoom,
      powerUtilization,
      coolingUtilization
    };
  }

  /**
   * Generate VMware report
   */
  async getVmwareReport(): Promise<VmwareReport> {
    // Get clusters
    const clusters = await this.prisma.$queryRaw`SELECT COUNT(*) as count FROM "vmware_clusters"` as Array<{ count: bigint }>;
    
    // Get hosts
    const hosts = await this.prisma.$queryRaw`
      SELECT id, name, metadata FROM "devices" 
      WHERE "vmwareMoref" IS NOT NULL AND type = 'VIRTUAL_HOST'
    ` as Array<{ id: string; name: string; metadata: any }>;
    
    // Get VMs
    const vms = await this.prisma.$queryRaw`
      SELECT id, name, "vmHostId", metadata FROM "devices" 
      WHERE type = 'VIRTUAL_MACHINE'
    ` as Array<{ id: string; name: string; vmHostId: string | null; metadata: any }>;
    
    // Get datastores
    const datastores = await this.prisma.$queryRaw`
      SELECT name, "capacityTotal", "capacityUsed" FROM "vmware_datastores"
    ` as Array<{ name: string; capacityTotal: string; capacityUsed: string }>;

    // Calculate VM distribution
    const vmDistribution: Record<string, number> = {};
    for (const vm of vms) {
      const host = hosts.find(h => h.id === vm.vmHostId);
      const clusterName = host?.metadata?.clusterName || 'Unknown';
      vmDistribution[clusterName] = (vmDistribution[clusterName] || 0) + 1;
    }

    // Calculate average host utilization
    let totalCpuUsage = 0;
    let totalMemoryUsage = 0;
    for (const host of hosts) {
      const metadata = host.metadata as Record<string, number> || {};
      totalCpuUsage += metadata.cpuUsagePercent || 0;
      totalMemoryUsage += metadata.memoryUsagePercent || 0;
    }

    // Calculate datastore utilization
    const datastoreUtilization = datastores.map(ds => {
      const capacity = parseFloat(ds.capacityTotal) || 0;
      const used = parseFloat(ds.capacityUsed) || 0;
      return {
        name: ds.name,
        capacity,
        used,
        percentage: capacity > 0 ? (used / capacity) * 100 : 0
      };
    });

    return {
      totalClusters: Number(clusters[0]?.count || 0),
      totalHosts: hosts.length,
      totalVMs: vms.length,
      totalDatastores: datastores.length,
      hostCpuUsage: hosts.length > 0 ? totalCpuUsage / hosts.length : 0,
      hostMemoryUsage: hosts.length > 0 ? totalMemoryUsage / hosts.length : 0,
      hostStorageUsage: datastoreUtilization.length > 0
        ? datastoreUtilization.reduce((sum, ds) => sum + ds.percentage, 0) / datastoreUtilization.length
        : 0,
      vmDistribution: Object.entries(vmDistribution).map(([cluster, vmCount]) => ({ cluster, vmCount })),
      datastoreUtilization
    };
  }

  /**
   * Generate integration status report
   */
  async getIntegrationReport(): Promise<IntegrationReport> {
    const zabbixHosts = await this.prisma.$queryRaw`SELECT COUNT(*) as count FROM "devices" WHERE "zabbixHostId" IS NOT NULL` as Array<{ count: bigint }>;
    const vmwareClusters = await this.prisma.$queryRaw`SELECT COUNT(*) as count FROM "vmware_clusters"` as Array<{ count: bigint }>;
    const vmwareHosts = await this.prisma.$queryRaw`SELECT COUNT(*) as count FROM "devices" WHERE "vmwareMoref" IS NOT NULL AND type = 'VIRTUAL_HOST'` as Array<{ count: bigint }>;
    const vmwareVMs = await this.prisma.$queryRaw`SELECT COUNT(*) as count FROM "devices" WHERE type = 'VIRTUAL_MACHINE'` as Array<{ count: bigint }>;
    const vmwareDatastores = await this.prisma.$queryRaw`SELECT COUNT(*) as count FROM "vmware_datastores"` as Array<{ count: bigint }>;

    const lastZabbixSync = await this.prisma.integrationSyncLog.findFirst({
      where: { status: { not: 'failed' } },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true }
    });

    const lastVmwareSync = await this.prisma.integrationSyncLog.findFirst({
      where: { status: { not: 'failed' } },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true }
    });

    const lastFortigateSync = await this.prisma.integrationSyncLog.findFirst({
      where: { status: { not: 'failed' } },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true }
    });

    return {
      zabbix: {
        hosts: Number(zabbixHosts[0]?.count || 0),
        interfaces: 0,
        triggers: 0,
        items: 0,
        lastSync: lastZabbixSync?.startedAt || null
      },
      vmware: {
        clusters: Number(vmwareClusters[0]?.count || 0),
        hosts: Number(vmwareHosts[0]?.count || 0),
        vms: Number(vmwareVMs[0]?.count || 0),
        datastores: Number(vmwareDatastores[0]?.count || 0),
        lastSync: lastVmwareSync?.startedAt || null
      },
      fortigate: {
        interfaces: 0,
        vlans: 0,
        policies: 0,
        addresses: 0,
        lastSync: lastFortigateSync?.startedAt || null
      }
    };
  }

  /**
   * Generate alert report
   */
  async getAlertReport(): Promise<AlertReport> {
    const alerts = await this.prisma.zabbixTrigger.findMany({
      where: { value: 1 },
      orderBy: { lastChange: 'desc' },
      take: 100
    });

    let criticalAlerts = 0;
    let warningAlerts = 0;
    let infoAlerts = 0;

    const recentAlerts: Array<{ id: string; message: string; severity: string; device: string; timestamp: Date }> = [];
    const alertCounts: Record<string, number> = {};

    for (const alert of alerts) {
      const severity = this.mapPriorityToSeverity(alert.priority);
      
      if (severity === 'critical') criticalAlerts++;
      else if (severity === 'warning') warningAlerts++;
      else infoAlerts++;

      recentAlerts.push({
        id: alert.id,
        message: alert.description,
        severity,
        device: 'Unknown Device',
        timestamp: alert.lastChange || new Date(),
      });
    }

    const topAlertingDevices = Object.entries(alertCounts)
      .map(([device, alertCount]) => ({ device, alertCount }))
      .sort((a, b) => b.alertCount - a.alertCount)
      .slice(0, 10);

    return {
      totalAlerts: alerts.length,
      criticalAlerts,
      warningAlerts,
      infoAlerts,
      recentAlerts,
      topAlertingDevices
    };
  }

  private mapPriorityToSeverity(priority: number): string {
    if (priority >= 4) return 'critical';
    if (priority >= 2) return 'warning';
    return 'info';
  }

  /**
   * Get summary dashboard data
   */
  async getDashboardSummary() {
    const [inventory, capacity, vmware, integration, alerts] = await Promise.all([
      this.getInventoryReport(),
      this.getCapacityReport(),
      this.getVmwareReport(),
      this.getIntegrationReport(),
      this.getAlertReport()
    ]);

    return {
      inventory,
      capacity,
      vmware,
      integration,
      alerts,
      generatedAt: new Date()
    };
  }
}

export { ReportsService as default };
