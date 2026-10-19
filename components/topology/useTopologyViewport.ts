'use client';

import { useCallback, useRef, useState } from 'react';
import { validTopologyViewport, type TopologyViewport } from '@/lib/topology/navigation-state';

export function useTopologyViewport() {
  const [savedViewport, setSavedViewport] = useState<TopologyViewport | null>(null);
  const retainedViewport = useRef<TopologyViewport | null>(null);
  const ready = useRef(false);
  const restoreViewport = useCallback((value: unknown) => {
    const viewport = validTopologyViewport(value);
    retainedViewport.current = viewport;
    setSavedViewport(viewport);
    ready.current = true;
  }, []);
  const captureViewport = useCallback((value: unknown) => {
    const viewport = validTopologyViewport(value);
    if (!ready.current || !viewport) return;
    retainedViewport.current = viewport;
    setSavedViewport(previous => previous?.x === viewport.x && previous.y === viewport.y && previous.zoom === viewport.zoom ? previous : viewport);
  }, []);
  // Explicit navigation may replace the retained camera; automatic layout must not.
  const releaseViewport = useCallback(() => { retainedViewport.current = null; setSavedViewport(null); }, []);
  return { savedViewport, retainedViewport, restoreViewport, captureViewport, releaseViewport };
}
