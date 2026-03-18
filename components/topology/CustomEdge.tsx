'use client';

import React from 'react';
import { EdgeProps, getStraightPath, getBezierPath, EdgeLabelRenderer } from 'reactflow';

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
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
              backgroundColor: 'white',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 'bold',
              color: '#374151',
              border: '1px solid #e5e7eb',
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

// Building connection edge — compact label, curved path
export const BuildingConnectionEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    curvature: 0.35,
  });

  const strokeColor = data?.strokeColor || '#6B7280';
  const textColor = data?.textColor || '#4B5563';
  const bgColor = data?.bgColor || 'white';

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
              style={{
                backgroundColor: bgColor,
                border: `1.5px solid ${strokeColor}`,
                borderRadius: '6px',
                padding: '4px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
              }}
            >
              {(() => {
                const chars = [...data.label];
                const icon = chars[0];
                const rest = chars.slice(1).join('').trim();
                return (
                  <>
                    <span style={{ fontSize: '14px', lineHeight: '1' }}>{icon}</span>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: textColor,
                        letterSpacing: '-0.2px',
                      }}
                    >
                      {rest}
                    </span>
                  </>
                );
              })()}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};
