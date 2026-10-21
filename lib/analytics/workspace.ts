export type AnalysisKind = 'capacity' | 'forecast' | 'sprawl';
export type AnalysisRow = { id: string; name: string; resource: string; metric: string; state: string; current: number | null; delta: number | null; future: (number | null)[]; points: number | null; lastAt: string | null; host: string | null; power: string; snapshots: number | null; age: number | null; score: number | null; reasons: string[] };
export const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const numeric = (v: unknown): number | null => (typeof v === 'number' || typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) && Number.isFinite(Number(v)) ? Number(v) : null;
export const percent = (v: unknown) => { const n = numeric(v); return n !== null && n >= 0 && n <= 100 ? n : null; };
const count = (v: unknown) => { const n = numeric(v); return n !== null && Number.isSafeInteger(n) && n >= 0 ? n : null; };
const date = (v: unknown) => typeof v === 'string' && /T.*(Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v)) ? v : null;
const label = (values: Record<string,string>, v: string, fallback: string) => Object.prototype.hasOwnProperty.call(values,v) ? values[v] : fallback;
export const metricLabel = (v: string) => label({cpu:'CPU',memory:'Bellek',disk:'Disk'},v,'Metrik bilgisi yok');
export const resourceLabel = (v: string) => label({cluster:'Küme',host:'ESXi sunucusu',datastore:'Veri deposu',vm:'Sanal makine'},v,'Kaynak türü bilinmiyor');
export const stateLabel = (v: string) => label({critical:'Kritik',warning:'Uyarı',normal:'Normal',unknown:'Bilgi yok'},v,'Bilgi yok');
export const powerLabel = (v: string) => ['running','poweredOn','POWERED_ON'].includes(v) ? 'Açık' : ['notRunning','poweredOff','POWERED_OFF'].includes(v) ? 'Kapalı' : ['suspended','SUSPENDED'].includes(v) ? 'Askıda' : 'Güç durumu bilinmiyor';
export function parseAnalysis(v: unknown, kind: AnalysisKind): AnalysisRow[] {
 if (!record(v) || v.success === false || v.error || v.connected === false) throw Error('Analiz yanıtı alınamadı.');
 const key = kind === 'capacity' ? 'trends' : kind === 'forecast' ? 'forecast' : 'sprawl', items = v[key];
 if (!Array.isArray(items)) throw Error('Analiz listesi doğrulanamadı.');
 const rows = items.map((r): AnalysisRow => {
  if (!record(r) || typeof (kind === 'sprawl' ? r.vmId : r.resourceId) !== 'string' || !(kind === 'sprawl' ? r.vmId : r.resourceId)) throw Error('Kaynak kimliği eksik.');
  const metric = typeof r.metricType === 'string' ? r.metricType : '', resource = kind === 'sprawl' ? 'vm' : typeof r.resourceType === 'string' ? r.resourceType : '';
  const score = count(r.sprawlScore), state = kind === 'sprawl' ? score === null ? 'unknown' : score >= 5 ? 'critical' : score >= 3 ? 'warning' : 'normal' : ['critical','warning','normal'].includes(String(r.status)) ? String(r.status) : 'unknown';
  const points = Array.isArray(r.dataPoints) ? r.dataPoints : null;
  const validDates = (points || []).flatMap(p => record(p) && date(p.timestamp) ? [date(p.timestamp)!] : []).sort((a,b)=>Date.parse(a)-Date.parse(b));
  const snapshots = count(r.snapshotCount), age = count(r.oldestSnapshotDays);
  const reasons = kind === 'sprawl' ? [ ...(['notRunning','poweredOff','POWERED_OFF'].includes(String(r.powerState)) ? ['Sanal makine kapalı; ne kadar süredir kapalı olduğu bilinmiyor.'] : []), ...(age !== null && age > 30 ? ['En eski anlık görüntü '+age+' günlük.'] : []), ...(snapshots !== null && snapshots > 3 ? [snapshots+' anlık görüntü kaydı var.'] : []) ] : [];
  if (kind === 'sprawl' && !reasons.length) reasons.push('Kaynak analizi bu sanal makineyi incelemeye aday olarak bildirdi.');
  return {id:kind === 'sprawl' ? String(r.vmId) : JSON.stringify([resource,r.resourceId,metric]),name:typeof (kind === 'sprawl' ? r.vmName : r.resourceName) === 'string' ? String(kind === 'sprawl' ? r.vmName : r.resourceName) : 'Ad bilgisi yok',resource,metric,state,current:percent(kind === 'capacity' ? r.currentValue : r.current),delta:numeric(r.trendPercent),future:[percent(r.predict30),percent(r.predict60),percent(r.predict90)],points:points?.length ?? null,lastAt:validDates.at(-1) || null,host:typeof r.host === 'string' && r.host !== 'Unknown' ? r.host : null,power:typeof r.powerState === 'string' ? r.powerState : '',snapshots,age,score,reasons};
 });
 if(new Set(rows.map(r=>r.id)).size!==rows.length) throw Error('Kaynak kimlikleri yineleniyor.');
 return rows;
}
export const formatNumber = (v: number | null) => v === null ? 'Bilgi yok' : v.toLocaleString('tr-TR',{maximumFractionDigits:2});
export const formatPercent = (v: number | null) => v === null ? 'Bilgi yok' : '%'+formatNumber(v);
export const formatDelta = (v: number | null) => v === null ? 'Bilgi yok' : (v>0?'+':'')+formatNumber(v)+' yüzde puan';
export function analysisCsv(rows: AnalysisRow[],kind: AnalysisKind) {const cell=(v: string)=>'"'+(/^[\s\u0000-\u001f]*[=+\-@]/.test(v)?"'"+v:v).replace(/"/g,'""')+'"';const data = kind === 'sprawl' ? [['Sanal makine','ESXi sunucusu','Güç durumu','Puan','Anlık görüntü','En eski (gün)','İnceleme nedenleri'],...rows.map(r=>[r.name,r.host||'Bilgi yok',powerLabel(r.power),formatNumber(r.score),formatNumber(r.snapshots),formatNumber(r.age),r.reasons.join(' ')])] : [['Kaynak','Metrik','Durum','Güncel','Değişim','30 örnek','60 örnek','90 örnek'],...rows.map(r=>[r.name,metricLabel(r.metric),stateLabel(r.state),formatPercent(r.current),formatDelta(r.delta),...r.future.map(formatPercent)])];return '\ufeff'+data.map(row=>row.map(cell).join(';')).join('\r\n'); }
