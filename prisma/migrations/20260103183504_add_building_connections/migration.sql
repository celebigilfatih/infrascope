-- CreateEnum
CREATE TYPE "BuildingConnectionType" AS ENUM ('FIBER_SINGLE_MODE', 'FIBER_MULTI_MODE', 'CAT5E', 'CAT6', 'CAT6A', 'CAT7', 'CAT8', 'WIRELESS', 'MICROWAVE', 'LEASED_LINE', 'MPLS', 'VPN', 'OTHER');

-- CreateEnum
CREATE TYPE "RecordingMethod" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "BuildingConnectionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'PLANNED', 'DECOMMISSIONED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DeviceType" ADD VALUE 'PRINTER';
ALTER TYPE "DeviceType" ADD VALUE 'CAMERA';

-- CreateTable
CREATE TABLE "building_connections" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "connectionType" "BuildingConnectionType" NOT NULL,
    "recordingMethod" "RecordingMethod" NOT NULL DEFAULT 'MANUAL',
    "sourceBuildingId" TEXT NOT NULL,
    "destBuildingId" TEXT NOT NULL,
    "status" "BuildingConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "bandwidth" TEXT,
    "distance" DOUBLE PRECISION,
    "fiberType" TEXT,
    "cableSpecs" TEXT,
    "provider" TEXT,
    "circuitId" TEXT,
    "installDate" TIMESTAMP(3),
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "building_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "building_connections_sourceBuildingId_idx" ON "building_connections"("sourceBuildingId");

-- CreateIndex
CREATE INDEX "building_connections_destBuildingId_idx" ON "building_connections"("destBuildingId");

-- CreateIndex
CREATE INDEX "building_connections_connectionType_idx" ON "building_connections"("connectionType");

-- CreateIndex
CREATE INDEX "building_connections_status_idx" ON "building_connections"("status");

-- CreateIndex
CREATE UNIQUE INDEX "building_connections_sourceBuildingId_destBuildingId_connec_key" ON "building_connections"("sourceBuildingId", "destBuildingId", "connectionType");

-- AddForeignKey
ALTER TABLE "building_connections" ADD CONSTRAINT "building_connections_sourceBuildingId_fkey" FOREIGN KEY ("sourceBuildingId") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_connections" ADD CONSTRAINT "building_connections_destBuildingId_fkey" FOREIGN KEY ("destBuildingId") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
