'use client';

import { ArrowDownUp, ArrowUpRight, EthernetPort, Info, Link2, MapPin, Network, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { SeverityBadge } from '@/components/ui/severity-badge';
import { uiLabel } from '@/lib/i18n/tr';
import { connectionState, type TopologyConnection } from '@/lib/topology/workspace';
import styles from './TopologyInspector.module.css';

export interface InspectorDevice {
  building?: { name: string } | null;
  floor?: { name: string } | null;
  id: string; name: string; type: string; status: string; criticality: string;
  vendor?: string; managementIp?: string | null;
  rack?: { name: string; room?: { name: string; floor?: { name: string; building?: { name: string } } } };
  networkInterfaces?: Array<{ id: string; name: string; ipv4?: string | null; status: string }>;
}
export interface InspectorDownPort { id: string; interfaceName: string; description?: string | null; downSince?: string | null; lastPolledAt?: string | null }
const timestamp = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'medium', timeStyle: 'short' }) : 'Bilinmiyor';

export function ConnectionStatus({ status }: { status?: string | null }) {
  const state = connectionState(status);
  return <SemanticBadge tone={state.tone}>{state.label}</SemanticBadge>;
}

export function ConnectionInspector({ connection, devices, onSelectDevice }: { connection: TopologyConnection; devices: InspectorDevice[]; onSelectDevice: (id: string) => void }) {
  return <div className={styles.inspector}>
    <header className={styles.heading}><span className={styles.icon}><Link2 size={20} /></span><div><p>Cihaz bağlantısı</p><h2>{connection.name || 'Bağlantı ayrıntıları'}</h2></div></header>
    <ConnectionStatus status={connection.status} />
    {connection.recordingSource === 'DRAWIO' && <SemanticBadge tone="info">Kaynak: draw.io çizimi · Canlı doğrulanmadı</SemanticBadge>}
    <p className={styles.note}>Durum, kayıtlı bağlantı bilgisidir. Anlık port ölçümü ve cihazın envanter durumu ayrı değerlendirilir.</p>
    <section className={styles.section} aria-label="Bağlantı uçları"><h3><ArrowDownUp size={16} />Bağlantı uçları</h3>
      {([
        { id: connection.sourceDeviceId, port: connection.sourcePortName, label: 'Kaynak cihaz / port' },
        { id: connection.targetDeviceId, port: connection.targetPortName, label: 'Hedef cihaz / port' },
      ]).map(endpoint => {
        const device = devices.find(item => item.id === endpoint.id);
        return <div key={endpoint.label} className={styles.endpoint}><small>{endpoint.label}</small><button type="button" onClick={() => onSelectDevice(endpoint.id)} disabled={!device}><Server size={16} /><strong>{device?.name || 'Cihaz envanterde bulunamadı'}</strong><ArrowUpRight size={14} /></button><span><EthernetPort size={14} />{endpoint.port || 'Port belirtilmemiş'}</span>{device?.managementIp && <code>{device.managementIp}</code>}</div>;
      })}
    </section>
    <dl className={styles.facts}><div><dt>Bağlantı türü</dt><dd>{connection.type ? ({ ETHERNET: 'Ethernet', FIBER: 'Fiber', SERIAL: 'Seri bağlantı', MANAGEMENT: 'Yönetim bağlantısı', WAN: 'Geniş alan ağı (WAN)' }[connection.type] || uiLabel(connection.type)) : 'Belirtilmemiş'}</dd></div><div><dt>Kayıt kimliği</dt><dd><code>{connection.id}</code></dd></div></dl>
    <p className={styles.note}><Info size={15} />Uçlardan birini seçerek cihazın diğer bağlantılarını inceleyebilirsiniz.</p>
  </div>;
}

