'use client';

import { BaseEdge, type EdgeProps } from 'reactflow';
import { BuildingConnectionEdge } from './CustomEdge';

export function BuildingOverviewEdge(props: EdgeProps) {
  if (!props.data?.buildingRoute || props.data.routeBlocked) return null;
  if (props.data.isNetworkGroupRelation) return <BaseEdge id={props.id} path={props.data.buildingRoute.path} style={props.style} interactionWidth={28} />;
  return <BuildingConnectionEdge {...props} />;
}
