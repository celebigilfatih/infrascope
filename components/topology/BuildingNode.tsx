'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { AlertTriangle, Building2, MapPin } from 'lucide-react';

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
  const statusStyles: Record<string, { border: string; icon: string; dot: string; label: string }> = {
    healthy: { border: 'border-emerald-500/50', icon: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', label: 'Sağlıklı' },
    degraded: { border: 'border-amber-500/60', icon: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500', label: 'Dikkat' },
    down: { border: 'border-red-500/60', icon: 'text-red-600 dark:text-red-400', dot: 'bg-red-500', label: 'Erişilemiyor' },
  };

  const zoom = data.zoom || 1;
  const scale = Math.max(0.6, Math.min(2.5, zoom));

  const iconSize = 56 * scale;
  const fontSize = 14 * scale;
  const handleClassName = '!w-2 !h-2 !border-0 !bg-transparent opacity-0';
  const status = statusStyles[data.status] || statusStyles.healthy;

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
          ${selected ? 'scale-105' : 'hover:scale-[1.03]'}
        `}
        onClick={data.onExpand}
        onDoubleClick={data.onDoubleClick}
      >
        {/* Main icon container */}
        <div
          className={`relative z-10 flex flex-shrink-0 items-center justify-center rounded-md border-2 bg-card shadow-sm transition-shadow hover:shadow-md ${status.border} ${selected ? 'ring-4 ring-primary/15' : ''}`}
          style={{
            width: `${iconSize}px`,
            height: `${iconSize}px`,
          }}
        >
          <Building2 className={status.icon} style={{ width: `${iconSize * 0.52}px`, height: `${iconSize * 0.52}px` }} />
          <span className={`absolute bottom-1.5 right-1.5 h-2.5 w-2.5 rounded-full border-2 border-card ${status.dot}`} title={status.label} />
          {(data.portDownCount || 0) > 0 && (
            <div
              className="absolute -right-3 -top-3 flex min-h-6 items-center gap-1 rounded-full border border-red-200 bg-red-600 px-2 text-xs font-semibold text-white shadow-sm"
              title={`${data.portDownCount} izlenen port down`}
            >
              <AlertTriangle className="h-3 w-3" />
              {data.portDownCount}
            </div>
          )}
        </div>

        {/* Building name */}
        <div className="relative z-20 mt-3 text-center">
          <h3 className="max-w-[180px] truncate whitespace-nowrap font-semibold text-foreground" style={{ fontSize: `${fontSize}px` }}>
            {data.name}
          </h3>
          {data.city && (
            <p className="mt-1 flex items-center justify-center gap-1 text-muted-foreground" style={{ fontSize: `${Math.max(12, fontSize * 0.78)}px` }}>
              <MapPin className="h-3 w-3" /> {data.city}
            </p>
          )}
          <p className="mt-1 text-xs font-medium text-muted-foreground">{data.deviceCount} cihaz</p>
        </div>

      </div>
    </div>
  );
});

BuildingNode.displayName = 'BuildingNode';
