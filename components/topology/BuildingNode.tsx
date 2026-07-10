'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { AlertTriangle, Info, Building2 } from 'lucide-react';

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
  portDownCount?: number;
  isExpanded: boolean;
  zoom?: number;
  onExpand?: () => void;
  onDoubleClick?: () => void;
  onShowDetails?: () => void;
}

export const BuildingNode = memo(({ data, selected }: NodeProps<BuildingNodeData>) => {
  const statusColors: Record<string, string> = {
    healthy: 'bg-emerald-500',
    degraded: 'bg-orange-500',
    down: 'bg-red-500',
  };

  const statusBorder: Record<string, string> = {
    healthy: 'border-emerald-500',
    degraded: 'border-orange-500',
    down: 'border-red-500',
  };

  const zoom = data.zoom || 1;
  const scale = Math.max(0.6, Math.min(2.5, zoom));

  const iconSize = 48 * scale;
  const fontSize = 14 * scale;
  const handleClassName = '!w-2 !h-2 !border-0 !bg-transparent opacity-0';

  return (
    <div
      className="relative group"
      style={{
        width: `${iconSize}px`,
        transform: `scale(${1 / zoom < 1 ? 1 : 1 / zoom})`,
        transformOrigin: 'center',
      }}
    >
      {/* Connection handles are anchored to the icon box, not the text label. */}
      <div
        className="absolute pointer-events-none"
        style={{ width: `${iconSize}px`, height: `${iconSize}px`, left: 0, top: 0 }}
      >
        {/* Top handle */}
        <Handle
          type="source"
          position={Position.Top}
          id="top-source"
          className={handleClassName}
          style={{ left: '50%', top: 0 }}
        />
        <Handle
          type="target"
          position={Position.Top}
          id="top-target"
          className={handleClassName}
          style={{ left: '50%', top: 0 }}
        />
        
        {/* Right handle */}
        <Handle
          type="source"
          position={Position.Right}
          id="right-source"
          className={handleClassName}
          style={{ right: 0, top: '50%' }}
        />
        <Handle
          type="target"
          position={Position.Right}
          id="right-target"
          className={handleClassName}
          style={{ right: 0, top: '50%' }}
        />
        
        {/* Bottom handle */}
        <Handle
          type="source"
          position={Position.Bottom}
          id="bottom-source"
          className={handleClassName}
          style={{ left: '50%', bottom: 0 }}
        />
        <Handle
          type="target"
          position={Position.Bottom}
          id="bottom-target"
          className={handleClassName}
          style={{ left: '50%', bottom: 0 }}
        />
        
        {/* Left handle */}
        <Handle
          type="source"
          position={Position.Left}
          id="left-source"
          className={handleClassName}
          style={{ left: 0, top: '50%' }}
        />
        <Handle
          type="target"
          position={Position.Left}
          id="left-target"
          className={handleClassName}
          style={{ left: 0, top: '50%' }}
        />
      </div>

      {/* Simplified Building Node - Icon + Name */}
      <div
        className={`
          relative flex flex-col items-center justify-center
          cursor-pointer transition-all duration-300
          group/node
          ${selected ? 'scale-110' : 'hover:scale-110'}
        `}
        onClick={data.onExpand}
        onDoubleClick={data.onDoubleClick}
      >
        {/* Main icon container */}
        <div
          className={`relative z-10 rounded-xl border-2 ${statusBorder[data.status] || 'border-blue-500'} ${statusColors[data.status] || 'bg-blue-500'} backdrop-blur-sm
            flex items-center justify-center flex-shrink-0
            hover:opacity-80 transition-all
            group/icon
          `}
          style={{
            width: `${iconSize}px`,
            height: `${iconSize}px`,
          }}
        >
          <Building2 className="text-white" style={{ width: `${iconSize * 0.6}px`, height: `${iconSize * 0.6}px` }} />
          {(data.portDownCount || 0) > 0 && (
            <div
              className="absolute -right-2 -top-2 flex items-center gap-1 rounded-full border border-red-200 bg-red-600 px-2 py-1 text-[10px] font-bold text-white shadow-lg shadow-red-500/30"
              title={`${data.portDownCount} izlenen port down`}
            >
              <AlertTriangle className="h-3 w-3" />
              {data.portDownCount}
            </div>
          )}
        </div>

        {/* Building name */}
        <div className="relative z-20 mt-3 text-center">
          <h3 className="font-bold text-black whitespace-nowrap" style={{ fontSize: `${fontSize}px` }}>
            {data.name}
          </h3>
          {data.city && (
            <p className="text-gray-600 text-xs mt-0.5" style={{ fontSize: `${fontSize * 0.7}px` }}>
              {data.city}
            </p>
          )}
        </div>

        {/* Info button - always visible */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            data.onShowDetails?.();
          }}
          className="absolute top-0 right-0 p-1.5 rounded-full bg-blue-500/40 border border-blue-400/50 hover:bg-blue-500/60 transition-colors z-20 opacity-0 group-hover/node:opacity-100"
          title="Detayları Göster"
          style={{
            transform: 'translate(50%, -50%)',
          }}
        >
          <Info className="text-blue-200" style={{ width: `${12 * scale}px`, height: `${12 * scale}px` }} />
        </button>
      </div>
    </div>
  );
});

BuildingNode.displayName = 'BuildingNode';
