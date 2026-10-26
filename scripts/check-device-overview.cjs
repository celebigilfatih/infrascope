/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const loaded = { exports: {} };
const code = ts.transpileModule(fs.readFileSync('lib/topology/device-overview.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
vm.runInThisContext(`(function(exports){${code}\n})`)(loaded.exports);
const { deviceOverviewPositions: positions, deviceOverviewScope: scope, deviceOverviewSummary: summary, deviceOverviewExtraEdges: extraEdges, OVERVIEW_DEVICE_WIDTH: W, OVERVIEW_DEVICE_HEIGHT: H } = loaded.exports;
const nodes = Array.from({length:229}, (_,i) => ({id:`d${i}`,type:'device',position:{x:i*900,y:i*20},data:{buildingId:i<200?'hq':'remote'}}));
const edges = nodes.slice(1,180).map((node,i)=>({id:`e${i}`,source:'d0',target:node.id}));
edges.push({id:'parallel',source:'d0',target:'d1'}, {id:'remote',source:'d0',target:'d228'}, {id:'remote-peer',source:'d227',target:'d228'});
const original=JSON.stringify({nodes,edges});
const layout=positions(nodes,edges);
assert.equal(Object.keys(layout).length,229);
assert.equal(new Set(Object.values(layout).map(p=>`${p.x}:${p.y}`)).size,229);
for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
 const a=layout[nodes[i].id],b=layout[nodes[j].id];
 assert.ok(Math.abs(a.x-b.x)>=W || Math.abs(a.y-b.y)>=H,'Cards and disconnected components must not overlap');
}
const width=Math.max(...Object.values(layout).map(p=>p.x))+208,height=Math.max(...Object.values(layout).map(p=>p.y))+96;
assert.ok(width/height<3 && height/width<3,'A high-degree hub must not create a long strip');
assert.deepEqual(positions([...nodes].reverse(),[...edges].reverse()),layout,'Data arrival order must not move cards');
const hq=scope(nodes,edges,'hq',null);
assert.equal(hq.nodes.length,200);assert.ok(hq.edges.every(e=>!e.id.startsWith('remote')));
const focus=scope(nodes,edges,'hq','d0');
assert.ok(focus.nodes.some(n=>n.id==='d228'),'Cross-location neighbors must remain visible in focus');
assert.ok(focus.edges.some(e=>e.id==='parallel'),'Parallel links must remain inspectable');
assert.ok(!focus.edges.some(e=>e.id==='remote-peer'),'Focus only shows incident links');
assert.deepEqual(scope(nodes,edges,'remote','d0'),scope(nodes,edges,'remote',null),'Stale focus cannot blank an unrelated location');
assert.equal(scope(nodes,edges,'all','d199').nodes.length,1,'Isolated focus remains visible');
assert.deepEqual(positions([],[]),{});assert.deepEqual(scope([],[],'all',null),{nodes:[],edges:[]});
assert.equal(JSON.stringify({nodes,edges}),original,'Overview never changes saved positions or physical records');
const sample = [
 {id:'a',type:'device',position:{x:8,y:8},data:{buildingId:'one'}},
 {id:'b',type:'device',position:{x:9,y:9},data:{buildingId:'two'}},
 {id:'c',type:'device',position:{x:10,y:10},data:{buildingId:'one'}},
 {id:'unknown',type:'device',position:{x:11,y:11},data:{}},
 {id:'network-group-g',type:'networkGroup',position:{x:500,y:500},data:{group:{sourceDeviceId:'a',sourceDevice:{buildingId:'one'}}}},
 {id:'network-group-h',type:'networkGroup',position:{x:500,y:500},data:{group:{sourceDeviceId:'a',sourceDevice:{buildingId:'one'}}}},
];
const sampleEdges = [{id:'cross',source:'a',target:'b'}, {id:'parallel',source:'a',target:'b'}, {id:'inside',source:'a',target:'c'}, {id:'unsure',source:'a',target:'unknown'}, {id:'logical',source:'a',target:'network-group-g',data:{isNetworkGroupRelation:true}}];
const unchanged=JSON.stringify({sample,sampleEdges}), projection=summary(sample,sampleEdges);
const extras=extraEdges(sample,sampleEdges);
assert.equal(extras.size,1);assert.ok(extras.has('parallel'));assert.ok(!extras.has('logical'));
assert.deepEqual([...extraEdges([...sample].reverse(),[...sampleEdges].reverse())],[...extras],'Visual forest is independent of arrival order');
assert.deepEqual(projection.nodes.map(n=>n.id),['a','b','network-group-g','network-group-h']);
assert.deepEqual(projection.edges.map(e=>e.id),['cross','parallel','logical']);
assert.ok(!projection.nodes.some(n=>n.id==='unknown'),'Missing building information cannot imply a cross-location path');
assert.ok(scope(sample,sampleEdges,'one',null).nodes.some(n=>n.type==='networkGroup'),'An anchored group remains accessible within its source location');
assert.ok(scope(sample,sampleEdges,'all','a').nodes.some(n=>n.id==='unknown'),'Focus retains real peers even without a known location');
assert.equal(JSON.stringify({sample,sampleEdges}),unchanged);
assert.equal(summary(nodes,[]).nodes.length,0,'An empty summary offers all devices without inventing links');
function noOverlap(items,layout) { for(let i=0;i<items.length;i++) for(let j=i+1;j<items.length;j++) {
 const a=items[i],b=items[j],p=layout[a.id],q=layout[b.id];
 const aw=a.type==='networkGroup'?232:W,ah=a.type==='networkGroup'?232:H,bw=b.type==='networkGroup'?232:W,bh=b.type==='networkGroup'?232:H;
 assert.ok(p.x+aw<=q.x||q.x+bw<=p.x||p.y+ah<=q.y||q.y+bh<=p.y,`Mixed card bounds overlap: ${a.id}/${b.id}`);
}}
noOverlap(sample,positions(sample,sampleEdges));
for(let count=2;count<=12;count++) { const part=nodes.slice(0,count),paths=edges.slice(0,count-1);noOverlap(part,positions(part,paths)); }

for(let count=2;count<=64;count++) {
 const part=nodes.slice(0,count),paths=edges.slice(0,count-1),radial=positions(part,paths,true);
 noOverlap(part,radial);
 assert.deepEqual(positions([...part].reverse(),[...paths].reverse(),true),radial,'Network-style rings remain stable across arrival order');
}
const networkPositions=positions(sample,sampleEdges,true);
assert.equal(loaded.exports.deviceOverviewCenterId(sample,sampleEdges),'a');
assert.equal(loaded.exports.deviceOverviewCenterId([...sample].reverse(),[...sampleEdges].reverse()),'a','Hub selection is stable');
assert.equal(loaded.exports.deviceOverviewCenterId([],[]),undefined);
noOverlap(sample,networkPositions);
const networkEdges=loaded.exports.deviceNetworkEdges(sample.map(node=>({...node,position:networkPositions[node.id]})),sampleEdges);
assert.equal(networkEdges.length,sampleEdges.length,'Network styling preserves every physical and logical record');
assert.ok(networkEdges.filter(edge=>!edge.data?.isNetworkGroupRelation).every(edge=>edge.type==='deviceOverviewCurve'));
assert.equal(networkEdges.find(edge=>edge.id==='logical').type,'smoothstep');
assert.notEqual(networkEdges.find(edge=>edge.id==='cross').data.curveLane,networkEdges.find(edge=>edge.id==='parallel').data.curveLane,'Parallel curves remain separately selectable');
assert.equal(JSON.stringify({sample,sampleEdges}),unchanged,'Visual styling cannot mutate saved connections or device layouts');
const curveStarted=Date.now(),largeCurves=loaded.exports.deviceNetworkEdges(nodes.map(node=>({...node,position:layout[node.id]})),edges);
assert.equal(largeCurves.length,edges.length);
assert.ok(Date.now()-curveStarted<1000,'Large-map curve projection remains responsive');
console.log('Actual device curve projection: '+largeCurves.length+' paths in '+(Date.now()-curveStarted)+'ms.');
console.log('Device overview passed: collision-free device/circular-group bounds, immutable cross-location summary and visual forest, real icon handles, distinct parallel curves, responsive large-map projection, location/search focus, parallel paths, isolated/unknown locations and unchanged saved inventory.');
