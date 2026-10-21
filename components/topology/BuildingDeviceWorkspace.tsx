'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, { Background, ConnectionMode, Handle, Panel, Position, ReactFlowProvider, useNodesInitialized, useNodesState, useReactFlow, useViewport, type NodeProps } from 'reactflow';
import { Building2, ArrowLeft, Network, Server, Plus, Minus, Maximize2, RefreshCw, RotateCcw, List, Link2, Layers, Info, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { notifyDeviceInventoryChanged } from '@/lib/device-inventory-events';
import { deviceFloor, UNASSIGNED_DEVICE_BUILDING, type BuildingDevice, type BuildingDeviceConnection } from '@/lib/topology/building-devices';
import { connectionState, deviceConnectionEdge } from '@/lib/topology/workspace';
import { buildingDeviceFocusIds, buildingDeviceViewport, defaultBuildingDevicePositions, mergeBuildingDevicePositions } from '@/lib/topology/building-device-layout';
import { DEFAULT_DEVICE_NAVIGATION, readDeviceNavigation, saveTopologyNavigation, validDeviceNavigation } from '@/lib/topology/navigation-state';
import { visibleDeviceLabelIds } from '@/lib/topology/device-labels';
import { routeBuildingDeviceConnections } from '@/lib/topology/device-routing';
import { CustomEdge } from './CustomEdge';
import { useTopologyViewport } from './useTopologyViewport';
import { useBuildingDeviceLayout } from './useBuildingDeviceLayout';
import { BuildingDeviceConnectionForm } from './BuildingDeviceConnectionForm';
import { DEVICE_LINK_TYPES, DEVICE_LINK_UNKNOWN_COLOR, deviceLinkGroup } from '@/lib/topology/device-link-options';
import { ConnectionTypeLegend, toggleConnectionType } from './ConnectionTypeLegend';
import { usePersistedConnectionTypeFilter } from './usePersistedConnectionTypeFilter';
import { useConnectionLabelVisibility } from './useConnectionLabelVisibility';
import { TopologySearch } from './TopologySearch';
import { NeighborhoodToggle } from './NeighborhoodToggle';
import { TopologyIconCount } from './TopologyIconCount';
import { HopDistanceBadge } from './HopDistanceBadge';
import { ConnectionSelectionHint } from './ConnectionSelectionHint';
import { TopologyInteractionMode } from './TopologyInteractionMode';
import { connectionInteractionEmphasis, connectionNeighborhood, filterNeighborhoodByDistance, directConnectionCounts, directlyConnectedNodeIds, nextHoveredConnection, nodeInteractionEmphasis, resolveHoveredConnection, type ConnectionEmphasis } from '@/lib/topology/connection-emphasis';
import { useConnectionTooltip } from './ConnectionTooltip';
import { TopologyObjectMenu, TopologyMenuButton, useTopologyObjectMenu, topologyMenuShortcut, type TopologyAction } from './TopologyObjectMenu';
import { NodeTooltip } from './NodeTooltip';
import emphasisStyles from './node-emphasis.module.css';
import styles from './BuildingDeviceWorkspace.module.css';

interface Building { id: string; name: string; city?: string }
interface WorkspaceData { devices: BuildingDevice[]; connections: BuildingDeviceConnection[]; canManage: boolean }
interface CandidateData { items: BuildingDevice[]; total: number; page: number; pageSize: number; canManage: boolean }
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init });
  const body = await response.json();
  if (!response.ok || !body.success) throw new Error(body.error || 'İşlem tamamlanamadı.');
  return body.data as T;
}
function DeviceIcon({ data, selected, isConnectable }: NodeProps<BuildingDevice & { nodeEmphasis?: ConnectionEmphasis; hoverActive?: boolean; tooltipId?: string; onOpenMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void; hopDistance?: number }>) {
  return <div className={`relative flex w-[140px] flex-col items-center text-center ${data.nodeEmphasis === 'muted' ? emphasisStyles.muted : ''}`} data-node-emphasis={data.nodeEmphasis || 'normal'} data-topology-hover-active={data.hoverActive || undefined} aria-label={`${data.name} · ${data.managementIp || 'IP belirtilmemiş'}`} aria-describedby={data.tooltipId}>
    <HopDistanceBadge distance={data.hopDistance} />
    <div className={`relative grid h-12 w-12 place-items-center rounded-xl border bg-card text-primary ${data.hoverActive && data.nodeEmphasis === 'highlighted' ? 'border-primary ring-2 ring-primary/50 ring-offset-2 ring-offset-background' : selected ? 'border-primary ring-2 ring-primary/20' : data.nodeEmphasis === 'highlighted' ? 'border-border ring-1 ring-primary/30' : 'border-border'}`}>
      <Handle type="target" position={Position.Top} isConnectable={isConnectable} aria-label={`${data.name} bağlantı noktası üst`} title={isConnectable ? "Bağlantı için diğer cihazın noktasına sürükleyin" : undefined} className={isConnectable ? 'h-3! w-3! border-2! border-card! bg-primary!' : 'h-2! w-2! border-0! bg-transparent! opacity-0'} />
      {data.type === 'SWITCH' || data.type === 'ROUTER' ? <Network size={26} /> : <Server size={26} />}
      <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} aria-label={`${data.name} bağlantı noktası alt`} title={isConnectable ? "Bağlantı için diğer cihazın noktasına sürükleyin" : undefined} className={isConnectable ? 'h-3! w-3! border-2! border-card! bg-primary!' : 'h-2! w-2! border-0! bg-transparent! opacity-0'} />
    </div>{data.onOpenMenu && <div className="absolute left-[calc(50%+2rem)] top-0"><TopologyMenuButton name={data.name} onOpen={data.onOpenMenu} /></div>}<strong className="mt-2 line-clamp-2 max-w-full rounded bg-background px-1 text-xs leading-4 wrap-anywhere">{data.name}</strong><span className="max-w-full truncate rounded bg-background px-1 text-[10px] text-muted-foreground">{data.managementIp || 'IP belirtilmemiş'}</span>
  </div>;
}
const nodeTypes = { buildingDevice: DeviceIcon };
const edgeTypes = { custom: CustomEdge };
const DEVICE_FILTER_TYPES = DEVICE_LINK_TYPES.map(type => type.value);

