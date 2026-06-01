// Server component - renders instantly during navigation to network topology page

export default function NetworkLoading() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="bg-card border-b border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="h-7 w-48 bg-muted rounded animate-pulse" />
          <div className="flex items-center gap-3">
            <div className="h-8 w-64 bg-muted rounded animate-pulse" />
            <div className="h-8 w-8 bg-muted rounded animate-pulse" />
            <div className="h-8 w-8 bg-muted rounded animate-pulse" />
            <div className="h-8 w-28 bg-muted rounded animate-pulse" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-7 w-20 bg-muted rounded animate-pulse" />
          <div className="h-7 w-24 bg-muted rounded animate-pulse" />
          <div className="h-7 w-28 bg-muted rounded animate-pulse" />
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex-1 bg-muted/10 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="h-12 w-12 bg-muted rounded-full animate-pulse mx-auto" />
          <div className="h-4 w-32 bg-muted rounded animate-pulse mx-auto" />
        </div>
      </div>
    </div>
  );
}
