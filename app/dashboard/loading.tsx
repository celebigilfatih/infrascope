import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <section className="flex-1 overflow-hidden p-6" aria-label="Dashboard yükleniyor" aria-busy="true">
      <div className="mx-auto w-full max-w-[1760px] space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-3"><Skeleton className="h-3 w-44" /><Skeleton className="h-9 w-56" /><Skeleton className="h-4 w-96 max-w-full" /></div>
          <Skeleton className="hidden h-9 w-28 sm:block" />
        </div>
        <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-[390px] w-full rounded-2xl lg:col-span-2" /><Skeleton className="h-[390px] w-full rounded-2xl" /></div>
        <div className="grid gap-4 lg:grid-cols-5"><Skeleton className="h-60 w-full rounded-2xl lg:col-span-3" /><Skeleton className="h-60 w-full rounded-2xl lg:col-span-2" /></div>
        <Skeleton className="h-36 w-full rounded-2xl" />
      </div>
    </section>
  );
}
