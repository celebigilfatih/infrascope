'use client';

import { uiError } from '@/lib/i18n/tr';
import { useEffect, useRef, useState } from 'react';
import { Search, Server, TriangleAlert, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { dashboardGet, incidentLabel } from '@/lib/dashboard/presentation';
import styles from './dashboard.module.css';
interface SearchData {
  devices: Array<{ id: string; name: string; managementIp: string | null; nmsDeviceId: number | null }>;
  incidents: Array<{ id: string; title: string; alarm: { code: string } }>;
}
export function DashboardSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); input.current?.focus(); } };
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('keydown', keyboard); document.addEventListener('mousedown', outside);
    return () => { document.removeEventListener('keydown', keyboard); document.removeEventListener('mousedown', outside); };
  }, []);
  useEffect(() => {
    setResults(null); setError(uiError('')); setSelected(0);
    if (query.trim().length < 2) { setLoading(false); return; }
    const controller = new AbortController(); setLoading(true);
    const timer = setTimeout(() => {
      dashboardGet<SearchData>('/api/dashboard/search', { q: query.trim() }, controller.signal)
        .then(value => { setResults(value); setLoading(false); })
        .catch(reason => { if (!controller.signal.aborted) { setError(uiError(reason.message)); setLoading(false); } });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  const options = [
    ...(results?.devices || []).map(device => ({ id: `device-${device.id}`, title: device.name, detail: device.managementIp || 'Envanter cihazı', icon: Server,
      action: () => device.nmsDeviceId !== null ? window.dispatchEvent(new CustomEvent('dashboard:device', { detail: { id: device.id } })) : router.push(`/devices/${encodeURIComponent(device.id)}`) })),
    ...(results?.incidents || []).map(incident => ({ id: `incident-${incident.id}`, title: incidentLabel(incident.alarm.code, incident.title), detail: incident.title, icon: TriangleAlert,
      action: () => window.dispatchEvent(new CustomEvent('dashboard:incident', { detail: { id: incident.id } })) })),
  ];
  const choose = (index: number) => { options[index]?.action(); setOpen(false); input.current?.blur(); };
  return <div className={styles.search} ref={root}>
    <Search size={18} className={styles.searchIcon} aria-hidden="true" />
    <input ref={input} className={styles.searchInput} value={query} maxLength={100} placeholder="Cihaz, IP veya alarm ara…" aria-label="Cihaz, IP veya alarm ara" role="combobox" aria-controls="dashboard-search-results" aria-expanded={open && query.trim().length >= 2} aria-autocomplete="list" aria-activedescendant={open && options[selected] ? options[selected].id : undefined}
      onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); }}
      onKeyDown={event => {
        if (event.key === 'Escape') setOpen(false);
        if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setSelected(index => Math.max(0, Math.min(index + 1, options.length - 1))); }
        if (event.key === 'ArrowUp') { event.preventDefault(); setSelected(index => Math.max(0, index - 1)); }
        if (event.key === 'Enter' && open) { event.preventDefault(); choose(selected); }
      }} />
    {query && <button onClick={() => { setQuery(''); input.current?.focus(); }} aria-label="Aramayı temizle" className="absolute right-2 top-3 text-slate-400"><X size={16} /></button>}
    {open && query.trim().length >= 2 && <div id="dashboard-search-results" role="listbox" aria-label="Arama sonuçları" className={styles.searchResults}>
      {loading ? <p className={styles.searchGroup} role="status">Aranıyor…</p> : error ? <p className={styles.searchGroup} role="status">{uiError(error)}</p> : options.length === 0 ? <p className={styles.searchGroup}>Sonuç bulunamadı.</p> : options.map((option, index) => <button key={option.id} id={option.id} role="option" aria-selected={selected === index} className={styles.searchOption} onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}><option.icon size={18} aria-hidden="true" /><span>{option.title}<small>{option.detail}</small></span></button>)}
    </div>}
  </div>;
}
