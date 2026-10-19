'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FocusEventHandler, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, EthernetPort, Link2 } from 'lucide-react';

interface Anchor { x: number; y: number }

export function useConnectionTooltip(onOpenChange?: (open: boolean) => void) {
  const id = useId();
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focused = useRef(false);
  const overTooltip = useRef(false);
  const dismissed = useRef(false);
  const container = useRef<HTMLElement | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  useLayoutEffect(() => { onOpenChangeRef.current = onOpenChange; });
  const cancelClose = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const close = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null; overTooltip.current = false; focused.current = false; setAnchor(null);
  }, []);
  const show = (event: React.MouseEvent) => {
    cancelClose();
    container.current = event.currentTarget.closest<HTMLElement>('[role="dialog"]');
    if (!dismissed.current) {
      onOpenChangeRef.current?.(true);
      setAnchor({ x: event.clientX, y: event.clientY });
      return true;
    }
    return false;
  };
  const enter = (event: React.MouseEvent) => { dismissed.current = false; show(event); };
  const leave = () => {
    dismissed.current = false;
    cancelClose();
    if (!focused.current && !overTooltip.current) timer.current = setTimeout(() => setAnchor(null), 150);
  };
  const focus = (event: React.FocusEvent<HTMLElement>) => {
    focused.current = true; dismissed.current = false; cancelClose();
    onOpenChangeRef.current?.(true);
    const rect = event.currentTarget.getBoundingClientRect();
    container.current = event.currentTarget.closest<HTMLElement>('[role="dialog"]');
    setAnchor({ x: rect.right, y: rect.bottom });
  };
  const blur = () => { focused.current = false; leave(); };
  const keepOpen = () => { overTooltip.current = true; cancelClose(); onOpenChangeRef.current?.(true); };
  const leaveTooltip = () => { overTooltip.current = false; leave(); };
  const focusTooltip = () => { focused.current = true; cancelClose(); };
  const blurTooltip: FocusEventHandler<HTMLDivElement> = event => {
    if (!event.currentTarget.contains(event.relatedTarget)) { focused.current = false; leave(); }
  };
  const open = !!anchor;
  useEffect(() => { if (!open) onOpenChangeRef.current?.(false); }, [open]);
  useEffect(() => () => { onOpenChangeRef.current?.(false); }, []);
  useEffect(() => {
    if (!open) return;
    const hide = () => { overTooltip.current = false; focused.current = false; setAnchor(null); };
    const hideOnScroll = (event: Event) => { if (!(event.target instanceof Element && event.target.closest('[role="tooltip"]'))) hide(); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); dismissed.current = true; hide();
    };
    window.addEventListener('keydown', escape, true);
    window.addEventListener('resize', hide);
    window.addEventListener('scroll', hideOnScroll, true);
    window.addEventListener('wheel', hideOnScroll, true);
    return () => {
      window.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', hide);
      window.removeEventListener('scroll', hideOnScroll, true);
      window.removeEventListener('wheel', hideOnScroll, true);
    };
  }, [open]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { id, anchor, container: container.current, enter, show, leave, focus, blur, close, keepOpen, leaveTooltip, focusTooltip, blurTooltip };
}

export interface ConnectionTooltipDetails {
  title: string;
  status?: string;
  source: { name?: string; location?: string; port?: string };
  target: { name?: string; location?: string; port?: string };
  type?: string;
  bandwidth?: string;
  note?: string;
}

export function TopologyTooltipSurface({ id, anchor, container, children, className = 'w-[320px] space-y-3 p-4', onMouseEnter, onMouseLeave, onFocusCapture, onBlurCapture }: {
  id: string; anchor: Anchor | null; children: ReactNode; className?: string;
  container?: HTMLElement | null;
  onMouseEnter: () => void; onMouseLeave: () => void;
  onFocusCapture?: FocusEventHandler<HTMLDivElement>; onBlurCapture?: FocusEventHandler<HTMLDivElement>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const bounds = container?.getBoundingClientRect();
    const minX = Math.max(12, (bounds?.left || 0) + 12), minY = Math.max(12, (bounds?.top || 0) + 12);
    const maxX = Math.min(window.innerWidth, bounds?.right ?? window.innerWidth) - 12;
    const maxY = Math.min(window.innerHeight, bounds?.bottom ?? window.innerHeight) - 12;
    const left = anchor.x + 14 + rect.width <= maxX ? anchor.x + 14 : anchor.x - rect.width - 14;
    const top = anchor.y + 14 + rect.height <= maxY ? anchor.y + 14 : anchor.y - rect.height - 14;
    setPosition({ left: Math.max(minX, Math.min(left, maxX - rect.width)) - (bounds?.left || 0) - (container?.clientLeft || 0) + (container?.scrollLeft || 0), top: Math.max(minY, Math.min(top, maxY - rect.height)) - (bounds?.top || 0) - (container?.clientTop || 0) + (container?.scrollTop || 0) });
  }, [anchor, children, container]);
  if (!anchor) return null;
  return createPortal(<div ref={ref} id={id} role="tooltip" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onFocusCapture={onFocusCapture} onBlurCapture={onBlurCapture} onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} className={`z-[1020] max-w-[calc(100vw-24px)] overflow-y-auto rounded-xl border bg-popover text-popover-foreground shadow-xl ${className}`} style={{ ...position, position: container ? 'absolute' : 'fixed', pointerEvents: 'auto', maxWidth: container ? Math.max(0, container.clientWidth - 24) : undefined, maxHeight: container ? Math.max(0, container.clientHeight - 24) : 'calc(100dvh - 24px)' }}>{children}</div>, container || document.body);
}

export function ConnectionTooltip({ details, ...props }: Omit<Parameters<typeof TopologyTooltipSurface>[0], 'children' | 'className'> & { details?: ConnectionTooltipDetails }) {
  if (!props.anchor || !details) return null;
  const endpoint = (source: boolean) => {
    const endpoint = source ? details.source : details.target;
    return <div className="min-w-0 space-y-1">
      <p className="break-words text-xs text-muted-foreground">{source ? 'Kaynak' : 'Hedef'}{endpoint.location ? ` · ${endpoint.location}` : ''}</p>
      <p className="break-words text-sm font-semibold">{endpoint.name || 'Cihaz belirtilmemiş'}</p>
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><EthernetPort aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="break-all">{endpoint.port || 'Port belirtilmemiş'}</span></p>
    </div>;
  };
  return <TopologyTooltipSurface {...props}>
    <p className="flex items-center gap-2 text-sm font-semibold"><Link2 aria-hidden="true" className="h-4 w-4 text-primary" />{details.title}</p>
    {details.status && <p className="text-xs text-muted-foreground">{details.status}</p>}
    {endpoint(true)}<ArrowDown aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />{endpoint(false)}
    <dl className="grid grid-cols-2 gap-3 border-t pt-3 text-xs"><div><dt className="text-muted-foreground">Bağlantı türü</dt><dd className="mt-1 break-words font-semibold">{details.type || 'Tür belirtilmemiş'}</dd></div><div><dt className="text-muted-foreground">Bağlantı hızı</dt><dd className="mt-1 break-words font-semibold">{details.bandwidth?.trim() || 'Hız belirtilmemiş'}</dd></div></dl>
    {details.note && <p className="text-xs text-muted-foreground">{details.note}</p>}
  </TopologyTooltipSurface>;
}
