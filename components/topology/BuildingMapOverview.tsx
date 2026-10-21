'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import ReactFlow, { Background, ConnectionMode, Panel, ReactFlowProvider, useNodesInitialized, useReactFlow, type Edge, type Node } from 'reactflow';
import { Ellipsis, Eye, Layers, List, Maximize2, Minimize2, Minus, Plus, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { balancedBuildingOverview } from '@/lib/topology/building-overview';
import type { BuildingEndpoints } from '@/lib/topology/building-graph';
import type { NetworkGroup } from '@/lib/topology/network-groups';
import type { TopologySearchItem } from '@/lib/topology/search';
import { connectionInteractionEmphasis, directlyConnectedNodeIds, nodeInteractionEmphasis } from '@/lib/topology/connection-emphasis';
import { BuildingNode, buildingNodeStatus } from './BuildingNode';
import { BuildingOverviewEdge } from './BuildingOverviewEdge';
import { NetworkGroupNode } from './NetworkGroupNode';
import { TopologySearch } from './TopologySearch';
import { NodeTooltip } from './NodeTooltip';
import { useConnectionTooltip } from './ConnectionTooltip';
import styles from './BuildingMapOverview.module.css';

interface Props {
  nodes: Node[]; edges: Edge[]; buildings: { id: string; name: string }[]; links: BuildingEndpoints[]; groups: NetworkGroup[];
  unassignedId: string; unassignedCount: number; searchItems: TopologySearchItem[];
  onSearch: (item: TopologySearchItem) => void; onNodeClick: (node: Node) => void; onEdgeClick: (event: React.MouseEvent, edge: Edge) => void;
  onNodeMenu: (event: React.MouseEvent, node: Node) => void; onEdgeMenu: (event: React.MouseEvent, edge: Edge) => void;
  onUseSavedLayout: () => void; onUnassigned: () => void; onExpand: () => void; expanded: boolean; onClearFocus: () => void;
  filters: ReactNode; actions: ReactNode; connectionFilters: ReactNode; error?: string;
  focusNodeId: string | null; focusRevision: number; returnGroupId: string | null;
  captureRef: MutableRefObject<HTMLDivElement | null>;
}
const nodeTypes = { building: BuildingNode, networkGroup: NetworkGroupNode };
const edgeTypes = { buildingOverview: BuildingOverviewEdge };

export function BuildingMapOverview(props: Props) {
  return <ReactFlowProvider><Overview {...props} /></ReactFlowProvider>;
}
function Overview(props: Props) {
  const { fitView, setViewport, zoomIn, zoomOut } = useReactFlow();
  const initialized = useNodesInitialized();
  const [ready, setReady] = useState(false), [zoom, setZoom] = useState(100), [showCross, setShowCross] = useState(true);
  const [optionsOpen, setOptionsOpen] = useState(false), [listOpen, setListOpen] = useState(false);
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null), [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
  const canvas = useRef<HTMLDivElement>(null), returned = useRef(false);
  const dimensions = useRef<Record<string, { width: number; height: number }>>({});
  const tooltip = useConnectionTooltip(open => { if (!open) setHoverNodeId(null); });
  const graph = useMemo(() => balancedBuildingOverview(props.nodes, props.edges, props.buildings, props.links, props.groups, showCross, props.unassignedId, props.focusNodeId), [props.nodes, props.edges, props.buildings, props.links, props.groups, props.unassignedId, props.focusNodeId, showCross]);
  const visibleNodes = graph.nodes.filter(node => !node.hidden);
  const hoverEdge = graph.edges.find(edge => edge.id === hoverEdgeId);
  const emphasisId = hoverNodeId || props.focusNodeId;
  const adjacent = directlyConnectedNodeIds(graph.edges, emphasisId);
  const hovered = graph.nodes.find(node => node.id === hoverNodeId && node.type === 'building');
  const fit = useCallback((showWholeMap = false) => {
    const element = canvas.current;
    if (!element || !visibleNodes.length) return;
    const minX = Math.min(...visibleNodes.map(node => node.position.x)), minY = Math.min(...visibleNodes.map(node => node.position.y));
    const width = Math.max(...visibleNodes.map(node => node.position.x + (node.type === 'networkGroup' ? 232 : 160))) - minX;
    const height = Math.max(...visibleNodes.map(node => node.position.y + (node.type === 'networkGroup' ? 232 : 130))) - minY;
    const scale = Math.min(1.1, (element.clientWidth - 48) / Math.max(1, width), (element.clientHeight - 70) / Math.max(1, height));
    // On narrow screens, keep names readable and let the user pan or use search/list.
    const readable = Math.max(!showWholeMap && element.clientWidth < 700 ? .7 : .05, scale);
    void setViewport({ x: (element.clientWidth - width * readable) / 2 - minX * readable, y: (element.clientHeight - height * readable) / 2 - minY * readable, zoom: readable }, { duration: 0 });
  }, [visibleNodes, setViewport]);
  const fitRef = useRef(fit); fitRef.current = fit;
  useEffect(() => {
    if (!ready || !initialized) return;
    const observer = new ResizeObserver(() => fitRef.current());
    if (canvas.current) observer.observe(canvas.current);
    fitRef.current();
    return () => observer.disconnect();
  }, [ready, initialized, graph.nodes.length]);
  useEffect(() => {
    if (!ready || !initialized) return;
    if (!props.focusNodeId) { fitRef.current(); return; }
    if (!graph.nodes.some(node => node.id === props.focusNodeId)) return;
    void fitView({ nodes: [{ id: props.focusNodeId }], minZoom: .9, maxZoom: 1.1, padding: .7, duration: 0 });
  }, [ready, initialized, props.focusNodeId, props.focusRevision, graph.nodes, fitView]);
  useEffect(() => {
    if (!props.returnGroupId || !initialized || returned.current) return;
    const timer = window.setTimeout(() => {
      const group = props.groups.find(item => item.id === props.returnGroupId);
      const button = [...(canvas.current?.querySelectorAll<HTMLButtonElement>('button[aria-label]') || [])].find(element => element.getAttribute('aria-label') === `${group?.name}: Grubu aç`);
      if (button) { button.focus({ preventScroll: true }); returned.current = true; }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [props.returnGroupId, initialized, props.groups]);
  const renderNodes = graph.nodes.map(node => ({ ...node, ...dimensions.current[node.id], data: { ...node.data,
    tooltipId: node.id === hoverNodeId && tooltip.anchor ? tooltip.id : undefined,
    hoverActive: !!hoverEdge || !!hoverNodeId,
    nodeEmphasis: nodeInteractionEmphasis(node.id, emphasisId, adjacent, hoverEdge),
  } }));
  const renderEdges = graph.edges.map(edge => ({ ...edge, data: { ...edge.data,
    connectionEmphasis: connectionInteractionEmphasis(edge, emphasisId, hoverEdge), hoverActive: !!hoverEdge || !!hoverNodeId,
    onHoverChange: (active: boolean) => { if (active) { tooltip.close(); setHoverNodeId(null); } setHoverEdgeId(current => active ? edge.id : current === edge.id ? null : current); },
  } }));
  const closeHover = () => { tooltip.close(); setHoverNodeId(null); setHoverEdgeId(null); };
  const nodeCount = graph.nodes.filter(node => node.type === 'building' && !node.hidden).length;
  const foldedSites = graph.nodes.filter(node => node.type === 'networkGroup').reduce((count, node) => count + node.data.group.members.length, 0);
  return <section className={styles.overview} ref={props.captureRef} aria-label="Dengeli bina topolojisi">
    <div className={styles.toolbar}>
      <div className={styles.search}><TopologySearch items={props.searchItems} onSelect={props.onSearch} label="Topolojide bina veya cihaz ara" placeholder="Bina, cihaz veya ağ grubu ara…" emptyMessage="Eşleşen bina, ağ grubu veya cihaz bulunamadı." /></div>
      {props.filters}
      {props.focusNodeId && <Button variant="ghost" size="sm" onClick={props.onClearFocus}>Vurguyu temizle</Button>}
      <Button variant="outline" className="gap-2" onClick={() => { closeHover(); fit(true); }}><Maximize2 size={16} />Ekrana sığdır</Button>
      <Button variant="outline" className="shrink-0 gap-1.5 text-xs" onClick={() => { closeHover(); props.onExpand(); }} aria-label={props.expanded ? 'Normal görünüme dön' : 'Haritayı tam ekran yap'} title={props.expanded ? 'Normal görünüme dön · Esc' : 'Haritayı tam ekran yap'}>{props.expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}<span>{props.expanded ? 'Normal görünüme dön' : 'Tam ekran'}</span></Button>
      <Popover open={optionsOpen} onOpenChange={setOptionsOpen}><PopoverTrigger asChild><Button variant="outline" size="sm" className="shrink-0 gap-1.5 text-xs" aria-label="Bina haritası seçenekleri"><Ellipsis size={16} /><span>Harita seçenekleri</span></Button></PopoverTrigger><PopoverContent align="end" className="max-h-[75dvh] w-80 overflow-y-auto"><div className={styles.menu}>
        <p className="px-2 py-1 text-sm font-semibold">Harita seçenekleri</p>
        <Button variant="ghost" onClick={() => { setOptionsOpen(false); props.onUseSavedLayout(); }}><SlidersHorizontal size={16} />Kayıtlı düzen / Düzenleme</Button>
        <p className="px-2 pb-2 text-xs text-muted-foreground">Dengeli görünüm kayıtlı ikon konumlarını değiştirmez.</p>
        <Button variant="ghost" onClick={() => { setOptionsOpen(false); setListOpen(true); }}><List size={16} />Bina ve ağ grubu listesi</Button>
        <div className="my-1 border-t" />{props.actions}
      </div></PopoverContent></Popover>
    </div>
    {props.error && <p role="alert" className={styles.notice}>{props.error}</p>}
    <div className={styles.canvas} ref={canvas} role="region" aria-label="Topoloji haritası">
      {!graph.nodes.length ? <div className={styles.empty}><p>Filtrelere uygun bina bulunamadı.</p><p>Filtreleri değiştirerek tekrar deneyin.</p></div> : <ReactFlow nodes={renderNodes} edges={renderEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onInit={() => setReady(true)}
        onNodesChange={changes => changes.forEach(change => { if (change.type === 'dimensions' && change.dimensions) dimensions.current[change.id] = change.dimensions; })}
        onNodeClick={(_, node) => { closeHover(); props.onNodeClick(node); }} onEdgeClick={props.onEdgeClick}
        onNodeContextMenu={props.onNodeMenu} onEdgeContextMenu={props.onEdgeMenu}
        onNodeMouseEnter={(event, node) => { if (node.type === 'building') { setHoverEdgeId(null); setHoverNodeId(node.id); tooltip.enter(event); } }}
        onNodeMouseMove={(event, node) => { if (node.type === 'building' && tooltip.show(event)) setHoverNodeId(node.id); }} onNodeMouseLeave={tooltip.leave}
        onPaneClick={closeHover} onMoveStart={closeHover} onMove={(_, viewport) => setZoom(Math.round(viewport.zoom * 100))}
        nodesDraggable={false} nodesConnectable={false} connectionMode={ConnectionMode.Loose} deleteKeyCode={null} minZoom={.2} maxZoom={2} aria-label="Etkileşimli bina topolojisi">
        <Background gap={26} size={.7} color="rgba(100,116,139,.08)" />
        <Panel position="bottom-left" className="!m-3"><div className={styles.controls}><Button variant="ghost" size="sm" className="h-9 gap-1.5 rounded-none px-2 text-xs" aria-label="Haritayı yakınlaştır" onClick={() => zoomIn({ duration: 0 })}><Plus size={14} /><span>Yakınlaştır</span></Button><span className="min-w-10 text-center text-xs text-muted-foreground">{zoom}%</span><Button variant="ghost" size="sm" className="h-9 gap-1.5 rounded-none px-2 text-xs" aria-label="Haritayı uzaklaştır" onClick={() => zoomOut({ duration: 0 })}><Minus size={14} /><span>Uzaklaştır</span></Button></div></Panel>
      </ReactFlow>}
      {hovered && <NodeTooltip id={tooltip.id} anchor={tooltip.anchor} container={tooltip.container} onMouseEnter={tooltip.keepOpen} onMouseLeave={tooltip.leaveTooltip} onFocusCapture={tooltip.focusTooltip} onBlurCapture={tooltip.blurTooltip}
        name={hovered.data.name} status={<SemanticBadge tone={buildingNodeStatus(hovered.data.status).tone}>{buildingNodeStatus(hovered.data.status).label}</SemanticBadge>}
        connectionCount={props.links.filter(link => link.sourceBuildingId === hovered.data.buildingId || link.destBuildingId === hovered.data.buildingId).length}
        visibleConnectionCount={graph.edges.filter(edge => edge.source === hovered.id || edge.target === hovered.id).length}
        summary={{ kind: 'building', deviceCount: hovered.data.deviceCount, onShowDevices: () => { closeHover(); props.onNodeClick(hovered); } }} />}
    </div>
    <div className={styles.footer}>
      <span className={styles.legend}><i className={styles.physical} aria-hidden="true" />Fiziksel bağlantı</span><span className={styles.legend}><i className={styles.logical} aria-hidden="true" />Mantıksal ağ grubu</span><span className={styles.legend}><i className={styles.unknown} aria-hidden="true" />Durum bilinmiyor</span>
      {!!graph.crossLinks.length && <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => setShowCross(value => !value)} aria-pressed={showCross}><Eye size={14} />{showCross ? 'Çapraz bağlantıları gizle' : `${graph.hiddenCrossLinks.length} çapraz bağlantı gizli · Göster`}</Button>}
      <Popover><PopoverTrigger asChild><Button variant="ghost" size="sm" className="gap-1.5 text-xs" aria-label="Bağlantı türü filtrelerini aç"><Layers size={14} />Bağlantı türleri</Button></PopoverTrigger><PopoverContent side="top" align="end" className="w-[min(540px,calc(100vw-2rem))] p-0">{props.connectionFilters}</PopoverContent></Popover>
      <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={props.onUnassigned}>Konumsuz cihazlar · {props.unassignedCount}</Button>
    </div>
    <div className={styles.summary}><span>{nodeCount} bina{foldedSites ? ` · ${foldedSites} konum ağ grubunda kapalı` : ''}</span><button type="button" className="underline underline-offset-2" onClick={() => setListOpen(value => !value)}>Bina ve ağ grubu listesi</button></div>
    {listOpen && <div className="max-h-48 overflow-y-auto border-t p-2" aria-label="Bina ve ağ grubu listesi">{visibleNodes.map(node => <button key={node.id} className="flex min-h-10 w-full items-center justify-between rounded px-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { setListOpen(false); props.onNodeClick(node); }}>{node.data.name || node.data.group?.name}<span className="text-xs text-muted-foreground">{node.type === 'networkGroup' ? `${node.data.group.members.length} konum` : `${node.data.deviceCount} cihaz`}</span></button>)}</div>}
  </section>;
}
