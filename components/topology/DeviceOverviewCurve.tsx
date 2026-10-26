'use client';

import { getBezierPath, type EdgeProps } from 'reactflow';
import { CustomEdge } from './CustomEdge';

/** Share the building overview's soft curves while retaining device inspectors. */
export function DeviceOverviewCurve(props: EdgeProps) {
  const [path, x, y] = getBezierPath({ sourceX: props.sourceX, sourceY: props.sourceY, targetX: props.targetX, targetY: props.targetY, sourcePosition: props.sourcePosition, targetPosition: props.targetPosition, curvature: .18 });
  const lane = props.data?.curveLane || 0;
  const length = Math.max(1, Math.hypot(props.targetX - props.sourceX, props.targetY - props.sourceY));
  const cx = (props.sourceX + props.targetX) / 2 - (props.targetY - props.sourceY) / length * lane;
  const cy = (props.sourceY + props.targetY) / 2 + (props.targetX - props.sourceX) / length * lane;
  const route = lane ? { path: `M ${props.sourceX} ${props.sourceY} Q ${cx} ${cy} ${props.targetX} ${props.targetY}`, label: { x: (props.sourceX + 2 * cx + props.targetX) / 4, y: (props.sourceY + 2 * cy + props.targetY) / 4 }, points: [] }
    : { path, label: { x, y }, points: [] };
  return <CustomEdge {...props} data={{ ...props.data, deviceRoute: route, routeBlocked: false }} />;
}
