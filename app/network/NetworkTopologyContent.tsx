'use client';

import Image from 'next/image';

import { uiError, uiLabel } from '@/lib/i18n/tr';

import { PageHeading } from '@/components/ui/page-heading';
import { useRouter } from 'next/navigation';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../../lib/api';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Panel,
  useReactFlow,
  useNodesInitialized,
  ConnectionLineType,
  ConnectionMode,
  type Connection,
  NodeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { toPng } from 'html-to-image';
import { BuildingNode, buildingNodeStatus } from '../../components/topology/BuildingNode';
import { BuildingDeviceWorkspace } from '@/components/topology/BuildingDeviceWorkspace';
import { BuildingConnectionEditor } from '@/components/topology/BuildingConnectionEditor';
import { readMapNavigation, saveTopologyNavigation } from '@/lib/topology/navigation-state';
import { deviceBuildingId } from '@/lib/topology/building-devices';
import { DeviceNode } from '../../components/topology/DeviceNode';
import { CustomEdge, BuildingConnectionEdge } from '../../components/topology/CustomEdge';
import { ConnectionWizard } from '../../components/topology/ConnectionWizard';
import { getZoomConfig, filterNodesByZoom, filterEdgesByZoom } from '../../lib/semanticZoom';
import { getDeviceRole } from '../../lib/deviceRoleMapper';
import { connectionState, deviceConnectionEdge, deviceGraphPositions, normalizeTopologyConnections, type TopologyConnection, type TopologyWireConnection } from '@/lib/topology/workspace';
import { buildingConnectionDraft, buildingGraphPositions, matchingBuildingConnection, type BuildingEndpoints } from '@/lib/topology/building-graph';
import { BUILDING_CONNECTION_LEGEND, BUILDING_CONNECTION_TYPES, buildingConnectionColor, buildingConnectionGroup } from '@/lib/topology/building-connection-options';
import { ConnectionTypeLegend, toggleConnectionType } from '@/components/topology/ConnectionTypeLegend';
import { usePersistedConnectionTypeFilter } from '@/components/topology/usePersistedConnectionTypeFilter';
import { useTopologyViewport } from '@/components/topology/useTopologyViewport';
import { useConnectionLabelVisibility } from '@/components/topology/useConnectionLabelVisibility';
import { TopologySearch } from '@/components/topology/TopologySearch';
import type { TopologySearchItem } from '@/lib/topology/search';
import { connectionInteractionEmphasis, connectionNeighborhood, filterNeighborhoodByDistance, directConnectionCounts, directlyConnectedNodeIds, nextHoveredConnection, nodeInteractionEmphasis, resolveHoveredConnection } from '@/lib/topology/connection-emphasis';
import { useConnectionTooltip } from '@/components/topology/ConnectionTooltip';
import { NodeTooltip } from '@/components/topology/NodeTooltip';
import { NeighborhoodToggle } from '@/components/topology/NeighborhoodToggle';
import { TopologyObjectMenu, TopologyMenuButton, useTopologyObjectMenu, topologyMenuShortcut, type TopologyObject, type TopologyAction } from '@/components/topology/TopologyObjectMenu';
import { ConnectionSelectionHint } from '@/components/topology/ConnectionSelectionHint';
import { TopologyInteractionMode } from '@/components/topology/TopologyInteractionMode';
import { isBuildingPosition, type BuildingPosition } from '@/lib/topology/building-layout';
import { BUILDING_ROUTING_GEOMETRY, buildingMapViewport, routeBuildingConnections } from '@/lib/topology/building-routing';
import { visibleConnectionLabelIds } from '@/lib/topology/device-labels';
import { ConnectionInspector, ConnectionStatus, DeviceInspector } from '@/components/topology/TopologyInspector';
import {
  DEVICE_INVENTORY_CHANGED_EVENT,
  DEVICE_INVENTORY_CHANGED_STORAGE_KEY,
} from '@/lib/device-inventory-events';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { StatusBadge } from '@/components/ui/status-badge';
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
  Plus, 
  X, 
  ArrowLeft,
  Settings2,
  Activity,
  Zap,
  LayoutDashboard,
  ChevronRight,
  Undo2,
  MapPin,
  Building2,
  Layers,
  DoorOpen,
  BoxSelect,
  Server,
  Network,
  RotateCcw,
  RefreshCw,
  CircleCheck,
  Link2,
  AlertTriangle,
  EthernetPort
} from 'lucide-react';
import { Minus, Info, MousePointer2, Move, CircleHelp } from 'lucide-react';
import { cn } from '@/lib/utils';
import styles from './page.module.css';
import type { ApiResponse, BuildingConnection as SharedBuildingConnection } from '@/types';
type BuildingConnection = Omit<SharedBuildingConnection, 'createdAt'> & { createdAt: string | Date };
type WireConnection = TopologyWireConnection;
type DataResponse<T> = ApiResponse<T> & { data: T; totalPages?: number };

