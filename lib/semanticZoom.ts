export const getZoomConfig = (zoom: number) => {
  return {
    showFloors: zoom > 0.5,
    showRooms: zoom > 0.8,
    showRacks: zoom > 1.2,
    showDevices: zoom > 1.5,
  };
};

export const filterNodesByZoom = <T extends { type?: string; data: { alwaysVisible?: boolean; hierarchyLevel?: string } }>(nodes: T[], config: ReturnType<typeof getZoomConfig>) => {
  return nodes.filter(node => {
    if (node.data?.alwaysVisible) return true;
    if (node.data.hierarchyLevel === 'floor') return config.showFloors;
    if (node.data.hierarchyLevel === 'room') return config.showRooms;
    if (node.data.hierarchyLevel === 'rack') return config.showRacks;
    if (node.type === 'device') return config.showDevices;
    return true;
  });
};

export const filterEdgesByZoom = <T extends { source: string; target: string }>(edges: T[], visibleNodes: Array<{ id: string }>) => {
  const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
  return edges.filter(edge => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target));
};

export const getZoomLevelDescription = (zoom: number) => {
  if (zoom < 0.5) return 'World View';
  if (zoom < 0.8) return 'Building View';
  if (zoom < 1.2) return 'Floor View';
  if (zoom < 1.5) return 'Room View';
  return 'Detailed View';
};
