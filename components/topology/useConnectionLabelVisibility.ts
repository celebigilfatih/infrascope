'use client';

import { useEffect, useState } from 'react';

export function useConnectionLabelVisibility(scope: string) {
  const storageKey = `infrascope:topology:connection-labels:v1:${scope}`;
  const [state, setState] = useState<{ key: string | null; visible: boolean }>({ key: null, visible: true });

  useEffect(() => {
    let visible = true;
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || 'null');
      if (saved?.version === 1 && typeof saved.showLabels === 'boolean') visible = saved.showLabels;
    } catch { /* Invalid or unavailable storage uses the default visible labels. */ }
    setState({ key: storageKey, visible });
  }, [storageKey]);

  useEffect(() => {
    if (state.key !== storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ version: 1, showLabels: state.visible }));
    } catch { /* The control still works for this visit without persistent storage. */ }
  }, [storageKey, state]);

  return [state.key === storageKey ? state.visible : true,
    (visible: boolean) => setState({ key: storageKey, visible })] as const;
}
