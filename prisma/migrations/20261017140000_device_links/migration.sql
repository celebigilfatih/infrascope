CREATE TABLE "device_links" (
  "id" TEXT NOT NULL,
  "sourceDeviceId" TEXT NOT NULL,
  "targetDeviceId" TEXT NOT NULL,
  "type" "ConnectionType" NOT NULL DEFAULT 'ETHERNET',
  "bandwidth" TEXT NOT NULL,
  "status" "NetworkStatus" NOT NULL DEFAULT 'UNKNOWN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "device_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "device_links_sourceDeviceId_fkey" FOREIGN KEY ("sourceDeviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "device_links_targetDeviceId_fkey" FOREIGN KEY ("targetDeviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "device_links_distinct_devices" CHECK ("sourceDeviceId" <> "targetDeviceId")
);
CREATE INDEX "device_links_sourceDeviceId_idx" ON "device_links"("sourceDeviceId");
CREATE INDEX "device_links_targetDeviceId_idx" ON "device_links"("targetDeviceId");
CREATE TABLE "device_link_endpoints" (
  "id" TEXT NOT NULL,
  "linkId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "portId" TEXT NOT NULL,
  "portKey" TEXT NOT NULL,
  "portName" TEXT NOT NULL,
  "side" INTEGER NOT NULL,
  CONSTRAINT "device_link_endpoints_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "device_link_endpoints_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "device_links"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "device_link_endpoints_side_check" CHECK ("side" IN (0, 1))
);
CREATE UNIQUE INDEX "device_link_endpoints_deviceId_portKey_key" ON "device_link_endpoints"("deviceId", "portKey");
CREATE UNIQUE INDEX "device_link_endpoints_linkId_side_key" ON "device_link_endpoints"("linkId", "side");
