export interface TopologySearchItem { id: string; kind: 'building' | 'device' | 'networkGroup'; name: string; description?: string }

export function topologySearchText(value: string) {
  return value.toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/ı/g, 'i').trim();
}

export function topologySearchMatches(items: TopologySearchItem[], query: string) {
  const text = topologySearchText(query);
  if (!text) return [];
  const rank = (item: TopologySearchItem) => {
    const name = topologySearchText(item.name);
    return name === text ? 0 : name.startsWith(text) ? 1 : name.includes(text) ? 2 : 3;
  };
  return items.filter(item => topologySearchText(`${item.name} ${item.description || ''}`).includes(text))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'tr') || a.id.localeCompare(b.id));
}
