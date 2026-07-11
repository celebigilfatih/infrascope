import { Skeleton } from '@/components/ui/skeleton';

export default function AlertsLoading() {
  return (
    <main className="flex-1 overflow-hidden px-4 py-6 sm:px-6 lg:px-8" aria-label="Alarm operasyonları yükleniyor">
      <div className="mx-auto w-full max-w-[1600px] space-y-8">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-3"><Skeleton className="h-3 w-44" /><Skeleton className="h-9 w-64" /><Skeleton className="h-4 w-[32rem] max-w-full" /></div>
          <Skeleton className="hidden h-9 w-96 xl:block" />
        </div>
        <div className="flex min-h-28 items-center justify-between border-y border-border py-5"><div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-lg" /><div className="space-y-2"><Skeleton className="h-5 w-64" /><Skeleton className="h-4 w-80 max-w-full" /></div></div><Skeleton className="hidden h-14 w-[26rem] lg:block" /></div>
        <div className="space-y-4"><div className="flex gap-2 overflow-hidden">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-8 w-24 shrink-0" />)}</div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_180px_180px_170px]"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div></div>
        <div className="space-y-3"><div className="flex justify-between"><Skeleton className="h-6 w-44" /><Skeleton className="h-8 w-40" /></div><div className="divide-y divide-border border-y border-border">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="grid min-h-24 gap-3 py-4 xl:grid-cols-[88px_minmax(0,1fr)_180px_120px_140px_80px]"><Skeleton className="h-6 w-16" /><div className="space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div><Skeleton className="h-4 w-32" /><Skeleton className="h-5 w-20" /><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-16" /></div>)}</div></div>
      </div>
    </main>
  );
}
