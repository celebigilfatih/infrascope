'use client';

import { useId, useMemo } from 'react';

const badgeTones = {
  1: 'border-primary bg-primary text-primary-foreground',
  2: 'border-primary/60 bg-card text-foreground',
};

export function HopDistanceBadge({ distance }: { distance?: number }) {
  if (distance !== 1 && distance !== 2) return null;
  const label = `Seçili ikona ${distance} adım uzaklıkta`;
  return <span role="img" aria-label={label} title={label} data-hop-distance={distance} className={`pointer-events-none absolute -top-1.5 left-1/2 z-10 grid h-5 w-5 translate-x-[-38px] place-items-center rounded-full border text-[11px] font-semibold leading-none shadow-xs ${badgeTones[distance]}`}>{distance}</span>;
}

export function HopDistanceLegend({ hidden, distances, disabled, onToggle, onReset }: { hidden: ReadonlySet<number>; distances: ReadonlyMap<string, number>; disabled?: boolean; onToggle: (distance: 1 | 2) => void; onReset: () => void }) {
  const legendId = useId();
  const counts = useMemo(() => {
    const result = { 1: 0, 2: 0 };
    for (const distance of distances.values()) if (distance === 1 || distance === 2) result[distance]++;
    return result;
  }, [distances]);
  return <div role="group" aria-label="Uzaklığa göre ikon filtreleri" className="border-t px-2.5 py-2 text-[11px]">
    <div className="flex items-center justify-between gap-2"><p className="text-muted-foreground">Seçili ikona uzaklık</p><button type="button" disabled={disabled || hidden.size === 0} title="1 ve 2 adım ikonlarını yeniden göster" onClick={onReset} className="min-h-6 rounded px-1 text-primary hover:bg-primary/5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:text-muted-foreground disabled:opacity-50">Filtreleri sıfırla</button></div>
    <ul className="mt-1 flex flex-wrap gap-1">
      {([{ distance: 1, label: 'Doğrudan bağlı' }, { distance: 2, label: 'Bir ikon üzerinden' }] as const).map(({ distance, label }) => <li key={distance}><button type="button" aria-label={`${distance} adım uzaklıktaki ikonlar`} aria-describedby={`${legendId}-${distance}-count`} aria-pressed={!hidden.has(distance)} title={`${distance} adım uzaklıktaki ikonları ${hidden.has(distance) ? 'göster' : 'gizle'}`} disabled={disabled} onClick={() => onToggle(distance)} className={`flex min-h-7 items-center gap-1.5 rounded-md border px-1.5 py-1 transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${hidden.has(distance) ? 'border-border bg-muted/40 text-muted-foreground' : 'border-primary/30 bg-primary/5 text-foreground'}`}><span aria-hidden="true" className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[10px] font-semibold leading-none ${hidden.has(distance) ? 'border-muted-foreground/40 bg-muted text-muted-foreground' : badgeTones[distance]}`}>{distance}</span><span className={hidden.has(distance) ? 'line-through' : ''}>{label}</span><span id={`${legendId}-${distance}-count`} className="rounded bg-background/80 px-1.5 font-medium tabular-nums text-muted-foreground">{counts[distance]}<span className="sr-only"> ikon</span></span></button></li>)}
    </ul>
    {hidden.has(1) && hidden.has(2) && <p role="status" className="mt-1 text-muted-foreground">Yalnız seçili ikon gösteriliyor.</p>}
  </div>;
}
