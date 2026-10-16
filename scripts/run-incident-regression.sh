#!/usr/bin/env bash
set -euo pipefail

# Run against a private source copy: no installation secrets, build cache or live DB.
mkdir -p /app /artifacts
trap 'result=$?; if [ -d /app/output/incident-regression ]; then cp -R /app/output/incident-regression/. /artifacts/; fi; exit "$result"' EXIT
tar -C /workspace --exclude='.git' --exclude='node_modules' --exclude='.next' \
  --exclude='output' --exclude='.env*' --exclude='.venv' --exclude='backups' \
  --exclude='logs' --exclude='data' --exclude='.machine-id' --exclude='.license-cache' \
  --exclude='*.isbackup' --exclude='nms_service/*.sql' -cf - . | tar -C /app -xf -
cd /app
npm ci --legacy-peer-deps --no-audit --no-fund
npx prisma generate
npx prisma migrate deploy
npx eslint app/dashboard/alerts/page.tsx components/dashboard/IncidentDetailWorkspace.tsx app/api/alarm-incidents/route.ts tests/incident-e2e/alerts-operation-note-access.spec.ts tests/incident-e2e/alerts-assignment-access.spec.ts components/dashboard/IncidentExclusions.tsx app/api/alarms/whitelist/route.ts tests/incident-e2e/detail-exclusion-removal.spec.ts tests/incident-e2e/alerts-exclusion-loading.spec.ts tests/incident-e2e/alerts-exclusion-access.spec.ts tests/incident-e2e/exclusion-fixtures.ts tests/incident-e2e/alerts-exclusion-create-access.spec.ts tests/incident-e2e/session-fixtures.ts --max-warnings=0
npm run type-check -- --incremental false
npx eslint app/network/NetworkTopologyContent.tsx components/topology/TopologyInspector.tsx components/topology/CustomEdge.tsx components/topology/DeviceNode.tsx lib/topology/workspace.ts scripts/check-topology-workspace.cjs scripts/fixtures/topology-workspace.cjs scripts/check-incident-detail.cjs scripts/check-incident-collaboration.cjs tests/incident-e2e/topology-workspace.spec.ts --max-warnings=0
npm run test:topology-workspace
npm run test:topology-contracts
npx eslint app/virtualization/snapshots/page.tsx app/virtualization/vms/page.tsx components/virtualization/SnapshotWorkspace.tsx components/virtualization/VMWorkspace.tsx scripts/check-snapshot-workspace.cjs scripts/fixtures/snapshot-workspace.cjs tests/incident-e2e/snapshot-workspace.spec.ts --max-warnings=0
npm run test:snapshot-workspace
npm run test:snapshot-workspace-collector
npm run test:incident-detail
npm run test:incident-center
npm run test:incident-collaboration
npm run test:incidents:e2e
