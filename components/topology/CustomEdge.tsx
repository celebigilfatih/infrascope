'use client';

import React from 'react';
import { EdgeProps, getStraightPath, EdgeLabelRenderer } from 'reactflow';

// Regular custom edge for device connections
export const CustomEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style = {},
  data,
  markerEnd,
}: EdgeProps) => {
  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  const connectionTypeStyles: Record<string, any> = {
    fiber: { stroke: '#DC2626', strokeWidth: 3 },
    copper: { stroke: '#16A34A', strokeWidth: 2 },
    wireless: { stroke: '#2563EB', strokeWidth: 2, strokeDasharray: '5,5' },
    vpn: { stroke: '#9333EA', strokeWidth: 2, strokeDasharray: '10,5' },
    building: { stroke: '#7C3AED', strokeWidth: 4 },
  };

  const currentStyle = {
    ...style,
    ...(data?.connectionType ? connectionTypeStyles[data.connectionType] : {}),
  };

  return (
    <>
      <path
        id={id}
        style={currentStyle}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            className="rounded border border-border bg-card px-2 py-1 text-xs font-medium text-foreground shadow-sm"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

// Building connection edge — straight line, compact label
export const BuildingConnectionEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps) => {
  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  const strokeColor = data?.strokeColor || '#6B7280';
  const textColor = data?.textColor || '#4B5563';

  return (
    <>
      <path
        id={id}
        style={{
          stroke: strokeColor,
          strokeWidth: data?.strokeWidth || 2,
          strokeDasharray: data?.strokeDasharray || '0',
          opacity: 0.85,
        }}
        className="react-flow__edge-path"
        d={edgePath}
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            <div
              className="flex items-center rounded-md border bg-card px-2.5 py-1 text-xs font-semibold shadow-sm"
              style={{
                borderColor: strokeColor,
              }}
            >
              <span style={{ color: textColor }}>{data.label}</span>
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};
