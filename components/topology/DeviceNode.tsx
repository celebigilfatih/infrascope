'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { getVendorLogo } from '../../lib/formatting';

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

  return (
    <div 
      className={`
        relative rounded-xl border-2 transition-all duration-200
        ${selected ? 'border-blue-500 ring-4 ring-blue-900/50 shadow-xl scale-105' : 'border-blue-800 shadow-md'}
        bg-card text-foreground hover:border-primary border border-border shadow-sm
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
      
      <div className="flex items-center gap-3 mb-3">
        <div className={`rounded-full ${statusColors[data?.status] || 'bg-slate-500'}`} style={{ width: `${iconSize}px`, height: `${iconSize}px` }} />
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
          <span className="text-blue-300">{data.activeConnections || 0} Aktif</span>
        </div>
      )}
    </div>
  );
});

DeviceNode.displayName = 'DeviceNode';
