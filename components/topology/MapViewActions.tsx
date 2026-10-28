'use client';
import { Expand, Scan, Shrink } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function MapViewActions({ onFit, expanded, onExpand, disabled = false }: {
  onFit: () => void; expanded: boolean; onExpand: () => void; disabled?: boolean;
}) {
  return <>
    <Button type="button" variant="outline" className="shrink-0 gap-1.5 text-xs" disabled={disabled} onClick={onFit}><Scan size={16} aria-hidden="true" />Ekrana sığdır</Button>
    <Button type="button" variant="outline" className="shrink-0 gap-1.5 text-xs" onClick={onExpand} aria-label={expanded ? 'Tam ekrandan çık' : 'Haritayı tam ekran yap'} title={expanded ? 'Tam ekrandan çık · Esc' : 'Haritayı tam ekran yap'}>{expanded ? <Shrink size={16} aria-hidden="true" /> : <Expand size={16} aria-hidden="true" />}<span>{expanded ? 'Tam ekrandan çık' : 'Tam ekran'}</span></Button>
  </>;
}
