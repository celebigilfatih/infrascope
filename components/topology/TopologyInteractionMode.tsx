'use client';

import { Check, Eye, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function TopologyInteractionMode({ editing, onChange, canEdit, disabled, label, compact = false }: {
  editing: boolean;
  onChange: (editing: boolean) => void;
  canEdit: boolean;
  disabled?: boolean;
  label: string;
  compact?: boolean;
}) {
  if (compact) return <Button type="button" size="sm" variant={editing ? 'secondary' : 'outline'} className="shrink-0 gap-1.5" aria-pressed={editing} disabled={disabled || (!editing && !canEdit)} title={!canEdit ? 'Topolojiyi düzenleme yetkiniz yok veya yerleşim henüz yüklenmedi.' : undefined} onClick={() => onChange(!editing)}>{editing ? <Check size={15} aria-hidden="true" /> : <Pencil size={15} aria-hidden="true" />}{editing ? 'Düzenlemeyi bitir' : 'Haritayı düzenle'}</Button>;
  return <div role="group" aria-label={label} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
    <Button type="button" size="sm" variant={!editing ? 'secondary' : 'ghost'} className="h-7 gap-1.5 px-2 text-xs" aria-pressed={!editing} disabled={disabled} onClick={() => onChange(false)}><Eye size={14} aria-hidden="true" />Görüntüleme</Button>
    <Button type="button" size="sm" variant={editing ? 'secondary' : 'ghost'} className="h-7 gap-1.5 px-2 text-xs" aria-pressed={editing} disabled={disabled || !canEdit} title={!canEdit ? 'Topolojiyi düzenleme yetkiniz yok veya yerleşim henüz yüklenmedi.' : 'İkon taşıma ve bağlantı oluşturmayı aç'} onClick={() => onChange(true)}><Pencil size={14} aria-hidden="true" />Düzenleme</Button>
  </div>;
}
