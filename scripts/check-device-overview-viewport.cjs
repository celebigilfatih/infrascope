/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
function load(file) {
 const mod = { exports: {} };
 const code = ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInThisContext(`(function(require,module,exports){${code}\n})`)(name=>load(path.resolve(path.dirname(file),name+'.ts')),mod,mod.exports);
 return mod.exports;
}
const {balancedDevicePositions:layout,balancedDeviceViewport:viewport,deviceOverviewBounds:bounds}=load('lib/topology/device-overview-viewport.ts');
function fixture(count,groupCount=1) {
 const nodes=Array.from({length:count},(_,i)=>({id:`d${i}`,type:'device',position:{x:i*1000,y:-i*1000},data:{name:`Device ${i}`}}));
 const edges=nodes.slice(1).map((node,i)=>({id:`e${i}`,source:'d0',target:node.id}));
 for(let i=0;i<groupCount;i++){nodes.push({id:`g${i}`,type:'networkGroup',position:{x:5000,y:5000},data:{group:{sourceDeviceId:'d0'}}});edges.push({id:`logical${i}`,source:'d0',target:`g${i}`,data:{isNetworkGroupRelation:true}});}
 return {nodes,edges};
}
function noOverlap(nodes,p) {
 for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
  const a=nodes[i],b=nodes[j],aw=a.type==='networkGroup'&&!a.data.compactOverview?232:192,ah=a.type==='networkGroup'&&!a.data.compactOverview?232:144,bw=b.type==='networkGroup'&&!b.data.compactOverview?232:192,bh=b.type==='networkGroup'&&!b.data.compactOverview?232:144;
  assert.ok(p[a.id].x+aw<=p[b.id].x||p[b.id].x+bw<=p[a.id].x||p[a.id].y+ah<=p[b.id].y||p[b.id].y+bh<=p[a.id].y,`Overlapping labels/groups: ${a.id} / ${b.id}`);
 }
}
function inside(nodes,p,v,w,h){for(const node of nodes){const x=p[node.id].x*v.zoom+v.x,y=p[node.id].y*v.zoom+v.y,large=node.type==='networkGroup'&&!node.data.compactOverview;assert.ok(x>=31&&y>=23&&x+(large?232:192)*v.zoom<=w-31&&y+(large?232:144)*v.zoom<=h-71,`${node.id} clipped at ${w}x${h}`);}}
const sample=fixture(28),original=JSON.stringify(sample),p=layout(sample.nodes,sample.edges,1142,620),v=viewport(sample.nodes,p,1142,620);
noOverlap(sample.nodes,p);inside(sample.nodes,p,v,1142,620);
assert.ok(v.zoom>=.6,'The complete desktop summary fits above the readable zoom floor');
assert.deepEqual(layout([...sample.nodes].reverse(),[...sample.edges].reverse(),1142,620),p,'Input arrival order cannot move the map');
assert.notDeepEqual(layout(sample.nodes,sample.edges,574,500),p,'The map adapts to the available aspect ratio');
for(const count of [1,2,12,28,64,229])for(const groups of [0,1,4]){
 const data=fixture(count,groups),positions=layout(data.nodes,data.edges,1142,620);
 assert.equal(Object.keys(positions).length,data.nodes.length);noOverlap(data.nodes,positions);
 const all=viewport(data.nodes,positions,1142,620);inside(data.nodes,positions,all,1142,620);
}
assert.equal(JSON.stringify(sample),original,'Display layout cannot rewrite saved inventory or positions');
assert.deepEqual(layout([],[],574,500),{});assert.deepEqual(viewport([],{},574,500),{x:0,y:0,zoom:1});
assert.ok(bounds(sample.nodes,p).width>0);
for(const [width,height] of [[537,434],[574,450],[750,500]]){
 const compact=sample.nodes.map(node=>({...node,data:{...node.data,compactOverview:true}}));
 const packed=layout(compact,sample.edges,width,height),view=viewport(compact,packed,width,height);
 assert.equal(Object.keys(packed).length,compact.length,'Every summary node stays on the same map');
 noOverlap(compact,packed);inside(compact,packed,view,width,height);
 assert.ok(view.zoom>=13/44,'Summary scale keeps labels readable with counter-scaling');
 assert.deepEqual(layout([...compact].reverse(),[...sample.edges].reverse(),width,height),packed,'Compact layout order is stable');
}
console.log(`Balanced device viewport passed: a single complete map at desktop and narrow sizes, all 28 summary devices plus group, collision-free mixed nodes, responsive aspect ratios, stable order and unchanged inventory.`);

