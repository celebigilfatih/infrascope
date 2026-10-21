/* eslint-disable @typescript-eslint/no-require-imports -- Local admin-only maintenance entry point. */
const fs=require('node:fs'),path=require('node:path');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'Node'}});
const {prisma}=require('../lib/prisma.ts');
const {readSnapshot,applyPlan}=require('./drawio-topology-db.cjs');
const {applyReconciliation}=require('./reconcile-drawio-topology.cjs');
async function main(){
  const [mode,artifact,actorId,hash]=process.argv.slice(2);
  if(mode==='snapshot'){fs.writeFileSync(artifact,JSON.stringify(await readSnapshot(prisma),null,2));console.log('Selected inventory snapshot saved.');return;}
  if(!['apply','reconcile'].includes(mode)||!artifact||!actorId||!hash)throw Error('Usage: import-drawio-topology.cjs snapshot <file> | apply/reconcile <plan> <active-admin-id> <reviewed-plan-hash>');
  let cachePath=process.env.LICENSE_CACHE_PATH||path.join(process.cwd(),'.license-cache');
  if(fs.statSync(cachePath).isDirectory())cachePath=path.join(cachePath,'license.json');
  const license=JSON.parse(fs.readFileSync(cachePath,'utf8')).state;
  if(!license?.valid||!Number.isSafeInteger(license.maxDevices)||license.maxDevices<1||!Number.isFinite(Date.parse(license.validUntil))||!Number.isFinite(Date.parse(license.lastValidated))||Date.parse(license.validUntil)<Date.now()||Date.now()-Date.parse(license.lastValidated)>24*60*60*1000)throw Error('Refresh the application license before applying an import');
  const plan=JSON.parse(fs.readFileSync(artifact,'utf8'));
  const result=await (mode==='reconcile'?applyReconciliation:applyPlan)(prisma,plan,actorId,hash,license.maxDevices);
  fs.writeFileSync(artifact+'.applied.json',JSON.stringify({planHash:plan.planHash,at:new Date().toISOString(),result},null,2));
  console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>prisma.$disconnect());
