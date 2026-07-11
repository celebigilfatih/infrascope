import { isLicenseServerMode } from '@/lib/license/server-mode';
import { syncAlarmCatalog } from '@/lib/alarms/alarm-catalog';
import { startAlarmRetentionScheduler } from '@/lib/alarms/retention-service';

export async function registerNodeInstrumentation(): Promise<void> {
  if (isLicenseServerMode()) return;

  await syncAlarmCatalog();
  startAlarmRetentionScheduler();
}
