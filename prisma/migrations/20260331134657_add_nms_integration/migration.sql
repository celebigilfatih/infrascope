/*
  Warnings:

  - A unique constraint covering the columns `[nms_device_id]` on the table `devices` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AlarmCategory" AS ENUM ('CONFIG_ACCESS', 'SECURITY', 'RISK_ANOMALY', 'OPERATIONAL', 'SOC_CORRELATION');

-- CreateEnum
CREATE TYPE "AlarmSeverity2" AS ENUM ('ALARM_CRITICAL', 'ALARM_HIGH', 'ALARM_MEDIUM', 'ALARM_LOW', 'ALARM_INFO');

-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "last_polled_at" TIMESTAMP(3),
ADD COLUMN     "management_ip" TEXT,
ADD COLUMN     "nms_device_id" INTEGER,
ADD COLUMN     "polling_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "polling_interval" INTEGER DEFAULT 30,
ADD COLUMN     "snmp_community" TEXT,
ADD COLUMN     "snmp_port" INTEGER DEFAULT 161,
ADD COLUMN     "snmp_version" TEXT DEFAULT '2c';

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capacity_metrics" (
    "id" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "resourceName" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capacity_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alarm_definitions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "AlarmCategory" NOT NULL,
    "severity" "AlarmSeverity2" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "detectionLogic" JSONB NOT NULL,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 15,
    "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alarm_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alarm_events" (
    "id" TEXT NOT NULL,
    "alarmId" TEXT NOT NULL,
    "severity" "AlarmSeverity2" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "rawData" JSONB,
    "sourceIp" TEXT,
    "destIp" TEXT,
    "deviceName" TEXT,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedBy" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "notifyChannel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alarm_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alarm_check_logs" (
    "id" TEXT NOT NULL,
    "checkTime" TIMESTAMP(3) NOT NULL,
    "totalAlarms" INTEGER NOT NULL,
    "triggeredCount" INTEGER NOT NULL,
    "errorCount" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alarm_check_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cached_events" (
    "id" TEXT NOT NULL,
    "logtype" TEXT NOT NULL,
    "logId" TEXT NOT NULL,
    "eventTime" TIMESTAMP(3) NOT NULL,
    "srcIp" TEXT,
    "dstIp" TEXT,
    "srcPort" INTEGER,
    "dstPort" INTEGER,
    "proto" INTEGER,
    "user" TEXT,
    "action" TEXT,
    "level" TEXT,
    "subtype" TEXT,
    "vdom" TEXT,
    "devname" TEXT,
    "policyid" INTEGER,
    "service" TEXT,
    "app" TEXT,
    "appcat" TEXT,
    "apprisk" TEXT,
    "srccountry" TEXT,
    "dstcountry" TEXT,
    "msg" TEXT,
    "rawLog" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cached_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_configs" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_configs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_dlq" (
    "id" TEXT NOT NULL,
    "alarmEventId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastAttempt" TIMESTAMP(3),
    "nextRetry" TIMESTAMP(3) NOT NULL,
    "lastError" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_dlq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alarm_whitelist" (
    "id" TEXT NOT NULL,
    "alarmCode" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alarm_whitelist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nms_interfaces" (
    "id" TEXT NOT NULL,
    "nms_device_id" INTEGER NOT NULL,
    "interface_index" INTEGER NOT NULL,
    "interface_name" TEXT NOT NULL,
    "description" TEXT,
    "admin_status" TEXT NOT NULL,
    "oper_status" TEXT NOT NULL,
    "speed" BIGINT NOT NULL DEFAULT 0,
    "in_octets" BIGINT NOT NULL DEFAULT 0,
    "out_octets" BIGINT NOT NULL DEFAULT 0,
    "in_errors" INTEGER NOT NULL DEFAULT 0,
    "out_errors" INTEGER NOT NULL DEFAULT 0,
    "mtu" INTEGER NOT NULL DEFAULT 1500,
    "last_polled_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nms_interfaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nms_health_metrics" (
    "id" TEXT NOT NULL,
    "nms_device_id" INTEGER NOT NULL,
    "uptime_seconds" INTEGER,
    "cpu_usage" DOUBLE PRECISION,
    "memory_usage" DOUBLE PRECISION,
    "temperature" DOUBLE PRECISION,
    "collected_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nms_health_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nms_topology_links" (
    "id" TEXT NOT NULL,
    "nms_device_id" INTEGER NOT NULL,
    "local_interface" TEXT NOT NULL,
    "remote_device_name" TEXT NOT NULL,
    "remote_interface" TEXT NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'lldp',
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nms_topology_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nms_discovery_scans" (
    "id" TEXT NOT NULL,
    "cidr" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "total_hosts" INTEGER NOT NULL DEFAULT 0,
    "processed_hosts" INTEGER NOT NULL DEFAULT 0,
    "found_devices" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nms_discovery_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nms_discovered_devices" (
    "id" TEXT NOT NULL,
    "scan_id" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "hostname" TEXT,
    "vendor" TEXT NOT NULL DEFAULT 'Generic',
    "snmp_community" TEXT,
    "sys_descr" TEXT,
    "snmp_status" TEXT NOT NULL DEFAULT 'none',
    "ssh_status" TEXT NOT NULL DEFAULT 'none',
    "imported" BOOLEAN NOT NULL DEFAULT false,
    "imported_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nms_discovered_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "capacity_metrics_resourceType_resourceId_metricType_timesta_idx" ON "capacity_metrics"("resourceType", "resourceId", "metricType", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "alarm_definitions_code_key" ON "alarm_definitions"("code");

-- CreateIndex
CREATE INDEX "alarm_events_alarmId_idx" ON "alarm_events"("alarmId");

-- CreateIndex
CREATE INDEX "alarm_events_createdAt_idx" ON "alarm_events"("createdAt");

-- CreateIndex
CREATE INDEX "alarm_events_severity_idx" ON "alarm_events"("severity");

-- CreateIndex
CREATE INDEX "alarm_check_logs_checkTime_idx" ON "alarm_check_logs"("checkTime");

-- CreateIndex
CREATE INDEX "alarm_check_logs_status_idx" ON "alarm_check_logs"("status");

-- CreateIndex
CREATE INDEX "cached_events_logtype_eventTime_idx" ON "cached_events"("logtype", "eventTime");

-- CreateIndex
CREATE INDEX "cached_events_eventTime_idx" ON "cached_events"("eventTime");

-- CreateIndex
CREATE INDEX "cached_events_logtype_srcIp_eventTime_idx" ON "cached_events"("logtype", "srcIp", "eventTime");

-- CreateIndex
CREATE INDEX "cached_events_logtype_dstIp_eventTime_idx" ON "cached_events"("logtype", "dstIp", "eventTime");

-- CreateIndex
CREATE UNIQUE INDEX "cached_events_logtype_logId_key" ON "cached_events"("logtype", "logId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_configs_channel_key" ON "notification_configs"("channel");

-- CreateIndex
CREATE UNIQUE INDEX "system_configs_key_key" ON "system_configs"("key");

-- CreateIndex
CREATE INDEX "notification_dlq_status_nextRetry_idx" ON "notification_dlq"("status", "nextRetry");

-- CreateIndex
CREATE INDEX "notification_dlq_alarmEventId_idx" ON "notification_dlq"("alarmEventId");

-- CreateIndex
CREATE INDEX "alarm_whitelist_alarmCode_enabled_idx" ON "alarm_whitelist"("alarmCode", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "alarm_whitelist_alarmCode_field_value_key" ON "alarm_whitelist"("alarmCode", "field", "value");

-- CreateIndex
CREATE INDEX "nms_interfaces_nms_device_id_idx" ON "nms_interfaces"("nms_device_id");

-- CreateIndex
CREATE INDEX "nms_interfaces_admin_status_oper_status_idx" ON "nms_interfaces"("admin_status", "oper_status");

-- CreateIndex
CREATE UNIQUE INDEX "nms_interfaces_nms_device_id_interface_index_key" ON "nms_interfaces"("nms_device_id", "interface_index");

-- CreateIndex
CREATE INDEX "nms_health_metrics_nms_device_id_collected_at_idx" ON "nms_health_metrics"("nms_device_id", "collected_at");

-- CreateIndex
CREATE INDEX "nms_health_metrics_collected_at_idx" ON "nms_health_metrics"("collected_at");

-- CreateIndex
CREATE INDEX "nms_topology_links_nms_device_id_idx" ON "nms_topology_links"("nms_device_id");

-- CreateIndex
CREATE UNIQUE INDEX "nms_topology_links_nms_device_id_local_interface_remote_dev_key" ON "nms_topology_links"("nms_device_id", "local_interface", "remote_device_name");

-- CreateIndex
CREATE INDEX "nms_discovery_scans_status_idx" ON "nms_discovery_scans"("status");

-- CreateIndex
CREATE INDEX "nms_discovery_scans_created_at_idx" ON "nms_discovery_scans"("created_at");

-- CreateIndex
CREATE INDEX "nms_discovered_devices_scan_id_idx" ON "nms_discovered_devices"("scan_id");

-- CreateIndex
CREATE INDEX "nms_discovered_devices_ip_address_idx" ON "nms_discovered_devices"("ip_address");

-- CreateIndex
CREATE UNIQUE INDEX "nms_discovered_devices_scan_id_ip_address_key" ON "nms_discovered_devices"("scan_id", "ip_address");

-- CreateIndex
CREATE UNIQUE INDEX "devices_nms_device_id_key" ON "devices"("nms_device_id");

-- CreateIndex
CREATE INDEX "devices_nms_device_id_idx" ON "devices"("nms_device_id");

-- AddForeignKey
ALTER TABLE "alarm_events" ADD CONSTRAINT "alarm_events_alarmId_fkey" FOREIGN KEY ("alarmId") REFERENCES "alarm_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_dlq" ADD CONSTRAINT "notification_dlq_alarmEventId_fkey" FOREIGN KEY ("alarmEventId") REFERENCES "alarm_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nms_interfaces" ADD CONSTRAINT "nms_interfaces_nms_device_id_fkey" FOREIGN KEY ("nms_device_id") REFERENCES "devices"("nms_device_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nms_health_metrics" ADD CONSTRAINT "nms_health_metrics_nms_device_id_fkey" FOREIGN KEY ("nms_device_id") REFERENCES "devices"("nms_device_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nms_topology_links" ADD CONSTRAINT "nms_topology_links_nms_device_id_fkey" FOREIGN KEY ("nms_device_id") REFERENCES "devices"("nms_device_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nms_discovered_devices" ADD CONSTRAINT "nms_discovered_devices_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "nms_discovery_scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
