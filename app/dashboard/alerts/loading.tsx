// Server component - renders instantly during navigation to alerts page

export default function AlertsLoading() {
  return (
    <div className="flex-1 overflow-y-auto">
      {/* Stats bar */}
      <div className="border-b border-border bg-card/50 px-6 py-4">
        <div className="flex items-center gap-3 flex-wrap">
          {['Tumu', 'Kritik', 'Yuksek', 'Orta', 'Dusuk', 'Bilgi'].map((_, i) => (
            <div key={i} className="h-8 w-20 bg-muted rounded-full animate-pulse" />
          ))}
          <div className="ml-auto h-8 w-64 bg-muted rounded animate-pulse" />
        </div>
      </div>

      {/* Severity filter chips */}
      <div className="px-6 pt-4 flex gap-2">
        {['Tumu', 'Firewall', 'Switch', 'VMware'].map((_, i) => (
          <div key={i} className="h-8 w-24 bg-muted rounded animate-pulse" />
        ))}
      </div>

      {/* Table */}
      <div className="px-6 py-4">
        <div className="rounded-lg border border-border overflow-hidden">
          {/* Table header */}
          <div className="bg-muted/30 flex items-center gap-4 px-4 py-3 border-b">
            <div className="h-4 w-4 bg-muted rounded animate-pulse" />
            <div className="h-4 w-32 bg-muted rounded animate-pulse" />
            <div className="h-4 w-16 bg-muted rounded animate-pulse" />
            <div className="h-4 w-48 bg-muted rounded animate-pulse" />
            <div className="h-4 w-24 bg-muted rounded animate-pulse ml-auto" />
            <div className="h-4 w-20 bg-muted rounded animate-pulse" />
          </div>
          {/* Table rows */}
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border/30">
              <div className="h-4 w-4 bg-muted rounded animate-pulse" />
              <div className="h-4 w-32 bg-muted rounded animate-pulse" />
              <div className="h-5 w-16 bg-muted rounded-full animate-pulse" />
              <div className="h-4 w-48 bg-muted rounded animate-pulse" />
              <div className="h-4 w-24 bg-muted rounded animate-pulse ml-auto" />
              <div className="h-7 w-16 bg-muted rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
