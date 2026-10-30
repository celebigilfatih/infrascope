import { topologySearchText } from './search';
import type { PresentationBuilding, TopologyPresentation } from './presentation';

/** Navigation filters only; never mutate the document used for persistence. */
export function filterPresentationNavigation(document:TopologyPresentation,buildings:PresentationBuilding[],query:string){
  const text=topologySearchText(query),catalog=new Map(buildings.map(b=>[b.id,b]));
  const matches=(id:string)=>!text||topologySearchText(catalog.get(id)?.name||'').includes(text);
  const assigned=new Set([...document.backboneIds,...document.sections.flatMap(section=>section.buildingIds)]);
  const sections=document.sections.flatMap(section=>{
    if(!text||topologySearchText(section.name).includes(text))return [{...section,buildingIds:[...section.buildingIds]}];
    const buildingIds=section.buildingIds.filter(matches);return buildingIds.length?[{...section,buildingIds}]:[];
  });
  return {backboneIds:document.backboneIds.filter(matches),sections,unplacedIds:buildings.filter(b=>!assigned.has(b.id)&&matches(b.id)).map(b=>b.id)};
}
