import { isLicenseServerMode } from '@/lib/license/server-mode';
import { syncAlarmCatalog } from '@/lib/alarms/alarm-catalog';
import { startAlarmRetentionScheduler } from '@/lib/alarms/retention-service';
import { migrateIntegrationCredentials } from '@/lib/security/integration-credential-migration';
import { startFirewallRecoveryScheduler } from '@/lib/firewall/recovery-scheduler';

export async function registerNodeInstrumentation(): Promise<void> {
  if (isLicenseServerMode()) return;

  await migrateIntegrationCredentials();
  await syncAlarmCatalog();
  startAlarmRetentionScheduler();
  startFirewallRecoveryScheduler();
}
