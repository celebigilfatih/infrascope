BEGIN;

ALTER TABLE "devices" ADD COLUMN "vmwareSourceScope" TEXT, ADD COLUMN "zabbixSourceScope" TEXT;
ALTER TABLE "vmware_clusters" ADD COLUMN "sourceScope" TEXT;
ALTER TABLE "vmware_datastores" ADD COLUMN "sourceScope" TEXT;
ALTER TABLE "zabbix_triggers" ADD COLUMN "sourceScope" TEXT;
ALTER TABLE "capacity_metrics" ADD COLUMN "sourceScope" TEXT;

-- Temporary, non-secret scope computation. Keep equivalent to inventory-source-scope.ts.
CREATE FUNCTION pg_temp.inventory_source_scope(kind TEXT, config_id TEXT, endpoint TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE target TEXT; parts TEXT[]; protocol TEXT; authority TEXT; path TEXT;
BEGIN
  endpoint := btrim(endpoint);
  IF endpoint IS NULL OR btrim(endpoint) = '' OR endpoint ~ '[[:space:]@?#]' THEN RETURN NULL; END IF;
  IF kind = 'VMWARE_VCENTER' THEN
    target := regexp_replace(lower(regexp_replace(regexp_replace(btrim(endpoint), '^https?://', '', 'i'), '/+$', '')), ':443$', '');
    IF target = '' OR target ~ '/' THEN RETURN NULL; END IF;
  ELSE
    parts := regexp_match(btrim(endpoint), '^(https?)://([^/?#]+)(/[^?#]*)?$', 'i');
    IF parts IS NULL THEN RETURN NULL; END IF;
    protocol := lower(parts[1]); authority := lower(parts[2]);
    authority := regexp_replace(authority, CASE WHEN protocol = 'https' THEN ':443$' ELSE ':80$' END, '');
    path := regexp_replace(regexp_replace(regexp_replace(coalesce(parts[3], ''), '/+$', ''), '/api_jsonrpc\.php$', ''), '/+$', '');
    target := protocol || '://' || authority || path;
  END IF;
  RETURN encode(sha256(convert_to(kind || E'\n' || config_id || E'\n' || target, 'UTF8')), 'hex');
END $$;

-- Count all saved connections, including disabled ones: enabled status does not prove legacy ownership.
CREATE TEMP TABLE inventory_scope_backfill ON COMMIT DROP AS
SELECT type::text AS kind, pg_temp.inventory_source_scope(type::text, id,
  CASE WHEN type = 'VMWARE_VCENTER' THEN config->>'host' ELSE config->>'url' END) AS scope
FROM "integration_configs" i
WHERE type IN ('VMWARE_VCENTER', 'ZABBIX')
  AND (SELECT count(*) FROM "integration_configs" peers WHERE peers.type = i.type) = 1;

UPDATE "devices" d SET "vmwareSourceScope" = b.scope FROM inventory_scope_backfill b
WHERE b.kind = 'VMWARE_VCENTER' AND b.scope IS NOT NULL AND d."vmwareMoref" IS NOT NULL
  AND (SELECT count(*) FROM "devices" peers WHERE peers."vmwareMoref" = d."vmwareMoref") = 1;
UPDATE "devices" d SET "zabbixSourceScope" = b.scope FROM inventory_scope_backfill b
WHERE b.kind = 'ZABBIX' AND b.scope IS NOT NULL AND d."zabbixHostId" IS NOT NULL
  AND (SELECT count(*) FROM "devices" peers WHERE peers."zabbixHostId" = d."zabbixHostId") = 1;
UPDATE "vmware_clusters" c SET "sourceScope" = b.scope FROM inventory_scope_backfill b
WHERE b.kind = 'VMWARE_VCENTER' AND b.scope IS NOT NULL
  AND (SELECT count(*) FROM "vmware_clusters" peers WHERE peers."vcenterId" = c."vcenterId") = 1;
UPDATE "vmware_datastores" d SET "sourceScope" = b.scope FROM inventory_scope_backfill b
WHERE b.kind = 'VMWARE_VCENTER' AND b.scope IS NOT NULL
  AND (SELECT count(*) FROM "vmware_datastores" peers WHERE peers."vcenterId" = d."vcenterId") = 1;
UPDATE "zabbix_triggers" t SET "sourceScope" = b.scope FROM inventory_scope_backfill b
WHERE b.kind = 'ZABBIX' AND b.scope IS NOT NULL
  AND (SELECT count(*) FROM "zabbix_triggers" peers WHERE peers."triggerId" = t."triggerId" AND peers."hostId" = t."hostId") = 1;
UPDATE "capacity_metrics" SET "sourceScope" = b.scope FROM inventory_scope_backfill b
WHERE b.kind = 'VMWARE_VCENTER' AND b.scope IS NOT NULL;

CREATE UNIQUE INDEX "devices_vmwareSourceScope_vmwareMoref_key" ON "devices"("vmwareSourceScope", "vmwareMoref");
CREATE UNIQUE INDEX "devices_zabbixSourceScope_zabbixHostId_key" ON "devices"("zabbixSourceScope", "zabbixHostId");
CREATE UNIQUE INDEX "vmware_clusters_sourceScope_vcenterId_key" ON "vmware_clusters"("sourceScope", "vcenterId");
CREATE UNIQUE INDEX "vmware_datastores_sourceScope_vcenterId_key" ON "vmware_datastores"("sourceScope", "vcenterId");
CREATE UNIQUE INDEX "zabbix_triggers_sourceScope_triggerId_hostId_key" ON "zabbix_triggers"("sourceScope", "triggerId", "hostId");
CREATE INDEX "capacity_metrics_sourceScope_resourceType_resourceId_metric_idx" ON "capacity_metrics"("sourceScope", "resourceType", "resourceId", "metricType", "timestamp");

COMMIT;
