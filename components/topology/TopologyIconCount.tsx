'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

export interface HiddenTopologyIcon { id: string; name: string; description?: string }

export function TopologyIconCount({ shown, total, hiddenIcons, loading, hiddenReason = 'Etkin filtreler nedeniyle' }: { shown: number; total: number; hiddenIcons: ReadonlyArray<HiddenTopologyIcon>; loading?: boolean; hiddenReason?: string }) {
  const [open, setOpen] = useState(false);
  const hidden = Math.max(0, total - shown);
  const sortedIcons = useMemo(() => [...hiddenIcons].sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true, sensitivity: 'base' }) || a.id.localeCompare(b.id)), [hiddenIcons]);
  useEffect(() => {
    if (!open) return;
    // Handle Escape before the enclosing building dialog can dismiss itself.
    const closeList = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('keydown', closeList, true);
    return () => window.removeEventListener('keydown', closeList, true);
  }, [open]);
  return <span role="status" aria-label="Haritada gösterilen ve gizlenen ikon sayıları" aria-atomic="true" title="Filtrelere göre gösterilen / toplam ikon ve gizlenen ikon sayısı" className="inline-flex shrink-0 flex-col gap-0.5 whitespace-nowrap rounded-md border bg-card px-2.5 py-1 text-[11px] shadow-sm">
    <span className="flex items-center gap-1.5 leading-4"><span className="text-muted-foreground">Gösterilen</span><span className="font-medium tabular-nums">{loading ? '—' : shown}<span className="px-1 text-muted-foreground">/</span>{loading ? '—' : total}</span><span className="text-muted-foreground">ikon</span></span>
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><button type="button" disabled={loading || hidden === 0} aria-label={loading ? 'Gizlenen ikonlar yükleniyor' : `Gizlenen ${hidden} ikonu listele`} title={hidden ? 'Gizlenen ikonların adlarını göster' : 'Tüm ikonlar görünür'} className="flex self-start items-center gap-1 rounded text-[10px] leading-3 text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:text-muted-foreground disabled:no-underline">Gizlenen <span className="font-medium tabular-nums">{loading ? '—' : hidden}</span> ikon</button></PopoverTrigger>
      <PopoverContent side="top" align="end" aria-label="Gizlenen ikonlar" onEscapeKeyDown={event => { event.preventDefault(); event.stopPropagation(); setOpen(false); }} className="w-80 overflow-hidden whitespace-normal p-0">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3"><div><h3 className="text-sm font-semibold">Gizlenen ikonlar</h3><p className="mt-0.5 text-xs text-muted-foreground">{hiddenReason} gizlenen {sortedIcons.length} ikon</p></div><Button type="button" size="sm" variant="ghost" className="h-8 shrink-0 gap-1.5 px-2 text-xs" aria-label="Gizlenen ikon listesini kapat" onClick={() => setOpen(false)}><X size={14} aria-hidden="true" /><span>Kapat</span></Button></div>
        {sortedIcons.length ? <ul aria-label="Gizlenen ikon adları" tabIndex={0} className="max-h-64 divide-y overflow-y-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">{sortedIcons.map(icon => <li key={icon.id} className="px-4 py-2.5"><p className="break-words text-sm font-medium">{icon.name}</p>{icon.description && <p className="mt-0.5 break-words text-xs text-muted-foreground">{icon.description}</p>}</li>)}</ul> : <p role="status" className="px-4 py-4 text-sm text-muted-foreground">Gizlenen ikon yok.</p>}
      </PopoverContent>
    </Popover>
  </span>;
}
