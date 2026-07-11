-- Alarm incident lifecycle, immutable transitions, notification attempts,
-- and compressed occurrence archive support.

CREATE TYPE "AlarmIncidentStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'CLOSED');
CREATE TYPE "AlarmArchiveState" AS ENUM ('HOT', 'ARCHIVED');
CREATE TYPE "AlarmTransitionType" AS ENUM (
  'CREATED', 'MIGRATED', 'ACKNOWLEDGED', 'UNACKNOWLEDGED', 'RESOLVED',
  'REOPENED', 'CLOSED', 'ARCHIVED', 'RESTORED', 'ASSIGNED',
  'LEGAL_HOLD_SET', 'LEGAL_HOLD_RELEASED'
);
CREATE TYPE "NotificationAttemptStatus" AS ENUM (
  'PENDING', 'SENT', 'FAILED_RETRYABLE', 'FAILED_PERMANENT',
  'SKIPPED_DISABLED', 'SKIPPED_RATE_LIMITED', 'SKIPPED_COOLDOWN'
);

CREATE TABLE "alarm_incidents" (
  "id" TEXT NOT NULL,
  "alarmId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "activeFingerprint" TEXT,
  "status" "AlarmIncidentStatus" NOT NULL DEFAULT 'OPEN',
  "archiveState" "AlarmArchiveState" NOT NULL DEFAULT 'HOT',
  "severity" "AlarmSeverity2" NOT NULL,
  "category" "AlarmCategory" NOT NULL,
  "source" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "conditionKey" TEXT,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  "acknowledgedAt" TIMESTAMP(3),
  "acknowledgedById" TEXT,
  "acknowledgedBy" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" TEXT,
  "resolvedBy" TEXT,
  "resolutionReason" TEXT,
  "closedAt" TIMESTAMP(3),
  "closedById" TEXT,
  "closedBy" TEXT,
  "closeReason" TEXT,
  "assignedToId" TEXT,
  "assignedTo" TEXT,
  "assignedAt" TIMESTAMP(3),
  "reopenCount" INTEGER NOT NULL DEFAULT 0,
  "archivedAt" TIMESTAMP(3),
  "archiveReason" TEXT,
  "retentionClass" TEXT NOT NULL DEFAULT 'STANDARD',
  "legalHold" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "alarm_incidents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alarm_lifecycle_transitions" (
  "id" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "type" "AlarmTransitionType" NOT NULL,
  "fromStatus" "AlarmIncidentStatus",
  "toStatus" "AlarmIncidentStatus",
  "actorType" TEXT NOT NULL DEFAULT 'SYSTEM',
  "actorId" TEXT,
  "actorName" TEXT,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alarm_lifecycle_transitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_attempts" (
  "id" TEXT NOT NULL,
  "incidentId" TEXT,
  "alarmEventId" TEXT,
  "channel" TEXT NOT NULL,
  "status" "NotificationAttemptStatus" NOT NULL,
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "error" TEXT,
  "providerId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alarm_archive_payloads" (
  "id" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "alarmEventId" TEXT NOT NULL,
  "encoding" TEXT NOT NULL DEFAULT 'gzip-json',
  "checksum" TEXT NOT NULL,
  "payload" BYTEA NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alarm_archive_payloads_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "alarm_events"
  ADD COLUMN "incidentId" TEXT,
  ADD COLUMN "fingerprint" TEXT,
  ADD COLUMN "sourceEventId" TEXT,
  ADD COLUMN "sourceOccurredAt" TIMESTAMP(3),
  ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "alarm_incidents_activeFingerprint_key" ON "alarm_incidents"("activeFingerprint");
CREATE INDEX "alarm_incidents_status_archiveState_lastSeenAt_idx" ON "alarm_incidents"("status", "archiveState", "lastSeenAt");
CREATE INDEX "alarm_incidents_alarmId_fingerprint_idx" ON "alarm_incidents"("alarmId", "fingerprint");
CREATE INDEX "alarm_incidents_severity_status_idx" ON "alarm_incidents"("severity", "status");
CREATE INDEX "alarm_incidents_source_status_idx" ON "alarm_incidents"("source", "status");
CREATE INDEX "alarm_incidents_assignedToId_status_idx" ON "alarm_incidents"("assignedToId", "status");
CREATE INDEX "alarm_incidents_archivedAt_idx" ON "alarm_incidents"("archivedAt");
CREATE INDEX "alarm_lifecycle_transitions_incidentId_createdAt_idx" ON "alarm_lifecycle_transitions"("incidentId", "createdAt");
CREATE INDEX "alarm_lifecycle_transitions_type_createdAt_idx" ON "alarm_lifecycle_transitions"("type", "createdAt");
CREATE INDEX "notification_attempts_incidentId_createdAt_idx" ON "notification_attempts"("incidentId", "createdAt");
CREATE INDEX "notification_attempts_alarmEventId_createdAt_idx" ON "notification_attempts"("alarmEventId", "createdAt");
CREATE INDEX "notification_attempts_status_createdAt_idx" ON "notification_attempts"("status", "createdAt");
CREATE UNIQUE INDEX "alarm_archive_payloads_alarmEventId_key" ON "alarm_archive_payloads"("alarmEventId");
CREATE INDEX "alarm_archive_payloads_incidentId_occurredAt_idx" ON "alarm_archive_payloads"("incidentId", "occurredAt");
CREATE INDEX "alarm_archive_payloads_archivedAt_idx" ON "alarm_archive_payloads"("archivedAt");
CREATE INDEX "alarm_events_incidentId_createdAt_idx" ON "alarm_events"("incidentId", "createdAt");
CREATE INDEX "alarm_events_fingerprint_createdAt_idx" ON "alarm_events"("fingerprint", "createdAt");
CREATE INDEX "alarm_events_archivedAt_idx" ON "alarm_events"("archivedAt");
CREATE UNIQUE INDEX "alarm_events_alarmId_sourceEventId_key" ON "alarm_events"("alarmId", "sourceEventId");

ALTER TABLE "alarm_incidents" ADD CONSTRAINT "alarm_incidents_alarmId_fkey"
  FOREIGN KEY ("alarmId") REFERENCES "alarm_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "alarm_lifecycle_transitions" ADD CONSTRAINT "alarm_lifecycle_transitions_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "alarm_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_attempts" ADD CONSTRAINT "notification_attempts_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "alarm_incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notification_attempts" ADD CONSTRAINT "notification_attempts_alarmEventId_fkey"
  FOREIGN KEY ("alarmEventId") REFERENCES "alarm_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "alarm_archive_payloads" ADD CONSTRAINT "alarm_archive_payloads_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "alarm_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alarm_events" ADD CONSTRAINT "alarm_events_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "alarm_incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve existing alarm history by backfilling one incident per legacy event.
INSERT INTO "alarm_incidents" (
  "id", "alarmId", "fingerprint", "activeFingerprint", "status", "archiveState",
  "severity", "category", "source", "title", "message", "entityType", "entityId",
  "conditionKey", "firstSeenAt", "lastSeenAt", "occurrenceCount",
  "acknowledgedAt", "acknowledgedBy", "createdAt", "updatedAt"
)
SELECT
  'inc_' || md5(e."id"), e."alarmId", 'legacy:' || e."id",
  CASE WHEN e."acknowledged" THEN NULL ELSE 'legacy:' || e."id" END,
  CASE WHEN e."acknowledged" THEN 'ACKNOWLEDGED'::"AlarmIncidentStatus" ELSE 'OPEN'::"AlarmIncidentStatus" END,
  'HOT'::"AlarmArchiveState", e."severity", d."category", COALESCE(d."source", 'unknown'),
  e."title", e."message", 'legacy', COALESCE(e."deviceName", e."sourceIp", e."id"),
  e."id", e."createdAt", e."createdAt", 1, e."acknowledgedAt", e."acknowledgedBy",
  e."createdAt", e."createdAt"
FROM "alarm_events" e
JOIN "alarm_definitions" d ON d."id" = e."alarmId";

UPDATE "alarm_events"
SET "incidentId" = 'inc_' || md5("id"), "fingerprint" = 'legacy:' || "id";

INSERT INTO "alarm_lifecycle_transitions" (
  "id", "incidentId", "type", "fromStatus", "toStatus", "actorType", "actorName", "reason", "createdAt"
)
SELECT
  'tr_' || md5(e."id"), 'inc_' || md5(e."id"), 'MIGRATED'::"AlarmTransitionType",
  NULL,
  CASE WHEN e."acknowledged" THEN 'ACKNOWLEDGED'::"AlarmIncidentStatus" ELSE 'OPEN'::"AlarmIncidentStatus" END,
  'SYSTEM', 'migration', 'Legacy AlarmEvent migrated to AlarmIncident lifecycle', e."createdAt"
FROM "alarm_events" e;
