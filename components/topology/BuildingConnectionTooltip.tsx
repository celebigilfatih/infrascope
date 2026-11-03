'use client';

import { connectionState } from '@/lib/topology/workspace';
import type { BuildingConnection } from '@/types';
import { TopologyTooltipSurface } from './ConnectionTooltip';
import type { ComponentProps } from 'react';

export function BuildingConnectionTooltip({ connection, ...props }: Omit<ComponentProps<typeof TopologyTooltipSurface>, 'children' | 'className'> & { connection?: BuildingConnection }) {
  if (!connection) return null;
  const source = connection.sourceBuilding?.name || 'Kaynak bina';
  const target = connection.destBuilding?.name || 'Hedef bina';
  return (
    <TopologyTooltipSurface {...props} className="pointer-events-none! max-w-80 px-3 py-1.5 text-xs">
      <p className="truncate">
        <span className="font-semibold">{source} ↔ {target}</span>
        <span className="text-muted-foreground"> · {connectionState(connection.status).label}</span>
      </p>
    </TopologyTooltipSurface>
  );
}
