'use client';

import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
});

/**
 * SWR-backed data fetching hook.
 * - Deduplicates identical requests across components
 * - Revalidates on focus by default (stale-while-revalidate)
 * - Caches in-memory, survives re-renders
 */
export function useApi<T = unknown>(
  url: string | null,
  options?: {
    refreshInterval?: number;
    revalidateOnFocus?: boolean;
    dedupingInterval?: number;
    onError?: (err: Error) => void;
  },
) {
  const { data, error, isLoading, mutate } = useSWR<T>(
    url,
    fetcher,
    {
      revalidateOnFocus: options?.revalidateOnFocus ?? true,
      refreshInterval: options?.refreshInterval ?? 0,
      dedupingInterval: options?.dedupingInterval ?? 5000,
      onError: options?.onError,
    },
  );

  return {
    data: data ?? null,
    error: error ?? null,
    isLoading,
    mutate,
  };
}
