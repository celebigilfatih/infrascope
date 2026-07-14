ALTER TABLE "cached_events" ADD COLUMN "devid" TEXT;

UPDATE "cached_events"
SET
  "devid" = NULLIF(UPPER(BTRIM(COALESCE("rawLog"->>'devid', ''))), ''),
  "vdom" = LOWER(BTRIM(COALESCE(
    NULLIF("vdom", ''),
    NULLIF("rawLog"->>'vdom', ''),
    NULLIF("rawLog"->>'vd', ''),
    'root'
  )));

CREATE INDEX "cached_events_devid_vdom_eventTime_idx"
  ON "cached_events"("devid", "vdom", "eventTime");
