-- Add interface monitoring state used by NMS device details and port alarms.
-- IF NOT EXISTS keeps upgrades safe for databases previously synchronized with db push.
ALTER TABLE "nms_interfaces"
ADD COLUMN IF NOT EXISTS "down_since" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "oper_up_since" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "monitored" BOOLEAN NOT NULL DEFAULT false;
