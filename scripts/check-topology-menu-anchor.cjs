/* eslint-disable @typescript-eslint/no-require-imports -- Real geometry policy, no browser or database. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),Module=require('node:module');
const file=path.resolve('lib/topology/menu-anchor.ts');
assert.ok(fs.existsSync(file),'Late scroll events must not dismiss a menu whose anchor did not move');
const loaded=new Module(file,module);loaded._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,file);
const {topologyMenuAnchorMoved}=loaded.exports;
const bounds={left:30,top:100,right:130,bottom:130};
assert.equal(topologyMenuAnchorMoved(bounds,{...bounds}),false,'A queued pre-open scroll or unrelated scroll keeps the menu open');
assert.equal(topologyMenuAnchorMoved(bounds,{...bounds,top:100.2,bottom:130.2}),false,'Ignore subpixel rounding noise');
assert.equal(topologyMenuAnchorMoved(bounds,{...bounds,top:80,bottom:110}),true,'Actual ancestor scroll dismisses the old anchor position');
assert.equal(topologyMenuAnchorMoved(bounds,{...bounds,left:0,right:100}),true,'Horizontal movement dismisses the menu');
assert.equal(topologyMenuAnchorMoved(bounds,{...bounds,right:200}),true,'Scale/size changes invalidate menu placement');
assert.equal(topologyMenuAnchorMoved(bounds,null),true,'Removed anchors dismiss the menu');
console.log('Topology menu anchor passed: queued/unrelated scroll, actual movement, scaling, subpixel rounding and removed anchors.');
