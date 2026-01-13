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
  onExpand?: () => void;
  onDoubleClick?: () => void;
}

export const BuildingNode = memo(({ data, selected }: NodeProps<BuildingNodeData>) => {
  const statusColors = {
    healthy: 'bg-emerald-500',
    degraded: 'bg-amber-500',
    down: 'bg-red-500',
  };

  const statusBg = {
    healthy: 'bg-emerald-50',
    degraded: 'bg-amber-50',
    down: 'bg-red-50',
  };

  const statusBorder = {
    healthy: 'border-emerald-200',
    degraded: 'border-amber-200',
    down: 'border-red-200',
  };

  return (
    <div className="relative group">
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
          relative w-[320px] bg-white rounded-2xl shadow-lg 
          border-2 ${selected ? 'border-blue-500 ring-4 ring-blue-100' : 'border-gray-200'}
          hover:border-blue-400 hover:shadow-2xl
          transition-all duration-300 cursor-pointer
          ${data.isExpanded ? 'shadow-2xl scale-105' : ''}
        `}
        onClick={data.onExpand}
        onDoubleClick={data.onDoubleClick}
      >
        <div className={`h-2 rounded-t-2xl ${statusColors[data.status]}`} />
        <div className="p-6">
          <div className="flex items-start justify-between mb-5">
            <div className="flex-1 pr-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${statusColors[data.status]} animate-pulse shadow-sm`} />
                <h3 className="text-lg font-bold text-gray-900 truncate">{data.name}</h3>
              </div>
              {data.city && <p className="text-sm text-gray-600">{data.city}</p>}
            </div>
            <div className={`w-14 h-14 rounded-xl ${statusBg[data.status]} ${statusBorder[data.status]} border-2 flex items-center justify-center flex-shrink-0`}>
              <svg className={`w-8 h-8 ${statusColors[data.status].replace('bg-', 'text-')}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          </div>

          <div className="mb-5 pb-5 border-b border-gray-100">
            <div className="text-center">
              <div className="text-4xl font-bold text-gray-900 mb-1">{data.deviceCount}</div>
              <div className="text-sm text-gray-500 font-medium">Total Devices</div>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 text-purple-700 font-bold">
              <span>Core Network</span>
              <span>{data.coreDevices}</span>
            </div>
            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-blue-700 font-bold">
              <span>Distribution</span>
              <span>{data.distributionDevices}</span>
            </div>
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-emerald-700 font-bold">
              <span>Access Layer</span>
              <span>{data.accessDevices}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

BuildingNode.displayName = 'BuildingNode';
