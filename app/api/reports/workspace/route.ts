import {NextRequest,NextResponse} from 'next/server';
import {prisma} from '@/lib/prisma';
import {authorizeApiRequest} from '@/lib/auth/api-permission';
import {presentRack} from '@/lib/racks/presentation';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
const limit=50000;
export async function GET(request:NextRequest){
 const access=await authorizeApiRequest(request,'devices','read');if(!access.allowed)return access.response;
 const alarmAccess=await authorizeApiRequest(request,'alarms','read');
 const tasks:Record<string,()=>Promise<unknown>>={
 inventory:()=>prisma.$transaction(async tx=>{const [total,types,statuses,importance,vendors]=await Promise.all([tx.device.count(),tx.device.groupBy({by:['type'],_count:true}),tx.device.groupBy({by:['status'],_count:true}),tx.device.groupBy({by:['criticality'],_count:true}),tx.device.groupBy({by:['vendor'],_count:true})]);return{total,types:types.map(r=>({label:r.type,count:r._count})),statuses:statuses.map(r=>({label:r.status,count:r._count})),importance:importance.map(r=>({label:r.criticality,count:r._count})),vendors:vendors.map(r=>({label:r.vendor||'Üretici bilgisi yok',count:r._count})).sort((a,b)=>b.count-a.count)}},{isolationLevel:'RepeatableRead'}),
 capacity:()=>prisma.$transaction(async tx=>{const [racksCount,devicesCount]=await Promise.all([tx.rack.count(),tx.device.count({where:{rackId:{not:null}}})]);if(racksCount>10000||devicesCount>limit)throw Error('Capacity snapshot exceeds bounds');const racks=await tx.rack.findMany({select:{id:true,maxUnits:true,room:{select:{id:true,name:true}},devices:{select:{id:true,rackUnitPosition:true,metadata:true}}}});let totalUnits=0,savedUnits=0,estimatedUnits=0,unpositioned=0,conflicts=0;const rooms=new Map<string,{id:string;name:string;racks:number;totalUnits:number;savedUnits:number}>();for(const rack of racks){const p=presentRack(rack.maxUnits,rack.devices);totalUnits+=p.capacity.totalUnits;savedUnits+=p.assignedUsedUnits;estimatedUnits+=p.estimatedUnits;unpositioned+=p.capacity.unpositionedDevices;conflicts+=p.capacity.conflictDevices;const room=rooms.get(rack.room.id)||{...rack.room,racks:0,totalUnits:0,savedUnits:0};room.racks++;room.totalUnits+=p.capacity.totalUnits;room.savedUnits+=p.assignedUsedUnits;rooms.set(room.id,room)}return{racks:racks.length,totalUnits,savedUnits,estimatedUnits,unpositioned,conflicts,rooms:[...rooms.values()].sort((a,b)=>a.name.localeCompare(b.name,'tr'))}},{isolationLevel:'RepeatableRead',maxWait:5000,timeout:15000}),
 vmware:()=>prisma.$transaction(async tx=>{const [clusters,hosts,vms,datastores]=await Promise.all([tx.vMwareCluster.count(),tx.device.count({where:{type:'VIRTUAL_HOST',vmwareMoref:{not:null}}}),tx.device.count({where:{type:'VIRTUAL_MACHINE',vmwareMoref:{not:null}}}),tx.vMwareDatastore.count()]);return{clusters,hosts,vms,datastores}},{isolationLevel:'RepeatableRead'}),
 alerts:async()=>{if(!alarmAccess.allowed)throw Error('Alarm read denied');return prisma.$transaction(async tx=>{const where={status:{in:['OPEN','ACKNOWLEDGED'] as ('OPEN'|'ACKNOWLEDGED')[]}};const [total,severities,statuses]=await Promise.all([tx.alarmIncident.count({where}),tx.alarmIncident.groupBy({by:['severity'],where,_count:true}),tx.alarmIncident.groupBy({by:['status'],where,_count:true})]);return{total,severities:severities.map(r=>({label:r.severity,count:r._count})),statuses:statuses.map(r=>({label:r.status,count:r._count}))}},{isolationLevel:'RepeatableRead'})}
 };
 const entries=await Promise.all(Object.entries(tasks).map(async([key,load])=>{try{return[key,{ok:true,data:await load(),readAt:new Date().toISOString()}]}catch{return[key,{ok:false}]}}));
 return NextResponse.json({success:true,source:'database',sections:Object.fromEntries(entries)},{headers});
}
