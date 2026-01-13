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
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
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

// Building connection edge with large, prominent labels
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

  // Get colors from data or use defaults
  const strokeColor = data?.strokeColor || '#6B7280';
  const textColor = data?.textColor || '#6B7280';
  const bgColor = data?.bgColor || 'white';

  return (
    <>
      <path
        id={id}
        style={{
          stroke: strokeColor,
          strokeWidth: data?.strokeWidth || 3,
          strokeDasharray: data?.strokeDasharray || '0',
        }}
        className="react-flow__edge-path"
        d={edgePath}
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            {/* Label background with border */}
            <div
              style={{
                backgroundColor: bgColor,
                border: `2.5px solid ${strokeColor}`,
                borderRadius: '10px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                boxShadow: '0 4px 15px rgba(0, 0, 0, 0.15)',
              }}
            >
              {(() => {
                // Correctly handle emojis that use surrogate pairs
                const chars = [...data.label];
                const icon = chars[0];
                const rest = chars.slice(1).join('').trim();
                
                return (
                  <>
                    <span
                      style={{
                        fontSize: '32px',
                        lineHeight: '1',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      {icon}
                    </span>
                    <span
                      style={{
                        fontSize: '24px',
                        fontWeight: 950,
                        color: textColor,
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                        letterSpacing: '-0.5px',
                        whiteSpace: 'nowrap',
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
