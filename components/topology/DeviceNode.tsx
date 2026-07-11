'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { AlertTriangle, CircleHelp, EthernetPort, Monitor, Network, Router, Server, Shield } from 'lucide-react';
import { getVendorLogo } from '../../lib/formatting';

interface DownPortSummary {
  id: string;
  interfaceName: string;
  description?: string | null;
  downSince?: string | Date | null;
}

interface DeviceNodeData {
  deviceId: string;
  name: string;
  type: string;
  vendor?: string;
  role: string;
  status: 'active' | 'inactive' | 'maintenance' | 'error';
  ipAddress?: string;
  ports?: number;
  activeConnections?: number;
  buildingName?: string;
  location?: string;
  zoom?: number;
  portDownCount?: number;
  downPorts?: DownPortSummary[];
}

export const DeviceNode = memo(({ data, selected }: NodeProps<DeviceNodeData>) => {
  const statusColors = {
    active: 'bg-emerald-500',
    inactive: 'bg-muted-foreground',
    maintenance: 'bg-amber-500',
    error: 'bg-red-500',
  };

  const roleIcons = {
    core: Network,
    distribution: Router,
    access: Router,
    endpoint: Monitor,
    server: Server,
    firewall: Shield,
    unknown: CircleHelp,
  };
  const RoleIcon = roleIcons[data?.role as keyof typeof roleIcons] || roleIcons.unknown;

  const zoom = data.zoom || 1;
  const scale = Math.max(0.7, Math.min(2.0, zoom));
  
  // Calculate dynamic dimensions based on zoom
  const width = 240 * scale;
  const padding = 16 * scale;
  const fontSize = 14 * scale;
  const subFontSize = 12 * scale;
  const iconSize = 12 * scale;
  const hasPortDown = (data.portDownCount || 0) > 0;
  const visibleDownPorts = (data.downPorts || []).slice(0, 2);

  return (
    <div 
      className={`
        relative rounded-md border bg-card text-foreground shadow-sm transition-all duration-200
        ${hasPortDown
          ? selected
            ? 'border-red-500 ring-4 ring-red-500/15 scale-[1.02]'
            : 'border-red-500/70'
          : selected
            ? 'border-primary ring-4 ring-primary/15 scale-[1.02]'
            : 'border-border'}
        hover:border-primary/70 hover:shadow-md
      `}
      style={{ 
        width: `${width}px`, 
        padding: `${padding}px`,
        transform: `scale(${1/zoom < 1 ? 1 : 1/zoom})`, 
        transformOrigin: 'center'
      }}
    >
      <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !border-2 !border-card !bg-primary" />
      <Handle type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !border-2 !border-card !bg-primary" />
      {hasPortDown && (
        <div
          className="absolute -right-3 -top-3 z-20 flex min-h-6 items-center gap-1 rounded-full border border-red-300 bg-red-600 px-2.5 text-xs font-semibold text-white shadow-sm"
          title={`${data.portDownCount} izlenen port down`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {data.portDownCount}
        </div>
      )}
      
      <div className="mb-3 flex items-center gap-3">
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <RoleIcon className="h-5 w-5" aria-hidden="true" />
          <span className={`absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-card ${hasPortDown ? 'bg-red-500' : statusColors[data?.status] || 'bg-muted-foreground'}`} style={{ width: `${iconSize}px`, height: `${iconSize}px` }} title={data.status} />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {getVendorLogo(data?.vendor) && (
            <img 
              src={getVendorLogo(data?.vendor)!} 
              alt={data?.vendor} 
              className="h-7 w-7 object-contain"
              title={data?.vendor}
            />
          )}
          <h3 className="min-w-0 flex-1 truncate font-semibold" style={{ fontSize: `${fontSize}px` }}>{data?.name || 'Bilinmeyen Cihaz'}</h3>
        </div>
      </div>

      {hasPortDown && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <EthernetPort className="h-4 w-4 shrink-0" />
              <span className="truncate text-xs font-semibold">{data.portDownCount} port down</span>
            </div>
            <span className="shrink-0 text-xs font-semibold">NMS</span>
          </div>
          {visibleDownPorts.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {visibleDownPorts.map((port) => (
                <div key={port.id} className="truncate text-xs font-medium">
                  {port.interfaceName}{port.description ? ` - ${port.description}` : ''}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2" style={{ fontSize: `${subFontSize}px` }}>
        <div className="flex justify-between gap-3 text-muted-foreground">
          <span>Tip</span>
          <span className="truncate font-medium text-foreground">{data.type}</span>
        </div>
        <div className="flex justify-between gap-3 text-muted-foreground">
          <span>IP Adresi</span>
          <span className="font-mono font-medium text-foreground">{data.ipAddress || 'Yok'}</span>
        </div>
        <div className="flex justify-between gap-3 text-muted-foreground">
          <span>Konum</span>
          <span className="max-w-[120px] truncate font-medium text-foreground">{data.location || 'Yok'}</span>
        </div>
      </div>

      {data.ports !== undefined && (
        <div 
          className="mt-3 flex items-center justify-between border-t border-border pt-3 font-medium text-muted-foreground"
          style={{ fontSize: `${Math.max(12, 11 * scale)}px` }}
        >
          <span>{data.ports} Port</span>
          <span className={hasPortDown ? 'text-red-600 dark:text-red-400' : 'text-foreground'}>
            {hasPortDown ? `${data.portDownCount} Down` : `${data.activeConnections || 0} Aktif`}
          </span>
        </div>
      )}
    </div>
  );
});

DeviceNode.displayName = 'DeviceNode';
