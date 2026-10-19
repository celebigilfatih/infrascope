'use client';

import { Network } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HopDistanceLegend } from './HopDistanceBadge';

export function NeighborhoodToggle({ active, hasSelection, disabled, depth, hiddenHopDistances, hopDistances, onChange, onDepthChange, onHopToggle, onHopReset }: {
  active: boolean; hasSelection: boolean; disabled?: boolean; depth: 1 | 2;
  onChange: (active: boolean) => void; onDepthChange: (depth: 1 | 2) => void;
  hiddenHopDistances: ReadonlySet<number>; onHopToggle: (distance: 1 | 2) => void;
  hopDistances: ReadonlyMap<string, number>;
  onHopReset: () => void;
}) {
  return <div className="flex max-w-full flex-col items-end gap-2">
    <Button type="button" size="sm" variant={active ? 'secondary' : 'outline'} className="gap-2 shadow-sm" aria-pressed={active} disabled={disabled || (!active && !hasSelection)} title={!hasSelection && !active ? 'Önce haritadan veya aramadan bir bina ya da cihaz seçin' : active ? 'Genel haritadaki tüm ikonları yeniden göster' : 'Seçili ikonu ve seçilen derinlikteki bağlantılarını göster'} onClick={() => onChange(!active)}><Network size={15} aria-hidden="true" />{active ? 'Tümünü göster' : 'Seçili ve bağlıları göster'}</Button>
    {active && <div className="max-w-full rounded-md border bg-card shadow-sm"><label className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs">
      <span className="text-muted-foreground">Bağlantı derinliği</span>
      <select aria-label="Bağlantı derinliği" className="rounded border bg-background px-2 py-1 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={depth} disabled={disabled} onChange={event => onDepthChange(event.target.value === '2' ? 2 : 1)}>
        <option value="1">1 adım</option><option value="2">2 adım</option>
      </select>
    </label>{depth === 2 && <HopDistanceLegend hidden={hiddenHopDistances} distances={hopDistances} disabled={disabled} onToggle={onHopToggle} onReset={onHopReset} />}</div>}
  </div>;
}
