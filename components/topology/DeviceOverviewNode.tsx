'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { CircleHelp, HardDrive, Monitor, Network, Router, Server, Shield } from 'lucide-react';
import { uiLabel } from '@/lib/i18n/tr';
import { TopologyMenuButton } from './TopologyObjectMenu';
import styles from './DeviceMapOverview.module.css';

const icons = { SERVER: Server, SWITCH: Network, ROUTER: Router, FIREWALL: Shield, WORKSTATION: Monitor, STORAGE: HardDrive };
export const DeviceOverviewNode = memo(function DeviceOverviewNode({ data, selected }: NodeProps) {
  const Icon = icons[data.type as keyof typeof icons] || CircleHelp;
  const status = uiLabel(data.status?.toUpperCase() || 'UNKNOWN');
  const labelSize = data.overviewLabelSize || Math.max(16, Math.min(44, 13 / ((data.labelZoom || 100) / 100)));
  return <div className={styles.device} style={{height: data.overviewHeight}} data-compact={data.compactOverview || undefined} data-selected={selected} data-center={data.overviewCenter || undefined} data-muted={data.muted} data-alert={data.portDownCount > 0}
    aria-label={`${data.name} · ${data.ipAddress || 'IP belirtilmemiş'} · ${uiLabel(data.type)} · ${status}`} title={`${data.name} · ${data.ipAddress || 'IP belirtilmemiş'} · ${data.buildingName || 'Konum atanmamış'} · ${uiLabel(data.type)} · ${status} · ${data.connectionCount} kayıtlı fiziksel bağlantı`}>
    <div className={styles.deviceIcon}>
      <Handle id="top" type="source" position={Position.Top} isConnectable={false} className="!h-2 !w-2 !border-0 !bg-transparent" />
      <Handle id="left" type="source" position={Position.Left} isConnectable={false} className="!h-2 !w-2 !border-0 !bg-transparent" />
      <Icon size={27} strokeWidth={1.5} aria-hidden="true" />
      <Handle id="right" type="source" position={Position.Right} isConnectable={false} className="!h-2 !w-2 !border-0 !bg-transparent" />
      <Handle id="bottom" type="source" position={Position.Bottom} isConnectable={false} className="!h-2 !w-2 !border-0 !bg-transparent" />
      <span className={styles.iconStatus} data-status={data.status} role="img" aria-label={status} />
    </div>
    <strong className={styles.deviceName} style={{ fontSize: labelSize, lineHeight: `${labelSize * (data.compactOverview ? 1.1 : 1.2)}px` }}>{data.overviewLabelLines?.join('\n') || data.name}</strong>
    <code className={styles.ip}>{data.ipAddress || 'IP belirtilmemiş'}</code>
    <div className={styles.deviceMeta}><span title={data.buildingName}>{data.buildingName || 'Konum atanmamış'}</span><span className={styles.status}><i className={styles.dot} data-status={data.status} aria-hidden="true" />{data.portDownCount ? `${data.portDownCount} kapalı port` : status}</span></div>
    {data.onOpenMenu && <div className={styles.deviceMenu}><TopologyMenuButton name={data.name} onOpen={data.onOpenMenu} /></div>}
  </div>;
});
