'use client';

import React from 'react';
import { BaseEdge, EdgeProps, getBezierPath, getStraightPath, EdgeLabelRenderer } from 'reactflow';
import { connectionState } from '@/lib/topology/workspace';
import { connectionEmphasisStyle } from '@/lib/topology/connection-emphasis';
import { BuildingConnectionTooltip } from './BuildingConnectionTooltip';
import { ConnectionTooltip, useConnectionTooltip, type ConnectionTooltipDetails } from './ConnectionTooltip';
import type { DeviceRoute, TopologyRoute } from '@/lib/topology/device-routing';
import { TopologyMenuButton } from './TopologyObjectMenu';

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
  const tooltip = useConnectionTooltip(data?.onHoverChange);
  const details = data?.connectionTooltip as ConnectionTooltipDetails | undefined;
  const route = data?.deviceRoute as DeviceRoute | undefined;
  const overviewOffset = data?.overviewOffset;
  const distance = Math.max(1, Math.hypot(targetX - sourceX, targetY - sourceY));
  const controlX = (sourceX + targetX) / 2 - (targetY - sourceY) / distance * (overviewOffset || 0);
  const controlY = (sourceY + targetY) / 2 + (targetX - sourceX) / distance * (overviewOffset || 0);
  const [edgePath, labelX, labelY] = route ? [route.path, route.label.x, route.label.y] : typeof overviewOffset === 'number'
    ? [`M ${sourceX} ${sourceY} Q ${controlX} ${controlY} ${targetX} ${targetY}`, (sourceX + 2 * controlX + targetX) / 4, (sourceY + 2 * controlY + targetY) / 4]
    : getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const state = connectionState(data?.status);
  const strokeColor = data?.connectionColor || state.color;
  const emphasis = connectionEmphasisStyle(data?.connectionEmphasis, selected ? (data?.connectionColor ? 5 : 4) : (data?.connectionColor ? 3 : 2), typeof style.opacity === 'number' ? style.opacity : 1, !!tooltip.anchor || !!selected, data?.hoverActive);
  const currentStyle = {
    ...style,
    stroke: strokeColor, strokeDasharray: state.dash, strokeWidth: emphasis.strokeWidth, opacity: emphasis.opacity,
  };

  return (
    <>
      <g onMouseEnter={details ? tooltip.enter : undefined} onMouseMove={details ? tooltip.show : undefined} onMouseLeave={details ? tooltip.leave : undefined} onClick={tooltip.close} onContextMenu={tooltip.close} aria-describedby={tooltip.anchor ? tooltip.id : undefined}>
      <BaseEdge
        id={id}
        style={currentStyle}
        path={edgePath}
        interactionWidth={28}
        markerEnd={markerEnd}
      />
      </g>
      {data?.label && data?.showLabels !== false && !data?.labelBlocked && (!data?.autoHideLabel || tooltip.anchor || selected) && (
        <EdgeLabelRenderer>
          <div
            data-device-link-label={data?.compactLabel ? id : undefined}
            className="rounded-md border bg-card px-2 py-1 text-xs font-medium text-foreground shadow-sm"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
              ...(data?.compactLabel ? { maxWidth: 220, whiteSpace: 'normal' as const, overflowWrap: 'anywhere' as const, textAlign: 'center' as const } : {}),
              borderColor: strokeColor,
              opacity: emphasis.labelOpacity,
              zIndex: details ? 6 : undefined,
            }}
          >
            {details ? <button type="button" className={`nodrag nopan rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${data?.compactLabel ? 'line-clamp-2' : ''}`} style={{ pointerEvents: 'all' }} aria-label={`${details.source.name} (${details.source.port || 'Port belirtilmemiş'}) – ${details.target.name} (${details.target.port || 'Port belirtilmemiş'}) bağlantı bilgileri`} aria-describedby={tooltip.anchor ? tooltip.id : undefined} onMouseEnter={tooltip.enter} onMouseMove={tooltip.show} onMouseLeave={tooltip.leave} onFocus={tooltip.focus} onBlur={tooltip.blur} onClick={event => { event.stopPropagation(); tooltip.close(); data.onInspect?.(); }}>{data.label}</button> : data.label}
            {data?.onOpenMenu && <TopologyMenuButton name={details ? `${details.source.name} – ${details.target.name}` : 'Cihaz bağlantısı'} onOpen={event => { tooltip.close(); data.onOpenMenu(event); }} />}
          </div>
        </EdgeLabelRenderer>
      )}
      <ConnectionTooltip id={tooltip.id} anchor={tooltip.anchor} container={tooltip.container} details={details} onMouseEnter={tooltip.keepOpen} onMouseLeave={tooltip.leaveTooltip} />
    </>
  );
};

