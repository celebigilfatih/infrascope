/** Visual organization only: never creates inventory, links or NetworkGroups. */
export interface PresentationBuilding { id: string; name: string }
export interface PresentationLink { id: string; sourceBuildingId: string; destBuildingId: string }
export interface PresentationPoint { x: number; y: number }
export interface PresentationSection { id: string; name: string; buildingIds: string[] }
export interface TopologyPresentation {
  version: 1;
  sections: PresentationSection[];
  backboneIds: string[];
  positions: Record<string, Record<string, PresentationPoint>>;
  pinned: Record<string, string[]>;
}
export interface PresentationEnvelope { revision: number; document: TopologyPresentation | null; canEdit: boolean }
export interface PresentationNode { id: string; kind: 'building' | 'section'; buildingId?: string; sectionId?: string; name: string; memberIds: string[] }
export interface PresentationEdge { id: string; source: string; target: string; linkIds: string[] }
export const PRESENTATION_KEY = 'network.topology.presentation:v1';
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(v);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Drop only inventory references that disappeared; GET remains read-only. */
export function reconcilePresentation(document: TopologyPresentation, buildingIds: ReadonlySet<string>): TopologyPresentation {
  const keepNode=(id:string)=>!id.startsWith('building-')||buildingIds.has(id.slice(9));
  return {...document,backboneIds:document.backboneIds.filter(id=>buildingIds.has(id)),sections:document.sections.map(section=>({...section,buildingIds:section.buildingIds.filter(id=>buildingIds.has(id))})),
    positions:Object.fromEntries(Object.entries(document.positions).map(([scope,points])=>[scope,Object.fromEntries(Object.entries(points).filter(([id])=>keepNode(id)))])),
    pinned:Object.fromEntries(Object.entries(document.pinned).map(([scope,ids])=>[scope,ids.filter(keepNode)])),
  };
}

export function validatePresentation(value: unknown, buildingIds: ReadonlySet<string>): string | null {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.sections) || !Array.isArray(value.backboneIds) || !record(value.positions) || !record(value.pinned)) return 'Geçerli bir görünüm belgesi belirtin.';
  if (value.sections.length > 1000) return 'En fazla 1000 bölüm oluşturulabilir.';
  const members = new Set<string>(), sections = new Set<string>();
  const checkMember = (id: unknown) => {
    if (typeof id !== 'string' || !buildingIds.has(id)) return 'Bina bulunamadı.';
    if (members.has(id)) return 'Bir bina birden fazla bölüme veya omurgaya atanamaz.';
    members.add(id); return null;
  };
  for (const section of value.sections) {
    if (!record(section) || !identifier(section.id) || sections.has(section.id) || typeof section.name !== 'string' || !section.name.trim() || section.name.length > 100 || !Array.isArray(section.buildingIds)) return 'Bölüm kimliği, adı veya üyeleri geçersiz.';
    sections.add(section.id);
    for (const id of section.buildingIds) { const error = checkMember(id); if (error) return error; }
  }
  for (const id of value.backboneIds) { const error = checkMember(id); if (error) return error; }
  const validScope = (scope: string) => scope === 'summary' || scope === 'all' || (scope.startsWith('section:') && sections.has(scope.slice(8)));
  const validNode = (id: string) => /^(building|section|network-group|group)-[A-Za-z0-9_-]{1,180}$/.test(id);
  if (Object.keys(value.positions).length > sections.size + 2 || Object.keys(value.pinned).length > sections.size + 2) return 'Görünüm kapsamı geçersiz.';
  for (const [scope, points] of Object.entries(value.positions)) {
    if (!validScope(scope) || !record(points) || Object.keys(points).length > 10000) return 'Görünüm konumları geçersiz.';
    for (const [id, point] of Object.entries(points)) {
      if (!validNode(id) || !record(point) || typeof point.x !== 'number' || typeof point.y !== 'number' || !Number.isFinite(point.x) || !Number.isFinite(point.y) || Math.abs(point.x) > 1e6 || Math.abs(point.y) > 1e6) return 'Geçerli bir görünüm konumu belirtin.';
    }
  }
  for (const [scope, ids] of Object.entries(value.pinned)) {
    if (!validScope(scope) || !Array.isArray(ids) || ids.length > 10000 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !validNode(id))) return 'Sabitlenen nesneler geçersiz.';
  }
  return null;
}

