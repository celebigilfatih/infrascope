-- CreateEnum
CREATE TYPE "SubnetType" AS ENUM ('MANAGEMENT', 'PRODUCTION', 'DEVELOPMENT', 'DMZ', 'GUEST', 'RESERVED');

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('CONTAINS', 'CONNECTS_TO', 'VIRTUAL_RUNS_ON', 'CLUSTER_CONTAINS', 'VLAN_MEMBER', 'FIREWALL_POLICY', 'SERVICE_DEPENDENCY', 'HA_PAIR', 'UPLINK', 'SPANNING_TREE');

-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('ZABBIX', 'VMWARE_VCENTER', 'FORTIGATE', 'SNMP', 'AWS', 'AZURE', 'API');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'AVERAGE', 'HIGH', 'DISASTER');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('DISCOVERY', 'SYNC', 'BACKUP', 'REPORT', 'CLEANUP', 'CUSTOM');

-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "fortiDeviceId" TEXT,
ADD COLUMN     "healthScore" INTEGER,
ADD COLUMN     "supportDate" TIMESTAMP(3),
ADD COLUMN     "tags" TEXT[],
ADD COLUMN     "vmHostId" TEXT,
ADD COLUMN     "vmwareClusterId" TEXT,
ADD COLUMN     "vmwareMoref" TEXT,
ADD COLUMN     "zabbixHostId" TEXT;

-- AlterTable
ALTER TABLE "network_interfaces" ADD COLUMN     "vlanId" TEXT;

