-- CreateEnum
CREATE TYPE "RackType" AS ENUM ('RACK_42U', 'RACK_45U', 'CUSTOM');

-- CreateEnum
CREATE TYPE "UnitSide" AS ENUM ('FRONT', 'REAR');

-- CreateEnum
CREATE TYPE "RackStatus" AS ENUM ('OPERATIONAL', 'MAINTENANCE', 'DECOMMISSIONED');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('PHYSICAL_SERVER', 'VIRTUAL_HOST', 'VIRTUAL_MACHINE', 'FIREWALL', 'SWITCH', 'ROUTER', 'COMPUTER', 'LAPTOP', 'STORAGE', 'PDU', 'PATCH_PANEL', 'OTHER');

-- CreateEnum
CREATE TYPE "DeviceCriticality" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "InterfaceType" AS ENUM ('ETHERNET', 'FIBER', 'WIRELESS', 'SERIAL', 'MANAGEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "NetworkStatus" AS ENUM ('UP', 'DOWN', 'DORMANT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PortType" AS ENUM ('ACCESS', 'TRUNK', 'HYBRID', 'MANAGEMENT', 'UPLINK');

-- CreateEnum
CREATE TYPE "Duplex" AS ENUM ('FULL', 'HALF', 'AUTO');

-- CreateEnum
CREATE TYPE "ConnectionType" AS ENUM ('ETHERNET', 'FIBER', 'SERIAL', 'MANAGEMENT', 'WAN');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('WEB_SERVER', 'DATABASE', 'DNS', 'DHCP', 'LDAP', 'MONITORING', 'BACKUP', 'FILE_SERVER', 'MAIL_SERVER', 'PROXY', 'VPN', 'LOAD_BALANCER', 'STORAGE', 'CONTAINER_ORCHESTRATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('RUNNING', 'STOPPED', 'DEGRADED', 'FAILED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Protocol" AS ENUM ('TCP', 'UDP', 'BOTH');

-- CreateEnum
CREATE TYPE "DependencyType" AS ENUM ('DEPENDS_ON', 'REQUIRES', 'PROVIDES', 'SUPPORTS', 'COMMUNICATES_WITH', 'DEPLOYED_ON', 'HOSTED_ON', 'CONNECTED_TO');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "postalCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "floors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "floorNumber" INTEGER NOT NULL,
    "buildingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "floorId" TEXT NOT NULL,
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "racks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "RackType" NOT NULL DEFAULT 'RACK_42U',
    "maxUnits" INTEGER NOT NULL DEFAULT 42,
    "roomId" TEXT NOT NULL,
    "position" TEXT,
    "operationalStatus" "RackStatus" NOT NULL DEFAULT 'OPERATIONAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "racks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rack_units" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "rackId" TEXT NOT NULL,
    "deviceId" TEXT,
    "side" "UnitSide" NOT NULL DEFAULT 'FRONT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rack_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DeviceType" NOT NULL,
    "vendor" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "assetTag" TEXT,
    "firmwareVersion" TEXT,
    "operatingSystem" TEXT,
    "criticality" "DeviceCriticality" NOT NULL DEFAULT 'MEDIUM',
    "status" "DeviceStatus" NOT NULL DEFAULT 'UNKNOWN',
    "rackId" TEXT,
    "rackUnitPosition" INTEGER,
    "parentDeviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_interfaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "InterfaceType" NOT NULL DEFAULT 'ETHERNET',
    "ipv4" TEXT,
    "ipv6" TEXT,
    "macAddress" TEXT,
    "deviceId" TEXT NOT NULL,
    "status" "NetworkStatus" NOT NULL DEFAULT 'UP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "network_interfaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "switch_ports" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "portType" "PortType" NOT NULL DEFAULT 'ACCESS',
    "vlanId" INTEGER,
    "nativeVlan" INTEGER,
    "allowedVlans" TEXT,
    "status" "NetworkStatus" NOT NULL DEFAULT 'DOWN',
    "speed" TEXT,
    "duplex" "Duplex",
    "switchDeviceId" TEXT NOT NULL,
    "connectedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "switch_ports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connections" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "type" "ConnectionType" NOT NULL DEFAULT 'ETHERNET',
    "sourcePortId" TEXT NOT NULL,
    "sourceInterfaceId" TEXT,
    "destPortId" TEXT,
    "destInterfaceId" TEXT,
    "status" "NetworkStatus" NOT NULL DEFAULT 'DOWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendor" TEXT,
    "version" TEXT,
    "installPath" TEXT,
    "licenseKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ServiceType" NOT NULL,
    "displayName" TEXT,
    "description" TEXT,
    "status" "ServiceStatus" NOT NULL DEFAULT 'UNKNOWN',
    "port" INTEGER NOT NULL,
    "protocol" "Protocol" NOT NULL DEFAULT 'TCP',
    "deviceId" TEXT NOT NULL,
    "applicationId" TEXT,
    "criticality" "DeviceCriticality" NOT NULL DEFAULT 'MEDIUM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dependencies" (
    "id" TEXT NOT NULL,
    "sourceServiceId" TEXT NOT NULL,
    "targetDeviceId" TEXT NOT NULL,
    "type" "DependencyType" NOT NULL DEFAULT 'DEPENDS_ON',
    "criticality" "DeviceCriticality" NOT NULL DEFAULT 'MEDIUM',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changes" JSONB,
    "userId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_health_snapshots" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "status" "DeviceStatus" NOT NULL,
    "cpuUsage" DOUBLE PRECISION,
    "memoryUsage" DOUBLE PRECISION,
    "diskUsage" DOUBLE PRECISION,
    "networkLatency" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_health_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_name_key" ON "organizations"("name");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_code_key" ON "organizations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "buildings_organizationId_name_key" ON "buildings"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "floors_buildingId_floorNumber_key" ON "floors"("buildingId", "floorNumber");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_floorId_name_key" ON "rooms"("floorId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "racks_roomId_name_key" ON "racks"("roomId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "rack_units_rackId_position_side_key" ON "rack_units"("rackId", "position", "side");

-- CreateIndex
CREATE INDEX "devices_rackId_idx" ON "devices"("rackId");

-- CreateIndex
CREATE INDEX "devices_parentDeviceId_idx" ON "devices"("parentDeviceId");

-- CreateIndex
CREATE INDEX "network_interfaces_deviceId_idx" ON "network_interfaces"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "network_interfaces_deviceId_name_key" ON "network_interfaces"("deviceId", "name");

-- CreateIndex
CREATE INDEX "switch_ports_switchDeviceId_idx" ON "switch_ports"("switchDeviceId");

-- CreateIndex
CREATE UNIQUE INDEX "switch_ports_switchDeviceId_name_key" ON "switch_ports"("switchDeviceId", "name");

-- CreateIndex
CREATE INDEX "connections_sourcePortId_idx" ON "connections"("sourcePortId");

-- CreateIndex
CREATE INDEX "connections_sourceInterfaceId_idx" ON "connections"("sourceInterfaceId");

-- CreateIndex
CREATE UNIQUE INDEX "applications_name_version_key" ON "applications"("name", "version");

-- CreateIndex
CREATE INDEX "services_deviceId_idx" ON "services"("deviceId");

-- CreateIndex
CREATE INDEX "services_applicationId_idx" ON "services"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "services_deviceId_port_protocol_key" ON "services"("deviceId", "port", "protocol");

-- CreateIndex
CREATE INDEX "dependencies_sourceServiceId_idx" ON "dependencies"("sourceServiceId");

-- CreateIndex
CREATE INDEX "dependencies_targetDeviceId_idx" ON "dependencies"("targetDeviceId");

-- CreateIndex
CREATE UNIQUE INDEX "dependencies_sourceServiceId_targetDeviceId_type_key" ON "dependencies"("sourceServiceId", "targetDeviceId", "type");

-- CreateIndex
CREATE INDEX "audit_logs_entityId_idx" ON "audit_logs"("entityId");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");

-- CreateIndex
CREATE INDEX "device_health_snapshots_deviceId_timestamp_idx" ON "device_health_snapshots"("deviceId", "timestamp");

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floors" ADD CONSTRAINT "floors_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "floors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "racks" ADD CONSTRAINT "racks_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rack_units" ADD CONSTRAINT "rack_units_rackId_fkey" FOREIGN KEY ("rackId") REFERENCES "racks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rack_units" ADD CONSTRAINT "rack_units_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_rackId_fkey" FOREIGN KEY ("rackId") REFERENCES "racks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_parentDeviceId_fkey" FOREIGN KEY ("parentDeviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_interfaces" ADD CONSTRAINT "network_interfaces_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "switch_ports" ADD CONSTRAINT "switchPorts" FOREIGN KEY ("switchDeviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "switch_ports" ADD CONSTRAINT "switch_ports_connectedToId_fkey" FOREIGN KEY ("connectedToId") REFERENCES "network_interfaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_sourcePortId_fkey" FOREIGN KEY ("sourcePortId") REFERENCES "switch_ports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_sourceInterfaceId_fkey" FOREIGN KEY ("sourceInterfaceId") REFERENCES "network_interfaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_sourceServiceId_fkey" FOREIGN KEY ("sourceServiceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_targetDeviceId_fkey" FOREIGN KEY ("targetDeviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
