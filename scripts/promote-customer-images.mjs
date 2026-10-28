// Promote locally rehearsed, immutable images without rebuilding them after validation.
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const digestPattern=/^sha256:[a-f0-9]{64}$/;
const docker=args=>cp.spawnSync('docker',args,{encoding:'utf8',maxBuffer:4*1024*1024});
function identity({version,revision,image}){
  if(!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(version)||! /^[a-f0-9]{40}$/.test(revision)||! /^ghcr\.io\/[a-z0-9][a-z0-9-]*\/infrascope-customer$/.test(image))throw new Error('Invalid release identity');
}
function checked(exec,args){
  const result=exec(args);
  if(result.error||result.status!==0)throw new Error('Docker verification failed: '+args.slice(0,3).join(' '));
  return String(result.stdout||'').trim();
}
function inspect(exec,reference){
  const result=exec(['buildx','imagetools','inspect',reference,'--format','{{.Manifest.Digest}}']);
  if(result.status!==0){
    if(!result.error && /manifest unknown|not found|MANIFEST_UNKNOWN/.test(result.stderr||''))return null;
    throw new Error('Candidate lookup failed; registry/auth/network failures cannot select a different build');
  }
  const digest=String(result.stdout||'').trim();
  if(!digestPattern.test(digest))throw new Error('Invalid registry digest');
  return digest;
}
function verifyImage(exec,reference,version,revision){
  checked(exec,['pull','--platform','linux/amd64',reference]);
  const info=JSON.parse(checked(exec,['image','inspect',reference]))[0];
  if(info.Os!=='linux'||info.Architecture!=='amd64'||info.Config?.Labels?.['org.opencontainers.image.version']!==version||info.Config?.Labels?.['org.opencontainers.image.revision']!==revision)throw new Error('Candidate image identity differs from release source/version/platform');
}
export function probeCandidates({version,revision,image,exec=docker}){
  identity({version,revision,image});
  const app=inspect(exec,`${image}:verified-${version}-${revision}`),nms=inspect(exec,`${image}-nms:verified-${version}-${revision}`);
  if(!app&&!nms)return {available:false,version,revision,image};
  if(!app||!nms)throw new Error('Partial candidate set; refusing to mix verified images and rebuilt images');
  verifyImage(exec,image+'@'+app,version,revision);verifyImage(exec,image+'-nms@'+nms,version,revision);
  return {available:true,version,revision,image,app,nms};
}
export function promoteCandidates({version,revision,image,manifest,exec=docker}){
  identity({version,revision,image});
  if(!manifest.available||manifest.version!==version||manifest.revision!==revision||manifest.image!==image||!digestPattern.test(manifest.app)||!digestPattern.test(manifest.nms))throw new Error('Candidate manifest identity differs');
  for(const suffix of ['', '-nms']){
    const digest=manifest[suffix?'nms':'app'],reference=image+suffix+'@'+digest,target=image+suffix+':'+version;
    verifyImage(exec,reference,version,revision);
    const previous=inspect(exec,target);
    if(previous&&previous!==digest)throw new Error('Existing stable image differs; refusing replacement');
    if(!previous)checked(exec,['buildx','imagetools','create','--prefer-index=false','--tag',target,reference]);
    if(inspect(exec,target)!==digest)throw new Error('Promoted registry digest changed');
  }
  return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    const options={};
    for(let i=2;i<process.argv.length;i++){
      const key=process.argv[i];
      if(key==='--promote')options.promote=true;
      else if(['--version','--revision','--image','--manifest'].includes(key))options[key.slice(2)]=process.argv[++i];
      else throw new Error('Unknown argument');
    }
    const result=options.promote?promoteCandidates({...options,manifest:JSON.parse(fs.readFileSync(options.manifest,'utf8'))}):probeCandidates(options);
    if(!options.promote&&options.manifest)fs.writeFileSync(options.manifest,JSON.stringify(result,null,2)+'\n');
    if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`available=${result.available}\napp=${result.app||''}\nnms=${result.nms||''}\n`);
    console.log(result.available?'Verified immutable candidate images selected.':'No preverified candidates; normal gated release builds remain enabled.');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