// Building connection edge — obstacle-aware route, compact label
export const BuildingConnectionEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
}: EdgeProps) => {
  const tooltip = useConnectionTooltip(data?.onHoverChange);
  const route = data?.buildingRoute as TopologyRoute | undefined;
  const [edgePath, labelX, labelY] = route ? [route.path, route.label.x, route.label.y] : getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  if (data?.routeBlocked) return null;

  const strokeColor = data?.strokeColor || '#6B7280';
  const textColor = data?.textColor || '#4B5563';
  const emphasis = connectionEmphasisStyle(data?.connectionEmphasis, selected ? 5 : data?.strokeWidth || 2, .85, !!tooltip.anchor || !!selected, data?.hoverActive);

  return (
    <>
      <g onMouseEnter={tooltip.enter} onMouseMove={tooltip.show} onMouseLeave={tooltip.leave} onClick={tooltip.close} onContextMenu={tooltip.close} aria-describedby={tooltip.anchor ? tooltip.id : undefined}>
        <BaseEdge
          id={id}
          style={{
            stroke: strokeColor,
            strokeWidth: emphasis.strokeWidth,
            strokeDasharray: data?.strokeDasharray || '0',
            opacity: emphasis.opacity,
          }}
          path={edgePath}
          interactionWidth={28}
        />
      </g>
      {data?.label && data?.showLabels !== false && !data?.labelBlocked && (!data?.autoHideLabel || tooltip.anchor || selected) && (
        <EdgeLabelRenderer>
          <div
            data-building-link-label={id}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
              display: 'flex',
              zIndex: 6,
              alignItems: 'center',
              justifyContent: 'center',
              maxWidth: 220,
              whiteSpace: 'normal',
              overflowWrap: 'anywhere',
              textAlign: 'center',
              opacity: emphasis.labelOpacity,
            }}
          >
            <button
              type="button"
              className="nodrag nopan flex items-center rounded-md border bg-card px-2.5 py-1 text-xs font-semibold shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={`${data.buildingConnection?.sourceBuilding?.name || 'Kaynak bina'} – ${data.buildingConnection?.destBuilding?.name || 'Hedef bina'} bağlantısını düzenle`}
              aria-describedby={tooltip.anchor ? tooltip.id : undefined}
              onMouseEnter={tooltip.enter}
              onMouseMove={tooltip.show}
              onMouseLeave={tooltip.leave}
              onFocus={tooltip.focus}
              onBlur={tooltip.blur}
              onClick={event => { event.stopPropagation(); tooltip.close(); data.onEdit?.(); }}
              style={{
                borderColor: strokeColor,
                pointerEvents: 'all',
              }}
            >
              <span className="line-clamp-2" style={{ color: textColor }}>{data.label}</span>
            </button>
            {data?.onOpenMenu && <TopologyMenuButton name={`${data.buildingConnection?.sourceBuilding?.name || 'Kaynak bina'} – ${data.buildingConnection?.destBuilding?.name || 'Hedef bina'}`} onOpen={event => { tooltip.close(); data.onOpenMenu(event); }} />}
          </div>
        </EdgeLabelRenderer>
      )}
      <BuildingConnectionTooltip id={tooltip.id} anchor={tooltip.anchor} container={tooltip.container} connection={data?.buildingConnection} onMouseEnter={tooltip.keepOpen} onMouseLeave={tooltip.leaveTooltip} />
    </>
  );
};
