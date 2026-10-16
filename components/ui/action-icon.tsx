import { Archive, ArrowLeft, ArrowRight, Check, Copy, Download, Filter, Pencil, Plus, RefreshCw, Save, Search, Send, Trash2, X } from 'lucide-react';

const actionIcons = {
  add: Plus, save: Save, edit: Pencil, delete: Trash2, refresh: RefreshCw,
  search: Search, cancel: X, download: Download, copy: Copy, archive: Archive,
  next: ArrowRight, previous: ArrowLeft, confirm: Check, send: Send, filter: Filter,
};
export type ActionIconName = keyof typeof actionIcons;

export function ActionIcon({ action }: { action: ActionIconName }) {
  const Icon = actionIcons[action];
  return <Icon size={16} aria-hidden="true" />;
}
