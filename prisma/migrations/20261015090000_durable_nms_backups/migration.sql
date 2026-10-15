ALTER TABLE "devices" ADD COLUMN "backup_platform" TEXT;
ALTER TABLE "nms_backups" ADD COLUMN "device_name" TEXT NOT NULL DEFAULT 'Archived device',
  ADD COLUMN "management_ip" TEXT, ADD COLUMN "platform" TEXT, ADD COLUMN "job_id" TEXT;
UPDATE "nms_backups" b SET "device_name" = d."name", "management_ip" = d."management_ip"
  FROM "devices" d WHERE b."nms_device_id" = d."nms_device_id";
ALTER TABLE "nms_backups" DROP CONSTRAINT "nms_backups_nms_device_id_fkey";
ALTER TABLE "nms_backups" ALTER COLUMN "nms_device_id" DROP NOT NULL;
ALTER TABLE "nms_backups" ADD CONSTRAINT "nms_backups_nms_device_id_fkey"
  FOREIGN KEY ("nms_device_id") REFERENCES "devices"("nms_device_id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "nms_backups_job_id_key" ON "nms_backups"("job_id");

CREATE TABLE "nms_backup_jobs" (
  "id" TEXT PRIMARY KEY, "inventory_device_id" TEXT NOT NULL, "nms_device_id" INTEGER NOT NULL, "device_name" TEXT NOT NULL,
  "backup_type" TEXT NOT NULL, "description" TEXT, "requested_by" TEXT,
  "idempotency_key" TEXT NOT NULL, "active_device_key" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'queued', "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 3, "run_after" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lease_token" TEXT, "lease_expires_at" TIMESTAMP(3), "started_at" TIMESTAMP(3), "finished_at" TIMESTAMP(3),
  "backup_id" TEXT, "error_code" TEXT, "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "nms_backup_jobs_status_check" CHECK ("status" IN ('queued','running','retrying','succeeded','failed')),
  CONSTRAINT "nms_backup_jobs_type_check" CHECK ("backup_type" IN ('Running Config','Startup Config')),
  CONSTRAINT "nms_backup_jobs_attempts_check" CHECK ("attempts" >= 0 AND "max_attempts" BETWEEN 1 AND 5)
);
CREATE UNIQUE INDEX "nms_backup_jobs_idempotency_key_key" ON "nms_backup_jobs"("idempotency_key");
CREATE UNIQUE INDEX "nms_backup_jobs_active_device_key_key" ON "nms_backup_jobs"("active_device_key");
CREATE INDEX "nms_backup_jobs_status_run_after_idx" ON "nms_backup_jobs"("status","run_after");
CREATE INDEX "nms_backup_jobs_nms_device_id_created_at_idx" ON "nms_backup_jobs"("nms_device_id","created_at");

CREATE TABLE "nms_backup_policies" (
  "id" TEXT PRIMARY KEY, "inventory_device_id" TEXT NOT NULL, "nms_device_id" INTEGER NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT false,
  "backup_type" TEXT NOT NULL DEFAULT 'Running Config', "interval_hours" INTEGER NOT NULL DEFAULT 24,
  "retention_days" INTEGER NOT NULL DEFAULT 90, "keep_last" INTEGER NOT NULL DEFAULT 10,
  "stale_after_hours" INTEGER NOT NULL DEFAULT 48, "next_run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "nms_backup_policies_type_check" CHECK ("backup_type" IN ('Running Config','Startup Config')),
  CONSTRAINT "nms_backup_policies_limits_check" CHECK (
    "interval_hours" BETWEEN 1 AND 8760 AND "retention_days" BETWEEN 1 AND 3650
    AND "keep_last" BETWEEN 1 AND 10000 AND "stale_after_hours" BETWEEN "interval_hours" AND 17520)
);
CREATE UNIQUE INDEX "nms_backup_policies_nms_device_id_key" ON "nms_backup_policies"("nms_device_id");
CREATE INDEX "nms_backup_policies_enabled_next_run_at_idx" ON "nms_backup_policies"("enabled","next_run_at");
