'use client';

import { Check, Minus } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/utils';

export interface ConnectionTypeOption { value: string; label: string; color: string; count: number }

export function toggleConnectionType(hidden: Set<string>, value: string) {
  const next = new Set(hidden);
  if (next.has(value)) next.delete(value); else next.add(value);
  return next;
}

export function ConnectionTypeLegend({ label, options, hidden, onToggle, onReset, visibleCount, totalCount, labelsVisible, onLabelsChange }: {
  label: string; options: ConnectionTypeOption[]; hidden: Set<string>;
  onToggle: (value: string) => void; onReset: () => void; visibleCount: number; totalCount: number;
  labelsVisible: boolean; onLabelsChange: (visible: boolean) => void;
}) {
  const labelsId = useId();
  return <div role="group" aria-label={label} className="shrink-0 space-y-2 border-b border-border bg-background px-4 py-2 text-xs">
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 font-medium">Bağlantı renkleri</span>
      {options.map(option => {
        const shown = !hidden.has(option.value);
        const Icon = shown ? Check : Minus;
        return <button key={option.value} type="button" aria-label={option.label} aria-pressed={shown}
          title={`${option.label} · Bağlantıları ${shown ? 'gizle' : 'göster'}`}
          onClick={() => onToggle(option.value)}
          className={cn('inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2 py-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2', shown ? 'border-border bg-muted/40' : 'border-dashed text-muted-foreground')}>
          <Icon aria-hidden="true" className="h-3 w-3" />
          <span aria-hidden="true" className={cn('h-[3px] w-4 rounded-full', !shown && 'opacity-40')} style={{ backgroundColor: option.color }} />
          <span className={cn(!shown && 'line-through')}>{option.label}</span>
          <span aria-hidden="true" className="tabular-nums text-muted-foreground">{option.count}</span>
        </button>;
      })}
      <button type="button" disabled={!hidden.size} onClick={onReset} className="min-h-8 rounded-md px-2 text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default disabled:text-muted-foreground">Tümünü göster</button>
      <label htmlFor={labelsId} className="ml-auto inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-md border border-border px-2 hover:bg-muted" title="Çizgilerdeki bağlantı türü ve hız etiketlerini göster veya gizle">
        <input id={labelsId} type="checkbox" checked={labelsVisible} onChange={event => onLabelsChange(event.target.checked)} className="h-3.5 w-3.5 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" />
        Bağlantı etiketleri
      </label>
    </div>
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      <span role="status" aria-live="polite">{visibleCount} / {totalCount} bağlantı gösteriliyor{totalCount > 0 && visibleCount === 0 ? '. Seçili türlere uygun bağlantı yok.' : '.'}</span>
      <span>Türlere tıklayarak gösterin veya gizleyin. Düz: açık · Kesikli: diğer durumlar.</span>
    </div>
  </div>;
}
