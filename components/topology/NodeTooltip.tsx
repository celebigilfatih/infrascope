'use client';

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Copy, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { uiLabel } from '@/lib/i18n/tr';
import { TopologyTooltipSurface } from './ConnectionTooltip';

type NodeSummary = { kind: 'building'; deviceCount: number; onShowDevices: () => void } | { kind: 'device'; deviceId: string; ipAddress?: string | null; deviceType?: string | null; onShowConnections: () => void };

export function NodeTooltip({ name, status, summary, connectionCount, visibleConnectionCount, ...props }: Omit<ComponentProps<typeof TopologyTooltipSurface>, 'children' | 'className'> & {
  name: string; status: ReactNode; connectionCount?: number; visibleConnectionCount?: number;
  summary: NodeSummary;
}) {
  const ipAddress = summary.kind === 'device' ? summary.ipAddress?.trim() || '' : '';
  const [copying, setCopying] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<'copied' | 'error' | null>(null);
  const copyRequest = useRef(0);
  useEffect(() => {
    copyRequest.current += 1;
    setCopying(false); setCopyFeedback(null);
    return () => { copyRequest.current += 1; };
  }, [ipAddress]);
  useEffect(() => {
    if (!copyFeedback) return;
    const timer = setTimeout(() => setCopyFeedback(null), 2500);
    return () => clearTimeout(timer);
  }, [copyFeedback]);
  const copyIp = async () => {
    if (!ipAddress || copying) return;
    const request = ++copyRequest.current;
    setCopying(true); setCopyFeedback(null);
    try {
      await navigator.clipboard.writeText(ipAddress);
      if (request === copyRequest.current) setCopyFeedback('copied');
    } catch {
      if (request === copyRequest.current) setCopyFeedback('error');
    } finally {
      if (request === copyRequest.current) setCopying(false);
    }
  };
  return <TopologyTooltipSurface {...props} className="w-[248px] space-y-2.5 p-3">
    <p className="wrap-break-word text-sm font-semibold leading-5">{name}</p>
    <div className="flex items-center justify-between gap-3 text-xs"><span className="text-muted-foreground">Durum</span>{status}</div>
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
      {summary.kind === 'building' ? <><dt className="text-muted-foreground">Cihaz sayısı</dt><dd className="text-right font-medium tabular-nums">{summary.deviceCount}</dd></> : <>
        <dt className="self-center text-muted-foreground">IP adresi</dt><dd className="flex min-w-0 flex-wrap items-center justify-end gap-1"><span className="min-w-0 text-right font-mono text-[11px] wrap-anywhere">{ipAddress || 'Belirtilmemiş'}</span>{ipAddress && <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5 px-2 text-xs" aria-label="IP adresini kopyala" title="IP adresini kopyala" aria-disabled={copying} aria-busy={copying} onClick={() => void copyIp()}>{copyFeedback === 'copied' ? <Check aria-hidden="true" size={13} className="text-primary" /> : <Copy aria-hidden="true" size={13} />}<span>{copyFeedback === 'copied' ? 'Kopyalandı' : 'Kopyala'}</span></Button>}</dd>
        <dt className="text-muted-foreground">Cihaz türü</dt><dd className="text-right font-medium wrap-anywhere">{summary.deviceType?.trim() ? uiLabel(summary.deviceType.trim()) : 'Belirtilmemiş'}</dd>
      </>}
    </dl>
    {copyFeedback && <p role={copyFeedback === 'error' ? 'alert' : 'status'} className={`text-xs ${copyFeedback === 'error' ? 'text-destructive' : 'text-primary'}`}>{copyFeedback === 'copied' ? 'IP adresi panoya kopyalandı.' : 'IP kopyalanamadı. Adresi seçerek kopyalayın.'}</p>}
    <div className="flex items-center justify-between gap-3 border-t pt-2.5 text-xs"><span className="flex items-center gap-1.5 text-muted-foreground"><Link2 aria-hidden="true" size={13} />Doğrudan bağlantı</span><strong className="tabular-nums">{connectionCount ?? 'Alınamadı'}</strong></div>
    {connectionCount !== undefined && visibleConnectionCount !== undefined && visibleConnectionCount < connectionCount && <p className="text-[11px] text-muted-foreground">{visibleConnectionCount} bağlantı haritada görünür</p>}
    {summary.kind === 'device' && <>
      <Button type="button" variant="outline" size="sm" className="h-8 w-full justify-between text-xs" onClick={summary.onShowConnections}>Bağlantıları göster<Link2 aria-hidden="true" size={14} /></Button>
      <Button asChild variant="outline" size="sm" className="h-8 w-full justify-between text-xs"><Link href={`/integrations/nms/devices/${encodeURIComponent(summary.deviceId)}`} prefetch={false}>Detayları aç<ArrowRight aria-hidden="true" size={14} /></Link></Button>
    </>}
    {summary.kind === 'building' && <Button type="button" variant="outline" size="sm" className="h-8 w-full justify-between text-xs" onClick={summary.onShowDevices}>Cihazları göster<ArrowRight aria-hidden="true" size={14} /></Button>}
  </TopologyTooltipSurface>;
}
