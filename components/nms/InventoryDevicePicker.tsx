'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Anchor } from '@radix-ui/react-popover';
import { Check, Search, Server, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import styles from './InventoryDevicePicker.module.css';

export interface InventoryDeviceOption {
  id: string; name: string; type: string; vendor?: string | null; model?: string | null;
  managementIp?: string | null; nmsDeviceId?: number | null;
}

function searchable(value: string) {
  return value.toLocaleLowerCase('tr').normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i').trim();
}

export function inventoryDeviceType(type: string) {
  const labels: Record<string, string> = { SWITCH: 'Switch', ROUTER: 'Router', FIREWALL: 'Güvenlik duvarı', PHYSICAL_SERVER: 'Fiziksel sunucu', VIRTUAL_HOST: 'Sanal sunucu', VIRTUAL_MACHINE: 'Sanal makine', STORAGE: 'Depolama', OTHER: 'Diğer' };
  return labels[type] || type.replace(/_/g, ' ');
}

export function InventoryDevicePicker({ devices, value, onSelect, disabled, invalid, describedBy }: {
  devices: InventoryDeviceOption[]; value: InventoryDeviceOption | null; onSelect: (id: string) => void;
  disabled?: boolean; invalid?: boolean; describedBy?: string;
}) {
  const [query, setQuery] = useState(value?.name || '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  const expanded = open && !disabled;
  const results = useMemo(() => {
    const tokens = searchable(value?.name === query ? '' : query).split(/\s+/).filter(Boolean);
    return devices.filter(device => {
      const text = searchable([device.name, device.managementIp, device.vendor, device.model, inventoryDeviceType(device.type)].filter(Boolean).join(' '));
      return tokens.every(token => text.includes(token));
    });
  }, [devices, query, value?.name]);

  useEffect(() => { if (value) setQuery(value.name); }, [value]);
  useEffect(() => {
    if (expanded) list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, expanded]);

  function choose(device: InventoryDeviceOption) {
    setQuery(device.name); setOpen(false); setActive(0); onSelect(device.id);
  }

  return <Popover open={expanded} onOpenChange={setOpen}>
    <Anchor asChild><div className={styles.inputWrap}>
      <Search aria-hidden="true" className={styles.searchIcon} size={17} />
      <Input ref={input} id="device" role="combobox" aria-label="Cihaz adı veya IP ile ara" aria-autocomplete="list"
        aria-expanded={expanded} aria-controls={expanded ? listId : undefined}
        aria-activedescendant={expanded && results[active] ? `${listId}-${active}` : undefined}
        aria-invalid={invalid} aria-describedby={describedBy} disabled={disabled} autoComplete="off"
        value={query} placeholder="Cihaz adı veya IP ile ara" className={styles.input}
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
        onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true); if (value) onSelect(''); }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            setActive(previous => results.length ? Math.max(0, Math.min(results.length - 1, previous + (event.key === 'ArrowDown' ? 1 : -1))) : 0);
          } else if (event.key === 'Enter') {
            event.preventDefault(); if (expanded && results[active]) choose(results[active]);
          } else if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
          else if (event.key === 'Tab') setOpen(false);
        }} />
      {query && <button type="button" className={styles.clear} disabled={disabled} aria-label="Cihaz seçimini temizle" onClick={() => { setQuery(''); setActive(0); onSelect(''); setOpen(false); input.current?.focus(); }}><X size={16} /></button>}
    </div></Anchor>
    <PopoverContent align="start" sideOffset={5} className={styles.results} style={{ width: 'var(--radix-popover-trigger-width)' }}
      onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()}>
      <div ref={list} id={listId} role="listbox" aria-label="İzlemeye alınabilir cihazlar">
        {results.length === 0 && <p role="status" className={styles.empty}>Eşleşen cihaz bulunamadı.</p>}
        {results.map((device, index) => <button key={device.id} id={`${listId}-${index}`} type="button" role="option" tabIndex={-1}
          aria-selected={value?.id === device.id} data-active={active === index}
          className={cn(styles.option, active === index && styles.active)} onMouseDown={event => event.preventDefault()}
          onMouseMove={() => setActive(index)} onClick={() => choose(device)}>
          <Server size={17} aria-hidden="true" className={styles.deviceIcon} />
          <span className={styles.deviceText}><strong>{device.name}</strong><span className={styles.ip}>{device.managementIp || 'IP adresi tanımlanmamış'}</span><small>{[inventoryDeviceType(device.type), device.vendor, device.model].filter(Boolean).join(' · ')}</small></span>
          {value?.id === device.id && <Check size={16} aria-hidden="true" className={styles.deviceIcon} />}
        </button>)}
      </div>
    </PopoverContent>
  </Popover>;
}