-- CreateTable
CREATE TABLE "vlans" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vlanId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "subnet" TEXT,
    "gateway" TEXT,
    "vrf" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vlans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subnets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cidr" TEXT NOT NULL,
    "name" TEXT,
    "type" "SubnetType" NOT NULL DEFAULT 'MANAGEMENT',
    "description" TEXT,
    "vlanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subnets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "firewall_policies" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "policyId" INTEGER NOT NULL,
    "name" TEXT,
    "action" TEXT NOT NULL,
    "srcInterface" TEXT,
    "dstInterface" TEXT,
    "srcAddresses" JSONB,
    "dstAddresses" JSONB,
    "services" JSONB,
    "schedule" TEXT,
    "hitCount" BIGINT NOT NULL DEFAULT 0,
    "lastHit" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "firewall_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "firewall_addresses" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "associatedInterface" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "firewall_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vmware_clusters" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vcenterId" TEXT NOT NULL,
    "datacenterName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cpuTotal" BIGINT,
    "cpuUsed" BIGINT,
    "memoryTotal" BIGINT,
    "memoryUsed" BIGINT,
    "hostCount" INTEGER NOT NULL DEFAULT 0,
    "vmCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vmware_clusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vmware_datastores" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vcenterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "capacity" BIGINT,
    "freeSpace" BIGINT,
    "datacenter" TEXT,
    "clusterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vmware_datastores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vm_snapshots" (
    "id" TEXT NOT NULL,
    "vmId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "size" BIGINT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "vm_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationships" (
    "id" TEXT NOT NULL,
    "sourceDeviceId" TEXT NOT NULL,
    "targetDeviceId" TEXT NOT NULL,
    "relationshipType" "RelationshipType" NOT NULL,
    "properties" JSONB,
    "source" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_configs" (
    "id" TEXT NOT NULL,
    "type" "IntegrationType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "syncInterval" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_sync_logs" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "itemsProcessed" INTEGER NOT NULL DEFAULT 0,
    "itemsCreated" INTEGER NOT NULL DEFAULT 0,
    "itemsUpdated" INTEGER NOT NULL DEFAULT 0,
    "itemsDeleted" INTEGER NOT NULL DEFAULT 0,
    "errorDetails" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "integration_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zabbix_triggers" (
    "id" TEXT NOT NULL,
    "triggerId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "expression" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "lastChange" TIMESTAMP(3),
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zabbix_triggers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_events" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "deviceId" TEXT,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedBy" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_tasks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "TaskType" NOT NULL,
    "cronExpression" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" TEXT,
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_logs" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "output" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "task_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vlans_organizationId_vlanId_key" ON "vlans"("organizationId", "vlanId");

-- CreateIndex
CREATE UNIQUE INDEX "subnets_organizationId_cidr_key" ON "subnets"("organizationId", "cidr");

-- CreateIndex
CREATE INDEX "firewall_policies_deviceId_idx" ON "firewall_policies"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "firewall_policies_deviceId_policyId_key" ON "firewall_policies"("deviceId", "policyId");

-- CreateIndex
CREATE INDEX "firewall_addresses_deviceId_idx" ON "firewall_addresses"("deviceId");

-- CreateIndex
CREATE INDEX "vmware_clusters_organizationId_idx" ON "vmware_clusters"("organizationId");

-- CreateIndex
CREATE INDEX "vmware_datastores_organizationId_idx" ON "vmware_datastores"("organizationId");

-- CreateIndex
CREATE INDEX "vmware_datastores_clusterId_idx" ON "vmware_datastores"("clusterId");

-- CreateIndex
CREATE INDEX "vm_snapshots_vmId_idx" ON "vm_snapshots"("vmId");

-- CreateIndex
CREATE INDEX "relationships_sourceDeviceId_idx" ON "relationships"("sourceDeviceId");

-- CreateIndex
CREATE INDEX "relationships_targetDeviceId_idx" ON "relationships"("targetDeviceId");

-- CreateIndex
CREATE INDEX "relationships_relationshipType_idx" ON "relationships"("relationshipType");

-- CreateIndex
CREATE UNIQUE INDEX "integration_configs_type_name_key" ON "integration_configs"("type", "name");

-- CreateIndex
CREATE INDEX "integration_sync_logs_configId_idx" ON "integration_sync_logs"("configId");

-- CreateIndex
CREATE INDEX "integration_sync_logs_startedAt_idx" ON "integration_sync_logs"("startedAt");

-- CreateIndex
CREATE INDEX "zabbix_triggers_triggerId_idx" ON "zabbix_triggers"("triggerId");

-- CreateIndex
CREATE INDEX "zabbix_triggers_hostId_idx" ON "zabbix_triggers"("hostId");

-- CreateIndex
CREATE INDEX "zabbix_triggers_status_idx" ON "zabbix_triggers"("status");

-- CreateIndex
CREATE INDEX "alert_events_source_idx" ON "alert_events"("source");

-- CreateIndex
CREATE INDEX "alert_events_severity_idx" ON "alert_events"("severity");

-- CreateIndex
CREATE INDEX "alert_events_deviceId_idx" ON "alert_events"("deviceId");

-- CreateIndex
CREATE INDEX "alert_events_createdAt_idx" ON "alert_events"("createdAt");

-- CreateIndex
CREATE INDEX "task_logs_taskId_idx" ON "task_logs"("taskId");

-- CreateIndex
CREATE INDEX "task_logs_startedAt_idx" ON "task_logs"("startedAt");

-- CreateIndex
CREATE INDEX "devices_zabbixHostId_idx" ON "devices"("zabbixHostId");

-- CreateIndex
CREATE INDEX "devices_vmwareMoref_idx" ON "devices"("vmwareMoref");

-- CreateIndex
CREATE INDEX "devices_vmwareClusterId_idx" ON "devices"("vmwareClusterId");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_vmwareClusterId_fkey" FOREIGN KEY ("vmwareClusterId") REFERENCES "vmware_clusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_interfaces" ADD CONSTRAINT "network_interfaces_vlanId_fkey" FOREIGN KEY ("vlanId") REFERENCES "vlans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vlans" ADD CONSTRAINT "vlans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subnets" ADD CONSTRAINT "subnets_vlanId_fkey" FOREIGN KEY ("vlanId") REFERENCES "vlans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subnets" ADD CONSTRAINT "subnets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firewall_policies" ADD CONSTRAINT "firewall_policies_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firewall_addresses" ADD CONSTRAINT "firewall_addresses_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vmware_clusters" ADD CONSTRAINT "vmware_clusters_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vmware_datastores" ADD CONSTRAINT "vmware_datastores_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vmware_datastores" ADD CONSTRAINT "vmware_datastores_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "vmware_clusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_sourceDeviceId_fkey" FOREIGN KEY ("sourceDeviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_targetDeviceId_fkey" FOREIGN KEY ("targetDeviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_sync_logs" ADD CONSTRAINT "integration_sync_logs_configId_fkey" FOREIGN KEY ("configId") REFERENCES "integration_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "scheduled_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
