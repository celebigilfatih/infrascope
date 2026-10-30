/* eslint-disable @typescript-eslint/no-require-imports -- Exercise the actual batch planner. */
const assert=require('node:assert/strict'),fs=require('node:fs');
assert.ok(fs.existsSync('scripts/run-incident-browser-batches.cjs'),'Long regression runs must bound the lifetime of each development server');
const {listedTests,splitBatches,aggregateLastRun,unfinishedTestIds}=require('./run-incident-browser-batches.cjs');
const report={suites:[{title:'a.spec.ts',specs:[{id:'a',file:'a.spec.ts',title:'first',tests:[{projectName:'chromium'},{projectName:'webkit'}]}],suites:[{title:'nested',specs:[{id:'b',file:'a.spec.ts',title:'keeps > literal',tests:[{projectName:'chromium'}]}]}]}]};
const before=JSON.stringify(report),rows=listedTests(report);
assert.deepEqual(rows.map(r=>r.line),['[chromium] › a.spec.ts › first','[webkit] › a.spec.ts › first','[chromium] › a.spec.ts › nested › keeps > literal']);
assert.equal(new Set(rows.map(r=>r.id)).size,3);
const batches=splitBatches(rows,2);assert.deepEqual(batches.map(b=>b.length),[2,1]);assert.deepEqual(batches.flat(),rows);assert.equal(JSON.stringify(report),before);
assert.throws(()=>splitBatches(rows,0));assert.throws(()=>listedTests({suites:[{title:'x',specs:[report.suites[0].specs[0],report.suites[0].specs[0]]}]}),/Duplicate/);
assert.deepEqual(aggregateLastRun([{exitCode:0,rawIds:['a'],lastRun:{status:'passed',failedTests:[]}}]),{status:'passed',failedTests:[]});
assert.deepEqual(aggregateLastRun([{exitCode:1,rawIds:['a','b'],lastRun:{status:'failed',failedTests:['b']}},{exitCode:1,rawIds:['c'],lastRun:null}]),{status:'failed',failedTests:['b','c']});
assert.deepEqual(aggregateLastRun([{exitCode:1,rawIds:['a'],lastRun:{status:'passed',failedTests:[]}}]),{status:'failed',failedTests:['a']},'Global/report validation failures cannot disappear from last-failed recovery');
assert.deepEqual(unfinishedTestIds({suites:[{specs:[{id:'interrupted',tests:[{expectedStatus:'passed',results:[{status:'interrupted'}]}]},{id:'pending',tests:[{expectedStatus:'passed',results:[]}]},{id:'intentional-skip',tests:[{expectedStatus:'skipped',results:[]}]}]}]}),['interrupted','pending']);
console.log('Browser batches passed: nested titles, projects, literal >, exact membership, bounded chunks, duplicates and immutable input.');
