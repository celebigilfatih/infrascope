import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';

export function RackStatus({ status }: { status: string }) {
  return status === 'OPERATIONAL' ? <Badge variant="success">Çalışıyor</Badge> : <StatusBadge status={status} />;
}
