import { ArrowDown, CircleAlert, CircleHelp, Flag, Info, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SemanticBadge, type SemanticTone } from './semantic-badge';

const severities: Record<string, { label: string; tone: SemanticTone; icon: LucideIcon }> = {
  CRITICAL: { label: 'Kritik', tone: 'danger', icon: CircleAlert },
  HIGH: { label: 'Yüksek', tone: 'warning', icon: TriangleAlert },
  MEDIUM: { label: 'Orta', tone: 'info', icon: Flag },
  LOW: { label: 'Düşük', tone: 'neutral', icon: ArrowDown },
  INFO: { label: 'Bilgi', tone: 'info', icon: Info },
};
export function SeverityBadge({ severity }: { severity: string }) {
  const presentation = severities[severity.toUpperCase().replace(/^ALARM_/, '')];
  return <SemanticBadge tone={presentation?.tone || 'neutral'} icon={presentation?.icon || CircleHelp}>{presentation?.label || severity}</SemanticBadge>;
}
