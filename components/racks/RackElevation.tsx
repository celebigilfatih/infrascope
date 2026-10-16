'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle, Server } from 'lucide-react';
import { presentRack } from '@/lib/racks/presentation';
import type { RackRecord } from './types';
import { cn } from '@/lib/utils';
import styles from './RackElevation.module.css';

export function RackElevation({ rack, selectedDeviceId, onSelectDevice, preview = false }: { rack: RackRecord; selectedDeviceId: string | null; onSelectDevice: (id: string) => void; preview?: boolean }) {
  const { capacity, segments } = presentRack(rack.maxUnits, rack.devices);
  const scroller = useRef<HTMLDivElement>(null);
  const selectedStart = segments.find(segment => segment.devices.some(device => device.id === selectedDeviceId))?.start;
  const selectedEnd = segments.find(segment => segment.devices.some(device => device.id === selectedDeviceId))?.end;
  useEffect(() => {
    if (!selectedDeviceId) return;
    const element = scroller.current?.querySelector<HTMLElement>('[data-selected="true"]');
    if (element && scroller.current) {
      const top = element.getBoundingClientRect().top - scroller.current.getBoundingClientRect().top + scroller.current.scrollTop;
      const bottom = top + element.offsetHeight;
      if (top < scroller.current.scrollTop + 8 || bottom > scroller.current.scrollTop + scroller.current.clientHeight - 8) {
        scroller.current.scrollTop = top - (scroller.current.clientHeight - element.offsetHeight) / 2;
      }
    }
  }, [selectedDeviceId, selectedStart, selectedEnd]);
  return <section className={styles.section} aria-label={`${rack.name} kabinet içi yerleşimi`}>
    <div className={styles.caption}><strong>Ön görünüm</strong><span>Üst: U {capacity.totalUnits} · Alt: U 1</span></div>
    <div className={cn(styles.scroller, preview && styles.preview)} ref={scroller}>
      <div className={styles.frame} style={{ gridTemplateRows: `repeat(${capacity.totalUnits}, 24px)` }}>
        {Array.from({ length: capacity.totalUnits }, (_, index) => <div key={index} className={styles.unit} style={{ gridRow: index + 1 }}><span>U {capacity.totalUnits - index}</span><div aria-hidden="true" /><i aria-hidden="true" /></div>)}
        {segments.map(segment => {
          const selected = segment.devices.some(device => device.id === selectedDeviceId);
          const range = segment.start === segment.end ? `U ${segment.start}` : `U ${segment.start}–${segment.end}`;
          const names = segment.devices.map(device => device.name).join(', ');
          return <button key={`${segment.start}-${segment.end}`} type="button" disabled={preview} className={cn(styles.device, segment.hasConflict && styles.conflict, selected && styles.selected)} style={{ gridRow: `${capacity.totalUnits - segment.end + 1} / span ${segment.end - segment.start + 1}` }} data-selected={selected} aria-pressed={selected} aria-label={`${range}: ${names}${segment.hasConflict ? ', yerleşim uyarısı' : ''}`} title={`${range} · ${names}`} onClick={() => onSelectDevice(segment.devices.find(device => device.id !== selectedDeviceId)?.id || segment.devices[0].id)}>
            {segment.hasConflict ? <AlertTriangle size={13} aria-hidden="true" /> : <Server size={13} aria-hidden="true" />}<span>{segment.devices.length > 1 ? `Çakışma: ${names}` : names}</span>{segment.end > segment.start && <small>{range}</small>}
          </button>;
        })}
      </div>
    </div>
    <div className={styles.legend}><span><i />Kayıtlı cihaz</span>{preview && <span><i className={styles.previewLegend} />Yeni yerleşim</span>}<span><i className={styles.empty} />Atanmış cihaz yok</span><span><i className={styles.warning} />Yerleşim uyarısı</span></div>
    <p className={styles.hint}>{preview ? 'Yeşil çerçeve yeni yerleşimin önizlemesidir. Kaydet düğmesine basana kadar kayıt değişmez.' : 'Cihazı seçerek ayrıntılarını inceleyin. Konumu atanmamış cihazlar bu şemaya eklenmez.'}</p>
  </section>;
}
