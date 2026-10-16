/* eslint-disable @typescript-eslint/no-require-imports, @next/next/no-assign-module-variable */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {NextRequest,NextResponse}=require('next/server');
const root=path.resolve(__dirname,'..'),cache=new Map();
let allowed=true,exists=true,configured=false,upstream='success';const calls=[];
const result={reachable:true,outcome:'response',checkedAt:'2026-10-16T13:00:00Z',durationMs:12,systemName:'TEST-SW',uptimeSeconds:0};
const overrides={
 '@/lib/auth/api-permission':{authorizeApiRequest:async()=>allowed?{allowed:true}:{allowed:false,response:NextResponse.json({error:'fixture forbidden'},{status:403})}},
 '@/lib/prisma':{prisma:{device:{findUnique:async()=>exists?{id:'fixture',nmsDeviceId:configured?123:null}:null}}},
 '@/lib/nms/internal-client':{nmsInternalFetch:async(url,init)=>{calls.push({url,init});if(upstream==='throw')throw new Error('fixture-secret-must-not-escape');return {ok:upstream!=='error',status:upstream==='error'?503:200,json:async()=>upstream==='malformed'?{reachable:true}:{...result,snmpCommunity:'must-not-escape'}}}},
};
function load(relative){if(cache.has(relative))return cache.get(relative).exports;const module={exports:{}};cache.set(relative,module);const code=ts.transpileModule(fs.readFileSync(path.join(root,relative),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const local=name=>overrides[name]||(name.startsWith('@/')?load(name.slice(2)+'.ts'):require(name));vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename:relative})(local,module,module.exports);return module.exports;}
const view=load('lib/nms/add-device-form.ts');
const form={deviceId:'fixture',managementIp:'192.0.2.10',snmpPort:161,snmpVersion:'v2c',snmpCommunity:'fixture-only-community',snmpV3Username:'test-user',snmpV3SecurityLevel:'authPriv',snmpV3AuthProtocol:'SHA',snmpV3AuthPassword:'fixture-auth-only',snmpV3PrivacyProtocol:'AES',snmpV3PrivacyPassword:'fixture-privacy-only',pollingInterval:300,pollingEnabled:true,sshUsername:'test-ssh',sshPassword:'fixture-ssh-only',sshPort:22};
assert.deepEqual(view.validateAddNmsForm(form,false),{});
for(const ip of ['192.0.2.10','2001:db8::10','::1'])assert.equal(view.validManagementIp(ip),true);
for(const ip of ['','localhost','https://example.test','999.1.1.1','1.2.3','01.2.3.4','224.0.0.1','0.0.0.0','255.255.255.255','::','ff02::1'])assert.equal(view.validManagementIp(ip),false);
assert.ok(view.validateAddNmsForm({...form,pollingInterval:86401},false).pollingInterval);
assert.ok(view.validateAddNmsForm({...form,snmpVersion:'v3',snmpV3Username:'Türkçe'},false).snmpV3Username);
assert.ok(view.validateAddNmsForm({...form,snmpCommunity:'x'.repeat(256)},false).snmpCommunity);
const v2=view.snmpTestPayload(form);assert.equal(v2.snmpCommunity,form.snmpCommunity);assert.equal(v2.snmpV3AuthPassword,undefined);assert.equal(v2.sshPassword,undefined);assert.equal(v2.pollingEnabled,undefined);
const v3=view.snmpTestPayload({...form,snmpVersion:'v3',snmpV3SecurityLevel:'authNoPriv'});assert.equal(v3.snmpCommunity,undefined);assert.equal(v3.snmpV3PrivacyPassword,undefined);assert.equal(v3.snmpV3AuthPassword,form.snmpV3AuthPassword);
assert.equal(view.addNmsPayload({...form,pollingEnabled:false},false).pollingEnabled,false);assert.equal(view.addNmsPayload(form,false).sshPassword,null);
assert.equal(view.affectsSnmpTest('snmpV3AuthPassword'),true);assert.equal(view.affectsSnmpTest('managementIp'),true);assert.equal(view.affectsSnmpTest('pollingInterval'),false);assert.equal(view.affectsSnmpTest('sshPassword'),false);
assert.equal(view.parseSnmpTestResult({...result,reachable:false}),null);assert.equal(view.parseSnmpTestResult({...result,durationMs:NaN}),null);assert.equal(view.parseSnmpTestResult({...result,snmpCommunity:'secret'}).snmpCommunity,undefined);
const {POST}=load('app/api/integrations/nms/test-connection/route.ts');
const request=body=>new NextRequest('http://fixture/api/integrations/nms/test-connection',{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}});
async function main(){allowed=false;assert.equal((await POST(request(v2))).status,403);assert.equal(calls.length,0);allowed=true;
 for(const body of [{...v2,snmpPort:0},{...v2,managementIp:'http://service/'},{...v2,snmpCommunity:''},{...v2,snmpVersion:'v1'}])assert.equal((await POST(request(body))).status,400);
 assert.equal(calls.length,0);exists=false;assert.equal((await POST(request(v2))).status,404);exists=true;configured=true;assert.equal((await POST(request(v2))).status,409);configured=false;
 const response=await POST(request(v2));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.deepEqual((await response.json()).result,result);const forwarded=JSON.parse(calls[0].init.body);assert.equal(forwarded.deviceId,undefined);assert.equal(forwarded.sshPassword,undefined);assert.equal(calls[0].init.timeoutMs,10000);
 upstream='malformed';assert.equal((await POST(request(v2))).status,502);upstream='error';assert.equal((await POST(request(v2))).status,503);upstream='throw';const error=await POST(request(v2));assert.equal(error.status,503);assert.doesNotMatch(JSON.stringify(await error.json()),/fixture-secret/);
 console.log('NMS add-device passed: validation, v2/v3 payload isolation, polling-disabled save, test invalidation keys, permission/inventory checks, bounded probe, sanitized outcomes. Synthetic transport only.');}
main().catch(error=>{console.error(error);process.exitCode=1});
