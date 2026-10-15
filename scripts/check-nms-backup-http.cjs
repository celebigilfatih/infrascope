// Real HTTP acceptance checks against an isolated customer Compose deployment.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
if (!(process.env.DATABASE_URL || '').includes('/infrascope_backup_acceptance')) throw new Error('Acceptance database required');
const base='http://127.0.0.1:3000';
function cookie(role) {
  const issued=Math.floor(Date.now()/1000);
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const token=encode({alg:'HS256'})+'.'+encode({userId:`backup-acceptance-${role.toLowerCase()}`,email:`backup-${role.toLowerCase()}@example.invalid`,role,iat:issued,exp:issued+600});
  return 'infrascope_session='+token+'.'+crypto.createHmac('sha256',process.env.NEXTAUTH_SECRET).update(token).digest('base64url');
}
async function request(role,pathname,method='GET',body,key=crypto.randomUUID()) {
  return fetch(base+pathname,{method,headers:{...(role?{cookie:cookie(role)}:{}),'Content-Type':'application/json','Idempotency-Key':key},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
async function wait(jobId,expected='succeeded') {
  for(let index=0;index<60;index++) {
    const response=await request('EDITOR',`/api/integrations/nms/backup-jobs?id=${jobId}`);
    assert.equal(response.status,200);
    const job=(await response.json()).jobs[0];
    if(job.status==='failed' || job.status==='succeeded') {
      assert.equal(job.status,expected,`Unexpected fixture outcome: ${job.errorCode}`);return job;
    }
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  throw new Error('Fixture job timed out');
}
async function main() {
  const mode=process.argv[2]||'normal';
  if(mode==='failure' || mode==='recovery') {
    const response=await request('EDITOR','/api/integrations/nms/backups','POST',{device_id:900001});
    assert.equal(response.status,202);
    const job=await wait((await response.json()).job.id,mode==='failure'?'failed':'succeeded');
    if(mode==='failure') assert.equal(job.errorCode,'AUTH_FAILED');
    await request('ADMIN','/api/alarms/check','POST',{});
    await request('ADMIN','/api/alarms/check','POST',{});
    console.log(`Fixture ${mode} and repeated alarm evaluation completed.`);return;
  }
  if(mode==='offline') {
    assert.equal((await (await request('EDITOR','/api/integrations/nms/backups/health')).json()).available,false);
    assert.equal((await request('EDITOR','/api/integrations/nms/backups')).status,200);
    const response=await request('EDITOR','/api/integrations/nms/backups','POST',{device_id:900001});
    assert.equal(response.status,202);const job=(await response.json()).job;
    fs.writeFileSync('/tmp/backup-acceptance-offline-job',job.id);
    console.log('NMS-offline HTTP acceptance passed: stored backups readable, job durable.');return;
  }
  if(mode==='restarted') {
    await wait(fs.readFileSync('/tmp/backup-acceptance-offline-job','utf8'));
    console.log('NMS restart acceptance passed: queued job completed.');return;
  }
  assert.equal((await request(null,'/api/integrations/nms/backups')).status,401);
  assert.equal((await request('VIEWER','/api/integrations/nms/backups','POST',{device_id:900001})).status,403);
  assert.equal((await request('EDITOR','/api/integrations/nms/backup-policies','PUT',{})).status,403);
  const key=crypto.randomUUID();const started=Date.now();
  const response=await request('EDITOR','/api/integrations/nms/backups','POST',{device_id:900001},key);
  assert.equal(response.status,202);assert.ok(Date.now()-started<3000,'Acceptance must not wait for SSH capture');
  const first=(await response.json()).job;
  const simultaneous=await Promise.all(Array.from({length:5},()=>request('EDITOR','/api/integrations/nms/backups','POST',{device_id:900001},key)));
  for(const result of simultaneous) { assert.equal(result.status,202); assert.equal((await result.json()).job.id,first.id); }
  const repeated=await request('EDITOR','/api/integrations/nms/backups','POST',{device_id:900001},key);
  assert.equal((await repeated.json()).job.id,first.id);
  const finished=await wait(first.id);
  const download=await request('EDITOR',`/api/integrations/nms/backups/${finished.backupId}?action=download`);
  assert.equal(download.status,200);assert.match(await download.text(),/hostname fixture-running/);
  assert.equal(download.headers.get('cache-control'),'private, no-store');
  assert.equal((await request('VIEWER',`/api/integrations/nms/backups/${finished.backupId}?action=download`)).status,403);
  assert.equal((await request('EDITOR',`/api/integrations/nms/backups/${finished.backupId}`,'DELETE')).status,403);
  const listing=await (await request('VIEWER','/api/integrations/nms/backups')).json();
  assert.ok(listing.data.some(backup=>backup.id===finished.backupId));
  assert.doesNotMatch(JSON.stringify(listing),/configuration|fixture-password|sshPassword/);
  const startup=await request('EDITOR','/api/integrations/nms/backups','POST',{device_id:900001,backup_type:'Startup Config'});
  assert.equal(startup.status,202);const startupJob=await wait((await startup.json()).job.id);
  const startupFile=await request('EDITOR',`/api/integrations/nms/backups/${startupJob.backupId}?action=download`);
  assert.match(await startupFile.text(),/hostname fixture-startup/);
  assert.equal((await (await request('EDITOR','/api/integrations/nms/backups/health')).json()).available,true);
  console.log('Real customer-stack HTTP acceptance passed: roles, 202 queue, idempotency, SSH capture, Running/Startup, encrypted artifact download.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
