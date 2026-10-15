-- Reconcile schema additions previously present only in long-lived development databases.
CREATE TABLE IF NOT EXISTS "alarm_cooldowns" (
  "id" TEXT NOT NULL PRIMARY KEY, "alarmId" TEXT NOT NULL, "deviceName" TEXT NOT NULL,
  "cooldownUntil" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "alarm_cooldowns_alarmId_deviceName_key" ON "alarm_cooldowns"("alarmId","deviceName");
CREATE INDEX IF NOT EXISTS "alarm_cooldowns_cooldownUntil_idx" ON "alarm_cooldowns"("cooldownUntil");
CREATE INDEX IF NOT EXISTS "alarm_events_createdAt_acknowledged_idx" ON "alarm_events"("createdAt","acknowledged");
ALTER TABLE "firewall_connectors" ALTER COLUMN "updatedAt" DROP DEFAULT;
