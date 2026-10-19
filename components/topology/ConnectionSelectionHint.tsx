'use client';

export function ConnectionSelectionHint({ name, count, onClear, compact = false, onlyConnected = false }: { name: string; count: number; onClear: () => void; compact?: boolean; onlyConnected?: boolean }) {
  return <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-4 py-1.5 text-xs">
    <span role="status" className="min-w-0 flex-1 break-words"><strong className="font-medium">{name}</strong><span className="text-muted-foreground"> · {count ? `${count} bağlantı${compact ? '' : ' vurgulanıyor'}` : 'Görünür bağlantısı yok'}<span className={compact ? 'sr-only' : undefined}> · {onlyConnected ? 'Diğer ikon ve çizgiler gizli' : 'Diğer ikon ve çizgiler soluk'}</span></span></span>
    <button type="button" onClick={onClear} className="min-h-7 rounded-md px-2 text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Vurguyu temizle</button>
  </div>;
}
