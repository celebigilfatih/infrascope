'use client';

import { useRouter } from 'next/navigation';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../../lib/api';
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
import { toPng } from 'html-to-image';
import download from 'downloadjs';
import { BuildingNode } from '../../components/topology/BuildingNode';
import { DeviceNode } from '../../components/topology/DeviceNode';
import { CustomEdge, BuildingConnectionEdge } from '../../components/topology/CustomEdge';
import { SemanticZoomController } from '../../components/topology/SemanticZoomController';
import { ConnectionWizard } from '../../components/topology/ConnectionWizard';
import { getZoomConfig, filterNodesByZoom, filterEdgesByZoom } from '../../lib/semanticZoom';
import { getDeviceRole, getDevicePositionWeight } from '../../lib/deviceRoleMapper';
import { getVendorLogo } from '../../lib/formatting';
import { Label } from '@/components/ui/label';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { 
  Card, 
  CardContent
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Search, 
  Download, 
  Maximize2, 
  Filter, 
  Layout, 
  Plus, 
  X, 
  ArrowLeft,
  Settings2,
  Activity,
  Zap,
  Box,
  LayoutDashboard,
  ChevronRight,
  ChevronLeft,
  Undo2,
  MapPin,
  Building2,
  Layers,
  DoorOpen,
  BoxSelect,
  Server,
  Network,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Device {
  id: string;
  name: string;
  type: string;
  vendor?: string;
  status: string;
  criticality: string;
  rackId?: string;
  rack?: {
    id: string;
    name: string;
    imageUrl?: string;
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
  imageUrl?: string;
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

// Connection type styling for all views
const connectionStyles: Record<string, { color: string; dash: string; width: number; label: string; icon: string }> = {
  'FIBER_SINGLE_MODE': { color: '#DC2626', dash: '0', width: 5, label: 'Fiber Single-Mode (Tekli)', icon: '🔴' },
  'FIBER_MULTI_MODE': { color: '#EA580C', dash: '0', width: 5, label: 'Fiber Multi-Mode (Çoklu)', icon: '🟠' },
  'CAT5E': { color: '#16A34A', dash: '5,5', width: 4, label: 'Cat5e Kablo', icon: '📡' },
  'CAT6': { color: '#16A34A', dash: '5,5', width: 4, label: 'Cat6 Kablo', icon: '📡' },
  'CAT6A': { color: '#059669', dash: '5,5', width: 4, label: 'Cat6a Kablo', icon: '📡' },
  'CAT7': { color: '#047857', dash: '5,5', width: 4, label: 'Cat7 Kablo', icon: '📡' },
  'CAT8': { color: '#065F46', dash: '5,5', width: 4, label: 'Cat8 Kablo', icon: '📡' },
  'WIRELESS': { color: '#2563EB', dash: '10,5', width: 3, label: 'Kablosuz Bağlantı', icon: '📶' },
  'MICROWAVE': { color: '#7C3AED', dash: '10,5', width: 3, label: 'Mikrodalga Link', icon: '📡' },
  'LEASED_LINE': { color: '#CA8A04', dash: '15,5,5,5', width: 4, label: 'Kiralık Hat', icon: '🔗' },
  'MPLS': { color: '#0891B2', dash: '15,5,5,5', width: 4, label: 'MPLS Ağ', icon: '🌐' },
  'VPN': { color: '#9333EA', dash: '20,5', width: 3, label: 'VPN Tünel', icon: '🔒' },
  'OTHER': { color: '#6B7280', dash: '5,5', width: 3, label: 'Diğer Bağlantı', icon: '❓' },
};

const NetworkTopologyPage = () => {
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [connections, setConnections] = useState<NetworkConnection[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState<'physical' | 'services' | 'hierarchy' | 'zoom' | 'building'>('building');
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
  
  // Hierarchical navigation state (kept for future use in zoom view)
  // const [navigationPath, setNavigationPath] = useState<Array<{ type: string; name: string; id: string }>>([]);
  // const [focusedContainer, setFocusedContainer] = useState<{ type: string; name: string; id: string } | null>(null);
  
  // Building connection modal state
  const [showBuildingConnectionModal, setShowBuildingConnectionModal] = useState(false);
  const [buildingConnectionToEdit, setBuildingConnectionToEdit] = useState<any | null>(null);
  const [buildingConnections, setBuildingConnections] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [showManagementModal, setShowManagementModal] = useState(false);
  
  // Building view state - for new building-centric topology
  const [semanticZoom, setSemanticZoom] = useState(1);
  const [selectedBuildingForPopup, setSelectedBuildingForPopup] = useState<Building | null>(null);
  const [expandedBuildings, setExpandedBuildings] = useState<Set<string>>(new Set());
  // const [focusedBuildingId, setFocusedBuildingId] = useState<string | null>(null);
  const [showConnectionWizard, setShowConnectionWizard] = useState(false);

  const onExport = useCallback(() => {
    const element = document.querySelector('.react-flow__viewport') as HTMLElement;
    if (element) {
      toPng(element, {
        backgroundColor: 'var(--background)',
        style: {
          transform: 'none',
        },
      }).then((dataUrl) => {
        download(dataUrl, 'infrascope-topology.png');
      });
    }
  }, []);

  const applyAutoLayout = useCallback(() => {
    // Basic grid layout for devices in non-building views
    if (viewMode !== 'building') {
      const spacing = 250;
      const cols = Math.ceil(Math.sqrt(nodes.length));
      
      const newNodes = nodes.map((node, index) => {
        if (node.data.isGroup) return node;
        const row = Math.floor(index / cols);
        const col = index % cols;
        return {
          ...node,
          position: { x: col * spacing, y: row * spacing },
        };
      });
      setNodes(newNodes);
    }
  }, [nodes, viewMode, setNodes]);

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
      setError(err.message || 'Veriler yüklenirken bir hata oluştu');
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
  const deviceTypes = useMemo(() => ['all', ...Array.from(new Set(devices.map(d => d.type)))], [devices]);
  
  // Filter devices based on filters and search
  const filteredDevices = useMemo(() => devices.filter(device => {
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
  }), [devices, searchQuery, filterDeviceType, filterStatus, filterCriticality]);
  
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
    setIsSidebarOpen(true);
    
    // Handle building popup for Building View
    if (viewMode === 'building' && node.type === 'building') {
      const building = buildings.find(b => `building-${b.id}` === node.id);
      if (building) {
        setSelectedBuildingForPopup(building);
      }
    }
    
    if (node.data.isGroup) {
      // Hierarchical navigation is not used after logical view removal
    }
  };
  
  const handleEdgeClick = (_event: React.MouseEvent, edge: Edge) => {
    // If it's a building connection edge, show its details
    if (edge.data?.type === 'building-connection' && edge.data?.buildingConnection) {
      setSelectedNode({
        id: edge.id,
        position: { x: 0, y: 0 },
        data: {
          label: 'Bina Bağlantısı',
          isBuildingConnection: true,
          buildingConnection: edge.data.buildingConnection,
        },
      } as Node);
      setIsSidebarOpen(true);
    }
  };
  
  /* Navigation path helpers removed as logical view is gone
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
  */
  
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
  const shouldShowLevel = (_level: 'building' | 'floor' | 'room' | 'rack' | 'device') => {
    return true;
  };
  
  // Helper to determine if we should render a node type
  const shouldRenderNodeType = (_hierarchyLevel: string) => {
    return true;
  };

  const { topologyNodes, topologyEdges } = useMemo(() => {
    if (devices.length === 0) return { topologyNodes: [], topologyEdges: [] };

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    
    // Use filtered devices for topology generation
    const devicesToRender = filteredDevices;
    
    const buildingHierarchy: Record<string, Record<string, Record<string, Record<string, Device[]>>>> = {};
    const buildingColors: Record<string, string> = {};
    const buildingColorPalette = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
    let colorIndex = 0;
    let buildingYOffset = 0;

    // Hierarchy view rendering
    if (viewMode === 'hierarchy') {
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
          Object.entries(buildingDeviceHierarchy as Record<string, any>).forEach(([_floorName, rooms]) => {
            let floorHeight = 60;
            Object.entries(rooms as Record<string, any>).forEach(([_roomName, racks]) => {
              let roomHeight = 50;
              Object.entries(racks as Record<string, any>).forEach(([_rackName, devicesInRack]) => {
                const itemsPerRow = 4;
                const deviceGroupHeight = 150;
                const devices = devicesInRack as Device[];
                const numRows = Math.ceil(devices.length / itemsPerRow);
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
              label: 'Henüz cihaz atanmamış',
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
          
          Object.entries(buildingDeviceHierarchy as Record<string, any>).forEach(([floorName, rooms]) => {
            let floorHeight = 60;
            Object.entries(rooms as Record<string, any>).forEach(([_roomName, racks]) => {
              let roomHeight = 50;
              Object.entries(racks as Record<string, any>).forEach(([_rackName, devicesInRack]) => {
                const itemsPerRow = 4;
                const deviceGroupHeight = 150;
                const devices = devicesInRack as Device[];
                const numRows = Math.ceil(devices.length / itemsPerRow);
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
              
              Object.entries(rooms as Record<string, any>).forEach(([roomName, racks]) => {
              let roomHeight = 50;
              Object.entries(racks as Record<string, any>).forEach(([_rackName, devicesInRack]) => {
                const itemsPerRow = 4;
                const deviceGroupHeight = 150;
                const devices = devicesInRack as Device[];
                const numRows = Math.ceil(devices.length / itemsPerRow);
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
              
              Object.entries(racks as Record<string, any>).forEach(([rackName, devicesInRack]) => {
                const itemsPerRow = 4;
                const deviceGroupHeight = 150;
                const devices = devicesInRack as Device[];
                const numRows = Math.ceil(devices.length / itemsPerRow);
                const rackHeight = numRows > 0 ? numRows * (deviceGroupHeight + 20) : 0;
                
                // Find rack info for imageUrl
                const rackInfo = devices[0]?.rack;
                
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
                      deviceCount: devices.length,
                      imageUrl: (rackInfo as any)?.imageUrl,
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
                    devices.forEach((device, idx) => {
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
            edgeLabel = `${sourceInterface?.name || 'arayüz'} → ${targetInterface?.name || 'arayüz'}`;
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
            isExpanded: expandedBuildings.has(building.id) || semanticZoom > 0.8,
            zoom: semanticZoom,
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
            onShowDetails: () => {
              setSelectedBuildingForPopup(building);
            },
          },
        };
        
        newNodes.push(buildingNode);
        
        // If building is expanded or zoomed in enough, show devices
        if (expandedBuildings.has(building.id) || semanticZoom > 0.8) {
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
                vendor: device.vendor,
                role: role,
                status: device.status.toLowerCase() as 'active' | 'inactive' | 'maintenance' | 'error',
                ipAddress: device.networkInterfaces?.[0]?.ipv4,
                ports: device.networkInterfaces?.length,
                activeConnections: connections.filter(
                  c => c.sourceDeviceId === device.id || c.targetDeviceId === device.id
                ).length,
                buildingName: building.name,
                location: `${device.rack?.room?.name || ''} - ${device.rack?.name || ''}`.trim().replace(/^- /, ''),
                zoom: semanticZoom,
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
      
      // ADD BUILDING CONNECTION EDGES (for building view)
      if (buildingConnections.length > 0) {
        buildingConnections.forEach((buildingConn: any) => {
          const sourceBuilding = buildingConn.sourceBuilding || { name: '' };
          const destBuilding = buildingConn.destBuilding || { name: '' };
          
          const sourceBuildingNodeId = `group-building-${sourceBuilding.name}`;
          const destBuildingNodeId = `group-building-${destBuilding.name}`;
          
          // Check if both building nodes exist
          const sourceExists = filteredNodes.some(n => n.id === sourceBuildingNodeId);
          const destExists = filteredNodes.some(n => n.id === destBuildingNodeId);
          
          if (sourceExists && destExists) {
            const style = connectionStyles[buildingConn.connectionType] || connectionStyles['OTHER'];
            
            filteredEdges.push({
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

      return { topologyNodes: filteredNodes, topologyEdges: filteredEdges };
    } else if (viewMode === 'physical') {
      // ====================================================================
      // PHYSICAL VIEW: Using custom DeviceNode components
      // ====================================================================
      devicesToRender.forEach((device, index) => {
        const role = getDeviceRole(device.type, device.name);
        
        const node: Node = {
          id: device.id,
          type: 'device',
          position: { x: (index % 5) * 250, y: Math.floor(index / 5) * 200 },
          data: {
            deviceId: device.id,
            name: device.name,
            type: device.type,
            vendor: device.vendor,
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
      devicesToRender.forEach((device, index) => {
        const role = getDeviceRole(device.type, device.name);
        const deviceServices = services.filter(s => s.deviceId === device.id);
        
        const node: Node = {
          id: device.id,
          type: 'device',
          position: { x: (index % 5) * 250, y: Math.floor(index / 5) * 200 },
          data: {
            deviceId: device.id,
            name: device.name,
            type: device.type,
            vendor: device.vendor,
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

    return { topologyNodes: newNodes, topologyEdges: newEdges };
  }, [
    devices.length,
    filteredDevices,
    services,
    connections,
    viewMode,
    buildingConnections,
    organizations,
    semanticZoom,
    expandedBuildings
  ]);

  useEffect(() => {
    setNodes(topologyNodes);
    setEdges(topologyEdges);
  }, [topologyNodes, topologyEdges, setNodes, setEdges]);



  return (
    <>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Controls */}
        <div className="bg-card border-b border-border p-4 shadow-sm" style={{ position: 'relative', zIndex: 1010 }}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Ağ Topolojisi</h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-muted/50 p-1 rounded-lg border border-border">
                <Button
                  variant={viewMode === 'building' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('building')}
                  className="gap-2"
                >
                  <Box className="h-4 w-4" />
                  Bina
                </Button>
                <Button
                  variant={viewMode === 'physical' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('physical')}
                  className="gap-2"
                >
                  <Network className="h-4 w-4" />
                  Fiziksel
                </Button>
                <Button
                  variant={viewMode === 'services' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('services')}
                  className="gap-2"
                >
                  <Server className="h-4 w-4" />
                  Servisler
                </Button>
                <Button
                  variant={viewMode === 'hierarchy' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('hierarchy')}
                  className="gap-2"
                >
                  <Layers className="h-4 w-4" />
                  Hiyerarşi
                </Button>
                <Button
                  variant={viewMode === 'zoom' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => {
                    setViewMode('zoom');
                    setZoomLevel('building');
                    setBreadcrumbs([]);
                  }}
                  className="gap-2"
                >
                  <Search className="h-4 w-4" />
                  Yakınlaştır
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative group">
                  <Button variant="outline" className="gap-2 border-primary/20 bg-primary/5 hover:bg-primary/10">
                    <Zap className="h-4 w-4 text-primary" />
                    <span>Bina Bağlantıları</span>
                    <Settings2 className="h-4 w-4 opacity-50" />
                  </Button>
                  <div className="absolute right-0 top-full w-56 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[1050]">
                    <Card className="shadow-xl border-primary/20 overflow-hidden">
                      <button
                        onClick={() => setShowBuildingConnectionModal(true)}
                        className="w-full px-4 py-3 text-left hover:bg-muted flex items-center space-x-3 border-b border-border transition"
                      >
                        <Plus className="h-5 w-5 text-primary" />
                        <div>
                          <p className="font-semibold text-sm">Yeni Ekle</p>
                          <p className="text-[10px] text-muted-foreground">Binalar arası link</p>
                        </div>
                      </button>
                      <button
                        onClick={() => setShowManagementModal(true)}
                        className="w-full px-4 py-3 text-left hover:bg-muted flex items-center space-x-3 transition"
                      >
                        <Settings2 className="h-5 w-5 text-primary" />
                        <div>
                          <p className="font-semibold text-sm">Tümünü Yönet</p>
                          <p className="text-[10px] text-muted-foreground">{buildingConnections.length} bağlantı</p>
                        </div>
                      </button>
                    </Card>
                  </div>
                </div>

                <Button variant="outline" onClick={onExport} className="gap-2" title="PNG Dışa Aktar">
                  <Download className="h-4 w-4" />
                  Dışa Aktar
                </Button>
              </div>
            </div>
          </div>

          {/* Enhanced Toolbar with Filters and Search */}
          {viewMode !== 'hierarchy' && (
            <Card className="bg-card/50 backdrop-blur-sm border-border/50 mb-6">
              <CardContent className="p-4">
                <div className="flex items-center gap-4 flex-wrap">
                  {/* Search Input */}
                  <div className="flex-1 min-w-[250px] relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Cihaz ara..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 bg-background/50 border-border/50"
                    />
                    {searchQuery && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                        onClick={() => setSearchQuery('')}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {/* Device Type Filter */}
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <Select value={filterDeviceType} onValueChange={setFilterDeviceType}>
                      <SelectTrigger className="w-[160px] bg-background/50 border-border/50">
                        <SelectValue placeholder="Tüm Tipler" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tüm Tipler</SelectItem>
                        {deviceTypes.filter(t => t !== 'all').map(type => (
                          <SelectItem key={type} value={type}>{type.replace(/_/g, ' ')}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Status Filter */}
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-[160px] bg-background/50 border-border/50">
                      <SelectValue placeholder="Tüm Durumlar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tüm Durumlar</SelectItem>
                      <SelectItem value="ACTIVE">Aktif</SelectItem>
                      <SelectItem value="INACTIVE">Pasif</SelectItem>
                      <SelectItem value="MAINTENANCE">Bakımda</SelectItem>
                      <SelectItem value="DECOMMISSIONED">Devre Dışı</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Criticality Filter */}
                  <Select value={filterCriticality} onValueChange={setFilterCriticality}>
                    <SelectTrigger className="w-[160px] bg-background/50 border-border/50">
                      <SelectValue placeholder="Tüm Öncelikler" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tüm Öncelikler</SelectItem>
                      <SelectItem value="CRITICAL">Kritik</SelectItem>
                      <SelectItem value="HIGH">Yüksek</SelectItem>
                      <SelectItem value="MEDIUM">Orta</SelectItem>
                      <SelectItem value="LOW">Düşük</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Clear Filters Button */}
                  {(searchQuery || filterDeviceType !== 'all' || filterStatus !== 'all' || filterCriticality !== 'all') && (
                    <Button variant="ghost" onClick={clearFilters} className="gap-2 text-muted-foreground">
                      <X className="h-4 w-4" />
                      Filtreleri Temizle
                    </Button>
                  )}
                  
                  {/* Results Count */}
                  <div className="ml-auto">
                    <Badge variant="outline" className="px-3 py-1 bg-background/50 border-border/50">
                      <Activity className="h-3 w-3 mr-2 text-primary" />
                      {filteredDevices.length} / {devices.length} cihaz
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Loading/Error States */}
        {loading && (
          <div className="flex-1 flex items-center justify-center bg-background">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
              <p className="mt-4 text-blue-200 font-medium">Ağ topolojisi yükleniyor...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex-1 flex items-center justify-center bg-background">
            <div className="bg-red-900/50 border border-red-700 rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl">
              <p className="text-red-200 font-bold">{error}</p>
              <button
                onClick={loadData}
                className="mt-4 w-full px-4 py-2 bg-red-700 text-white rounded-lg hover:bg-red-600 font-bold transition-colors"
              >
                Tekrar Dene
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        {!loading && !error && (
          <>
            {viewMode === 'hierarchy' ? (
              // HIERARCHY VIEW
              <div className="flex-1 overflow-auto p-8 bg-background">
                <div className="max-w-5xl mx-auto">
                  <div className="mb-10">
                    <h2 className="text-3xl font-black tracking-tight text-foreground">Altyapı Hiyerarşisi</h2>
                    <p className="text-muted-foreground mt-1">Sisteminizdeki tüm konumların ve cihazların hiyerarşik listesi</p>
                  </div>
                  
                  <div className="space-y-4">
                    {organizations.length === 0 ? (
                      <Card className="p-12 text-center border-dashed">
                        <div className="bg-primary/5 p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center border border-primary/10">
                          <Building2 className="h-8 w-8 text-primary/40" />
                        </div>
                        <p className="text-muted-foreground">Organizasyon bulunamadı. Konumlar sayfasından bir tane oluşturun.</p>
                      </Card>
                    ) : (
                      organizations.map(org => (
                        <Card key={org.id} className="overflow-hidden border-border/50 shadow-sm">
                          <button
                            onClick={() => toggleExpand(org.id)}
                            className="w-full p-5 flex items-center justify-between hover:bg-muted/50 transition-colors text-left"
                          >
                            <div className="flex items-center gap-4">
                              <div className={cn(
                                "p-2 rounded-lg transition-transform",
                                expandedItems.has(org.id) ? "rotate-90 bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "bg-muted text-muted-foreground"
                              )}>
                                <ChevronRight className="h-5 w-5" />
                              </div>
                              <div>
                                <p className="font-black text-lg tracking-tight">{org.name}</p>
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary" className="h-5 text-[9px] font-black uppercase tracking-widest">{org.buildings?.length || 0} BİNA</Badge>
                                  <span className="text-[10px] text-muted-foreground font-bold uppercase">{org.code}</span>
                                </div>
                              </div>
                            </div>
                          </button>

                          {expandedItems.has(org.id) && org.buildings && (
                            <div className="border-t border-border/50 bg-muted/20 p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
                              {org.buildings.map(building => (
                                <Card key={building.id} className="bg-background border-border/50 shadow-none">
                                  <button
                                    onClick={() => toggleExpand(building.id)}
                                    className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className={cn(
                                        "p-1.5 rounded-md transition-transform",
                                        expandedItems.has(building.id) ? "rotate-90 bg-primary/20 text-primary" : "bg-muted/50 text-muted-foreground"
                                      )}>
                                        <ChevronRight className="h-4 w-4" />
                                      </div>
                                      <div className="text-left">
                                        <p className="font-bold text-sm">{building.name}</p>
                                        <p className="text-[10px] text-muted-foreground font-medium uppercase">{building.city || 'Konum ayarlanmadı'}</p>
                                      </div>
                                    </div>
                                    <Badge variant="outline" className="h-5 text-[9px] font-black">{building.floors?.length || 0} KAT</Badge>
                                  </button>

                                  {expandedItems.has(building.id) && building.floors && (
                                    <div className="px-4 pb-4 space-y-2 ml-6 border-l-2 border-primary/10 pl-4 animate-in slide-in-from-top-1 duration-200">
                                      {building.floors.map(floor => (
                                        <div key={floor.id} className="space-y-2">
                                          <button
                                            onClick={() => toggleExpand(floor.id)}
                                            className="w-full flex items-center justify-between hover:bg-muted/50 transition-colors p-2 rounded-lg"
                                          >
                                            <div className="flex items-center gap-2">
                                              <div className={cn(
                                                "p-1 rounded transition-transform",
                                                expandedItems.has(floor.id) ? "rotate-90 text-primary" : "text-muted-foreground"
                                              )}>
                                                <ChevronRight className="h-3.5 w-3.5" />
                                              </div>
                                              <span className="text-xs font-bold">{floor.name}</span>
                                            </div>
                                            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-tighter">KAT {floor.floorNumber}</span>
                                          </button>

                                          {expandedItems.has(floor.id) && floor.rooms && (
                                            <div className="ml-6 space-y-2 pl-4 border-l border-border/50 animate-in slide-in-from-top-1">
                                              {floor.rooms.map(room => (
                                                <div key={room.id} className="bg-muted/30 rounded-lg p-3 border border-border/50">
                                                  <div className="flex items-center justify-between mb-3 border-b border-border/50 pb-2">
                                                    <p className="text-xs font-black uppercase tracking-widest">{room.name}</p>
                                                    <Badge className="h-4 text-[8px] font-black">{room.racks?.length || 0} KABİNET</Badge>
                                                  </div>
                                                  
                                                  {room.racks && room.racks.length > 0 ? (
                                                    <div className="space-y-1.5">
                                                      {room.racks.map(rack => {
                                                        const rackDevices = devices.filter(d => d.rackId === rack.id);
                                                        return (
                                                          <div key={rack.id} className="flex justify-between items-center text-[10px] bg-background/50 p-1.5 rounded border border-border/30 hover:border-primary/30 transition-colors cursor-default group">
                                                            <div className="flex items-center gap-2">
                                                              <div className="w-1.5 h-1.5 rounded-full bg-primary/40 group-hover:bg-primary transition-colors"></div>
                                                              <span className="font-bold">{rack.name}</span>
                                                              <span className="text-muted-foreground font-medium opacity-60">({rack.maxUnits}U)</span>
                                                            </div>
                                                            <Badge variant="secondary" className="h-4 text-[8px] px-1.5 font-bold">
                                                              {rackDevices.length} CİHAZ
                                                            </Badge>
                                                          </div>
                                                        );
                                                      })}
                                                    </div>
                                                  ) : (
                                                    <p className="text-[9px] text-muted-foreground italic font-medium">Bu odada henüz kabinet tanımlanmamış</p>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </Card>
                              ))}
                            </div>
                          )}
                        </Card>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : viewMode === 'zoom' ? (
              // ZOOM VIEW - Modern Hierarchical Zoom Interface
              <div className="flex-1 overflow-auto bg-background">
                {/* Breadcrumb Navigation */}
                {breadcrumbs.length > 0 && (
                  <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border px-6 py-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <Button
                        onClick={() => {
                          setZoomLevel('building');
                          setSelectedBuilding(null);
                          setSelectedFloor(null);
                          setSelectedRoom(null);
                          setSelectedRack(null);
                          setBreadcrumbs([]);
                        }}
                        className="h-9 px-4 font-bold gap-2 shadow-lg shadow-primary/20"
                      >
                        <LayoutDashboard className="h-4 w-4" />
                        Tüm Binalar
                      </Button>
                      
                      {breadcrumbs.map((crumb, index) => (
                        <React.Fragment key={crumb.id}>
                          <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleBreadcrumbClick(index)}
                            className="h-9 px-3 bg-background border-border hover:border-primary hover:text-primary font-bold shadow-sm"
                          >
                            <span className="mr-2">
                              {crumb.level === 'building' && '🏢'}
                              {crumb.level === 'floor' && '📋'}
                              {crumb.level === 'room' && '🚪'}
                              {crumb.level === 'rack' && '📦'}
                            </span>
                            {crumb.name}
                          </Button>
                        </React.Fragment>
                      ))}
                      
                      {zoomLevel !== 'building' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleZoomOut}
                          className="ml-auto h-9 px-4 font-bold text-muted-foreground hover:bg-muted"
                        >
                          <Undo2 className="h-4 w-4 mr-2" />
                          Uzaklaştır
                        </Button>
                      )}
                    </div>
                  </div>
                )}
                
                <div className="p-8">
                  {/* Building Level */}
                  {zoomLevel === 'building' && (
                    <div className="max-w-7xl mx-auto px-4">
                      <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
                        <div className="space-y-1">
                          <h2 className="text-4xl font-black tracking-tight text-foreground">Altyapıya Genel Bakış</h2>
                          <p className="text-muted-foreground flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-primary/60" />
                            Sisteminizdeki tüm aktif lokasyonlar ve binalar
                          </p>
                        </div>
                      </div>
                      
                      {buildings.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-muted rounded-3xl bg-muted/20">
                          <div className="bg-background p-6 rounded-2xl shadow-xl border border-border mb-6">
                            <Building2 className="h-16 w-16 text-primary/20" />
                          </div>
                          <h3 className="text-2xl font-bold mb-2">Henüz Bina Tanımlanmamış</h3>
                          <p className="text-muted-foreground max-w-sm mb-8">Sistemi kullanmaya başlamak için önce bir bina ve yerleşim planı oluşturun.</p>
                          <Button size="lg" className="rounded-xl font-bold gap-2 shadow-lg shadow-primary/20" onClick={() => router.push('/locations')}>
                            <Plus className="h-5 w-5" />
                            Bina Ekle
                          </Button>
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
                                className="group relative flex flex-col h-full text-left bg-card hover:bg-muted/30 border border-border hover:border-primary transition-all duration-300 rounded-2xl shadow-sm hover:shadow-2xl hover:-translate-y-1 overflow-hidden"
                              >
                                <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-primary/10 to-transparent rounded-bl-full -mr-10 -mt-10 group-hover:from-primary/20 transition-colors" />
                                
                                <div className="p-8 flex flex-col h-full relative z-10">
                                  <div className="flex items-start justify-between mb-6">
                                    <div className="p-4 bg-primary rounded-2xl shadow-lg shadow-primary/20 group-hover:scale-110 transition-transform duration-300">
                                      <Building2 className="h-8 w-8 text-primary-foreground" />
                                    </div>
                                    <div className="bg-muted/50 p-2 rounded-lg group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                                      <ChevronRight className="h-5 w-5" />
                                    </div>
                                  </div>
                                  
                                  <div className="space-y-2 mb-8">
                                    <h3 className="text-2xl font-black tracking-tight text-foreground group-hover:text-primary transition-colors">{building.name}</h3>
                                    <div className="flex items-center gap-1.5 text-muted-foreground text-sm font-medium">
                                      <MapPin className="h-3.5 w-3.5" />
                                      {building.city || 'Konum Bilinmiyor'}
                                    </div>
                                  </div>
                                  
                                  <div className="mt-auto grid grid-cols-3 gap-3">
                                    <div className="bg-muted/40 p-3 rounded-xl border border-border/50 group-hover:bg-background group-hover:border-primary/20 transition-all shadow-none">
                                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Katlar</p>
                                      <p className="text-xl font-black">{floorCount}</p>
                                    </div>
                                    <div className="bg-muted/40 p-3 rounded-xl border border-border/50 group-hover:bg-background group-hover:border-primary/20 transition-all shadow-none">
                                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Cihazlar</p>
                                      <p className="text-xl font-black">{buildingDevices.length}</p>
                                    </div>
                                    <div className="bg-emerald-500/5 p-3 rounded-xl border border-emerald-500/20 group-hover:bg-emerald-500/10 transition-all shadow-none">
                                      <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1">Aktif</p>
                                      <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">{activeDevices}</p>
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
                    <div className="max-w-7xl mx-auto px-4">
                      <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
                        <div className="space-y-1">
                          <h2 className="text-4xl font-black tracking-tight text-foreground">{selectedBuilding.name}</h2>
                          <p className="text-muted-foreground flex items-center gap-2">
                            <Layers className="h-4 w-4 text-primary/60" />
                            Odaları ve kabinetleri keşfetmek için bir kat seçin
                          </p>
                        </div>
                      </div>
                      
                      {(!selectedBuilding.floors || selectedBuilding.floors.length === 0) ? (
                        <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-muted rounded-3xl bg-muted/20">
                          <div className="bg-background p-6 rounded-2xl shadow-xl border border-border mb-6">
                            <Layers className="h-16 w-16 text-primary/20" />
                          </div>
                          <p className="text-xl font-bold text-foreground">Bu binada henüz kat bulunamadı</p>
                          <p className="text-muted-foreground mt-2 mb-8">Konumlar sayfasından kat ekleyerek başlayın.</p>
                          <Button size="lg" className="rounded-xl font-bold gap-2 shadow-lg shadow-primary/20" onClick={() => router.push('/locations')}>
                            <Plus className="h-5 w-5" />
                            Kat Ekle
                          </Button>
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
                                className="group relative flex flex-col text-left bg-card hover:bg-muted/30 border border-border hover:border-primary transition-all duration-300 rounded-2xl shadow-sm hover:shadow-xl hover:-translate-y-1 overflow-hidden"
                              >
                                <div className="p-6 flex flex-col h-full relative z-10">
                                  <div className="flex items-center justify-between mb-6">
                                    <div className="p-3 bg-orange-500 rounded-xl shadow-lg shadow-orange-500/20 group-hover:scale-110 transition-transform duration-300">
                                      <Layers className="h-6 w-6 text-white" />
                                    </div>
                                    <Badge variant="outline" className="h-6 font-black border-orange-500/20 text-orange-600 dark:text-orange-400">
                                      KAT {floor.floorNumber}
                                    </Badge>
                                  </div>
                                  
                                  <h3 className="text-xl font-black tracking-tight mb-4 group-hover:text-primary transition-colors">{floor.name}</h3>
                                  
                                  <div className="space-y-3 mt-auto">
                                    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/40 border border-border/50 group-hover:bg-background transition-colors">
                                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Odalar</span>
                                      <span className="text-sm font-black text-orange-600 dark:text-orange-400">{roomCount}</span>
                                    </div>
                                    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/40 border border-border/50 group-hover:bg-background transition-colors">
                                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Cihazlar</span>
                                      <span className="text-sm font-black text-orange-600 dark:text-orange-400">{floorDevices.length}</span>
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
                  
                  {/* Room Level */}
                  {zoomLevel === 'room' && selectedFloor && (
                    <div className="max-w-7xl mx-auto px-4">
                      <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
                        <div className="space-y-1">
                          <h2 className="text-4xl font-black tracking-tight text-foreground">{selectedFloor.name}</h2>
                          <p className="text-muted-foreground flex items-center gap-2">
                            <DoorOpen className="h-4 w-4 text-primary/60" />
                            Kabinetleri görüntülemek için bir oda seçin
                          </p>
                        </div>
                      </div>
                      
                      {(!selectedFloor.rooms || selectedFloor.rooms.length === 0) ? (
                        <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-muted rounded-3xl bg-muted/20">
                          <div className="bg-background p-6 rounded-2xl shadow-xl border border-border mb-6">
                            <DoorOpen className="h-16 w-16 text-primary/20" />
                          </div>
                          <p className="text-xl font-bold text-foreground">Bu katta henüz oda bulunamadı</p>
                          <p className="text-muted-foreground mt-2 mb-8">Konumlar sayfasından bu kata oda ekleyin.</p>
                          <Button size="lg" className="rounded-xl font-bold gap-2 shadow-lg shadow-primary/20" onClick={() => router.push('/locations')}>
                            <Plus className="h-5 w-5" />
                            Oda Ekle
                          </Button>
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
                                className="group relative flex flex-col text-left bg-card hover:bg-muted/30 border border-border hover:border-primary transition-all duration-300 rounded-2xl shadow-sm hover:shadow-xl hover:-translate-y-1 overflow-hidden"
                                aria-label={`${room.name} odasına git. ${rackCount} kabinet, ${roomDevices.length} cihaz içeriyor.`}
                              >
                                <div className="p-6 flex flex-col h-full relative z-10">
                                  <div className="flex items-center justify-between mb-6">
                                    <div className="p-3 bg-purple-500 rounded-xl shadow-lg shadow-purple-500/20 group-hover:scale-110 transition-transform duration-300">
                                      <DoorOpen className="h-6 w-6 text-white" />
                                    </div>
                                  </div>
                                  
                                  <h3 className="text-xl font-black tracking-tight mb-4 group-hover:text-primary transition-colors">{room.name}</h3>
                                  
                                  <div className="space-y-3 mt-auto">
                                    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/40 border border-border/50 group-hover:bg-background transition-colors">
                                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Kabinetler</span>
                                      <span className="text-sm font-black text-purple-600 dark:text-purple-400">{rackCount}</span>
                                    </div>
                                    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/40 border border-border/50 group-hover:bg-background transition-colors">
                                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Cihazlar</span>
                                      <span className="text-sm font-black text-purple-600 dark:text-purple-400">{roomDevices.length}</span>
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
                  
                  {/* Rack Level */}
                  {zoomLevel === 'rack' && selectedRoom && (
                    <div className="max-w-7xl mx-auto px-4">
                      <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
                        <div className="space-y-1">
                          <h2 className="text-4xl font-black tracking-tight text-foreground">{selectedRoom.name}</h2>
                          <p className="text-muted-foreground flex items-center gap-2">
                            <BoxSelect className="h-4 w-4 text-primary/60" />
                            Cihazları görüntülemek için bir kabinet seçin
                          </p>
                        </div>
                      </div>
                      
                      {(!selectedRoom.racks || selectedRoom.racks.length === 0) ? (
                        <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-muted rounded-3xl bg-muted/20">
                          <div className="bg-background p-6 rounded-2xl shadow-xl border border-border mb-6">
                            <BoxSelect className="h-16 w-16 text-primary/20" />
                          </div>
                          <p className="text-xl font-bold text-foreground">Bu odada henüz kabinet bulunamadı</p>
                          <p className="text-muted-foreground mt-2 mb-8">Konumlar sayfasından bu odaya kabinet ekleyin.</p>
                          <Button size="lg" className="rounded-xl font-bold gap-2 shadow-lg shadow-primary/20" onClick={() => router.push('/locations')}>
                            <Plus className="h-5 w-5" />
                            Kabinet Ekle
                          </Button>
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
                                className="group relative flex flex-col text-left bg-card hover:bg-muted/30 border border-border hover:border-primary transition-all duration-300 rounded-2xl shadow-sm hover:shadow-xl hover:-translate-y-1 overflow-hidden"
                                aria-label={`${rack.name} kabinetine git. ${rack.maxUnits}U kapasite, ${rackDevices.length} cihaz içeriyor.`}
                              >
                                {rack.imageUrl ? (
                                  <div className="h-32 w-full relative overflow-hidden">
                                    <img 
                                      src={rack.imageUrl} 
                                      alt={`${rack.name} fotoğrafı`}
                                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                                  </div>
                                ) : (
                                  <div className="h-32 w-full bg-gradient-to-br from-slate-800 to-slate-900 relative flex items-center justify-center overflow-hidden">
                                    <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-500 via-transparent to-transparent" />
                                    <div className="grid grid-cols-1 gap-1 w-1/3 opacity-30">
                                      {[...Array(8)].map((_, i) => (
                                        <div key={i} className="h-1 bg-blue-400 rounded-full" />
                                      ))}
                                    </div>
                                    <BoxSelect className="absolute h-8 w-8 text-blue-500/50" />
                                  </div>
                                )}
                                <div className="p-6 flex flex-col h-full relative z-10">
                                  <div className="flex items-center justify-between mb-6">
                                    <div className="p-3 bg-emerald-500 rounded-xl shadow-lg shadow-emerald-500/20 group-hover:scale-110 transition-transform duration-300">
                                      <BoxSelect className="h-6 w-6 text-white" />
                                    </div>
                                    <Badge variant="secondary" className="h-6 font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-none">
                                      {rack.maxUnits}U
                                    </Badge>
                                  </div>
                                  
                                  <div className="mb-6">
                                    <h3 className="text-xl font-black tracking-tight group-hover:text-primary transition-colors">{rack.name}</h3>
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{rack.type.replace(/_/g, ' ')}</p>
                                  </div>
                                  
                                  <div className="space-y-3 mt-auto">
                                    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/40 border border-border/50 group-hover:bg-background transition-colors">
                                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Cihazlar</span>
                                      <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{rackDevices.length}</span>
                                    </div>
                                    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/40 border border-border/50 group-hover:bg-background transition-colors">
                                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Aktif</span>
                                      <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{activeDevices}</span>
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
                  
                  {/* Device Level */}
                  {zoomLevel === 'device' && selectedRack && (
                    <div className="max-w-7xl mx-auto px-4">
                      <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
                        <div className="space-y-1">
                          <h2 className="text-4xl font-black tracking-tight text-foreground">{selectedRack.name}</h2>
                          <p className="text-muted-foreground flex items-center gap-2">
                            <Server className="h-4 w-4 text-primary/60" />
                            Kabinet içindeki aktif cihazlar ve servisleri
                          </p>
                        </div>
                      </div>
                      
                      {(() => {
                        const rackDevices = devices.filter(d => d.rackId === selectedRack.id);
                        
                        if (rackDevices.length === 0) {
                          return (
                            <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-muted rounded-3xl bg-muted/20">
                              <div className="bg-background p-6 rounded-2xl shadow-xl border border-border mb-6">
                                <Server className="h-16 w-16 text-primary/20" />
                              </div>
                              <p className="text-xl font-bold text-foreground">Bu kabinette henüz cihaz bulunamadı</p>
                              <p className="text-muted-foreground mt-2 mb-8">Konumlar sayfasından bu kabinete cihaz ekleyin.</p>
                              <Button size="lg" className="rounded-xl font-bold gap-2 shadow-lg shadow-primary/20" onClick={() => router.push('/locations')}>
                                <Plus className="h-5 w-5" />
                                Cihaz Ekle
                              </Button>
                            </div>
                          );
                        }
                        
                        return (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {rackDevices.map(device => {
                              const deviceServices = services.filter(s => s.deviceId === device.id);
                              
                              const statusConfig = {
                                'ACTIVE': { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', variant: 'default' as const },
                                'MAINTENANCE': { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', variant: 'secondary' as const },
                                'INACTIVE': { bg: 'bg-muted', text: 'text-muted-foreground', variant: 'outline' as const },
                                'ERROR': { bg: 'bg-destructive/10', text: 'text-destructive', variant: 'destructive' as const }
                              };
                              
                              const config = statusConfig[device.status as keyof typeof statusConfig] || statusConfig['ERROR'];

                              return (
                                <Card key={device.id} className="group overflow-hidden border-border hover:border-primary transition-all duration-300 shadow-sm hover:shadow-xl">
                                  <CardContent className="p-0">
                                    <div className="p-6 border-b border-border/50">
                                      <div className="flex items-center justify-between mb-4">
                                        <div className="p-2.5 bg-primary/10 rounded-xl group-hover:scale-110 transition-transform shadow-none">
                                          <Server className="h-5 w-5 text-primary" />
                                        </div>
                                        <Badge variant={config.variant} className="h-5 text-[9px] font-black uppercase tracking-widest px-2">
                                          {device.status}
                                        </Badge>
                                      </div>
                                      
                                      <h3 className="text-lg font-black tracking-tight mb-1 truncate">{device.name}</h3>
                                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{device.type.replace(/_/g, ' ')}</p>
                                    </div>
                                    
                                    <div className="p-6 space-y-4">
                                      <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">Kritiklik</p>
                                          <Badge 
                                            variant="outline" 
                                            className={cn(
                                              "h-5 text-[9px] font-black uppercase border-none px-2 shadow-none",
                                              device.criticality === 'CRITICAL' ? "bg-destructive/10 text-destructive" :
                                              device.criticality === 'HIGH' ? "bg-orange-500/10 text-orange-600" :
                                              "bg-primary/5 text-primary"
                                            )}
                                          >
                                            {device.criticality}
                                          </Badge>
                                        </div>
                                        <div className="space-y-1 text-right">
                                          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">Servisler</p>
                                          <p className="text-sm font-black">{deviceServices.length}</p>
                                        </div>
                                      </div>

                                      {device.networkInterfaces && device.networkInterfaces.length > 0 && (
                                        <div className="space-y-2 pt-2 border-t border-border/50">
                                          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                                            <Network className="h-3 w-3" />
                                            Ağ Arayüzleri
                                          </p>
                                          <div className="space-y-1.5">
                                            {device.networkInterfaces.slice(0, 3).map(iface => (
                                              <div key={iface.id} className="flex items-center justify-between text-[10px] p-1.5 rounded bg-muted/30 border border-border/50">
                                                <span className="font-bold truncate max-w-[80px]">{iface.name}</span>
                                                <span className="font-mono text-muted-foreground">{iface.ipv4 || 'No IP'}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </CardContent>
                                </Card>
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
              <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 relative min-w-0">
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
                      if (viewMode === 'building') {
                        setSemanticZoom(viewport.zoom);
                      }
                    }}
                    fitView
                    attributionPosition="bottom-left"
                  >
                    <Background color="#3b82f6" gap={20} />
                    <Controls className="bg-card border-border fill-foreground shadow-xl" />
                    <MiniMap className="bg-background border-border shadow-2xl rounded-xl" maskColor="rgba(0, 0, 0, 0.1)" nodeColor="#3b82f6" />
                    
                    {/* Semantic Zoom Controller for Building View */}
                    {viewMode === 'building' && (
                      <Panel position="top-left">
                        <SemanticZoomController
                          currentZoom={semanticZoom}
                          onZoomChange={setSemanticZoom}
                        />
                      </Panel>
                    )}
                    
                    <Panel position="top-right" className="bg-card/90 backdrop-blur-md text-foreground rounded-xl shadow-2xl p-5 border border-border max-h-80 overflow-y-auto custom-scrollbar">
                      <div className="space-y-4" role="region" aria-label="Harita Göstergesi">
                        <h3 className="font-black text-xs uppercase tracking-widest border-b border-border pb-3">Gösterge</h3>
                        <div className="grid grid-cols-1 gap-2.5">
                          {[
                            { label: 'Fiziksel Sunucu', color: 'bg-blue-500' },
                            { label: 'Sanal Host', color: 'bg-green-500' },
                            { label: 'VM / Router', color: 'bg-purple-500' },
                            { label: 'Güvenlik Duvarı', color: 'bg-red-500' },
                            { label: 'Switch', color: 'bg-amber-500' },
                            { label: 'Depolama', color: 'bg-slate-500' },
                            { label: 'Yazıcı / Kamera', color: 'bg-cyan-500' },
                          ].map(item => (
                            <div key={item.label} className="flex items-center gap-3">
                              <div className={cn("w-3.5 h-3.5 rounded-sm shadow-sm", item.color)}></div>
                              <span className="text-[11px] font-bold text-muted-foreground">{item.label}</span>
                            </div>
                          ))}
                          <div className="my-2 border-t border-border pt-2 space-y-2">
                            <div className="flex items-center gap-3">
                              <div className="w-6 h-0.5 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                              <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400">AKTİF</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="w-6 h-0.5 bg-destructive rounded-full"></div>
                              <span className="text-[11px] font-black text-destructive">PASİF / HATA</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Panel>
                  </ReactFlow>
                </div>

                {/* Sidebar Container */}
                <div className="relative flex shrink-0">
                  {selectedNode && (
                    <Button
                      variant="secondary"
                      size="icon"
                      className={cn(
                        "absolute top-1/2 -translate-y-1/2 rounded-full h-10 w-10 shadow-xl z-[1060] border-2 border-primary/20 bg-card hover:bg-accent transition-all duration-300 flex items-center justify-center",
                        isSidebarOpen ? "left-[-20px]" : "left-[-20px]"
                      )}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('Sidebar toggle clicked, current state:', isSidebarOpen);
                        setIsSidebarOpen(!isSidebarOpen);
                      }}
                    >
                      {isSidebarOpen ? <ChevronRight className="h-6 w-6 text-primary" /> : <ChevronLeft className="h-6 w-6 text-primary" />}
                    </Button>
                  )}
                  
                  <aside 
                    className={cn(
                      "bg-card/80 backdrop-blur-md border-l border-border flex flex-col shadow-2xl transition-all duration-300 overflow-hidden",
                      isSidebarOpen && selectedNode ? "w-96" : "w-0"
                    )}
                    style={{ display: selectedNode ? 'flex' : 'none' }}
                  >
                    {selectedNode ? (
                    <div className="flex-1 overflow-y-auto">
                      {selectedNode.data.isBuildingConnection ? (
                        <div className="animate-in slide-in-from-right duration-300">
                          <div className="bg-primary/10 p-6 border-b border-primary/20">
                            <div className="flex items-center gap-3">
                              <div className="bg-primary rounded-xl p-2.5 shadow-lg shadow-primary/20">
                                <Zap className="h-6 w-6 text-primary-foreground" />
                              </div>
                              <div>
                                <h2 className="text-xl font-bold tracking-tight">Bina Bağlantısı</h2>
                                <Badge variant="secondary" className="mt-1">Link Detayları</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-6 space-y-6">
                            {/* Connection Path */}
                            <Card className="bg-muted/30 border-primary/10">
                              <CardContent className="p-4">
                                <div className="flex items-center justify-between gap-4">
                                  <div className="flex-1">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Kaynak</p>
                                    <p className="font-bold text-sm truncate">{selectedNode.data.buildingConnection?.sourceBuilding?.name || 'Bilinmiyor'}</p>
                                    <p className="text-[10px] text-muted-foreground truncate">{selectedNode.data.buildingConnection?.sourceBuilding?.city || ''}</p>
                                  </div>
                                  <div className="flex flex-col items-center gap-1">
                                    <div className="bg-primary/10 rounded-full p-2">
                                      <ArrowLeft className="h-4 w-4 text-primary rotate-180" />
                                    </div>
                                  </div>
                                  <div className="flex-1 text-right">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Hedef</p>
                                    <p className="font-bold text-sm truncate">{selectedNode.data.buildingConnection?.destBuilding?.name || 'Bilinmiyor'}</p>
                                    <p className="text-[10px] text-muted-foreground truncate">{selectedNode.data.buildingConnection?.destBuilding?.city || ''}</p>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>

                            {/* Status & Type */}
                            <div className="grid grid-cols-2 gap-3">
                              <Card className="p-3 bg-muted/30 border-primary/10">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Tip</p>
                                <div className="flex items-center gap-2">
                                  <span className="text-lg">
                                    {selectedNode.data.buildingConnection?.connectionType?.includes('FIBER') ? '🔴' : '📡'}
                                  </span>
                                  <span className="text-xs font-bold truncate">
                                    {selectedNode.data.buildingConnection?.connectionType?.replace(/_/g, ' ') || 'DİĞER'}
                                  </span>
                                </div>
                              </Card>
                              <Card className="p-3 bg-muted/30 border-primary/10">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Durum</p>
                                <Badge variant={selectedNode.data.buildingConnection?.status === 'ACTIVE' ? 'default' : 'destructive'} className="w-full justify-center">
                                  {selectedNode.data.buildingConnection?.status === 'ACTIVE' ? 'AKTİF' : 'PASİF'}
                                </Badge>
                              </Card>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-2 gap-3">
                              <Card className="p-3 bg-muted/30">
                                <div className="flex items-center gap-2 mb-1">
                                  <Zap className="h-3.5 w-3.5 text-primary" />
                                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Hız</p>
                                </div>
                                <p className="text-lg font-bold">{selectedNode.data.buildingConnection?.bandwidth || '-'}</p>
                              </Card>
                              <Card className="p-3 bg-muted/30">
                                <div className="flex items-center gap-2 mb-1">
                                  <Maximize2 className="h-3.5 w-3.5 text-primary" />
                                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Mesafe</p>
                                </div>
                                <p className="text-lg font-bold">{selectedNode.data.buildingConnection?.distance ? `${selectedNode.data.buildingConnection.distance} km` : '-'}</p>
                              </Card>
                            </div>

                            {/* Actions */}
                            <div className="pt-4 border-t border-border flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full gap-2"
                                onClick={() => {
                                  setBuildingConnectionToEdit(selectedNode.data.buildingConnection);
                                  setShowBuildingConnectionModal(true);
                                }}
                              >
                                <Settings2 className="h-4 w-4" />
                                Düzenle
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : selectedNode.data.isGroup ? (
                        <div className="animate-in slide-in-from-right duration-300">
                          <div className="bg-muted/50 p-6 border-b border-border">
                            <h2 className="text-xl font-bold tracking-tight mb-1">
                              {selectedNode.data.hierarchyLevel === 'building' ? 'Bina Detayı' :
                               selectedNode.data.hierarchyLevel === 'floor' ? 'Kat Detayı' :
                               selectedNode.data.hierarchyLevel === 'room' ? 'Oda Detayı' :
                               selectedNode.data.hierarchyLevel === 'rack' ? 'Kabinet Detayı' : 'Detaylar'}
                            </h2>
                            <Badge variant="outline">{selectedNode.data.label}</Badge>
                          </div>

                          {selectedNode.data.hierarchyLevel === 'rack' && selectedNode.data.imageUrl && (
                            <div className="px-6 pt-6">
                              <Card className="overflow-hidden border-border/50 shadow-lg">
                                <img 
                                  src={selectedNode.data.imageUrl} 
                                  alt="Kabinet Fotoğrafı" 
                                  className="w-full aspect-video object-cover"
                                />
                              </Card>
                            </div>
                          )}

                          <div className="p-6 space-y-4">
                            <Card className="p-4">
                              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">İstatistikler</p>
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">Cihaz Sayısı</span>
                                <Badge>{selectedNode.data.deviceCount || 0}</Badge>
                              </div>
                            </Card>
                            {selectedNode.data.isEmpty && (
                              <Card className="p-4 border-dashed border-primary/20 bg-primary/5">
                                <p className="text-sm text-center text-muted-foreground italic">Bu konuma henüz cihaz atanmamış.</p>
                              </Card>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="animate-in slide-in-from-right duration-300">
                          <div className="bg-primary/10 p-6 border-b border-primary/20">
                            <div className="flex items-center gap-3">
                              <div className="bg-primary rounded-xl p-2.5 shadow-lg shadow-primary/20">
                                <Box className="h-6 w-6 text-primary-foreground" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  {getVendorLogo(selectedNode.data.vendor) && (
                                    <img 
                                      src={getVendorLogo(selectedNode.data.vendor)!} 
                                      alt={selectedNode.data.vendor} 
                                      className="h-7 w-7 object-contain"
                                    />
                                  )}
                                  <h2 className="text-xl font-bold tracking-tight truncate max-w-[200px]">{selectedNode.data.label}</h2>
                                </div>
                                <Badge variant="secondary" className="mt-1">{selectedNode.data.type?.replace(/_/g, ' ')}</Badge>
                              </div>
                            </div>
                          </div>

                          <div className="p-6 space-y-6">
                            <div className="grid grid-cols-2 gap-3">
                              <Card className="p-3 bg-muted/30">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Durum</p>
                                <div className="flex items-center gap-2">
                                  <div className={cn("h-2 w-2 rounded-full animate-pulse", 
                                    selectedNode.data.status === 'ACTIVE' ? "bg-emerald-500" : "bg-red-500"
                                  )} />
                                  <span className="text-xs font-bold">{selectedNode.data.status === 'ACTIVE' ? 'AKTİF' : 'PASİF'}</span>
                                </div>
                              </Card>
                              <Card className="p-3 bg-muted/30">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Kritiklik</p>
                                <Badge variant={selectedNode.data.criticality === 'CRITICAL' ? 'destructive' : 'secondary'} className="w-full justify-center">
                                  {selectedNode.data.criticality}
                                </Badge>
                              </Card>
                            </div>

                            {/* Interfaces & Services */}
                            <div className="grid grid-cols-2 gap-3">
                              <Card className="p-3 bg-muted/30">
                                <div className="flex items-center gap-2 mb-1">
                                  <Zap className="h-3.5 w-3.5 text-primary" />
                                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Servisler</p>
                                </div>
                                <p className="text-lg font-bold">{selectedNode.data.serviceCount || 0}</p>
                              </Card>
                              <Card className="p-3 bg-muted/30">
                                <div className="flex items-center gap-2 mb-1">
                                  <Settings2 className="h-3.5 w-3.5 text-primary" />
                                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Portlar</p>
                                </div>
                                <p className="text-lg font-bold">{selectedNode.data.interfaceCount || 0}</p>
                              </Card>
                            </div>

                            {/* Location Details */}
                            <Card className="p-4 bg-muted/30 border-border/50">
                              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Fiziksel Konum</p>
                              <div className="space-y-2">
                                {[
                                  { label: 'Bina', value: selectedNode.data.building },
                                  { label: 'Kat', value: selectedNode.data.floor },
                                  { label: 'Oda', value: selectedNode.data.room },
                                  { label: 'Kabinet', value: selectedNode.data.rack },
                                ].map((item) => (
                                  <div key={item.label} className="flex justify-between items-center text-xs">
                                    <span className="text-muted-foreground">{item.label}:</span>
                                    <span className="font-semibold">{item.value || '-'}</span>
                                  </div>
                                ))}
                              </div>
                            </Card>

                            {/* Interfaces List */}
                            {selectedNode.data.interfaces && selectedNode.data.interfaces.length > 0 && (
                              <div className="space-y-3">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Ağ Arayüzleri</p>
                                <div className="space-y-2">
                                  {selectedNode.data.interfaces.map((iface: any) => (
                                    <Card key={iface.id} className="p-3 bg-background border-border/50 hover:border-primary/50 transition-colors cursor-default">
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold">{iface.name}</span>
                                        <Badge variant={iface.status === 'UP' ? 'default' : 'destructive'} className="h-4 text-[8px] px-1.5">
                                          {iface.status}
                                        </Badge>
                                      </div>
                                      {iface.ipv4 && (
                                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                          <div className="h-1 w-1 rounded-full bg-primary" />
                                          <span className="font-mono">{iface.ipv4}</span>
                                        </div>
                                      )}
                                    </Card>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
                      <div className="bg-muted rounded-full p-8 mb-4 border border-border shadow-inner">
                        <Activity className="h-12 w-12 text-muted-foreground/30" />
                      </div>
                      <h3 className="text-lg font-bold tracking-tight">Seçim Yapılmadı</h3>
                      <p className="text-sm text-muted-foreground mt-2 max-w-[200px]">
                        Detaylı bilgileri görmek için topolojideki bir cihaza veya konuma tıklayın.
                      </p>
                    </div>
                  )}
                </aside>
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

        {/* Building Detail Popup */}
        {selectedBuildingForPopup && (
          <BuildingDetailPopup
            building={selectedBuildingForPopup}
            devices={devices.filter(d => d.rack?.room?.floor?.building?.id === selectedBuildingForPopup.id)}
            onClose={() => setSelectedBuildingForPopup(null)}
          />
        )}
      </div>
    </>
  );
}

// Building Detail Popup Component
interface BuildingDetailPopupProps {
  building: Building;
  devices: Device[];
  onClose: () => void;
}

const BuildingDetailPopup: React.FC<BuildingDetailPopupProps> = ({ building, devices, onClose }) => {
  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-card border-border shadow-2xl z-[1011] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2.5 rounded-xl">
              <Box className="h-6 w-6 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-bold tracking-tight">{building.name}</DialogTitle>
              <DialogDescription className="flex items-center gap-1.5 text-muted-foreground">
                <Filter className="h-3.5 w-3.5" />
                {building.city || 'Konum Bilinmiyor'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        
        <div className="grid grid-cols-3 gap-4 my-6">
          <Card className="bg-muted/30 border-border/50 shadow-none">
            <CardContent className="p-4">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Cihazlar</p>
              <p className="text-3xl font-black">{devices.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-emerald-500/5 border-emerald-500/20 shadow-none">
            <CardContent className="p-4">
              <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1">Aktif</p>
              <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                {devices.filter(d => d.status === 'ACTIVE').length}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-destructive/5 border-destructive/20 shadow-none">
            <CardContent className="p-4">
              <p className="text-[10px] font-bold text-destructive uppercase tracking-widest mb-1">Sorunlu</p>
              <p className="text-3xl font-black text-destructive">
                {devices.filter(d => d.status !== 'ACTIVE').length}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-bold tracking-tight text-muted-foreground uppercase tracking-widest">Cihaz Envanteri</h3>
          <div className="max-h-[40vh] overflow-y-auto pr-2 space-y-2 custom-scrollbar">
            {devices.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-muted rounded-xl">
                <p className="text-sm text-muted-foreground">Bu binada henüz cihaz bulunamadı</p>
              </div>
            ) : (
              devices.map(device => (
                <Card key={device.id} className="bg-background border-border/50 hover:border-primary/50 transition-colors shadow-none">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center",
                        device.status === 'ACTIVE' ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive"
                      )}>
                        <Box className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-bold">{device.name}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-tighter">
                          {device.type} • {device.rack?.room?.name || 'Oda Yok'}
                        </div>
                      </div>
                    </div>
                    <Badge variant={device.status === 'ACTIVE' ? 'default' : 'destructive'} className="h-5 text-[9px] uppercase font-black">
                      {device.status}
                    </Badge>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
    { value: 'FIBER_SINGLE_MODE', label: 'Tek Modlu Fiber', icon: '🔴' },
    { value: 'FIBER_MULTI_MODE', label: 'Çok Modlu Fiber', icon: '🟠' },
    { value: 'CAT5E', label: 'Cat 5e Kablo', icon: '📡' },
    { value: 'CAT6', label: 'Cat 6 Kablo', icon: '📡' },
    { value: 'CAT6A', label: 'Cat 6a Kablo', icon: '📡' },
    { value: 'CAT7', label: 'Cat 7 Kablo', icon: '📡' },
    { value: 'CAT8', label: 'Cat 8 Kablo', icon: '📡' },
    { value: 'WIRELESS', label: 'Kablosuz', icon: '📶' },
    { value: 'MICROWAVE', label: 'Radyolink', icon: '📡' },
    { value: 'LEASED_LINE', label: 'Kiralık Hat', icon: '🔗' },
    { value: 'MPLS', label: 'MPLS Ağı', icon: '🌐' },
    { value: 'VPN', label: 'VPN Tüneli', icon: '🔒' },
    { value: 'OTHER', label: 'Diğer', icon: '❓' },
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
        setError(response.error || `Bağlantı ${connection?.id ? 'güncellenemedi' : 'oluşturulamadı'}`);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || `Bağlantı ${connection?.id ? 'güncellenemedi' : 'oluşturulamadı'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl bg-card border-border shadow-2xl overflow-hidden flex flex-col p-0 z-[1011] max-h-[90vh]">
        <DialogHeader className="p-6 bg-primary/10 border-b border-primary/20">
          <div className="flex items-center gap-3">
            <div className="bg-primary rounded-xl p-2.5 shadow-lg shadow-primary/20">
              <Zap className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight">
                Bina Bağlantısı {connection?.id ? 'Düzenle' : 'Ekle'}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Binalar arası fiziksel veya mantıksal bağlantı oluşturun.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {error && (
            <Card className="mb-6 bg-destructive/10 border-destructive/20 text-destructive p-4">
              <p className="text-sm font-medium">{error}</p>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Source Building */}
            <div className="space-y-2">
              <Label htmlFor="sourceBuilding" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Kaynak Bina *
              </Label>
              <Select 
                value={formData.sourceBuildingId} 
                onValueChange={(val) => setFormData({ ...formData, sourceBuildingId: val })}
              >
                <SelectTrigger id="sourceBuilding" className="bg-background">
                  <SelectValue placeholder="Kaynak bina seçin" />
                </SelectTrigger>
                <SelectContent>
                  {buildings.map((building) => (
                    <SelectItem key={building.id} value={building.id}>
                      {building.name} {building.city ? `(${building.city})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Destination Building */}
            <div className="space-y-2">
              <Label htmlFor="destBuilding" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Hedef Bina *
              </Label>
              <Select 
                value={formData.destBuildingId} 
                onValueChange={(val) => setFormData({ ...formData, destBuildingId: val })}
              >
                <SelectTrigger id="destBuilding" className="bg-background">
                  <SelectValue placeholder="Hedef bina seçin" />
                </SelectTrigger>
                <SelectContent>
                  {buildings
                    .filter((b) => b.id !== formData.sourceBuildingId)
                    .map((building) => (
                      <SelectItem key={building.id} value={building.id}>
                        {building.name} {building.city ? `(${building.city})` : ''}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Connection Type */}
            <div className="md:col-span-2 space-y-3">
              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Bağlantı Tipi *
              </Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {connectionTypes.map((type) => (
                  <Button
                    key={type.value}
                    type="button"
                    variant={formData.connectionType === type.value ? 'default' : 'outline'}
                    className={cn(
                      "h-auto py-3 justify-start gap-3",
                      formData.connectionType === type.value ? "ring-2 ring-primary/20" : "hover:bg-muted"
                    )}
                    onClick={() => setFormData({ ...formData, connectionType: type.value })}
                  >
                    <span className="text-xl">{type.icon}</span>
                    <div className="text-left">
                      <p className="text-[10px] font-bold leading-tight uppercase truncate">{type.label}</p>
                    </div>
                  </Button>
                ))}
              </div>
            </div>

            {/* Bandwidth & Distance */}
            <div className="space-y-2">
              <Label htmlFor="bandwidth" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Bant Genişliği
              </Label>
              <Input
                id="bandwidth"
                placeholder="Örn: 10Gbps, 1Gbps"
                value={formData.bandwidth}
                onChange={(e) => setFormData({ ...formData, bandwidth: e.target.value })}
                className="bg-background"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="distance" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Mesafe (km)
              </Label>
              <Input
                id="distance"
                type="number"
                step="0.01"
                placeholder="Kilometre cinsinden"
                value={formData.distance}
                onChange={(e) => setFormData({ ...formData, distance: e.target.value })}
                className="bg-background"
              />
            </div>

            {/* Fiber Type (Conditional) */}
            {(formData.connectionType === 'FIBER_SINGLE_MODE' || formData.connectionType === 'FIBER_MULTI_MODE') && (
              <div className="space-y-2">
                <Label htmlFor="fiberType" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Fiber Tipi
                </Label>
                <Input
                  id="fiberType"
                  placeholder="Örn: OS2, OM3, OM4"
                  value={formData.fiberType}
                  onChange={(e) => setFormData({ ...formData, fiberType: e.target.value })}
                  className="bg-background"
                />
              </div>
            )}

            {/* Cable Specs */}
            <div className="space-y-2">
              <Label htmlFor="cableSpecs" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Kablo Özellikleri
              </Label>
              <Input
                id="cableSpecs"
                placeholder="Ek kablo detayları"
                value={formData.cableSpecs}
                onChange={(e) => setFormData({ ...formData, cableSpecs: e.target.value })}
                className="bg-background"
              />
            </div>

            {/* Provider & Circuit ID */}
            <div className="space-y-2">
              <Label htmlFor="provider" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Sağlayıcı
              </Label>
              <Input
                id="provider"
                placeholder="ISS veya sağlayıcı adı"
                value={formData.provider}
                onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                className="bg-background"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="circuitId" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Devre ID
              </Label>
              <Input
                id="circuitId"
                placeholder="Devre / Servis ID"
                value={formData.circuitId}
                onChange={(e) => setFormData({ ...formData, circuitId: e.target.value })}
                className="bg-background"
              />
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label htmlFor="status" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Durum
              </Label>
              <Select value={formData.status} onValueChange={(val) => setFormData({ ...formData, status: val })}>
                <SelectTrigger id="status" className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Aktif</SelectItem>
                  <SelectItem value="INACTIVE">Pasif</SelectItem>
                  <SelectItem value="MAINTENANCE">Bakımda</SelectItem>
                  <SelectItem value="PLANNED">Planlandı</SelectItem>
                  <SelectItem value="DECOMMISSIONED">İptal Edildi</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="notes" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Notlar
              </Label>
              <textarea
                id="notes"
                rows={3}
                placeholder="Bu bağlantı hakkında ek notlar"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
              />
            </div>
          </div>

          {existingConnections.length > 0 && (
            <Card className="mt-6 bg-muted/50 border-dashed border-border/50 shadow-none">
              <CardContent className="p-4 flex gap-3">
                <Settings2 className="h-5 w-5 text-primary opacity-50" />
                <div>
                  <p className="text-sm font-semibold">{existingConnections.length} mevcut bağlantı bulundu</p>
                  <p className="text-[10px] text-muted-foreground">Mükerrer bağlantı oluşturmadığınızdan emin olun.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </form>

        <DialogFooter className="p-6 bg-muted/30 border-t border-border flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            İptal
          </Button>
          <Button 
            onClick={(e: any) => handleSubmit(e)} 
            disabled={loading || !formData.sourceBuildingId || !formData.destBuildingId}
            className="min-w-[140px] gap-2"
          >
            {loading ? (
              <Activity className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {loading ? 'İşleniyor...' : (connection?.id ? 'Bağlantıyı Güncelle' : 'Bağlantı Oluştur')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    return type?.includes('FIBER') ? '🔴' : '📡';
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl bg-card border-border shadow-2xl overflow-hidden flex flex-col p-0 z-[1011] max-h-[90vh]">
        <DialogHeader className="p-6 bg-primary/10 border-b border-primary/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary rounded-xl p-2.5 shadow-lg shadow-primary/20">
                <Settings2 className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold tracking-tight">Bina Bağlantılarını Yönet</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Toplam {connections.length} bağlantı listeleniyor
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex">
          {/* Main List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3">
            {connections.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Zap className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-bold">Bina Bağlantısı Yok</h3>
                <p className="text-sm text-muted-foreground">Henüz bir bağlantı oluşturulmamış.</p>
              </div>
            ) : (
              connections.map((conn) => (
                <Card 
                  key={conn.id} 
                  className={cn(
                    "border-border/50 hover:border-primary/50 transition-all cursor-pointer group shadow-none",
                    selectedConnection?.id === conn.id ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "bg-muted/30"
                  )}
                  onClick={() => setSelectedConnection(conn)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 overflow-hidden">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-xl">{getConnectionTypeIcon(conn.connectionType)}</span>
                          <p className="font-bold text-sm truncate">{conn.sourceBuilding?.name} → {conn.destBuilding?.name}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="h-5 text-[9px] uppercase tracking-tighter border-primary/20 text-primary">
                            {conn.connectionType?.replace(/_/g, ' ')}
                          </Badge>
                          <Badge variant={conn.status === 'ACTIVE' ? 'default' : 'secondary'} className="h-5 text-[9px] uppercase font-black">
                            {conn.status}
                          </Badge>
                          {conn.bandwidth && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium">
                              <Zap className="h-3 w-3 text-primary" />
                              {conn.bandwidth}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-primary hover:bg-primary/10"
                          onClick={(e) => { e.stopPropagation(); onEdit(conn); }}
                        >
                          <Settings2 className="h-4 w-4" />
                        </Button>
                        {conn.recordingMethod === 'MANUAL' && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(conn.id); }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Inline Delete Confirmation */}
                    {deleteConfirm === conn.id && (
                      <Card className="mt-3 bg-destructive/5 border-destructive/20 p-3 shadow-none animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[10px] font-bold text-destructive uppercase tracking-widest">Bu bağlantıyı silmek istediğinizden emin misiniz?</p>
                          <div className="flex gap-2">
                            <Button size="sm" variant="destructive" className="h-7 px-3 text-[10px]" onClick={() => handleDelete(conn.id)} disabled={loading}>
                              {loading ? '...' : 'SİL'}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-3 text-[10px]" onClick={() => setDeleteConfirm(null)}>
                              İPTAL
                            </Button>
                          </div>
                        </div>
                      </Card>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Details Sidebar (Internal to Modal) */}
          <aside className={cn(
            "w-80 border-l border-border bg-muted/20 overflow-y-auto custom-scrollbar transition-all",
            selectedConnection ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 absolute right-0"
          )}>
            {selectedConnection && (
              <div className="p-6 space-y-6 animate-in slide-in-from-right duration-300">
                <div>
                  <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4">Bağlantı Detayı</h3>
                  <Card className="p-4 bg-background shadow-none border-border/50">
                    <div className="space-y-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">Kaynak Bina</span>
                        <span className="text-sm font-bold">{selectedConnection.sourceBuilding?.name}</span>
                        <span className="text-[10px] text-muted-foreground">{selectedConnection.sourceBuilding?.city}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">Hedef Bina</span>
                        <span className="text-sm font-bold">{selectedConnection.destBuilding?.name}</span>
                        <span className="text-[10px] text-muted-foreground">{selectedConnection.destBuilding?.city}</span>
                      </div>
                    </div>
                  </Card>
                </div>

                {selectedConnection.notes && (
                  <div className="space-y-2">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Yönetici Notları</span>
                    <p className="text-xs text-muted-foreground italic leading-relaxed border-l-2 border-primary/20 pl-3">
                      "{selectedConnection.notes}"
                    </p>
                  </div>
                )}

                <div className="pt-6 border-t border-border space-y-2">
                  <div className="flex justify-between text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                    <span>Oluşturma:</span>
                    <span>{new Date(selectedConnection.createdAt).toLocaleDateString('tr-TR')}</span>
                  </div>
                  {selectedConnection.updatedAt && (
                    <div className="flex justify-between text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                      <span>Güncelleme:</span>
                      <span>{new Date(selectedConnection.updatedAt).toLocaleDateString('tr-TR')}</span>
                    </div>
                  )}
                </div>
                
                <Button 
                  className="w-full gap-2 shadow-lg shadow-primary/20" 
                  onClick={() => onEdit(selectedConnection)}
                >
                  <Settings2 className="h-4 w-4" />
                  Düzenle
                </Button>
              </div>
            )}
          </aside>
        </div>
      </DialogContent>
    </Dialog>
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
