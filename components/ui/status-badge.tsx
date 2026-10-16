import type { ReactNode } from 'react';
import { Archive, CircleAlert, CircleCheck, CircleHelp, Clock3, LoaderCircle, PauseCircle, Power, Square, TriangleAlert, Wifi, WifiOff, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SemanticBadge, type SemanticTone } from './semantic-badge';

type StatusPresentation = { label: string; tone: SemanticTone; icon: LucideIcon };
const statuses: Record<string, StatusPresentation> = {
  ACTIVE: { label: 'Aktif', tone: 'success', icon: CircleCheck },
  INACTIVE: { label: 'Pasif', tone: 'neutral', icon: PauseCircle },
  MAINTENANCE: { label: 'Bakımda', tone: 'warning', icon: Wrench },
  DECOMMISSIONED: { label: 'Devre dışı', tone: 'neutral', icon: Archive },
  UNKNOWN: { label: 'Bilinmiyor', tone: 'neutral', icon: CircleHelp },
  RUNNING: { label: 'Çalışıyor', tone: 'success', icon: Power },
  POWEREDON: { label: 'Çalışıyor', tone: 'success', icon: Power },
  STOPPED: { label: 'Durduruldu', tone: 'neutral', icon: Square },
  NOTRUNNING: { label: 'Kapalı', tone: 'neutral', icon: Square },
  POWEREDOFF: { label: 'Kapalı', tone: 'neutral', icon: Square },
  SUSPENDED: { label: 'Askıda', tone: 'warning', icon: PauseCircle },
  DEGRADED: { label: 'Sorunlu', tone: 'warning', icon: TriangleAlert },
  WARNING: { label: 'Uyarı', tone: 'warning', icon: TriangleAlert },
  ERROR: { label: 'Hata', tone: 'danger', icon: CircleAlert },
  FAILED: { label: 'Başarısız', tone: 'danger', icon: CircleAlert },
  SUCCEEDED: { label: 'Başarılı', tone: 'success', icon: CircleCheck },
  QUEUED: { label: 'Bekliyor', tone: 'info', icon: Clock3 },
  RETRYING: { label: 'Tekrar denenecek', tone: 'warning', icon: Clock3 },
  SYNCING: { label: 'Senkronize ediliyor', tone: 'info', icon: LoaderCircle },
  CONNECTED: { label: 'Bağlı', tone: 'success', icon: Wifi },
  DISCONNECTED: { label: 'Bağlantı kesildi', tone: 'danger', icon: WifiOff },
  GREEN: { label: 'Sağlıklı', tone: 'success', icon: CircleCheck },
  YELLOW: { label: 'Uyarı', tone: 'warning', icon: TriangleAlert },
  RED: { label: 'Kritik', tone: 'danger', icon: CircleAlert },
  GRAY: { label: 'Bilinmiyor', tone: 'neutral', icon: CircleHelp },
};

/** Use source-specific labels for polling freshness and other domain-specific states. */
export function StatusBadge({ status, label }: { status: string; label?: ReactNode }) {
  const presentation = statuses[status.toUpperCase()] || { label: status || 'Bilinmiyor', tone: 'neutral' as const, icon: CircleHelp };
  return <SemanticBadge tone={presentation.tone} icon={presentation.icon}>{label || presentation.label}</SemanticBadge>;
}
