import { Radio, Shield, TriangleAlert } from 'lucide-react';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import type { FirewallMonitoringMode } from './types';
export function FirewallModeBadge({ mode, className }: { mode: FirewallMonitoringMode | null | undefined; className?: string }) {
  return <SemanticBadge className={className} tone={mode === 'FULL' ? 'success' : mode === 'LIMITED' ? 'warning' : mode === 'UNAVAILABLE' ? 'danger' : 'neutral'} icon={mode === 'LIMITED' ? Radio : mode === 'UNAVAILABLE' ? TriangleAlert : Shield}>{mode === 'FULL' ? 'Tam izleme' : mode === 'LIMITED' ? 'Kısıtlı izleme' : mode === 'UNAVAILABLE' ? 'Veri alınamıyor' : 'İzleme bilgisi yok'}</SemanticBadge>;
}