// Long names must contribute their complete wrapped height to the map geometry.
const { fullNameDeviceLayout } = load('lib/topology/device-overview-viewport.ts');
assert.equal(typeof fullNameDeviceLayout, 'function', 'The map needs label-aware geometry, not fixed two-line boxes');
const names = ['10.KAT_SW', '185_CM_SW', 'AMBAR_SW', 'A_BLOK_SW', 'B_BLOK', 'BaskanlikToplama BUYUKSEHIR', 'EKIP_YONETIM_SW', 'ENDEKS_OKUMA_SW', 'Elk_Sw_1', 'FortiGate 400F · HA üyesi 2', 'GUVENLIK_SW', 'HUKUK_SW1', 'ISG_ANA_DEPO_SW', 'ISLETMELER_SW1', 'ISLETMELER_SW2', 'KAMERA SW', 'KAT_3_SW', 'KAT_6_SW', 'Merkez-Switch-BB', 'Merkez-Switch-Backup', 'SANTRAL_SIP_SW', 'SAYAC_SW_1', 'SCADA FortiGate 100F · HA üyesi 1', 'SCADA FortiGate 100F · HA üyesi 2', 'SCADA_ATOLYE_BUSKI', 'Santral_Sw_1', 'Sayaç_Sw_2', 'TT-ROUTER'];
const named = fixture(28);
named.nodes.forEach((node, i) => { node.data.name = names[i]; if (node.type === 'networkGroup') node.data.group = {name:'BUSKİ TT-VPN',members:Array(19)}; });
const measure = text => [...text].reduce((sum, char) => sum + (char === ' ' ? 3.5 : char === 'i' || char === 'l' ? 3.2 : 7.8), 0);
const namedOriginal = JSON.stringify(named);
for (const [width, height] of [[537,446], [982,340], [1142,620]]) {
 const input = named.nodes.map(node => ({...node,data:{...node.data,compactOverview:width<900||height<500}}));
 const result = fullNameDeviceLayout(input,named.edges,width,height,measure);
 const reversed = fullNameDeviceLayout([...input].reverse(),[...named.edges].reverse(),width,height,measure);
 assert.deepEqual(result.positions,reversed.positions,'Inventory arrival order cannot shuffle the full-name map');
 const view = viewport(result.nodes,result.positions,width,height);
 assert.equal(result.nodes.length,29,'All devices and the group stay on one map');
 for(const node of result.nodes) {
  if(node.type==='networkGroup'&&!node.data.compactOverview)continue;
  const name=node.type==='networkGroup'?node.data.group.name:node.data.name;
  assert.equal(node.data.overviewLabelLines.join('').replace(/\s/g,''),name.replace(/\s/g,''),'No part of a device name may be discarded');
  assert.ok(node.data.overviewLabelSize*view.zoom>=12.9,'Full names remain readable after fitting');
  const pos=result.positions[node.id],h=node.data.overviewHeight;
  assert.ok(pos.y*view.zoom+view.y>=15&& (pos.y+h)*view.zoom+view.y<=height-55,'Full labels fit above the map controls');
  for(const other of result.nodes)if(other.id!==node.id){const q=result.positions[other.id],oh=other.data.overviewHeight||232,ow=other.type==='networkGroup'&&!other.data.compactOverview?232:192;assert.ok(pos.x+192<=q.x||q.x+ow<=pos.x||pos.y+h<=q.y||q.y+oh<=pos.y,`${node.id} overlaps ${other.id}`);}
 }
}
assert.equal(JSON.stringify(named),namedOriginal,'Label wrapping cannot rewrite inventory names or saved positions');
assert.deepEqual(fullNameDeviceLayout([],[],537,446,measure),{nodes:[],positions:{}});
console.log('Complete names passed: all characters, readable fitted text, no label overlap or clipping at narrow and wide sizes.');

// The building workspace uses building-device-layout, not the retired experimental
// building-device-overview module. Exercise its actual responsive/immutable layout contract.
require('./check-building-device-auto-layout.cjs');
