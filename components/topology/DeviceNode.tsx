'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

interface DeviceNodeData {
  deviceId: string;
  name: string;
  type: string;
  role: string;
  status: 'active' | 'inactive' | 'maintenance' | 'error';
  ipAddress?: string;
  ports?: number;
  activeConnections?: number;
  buildingName?: string;
  location?: string;
}

export const DeviceNode = memo(({ data, selected }: NodeProps<DeviceNodeData>) => {
  const statusColors = {
    active: 'bg-emerald-500',
    inactive: 'bg-gray-400',
    maintenance: 'bg-amber-500',
    error: 'bg-red-500',
  };

  return (
    <div className={`
      relative p-4 rounded-xl bg-white border-2 transition-all duration-200 w-[240px]
      ${selected ? 'border-blue-500 ring-4 ring-blue-100 shadow-xl scale-105' : 'border-gray-200 shadow-md'}
      hover:border-blue-400 hover:shadow-lg
    `}>
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-blue-400 !border-2 !border-white" />
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-blue-600 !border-2 !border-white" />
      
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-3 h-3 rounded-full ${statusColors[data.status]}`} />
        <h3 className="font-bold text-gray-900 truncate flex-1">{data.name}</h3>
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex justify-between text-gray-500">
          <span>Type</span>
          <span className="font-medium text-gray-700">{data.type}</span>
        </div>
        <div className="flex justify-between text-gray-500">
          <span>IP Address</span>
          <span className="font-medium text-gray-700 font-mono">{data.ipAddress || 'N/A'}</span>
        </div>
        <div className="flex justify-between text-gray-500">
          <span>Location</span>
          <span className="font-medium text-gray-700 truncate max-w-[120px]">{data.location || 'N/A'}</span>
        </div>
      </div>

      {data.ports !== undefined && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-gray-400">
          <span>{data.ports} Ports</span>
          <span className="text-blue-600">{data.activeConnections || 0} Active</span>
        </div>
      )}
    </div>
  );
});

DeviceNode.displayName = 'DeviceNode';