interface WorkspaceProps { building: Building; buildings: Building[]; onClose: () => void; initialDeviceId?: string | null; editing: boolean; onEditingChange: (editing: boolean) => void }
export function BuildingDeviceWorkspace(props: WorkspaceProps) {
  return <ReactFlowProvider key={props.building.id}><Workspace {...props} /></ReactFlowProvider>;
}
function Workspace({ building, buildings, onClose, initialDeviceId, editing, onEditingChange }: WorkspaceProps) {
  const virtual = building.id === UNASSIGNED_DEVICE_BUILDING;
  const objectMenu = useTopologyObjectMenu();
  const { open: openObjectMenu, close: closeObjectMenu } = objectMenu;
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [floorFilter, setFloorFilter] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [hiddenConnectionTypes, setHiddenConnectionTypes] = usePersistedConnectionTypeFilter(`building:${building.id}`, DEVICE_FILTER_TYPES);
  const [connectionLabelsVisible, setConnectionLabelsVisible] = useConnectionLabelVisibility(`building:${building.id}`);
  const [assigning, setAssigning] = useState(false);
  const [target, setTarget] = useState(virtual ? '' : building.id);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [scope, setScope] = useState('unassigned');
  const [page, setPage] = useState(1);
  const [candidates, setCandidates] = useState<CandidateData | null>(null);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateRevision, setCandidateRevision] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(initialDeviceId || null);
  const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
  const [hoveredConnectionId, setHoveredConnectionId] = useState<string | null>(null);
  const [hoveredDeviceId, setHoveredDeviceId] = useState<string | null>(null);
  const deviceNodeTooltip = useConnectionTooltip(open => { if (!open) setHoveredDeviceId(null); });
  const closeDeviceNodeTooltip = deviceNodeTooltip.close;
  useEffect(() => { if (objectMenu.state) { closeDeviceNodeTooltip(); setHoveredDeviceId(null); setHoveredConnectionId(null); } }, [objectMenu.state, closeDeviceNodeTooltip]);
  const handleConnectionHover = useCallback((id: string, active: boolean) => {
    if (active) { closeDeviceNodeTooltip(); setHoveredDeviceId(null); }
    setHoveredConnectionId(current => nextHoveredConnection(current, id, active));
  }, [closeDeviceNodeTooltip]);
  const [connecting, setConnecting] = useState<{ source: BuildingDevice; target: BuildingDevice; connectionId?: string } | null>(null);
  const [list, setList] = useState<'devices' | 'connections'>('devices');
  const [connectionScopeId, setConnectionScopeId] = useState<string | null>(null);
  const [connectionHistory, setConnectionHistory] = useState<string[]>([]);
  const clearConnectionScope = useCallback(() => { setConnectionScopeId(null); setConnectionHistory([]); }, []);
  const [panelOpen, setPanelOpen] = useState(false);
  const [navigationReady, setNavigationReady] = useState(false);
  const [onlyConnected, setOnlyConnected] = useState(false);
  const [connectionDepth, setConnectionDepth] = useState<1 | 2>(1);
  const [hiddenHopDistances, setHiddenHopDistances] = useState<Set<1 | 2>>(new Set());
  const focusRootId = data?.devices.find(device => device.id === (selectedDevice || connectionScopeId))?.id;
  const neighborhoodActive = onlyConnected && !!focusRootId;
  const { savedViewport, retainedViewport, restoreViewport, captureViewport, releaseViewport } = useTopologyViewport();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [overview, setOverview] = useState(false);
  const [viewRevision, setViewRevision] = useState(0);
  const { zoom, x: panX, y: panY } = useViewport();
  const panelId = React.useId();
  const panelRef = useRef<HTMLElement>(null);
  const panelContentRef = useRef<HTMLDivElement>(null);
  const devicesButtonRef = useRef<HTMLButtonElement>(null);
  const connectionsButtonRef = useRef<HTMLButtonElement>(null);
  const togglePanel = (next: typeof list) => { clearConnectionScope(); setList(next); setPanelOpen(open => !(open && list === next && !connectionScopeId)); };
  const closePanel = () => { setPanelOpen(false); (list === 'devices' ? devicesButtonRef : connectionsButtonRef).current?.focus({ preventScroll: true }); };
  useEffect(() => { if (panelOpen && !assigning) { panelRef.current?.focus({ preventScroll: true }); if (panelContentRef.current) panelContentRef.current.scrollTop = 0; } }, [panelOpen, list, assigning, connectionScopeId, connectionHistory.length]);
  const graphRef = useRef<HTMLDivElement>(null);
  const loadVersion = useRef(0);
  const { fitView, zoomIn, zoomOut, setCenter, setViewport, getNode, getNodes } = useReactFlow();
  const initialized = useNodesInitialized();
  const layout = useBuildingDeviceLayout(building.id);
  const fitNeighborhood = useCallback((ids?: ReadonlySet<string>) => {
    if (!graphRef.current) return;
    const shown = getNodes().filter(node => ids ? ids.has(node.id) : !node.hidden);
    const positions = Object.fromEntries(shown.map(node => [node.id, node.position]));
    void setViewport(buildingDeviceViewport(positions, shown.map(node => node.id), graphRef.current.clientWidth, graphRef.current.clientHeight, true), { duration: 0 });
  }, [getNodes, setViewport]);
  const fitWorkspace = useCallback(() => {
    if (!navigationReady || !layout.ready || (!initialized && data?.devices.length)) return;
    if (retainedViewport.current) { void setViewport(retainedViewport.current, { duration: 0 }); return; }
    if (onlyConnected && focusRootId) { fitNeighborhood(); return; }
    const node = selectedDevice ? getNode(selectedDevice) : undefined;
    const link = selectedConnection ? data?.connections.find(item => item.id === selectedConnection) : undefined;
    if (node) void setCenter(node.position.x + 70, node.position.y + 24, { zoom: 1.1, duration: 200 });
    else if (link) void fitView({ nodes: [{ id: link.sourceDeviceId }, { id: link.targetDeviceId }], padding: .3, maxZoom: 1, duration: 0 });
    else if (graphRef.current) {
      const positions = Object.fromEntries(getNodes().map(item => [item.id, item.position]));
      const focus = buildingDeviceFocusIds(data?.devices.map(item => item.id) || [], data?.connections || []);
      void setViewport(buildingDeviceViewport(positions, focus, graphRef.current.clientWidth, graphRef.current.clientHeight, overview));
    }
  }, [navigationReady, layout.ready, initialized, retainedViewport, onlyConnected, focusRootId, fitNeighborhood, selectedDevice, selectedConnection, data, overview, getNode, getNodes, setCenter, setViewport, fitView]);
  const canMoveNodes = editing && layout.ready && layout.canEdit && !loading && !busy && !layout.resetting;
  const canConnectDevices = canMoveNodes && !!data?.canManage && !connecting;
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true); setError('');
    try { const next = await request<WorkspaceData>(`/api/network/building-devices?buildingId=${encodeURIComponent(building.id)}`); if (version === loadVersion.current) setData(next); }
    catch (err) { if (version === loadVersion.current) setError(err instanceof Error ? err.message : 'Bina yüklenemedi.'); }
    finally { if (version === loadVersion.current) setLoading(false); }
  }, [building.id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!assigning || !target) return;
    const controller = new AbortController();
    setCandidateLoading(true); setCandidates(null);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ buildingId: target, mode: 'candidates', search: candidateSearch, scope, page: String(page) });
      request<CandidateData>(`/api/network/building-devices?${params}`, { signal: controller.signal }).then(next => { if (!controller.signal.aborted) setCandidates(next); }).catch(err => { if (!controller.signal.aborted) setError(err.message); }).finally(() => { if (!controller.signal.aborted) setCandidateLoading(false); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [assigning, target, candidateSearch, scope, page, candidateRevision]);
  const visible = useMemo(() => (data?.devices || []).filter(device => !floorFilter || (floorFilter === '__none' ? !deviceFloor(device) : deviceFloor(device)?.id === floorFilter)), [data, floorFilter]);
  const floorOptions = useMemo(() => [...new Map((data?.devices || []).flatMap(device => deviceFloor(device) ? [[deviceFloor(device)!.id, deviceFloor(device)!] as const] : [])).values()].sort((a,b)=>a.floorNumber-b.floorNumber), [data]);
  useEffect(() => {
    if (navigationReady || loading || !data) return;
    const deviceIds = new Set(data.devices.map(device => device.id));
    const previous = readDeviceNavigation(building.id);
    const saved = initialDeviceId ? { ...DEFAULT_DEVICE_NAVIGATION, selectedDevice: initialDeviceId, connectionDepth: previous.connectionDepth, hiddenHopDistances: previous.hiddenHopDistances } : previous;
    const restored = validDeviceNavigation(saved, deviceIds, new Set(data.connections.map(link => link.id)));
    setSelectedDevice(restored.selectedDevice); setSelectedConnection(restored.selectedConnection);
    setConnectionScopeId(restored.connectionScopeId); setConnectionHistory(restored.connectionHistory);
    setList(restored.list); setPanelOpen(restored.panelOpen); setOverview(restored.overview); setOnlyConnected(!!restored.onlyConnected); setConnectionDepth(restored.connectionDepth || 1); setHiddenHopDistances(new Set(restored.hiddenHopDistances || []));
    restoreViewport(restored.viewport);
    setNavigationReady(true);
  }, [navigationReady, loading, data, initialDeviceId, building.id, restoreViewport]);
  useEffect(() => {
    if (!navigationReady || loading || !data) return;
    saveTopologyNavigation(`building:${building.id}`, validDeviceNavigation({
      version: 1, selectedDevice, selectedConnection, connectionScopeId, connectionHistory, panelOpen, list, overview, viewport: savedViewport, onlyConnected, connectionDepth, hiddenHopDistances: [...hiddenHopDistances],
    }, new Set(data.devices.map(device => device.id)), new Set(data.connections.map(link => link.id))));
  }, [navigationReady, loading, data, building.id, selectedDevice, selectedConnection, connectionScopeId, connectionHistory, panelOpen, list, overview, savedViewport, onlyConnected, connectionDepth, hiddenHopDistances]);
  const searchItems = useMemo(() => visible.map(device => ({ id: device.id, kind: 'device' as const, name: device.name, description: [device.managementIp, deviceFloor(device)?.name].filter(Boolean).join(' · ') || undefined })), [visible]);
  const availableLinks = useMemo(() => { const ids = new Set(visible.map(d => d.id)); return (data?.connections || []).filter(link => ids.has(link.sourceDeviceId) && ids.has(link.targetDeviceId)); }, [data, visible]);
  const links = useMemo(() => availableLinks.filter(link => !hiddenConnectionTypes.has(deviceLinkGroup(link.type))), [availableLinks, hiddenConnectionTypes]);
  const neighborhood = useMemo(() => connectionNeighborhood(links.map(link => ({ source: link.sourceDeviceId, target: link.targetDeviceId, link })), focusRootId, connectionDepth), [links, focusRootId, connectionDepth]);
  const filteredNeighborhood = useMemo(() => connectionDepth === 2 ? filterNeighborhoodByDistance(neighborhood, hiddenHopDistances) : neighborhood, [neighborhood, connectionDepth, hiddenHopDistances]);
  const neighborhoodIds = filteredNeighborhood.nodeIds;
  const renderedLinks = useMemo(() => neighborhoodActive ? filteredNeighborhood.edges.map(edge => edge.link) : links, [links, neighborhoodActive, filteredNeighborhood]);
  useEffect(() => { if (navigationReady && !loading && onlyConnected && !focusRootId) setOnlyConnected(false); }, [navigationReady, loading, onlyConnected, focusRootId]);
  const connectionScopeDevice = visible.find(device => device.id === connectionScopeId);
  // Match the tooltip's total, including links hidden by the map's type filters.
  const listedConnections = useMemo(() => connectionScopeDevice ? availableLinks.filter(link => link.sourceDeviceId === connectionScopeDevice.id || link.targetDeviceId === connectionScopeDevice.id) : links, [availableLinks, links, connectionScopeDevice]);
  useEffect(() => {
    if (!navigationReady || loading || !data) return;
    if (!connectionScopeDevice) clearConnectionScope();
    else setConnectionHistory(history => history.filter(id => visible.some(device => device.id === id)));
    if (selectedDevice && !visible.some(device => device.id === selectedDevice)) setSelectedDevice(null);
    if (selectedConnection && !data.connections.some(link => link.id === selectedConnection)) setSelectedConnection(null);
  }, [navigationReady, loading, data, connectionScopeDevice, visible, clearConnectionScope, selectedDevice, selectedConnection]);
  const previousConnectionDeviceId = connectionHistory[connectionHistory.length - 1];
  const connectionTypeOptions = useMemo(() => DEVICE_LINK_TYPES.map(type => ({ ...type, count: availableLinks.filter(link => deviceLinkGroup(link.type) === type.value).length })), [availableLinks]);
  // Compute defaults from the whole building so filtering cannot rearrange devices.
  const defaultPositions = useMemo(() => defaultBuildingDevicePositions((data?.devices || []).map(d => d.id), data?.connections || []), [data]);
  const devicePositions = useMemo(() => mergeBuildingDevicePositions(defaultPositions, layout.positions), [defaultPositions, layout.positions]);
  const generatedNodes = useMemo(() => {
    return visible.map(device => ({ id: device.id, type: 'buildingDevice', position: devicePositions[device.id], data: device, ariaLabel: device.name }));
  }, [visible, devicePositions]);
  const [nodes, setNodes, onNodesChange] = useNodesState<BuildingDevice>([]);
  useEffect(() => { setNodes(generatedNodes); }, [generatedNodes, setNodes]);
  const shownDeviceIconIds = useMemo(() => new Set(nodes.filter(node => !neighborhoodActive || neighborhoodIds.has(node.id)).map(node => node.id)), [nodes, neighborhoodActive, neighborhoodIds]);
  const shownDeviceIconCount = shownDeviceIconIds.size;
  const hiddenDeviceIcons = useMemo(() => (data?.devices || []).filter(device => !shownDeviceIconIds.has(device.id)).map(device => ({ id: device.id, name: device.name, description: device.managementIp || undefined })), [data, shownDeviceIconIds]);
  const visibleIds = visible.map(device => device.id).join(',');
  useEffect(() => { if (initialized && layout.ready && !assigning) { const timer = setTimeout(fitWorkspace, 100); return () => clearTimeout(timer); } }, [initialized, visibleIds, layout.ready, layout.resetVersion, viewRevision, assigning, fitWorkspace, data]);
  useEffect(() => {
    if (!graphRef.current || assigning) return;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(fitWorkspace, 100); });
    observer.observe(graphRef.current);
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, [fitWorkspace, assigning]);
  const toggleNeighborhood = (active: boolean) => {
    closeDeviceNodeTooltip(); setHoveredConnectionId(null); setOnlyConnected(active);
    if (active) { releaseViewport(); setViewRevision(value => value + 1); }
    else if (graphRef.current) {
      const positions = Object.fromEntries(getNodes().map(node => [node.id, node.position]));
      const focusIds = buildingDeviceFocusIds(visible.map(device => device.id), data?.connections || []);
      const viewport = buildingDeviceViewport(positions, focusIds, graphRef.current.clientWidth, graphRef.current.clientHeight, true);
      setOverview(true); restoreViewport(viewport); void setViewport(viewport, { duration: 0 });
    }
  };
  const changeConnectionDepth = (depth: 1 | 2) => {
    closeDeviceNodeTooltip(); setHoveredConnectionId(null); setConnectionDepth(depth);
    if (neighborhoodActive) { releaseViewport(); setViewRevision(value => value + 1); }
  };
  const toggleHopDistance = (distance: 1 | 2) => {
    closeDeviceNodeTooltip(); setHoveredConnectionId(null);
    setHiddenHopDistances(previous => { const next = new Set(previous); if (next.has(distance)) next.delete(distance); else next.add(distance); return next; });
    if (neighborhoodActive) { releaseViewport(); setViewRevision(value => value + 1); }
  };
  const resetHopDistances = () => {
    closeDeviceNodeTooltip(); setHoveredConnectionId(null); setHiddenHopDistances(new Set());
    if (neighborhoodActive) { releaseViewport(); setViewRevision(value => value + 1); }
  };
  const resetMapView = () => {
    if (!navigationReady || !layout.ready || loading || !graphRef.current || (!initialized && visible.length)) return;
    if (neighborhoodActive) {
      closeDeviceNodeTooltip(); setHoveredConnectionId(null); releaseViewport();
      fitNeighborhood(neighborhoodIds);
      return;
    }
    const positions = Object.fromEntries(getNodes().map(node => [node.id, node.position]));
    const focusIds = buildingDeviceFocusIds(visible.map(device => device.id), data?.connections || []);
    const viewport = buildingDeviceViewport(positions, focusIds, graphRef.current.clientWidth, graphRef.current.clientHeight, false);
    closeDeviceNodeTooltip(); setHoveredConnectionId(null); setOverview(false);
    restoreViewport(viewport);
    void setViewport(viewport, { duration: 0 });
  };
  const currentDevice = data?.devices.find(d => d.id === selectedDevice);
  const hoveredDevice = visible.find(device => device.id === hoveredDeviceId);
  const emphasisDeviceId = hoveredDevice?.id || currentDevice?.id;
  useEffect(() => {
    if (!hoveredDevice) { closeDeviceNodeTooltip(); setHoveredDeviceId(null); }
  }, [hoveredDevice, closeDeviceNodeTooltip]);
  const connectedDeviceIds = useMemo(() => directlyConnectedNodeIds(links.map(link => ({ source: link.sourceDeviceId, target: link.targetDeviceId })), emphasisDeviceId), [links, emphasisDeviceId]);
  const currentLink = data?.connections.find(link => link.id === selectedConnection);
  const name = (id: string) => data?.devices.find(d => d.id === id)?.name || 'Bilinmeyen cihaz';
  const selectDevice = (id: string) => { releaseViewport(); clearConnectionScope(); setSelectedDevice(id); setSelectedConnection(null); const node = nodes.find(n => n.id === id); if (node) void setCenter(node.position.x + 70, node.position.y + 24, { zoom: 1.1, duration: 200 }); };
  const focusConnectionDevice = (id: string) => {
    releaseViewport();
    const previous = connectionScopeId || selectedDevice;
    if (previous && previous !== id) setConnectionHistory(history => [...history, previous]);
    closeDeviceNodeTooltip(); setHoveredConnectionId(null);
    setSelectedDevice(id); setSelectedConnection(null); setConnectionScopeId(id); setOverview(false);
    setList('connections'); setPanelOpen(true);
    setViewRevision(value => value + 1);
  };
  const goToConnectionStep = (index: number) => {
    const id = connectionHistory[index];
    if (!id) return;
    releaseViewport();
    setConnectionHistory(history => history.slice(0, index));
    closeDeviceNodeTooltip(); setHoveredConnectionId(null);
    setSelectedDevice(id); setSelectedConnection(null); setConnectionScopeId(id);
    setOverview(false); setList('connections'); setPanelOpen(true); setViewRevision(value => value + 1);
  };
  const goBackConnectionDevice = () => goToConnectionStep(connectionHistory.length - 1);
  const showDeviceConnections = (id: string) => {
    releaseViewport();
    setConnectionHistory([]);
    closeDeviceNodeTooltip(); setHoveredConnectionId(null);
    setSelectedDevice(id); setSelectedConnection(null); setConnectionScopeId(id);
    setList('connections'); setPanelOpen(true);
  };
  const selectConnection = useCallback((link: BuildingDeviceConnection) => {
    releaseViewport();
    setSelectedConnection(link.id); setSelectedDevice(null);
    setList('connections'); setPanelOpen(true);
    if (editing && data?.canManage && link.recordKind === 'device-link') {
      const source = data.devices.find(device => device.id === link.sourceDeviceId), target = data.devices.find(device => device.id === link.targetDeviceId);
      if (source && target) { setMessage(''); setConnecting({ source, target, connectionId: link.id }); }
    }
  }, [data, releaseViewport, editing]);
  // Use the full connection set so filters do not make other routes jump.
  const routing = useMemo(() => routeBuildingDeviceConnections(Object.fromEntries(nodes.map(node => [node.id, node.position])), availableLinks, !nodes.some(node => node.dragging)), [nodes, availableLinks]);
  const deviceConnectionCounts = useMemo(() => directConnectionCounts(availableLinks.map(link => ({ source: link.sourceDeviceId, target: link.targetDeviceId }))), [availableLinks]);
  const visibleDeviceConnectionCounts = useMemo(() => directConnectionCounts(renderedLinks.filter(link => routing.routes[link.id]).map(link => ({ source: link.sourceDeviceId, target: link.targetDeviceId }))), [renderedLinks, routing]);
  const hoveredConnection = useMemo(() => resolveHoveredConnection(renderedLinks.filter(link => routing.routes[link.id]).map(link => ({ id: link.id, source: link.sourceDeviceId, target: link.targetDeviceId })), hoveredConnectionId), [renderedLinks, routing, hoveredConnectionId]);
  const edges = useMemo(() => {
    const names = new Map(data?.devices.map(device => [device.id, device.name]));
    const positions = Object.fromEntries(nodes.map(node => [node.id, node.position]));
    const candidates = renderedLinks.flatMap(link => {
      const route = routing.routes[link.id];
      return route ? [{ id: link.id, ...route.label, width: 220, priority: link.id === hoveredConnection?.id ? 3 : link.id === selectedConnection ? 2 : link.sourceDeviceId === emphasisDeviceId || link.targetDeviceId === emphasisDeviceId ? 1 : 0 }] : [];
    });
    const labelIds = visibleDeviceLabelIds(positions, candidates);
    return renderedLinks.flatMap(link => {
      const route = routing.routes[link.id];
      if (!route) return [];
      const edge = deviceConnectionEdge(link);
      const appearance = DEVICE_LINK_TYPES.find(item => item.value === link.type);
      const type = appearance?.label;
      const sourceName = names.get(link.sourceDeviceId) || 'Bilinmeyen cihaz';
      const targetName = names.get(link.targetDeviceId) || 'Bilinmeyen cihaz';
      const labelX = route.label.x * zoom + panX, labelY = route.label.y * zoom + panY;
      const labelClipped = !!graphRef.current && (labelY < (graphRef.current.clientWidth < 768 ? 152 : 100) || labelY > graphRef.current.clientHeight - 64 || labelX < 120 || labelX > graphRef.current.clientWidth - 120);
      return [{ ...edge, selected: link.id === selectedConnection, ariaLabel: `${sourceName} – ${targetName}, ${edge.ariaLabel}`, data: {
        ...edge.data,
        connectionColor: appearance?.color || DEVICE_LINK_UNKNOWN_COLOR,
        connectionEmphasis: connectionInteractionEmphasis({ id: link.id, source: link.sourceDeviceId, target: link.targetDeviceId }, emphasisDeviceId, hoveredConnection),
        hoverActive: !!hoveredConnection || !!hoveredDevice,
        onHoverChange: (active: boolean) => handleConnectionHover(link.id, active),
        showLabels: connectionLabelsVisible,
        compactLabel: true,
        deviceRoute: route,
        labelBlocked: !labelIds.has(link.id) || labelClipped,
        autoHideLabel: zoom < .6 || !labelIds.has(link.id),
        label: `${type || 'Tür belirtilmemiş'}${link.bandwidth ? ` · ${link.bandwidth}` : ''}${link.protocol ? ` · ${link.protocol}` : ''}`,
        connectionTooltip: {
          title: 'Bina içi cihaz bağlantısı',
          status: connectionState(link.status).label,
          source: { name: sourceName, port: link.sourcePortName }, target: { name: targetName, port: link.targetPortName },
          type, bandwidth: link.bandwidth,
          note: link.protocol ? `${link.protocol} · Otomatik keşif bağlantısı. Detaylar için bağlantıya tıklayın.` : data?.canManage && link.recordKind === 'device-link' ? 'Düzenlemek için bağlantıya tıklayın.' : 'Detaylar için bağlantıya tıklayın.',
        },
        onInspect: () => selectConnection(link),
        onOpenMenu: (event: React.MouseEvent<HTMLButtonElement>) => openObjectMenu({ kind: 'device-connection', id: link.id }, event),
      } }];
    });
  }, [renderedLinks, nodes, routing, zoom, panX, panY, selectedConnection, data, selectConnection, connectionLabelsVisible, emphasisDeviceId, hoveredConnection, hoveredDevice, handleConnectionHover, openObjectMenu]);
  const save = async (action: 'assign' | 'unassign', ids: string[]) => {
    setBusy(true); setError(''); setMessage('');
    try {
      await request('/api/network/building-devices', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, buildingId: action === 'assign' ? target : building.id, deviceIds: ids, allowReassign: scope === 'all' }) });
      releaseViewport(); setSelected(new Set()); setAssigning(false); setSelectedDevice(null); setSelectedConnection(null);
      setCandidateRevision(value => value + 1);
      notifyDeviceInventoryChanged({ action: 'update', source: 'building-assignment' });
      await load(); setMessage(action === 'assign' ? `${ids.length} cihaz binaya atandı.` : 'Cihazın bina ataması kaldırıldı.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Cihaz ataması kaydedilemedi.'); }
    finally { setBusy(false); }
  };
  const connectionCreated = async (connection: BuildingDeviceConnection) => {
    releaseViewport();
    const editing = !!connecting?.connectionId;
    clearConnectionScope();
    setConnecting(null); setSelectedDevice(null); setSelectedConnection(connection.id); setList('connections'); setPanelOpen(true);
    await load();
    setMessage(editing ? 'Cihaz bağlantısı güncellendi.' : 'Cihaz bağlantısı kaydedildi.');
    notifyDeviceInventoryChanged({ action: 'update', source: 'building-device-connection' });
  };
  const connectionDeleted = async () => {
    releaseViewport(); clearConnectionScope();
    setConnecting(null); setSelectedConnection(null); setSelectedDevice(null); setList('connections'); setPanelOpen(true);
    await load(); setMessage('Cihaz bağlantısı silindi.');
    notifyDeviceInventoryChanged({ action: 'update', source: 'building-device-connection' });
  };
  const menuTarget = !loading ? objectMenu.state?.target : undefined;
  const menuDevice = menuTarget?.kind === 'device' ? data?.devices.find(device => device.id === menuTarget.id) : undefined;
  const menuLink = menuTarget?.kind === 'device-connection' ? data?.connections.find(link => link.id === menuTarget.id) : undefined;
  const menuActions: TopologyAction[] = [];
  let menuName = '';
  if (menuDevice) {
    const device = menuDevice; menuName = device.name;
    menuActions.push({ id: 'details', label: 'Ayrıntıları aç', run: () => { selectDevice(device.id); setList('devices'); setPanelOpen(true); } }, { id: 'connections', label: 'Bağlı cihazları göster', run: () => showDeviceConnections(device.id) });
    if (device.managementIp) menuActions.push({ id: 'copy', label: 'Yönetim IP’sini kopyala', keepFocus: true, run: () => objectMenu.copyAddress(device.managementIp!) });
  } else if (menuLink) {
    const link = menuLink; menuName = name(link.sourceDeviceId) + ' – ' + name(link.targetDeviceId);
    menuActions.push({ id: 'details', label: 'Ayrıntıları aç', run: () => { releaseViewport(); clearConnectionScope(); setSelectedConnection(link.id); setSelectedDevice(null); setList('connections'); setPanelOpen(true); } });
    for (const [side, id] of [['Kaynak', link.sourceDeviceId], ['Hedef', link.targetDeviceId]]) if (data?.devices.some(device => device.id === id)) menuActions.push({ id: side, label: side + ' cihazı göster', run: () => { selectDevice(id); setList('devices'); setPanelOpen(true); } });
    if (editing && data?.canManage && link.recordKind === 'device-link' && !busy && !layout.resetting) menuActions.push({ id: 'edit', label: 'Bağlantıyı düzenle', run: () => { if (editing && data?.canManage && !busy && !layout.resetting) selectConnection(link); } });
  }
  useEffect(() => { closeObjectMenu(); }, [loading, building.id, closeObjectMenu]);

  return <Dialog open onOpenChange={open => { if (!open && !busy && !layout.saving) onClose(); }}><DialogContent closeButtonText="Kapat" className={`${styles.dialog} flex! flex-col gap-0 overflow-hidden p-0`} style={{ width: 'calc(100vw - 2rem)', maxWidth: 1600, height: 'calc(100dvh - 2rem)' }} closeLabel="Bina görünümünü kapat" onEscapeKeyDown={event => { if (objectMenu.state) { event.preventDefault(); closeObjectMenu(); return; } if (filtersOpen || guideOpen) { event.preventDefault(); setFiltersOpen(false); setGuideOpen(false); return; } if (panelOpen && !assigning && !connecting) { event.preventDefault(); closePanel(); } }}>
    <DialogHeader className={styles.header}>
      <div className={styles.headerTitle}><DialogTitle className="flex items-center gap-2 text-base"><Building2 size={19} className="shrink-0 text-primary" />{building.name}</DialogTitle><DialogDescription className="sr-only">{virtual ? 'Henüz bir binaya veya kabinete atanmamış cihazlar.' : `${building.city || 'Bina'} · Cihaz envanteri ve bina içi bağlantılar`}</DialogDescription><p className={styles.counts} role="status">{loading ? 'Yükleniyor…' : data ? `${data.devices.length} cihaz · ${data.connections.length} bağlantı · ${data.devices.filter(d => d.status === 'ACTIVE').length} aktif` : 'Veriler alınamadı'}</p></div>
      {!assigning && <div className={styles.headerActions}>
        <Button ref={devicesButtonRef} size="sm" variant={panelOpen && list === 'devices' ? 'secondary' : 'outline'} aria-expanded={panelOpen && list === 'devices'} aria-controls={panelId} disabled={loading} onClick={() => togglePanel('devices')}><List size={15} />Cihazlar <span className="tabular-nums text-muted-foreground">{data ? visible.length : '—'}</span></Button>
        <Button ref={connectionsButtonRef} size="sm" variant={panelOpen && list === 'connections' ? 'secondary' : 'outline'} aria-expanded={panelOpen && list === 'connections'} aria-controls={panelId} disabled={loading} onClick={() => togglePanel('connections')}><Link2 size={15} />Bağlantılar <span className="tabular-nums text-muted-foreground">{data ? links.length : '—'}</span></Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 px-2 text-xs" disabled={loading || busy || layout.resetting} onClick={() => void load()} aria-label="Bina cihazlarını yenile" title="Bina cihazlarını yenile"><RefreshCw size={15} /><span>Yenile</span></Button>
        {data?.canManage && <Button size="sm" disabled={busy || layout.resetting} onClick={() => { setAssigning(true); setMessage(''); setError(''); }}><Plus size={15} />{virtual ? 'Binaya ata' : 'Cihaz ata'}</Button>}
      </div>}
    </DialogHeader>
    {error && <div role="alert" className={`${styles.notice} text-destructive`}>{error} <Button size="sm" variant="outline" onClick={() => { if (assigning) { setError(''); setCandidateRevision(v => v + 1); } else void load(); }}>Yeniden dene</Button></div>}
    {message && <p role="status" className={`${styles.notice} text-primary`}>{message}</p>}
    {layout.error && <div role="alert" className={`${styles.notice} text-destructive`}>{layout.error} <Button size="sm" variant="outline" disabled={layout.saving} onClick={layout.retry}>Yerleşimi yeniden dene</Button></div>}
    {assigning ? <>
      <div className={styles.toolbar}><Button size="sm" variant="ghost" disabled={busy} onClick={() => { setAssigning(false); setSelected(new Set()); setError(''); }}><ArrowLeft size={16} className="mr-1" />Cihaz görünümüne dön</Button>{virtual && <><Label htmlFor="assignment-building">Hedef bina</Label><select id="assignment-building" className="h-9 max-w-full rounded-md border bg-background px-2 text-sm" value={target} disabled={busy} onChange={e => { setTarget(e.target.value); setPage(1); setSelected(new Set()); }}><option value="">Bina seçin</option>{buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></>}</div>
      <div className={styles.assignment}>
        <p className="mb-3 text-xs text-muted-foreground">{buildings.find(b => b.id === target)?.name || 'Hedef bina seçin'}. Kabinete bağlı cihazların binası kabinet konumundan belirlenir.</p>
        <div className="flex flex-wrap gap-2"><Input aria-label="Atanacak cihazlarda ara" placeholder="Cihaz adı veya IP ile ara…" value={candidateSearch} disabled={busy} onChange={e => { setCandidateSearch(e.target.value); setPage(1); }} /><select aria-label="Atanacak cihaz kapsamı" className="h-10 rounded-md border bg-background px-2 text-sm" value={scope} disabled={busy} onChange={e => { setScope(e.target.value); setPage(1); setSelected(new Set()); }}><option value="unassigned">Yalnızca konumsuz cihazlar</option><option value="all">Diğer binalardaki cihazlar dahil</option></select></div>
        {!target ? <p className={styles.empty}>Cihazları listelemek için hedef bina seçin.</p> : candidateLoading ? <p role="status" className={styles.empty}>Cihazlar yükleniyor…</p> : candidates && !candidates.items.length ? <p className={styles.empty}>Atanabilecek cihaz bulunamadı.</p> : candidates?.items.map(device => <label key={device.id} className={styles.picker}><input type="checkbox" aria-label={`${device.name} seç`} checked={selected.has(device.id)} disabled={busy || (!selected.has(device.id) && selected.size >= 200)} onChange={e => { const next = new Set(selected); if (e.target.checked) next.add(device.id); else next.delete(device.id); setSelected(next); }} /><span className="min-w-0"><strong className="block wrap-break-word text-sm">{device.name}</strong><span className="block text-xs text-muted-foreground">{device.managementIp || 'IP belirtilmemiş'} · {device.building?.name || 'Konumsuz'}</span></span></label>)}
      </div><div className={styles.footer}><span className="text-xs text-muted-foreground">{selected.size} seçili · {candidates?.total ?? '—'} uygun cihaz</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1 || busy || candidateLoading} onClick={() => setPage(p => p - 1)}>Önceki</Button><Button size="sm" variant="outline" disabled={!candidates || page * 30 >= candidates.total || busy || candidateLoading} onClick={() => setPage(p => p + 1)}>Sonraki</Button><Button size="sm" disabled={!target || !selected.size || busy || candidateLoading} onClick={() => void save('assign', [...selected])}>{busy ? 'Kaydediliyor…' : 'Seçilenleri ata'}</Button></div></div>
    </> : <>
      <div className={styles.body}>
        <div ref={graphRef} className={styles.graph} role="region" aria-label="Bina içi cihaz topolojisi">
          <div className={styles.mapOverlays}>
          <div className={styles.mapToolbar}>
            <TopologyInteractionMode editing={editing} onChange={onEditingChange} canEdit={!!data?.canManage && layout.ready && layout.canEdit} disabled={loading || busy || layout.saving || !!connecting} label="Bina içi topoloji etkileşim modu" />
            <div className="flex min-w-0 flex-1 basis-60"><TopologySearch items={searchItems} onSelect={item => { setList('devices'); selectDevice(item.id); }} label="Binadaki cihazlarda ara" placeholder="Cihaz adı veya IP ara ve odaklan…" emptyMessage="Eşleşen cihaz bulunamadı." disabled={loading} /></div>
            {!!floorOptions.length && <select aria-label="Kat kapsamı" className="h-8 max-w-full rounded-md border bg-background px-2 text-xs" value={floorFilter} disabled={loading} onChange={event => { releaseViewport(); setFloorFilter(event.target.value); setSelectedDevice(null); setSelectedConnection(null); clearConnectionScope(); }}><option value="">Tüm katlar</option>{floorOptions.map(floor => <option key={floor.id} value={floor.id}>{floor.name}</option>)}<option value="__none">Kat bilgisi belirtilmemiş</option></select>}
            <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5 px-2 text-xs" disabled={loading || !navigationReady || !layout.ready || (!initialized && !!visible.length)} title="İlk otomatik yakınlaştırma ve kaydırma görünümüne dön ve kaydet" onClick={resetMapView}><RotateCcw size={14} aria-hidden="true" />Görünümü sıfırla</Button>
            {editing && data?.canManage && <Button size="sm" variant="ghost" className="h-8 shrink-0 gap-1.5 px-2 text-xs" disabled={!canMoveNodes || !data.devices.length} aria-label="Yerleşimi sıfırla" title="Bu binadaki tüm cihazları ilk otomatik düzene döndür ve kaydet" onClick={() => { if (!canMoveNodes) return; releaseViewport(); setMessage(''); setSelectedDevice(null); setSelectedConnection(null); setOverview(false); void layout.reset(); }}><RotateCcw size={15} /><span>Yerleşimi sıfırla</span></Button>}
            <Popover modal open={guideOpen} onOpenChange={setGuideOpen}><PopoverTrigger asChild><Button size="sm" variant="ghost" className="h-8 shrink-0 gap-1.5 px-2 text-xs" aria-label="Bina harita rehberi" title="Bina harita rehberi"><Info size={15} /><span>Harita rehberi</span></Button></PopoverTrigger><PopoverContent align="end" aria-label="Cihaz haritası rehberi" onEscapeKeyDown={event => { event.preventDefault(); event.stopPropagation(); setGuideOpen(false); }} className="w-72 space-y-3 text-xs"><p className="text-sm font-semibold">Cihaz haritasını keşfedin</p><p>Boş alanı sürükleyerek haritada gezinin. Aramadan bir cihaz seçerek ikona odaklanın.</p><p>Bağlantılı cihazlar gruplar halinde yerleşir. Harita okunabilir ölçekte açılır; tüm cihazları görmek için sol alttaki ekrana sığdırma düğmesini kullanın.</p><p>Görünümü sıfırla, ilk otomatik yakınlaştırma ve kaydırma konumuna döner; bu görünüm kaydedilir. Seçili cihaz ve gezinme yolu korunur.</p><p>Çakışan bağlantı etiketleri gizlenir; bilgileri çizginin üzerine gelerek inceleyin.</p><p>Cihazlar ve Bağlantılar düğmeleri liste panelini açar. Seçili cihazın bilgilerini Ayrıntılar düğmesinden inceleyin.</p><p className="text-muted-foreground">İkon taşıma, bağlantı noktalarından yeni bağlantı oluşturma ve yerleşimi sıfırlama yalnızca Düzenleme modunda açılır. Yerleşim otomatik kaydedilir.</p></PopoverContent></Popover>
          </div>
          <div className={styles.mapFeedback}>
            {floorFilter && <p role="status" className={styles.mapNotice}>{visible.length} / {data?.devices.length || 0} cihaz gösteriliyor. Katlar arası bağlantıları görmek için “Tüm katlar” seçin.</p>}
            {!!routing.blockedIds.filter(id => links.some(link => link.id === id)).length && <p role="status" className={styles.mapNotice}>Bazı bağlantılar için güvenli çizgi rotası bulunamadı. Düzenleme modunda ikonlar arasında boşluk bırakın; bağlantı bilgileri listede korunur.</p>}
            {!overview && visible.length > 20 && !currentDevice && !selectedConnection && <p className={styles.mapNotice}>Okunabilir görünüm · Diğer cihazlar için haritayı sürükleyin veya ekrana sığdırın.</p>}
            <p role="status" aria-live="polite" className={!editing && layout.ready && !layout.saving && !layout.error && !layout.resetSaved ? 'sr-only' : styles.mapNotice}>{layout.resetting ? 'Cihaz yerleşimi sıfırlanıyor…' : layout.saving ? 'Cihaz yerleşimi kaydediliyor…' : layout.error ? 'Yerleşim işlemi tamamlanamadı.' : !layout.ready ? 'Cihaz yerleşimi yükleniyor…' : layout.resetSaved ? 'Cihazlar otomatik düzene döndü ve yerleşim kaydedildi.' : layout.saved ? 'Cihaz yerleşimi kaydedildi.' : editing && layout.canEdit ? 'Düzenleme modu: İkonu sürükleyerek taşıyın; bağlantı noktalarından sürükleyerek cihazları bağlayın. Yerleşim otomatik kaydedilir.' : 'Görüntüleme modu: Cihazları ve bağlantıları inceleyin. Taşımak veya bağlantı oluşturmak için Düzenleme moduna geçin.'}</p>
            {currentDevice && !panelOpen && <div className={styles.selection}><ConnectionSelectionHint compact onlyConnected={neighborhoodActive} name={currentDevice.name} count={links.filter(link => link.sourceDeviceId === currentDevice.id || link.targetDeviceId === currentDevice.id).length} onClear={() => { setSelectedDevice(null); setSelectedConnection(null); }} /><Button size="sm" variant="ghost" className="h-7 shrink-0 gap-1 px-2 text-xs" onClick={() => { setList('devices'); setPanelOpen(true); }}><Info size={14} />Ayrıntılar</Button><TopologyMenuButton name="Seçili cihaz" onOpen={event => openObjectMenu({ kind: 'device', id: currentDevice.id }, event)} /></div>}
          </div>
          </div>
          <div className={`${styles.mapLegend} flex flex-col items-end gap-2`}><NeighborhoodToggle active={neighborhoodActive} hasSelection={!!focusRootId} disabled={loading || !navigationReady} depth={connectionDepth} hopDistances={neighborhood.distances} hiddenHopDistances={hiddenHopDistances} onHopToggle={toggleHopDistance} onHopReset={resetHopDistances} onDepthChange={changeConnectionDepth} onChange={toggleNeighborhood} /><div className="flex max-w-full flex-wrap items-center justify-end gap-2"><TopologyIconCount shown={shownDeviceIconCount} total={data?.devices.length || 0} hiddenIcons={hiddenDeviceIcons} loading={loading || !navigationReady} /><Popover modal open={filtersOpen} onOpenChange={setFiltersOpen}><PopoverTrigger asChild><Button size="sm" variant="outline" className="gap-2 bg-card shadow-xs" aria-label="Bina içi bağlantı türü filtrelerini aç"><Layers size={15} className="text-primary" />Bağlantı türleri<span className="text-[11px] tabular-nums text-muted-foreground">{renderedLinks.length}/{availableLinks.length}</span></Button></PopoverTrigger><PopoverContent side="top" align="end" aria-label="Bina içi bağlantı görünümü" onEscapeKeyDown={event => { event.preventDefault(); event.stopPropagation(); setFiltersOpen(false); }} className="w-[540px] overflow-hidden p-0"><p className="border-b px-4 py-3 text-xs text-muted-foreground">Çakışan etiketler ve %60 altındaki etiketler gizlenir. Bağlantı bilgileri çizginin üzerine gelince gösterilir.</p><ConnectionTypeLegend labelsVisible={connectionLabelsVisible} onLabelsChange={setConnectionLabelsVisible} label="Bina içi bağlantı türü filtreleri" options={connectionTypeOptions} hidden={hiddenConnectionTypes} visibleCount={renderedLinks.length} totalCount={availableLinks.length} onToggle={value => { setHiddenConnectionTypes(previous => toggleConnectionType(previous, value)); setSelectedConnection(null); }} onReset={() => setHiddenConnectionTypes(new Set())} /></PopoverContent></Popover></div></div>
        <ReactFlow nodes={nodes.map(node => ({ ...node, hidden: neighborhoodActive && !neighborhoodIds.has(node.id), selected: node.id === selectedDevice, data: { ...node.data, onOpenMenu: (event: React.MouseEvent<HTMLButtonElement>) => openObjectMenu({ kind: 'device', id: node.id }, event), hopDistance: neighborhoodActive && connectionDepth === 2 ? neighborhood.distances.get(node.id) : undefined, tooltipId: hoveredDeviceId === node.id && deviceNodeTooltip.anchor ? deviceNodeTooltip.id : undefined, hoverActive: !!hoveredConnection || !!hoveredDevice, nodeEmphasis: nodeInteractionEmphasis(node.id, emphasisDeviceId, connectedDeviceIds, hoveredConnection) } }))} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={changes => onNodesChange(changes.filter(change => change.type !== 'position' || canMoveNodes))} nodesDraggable={canMoveNodes} onNodeDragStop={(_, node) => { if (canMoveNodes) layout.move(node.id, node.position); }} nodesConnectable={canConnectDevices} deleteKeyCode={null} connectionMode={ConnectionMode.Loose} isValidConnection={connection => canConnectDevices && !!connection.source && !!connection.target && connection.source !== connection.target} onConnect={connection => { if (!canConnectDevices || !data) return; const source = data.devices.find(device => device.id === connection.source); const target = data.devices.find(device => device.id === connection.target); if (source && target && source.id !== target.id) { setMessage(''); setConnecting({ source, target }); } }} onNodeContextMenu={(event, node) => openObjectMenu({ kind: 'device', id: node.id }, event)} onEdgeContextMenu={(event, edge) => openObjectMenu({ kind: 'device-connection', id: edge.id }, event)} onKeyDownCapture={event => topologyMenuShortcut(event, (kind, id) => ({ kind: kind === 'node' ? 'device' : 'device-connection', id }), openObjectMenu)} onPaneClick={() => { closeObjectMenu(); setSelectedDevice(null); setSelectedConnection(null); }} onNodeClick={(_, node) => { releaseViewport(); deviceNodeTooltip.close(); clearConnectionScope(); setSelectedDevice(node.id); setSelectedConnection(null); }} onNodeMouseEnter={(event, node) => { if (objectMenu.state) return; setHoveredConnectionId(null); setHoveredDeviceId(node.id); deviceNodeTooltip.enter(event); }} onNodeMouseMove={(event, node) => { if (!objectMenu.state && !node.dragging && deviceNodeTooltip.show(event)) { setHoveredConnectionId(null); setHoveredDeviceId(node.id); } }} onNodeMouseLeave={deviceNodeTooltip.leave} onNodeDragStart={() => { deviceNodeTooltip.close(); closeObjectMenu(); }} onEdgeClick={(_, edge) => { const link = data?.connections.find(item => item.id === edge.id); if (link) selectConnection(link); }} onMoveStart={event => { closeDeviceNodeTooltip(); if (event) closeObjectMenu(); }} onMoveEnd={(_, viewport) => { closeDeviceNodeTooltip(); if (navigationReady && layout.ready && !loading && (initialized || !visible.length)) captureViewport(viewport); }} minZoom={.05} maxZoom={2} aria-label="Binadaki cihazlar ve bağlantıları"><Background gap={24} /><Panel position="bottom-left"><div className={styles.mapControls}><Button size="sm" variant="ghost" className="h-9 gap-1.5 rounded-none px-2 text-xs" aria-label="Bina haritasını yakınlaştır" onClick={() => void zoomIn()}><Plus size={14} /><span>Yakınlaştır</span></Button><Button size="sm" variant="ghost" className="h-9 gap-1.5 rounded-none px-2 text-xs" aria-label="Bina haritasını uzaklaştır" onClick={() => void zoomOut()}><Minus size={14} /><span>Uzaklaştır</span></Button><Button size="sm" variant="ghost" className="h-9 gap-1.5 rounded-none px-2 text-xs" aria-label="Bina haritasını ekrana sığdır" title="Tüm cihazları göster" onClick={() => { releaseViewport(); setSelectedDevice(null); setSelectedConnection(null); setOverview(true); setViewRevision(value => value + 1); }}><Maximize2 size={14} /><span>Ekrana sığdır</span></Button><Button size="sm" variant="ghost" className="h-9 gap-1.5 rounded-none px-2 text-xs" aria-label="Bina haritasını okunabilir ölçeğe getir" title="Bağlantılı cihazlara okunabilir ölçekte odaklan" onClick={() => { releaseViewport(); setSelectedDevice(null); setSelectedConnection(null); setOverview(false); setViewRevision(value => value + 1); }}>Okunabilir ölçek</Button><span aria-label="Bina haritası yakınlaştırma oranı" className="grid min-w-12 place-items-center border-l px-2 text-[11px] tabular-nums text-muted-foreground">%{Math.round(zoom * 100)}</span></div></Panel></ReactFlow>
        {hoveredDevice && <NodeTooltip id={deviceNodeTooltip.id} anchor={deviceNodeTooltip.anchor} container={deviceNodeTooltip.container} onMouseEnter={deviceNodeTooltip.keepOpen} onMouseLeave={deviceNodeTooltip.leaveTooltip} onFocusCapture={deviceNodeTooltip.focusTooltip} onBlurCapture={deviceNodeTooltip.blurTooltip} name={hoveredDevice.name} summary={{ kind: 'device', deviceId: hoveredDevice.id, ipAddress: hoveredDevice.managementIp, deviceType: hoveredDevice.type, onShowConnections: () => showDeviceConnections(hoveredDevice.id) }} status={<StatusBadge status={hoveredDevice.status} />} connectionCount={deviceConnectionCounts.get(hoveredDevice.id) || 0} visibleConnectionCount={visibleDeviceConnectionCounts.get(hoveredDevice.id) || 0} />}
        {!loading && data && !visible.length && <p className="pointer-events-none absolute inset-0 grid place-items-center px-5 text-center text-sm text-muted-foreground">{floorFilter ? 'Seçili kat kapsamında cihaz bulunmuyor. Tüm katlar seçeneğini deneyin.' : virtual ? 'Konumsuz cihaz bulunmuyor.' : 'Bu binaya henüz cihaz atanmamış. “Cihaz ata” ile başlayın.'}</p>}
        </div>
        {panelOpen && <aside ref={panelRef} id={panelId} className={styles.sidebar} tabIndex={-1} aria-label={connectionScopeDevice ? `${connectionScopeDevice.name}: doğrudan bağlantılar` : "Bina cihazları ve bağlantıları"}>
          <div className={styles.sidebarHeader}><h3 className="text-sm font-semibold">{connectionScopeDevice ? "Cihaz bağlantıları" : "Cihazlar ve bağlantılar"}</h3>{currentDevice && <TopologyMenuButton name="Seçili cihaz" onOpen={event => openObjectMenu({ kind: 'device', id: currentDevice.id }, event)} />}{currentLink && <TopologyMenuButton name="Seçili bağlantı" onOpen={event => openObjectMenu({ kind: 'device-connection', id: currentLink.id }, event)} />}<Button size="sm" variant="ghost" className="h-8 shrink-0 gap-1.5 px-2 text-xs" aria-label="Cihaz panelini kapat" onClick={closePanel}><X size={15} /><span>Kapat</span></Button></div>
          <div ref={panelContentRef} className={styles.sidebarContent}>
            <div className="mb-3 flex gap-2"><Button size="sm" variant={list === 'devices' ? 'secondary' : 'ghost'} onClick={() => { clearConnectionScope(); setList('devices'); }}>Cihazlar ({data ? visible.length : '—'})</Button><Button size="sm" variant={list === 'connections' ? 'secondary' : 'ghost'} onClick={() => setList('connections')}>Bağlantılar ({data ? listedConnections.length : '—'})</Button></div>
        {connectionScopeDevice && <div className={styles.detailsSection}>
          <nav aria-label="Cihaz gezinme yolu" className={styles.connectionTrail}>
            <ol>{[...connectionHistory, connectionScopeDevice.id].map((id, index) => <li key={`${index}-${id}`}>
              {index > 0 && <span aria-hidden="true" className="text-muted-foreground">›</span>}
              {index < connectionHistory.length ? <button type="button" className={styles.trailStep} aria-label={`${name(id)} cihazına dön (${index + 1}. adım)`} onClick={() => goToConnectionStep(index)}>{name(id)}</button> : <button type="button" aria-current="page" className={`${styles.trailStep} ${styles.trailCurrent}`} aria-label={`${name(id)} cihazına odaklan (geçerli adım)`} onClick={() => focusConnectionDevice(id)}>{name(id)}</button>}
            </li>)}</ol>
          </nav>
          {previousConnectionDeviceId && <Button size="sm" variant="ghost" className="h-7 max-w-full gap-1 px-1 text-xs" aria-label={`Önceki cihaza dön: ${name(previousConnectionDeviceId)}`} title={name(previousConnectionDeviceId)} onClick={goBackConnectionDevice}><ArrowLeft size={13} className="shrink-0" aria-hidden="true" /><span className="truncate">Geri · {name(previousConnectionDeviceId)}</span></Button>}
          <p className="font-semibold">{connectionScopeDevice.name}</p>
          <p role="status" className="text-muted-foreground">{listedConnections.length} doğrudan bağlantı</p>
          {listedConnections.some(link => hiddenConnectionTypes.has(deviceLinkGroup(link.type))) && <p className="text-muted-foreground">Haritada gizli bağlantılar da listelenir.</p>}
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => clearConnectionScope()}>Tüm bağlantılar</Button>
        </div>}
        {currentDevice && !connectionScopeDevice && <div className={styles.detailsSection}><p className="font-semibold">{currentDevice.name}</p><p className="font-mono text-muted-foreground">{currentDevice.managementIp || 'IP belirtilmemiş'}</p><StatusBadge status={currentDevice.status} /><p className="text-muted-foreground">{currentDevice.rack ? `${currentDevice.rack.name} · ${currentDevice.rack.room?.name || ''}` : virtual ? 'Bina atanmamış' : deviceFloor(currentDevice)?.name || 'Kat belirtilmemiş · Doğrudan bina ataması'}</p><Button size="sm" variant="outline" asChild><a href={`/devices/${currentDevice.id}`}>Cihaz detayını aç</a></Button>{!virtual && data?.canManage && <Button size="sm" variant="outline" disabled={busy || layout.resetting || !!currentDevice.rackId} onClick={() => void save('unassign', [currentDevice.id])}>Bina atamasını kaldır</Button>}{currentDevice.rackId && <p className="text-muted-foreground">Bina, kabinet yerleşiminden belirleniyor.</p>}</div>}
        {currentLink && <div className={styles.detailsSection}><p className="font-semibold">{name(currentLink.sourceDeviceId)} ↔ {name(currentLink.targetDeviceId)}</p><p>{currentLink.sourcePortName || 'Port belirtilmemiş'} ↔ {currentLink.targetPortName || 'Port belirtilmemiş'}</p><p>{connectionState(currentLink.status).label}</p>{currentLink.type && <p>{DEVICE_LINK_TYPES.find(type => type.value === currentLink.type)?.label || currentLink.type}{currentLink.bandwidth ? ` · ${currentLink.bandwidth}` : ''}</p>}{currentLink.recordingSource === 'DRAWIO' && <p className="text-muted-foreground">Kaynak: draw.io çizimi. Canlı bağlantı durumu doğrulanmadı; eksik portlar belirtilmemiş olarak korunur.</p>}{currentLink.protocol && <p className="text-muted-foreground">Otomatik keşif bağlantısı; port bilgileri NMS tarafından güncellenir.</p>}{currentLink.protocol && <p>{currentLink.protocol} · Son görülme: {new Date(currentLink.lastSeenAt!).toLocaleString('tr-TR')}</p>}</div>}
            {list === 'devices' && !loading && !visible.length && <p className={styles.empty}>Bu görünümde cihaz bulunmuyor.</p>}
        {list === 'devices' ? visible.map(device => <button type="button" key={device.id} className={styles.item} aria-pressed={device.id === selectedDevice} onClick={() => selectDevice(device.id)}><Server size={17} className="shrink-0 text-primary" /><span className="min-w-0"><strong>{device.name}</strong><small>{device.managementIp || 'IP belirtilmemiş'}{deviceFloor(device) ? ' · '+deviceFloor(device)!.name : ''}</small><StatusBadge status={device.status} /></span></button>) : listedConnections.length ? <ul aria-label={connectionScopeDevice ? 'Doğrudan bağlantılar' : 'Bina bağlantıları'}>{listedConnections.map(link => {
          const outgoing = link.sourceDeviceId === connectionScopeDevice?.id;
          const peerId = outgoing ? link.targetDeviceId : link.sourceDeviceId;
          const localPort = outgoing ? link.sourcePortName : link.targetPortName;
          const peerPort = outgoing ? link.targetPortName : link.sourcePortName;
          const deviceFocusButton = (id: string) => <button type="button" className={styles.deviceFocus} aria-label={`${name(id)} cihazına odaklan`} aria-pressed={id === selectedDevice} onClick={() => focusConnectionDevice(id)}>{name(id)}</button>;
          return <li key={link.id} className={styles.connectionItem} data-selected={link.id === selectedConnection || undefined}>
            <div className={styles.connectionNames}>{connectionScopeDevice ? deviceFocusButton(peerId) : <>{deviceFocusButton(link.sourceDeviceId)}<span aria-hidden="true">↔</span>{deviceFocusButton(link.targetDeviceId)}</>}</div>
            {connectionScopeDevice ? <><small>Bu cihaz · {connectionScopeDevice.name}: {localPort || 'Port belirtilmemiş'}</small><small>Bağlı cihaz · {name(peerId)}: {peerPort || 'Port belirtilmemiş'}</small></> : <small>{link.sourcePortName || 'Port belirtilmemiş'} ↔ {link.targetPortName || 'Port belirtilmemiş'}</small>}
            <small>{link.protocol || DEVICE_LINK_TYPES.find(type => type.value === link.type)?.label || 'Kayıtlı bağlantı'}{link.bandwidth ? ` · ${link.bandwidth}` : ''} · {connectionState(link.status).label}</small>
            <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 gap-1 px-1 text-xs" aria-label={`${name(link.sourceDeviceId)} – ${name(link.targetDeviceId)} bağlantısını incele`} onClick={() => { selectConnection(link); void fitView({ nodes: [{ id: link.sourceDeviceId }, { id: link.targetDeviceId }], padding: .3, maxZoom: 1 }); }}><Link2 size={13} aria-hidden="true" />Bağlantıyı incele</Button>
          </li>;
        })}</ul> : <p role="status" className={styles.empty}>{connectionScopeDevice ? `${connectionScopeDevice.name} cihazının bu bina görünümünde kayıtlı doğrudan bağlantısı yok.` : availableLinks.length ? 'Seçili türlere uygun bağlantı yok. Türleri yeniden açın veya “Tümünü göster” seçeneğini kullanın.' : data?.connections.length ? 'Cihaz aramasına uygun bağlantı yok.' : 'Bu binadaki cihazlar arasında kayıtlı bağlantı yok.'}</p>}
          </div>
        </aside>}
      </div>
    </>}
    <TopologyObjectMenu menu={objectMenu} name={menuName} actions={menuActions} />
    {connecting && <BuildingDeviceConnectionForm buildingId={building.id} source={connecting.source} target={connecting.target} connectionId={connecting.connectionId} onClose={() => setConnecting(null)} onCreated={connectionCreated} onDeleted={connectionDeleted} />}
  </DialogContent></Dialog>;
}
