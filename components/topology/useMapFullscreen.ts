'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MapFullscreen, type MapFullscreenState } from '@/lib/topology/fullscreen';

export function useMapFullscreen() {
  const controller = useRef<MapFullscreen | null>(null);
  const [state, setState] = useState<MapFullscreenState>({ expanded: false, fallback: false, busy: false });
  useEffect(() => {
    const instance = new MapFullscreen(document, setState); controller.current = instance;
    return () => { instance.dispose(); controller.current = null; };
  }, []);
  const toggle = useCallback(() => { void controller.current?.toggle(); }, []);
  const close = useCallback(() => { void controller.current?.close(); }, []);
  return { ...state, toggle, close };
}
