ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "building_id" TEXT;
CREATE INDEX IF NOT EXISTS "devices_building_id_idx" ON "devices"("building_id");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devices_building_id_fkey') THEN
    ALTER TABLE "devices" ADD CONSTRAINT "devices_building_id_fkey"
      FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
