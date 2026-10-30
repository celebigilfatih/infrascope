'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, { Background, ConnectionMode, Panel, ReactFlowProvider, useNodesInitialized, useReactFlow, useViewport, type Node, type Viewport } from 'reactflow';
import { Building2, Ellipsis, Eye, List, Minus, Pin, Plus, Undo2, WandSparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { arrangePresentation, type PresentationPoint } from '@/lib/topology/presentation';
import { flatPositions, flatPresentation, readableMapViewport } from '@/lib/topology/flat-overview';
import { directlyConnectedNodeIds, nodeInteractionEmphasis, connectionInteractionEmphasis } from '@/lib/topology/connection-emphasis';
import { balancedBuildingOverview } from '@/lib/topology/building-overview';
import { BuildingNode } from './BuildingNode';
import { BuildingOverviewEdge } from './BuildingOverviewEdge';
import { NetworkGroupNode } from './NetworkGroupNode';
import { MapViewActions } from './MapViewActions';
import { TopologySearch } from './TopologySearch';
import { TopologyInteractionMode } from './TopologyInteractionMode';
import { TopologyMapGuide } from './TopologyMapGuide';
import type { BuildingMapOverviewProps } from './BuildingMapOverview';
import styles from './BuildingPresentationWorkspace.module.css';

const nodeTypes = { building: BuildingNode, networkGroup: NetworkGroupNode };
const edgeTypes = { buildingOverview: BuildingOverviewEdge };
// Do not import the former summary camera or the legacy all-network camera.
const cameraKey = 'infrascope:topology:flat-camera:v1';
function storedCamera(): Viewport | null {
  try { const v = JSON.parse(sessionStorage.getItem(cameraKey) || 'null'); return v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.zoom) && v.zoom >= .05 && v.zoom <= 2 ? v : null; } catch { return null; }
}
function rememberCamera(viewport: Viewport) {
  try { sessionStorage.setItem(cameraKey, JSON.stringify(viewport)); } catch { /* The current camera remains usable if storage is blocked. */ }
}
export function BuildingPresentationWorkspace(props: BuildingMapOverviewProps) {
  return <ReactFlowProvider><Workspace {...props} /></ReactFlowProvider>;
}
function Workspace(props: BuildingMapOverviewProps) {
  const persistence = props.presentation;
  const document = flatPresentation(persistence.document);
  const documentRef = useRef(document); documentRef.current = document;
  const { setViewport, fitView, zoomIn, zoomOut } = useReactFlow();
  const { x: cameraX, y: cameraY, zoom: cameraZoom } = useViewport();
  const initialized = useNodesInitialized(), canvas = useRef<HTMLDivElement>(null);
  const [flowReady, setFlowReady] = useState(false), [cameraReady, setCameraReady] = useState(false);
  const cameraApplied = useRef(false), dimensions = useRef<Record<string, { width: number; height: number }>>({});
  const returnedGroup = useRef<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null), [hoverId, setHoverId] = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false), [listOpen, setListOpen] = useState(false);
  const [showCross, setShowCross] = useState(true), [guideOpen, setGuideOpen] = useState(false);
  const [dragPositions, setDragPositions] = useState<Record<string, PresentationPoint>>({});
  const [preview, setPreview] = useState<Record<string, PresentationPoint> | null>(null), [undo, setUndo] = useState<Record<string, PresentationPoint> | null>(null);
  const canEdit = props.editing && persistence.ready && persistence.canEdit && !persistence.error;
  const base = useMemo(() => balancedBuildingOverview(props.nodes, props.edges, props.buildings, props.links, props.groups, true, props.unassignedId), [props.nodes, props.edges, props.buildings, props.links, props.groups, props.unassignedId]);
  const saved = flatPositions(base.nodes, props.savedPositions, document);
  const points = { ...saved, ...dragPositions, ...preview };
  const graph = balancedBuildingOverview(props.nodes, props.edges, props.buildings, props.links, props.groups, showCross, props.unassignedId, props.focusNodeId, points);
  const selected = graph.nodes.find(node => node.id === selectedId);
  const selectedBuilding = selected?.type === 'building' ? selected : undefined;
  const adjacent = directlyConnectedNodeIds(graph.edges, hoverId || selectedId);
  const pinned = document.pinned.all || [], isPinned = !!selectedId && pinned.includes(selectedId);
  const nodes = graph.nodes.map(node => ({ ...node, ...dimensions.current[node.id], selected: node.id === selectedId, draggable: canEdit && !preview && !pinned.includes(node.id), connectable: canEdit && props.canConnect && node.type === 'building', data: { ...node.data, hoverActive: !!hoverId, nodeEmphasis: nodeInteractionEmphasis(node.id, hoverId || selectedId, adjacent) } }));
  const edges = graph.edges.map(edge => ({ ...edge, data: { ...edge.data, connectionEmphasis: connectionInteractionEmphasis(edge, hoverId || selectedId) } }));
  const graphRef = useRef(graph); graphRef.current = graph;
  const fit = (whole = false) => {
    if (!canvas.current) return;
    const next = readableMapViewport(graph.nodes, graph.edges, canvas.current.clientWidth, canvas.current.clientHeight, whole);
    setViewport(next, { duration: 0 }); rememberCamera(next);
  };
  const fitRef = useRef(fit); fitRef.current = fit;
  const ready = flowReady && initialized && (persistence.ready || !!persistence.error) && (props.ready || !!props.legacyLayoutError);
  useEffect(() => {
    if (!ready || cameraApplied.current) return;
    const camera = storedCamera();
    if (camera) void setViewport(camera, { duration: 0 }); else fitRef.current();
    cameraApplied.current = true;
    const frame = requestAnimationFrame(() => setCameraReady(true));
    return () => cancelAnimationFrame(frame);
  }, [ready, setViewport]);
  // Observe the committed transform: v11 programmatic zoom helpers do not emit
  // onMoveEnd, and getViewport immediately after zoom still returns the old frame.
  useEffect(() => {
    if (cameraReady) rememberCamera({ x: cameraX, y: cameraY, zoom: cameraZoom });
  }, [cameraReady, cameraX, cameraY, cameraZoom]);
  useEffect(() => {
    if (!ready || !cameraReady || !props.focusNodeId || !graphRef.current.nodes.some(node => node.id === props.focusNodeId)) return;
    setSelectedId(props.focusNodeId);
    // Revision zero is hydrated selection, not a new search/focus request.
    if (props.focusRevision === 0) return;
    fitView({ nodes: [{ id: props.focusNodeId }], minZoom: .9, maxZoom: 1.1, padding: .6, duration: 0 });
  }, [props.focusNodeId, props.focusRevision, ready, cameraReady, fitView]);
  useEffect(() => {
    if (!props.returnGroupId || returnedGroup.current === props.returnGroupId || !ready || !cameraReady) return;
    const group = props.groups.find(item => item.id === props.returnGroupId);
    const frame = requestAnimationFrame(() => {
      const button = [...(canvas.current?.querySelectorAll<HTMLButtonElement>('button[aria-label]') || [])].find(element => element.getAttribute('aria-label') === `${group?.name}: Grubu aç`);
      if (button) { button.focus({ preventScroll: true }); returnedGroup.current = props.returnGroupId; }
    });
    return () => cancelAnimationFrame(frame);
  }, [props.returnGroupId, props.groups, ready, cameraReady]);
  const move = (node: Node) => {
    if (!canEdit || preview) return;
    const current = documentRef.current;
    persistence.change({ ...current, positions: { ...current.positions, all: { ...current.positions.all, [node.id]: node.position } } });
    setDragPositions({});
  };
  const pin = () => { if (selected && canEdit && !preview) persistence.change({ ...document, positions: { ...document.positions, all: { ...document.positions.all, [selected.id]: selected.position } }, pinned: { ...document.pinned, all: isPinned ? pinned.filter(id => id !== selected.id) : [...pinned, selected.id] } }); };
  const closeSelection = () => { setSelectedId(null); props.onClearFocus(); };
  const applyLayout = () => {
    if (!preview || !canEdit) return;
    setUndo(saved);
    persistence.change({ ...document, positions: { ...document.positions, all: { ...document.positions.all, ...preview } } });
    setPreview(null);
  };
  const openNode = (node: Node) => { setHoverId(null); setSelectedId(node.id); if (props.editing && node.type === 'building') props.onNodeClick(node); else props.onOpenNode(node); };
  const count = graph.nodes.filter(node => node.type === 'building').length;
  return <section className={styles.workspace} ref={props.captureRef} aria-label="Dengeli bina topolojisi">
    <div className={styles.toolbar} data-topology-toolbar>
      <div className={styles.search}><TopologySearch items={props.searchItems} onSelect={props.onSearch} label="Topolojide bina veya cihaz ara" placeholder="Bina veya cihaz ara…" /></div>
      {props.filters}<span className={styles.spacer} />
      {props.onEditingChange ? <TopologyInteractionMode compact editing={props.editing} onChange={value => { setPreview(null); closeSelection(); props.onEditingChange?.(value); }} canEdit={persistence.ready && persistence.canEdit} disabled={persistence.status === 'saving'} label="Topoloji etkileşim modu" /> : props.interaction}
      {props.editing && props.connectionAction}
      <MapViewActions onFit={() => fit(true)} expanded={props.expanded} onExpand={props.onExpand} />
      <Popover open={optionsOpen} onOpenChange={setOptionsOpen}><PopoverTrigger asChild><Button variant="outline" size="sm" aria-label="Bina haritası seçenekleri"><Ellipsis size={16} />Diğer seçenekler</Button></PopoverTrigger><PopoverContent align="end" className="max-h-[75dvh] w-80 overflow-y-auto"><div className={styles.options}>
        <Button variant="ghost" onClick={() => { setOptionsOpen(false); setListOpen(true); }}><List size={15} />Bina ve ağ grubu listesi</Button>
        <Button variant="ghost" onClick={() => { setOptionsOpen(false); props.onDetailed(); }}>Ayrıntılı görünüm</Button>
        {props.editing && <Button variant="ghost" disabled={!canEdit} onClick={() => { setOptionsOpen(false); setPreview(arrangePresentation(nodes.map(n => n.id), edges, points, pinned)); }}><WandSparkles size={15} />Otomatik düzenle</Button>}
        {!!graph.crossLinks.length && <Button variant="ghost" aria-pressed={showCross} onClick={() => setShowCross(value => !value)}><Eye size={15} />{showCross ? 'Çapraz bağlantıları gizle' : `${graph.hiddenCrossLinks.length} çapraz bağlantı gizli · Göster`}</Button>}
        <Button variant="ghost" onClick={() => { setOptionsOpen(false); props.onUnassigned(); }}>Konumsuz cihazlar · {props.unassignedCount}</Button>
        {props.actions}
      </div></PopoverContent></Popover>
    </div>
    {(props.editing || persistence.error || persistence.status === 'saving' || persistence.status === 'saved' || props.error || props.legacyLayoutError) && <div className={styles.statusbar}>
      <span role={persistence.error ? 'alert' : 'status'} aria-live="polite">{persistence.error || (persistence.status === 'saving' ? 'Görünüm kaydediliyor…' : persistence.status === 'saved' ? 'Görünüm kaydedildi' : 'İkonları sürükleyin · Konumlar otomatik kaydedilir.')}</span>
      {persistence.error && !persistence.conflict && <Button variant="outline" size="sm" onClick={persistence.retry}>Yeniden dene</Button>}
      {persistence.conflict && <Button variant="outline" size="sm" onClick={() => void persistence.inspectServer()}>Güncel görünümü incele</Button>}
      {props.editing && undo && <Button variant="ghost" size="sm" disabled={!canEdit} onClick={() => { persistence.change({ ...document, positions: { ...document.positions, all: undo } }); setUndo(null); }}><Undo2 size={15} />Geri al</Button>}
      {props.error && <span role="alert">{props.error}</span>}
      {props.legacyLayoutError && <><span>Bağlantı araçları yüklenemedi.</span><Button variant="outline" size="sm" onClick={props.retryLegacyLayout}>Bağlantı araçlarını yeniden yükle</Button></>}
    </div>}
    {persistence.serverCopy && <div className={styles.banner}><p>Sunucudaki görünüm revizyonu: {persistence.serverCopy.revision}. Sunucuya geçerseniz taslağınız karşılaştırma için korunur.</p><Button variant="outline" onClick={persistence.adoptServer}>Sunucu görünümüne geç</Button></div>}
    {persistence.localDraft && <details className={styles.banner}><summary>Önceki taslak ayrıntıları</summary><pre>{JSON.stringify(persistence.localDraft, null, 2)}</pre></details>}
    {preview && <div className={styles.banner}><strong>Yerleşim önizlemesi</strong><span>Sabitlenen konumlar korunur. Henüz kaydedilmedi.</span><Button size="sm" disabled={!canEdit} onClick={applyLayout}>Yerleşimi uygula</Button><Button variant="ghost" size="sm" onClick={() => setPreview(null)}>Vazgeç</Button></div>}
    <div className={styles.canvas} ref={canvas} role="region" aria-label="Topoloji haritası" aria-busy={nodes.length > 0 && !cameraReady}>
      {!nodes.length ? <p className={styles.empty}>Filtrelere uygun bina bulunamadı. Filtreleri değiştirerek tekrar deneyin.</p> : <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onInit={() => setFlowReady(true)}
        onNodesChange={changes => { for (const change of changes) { if (change.type === 'dimensions' && change.dimensions) dimensions.current[change.id] = change.dimensions; if (change.type === 'position' && change.position && canEdit && !preview) setDragPositions(prev => ({ ...prev, [change.id]: change.position! })); } }}
        onNodeDragStart={() => setHoverId(null)} onNodeDragStop={(_, node) => move(node)} onNodeClick={(_, node) => openNode(node)}
        onNodeContextMenu={props.onNodeMenu} onEdgeContextMenu={props.onEdgeMenu} onEdgeClick={props.onEdgeClick}
        onNodeMouseEnter={(_, node) => setHoverId(node.id)} onNodeMouseLeave={() => setHoverId(null)} onPaneClick={closeSelection}
        onMoveEnd={(_, viewport) => { if (cameraApplied.current) rememberCamera(viewport); }}
        onConnect={props.onConnect} isValidConnection={c => canEdit && props.canConnect && !!c.source && !!c.target && c.source !== c.target && graph.nodes.some(n => n.id === c.source && n.type === 'building') && graph.nodes.some(n => n.id === c.target && n.type === 'building')}
        nodesDraggable={canEdit && !preview} nodeDragThreshold={4} nodesConnectable={canEdit && props.canConnect} connectionMode={ConnectionMode.Loose} deleteKeyCode={null} minZoom={.05} maxZoom={2} aria-label="Etkileşimli bina topolojisi">
        <Background gap={26} size={.7} color="rgba(100,116,139,.08)" />
        <Panel position="bottom-left"><div className={styles.controls}><Button variant="ghost" size="sm" aria-label="Haritayı yakınlaştır" onClick={() => zoomIn({ duration: 0 })}><Plus size={14} />Yakınlaştır</Button><span>{Math.round(cameraZoom * 100)}%</span><Button variant="ghost" size="sm" aria-label="Haritayı uzaklaştır" onClick={() => zoomOut({ duration: 0 })}><Minus size={14} />Uzaklaştır</Button><Button variant="ghost" size="sm" onClick={() => fit()}>Okunabilir ölçek</Button></div></Panel>
      </ReactFlow>}
      <div className={styles.guide}><TopologyMapGuide open={guideOpen} onOpenChange={setGuideOpen}>{props.connectionFilters}</TopologyMapGuide></div>
      {props.editing && selectedBuilding && <div className={styles.selection} role="group" aria-label="Seçili bina işlemleri"><div><strong>{selectedBuilding.data.name}</strong><Button variant="ghost" size="sm" onClick={closeSelection} aria-label="Seçimi kapat"><X size={15} /></Button></div><span>{selectedBuilding.data.deviceCount} cihaz</span><div className={styles.selectionActions}><Button size="sm" variant="outline" onClick={() => props.onOpenNode(selectedBuilding)}><Building2 size={14} />Cihazları aç</Button><Button size="sm" disabled={!canEdit || !props.canConnect} onClick={() => props.onAddConnection?.(selectedBuilding)}><Plus size={14} />Buradan bağlantı ekle</Button><Button size="sm" variant="outline" disabled={!canEdit} onClick={pin}><Pin size={14} />{isPinned ? 'Sabitlemeyi kaldır' : 'Konumu sabitle'}</Button></div></div>}
      <span className={styles.count}>{count} bina{props.groups.length ? ` · ${props.groups.length} mantıksal ağ grubu` : ''}</span>
      {nodes.length > 0 && !cameraReady && <div className={styles.loadingOverlay} role="status">Harita hazırlanıyor…</div>}
    </div>
    <Dialog open={listOpen} onOpenChange={setListOpen}><DialogContent closeButtonText="Kapat" className="max-w-lg"><DialogHeader><DialogTitle>Bina ve ağ grubu listesi</DialogTitle><DialogDescription>Haritada odaklanmak için bir kayıt seçin.</DialogDescription></DialogHeader><div className={styles.list}>{props.buildings.map(building => <Button key={building.id} variant="ghost" onClick={() => { setListOpen(false); props.onSearch({ id: building.id, kind: 'building', name: building.name }); }}><Building2 size={16} />{building.name}</Button>)}{props.groups.map(group => <Button key={group.id} variant="ghost" onClick={() => { const node = graph.nodes.find(n => n.data.group?.id === group.id); setListOpen(false); if (node) props.onOpenNode(node); }}>{group.name} · {group.members.length} konum</Button>)}</div></DialogContent></Dialog>
  </section>;
}
