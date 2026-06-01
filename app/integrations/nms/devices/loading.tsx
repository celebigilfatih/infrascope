// Server component - renders instantly during navigation to NMS devices page

export default function NmsDevicesLoading() {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-40 bg-muted rounded animate-pulse" />
        <div className="flex items-center gap-2">
          <div className="h-9 w-28 bg-muted rounded animate-pulse" />
          <div className="h-9 w-32 bg-muted rounded animate-pulse" />
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4">
            <div className="h-3 w-20 bg-muted rounded animate-pulse mb-2" />
            <div className="h-8 w-12 bg-muted rounded animate-pulse mb-1" />
            <div className="h-3 w-16 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Device table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="bg-muted/30 flex items-center gap-4 px-4 py-3 border-b">
          <div className="h-4 w-40 bg-muted rounded animate-pulse" />
          <div className="h-4 w-20 bg-muted rounded animate-pulse" />
          <div className="h-4 w-24 bg-muted rounded animate-pulse" />
          <div className="h-4 w-16 bg-muted rounded animate-pulse ml-auto" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border/30">
            <div className="h-4 w-40 bg-muted rounded animate-pulse" />
            <div className="h-5 w-20 bg-muted rounded-full animate-pulse" />
            <div className="h-4 w-24 bg-muted rounded animate-pulse" />
            <div className="h-4 w-16 bg-muted rounded animate-pulse ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
