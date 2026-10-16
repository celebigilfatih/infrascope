-- A note submission can be retried after its response is lost without duplicating evidence.
-- NULL preserves existing transitions and legacy callers that do not send a request ID.
ALTER TABLE "alarm_lifecycle_transitions" ADD COLUMN "requestId" TEXT;
CREATE UNIQUE INDEX "alarm_lifecycle_transitions_requestId_key"
  ON "alarm_lifecycle_transitions"("requestId");
