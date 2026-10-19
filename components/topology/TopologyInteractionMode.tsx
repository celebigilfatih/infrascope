'use client';

import { Eye, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function TopologyInteractionMode({ editing, onChange, canEdit, disabled, label }: {
  editing: boolean;
  onChange: (editing: boolean) => void;
  canEdit: boolean;
  disabled?: boolean;
  label: string;
}) {
  return <div role="group" aria-label={label} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
    <Button type="button" size="sm" variant={!editing ? 'secondary' : 'ghost'} className="h-7 gap-1.5 px-2 text-xs" aria-pressed={!editing} disabled={disabled} onClick={() => onChange(false)}><Eye size={14} aria-hidden="true" />Görüntüleme</Button>
    <Button type="button" size="sm" variant={editing ? 'secondary' : 'ghost'} className="h-7 gap-1.5 px-2 text-xs" aria-pressed={editing} disabled={disabled || !canEdit} title={!canEdit ? 'Topolojiyi düzenleme yetkiniz yok veya yerleşim henüz yüklenmedi.' : 'İkon taşıma ve bağlantı oluşturmayı aç'} onClick={() => onChange(true)}><Pencil size={14} aria-hidden="true" />Düzenleme</Button>
  </div>;
}
