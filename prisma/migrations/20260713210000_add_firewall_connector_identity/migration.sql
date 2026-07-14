CREATE TYPE "FirewallMonitoringMode" AS ENUM ('FULL', 'LIMITED', 'UNAVAILABLE');
CREATE TYPE "FirewallIdentityStatus" AS ENUM ('PENDING', 'VERIFIED', 'CONFLICT');

CREATE TABLE "firewall_connectors" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "integrationConfigId" TEXT NOT NULL,
    "managementHost" TEXT NOT NULL,
    "serialNumber" TEXT,
    "analyzerDeviceId" TEXT,
    "vdom" TEXT NOT NULL DEFAULT 'root',
    "identityKey" TEXT,
    "identityCandidateKey" TEXT,
    "identityStatus" "FirewallIdentityStatus" NOT NULL DEFAULT 'PENDING',
    "identityConflictWithId" TEXT,
    "monitoringMode" "FirewallMonitoringMode" NOT NULL DEFAULT 'UNAVAILABLE',
    "capabilities" JSONB,
    "writeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastProbeAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "nextProbeAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "firewall_connectors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "firewall_connectors_deviceId_key" ON "firewall_connectors"("deviceId");
CREATE UNIQUE INDEX "firewall_connectors_identityKey_key" ON "firewall_connectors"("identityKey");
CREATE UNIQUE INDEX "firewall_connectors_integrationConfigId_vdom_key" ON "firewall_connectors"("integrationConfigId", "vdom");
CREATE INDEX "firewall_connectors_serialNumber_vdom_idx" ON "firewall_connectors"("serialNumber", "vdom");
CREATE UNIQUE INDEX "firewall_connectors_analyzerDeviceId_vdom_key" ON "firewall_connectors"("analyzerDeviceId", "vdom");
CREATE INDEX "firewall_connectors_identityStatus_idx" ON "firewall_connectors"("identityStatus");
CREATE INDEX "firewall_connectors_identityCandidateKey_idx" ON "firewall_connectors"("identityCandidateKey");
CREATE INDEX "firewall_connectors_identityConflictWithId_idx" ON "firewall_connectors"("identityConflictWithId");
CREATE INDEX "firewall_connectors_nextProbeAt_idx" ON "firewall_connectors"("nextProbeAt");

ALTER TABLE "firewall_connectors"
  ADD CONSTRAINT "firewall_connectors_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "firewall_connectors"
  ADD CONSTRAINT "firewall_connectors_integrationConfigId_fkey"
  FOREIGN KEY ("integrationConfigId") REFERENCES "integration_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill only explicit Device links. Host-based guesses are intentionally forbidden.
INSERT INTO "firewall_connectors" (
  "id",
  "deviceId",
  "integrationConfigId",
  "managementHost",
  "serialNumber",
  "vdom",
  "identityStatus",
  "monitoringMode",
  "capabilities",
  "writeEnabled",
  "createdAt",
  "updatedAt"
)
SELECT
  'fgc_' || md5(ic."id" || ':' || COALESCE(NULLIF(ic."config"->>'vdom', ''), 'root')),
  ic."config"->>'deviceId',
  ic."id",
  ic."config"->>'host',
  d."serialNumber",
  COALESCE(NULLIF(ic."config"->>'vdom', ''), 'root'),
  'PENDING'::"FirewallIdentityStatus",
  CASE
    WHEN d."metadata"->'firewallMonitoring'->>'mode' = 'FULL' THEN 'FULL'::"FirewallMonitoringMode"
    WHEN d."metadata"->'firewallMonitoring'->>'mode' = 'LIMITED' THEN 'LIMITED'::"FirewallMonitoringMode"
    ELSE 'UNAVAILABLE'::"FirewallMonitoringMode"
  END,
  d."metadata"->'firewallMonitoring'->'sources',
  false,
  ic."createdAt",
  CURRENT_TIMESTAMP
FROM "integration_configs" ic
JOIN "devices" d ON d."id" = ic."config"->>'deviceId'
WHERE ic."type" = 'FORTIGATE'
  AND NULLIF(ic."config"->>'host', '') IS NOT NULL
ON CONFLICT DO NOTHING;
