ALTER TABLE "device_links" ADD COLUMN "buildingConnectionId" TEXT;
CREATE UNIQUE INDEX "device_links_buildingConnectionId_key" ON "device_links"("buildingConnectionId");
ALTER TABLE "device_links" ADD CONSTRAINT "device_links_buildingConnectionId_fkey"
  FOREIGN KEY ("buildingConnectionId") REFERENCES "building_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
