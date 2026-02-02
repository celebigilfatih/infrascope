import { PrismaClient } from '@prisma/client';

export interface CorrelationResult {
  relationshipsCreated: number;
  relationshipsUpdated: number;
  relationshipsDeleted: number;
  errors: string[];
}

interface NeighborInfo {
  deviceId: string;
  ip?: string;
  localInterface: string;
  remoteInterface: string;
  protocol: string;
  source: string;
  confidence: number;
}

interface TopologyNode {
  id: string;
  label: string;
  type: string;
  status: string;
  x: number;
  y: number;
}

interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  relationshipType: string;
  label: string;
  confidence: number;
  animated: boolean;
}

export class TopologyRelationshipEngine {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || new PrismaClient();
  }

  async correlateAll(): Promise<CorrelationResult> {
    const result: CorrelationResult = {
      relationshipsCreated: 0,
      relationshipsUpdated: 0,
      relationshipsDeleted: 0,
      errors: []
    };

    try {
      const vmHostRels = await this.correlateVmHostRelationships();
      result.relationshipsCreated += vmHostRels.relationshipsCreated;
      result.relationshipsUpdated += vmHostRels.relationshipsUpdated;
      result.errors.push(...vmHostRels.errors);

      const clusterHostRels = await this.correlateClusterHostRelationships();
      result.relationshipsCreated += clusterHostRels.relationshipsCreated;
      result.relationshipsUpdated += clusterHostRels.relationshipsUpdated;
      result.errors.push(...clusterHostRels.errors);

      const vlanRels = await this.correlateVlanMemberships();
      result.relationshipsCreated += vlanRels.relationshipsCreated;
      result.relationshipsUpdated += vlanRels.relationshipsUpdated;
      result.errors.push(...vlanRels.errors);

      const interfaceRels = await this.correlateInterfaceConnections();
      result.relationshipsCreated += interfaceRels.relationshipsCreated;
      result.relationshipsUpdated += interfaceRels.relationshipsUpdated;
      result.errors.push(...interfaceRels.errors);

      const staleRemoved = await this.removeStaleRelationships();
      result.relationshipsDeleted = staleRemoved;

      return result;
    } catch (error) {
      result.errors.push(`Correlation error: ${String(error)}`);
      return result;
    }
  }

  private async correlateVmHostRelationships(): Promise<CorrelationResult> {
    const result: CorrelationResult = {
      relationshipsCreated: 0,
      relationshipsUpdated: 0,
      relationshipsDeleted: 0,
      errors: []
    };

    try {
      const vms = await this.prisma.$queryRaw`
        SELECT id, "vmHostId", name FROM "devices" 
        WHERE type = 'VIRTUAL_MACHINE' AND "vmHostId" IS NOT NULL
      ` as Array<{ id: string; vmHostId: string; name: string }>;

      for (const vm of vms) {
        const existing = await this.prisma.relationship.findFirst({
          where: {
            sourceDeviceId: vm.vmHostId,
            targetDeviceId: vm.id,
            relationshipType: 'VIRTUAL_RUNS_ON'
          }
        });

        if (existing) {
          if (existing.source !== 'vmware' || existing.confidence < 0.95) {
            await this.prisma.relationship.update({
              where: { id: existing.id },
              data: {
                source: 'vmware',
                confidence: 0.95,
                properties: { verifiedAt: new Date().toISOString() }
              }
            });
            result.relationshipsUpdated++;
          }
        } else {
          await this.prisma.relationship.create({
            data: {
              sourceDeviceId: vm.vmHostId,
              targetDeviceId: vm.id,
              relationshipType: 'VIRTUAL_RUNS_ON',
              source: 'vmware',
              confidence: 0.95,
              properties: { vmName: vm.name }
            }
          });
          result.relationshipsCreated++;
        }
      }

      return result;
    } catch (error) {
      result.errors.push(`VM-Host correlation error: ${String(error)}`);
      return result;
    }
  }

  private async correlateClusterHostRelationships(): Promise<CorrelationResult> {
    const result: CorrelationResult = {
      relationshipsCreated: 0,
      relationshipsUpdated: 0,
      relationshipsDeleted: 0,
      errors: []
    };

    try {
      const clusters = await this.prisma.$queryRaw`
        SELECT vc.id, vc.moref, vc.name, 
               json_agg(json_build_object('id', d.id, 'name', d.name)) as hosts
        FROM "vmware_clusters" vc
        LEFT JOIN "devices" d ON d."vmwareClusterId" = vc.id
        GROUP BY vc.id, vc.moref, vc.name
      ` as Array<{ id: string; moref: string; name: string; hosts: Array<{ id: string; name: string }> }>;

      for (const cluster of clusters) {
        const clusterDevice = await this.prisma.$queryRaw`
          SELECT id FROM "devices" WHERE "vmwareMoref" = ${cluster.moref} LIMIT 1
        ` as Array<{ id: string }>;

        if (!clusterDevice[0]) continue;

        for (const host of cluster.hosts || []) {
          const existing = await this.prisma.relationship.findFirst({
            where: {
              sourceDeviceId: clusterDevice[0].id,
              targetDeviceId: host.id,
              relationshipType: 'CLUSTER_CONTAINS'
            }
          });

          if (existing) {
            if (existing.source !== 'vmware' || existing.confidence < 0.95) {
              await this.prisma.relationship.update({
                where: { id: existing.id },
                data: { source: 'vmware', confidence: 0.95 }
              });
              result.relationshipsUpdated++;
            }
          } else {
            await this.prisma.relationship.create({
              data: {
                sourceDeviceId: clusterDevice[0].id,
                targetDeviceId: host.id,
                relationshipType: 'CLUSTER_CONTAINS',
                source: 'vmware',
                confidence: 0.95,
                properties: { clusterName: cluster.name, hostName: host.name }
              }
            });
            result.relationshipsCreated++;
          }
        }
      }

      return result;
    } catch (error) {
      result.errors.push(`Cluster-Host correlation error: ${String(error)}`);
      return result;
    }
  }

  private async correlateVlanMemberships(): Promise<CorrelationResult> {
    const result: CorrelationResult = {
      relationshipsCreated: 0,
      relationshipsUpdated: 0,
      relationshipsDeleted: 0,
      errors: []
    };

    try {
      const vlans = await this.prisma.$queryRaw`
        SELECT id, "vlanId", name FROM "vlans"
      ` as Array<{ id: string; vlanId: number; name: string | null }>;

      for (const vlan of vlans) {
        let vlanDevice = await this.prisma.$queryRaw`
          SELECT id FROM "devices" WHERE name = ${`VLAN-${vlan.vlanId}`} LIMIT 1
        ` as Array<{ id: string }>;

        if (!vlanDevice[0]) {
          const created = await this.prisma.device.create({
            data: {
              name: `VLAN-${vlan.vlanId}`,
              type: 'VLAN' as any,
              metadata: { vlanId: vlan.vlanId, name: vlan.name }
            }
          });
          vlanDevice = [{ id: created.id }];
        }

        const interfaces = await this.prisma.$queryRaw`
          SELECT DISTINCT "deviceId" FROM "network_interfaces" WHERE "vlanId" = ${vlan.id}
        ` as Array<{ deviceId: string }>;

        for (const iface of interfaces) {
          const existing = await this.prisma.relationship.findFirst({
            where: {
              sourceDeviceId: iface.deviceId,
              targetDeviceId: vlanDevice[0].id,
              relationshipType: 'VLAN_MEMBER'
            }
          });

          if (!existing) {
            await this.prisma.relationship.create({
              data: {
                sourceDeviceId: iface.deviceId,
                targetDeviceId: vlanDevice[0].id,
                relationshipType: 'VLAN_MEMBER',
                source: 'snmp',
                confidence: 0.9,
                properties: { vlanId: vlan.vlanId }
              }
            });
            result.relationshipsCreated++;
          }
        }
      }

      return result;
    } catch (error) {
      result.errors.push(`VLAN membership correlation error: ${String(error)}`);
      return result;
    }
  }

  private async correlateInterfaceConnections(): Promise<CorrelationResult> {
    const result: CorrelationResult = {
      relationshipsCreated: 0,
      relationshipsUpdated: 0,
      relationshipsDeleted: 0,
      errors: []
    };

    try {
      const devices = await this.prisma.device.findMany({
        where: { metadata: { not: undefined } },
        select: { id: true, name: true, metadata: true }
      });

      for (const device of devices) {
        const metadata = (device.metadata as Record<string, any>) || {};
        const neighbors = this.extractNeighbors(metadata);

        for (const neighbor of neighbors) {
          const neighborDevice = await this.prisma.device.findFirst({
            where: {
              OR: [
                { id: neighbor.deviceId },
                { name: { contains: neighbor.deviceId, mode: 'insensitive' } }
              ]
            }
          });

          if (!neighborDevice) continue;

          const existing = await this.prisma.relationship.findFirst({
            where: {
              sourceDeviceId: device.id,
              targetDeviceId: neighborDevice.id,
              relationshipType: 'CONNECTS_TO'
            }
          });

          if (!existing) {
            await this.prisma.relationship.create({
              data: {
                sourceDeviceId: device.id,
                targetDeviceId: neighborDevice.id,
                relationshipType: 'CONNECTS_TO',
                source: neighbor.source || 'snmp',
                confidence: neighbor.confidence || 0.8,
                properties: {
                  localInterface: neighbor.localInterface,
                  remoteInterface: neighbor.remoteInterface,
                  protocol: neighbor.protocol
                }
              }
            });
            result.relationshipsCreated++;
          }
        }
      }

      return result;
    } catch (error) {
      result.errors.push(`Interface connection correlation error: ${String(error)}`);
      return result;
    }
  }

  private extractNeighbors(metadata: Record<string, any>): NeighborInfo[] {
    const neighbors: NeighborInfo[] = [];

    if (metadata?.cdpNeighbors && Array.isArray(metadata.cdpNeighbors)) {
      for (const n of metadata.cdpNeighbors) {
        neighbors.push({
          deviceId: n.deviceId,
          ip: n.ipAddress,
          localInterface: n.localInterface,
          remoteInterface: n.remoteInterface,
          protocol: 'CDP',
          source: 'cdp',
          confidence: 0.9
        });
      }
    }

    if (metadata?.lldpNeighbors && Array.isArray(metadata.lldpNeighbors)) {
      for (const n of metadata.lldpNeighbors) {
        neighbors.push({
          deviceId: n.deviceId,
          ip: n.ipAddress,
          localInterface: n.localInterface,
          remoteInterface: n.remoteInterface,
          protocol: 'LLDP',
          source: 'lldp',
          confidence: 0.85
        });
      }
    }

    return neighbors;
  }

  private async removeStaleRelationships(): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setMinutes(cutoffDate.getMinutes() - 60);

      const stale = await this.prisma.relationship.deleteMany({
        where: {
          source: 'auto',
          confidence: { lt: 0.5 },
          updatedAt: { lt: cutoffDate }
        }
      });

      return stale.count;
    } catch (error) {
      console.error(`Error removing stale relationships: ${error}`);
      return 0;
    }
  }

  async getTopologyGraph(organizationId?: string) {
    try {
      // Build organization filter using raw query for complex OR condition
      let baseWhere = '';
      if (organizationId) {
        baseWhere = `WHERE r."sourceDeviceId" IN (SELECT id FROM "devices" WHERE "organizationId" = '${organizationId}')
                     OR r."targetDeviceId" IN (SELECT id FROM "devices" WHERE "organizationId" = '${organizationId}')`;
      }

      const relationships = await this.prisma.$queryRaw`
        SELECT 
          r.id, r."sourceDeviceId", r."targetDeviceId", r."relationshipType", 
          r.confidence, r.source, r.properties,
          sd.id as sd_id, sd.name as sd_name, sd.type as sd_type, sd.status as sd_status, sd.metadata as sd_metadata,
          td.id as td_id, td.name as td_name, td.type as td_type, td.status as td_status, td.metadata as td_metadata
        FROM "relationships" r
        JOIN "devices" sd ON r."sourceDeviceId" = sd.id
        JOIN "devices" td ON r."targetDeviceId" = td.id
        ${baseWhere}
      ` as Array<{
        id: string;
        sourceDeviceId: string;
        targetDeviceId: string;
        relationshipType: string;
        confidence: number;
        source: string;
        properties: any;
        sd_id: string;
        sd_name: string;
        sd_type: string;
        sd_status: string;
        sd_metadata: any;
        td_id: string;
        td_name: string;
        td_type: string;
        td_status: string;
        td_metadata: any;
      }>;

      const nodes: TopologyNode[] = [];
      const edges: TopologyEdge[] = [];
      const deviceIds = new Set<string>();

      for (const rel of relationships) {
        if (!rel.sd_id || !rel.td_id) continue;

        if (!deviceIds.has(rel.sd_id)) {
          deviceIds.add(rel.sd_id);
          nodes.push({
            id: rel.sd_id,
            label: rel.sd_name,
            type: rel.sd_type,
            status: rel.sd_status,
            ...this.getNodePosition({ id: rel.sd_id, metadata: rel.sd_metadata })
          });
        }

        if (!deviceIds.has(rel.td_id)) {
          deviceIds.add(rel.td_id);
          nodes.push({
            id: rel.td_id,
            label: rel.td_name,
            type: rel.td_type,
            status: rel.td_status,
            ...this.getNodePosition({ id: rel.td_id, metadata: rel.td_metadata })
          });
        }

        edges.push({
          id: rel.id,
          source: rel.sourceDeviceId,
          target: rel.targetDeviceId,
          relationshipType: rel.relationshipType,
          label: this.getEdgeLabel(rel.relationshipType),
          confidence: rel.confidence,
          animated: rel.confidence > 0.9
        });
      }

      return { nodes, edges };
    } catch (error) {
      console.error('Error getting topology graph:', error);
      return { nodes: [], edges: [] };
    }
  }

  private getNodePosition(device: any): { x: number; y: number } {
    const pos = device?.metadata?.position;
    if (pos) return { x: pos.x || 0, y: pos.y || 0 };
    const hash = this.hashString(device?.id || '');
    return { x: (hash % 1000) * 10, y: ((hash >> 16) % 1000) * 10 };
  }

  private getEdgeLabel(type: string): string {
    const labels: Record<string, string> = {
      CONTAINS: 'contains', CONNECTS_TO: 'connected to', VIRTUAL_RUNS_ON: 'runs on',
      CLUSTER_CONTAINS: 'clustered', VLAN_MEMBER: 'VLAN member', FIREWALL_POLICY: 'policy path',
      SERVICE_DEPENDENCY: 'depends on', HA_PAIR: 'HA pair', UPLINK: 'uplink', SPANNING_TREE: 'STP'
    };
    return labels[type] || type;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  async getRelationshipStats() {
    try {
      const stats = await this.prisma.relationship.groupBy({
        by: ['relationshipType'],
        _count: true
      });
      return stats;
    } catch (error) {
      console.error('Error getting relationship stats:', error);
      return [];
    }
  }
}

