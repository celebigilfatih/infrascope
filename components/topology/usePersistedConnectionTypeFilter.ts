'use client';

import { useEffect, useState, type SetStateAction } from 'react';

const EMPTY_TYPES = new Set<string>();

export function usePersistedConnectionTypeFilter(scope: string, allowedTypes: readonly string[]) {
  const storageKey = `infrascope:topology:connection-types:v1:${scope}`;
  const [state, setState] = useState<{ key: string | null; hidden: Set<string> }>({ key: null, hidden: EMPTY_TYPES });

  useEffect(() => {
    let hidden = new Set<string>();
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || 'null');
      if (saved?.version === 1 && Array.isArray(saved.hiddenTypes)) {
        hidden = new Set(saved.hiddenTypes.filter((type: unknown): type is string => typeof type === 'string' && allowedTypes.includes(type)));
      }
    } catch { /* Storage may be unavailable or contain an invalid preference. */ }
    setState({ key: storageKey, hidden });
  }, [storageKey, allowedTypes]);

  useEffect(() => {
    // Wait for the saved selection before writing the initial render's default.
    if (state.key !== storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ version: 1, hiddenTypes: [...state.hidden] }));
    } catch { /* Keep filtering usable for this visit when storage is unavailable. */ }
  }, [storageKey, state]);

  const setHidden = (update: SetStateAction<Set<string>>) => setState(previous => ({
    key: storageKey,
    hidden: typeof update === 'function' ? update(previous.key === storageKey ? previous.hidden : EMPTY_TYPES) : update,
  }));

  return [state.key === storageKey ? state.hidden : EMPTY_TYPES, setHidden] as const;
}
