import {record,numeric} from './workspace';
export interface ReportGroup {label:string;count:number}
export interface ReportData {inventory:{total:number;types:ReportGroup[];statuses:ReportGroup[];importance:ReportGroup[];vendors:ReportGroup[]};capacity:{racks:number;totalUnits:number;savedUnits:number;estimatedUnits:number;unpositioned:number;conflicts:number;rooms:{id:string;name:string;racks:number;totalUnits:number;savedUnits:number}[]};vmware:{clusters:number;hosts:number;vms:number;datastores:number};alerts:{total:number;severities:ReportGroup[];statuses:ReportGroup[]}}
export type ReportKey=keyof ReportData;
export type ReportSection<K extends ReportKey=ReportKey>={ok:true;data:ReportData[K];readAt:string}|{ok:false};
export type ReportSnapshot={[K in ReportKey]:ReportSection<K>};
export function parseReports(v:unknown):ReportSnapshot{
 if(!record(v)||v.success!==true||v.source!=='database'||!record(v.sections))throw Error('Rapor yanıtı doğrulanamadı.');
 const sections=v.sections;
 const nonnegative=(x:unknown)=>numeric(x)!==null&&Number(x)>=0&&Number.isSafeInteger(Number(x));
 const groups=(x:unknown)=>Array.isArray(x)&&x.every(r=>record(r)&&typeof r.label==='string'&&nonnegative(r.count));
 for(const key of ['inventory','capacity','vmware','alerts'] as const){const s=sections[key];if(!record(s)||typeof s.ok!=='boolean')throw Error('Rapor bölümü eksik.');if(!s.ok)continue;if(typeof s.readAt!=='string'||!Number.isFinite(Date.parse(s.readAt))||!record(s.data))throw Error('Rapor bilgileri geçersiz.');const d=s.data;
 if(key==='inventory'&&(!nonnegative(d.total)||!['types','statuses','importance','vendors'].every(k=>groups(d[k]))))throw Error('Envanter özeti geçersiz.');
 if(key==='capacity'&&(!['racks','totalUnits','savedUnits','estimatedUnits','unpositioned','conflicts'].every(k=>nonnegative(d[k]))||!Array.isArray(d.rooms)||!d.rooms.every(r=>record(r)&&typeof r.id==='string'&&typeof r.name==='string'&&['racks','totalUnits','savedUnits'].every(k=>nonnegative(r[k])))))throw Error('Kapasite özeti geçersiz.');
 if(key==='vmware'&&!['clusters','hosts','vms','datastores'].every(k=>nonnegative(d[k])))throw Error('VMware özeti geçersiz.');
 if(key==='alerts'&&(!nonnegative(d.total)||!groups(d.severities)||!groups(d.statuses)))throw Error('Olay özeti geçersiz.');
 }
 return sections as ReportSnapshot;
}
