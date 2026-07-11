export default function NetworkLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background" aria-busy="true" aria-label="Ağ topolojisi yükleniyor">
      <div className="border-b border-border px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1680px]">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-8 w-56 animate-pulse rounded bg-muted" />
              <div className="h-4 w-80 max-w-full animate-pulse rounded bg-muted" />
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <div className="h-9 w-9 animate-pulse rounded bg-muted" />
              <div className="h-9 w-36 animate-pulse rounded bg-muted" />
              <div className="h-9 w-32 animate-pulse rounded bg-muted" />
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 border-y border-border md:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="border-r border-border px-4 py-3 last:border-r-0">
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                <div className="mt-2 h-7 w-10 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <div className="h-9 w-96 max-w-full animate-pulse rounded bg-muted" />
            <div className="ml-auto hidden h-9 w-80 animate-pulse rounded bg-muted lg:block" />
          </div>
        </div>
      </div>
      <div className="min-h-[520px] flex-1 bg-muted/10 p-6">
        <div className="h-full min-h-[460px] animate-pulse rounded-md border border-border bg-muted/30" />
      </div>
    </div>
  );
}
