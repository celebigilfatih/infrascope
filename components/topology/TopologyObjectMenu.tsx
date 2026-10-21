'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, X } from 'lucide-react';

export type TopologyObject = { kind: 'building' | 'device' | 'building-connection' | 'device-connection'; id: string };
export type MenuEvent = MouseEvent | KeyboardEvent;
export interface TopologyAction { id: string; label: string; run: () => void; disabled?: boolean; keepFocus?: boolean }
interface MenuState { target: TopologyObject; rect: DOMRect; origin: HTMLElement | SVGElement | null }
const useMenuLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function useTopologyObjectMenu() {
  const [state, setState] = useState<MenuState | null>(null);
  const [feedback, setFeedback] = useState('');
  const close = useCallback(() => setState(null), []);
  const open = useCallback((target: TopologyObject, event: MenuEvent) => {
    event.preventDefault(); event.stopPropagation();
    const element = event.target instanceof Element ? event.target.closest('button, .react-flow__node, .react-flow__edge') : null;
    const origin = element instanceof HTMLElement || element instanceof SVGElement ? element : null;
    const rect = origin?.getBoundingClientRect() || event.currentTarget.getBoundingClientRect();
    const pointer = event.type === 'contextmenu' && 'clientX' in event && (event.clientX !== 0 || event.clientY !== 0);
    setFeedback('');
    setState({ target, origin, rect: new DOMRect(pointer ? event.clientX : rect.left, pointer ? event.clientY : rect.bottom, 0, 0) });
  }, []);
  const copyAddress = useCallback((address: string) => {
    void (async () => {
      try { await navigator.clipboard.writeText(address); setFeedback('Yönetim IP adresi kopyalandı.'); }
      catch { setFeedback(`IP adresi kopyalanamadı. Adres: ${address}`); }
    })();
  }, []);
  useEffect(() => { if (!state) return; window.addEventListener('resize', close); return () => window.removeEventListener('resize', close); }, [state, close]);
  return { state, open, close, feedback, clearFeedback: () => setFeedback(''), copyAddress };
}

export function TopologyMenuButton({ name, onOpen }: { name: string; onOpen: (event: MouseEvent<HTMLButtonElement>) => void }) {
  return <button type="button" className="nodrag nopan nowheel inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border bg-card px-2 text-xs font-medium text-foreground shadow-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ pointerEvents: 'all' }} aria-label={`${name}: işlemler`} aria-haspopup="menu" onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onClick={onOpen}><MoreHorizontal size={14} aria-hidden="true" /><span>İşlemler</span></button>;
}

export function TopologyObjectMenu({ menu, name, actions }: { menu: ReturnType<typeof useTopologyObjectMenu>; name: string; actions: TopologyAction[] }) {
  const content = useRef<HTMLDivElement>(null), restoreFocus = useRef(true);
  const [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 600 });
  const state = menu.state;
  const host = state?.origin?.closest<HTMLElement>('[role="dialog"]') || (typeof document !== 'undefined' ? document.body : null);
  const focusItem = (index: number) => {
    const items = content.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)');
    if (items?.length) items[(index + items.length) % items.length].focus({ preventScroll: true });
  };
  useMenuLayoutEffect(() => {
    if (!state || !host || !content.current) return;
    restoreFocus.current = true;
    const nested = host !== document.body, bounds = nested ? host.getBoundingClientRect() : new DOMRect(0, 0, innerWidth, innerHeight);
    const scaleX = nested ? bounds.width / host.offsetWidth : 1, scaleY = nested ? bounds.height / host.offsetHeight : 1;
    const size = content.current.getBoundingClientRect(), padding = 12;
    const x = Math.max(bounds.left + padding, Math.min(state.rect.x, bounds.right - size.width - padding));
    const y = Math.max(bounds.top + padding, Math.min(state.rect.y, bounds.bottom - size.height - padding));
    setPosition({ left: (x - (nested ? bounds.left : 0)) / scaleX - (nested ? host.clientLeft : 0), top: (y - (nested ? bounds.top : 0)) / scaleY - (nested ? host.clientTop : 0), maxHeight: Math.max(44, (bounds.height - padding * 2) / scaleY) });
    content.current.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !content.current?.contains(event.target)) { restoreFocus.current = false; menu.close(); } };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); menu.close(); } };
    const scroll = (event: Event) => { if (!(event.target instanceof Node) || !content.current?.contains(event.target)) menu.close(); };
    document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', escape, true); window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape, true); window.removeEventListener('scroll', scroll, true);
      const origin = state.origin;
      if (restoreFocus.current && origin?.isConnected) {
        // Let the portal removal and the enclosing dialog's focus scope settle
        // before restoring the trigger. A newly opened menu keeps its own focus.
        requestAnimationFrame(() => {
          if (origin.isConnected && !host.querySelector('[role="menu"]')) origin.focus({ preventScroll: true });
        });
      }
    };
  }, [state, host, menu.close]);
  return <>
    {state && host && actions.length > 0 && createPortal(<div ref={content} role="menu" aria-label={name + ': işlemler'} className="fixed z-[1050] w-64 max-w-[calc(100vw-24px)] overflow-y-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-md outline-none" style={position} onContextMenu={event => event.preventDefault()} onKeyDown={event => {
      const items = Array.from(content.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') || []), index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); focusItem(event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : index + (event.key === 'ArrowDown' ? 1 : -1)); }
      if (event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); menu.close(); }
    }}>
      <p className="break-words border-b px-3 py-2 text-xs font-semibold text-muted-foreground">{name}</p>
      {actions.map(action => <button key={action.id} type="button" role="menuitem" tabIndex={-1} disabled={action.disabled} className="flex min-h-[44px] w-full items-center rounded-md px-3 py-2 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none disabled:opacity-50" onClick={() => { restoreFocus.current = !!action.keepFocus; menu.close(); action.run(); }}>{action.label}</button>)}
    </div>, host)}
    {menu.feedback && <div role="status" className="fixed bottom-4 right-4 z-[1100] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-lg"><span className="break-all">{menu.feedback}</span><button type="button" className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Kopyalama bildirimini kapat" onClick={menu.clearFeedback}><X size={14} /><span>Kapat</span></button></div>}
  </>;
}

export function topologyMenuShortcut(event: KeyboardEvent, resolve: (kind: 'node' | 'edge', id: string) => TopologyObject | undefined, open: (target: TopologyObject, event: MenuEvent) => void) {
  if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
  const element = event.target instanceof Element ? event.target.closest('.react-flow__node, .react-flow__edge') : null;
  // React Flow exposes node IDs directly, while edge wrappers use a test ID.
  const id = element?.getAttribute('data-id') || element?.getAttribute('data-testid')?.replace(/^rf__edge-/, '');
  if (!id) return;
  const target = resolve(element!.classList.contains('react-flow__node') ? 'node' : 'edge', id);
  if (target) open(target, event);
}
