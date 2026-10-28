import assert from 'node:assert/strict';
import { probeCandidates, promoteCandidates } from './promote-customer-images.mjs';
const version='1.0.10',revision='a'.repeat(40),image='ghcr.io/example/infrascope-customer';
const digests={app:'sha256:'+'1'.repeat(64),nms:'sha256:'+'2'.repeat(64)};
function fixture(options={}){
  const calls=[];
  const exec=args=>{
    calls.push(args);
    const text=args.join(' '),nms=text.includes(image+'-nms'),key=nms?'nms':'app';
    if(text.startsWith('buildx imagetools inspect')){
      if(text.includes(':verified-')){
        if(options.network)return {status:1,stderr:'unauthorized'};
        if(options.absent || options.partial && nms)return {status:1,stderr:'manifest unknown'};
      }else if(!calls.some(c=>c[2]==='create' && c.includes(args[3]))){
        return options.conflict?{status:0,stdout:'sha256:'+'3'.repeat(64)}:{status:1,stderr:'manifest unknown'};
      }
      return {status:0,stdout:options.changed && !text.includes(':verified-')?'sha256:'+'3'.repeat(64):digests[key]};
    }
    if(text.startsWith('image inspect'))return {status:0,stdout:JSON.stringify([{Os:'linux',Architecture:'amd64',Config:{Labels:{'org.opencontainers.image.version':version,'org.opencontainers.image.revision':options.wrongRevision?'b'.repeat(40):revision}}}])};
    return {status:0,stdout:''};
  };
  return {calls,exec};
}
const test=(name,fn)=>{fn();console.log('PASS '+name);};
test('absent candidates preserve the normal gated build path',()=>{
  const f=fixture({absent:true});assert.equal(probeCandidates({version,revision,image,exec:f.exec}).available,false);
  assert.ok(f.calls.every(c=>c[0]==='buildx' && c[2]==='inspect'));
});
test('auth/network failures and partial candidate sets never fall back to a different build',()=>{
  for(const options of [{network:true},{partial:true}]){const f=fixture(options);assert.throws(()=>probeCandidates({version,revision,image,exec:f.exec}));assert.ok(!f.calls.some(c=>c[2]==='create'));}
});
test('candidate OCI identity must match the exact release source',()=>{
  const f=fixture({wrongRevision:true});assert.throws(()=>probeCandidates({version,revision,image,exec:f.exec}),/identity/);
});
test('promotion uses the probed immutable digests and verifies the stable result',()=>{
  const f=fixture(),manifest=probeCandidates({version,revision,image,exec:f.exec});
  promoteCandidates({version,revision,image,manifest,exec:f.exec});
  const writes=f.calls.filter(c=>c[2]==='create');assert.equal(writes.length,2);
  assert.ok(writes[0].includes(image+'@'+digests.app));assert.ok(writes[1].includes(image+'-nms@'+digests.nms));
  assert.ok(!f.calls.some(c=>c[0]==='build'));
});
test('existing different stable images and changed promotion responses fail closed',()=>{
  for(const options of [{conflict:true},{changed:true}]){const f=fixture(options),manifest=probeCandidates({version,revision,image,exec:f.exec});assert.throws(()=>promoteCandidates({version,revision,image,manifest,exec:f.exec}),/differs|changed/);}
});
test('foreign manifest or invalid version/revision cannot trigger Docker',()=>{
  const f=fixture();assert.throws(()=>probeCandidates({version:'latest',revision,image,exec:f.exec}));assert.equal(f.calls.length,0);
  const manifest={available:true,version,revision,image:'ghcr.io/other/foreign',app:digests.app,nms:digests.nms};
  assert.throws(()=>promoteCandidates({version,revision,image,manifest,exec:f.exec}),/identity/);assert.equal(f.calls.length,0);
});
