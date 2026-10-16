'use client';

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { AlertTriangle, Building2, MapPin } from 'lucide-react';

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
  zoom?: number;
  onExpand?: () => void;
  onDoubleClick?: () => void;
  onShowDetails?: () => void;
}

const statuses = {
  healthy: { label: 'Sağlıklı', dot: 'bg-emerald-500', border: 'border-border' },
  degraded: { label: 'Dikkat', dot: 'bg-amber-500', border: 'border-amber-500/40' },
  down: { label: 'Erişilemiyor', dot: 'bg-red-500', border: 'border-red-500/40' },
  unknown: { label: 'Durum bilinmiyor', dot: 'bg-muted-foreground', border: 'border-border' },
  empty: { label: 'Cihaz atanmamış', dot: 'bg-muted-foreground', border: 'border-border' },
};
const handlePositions = [
  { side: 'top', position: Position.Top }, { side: 'right', position: Position.Right },
  { side: 'bottom', position: Position.Bottom }, { side: 'left', position: Position.Left },
];

export const BuildingNode = memo(({ data, selected }: NodeProps<BuildingNodeData>) => {
  const status = statuses[data.status] || statuses.unknown;
  return <div className={`relative w-[220px] rounded-xl border bg-card p-4 text-foreground shadow-sm ${status.border} ${selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'hover:border-primary/50'}`} onClick={data.onExpand} onDoubleClick={data.onDoubleClick}>
    {handlePositions.flatMap(({ side, position }) => (['source', 'target'] as const).map(type => <Handle key={`${side}-${type}`} type={type} position={position} id={`${side}-${type}`} className="!h-2 !w-2 !border-0 !bg-transparent opacity-0" />))}
    <div className="flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Building2 className="h-4 w-4" /></span>
      <div className="min-w-0"><h3 className="break-words text-sm font-semibold leading-snug">{data.name}</h3>{data.city && <p className="mt-1 flex items-start gap-1 text-[11px] leading-relaxed text-muted-foreground"><MapPin className="mt-0.5 h-3 w-3 shrink-0" /><span>{data.city}</span></p>}</div>
    </div>
    <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3 text-[11px]">
      <span className="flex items-center gap-1.5 text-muted-foreground"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} />{status.label}</span>
      <span className="shrink-0 font-medium">{data.deviceCount} cihaz</span>
    </div>
    {(data.portDownCount || 0) > 0 && <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-destructive"><AlertTriangle className="h-3.5 w-3.5" />{data.portDownCount} izlenen port kapalı</p>}
  </div>;
});
BuildingNode.displayName = 'BuildingNode';
