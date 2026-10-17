import { Crown, Eye, Pencil, UserCheck, UserMinus, UserX } from 'lucide-react';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { roleLabels, statusLabels, type WorkspaceRole, type WorkspaceStatus } from '@/lib/users/workspace';
export function UserRoleBadge({ role }: { role: WorkspaceRole | null }) {
  return <SemanticBadge tone={role === null || role === 'viewer' ? 'neutral' : 'info'} icon={role === 'admin' ? Crown : role === 'editor' ? Pencil : role === 'viewer' ? Eye : undefined}>{role ? roleLabels[role] : 'Rol bilinmiyor'}</SemanticBadge>;
}
export function UserStateBadge({ status }: { status: WorkspaceStatus | null }) {
  return <SemanticBadge tone={status === 'active' ? 'success' : status === 'suspended' ? 'warning' : 'neutral'} icon={status === 'active' ? UserCheck : status === 'suspended' ? UserX : status === 'inactive' ? UserMinus : undefined}>{status ? statusLabels[status] : 'Durum bilinmiyor'}</SemanticBadge>;
}
