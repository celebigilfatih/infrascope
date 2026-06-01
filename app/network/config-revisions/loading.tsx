// Server component - renders instantly during navigation to config-revisions page

export default function ConfigRevisionsLoading() {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-56 bg-muted rounded animate-pulse" />
        <div className="h-9 w-28 bg-muted rounded animate-pulse" />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-8 w-32 bg-muted rounded animate-pulse" />
        <div className="h-8 w-24 bg-muted rounded animate-pulse" />
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="bg-muted/30 flex items-center gap-4 px-4 py-3 border-b">
          <div className="h-4 w-28 bg-muted rounded animate-pulse" />
          <div className="h-4 w-16 bg-muted rounded animate-pulse" />
          <div className="h-4 w-40 bg-muted rounded animate-pulse" />
          <div className="h-4 w-20 bg-muted rounded animate-pulse" />
          <div className="h-4 w-24 bg-muted rounded animate-pulse ml-auto" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border/30">
            <div className="h-4 w-28 bg-muted rounded animate-pulse" />
            <div className="h-5 w-16 bg-muted rounded-full animate-pulse" />
            <div className="h-4 w-40 bg-muted rounded animate-pulse" />
            <div className="h-4 w-20 bg-muted rounded animate-pulse" />
            <div className="h-4 w-24 bg-muted rounded animate-pulse ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
