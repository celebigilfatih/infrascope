'use client';
import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Cloud, ChevronDown, ChevronRight, Info } from 'lucide-react';
import type { NetworkGroup } from '@/lib/topology/network-groups';
import { networkGroupKindLabel } from '@/lib/topology/network-groups';
export const NetworkGroupNode = memo(function NetworkGroupNode({ data }: NodeProps<{ group: NetworkGroup; expanded: boolean; roundOverview?: boolean; onToggle: () => void; onInspect: () => void }>) {
  if (data.roundOverview) return <div className="relative flex h-[232px] w-[232px] flex-col items-center justify-center rounded-full border-2 border-dashed border-teal-500/80 bg-card px-7 text-center text-foreground">
    <Handle type="target" position={Position.Left} isConnectable={false} className="h-2! w-2! border-0! bg-teal-600!" />
    <button type="button" onClick={event => { event.stopPropagation(); data.onInspect(); }} aria-label={`${data.group.name}: Ayrıntılar`} className="nodrag nopan mb-2 inline-flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-full bg-teal-600/5 text-[10px] font-medium text-teal-600 hover:bg-teal-600/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"><Cloud size={36} strokeWidth={1.5} aria-hidden="true" /><span>Ayrıntılar</span></button>
    <strong className="line-clamp-2 max-w-full wrap-break-word text-xl font-semibold leading-6">{data.group.name}</strong>
    <p className="mt-1 text-sm text-muted-foreground">{data.group.members.length} konum</p>
    <p className="mt-1 max-w-full truncate text-xs text-muted-foreground" title={data.group.sourceDevice.name}>Merkez: {data.group.sourceDevice.name}</p>
    <button type="button" className="nodrag nopan mt-3 flex min-h-9 items-center justify-center gap-1 rounded-full border bg-background px-4 text-sm font-medium hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" aria-expanded={data.expanded} aria-label={`${data.group.name}: ${data.expanded ? 'Grubu kapat' : 'Grubu aç'}`} onClick={event => { event.stopPropagation(); data.onToggle(); }}>{data.expanded ? 'Grubu kapat' : 'Grubu aç'}<ChevronRight size={14} aria-hidden="true" /></button>
    <Handle type="source" position={Position.Right} isConnectable={false} className="h-2! w-2! border-0! bg-teal-600!" />
  </div>;
  return <div className="w-[280px] rounded-xl border-2 border-teal-600/60 bg-card p-3 text-foreground shadow-xs">
    <Handle type="target" position={Position.Left} isConnectable={false} className="bg-teal-600!" />
    <div className="flex items-start gap-2"><span className="rounded-lg bg-teal-600/10 p-2 text-teal-600"><Cloud size={22} aria-hidden="true" /></span><div className="min-w-0 flex-1"><strong className="block wrap-break-word text-sm">{data.group.name}</strong><p className="mt-1 text-xs text-muted-foreground">{networkGroupKindLabel(data.group.kind)} · {data.group.members.length} konum</p></div></div>
    <div className="mt-3 flex gap-2"><button type="button" className="nodrag nopan flex min-h-9 flex-1 items-center justify-center gap-1 rounded-md border bg-background px-2 text-xs font-semibold hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" aria-expanded={data.expanded} aria-label={`${data.group.name}: ${data.expanded ? 'Grubu kapat' : 'Grubu aç'}`} onClick={e => { e.stopPropagation(); data.onToggle(); }}>{data.expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}{data.expanded ? 'Grubu kapat' : 'Grubu aç'}</button><button type="button" className="nodrag nopan inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-medium hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${data.group.name}: Ayrıntılar`} onClick={e => { e.stopPropagation(); data.onInspect(); }}><Info size={14} /><span>Ayrıntılar</span></button></div>
    <p className="mt-2 text-[10px] text-muted-foreground">Mantıksal ağ grubu · fiziksel cihaz değil</p>
    <Handle type="source" position={Position.Right} isConnectable={false} className="bg-teal-600!" />
  </div>;
});
