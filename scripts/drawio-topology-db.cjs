/* eslint-disable @typescript-eslint/no-require-imports -- Explicit local maintenance workflow. */
const { snapshotKey, digest } = require('./drawio-topology-plan.cjs');
async function readSnapshot(db) {
  const [organizations, devices, links, legacy, buildingConnections] = await Promise.all([
    db.organization.findMany({ select: { id:true, name:true, buildings:{select:{id:true,name:true,address:true,city:true,country:true,floors:{select:{id:true,name:true,floorNumber:true,rooms:{select:{id:true,name:true,racks:{select:{id:true,name:true,maxUnits:true}}}}}}}}} }),
    db.device.findMany({ select:{ id:true,name:true,type:true,vendor:true,model:true,managementIp:true,buildingId:true,floorId:true,rackId:true,rackUnitPosition:true,nmsDeviceId:true,updatedAt:true,networkInterfaces:{select:{id:true,name:true,status:true}},nmsInterfaces:{select:{id:true,interfaceName:true,description:true}},switchPorts:{select:{id:true,name:true,connectedToId:true}},rack:{select:{id:true,name:true,room:{select:{id:true,name:true,floor:{select:{id:true,name:true,buildingId:true}}}}}}} }),
    db.deviceLink.findMany({include:{endpoints:true}}),
    db.connection.findMany({select:{id:true,sourcePortId:true,sourceInterfaceId:true,sourcePort:{select:{switchDeviceId:true,name:true,connectedToId:true}},sourceInterface:{select:{deviceId:true,name:true}}}}),
    db.buildingConnection.findMany(),
  ]);
  return {organizations,devices,links,legacy,buildingConnections};
}
async function applyPlan(db, plan, actorId, expectedHash, maxDevices) {
  const {planHash,...payload}=plan;
  if (planHash !== expectedHash || digest(payload)!==planHash) throw Error('Plan hash does not match the reviewed artifact');
  const registryKey=`network.topology.drawio-import:${plan.pageId}`;
  return db.$transaction(async tx=>{
    const actor=await tx.user.findUnique({where:{id:actorId},select:{id:true,status:true,role:true}});
    if(!actor||actor.status!=='ACTIVE'||actor.role!=='ADMIN')throw Error('An active administrator is required');
    const previous=await tx.systemConfig.findUnique({where:{key:registryKey}});
    if(previous){const run=JSON.parse(previous.value);if(run.sha256===plan.sha256&&run.planHash===planHash)return {...run.result,replayed:true};throw Error('This drawing page already has an import. Reconcile the existing run rather than replaying another artifact.');}
    const current=await readSnapshot(tx);
    if(snapshotKey(current)!==plan.snapshotHash)throw Error('Inventory identity, location or port catalog changed after planning; rebuild and review the plan');
    if(current.devices.length+plan.devices.filter(d=>!d.existing).length>maxDevices)throw Error('The resulting inventory exceeds the current device license limit');
    for(const b of plan.buildings)await tx.building.create({data:b});
    for(const f of plan.floors)await tx.floor.create({data:f});
    const before=[];
    for(const d of plan.devices){
      const existing=d.existing?await tx.device.findUniqueOrThrow({where:{id:d.id},select:{id:true,name:true,buildingId:true,floorId:true,rackId:true,metadata:true}}):null;
      if(existing?.metadata !== null && existing?.metadata !== undefined && (typeof existing.metadata !== 'object' || Array.isArray(existing.metadata)))throw Error('Existing metadata is not an object; reconcile it before importing');
      const old=existing?.metadata&&typeof existing.metadata==='object'&&!Array.isArray(existing.metadata)?existing.metadata:{};
      if(old.drawioImports !== undefined && (old.drawioImports === null || typeof old.drawioImports !== 'object' || Array.isArray(old.drawioImports)))throw Error('Existing drawing provenance is not an object; reconcile it before importing');
      const metadata={...old,drawioImports:{...(old.drawioImports||{}),[plan.pageId]:{source:plan.fileName,sha256:plan.sha256,refs:d.refs,labelIds:d.labelIds,names:[...new Set(d.drawingNames)],rawIps:[...new Set(d.rawIps)],notes:[...new Set(d.notes)],locationEvidence:[...new Set(d.locationEvidence.filter(Boolean))]}}};
      if(existing){
        before.push({id:existing.id,buildingId:existing.buildingId,floorId:existing.floorId,previousDrawio:old.drawioImports?.[plan.pageId] || null});
        await tx.device.update({where:{id:d.id},data:{metadata,...(!existing.rackId&&!existing.buildingId&&d.buildingId?{buildingId:d.buildingId}:{}),...(!existing.rackId&&!existing.floorId&&d.floorId?{floorId:d.floorId}:{})}});
      }else await tx.device.create({data:{id:d.id,name:d.name,type:d.type,managementIp:d.managementIp,vendor:d.vendor,model:d.model,buildingId:d.buildingId,floorId:d.floorId,status:'UNKNOWN',pollingEnabled:false,metadata}});
    }
    for(const port of plan.ports)await tx.networkInterface.create({data:port});
    for(const link of plan.links){
      if(link.existing)continue;
      await tx.deviceLink.create({data:{id:link.id,sourceDeviceId:link.sourceDeviceId,targetDeviceId:link.targetDeviceId,type:link.type,bandwidth:link.bandwidth,status:link.status,source:'DRAWIO',sourceRef:link.sourceRef,endpoints:{create:link.endpoints.map(({side,deviceId,portId,portName,portKey})=>({side,deviceId,portId,portName,portKey}))}}});
    }
    for(const connection of plan.buildingConnections)await tx.buildingConnection.create({data:connection});
    const result={devices:plan.devices.length,reused:plan.devices.filter(d=>d.existing).length,created:plan.devices.filter(d=>!d.existing).length,buildings:plan.buildings.length,floors:plan.floors.length,links:plan.links.length,completeLinks:plan.links.filter(l=>l.endpoints.length===2).length,ports:plan.ports.length,held:plan.heldEdges.length,issues:plan.issues.length};
    await tx.systemConfig.create({data:{key:registryKey,value:JSON.stringify({version:1,source:plan.source,fileName:plan.fileName,sha256:plan.sha256,planHash,importedAt:new Date().toISOString(),actorId,result,deviceIds:plan.devices.map(d=>d.id),linkIds:plan.links.map(l=>l.id),heldEdges:plan.heldEdges,issues:plan.issues,before})}});
    await tx.auditLog.create({data:{entity:'TopologyImport',entityId:plan.pageId,action:'IMPORT',resource:'devices',resourceId:plan.pageId,userId:actorId,details:{source:plan.fileName,sha256:plan.sha256,planHash,result}}});
    return result;
  },{isolationLevel:'Serializable',maxWait:10000,timeout:120000});
}
module.exports={readSnapshot,applyPlan};
