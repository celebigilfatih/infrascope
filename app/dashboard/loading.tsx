import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <main className="flex-1 overflow-hidden px-4 py-6 sm:px-6 lg:px-8" aria-label="Dashboard yükleniyor">
      <div className="mx-auto w-full max-w-[1600px] space-y-8">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-3"><Skeleton className="h-3 w-44" /><Skeleton className="h-9 w-56" /><Skeleton className="h-4 w-96 max-w-full" /></div>
          <Skeleton className="hidden h-9 w-28 sm:block" />
        </div>
        <div className="flex min-h-28 items-center justify-between border-y border-border py-5"><div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-lg" /><div className="space-y-2"><Skeleton className="h-5 w-52" /><Skeleton className="h-4 w-80 max-w-full" /></div></div><Skeleton className="hidden h-14 w-72 sm:block" /></div>
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-8"><Skeleton className="h-6 w-40" />{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div>
          <div className="space-y-3 lg:col-span-4"><Skeleton className="h-6 w-40" />{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />)}</div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-32 w-full rounded-lg" />)}</div>
        <div className="grid gap-8 lg:grid-cols-2"><Skeleton className="h-72 w-full" /><Skeleton className="h-72 w-full" /></div>
      </div>
    </main>
  );
}
