-- Preserve floor placement without inventing a room or rack.
ALTER TABLE "devices" ADD COLUMN "floor_id" TEXT;
ALTER TABLE "devices" ADD CONSTRAINT "devices_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "floors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "devices_floor_id_idx" ON "devices"("floor_id");
-- Drawings do not establish cable medium or operational link state.
ALTER TYPE "ConnectionType" ADD VALUE IF NOT EXISTS 'UNKNOWN';
ALTER TYPE "BuildingConnectionStatus" ADD VALUE IF NOT EXISTS 'UNKNOWN';