export function DeviceInspector({ device, devices, connections, downPorts, telemetryAvailable, connectionsAvailable, servicesCount, onSelectConnection, onOpenInventory, onCreateGroup }: {
  device: InspectorDevice; devices: InspectorDevice[]; connections: TopologyConnection[];
  downPorts: InspectorDownPort[]; telemetryAvailable: boolean; connectionsAvailable: boolean; servicesCount: number | null;
  onSelectConnection: (id: string) => void; onOpenInventory: () => void;
  onCreateGroup?: (portId?: string) => void;
}) {
  const links = connections.filter(link => link.sourceDeviceId === device.id || link.targetDeviceId === device.id);
  const location = [device.rack?.room?.floor?.building?.name || device.building?.name, device.rack?.room?.floor?.name || device.floor?.name, device.rack?.room?.name, device.rack?.name].filter(Boolean);
  return <div className={styles.inspector}>
    <header className={styles.heading}><span className={styles.icon}><Server size={20} /></span><div><p>{uiLabel(device.type)}{device.vendor ? ` · ${device.vendor}` : ''}</p><h2>{device.name}</h2></div></header>
    <div className={styles.badges}><StatusBadge status={device.status || 'UNKNOWN'} /><SeverityBadge severity={device.criticality || 'UNKNOWN'} /></div>
    <dl className={styles.facts}><div><dt>Yönetim IP’si</dt><dd><code>{device.managementIp || 'Belirtilmemiş'}</code></dd></div></dl>
    <div className={styles.metrics}><div><Link2 size={16} /><strong>{connectionsAvailable ? links.length : '—'}</strong><span>Bağlantı</span></div><div><EthernetPort size={16} /><strong>{device.networkInterfaces?.length ?? '—'}</strong><span>Arayüz</span></div><div><Network size={16} /><strong>{servicesCount ?? '—'}</strong><span>Servis</span></div></div>
    <section className={styles.section}><h3><Link2 size={16} />Bağlı cihazlar <span>{connectionsAvailable ? links.length : '—'}</span></h3><p className={styles.note}>Bir bağlantıyı seçerek iki ucu ve portlarını görüntüleyin.</p>
      {!connectionsAvailable ? <p className={styles.empty}>Bağlantı verileri alınamadı.</p> : !links.length ? <p className={styles.empty}>Bu cihaz için kayıtlı bağlantı yok.</p> : links.map(link => {
        const source = link.sourceDeviceId === device.id;
        const peer = devices.find(item => item.id === (source ? link.targetDeviceId : link.sourceDeviceId));
        return <button key={link.id} className={styles.link} type="button" onClick={() => onSelectConnection(link.id)}><span className={styles.linkTitle}><Server size={15} /><strong>{peer?.name || 'Envanter dışında cihaz'}</strong><ArrowUpRight size={14} /></span><span className={styles.portPair}>{(source ? link.sourcePortName : link.targetPortName) || 'Port belirtilmemiş'} ↔ {(source ? link.targetPortName : link.sourcePortName) || 'Port belirtilmemiş'}</span><ConnectionStatus status={link.status} /></button>;
      })}
    </section>
    <section className={styles.section}><h3><EthernetPort size={16} />İzlenen port uyarıları</h3><p className={styles.note}>NMS’de yönetim durumu açık, çalışma durumu kapalı port kayıtları. Güncelliği son ölçümden kontrol edin.</p>
      {!telemetryAvailable ? <p className={styles.empty}>Port izleme verileri alınamadı.</p> : !downPorts.length ? <p className={styles.empty}>Kapalı port kaydı dönmedi. Bu bilgi tüm portların izlendiği veya açık olduğu anlamına gelmez.</p> : downPorts.map(port => <div key={port.id} className={styles.portAlert}><strong>{port.interfaceName}</strong><SemanticBadge tone="danger">Kapalı</SemanticBadge>{port.description && <p>{port.description}</p>}<small>Kesinti başlangıcı: {timestamp(port.downSince)}</small><small>Son ölçüm (TSİ): {timestamp(port.lastPolledAt)}</small></div>)}
    </section>
    <section className={styles.section}><h3><MapPin size={16} />Fiziksel konum</h3><p className={styles.note}>{location.length ? location.join(' › ') : 'Cihaza konum atanmamış.'}</p></section>
    <section className={styles.section}><h3><EthernetPort size={16} />Ağ arayüzleri</h3>{device.networkInterfaces === undefined ? <p className={styles.empty}>Arayüz bilgisi alınamadı.</p> : !device.networkInterfaces.length ? <p className={styles.empty}>Kayıtlı ağ arayüzü yok.</p> : device.networkInterfaces.map(iface => <div className={styles.interface} key={iface.id}><div><strong>{iface.name}</strong><code>{iface.ipv4 || 'IP belirtilmemiş'}</code>{onCreateGroup && <button type="button" className="mt-2 rounded border px-2 py-1 text-xs text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onCreateGroup(`interface:${iface.id}`)}>Bu noktadan ağ grubu oluştur</button>}</div><ConnectionStatus status={iface.status} /></div>)}</section>
    {onCreateGroup && <Button variant="outline" className="w-full" onClick={() => onCreateGroup()}>Bu cihazdan ağ grubu oluştur</Button>}
    <Button variant="outline" className="w-full gap-2" onClick={onOpenInventory}><Server size={16} />Cihaz envanterini aç<ArrowUpRight size={15} /></Button>
  </div>;
}
