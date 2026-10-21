'use client';

import { getBezierPath, type EdgeProps } from 'reactflow';
import { BuildingConnectionEdge } from './CustomEdge';

export function BuildingOverviewEdge(props: EdgeProps) {
  const [path, x, y] = getBezierPath({ sourceX: props.sourceX, sourceY: props.sourceY, targetX: props.targetX, targetY: props.targetY, sourcePosition: props.sourcePosition, targetPosition: props.targetPosition, curvature: .18 });
  return <BuildingConnectionEdge {...props} data={{ ...props.data, buildingRoute: { path, label: { x, y }, points: [] }, routeBlocked: false, labelBlocked: false, autoHideLabel: true }} />;
}
