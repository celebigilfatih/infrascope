// Server component - no 'use client' so skeleton renders instantly from server
// before any JavaScript is downloaded/evaluated
export default function DashboardLoading() {
  return (
    <>
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card/50">
        <div className="flex items-center gap-4 flex-1">
          <div className="h-8 w-8 bg-muted rounded animate-pulse" />
          <div className="h-8 w-64 bg-muted rounded animate-pulse hidden md:block" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-muted rounded animate-pulse" />
          <div className="h-8 w-8 bg-muted rounded animate-pulse" />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
          <div className="flex items-center gap-2">
            <div className="h-9 w-20 bg-muted rounded animate-pulse" />
            <div className="h-9 w-28 bg-muted rounded animate-pulse" />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="border border-border/50 rounded-lg p-6 bg-card">
                <div className="flex items-center justify-between mb-4">
                  <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                  <div className="h-3 w-3 bg-muted rounded animate-pulse" />
                </div>
                <div className="h-10 w-16 bg-muted rounded animate-pulse mb-2" />
                <div className="h-3 w-32 bg-muted rounded animate-pulse" />
                <div className="mt-6 flex items-end justify-between">
                  <div className="h-6 w-16 bg-muted rounded animate-pulse" />
                  <div className="flex items-end gap-1 h-8">
                    {[40, 70, 45, 90, 65, 80].map((h, j) => (
                      <div key={j} className="w-1.5 bg-muted rounded animate-pulse" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 border border-border/50 rounded-lg p-6 bg-card">
              <div className="h-6 w-64 bg-muted rounded animate-pulse mb-4" />
              <div className="h-64 w-full bg-muted rounded animate-pulse" />
            </div>
            <div className="border border-border/50 rounded-lg p-6 bg-card">
              <div className="h-6 w-32 bg-muted rounded animate-pulse mb-2" />
              <div className="h-8 w-24 bg-muted rounded animate-pulse mb-2" />
              <div className="h-4 w-40 bg-muted rounded animate-pulse mb-6" />
              <div className="flex items-end justify-between gap-2 h-48">
                {[60, 30, 80, 45, 70, 55, 90, 40, 65, 75, 50, 85].map((h, i) => (
                  <div key={i} className="flex-1 bg-muted rounded animate-pulse" style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 border border-border/50 rounded-lg p-6 bg-card">
              <div className="flex items-center justify-between mb-4">
                <div className="h-6 w-48 bg-muted rounded animate-pulse" />
                <div className="h-8 w-20 bg-muted rounded animate-pulse" />
              </div>
              <div className="h-8 w-full bg-muted rounded animate-pulse mb-4" />
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="h-4 w-4 bg-muted rounded animate-pulse" />
                    <div className="h-4 w-48 bg-muted rounded animate-pulse" />
                    <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                    <div className="h-4 w-16 ml-auto bg-muted rounded animate-pulse" />
                    <div className="h-4 w-4 bg-muted rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
            <div className="border border-border/50 rounded-lg p-6 bg-card">
              <div className="h-6 w-40 bg-muted rounded animate-pulse mb-2" />
              <div className="h-4 w-56 bg-muted rounded animate-pulse mb-6" />
              <div className="space-y-6">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 bg-muted rounded-full animate-pulse" />
                      <div>
                        <div className="h-4 w-24 bg-muted rounded animate-pulse mb-1" />
                        <div className="h-3 w-16 bg-muted rounded animate-pulse" />
                      </div>
                    </div>
                    <div className="h-5 w-16 bg-muted rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
