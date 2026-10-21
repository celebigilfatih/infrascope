'use client';

import { Cloud } from 'lucide-react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { NetworkGroupNode } from './NetworkGroupNode';
import styles from './DeviceMapOverview.module.css';

export function DeviceOverviewGroup(props: NodeProps) {
  const { data } = props;
  if (!data.compactOverview) return <NetworkGroupNode {...props} />;
  const fontSize = data.overviewLabelSize || Math.max(16, Math.min(44, 13 / ((data.labelZoom || 100) / 100)));
  return <div className={styles.compactGroup} style={{height: data.overviewHeight}} title={`${data.group.name} · ${data.group.members.length} konum · Merkez: ${data.group.sourceDevice.name}`}>
    <Handle type="target" position={Position.Left} isConnectable={false} className="!h-2 !w-2 !border-0 !bg-teal-600" />
    <button type="button" className={`${styles.deviceIcon} nodrag nopan`} aria-label={`${data.group.name}: Ayrıntılar`} onClick={event => { event.stopPropagation(); data.onInspect(); }}><Cloud size={24} strokeWidth={1.5} aria-hidden="true" /></button>
    <button type="button" className={`${styles.compactGroupName} nodrag nopan`} style={{fontSize, lineHeight: `${fontSize * 1.1}px`}} aria-expanded={data.expanded} aria-label={`${data.group.name}: ${data.expanded ? 'Grubu kapat' : 'Grubu aç'}`} onClick={event => { event.stopPropagation(); data.onToggle(); }}>{data.overviewLabelLines?.join('\n') || data.group.name}</button>
    <span className={styles.compactGroupMeta} style={{fontSize: Math.max(14, fontSize * 10 / 13)}}>{data.group.members.length} konum</span>
    <Handle type="source" position={Position.Right} isConnectable={false} className="!h-2 !w-2 !border-0 !bg-teal-600" />
  </div>;
}