interface Device {
  id: string;
  name: string;
  type: string;
  vendor?: string;
  status: string;
  criticality: string;
  managementIp?: string | null;
  rackId?: string;
  buildingId?: string | null;
  building?: { id: string; name: string } | null;
  floorId?: string | null; floor?: { id: string; name: string; floorNumber: number; buildingId: string } | null;
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

type NetworkConnection = TopologyConnection;

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

interface DownPortSummary {
  id: string;
  interfaceIndex: number;
  interfaceName: string;
  description?: string | null;
  adminStatus: string;
  operStatus: string;
  downSince?: string | null;
  lastPolledAt?: string | null;
  updatedAt?: string | null;
  monitored: boolean;
}

interface DeviceTopologyStatus {
  deviceId: string;
  deviceName: string;
  nmsDeviceId?: number | null;
  managementIp?: string | null;
  portDownCount: number;
  downPorts: DownPortSummary[];
}

const UNASSIGNED_BUILDING_ID = '__unassigned-devices__';
const UNASSIGNED_BUILDING_NAME = 'Konumsuz Cihazlar';

function getDeviceBuildingId(device: Device) {
  return deviceBuildingId(device);
}

function isUnassignedDevice(device: Device) {
  return !getDeviceBuildingId(device);
}

const BUILDING_FILTER_TYPES = BUILDING_CONNECTION_LEGEND.map(group => group.value);
const connectionStyles: Record<string, { color: string; width: number; label: string }> = Object.fromEntries(
  BUILDING_CONNECTION_TYPES.map(type => [type.value, {
    color: buildingConnectionColor(type.value), width: type.value.startsWith('FIBER_') ? 4 : 3, label: type.label,
  }]),
);


// nodeTypes/edgeTypes are defined outside the component.
// We wrap them in useMemo below to stabilize references across Turbopack Fast Refresh.

const NetworkTopologyPage = () => {
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [topologyStatusByDeviceId, setTopologyStatusByDeviceId] = useState<Record<string, DeviceTopologyStatus>>({});
  const [services, setServices] = useState<Service[]>([]);
  const [connections, setConnections] = useState<NetworkConnection[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availableSources, setAvailableSources] = useState({ connections: false, telemetry: false, services: false, buildings: false });
  const [showConnectionList, setShowConnectionList] = useState(false);
  const [connectionListQuery, setConnectionListQuery] = useState('');
  const [connectionListStatus, setConnectionListStatus] = useState('all');
  const [hiddenBuildingConnectionTypes, setHiddenBuildingConnectionTypes] = usePersistedConnectionTypeFilter('buildings', BUILDING_FILTER_TYPES);
  const [buildingLabelsVisible, setBuildingLabelsVisible] = useConnectionLabelVisibility('buildings');
  const [editingTopology, setEditingTopology] = useState(false);
  // Stable nodeTypes/edgeTypes via useMemo — survives Turbopack Fast Refresh module re-evaluation
  const nodeTypes = React.useMemo(() => ({
    building: BuildingNode,
    device: DeviceNode,
  }), []);
  const edgeTypes = React.useMemo(() => ({
    custom: CustomEdge,
    building: BuildingConnectionEdge,
  }), []);

  // Topology is fully controlled by useMemo — no separate state needed
  const [selectedNodeSnapshot, setSelectedNode] = useState<Node | null>(null);
  const [nodePositionOverrides, setNodePositionOverrides] = useState<Record<string, { x: number; y: number }>>({});
  const measuredNodeDimensions = useRef<Record<string, { width: number; height: number }>>({});
  const [buildingLayoutReady, setBuildingLayoutReady] = useState(false);
  const [canEditBuildingLayout, setCanEditBuildingLayout] = useState(false);
  const [layoutStatus, setLayoutStatus] = useState<'loading' | 'idle' | 'saving' | 'saved' | 'error'>('loading');
  const [layoutError, setLayoutError] = useState('');
  const [layoutErrorAction, setLayoutErrorAction] = useState<'load' | 'save' | 'reset'>('load');
  const [layoutResetting, setLayoutResetting] = useState(false);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const layoutSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingLayoutPositions = useRef(new Map<string, BuildingPosition>());
  const layoutSaveCount = useRef(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState<'physical' | 'services' | 'hierarchy' | 'zoom' | 'building'>('building');
  const { fitView, zoomIn, zoomOut, getNodes, getEdges, setViewport } = useReactFlow();
  const [viewportZoom, setViewportZoom] = useState(100);
  const [compactMap, setCompactMap] = useState(false);
  const [flowReady, setFlowReady] = useState(false);
  const [navigationReady, setNavigationReady] = useState(false);
  const [onlyConnected, setOnlyConnected] = useState(false);
  const [connectionDepth, setConnectionDepth] = useState<1 | 2>(1);
  const [hiddenHopDistances, setHiddenHopDistances] = useState<Set<1 | 2>>(new Set());
  const { savedViewport, retainedViewport, restoreViewport, captureViewport, releaseViewport } = useTopologyViewport();
  const nodesInitialized = useNodesInitialized();
  const [expandedMap, setExpandedMap] = useState(false);
  const [searchFocusNodeId, setSearchFocusNodeId] = useState<string | null>(null);
  const [selectedBuildingNodeId, setSelectedBuildingNodeId] = useState<string | null>(null);
  const [hoveredBuildingConnectionId, setHoveredBuildingConnectionId] = useState<string | null>(null);
  const [hoveredBuildingNodeId, setHoveredBuildingNodeId] = useState<string | null>(null);
  const buildingNodeTooltip = useConnectionTooltip(open => { if (!open) setHoveredBuildingNodeId(null); });
  const closeBuildingNodeTooltip = buildingNodeTooltip.close;
  const handleBuildingConnectionHover = useCallback((id: string, active: boolean) => {
    if (active) { closeBuildingNodeTooltip(); setHoveredBuildingNodeId(null); }
    setHoveredBuildingConnectionId(current => nextHoveredConnection(current, id, active));
  }, [closeBuildingNodeTooltip]);
  const [searchFocusRevision, setSearchFocusRevision] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportPreview, setExportPreview] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLElement>(null);
  const fitOverview = useCallback((persist = false, ids?: ReadonlySet<string>) => {
    const canvas = canvasRef.current;
    if (viewMode !== 'building' || !canvas) { void fitView({ padding: .18, maxZoom: 1, duration: 0 }); return; }
    const bounds = canvas.getBoundingClientRect();
    const overlays = ['[data-topology-toolbar]', '[data-topology-feedback]'].map(selector => canvas.querySelector(selector)?.getBoundingClientRect()).filter(rect => rect && rect.height > 0);
    const top = Math.max(80, ...overlays.map(rect => rect!.bottom - bounds.top + 16));
    const positions = Object.fromEntries(getNodes().filter(node => node.type === 'building' && (!ids || ids.has(node.id))).map(node => [node.id, node.position]));
    const routes = getEdges().flatMap(edge => edge.data?.buildingRoute && (!ids || (ids.has(edge.source) && ids.has(edge.target))) ? [edge.data.buildingRoute] : []);
    const viewport = buildingMapViewport(positions, routes, canvas.clientWidth, canvas.clientHeight, top);
    if (persist) restoreViewport(viewport);
    void setViewport(viewport, { duration: 0 });
  }, [viewMode, fitView, getNodes, getEdges, setViewport, restoreViewport]);

  useEffect(() => {
    if (selectedNodeSnapshot && isSidebarOpen) detailsRef.current?.focus({ preventScroll: true });
  }, [selectedNodeSnapshot, isSidebarOpen]);
  const graphView = ['building', 'physical', 'services'].includes(viewMode);
  const canMoveNodes = editingTopology && canEditBuildingLayout && !loading
    && (viewMode !== 'building' || (buildingLayoutReady && !layoutResetting));
  const canConnectBuildings = canMoveNodes && viewMode === 'building';
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !graphView || loading) return;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (viewMode === 'building') { if (!navigationReady || !buildingLayoutReady || !flowReady || !nodesInitialized) return; if (retainedViewport.current) { void setViewport(retainedViewport.current, { duration: 0 }); return; } } if (onlyConnected && selectedBuildingNodeId && viewMode === 'building') fitOverview(false, new Set(getNodes().filter(node => !node.hidden).map(node => node.id))); else if (searchFocusNodeId && viewMode === 'building') void fitView({ nodes: [{ id: searchFocusNodeId }], padding: .5, minZoom: .8, maxZoom: 1.2, duration: 0 }); else fitOverview(); }, 100);
    });
    observer.observe(canvas);
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, [graphView, loading, fitView, fitOverview, searchFocusNodeId, viewMode, navigationReady, buildingLayoutReady, flowReady, nodesInitialized, retainedViewport, setViewport, onlyConnected, connectionDepth, selectedBuildingNodeId, getNodes]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setCompactMap(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const selectedNode = useMemo(() => {
    if (!selectedNodeSnapshot || selectedNodeSnapshot.data.isGroup || selectedNodeSnapshot.type === 'building' || selectedNodeSnapshot.data.isBuildingConnection || selectedNodeSnapshot.data.isDeviceConnection) return selectedNodeSnapshot;
    const device = devices.find(item => item.id === (selectedNodeSnapshot.data.deviceId || selectedNodeSnapshot.id));
    if (!device) return selectedNodeSnapshot;
    return { ...selectedNodeSnapshot, data: {
      ...selectedNodeSnapshot.data, label: device.name, name: device.name,
      type: device.type, vendor: device.vendor, status: device.status, criticality: device.criticality,
      building: device.rack?.room?.floor?.building?.name || device.building?.name, floor: device.rack?.room?.floor?.name || device.floor?.name,
      room: device.rack?.room?.name, rack: device.rack?.name,
      interfaces: device.networkInterfaces || [], interfaceCount: device.networkInterfaces?.length || 0,
      serviceCount: services.filter(service => service.deviceId === device.id).length,
      portDownCount: topologyStatusByDeviceId[device.id]?.portDownCount || 0,
      downPorts: topologyStatusByDeviceId[device.id]?.downPorts || [],
    } };
  }, [selectedNodeSnapshot, devices, services, topologyStatusByDeviceId]);
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
  const activeFilterCount = [filterDeviceType, filterStatus, filterCriticality].filter(value => value !== 'all').length;
  const hasFilters = !!searchQuery.trim() || activeFilterCount > 0;
  useEffect(() => {
    setSelectedNode(null);
    setIsSidebarOpen(false);
  }, [searchQuery, filterDeviceType, filterStatus, filterCriticality]);
  const changeView = (next: typeof viewMode) => {
    releaseViewport();
    setSelectedBuildingNodeId(null);
    setViewMode(next); setSelectedNode(null); setIsSidebarOpen(false); setExportError('');
    if (next === 'zoom') {
      setZoomLevel('building'); setSelectedBuilding(null); setSelectedFloor(null);
      setSelectedRoom(null); setSelectedRack(null); setBreadcrumbs([]);
    }
  };
  useEffect(() => {
    if (!graphView || !flowReady || !nodesInitialized || loading || (viewMode === 'building' && (!buildingLayoutReady || !navigationReady))) return;
    const timer = setTimeout(() => { if (viewMode === 'building' && retainedViewport.current) { void setViewport(retainedViewport.current, { duration: 0 }); return; } if (onlyConnected && selectedBuildingNodeId && viewMode === 'building') fitOverview(false, new Set(getNodes().filter(node => !node.hidden).map(node => node.id))); else if (searchFocusNodeId && viewMode === 'building') void fitView({ nodes: [{ id: searchFocusNodeId }], padding: .5, minZoom: .8, maxZoom: 1.2, duration: 250 }); else fitOverview(); }, 100);
    return () => clearTimeout(timer);
  }, [viewMode, searchQuery, filterDeviceType, filterStatus, filterCriticality, devices.length, graphView, flowReady, nodesInitialized, loading, compactMap, fitView, fitOverview, isSidebarOpen, expandedMap, buildingLayoutReady, layoutRevision, searchFocusNodeId, searchFocusRevision, navigationReady, retainedViewport, setViewport, onlyConnected, connectionDepth, selectedBuildingNodeId, getNodes]);
  
  // Hierarchical navigation state (kept for future use in zoom view)
  // const [navigationPath, setNavigationPath] = useState<Array<{ type: string; name: string; id: string }>>([]);
  // const [focusedContainer, setFocusedContainer] = useState<{ type: string; name: string; id: string } | null>(null);
  
  // Building connection modal state
  const [showBuildingConnectionModal, setShowBuildingConnectionModal] = useState(false);
  const [buildingConnectionToEdit, setBuildingConnectionToEdit] = useState<BuildingConnection | null>(null);
  const [editingBuildingConnectionId, setEditingBuildingConnectionId] = useState<string | null>(null);
  const [buildingConnectionEndpoints, setBuildingConnectionEndpoints] = useState<BuildingEndpoints | null>(null);
  const [buildingConnections, setBuildingConnections] = useState<BuildingConnection[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [showManagementModal, setShowManagementModal] = useState(false);
  
  // Building view state - for new building-centric topology
  const [semanticZoom, setSemanticZoom] = useState(1);
  const [selectedBuildingForPopup, setSelectedBuildingForPopup] = useState<Building | null>(null);
  const [searchDeviceId, setSearchDeviceId] = useState<string | null>(null);
  useEffect(() => {
    if (navigationReady || loading || error) return;
    const saved = readMapNavigation();
    const building = buildings.find(item => item.id === saved?.buildingId)
      || (saved?.buildingId === UNASSIGNED_BUILDING_ID && devices.some(device => !getDeviceBuildingId(device))
        ? { id: UNASSIGNED_BUILDING_ID, name: UNASSIGNED_BUILDING_NAME, organizationId: '' } : null);
    if (building) {
      setSelectedBuildingNodeId(`building-${building.id}`); setSearchFocusNodeId(`building-${building.id}`); setOnlyConnected(!!saved?.onlyConnected);
      if (saved?.workspaceOpen) setSelectedBuildingForPopup(building);
    }
    setConnectionDepth(saved?.connectionDepth || 1);
    setHiddenHopDistances(new Set(saved?.hiddenHopDistances || []));
    restoreViewport(saved?.viewport);
    setNavigationReady(true);
  }, [navigationReady, loading, error, buildings, devices, restoreViewport]);
  useEffect(() => {
    if (!navigationReady || loading || error || viewMode !== 'building') return;
    saveTopologyNavigation('map', {
      version: 1, buildingId: selectedBuildingForPopup?.id || selectedBuildingNodeId?.replace(/^building-/, '') || null,
      workspaceOpen: !!selectedBuildingForPopup, viewport: savedViewport, onlyConnected, connectionDepth, hiddenHopDistances: [...hiddenHopDistances],
    });
  }, [navigationReady, loading, error, viewMode, selectedBuildingForPopup, selectedBuildingNodeId, savedViewport, onlyConnected, connectionDepth, hiddenHopDistances]);
  const [expandedBuildings, setExpandedBuildings] = useState<Set<string>>(new Set());
  
  // Connection wizard state
  const [showConnectionWizard, setShowConnectionWizard] = useState(false);
  
  const objectMenu = useTopologyObjectMenu();
  const { open: openObjectMenu, close: closeObjectMenu } = objectMenu;
  const [connectionListDeviceId, setConnectionListDeviceId] = useState<string | null>(null);
  useEffect(() => { closeObjectMenu(); }, [loading, viewMode, selectedBuildingForPopup, closeObjectMenu]);
  useEffect(() => { if (objectMenu.state) { closeBuildingNodeTooltip(); setHoveredBuildingNodeId(null); setHoveredBuildingConnectionId(null); } }, [objectMenu.state, closeBuildingNodeTooltip]);

  // Export topology as PNG
  const onExport = useCallback(async () => {
    const element = canvasRef.current?.querySelector('.react-flow') as HTMLElement | null;
    if (!element || exporting) return;
    setExporting(true); setExportError('');
    try {
      const backgroundColor = getComputedStyle(canvasRef.current!).backgroundColor;
      const dataUrl = await toPng(element, {
        backgroundColor,
        filter: node => !node.classList?.contains('react-flow__panel') && !node.classList?.contains('react-flow__controls'),
      });
      setExportPreview(dataUrl);
    } catch {
      setExportError('Görsel oluşturulamadı. Haritayı tekrar dışa aktarmayı deneyin.');
    } finally { setExporting(false); }
  }, [exporting]);

  // Auto-layout is disabled when using controlled topology (positions computed by useMemo)

  const getNodePositionKey = useCallback((nodeId: string) => `${viewMode}:${nodeId}`, [viewMode]);

  const loadBuildingLayout = useCallback(async () => {
    setLayoutStatus('loading');
    setLayoutErrorAction('load');
    const response: { success: boolean; data?: { positions: Record<string, BuildingPosition>; canEdit: boolean } } = await apiGet('/api/network/building-layout');
    if (!response.success || !response.data) {
      setLayoutStatus('error');
      setLayoutError('Yerleşim yüklenemedi. Yeniden deneyin.');
      return;
    }
    const saved = Object.fromEntries(Object.entries(response.data.positions).filter(([, position]) => isBuildingPosition(position)).map(([nodeId, position]) => [`building:${nodeId}`, position]));
    setNodePositionOverrides(previous => ({ ...previous, ...saved }));
    setCanEditBuildingLayout(response.data.canEdit);
    setBuildingLayoutReady(true);
    setLayoutStatus('idle');
    setLayoutError('');
  }, []);

  useEffect(() => { void loadBuildingLayout(); }, [loadBuildingLayout]);

  const saveBuildingPosition = useCallback((nodeId: string, position: BuildingPosition) => {
    const snapshot = { x: position.x, y: position.y };
    pendingLayoutPositions.current.set(nodeId, snapshot);
    layoutSaveCount.current++;
    setLayoutStatus('saving');
    setLayoutError('');
    setLayoutErrorAction('save');
    // Serialize rapid drags, including repeated moves of the same building.
    layoutSaveQueue.current = layoutSaveQueue.current.then(async () => {
      const response = await apiPut('/api/network/building-layout', { nodeId, position: snapshot });
      if (response.success && pendingLayoutPositions.current.get(nodeId) === snapshot) pendingLayoutPositions.current.delete(nodeId);
    }).catch(() => { /* Pending positions remain available for retry. */ }).finally(() => {
      layoutSaveCount.current--;
      if (layoutSaveCount.current) return;
      const failed = pendingLayoutPositions.current.size > 0;
      setLayoutStatus(failed ? 'error' : 'saved');
      if (failed) setLayoutError('Yerleşim kaydedilemedi. Değişiklikler bu sayfada duruyor; yeniden deneyin.');
    });
  }, []);

  const resetBuildingLayout = useCallback(async () => {
    if (!editingTopology || !buildingLayoutReady || !canEditBuildingLayout || layoutResetting || layoutStatus === 'saving') return;
    releaseViewport();
    setLayoutResetting(true);
    setLayoutStatus('saving');
    setLayoutError('');
    setLayoutErrorAction('reset');
    try {
      await layoutSaveQueue.current;
      const response: { success: boolean; data?: { positions: Record<string, BuildingPosition> } } = await apiPost('/api/network/building-layout', { action: 'reset' });
      if (!response.success || !response.data) throw new Error('reset failed');
      const saved = Object.fromEntries(Object.entries(response.data.positions).map(([nodeId, position]) => [`building:${nodeId}`, position]));
      setNodePositionOverrides(previous => ({ ...Object.fromEntries(Object.entries(previous).filter(([key]) => !key.startsWith('building:'))), ...saved }));
      pendingLayoutPositions.current.clear();
      setLayoutStatus('saved');
      setLayoutRevision(previous => previous + 1);
    } catch {
      setLayoutStatus('error');
      setLayoutError('Yerleşim sıfırlanamadı. Mevcut düzen korunuyor; yeniden deneyin.');
    } finally {
      setLayoutResetting(false);
    }
  }, [editingTopology, buildingLayoutReady, canEditBuildingLayout, layoutResetting, layoutStatus, releaseViewport]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    // Controlled nodes must retain React Flow's measurements. Losing them on a
    // hover render temporarily unmounts edges and cancels their tooltip state.
    changes.forEach(change => {
      if (change.type === 'dimensions' && change.dimensions) {
        measuredNodeDimensions.current[change.id] = change.dimensions;
      }
    });
    if (!canMoveNodes) return;
    setNodePositionOverrides((prev) => {
      let next = prev;

      changes.forEach((change) => {
        if (change.type !== 'position' || !change.position) return;

        if (next === prev) {
          next = { ...prev };
        }

        next[`${viewMode}:${change.id}`] = change.position;
      });

      return next;
    });
  }, [viewMode, canMoveNodes]);

  const getEffectiveNodePosition = useCallback((node: Node) => {
    return nodePositionOverrides[getNodePositionKey(node.id)] || node.position;
  }, [getNodePositionKey, nodePositionOverrides]);

  const getBuildingConnectionHandles = useCallback((sourceNode: Node, targetNode: Node) => {
    const sourcePosition = getEffectiveNodePosition(sourceNode);
    const targetPosition = getEffectiveNodePosition(targetNode);
    const dx = targetPosition.x - sourcePosition.x;
    const dy = targetPosition.y - sourcePosition.y;

    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx >= 0
        ? { sourceHandle: 'right-source', targetHandle: 'left-source' }
        : { sourceHandle: 'left-source', targetHandle: 'right-source' };
    }

    return dy >= 0
      ? { sourceHandle: 'bottom-source', targetHandle: 'top-source' }
      : { sourceHandle: 'top-source', targetHandle: 'bottom-source' };
  }, [getEffectiveNodePosition]);

  const loadGeneration = useRef(0);
  const loadData = useCallback(async (silent = false) => {
    const generation = ++loadGeneration.current;
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const [devicesRes, servicesRes, connectionsRes, orgsRes, buildingConnsRes, topologyStatusRes]: [DataResponse<Device[]>, DataResponse<Service[]>, DataResponse<WireConnection[]>, DataResponse<Organization[]>, DataResponse<{ items: BuildingConnection[] }>, DataResponse<{ devices: DeviceTopologyStatus[] }>] = await Promise.all([
        apiGet('/api/devices?filterType=all&mode=full&limit=200'),
        apiGet('/api/services'),
        apiGet('/api/network-connections'),
        apiGet('/api/organizations'),
        apiGet('/api/building-connections'),
        apiGet('/api/network/topology-status'),
      ]);

      if (!devicesRes.success || !orgsRes.success) {
        throw new Error(uiError('Topoloji için gerekli envanter verileri alınamadı'));
      }

      const allDevices = [...devicesRes.data];
      for (let first = 2; first <= (devicesRes.totalPages || 1); first += 4) {
        const pages = await Promise.all(Array.from({ length: Math.min(4, (devicesRes.totalPages || 1) - first + 1) }, (_, index) => apiGet(`/api/devices?filterType=all&mode=full&limit=200&page=${first + index}`)));
        if (pages.some(page => !page.success)) throw new Error('Cihaz envanterinin tamamı alınamadı. Yeniden deneyin.');
        pages.forEach(page => allDevices.push(...page.data));
      }
      if (generation !== loadGeneration.current) return;
      setDevices(allDevices);
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
      if (topologyStatusRes.success) {
        const statusMap = (topologyStatusRes.data?.devices || []).reduce(
          (acc: Record<string, DeviceTopologyStatus>, item: DeviceTopologyStatus) => {
            acc[item.deviceId] = item;
            return acc;
          },
          {}
        );
        setTopologyStatusByDeviceId(statusMap);
      } else {
        setTopologyStatusByDeviceId({});
      }

      setAvailableSources({ connections: connectionsRes.success, telemetry: topologyStatusRes.success, services: servicesRes.success, buildings: buildingConnsRes.success });
      if (!servicesRes.success) setServices([]);
      if (!buildingConnsRes.success) setBuildingConnections([]);
      setConnections(connectionsRes.success ? normalizeTopologyConnections(connectionsRes.data) : []);
      setLastUpdatedAt(new Date());
    } catch (err) {
      if (generation === loadGeneration.current) setError(uiError((err as Error).message || 'Veriler yüklenirken bir hata oluştu'));
    } finally {
      if (generation === loadGeneration.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const handleInventoryChanged = () => {
      loadData(true);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === DEVICE_INVENTORY_CHANGED_STORAGE_KEY) {
        loadData(true);
      }
    };

    window.addEventListener(DEVICE_INVENTORY_CHANGED_EVENT, handleInventoryChanged);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(DEVICE_INVENTORY_CHANGED_EVENT, handleInventoryChanged);
      window.removeEventListener('storage', handleStorage);
    };
  }, [loadData]);

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
    const query = searchQuery.trim().toLocaleLowerCase('tr-TR');
    const searchable = [device.name, device.managementIp, ...(device.networkInterfaces || []).map(iface => iface.ipv4)].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR');
    if (query && !searchable.includes(query)) {
      return false;
    }
    // Type filter
    if (filterDeviceType !== 'all' && device.type !== filterDeviceType) {
      return false;
    }
    // Status filter
    if (filterStatus !== 'all' && device.status.toUpperCase() !== filterStatus) {
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

  const validBuildingConnection = (connection: Connection) => canConnectBuildings
    && !!buildingConnectionDraft(connection, buildings.map(building => building.id));

  const handleBuildingConnect = (connection: Connection) => {
    if (!canConnectBuildings) return;
    const endpoints = buildingConnectionDraft(connection, buildings.map(building => building.id));
    if (!endpoints) return;
    setBuildingConnectionToEdit(null);
    setBuildingConnectionEndpoints(endpoints);
    setShowBuildingConnectionModal(true);
  };

  const handleNodeClick = (node: Node) => {
    if (viewMode === 'building' && node.type === 'building') {
      const building = buildings.find(b => `building-${b.id}` === node.id)
        || (node.data.buildingId === UNASSIGNED_BUILDING_ID ? { id: UNASSIGNED_BUILDING_ID, name: UNASSIGNED_BUILDING_NAME, organizationId: '' } : null);
      if (building) { if (onlyConnected) releaseViewport(); setSelectedBuildingNodeId(node.id); setSearchDeviceId(null); setSelectedBuildingForPopup(building); }
      setSelectedNode(null);
      return;
    }
    setSelectedNode(node);
    setIsSidebarOpen(true);
    
    if (node.data.isGroup) {
      // Hierarchical navigation is not used after logical view removal
    }
  };
  
  const selectDevice = (id: string) => {
    const device = devices.find(item => item.id === id);
    if (!device) return;
    setSelectedNode({ id, position: { x: 0, y: 0 }, data: { deviceId: id, name: device.name } });
    setIsSidebarOpen(true);
  };
  const selectConnection = (id: string) => {
    setSelectedNode({ id, position: { x: 0, y: 0 }, data: { isDeviceConnection: true, connectionId: id } });
    setIsSidebarOpen(true);
  };
  const handleEdgeClick = (_event: React.MouseEvent, edge: Edge) => {
    if (edge.data?.connectionId) { selectConnection(edge.data.connectionId); return; }
    if (edge.data?.type === 'building-connection' && edge.data?.buildingConnection) {
      setEditingBuildingConnectionId(edge.data.buildingConnection.id);
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
    status: string;
  }) => {
    if (!editingTopology || !canEditBuildingLayout) return;
    try {
      // In a real app, this would call an API
      // For now, we'll just add it to the local state
      const newConnection: NetworkConnection = {
        id: `conn-${Date.now()}`,
        sourceDeviceId: connection.sourceDeviceId,
        targetDeviceId: connection.targetDeviceId,
        status: connection.status.toUpperCase(),
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
    void _level; // All hierarchy levels are currently visible.
    return true;
  };
  
  // Helper to determine if we should render a node type
  const shouldRenderNodeType = (_hierarchyLevel: string) => {
    void _hierarchyLevel; // Preserve the current full-hierarchy rendering policy.
    return true;
  };

  const { topologyNodes: generatedTopologyNodes, topologyEdges: generatedTopologyEdges } = useMemo(() => {
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    
    // Use filtered devices for topology generation
    const devicesToRender = filteredDevices;
    const devicePositions = deviceGraphPositions(devicesToRender.map(device => device.id), connections, compactMap);
    
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
        } else if (device.building?.name) {
          const building = device.building.name, floor = device.floor?.name || 'Kat belirtilmemiş', room = 'Oda belirtilmemiş', rack = 'Kabinet atanmamış';
          buildingHierarchy[building] ||= {}; buildingHierarchy[building][floor] ||= {}; buildingHierarchy[building][floor][room] ||= {}; buildingHierarchy[building][floor][room][rack] ||= [];
          buildingHierarchy[building][floor][room][rack].push(device);
        }
      });
      
      // Get all buildings from organizations
      const allBuildings: Array<{ name: string; id: string; floors?: Floor[] }> = [];
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
          Object.entries(buildingDeviceHierarchy).forEach(([, rooms]) => {
            let floorHeight = 60;
            Object.entries(rooms).forEach(([, racks]) => {
              let roomHeight = 50;
              Object.entries(racks).forEach(([, devicesInRack]) => {
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
            deviceCount: devicesToRender.filter(d => (d.rack?.room?.floor?.building?.name || d.building?.name) === buildingName).length,
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
          
          Object.entries(buildingDeviceHierarchy).forEach(([floorName, rooms]) => {
            let floorHeight = 60;
            Object.entries(rooms).forEach(([, racks]) => {
              let roomHeight = 50;
              Object.entries(racks).forEach(([, devicesInRack]) => {
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
              
              Object.entries(rooms).forEach(([roomName, racks]) => {
              let roomHeight = 50;
              Object.entries(racks).forEach(([, devicesInRack]) => {
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
              
              Object.entries(racks).forEach(([rackName, devicesInRack]) => {
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
                      imageUrl: rackInfo?.imageUrl,
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
                  const portStatus = topologyStatusByDeviceId[device.id];

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
                      portDownCount: portStatus?.portDownCount || 0,
                      downPorts: portStatus?.downPorts || [],
                      building: buildingName,
                      floor: floorName,
                      room: roomName,
                      rack: rackName,
                    },
                  };

                  node.style = {
                    border: `3px solid ${portStatus?.portDownCount ? '#DC2626' : buildingColor}`,
                    borderRadius: '10px',
                    padding: '10px',
                    backgroundColor: portStatus?.portDownCount ? '#FEF2F2' : device.status === 'ACTIVE' ? '#FFFFFF' : '#F3F4F6',
                    boxShadow: portStatus?.portDownCount
                      ? '0 4px 18px 0 rgba(220, 38, 38, 0.28)'
                      : device.status === 'ACTIVE'
                        ? '0 2px 12px 0 rgba(0, 0, 0, 0.2)'
                        : '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
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
          newEdges.push(deviceConnectionEdge(conn));
        }
      });
    } else if (viewMode === 'building') {
      // ====================================================================
      // BUILDING VIEW: Modern building-centric topology with semantic zoom
      // ====================================================================
      
      // Group devices by building
      const buildingMap = new Map<string, { building: Building; devices: Device[] }>();
      
      // Organize all buildings from organizations
      organizations.forEach(org => {
        org.buildings?.forEach(building => {
          if (!buildingMap.has(building.id)) {
            buildingMap.set(building.id, { building, devices: [] });
          }
        });
      });
      
      const unassignedDevices: Device[] = [];

      // Add devices to their buildings. Devices without a rack/building are still
      // inventory devices, so keep them visible in a dedicated topology group.
      devicesToRender.forEach(device => {
        const buildingId = getDeviceBuildingId(device);
        if (buildingId && buildingMap.has(buildingId)) {
          buildingMap.get(buildingId)!.devices.push(device);
        } else {
          unassignedDevices.push(device);
        }
      });

      if (unassignedDevices.length > 0) {
        buildingMap.set(UNASSIGNED_BUILDING_ID, {
          building: {
            id: UNASSIGNED_BUILDING_ID,
            name: UNASSIGNED_BUILDING_NAME,
            city: 'Rack veya bina atanmamış',
            organizationId: '',
          } as Building,
          devices: unassignedDevices,
        });
      }
      
      const buildingsArray = Array.from(buildingMap.values()).filter(item => !hasFilters || item.devices.length > 0);
      const buildingPositions = buildingGraphPositions(buildingsArray.map(item => item.building.id), buildingConnections, compactMap, UNASSIGNED_BUILDING_ID);

      buildingsArray.forEach((buildingData) => {
        const { building, devices } = buildingData;
        const pos = buildingPositions[building.id] || { x: 0, y: 0 };

        // Calculate device counts by role
        const deviceRoles = devices.map(d => getDeviceRole(d.type, d.name));
        const coreCount = deviceRoles.filter(r => r === 'core').length;
        const distCount = deviceRoles.filter(r => r === 'distribution').length;
        const accessCount = deviceRoles.filter(r => r === 'access').length;
        const portDownCount = devices.reduce((total, device) => {
          return total + (topologyStatusByDeviceId[device.id]?.portDownCount || 0);
        }, 0);
        
        // Determine building health status
        const activeDevices = devices.filter(d => d.status.toUpperCase() === 'ACTIVE').length;
        const totalDevices = devices.length;
        const unknownDevices = devices.filter(d => !['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'ERROR', 'DECOMMISSIONED'].includes(d.status.toUpperCase())).length;
        let buildingStatus: 'healthy' | 'degraded' | 'down' | 'unknown' | 'empty' = 'healthy';
        
        if (totalDevices === 0) {
          buildingStatus = 'empty';
        } else if (unknownDevices === totalDevices) {
          buildingStatus = 'unknown';
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
          connectable: building.id !== UNASSIGNED_BUILDING_ID,
          ariaLabel: `${building.name}, ${devices.length} cihaz`,
          position: { x: pos.x, y: pos.y },
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
            portDownCount,
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
              setSelectedBuildingNodeId(`building-${building.id}`); setSearchDeviceId(null);
              setSelectedBuildingForPopup(building);
            },
          },
        };
        
        newNodes.push(buildingNode);
        
      });

      // Add building connection edges
      if (buildingConnections.length > 0) {
        buildingConnections.forEach((buildingConn: BuildingConnection) => {
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
              const sourceNode = newNodes.find(n => n.id === sourceBuildingNodeId)!;
              const destNode = newNodes.find(n => n.id === destBuildingNodeId)!;
              const handles = getBuildingConnectionHandles(sourceNode, destNode);
              
              newEdges.push({
                id: `building-conn-${buildingConn.id}`,
                source: sourceBuildingNodeId,
                target: destBuildingNodeId,
                sourceHandle: handles.sourceHandle,
                targetHandle: handles.targetHandle,
                type: 'building',
                ariaLabel: `${sourceBuilding.name} – ${destBuilding.name}, ${style.label}${buildingConn.bandwidth ? `, ${buildingConn.bandwidth}` : ''}, ${connectionState(buildingConn.status).label}`,
                animated: buildingConn.status === 'ACTIVE',
                data: {
                  label: `${buildingConn.connectionType.startsWith('FIBER_') ? 'Fiber' : style.label}${buildingConn.bandwidth ? ` · ${buildingConn.bandwidth}` : ''}`,
                  strokeColor: style.color,
                  textColor: style.color,
                  strokeWidth: style.width,
                  strokeDasharray: connectionState(buildingConn.status).dash || '0',
                  buildingConnection: buildingConn,
                  onEdit: () => setEditingBuildingConnectionId(buildingConn.id),
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
      
      return { topologyNodes: filteredNodes, topologyEdges: filteredEdges };
    } else if (viewMode === 'physical') {
      // ====================================================================
      // PHYSICAL VIEW: Using custom DeviceNode components
      // ====================================================================
      devicesToRender.forEach((device) => {
        const role = getDeviceRole(device.type, device.name);
        const portStatus = topologyStatusByDeviceId[device.id];
        
        const node: Node = {
          id: device.id,
          type: 'device',
          position: devicePositions[device.id],
          data: {
            deviceId: device.id,
            name: device.name,
            type: device.type,
            vendor: device.vendor,
            role: role,
            status: device.status.toLowerCase() as 'active' | 'inactive' | 'maintenance' | 'error',
            ipAddress: device.managementIp || device.networkInterfaces?.[0]?.ipv4,
            ports: device.networkInterfaces?.length,
            portDownCount: portStatus?.portDownCount || 0,
            downPorts: portStatus?.downPorts || [],
            activeConnections: availableSources.connections ? connections.filter(c => (c.sourceDeviceId === device.id || c.targetDeviceId === device.id) && connectionState(c.status).key === 'up').length : undefined,
            buildingName: device.rack?.room?.floor?.building?.name,
            location: [device.rack?.room?.name, device.rack?.name].filter(Boolean).join(' / ') || 'Konum atanmamış',
          },
        };

        newNodes.push(node);
      });

      connections.forEach(conn => {
        const sourceDevice = devices.find(d => d.id === conn.sourceDeviceId);
        const targetDevice = devices.find(d => d.id === conn.targetDeviceId);

        if (sourceDevice && targetDevice) {
          newEdges.push(deviceConnectionEdge(conn));
        }
      });
    } else if (viewMode === 'services') {
      // ====================================================================
      // SERVICES VIEW: Using custom DeviceNode components
      // ====================================================================
      devicesToRender.forEach((device) => {
        const role = getDeviceRole(device.type, device.name);
        const deviceServices = services.filter(s => s.deviceId === device.id);
        const portStatus = topologyStatusByDeviceId[device.id];
        
        const node: Node = {
          id: device.id,
          type: 'device',
          position: devicePositions[device.id],
          data: {
            deviceId: device.id,
            name: device.name,
            type: device.type,
            vendor: device.vendor,
            role: role,
            status: device.status.toLowerCase() as 'active' | 'inactive' | 'maintenance' | 'error',
            ipAddress: device.managementIp || device.networkInterfaces?.[0]?.ipv4,
            ports: device.networkInterfaces?.length,
            portDownCount: portStatus?.portDownCount || 0,
            downPorts: portStatus?.downPorts || [],
            activeConnections: availableSources.connections ? connections.filter(c => (c.sourceDeviceId === device.id || c.targetDeviceId === device.id) && connectionState(c.status).key === 'up').length : undefined,
            buildingName: device.rack?.room?.floor?.building?.name,
            location: availableSources.services ? `${deviceServices.length} servis` : 'Servis bilgisi yok',
          },
        };

        newNodes.push(node);
      });

      connections.forEach(conn => {
        const sourceDevice = devices.find(d => d.id === conn.sourceDeviceId);
        const targetDevice = devices.find(d => d.id === conn.targetDeviceId);

        if (sourceDevice && targetDevice) {
          newEdges.push(deviceConnectionEdge(conn));
        }
      });
    }

    return { topologyNodes: newNodes, topologyEdges: filterEdgesByZoom(newEdges, newNodes) };
  }, [
    devices,
    filteredDevices,
    hasFilters,
    compactMap,
    services,
    connections,
    viewMode,
    buildingConnections,
    organizations,
    topologyStatusByDeviceId,
    semanticZoom,
    expandedBuildings,
    getBuildingConnectionHandles,
    availableSources
  ]);

  const activeBuildingNode = viewMode === 'building' ? generatedTopologyNodes.find(node => node.id === selectedBuildingNodeId) : undefined;
  const hoveredBuildingNode = viewMode === 'building' ? generatedTopologyNodes.find(node => node.id === hoveredBuildingNodeId) : undefined;
  const emphasisBuildingNodeId = hoveredBuildingNode?.id || activeBuildingNode?.id;
  useEffect(() => {
    if (!hoveredBuildingNode) { closeBuildingNodeTooltip(); setHoveredBuildingNodeId(null); }
  }, [hoveredBuildingNode, closeBuildingNodeTooltip]);
  const positionedTopologyNodes = useMemo(() => generatedTopologyNodes.map(node => {
    const override = nodePositionOverrides[getNodePositionKey(node.id)];
    return override ? { ...node, position: override } : node;
  }), [generatedTopologyNodes, nodePositionOverrides, getNodePositionKey]);
  const buildingRoutePositions = useMemo(() => Object.fromEntries(positionedTopologyNodes.filter(node => node.type === 'building').map(node => [node.id, node.position])), [positionedTopologyNodes]);
  // Route the complete set, including hidden types, so filtering keeps the
  // remaining paths stable. Virtual unassigned buildings remain obstacles.
  const buildingRouting = useMemo(() => viewMode === 'building'
    ? routeBuildingConnections(buildingRoutePositions, generatedTopologyEdges)
    : { routes: {}, blockedIds: [] }, [viewMode, buildingRoutePositions, generatedTopologyEdges]);
  const visibleBuildingEdges = useMemo(() => viewMode === 'building' ? generatedTopologyEdges.filter(edge => !hiddenBuildingConnectionTypes.has(buildingConnectionGroup(edge.data?.buildingConnection?.connectionType || 'OTHER'))) : [], [viewMode, generatedTopologyEdges, hiddenBuildingConnectionTypes]);
  const buildingNeighborhood = useMemo(() => connectionNeighborhood(visibleBuildingEdges, activeBuildingNode?.id, connectionDepth), [visibleBuildingEdges, activeBuildingNode, connectionDepth]);
  const filteredBuildingNeighborhood = useMemo(() => connectionDepth === 2 ? filterNeighborhoodByDistance(buildingNeighborhood, hiddenHopDistances) : buildingNeighborhood, [buildingNeighborhood, connectionDepth, hiddenHopDistances]);
  const neighborhoodBuildingIds = filteredBuildingNeighborhood.nodeIds;
  const neighborhoodActive = viewMode === 'building' && onlyConnected && !!activeBuildingNode;
  const renderedBuildingEdges = neighborhoodActive ? filteredBuildingNeighborhood.edges : visibleBuildingEdges;
  useEffect(() => { if (navigationReady && !loading && onlyConnected && !activeBuildingNode) setOnlyConnected(false); }, [navigationReady, loading, onlyConnected, activeBuildingNode]);
  const toggleBuildingNeighborhood = (active: boolean) => {
    closeBuildingNodeTooltip(); setHoveredBuildingConnectionId(null); setOnlyConnected(active);
    if (active) {
      releaseViewport();
      fitOverview(true, neighborhoodBuildingIds);
    } else fitOverview(true);
  };
  const changeBuildingConnectionDepth = (depth: 1 | 2) => {
    closeBuildingNodeTooltip(); setHoveredBuildingConnectionId(null); setConnectionDepth(depth);
    if (neighborhoodActive) { releaseViewport(); setSearchFocusRevision(value => value + 1); }
  };
  const toggleBuildingHopDistance = (distance: 1 | 2) => {
    closeBuildingNodeTooltip(); setHoveredBuildingConnectionId(null);
    setHiddenHopDistances(previous => { const next = new Set(previous); if (next.has(distance)) next.delete(distance); else next.add(distance); return next; });
    if (neighborhoodActive) { releaseViewport(); setSearchFocusRevision(value => value + 1); }
  };
  const resetBuildingHopDistances = () => {
    closeBuildingNodeTooltip(); setHoveredBuildingConnectionId(null); setHiddenHopDistances(new Set());
    if (neighborhoodActive) { releaseViewport(); setSearchFocusRevision(value => value + 1); }
  };
  const hoveredBuildingConnection = useMemo(() => resolveHoveredConnection(renderedBuildingEdges.filter(edge => buildingRouting.routes[edge.id]), hoveredBuildingConnectionId), [renderedBuildingEdges, buildingRouting, hoveredBuildingConnectionId]);
  const topologyEdges = useMemo(() => {
    if (viewMode !== 'building') return generatedTopologyEdges;
    const visible = renderedBuildingEdges;
    const labelIds = visibleConnectionLabelIds(buildingRoutePositions, visible.flatMap(edge => {
      const route = buildingRouting.routes[edge.id];
      return route ? [{ id: edge.id, ...route.label, width: Math.min(220, Math.max(64, String(edge.data?.label || '').length * 8 + 24)), priority: edge.id === hoveredBuildingConnection?.id ? 3 : edge.id === selectedNodeSnapshot?.id ? 2 : edge.source === emphasisBuildingNodeId || edge.target === emphasisBuildingNodeId ? 1 : 0 }] : [];
    }), BUILDING_ROUTING_GEOMETRY);
    return visible.map(edge => ({ ...edge, data: {
      ...edge.data, showLabels: buildingLabelsVisible,
      buildingRoute: buildingRouting.routes[edge.id], routeBlocked: !buildingRouting.routes[edge.id],
      labelBlocked: !labelIds.has(edge.id), autoHideLabel: viewportZoom < 60,
      connectionEmphasis: connectionInteractionEmphasis(edge, emphasisBuildingNodeId, hoveredBuildingConnection),
      hoverActive: !!hoveredBuildingConnection || !!hoveredBuildingNode,
      onHoverChange: (active: boolean) => handleBuildingConnectionHover(edge.id, active),
    } }));
  }, [viewMode, generatedTopologyEdges, renderedBuildingEdges, buildingLabelsVisible, emphasisBuildingNodeId, buildingRouting, buildingRoutePositions, selectedNodeSnapshot?.id, viewportZoom, hoveredBuildingConnection, hoveredBuildingNode, handleBuildingConnectionHover]);
  const buildingConnectionTypeOptions = useMemo(() => BUILDING_CONNECTION_LEGEND.map(group => ({ ...group,
    count: generatedTopologyEdges.filter(edge => buildingConnectionGroup(edge.data?.buildingConnection?.connectionType || 'OTHER') === group.value).length,
  })), [generatedTopologyEdges]);
  const connectedBuildingIds = useMemo(() => directlyConnectedNodeIds(topologyEdges, emphasisBuildingNodeId), [topologyEdges, emphasisBuildingNodeId]);
  const buildingConnectionCounts = useMemo(() => directConnectionCounts(buildingConnections.map(link => ({ source: `building-${link.sourceBuildingId}`, target: `building-${link.destBuildingId}` }))), [buildingConnections]);
  const visibleBuildingConnectionCounts = useMemo(() => directConnectionCounts(topologyEdges.filter(edge => !edge.data?.routeBlocked)), [topologyEdges]);

  const topologyNodes = useMemo(() => {
    return positionedTopologyNodes.map((node) => {
      return { ...node, hidden: neighborhoodActive && !neighborhoodBuildingIds.has(node.id), selected: selectedNodeSnapshot?.id === node.id || (viewMode === 'building' && selectedBuildingNodeId === node.id),
        data: viewMode === 'building' ? { ...node.data, hopDistance: neighborhoodActive && connectionDepth === 2 ? buildingNeighborhood.distances.get(node.id) : undefined, tooltipId: hoveredBuildingNodeId === node.id && buildingNodeTooltip.anchor ? buildingNodeTooltip.id : undefined, hoverActive: !!hoveredBuildingConnection || !!hoveredBuildingNode, nodeEmphasis: nodeInteractionEmphasis(node.id, emphasisBuildingNodeId, connectedBuildingIds, hoveredBuildingConnection) } : node.data,
      };
    });
  }, [positionedTopologyNodes, selectedNodeSnapshot, viewMode, selectedBuildingNodeId, emphasisBuildingNodeId, connectedBuildingIds, hoveredBuildingConnection, hoveredBuildingNode, hoveredBuildingNodeId, buildingNodeTooltip.anchor, buildingNodeTooltip.id, neighborhoodActive, neighborhoodBuildingIds, connectionDepth, buildingNeighborhood.distances]);

  const topologySearchItems = useMemo<TopologySearchItem[]>(() => [
    ...buildings.map(building => ({ id: building.id, kind: 'building' as const, name: building.name, description: building.city })),
    ...(devices.some(device => !getDeviceBuildingId(device)) ? [{ id: UNASSIGNED_BUILDING_ID, kind: 'building' as const, name: UNASSIGNED_BUILDING_NAME }] : []),
    ...devices.map(device => ({ id: device.id, kind: 'device' as const, name: device.name,
      description: [device.managementIp, buildings.find(building => building.id === getDeviceBuildingId(device))?.name || UNASSIGNED_BUILDING_NAME].filter(Boolean).join(' · '),
    })),
  ], [buildings, devices]);
  const focusSearchResult = (item: TopologySearchItem) => {
    const device = item.kind === 'device' ? devices.find(value => value.id === item.id) : undefined;
    const buildingId = device ? getDeviceBuildingId(device) || UNASSIGNED_BUILDING_ID : item.id;
    const building = buildings.find(value => value.id === buildingId)
      || (buildingId === UNASSIGNED_BUILDING_ID ? { id: UNASSIGNED_BUILDING_ID, name: UNASSIGNED_BUILDING_NAME, organizationId: '' } : null);
    if (!building) return;
    releaseViewport(); clearFilters(); setSelectedNode(null); setIsSidebarOpen(false); setSearchFocusNodeId(`building-${building.id}`);
    setSelectedBuildingNodeId(`building-${building.id}`);
    setSearchFocusRevision(value => value + 1);
    if (device) { setSearchDeviceId(device.id); setSelectedBuildingForPopup(building); }
    else canvasRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const showTopologyEmptyState = topologyNodes.length === 0;
  const selectedDevice = devices.find(device => device.id === (selectedNode?.data.deviceId || selectedNode?.id));
  const selectedConnection = selectedNode?.data.isDeviceConnection ? connections.find(link => link.id === selectedNode.data.connectionId) : undefined;
  const visibleDeviceIds = new Set(filteredDevices.map(device => device.id));
  const visibleConnections = connections.filter(link => visibleDeviceIds.has(link.sourceDeviceId) && visibleDeviceIds.has(link.targetDeviceId));
  const listedConnections = visibleConnections.filter(link => !connectionListDeviceId || link.sourceDeviceId === connectionListDeviceId || link.targetDeviceId === connectionListDeviceId).filter(link => (connectionListStatus === 'all' || connectionState(link.status).key === connectionListStatus)).filter(link => [link.name, link.sourcePortName, link.targetPortName, connectionState(link.status).label, devices.find(device => device.id === link.sourceDeviceId)?.name, devices.find(device => device.id === link.targetDeviceId)?.name].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR').includes(connectionListQuery.trim().toLocaleLowerCase('tr-TR')));
  const unavailableSources = [!availableSources.connections && 'cihaz bağlantıları', !availableSources.telemetry && 'port izleme', !availableSources.services && 'servisler', !availableSources.buildings && 'bina bağlantıları'].filter(Boolean);

  const menuNodes = useMemo(() => topologyNodes.map(node => ({ ...node, data: { ...node.data, onOpenMenu: (event: React.MouseEvent<HTMLButtonElement>) => openObjectMenu({ kind: node.type === 'building' ? 'building' : 'device', id: node.type === 'building' ? node.data.buildingId : node.data.deviceId || node.id }, event) } })), [topologyNodes, openObjectMenu]);
  const menuEdges = useMemo(() => topologyEdges.map(edge => ({ ...edge, data: { ...edge.data, onOpenMenu: (event: React.MouseEvent<HTMLButtonElement>) => openObjectMenu({ kind: edge.data?.buildingConnection ? 'building-connection' : 'device-connection', id: edge.data?.buildingConnection?.id || edge.data?.connectionId || edge.id }, event) } })), [topologyEdges, openObjectMenu]);
  const resolveMenuObject = (kind: 'node' | 'edge', id: string): TopologyObject | undefined => {
    if (kind === 'node') { const node = topologyNodes.find(value => value.id === id); return node ? { kind: node.type === 'building' ? 'building' : 'device', id: node.type === 'building' ? node.data.buildingId : node.data.deviceId || id } : undefined; }
    const edge = topologyEdges.find(value => value.id === id); return edge ? { kind: edge.data?.buildingConnection ? 'building-connection' : 'device-connection', id: edge.data?.buildingConnection?.id || edge.data?.connectionId || id } : undefined;
  };
  const menuTarget = !loading ? objectMenu.state?.target : undefined;
  const menuDevice = menuTarget?.kind === 'device' ? devices.find(device => device.id === menuTarget.id) : undefined;
  const menuBuilding = menuTarget?.kind === 'building' ? buildings.find(building => building.id === menuTarget.id) || (menuTarget.id === UNASSIGNED_BUILDING_ID ? { id: UNASSIGNED_BUILDING_ID, name: UNASSIGNED_BUILDING_NAME, organizationId: '' } : undefined) : undefined;
  const menuDeviceLink = menuTarget?.kind === 'device-connection' ? connections.find(link => link.id === menuTarget.id) : undefined;
  const menuBuildingLink = menuTarget?.kind === 'building-connection' ? buildingConnections.find(link => link.id === menuTarget.id) : undefined;
  const menuActions: TopologyAction[] = [];
  let menuName = '';
  if (menuDevice) {
    const id = menuDevice.id; menuName = menuDevice.name;
    menuActions.push({ id: 'details', label: 'Ayrıntıları aç', run: () => selectDevice(id) }, { id: 'connections', label: 'Bağlı cihazları göster', disabled: !availableSources.connections, run: () => { setConnectionListDeviceId(id); setConnectionListQuery(''); setConnectionListStatus('all'); setShowConnectionList(true); } });
    if (menuDevice.managementIp) menuActions.push({ id: 'copy', label: 'Yönetim IP’sini kopyala', keepFocus: true, run: () => objectMenu.copyAddress(menuDevice.managementIp!) });
  } else if (menuBuilding) {
    const building = menuBuilding; menuName = building.name;
    menuActions.push({ id: 'devices', label: 'Binadaki cihazları aç', run: () => { setSelectedBuildingNodeId('building-' + building.id); setSearchDeviceId(null); setSelectedBuildingForPopup(building); } }, { id: 'connections', label: 'Bağlantılı binaları göster', disabled: !availableSources.buildings, run: () => { releaseViewport(); setSelectedBuildingNodeId('building-' + building.id); setConnectionDepth(1); setOnlyConnected(true); setSearchFocusRevision(value => value + 1); } });
  } else if (menuDeviceLink) {
    const link = menuDeviceLink; menuName = link.name || 'Cihaz bağlantısı';
    menuActions.push({ id: 'details', label: 'Ayrıntıları aç', run: () => selectConnection(link.id) });
    for (const [side, id] of [['Kaynak', link.sourceDeviceId], ['Hedef', link.targetDeviceId]]) if (devices.some(device => device.id === id)) menuActions.push({ id: side, label: side + ' cihazı göster', run: () => selectDevice(id) });
  } else if (menuBuildingLink) {
    const link = menuBuildingLink; menuName = (link.sourceBuilding?.name || 'Kaynak bina') + ' – ' + (link.destBuilding?.name || 'Hedef bina');
    menuActions.push({ id: 'details', label: 'Ayrıntıları aç', run: () => { setSelectedNode({ id: link.id, position: { x: 0, y: 0 }, data: { isBuildingConnection: true, buildingConnection: link } }); setIsSidebarOpen(true); } });
    for (const [side, id] of [['Kaynak', link.sourceBuildingId], ['Hedef', link.destBuildingId]]) { const building = buildings.find(value => value.id === id); if (building) menuActions.push({ id: side, label: side + ' binadaki cihazları aç', run: () => { setSelectedBuildingNodeId('building-' + building.id); setSearchDeviceId(null); setSelectedBuildingForPopup(building); } }); }
    if (editingTopology && canEditBuildingLayout) menuActions.push({ id: 'edit', label: 'Bağlantıyı düzenle', run: () => { if (editingTopology && canEditBuildingLayout) setEditingBuildingConnectionId(link.id); } });
  }

  const networkSummary = useMemo(() => {
    const active = devices.filter((device) => device.status.toUpperCase() === 'ACTIVE').length;
    const maintenance = devices.filter((device) => device.status.toUpperCase() === 'MAINTENANCE').length;
    const unavailable = devices.filter((device) =>
      ['INACTIVE', 'ERROR', 'DECOMMISSIONED'].includes(device.status.toUpperCase())
    ).length;
    const portDown = Object.values(topologyStatusByDeviceId).reduce(
      (total, device) => total + device.portDownCount,
      0
    );

    return { active, maintenance, unavailable, portDown, unknown: devices.length - active - maintenance - unavailable };
  }, [devices, topologyStatusByDeviceId]);

  const currentViewLabel = {
    building: 'Bina bağlantıları',
    physical: 'Fiziksel topoloji',
    services: 'Servis topolojisi',
    hierarchy: 'Altyapı hiyerarşisi',
    zoom: 'Detaylı keşif',
  }[viewMode];

  const summaryUnavailable = loading || (!!error && !lastUpdatedAt);
  const mapConnectionsAvailable = viewMode === 'building' ? availableSources.buildings : availableSources.connections;
  const networkNeedsAttention = networkSummary.unavailable > 0 || networkSummary.portDown > 0;

  // Sync removed — topologyNodes/topologyEdges passed directly to ReactFlow



  return (
    <>
      <TopologyObjectMenu menu={objectMenu} name={menuName} actions={menuActions} />
      <Dialog open={showConnectionList} onOpenChange={setShowConnectionList}>
        <DialogContent className="max-w-2xl" closeLabel="Bağlantı listesini kapat" onCloseAutoFocus={event => { if (selectedNode?.data.isDeviceConnection) { event.preventDefault(); detailsRef.current?.focus({ preventScroll: true }); } }}><DialogHeader><DialogTitle className="flex items-center gap-2"><Link2 className="h-5 w-5 text-primary" />Cihaz bağlantıları</DialogTitle><DialogDescription>Geçerli cihaz filtrelerine uyan bağlantılar. Bir kaydı seçerek uçları ve portları inceleyin. Bina bağlantıları için “Bağlantıları yönet”i kullanın.</DialogDescription></DialogHeader>
          {connectionListDeviceId && <div className="flex flex-wrap items-center gap-2 text-xs"><span>{devices.find(device => device.id === connectionListDeviceId)?.name || 'Seçili cihaz'} · Doğrudan bağlantılar</span><Button size="sm" variant="ghost" onClick={() => setConnectionListDeviceId(null)}>Tüm bağlantıları göster</Button></div>}
          <Input aria-label="Bağlantılarda ara" placeholder="Cihaz, port veya durum ile ara…" value={connectionListQuery} onChange={event => setConnectionListQuery(event.target.value)} />
          <div className="space-y-1.5"><Label htmlFor="connection-list-status">Bağlantı durumu</Label><select id="connection-list-status" className={styles.select} value={connectionListStatus} onChange={event => setConnectionListStatus(event.target.value)}><option value="all">Tüm durumlar</option><option value="up">Açık</option><option value="down">Kapalı</option><option value="unknown">Bilinmiyor</option><option value="dormant">Beklemede</option></select></div>
          <p className="text-xs text-muted-foreground" role="status">{availableSources.connections ? `${listedConnections.length} / ${visibleConnections.length} bağlantı` : 'Bağlantı sayısı doğrulanamadı.'}</p>
          <div className={styles.connectionList}>{!availableSources.connections ? <p className={styles.listEmpty}>Bağlantı verileri alınamadı. Yenileyerek tekrar deneyin.</p> : !listedConnections.length ? <p className={styles.listEmpty}>{visibleConnections.length ? 'Aramaya uygun bağlantı bulunamadı.' : 'Bu görünümde kayıtlı cihaz bağlantısı yok. Cihazların aynı haritada bulunması aralarında bağlantı olduğu anlamına gelmez.'}</p> : listedConnections.map(link => <button type="button" key={link.id} onClick={() => { setShowConnectionList(false); selectConnection(link.id); }}><span><Server size={16} /><strong>{devices.find(device => device.id === link.sourceDeviceId)?.name || 'Bilinmeyen cihaz'} ↔ {devices.find(device => device.id === link.targetDeviceId)?.name || 'Bilinmeyen cihaz'}</strong></span><small>{link.sourcePortName || 'Port belirtilmemiş'} ↔ {link.targetPortName || 'Port belirtilmemiş'}</small><ConnectionStatus status={link.status} /></button>)}</div>
        </DialogContent>
      </Dialog>
      <div className={styles.page}>
        <header className={styles.header}>
          <div className="min-w-0">
            <PageHeading section="network" showIcon={false} className="!text-lg !font-semibold">Ağ topolojisi</PageHeading>
            <p className={styles.subtitle}>Binalar, cihazlar ve bağlantılar için ağ haritası</p>
          </div>
          <div className={styles.headerActions}>
            <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="gap-1.5" aria-label="Ağ özetini göster"><Activity className="h-3.5 w-3.5 text-primary" /><span className="tabular-nums">{summaryUnavailable ? '—' : devices.length} cihaz</span><span className="text-muted-foreground">· {summaryUnavailable || !(graphView ? mapConnectionsAvailable : availableSources.buildings) ? '—' : graphView ? topologyEdges.length : buildingConnections.length} bağlantı</span></Button></PopoverTrigger><PopoverContent align="end" className="w-[440px] p-3"><p className="mb-3 text-sm font-semibold">Ağ özeti</p>
        <section className={styles.stats} aria-label="Ağ özeti">
          <TopologyStat icon={<Server className="h-4 w-4" />} label="Toplam cihaz" value={summaryUnavailable ? '—' : devices.length} hint={`${buildings.length} bina · ${devices.filter(isUnassignedDevice).length} konumsuz cihaz`} />
          <TopologyStat icon={<CircleCheck className="h-4 w-4" />} label="Aktif cihaz" value={summaryUnavailable ? '—' : networkSummary.active} hint={`${networkSummary.unknown} cihazın durumu bilinmiyor`} />
          <TopologyStat icon={<EthernetPort className="h-4 w-4" />} label="Kapalı port kaydı" value={summaryUnavailable || !availableSources.telemetry ? '—' : networkSummary.portDown} hint="NMS port uyarıları · kapsam garantisi vermez" warning={networkSummary.portDown > 0} />
          <TopologyStat icon={<Link2 className="h-4 w-4" />} label="Görünen bağlantı" value={summaryUnavailable || !(graphView ? mapConnectionsAvailable : availableSources.buildings) ? '—' : graphView ? topologyEdges.length : buildingConnections.length} hint={graphView ? currentViewLabel : 'Binalar arası bağlantılar'} />
        </section>
            </PopoverContent></Popover>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => loadData(true)} disabled={loading || refreshing} aria-label={refreshing ? 'Yenileniyor' : 'Yenile'} title="Envanteri ve bağlantıları yenile"><RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} /><span className={styles.actionLabel}>{refreshing ? 'Yenileniyor' : 'Yenile'}</span></Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowManagementModal(true)} disabled={loading} aria-label="Bağlantıları yönet" title="Bağlantıları yönet"><Settings2 className="h-3.5 w-3.5" /><span className={styles.actionLabel}>Bağlantıları yönet</span></Button>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={onExport} disabled={loading || !graphView || exporting || !topologyNodes.length} aria-label="Topolojiyi PNG olarak dışa aktar" title="Görünen haritayı PNG olarak indir">{exporting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}</Button>
            <Button onClick={() => { if (!editingTopology || !canEditBuildingLayout) return; setBuildingConnectionToEdit(null); setBuildingConnectionEndpoints(null); setShowBuildingConnectionModal(true); }} size="sm" aria-label="Yeni bağlantı" className="gap-1.5" disabled={loading || !editingTopology || !canEditBuildingLayout} title={!editingTopology ? 'Bağlantı oluşturmak için Düzenleme moduna geçin.' : undefined}><Plus className="h-4 w-4" /><span className={styles.actionLabel}>Yeni bağlantı</span></Button>
          </div>
        </header>

        <div className={styles.viewToolbar}>
          <div className={styles.viewTabs} role="tablist" aria-label="Topoloji görünümü" onKeyDown={event => {
            const keys = ['building', 'physical', 'services', 'hierarchy', 'zoom'] as const;
            const index = keys.indexOf(viewMode);
            const next = event.key === 'ArrowRight' ? (index + 1) % keys.length : event.key === 'ArrowLeft' ? (index - 1 + keys.length) % keys.length : event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : -1;
            if (next < 0) return;
            event.preventDefault(); changeView(keys[next]); document.getElementById(`topology-tab-${keys[next]}`)?.focus();
          }}>
            {([
              { key: 'building', label: 'Binalar', icon: Building2 },
              { key: 'physical', label: 'Cihazlar', icon: Network },
              { key: 'services', label: 'Servisler', icon: Server },
              { key: 'hierarchy', label: 'Hiyerarşi', icon: Layers },
              { key: 'zoom', label: 'Konum keşfi', icon: Search },
            ] as const).map(view => <button key={view.key} id={`topology-tab-${view.key}`} role="tab" type="button" aria-selected={viewMode === view.key} aria-controls="topology-view-panel" tabIndex={viewMode === view.key ? 0 : -1} onClick={() => changeView(view.key)}><view.icon className="h-4 w-4" />{view.label}</button>)}
          </div>
          {graphView && <div className={styles.tools}>
            <div className={styles.search} hidden={viewMode === 'building'}>
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cihaz adı veya IP ile ara…" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} className="pl-9 pr-9" aria-label="Topolojide cihaz ara" />
              {searchQuery && <Button variant="ghost" size="icon" className="absolute right-0 top-0 h-10 w-9" onClick={() => setSearchQuery('')} aria-label="Aramayı temizle"><X className="h-3.5 w-3.5" /></Button>}
            </div>
            <Popover><PopoverTrigger asChild><Button variant="outline" className="gap-2"><Filter className="h-4 w-4" />Filtreler{activeFilterCount > 0 && <Badge variant="secondary" icon={null}>{activeFilterCount}</Badge>}</Button></PopoverTrigger>
              <PopoverContent align="end" className="w-80 space-y-4" aria-labelledby="topology-filters-heading">
                <div><h2 id="topology-filters-heading" className="text-sm font-semibold">Görünümü filtrele</h2><p className="mt-1 text-xs text-muted-foreground">Seçimler haritadaki cihazlara uygulanır.</p></div>
                <div className="space-y-2"><Label htmlFor="topology-type">Cihaz türü</Label><select id="topology-type" className={styles.select} value={filterDeviceType} onChange={event => setFilterDeviceType(event.target.value)}><option value="all">Tüm türler</option>{deviceTypes.filter(type => type !== 'all').map(type => <option key={type} value={type}>{uiLabel(type)}</option>)}</select></div>
                <div className="space-y-2"><Label htmlFor="topology-status">Cihaz durumu</Label><select id="topology-status" className={styles.select} value={filterStatus} onChange={event => setFilterStatus(event.target.value)}><option value="all">Tüm durumlar</option><option value="ACTIVE">Aktif</option><option value="INACTIVE">Pasif</option><option value="MAINTENANCE">Bakımda</option><option value="ERROR">Hata</option><option value="DECOMMISSIONED">Devre dışı</option><option value="UNKNOWN">Bilinmiyor</option></select></div>
                <div className="space-y-2"><Label htmlFor="topology-criticality">Kritiklik</Label><select id="topology-criticality" className={styles.select} value={filterCriticality} onChange={event => setFilterCriticality(event.target.value)}><option value="all">Tüm öncelikler</option><option value="CRITICAL">Kritik</option><option value="HIGH">Yüksek</option><option value="MEDIUM">Orta</option><option value="LOW">Düşük</option></select></div>
                <Button variant="outline" size="sm" className="w-full gap-2" disabled={!hasFilters} onClick={clearFilters}><RotateCcw className="h-3.5 w-3.5" />Filtreleri sıfırla</Button>
              </PopoverContent>
            </Popover>
          </div>}
        </div>
        {graphView && hasFilters && <div className={styles.activeFilters} aria-label="Etkin filtreler">
          {searchQuery && <button type="button" onClick={() => setSearchQuery('')} aria-label="Arama filtresini kaldır">Arama: {searchQuery}<X className="h-3 w-3" /></button>}
          {filterDeviceType !== 'all' && <button type="button" onClick={() => setFilterDeviceType('all')} aria-label="Cihaz türü filtresini kaldır">{uiLabel(filterDeviceType)}<X className="h-3 w-3" /></button>}
          {filterStatus !== 'all' && <button type="button" onClick={() => setFilterStatus('all')} aria-label="Durum filtresini kaldır">{uiLabel(filterStatus)}<X className="h-3 w-3" /></button>}
          {filterCriticality !== 'all' && <button type="button" onClick={() => setFilterCriticality('all')} aria-label="Kritiklik filtresini kaldır">{uiLabel(filterCriticality)}<X className="h-3 w-3" /></button>}
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearFilters}>Tümünü temizle</Button>
        </div>}
        <div className={styles.statusLine}>
          <p className="text-xs text-muted-foreground" role="status">{loading ? 'Envanter yükleniyor…' : graphView ? `${filteredDevices.length} / ${devices.length} cihaz · ${currentViewLabel}` : `${currentViewLabel} · Tüm envanter`}</p>
          <span className="text-[11px] text-muted-foreground">{lastUpdatedAt ? `Son güncelleme ${lastUpdatedAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}` : 'Güncelleme bekleniyor'}</span>
          {!loading && !error && <SemanticBadge tone={unavailableSources.length ? 'warning' : networkNeedsAttention ? 'warning' : networkSummary.unknown ? 'neutral' : devices.length ? 'success' : 'neutral'} icon={networkSummary.unknown && !networkNeedsAttention ? CircleHelp : undefined}>{unavailableSources.length ? 'Bazı kaynaklar alınamadı' : networkNeedsAttention ? `${networkSummary.unavailable} pasif cihaz · ${networkSummary.portDown} kapalı port` : networkSummary.unknown ? `${networkSummary.unknown} cihazın durumu bilinmiyor` : devices.length ? 'Envanterdeki cihazlar aktif' : 'Envanter boş'}</SemanticBadge>}
        </div>
        {!loading && !error && unavailableSources.length > 0 && <p role="alert" className={styles.sourceWarning}><AlertTriangle size={16} />Bazı veriler alınamadı: {unavailableSources.join(', ')}. Eksik kaynaklar için durum ve sayılar doğrulanamıyor. Yenile düğmesiyle tekrar deneyin.</p>}
        {exportError && <p role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-xs text-destructive"><AlertTriangle className="h-4 w-4 shrink-0" />{exportError}</p>}
        {/* Loading/Error States */}
        {loading && (
          <div className="flex min-h-48 flex-1 items-center justify-center bg-background" role="status">
            <div className="text-center">
              <RefreshCw className="mx-auto h-6 w-6 animate-spin text-primary" />
              <p className="mt-3 text-sm font-medium text-foreground">Ağ topolojisi hazırlanıyor</p>
              <p className="mt-1 text-sm text-muted-foreground">Envanter ve bağlantılar yükleniyor.</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex min-h-48 flex-1 items-center justify-center bg-background" role="alert">
            <div className="mx-4 w-full max-w-md rounded-md border border-destructive/30 bg-destructive/5 p-6 text-center">
              <AlertTriangle className="mx-auto h-6 w-6 text-destructive" />
              <p className="mt-3 text-sm font-semibold text-foreground">Topoloji yüklenemedi</p>
              <p className="mt-1 text-sm text-muted-foreground">{uiError(error)}</p>
              <Button onClick={() => loadData()} className="mt-4 gap-2">
                <RefreshCw className="h-4 w-4" />
                Tekrar Dene
              </Button>
            </div>
          </div>
        )}

        {/* Content */}
        {!loading && !error && (
          <div className={styles.content} id="topology-view-panel" role="tabpanel" aria-labelledby={`topology-tab-${viewMode}`} tabIndex={0}>
            {viewMode === 'hierarchy' ? (
              // HIERARCHY VIEW
              <div className={styles.exploration}>
                <div className="max-w-5xl mx-auto">
                  <div className="mb-10">
                    <h2 className="text-xl font-semibold tracking-tight text-foreground">Altyapı Hiyerarşisi</h2>
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
              <div className={styles.exploration}>
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
                          <h2 className="text-xl font-semibold tracking-tight text-foreground">Altyapıya Genel Bakış</h2>
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
                          <h2 className="text-xl font-semibold tracking-tight text-foreground">{selectedBuilding.name}</h2>
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
                          <h2 className="text-xl font-semibold tracking-tight text-foreground">{selectedFloor.name}</h2>
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
                          <h2 className="text-xl font-semibold tracking-tight text-foreground">{selectedRoom.name}</h2>
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
                                    <Image fill unoptimized sizes="(max-width: 767px) 100vw, 320px"
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
                                    <Badge variant="success" className="h-6 font-black border-none">
                                      {rack.maxUnits}U
                                    </Badge>
                                  </div>
                                  
                                  <div className="mb-6">
                                    <h3 className="text-xl font-black tracking-tight group-hover:text-primary transition-colors">{rack.name}</h3>
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{uiLabel(rack.type)}</p>
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
                          <h2 className="text-xl font-semibold tracking-tight text-foreground">{selectedRack.name}</h2>
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
                              

                              return (
                                <Card key={device.id} className="group overflow-hidden border-border hover:border-primary transition-all duration-300 shadow-sm hover:shadow-xl">
                                  <CardContent className="p-0">
                                    <div className="p-6 border-b border-border/50">
                                      <div className="flex items-center justify-between mb-4">
                                        <div className="p-2.5 bg-primary/10 rounded-xl group-hover:scale-110 transition-transform shadow-none">
                                          <Server className="h-5 w-5 text-primary" />
                                        </div>
                                        <StatusBadge status={device.status} />
                                      </div>
                                      
                                      <h3 className="text-lg font-black tracking-tight mb-1 truncate">{device.name}</h3>
                                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{uiLabel(device.type)}</p>
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
                                            {uiLabel(device.criticality)}
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
                                                <span className="font-mono text-muted-foreground">{iface.ipv4 || 'IP yok'}</span>
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
              <div className={cn(styles.workspace, expandedMap && styles.workspaceExpanded)} onKeyDown={event => { if (event.key === 'Escape' && expandedMap) { event.preventDefault(); setExpandedMap(false); } }}>
                <div className={styles.canvas} ref={canvasRef} tabIndex={-1} aria-label="Topoloji haritası" role="region">
                  <div className={styles.mapOverlays}>
                  <div className={styles.mapHeading} data-topology-toolbar>
                    <TopologyInteractionMode editing={editingTopology} onChange={setEditingTopology} canEdit={buildingLayoutReady && canEditBuildingLayout} disabled={loading || layoutResetting || layoutStatus === 'saving'} label="Topoloji etkileşim modu" />
                    {viewMode === 'building' && <div className="flex min-w-0 flex-1 basis-64 items-center"><TopologySearch items={topologySearchItems} onSelect={focusSearchResult} label="Topolojide bina veya cihaz ara" placeholder="Bina veya cihaz ara ve odaklan…" disabled={loading || !buildingLayoutReady} /></div>}
                    {viewMode === 'building' && <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs" disabled={loading || !navigationReady || !buildingLayoutReady || !flowReady || !nodesInitialized} title="İlk otomatik yakınlaştırma ve kaydırma görünümüne dön ve kaydet" onClick={() => { closeBuildingNodeTooltip(); setHoveredBuildingConnectionId(null); if (neighborhoodActive) toggleBuildingNeighborhood(true); else fitOverview(true); }}><RotateCcw size={14} aria-hidden="true" />Görünümü sıfırla</Button>}
                    <span className={styles.mapMeta}><Network className="h-3.5 w-3.5 text-primary" />{currentViewLabel}<span className="font-normal text-muted-foreground">{topologyNodes.filter(node => !node.hidden).length} öğe · {mapConnectionsAvailable ? topologyEdges.length : '—'} bağlantı</span></span>
                    <div className={styles.mapTools}><Button size="sm" variant="ghost" className={`${styles.mapExpandButton} h-8 shrink-0 gap-1.5 text-xs`} aria-label={expandedMap ? 'Normal görünüme dön' : 'Haritayı genişlet'} title={expandedMap ? 'Normal görünüme dön · Esc' : 'Haritayı genişlet'} onClick={() => setExpandedMap(!expandedMap)}>{expandedMap ? <X className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}<span>{expandedMap ? 'Normal görünüme dön' : 'Haritayı genişlet'}</span></Button><Button variant="ghost" size="sm" aria-label="Bağlantı listesi" title="Bağlantı listesi" className="h-8 gap-1.5 text-xs" onClick={() => { setConnectionListDeviceId(null); setConnectionListQuery(''); setConnectionListStatus('all'); setShowConnectionList(true); }}><Link2 size={14} /><span className={styles.mapToolLabel}>Bağlantı listesi</span></Button><Popover><PopoverTrigger asChild><Button size="sm" variant="ghost" aria-label="Harita rehberi" title="Harita rehberi" className="h-8 gap-1.5 text-xs"><Info className="h-3.5 w-3.5" /><span className={styles.mapToolLabel}>Harita rehberi</span></Button></PopoverTrigger><PopoverContent align="end" className="w-72 space-y-3"><p className="text-sm font-semibold">Haritayı keşfedin</p><p className="flex gap-2 text-xs text-muted-foreground"><Move className="h-4 w-4 shrink-0" />Boş alanı sürükleyerek haritada gezinin.</p><p className="flex gap-2 text-xs text-muted-foreground"><MousePointer2 className="h-4 w-4 shrink-0" />Bir cihaza veya bağlantı çizgisine tıklayarak ayrıntılarını açın. Klavyeyle incelemek için bağlantı listesini kullanın.</p><p className="text-xs text-muted-foreground">İkon taşıma ve bağlantı oluşturma yalnızca Düzenleme modunda kullanılabilir.</p><div className="space-y-2 border-t border-border pt-3 text-xs"><p className="font-medium">Binalar arası bağlantı renkleri</p>{BUILDING_CONNECTION_LEGEND.map(group => <p key={group.label}><span aria-hidden="true" className="mr-2 inline-block w-6 border-t-2" style={{ borderColor: group.color }} />{group.label}</p>)}<p className="text-muted-foreground">WAN / kablosuz: kablosuz, mikrodalga, kiralık hat, MPLS ve VPN. Düz çizgi açık, kesikli çizgi diğer durumları gösterir.</p><p className="border-t border-border pt-2">Cihaz haritasında çizgi rengi ve etiketi bağlantı durumunu gösterir. Düz yeşil: açık · kesik kırmızı: kapalı · noktalı gri: bilinmiyor.</p></div></PopoverContent></Popover></div>
                  </div>
                  <div className={styles.mapFeedback} data-topology-feedback>
                  {viewMode === 'building' && topologyEdges.some(edge => edge.data.routeBlocked) && <p role="status" className={styles.editingNotice}>Bazı bağlantılar için güvenli çizgi rotası bulunamadı. Düzenleme modunda binalar arasında boşluk bırakın; bağlantı bilgileri Bağlantıları yönet listesinde korunur.</p>}
                  {viewMode === 'building' && (editingTopology || layoutStatus === 'error' || layoutStatus === 'loading') && <div className={styles.editingNotice}>
                    <p role="status">{editingTopology && canEditBuildingLayout ? 'Düzenleme modu: İkonu gövdesinden sürükleyerek taşıyın. Bağlantı için kenarındaki noktadan başka bir binanın noktasına sürükleyin.' : 'Görüntüleme modu: Binaları ve bağlantıları inceleyin. Taşımak veya bağlantı oluşturmak için Düzenleme moduna geçin.'}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span role={layoutStatus === 'error' ? 'alert' : 'status'} className={layoutStatus === 'error' ? 'text-destructive' : ''}>{layoutResetting ? 'Yerleşim sıfırlanıyor…' : layoutStatus === 'loading' ? 'Yerleşim yükleniyor…' : layoutStatus === 'saving' ? 'Yerleşim kaydediliyor…' : layoutStatus === 'error' ? layoutError : layoutStatus === 'saved' ? 'Yerleşim kaydedildi' : canEditBuildingLayout ? 'Yerleşim otomatik kaydedilir' : 'Yerleşim salt okunur'}</span>
                      {layoutStatus === 'error' && <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => { if (layoutErrorAction === 'reset') { void resetBuildingLayout(); return; } if (!buildingLayoutReady) { void loadBuildingLayout(); return; } Array.from(pendingLayoutPositions.current).forEach(([nodeId, position]) => saveBuildingPosition(nodeId, position)); }}>Yeniden dene</Button>}
                      <Button size="sm" variant="outline" className="ml-auto h-7 gap-1.5 px-2 text-[11px]" onClick={() => void resetBuildingLayout()} disabled={!editingTopology || !buildingLayoutReady || !canEditBuildingLayout || layoutStatus === 'saving' || layoutResetting || loading} title={!editingTopology ? 'Yerleşimi sıfırlamak için Düzenleme moduna geçin.' : 'Sistem Odası merkezli ilk düzene dön ve kaydet'}><RotateCcw className={cn('h-3.5 w-3.5', layoutResetting && 'animate-spin')} />Yerleşimi sıfırla</Button>
                    </div>
                  </div>}
                  {activeBuildingNode && <ConnectionSelectionHint onlyConnected={neighborhoodActive} name={activeBuildingNode.data.name} count={topologyEdges.filter(edge => edge.source === activeBuildingNode.id || edge.target === activeBuildingNode.id).length} onClear={() => { setSelectedBuildingNodeId(null); setSelectedNode(null); }} />}
                  </div>
                  </div>
                  {viewMode === 'building' && <div className={`${styles.mapLegend} flex flex-col items-end gap-2`}><NeighborhoodToggle active={neighborhoodActive} hasSelection={!!activeBuildingNode} disabled={loading || !navigationReady} depth={connectionDepth} hopDistances={buildingNeighborhood.distances} hiddenHopDistances={hiddenHopDistances} onHopToggle={toggleBuildingHopDistance} onHopReset={resetBuildingHopDistances} onDepthChange={changeBuildingConnectionDepth} onChange={toggleBuildingNeighborhood} /><Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="gap-2 bg-card shadow-sm" aria-label="Bağlantı türü filtrelerini aç"><Layers className="h-3.5 w-3.5 text-primary" />Bağlantı türleri<span className="text-[11px] tabular-nums text-muted-foreground">{topologyEdges.length}/{generatedTopologyEdges.length}</span></Button></PopoverTrigger><PopoverContent side="top" align="end" className="w-[540px] overflow-hidden p-0"><p className="border-b px-4 py-3 text-xs text-muted-foreground">Çakışan etiketler ve %60 altındaki etiketler gizlenir. Bağlantı bilgileri çizginin üzerine gelince gösterilir.</p><ConnectionTypeLegend labelsVisible={buildingLabelsVisible} onLabelsChange={setBuildingLabelsVisible} label="Binalar arası bağlantı türü filtreleri" options={buildingConnectionTypeOptions} hidden={hiddenBuildingConnectionTypes} visibleCount={topologyEdges.length} totalCount={generatedTopologyEdges.length} onToggle={value => setHiddenBuildingConnectionTypes(previous => toggleConnectionType(previous, value))} onReset={() => setHiddenBuildingConnectionTypes(new Set())} /></PopoverContent></Popover></div>}
                  <ReactFlow style={{ width: '100%', height: '100%' }}
                    nodes={menuNodes.map(node => ({ ...node, ...measuredNodeDimensions.current[node.id], connectable: canConnectBuildings && node.connectable !== false }))}
                    edges={menuEdges.map(edge => ({ ...edge, selected: selectedNode?.id === edge.id, style: { ...edge.style, strokeWidth: selectedNode?.id === edge.id ? 4 : edge.style?.strokeWidth } }))}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    onNodesChange={handleNodesChange}
                    onNodeDragStop={(_, node) => { if (canMoveNodes && viewMode === 'building' && node.type === 'building') saveBuildingPosition(node.id, node.position); }}
                    onNodeClick={(_, node) => { buildingNodeTooltip.close(); handleNodeClick(node); }}
                    onNodeMouseEnter={(event, node) => { if (!objectMenu.state && viewMode === 'building') { setHoveredBuildingConnectionId(null); setHoveredBuildingNodeId(node.id); buildingNodeTooltip.enter(event); } }}
                    onNodeMouseMove={(event, node) => { if (!objectMenu.state && viewMode === 'building' && !node.dragging && buildingNodeTooltip.show(event)) { setHoveredBuildingConnectionId(null); setHoveredBuildingNodeId(node.id); } }}
                    onNodeMouseLeave={buildingNodeTooltip.leave}
                    onNodeDragStart={() => { buildingNodeTooltip.close(); closeObjectMenu(); }}
                    onInit={() => setFlowReady(true)}
                    onPaneClick={() => { setSelectedBuildingNodeId(null); setSelectedNode(null); setIsSidebarOpen(false); }}
                    onNodeContextMenu={(event, node) => { const target = resolveMenuObject('node', node.id); if (target) openObjectMenu(target, event); }}
                    onEdgeContextMenu={(event, edge) => { const target = resolveMenuObject('edge', edge.id); if (target) openObjectMenu(target, event); }}
                    onKeyDownCapture={event => topologyMenuShortcut(event, resolveMenuObject, openObjectMenu)}
                    onMoveStart={event => { if (event) closeObjectMenu(); }}
                    onEdgeClick={handleEdgeClick}
                    nodesDraggable={canMoveNodes}
                    nodesConnectable={canConnectBuildings}
                    deleteKeyCode={null}
                    connectionMode={ConnectionMode.Loose}
                    onConnect={handleBuildingConnect}
                    isValidConnection={validBuildingConnection}
                    zoomOnScroll={!compactMap}
                    preventScrolling={!compactMap}
                    onMove={(_, viewport) => {
                      setViewportZoom(Math.round(viewport.zoom * 100));
                      if (viewMode === 'building') {
                        // Only update state when zoom crosses a threshold boundary
                        // to prevent onMove → setSemanticZoom → useMemo → setNodes → onMove loop
                        const z = viewport.zoom;
                        setSemanticZoom(prev => {
                          const prevBucket = prev <= 0.5 ? 0 : prev <= 0.8 ? 1 : prev <= 1.2 ? 2 : prev <= 1.5 ? 3 : 4;
                          const nextBucket = z <= 0.5 ? 0 : z <= 0.8 ? 1 : z <= 1.2 ? 2 : z <= 1.5 ? 3 : 4;
                          return prevBucket !== nextBucket ? z : prev;
                        });
                      }
                    }}
                    onMoveEnd={(_, viewport) => { if (viewMode === 'building' && navigationReady && buildingLayoutReady && !loading) captureViewport(viewport); }}
                    fitView={viewMode !== 'building'}
                    fitViewOptions={{ padding: .18, maxZoom: 1 }}
                    minZoom={.05}
                    maxZoom={2}
                    aria-label="Etkileşimli ağ topolojisi"
                    attributionPosition="bottom-left"
                    connectionLineType={ConnectionLineType.Straight}
                    connectionLineStyle={{
                      stroke: '#3b82f6',
                      strokeWidth: 2,
                      strokeDasharray: '5,5',
                    }}
                  >
                    <Background color="oklch(var(--border))" gap={24} size={1} />
                    <Panel position="bottom-left" className="!m-3">
                      <div className={styles.mapControls}>
                        <Button size="icon" variant="ghost" className="h-9 w-9 rounded-none" aria-label="Haritayı yakınlaştır" onClick={() => zoomIn({ duration: 0 })}><Plus className="h-4 w-4" /></Button>
                        <span className="min-w-11 text-center text-[11px] tabular-nums text-muted-foreground">{viewportZoom}%</span>
                        <Button size="icon" variant="ghost" className="h-9 w-9 rounded-none" aria-label="Haritayı uzaklaştır" onClick={() => zoomOut({ duration: 0 })}><Minus className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" className="h-9 gap-1.5 rounded-none border-l border-border text-xs" onClick={() => { releaseViewport(); setSelectedBuildingNodeId(null); setSearchFocusNodeId(null); fitOverview(); }}><Maximize2 className="h-3.5 w-3.5" />Ekrana sığdır</Button>
                      </div>
                    </Panel>

                    {showTopologyEmptyState && (
                      <Panel position="top-center">
                        <div className={styles.emptyState}>
                          <Server className="mb-3 h-8 w-8 text-muted-foreground" />
                          <h3 className="text-base font-semibold text-foreground">{hasFilters ? 'Filtrelere uygun cihaz bulunamadı' : 'Topolojide gösterilecek cihaz yok'}</h3>
                          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                            {hasFilters ? 'Aramayı değiştirin veya filtreleri temizleyerek yeniden deneyin.' : 'Cihazlar sayfasından envantere cihaz ekleyerek başlayın.'}
                          </p>
                          <Button variant="outline" size="sm" className="mt-4" onClick={() => hasFilters ? clearFilters() : router.push('/devices')}>
                            {hasFilters ? 'Filtreleri temizle' : 'Cihazlara git'}
                          </Button>
                        </div>
                      </Panel>
                    )}
                    
                  </ReactFlow>
                  {hoveredBuildingNode && <NodeTooltip id={buildingNodeTooltip.id} anchor={buildingNodeTooltip.anchor} container={buildingNodeTooltip.container} onMouseEnter={buildingNodeTooltip.keepOpen} onMouseLeave={buildingNodeTooltip.leaveTooltip} onFocusCapture={buildingNodeTooltip.focusTooltip} onBlurCapture={buildingNodeTooltip.blurTooltip} name={hoveredBuildingNode.data.name} summary={{ kind: 'building', deviceCount: hoveredBuildingNode.data.deviceCount, onShowDevices: () => { closeBuildingNodeTooltip(); handleNodeClick(hoveredBuildingNode); } }} status={<SemanticBadge tone={buildingNodeStatus(hoveredBuildingNode.data.status).tone}>{buildingNodeStatus(hoveredBuildingNode.data.status).label}</SemanticBadge>} connectionCount={availableSources.buildings ? buildingConnectionCounts.get(hoveredBuildingNode.id) || 0 : undefined} visibleConnectionCount={visibleBuildingConnectionCounts.get(hoveredBuildingNode.id) || 0} />}
                </div>

                {selectedNode && !isSidebarOpen && <Button className={styles.reopenDetails} variant="outline" size="sm" onClick={() => setIsSidebarOpen(true)}><Info className="mr-1.5 h-3.5 w-3.5" />Detayları göster</Button>}
                <div className={cn(styles.detailsContainer, (!selectedNode || !isSidebarOpen) && styles.detailsHidden)}>
                  <aside ref={detailsRef} tabIndex={-1} className={styles.details} aria-label="Seçim detayları" aria-hidden={!isSidebarOpen || !selectedNode}>
                    <div className={styles.detailsBar}><p className="text-xs font-semibold text-muted-foreground">Seçim detayları</p>{selectedDevice && <TopologyMenuButton name="Seçili cihaz" onOpen={event => openObjectMenu({ kind: 'device', id: selectedDevice.id }, event)} />}{selectedConnection && <TopologyMenuButton name="Seçili bağlantı" onOpen={event => openObjectMenu({ kind: 'device-connection', id: selectedConnection.id }, event)} />}<Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Detay panelini kapat" onClick={() => { setIsSidebarOpen(false); canvasRef.current?.focus({ preventScroll: true }); }}><X className="h-4 w-4" /></Button></div>
                    {selectedNode ? (
                    <div className="flex-1 overflow-y-auto">
                      {selectedNode.data.isDeviceConnection ? (
                        selectedConnection ? <ConnectionInspector connection={selectedConnection} devices={devices} onSelectDevice={selectDevice} /> : <p className="p-4 text-sm text-muted-foreground">Seçili bağlantı artık listede bulunmuyor.</p>
                      ) : selectedNode.data.isBuildingConnection ? (
                        <div className="animate-in slide-in-from-right duration-300">
                          <div className="bg-primary/10 p-6 border-b border-primary/20">
                            <div className="flex items-center gap-3">
                              <div className="bg-primary rounded-xl p-2.5 shadow-lg shadow-primary/20">
                                <Zap className="h-6 w-6 text-primary-foreground" />
                              </div>
                              <div>
                                <h2 className="text-xl font-bold tracking-tight">Bina Bağlantısı</h2>
                                <Badge variant="secondary" className="mt-1">Bağlantı ayrıntıları</Badge>
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
                                  <Link2 className="h-4 w-4 shrink-0 text-primary" />
                                  <span className="text-xs font-bold truncate">
                                    {connectionStyles[selectedNode.data.buildingConnection?.connectionType]?.label || 'Diğer bağlantı'}
                                  </span>
                                </div>
                              </Card>
                              <Card className="p-3 bg-muted/30 border-primary/10">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Durum</p>
                                <ConnectionStatus status={selectedNode.data.buildingConnection?.status} />
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
                                <p className="text-lg font-bold">{selectedNode.data.buildingConnection?.distance != null ? `${selectedNode.data.buildingConnection.distance} km` : '-'}</p>
                              </Card>
                            </div>

                            {/* Actions */}
                            <div className="pt-4 border-t border-border flex justify-end gap-2">
                              {editingTopology && canEditBuildingLayout && <Button
                                size="sm"
                                variant="outline"
                                className="w-full gap-2"
                                onClick={() => {
                                  setEditingBuildingConnectionId(selectedNode.data.buildingConnection.id);
                                }}
                              >
                                <Settings2 className="h-4 w-4" />
                                Düzenle
                              </Button>}
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
                                <Image width={800} height={450} unoptimized
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
                              {(selectedNode.data.portDownCount || 0) > 0 && (
                                <div className="mt-3 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
                                  <span className="flex items-center gap-2 text-sm font-semibold">
                                    <AlertTriangle className="h-4 w-4" />
                                    Kapalı port
                                  </span>
                                  <Badge variant="destructive">{selectedNode.data.portDownCount}</Badge>
                                </div>
                              )}
                            </Card>
                            {selectedNode.data.isEmpty && (
                              <Card className="p-4 border-dashed border-primary/20 bg-primary/5">
                                <p className="text-sm text-center text-muted-foreground italic">Bu konuma henüz cihaz atanmamış.</p>
                              </Card>
                            )}
                          </div>
                        </div>
                      ) : (
                        selectedDevice ? <DeviceInspector device={selectedDevice} devices={devices} connections={connections}
                          downPorts={topologyStatusByDeviceId[selectedDevice.id]?.downPorts || []}
                          telemetryAvailable={availableSources.telemetry} connectionsAvailable={availableSources.connections}
                          servicesCount={availableSources.services ? services.filter(service => service.deviceId === selectedDevice.id).length : null}
                          onSelectConnection={selectConnection} onOpenInventory={() => router.push('/devices')} /> : <p className="p-4 text-sm text-muted-foreground">Seçili cihaz artık envanterde bulunmuyor.</p>
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
          </div>
        )}
        
        <Dialog open={!!exportPreview} onOpenChange={open => { if (!open) setExportPreview(null); }}>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle>Topoloji görseli hazır</DialogTitle><DialogDescription>Görünen harita PNG olarak hazırlandı. İndirmeden önce görünümü kontrol edebilirsiniz.</DialogDescription></DialogHeader>
            {exportPreview && <Image src={exportPreview} width={1440} height={900} unoptimized alt="Dışa aktarılacak ağ topolojisi" className="h-auto max-h-[55vh] w-full rounded-lg border border-border object-contain" />}
            <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setExportPreview(null)}>Kapat</Button><Button asChild className="gap-2"><a href={exportPreview || undefined} download={`infrascope-topology-${new Date().toISOString().slice(0,10)}.png`}><Download className="h-4 w-4" />PNG indir</a></Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Building Connection Modal */}
        {editingBuildingConnectionId && <BuildingConnectionEditor
          connectionId={editingBuildingConnectionId}
          onClose={() => setEditingBuildingConnectionId(null)}
          onChanged={connection => {
            setBuildingConnections(current => connection
              ? current.map(item => item.id === connection.id ? { ...item, ...connection, createdAt: item.createdAt } : item)
              : current.filter(item => item.id !== editingBuildingConnectionId));
            setSelectedNode(null);
            setIsSidebarOpen(false);
            void loadData(true);
          }}
        />}
        {showBuildingConnectionModal && (
          <BuildingConnectionModal
            buildings={buildings}
            connection={buildingConnectionToEdit}
            initialEndpoints={buildingConnectionEndpoints}
            onClose={() => {
              setShowBuildingConnectionModal(false);
              setBuildingConnectionToEdit(null);
              setBuildingConnectionEndpoints(null);
            }}
            onSuccess={() => {
              setShowBuildingConnectionModal(false);
              setBuildingConnectionToEdit(null);
              setBuildingConnectionEndpoints(null);
              loadData(true);
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
            onEdit={(conn: BuildingConnection) => {
              setShowManagementModal(false);
              setEditingBuildingConnectionId(conn.id);
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
          <BuildingDeviceWorkspace
            key={selectedBuildingForPopup.id}
            initialDeviceId={searchDeviceId}
            editing={editingTopology}
            onEditingChange={setEditingTopology}
            building={selectedBuildingForPopup}
            buildings={buildings}
            onClose={() => { setSelectedBuildingForPopup(null); setSearchDeviceId(null); }}
          />
        )}
      </div>
    </>
  );
}

// Building Connection Modal Component
interface BuildingConnectionModalProps {
  buildings: Building[];
  connection?: BuildingConnection | null;
  initialEndpoints?: BuildingEndpoints | null;
  onClose: () => void;
  onSuccess: () => void;
  existingConnections: BuildingConnection[];
}

const BuildingConnectionModal: React.FC<BuildingConnectionModalProps> = ({
  buildings,
  connection,
  initialEndpoints,
  onClose,
  onSuccess,
  existingConnections,
}) => {
  const [formData, setFormData] = useState({
    sourceBuildingId: initialEndpoints?.sourceBuildingId || '',
    destBuildingId: initialEndpoints?.destBuildingId || '',
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

  const duplicate = matchingBuildingConnection(existingConnections, formData, formData.connectionType, connection?.id);
  const invalidEndpoints = !formData.sourceBuildingId || !formData.destBuildingId || formData.sourceBuildingId === formData.destBuildingId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalidEndpoints || duplicate || loading) return;
    setError(null);
    setLoading(true);

    try {
      let response;
      if (connection?.id) {
        response = await apiPut(`/api/building-connections/${connection.id}`, {
          ...formData,
          updatedAt: connection.updatedAt,
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
        setError(uiError(response.error || `Bağlantı ${connection?.id ? 'güncellenemedi' : 'oluşturulamadı'}`));
      }
    } catch (err) {
      setError(uiError((err as Error & { response?: { data?: { error?: string }; status?: number } }).response?.data?.error || (err as Error & { response?: { data?: { error?: string }; status?: number } }).message || `Bağlantı ${connection?.id ? 'güncellenemedi' : 'oluşturulamadı'}`));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn(styles.modal, "max-w-3xl bg-card border-border shadow-2xl overflow-hidden flex flex-col p-0 z-[1011] max-h-[90vh]")}>
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
              <p className="text-sm font-medium">{uiError(error)}</p>
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
                onValueChange={(val) => setFormData({ ...formData, sourceBuildingId: val, destBuildingId: val === formData.destBuildingId ? '' : formData.destBuildingId })}
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
                    aria-pressed={formData.connectionType === type.value}
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
                Bağlantı hızı
              </Label>
              <Input
                id="bandwidth"
                placeholder="Örn: 10Gbps, 1Gbps"
                value={formData.bandwidth}
                onChange={(e) => setFormData({ ...formData, bandwidth: e.target.value })}
                className="bg-background"
                list="building-connection-speeds"
              />
              <datalist id="building-connection-speeds">
                {['100 Mbps', '1 Gbps', '2.5 Gbps', '10 Gbps', '25 Gbps', '40 Gbps', '100 Gbps'].map(speed => <option key={speed} value={speed} />)}
              </datalist>
              <p className="text-xs text-muted-foreground">Listeden seçin veya farklı bir hız yazın. Bilinmiyorsa boş bırakın.</p>
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

          {duplicate && <p role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Bu iki bina arasında seçilen türde bir bağlantı zaten var. Mevcut kaydı “Bağlantıları yönet” üzerinden düzenleyebilirsiniz.</p>}
          {existingConnections.length > 0 && !duplicate && (
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
            onClick={(e) => handleSubmit(e)}
            disabled={loading || invalidEndpoints || !!duplicate}
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
  connections: BuildingConnection[];
  onClose: () => void;
  onUpdate: () => void;
  onEdit: (connection: BuildingConnection) => void;
}

const BuildingConnectionsManagementModal: React.FC<BuildingConnectionsManagementModalProps> = ({
  connections,
  onClose,
  onUpdate,
  onEdit,
}) => {
  const [selectedConnection, setSelectedConnection] = useState<BuildingConnection | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [deleteError, setDeleteError] = useState('');

  const handleDelete = async (connectionId: string) => {
    const connection = connections.find(item => item.id === connectionId);
    if (!connection?.updatedAt || loading) return;
    setLoading(true);
    setDeleteError('');
    try {
      const response = await apiDelete(`/api/building-connections/${connectionId}?${new URLSearchParams({ updatedAt: new Date(connection.updatedAt).toISOString() })}`);
      if (response.success) {
        setDeleteConfirm(null);
        setSelectedConnection(null);
        onUpdate();
      } else setDeleteError(response.error || 'Bağlantı silinemedi.');
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Bağlantı silinemedi.');
    } finally {
      setLoading(false);
    }
  };

  const getConnectionTypeIcon = (type: string) => {
    return type?.includes('FIBER') ? '🔴' : '📡';
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn(styles.modal, "max-w-5xl bg-card border-border shadow-2xl overflow-hidden flex flex-col p-0 z-[1011] max-h-[90vh]")}>
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

        <div className={styles.managementBody}>
          {/* Main List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3">
            {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
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
                            {uiLabel(conn.status)}
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
                         aria-label="Ayarlar">
                          <Settings2 className="h-4 w-4" />
                        </Button>
                        {conn.recordingMethod === 'MANUAL' && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(conn.id); }}
                           aria-label="Kapat">
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
                      &ldquo;{selectedConnection.notes}&rdquo;
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

function TopologyStat({ icon, label, value, hint, warning = false }: { icon: React.ReactNode; label: string; value: number | string; hint: string; warning?: boolean }) {
  return <div className={styles.stat}>
    <div className="flex items-center justify-between gap-2"><p className="text-xs font-medium text-muted-foreground">{label}</p><span className={cn(styles.statIcon, warning && '!bg-amber-500/10 !text-amber-600 dark:!text-amber-300')}>{icon}</span></div>
    <p className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</p>
    <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
  </div>;
}

const NetworkTopologyPageWrapper = () => {
  return <NetworkTopologyPage />;
};

export { NetworkTopologyPageWrapper as NetworkTopologyContent };
