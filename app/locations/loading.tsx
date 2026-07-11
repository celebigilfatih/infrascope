export default function LocationsLoading() {
  return (
    <div className="min-h-full bg-background" aria-busy="true" aria-label="Konum portföyü yükleniyor">
      <div className="border-b border-border px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1680px]">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2"><div className="h-4 w-40 animate-pulse rounded bg-muted" /><div className="h-8 w-72 animate-pulse rounded bg-muted" /><div className="h-4 w-96 max-w-full animate-pulse rounded bg-muted" /></div>
            <div className="flex gap-2"><div className="h-10 w-10 animate-pulse rounded bg-muted" /><div className="h-10 w-36 animate-pulse rounded bg-muted" /></div>
          </div>
          <div className="mt-6 grid grid-cols-2 border-y border-border sm:grid-cols-4 xl:grid-cols-7">{Array.from({ length: 7 }).map((_, index) => <div key={index} className="border-r border-border px-4 py-3"><div className="h-3 w-20 animate-pulse rounded bg-muted" /><div className="mt-2 h-7 w-10 animate-pulse rounded bg-muted" /></div>)}</div>
        </div>
      </div>
      <div className="mx-auto grid max-w-[1680px] lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="hidden min-h-[560px] border-r border-border p-5 lg:block"><div className="h-5 w-32 animate-pulse rounded bg-muted" />{Array.from({ length: 9 }).map((_, index) => <div key={index} className="mt-3 h-9 animate-pulse rounded bg-muted/60" style={{ marginLeft: `${(index % 4) * 12}px` }} />)}</div>
        <div className="p-6 lg:p-8"><div className="flex justify-between"><div className="h-7 w-44 animate-pulse rounded bg-muted" /><div className="h-10 w-80 animate-pulse rounded bg-muted" /></div><div className="mt-6 divide-y divide-border border-y border-border">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="flex items-center gap-4 py-5"><div className="h-10 w-10 animate-pulse rounded bg-muted" /><div className="flex-1"><div className="h-4 w-48 animate-pulse rounded bg-muted" /><div className="mt-2 h-3 w-72 animate-pulse rounded bg-muted" /></div><div className="h-9 w-32 animate-pulse rounded bg-muted" /></div>)}</div></div>
      </div>
    </div>
  );
}
