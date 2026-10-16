import type { VMwareService } from './vmware';
import { createSavedVMwareSource, loadSavedVMwareIntegration, VMwareConfigurationError } from './vmware-source';
import { SourceQueryError, throwIfSourceCancelled, withSourceDeadline } from './source-query-error';

export interface VMwareHealthResult {
  status: 'healthy' | 'unhealthy' | 'unknown';
  responseTimeMs?: number;
  error?: string;
  code?: string;
  version?: string;
  target?: { configId: string };
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
  sessionCleanupFailed?: boolean;
}

/** A lightweight owned REST probe; never inventory collection or a cached source verdict. */
export async function checkSavedVMwareHealth(): Promise<VMwareHealthResult> {
  const started = Date.now();
  let service: VMwareService | undefined;
  let metadata: Pick<VMwareHealthResult, 'target' | 'lastSyncAt' | 'lastSyncStatus'> = {};
  let stage: 'configuration' | 'probe' = 'configuration';
  let result: VMwareHealthResult;
  try {
    result = await withSourceDeadline(async signal => {
      const integration = await loadSavedVMwareIntegration();
      throwIfSourceCancelled(signal);
      if (!integration) return { status: 'unknown', code: 'VMWARE_HEALTH_NOT_CONFIGURED', error: 'Etkin VMware entegrasyonu yapılandırılmamış.' };
      metadata = { target: { configId: integration.id }, lastSyncAt: integration.lastSyncAt?.toISOString() ?? null,
        lastSyncStatus: integration.lastSyncStatus ?? null };
      service = createSavedVMwareSource(integration).service;
      stage = 'probe';
      const status = await service.getStatus({ signal });
      throwIfSourceCancelled(signal);
      if (!status.connected) return { ...metadata, status: 'unhealthy', code: 'VMWARE_HEALTH_UNAVAILABLE', error: 'VMware bağlantısı doğrulanamadı.' };
      return { ...metadata, status: 'healthy',
        ...(typeof status.version === 'string' && /^[0-9][\w.+-]{0,63}$/.test(status.version) ? { version: status.version } : {}) };
    }, 5000);
  } catch (error) {
    const timeout = error instanceof SourceQueryError && error.code === 'SOURCE_TIMEOUT';
    result = { ...metadata, status: 'unhealthy',
      code: timeout ? 'VMWARE_HEALTH_TIMEOUT' : error instanceof VMwareConfigurationError
        ? 'VMWARE_HEALTH_CONFIGURATION_INVALID' : stage === 'configuration' ? 'VMWARE_HEALTH_CONFIGURATION_UNAVAILABLE' : 'VMWARE_HEALTH_UNAVAILABLE',
      error: timeout ? 'VMware sağlık kontrolü zaman aşımına uğradı.' : stage === 'configuration'
        ? 'Kayıtlı VMware ayarları kullanılamıyor.' : 'VMware bağlantısı doğrulanamadı.' };
  }
  if (service) {
    try { await withSourceDeadline(signal => service!.closeSession({ signal }), 1000); }
    catch {
      result = { ...result, status: 'unhealthy', sessionCleanupFailed: true,
        ...(result.status === 'healthy' ? { code: 'VMWARE_HEALTH_CLEANUP_FAILED', error: 'VMware sağlık oturumu kapatılamadı.' } : {}) };
    }
  }
  return { ...result, responseTimeMs: Date.now() - started };
}
