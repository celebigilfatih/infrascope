/* eslint-disable @typescript-eslint/no-require-imports -- Isolated Playwright CLI orchestration. */
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');

function listedTests(report) {
  const rows=[],seen=new Set();
  function visit(suite,titles) {
    for(const spec of suite.specs||[])for(const test of spec.tests||[]){
      const id=`${spec.id}:${test.projectName}`;
      if(seen.has(id))throw new Error(`Duplicate collected test: ${id}`);
      seen.add(id);rows.push({id,rawId:spec.id,line:`[${test.projectName}] › ${spec.file.replaceAll('\\','/')} › ${[...titles,spec.title].join(' › ')}`});
    }
    for(const child of suite.suites||[])visit(child,[...titles,child.title]);
  }
  for(const suite of report.suites||[])visit(suite,[]);
  return rows;
}
function splitBatches(rows,limit=80){
  if(!Number.isInteger(limit)||limit<1)throw new Error('Batch size must be positive.');
  return Array.from({length:Math.ceil(rows.length/limit)},(_,i)=>rows.slice(i*limit,(i+1)*limit));
}
function aggregateLastRun(entries){
  const failed=new Set();let error=false;
  for(const entry of entries){
    const last=entry.lastRun;
    if(!last||!Array.isArray(last.failedTests)||(entry.exitCode!==0&&!last.failedTests.length)){
      for(const id of entry.rawIds)failed.add(id);error=true;
    }else{
      for(const id of last.failedTests)failed.add(id);
      if(entry.exitCode!==0||last.status!=='passed')error=true;
    }
  }
  return {status:error||failed.size?'failed':'passed',failedTests:[...failed]};
}
function unfinishedTestIds(report){
  const ids=new Set();
  function visit(suite){
    for(const spec of suite.specs||[])for(const test of spec.tests||[]){
      if(test.expectedStatus!=='skipped'&&(!test.results?.length||test.results.some(r=>r.status==='interrupted')))ids.add(spec.id);
    }
    for(const child of suite.suites||[])visit(child);
  }
  for(const suite of report.suites||[])visit(suite);
  return [...ids];
}
function run(){
  const cli=require.resolve('@playwright/test/cli'),base=['test','--config=playwright.incidents.config.ts'];
  // Selection options (shard, grep, last-failed, files) are resolved ONCE. Passing
  // them again to individual batches would silently shard/filter a second time.
  const collection=spawnSync(process.execPath,[cli,...base,'--list','--reporter=json',...process.argv.slice(2)],{encoding:'utf8',maxBuffer:32*1024*1024,env:{...process.env,INFRASCOPE_E2E_BATCH_ID:'',PLAYWRIGHT_JSON_OUTPUT_FILE:undefined}});
  if(collection.status!==0){process.stderr.write(collection.stderr||collection.stdout||String(collection.error));return collection.status||1;}
  const rows=listedTests(JSON.parse(collection.stdout));
  if(!rows.length)throw new Error('No selected browser tests; refusing an empty success.');
  const batches=splitBatches(rows),root=path.resolve('output/incident-regression');fs.mkdirSync(root,{recursive:true});
  const summary={selected:rows.length,limit:80,batches:[]};let status=0;
  fs.mkdirSync(path.join(root,'results'),{recursive:true});
  // If the parent itself is interrupted before any child report, no selected
  // scenario may disappear from a subsequent recovery invocation.
  fs.writeFileSync(path.join(root,'results','.last-run.json'),JSON.stringify({status:'failed',failedTests:rows.map(r=>r.rawId)},null,2));
  for(let i=0;i<batches.length;i++){
    const id=`browser-${i+1}`,directory=path.join(root,'batches',id);fs.mkdirSync(directory,{recursive:true});
    const list=path.join(directory,'selected-tests.txt');fs.writeFileSync(list,batches[i].map(r=>r.line).join('\n')+'\n');
    const json=path.join(directory,'result.json');if(fs.existsSync(json))fs.unlinkSync(json);
    console.log(`\nBrowser batch ${i+1}/${batches.length}: ${batches[i].length} selected scenarios; fresh development server.`);
    const child=spawnSync(process.execPath,[cli,...base,'--test-list',list],{stdio:'inherit',env:{...process.env,INFRASCOPE_E2E_BATCH_ID:id}});
    const result=fs.existsSync(json)?JSON.parse(fs.readFileSync(json,'utf8')):null;
    const lastFile=path.join(directory,'results','.last-run.json');
    const lastRun=fs.existsSync(lastFile)?JSON.parse(fs.readFileSync(lastFile,'utf8')):null;
    const unfinished=result?unfinishedTestIds(result):[];
    if(lastRun&&unfinished.length){lastRun.failedTests=[...new Set([...lastRun.failedTests,...unfinished])];lastRun.status='failed';}
    const entry={id,exitCode:child.status??1,selected:batches[i].length,tests:batches[i].map(r=>r.id),rawIds:batches[i].map(r=>r.rawId),stats:result?.stats||null,lastRun};
    const reported=result?listedTests(result):[];
    if(entry.exitCode!==0||!result||!lastRun||lastRun.status!=='passed'||reported.length!==batches[i].length||reported.some(r=>!entry.tests.includes(r.id))||result.errors?.length){status=1;entry.exitCode=entry.exitCode||1;}
    summary.batches.push(entry);fs.writeFileSync(path.join(root,'browser-batches.json'),JSON.stringify(summary,null,2));
    // Keep recovery state current even if the orchestration is interrupted:
    // unexecuted groups stay selected by the next --last-failed invocation.
    const remaining=batches.slice(i+1).map(batch=>({exitCode:1,rawIds:batch.map(r=>r.rawId),lastRun:null}));
    fs.mkdirSync(path.join(root,'results'),{recursive:true});
    fs.writeFileSync(path.join(root,'results','.last-run.json'),JSON.stringify(aggregateLastRun([...summary.batches,...remaining]),null,2));
  }
  const folder=path.join(root,'report');fs.mkdirSync(folder,{recursive:true});
  fs.writeFileSync(path.join(folder,'index.html'),`<!doctype html><meta charset="utf-8"><title>Regresyon raporu</title><h1>Regresyon raporu</h1><p>${rows.length} seçili senaryo · ${status?'Hata var':'Başarılı'}</p><ul>${summary.batches.map(b=>`<li><a href="../batches/${b.id}/report/index.html">${b.id}</a>: ${b.selected} senaryo · çıkış ${b.exitCode}</li>`).join('')}</ul>`);
  return status;
}
module.exports={listedTests,splitBatches,aggregateLastRun,unfinishedTestIds};
if(require.main===module){try{process.exitCode=run();}catch(error){console.error(error.message);process.exitCode=1;}}
