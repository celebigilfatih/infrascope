'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { AlertTriangle, EthernetPort } from 'lucide-react';
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
    inactive: 'bg-slate-500',
    maintenance: 'bg-amber-500',
    error: 'bg-red-500',
  };

  const roleIcons = {
    core: '🌐',
    distribution: '🔌',
    access: '📶',
    endpoint: '💻',
    server: '🖥️',
    firewall: '🛡️',
    unknown: '❓',
  };

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
        relative rounded-xl border-2 transition-all duration-200
        ${hasPortDown
          ? selected
            ? 'border-red-500 ring-4 ring-red-500/30 shadow-xl shadow-red-500/20 scale-105'
            : 'border-red-500 shadow-lg shadow-red-500/20'
          : selected
            ? 'border-blue-500 ring-4 ring-blue-900/50 shadow-xl scale-105'
            : 'border-blue-800 shadow-md'}
        bg-card text-foreground hover:border-primary shadow-sm
      `}
      style={{ 
        width: `${width}px`, 
        padding: `${padding}px`,
        transform: `scale(${1/zoom < 1 ? 1 : 1/zoom})`, 
        transformOrigin: 'center'
      }}
    >
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-blue-400 !border-2 !border-blue-950" />
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-blue-600 !border-2 !border-blue-950" />
      {hasPortDown && (
        <div
          className="absolute -right-3 -top-3 z-20 flex items-center gap-1 rounded-full border border-red-300 bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-lg shadow-red-500/30"
          title={`${data.portDownCount} izlenen port down`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {data.portDownCount}
        </div>
      )}
      
      <div className="flex items-center gap-3 mb-3">
        <div className={`rounded-full ${hasPortDown ? 'bg-red-500 animate-pulse' : statusColors[data?.status] || 'bg-slate-500'}`} style={{ width: `${iconSize}px`, height: `${iconSize}px` }} />
        <div className="flex items-center gap-2">
          <div className="text-lg" title={data?.role}>{roleIcons[data?.role as keyof typeof roleIcons] || roleIcons.unknown}</div>
          {getVendorLogo(data?.vendor) && (
            <img 
              src={getVendorLogo(data?.vendor)!} 
              alt={data?.vendor} 
              className="h-7 w-7 object-contain"
              title={data?.vendor}
            />
          )}
        </div>
        <h3 className="font-bold truncate flex-1" style={{ fontSize: `${fontSize}px` }}>{data?.name || 'Bilinmeyen Cihaz'}</h3>
      </div>

      {hasPortDown && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <EthernetPort className="h-4 w-4 shrink-0" />
              <span className="truncate text-xs font-bold">{data.portDownCount} Port Down</span>
            </div>
            <span className="shrink-0 text-[10px] font-bold uppercase">NMS</span>
          </div>
          {visibleDownPorts.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {visibleDownPorts.map((port) => (
                <div key={port.id} className="truncate text-[10px] font-medium">
                  {port.interfaceName}{port.description ? ` - ${port.description}` : ''}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2" style={{ fontSize: `${subFontSize}px` }}>
        <div className="flex justify-between text-blue-300">
          <span>Tip</span>
          <span className="font-medium text-white">{data.type}</span>
        </div>
        <div className="flex justify-between text-blue-300">
          <span>IP Adresi</span>
          <span className="font-medium text-white font-mono">{data.ipAddress || 'Yok'}</span>
        </div>
        <div className="flex justify-between text-blue-300">
          <span>Konum</span>
          <span className="font-medium text-white truncate max-w-[120px]">{data.location || 'Yok'}</span>
        </div>
      </div>

      {data.ports !== undefined && (
        <div 
          className="mt-3 pt-3 border-t border-blue-800 flex justify-between items-center font-bold uppercase tracking-wider text-blue-400"
          style={{ fontSize: `${10 * scale}px` }}
        >
          <span>{data.ports} Port</span>
          <span className={hasPortDown ? 'text-red-500' : 'text-blue-300'}>
            {hasPortDown ? `${data.portDownCount} Down` : `${data.activeConnections || 0} Aktif`}
          </span>
        </div>
      )}
    </div>
  );
});

DeviceNode.displayName = 'DeviceNode';
