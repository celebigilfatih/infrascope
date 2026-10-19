/* eslint-disable @typescript-eslint/no-require-imports -- Real model, reader, scoped factory and route with isolated I/O. */
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const { fixture } = require('./check-fortigate-snmp.cjs');
const f = fixture(), model = f.load('lib/security/ssl-vpn.ts'), route = f.load('app/api/integrations/fortigate/ssl-vpn/workspace/route.ts');
const scope = { configId: 'config-a', vdom: 'root', host: 'a.invalid' };
const request = extra => new NextRequest('http://localhost/api/integrations/fortigate/ssl-vpn/workspace?' + new URLSearchParams({ configId: scope.configId, vdom: scope.vdom, expectedHost: scope.host, ...extra }));
const raw = [
 { user_name: 'TEST', remote_host: '198.51.100.1', duration: 0, last_login_timestamp: 1792108800, two_factor_auth: true, interface: 'ssl.root', subsessions: [{ aip: '10.0.0.1', in_bytes: 0, out_bytes: '9007199254740993' }, { aip: '10.0.0.2', in_bytes: '1024', out_bytes: '7' }], password: 'PRIVATE_SECRET' },
 { user_name: 'TEST', remote_host: '198.51.100.1', duration: '3661', two_factor_auth: false, subsessions: [{ aip: '10.0.0.3', in_bytes: 0, out_bytes: 0 }] },
 { user_name: 'OTHER', remote_host: '2001:db8::1', last_login_timestamp: 0, duration: -1, two_factor_auth: 'false', subsessions: [{ aip: '10.0.0.4', in_bytes: 10 }, {}] },
];
const at = new Date(f.state.now).toISOString();
async function main() {
 const snapshot = model.normalizeSslVpn(raw, at), [a,b,c] = snapshot.rows;
 assert.equal(a.sourceAddress, '198.51.100.1'); assert.deepEqual(JSON.parse(JSON.stringify(model.sslVpnAddresses(a))), ['10.0.0.1','10.0.0.2']); assert.equal(a.incoming, '1024'); assert.equal(a.outgoing, '9007199254741000'); assert.equal(a.durationSeconds, 0); assert.equal(b.durationSeconds, 3661); assert.notEqual(a.id,b.id); assert.equal(b.outgoing,'0'); assert.equal(c.incoming,null); assert.equal(c.outgoing,null); assert.equal(c.twoFactor,null); assert.equal(c.loginAt,null); assert.equal(c.durationSeconds,null); assert.equal(model.sslVpnSummary(snapshot.rows).users,2); assert.equal(model.sslVpnSummary(snapshot.rows).records,3); assert.equal(model.sslVpnSummary(snapshot.rows).incoming,null); assert.ok(!JSON.stringify(snapshot).includes('PRIVATE'));
 assert.deepEqual(JSON.parse(JSON.stringify(model.sslVpnSummary([]))),{records:0,users:0,incoming:'0',outgoing:'0'});
 assert.equal(model.sslVpnSummary(model.normalizeSslVpn([{}],at).rows).users,null);
 for (const subsessions of [undefined,[],null,{}]) assert.equal(model.normalizeSslVpn([{subsessions}],at).rows[0].incoming,null);
 for (const input of [null,{},undefined,[null]]) assert.throws(()=>model.normalizeSslVpn(input,at));
 assert.equal(model.sslVpnDuration(0),'0 saniye'); assert.equal(model.sslVpnDuration(3661),'1 saat 1 dakika 1 saniye'); assert.equal(model.sslVpnDuration(90061),'1 gün 1 saat 1 dakika 1 saniye'); assert.equal(model.sslVpnDuration(null),'Bilgi yok');
 const envelope={success:true,source:'fortigate-rest',target:scope,data:snapshot}; model.parseSslVpnSnapshot(envelope,scope);
 for(const key of Object.keys(scope)) assert.throws(()=>model.parseSslVpnSnapshot({...envelope,target:{...scope,[key]:'WRONG'}},scope));
 for(const change of [{collectedAt:new Date(f.state.now+60000).toISOString()},{rows:[a,a]},{rows:[{...a,incoming:'0'}]},{rows:[{...a,twoFactor:'false'}]},{rows:[{...a,durationSeconds:-1}]}]) assert.throws(()=>model.parseSslVpnSnapshot({...envelope,data:{...snapshot,...change}},scope));
 const huge=model.normalizeSslVpn([{user_name:'X',subsessions:[{in_bytes:'9'.repeat(78),out_bytes:0},{in_bytes:'9'.repeat(78),out_bytes:0}]}],at); model.parseSslVpnSnapshot({...envelope,data:huge},scope); assert.equal(huge.rows[0].incoming.length,79);
 const csv=model.sslVpnCsv([{...a,username:' =TEST;"quoted"\nnext'}],{...scope,collectedAt:at,historical:true}); assert.ok(csv.startsWith('\ufeff')); assert.ok(csv.includes('"\' =TEST;""quoted""\nnext"')); assert.ok(csv.includes('Önceki veri')); assert.ok(csv.includes('9007199254741000')); assert.ok(csv.includes(at)); assert.ok(csv.includes('root'));
 for(const extra of [{configId:''},{vdom:''},{expectedHost:''}]) assert.equal((await route.GET(request(extra))).status,400);
 f.state.allowed=false; assert.equal((await route.GET(request())).status,403); assert.equal(f.state.transport.length,0); f.state.allowed=true;
 assert.equal((await route.GET(request())).status,501); assert.equal(f.state.transport.length,0); f.state.configs[0].config.syncMode='rest';
 let response=await route.GET(request()), body=await response.json(); assert.equal(response.status,200); assert.match(response.headers.get('cache-control'),/no-store/); assert.equal(model.parseSslVpnSnapshot(body,scope).rows.length,0); assert.equal(f.state.transport.length,1); assert.ok(f.state.transport[0].url.endsWith('/api/v2/monitor/vpn/ssl?vdom=root'));
 const service=(await f.connector('config-a')).service;let calls=0,fail=false,malformed=false;
 service.apiRequest=async endpoint=>{calls++;assert.equal(endpoint,'/monitor/vpn/ssl');if(fail)throw Error('PRIVATE_FAILURE');return malformed?{}:{results:raw};};
 response=await route.GET(request());body=await response.json();assert.equal(response.status,200);assert.equal(model.parseSslVpnSnapshot(body,scope).rows[0].outgoing,'9007199254741000');assert.ok(!JSON.stringify(body).includes('PRIVATE'));
 const legacy=await service.getSSLVPNUsers(); assert.equal(legacy[0].aip,'10.0.0.1');assert.equal(legacy[0].in_bytes,0,'Legacy alarm reader contract is unchanged');
 fail=true;response=await route.GET(request());body=await response.json();assert.equal(body.success,false);assert.equal(body.data,undefined);assert.ok(!JSON.stringify(body).includes('PRIVATE'));fail=false;
 malformed=true;assert.equal((await route.GET(request())).status,502);malformed=false;
 const before=calls;assert.equal((await route.GET(request({expectedHost:'wrong.invalid'}))).status,409);assert.equal(calls,before);
 f.state.configs[0].enabled=false;assert.equal((await route.GET(request())).status,409);assert.equal(calls,before);f.state.configs[0].enabled=true;
 assert.equal((await route.GET(request({configId:'missing'}))).status,404);
 response=await route.GET(request({vdom:'TEST-B'}));body=await response.json();assert.equal(response.status,200);assert.equal(body.target.vdom,'TEST-B');assert.ok(f.state.transport.at(-1).url.endsWith('vdom=TEST-B'));
 const Service=f.load('lib/integrations/fortigate.ts').FortiGateService;
 const cookieService=new Service({host:'cookie.test.invalid',accessToken:'',username:'TEST',password:'TEST',syncMode:'rest',vdom:'root'});
 let logins=0;cookieService.login=async()=>{logins++;await Promise.resolve();cookieService.sessionCookie='TEST-COOKIE';cookieService.sessionExpiry=f.state.now+60000;};
 const beforeCookie=f.state.transport.length;
 const simultaneous=await Promise.all([cookieService.getSSLVPNWorkspace(),cookieService.getSSLVPNWorkspace()]);
 assert.equal(logins,1,'Concurrent SSL-VPN reads share one cold cookie authentication');assert.equal(simultaneous[0],simultaneous[1]);assert.equal(f.state.transport.length-beforeCookie,1);
 await cookieService.getSSLVPNWorkspace();assert.equal(f.state.transport.length-beforeCookie,2,'Completed reads are not response-cached');
 const original=cookieService.apiRequest;cookieService.apiRequest=async()=>{throw Error('PRIVATE_SOURCE_FAILURE');};
 const failures=await Promise.allSettled([cookieService.getSSLVPNWorkspace(),cookieService.getSSLVPNWorkspace()]);assert.ok(failures.every(row=>row.status==='rejected'));cookieService.apiRequest=original;
 await cookieService.getSSLVPNWorkspace();assert.equal(f.state.transport.length-beforeCookie,3,'Rejected reads release the in-flight slot');
 const other=new Service({host:'other.test.invalid',accessToken:'TEST',syncMode:'rest',vdom:'Other'});await Promise.all([cookieService.getSSLVPNWorkspace(),other.getSSLVPNWorkspace()]);assert.equal(f.state.transport.length-beforeCookie,5);assert.ok(f.state.transport.at(-1).url.includes('vdom=Other'));
 assert.equal(f.state.writes.length,0);assert.equal(f.state.inventory.length,0);assert.equal(f.state.configUpdates.length,0);
 console.log('SSL-VPN checks passed: source vs tunnel addresses, all child counters, exact large totals, same-user sessions, unknown vs zero, strict 2FA, durations, CSV safety/scope, real reader/factory/authorized route, disabled/SNMP/host guards, legacy alarm compatibility and no writes.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
