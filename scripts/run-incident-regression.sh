#!/usr/bin/env bash
set -euo pipefail

# Run against a private source copy: no installation secrets, build cache or live DB.
mkdir -p /app /artifacts
trap 'result=$?; if [ -d /app/output/incident-regression ]; then cp -R /app/output/incident-regression/. /artifacts/; fi; exit "$result"' EXIT
tar -C /workspace --exclude='.git' --exclude='node_modules' --exclude='.next' \
  --exclude='output' --exclude='.env*' --exclude='.venv' --exclude='./backups' --exclude='./deploy/backups' \
  --exclude='logs' --exclude='data' --exclude='.machine-id' --exclude='.license-cache' \
  --exclude='*.isbackup' --exclude='nms_service/*.sql' -cf - . | tar -C /app -xf -
cd /app
npm ci --legacy-peer-deps --no-audit --no-fund
npx prisma generate
npx prisma migrate deploy
npx eslint app/dashboard/alerts/page.tsx components/dashboard/IncidentDetailWorkspace.tsx app/api/alarm-incidents/route.ts tests/incident-e2e/alerts-operation-note-access.spec.ts tests/incident-e2e/alerts-assignment-access.spec.ts tests/incident-e2e/alerts-lifecycle-access.spec.ts tests/incident-e2e/alerts-acknowledge-access.spec.ts tests/incident-e2e/alerts-unacknowledge-access.spec.ts tests/incident-e2e/alerts-bulk-lifecycle-access.spec.ts tests/incident-e2e/alerts-bulk-assignment-access.spec.ts tests/incident-e2e/alerts-bulk-acknowledge-access.spec.ts tests/incident-e2e/bulk-acknowledge.spec.ts components/dashboard/IncidentBulkAssignment.tsx components/dashboard/IncidentBulkLifecycle.tsx lib/alarms/incident-bulk-lifecycle.ts tests/incident-e2e/alerts-archive-access.spec.ts tests/incident-e2e/alerts-legal-hold-access.spec.ts app/api/alarm-incidents/assignees/route.ts components/dashboard/IncidentExclusions.tsx app/api/alarms/whitelist/route.ts tests/incident-e2e/detail-exclusion-removal.spec.ts tests/incident-e2e/alerts-exclusion-loading.spec.ts tests/incident-e2e/alerts-exclusion-access.spec.ts tests/incident-e2e/exclusion-fixtures.ts tests/incident-e2e/alerts-exclusion-create-access.spec.ts tests/incident-e2e/session-fixtures.ts --max-warnings=0
npm run type-check -- --incremental false
npx eslint app/settings/audit/page.tsx components/audit/*.tsx lib/audit/*.ts app/api/audit/route.ts app/api/audit/export/route.ts scripts/check-audit-workspace.cjs tests/incident-e2e/audit-workspace.spec.ts --max-warnings=0
npm run test:audit-workspace
npx eslint app/settings/users/page.tsx components/users/*.tsx lib/users/*.ts app/api/users/route.ts app/api/users/activities/route.ts app/api/users/password/route.ts scripts/check-users-workspace.cjs tests/incident-e2e/users-workspace.spec.ts --max-warnings=0
npm run test:users-workspace
npx eslint app/settings/users/invitations/page.tsx components/invitations/*.tsx lib/invitations/*.ts app/api/users/invite/route.ts 'app/api/users/invite/[id]/resend/route.ts' app/api/users/verify/route.ts app/verify/page.tsx lib/email/sendInvitation.ts lib/rate-limit.ts middleware.ts scripts/check-invitations-workspace.cjs tests/incident-e2e/invitations-workspace.spec.ts --max-warnings=0
npm run test:invitations-workspace
npx eslint app/settings/organizations/page.tsx app/settings/organizations/workspace-dialog.tsx lib/organizations/*.ts app/api/organizations/route.ts 'app/api/organizations/[id]/route.ts' scripts/check-organizations-workspace.cjs tests/incident-e2e/organizations-workspace.spec.ts --max-warnings=0
npm run test:organizations-workspace
npx eslint app/settings/license/page.tsx lib/license/workspace.ts app/api/license/status/route.ts scripts/check-license-workspace.cjs tests/incident-e2e/license-workspace.spec.ts --max-warnings=0
npm run test:license-workspace
npx eslint app/integrations/vmware/page.tsx lib/integrations/vmware-settings.ts lib/integrations/vmware-workspace.ts app/api/integrations/vmware/route.ts scripts/check-vmware-workspace.cjs scripts/check-vmware-cache.cjs scripts/check-vmware-health.cjs scripts/check-integration-permissions.cjs tests/incident-e2e/vmware-settings-workspace.spec.ts --max-warnings=0
npm run test:vmware-workspace
npm run test:vmware-cache
npm run test:vmware-health
npm run test:integration-permissions
npx eslint app/integrations/fortianalyzer/page.tsx lib/integrations/fortianalyzer-workspace.ts app/api/integrations/fortianalyzer/workspace/route.ts scripts/check-fortianalyzer-workspace.cjs scripts/check-fortianalyzer-profile-ui.cjs tests/incident-e2e/fortianalyzer-workspace.spec.ts --max-warnings=0
npm run test:fortianalyzer-workspace
npx eslint app/security/web-analytics/page.tsx app/api/integrations/fortianalyzer/analytics/route.ts lib/security/web-analytics.ts lib/integrations/fortianalyzer.ts lib/api.ts scripts/check-web-analytics.cjs tests/incident-e2e/web-analytics-workspace.spec.ts --max-warnings=0
npm run test:web-analytics
npx eslint app/security/quarantine/page.tsx app/api/security/quarantine/route.ts lib/security/quarantine.ts lib/integrations/fortigate.ts lib/api.ts scripts/check-quarantine.cjs tests/incident-e2e/quarantine-workspace.spec.ts --max-warnings=0
npm run test:quarantine
npm run test:fortianalyzer-auth
npm run test:fortianalyzer-profile
npm run test:fortianalyzer-cache
TZ=UTC npm run test:fortianalyzer-time
TZ=Europe/Istanbul npm run test:fortianalyzer-time
npx eslint app/api/firewalls/route.ts 'app/api/firewalls/[id]/[resource]/route.ts' 'app/api/firewalls/[id]/events/route.ts' 'app/api/firewalls/[id]/snmp/health/route.ts' 'app/api/firewalls/[id]/vpn/[kind]/route.ts' app/api/firewalls/workspace/route.ts app/integrations/firewall/page.tsx app/network/firewall/page.tsx app/network/config-revisions/page.tsx app/security/virtual-ips/page.tsx components/firewall/*.tsx components/firewall/useFirewallOverviewResource.ts components/firewall/types.ts lib/firewall/workspace-settings.ts lib/firewall/workspace.ts lib/firewall/overview.ts lib/firewall/config-history.ts lib/firewall/virtual-ips.ts lib/integrations/fortigate.ts scripts/check-firewall-workspace.cjs scripts/check-firewall-overview.cjs scripts/check-config-history.cjs scripts/check-virtual-ips.cjs tests/incident-e2e/fortigate-workspace.spec.ts --max-warnings=0
npm run test:firewall-workspace
npm run test:firewall-overview
npm run test:config-history
npm run test:virtual-ips
npm run security:firewall-write-check
npm run security:fortigate-connector-check
npm run security:firewall-error-check
npm run security:firewall-write-audit-check
npm run security:firewall-capability-check
npm run security:firewall-onboarding-check
npm run security:firewall-removal-check
npm run security:firewall-tls-ca-check
npm run security:firewall-identity-check
npm run security:firewall-read-check
npm run security:firewall-read-query-check
npm run security:firewall-recovery-check
npm run test:fortigate-alarm-targets
npm run test:fortigate-snmp
npx eslint app/integrations/status/page.tsx app/api/integrations/status/route.ts lib/integrations/status-workspace.ts scripts/check-integration-status-workspace.cjs scripts/check-inventory-sync.cjs scripts/helpers/vmware-page-fixture.cjs tests/incident-e2e/integration-status-workspace.spec.ts --max-warnings=0
npm run test:integration-status-workspace
npm run test:inventory-sync
npm run test:ui-turkish
npx eslint app/settings/alerts/page.tsx components/alarms/*.tsx lib/alarms/rule-workspace.ts lib/validators/alarms.ts app/api/alarms/definitions/route.ts app/api/alarms/notification/route.ts scripts/check-rule-workspace.cjs tests/incident-e2e/rule-workspace.spec.ts tests/incident-e2e/fixtures.ts --max-warnings=0
npm run test:rule-workspace
npm run test:credential-storage
npx eslint app/integrations/nms/add-device/page.tsx app/integrations/nms/devices/page.tsx app/api/integrations/nms/test-connection/route.ts components/nms/*.tsx lib/nms/add-device-form.ts lib/nms/device-monitoring-view.ts scripts/check-nms-add-device.cjs scripts/check-nms-connection-test.cjs scripts/check-nms-device-monitoring.cjs scripts/fixtures/nms-device-monitoring.cjs tests/incident-e2e/nms-workspace.spec.ts --max-warnings=0
npm run test:nms-device-monitoring
npm run test:nms-add-device
npm run test:nms-connection-test
npx eslint app/integrations/nms/backups/page.tsx app/api/integrations/nms/backup-policies/route.ts components/nms/BackupArtifactDialog.tsx components/nms/BackupCoverage.tsx lib/nms/backup-view.ts scripts/check-nms-backup-view.cjs tests/incident-e2e/nms-backup-workspace.spec.ts --max-warnings=0
npm run test:nms-backup-view
npm run test:nms-backups
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
