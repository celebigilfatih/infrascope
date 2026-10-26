'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Anchor } from '@radix-ui/react-popover';
import { Building2, Cloud, Search, Server, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent } from '@/components/ui/popover';
import { topologySearchMatches, type TopologySearchItem } from '@/lib/topology/search';
import { cn } from '@/lib/utils';

export function TopologySearch({ items, onSelect, label, placeholder, disabled, emptyMessage = 'Eşleşen bina veya cihaz bulunamadı.' }: {
  items: TopologySearchItem[]; onSelect: (item: TopologySearchItem) => void; label: string; placeholder: string; disabled?: boolean; emptyMessage?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => topologySearchMatches(items, query), [items, query]);
  const results = matches.slice(0, 20);
  const choose = (item: TopologySearchItem) => { setQuery(item.name); setOpen(false); onSelect(item); };
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active]);
  useEffect(() => {
    if (!open || !query.trim()) return;
    // Close search before enclosing dialogs or the expanded map handle Escape.
    const closeSearch = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); }
    };
    window.addEventListener('keydown', closeSearch, true);
    return () => window.removeEventListener('keydown', closeSearch, true);
  }, [open, query]);

  return <Popover open={open && !!query.trim() && !disabled} onOpenChange={setOpen}>
    <Anchor asChild><div className="relative min-w-0 flex-1">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
      <Input ref={input} role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={open && !!query.trim() && !disabled}
        aria-controls={open && query.trim() ? `${id}-results` : undefined} aria-activedescendant={open && results[active] ? `${id}-${active}` : undefined}
        value={query} disabled={disabled} placeholder={placeholder} className="pl-9 pr-24"
        onFocus={() => { if (query.trim()) setOpen(true); }}
        onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true); }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            setActive(previous => results.length ? (previous + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length : 0);
          } else if (event.key === 'Enter' && open && results[active]) { event.preventDefault(); choose(results[active]); }
          else if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
          else if (event.key === 'Tab') setOpen(false);
        }} />
      {query && <button type="button" aria-label={`${label}: aramayı temizle`} className="absolute right-1 top-1 inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary" onClick={() => { setQuery(''); setOpen(false); input.current?.focus(); }}><X size={14} /><span>Temizle</span></button>}
    </div></Anchor>
    <PopoverContent role="presentation" align="start" className="pointer-events-auto z-1100 max-h-80 overflow-y-auto p-1" style={{ width: 'var(--radix-popover-trigger-width)' }}
      onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()}>
      <p role="status" className="px-3 py-2 text-xs text-muted-foreground">{matches.length ? `${matches.length} sonuç${matches.length > 20 ? ' · İlk 20 gösteriliyor, aramayı daraltın.' : ' · Seçerek haritada odaklanın.'}` : emptyMessage}</p>
      <div ref={list} role="listbox" id={`${id}-results`} aria-label={`${label}: sonuçlar`}>
        {results.map((item, index) => { const Icon = item.kind === 'building' ? Building2 : item.kind === 'networkGroup' ? Cloud : Server; return <button key={`${item.kind}-${item.id}`} id={`${id}-${index}`} type="button" role="option" aria-selected={active === index} tabIndex={-1}
          onMouseDown={event => event.preventDefault()} onMouseMove={() => setActive(index)} onClick={() => choose(item)}
          className={cn('flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted', active === index && 'bg-muted')}>
          <Icon aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-primary" /><span className="min-w-0"><strong className="block wrap-break-word font-medium">{item.name}</strong><small className="block wrap-break-word text-xs text-muted-foreground">{item.kind === 'building' ? 'Bina' : item.kind === 'networkGroup' ? 'Ağ grubu' : 'Cihaz'}{item.description ? ` · ${item.description}` : ''}</small></span>
        </button>; })}
      </div>
    </PopoverContent>
  </Popover>;
}
