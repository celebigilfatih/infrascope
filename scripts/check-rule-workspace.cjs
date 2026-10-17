/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS regression runner. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), cache = new Map();
let network = async () => { throw new Error('No real network allowed'); }, updates = [], sends = 0, storedEmail = null;
let auth = { role: 'ADMIN', actor: { type: 'USER', id: 'fixture-admin', name: 'Fixture Admin' } }, reads = 0;
const row = { id:'test-rule',code:'NMS_CPU_HIGH',name:'TEST',category:'OPERATIONAL',severity:'ALARM_HIGH',enabled:true,notifyEmail:true,cooldownMinutes:30,detectionLogic:{source:'nms',threshold:85,timeWindowMinutes:10},_count:{alarmEvents:0} };
const prisma = { alarmDefinition:{findMany:async()=>{reads++;return [row]},update:async({data})=>{updates.push(data);return {...row,...data}}},notificationConfig:{findUnique:async()=>{reads++;return storedEmail},upsert:async({create,update})=>storedEmail={id:'email-id',...(storedEmail?update:create)}} };
function load(relative) {
  let file = path.resolve(root,relative.endsWith('.ts')?relative:`${relative}.ts`);
  if(!fs.existsSync(file))file=path.join(file.slice(0,-3),'index.ts');
  if(cache.has(file))return cache.get(file).exports;
  const mod={exports:{}};cache.set(file,mod);
  const req=name=>name==='@/lib/prisma'?{prisma}:(name==='@/lib/auth/request-actor'||name==='./request-actor')?{getRequestActor:async()=>{if(auth instanceof Error)throw auth;return auth}}:name==='@/lib/alarms/alarm-catalog'?{getAlarmCatalogStatus:()=>({expected:1,installed:1,missing:[],synchronized:true})}:name==='@/lib/security/integration-credentials'?{protectIntegrationConfig:config=>({...config,smtpPass:`encrypted:${config.smtpPass}`})}:name==='@/lib/notifications/email'?{sendTestEmail:async()=>{sends++;return {success:true}}}:name.startsWith('@/')?load(name.slice(2)):name.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(file),name))):require(name);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
  vm.runInThisContext(`(function(require,module,exports,fetch){${code}\n})`,{filename:file})(req,mod,mod.exports,(...args)=>network(...args));return mod.exports;
}
async function main(){
  const view=load('lib/alarms/rule-workspace');
  assert.equal(view.ruleSearchText('YUKSEK GIRIS'),view.ruleSearchText('Yüksek Giriş'));
  assert.match(view.ruleCondition(row).label,/%85/);assert.doesNotMatch(view.ruleCondition(row).label,/eşleşme/);assert.match(view.ruleCondition(row).window,/5 dakika/);
  assert.match(view.ruleCondition({...row,code:'NMS_MEMORY_HIGH',detectionLogic:{threshold:0}}).label,/%0/);
  assert.match(view.ruleCondition({...row,code:'NMS_TEMPERATURE_HIGH',detectionLogic:{threshold:70}}).label,/70 °C/);
  assert.match(view.ruleCondition({...row,detectionLogic:{threshold:150}}).label,/doğrulanamıyor/);
  assert.match(view.ruleCondition({...row,code:'NMS_PORT_DOWN'}).label,/5 dakika/);
  assert.match(view.ruleCondition({...row,code:'NMS_DEVICE_UNREACHABLE'}).window,/30 dakika/);
  assert.match(view.ruleCondition({...row,code:'NMS_BACKUP_FAILED'}).window,/politikası/);
  const counter={...row,code:'LOGIN_FAILED',detectionLogic:{threshold:5,timeWindowMinutes:15}};
  assert.equal(view.ruleCondition(counter).label,'En az 5 eşleşme');assert.equal(view.ruleCondition(counter).window,'Son 15 dakika');
  assert.match(view.ruleCondition({...counter,detectionLogic:{...counter.detectionLogic,clientCheck:'correlation'}}).label,/ilişkili/);
  assert.match(view.ruleCondition({...row,code:'CUSTOM',source:'unknown'}).label,/Kaynağa özel/);
  const email={channel:'email',enabled:true,isConfigured:true,config:{smtpHost:'smtp.example.invalid',smtpPort:587,smtpUser:'test@example.invalid',smtpPass:'********',smtpSecure:false,recipients:['test@example.invalid']}};
  assert.equal(view.ruleEmailState(row,email).tone,'info');
  assert.equal(view.ruleEmailState(row,{...email,enabled:false}).tone,'warning');
  assert.equal(view.ruleEmailState(row,email,true).tone,'neutral');
  assert.equal(view.ruleEmailState({...row,notifyEmail:false},email).label,'Bu kuralda kapalı');
  assert.equal(view.ruleEmailState({...row,enabled:false},email).label,'Kural kapalı');
  assert.equal(view.isRuleEmailConfig(email),true);assert.equal(view.isRuleEmailConfig({channel:'email',enabled:true,config:{}}),false);
  assert.equal(view.rulePatch(row,{enabled:true,notifyEmail:true,cooldown:'30'}),null);
  assert.deepEqual(view.rulePatch(row,{enabled:false,notifyEmail:true,cooldown:'0'}),{id:row.id,enabled:false,cooldownMinutes:0});
  for(const cooldown of ['','-1','1.5','525601'])assert.throws(()=>view.rulePatch(row,{enabled:true,notifyEmail:true,cooldown}));
  assert.equal(row.detectionLogic.threshold,85);
  network=async()=>new Response(JSON.stringify({success:false}),{headers:{'content-type':'application/json'}});
  await assert.rejects(view.requestRuleJson('/fake','Kaydetme başarısız',{method:'PUT'}),/başarısız/);
  network=async()=>new Response('{}',{status:403,headers:{'content-type':'application/json'}});
  await assert.rejects(view.requestRuleJson('/fake','failure'),/yetkiniz/);
  network=async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
  await assert.rejects(view.requestRuleJson('/fake','failure',{method:'PUT'},1),/sonucu doğrulanamadı/);
  const definitions=load('app/api/alarms/definitions/route');
  const request=body=>new Request('http://localhost/api/alarms/definitions',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  for(const body of [{id:row.id,cooldownMinutes:-1},{id:row.id,cooldownMinutes:1.5},{id:row.id,enabled:'false'},{id:row.id},{id:row.id,unrecognized:true}])assert.equal((await definitions.PUT(request(body))).status,400);
  assert.equal(updates.length,0);assert.equal((await definitions.PUT(request({id:row.id,notifyEmail:false,cooldownMinutes:0}))).status,200);
  assert.deepEqual(updates[0],{cooldownMinutes:0,notifyEmail:false});assert.equal('detectionLogic'in updates[0],false);
  const notification=load('app/api/alarms/notification/route');
  storedEmail={id:'saved',enabled:true,channel:'email',config:{...email.config,smtpPass:'existing-encrypted-secret'}};
  const masked=await(await notification.GET()).json();assert.equal(masked.data.config.smtpPass,'********');
  assert.equal((await notification.PUT(request({...email.config,enabled:false,smtpPass:''}))).status,200);
  assert.equal(storedEmail.config.smtpPass,'encrypted:existing-encrypted-secret');
  assert.equal(sends,0,'Saving or reading settings cannot send test messages');
  const administrator=auth;
  for(const identity of [null,{...administrator,role:'VIEWER'},new Error('Fixture identity lookup failure')]){
    auth=identity;
    const expected=identity instanceof Error?503:identity?403:401;
    const before={reads,updates:updates.length,sends,storedEmail:structuredClone(storedEmail)};
    for(const operation of [()=>definitions.PUT(request({id:row.id,enabled:false})),()=>notification.PUT(request({...email.config,enabled:false})),()=>notification.POST(request({}))]){
      assert.equal((await operation()).status,expected,'Current identity must authorize before parsing, data access or SMTP');
      assert.deepEqual({reads,updates:updates.length,sends,storedEmail},before);
    }
    if(!identity || identity instanceof Error){
      for(const operation of [()=>definitions.GET(request({})),()=>notification.GET(request({}))])assert.equal((await operation()).status,expected);
      assert.deepEqual({reads,updates:updates.length,sends,storedEmail},before);
    }
    assert.equal((await definitions.PUT(new Request('http://localhost/api/alarms/definitions',{method:'PUT',body:'{'}))).status,expected,'Authorization precedes malformed JSON');
  }
  auth=administrator;
  const listed=await definitions.GET(request({}));assert.equal(listed.status,200);assert.equal(listed.headers.get('cache-control'),'private, no-store');
  console.log('Rule workspace checks passed: source-specific thresholds, zero/unknown values, email gates, changed-field patches, rejected saves, timeout handling, server validation and saved-password preservation. No real device, database or email I/O.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
