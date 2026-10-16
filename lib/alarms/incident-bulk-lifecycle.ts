export type IncidentBulkLifecycleAction = 'RESOLVE' | 'CLOSE';
export interface IncidentBulkLifecycleResult { success: boolean; error?: string }
export const INCIDENT_BULK_REASON_MAX_LENGTH = 4000;

export function incidentBulkLifecycleReason(value: unknown): string {
  if (value === undefined) throw new Error('İşlem açıklaması zorunludur.');
  if (typeof value !== 'string') throw new Error('İşlem açıklaması metin olmalıdır.');
  const reason = value.trim();
  if (!reason) throw new Error('İşlem açıklaması zorunludur.');
  if (reason.length > INCIDENT_BULK_REASON_MAX_LENGTH) throw new Error(`İşlem açıklaması en fazla ${INCIDENT_BULK_REASON_MAX_LENGTH} karakter olabilir.`);
  return reason;
}

export function isIncidentBulkLifecycleEligible(status: string, action: IncidentBulkLifecycleAction): boolean {
  return action === 'RESOLVE' ? status === 'OPEN' || status === 'ACKNOWLEDGED' : status === 'RESOLVED';
}

export function incidentBulkLifecycleExclusionReason(status: string, action: IncidentBulkLifecycleAction): string | null {
  if (isIncidentBulkLifecycleEligible(status, action)) return null;
  if (status === 'CLOSED') return action === 'RESOLVE' ? 'Kapatılmış olay yeniden çözülemez.' : 'Olay zaten kapatılmış.';
  if (action === 'RESOLVE' && status === 'RESOLVED') return 'Olay zaten çözüldü olarak işaretlenmiş.';
  if (action === 'CLOSE' && (status === 'OPEN' || status === 'ACKNOWLEDGED')) return 'Kapatılmadan önce çözüldü olarak işaretlenmelidir.';
  return 'Mevcut durumu bu işlem için uygun değil.';
}
