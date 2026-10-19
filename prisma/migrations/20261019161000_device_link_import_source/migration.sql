ALTER TABLE "device_links" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "device_links" ADD COLUMN "sourceRef" TEXT;
CREATE UNIQUE INDEX "device_links_source_sourceRef_key" ON "device_links"("source", "sourceRef");
