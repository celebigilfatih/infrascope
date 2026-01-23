'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

interface BuildingNodeData {
  buildingId: string;
  name: string;
  city?: string;
  organizationName?: string;
  status: 'healthy' | 'degraded' | 'down';
  deviceCount: number;
  coreDevices: number;
  distributionDevices: number;
  accessDevices: number;
  isExpanded: boolean;
  zoom?: number;
  onExpand?: () => void;
  onDoubleClick?: () => void;
}

export const BuildingNode = memo(({ data, selected }: NodeProps<BuildingNodeData>) => {
  const statusColors: Record<string, string> = {
    healthy: 'bg-emerald-500',
    degraded: 'bg-amber-500',
    down: 'bg-red-500',
  };

  const statusBg: Record<string, string> = {
    healthy: 'bg-emerald-900/20',
    degraded: 'bg-amber-900/20',
    down: 'bg-red-900/20',
  };

  const statusBorder: Record<string, string> = {
    healthy: 'border-emerald-500/30',
    degraded: 'border-amber-500/30',
    down: 'border-red-500/30',
  };
  
  const zoom = data.zoom || 1;
  const scale = Math.max(0.6, Math.min(2.5, zoom));
    
  // Calculate dynamic dimensions and styling based on zoom
  const cardWidth = 320 * scale;
  const padding = 24 * scale;
  const fontSize = 18 * scale;
  const iconSize = 56 * scale;
  const statusHeight = 8 * scale;
  
  return (
    <div className="relative group" style={{ transform: `scale(${1/zoom < 1 ? 1 : 1/zoom})`, transformOrigin: 'center' }}>
      {/* Connection Handles */}
      <Handle type="source" position={Position.Top} id="top-source" className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white !rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md" />
      <Handle type="target" position={Position.Top} id="top-target" className="!w-3 !h-3 !bg-green-500 !border-2 !border-white !rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md" />
        
      <Handle type="source" position={Position.Right} id="right-source" className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white !rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md" />
      <Handle type="target" position={Position.Right} id="right-target" className="!w-3 !h-3 !bg-green-500 !border-2 !border-white !rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md" />
        
      <Handle type="source" position={Position.Bottom} id="bottom-source" className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white !rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md" />
      <Handle type="target" position={Position.Bottom} id="bottom-target" className="!w-3 !h-3 !bg-green-500 !border-2 !border-white !rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md" />
        
      <Handle type="source" position={Position.Left} id="left-source" className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white !rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md" />
      <Handle type="target" position={Position.Left} id="left-target" className="!w-3 !h-3 !bg-green-500 !border-2 !border-white !rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md" />
  
      {/* Building Card */}
      <div 
        className={`
          relative bg-card rounded-2xl shadow-sm border border-border
          border-2 ${selected ? 'border-blue-500 ring-4 ring-blue-900/50' : 'border-blue-800'}
          hover:border-blue-400 hover:shadow-2xl
          transition-all duration-300 cursor-pointer
          ${data.isExpanded ? 'shadow-2xl scale-105' : ''}
        `}
        style={{ 
          width: `${cardWidth}px`,
        }}
        onClick={data.onExpand}
        onDoubleClick={data.onDoubleClick}
      >
        <div className={`${statusColors[data.status] || 'bg-blue-500'} rounded-t-2xl`} style={{ height: `${statusHeight}px` }} />
        <div style={{ padding: `${padding}px` }}>
          <div className="flex items-start justify-between mb-5">
            <div className="flex-1 pr-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`rounded-full ${statusColors[data.status] || 'bg-blue-500'} animate-pulse shadow-sm`} style={{ width: `${10 * scale}px`, height: `${10 * scale}px` }} />
                <h3 className="font-bold text-white truncate" style={{ fontSize: `${fontSize}px` }}>{data.name}</h3>
              </div>
              {data.city && <p className="text-blue-300" style={{ fontSize: `${14 * scale}px` }}>{data.city}</p>}
            </div>
            <div 
              className={`rounded-xl ${statusBg[data.status] || 'bg-blue-900/20'} ${statusBorder[data.status] || 'border-blue-500/30'} border-2 flex items-center justify-center flex-shrink-0`}
              style={{ width: `${iconSize}px`, height: `${iconSize}px` }}
            >
              <svg className={`w-8 h-8 ${(statusColors[data.status] || 'bg-blue-500').replace('bg-', 'text-')}`} style={{ width: `${32 * scale}px`, height: `${32 * scale}px` }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          </div>
  
          <div className="mb-5 pb-5 border-b border-blue-800">
            <div className="text-center">
              <div className="font-bold text-white mb-1" style={{ fontSize: `${36 * scale}px` }}>{data.deviceCount}</div>
              <div className="text-blue-400 font-medium" style={{ fontSize: `${14 * scale}px` }}>Toplam Cihaz</div>
            </div>
          </div>
  
          <div className="space-y-2.5">
            <div 
              className="flex items-center justify-between bg-purple-900/20 border border-purple-500/30 rounded-lg px-3 py-2 text-purple-400 font-bold"
              style={{ fontSize: `${12 * scale}px` }}
            >
              <span>Core Şebeke</span>
              <span>{data.coreDevices}</span>
            </div>
            <div 
              className="flex items-center justify-between bg-blue-900/20 border border-blue-500/30 rounded-lg px-3 py-2 text-blue-400 font-bold"
              style={{ fontSize: `${12 * scale}px` }}
            >
              <span>Dağıtım</span>
              <span>{data.distributionDevices}</span>
            </div>
            <div 
              className="flex items-center justify-between bg-emerald-900/20 border border-emerald-500/30 rounded-lg px-3 py-2 text-emerald-400 font-bold"
              style={{ fontSize: `${12 * scale}px` }}
            >
              <span>Erişim Katmanı</span>
              <span>{data.accessDevices}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

BuildingNode.displayName = 'BuildingNode';
