export type FirewallListQuery = {
  page: number;
  limit: number;
  search: string;
  filters: Readonly<Record<string, string>>;
};

export type FirewallListResult<T> = {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
};

function boundedInteger(value: string | null, fallback: number, maximum: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export function firewallListQueryFromUrl(
  url: string,
  allowedFilters: readonly string[] = []
): FirewallListQuery {
  const params = new URL(url).searchParams;
  const filters = Object.fromEntries(allowedFilters.flatMap((name) => {
    const value = params.get(name)?.trim().toLowerCase().slice(0, 64);
    return value ? [[name, value]] : [];
  }));
  return {
    page: boundedInteger(params.get('page'), 1, 100_000),
    limit: boundedInteger(params.get('limit'), 50, 100),
    search: (params.get('search') || '').trim().toLowerCase().slice(0, 120),
    filters,
  };
}

export function paginateFirewallItems<T>(params: {
  items: T[];
  query: FirewallListQuery;
  searchText: (item: T) => string;
  filter?: (item: T, filters: Readonly<Record<string, string>>) => boolean;
}): FirewallListResult<T> {
  const filtered = params.items.filter((item) => {
    if (params.filter && !params.filter(item, params.query.filters)) return false;
    return !params.query.search || params.searchText(item).toLowerCase().includes(params.query.search);
  });
  const offset = (params.query.page - 1) * params.query.limit;
  return {
    items: filtered.slice(offset, offset + params.query.limit),
    pagination: {
      page: params.query.page,
      limit: params.query.limit,
      total: filtered.length,
      hasMore: offset + params.query.limit < filtered.length,
    },
  };
}
