'use client';

import { BaseEdge, type EdgeProps } from 'reactflow';
import { connectionEmphasisStyle } from '@/lib/topology/connection-emphasis';
import { BuildingConnectionEdge } from './CustomEdge';

export function BuildingOverviewEdge(props: EdgeProps) {
  if (!props.data?.buildingRoute || props.data.routeBlocked) return null;
  if (props.data.isNetworkGroupRelation) {
    const emphasis = connectionEmphasisStyle(props.data.connectionEmphasis, 1.8);
    return <BaseEdge id={props.id} path={props.data.buildingRoute.path} style={{ ...props.style, strokeWidth: emphasis.strokeWidth, opacity: emphasis.opacity }} interactionWidth={28} />;
  }
  return <BuildingConnectionEdge {...props} />;
}
