'use client';

import { BUILDING_CONNECTION_TYPES } from '@/lib/topology/building-connection-options';
import { connectionState } from '@/lib/topology/workspace';
import type { BuildingConnection } from '@/types';
import { ConnectionTooltip } from './ConnectionTooltip';
import type { ComponentProps } from 'react';

export function BuildingConnectionTooltip({ connection, ...props }: Omit<ComponentProps<typeof ConnectionTooltip>, 'details'> & { connection?: BuildingConnection }) {
  const endpoint = (source: boolean) => ({
    location: (source ? connection?.sourceBuilding?.name : connection?.destBuilding?.name) || 'Bina belirtilmemiş',
    name: (source ? connection?.deviceLink?.sourceDevice?.name : connection?.deviceLink?.targetDevice?.name) || 'Cihaz atanmamış',
    port: connection?.deviceLink?.endpoints.find(item => item.side === (source ? 0 : 1))?.portName || 'Port atanmamış',
  });
  return <ConnectionTooltip {...props} details={connection ? {
    title: 'Binalar arası bağlantı', source: endpoint(true), target: endpoint(false),
    type: BUILDING_CONNECTION_TYPES.find(item => item.value === connection.connectionType)?.label,
    bandwidth: connection.bandwidth, status: connectionState(connection.status).label,
    note: 'Düzenlemek için bağlantıya tıklayın.',
  } : undefined} />;
}
