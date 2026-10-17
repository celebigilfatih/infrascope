/* eslint-disable @typescript-eslint/no-require-imports -- Offline regression runner. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();let network=async()=>{throw Error('Real network prohibited')},selected=null,allowed=true,reads=0,created=null,audit=null;
const request=(url='http://example.invalid/api/users')=>new (require('next/server').NextRequest)(url);
const user={id:'test-user',name:'TEST Kullanıcı',email:'test@example.invalid',role:'ADMIN',status:'ACTIVE',createdAt:new Date('2026-10-01T12:00:00Z'),lastLoginAt:new Date('2026-10-17T12:00:00Z')};
const prisma={user:{count:async()=>0,findUnique:async()=>null,create:async({data})=>(created={...user,...data}),findMany:async(options)=>{reads++;selected=options.select;return [user,{...user,id:'test-never',lastLoginAt:null}]}},userActivity:{create:async()=>({}),findMany:async()=>[{id:'test-activity',action:'edit_user',details:{},createdAt:new Date('2026-10-17T12:00:00Z')}]}};
function load(relative){const file=path.resolve(root,relative.endsWith('.ts')?relative:`${relative}.ts`);if(cache.has(file))return cache.get(file).exports;const mod={exports:{}};cache.set(file,mod);const req=name=>name==='@/lib/auth/api-permission'?{authorizeApiRequest:async()=>allowed?{allowed:true,auth:{actor:{id:'test-actor'}}}:{allowed:false,response:Response.json({success:false},{status:403})}}:name==='@/lib/prisma'?{prisma}:name==='@/lib/audit/logger'?{logAudit:async(value)=>{audit=value}}:name==='@/lib/validators'?load('lib/validators/index'):name==='@/lib/license/middleware'?{checkUserLimit:async()=>null}:name==='@/lib/auth/password'?{...load('lib/auth/password'),hashPassword:async()=> 'synthetic-password-hash'}:name.startsWith('@/')?load(name.slice(2)):name.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(file),name))):require(name);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;vm.runInThisContext(`(function(require,module,exports,fetch){${code}\n})`,{filename:file})(req,mod,mod.exports,(...args)=>network(...args));return mod.exports;}
async function main(){
  const view=load('lib/users/workspace'),row=view.parseUser({...user,createdAt:user.createdAt.toISOString(),lastLoginAt:user.lastLoginAt.toISOString()});
  assert.equal(row.role,'admin');assert.equal(row.status,'active');assert.equal(view.parseUser({...user,role:'UNKNOWN'}).role,null);
  assert.equal(view.parseUser({...user,lastLoginAt:null}).lastLoginAt,null);assert.equal(view.parseUser({...user,lastLoginAt:'bad'}).lastLoginAt,undefined);
  assert.throws(()=>view.parseUsers({success:false,data:[]}));assert.throws(()=>view.parseUsers({success:true,data:[{}]}));
  assert.throws(()=>view.parseActor({success:true,user:{id:'test',role:'ADMIN',status:'SUSPENDED'}}));
  assert.equal(view.parseActor({success:true,user:{id:'test',role:'VIEWER',status:'ACTIVE'}}).role,'viewer');
  assert.equal(view.userSearch('IZLEYICI GIRIS'),view.userSearch('İzleyici Giriş'));assert.match(view.userDate('2026-10-17T22:00:00Z'),/18.10.2026.*01:00/);
  assert.equal(view.initials({name:'',email:'test@example.invalid'}),'T');assert.equal(view.passwordChecks('Test123!').every(check=>check.valid),true);assert.equal(view.passwordChecks('A1!'+'a'.repeat(70)).every(check=>check.valid),false);
  const draft={name:row.name,email:row.email,role:'admin',status:'active'};
  assert.deepEqual(view.userPatch(row,draft),{id:row.id});assert.deepEqual(view.userPatch(row,{...draft,status:'inactive'}),{id:row.id,status:'inactive'});
  assert.deepEqual(view.userChanges(row,{...draft,role:'viewer'}),[{field:'Rol',before:'Yönetici',after:'İzleyici'}]);
  assert.throws(()=>view.userPatch(row,{...draft,name:' '}));assert.throws(()=>view.userPatch(row,{...draft,email:'bad'}));assert.throws(()=>view.userPatch(row,{...draft,role:'UNKNOWN'}));
  for(const resource of view.permissionResources)for(const action of view.permissionActions){assert.equal(view.roleAllows('admin',resource,action),true);if(action!=='read')assert.equal(view.roleAllows('viewer',resource,action),false)}
  assert.equal(view.roleAllows('viewer','audit','read'),false);assert.equal(view.roleAllows('editor','users','write'),true);assert.equal(view.roleAllows('editor','users','delete'),false);assert.equal(view.roleAllows('editor','devices','delete'),false);assert.equal(view.rolePermissionCount('admin'),21);
  const calls=[];network=async(url,options)=>{calls.push({url,options});return Response.json({success:true,data:[]})};
  await view.requestUsersJson('/api/users','Okuma hatası');assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.cache,'no-store');
  await view.requestUsersJson('/api/users','Güncelleme hatası',{method:'PATCH',body:view.userPatch(row,{...draft,name:'Yeni Ad'})});assert.deepEqual(JSON.parse(calls[1].options.body),{id:row.id,name:'Yeni Ad'});
  network=async()=>Response.json({success:true},{status:500});await assert.rejects(view.requestUsersJson('/api/users','Kaydetme hatası',{method:'PATCH',body:{}}),/sonucu doğrulanamadı/);
  network=async()=>Response.json({success:false,error:'Email already exists'},{status:400});await assert.rejects(view.requestUsersJson('/api/users','Kayıt hatası',{method:'POST',body:{}}),/e-posta adresi zaten/);
  network=async()=>Response.json({success:false,error:'private details'},{status:403});await assert.rejects(view.requestUsersJson('/api/users','Hata'),/yetkiniz/);
  network=async()=>Response.json({success:false,error:'private details'},{status:401});await assert.rejects(view.requestUsersJson('/api/users','Hata'),/Oturumunuz/);
  network=async()=>{throw Error('private database value')};await assert.rejects(view.requestUsersJson('/api/users','Güvenli hata'),error=>error.message==='Güvenli hata');
  network=async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))));await assert.rejects(view.requestUsersJson('/api/users','Hata',{timeoutMs:5}),/zamanında/);await assert.rejects(view.requestUsersJson('/api/users','Hata',{method:'POST',timeoutMs:5}),/sonucu doğrulanamadı/);
  const users=load('app/api/users/route'),response=await users.GET(request()),result=await response.json();assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(selected.password,undefined);assert.equal(result.data[0].lastLoginAt,'2026-10-17T12:00:00.000Z');assert.equal(result.data[1].lastLoginAt,null);
  const activity=load('app/api/users/activities/route'),history=await (await activity.GET(request('http://example.invalid/api/users/activities?userId=test&limit=5'))).json();assert.equal(history.data[0].occurredAt,'2026-10-17T12:00:00.000Z');assert.equal(typeof history.data[0].createdAt,'string');

  for (const status of [401,403]) {
    network=async()=>new Response('not JSON',{status});
    await assert.rejects(view.requestUsersJson('/api/users','Hata',{method:'PATCH',body:{}}),status===401?/Oturumunuz/:/yetkiniz/);
  }
  network=async()=>Response.json({success:false,error:'Email already exists'},{status:500});
  await assert.rejects(view.requestUsersJson('/api/users','Hata',{method:'POST',body:{}}),/sonucu doğrulanamadı/);
  assert.throws(()=>view.verifyUserWrite({success:true},{id:row.id}),/sonucu doğrulanamadı/);
  assert.throws(()=>view.verifyUserWrite({data:{...user,id:'wrong'}},{id:row.id}),/sonucu doğrulanamadı/);
  view.verifyUserWrite({data:user},{id:row.id,name:row.name,role:'admin'});
  const password=load('app/api/users/password/route');
  allowed=false;const before=reads;
  for(const method of ['GET','POST','PATCH','DELETE'])assert.equal((await users[method](request())).status,403);
  assert.equal((await activity.GET(request())).status,403);
  assert.equal((await password.PATCH(request())).status,403);
  assert.equal(reads,before);
  allowed=true;
  for(const limit of ['-1','0','1.5','NaN','101','5x']){
    assert.equal((await activity.GET(request('http://example.invalid/api/users/activities?userId=test&limit='+limit))).status,400);
  }
  const createRequest=new (require('next/server').NextRequest)('http://example.invalid/api/users',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'New Fixture',email:'NEW@example.invalid',role:'viewer',status:'active',password:'Fixture-Create!9'})});
  assert.equal((await users.POST(createRequest)).status,200);
  assert.equal(created.email,'new@example.invalid');assert.equal(created.role,'VIEWER');assert.equal(created.password,'synthetic-password-hash');assert.equal(audit.userId,'test-actor');assert.equal(audit.resourceId,user.id);
  console.log('Users workspace passed: effective static role rules, unknown vs no login, Istanbul dates, changed-field payloads, account and password validation, rejected/ambiguous writes, bounded HTTP reads, safe errors and read timestamps. No real account, permission, password, database or email changes.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