export function suggestPresentation(buildings: PresentationBuilding[], links: PresentationLink[]): TopologyPresentation {
  const catalog = [...buildings].sort((a,b) => a.name.localeCompare(b.name, 'tr') || a.id.localeCompare(b.id));
  const neighbors = new Map(catalog.map(b => [b.id, new Set<string>()]));
  for (const link of links) if (link.sourceBuildingId !== link.destBuildingId && neighbors.has(link.sourceBuildingId) && neighbors.has(link.destBuildingId)) {
    neighbors.get(link.sourceBuildingId)!.add(link.destBuildingId); neighbors.get(link.destBuildingId)!.add(link.sourceBuildingId);
  }
  // Tarjan articulation points; degree-two articulation chains stay together.
  const discovery = new Map<string, number>(), low = new Map<string, number>(), articulation = new Set<string>(); let time = 0;
  const visit = (id: string, parent?: string) => {
    discovery.set(id, ++time); low.set(id, time); let children = 0;
    for (const next of [...neighbors.get(id)!].sort()) {
      if (!discovery.has(next)) {
        children++; visit(next, id); low.set(id, Math.min(low.get(id)!, low.get(next)!));
        if (parent !== undefined && low.get(next)! >= discovery.get(id)!) articulation.add(id);
      } else if (next !== parent) low.set(id, Math.min(low.get(id)!, discovery.get(next)!));
    }
    if (parent === undefined && children > 1) articulation.add(id);
  };
  catalog.forEach(b => { if (!discovery.has(b.id)) visit(b.id); });
  const backbone = new Set([...articulation].filter(id => neighbors.get(id)!.size >= 3));
  const hub = [...catalog].filter(b => neighbors.get(b.id)!.size).sort((a,b) => neighbors.get(b.id)!.size - neighbors.get(a.id)!.size || a.name.localeCompare(b.name, 'tr') || a.id.localeCompare(b.id))[0];
  if (hub) backbone.add(hub.id);
  const visited = new Set(backbone), sections: PresentationSection[] = [];
  for (const building of catalog) {
    if (visited.has(building.id) || !neighbors.get(building.id)!.size) continue;
    const queue = [building.id], members: string[] = []; visited.add(building.id);
    for (let index = 0; index < queue.length; index++) {
      const id = queue[index]; members.push(id);
      for (const next of [...neighbors.get(id)!].sort()) if (!visited.has(next)) { visited.add(next); queue.push(next); }
    }
    if (members.length === 1) backbone.add(members[0]);
    else sections.push({ id: `auto-${building.id}`, name: `${building.name} bölümü`, buildingIds: members.sort() });
  }
  return { version: 1, sections, backboneIds: [...backbone].sort(), positions: {}, pinned: {} };
}

export function movePresentationBuilding(document: TopologyPresentation, buildingId: string, targetSectionId: string | null): TopologyPresentation {
  return { ...document, backboneIds: [...document.backboneIds.filter(id => id !== buildingId), ...(targetSectionId === null ? [buildingId] : [])], sections: document.sections.map(section => ({ ...section, buildingIds: [...section.buildingIds.filter(id => id !== buildingId), ...(section.id === targetSectionId ? [buildingId] : [])] })) };
}
export function removePresentationSection(document: TopologyPresentation, sectionId: string): TopologyPresentation {
  const section = document.sections.find(s => s.id === sectionId);
  const positions = { ...document.positions }, pinned = { ...document.pinned }; delete positions[`section:${sectionId}`]; delete pinned[`section:${sectionId}`];
  return { ...document, backboneIds: [...document.backboneIds, ...(section?.buildingIds || [])], sections: document.sections.filter(s => s.id !== sectionId), positions, pinned };
}

