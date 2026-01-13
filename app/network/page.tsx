'use client';

import { Header } from '../../components/layout/Header';
import React, { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../../lib/api';
// axios removed because it was unused
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Panel,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { BuildingNode } from '../../components/topology/BuildingNode';
import { DeviceNode } from '../../components/topology/DeviceNode';
import { CustomEdge, BuildingConnectionEdge } from '../../components/topology/CustomEdge';
import { SemanticZoomController } from '../../components/topology/SemanticZoomController';
import { ConnectionWizard } from '../../components/topology/ConnectionWizard';
import { getZoomConfig, filterNodesByZoom, filterEdgesByZoom } from '../../lib/semanticZoom';
import { getDeviceRole, getDevicePositionWeight } from '../../lib/deviceRoleMapper';

interface Device {
  id: string;
  name: string;
  type: string;
  status: string;
  criticality: string;
  rackId?: string;
  rack?: {
    id: string;
    name: string;
    room?: {
      id: string;
      name: string;
      floor?: {
        id: string;
        name: string;
        floorNumber: number;
        building?: {
          id: string;
          name: string;
          city?: string;
          organizationId: string;
        };
      };
    };
  };
  networkInterfaces?: Array<{
    id: string;
    name: string;
    ipv4?: string;
    macAddress?: string;
    status: string;
  }>;
}

interface Service {
  id: string;
  name: string;
  type: string;
  status: string;
  port: number;
  protocol: string;
  deviceId: string;
}

interface NetworkConnection {
  id: string;
  sourceDeviceId: string;
  targetDeviceId: string;
  sourceInterfaceId?: string;
  targetInterfaceId?: string;
  status: string;
}

interface Organization {
  id: string;
  name: string;
  code: string;
  buildings?: Building[];
}

interface Building {
  id: string;
  name: string;
  city?: string;
  organizationId: string;
  floors?: Floor[];
}

interface Floor {
  id: string;
  name: string;
  floorNumber: number;
  buildingId: string;
  rooms?: Room[];
}

interface Room {
  id: string;
  name: string;
  floorId: string;
  racks?: Rack[];
}

interface Rack {
  id: string;
  name: string;
  type: string;
  maxUnits: number;
  roomId: string;
  devices?: Device[];
}

// Custom node types for Building View
const nodeTypes = {
  building: BuildingNode,
  device: DeviceNode,
};

// Custom edge types
const edgeTypes = {
  custom: CustomEdge,
  building: BuildingConnectionEdge,
};

const NetworkTopologyPage = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [connections, setConnections] = useState<NetworkConnection[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [viewMode, setViewMode] = useState<'logical' | 'physical' | 'services' | 'hierarchy' | 'zoom' | 'building'>('building');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  
  // Zoom view state
  const [zoomLevel, setZoomLevel] = useState<'building' | 'floor' | 'room' | 'rack' | 'device'>('building');
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<Floor | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [selectedRack, setSelectedRack] = useState<Rack | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ level: string; name: string; id: string }>>([]);
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDeviceType, setFilterDeviceType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCriticality, setFilterCriticality] = useState<string>('all');
  
  // Hierarchical navigation state
  const [navigationPath, setNavigationPath] = useState<Array<{ type: string; name: string; id: string }>>([]);
  // const [focusedContainer, setFocusedContainer] = useState<{ type: string; name: string; id: string } | null>(null);
  
  // Building connection modal state
  const [showBuildingConnectionModal, setShowBuildingConnectionModal] = useState(false);
  const [buildingConnectionToEdit, setBuildingConnectionToEdit] = useState<any | null>(null);
  const [buildingConnections, setBuildingConnections] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [showManagementModal, setShowManagementModal] = useState(false);
  
  // Progressive zoom state for logical view
  const [currentZoom, setCurrentZoom] = useState(1);
  
  // Building view state - for new building-centric topology
  const [semanticZoom, setSemanticZoom] = useState(1);
  const [expandedBuildings, setExpandedBuildings] = useState<Set<string>>(new Set());
  // const [focusedBuildingId, setFocusedBuildingId] = useState<string | null>(null);
  const [showConnectionWizard, setShowConnectionWizard] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [devicesRes, servicesRes, _connectionsRes, orgsRes, buildingConnsRes]: any = await Promise.all([
        apiGet('/api/devices'),
        apiGet('/api/services'),
        apiGet('/api/network-connections'),
        apiGet('/api/organizations'),
        apiGet('/api/building-connections'),
      ]);

      if (devicesRes.success) setDevices(devicesRes.data);
      if (servicesRes.success) setServices(servicesRes.data);
      if (orgsRes.success) {
        setOrganizations(orgsRes.data);
        // Extract all buildings from organizations
        const allBuildings: Building[] = [];
        orgsRes.data.forEach((org: Organization) => {
          if (org.buildings) {
            allBuildings.push(...org.buildings);
          }
        });
        setBuildings(allBuildings);
      }
      if (buildingConnsRes.success && buildingConnsRes.data?.items) {
        setBuildingConnections(buildingConnsRes.data.items);
      }

      const mockConnections: NetworkConnection[] = [];
      if (devicesRes.success) {
        const deviceIds = devicesRes.data.map((d: any) => d.id);
        for (let i = 0; i < Math.min(deviceIds.length - 1, 5); i++) {
          mockConnections.push({
            id: `conn-${i}`,
            sourceDeviceId: deviceIds[i],
            targetDeviceId: deviceIds[i + 1],
            sourceInterfaceId: `int-${i}`,
            targetInterfaceId: `int-${i + 1}`,
            status: 'UP',
          });
        }
      }
      setConnections(mockConnections);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedItems);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedItems(newSet);
  };

  // Get unique device types for filter
  const deviceTypes = ['all', ...Array.from(new Set(devices.map(d => d.type)))];
  
  // Filter devices based on filters and search
  const filteredDevices = devices.filter(device => {
    // Search filter
    if (searchQuery && !device.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    // Type filter
    if (filterDeviceType !== 'all' && device.type !== filterDeviceType) {
      return false;
    }
    // Status filter
    if (filterStatus !== 'all' && device.status !== filterStatus) {
      return false;
    }
    // Criticality filter
    if (filterCriticality !== 'all' && device.criticality !== filterCriticality) {
      return false;
    }
    return true;
  });
  
  // Clear all filters
  const clearFilters = () => {
    setSearchQuery('');
    setFilterDeviceType('all');
    setFilterStatus('all');
    setFilterCriticality('all');
  };

  const onConnect = useCallback(
    (params: Connection) => setEdges(eds => addEdge(params, eds)),
    [setEdges]
  );

  const handleNodeClick = (node: Node) => {
    setSelectedNode(node);
    
    // Handle hierarchical navigation for group nodes
    if (node.data.isGroup && viewMode === 'logical') {
      const hierarchyLevel = node.data.hierarchyLevel;
      const containerName = node.data.label.replace(/[🏢📍🚪📦]/g, '').trim();
      
      if (hierarchyLevel === 'building') {
        // Drill into building
        // setFocusedContainer({ type: 'building', name: containerName, id: node.id });
        setNavigationPath([{ type: 'building', name: containerName, id: node.id }]);
      } else if (hierarchyLevel === 'floor') {
        // Drill into floor
        const building = navigationPath.find(p => p.type === 'building');
        if (building) {
          // setFocusedContainer({ type: 'floor', name: containerName, id: node.id });
          setNavigationPath([building, { type: 'floor', name: containerName, id: node.id }]);
        }
      } else if (hierarchyLevel === 'room') {
        // Drill into room
        const building = navigationPath.find(p => p.type === 'building');
        const floor = navigationPath.find(p => p.type === 'floor');
        if (building && floor) {
          // setFocusedContainer({ type: 'room', name: containerName, id: node.id });
          setNavigationPath([building, floor, { type: 'room', name: containerName, id: node.id }]);
        }
      } else if (hierarchyLevel === 'rack') {
        // Drill into rack
        const building = navigationPath.find(p => p.type === 'building');
        const floor = navigationPath.find(p => p.type === 'floor');
        const room = navigationPath.find(p => p.type === 'room');
        if (building && floor && room) {
          // setFocusedContainer({ type: 'rack', name: containerName, id: node.id });
          setNavigationPath([building, floor, room, { type: 'rack', name: containerName, id: node.id }]);
        }
      }
    }
  };
  
  const handleEdgeClick = (_event: React.MouseEvent, edge: Edge) => {
    // If it's a building connection edge, show its details
    if (edge.data?.type === 'building-connection' && edge.data?.buildingConnection) {
      setSelectedNode({
        id: edge.id,
        position: { x: 0, y: 0 },
        data: {
          label: 'Building Connection',
          isBuildingConnection: true,
          buildingConnection: edge.data.buildingConnection,
        },
      } as Node);
    }
  };
  
  const handleNavigateUp = () => {
    if (navigationPath.length > 0) {
      const newPath = [...navigationPath];
      newPath.pop();
      setNavigationPath(newPath);
      // setFocusedContainer(newPath.length > 0 ? newPath[newPath.length - 1] : null);
    }
  };
  
  const handleNavigateToRoot = () => {
    setNavigationPath([]);
    // setFocusedContainer(null);
  };
  
  // Zoom view navigation functions
  const handleZoomToBuilding = (building: Building) => {
    setSelectedBuilding(building);
    setSelectedFloor(null);
    setSelectedRoom(null);
    setSelectedRack(null);
    setZoomLevel('floor');
    setBreadcrumbs([{ level: 'building', name: building.name, id: building.id }]);
  };
  
  const handleZoomToFloor = (floor: Floor) => {
    setSelectedFloor(floor);
    setSelectedRoom(null);
    setSelectedRack(null);
    setZoomLevel('room');
    if (selectedBuilding) {
      setBreadcrumbs([
        { level: 'building', name: selectedBuilding.name, id: selectedBuilding.id },
        { level: 'floor', name: floor.name, id: floor.id }
      ]);
    }
  };
  
  const handleZoomToRoom = (room: Room) => {
    setSelectedRoom(room);
    setSelectedRack(null);
    setZoomLevel('rack');
    if (selectedBuilding && selectedFloor) {
      setBreadcrumbs([
        { level: 'building', name: selectedBuilding.name, id: selectedBuilding.id },
        { level: 'floor', name: selectedFloor.name, id: selectedFloor.id },
        { level: 'room', name: room.name, id: room.id }
      ]);
    }
  };
  
  const handleZoomToRack = (rack: Rack) => {
    setSelectedRack(rack);
    setZoomLevel('device');
    if (selectedBuilding && selectedFloor && selectedRoom) {
      setBreadcrumbs([
        { level: 'building', name: selectedBuilding.name, id: selectedBuilding.id },
        { level: 'floor', name: selectedFloor.name, id: selectedFloor.id },
        { level: 'room', name: selectedRoom.name, id: selectedRoom.id },
        { level: 'rack', name: rack.name, id: rack.id }
      ]);
    }
  };
  
  const handleZoomOut = () => {
    if (zoomLevel === 'device') {
      setSelectedRack(null);
      setZoomLevel('rack');
      setBreadcrumbs(breadcrumbs.slice(0, -1));
    } else if (zoomLevel === 'rack') {
      setSelectedRoom(null);
      setZoomLevel('room');
      setBreadcrumbs(breadcrumbs.slice(0, -1));
    } else if (zoomLevel === 'room') {
      setSelectedFloor(null);
      setZoomLevel('floor');
      setBreadcrumbs(breadcrumbs.slice(0, -1));
    } else if (zoomLevel === 'floor') {
      setSelectedBuilding(null);
      setZoomLevel('building');
      setBreadcrumbs([]);
    }
  };
  
  const handleBreadcrumbClick = (index: number) => {
    const crumb = breadcrumbs[index];
    if (crumb.level === 'building') {
      setSelectedBuilding(buildings.find(b => b.id === crumb.id) || null);
      setSelectedFloor(null);
      setSelectedRoom(null);
      setSelectedRack(null);
      setZoomLevel('floor');
      setBreadcrumbs(breadcrumbs.slice(0, 1));
    } else if (crumb.level === 'floor') {
      const floor = selectedBuilding?.floors?.find(f => f.id === crumb.id);
      setSelectedFloor(floor || null);
      setSelectedRoom(null);
      setSelectedRack(null);
      setZoomLevel('room');
      setBreadcrumbs(breadcrumbs.slice(0, 2));
    } else if (crumb.level === 'room') {
      const room = selectedFloor?.rooms?.find(r => r.id === crumb.id);
      setSelectedRoom(room || null);
      setSelectedRack(null);
      setZoomLevel('rack');
      setBreadcrumbs(breadcrumbs.slice(0, 3));
    }
  };

  // Handler for creating connections via wizard
  const handleCreateConnection = async (connection: {
    sourceDeviceId: string;
    targetDeviceId: string;
    connectionType: any;
    bandwidth: string;
    status: string;
  }) => {
    try {
      // In a real app, this would call an API
      // For now, we'll just add it to the local state
      const newConnection: NetworkConnection = {
        id: `conn-${Date.now()}`,
        sourceDeviceId: connection.sourceDeviceId,
        targetDeviceId: connection.targetDeviceId,
        status: connection.status === 'up' ? 'UP' : 'DOWN',
      };
      
      setConnections(prev => [...prev, newConnection]);
      
      // Show success notification (you can add a toast library later)
      console.log('Connection created:', newConnection);
    } catch (error) {
      console.error('Failed to create connection:', error);
    }
  };

  // ============================================================================
  // TOPOLOGY GENERATION
  // ============================================================================
  
  // Helper function to determine visibility based on zoom level
  const shouldShowLevel = (level: 'building' | 'floor' | 'room' | 'rack' | 'device') => {
    if (viewMode !== 'logical') return true; // Always show in non-logical views
    
    // Progressive zoom thresholds - only show if zoom level is high enough
    if (level === 'building') return true; // Always show buildings
    if (level === 'floor') return currentZoom >= 0.4;
    if (level === 'room') return currentZoom >= 0.7;
    if (level === 'rack') return currentZoom >= 1.0;
    if (level === 'device') return currentZoom >= 1.3;
    return true;
  };
  
  // Helper to determine if we should render a node type
  const shouldRenderNodeType = (hierarchyLevel: string) => {
    if (viewMode !== 'logical') return true;
    
    switch (hierarchyLevel) {
      case 'building': return true;
      case 'floor': return currentZoom >= 0.4;
      case 'room': return currentZoom >= 0.7;
      case 'rack': return currentZoom >= 1.0;
      case 'device': return currentZoom >= 1.3;
      default: return true;
    }
  };
  
  // Custom node types for Building View
  // Defined outside to prevent re-creation warnings
  
  useEffect(() => {
    if (devices.length === 0) return;

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    
    // Connection type styling for all views
    const connectionStyles: Record<string, { color: string; dash: string; width: number; label: string; icon: string }> = {
      'FIBER_SINGLE_MODE': { color: '#DC2626', dash: '0', width: 5, label: 'Fiber Single-Mode', icon: '🔴' },
      'FIBER_MULTI_MODE': { color: '#EA580C', dash: '0', width: 5, label: 'Fiber Multi-Mode', icon: '🟠' },
      'CAT5E': { color: '#16A34A', dash: '5,5', width: 4, label: 'Cat5e Cable', icon: '📡' },
      'CAT6': { color: '#16A34A', dash: '5,5', width: 4, label: 'Cat6 Cable', icon: '📡' },
      'CAT6A': { color: '#059669', dash: '5,5', width: 4, label: 'Cat6a Cable', icon: '📡' },
      'CAT7': { color: '#047857', dash: '5,5', width: 4, label: 'Cat7 Cable', icon: '📡' },
      'CAT8': { color: '#065F46', dash: '5,5', width: 4, label: 'Cat8 Cable', icon: '📡' },
      'WIRELESS': { color: '#2563EB', dash: '10,5', width: 3, label: 'Wireless Link', icon: '📶' },
      'MICROWAVE': { color: '#7C3AED', dash: '10,5', width: 3, label: 'Microwave Link', icon: '📡' },
      'LEASED_LINE': { color: '#CA8A04', dash: '15,5,5,5', width: 4, label: 'Leased Line', icon: '🔗' },
      'MPLS': { color: '#0891B2', dash: '15,5,5,5', width: 4, label: 'MPLS Network', icon: '🌐' },
      'VPN': { color: '#9333EA', dash: '20,5', width: 3, label: 'VPN Tunnel', icon: '🔒' },
      'OTHER': { color: '#6B7280', dash: '5,5', width: 3, label: 'Other Connection', icon: '❓' },
    };

    // Use filtered devices for topology generation
    const devicesToRender = filteredDevices;

    if (viewMode === 'logical') {
      // ====================================================================
      // LOGICAL VIEW: Group by infrastructure hierarchy with visual containers
      // Building / Floor / Room / Rack / Device
      // Include ALL buildings from organizations, even if empty
      // ====================================================================
      
      const buildingColorPalette = ['#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#F59E0B', '#6B7280', '#EC4899', '#14B8A6'];
      let buildingColors: Record<string, string> = {};
      let colorIndex = 0;
      let buildingYOffset = 0;
      
      // First, organize devices by building hierarchy
      const buildingHierarchy: Record<string, Record<string, Record<string, Record<string, Device[]>>>> = {};
      
      devicesToRender.forEach(device => {
        if (device.rack?.room?.floor?.building) {
          const building = device.rack.room.floor.building.name;
          const floor = device.rack.room.floor.name;
          const room = device.rack.room.name;
          const rack = device.rack.name;
          
          if (!buildingHierarchy[building]) buildingHierarchy[building] = {};
          if (!buildingHierarchy[building][floor]) buildingHierarchy[building][floor] = {};
          if (!buildingHierarchy[building][floor][room]) buildingHierarchy[building][floor][room] = {};
          if (!buildingHierarchy[building][floor][room][rack]) buildingHierarchy[building][floor][room][rack] = [];
          buildingHierarchy[building][floor][room][rack].push(device);
        }
      });
      
      // Get all buildings from organizations
      const allBuildings: Array<{ name: string; id: string; floors?: any[] }> = [];
      organizations.forEach(org => {
        if (org.buildings) {
          org.buildings.forEach(building => {
            allBuildings.push(building);
          });
        }
      });
      
      // If no buildings in organizations, create entries from devices
      if (allBuildings.length === 0) {
        Object.keys(buildingHierarchy).forEach(buildingName => {
          allBuildings.push({
            name: buildingName,
            id: `building-${buildingName}`,
            floors: [],
          });
        });
      }
      
      // Render all buildings (with or without devices)
      allBuildings.forEach(building => {
        const buildingName = building.name;
        const buildingDeviceHierarchy = buildingHierarchy[buildingName] || {};
        
        if (!buildingColors[buildingName]) {
          buildingColors[buildingName] = buildingColorPalette[colorIndex % buildingColorPalette.length];
          colorIndex++;
        }
        const buildingColor = buildingColors[buildingName];
        
        // Calculate total height for this building
        let buildingTotalHeight = 100; // Minimum height for empty building
        
        if (Object.keys(buildingDeviceHierarchy).length > 0) {
          Object.entries(buildingDeviceHierarchy).forEach(([_floorName, rooms]) => {
            let floorHeight = 60;
            Object.entries(rooms).forEach(([_roomName, racks]) => {
              let roomHeight = 50;
              Object.entries(racks).forEach(([_rackName, devicesInRack]) => {
                const itemsPerRow = 4;
                const deviceGroupHeight = 150;
                const numRows = Math.ceil(devicesInRack.length / itemsPerRow);
                const rackHeight = 50 + (numRows > 0 ? numRows * (deviceGroupHeight + 20) : 50) + 60;
                roomHeight += rackHeight + 20;
              });
              floorHeight += roomHeight + 20;
            });
            buildingTotalHeight += floorHeight + 20;
          });
        } else {
          // Empty building - show placeholder
          buildingTotalHeight = 150;
        }
        
        // Add building group node
        const buildingNodeId = `group-building-${buildingName}`;
        const buildingGroupNode: Node = {
          id: buildingNodeId,
          type: 'default',
          position: { x: 0, y: buildingYOffset },
          data: {
            label: `🏢 ${buildingName}`,
            isGroup: true,
            hierarchyLevel: 'building',
            deviceCount: devicesToRender.filter(d => d.rack?.room?.floor?.building?.name === buildingName).length,
          },
          style: {
            border: `4px solid ${buildingColor}`,
            borderRadius: '16px',
            padding: '16px',
            backgroundColor: `${buildingColor}08`,
            fontSize: '16px',
            fontWeight: 'bold',
            minWidth: '1200px',
            minHeight: `${buildingTotalHeight}px`,
            textAlign: 'left',
            color: buildingColor,
          },
        };
        newNodes.push(buildingGroupNode);
        
        if (Object.keys(buildingDeviceHierarchy).length === 0) {
          // Add empty state message for building without devices
          const emptyNodeId = `empty-${buildingName}`;
          const emptyNode: Node = {
            id: emptyNodeId,
            type: 'default',
            position: { x: 60, y: 60 },
            parentNode: buildingNodeId,
            extent: 'parent',
            data: {
              label: 'No devices assigned yet',
              isEmpty: true,
            },
            style: {
              border: `2px dashed ${buildingColor}`,
              borderRadius: '8px',
              padding: '20px',
              backgroundColor: `${buildingColor}04`,
              fontSize: '12px',
              fontWeight: '500',
              minWidth: '400px',
              minHeight: '60px',
              textAlign: 'center',
              color: buildingColor,
            },
          };
          newNodes.push(emptyNode);
        } else {
          // Render floors with devices
          let floorYOffset = buildingYOffset + 80;
          
          Object.entries(buildingDeviceHierarchy).forEach(([floorName, rooms]) => {
            let floorHeight = 60;
            Object.entries(rooms).forEach(([_roomName, racks]) => {
              let roomHeight = 50;
              Object.entries(racks).forEach(([_rackName, devicesInRack]) => {
                const itemsPerRow = 4;
                const deviceGroupHeight = 150;
                const numRows = Math.ceil(devicesInRack.length / itemsPerRow);
                const rackHeight = 50 + (numRows > 0 ? numRows * (deviceGroupHeight + 20) : 50) + 60;
                roomHeight += rackHeight + 20;
              });
              floorHeight += roomHeight + 20;
            });
            
            // Add floor group node (only if zoom level is sufficient)
            if (shouldRenderNodeType('floor')) {
              const floorNodeId = `group-floor-${buildingName}-${floorName}`;
              const floorGroupNode: Node = {
                id: floorNodeId,
                type: 'default',
                position: { x: 20, y: floorYOffset - buildingYOffset },
                parentNode: buildingNodeId,
                extent: 'parent',
                data: {
                  label: `📋 ${floorName}`,
                  isGroup: true,
                  hierarchyLevel: 'floor',
                },
                style: {
                  border: `3px dashed ${buildingColor}`,
                  borderRadius: '12px',
                  padding: '12px',
                  backgroundColor: `${buildingColor}04`,
                  fontSize: '13px',
                  fontWeight: '600',
                  minWidth: '1100px',
                  minHeight: `${floorHeight}px`,
                  textAlign: 'left',
                  color: buildingColor,
                },
              };
              newNodes.push(floorGroupNode);
            
              let roomYOffset = floorYOffset + 60;
              
              Object.entries(rooms).forEach(([roomName, racks]) => {
              let roomHeight = 50;
              Object.entries(racks).forEach(([_rackName, devicesInRack]) => {
                const itemsPerRow = 4;
                const deviceGroupHeight = 150;
                const numRows = Math.ceil(devicesInRack.length / itemsPerRow);
                const rackHeight = 50 + (numRows > 0 ? numRows * (deviceGroupHeight + 20) : 50) + 60;
                roomHeight += rackHeight + 20;
              });
              
              // Add room group node (only if zoom level is sufficient)
              if (shouldRenderNodeType('room')) {
                const roomNodeId = `group-room-${buildingName}-${floorName}-${roomName}`;
                const roomGroupNode: Node = {
                  id: roomNodeId,
                  type: 'default',
                  position: { x: 40 - 20, y: roomYOffset - floorYOffset },
                  parentNode: floorNodeId,
                  extent: 'parent',
                  data: {
                    label: `🚪 ${roomName}`,
                    isGroup: true,
                    hierarchyLevel: 'room',
                  },
                  style: {
                    border: `2px dotted ${buildingColor}`,
                    borderRadius: '10px',
                    padding: '10px',
                    backgroundColor: 'white',
                    fontSize: '12px',
                    fontWeight: '500',
                    minWidth: '1000px',
                    minHeight: `${roomHeight}px`,
                    textAlign: 'left',
                    color: buildingColor,
                  },
                };
                newNodes.push(roomGroupNode);
              
              let rackYOffset = roomYOffset + 50;
              
              Object.entries(racks).forEach(([rackName, devicesInRack]) => {
                const itemsPerRow = 4;
                const deviceGroupHeight = 150;
                const numRows = Math.ceil(devicesInRack.length / itemsPerRow);
                const rackHeight = numRows > 0 ? numRows * (deviceGroupHeight + 20) : 0;
                
                // Add rack group node (only if zoom level is sufficient)
                if (shouldRenderNodeType('rack')) {
                  const rackNodeId = `group-rack-${buildingName}-${floorName}-${roomName}-${rackName}`;
                  const rackGroupNode: Node = {
                    id: rackNodeId,
                    type: 'default',
                    position: { x: 60 - 40 + 20, y: rackYOffset - roomYOffset },
                    parentNode: roomNodeId,
                    extent: 'parent',
                    data: {
                      label: `📦 ${rackName}`,
                      isGroup: true,
                      hierarchyLevel: 'rack',
                      deviceCount: devicesInRack.length,
                    },
                    style: {
                      border: `2px solid ${buildingColor}`,
                      borderRadius: '8px',
                      padding: '8px',
                      backgroundColor: '#FAFAFA',
                      fontSize: '11px',
                      fontWeight: '500',
                      minWidth: '900px',
                      minHeight: `${50 + rackHeight + 60}px`,
                      textAlign: 'left',
                      color: buildingColor,
                    },
                  };
                  newNodes.push(rackGroupNode);
                  
                  // Add devices (only if zoom level is sufficient)
                  if (shouldRenderNodeType('device')) {
                    devicesInRack.forEach((device, idx) => {
                  const row = Math.floor(idx / itemsPerRow);
                  const col = idx % itemsPerRow;
                  const xOffset = 80 - 60 + col * (200 + 20);
                  const yDeviceOffset = 50 + row * (deviceGroupHeight + 20);

                  const deviceServices = services.filter(s => s.deviceId === device.id);
                  const interfaceCount = device.networkInterfaces?.length || 0;

                  const node: Node = {
                    id: device.id,
                    type: 'default',
                    position: { x: xOffset, y: yDeviceOffset },
                    parentNode: rackNodeId,
                    extent: 'parent',
                    data: {
                      label: device.name,
                      type: device.type,
                      status: device.status,
                      criticality: device.criticality,
                      serviceCount: deviceServices.length,
                      interfaceCount,
                      interfaces: device.networkInterfaces || [],
                      building: buildingName,
                      floor: floorName,
                      room: roomName,
                      rack: rackName,
                    },
                  };

                  node.style = {
                    border: `3px solid ${buildingColor}`,
                    borderRadius: '10px',
                    padding: '10px',
                    backgroundColor: device.status === 'ACTIVE' ? '#FFFFFF' : '#F3F4F6',
                    boxShadow: device.status === 'ACTIVE' ? '0 2px 12px 0 rgba(0, 0, 0, 0.2)' : '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                    width: '180px',
                    textAlign: 'center',
                    fontWeight: '600',
                    fontSize: '11px',
                    // Progressive visibility based on zoom
                    opacity: shouldShowLevel('device') ? 1 : 0.1,
                    transition: 'opacity 0.3s ease',
                  };

                  newNodes.push(node);
                    }); // End device forEach
                  } // End shouldRenderNodeType('device')
                } // End shouldRenderNodeType('rack')
                
                rackYOffset += 50 + rackHeight + 60 + 20;
              }); // End racks forEach
              } // End of shouldRenderNodeType('room')
              
              roomYOffset += roomHeight + 20;
            });
            } // End of shouldRenderNodeType('floor')
            
            floorYOffset += floorHeight + 20;
          });
        }
        
        buildingYOffset += buildingTotalHeight + 200;
      });

      // Create edges with interface details
      connections.forEach(conn => {
        const sourceDevice = devices.find(d => d.id === conn.sourceDeviceId);
        const targetDevice = devices.find(d => d.id === conn.targetDeviceId);

        if (sourceDevice && targetDevice) {
          const sourceInterface = sourceDevice.networkInterfaces?.find(
            i => i.id === conn.sourceInterfaceId
          );
          const targetInterface = targetDevice.networkInterfaces?.find(
            i => i.id === conn.targetInterfaceId
          );

          let edgeLabel = conn.status;
          if (sourceInterface && targetInterface) {
            edgeLabel = `${sourceInterface.name} → ${targetInterface.name}`;
          } else if (sourceInterface || targetInterface) {
            edgeLabel = `${sourceInterface?.name || 'iface'} → ${targetInterface?.name || 'iface'}`;
          }

          newEdges.push({
            id: conn.id,
            source: sourceDevice.id,
            target: targetDevice.id,
            animated: conn.status === 'UP',
            style: {
              stroke: conn.status === 'UP' ? '#10B981' : '#EF4444',
              strokeWidth: 2.5,
            },
            label: edgeLabel,
            labelStyle: { fontSize: '10px', fill: '#333', fontWeight: 'bold', backgroundColor: 'white', padding: '2px 4px', borderRadius: '3px' },
          });
        }
      });
    } else if (viewMode === 'building') {
      // ====================================================================
      // BUILDING VIEW: Modern building-centric topology with semantic zoom
      // ====================================================================
      
      // Group devices by building
      const buildingMap = new Map<string, { building: any; devices: Device[] }>();
      
      // Organize all buildings from organizations
      organizations.forEach(org => {
        org.buildings?.forEach(building => {
          if (!buildingMap.has(building.id)) {
            buildingMap.set(building.id, { building, devices: [] });
          }
        });
      });
      
      // Add devices to their buildings
      devicesToRender.forEach(device => {
        const buildingId = device.rack?.room?.floor?.building?.id;
        if (buildingId && buildingMap.has(buildingId)) {
          buildingMap.get(buildingId)!.devices.push(device);
        }
      });
      
      // Calculate building positions (organic layout)
      const buildingsArray = Array.from(buildingMap.values());
      const cols = Math.ceil(Math.sqrt(buildingsArray.length));
      const spacing = 600;
      
      buildingsArray.forEach((buildingData, index) => {
        const { building, devices } = buildingData;
        const row = Math.floor(index / cols);
        const col = index % cols;
        
        // Calculate device counts by role
        const deviceRoles = devices.map(d => getDeviceRole(d.type, d.name));
        const coreCount = deviceRoles.filter(r => r === 'core').length;
        const distCount = deviceRoles.filter(r => r === 'distribution').length;
        const accessCount = deviceRoles.filter(r => r === 'access').length;
        
        // Determine building health status
        const activeDevices = devices.filter(d => d.status === 'ACTIVE').length;
        const totalDevices = devices.length;
        let buildingStatus: 'healthy' | 'degraded' | 'down' = 'healthy';
        
        if (totalDevices === 0) {
          buildingStatus = 'degraded';
        } else if (activeDevices === 0) {
          buildingStatus = 'down';
        } else if (activeDevices / totalDevices < 0.8) {
          buildingStatus = 'degraded';
        }
        
        // Find organization name
        const org = organizations.find(o => o.buildings?.some(b => b.id === building.id));
        
        // Create building node
        const buildingNode: Node = {
          id: `building-${building.id}`,
          type: 'building',
          position: { x: col * spacing, y: row * spacing },
          data: {
            buildingId: building.id,
            name: building.name,
            city: building.city,
            organizationName: org?.name,
            status: buildingStatus,
            deviceCount: totalDevices,
            coreDevices: coreCount,
            distributionDevices: distCount,
            accessDevices: accessCount,
            isExpanded: expandedBuildings.has(building.id),
            onExpand: () => {
              const newExpanded = new Set(expandedBuildings);
              if (newExpanded.has(building.id)) {
                newExpanded.delete(building.id);
              } else {
                newExpanded.add(building.id);
              }
              setExpandedBuildings(newExpanded);
            },
            onDoubleClick: () => {
              // setFocusedBuildingId(building.id);
            },
          },
        };
        
        newNodes.push(buildingNode);
        
        // If building is expanded, show devices
        if (expandedBuildings.has(building.id)) {
          // Calculate device positions based on role
          const buildingX = col * spacing;
          const buildingY = row * spacing;
          const buildingWidth = 500;
          const buildingHeight = 400;
          
          devices.forEach((device, _deviceIndex) => {
            const role = getDeviceRole(device.type, device.name);
            const weight = getDevicePositionWeight(role);
            
            // Add some randomness to avoid overlapping
            const randomOffsetX = (Math.random() - 0.5) * 80;
            const randomOffsetY = (Math.random() - 0.5) * 60;
            
            const deviceX = buildingX + buildingWidth * weight.x + randomOffsetX;
            const deviceY = buildingY + buildingHeight * weight.y + randomOffsetY + 100; // Offset below building card
            
            const deviceNode: Node = {
              id: device.id,
              type: 'device',
              position: { x: deviceX, y: deviceY },
              data: {
                deviceId: device.id,
                name: device.name,
                type: device.type,
                role: role,
                status: device.status.toLowerCase() as 'active' | 'inactive' | 'maintenance' | 'error',
                ipAddress: device.networkInterfaces?.[0]?.ipv4,
                ports: device.networkInterfaces?.length,
                activeConnections: connections.filter(
                  c => c.sourceDeviceId === device.id || c.targetDeviceId === device.id
                ).length,
                buildingName: building.name,
                location: `${device.rack?.room?.name || ''} - ${device.rack?.name || ''}`.trim().replace(/^- /, ''),
              },
            };
            
            newNodes.push(deviceNode);
          });
        }
      });
      
      // Create edges for device connections (only for expanded buildings)
      connections.forEach(conn => {
        const sourceDevice = devices.find(d => d.id === conn.sourceDeviceId);
        const targetDevice = devices.find(d => d.id === conn.targetDeviceId);
        
        if (sourceDevice && targetDevice) {
          const sourceBuildingId = sourceDevice.rack?.room?.floor?.building?.id;
          const targetBuildingId = targetDevice.rack?.room?.floor?.building?.id;
          
          // Only show edge if both devices' buildings are expanded
          if (
            sourceBuildingId && 
            targetBuildingId && 
            expandedBuildings.has(sourceBuildingId) && 
            expandedBuildings.has(targetBuildingId)
          ) {
            newEdges.push({
              id: conn.id,
              source: sourceDevice.id,
              target: targetDevice.id,
              type: 'custom',
              data: {
                connectionType: 'copper',
                bandwidth: '1Gbps',
                status: conn.status === 'UP' ? 'up' : 'down',
                label: conn.status,
              },
            });
          }
        }
      });
      
      // Add building connection edges
      if (buildingConnections.length > 0) {
        buildingConnections.forEach((buildingConn: any) => {
          const sourceBuilding = buildingConn.sourceBuilding;
          const destBuilding = buildingConn.destBuilding;
          
          if (sourceBuilding && destBuilding) {
            const sourceBuildingNodeId = `building-${sourceBuilding.id}`;
            const destBuildingNodeId = `building-${destBuilding.id}`;
            
            // Check if both building nodes exist
            const sourceExists = newNodes.some(n => n.id === sourceBuildingNodeId);
            const destExists = newNodes.some(n => n.id === destBuildingNodeId);
            
            if (sourceExists && destExists) {
              const style = connectionStyles[buildingConn.connectionType] || connectionStyles['OTHER'];
              
              newEdges.push({
                id: `building-conn-${buildingConn.id}`,
                source: sourceBuildingNodeId,
                target: destBuildingNodeId,
                sourceHandle: 'right-source',
                targetHandle: 'left-target',
                type: 'building',
                animated: buildingConn.status === 'ACTIVE',
                data: {
                  label: buildingConn.bandwidth 
                    ? `${style.icon} ${style.label} (${buildingConn.bandwidth})`
                    : `${style.icon} ${style.label}`,
                  strokeColor: style.color,
                  textColor: style.color,
                  strokeWidth: style.width,
                  strokeDasharray: style.dash,
                  bgColor: 'white',
                  buildingConnection: buildingConn,
                  type: 'building-connection',
                },
              });
            }
          }
        });
      }
      
      // Apply semantic zoom filtering
      const zoomConfig = getZoomConfig(semanticZoom);
      const filteredNodes = filterNodesByZoom(newNodes, zoomConfig);
      const filteredEdges = filterEdgesByZoom(newEdges, filteredNodes);
      
      setNodes(filteredNodes);
      setEdges(filteredEdges);
      return; // Early return for building view
    } else if (viewMode === 'physical') {
      // ====================================================================
      // PHYSICAL VIEW: Using custom DeviceNode components
      // ====================================================================
      devicesToRender.forEach((device) => {
        const role = getDeviceRole(device.type, device.name);
        
        const node: Node = {
          id: device.id,
          type: 'device',
          position: { x: Math.random() * 800, y: Math.random() * 600 },
          data: {
            deviceId: device.id,
            name: device.name,
            type: device.type,
            role: role,
            status: device.status.toLowerCase() as 'active' | 'inactive' | 'maintenance' | 'error',
            ipAddress: device.networkInterfaces?.[0]?.ipv4,
            ports: device.networkInterfaces?.length,
            activeConnections: connections.filter(
              c => c.sourceDeviceId === device.id || c.targetDeviceId === device.id
            ).length,
            buildingName: device.rack?.room?.floor?.building?.name,
            location: `${device.rack?.room?.name || ''} - ${device.rack?.name || ''}`.trim().replace(/^- /, ''),
          },
        };

        newNodes.push(node);
      });

      connections.forEach(conn => {
        const sourceDevice = devices.find(d => d.id === conn.sourceDeviceId);
        const targetDevice = devices.find(d => d.id === conn.targetDeviceId);

        if (sourceDevice && targetDevice) {
          newEdges.push({
            id: conn.id,
            source: sourceDevice.id,
            target: targetDevice.id,
            type: 'custom',
            data: {
              connectionType: 'copper',
              bandwidth: '1Gbps',
              status: conn.status === 'UP' ? 'up' : 'down',
              label: conn.status,
            },
          });
        }
      });
    } else if (viewMode === 'services') {
      // ====================================================================
      // SERVICES VIEW: Using custom DeviceNode components
      // ====================================================================
      devicesToRender.forEach((device) => {
        const role = getDeviceRole(device.type, device.name);
        const deviceServices = services.filter(s => s.deviceId === device.id);
        
        const node: Node = {
          id: device.id,
          type: 'device',
          position: { x: Math.random() * 800, y: Math.random() * 600 },
          data: {
            deviceId: device.id,
            name: device.name,
            type: device.type,
            role: role,
            status: device.status.toLowerCase() as 'active' | 'inactive' | 'maintenance' | 'error',
            ipAddress: device.networkInterfaces?.[0]?.ipv4,
            ports: deviceServices.length, // Show service count as ports in this view
            activeConnections: connections.filter(
              c => c.sourceDeviceId === device.id || c.targetDeviceId === device.id
            ).length,
            buildingName: device.rack?.room?.floor?.building?.name,
            location: `${deviceServices.length} service(s)`,
          },
        };

        newNodes.push(node);
      });

      connections.forEach(conn => {
        const sourceDevice = devices.find(d => d.id === conn.sourceDeviceId);
        const targetDevice = devices.find(d => d.id === conn.targetDeviceId);

        if (sourceDevice && targetDevice) {
          newEdges.push({
            id: conn.id,
            source: sourceDevice.id,
            target: targetDevice.id,
            type: 'custom',
            data: {
              connectionType: 'copper',
              bandwidth: '1Gbps',
              status: conn.status === 'UP' ? 'up' : 'down',
              label: conn.status,
            },
          });
        }
      });
    }

    // ====================================================================
    // ADD BUILDING CONNECTION EDGES (for logical view)
    // ====================================================================
    if (viewMode === 'logical' && buildingConnections.length > 0) {
      buildingConnections.forEach((buildingConn: any) => {
        const sourceBuilding = buildingConn.sourceBuilding || { name: '' };
        const destBuilding = buildingConn.destBuilding || { name: '' };
        
        const sourceBuildingNodeId = `group-building-${sourceBuilding.name}`;
        const destBuildingNodeId = `group-building-${destBuilding.name}`;
        
        // Check if both building nodes exist
        const sourceExists = newNodes.some(n => n.id === sourceBuildingNodeId);
        const destExists = newNodes.some(n => n.id === destBuildingNodeId);
        
        if (sourceExists && destExists) {
          const style = connectionStyles[buildingConn.connectionType] || connectionStyles['OTHER'];
          
          newEdges.push({
            id: `building-conn-${buildingConn.id}`,
            source: sourceBuildingNodeId,
            target: destBuildingNodeId,
            sourceHandle: undefined,
            targetHandle: undefined,
            animated: buildingConn.status === 'ACTIVE',
            style: undefined,
            label: buildingConn.bandwidth 
              ? `${style.icon} ${style.label} (${buildingConn.bandwidth})`
              : `${style.icon} ${style.label}`,
            type: 'building',
            data: {
              label: buildingConn.bandwidth 
                ? `${style.icon} ${style.label} (${buildingConn.bandwidth})`
                : `${style.icon} ${style.label}`,
              strokeColor: style.color,
              textColor: style.color,
              strokeWidth: style.width,
              strokeDasharray: style.dash,
              bgColor: 'white',
              buildingConnection: buildingConn,
              type: 'building-connection',
            },
          });
        }
      });
    }

    setNodes(newNodes);
    setEdges(newEdges);
  }, [
    devices,
    services,
    connections,
    viewMode,
    filterDeviceType,
    filterStatus,
    filterCriticality,
    searchQuery,
    buildingConnections,
    organizations,
    currentZoom
  ]);

  /*
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'text-green-600 bg-green-50';
      case 'INACTIVE': return 'text-gray-600 bg-gray-50';
      case 'MAINTENANCE': return 'text-yellow-600 bg-yellow-50';
      case 'DECOMMISSIONED': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getCriticalityColor = (criticality: string) => {
    switch (criticality) {
      case 'CRITICAL': return 'text-red-600 bg-red-50';
      case 'HIGH': return 'text-orange-600 bg-orange-50';
      case 'MEDIUM': return 'text-yellow-600 bg-yellow-50';
      case 'LOW': return 'text-blue-600 bg-blue-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };
  */

  return (
    <div className="h-screen flex flex-col">
      <Header />
      
      <div className="flex-1 flex flex-col">
        {/* Top Controls */}
        <div className="bg-white border-b border-gray-200 p-4" style={{ position: 'relative', zIndex: 1010 }}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Network Topology</h1>
              <p className="text-gray-600">Manage infrastructure topology and network connections</p>
            </div>
            <div className="flex space-x-3">
              <div className="flex space-x-2">
                <button
                  onClick={() => setViewMode('building')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
                    viewMode === 'building'
                      ? 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-300'
                      : 'bg-white text-gray-700 border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  Building View
                </button>
                <button
                  onClick={() => setViewMode('logical')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    viewMode === 'logical'
                      ? 'bg-blue-100 text-blue-700 shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Logical View
                </button>
                <button
                  onClick={() => setViewMode('physical')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    viewMode === 'physical'
                      ? 'bg-blue-100 text-blue-700 shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Physical View
                </button>
                <button
                  onClick={() => setViewMode('services')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    viewMode === 'services'
                      ? 'bg-blue-100 text-blue-700 shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Services View
                </button>
                <button
                  onClick={() => setViewMode('hierarchy')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    viewMode === 'hierarchy'
                      ? 'bg-blue-100 text-blue-700 shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Hierarchy View
                </button>
                <button
                  onClick={() => {
                    setViewMode('zoom');
                    setZoomLevel('building');
                    setBreadcrumbs([]);
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    viewMode === 'zoom'
                      ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg'
                      : 'bg-gradient-to-r from-purple-100 to-blue-100 text-purple-700 hover:from-purple-200 hover:to-blue-200'
                  }`}
                >
                  🔍 Zoom View
                </button>
              </div>
              <div className="flex items-center space-x-3" style={{ position: 'relative', zIndex: 1020 }}>
                <div className="relative group">
                  <button
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium transition flex items-center space-x-2"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>Building Connections</span>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <div className="absolute right-0 top-full w-56 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[1050]">
                    <div className="bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
                      <button
                        onClick={() => setShowBuildingConnectionModal(true)}
                        className="w-full px-4 py-3 text-left hover:bg-purple-50 flex items-center space-x-3 border-b border-gray-100 transition"
                      >
                        <svg className="h-5 w-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <div>
                          <p className="font-semibold text-gray-900">Add New</p>
                          <p className="text-xs text-gray-600">Inter-building link</p>
                        </div>
                      </button>
                      <button
                        onClick={() => setShowManagementModal(true)}
                        className="w-full px-4 py-3 text-left hover:bg-purple-50 flex items-center space-x-3 transition"
                      >
                        <svg className="h-5 w-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                        </svg>
                        <div>
                          <p className="font-semibold text-gray-900">Manage All</p>
                          <p className="text-xs text-gray-600">{buildingConnections.length} connection(s)</p>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
                {viewMode === 'building' && (
                  <button
                    onClick={() => setShowConnectionWizard(true)}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium transition flex items-center gap-2 shadow-lg"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Create Connection
                  </button>
                )}
                <button
                  onClick={loadData}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition"
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>
          
          {/* Enhanced Toolbar with Filters and Search */}
          {viewMode !== 'hierarchy' && (
            <div className="mt-4 bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="flex items-center space-x-3 flex-wrap gap-3">
                {/* Search Input */}
                <div className="flex-1 min-w-[250px]">
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search devices..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* Device Type Filter */}
                <div className="flex items-center space-x-2">
                  <svg className="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                  </svg>
                  <select
                    value={filterDeviceType}
                    onChange={(e) => setFilterDeviceType(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Types</option>
                    {deviceTypes.filter(t => t !== 'all').map(type => (
                      <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>

                {/* Status Filter */}
                <div className="flex items-center space-x-2">
                  <svg className="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Status</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="MAINTENANCE">Maintenance</option>
                    <option value="DECOMMISSIONED">Decommissioned</option>
                  </select>
                </div>

                {/* Criticality Filter */}
                <div className="flex items-center space-x-2">
                  <svg className="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <select
                    value={filterCriticality}
                    onChange={(e) => setFilterCriticality(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Priority</option>
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                </div>

                {/* Clear Filters Button */}
                {(searchQuery || filterDeviceType !== 'all' || filterStatus !== 'all' || filterCriticality !== 'all') && (
                  <button
                    onClick={clearFilters}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-medium transition flex items-center space-x-2"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Clear Filters</span>
                  </button>
                )}
                
                {/* Results Count */}
                <div className="ml-auto flex items-center space-x-2 bg-white px-4 py-2 rounded-lg border border-gray-300">
                  <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  <span className="text-sm font-semibold text-gray-700">
                    {filteredDevices.length} / {devices.length} devices
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Loading/Error States */}
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <p className="mt-4 text-gray-600">Loading network topology...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex-1 flex items-center justify-center">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md w-full mx-4">
              <p className="text-red-800">{error}</p>
              <button
                onClick={loadData}
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        {!loading && !error && (
          <>
            {viewMode === 'hierarchy' ? (
              // HIERARCHY VIEW
              <div className="flex-1 overflow-auto p-6 bg-gray-50">
                <div className="max-w-6xl mx-auto">
                  <h2 className="text-xl font-bold text-gray-900 mb-6">Infrastructure Hierarchy</h2>
                  <div className="space-y-4">
                    {organizations.length === 0 ? (
                      <div className="text-center py-12">
                        <p className="text-gray-500">No organizations found. Create one from the Locations page.</p>
                      </div>
                    ) : (
                      organizations.map(org => (
                        <div key={org.id} className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
                          <button
                            onClick={() => toggleExpand(org.id)}
                            className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition"
                          >
                            <div className="flex items-center space-x-3">
                              <svg
                                className={`h-5 w-5 text-blue-600 transition ${
                                  expandedItems.has(org.id) ? 'rotate-90' : ''
                                }`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 5l7 7-7 7"
                                />
                              </svg>
                              <div className="text-left">
                                <p className="font-bold text-gray-900 text-lg">{org.name}</p>
                                <p className="text-sm text-gray-500">{org.buildings?.length || 0} buildings</p>
                              </div>
                            </div>
                          </button>

                          {expandedItems.has(org.id) && org.buildings && (
                            <div className="border-t border-gray-200 p-4 bg-gray-50 space-y-3">
                              {org.buildings.map(building => (
                                <div key={building.id} className="bg-white rounded-lg p-4 border border-gray-100 shadow-sm">
                                  <button
                                    onClick={() => toggleExpand(building.id)}
                                    className="w-full flex items-center justify-between hover:bg-gray-50 transition"
                                  >
                                    <div className="flex items-center space-x-3">
                                      <svg
                                        className={`h-4 w-4 text-purple-600 transition ${
                                          expandedItems.has(building.id) ? 'rotate-90' : ''
                                        }`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M9 5l7 7-7 7"
                                        />
                                      </svg>
                                      <div className="text-left">
                                        <p className="font-semibold text-gray-900">{building.name}</p>
                                        <p className="text-xs text-gray-500">{building.city || 'Location not set'}</p>
                                      </div>
                                    </div>
                                  </button>

                                  {expandedItems.has(building.id) && building.floors && (
                                    <div className="mt-4 ml-6 space-y-3 border-l-2 border-gray-300 pl-4">
                                      {building.floors.map(floor => (
                                        <div key={floor.id}>
                                          <button
                                            onClick={() => toggleExpand(floor.id)}
                                            className="w-full flex items-center justify-between hover:bg-gray-50 transition py-2 px-2 rounded"
                                          >
                                            <div className="flex items-center space-x-2">
                                              <svg
                                                className={`h-4 w-4 text-orange-600 transition ${
                                                  expandedItems.has(floor.id) ? 'rotate-90' : ''
                                                }`}
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                              >
                                                <path
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  strokeWidth={2}
                                                  d="M9 5l7 7-7 7"
                                                />
                                              </svg>
                                              <span className="font-semibold text-gray-800">{floor.name}</span>
                                            </div>
                                            <span className="text-xs text-gray-400 font-medium">Floor {floor.floorNumber}</span>
                                          </button>

                                          {expandedItems.has(floor.id) && floor.rooms && (
                                            <div className="mt-3 ml-6 space-y-2">
                                              {floor.rooms.map(room => (
                                                <div key={room.id} className="bg-gray-50 rounded p-3 border border-gray-100">
                                                  <p className="font-semibold text-gray-800 mb-2">{room.name}</p>
                                                  {room.racks && room.racks.length > 0 ? (
                                                    <div className="space-y-1 ml-3 border-l border-gray-300 pl-3">
                                                      {room.racks.map(rack => {
                                                        const rackDevices = devices.filter(d => d.rackId === rack.id);
                                                        return (
                                                          <div key={rack.id} className="flex justify-between text-sm">
                                                            <div>
                                                              <span className="font-medium text-gray-700">{rack.name}</span>
                                                              <span className="text-xs text-gray-500 ml-2">({rack.maxUnits}U)</span>
                                                            </div>
                                                            <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                                                              {rackDevices.length} devices
                                                            </span>
                                                          </div>
                                                        );
                                                      })}
                                                    </div>
                                                  ) : (
                                                    <p className="text-xs text-gray-400 italic">No racks</p>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : viewMode === 'zoom' ? (
              // ZOOM VIEW - Modern Hierarchical Zoom Interface
              <div className="flex-1 overflow-auto bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50">
                {/* Breadcrumb Navigation */}
                {breadcrumbs.length > 0 && (
                  <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-gray-200 px-6 py-4 shadow-sm">
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => {
                          setZoomLevel('building');
                          setSelectedBuilding(null);
                          setSelectedFloor(null);
                          setSelectedRoom(null);
                          setSelectedRack(null);
                          setBreadcrumbs([]);
                        }}
                        className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition shadow-md flex items-center space-x-2 font-medium"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                        <span>All Buildings</span>
                      </button>
                      {breadcrumbs.map((crumb, index) => (
                        <React.Fragment key={crumb.id}>
                          <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          <button
                            onClick={() => handleBreadcrumbClick(index)}
                            className="px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-100 transition border border-gray-200 font-medium"
                          >
                            {crumb.level === 'building' && '🏢'}
                            {crumb.level === 'floor' && '📋'}
                            {crumb.level === 'room' && '🚪'}
                            {crumb.level === 'rack' && '📦'}
                            {' '}{crumb.name}
                          </button>
                        </React.Fragment>
                      ))}
                      {zoomLevel !== 'building' && (
                        <button
                          onClick={handleZoomOut}
                          className="ml-auto px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-100 transition border border-gray-200 font-medium flex items-center space-x-2"
                        >
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                          </svg>
                          <span>Zoom Out</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
                
                <div className="p-8">
                  {/* Building Level */}
                  {zoomLevel === 'building' && (
                    <div className="max-w-7xl mx-auto">
                      <div className="mb-8">
                        <h2 className="text-4xl font-bold text-gray-900 mb-2">Infrastructure Overview</h2>
                        <p className="text-lg text-gray-600">Select a building to explore its infrastructure</p>
                      </div>
                      
                      {buildings.length === 0 ? (
                        <div className="text-center py-20">
                          <div className="inline-block p-8 bg-white rounded-2xl shadow-lg border border-gray-200">
                            <svg className="h-24 w-24 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                            <p className="text-xl font-semibold text-gray-700">No buildings found</p>
                            <p className="text-gray-500 mt-2">Create buildings from the Locations page</p>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {buildings.map(building => {
                            const buildingDevices = devices.filter(d => 
                              d.rack?.room?.floor?.building?.id === building.id
                            );
                            const activeDevices = buildingDevices.filter(d => d.status === 'ACTIVE').length;
                            const floorCount = building.floors?.length || 0;
                            
                            return (
                              <button
                                key={building.id}
                                onClick={() => handleZoomToBuilding(building)}
                                className="group relative bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden border-2 border-transparent hover:border-blue-500 p-6 text-left transform hover:scale-105"
                              >
                                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-bl-full"></div>
                                
                                <div className="relative">
                                  <div className="flex items-center justify-between mb-4">
                                    <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-md">
                                      <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                      </svg>
                                    </div>
                                    <svg className="h-6 w-6 text-gray-400 group-hover:text-blue-600 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                  </div>
                                  
                                  <h3 className="text-2xl font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition">{building.name}</h3>
                                  <p className="text-sm text-gray-500 mb-4 flex items-center space-x-1">
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    <span>{building.city || 'Location not set'}</span>
                                  </p>
                                  
                                  <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-3 border border-blue-200">
                                      <p className="text-xs text-blue-600 font-medium mb-1">Floors</p>
                                      <p className="text-2xl font-bold text-blue-700">{floorCount}</p>
                                    </div>
                                    <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-3 border border-green-200">
                                      <p className="text-xs text-green-600 font-medium mb-1">Devices</p>
                                      <p className="text-2xl font-bold text-green-700">{buildingDevices.length}</p>
                                    </div>
                                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-3 border border-purple-200">
                                      <p className="text-xs text-purple-600 font-medium mb-1">Active</p>
                                      <p className="text-2xl font-bold text-purple-700">{activeDevices}</p>
                                    </div>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Floor Level */}
                  {zoomLevel === 'floor' && selectedBuilding && (
                    <div className="max-w-7xl mx-auto">
                      <div className="mb-8">
                        <h2 className="text-4xl font-bold text-gray-900 mb-2">{selectedBuilding.name}</h2>
                        <p className="text-lg text-gray-600">Select a floor to explore rooms and racks</p>
                      </div>
                      
                      {(!selectedBuilding.floors || selectedBuilding.floors.length === 0) ? (
                        <div className="text-center py-20">
                          <div className="inline-block p-8 bg-white rounded-2xl shadow-lg border border-gray-200">
                            <svg className="h-24 w-24 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p className="text-xl font-semibold text-gray-700">No floors found</p>
                            <p className="text-gray-500 mt-2">Add floors to this building from the Locations page</p>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                          {selectedBuilding.floors.map(floor => {
                            const floorDevices = devices.filter(d => 
                              d.rack?.room?.floor?.id === floor.id
                            );
                            const roomCount = floor.rooms?.length || 0;
                            
                            return (
                              <button
                                key={floor.id}
                                onClick={() => handleZoomToFloor(floor)}
                                className="group bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 p-6 text-left border-2 border-transparent hover:border-orange-500 transform hover:scale-105"
                              >
                                <div className="flex items-center justify-between mb-4">
                                  <div className="p-2 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg">
                                    <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                  </div>
                                  <span className="text-sm font-bold text-gray-400">Floor {floor.floorNumber}</span>
                                </div>
                                
                                <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-orange-600 transition">{floor.name}</h3>
                                
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-600">Rooms</span>
                                    <span className="font-bold text-orange-600">{roomCount}</span>
                                  </div>
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-600">Devices</span>
                                    <span className="font-bold text-orange-600">{floorDevices.length}</span>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Room Level */}
                  {zoomLevel === 'room' && selectedFloor && (
                    <div className="max-w-7xl mx-auto">
                      <div className="mb-8">
                        <h2 className="text-4xl font-bold text-gray-900 mb-2">{selectedFloor.name}</h2>
                        <p className="text-lg text-gray-600">Select a room to view racks</p>
                      </div>
                      
                      {(!selectedFloor.rooms || selectedFloor.rooms.length === 0) ? (
                        <div className="text-center py-20">
                          <div className="inline-block p-8 bg-white rounded-2xl shadow-lg border border-gray-200">
                            <svg className="h-24 w-24 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                            </svg>
                            <p className="text-xl font-semibold text-gray-700">No rooms found</p>
                            <p className="text-gray-500 mt-2">Add rooms to this floor from the Locations page</p>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {selectedFloor.rooms.map(room => {
                            const roomDevices = devices.filter(d => 
                              d.rack?.room?.id === room.id
                            );
                            const rackCount = room.racks?.length || 0;
                            
                            return (
                              <button
                                key={room.id}
                                onClick={() => handleZoomToRoom(room)}
                                className="group bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 p-6 text-left border-2 border-transparent hover:border-purple-500 transform hover:scale-105"
                              >
                                <div className="flex items-center justify-between mb-4">
                                  <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
                                    <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                                    </svg>
                                  </div>
                                </div>
                                
                                <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-purple-600 transition">{room.name}</h3>
                                
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-600">Racks</span>
                                    <span className="font-bold text-purple-600">{rackCount}</span>
                                  </div>
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-600">Devices</span>
                                    <span className="font-bold text-purple-600">{roomDevices.length}</span>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Rack Level */}
                  {zoomLevel === 'rack' && selectedRoom && (
                    <div className="max-w-7xl mx-auto">
                      <div className="mb-8">
                        <h2 className="text-4xl font-bold text-gray-900 mb-2">{selectedRoom.name}</h2>
                        <p className="text-lg text-gray-600">Select a rack to view devices</p>
                      </div>
                      
                      {(!selectedRoom.racks || selectedRoom.racks.length === 0) ? (
                        <div className="text-center py-20">
                          <div className="inline-block p-8 bg-white rounded-2xl shadow-lg border border-gray-200">
                            <svg className="h-24 w-24 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                            </svg>
                            <p className="text-xl font-semibold text-gray-700">No racks found</p>
                            <p className="text-gray-500 mt-2">Add racks to this room from the Locations page</p>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                          {selectedRoom.racks.map(rack => {
                            const rackDevices = devices.filter(d => d.rackId === rack.id);
                            const activeDevices = rackDevices.filter(d => d.status === 'ACTIVE').length;
                            
                            return (
                              <button
                                key={rack.id}
                                onClick={() => handleZoomToRack(rack)}
                                className="group bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 p-6 text-left border-2 border-transparent hover:border-green-500 transform hover:scale-105"
                              >
                                <div className="flex items-center justify-between mb-4">
                                  <div className="p-2 bg-gradient-to-br from-green-500 to-teal-500 rounded-lg">
                                    <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                                    </svg>
                                  </div>
                                  <span className="text-sm font-bold text-gray-400">{rack.maxUnits}U</span>
                                </div>
                                
                                <h3 className="text-xl font-bold text-gray-900 mb-1 group-hover:text-green-600 transition">{rack.name}</h3>
                                <p className="text-sm text-gray-500 mb-3">{rack.type.replace(/_/g, ' ')}</p>
                                
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-600">Total Devices</span>
                                    <span className="font-bold text-green-600">{rackDevices.length}</span>
                                  </div>
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-600">Active</span>
                                    <span className="font-bold text-green-600">{activeDevices}</span>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Device Level */}
                  {zoomLevel === 'device' && selectedRack && (
                    <div className="max-w-7xl mx-auto">
                      <div className="mb-8">
                        <h2 className="text-4xl font-bold text-gray-900 mb-2">{selectedRack.name}</h2>
                        <p className="text-lg text-gray-600">Devices in this rack</p>
                      </div>
                      
                      {(() => {
                        const rackDevices = devices.filter(d => d.rackId === selectedRack.id);
                        
                        if (rackDevices.length === 0) {
                          return (
                            <div className="text-center py-20">
                              <div className="inline-block p-8 bg-white rounded-2xl shadow-lg border border-gray-200">
                                <svg className="h-24 w-24 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                                </svg>
                                <p className="text-xl font-semibold text-gray-700">No devices found</p>
                                <p className="text-gray-500 mt-2">Add devices to this rack from the Locations page</p>
                              </div>
                            </div>
                          );
                        }
                        
                        return (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {rackDevices.map(device => {
                              const deviceServices = services.filter(s => s.deviceId === device.id);
                              const statusColor = device.status === 'ACTIVE' ? 'green' : 
                                                 device.status === 'MAINTENANCE' ? 'yellow' : 
                                                 device.status === 'INACTIVE' ? 'gray' : 'red';
                              
                              return (
                                <div
                                  key={device.id}
                                  className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 p-6 border-2 border-gray-100 hover:border-blue-500"
                                >
                                  <div className="flex items-center justify-between mb-4">
                                    <div className={`p-2 bg-gradient-to-br from-${statusColor}-500 to-${statusColor}-600 rounded-lg`}>
                                      <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                                      </svg>
                                    </div>
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold bg-${statusColor}-100 text-${statusColor}-700`}>
                                      {device.status}
                                    </span>
                                  </div>
                                  
                                  <h3 className="text-xl font-bold text-gray-900 mb-2">{device.name}</h3>
                                  <p className="text-sm text-gray-500 mb-4">{device.type.replace(/_/g, ' ')}</p>
                                  
                                  <div className="space-y-2 mb-4">
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-gray-600">Criticality</span>
                                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                                        device.criticality === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                                        device.criticality === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                                        device.criticality === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                                        'bg-blue-100 text-blue-700'
                                      }`}>
                                        {device.criticality}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-gray-600">Services</span>
                                      <span className="font-bold text-blue-600">{deviceServices.length}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-gray-600">Interfaces</span>
                                      <span className="font-bold text-blue-600">{device.networkInterfaces?.length || 0}</span>
                                    </div>
                                  </div>
                                  
                                  {device.networkInterfaces && device.networkInterfaces.length > 0 && (
                                    <div className="border-t pt-3 mt-3">
                                      <p className="text-xs font-semibold text-gray-500 mb-2">Network Interfaces</p>
                                      <div className="space-y-1">
                                        {device.networkInterfaces.slice(0, 3).map(iface => (
                                          <div key={iface.id} className="text-xs bg-gray-50 rounded px-2 py-1">
                                            <span className="font-medium text-gray-700">{iface.name}</span>
                                            {iface.ipv4 && <span className="text-gray-500 ml-1">• {iface.ipv4}</span>}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // TOPOLOGY VIEWS
              <div className="flex-1 flex">
                <div className="flex-1 relative">
                  {/* Breadcrumb Navigation */}
                  {viewMode === 'logical' && navigationPath.length > 0 && (
                    <div className="absolute top-4 left-4 z-10 bg-white rounded-lg shadow-lg border border-gray-200 p-3">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={handleNavigateToRoot}
                          className="px-3 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded transition"
                          title="Back to all buildings"
                        >
                          🏘️ All Buildings
                        </button>
                        {navigationPath.map((item, index) => (
                          <React.Fragment key={item.id}>
                            <span className="text-gray-400">/</span>
                            <button
                              onClick={() => {
                                const newPath = navigationPath.slice(0, index + 1);
                                setNavigationPath(newPath);
                                // setFocusedContainer(item);
                              }}
                              className="px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded transition"
                            >
                              {item.type === 'building' && '🏢'}
                              {item.type === 'floor' && '📋'}
                              {item.type === 'room' && '🚪'}
                              {item.type === 'rack' && '📦'}
                              {' '}{item.name}
                            </button>
                          </React.Fragment>
                        ))}
                        {navigationPath.length > 0 && (
                          <button
                            onClick={handleNavigateUp}
                            className="ml-2 px-3 py-1 text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 rounded transition"
                            title="Go up one level"
                          >
                            ← Back
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeClick={(_, node) => handleNodeClick(node)}
                    onEdgeClick={handleEdgeClick}
                    onMove={(_, viewport) => {
                      if (viewMode === 'logical') {
                        setCurrentZoom(viewport.zoom);
                      } else if (viewMode === 'building') {
                        setSemanticZoom(viewport.zoom);
                      }
                    }}
                    fitView
                    attributionPosition="bottom-left"
                  >
                    <Background color="#aaa" gap={16} />
                    <Controls />
                    <MiniMap />
                    
                    {/* Zoom Level Indicator for Logical View */}
                    {viewMode === 'logical' && (
                      <Panel position="top-left" className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg shadow-lg p-4 min-w-[250px]">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h3 className="font-bold text-sm flex items-center space-x-2">
                              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                              </svg>
                              <span>Progressive Zoom</span>
                            </h3>
                            <span className="text-xs bg-white/20 px-2 py-1 rounded font-mono">{currentZoom.toFixed(2)}x</span>
                          </div>
                          
                          <div className="space-y-1 text-xs">
                            <div className={`flex items-center space-x-2 px-2 py-1 rounded transition ${
                              currentZoom >= 0 && currentZoom < 0.4 ? 'bg-white/30 font-bold' : 'bg-white/10'
                            }`}>
                              <span className="w-2 h-2 rounded-full bg-white"></span>
                              <span>🏢 Buildings (Always visible)</span>
                            </div>
                            <div className={`flex items-center space-x-2 px-2 py-1 rounded transition ${
                              currentZoom >= 0.4 && currentZoom < 0.7 ? 'bg-white/30 font-bold' : shouldShowLevel('floor') ? 'bg-white/20' : 'bg-white/5 opacity-50'
                            }`}>
                              <span className={`w-2 h-2 rounded-full ${shouldShowLevel('floor') ? 'bg-white' : 'bg-white/30'}`}></span>
                              <span>📋 Floors (Zoom ≥ 0.4x)</span>
                            </div>
                            <div className={`flex items-center space-x-2 px-2 py-1 rounded transition ${
                              currentZoom >= 0.7 && currentZoom < 1.0 ? 'bg-white/30 font-bold' : shouldShowLevel('room') ? 'bg-white/20' : 'bg-white/5 opacity-50'
                            }`}>
                              <span className={`w-2 h-2 rounded-full ${shouldShowLevel('room') ? 'bg-white' : 'bg-white/30'}`}></span>
                              <span>🚪 Rooms (Zoom ≥ 0.7x)</span>
                            </div>
                            <div className={`flex items-center space-x-2 px-2 py-1 rounded transition ${
                              currentZoom >= 1.0 && currentZoom < 1.3 ? 'bg-white/30 font-bold' : shouldShowLevel('rack') ? 'bg-white/20' : 'bg-white/5 opacity-50'
                            }`}>
                              <span className={`w-2 h-2 rounded-full ${shouldShowLevel('rack') ? 'bg-white' : 'bg-white/30'}`}></span>
                              <span>📦 Racks (Zoom ≥ 1.0x)</span>
                            </div>
                            <div className={`flex items-center space-x-2 px-2 py-1 rounded transition ${
                              currentZoom >= 1.3 ? 'bg-white/30 font-bold' : 'bg-white/5 opacity-50'
                            }`}>
                              <span className={`w-2 h-2 rounded-full ${shouldShowLevel('device') ? 'bg-white' : 'bg-white/30'}`}></span>
                              <span>🔌 Devices (Zoom ≥ 1.3x)</span>
                            </div>
                          </div>
                          
                          <div className="text-xs mt-3 pt-2 border-t border-white/20">
                            <p className="opacity-80">💡 Use mouse wheel to zoom in/out</p>
                          </div>
                        </div>
                      </Panel>
                    )}
                    
                    {/* Semantic Zoom Controller for Building View */}
                    {viewMode === 'building' && (
                      <Panel position="top-left">
                        <SemanticZoomController
                          currentZoom={semanticZoom}
                          onZoomChange={setSemanticZoom}
                        />
                      </Panel>
                    )}
                    
                    <Panel position="top-right" className="bg-white rounded-lg shadow-md p-4 max-h-80 overflow-y-auto">
                      <div className="space-y-3">
                        <h3 className="font-bold text-gray-900 text-sm">Legend</h3>
                        <div className="space-y-2 text-xs">
                          <div className="flex items-center space-x-2">
                            <div className="w-4 h-4 rounded border-2 border-blue-500"></div>
                            <span className="text-gray-700">Physical Server</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="w-4 h-4 rounded border-2 border-green-500"></div>
                            <span className="text-gray-700">Virtual Host</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="w-4 h-4 rounded border-2 border-purple-500"></div>
                            <span className="text-gray-700">VM/Router</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="w-4 h-4 rounded border-2 border-red-500"></div>
                            <span className="text-gray-700">Firewall</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="w-4 h-4 rounded border-2 border-amber-500"></div>
                            <span className="text-gray-700">Switch</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="w-4 h-4 rounded border-2 border-gray-500"></div>
                            <span className="text-gray-700">Storage</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="w-4 h-4 rounded border-2 border-cyan-500"></div>
                            <span className="text-gray-700">Printer/Camera</span>
                          </div>
                          <hr className="my-2" />
                          <div className="flex items-center space-x-2">
                            <div className="w-6 h-0.5 bg-green-500"></div>
                            <span className="text-gray-700">UP</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="w-6 h-0.5 bg-red-500"></div>
                            <span className="text-gray-700">DOWN</span>
                          </div>
                        </div>
                      </div>
                    </Panel>
                  </ReactFlow>
                </div>

                {/* Sidebar */}
                <div className="w-80 bg-white border-l border-gray-200 p-4 overflow-y-auto shadow-lg">
                  {selectedNode ? (
                  selectedNode.data.isBuildingConnection ? (
                    // Building Connection details
                    <div>
                      <div className="bg-gradient-to-r from-purple-600 to-purple-700 -m-4 mb-4 p-6 rounded-t-lg">
                        <div className="flex items-center space-x-3">
                          <div className="bg-white bg-opacity-20 rounded-lg p-2 backdrop-blur-sm">
                            <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                          </div>
                          <div>
                            <h2 className="text-xl font-bold text-white">Building Connection</h2>
                            <p className="text-purple-100 text-sm">Inter-building connectivity</p>
                          </div>
                        </div>
                      </div>

                      {(() => {
                        const conn = selectedNode.data.buildingConnection;
                        
                        // Connection type visual metadata
                        const typeInfo: Record<string, { label: string; icon: string; color: string; bgColor: string; borderColor: string }> = {
                          'FIBER_SINGLE_MODE': { label: 'Fiber Single-Mode', icon: '🔴', color: 'text-red-700', bgColor: 'bg-red-50', borderColor: 'border-red-200' },
                          'FIBER_MULTI_MODE': { label: 'Fiber Multi-Mode', icon: '🟠', color: 'text-orange-700', bgColor: 'bg-orange-50', borderColor: 'border-orange-200' },
                          'CAT5E': { label: 'Cat 5e Cable', icon: '📡', color: 'text-green-700', bgColor: 'bg-green-50', borderColor: 'border-green-200' },
                          'CAT6': { label: 'Cat 6 Cable', icon: '📡', color: 'text-green-700', bgColor: 'bg-green-50', borderColor: 'border-green-200' },
                          'CAT6A': { label: 'Cat 6a Cable', icon: '📡', color: 'text-green-800', bgColor: 'bg-green-50', borderColor: 'border-green-200' },
                          'CAT7': { label: 'Cat 7 Cable', icon: '📡', color: 'text-green-800', bgColor: 'bg-green-50', borderColor: 'border-green-200' },
                          'CAT8': { label: 'Cat 8 Cable', icon: '📡', color: 'text-green-900', bgColor: 'bg-green-50', borderColor: 'border-green-200' },
                          'WIRELESS': { label: 'Wireless Link', icon: '📶', color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' },
                          'MICROWAVE': { label: 'Microwave Link', icon: '📡', color: 'text-purple-700', bgColor: 'bg-purple-50', borderColor: 'border-purple-200' },
                          'LEASED_LINE': { label: 'Leased Line', icon: '🔗', color: 'text-yellow-700', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200' },
                          'MPLS': { label: 'MPLS Network', icon: '🌐', color: 'text-cyan-700', bgColor: 'bg-cyan-50', borderColor: 'border-cyan-200' },
                          'VPN': { label: 'VPN Tunnel', icon: '🔒', color: 'text-purple-700', bgColor: 'bg-purple-50', borderColor: 'border-purple-200' },
                          'OTHER': { label: 'Other', icon: '❓', color: 'text-gray-700', bgColor: 'bg-gray-50', borderColor: 'border-gray-200' },
                        };

                        const info = typeInfo[conn.connectionType] || typeInfo['OTHER'];

                        return (
                          <div className="space-y-5">
                            {/* Connection Path */}
                            <div className="bg-white rounded-xl p-5 border-2 border-purple-100 shadow-sm">
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Source</p>
                                  <p className="font-extrabold text-gray-900 text-lg">{conn.sourceBuilding?.name || 'Unknown'}</p>
                                  <p className="text-sm text-gray-500 font-medium">{conn.sourceBuilding?.city || ''}</p>
                                </div>
                                <div className="px-4">
                                  <div className="bg-purple-100 rounded-full p-2">
                                    <svg className="h-6 w-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                    </svg>
                                  </div>
                                </div>
                                <div className="flex-1 text-right">
                                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Destination</p>
                                  <p className="font-extrabold text-gray-900 text-lg">{conn.destBuilding?.name || 'Unknown'}</p>
                                  <p className="text-sm text-gray-500 font-medium">{conn.destBuilding?.city || ''}</p>
                                </div>
                              </div>
                            </div>

                            {/* Connection Type - High Visibility */}
                            <div className={`${info.bgColor} ${info.borderColor} border-2 rounded-xl p-5 shadow-sm relative overflow-hidden`}>
                              <div className="absolute right-[-10px] top-[-10px] opacity-10 text-6xl rotate-12">
                                {info.icon}
                              </div>
                              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Primary Connection Type</p>
                              <div className="flex items-center space-x-3">
                                <span className="text-4xl">{info.icon}</span>
                                <div>
                                  <p className={`text-2xl font-black ${info.color}`}>{info.label}</p>
                                  <p className="text-sm font-bold text-gray-500">{conn.status} Connection</p>
                                </div>
                              </div>
                            </div>

                            {/* Key Features Grid */}
                            <div className="grid grid-cols-2 gap-4">
                              {/* Bandwidth */}
                              <div className="bg-blue-50 border-2 border-blue-100 rounded-xl p-4 shadow-sm">
                                <div className="flex items-center space-x-2 mb-1">
                                  <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                  </svg>
                                  <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">Speed</p>
                                </div>
                                <p className="text-xl font-black text-blue-900">{conn.bandwidth || 'N/A'}</p>
                              </div>

                              {/* Distance */}
                              <div className="bg-orange-50 border-2 border-orange-100 rounded-xl p-4 shadow-sm">
                                <div className="flex items-center space-x-2 mb-1">
                                  <svg className="h-5 w-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  </svg>
                                  <p className="text-xs font-bold text-orange-700 uppercase tracking-wider">Distance</p>
                                </div>
                                <p className="text-xl font-black text-orange-900">{conn.distance ? `${conn.distance} km` : 'N/A'}</p>
                              </div>
                            </div>

                            {/* Detailed Specs */}
                            <div className="space-y-3">
                              {conn.fiberType && (
                                <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3">
                                  <div className="flex items-center space-x-2">
                                    <span className="text-xl">🧵</span>
                                    <span className="text-sm font-bold text-gray-600">Fiber Type</span>
                                  </div>
                                  <span className="text-sm font-black text-red-600 bg-red-50 px-3 py-1 rounded-full">{conn.fiberType}</span>
                                </div>
                              )}

                              {conn.recordingMethod && (
                                <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3">
                                  <div className="flex items-center space-x-2">
                                    <span className="text-xl">{conn.recordingMethod === 'AUTO' ? '🤖' : '✍️'}</span>
                                    <span className="text-sm font-bold text-gray-600">Recorded By</span>
                                  </div>
                                  <span className={`text-sm font-black px-3 py-1 rounded-full ${
                                    conn.recordingMethod === 'AUTO' ? 'text-blue-700 bg-blue-50' : 'text-green-700 bg-green-50'
                                  }`}>
                                    {conn.recordingMethod === 'AUTO' ? 'Automatic' : 'Manual'}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Provider Information */}
                            {(conn.provider || conn.circuitId) && (
                              <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-xl p-5 text-white shadow-md relative overflow-hidden">
                                <div className="absolute right-[-10px] bottom-[-10px] opacity-10 text-6xl">
                                  🏢
                                </div>
                                <p className="text-xs font-bold text-indigo-100 uppercase tracking-wider mb-3">Service Provider Details</p>
                                <div className="space-y-3">
                                  {conn.provider && (
                                    <div>
                                      <p className="text-xs text-indigo-200 font-medium">Provider Name</p>
                                      <p className="text-lg font-black">{conn.provider}</p>
                                    </div>
                                  )}
                                  {conn.circuitId && (
                                    <div>
                                      <p className="text-xs text-indigo-200 font-medium">Circuit / ID</p>
                                      <p className="text-sm font-mono bg-white bg-opacity-10 rounded px-2 py-1 inline-block mt-1">{conn.circuitId}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Additional Metadata */}
                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-4">
                              {conn.cableSpecs && (
                                <div>
                                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Cable Specifications</p>
                                  <p className="text-sm text-gray-800 font-medium leading-relaxed">{conn.cableSpecs}</p>
                                </div>
                              )}
                              {conn.notes && (
                                <div>
                                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Administrator Notes</p>
                                  <p className="text-sm text-gray-800 font-medium italic leading-relaxed">"{conn.notes}"</p>
                                </div>
                              )}
                            </div>

                            {/* Action Footer */}
                            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                              <div className="text-[10px] text-gray-400 font-medium">
                                <p>Created: {new Date(conn.createdAt).toLocaleDateString()}</p>
                                {conn.updatedAt && (
                                  <p>Last Update: {new Date(conn.updatedAt).toLocaleDateString()}</p>
                                )}
                              </div>
                              <button
                                onClick={() => {
                                  setBuildingConnectionToEdit(conn);
                                  setShowBuildingConnectionModal(true);
                                }}
                                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg shadow-sm transition-all text-sm font-black flex items-center space-x-2"
                              >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                <span>Edit Connection</span>
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : selectedNode.data.isGroup ? (
                    // Group node details (Building, Floor, Room, Rack)
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 mb-4 pb-3 border-b border-gray-200">
                        {selectedNode.data.hierarchyLevel === 'building' ? 'Building' :
                         selectedNode.data.hierarchyLevel === 'floor' ? 'Floor' :
                         selectedNode.data.hierarchyLevel === 'room' ? 'Room' :
                         selectedNode.data.hierarchyLevel === 'rack' ? 'Rack' : 'Details'}
                      </h2>
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm font-semibold text-gray-600 uppercase">Name</p>
                          <p className="font-bold text-gray-900 text-lg mt-1">{selectedNode.data.label}</p>
                        </div>
                        {selectedNode.data.deviceCount !== undefined && (
                          <div>
                            <p className="text-sm font-semibold text-gray-600 uppercase">Devices</p>
                            <p className="font-medium text-gray-800 mt-1">{selectedNode.data.deviceCount} device(s)</p>
                          </div>
                        )}
                        {selectedNode.data.isEmpty && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                            <p className="text-sm text-yellow-800">No devices assigned to this location yet.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    // Device details - Modern design with icons
                    <div>
                      {/* Header with gradient */}
                      <div className="bg-gradient-to-r from-blue-600 to-blue-700 -m-4 mb-4 p-6 rounded-t-lg">
                        <div className="flex items-center space-x-3">
                          <div className="bg-white bg-opacity-20 rounded-lg p-2 backdrop-blur-sm">
                            <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                            </svg>
                          </div>
                          <div>
                            <h2 className="text-xl font-bold text-white">{selectedNode.data.label}</h2>
                            <p className="text-blue-100 text-sm">{selectedNode.data.type?.replace(/_/g, ' ') || 'Device'}</p>
                          </div>
                        </div>
                      </div>

                      {/* Key metrics cards */}
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        {/* Status Card */}
                        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-3 border border-green-200">
                          <div className="flex items-center space-x-2 mb-1">
                            <svg className="h-4 w-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            <p className="text-xs font-semibold text-green-700 uppercase">Status</p>
                          </div>
                          <p className={`text-sm font-bold ${selectedNode.data.status === 'ACTIVE' ? 'text-green-700' : 'text-gray-600'}`}>
                            {selectedNode.data.status || 'N/A'}
                          </p>
                        </div>

                        {/* Criticality Card */}
                        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-3 border border-red-200">
                          <div className="flex items-center space-x-2 mb-1">
                            <svg className="h-4 w-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <p className="text-xs font-semibold text-red-700 uppercase">Priority</p>
                          </div>
                          <p className="text-sm font-bold text-red-700">{selectedNode.data.criticality || 'N/A'}</p>
                        </div>

                        {/* Services Card */}
                        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-3 border border-blue-200">
                          <div className="flex items-center space-x-2 mb-1">
                            <svg className="h-4 w-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                            </svg>
                            <p className="text-xs font-semibold text-blue-700 uppercase">Services</p>
                          </div>
                          <p className="text-sm font-bold text-blue-700">{selectedNode.data.serviceCount || 0} running</p>
                        </div>

                        {/* Interfaces Card */}
                        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-3 border border-purple-200">
                          <div className="flex items-center space-x-2 mb-1">
                            <svg className="h-4 w-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <p className="text-xs font-semibold text-purple-700 uppercase">Interfaces</p>
                          </div>
                          <p className="text-sm font-bold text-purple-700">{selectedNode.data.interfaceCount || 0} ports</p>
                        </div>
                      </div>

                      {/* Network Interfaces Section */}
                      {selectedNode.data.interfaceCount > 0 && (
                        <div className="mb-4">
                          <div className="flex items-center space-x-2 mb-3">
                            <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                            </svg>
                            <h3 className="text-sm font-bold text-gray-900 uppercase">Network Interfaces</h3>
                          </div>
                          {selectedNode.data.interfaces && selectedNode.data.interfaces.length > 0 && (
                            <div className="space-y-2">
                              {selectedNode.data.interfaces.map((iface: any, idx: number) => (
                                <div key={idx} className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                      <svg className="h-4 w-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                      </svg>
                                      <span className="font-semibold text-sm text-gray-900">{iface.name}</span>
                                    </div>
                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                      iface.status === 'UP' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                                    }`}>
                                      {iface.status}
                                    </span>
                                  </div>
                                  {iface.ipv4 && (
                                    <p className="text-xs text-gray-600 mt-1 ml-6">
                                      <span className="font-medium">IP:</span> {iface.ipv4}
                                    </p>
                                  )}
                                  {iface.macAddress && (
                                    <p className="text-xs text-gray-600 ml-6">
                                      <span className="font-medium">MAC:</span> {iface.macAddress}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Location Section */}
                      {(selectedNode.data.building || selectedNode.data.rack) && (
                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                          <div className="flex items-center space-x-2 mb-3">
                            <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <h3 className="text-sm font-bold text-gray-900 uppercase">Physical Location</h3>
                          </div>
                          {selectedNode.data.building && (
                            <div className="space-y-2">
                              <div className="flex items-center space-x-2">
                                <svg className="h-4 w-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                                <span className="text-sm"><span className="font-semibold text-gray-700">Building:</span> <span className="text-gray-600">{selectedNode.data.building}</span></span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <svg className="h-4 w-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
                                </svg>
                                <span className="text-sm"><span className="font-semibold text-gray-700">Floor:</span> <span className="text-gray-600">{selectedNode.data.floor}</span></span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <svg className="h-4 w-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                                </svg>
                                <span className="text-sm"><span className="font-semibold text-gray-700">Room:</span> <span className="text-gray-600">{selectedNode.data.room}</span></span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <svg className="h-4 w-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                                </svg>
                                <span className="text-sm"><span className="font-semibold text-gray-700">Rack:</span> <span className="text-gray-600">{selectedNode.data.rack}</span></span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                  ) : (
                    <div className="text-center mt-12">
                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-full p-6 w-24 h-24 mx-auto mb-4 flex items-center justify-center">
                        <svg className="h-12 w-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 mb-2">No Selection</h3>
                      <p className="text-sm text-gray-600 max-w-xs mx-auto">Click on any device or container in the topology view to see detailed information</p>
                    </div>
                  )}
                </div>
              </div>
            )}  
          </>
        )}
        
        {/* Building Connection Modal */}
        {showBuildingConnectionModal && (
          <BuildingConnectionModal
            buildings={buildings}
            connection={buildingConnectionToEdit}
            onClose={() => {
              setShowBuildingConnectionModal(false);
              setBuildingConnectionToEdit(null);
            }}
            onSuccess={() => {
              setShowBuildingConnectionModal(false);
              setBuildingConnectionToEdit(null);
              loadData();
            }}
            existingConnections={buildingConnections}
          />
        )}
        
        {/* Building Connections Management Modal */}
        {showManagementModal && (
          <BuildingConnectionsManagementModal
            connections={buildingConnections}
            onClose={() => setShowManagementModal(false)}
            onUpdate={async () => {
              await loadData();
            }}
            onEdit={(conn: any) => {
              setBuildingConnectionToEdit(conn);
              setShowBuildingConnectionModal(true);
            }}
          />
        )}

        {/* Connection Wizard Modal */}
        <ConnectionWizard
          isOpen={showConnectionWizard}
          onClose={() => {
            console.log('ConnectionWizard onClose called');
            setShowConnectionWizard(false);
          }}
          devices={devices.map((d: Device) => ({
            id: d.id,
            name: d.name,
            type: d.type,
            buildingName: d.rack?.room?.floor?.building?.name,
            location: `${d.rack?.room?.name || ''} - ${d.rack?.name || ''}`.trim().replace(/^- /, ''),
          }))}
          onCreateConnection={handleCreateConnection}
        />
      </div>
    </div>
  );
};

// Building Connection Modal Component
interface BuildingConnectionModalProps {
  buildings: Building[];
  connection?: any | null;
  onClose: () => void;
  onSuccess: () => void;
  existingConnections: any[];
}

const BuildingConnectionModal: React.FC<BuildingConnectionModalProps> = ({
  buildings,
  connection,
  onClose,
  onSuccess,
  existingConnections,
}) => {
  const [formData, setFormData] = useState({
    sourceBuildingId: '',
    destBuildingId: '',
    connectionType: 'FIBER_SINGLE_MODE',
    status: 'ACTIVE',
    bandwidth: '',
    distance: '',
    fiberType: '',
    cableSpecs: '',
    provider: '',
    circuitId: '',
    notes: '',
  });

  useEffect(() => {
    if (connection) {
      setFormData({
        sourceBuildingId: connection.sourceBuildingId || '',
        destBuildingId: connection.destBuildingId || '',
        connectionType: connection.connectionType || 'FIBER_SINGLE_MODE',
        status: connection.status || 'ACTIVE',
        bandwidth: connection.bandwidth || '',
        distance: connection.distance?.toString() || '',
        fiberType: connection.fiberType || '',
        cableSpecs: connection.cableSpecs || '',
        provider: connection.provider || '',
        circuitId: connection.circuitId || '',
        notes: connection.notes || '',
      });
    }
  }, [connection]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectionTypes = [
    { value: 'FIBER_SINGLE_MODE', label: 'Fiber Single-Mode', icon: '🔴' },
    { value: 'FIBER_MULTI_MODE', label: 'Fiber Multi-Mode', icon: '🟠' },
    { value: 'CAT5E', label: 'Cat 5e Cable', icon: '📡' },
    { value: 'CAT6', label: 'Cat 6 Cable', icon: '📡' },
    { value: 'CAT6A', label: 'Cat 6a Cable', icon: '📡' },
    { value: 'CAT7', label: 'Cat 7 Cable', icon: '📡' },
    { value: 'CAT8', label: 'Cat 8 Cable', icon: '📡' },
    { value: 'WIRELESS', label: 'Wireless', icon: '📶' },
    { value: 'MICROWAVE', label: 'Microwave Link', icon: '📡' },
    { value: 'LEASED_LINE', label: 'Leased Line', icon: '🔗' },
    { value: 'MPLS', label: 'MPLS Network', icon: '🌐' },
    { value: 'VPN', label: 'VPN Tunnel', icon: '🔒' },
    { value: 'OTHER', label: 'Other', icon: '❓' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      let response;
      if (connection?.id) {
        response = await apiPut(`/api/building-connections/${connection.id}`, {
          ...formData,
          distance: formData.distance ? parseFloat(formData.distance) : undefined,
        });
      } else {
        response = await apiPost('/api/building-connections', {
          ...formData,
          distance: formData.distance ? parseFloat(formData.distance) : undefined,
        });
      }

      if (response.success) {
        onSuccess();
      } else {
        setError(response.error || `Failed to ${connection?.id ? 'update' : 'create'} connection`);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || `Failed to ${connection?.id ? 'update' : 'create'} connection`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10001] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 p-6 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-white bg-opacity-20 rounded-lg p-2 backdrop-blur-sm">
                <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{connection?.id ? 'Edit' : 'Add'} Building Connection</h2>
                <p className="text-purple-100 text-sm">{connection?.id ? 'Update existing' : 'Create new'} inter-building connectivity</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Source Building */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Source Building *
              </label>
              <select
                required
                value={formData.sourceBuildingId}
                onChange={(e) => setFormData({ ...formData, sourceBuildingId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="">Select source building</option>
                {buildings.map((building) => (
                  <option key={building.id} value={building.id}>
                    {building.name} {building.city ? `(${building.city})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Destination Building */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Destination Building *
              </label>
              <select
                required
                value={formData.destBuildingId}
                onChange={(e) => setFormData({ ...formData, destBuildingId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="">Select destination building</option>
                {buildings
                  .filter((b) => b.id !== formData.sourceBuildingId)
                  .map((building) => (
                    <option key={building.id} value={building.id}>
                      {building.name} {building.city ? `(${building.city})` : ''}
                    </option>
                  ))}
              </select>
            </div>

            {/* Connection Type */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Connection Type *
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {connectionTypes.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, connectionType: type.value })}
                    className={`p-3 border-2 rounded-lg text-left transition ${
                      formData.connectionType === type.value
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-purple-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <span className="text-2xl">{type.icon}</span>
                      <span className="text-sm font-medium text-gray-900">{type.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Bandwidth */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Bandwidth
              </label>
              <input
                type="text"
                placeholder="e.g., 10Gbps, 1Gbps"
                value={formData.bandwidth}
                onChange={(e) => setFormData({ ...formData, bandwidth: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            {/* Distance */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Distance (km)
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="Distance in kilometers"
                value={formData.distance}
                onChange={(e) => setFormData({ ...formData, distance: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            {/* Fiber Type */}
            {(formData.connectionType === 'FIBER_SINGLE_MODE' || formData.connectionType === 'FIBER_MULTI_MODE') && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Fiber Type
                </label>
                <input
                  type="text"
                  placeholder="e.g., OS2, OM3, OM4"
                  value={formData.fiberType}
                  onChange={(e) => setFormData({ ...formData, fiberType: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            )}

            {/* Cable Specs */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Cable Specifications
              </label>
              <input
                type="text"
                placeholder="Additional cable specs"
                value={formData.cableSpecs}
                onChange={(e) => setFormData({ ...formData, cableSpecs: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            {/* Provider */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Provider
              </label>
              <input
                type="text"
                placeholder="ISP or provider name"
                value={formData.provider}
                onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            {/* Circuit ID */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Circuit ID
              </label>
              <input
                type="text"
                placeholder="Circuit/Service ID"
                value={formData.circuitId}
                onChange={(e) => setFormData({ ...formData, circuitId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="MAINTENANCE">Maintenance</option>
                <option value="PLANNED">Planned</option>
                <option value="DECOMMISSIONED">Decommissioned</option>
              </select>
            </div>

            {/* Notes */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Notes
              </label>
              <textarea
                rows={3}
                placeholder="Additional notes about this connection"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Existing Connections Info */}
          {existingConnections.length > 0 && (
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <svg className="h-5 w-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-blue-900 mb-1">
                    {existingConnections.length} existing connection(s)
                  </p>
                  <p className="text-xs text-blue-700">
                    Make sure you're not creating a duplicate connection
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-6 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !formData.sourceBuildingId || !formData.destBuildingId}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center space-x-2"
            >
              {loading && (
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              <span>{loading ? (connection?.id ? 'Updating...' : 'Creating...') : (connection?.id ? 'Update Connection' : 'Create Connection')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Building Connections Management Modal Component
interface BuildingConnectionsManagementModalProps {
  connections: any[];
  onClose: () => void;
  onUpdate: () => void;
  onEdit: (connection: any) => void;
}

const BuildingConnectionsManagementModal: React.FC<BuildingConnectionsManagementModalProps> = ({
  connections,
  onClose,
  onUpdate,
  onEdit,
}) => {
  const [selectedConnection, setSelectedConnection] = useState<any | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleDelete = async (connectionId: string) => {
    setLoading(true);
    try {
      const response = await apiDelete(`/api/building-connections/${connectionId}`);
      if (response.success) {
        setDeleteConfirm(null);
        onUpdate();
      }
    } catch (error) {
      console.error('Failed to delete connection:', error);
    } finally {
      setLoading(false);
    }
  };

  const getConnectionTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      'FIBER_SINGLE_MODE': '🔴',
      'FIBER_MULTI_MODE': '🟠',
      'CAT5E': '📡',
      'CAT6': '📡',
      'CAT6A': '📡',
      'CAT7': '📡',
      'CAT8': '📡',
      'WIRELESS': '📶',
      'MICROWAVE': '📡',
      'LEASED_LINE': '🔗',
      'MPLS': '🌐',
      'VPN': '🔒',
      'OTHER': '❓',
    };
    return icons[type] || '🔗';
  };

  const getConnectionTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      'FIBER_SINGLE_MODE': 'text-red-600 bg-red-50',
      'FIBER_MULTI_MODE': 'text-orange-600 bg-orange-50',
      'CAT5E': 'text-green-600 bg-green-50',
      'CAT6': 'text-green-600 bg-green-50',
      'CAT6A': 'text-green-700 bg-green-50',
      'CAT7': 'text-green-700 bg-green-50',
      'CAT8': 'text-green-800 bg-green-50',
      'WIRELESS': 'text-blue-600 bg-blue-50',
      'MICROWAVE': 'text-purple-600 bg-purple-50',
      'LEASED_LINE': 'text-yellow-600 bg-yellow-50',
      'MPLS': 'text-cyan-600 bg-cyan-50',
      'VPN': 'text-purple-600 bg-purple-50',
      'OTHER': 'text-gray-600 bg-gray-50',
    };
    return colors[type] || 'text-gray-600 bg-gray-50';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-white bg-opacity-20 rounded-lg p-2 backdrop-blur-sm">
                <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Building Connections</h2>
                <p className="text-purple-100 text-sm">{connections.length} connection(s) total</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {connections.length === 0 ? (
            <div className="text-center py-12">
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-full p-6 w-24 h-24 mx-auto mb-4 flex items-center justify-center">
                <svg className="h-12 w-12 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">No Building Connections</h3>
              <p className="text-sm text-gray-600">Create your first inter-building connection to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {/* Connection Path */}
                      <div className="flex items-center space-x-3 mb-3">
                        <div className="flex items-center space-x-2">
                          <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                          <span className="font-semibold text-gray-900">{conn.sourceBuilding?.name || 'Unknown'}</span>
                        </div>
                        <svg className="h-5 w-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                        <div className="flex items-center space-x-2">
                          <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                          <span className="font-semibold text-gray-900">{conn.destBuilding?.name || 'Unknown'}</span>
                        </div>
                      </div>

                      {/* Details Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        {/* Connection Type */}
                        <div className="col-span-2">
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Primary Type</p>
                          <div className={`inline-flex items-center space-x-2 px-4 py-2 rounded-xl border-2 ${getConnectionTypeColor(conn.connectionType)} shadow-sm`}>
                            <span className="text-2xl">{getConnectionTypeIcon(conn.connectionType)}</span>
                            <span className="font-black text-lg tracking-tight">{conn.connectionType?.replace(/_/g, ' ')}</span>
                          </div>
                        </div>

                        {/* Status */}
                        <div>
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Status</p>
                          <span className={`inline-flex px-3 py-1.5 rounded-lg font-black text-sm border-2 ${
                            conn.status === 'ACTIVE' ? 'text-green-700 bg-green-50 border-green-200' : 'text-gray-700 bg-gray-50 border-gray-200'
                          }`}>
                            {conn.status}
                          </span>
                        </div>

                        {/* Bandwidth */}
                        {conn.bandwidth && (
                          <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Speed</p>
                            <div className="flex items-center space-x-1.5">
                              <svg className="h-4 w-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                              <span className="text-gray-900 font-black text-base">{conn.bandwidth}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center space-x-2 ml-4">
                      <button
                        onClick={() => setSelectedConnection(conn)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        title="View Details"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => onEdit(conn)}
                        className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition"
                        title="Edit Connection"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      {conn.recordingMethod === 'MANUAL' && (
                        <button
                          onClick={() => setDeleteConfirm(conn.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                          title="Delete Connection"
                        >
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Delete Confirmation */}
                  {deleteConfirm === conn.id && (
                    <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
                      <p className="text-sm text-red-800 font-semibold mb-3">
                        Are you sure you want to delete this connection?
                      </p>
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => handleDelete(conn.id)}
                          disabled={loading}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-medium transition"
                        >
                          {loading ? 'Deleting...' : 'Yes, Delete'}
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Details Sidebar */}
        {selectedConnection && (
          <div className="absolute right-0 top-0 bottom-0 w-96 bg-white border-l border-gray-200 shadow-2xl overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-purple-700 p-4 flex items-center justify-between z-10">
              <h3 className="text-lg font-bold text-white">Connection Details</h3>
              <button
                onClick={() => setSelectedConnection(null)}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-1 transition"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* All connection details - same as sidebar in main view */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Source</p>
                    <p className="font-bold text-gray-900">{selectedConnection.sourceBuilding?.name || 'Unknown'}</p>
                    <p className="text-xs text-gray-600">{selectedConnection.sourceBuilding?.city || ''}</p>
                  </div>
                  <svg className="h-6 w-6 text-purple-600 mx-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                  <div className="flex-1 text-right">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Destination</p>
                    <p className="font-bold text-gray-900">{selectedConnection.destBuilding?.name || 'Unknown'}</p>
                    <p className="text-xs text-gray-600">{selectedConnection.destBuilding?.city || ''}</p>
                  </div>
                </div>
              </div>

              {selectedConnection.notes && (
                <div>
                  <p className="text-sm font-semibold text-gray-600 uppercase mb-2">Notes</p>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-sm text-gray-800">{selectedConnection.notes}</p>
                  </div>
                </div>
              )}

              <div className="text-xs text-gray-500 pt-3 border-t border-gray-200">
                <p>Created: {new Date(selectedConnection.createdAt).toLocaleString()}</p>
                {selectedConnection.updatedAt && (
                  <p>Updated: {new Date(selectedConnection.updatedAt).toLocaleString()}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const NetworkTopologyPageWrapper = () => {
  return (
    <ReactFlowProvider>
      <NetworkTopologyPage />
    </ReactFlowProvider>
  );
};

export default NetworkTopologyPageWrapper;
