// Server component - renders instantly during navigation to locations page

export default function LocationsLoading() {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-40 bg-muted rounded animate-pulse" />
        <div className="flex items-center gap-2">
          <div className="h-9 w-28 bg-muted rounded animate-pulse" />
          <div className="h-9 w-28 bg-muted rounded animate-pulse" />
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-4">
        <div className="h-4 w-16 bg-muted rounded animate-pulse" />
        <div className="h-4 w-4 bg-muted rounded animate-pulse" />
        <div className="h-4 w-24 bg-muted rounded animate-pulse" />
      </div>

      {/* Location cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 bg-muted rounded animate-pulse" />
              <div>
                <div className="h-4 w-32 bg-muted rounded animate-pulse mb-1" />
                <div className="h-3 w-20 bg-muted rounded animate-pulse" />
              </div>
            </div>
            <div className="h-32 w-full bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* 3D viewer placeholder */}
      <div className="rounded-lg border border-border bg-card h-64 flex items-center justify-center">
        <div className="h-12 w-12 bg-muted rounded-full animate-pulse" />
      </div>
    </div>
  );
}