export function projectPresentation(document: TopologyPresentation, buildings: PresentationBuilding[], links: PresentationLink[], scope: string) {
  const catalog = new Map(buildings.map(b => [b.id, b]));
  const section = scope.startsWith('section:') ? document.sections.find(s => s.id === scope.slice(8)) : undefined;
  const assigned = new Set([...document.backboneIds, ...document.sections.flatMap(s => s.buildingIds)]);
  const unplacedIds = buildings.filter(b => !assigned.has(b.id)).map(b => b.id);
  const members = new Set(section?.buildingIds || []);
  if (section) for (const link of links) {
    if (section.buildingIds.includes(link.sourceBuildingId)) members.add(link.destBuildingId);
    if (section.buildingIds.includes(link.destBuildingId)) members.add(link.sourceBuildingId);
  }
  const nodes: PresentationNode[] = [], representative = new Map<string, string>();
  for (const building of buildings) {
    if (section && !members.has(building.id)) continue;
    const folded = scope === 'summary' ? document.sections.find(s => s.buildingIds.includes(building.id)) : undefined;
    if (folded) { representative.set(building.id, `section-${folded.id}`); continue; }
    nodes.push({ id: `building-${building.id}`, kind: 'building', buildingId: building.id, name: building.name, memberIds: [building.id] }); representative.set(building.id, `building-${building.id}`);
  }
  if (scope === 'summary') for (const s of document.sections) {
    const ids = s.buildingIds.filter(id => catalog.has(id));
    if (ids.length) nodes.push({ id: `section-${s.id}`, kind: 'section', sectionId: s.id, name: s.name, memberIds: ids });
  }
  const aggregate = new Map<string, PresentationEdge>(); let internalLinkCount = 0;
  for (const link of links) {
    if (section && !section.buildingIds.includes(link.sourceBuildingId) && !section.buildingIds.includes(link.destBuildingId)) continue;
    const source = representative.get(link.sourceBuildingId), target = representative.get(link.destBuildingId);
    if (!source || !target) continue;
    if (source === target) { internalLinkCount++; continue; }
    // Preserve parallel physical links in expanded/all scopes; aggregate summary only.
    const key = scope === 'summary' ? JSON.stringify([source,target].sort()) : link.id;
    const existing = aggregate.get(key);
    if (existing) existing.linkIds.push(link.id);
    else aggregate.set(key, { id: `presentation-link-${link.id}`, source, target, linkIds: [link.id] });
  }
  return { nodes, edges: [...aggregate.values()], internalLinkCount, unplacedIds };
}

/** Connected rows follow adjacency; chains wind across five columns instead of distant rings. */
export function arrangePresentation(ids: string[], edges: { source: string; target: string }[], saved: Record<string, PresentationPoint> = {}, pinned: string[] = []): Record<string, PresentationPoint> {
  const neighbors = new Map(ids.map(id => [id, new Set<string>()]));
  for (const e of edges) if (neighbors.has(e.source) && neighbors.has(e.target) && e.source !== e.target) { neighbors.get(e.source)!.add(e.target); neighbors.get(e.target)!.add(e.source); }
  const order: string[] = [], seen = new Set<string>(), layers: string[][][] = [];
  for (const start of [...ids].sort((a,b) => neighbors.get(b)!.size - neighbors.get(a)!.size || a.localeCompare(b))) {
    if (seen.has(start)) continue;
    const queue = [start], depth = new Map([[start,0]]), component:string[][]=[]; seen.add(start);
    for (let i = 0; i < queue.length; i++) {
      const id=queue[i], level=depth.get(id)!; order.push(id); (component[level] ||= []).push(id);
      for (const next of [...neighbors.get(id)!].sort()) if (!seen.has(next)) { seen.add(next); queue.push(next); depth.set(next,level+1); }
    }
    layers.push(component);
  }
  const columns = Math.min(5, Math.max(1, Math.ceil(Math.sqrt(ids.length * 1.5))));
  const points: Record<string, PresentationPoint> = {};
  const occupied = pinned.flatMap(id => saved[id] ? [saved[id]] : []);
  const layered:Record<string,PresentationPoint>={}; let offsetY=50;
  // Short branch graphs use columns by hop depth. Sibling cards cannot cover each other's edges.
  if(edges.length && layers.every(component=>component.length<=5))for(const component of layers){
    if(component.length===2&&component[1].length>=4&&component[1].length<=8){
      // A busy backbone fits around its center; a single tall sibling column shrinks the overview.
      const slots=[[0,0],[320,0],[640,0],[640,240],[640,480],[320,480],[0,480],[0,240]];
      layered[component[0][0]]={x:380,y:offsetY+240};
      component[1].forEach((id,index)=>{const [x,y]=slots[Math.floor(index*slots.length/component[1].length)];layered[id]={x:60+x,y:offsetY+y};});
      offsetY+=820;
      continue;
    }
    const height=Math.max(...component.map(level=>level.length))*220;
    component.forEach((level,depth)=>level.forEach((id,index)=>{layered[id]={x:60+depth*300,y:offsetY+(height-level.length*220)/2+index*220};}));
    offsetY+=height+100;
  }
  order.forEach((id, index) => {
    if (pinned.includes(id) && saved[id]) { points[id] = saved[id]; return; }
    let slot = index, point: PresentationPoint, attempts=0;
    do {
      const row = Math.floor(slot / columns), col = row % 2 ? columns - 1 - slot % columns : slot % columns;
      point = layered[id]?{x:layered[id].x,y:layered[id].y+attempts*220}:{ x: 60 + col * 280, y: 50 + row * 200 }; slot++;attempts++;
    } while (occupied.some(other => Math.abs(other.x - point.x) < 245 && Math.abs(other.y - point.y) < 165));
    points[id] = point; occupied.push(point);
  });
  return points;
}
