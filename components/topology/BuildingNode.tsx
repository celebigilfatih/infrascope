'use client';

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { AlertTriangle, Building2 } from 'lucide-react';
import type { ConnectionEmphasis } from '@/lib/topology/connection-emphasis';
import { HopDistanceBadge } from './HopDistanceBadge';
import emphasisStyles from './node-emphasis.module.css';
import { TopologyMenuButton } from './TopologyObjectMenu';

interface BuildingNodeData {
  buildingId: string;
  name: string;
  city?: string;
  organizationName?: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown' | 'empty';
  deviceCount: number;
  coreDevices: number;
  distributionDevices: number;
  accessDevices: number;
  portDownCount?: number;
  isExpanded: boolean;
  nodeEmphasis?: ConnectionEmphasis;
  hoverActive?: boolean;
  tooltipId?: string;
  hopDistance?: number;
  zoom?: number;
  onExpand?: () => void;
  onDoubleClick?: () => void;
  onShowDetails?: () => void;
  onOpenMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  overview?: boolean;
  overviewCenter?: boolean;
}

const statuses = {
  healthy: { label: 'Sağlıklı', tone: 'success', dot: 'bg-emerald-500', border: 'border-border' },
  degraded: { label: 'Dikkat', tone: 'warning', dot: 'bg-amber-500', border: 'border-amber-500/40' },
  down: { label: 'Erişilemiyor', tone: 'danger', dot: 'bg-red-500', border: 'border-red-500/40' },
  unknown: { label: 'Durum bilinmiyor', tone: 'neutral', dot: 'bg-muted-foreground', border: 'border-border' },
  empty: { label: 'Cihaz atanmamış', tone: 'neutral', dot: 'bg-muted-foreground', border: 'border-border' },
} as const;
export const buildingNodeStatus = (status: string) => statuses[status as keyof typeof statuses] || statuses.unknown;
const handlePositions = [
  { side: 'top', position: Position.Top }, { side: 'right', position: Position.Right },
  { side: 'bottom', position: Position.Bottom }, { side: 'left', position: Position.Left },
];

export const BuildingNode = memo(({ data, selected, isConnectable }: NodeProps<BuildingNodeData>) => {
  const status = buildingNodeStatus(data.status);
  const portDownCount = data.portDownCount || 0;
  const description = [data.name, data.city, `${data.deviceCount} cihaz`, status.label, portDownCount > 0 ? `${portDownCount} izlenen port kapalı` : null].filter(Boolean).join(' · ');

  return <div className={`group relative flex ${data.overview ? 'w-40' : 'w-32'} flex-col items-center text-center text-foreground ${data.nodeEmphasis === 'muted' ? emphasisStyles.muted : ''}`} data-building-overview={data.overview || undefined} data-node-emphasis={data.nodeEmphasis || 'normal'} data-topology-hover-active={data.hoverActive || undefined} aria-label={description} aria-describedby={data.tooltipId} onClick={data.overview ? undefined : data.onExpand} onDoubleClick={data.onDoubleClick}>
    <HopDistanceBadge distance={data.hopDistance} />
    <div className={`relative grid ${data.overviewCenter ? 'h-[72px] w-[72px]' : 'h-14 w-14'} shrink-0 place-items-center ${data.overview ? 'rounded-full' : 'rounded-2xl'} border bg-card text-primary shadow-xs transition-colors ${status.border} ${data.overview ? 'ring-[7px] ring-primary/5' : ''} ${data.hoverActive && data.nodeEmphasis === 'highlighted' ? 'border-primary! ring-2 ring-primary/50 ring-offset-2 ring-offset-background' : selected ? 'border-primary ring-2 ring-primary/30 ring-offset-2 ring-offset-background' : data.nodeEmphasis === 'highlighted' ? 'ring-1 ring-primary/30 group-hover:border-primary/60' : 'group-hover:border-primary/60 group-hover:bg-primary/5'}`}>
      {handlePositions.map(({ side, position }) => <Handle key={side} type="source" position={position} id={`${side}-source`} isConnectable={isConnectable} title={isConnectable ? 'Bağlantı oluşturmak için başka bir binanın bağlantı noktasına sürükleyin' : undefined} className={isConnectable ? 'h-3! w-3! border-2! border-card! bg-primary! opacity-60 transition-opacity hover:opacity-100 group-hover:opacity-100' : 'h-2! w-2! border-0! bg-transparent! opacity-0'} />)}
      <Building2 className={data.overviewCenter ? 'h-10 w-10' : 'h-8 w-8'} strokeWidth={1.5} aria-hidden="true" />
      <span className={`absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-card ${status.dot}`} role="img" aria-label={status.label} />
      {portDownCount > 0 && <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground" aria-label={`${portDownCount} izlenen port kapalı`}><AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />{portDownCount}</span>}
    </div>
    {data.onOpenMenu && <div className={`absolute left-[calc(50%+2rem)] top-0 ${data.overview ? emphasisStyles.overviewMenu : ''}`}><TopologyMenuButton name={data.name} onOpen={data.onOpenMenu} /></div>}
    <h3 className={`mt-2 line-clamp-2 max-w-full rounded bg-background px-1 font-semibold wrap-anywhere ${data.overview ? 'text-base leading-5' : 'text-xs leading-4'}`}>{data.name}</h3>
    <p className={`mt-0.5 rounded bg-background px-1 text-muted-foreground ${data.overview ? 'text-sm leading-5' : 'text-[11px] leading-4'}`}>{data.deviceCount} cihaz</p>
  </div>;
});
BuildingNode.displayName = 'BuildingNode';
