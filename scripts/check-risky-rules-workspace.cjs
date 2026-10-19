/* eslint-disable @typescript-eslint/no-require-imports -- Real review model and shared policy read route; isolated I/O only. */
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const { fixture } = require('./check-fortigate-snmp.cjs');
const f = fixture(), policies = f.load('lib/security/policies.ts'), model = f.load('lib/security/risky-rules.ts'), route = f.load('app/api/firewall-policies/workspace/route.ts');
const normalMatch = { 'srcaddr-negate': 'disable', 'dstaddr-negate': 'disable', 'service-negate': 'disable' };
const names = (...values) => values.map(name=>({name}));
const raw = [
 {...normalMatch,policyid:9,name:'TEST Üç Bulgu',action:'accept',status:'enable',srcintf:names('TEST zone','wan2'),dstintf:names('dmz'),srcaddr:names('all'),dstaddr:names('all'),service:names('ALL'),hit_count:0,password:'PRIVATE'},
 {...normalMatch,policyid:2,name:'TEST Kapalı',action:'accept',status:'disable',srcintf:names('lan'),dstintf:names('wan1'),srcaddr:names('all'),dstaddr:names('all'),service:names('ALL'),hit_count:'9007199254740993'},
 {...normalMatch,policyid:7,name:'TEST Yüksek',action:'accept',srcintf:names('Internet-ISP'),dstintf:names('Internal_App'),srcaddr:names('TEST Users'),dstaddr:names('2001:db8::1'),service:names('HTTPS','DNS','TEST Gizli Hizmet'),hit_count:'12'},
 {...normalMatch,policyid:0,name:'TEST Sıfır',action:'deny',status:'enable',hit_count:'0'},
 {...normalMatch,policyid:3,action:'accept',srcaddr:[],dstaddr:names('all'),service:names('ALL')},
 {...normalMatch,policyid:4,action:'accept',status:'enable',srcintf:names('swan'),dstintf:names('island'),srcaddr:names('any'),dstaddr:names('ALL'),service:names('any'),hit_count:'5'},
 {...normalMatch,policyid:5,action:'deny',status:'enable',srcaddr:names('all'),dstaddr:names('all'),service:names('ALL'),hit_count:'42'},
];
const scope={configId:'config-a',vdom:'root',host:'a.invalid'};
const request=extra=>new NextRequest('http://localhost/api/firewall-policies/workspace?'+new URLSearchParams({configId:scope.configId,vdom:scope.vdom,expectedHost:scope.host,...extra}));
const filters={search:'',severity:'',reason:'',status:''};
async function main(){
 const rows=policies.normalizeSecurityPolicies(raw), reviews=model.reviewRiskyPolicies(rows), summary=model.riskReviewSummary(reviews);
 assert.equal(summary.policies,7);assert.equal(summary.flagged,4);assert.equal(summary.critical,2);assert.equal(summary.high,1);assert.equal(summary.low,1);assert.equal(summary.findings,6);assert.equal(summary.incomplete,2);
 assert.equal(reviews[0].reasons.join(','),'unrestricted,external,zero-hits');assert.equal(reviews[1].policy.enabled,false);assert.equal(reviews[1].severity,'critical');assert.equal(reviews[2].severity,'high');assert.equal(reviews[2].incomplete,true);assert.equal(reviews[3].severity,'low');assert.equal(reviews[4].severity,null);assert.equal(reviews[4].checks[0].state,'unknown');assert.equal(reviews[4].checks[2].state,'unknown');assert.equal(reviews[5].severity,null,'Custom any/ALL names and unrelated interface substrings are not wildcard/role proof');assert.equal(reviews[6].severity,null,'Deny action is not broad permission');
 assert.ok(!JSON.stringify(reviews).includes('PRIVATE'));assert.equal('owner' in reviews[0],false);assert.equal('affectedAssets' in reviews[0],false);
 assert.equal(model.filterRiskReviews(reviews,filters).map(r=>r.policy.policyId).join(','),'9,2,7,0','Severity order then source position, not rule ID');
 assert.equal(model.filterRiskReviews(reviews,{...filters,reason:'external'}).length,2,'Multiple-reason critical policies remain in the high-reason filter');
 assert.equal(model.filterRiskReviews(reviews,{...filters,severity:'high'}).length,1);
 assert.equal(model.filterRiskReviews(reviews,{...filters,severity:'low'}).length,1);
 assert.equal(model.filterRiskReviews(reviews,{...filters,status:'disabled'}).map(r=>r.policy.policyId).join(','),'2');
 assert.equal(model.filterRiskReviews(reviews,{...filters,status:'unknown'}).map(r=>r.policy.policyId).join(','),'7');
 for(const search of ['üç bulgu','GENİŞ KAPSAMLI','2001:db8::1','TEST Gizli Hizmet','0']) assert.ok(model.filterRiskReviews(reviews,{...filters,search}).length>0,search);
 assert.equal(model.filterRiskReviews(reviews,{...filters,severity:'critical',reason:'external',status:'disabled'}).length,0);
 assert.equal(model.reviewRiskyPolicies([]).length,0);assert.equal(model.riskReviewSummary([]).policies,0);
 for(const value of [undefined,null,[],Number.MAX_SAFE_INTEGER+1]){const row=policies.normalizeSecurityPolicies([{...normalMatch,policyid:1,hit_count:value}])[0];assert.equal(model.reviewRiskyPolicies([row])[0].reasons.length,0,'Unknown counters do not become unused rules');}
 for(const action of [undefined,'custom']){const row=policies.normalizeSecurityPolicies([{...raw[0],action,hit_count:1}])[0];assert.equal(model.reviewRiskyPolicies([row])[0].severity,null);}
 for(const key of Object.keys(normalMatch)) {
  const row=policies.normalizeSecurityPolicies([{...raw[0],[key]:'enable'}])[0];assert.equal(model.reviewRiskyPolicies([row])[0].checks[0].state,'no-match','Negated all must not be broad permission');
  for(const value of [undefined,null,'invalid']) { const missing=policies.normalizeSecurityPolicies([{...raw[0],[key]:value}])[0];assert.equal(model.reviewRiskyPolicies([missing])[0].checks[0].state,'unknown','Unknown negation must remain insufficient evidence'); }
 }
 assert.equal((await route.GET(request({expectedHost:''}))).status,400);
 f.state.allowed=false;assert.equal((await route.GET(request())).status,403);assert.equal(f.state.transport.length,0);f.state.allowed=true;
 f.state.configs[0].config.enabledModules.policies=true;assert.equal((await route.GET(request())).status,501);assert.equal(f.state.transport.length,0);
 f.state.configs[0].config.syncMode='rest';const service=(await f.connector('config-a')).service;let calls=0;
 service.apiRequest=async endpoint=>{calls++;assert.equal(endpoint,'/cmdb/firewall/policy');return{results:raw};};
 let response=await route.GET(request()),body=await response.json();assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(model.riskReviewSummary(model.reviewRiskyPolicies(policies.parsePolicySnapshot(body,scope).rows)).findings,6);
 assert.equal(body.data[0].sourceNegated,false);assert.equal(body.data[0].destinationNegated,false);assert.equal(body.data[0].serviceNegated,false);assert.ok(!JSON.stringify(body).includes('PRIVATE'));for(const key of Object.keys(scope))assert.throws(()=>policies.parsePolicySnapshot({...body,target:{...scope,[key]:'WRONG'}},scope));
 service.apiRequest=async()=>({results:[{...raw[0],'service-negate':'enable'}]});response=await route.GET(request());body=await response.json();assert.equal(body.data[0].serviceNegated,true);assert.equal(model.reviewRiskyPolicies(policies.parsePolicySnapshot(body,scope).rows)[0].checks[0].state,'no-match');
 for(const key of ['sourceNegated','destinationNegated','serviceNegated'])assert.throws(()=>policies.parsePolicySnapshot({...body,data:[{...body.data[0],[key]:'enable'}]},scope));
 const before=calls;assert.equal((await route.GET(request({expectedHost:'changed.invalid'}))).status,409);assert.equal(calls,before);
 f.state.configs[0].enabled=false;assert.equal((await route.GET(request())).status,409);assert.equal(calls,before);f.state.configs[0].enabled=true;
 service.apiRequest=async()=>({});assert.equal((await route.GET(request())).status,502);
 service.apiRequest=async()=>{throw Error('PRIVATE_PROVIDER_ERROR')};response=await route.GET(request());body=await response.json();assert.equal(body.success,false);assert.equal(body.data,undefined);assert.ok(!JSON.stringify(body).includes('PRIVATE'));
 assert.equal(f.state.writes.length,0);assert.equal(f.state.inventory.length,0);assert.equal(f.state.configUpdates.length,0);
 console.log('Risk review checks passed: policy grouping and severity order, evidence/unknown/disabled distinctions, exact reserved names, cautious interface heuristic, real-zero vs missing counters, all reasons and Turkish filters, complete policy search, shared scoped authorized reader, safe failures and no writes.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
