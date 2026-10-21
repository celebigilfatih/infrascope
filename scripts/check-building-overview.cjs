/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const loaded = { exports: {} };
const code = ts.transpileModule(fs.readFileSync('lib/topology/building-overview.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
vm.runInNewContext('(function(exports){' + code + '\n})', {})(loaded.exports);
const { balancedBuildingOverview: project } = loaded.exports;
const buildings = [{ id:'hub', name:'Merkez' }, ...Array.from({length:9}, (_, i) => ({id:'b'+i,name:'Bina '+i})),{id:'remote',name:'Uzak konum'}];
const links = buildings.slice(1,10).map(b => ({sourceBuildingId:'hub',destBuildingId:b.id}));
links.push({sourceBuildingId:'b0',destBuildingId:'b1'},{sourceBuildingId:'b2',destBuildingId:'b3'},{sourceBuildingId:'hub',destBuildingId:'remote'});
const groups = [{id:'g',sourceDevice:{buildingId:'hub'},members:[{buildingId:'remote'}]}];
const nodes = [...buildings.filter(b=>b.id!=='remote').map((b,i)=>({id:'building-'+b.id,type:'building',position:{x:i*120,y:999},data:{buildingId:b.id,name:b.name}})),{id:'building-none',type:'building',data:{buildingId:'none'},position:{x:2000,y:1000}},{id:'network-group-g',type:'networkGroup',position:{x:600,y:341},data:{group:groups[0]}}];
const edges=links.filter(l=>l.destBuildingId!=='remote').map((l,i)=>({id:'e'+i,source:'building-'+l.sourceBuildingId,target:'building-'+l.destBuildingId,data:{routeBlocked:true,buildingConnection:{...l}}}));
edges.push({id:'logical',source:'building-hub',target:'network-group-g',data:{isNetworkGroupRelation:true}});
const original=JSON.stringify({nodes,edges,links,groups});
const graph=project(nodes,edges,buildings,links,groups,false,'none');
assert.equal(graph.centerId,'building-hub');assert.equal(graph.nodes.length,11);assert.equal(graph.crossLinks.length,2);assert.equal(graph.hiddenCrossLinks.length,2);assert.equal(graph.edges.length,10);
assert.ok(!graph.nodes.some(n=>n.id==='building-none'));assert.equal(graph.nodes.find(n=>n.type==='networkGroup').data.roundOverview,true);
assert.ok(graph.edges.every(e=>e.data.routeBlocked===false));assert.ok(graph.nodes.every(n=>!n.connectable&&!n.draggable));
assert.equal(JSON.stringify({nodes,edges,links,groups}),original,'A display preset cannot mutate saved positions or physical links');
const all=project(nodes,edges,buildings,links,groups,true,'none');assert.equal(all.edges.length,edges.length);assert.equal(all.hiddenCrossLinks.length,0);assert.deepEqual(all.nodes.map(n=>n.position),graph.nodes.map(n=>n.position));
const focused=project(nodes,edges,buildings,links,groups,false,'none','building-b0');assert.equal(focused.hiddenCrossLinks.length,1);assert.ok(focused.edges.some(e=>e.id==='e9'));
const filtered=project(nodes.filter(n=>n.id!=='building-b1'),edges.filter(e=>e.target!=='building-b1'),buildings,links,groups,false,'none');
for(const n of filtered.nodes)assert.deepEqual(n.position,graph.nodes.find(g=>g.id===n.id).position,'Filtering must preserve the remaining layout');
assert.equal(project([],[],[],[],[],false,'none').nodes.length,0);
const isolated=[{id:'building-x',type:'building',position:{x:0,y:0},data:{buildingId:'x'}}];assert.equal(project(isolated,[],[{id:'x',name:'Tek bina'}],[],[],false,'none').crossLinks.length,0);
// A disconnected component is not a hub cross-link and remains visible.
const disconnected=[...nodes,{id:'building-x',type:'building',position:{x:0,y:0},data:{buildingId:'x'}},{id:'building-y',type:'building',position:{x:0,y:0},data:{buildingId:'y'}}];
assert.ok(project(disconnected,[...edges,{id:'xy',source:'building-x',target:'building-y'}],[...buildings,{id:'x',name:'X'},{id:'y',name:'Y'}],links,groups,false,'none').edges.some(e=>e.id==='xy'));
// Parallel paths cannot replace unique-neighbor hub selection or disappear.
const parallel=Array.from({length:20},(_,i)=>({id:'parallel'+i,source:'building-b0',target:'building-b1'}));
const p=project(nodes,[...edges,...parallel],buildings,[...links,...parallel.map(()=>({sourceBuildingId:'b0',destBuildingId:'b1'}))],groups,true,'none');assert.equal(p.centerId,'building-hub');assert.equal(p.edges.length,edges.length+20);
console.log('Building overview passed: balanced hub, real endpoints, explicit cross-link visibility, filtered position stability, disconnected/parallel paths, circular groups and immutable saved inventory/layout. Synthetic records only.');
