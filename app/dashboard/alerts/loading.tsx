import { Skeleton } from '@/components/ui/skeleton';
import styles from '@/components/dashboard/incident-operations.module.css';

export default function AlertsLoading() {
  return (
    <div className={styles.workspace} aria-label="Incident merkezi yükleniyor" role="status">
      <div className="w-full space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0 space-y-3"><Skeleton className="h-9 w-64 max-w-full" /><Skeleton className="h-4 w-48 max-w-full" /></div>
          <Skeleton className="hidden h-10 w-60 sm:block" />
        </div>
        <div className="space-y-4"><div className="flex gap-5 overflow-hidden border-b pb-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-7 w-24 shrink-0" />)}</div><div className="flex gap-3"><Skeleton className="h-11 flex-1" /><Skeleton className="h-11 w-24" /><Skeleton className="hidden h-11 w-48 sm:block" /></div></div>
        <div className="divide-y border-y">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="flex items-center gap-5 py-6"><Skeleton className="h-6 w-16" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div><Skeleton className="h-6 w-20" /></div>)}</div>
      </div>
    </div>
  );
}
