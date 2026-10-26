/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic route and graph fixtures only. */
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), ts = require('typescript');
let auth = { role: 'EDITOR', actor: { id: 'operator' } }, state = { groups: [], audits: [] }, failAudit = false, measurements = [];
const buildings = [{ id:'core',name:'Merkez',organizationId:'org' },{ id:'a',name:'Şube A',organizationId:'org' },{ id:'b',name:'Şube B',organizationId:'org' },{ id:'external',name:'Yedek',organizationId:'org' },{ id:'foreign',name:'Diğer',organizationId:'other' }];
const devices = [{ id:'router',name:'Router',managementIp:'10.0.0.1',buildingId:'core',rack:null },{ id:'a-router',name:'Şube A',buildingId:'a',rack:null },{ id:'other',name:'Başka',buildingId:'external',rack:null }];
const hydrate = group => group ? { ...structuredClone(group), sourceDevice: devices.find(d=>d.id===group.sourceDeviceId), members: group.members.map(buildingId=>({groupId:group.id,buildingId,building:buildings.find(b=>b.id===buildingId)})) } : null;
const prisma = {
 organization:{ findUnique:async({where})=>where.id==='org'?{id:'org',buildings:buildings.filter(b=>b.organizationId==='org')}:null,findMany:async()=>[{id:'org',name:'Organizasyon',buildings}] },
 device:{ findUnique:async({where})=>devices.find(d=>d.id===where.id)||null,findMany:async()=>devices },
 building:{ findMany:async({where})=>buildings.filter(b=>where.id.in.includes(b.id)&&b.organizationId===where.organizationId) },
 networkGroupMember:{
  findFirst:async({where})=>state.groups.flatMap(g=>g.members.map(buildingId=>({groupId:g.id,buildingId}))).find(m=>where.buildingId.in.includes(m.buildingId)&&m.groupId!==where.groupId?.not)||null,
  findUnique:async({where})=>state.groups.flatMap(g=>g.members.map(buildingId=>({groupId:g.id,buildingId}))).find(m=>m.buildingId===where.buildingId)||null,
  findMany:async()=>state.groups.flatMap(g=>g.members.map(buildingId=>({groupId:g.id,buildingId}))),
  deleteMany:async({where})=>{state.groups.find(g=>g.id===where.groupId).members=[];},
  createMany:async({data})=>{for(const m of data)state.groups.find(g=>g.id===m.groupId).members.push(m.buildingId);},
 },
 networkGroup:{
  findUnique:async({where})=>hydrate(state.groups.find(g=>g.id===where.id)),
  findUniqueOrThrow:async({where})=>{const g=hydrate(state.groups.find(g=>g.id===where.id));assert.ok(g);return g;},
  findMany:async({where}={})=>state.groups.filter(g=>g.id!==where?.id?.not).map(hydrate),
  create:async({data})=>{const group={...data,id:'group-'+(state.groups.length+1),members:data.members.create.map(m=>m.buildingId),positions:{},version:1};state.groups.push(group);return hydrate(group);},
  update:async({where,data})=>{const group=state.groups.find(g=>g.id===where.id);for(const [key,value] of Object.entries(data))group[key]=key==='version'?group.version+value.increment:value;return hydrate(group);},
  delete:async({where})=>{state.groups=state.groups.filter(g=>g.id!==where.id);},
 },
 nmsInterface:{findMany:async()=>measurements},auditLog:{create:async({data})=>{if(failAudit)throw Error('Synthetic audit failure');state.audits.push(data);}},
 $transaction:async op=>{const before=structuredClone(state);try{return await op(prisma);}catch(e){state=before;throw e;}},
};
const cache = new Map();
function load(file){
 file=path.normalize(file);if(cache.has(file))return cache.get(file).exports;
 const loaded={exports:{}};cache.set(file,loaded);
 const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const req=name=>{
  if(name==='next/server')return {NextResponse:{json:(body,opt={})=>({status:opt.status||200,body,headers:opt.headers})}};
  if(name==='@/lib/prisma')return {prisma};
  if(name==='@/lib/auth/request-actor')return {getRequestActor:async()=>auth};
  if(name.endsWith('device-links'))return {devicePortCatalog:async(db,ids)=>Object.fromEntries(ids.map(id=>[id,id==='router'?[{id:'nms:port',name:'Ethernet1',key:'if1',occupied:true}]:[]]))};
  if(name.startsWith('@/'))return load(name.slice(2)+'.ts');
  if(name.startsWith('.'))return load(path.join(path.dirname(file),name)+'.ts');
  throw Error('Unexpected live dependency: '+name);
 };
 vm.runInThisContext(`(function(require,module,exports){${source}\n})`,{filename:file})(req,loaded,loaded.exports);return loaded.exports;
}
const routes=load('app/api/network/groups/route.ts'), item=load('app/api/network/groups/[id]/route.ts'), graph=load('lib/topology/network-groups.ts');
const request=body=>({json:async()=>body,nextUrl:new URL('http://localhost/api/network/groups')});
const input={name:'Şube ağı',kind:'VPN',organizationId:'org',sourceDeviceId:'router',sourcePortId:null,memberBuildingIds:['a','b']};
async function main(){
 auth=null;assert.equal((await routes.GET(request())).status,401);assert.equal((await routes.POST(request(input))).status,401);assert.equal((await item.PATCH(request(input),{params:{id:'x'}})).status,401);assert.equal((await item.DELETE(request({}),{params:{id:'x'}})).status,401);
 auth={role:'VIEWER',actor:{id:'viewer'}};assert.equal((await routes.GET(request())).body.data.canManage,false);assert.equal((await routes.POST(request(input))).status,403);assert.equal((await item.PATCH(request(input),{params:{id:'x'}})).status,403);assert.equal((await item.DELETE(request({}),{params:{id:'x'}})).status,403);
 auth={role:'EDITOR',actor:{id:'operator'}};
 for(const invalid of [null,{}, {...input,memberBuildingIds:[]},{...input,memberBuildingIds:['foreign']},{...input,memberBuildingIds:['core']},{...input,sourcePortId:'nms:foreign'},{...input,sourceDeviceId:'missing'},{...input,name:'x'.repeat(101)}])assert.ok([400,404].includes((await routes.POST(request(invalid))).status));
 assert.equal(state.groups.length,0);
 const created=await routes.POST(request({...input,sourcePortId:'nms:port'}));assert.equal(created.status,201,'A logical anchor may reference an occupied physical port without reserving it');const id=created.body.data.id;
 const list=await routes.GET(request());assert.equal(list.body.data.items[0].lineStatus.status,'UNKNOWN');assert.equal(list.body.data.items[0].members.length,2);
 measurements=[{id:'port',operStatus:'up',lastPolledAt:new Date()}];assert.equal((await routes.GET(request())).body.data.items[0].lineStatus.status,'UP');
 measurements=[{id:'port',operStatus:'up',lastPolledAt:new Date(Date.now()-16*60_000)}];assert.equal((await routes.GET(request())).body.data.items[0].lineStatus.status,'UNKNOWN','Old port measurements must not imply a healthy WAN');measurements=[];
 assert.equal((await routes.POST(request({...input,name:'Conflict'}))).status,409);
 assert.equal((await routes.POST(request({...input,name:'Nested',sourceDeviceId:'a-router',memberBuildingIds:['external']}))).status,409);
 assert.equal((await routes.POST(request({...input,name:'Reverse nested',sourceDeviceId:'other',memberBuildingIds:['core']}))).status,409);
 assert.equal((await item.PATCH(request({...input,version:0}),{params:{id}})).status,409);
 assert.equal((await item.PATCH(request({version:1,position:{view:'building',x:40,y:80}}),{params:{id}})).status,200);
 assert.equal((await item.PATCH(request({version:2,position:{view:'physical',x:90,y:20}}),{params:{id}})).status,200);
 assert.deepEqual(state.groups[0].positions,{building:{x:40,y:80},physical:{x:90,y:20}});
 assert.equal((await item.PATCH(request({version:3,position:{view:'building',x:Infinity,y:0}}),{params:{id}})).status,400);
 failAudit=true;const before=structuredClone(state);assert.equal((await item.PATCH(request({...input,version:3,name:'Changed'}),{params:{id}})).status,503);assert.deepEqual(state,before,'Audit failure rolls back membership and group updates');failAudit=false;
 assert.equal((await item.PATCH(request({...input,version:3,name:'Updated',memberBuildingIds:['a']}),{params:{id}})).status,200);
 const inventory=structuredClone({devices,buildings});assert.equal((await item.DELETE(request({version:3}),{params:{id}})).status,409);assert.equal((await item.DELETE(request({version:4}),{params:{id}})).status,200);assert.deepEqual({devices,buildings},inventory);assert.equal(state.groups.length,0);
 const group={id:'g',name:'WAN',members:[{buildingId:'a'},{buildingId:'b'}],sourceDeviceId:'router',sourceDevice:{buildingId:'core'},positions:{}};
 const nodes=buildings.filter(b=>b.organizationId==='org').map((b,i)=>({id:'building-'+b.id,type:'building',position:{x:i*400,y:0},data:{buildingId:b.id}}));
 const edges=[{id:'one',source:'building-core',target:'building-a'},{id:'inside',source:'building-a',target:'building-b'},{id:'backup',source:'building-b',target:'building-external'}];
 const original=JSON.stringify({nodes,edges});const closed=graph.projectNetworkGroups(nodes,edges,[group],new Set(),'building',new Map(),()=>{},()=>{});
 assert.equal(closed.nodes.filter(n=>n.type==='networkGroup').length,1);assert.ok(!closed.nodes.some(n=>n.id==='building-a'));assert.equal(closed.edges.length,2,'Both the primary path and external backup survive collapse as logical summaries');assert.ok(closed.edges.every(e=>e.data.isNetworkGroupRelation));assert.equal(JSON.stringify({nodes,edges}),original);
 const open=graph.projectNetworkGroups(nodes,edges,[group],new Set(['g']),'building',new Map(),()=>{},()=>{});assert.equal(open.nodes.length,nodes.length+1);assert.deepEqual(open.nodes.find(n=>n.id==='building-a').position,nodes.find(n=>n.id==='building-a').position);assert.equal(open.edges.filter(e=>!e.data?.isNetworkGroupRelation).length,edges.length);
 const physical=[{id:'router',data:{deviceId:'router'},position:{x:0,y:0}},{id:'a-router',data:{deviceId:'a-router'},position:{x:100,y:100}}];
 assert.equal(graph.projectNetworkGroups(physical,[{id:'physical',source:'router',target:'a-router'}],[group],new Set(),'physical',new Map([['router','core'],['a-router','a']]),()=>{},()=>{}).nodes.length,2);
 assert.equal(graph.projectNetworkGroups(nodes,edges,[],new Set(),'building',new Map(),()=>{},()=>{}).nodes,nodes);
 assert.deepEqual([...graph.readExpandedNetworkGroups('bad')],[]);assert.deepEqual([...graph.readExpandedNetworkGroups('["g",null,5]')],['g']);
 assert.deepEqual(graph.groupPositions({building:{x:NaN,y:0},physical:{x:2,y:4}}),{physical:{x:2,y:4}});
 const focus=load('lib/topology/network-group-focus.ts');
 const focusGroup={...group,members:[{buildingId:'b',name:'İnegöl'},{buildingId:'a',name:'Gürsu'},{buildingId:'empty',name:'Boş konum'}]};
 const focusDevices=[{id:'r',name:'Şube Router',buildingId:'a',managementIp:'10.31.1.254',status:'UNKNOWN'},{id:'sw',name:'Switch',buildingId:'a',status:'ACTIVE'},{id:'i',name:'İnegöl Router',buildingId:'b',status:'ERROR'},{id:'outside',name:'Dış cihaz',buildingId:'external',status:'ACTIVE'}];
 const allVisible=new Set(focusDevices.map(d=>d.id)), focusBefore=JSON.stringify({focusGroup,focusDevices});
 const sites=focus.networkGroupSites(focusGroup,focusDevices,allVisible,'',false);
 assert.deepEqual(sites.map(s=>s.name),['Boş konum','Gürsu','İnegöl']);
 assert.equal(sites.find(s=>s.buildingId==='a').total,2);assert.equal(sites.find(s=>s.buildingId==='empty').total,0);
 assert.equal(focus.networkGroupSites(focusGroup,focusDevices,allVisible,'10.31.1.254',false)[0].devices[0].id,'r');
 assert.equal(focus.networkGroupSites(focusGroup,focusDevices,allVisible,'İNEGÖL',false)[0].name,'İnegöl');
 assert.equal(focus.networkGroupSites(focusGroup,focusDevices,allVisible,'gursu',false)[0].name,'Gürsu');
 assert.equal(focus.networkGroupSites(focusGroup,focusDevices,allVisible,'inegol',false)[0].name,'İnegöl');
 const filteredSites=focus.networkGroupSites(focusGroup,focusDevices,new Set(['sw']),'',true);
 assert.equal(filteredSites.length,1);assert.equal(filteredSites[0].total,2);assert.equal(filteredSites[0].visibleCount,1);assert.equal(filteredSites[0].devices[0].id,'sw');
 assert.equal(focus.networkGroupSites(focusGroup,focusDevices,new Set(['sw']),'10.31.1.254',true).length,0,'Search must not reveal devices hidden by active filters');
 assert.equal(focus.networkGroupSites(focusGroup,focusDevices,new Set(),'',true).length,0);
 assert.deepEqual(focus.groupInventorySummary(focusDevices.slice(0,3)),{active:1,inactive:1,other:1});
 assert.equal(JSON.stringify({focusGroup,focusDevices}),focusBefore,'Focus, search and filters never modify membership or inventory');
 const {reviewedGroup}=require('./seed-drawio-network-group.cjs'),{digest}=require('./drawio-topology-plan.cjs');
 const payload={sha256:'source-hash',pageId:'page',organizationId:'org',devices:[{id:'a-router',name:'TT-ROUTER · A'}]};const artifact={...payload,planHash:digest(payload)};
 const snapshot={devices,organizations:[{id:'org',buildings}],links:[{source:'DRAWIO',sourceRef:'page/edge',sourceDeviceId:'router',targetDeviceId:'a-router'}]};
 assert.deepEqual(reviewedGroup(artifact,snapshot,'10.0.0.1','WAN',1).body.memberBuildingIds,['a']);
 assert.throws(()=>reviewedGroup({...artifact,planHash:'bad'},snapshot,'10.0.0.1','WAN',1),/hash mismatch/);
 assert.throws(()=>reviewedGroup(artifact,snapshot,'10.0.0.1','WAN',2),/count/);
 console.log('Network groups passed: authenticated CRUD, permissions, organization/port ownership, exclusive membership, concurrency, atomic audit rollback, deletion preservation, collapsed/expanded building and device projections, backup paths, original layout/count preservation and storage validation. Synthetic records only.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
