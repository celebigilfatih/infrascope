'use client';

import React from 'react';
import { BaseEdge, EdgeProps, getBezierPath, getStraightPath, EdgeLabelRenderer } from 'reactflow';
import { connectionState } from '@/lib/topology/workspace';

// Regular custom edge for device connections
export const CustomEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
  markerEnd,
  selected,
}: EdgeProps) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const state = connectionState(data?.status);
  const currentStyle = {
    ...style,
    stroke: state.color, strokeDasharray: state.dash, strokeWidth: selected ? 4 : 2,
  };

  return (
    <>
      <BaseEdge
        id={id}
        style={currentStyle}
        path={edgePath}
        interactionWidth={28}
        markerEnd={markerEnd}
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            className="rounded-md border bg-card px-2 py-1 text-xs font-medium text-foreground shadow-sm"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
              borderColor: state.color,
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
  selected,
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
      <BaseEdge
        id={id}
        style={{
          stroke: strokeColor,
          strokeWidth: selected ? 5 : data?.strokeWidth || 2,
          strokeDasharray: data?.strokeDasharray || '0',
          opacity: 0.85,
        }}
        path={edgePath}
        interactionWidth={28}
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
