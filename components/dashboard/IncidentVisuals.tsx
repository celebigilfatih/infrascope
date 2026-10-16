import {
  ArrowDown, BellRing, CheckCheck, CircleAlert, CircleCheck, CircleDot, CircleHelp,
  Cpu, Flag, Info, Layers, LockKeyhole, MemoryStick, Network, Router, Shield, Thermometer, TriangleAlert,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { incidentSeverityLabels, incidentStatusLabels } from '@/lib/alarms/incident-detail-presentation';
import { cn } from '@/lib/utils';
import styles from './incident-visuals.module.css';
import { SemanticBadge } from '@/components/ui/semantic-badge';

type Appearance = { icon: LucideIcon; tone: 'danger' | 'warning' | 'info' | 'success' | 'neutral' };
const severities: Record<string, Appearance> = {
  ALARM_CRITICAL: { icon: CircleAlert, tone: 'danger' },
  ALARM_HIGH: { icon: TriangleAlert, tone: 'warning' },
  ALARM_MEDIUM: { icon: Flag, tone: 'info' },
  ALARM_LOW: { icon: ArrowDown, tone: 'neutral' },
  ALARM_INFO: { icon: Info, tone: 'info' },
};
const statuses: Record<string, Appearance> = {
  OPEN: { icon: CircleDot, tone: 'danger' },
  ACKNOWLEDGED: { icon: CheckCheck, tone: 'info' },
  RESOLVED: { icon: CircleCheck, tone: 'success' },
  CLOSED: { icon: LockKeyhole, tone: 'neutral' },
};
const fallback: Appearance = { icon: CircleHelp, tone: 'neutral' };
export function incidentSeverityAppearance(value: string) { return severities[value] || fallback; }
export function incidentAlarmIcon(code: string): LucideIcon {
  if (code === 'NMS_MEMORY_HIGH') return MemoryStick;
  if (code === 'NMS_CPU_HIGH') return Cpu;
  if (code === 'NMS_TEMPERATURE_HIGH') return Thermometer;
  if (code === 'NMS_PORT_DOWN' || code === 'NMS_BANDWIDTH_HIGH') return Network;
  return BellRing;
}
export function IncidentSeverityBadge({ value }: { value: string }) {
  const { icon: Icon, tone } = incidentSeverityAppearance(value);
  return <SemanticBadge tone={tone} icon={Icon}>{incidentSeverityLabels[value] || value}</SemanticBadge>;
}
export function IncidentStatusBadge({ value, label }: { value: string; label?: string }) {
  const { icon: Icon, tone } = statuses[value] || fallback;
  return <SemanticBadge tone={tone} icon={Icon}>{label || incidentStatusLabels[value as keyof typeof incidentStatusLabels] || value}</SemanticBadge>;
}
export function IncidentSymbol({ code, severity, className }: { code: string; severity: string; className?: string }) {
  const Icon = incidentAlarmIcon(code);
  return <span className={cn(styles.symbol, styles[incidentSeverityAppearance(severity).tone], className)}><Icon size={24} aria-hidden="true" /></span>;
}
export function IncidentSourceIcon({ source, size = 14 }: { source: string; size?: number }) {
  const Icon = /vmware/i.test(source) ? Layers : /nms|switch/i.test(source) ? Router : Shield;
  return <Icon size={size} aria-hidden="true" />;
}
