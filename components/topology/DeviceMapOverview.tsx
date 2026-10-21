'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import ReactFlow, { Background, ConnectionMode, Panel, ReactFlowProvider, useNodesInitialized, useReactFlow, type Edge, type Node } from 'reactflow';
import { Cloud, Ellipsis, Eye, Focus, Link2, List, Maximize2, Minimize2, Minus, Plus, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { deviceNetworkEdges, deviceOverviewCenterId, deviceOverviewExtraEdges, deviceOverviewScope, deviceOverviewSummary, OVERVIEW_GROUP_SIZE } from '@/lib/topology/device-overview';
import { fullNameDeviceLayout, balancedDeviceViewport } from '@/lib/topology/device-overview-viewport';
import { directlyConnectedNodeIds } from '@/lib/topology/connection-emphasis';
import { connectionState } from '@/lib/topology/workspace';
import type { TopologySearchItem } from '@/lib/topology/search';
import { CustomEdge } from './CustomEdge';
import { DeviceOverviewGroup } from './DeviceOverviewGroup';
import { DeviceOverviewNode } from './DeviceOverviewNode';
import { DeviceOverviewCurve } from './DeviceOverviewCurve';
import { TopologySearch } from './TopologySearch';
import styles from './DeviceMapOverview.module.css';

interface Props {
  nodes: Node[]; edges: Edge[]; selectedId?: string; focusId: string | null; focusRevision: number;
  expanded: boolean; onExpand: () => void; onDetailed: () => void;
  onSelectConnection: (id: string) => void;
  onNodeClick: (node: Node) => void; onEdgeClick: (event: React.MouseEvent, edge: Edge) => void;
  onNodeMenu: (event: React.MouseEvent, node: Node) => void; onEdgeMenu: (event: React.MouseEvent, edge: Edge) => void;
  captureRef: MutableRefObject<HTMLDivElement | null>; connectionsAvailable: boolean; totalDevices: number; onClearSelection: () => void;
  searchItems: TopologySearchItem[]; onSearch: (item: TopologySearchItem) => void; filters: ReactNode; actions: ReactNode; returnGroupId: string | null;
  error?: string; onRetryGroups: () => void;
}
const nodeTypes = { device: DeviceOverviewNode, networkGroup: DeviceOverviewGroup };
const edgeTypes = { custom: CustomEdge, deviceOverviewCurve: DeviceOverviewCurve };
export function DeviceMapOverview(props: Props) { return <ReactFlowProvider><Overview {...props} /></ReactFlowProvider>; }

function Overview(props: Props) {
  const { setViewport, fitView, zoomIn, zoomOut } = useReactFlow();
  const initialized = useNodesInitialized();
  const [ready, setReady] = useState(false), [zoom, setZoom] = useState(100);
  const [canvasSize, setCanvasSize] = useState({ width: 1142, height: 620 });
  const [mode, setMode] = useState<'summary' | 'all'>('summary'), [location, setLocation] = useState('all');
  const [focusOnly, setFocusOnly] = useState(false), [lines, setLines] = useState(true), [listOpen, setListOpen] = useState(false), [optionsOpen, setOptionsOpen] = useState(false), [connectionsOpen, setConnectionsOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null), [hoverId, setHoverId] = useState<string | null>(null);
  const [showExtra, setShowExtra] = useState(false), [spotlightId, setSpotlightId] = useState<string | null>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const canvas = useRef<HTMLDivElement>(null), returned = useRef(false), restoredReturn = useRef(false), preferredGroup = useRef<string | null>(null);
  const dimensions = useRef<Record<string, { width: number; height: number }>>({});
  const measureName = useMemo(() => {
    const context = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    if (context) context.font = `600 13px ${getComputedStyle(document.body).fontFamily}`;
    const widths = new Map<string, number>();
    return (text: string) => {
      if (!widths.has(text)) widths.set(text, context ? context.measureText(text).width : text.length * 7.8);
      return widths.get(text)!;
    };
  }, []);
  const byId = useMemo(() => new Map(props.nodes.map(node => [node.id, node])), [props.nodes]);
  const selectedId = props.selectedId && byId.has(props.selectedId) ? props.selectedId : activeId;
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const selectedEdge = props.edges.find(edge => edge.id === props.selectedId);
  const locations = useMemo(() => [...new Map(props.nodes.filter(node => node.type === 'device').map(node => [node.data.buildingId || 'unassigned', node.data.buildingName || 'Konum atanmamış'])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'tr')), [props.nodes]);
  const effectiveLocation = location === 'all' || locations.some(([id]) => id === location) ? location : 'all';
  const graph = useMemo(() => {
    const endpoints = selectedEdge ? new Set([selectedEdge.source, selectedEdge.target]) : null;
    const scoped = endpoints ? { nodes: props.nodes.filter(node => endpoints.has(node.id)), edges: props.edges.filter(edge => endpoints.has(edge.source) && endpoints.has(edge.target)) } : deviceOverviewScope(props.nodes, props.edges, effectiveLocation, focusOnly && selected ? selected.id : null);
    const scope = !selectedEdge && mode === 'summary' && effectiveLocation === 'all' && !focusOnly ? deviceOverviewSummary(scoped.nodes, scoped.edges) : scoped;
    const displayed = scope.nodes.map(node => ({ ...node, data: { ...node.data, compactOverview: canvasSize.width < 900 || canvasSize.height < 500 } }));
    const edges = scope.edges;
    const layout = fullNameDeviceLayout(displayed, edges, canvasSize.width, canvasSize.height, measureName);
    const centerId = deviceOverviewCenterId(scope.nodes, scope.edges);
    const nodes = layout.nodes.map(node => ({ ...node, position: layout.positions[node.id], draggable: false, connectable: false, data: { ...node.data, overviewCenter: node.id === centerId, roundOverview: node.type === 'networkGroup' } }));
    return { nodes, edges: deviceNetworkEdges(nodes, edges), centerId };
  }, [props.nodes, props.edges, effectiveLocation, focusOnly, selected, selectedEdge, mode, canvasSize.width, canvasSize.height, measureName]);
  const hoveredEdge = graph.edges.find(edge => edge.id === hoverId), emphasizedEdge = hoveredEdge || selectedEdge;
  const extraEdges = useMemo(() => deviceOverviewExtraEdges(graph.nodes, graph.edges), [graph.nodes, graph.edges]);
  const adjacent = emphasizedEdge ? new Set([emphasizedEdge.source, emphasizedEdge.target]) : directlyConnectedNodeIds(graph.edges, selectedId);
  const emphasized = !!selected || !!emphasizedEdge;
  const fit = useCallback((whole = false) => {
    whole = whole || !!selectedEdge;
    const element = canvas.current;
    if (!element || !graph.nodes.length) return;
    const group = !whole && element.clientWidth < 700 && preferredGroup.current ? graph.nodes.find(node => node.id === preferredGroup.current) : undefined;
    if (group) {
      const scale = Math.min(1, (element.clientWidth - 40) / OVERVIEW_GROUP_SIZE, Math.max(60, element.clientHeight - 64) / OVERVIEW_GROUP_SIZE);
      void setViewport({ x: (element.clientWidth - OVERVIEW_GROUP_SIZE * scale) / 2 - group.position.x * scale, y: (element.clientHeight - 40 - OVERVIEW_GROUP_SIZE * scale) / 2 - group.position.y * scale, zoom: scale }, { duration: 0 });
      return;
    }
    const positions = Object.fromEntries(graph.nodes.map(node => [node.id, node.position]));
    void setViewport(balancedDeviceViewport(graph.nodes, positions, element.clientWidth, element.clientHeight), { duration: 0 });
  }, [graph.nodes, selectedEdge, setViewport]);
  const fitRef = useRef(fit); fitRef.current = fit;
  const layoutKey = `${canvasSize.width}:${canvasSize.height}:${effectiveLocation}:${mode}:${focusOnly ? selected?.id : ''}:${graph.nodes.map(node => node.id).join('|')}`;
  useEffect(() => {
    if (!ready || !initialized) return;
    fitRef.current();
    const observer = new ResizeObserver(() => {
      const element = canvas.current;
      if (element) setCanvasSize(previous => previous.width === element.clientWidth && previous.height === element.clientHeight ? previous : { width: element.clientWidth, height: element.clientHeight });
    });
    if (canvas.current) observer.observe(canvas.current);
    return () => observer.disconnect();
  }, [ready, initialized, layoutKey, mode, effectiveLocation, focusOnly]);
  useEffect(() => {
    if (!initialized || !spotlightId) return;
    const group = graph.nodes.find(node => node.id === spotlightId);
    if (!group) return;
    const ids = canvas.current && canvas.current.clientWidth < 700 ? [group.id] : graph.nodes.map(node => node.id);
    void fitView({ nodes: ids.map(id => ({ id })), minZoom: .1, maxZoom: 1, padding: .25, duration: 0 });
    setSpotlightId(null);
  }, [initialized, spotlightId, graph.nodes, fitView]);
  useEffect(() => {
    if (!props.returnGroupId || restoredReturn.current) return;
    const group = props.nodes.find(node => node.type === 'networkGroup' && node.data.group.id === props.returnGroupId);
    if (!group) return;
    restoredReturn.current = true; preferredGroup.current = group.id; setActiveId(group.data.group.sourceDeviceId); setFocusOnly(true); setSpotlightId(group.id);
  }, [props.returnGroupId, props.nodes]);
  useEffect(() => {
    if (!props.focusId || !byId.has(props.focusId)) return;
    preferredGroup.current = null;
    setLocation('all'); setActiveId(props.focusId); setFocusOnly(true);
  }, [props.focusId, props.focusRevision, byId]);
  useEffect(() => {
    if (!ready || !initialized || !props.focusId || !graph.nodes.some(node => node.id === props.focusId)) return;
    void fitView({ nodes: graph.nodes.map(node => ({ id: node.id })), minZoom: .3, maxZoom: 1, padding: .2, duration: 0 });
  }, [ready, initialized, props.focusId, props.focusRevision, graph.nodes, fitView]);
  useEffect(() => {
    if (!initialized || !selectedEdge) return;
    preferredGroup.current = null;
    void fitView({ nodes: [{ id: selectedEdge.source }, { id: selectedEdge.target }], minZoom: .1, maxZoom: 1, padding: .3, duration: 0 });
  }, [initialized, selectedEdge, fitView]);
  useEffect(() => {
    if (!props.returnGroupId || !initialized || returned.current) return;
    const timer = window.setTimeout(() => {
      const group = props.nodes.find(node => node.type === 'networkGroup' && node.data.group.id === props.returnGroupId);
      const button = [...(canvas.current?.querySelectorAll<HTMLButtonElement>('button[aria-label]') || [])].find(element => element.getAttribute('aria-label') === `${group?.data.group.name}: Grubu aç`);
      if (button) { button.focus({ preventScroll: true }); returned.current = true; }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [props.returnGroupId, initialized, props.nodes]);
  const clear = () => { preferredGroup.current = null; setScopeOpen(false); setActiveId(null); setHoverId(null); setFocusOnly(false); props.onClearSelection(); };
  const choose = (node: Node) => { setListOpen(false); setScopeOpen(false); if (node.type === 'device') { preferredGroup.current = null; setActiveId(node.id); setFocusOnly(true); } props.onNodeClick(node); };
  const directory = props.nodes.filter(node => node.type === 'device' && (effectiveLocation === 'all' || (node.data.buildingId || 'unassigned') === effectiveLocation)).sort((a, b) => String(a.data.name).localeCompare(String(b.data.name), 'tr'));
  const visibleCount = graph.nodes.filter(node => node.type === 'device').length;
  const foldedCount = props.totalDevices - props.nodes.filter(node => node.type === 'device').length;
  const physical = graph.edges.filter(edge => !edge.data?.isNetworkGroupRelation);
  const groups = props.nodes.filter(node => node.type === 'networkGroup');
  const renderNodes = graph.nodes.map(node => ({ ...node, ...dimensions.current[node.id], selected: node.id === selectedId,
    data: { ...node.data, labelZoom: zoom, muted: emphasized && !adjacent.has(node.id), connectionCount: props.edges.filter(edge => !edge.data?.isNetworkGroupRelation && (edge.source === node.id || edge.target === node.id)).length } }));
  const renderEdges = graph.edges.filter(edge => showExtra || !extraEdges.has(edge.id) || focusOnly || edge.id === props.selectedId || edge.source === selectedId || edge.target === selectedId).map(edge => {
    const related = emphasizedEdge ? edge.id === emphasizedEdge.id : edge.source === selectedId || edge.target === selectedId;
    const source = byId.get(edge.source), target = byId.get(edge.target), logical = !!edge.data?.isNetworkGroupRelation;
    return { ...edge, animated: false, selected: edge.id === props.selectedId, label: undefined, style: { ...edge.style, opacity: emphasized ? related ? 1 : .16 : logical ? .9 : .65 }, data: { ...edge.data,
      autoHideLabel: true, compactLabel: true, label: logical ? undefined : `${edge.data?.sourcePortName || 'Port belirtilmemiş'} ↔ ${edge.data?.targetPortName || 'Port belirtilmemiş'}`,
      connectionEmphasis: emphasized ? related ? 'highlighted' : 'muted' : 'normal', hoverActive: !!hoveredEdge,
      onHoverChange: (active: boolean) => setHoverId(current => active ? edge.id : current === edge.id ? null : current),
      connectionTooltip: logical ? undefined : { title: 'Fiziksel cihaz bağlantısı', source: { name: source?.data.name || edge.source, port: edge.data?.sourcePortName }, target: { name: target?.data.name || edge.target, port: edge.data?.targetPortName }, status: connectionState(edge.data?.status).label },
    } };
  });
  const scopeControls = <>
      <div className={styles.modes} role="group" aria-label="Cihaz haritasının kapsamı"><Button variant={mode === 'summary' && effectiveLocation === 'all' && !focusOnly ? 'secondary' : 'ghost'} aria-pressed={mode === 'summary' && effectiveLocation === 'all' && !focusOnly} onClick={() => { clear(); setLocation('all'); setMode('summary'); }}>Ağ özeti</Button><Button variant={mode === 'all' && effectiveLocation === 'all' && !focusOnly ? 'secondary' : 'ghost'} aria-pressed={mode === 'all' && effectiveLocation === 'all' && !focusOnly} onClick={() => { clear(); setLocation('all'); setMode('all'); }}>Tüm cihazlar</Button></div>
      <select className={styles.location} aria-label="Cihaz haritasında konum" value={effectiveLocation} onChange={event => { clear(); setLocation(event.target.value); }}><option value="all">Tüm konumlar</option>{locations.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
      {!!groups.length && <Popover open={groupsOpen} onOpenChange={setGroupsOpen}><PopoverTrigger asChild><Button variant="outline" className="gap-1.5"><Cloud size={14} />Ağ gruplarına odaklan · {groups.length}</Button></PopoverTrigger><PopoverContent className="w-[min(330px,calc(100vw-2rem))] p-2"><div className={styles.list}>{groups.map(node => <button key={node.id} type="button" onClick={() => { setGroupsOpen(false); setScopeOpen(false); clear(); preferredGroup.current = node.id; setLocation('all'); setMode('all'); setActiveId(node.data.group.sourceDeviceId); setFocusOnly(true); setSpotlightId(node.id); }}><strong>{node.data.group.name}</strong><small>{node.data.group.members.length} konum · Merkez: {node.data.group.sourceDevice.name}</small></button>)}</div></PopoverContent></Popover>}
      <Popover open={listOpen} onOpenChange={setListOpen}><PopoverTrigger asChild><Button variant="outline" className="gap-1.5"><List size={14} />Cihaz listesi · {directory.length}</Button></PopoverTrigger><PopoverContent align="start" className="w-[min(360px,calc(100vw-2rem))] p-2"><div className={styles.list} aria-label="Konumdaki cihazlar">{directory.map(node => <button type="button" key={node.id} aria-pressed={selectedId === node.id} onClick={() => choose(node)}><strong>{node.data.name}</strong><small>{node.data.ipAddress || 'IP belirtilmemiş'} · {node.data.buildingName || 'Konum atanmamış'}</small></button>)}{!directory.length && <p>Bu kapsamda cihaz bulunamadı.</p>}</div></PopoverContent></Popover>
      <Popover open={connectionsOpen} onOpenChange={setConnectionsOpen}><PopoverTrigger asChild><Button variant="outline" className="gap-1.5"><Link2 size={14} />Bağlantılar · {physical.length}</Button></PopoverTrigger><PopoverContent align="end" className="w-[min(430px,calc(100vw-2rem))] p-2"><div className={styles.list} aria-label="Görünen fiziksel bağlantılar">{physical.map(edge => <button key={edge.id} type="button" onClick={() => { setConnectionsOpen(false); setScopeOpen(false); setActiveId(null); props.onSelectConnection(edge.data?.connectionId || edge.id); }}><strong>{byId.get(edge.source)?.data.name} ↔ {byId.get(edge.target)?.data.name}</strong><small>{edge.data?.sourcePortName || 'Port belirtilmemiş'} ↔ {edge.data?.targetPortName || 'Port belirtilmemiş'}</small><small>{connectionState(edge.data?.status).label}</small></button>)}{!physical.length && <p>{props.connectionsAvailable ? 'Bu kapsamda kayıtlı fiziksel bağlantı yok.' : 'Bağlantı verileri alınamadı.'}</p>}</div></PopoverContent></Popover>
      {selected && <Button variant={focusOnly ? 'secondary' : 'outline'} aria-pressed={focusOnly} onClick={() => setFocusOnly(value => !value)} className="gap-1.5"><Focus size={14} />Seçili ve bağlıları</Button>}
      {(selected || selectedEdge) && <Button variant="ghost" onClick={clear}>Seçimi temizle</Button>}
      </>;
  return <section className={styles.overview} ref={props.captureRef} aria-label="Düzenli cihaz topolojisi">
    <div className={styles.toolbar}>
      <div className={styles.search}><TopologySearch items={props.searchItems} onSelect={props.onSearch} label="Cihaz haritasında ara" placeholder="Cihaz, IP veya ağ grubu ara…" emptyMessage="Eşleşen cihaz, konum veya ağ grubu bulunamadı." /></div>
      {props.filters}
      <Button variant="outline" className="gap-2" onClick={() => fit(true)}><Maximize2 size={16} />Ekrana sığdır</Button>
      <Button variant="outline" className="gap-2" onClick={props.onExpand} aria-label={props.expanded ? 'Normal görünüme dön' : 'Cihaz haritasını tam ekran yap'}>{props.expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}{props.expanded ? 'Normal görünüm' : 'Tam ekran'}</Button>
      <Popover open={optionsOpen} onOpenChange={setOptionsOpen}><PopoverTrigger asChild><Button variant="outline" className="gap-2" aria-label="Cihaz haritası seçenekleri"><Ellipsis size={16} />Harita seçenekleri</Button></PopoverTrigger><PopoverContent align="end" className="max-h-[75dvh] w-80 overflow-y-auto"><div className={styles.menu}><p>Harita seçenekleri</p><Button variant="ghost" onClick={() => { setOptionsOpen(false); props.onDetailed(); }}><Settings2 size={16} />Kayıtlı düzen / Düzenleme</Button><small>Bu görünüm kayıtlı cihaz ve grup konumlarını değiştirmez.</small>{props.actions}</div></PopoverContent></Popover>
    </div>
    {props.error && <p role="alert" className="order-1 flex shrink-0 flex-wrap items-center gap-2 border-b p-2 text-xs text-muted-foreground">{props.error}<Button variant="outline" size="sm" onClick={props.onRetryGroups}>Ağ gruplarını yeniden yükle</Button></p>}
    <div className={styles.summary} role="status"><span>{selectedEdge ? 'Seçili fiziksel bağlantı ve uçları' : focusOnly && selected ? `Bağlantı odağı: ${selected.data.name}` : effectiveLocation !== 'all' ? locations.find(([id]) => id === effectiveLocation)?.[1] : mode === 'summary' ? 'Konumlar arası bağlantılar ve ağ grubu merkezleri' : 'Tüm cihazlar ve kayıtlı bağlantıları'}</span><span>{visibleCount} / {props.totalDevices} cihaz{foldedCount > 0 ? ` · ${foldedCount} cihaz ağ grubunda kapalı` : ''}{!props.connectionsAvailable ? ' · Bağlantı verileri alınamadı' : ''}</span></div>
    <div className={styles.graph} ref={canvas} role="region" aria-label="Cihaz topolojisi haritası">
      <ReactFlow nodes={renderNodes} edges={lines ? renderEdges : []} nodeTypes={nodeTypes} edgeTypes={edgeTypes} connectionMode={ConnectionMode.Loose}
        onInit={() => setReady(true)} onNodesChange={changes => { for (const change of changes) if (change.type === 'dimensions' && change.dimensions) dimensions.current[change.id] = change.dimensions; }}
        onNodeClick={(_, node) => choose(node)} onEdgeClick={props.onEdgeClick} onNodeContextMenu={props.onNodeMenu} onEdgeContextMenu={props.onEdgeMenu}
        nodesDraggable={false} nodesConnectable={false} deleteKeyCode={null} minZoom={.05} maxZoom={2} onMoveStart={() => setHoverId(null)} onMove={(_, value) => setZoom(Math.round(value.zoom * 100))} aria-label="Etkileşimli cihaz haritası">
        <Background color="rgba(100,116,139,.08)" gap={26} size={.7} />
        <Panel position="bottom-left" className="!m-3"><div className={styles.controls}><Button variant="ghost" size="sm" aria-label="Cihaz haritasını yakınlaştır" onClick={() => zoomIn({ duration: 0 })}><Plus size={14} /><span>Yakınlaştır</span></Button><span>{zoom}%</span><Button variant="ghost" size="sm" aria-label="Cihaz haritasını uzaklaştır" onClick={() => zoomOut({ duration: 0 })}><Minus size={14} /><span>Uzaklaştır</span></Button><Button variant="ghost" size="sm" onClick={() => fit()}><Eye size={14} />Okunur görünüm</Button></div></Panel>
      </ReactFlow>
      {!graph.nodes.length && <div className={styles.empty}><p>{mode === 'summary' && effectiveLocation === 'all' && !focusOnly ? 'Bu kapsamda konumlar arası bağlantı veya ağ grubu merkezi yok.' : 'Bu kapsamda gösterilecek cihaz yok.'}</p><Button variant="outline" onClick={() => { clear(); setLocation('all'); setMode('all'); }}>Tüm cihazları göster</Button></div>}
    </div>
    <div className={styles.footer}><span className={styles.legend}><i className={styles.up} />Açık bağlantı</span><span className={styles.legend}><i className={styles.down} />Kapalı bağlantı</span><span className={styles.legend}><i className={styles.unknown} />Durum bilinmiyor</span><span className={styles.legend}><i className={styles.logical} />Mantıksal ağ grubu</span>{!!extraEdges.size && !focusOnly && !selected && !selectedEdge && <Button variant="ghost" size="sm" aria-pressed={showExtra} onClick={() => setShowExtra(value => !value)} title="Yalnız çizim sadeleşir; bu seçim aktif veya yedek yol anlamına gelmez.">{showExtra ? 'Ek çizgileri gizle' : `${extraEdges.size} ek çizgi · Göster`}</Button>}<Button variant="ghost" size="sm" aria-pressed={lines} onClick={() => setLines(value => !value)} className="gap-1.5"><Eye size={14} />{lines ? 'Çizgileri gizle' : 'Çizgileri göster'}</Button></div>
    <div className={styles.scopeFooter}>
      <Popover open={scopeOpen} onOpenChange={setScopeOpen}><PopoverTrigger asChild><button type="button" className="underline underline-offset-2">Cihaz ve bağlantı seçenekleri</button></PopoverTrigger><PopoverContent side="top" align="end" className="max-h-[70dvh] w-[min(420px,calc(100vw-2rem))] overflow-y-auto p-3"><p className="mb-3 text-sm font-semibold">Cihaz ve bağlantı seçenekleri</p><div className={styles.scopeChoices}>{scopeControls}</div><p className="mt-3 text-xs leading-relaxed text-muted-foreground">Bina içindeki cihazlar için konum seçin. Bir cihazı seçerek doğrudan bağlı komşularını ve portlarını inceleyin.{mode === 'summary' && effectiveLocation === 'all' && !focusOnly && directory.length > visibleCount ? ` ${directory.length - visibleCount} cihaz ağ özetinin dışında; Tüm cihazlar veya arama ile ulaşabilirsiniz.` : ''}</p></PopoverContent></Popover>
    </div>
  </section>;
}

