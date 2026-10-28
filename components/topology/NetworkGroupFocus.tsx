'use client';

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { ArrowDown, ArrowLeft, ArrowUpRight, Building2, ChevronRight, Cloud, Info, Link2, Expand, Shrink, Router, Search, Server, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { networkGroupKindLabel, type NetworkGroup } from '@/lib/topology/network-groups';
import { groupInventorySummary, networkGroupSites, type GroupFocusDevice } from '@/lib/topology/network-group-focus';
import styles from './NetworkGroupFocus.module.css';

interface Props {
  group: NetworkGroup;
  devices: GroupFocusDevice[];
  visibleIds: ReadonlySet<string>;
  filtered: boolean;
  view: 'building' | 'physical';
  focusBuildingId?: string | null;
  onClose: () => void;
  onInspect: () => void;
  onOpenSite: (buildingId: string, deviceId?: string) => void;
  onOpenSource: () => void;
  onConnections: () => void;
  onClearFilters: () => void;
  captureRef: MutableRefObject<HTMLDivElement | null>;
  expandedMap: boolean;
  onExpand: () => void;
}

export function NetworkGroupFocus({ group, devices, visibleIds, filtered, view, focusBuildingId, onClose, onInspect, onOpenSite, onOpenSource, onConnections, onClearFilters, captureRef, expandedMap, onExpand }: Props) {
  const [query, setQuery] = useState('');
  const content = useRef<HTMLDivElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const sites = useMemo(() => networkGroupSites(group, devices, visibleIds, query, filtered), [group, devices, visibleIds, query, filtered]);
  const memberIds = new Set(group.members.map(member => member.buildingId));
  const inventory = groupInventorySummary(devices.filter(device => device.buildingId && memberIds.has(device.buildingId)));
  const count = inventory.active + inventory.inactive + inventory.other;
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [group.id]);
  useEffect(() => {
    const card = [...(content.current?.querySelectorAll<HTMLElement>('[data-group-site]') || [])].find(element => element.dataset.groupSite === focusBuildingId);
    card?.scrollIntoView({ block: 'nearest' });
  }, [focusBuildingId]);
  const line = group.lineStatus.status;
  return <section className={styles.focus} aria-label={`${group.name} grup topolojisi`}>
    <header className={styles.toolbar}>
      <Button variant="outline" size="sm" onClick={onClose} className="gap-1.5"><ArrowLeft size={15} />Tüm ağa dön</Button>
      <div className={styles.breadcrumb}><span>Ağ grubu</span><ChevronRight size={14} /><h2 ref={heading} tabIndex={-1}>{group.name}</h2></div>
      <div className={styles.actions}><Button variant="ghost" size="sm" onClick={onConnections} className="gap-1.5"><Link2 size={15} />Merkez bağlantıları</Button><Button variant="ghost" size="sm" onClick={onInspect} className="gap-1.5"><Info size={15} />Grup ayrıntıları</Button><Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs" onClick={onExpand} aria-label={expandedMap ? 'Tam ekrandan çık' : 'Tam ekran'} title={expandedMap ? 'Tam ekrandan çık · Esc' : 'Haritayı tam ekran yap'}>{expandedMap ? <Shrink size={16} /> : <Expand size={16} />}<span>{expandedMap ? 'Tam ekrandan çık' : 'Tam ekran'}</span></Button></div>
    </header>
    <div ref={element => { content.current = element; captureRef.current = element; }} className={styles.scroll} tabIndex={0} aria-label="Grup topolojisi içeriği">
      <div className={styles.root}>
        <div className={styles.source}>
          <span className={styles.icon}><Router size={23} aria-hidden="true" /></span>
          <div><p className={styles.eyebrow}>Merkez cihaz</p><button type="button" className={styles.sourceName} onClick={onOpenSource}>{group.sourceDevice.name}<ArrowUpRight size={14} /></button><code>{group.sourceDevice.managementIp || 'IP belirtilmemiş'}</code></div>
        </div>
        <div className={styles.uplink}><ArrowDown size={22} aria-hidden="true" /><span>Mantıksal merkez ilişkisi</span><SemanticBadge tone={line === 'UP' ? 'success' : line === 'DOWN' ? 'danger' : 'neutral'}>Hat: {line === 'UP' ? 'Açık' : line === 'DOWN' ? 'Kapalı' : 'Bilinmiyor'}</SemanticBadge><small>{group.sourcePort?.name || 'Merkez arayüzü henüz belirtilmemiş'}</small></div>
      </div>
      <section className={styles.group} aria-labelledby="focused-group-name">
        <div className={styles.groupHeading}>
          <span className={styles.cloud}><Cloud size={26} aria-hidden="true" /></span>
          <div><p className={styles.eyebrow}>{networkGroupKindLabel(group.kind)} ağı</p><h3 id="focused-group-name">{group.name}</h3><p>{group.members.length} konum <span aria-hidden="true">·</span> {count} cihaz</p></div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onClose} aria-label={`${group.name}: Grubu kapat`}><X size={14} />Grubu kapat</Button>
        </div>
        <div className={styles.membersHeading}>
          <div><h4><Building2 size={16} />Bağlı konumlar <span>{sites.length} / {group.members.length}</span></h4><p>{view === 'physical' ? 'Cihazı seçerek konum içindeki port bağlantılarını inceleyin.' : 'Bir konum seçerek cihazlarını ve port bağlantılarını inceleyin.'}</p></div>
          <div className={styles.search}><Search size={16} aria-hidden="true" /><Input aria-label="Ağ grubunda konum veya cihaz ara" placeholder="Konum, cihaz veya IP ara…" value={query} onChange={event => setQuery(event.target.value)} />{query && <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5 px-2 text-xs" aria-label="Grup aramasını temizle" onClick={() => setQuery('')}><X size={14} /><span>Temizle</span></Button>}</div>
        </div>
        {filtered && <p role="status" className={styles.filterNotice}>Genel harita filtreleri uygulanıyor. <button onClick={onClearFilters}>Filtreleri temizle</button></p>}
        <div className={styles.grid}>
          {sites.map(site => <article key={site.buildingId} className={styles.site} data-group-site={site.buildingId} data-focused={focusBuildingId === site.buildingId || undefined}>
            <button className={styles.siteHeading} onClick={() => onOpenSite(site.buildingId)} aria-label={`${site.name}: cihazları ve bağlantıları incele`}><span className={styles.siteIcon}><Building2 size={18} aria-hidden="true" /></span><span><strong>{site.name}</strong><small>{filtered ? `${site.visibleCount} / ${site.total}` : site.total} cihaz</small></span><ChevronRight size={16} aria-hidden="true" /></button>
            {view === 'physical' && <ul className={styles.devices}>{site.devices.map(device => <li key={device.id}><button onClick={() => onOpenSite(site.buildingId, device.id)} aria-label={`${device.name}: konumda göster`}><Server size={14} aria-hidden="true" /><span><strong>{device.name}</strong><code>{device.managementIp || 'IP belirtilmemiş'}</code></span><ChevronRight size={13} aria-hidden="true" /></button></li>)}{!site.devices.length && <li className={styles.noDevices}>Gösterilecek cihaz yok.</li>}</ul>}
          </article>)}
        </div>
        {!sites.length && <div role="status" className={styles.empty}>Arama veya filtrelere uygun konum bulunamadı.<Button variant="outline" size="sm" onClick={() => { setQuery(''); onClearFilters(); }}>Arama ve filtreleri temizle</Button></div>}
        <footer className={styles.note}><Info size={15} aria-hidden="true" /><p>Bu alan mantıksal grup üyeliğini gösterir. Gerçek port bağlantıları konum içinde incelenir. Cihaz envanteri: {inventory.active} aktif · {inventory.inactive} kapalı/hatalı · {inventory.other} diğer/bilinmiyor. Hat durumu ayrı ölçülür.</p></footer>
      </section>
    </div>
  </section>;
}
