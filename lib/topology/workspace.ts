export interface TopologyConnection {
  recordingSource?: 'DRAWIO';
  id: string;
  sourceDeviceId: string;
  targetDeviceId: string;
  sourceInterfaceId?: string;
  targetInterfaceId?: string;
  sourcePortName?: string;
  targetPortName?: string;
  name?: string | null;
  type?: string;
  bandwidth?: string;
  status: string;
}

export interface TopologyWireConnection {
  recordingSource?: 'DRAWIO';
  id: string;
  name?: string | null;
  type?: string;
  status: string;
  sourceDeviceId?: string;
  targetDeviceId?: string;
  sourcePortName?: string;
  targetPortName?: string;
  bandwidth?: string;
  sourceInterfaceId?: string | null;
  destInterfaceId?: string | null;
  sourcePort?: {
    name?: string;
    switchDevice?: { id: string };
    networkInterface?: { id?: string; name?: string; device?: { id: string } } | null;
  } | null;
  sourceInterface?: { id?: string; name?: string; device?: { id: string } } | null;
}

// The Connection model links a switch port to sourceInterface (or the port's
// connected interface). destInterfaceId is an unjoined legacy scalar: it must
// not be used as a different endpoint or attributed to the switch device.
export function normalizeTopologyConnections(rows: TopologyWireConnection[]): TopologyConnection[] {
  return rows.flatMap<TopologyConnection>(row => {
    if (row.sourceDeviceId && row.targetDeviceId && row.sourceDeviceId !== row.targetDeviceId) return [{ id: row.id, sourceDeviceId: row.sourceDeviceId, targetDeviceId: row.targetDeviceId, sourcePortName: row.sourcePortName, targetPortName: row.targetPortName, type: row.type, bandwidth: row.bandwidth, status: row.status, ...(row.recordingSource ? { recordingSource: row.recordingSource } : {}) }];
    const source = row.sourcePort?.switchDevice?.id;
    const peer = row.sourceInterface?.device?.id ? row.sourceInterface : row.sourcePort?.networkInterface;
    const target = peer?.device?.id;
    if (!source || !target || source === target) return [];
    return [{
      id: row.id, name: row.name, type: row.type, status: row.status,
      sourceDeviceId: source, targetDeviceId: target,
      targetInterfaceId: peer?.id,
      sourcePortName: row.sourcePort?.name, targetPortName: peer?.name,
    }];
  });
}

export function connectionState(value?: string | null) {
  switch (value?.trim().toUpperCase()) {
    case 'UP': case 'ACTIVE': return { key: 'up', label: 'Bağlantı açık', tone: 'success', color: '#16804a', dash: undefined } as const;
    case 'DOWN': case 'INACTIVE': return { key: 'down', label: 'Bağlantı kapalı', tone: 'danger', color: '#dc4343', dash: '7 4' } as const;
    case 'MAINTENANCE': return { key: 'maintenance', label: 'Bakımda', tone: 'warning', color: '#b77914', dash: '7 4' } as const;
    case 'DORMANT': return { key: 'dormant', label: 'Beklemede', tone: 'warning', color: '#b77914', dash: '3 5' } as const;
    case 'PLANNED': return { key: 'planned', label: 'Planlandı', tone: 'info', color: '#3577b8', dash: '3 5' } as const;
    case 'DECOMMISSIONED': return { key: 'retired', label: 'Devre dışı', tone: 'neutral', color: '#7c8593', dash: '3 5' } as const;
    default: return { key: 'unknown', label: 'Durum bilinmiyor', tone: 'neutral', color: '#7c8593', dash: '3 5' } as const;
  }
}

export function deviceConnectionEdge(connection: TopologyConnection) {
  const state = connectionState(connection.status);
  return {
    id: connection.id, source: connection.sourceDeviceId, target: connection.targetDeviceId,
    type: 'custom', focusable: true, ariaLabel: `Cihaz bağlantısı: ${connection.sourcePortName || 'Port belirtilmemiş'} – ${connection.targetPortName || 'Port belirtilmemiş'}, ${state.label}`,
    style: { stroke: state.color, strokeWidth: 2, strokeDasharray: state.dash },
    data: { connectionId: connection.id, status: connection.status, label: state.label },
  };
}

/** Place connected peers in layers; isolated inventory remains a compact grid. */
export function deviceGraphPositions(ids: string[], connections: TopologyConnection[], compact = false) {
  const neighbors = new Map(ids.map(id => [id, new Set<string>()]));
  for (const link of connections) {
    if (!neighbors.has(link.sourceDeviceId) || !neighbors.has(link.targetDeviceId)) continue;
    neighbors.get(link.sourceDeviceId)!.add(link.targetDeviceId);
    neighbors.get(link.targetDeviceId)!.add(link.sourceDeviceId);
  }
  const positions: Record<string, { x: number; y: number }> = {};
  const roots = [...ids].sort((a, b) => neighbors.get(b)!.size - neighbors.get(a)!.size);
  const visited = new Set<string>();
  let offset = 0;
  for (const root of roots) {
    if (visited.has(root) || !neighbors.get(root)!.size) continue;
    const layers: string[][] = [[root]];
    visited.add(root);
    for (let level = 0; level < layers.length; level++) {
      const next: string[] = [];
      for (const id of layers[level]) for (const peer of neighbors.get(id)!) {
        if (!visited.has(peer)) { visited.add(peer); next.push(peer); }
      }
      if (next.length) layers.push(next);
    }
    const width = Math.max(...layers.map(layer => layer.length)) * 310;
    layers.forEach((layer, row) => layer.forEach((id, column) => {
      positions[id] = { x: (width - layer.length * 310) / 2 + column * 310, y: offset + row * 360 };
    }));
    offset += layers.length * 360 + 80;
  }
  const columns = compact ? 2 : 4;
  ids.filter(id => !visited.has(id)).forEach((id, index) => {
    positions[id] = { x: index % columns * 310, y: offset + Math.floor(index / columns) * 360 };
  });
  return positions;
}
