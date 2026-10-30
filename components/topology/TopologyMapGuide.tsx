'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/** Kept inside the map's fullscreen host; the shared Popover portal follows that host. */
export function TopologyMapGuide({ children, device = false, open, onOpenChange }: { children: ReactNode; device?: boolean; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const change = useCallback((value: boolean) => { setInternalOpen(value); onOpenChange?.(value); }, [onOpenChange]);
  useEffect(() => {
    // Native Escape can be consumed by the browser before Radix sees a key event.
    // Close the guide on native exit too, so its modal layer cannot hide controls.
    const sync = () => { if (!document.fullscreenElement) change(false); };
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, [change]);
  return <Popover modal open={open ?? internalOpen} onOpenChange={change}><PopoverTrigger asChild>
    <Button size="sm" variant="outline" className="gap-1.5 bg-card shadow-xs" aria-label={device ? 'Bina harita rehberi' : 'Harita rehberi'}><Info size={15} aria-hidden="true" />Harita rehberi</Button>
  </PopoverTrigger><PopoverContent align="end" side="bottom" aria-label={device ? 'Cihaz haritası rehberi' : 'Topoloji harita rehberi'} className="w-[min(480px,calc(100vw-2rem))] max-h-[65dvh] overflow-y-auto p-0" onEscapeKeyDown={event => { event.stopPropagation(); }}>
    <div className="space-y-3 border-b p-4 text-xs"><p className="text-sm font-semibold">Haritayı okuyun</p>
      <div className="flex items-center gap-2"><span aria-hidden="true" className="w-7 border-t-2 border-violet-500" />Fiziksel bağlantı</div>
      {!device && <div className="flex items-center gap-2"><span aria-hidden="true" className="w-7 border-t-2 border-dashed border-teal-600" />Mantıksal ağ grubu · Fiziksel kablo değildir</div>}
      {!device && <p className="text-muted-foreground">Kapalı ağ gruplarının iç bağlantıları ana haritada çizilmez. İncelemek için grubun “Grubu aç” düğmesini kullanın.</p>}
      <p><span className="font-medium">Durum bilinmiyor:</span> Erişilebilirlik doğrulanmamış; arıza anlamına gelmez. Durumu çizgi veya nesne ayrıntılarından inceleyin.</p>
      <p className="text-muted-foreground">Boş alanı sürükleyerek gezinin; aramayla odaklanın. Taşıma ve bağlantı eklemek için Haritayı düzenle’yi seçin. Konumlar otomatik kaydedilir.</p>
    </div>
    {children}
  </PopoverContent></Popover>;
}
