'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Info, Building2 } from 'lucide-react';

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

  return (
    <div
      className="relative group"
      style={{
        transform: `scale(${1 / zoom < 1 ? 1 : 1 / zoom})`,
        transformOrigin: 'center',
      }}
    >
      {/* Connection Handles */}
      <Handle
        type="source"
        position={Position.Top}
        id="top-source"
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white !rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top-target"
        className="!w-3 !h-3 !bg-green-500 !border-2 !border-white !rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
      />

      <Handle
        type="source"
        position={Position.Right}
        id="right-source"
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white !rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="right-target"
        className="!w-3 !h-3 !bg-green-500 !border-2 !border-white !rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
      />

      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom-source"
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white !rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="bottom-target"
        className="!w-3 !h-3 !bg-green-500 !border-2 !border-white !rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
      />

      <Handle
        type="source"
        position={Position.Left}
        id="left-source"
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white !rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left-target"
        className="!w-3 !h-3 !bg-green-500 !border-2 !border-white !rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
      />

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
