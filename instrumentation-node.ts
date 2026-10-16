import { isLicenseServerMode } from '@/lib/license/server-mode';
import { syncAlarmCatalog } from '@/lib/alarms/alarm-catalog';
import { startAlarmRetentionScheduler } from '@/lib/alarms/retention-service';
import { migrateIntegrationCredentials } from '@/lib/security/integration-credential-migration';
import { startFirewallRecoveryScheduler } from '@/lib/firewall/recovery-scheduler';
import { initializeAlarmRunner } from '@/lib/alarms/alarm-runner';
import { startAlarmScheduler } from '@/lib/alarm-scheduler';
import { startAlarmMonitor } from '@/lib/alarms/alarm-monitor';
import { startInventorySyncScheduler } from '@/lib/integrations/inventory-scheduler';

export async function registerNodeInstrumentation(): Promise<void> {
  if (isLicenseServerMode()) return;

  await migrateIntegrationCredentials();
  await syncAlarmCatalog();
  await initializeAlarmRunner();
  startAlarmScheduler({ runImmediately: true });
  startAlarmMonitor();
  startAlarmRetentionScheduler();
  startFirewallRecoveryScheduler();
  startInventorySyncScheduler();
}
