import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceLoader} from './load-source.mjs';
const knowledge={sources:[{id:'doc',businessId:'business',title:'원문',type:'text',updatedAt:1,url:null,parts:[{id:'0',title:'신청',text:'개인 신청은 불가합니다.',pages:[]}]}],conflicts:[],withheldParts:0};
const rules=[{id:'apply',title:'신청 방법',scope:'개인 직접 신청 여부만',category:'content',kind:'fact',configJson:'{"text":"개인 신청은 불가합니다.","referral":false}',evidence:[{sourceId:'doc',partId:'0',quote:'개인 신청은 불가합니다.'}]}];
const {policyKnowledgeHash}=sourceLoader()('app/policy-rules.ts');
const hash=await policyKnowledgeHash(knowledge);
const baseVersion={business_id:'business',revision:1,status:'draft',knowledge_hash:hash,rules_json:JSON.stringify(rules),approved_by:null};
function harness(options={}){
 const calls=[];
 const account=options.account===undefined?{id:'real-admin',business_ids_json:'["business"]',is_super_admin:0}:options.account;
 const load=sourceLoader({
  '@/app/admin-session':{getAdminSession:async()=>account,accountBusinessIds:a=>JSON.parse(a.business_ids_json)},
  '@/db/knowledge':{ensureKnowledgeSchema:async()=>({}),getBusiness:async()=>{calls.push('business');return{id:'business'};},loadKnowledgeContext:async()=>options.knowledge||knowledge},
  '@/db/consultation-categories':{loadCategories:async()=>options.categories||[{id:'content',replacement_id:null}]},
  '@/db/policy-store':{latestPolicyVersion:async()=>options.version||baseVersion,savePolicyDraft:async(...args)=>{calls.push(['save',...args]);if(options.conflict)throw new Error('policy_version_conflict');},setPolicyApproval:async(...args)=>calls.push(['approve',...args])},
  '@/db/policy-extraction':{proposePolicyRules:async()=>{calls.push('generate');return rules;}},
 });
 const api=load('app/api/policy-rules/route.ts');
 return {calls,api,post:body=>api.POST(new Request('https://test/api/policy-rules',{method:'POST',headers:{'Content-Type':'application/json',...options.headers},body:JSON.stringify({businessId:'business',revision:1,knowledgeHash:hash,...body})}))};
}
test('policy API authenticates and checks the selected business before reading or mutating',async()=>{
 for(const [account,status] of [[null,401],[{id:'other',is_super_admin:0,business_ids_json:'["another"]'},403]]){
  const h=harness({account});assert.equal((await h.post({action:'generate'})).status,status);assert.deepEqual(h.calls,[]);
  assert.equal((await h.api.GET(new Request('https://test/api/policy-rules?businessId=business'))).status,status);
 }
});
test('approval requires explicit review, exact version and current source fingerprint',async()=>{
 for(const change of [{confirmed:false},{revision:2},{knowledgeHash:'stale'}]){
  const h=harness();const r=await h.post({action:'approve',confirmed:true,...change});assert.ok([400,409].includes(r.status));assert.equal(h.calls.some(c=>Array.isArray(c)&&c[0]==='approve'),false);
 }
 const h=harness();assert.equal((await h.post({action:'approve',confirmed:true,approved_by:'attacker'})).status,200);
 assert.equal(h.calls.find(c=>Array.isArray(c)&&c[0]==='approve')[4],'real-admin');
});
test('draft generation never approves, and concurrent draft edits report a conflict',async()=>{
 const h=harness();assert.equal((await h.post({action:'generate'})).status,200);
 assert.ok(h.calls.some(c=>Array.isArray(c)&&c[0]==='save'));assert.equal(h.calls.some(c=>Array.isArray(c)&&c[0]==='approve'),false);
 const conflict=harness({conflict:true});assert.equal((await conflict.post({action:'save',rules})).status,409);
});
test('foreign-origin writes and forged citations are rejected',async()=>{
 const external=harness({headers:{origin:'https://attacker.example'}});assert.equal((await external.post({action:'approve',confirmed:true})).status,403);assert.deepEqual(external.calls,[]);
 const h=harness();assert.equal((await h.post({action:'save',rules:[{...rules[0],evidence:[{sourceId:'doc',partId:'0',quote:'개인 신청 가능'}]}]})).status,400);
});
test('removed or unknown categories cannot be saved or approved',async()=>{
 for(const action of ['save','approve']){
  const h=harness({categories:[{id:'content',replacement_id:'other'}]});
  assert.equal((await h.post({action,confirmed:true,rules})).status,400);
  assert.equal(h.calls.some(c=>Array.isArray(c)),false);
 }
});
test('only an approved, attributed and source-current version activates at runtime',async()=>{
 let version=baseVersion;
 const store=sourceLoader({'./knowledge':{ensureKnowledgeSchema:async()=>({prepare:()=>({bind(){return this;},first:async()=>version})})}})('db/policy-store.ts');
 for(const change of [{},{status:'revoked'},{status:'approved',approved_by:null},{status:'approved',approved_by:'admin',knowledge_hash:'stale'}]){
  version={...baseVersion,...change};assert.deepEqual(await store.loadActivePolicyRules('business',knowledge),[]);
 }
 version={...baseVersion,status:'approved',approved_by:'admin'};
 assert.deepEqual(await store.loadActivePolicyRules('business',knowledge),rules);
 assert.deepEqual(await store.loadActivePolicyRules('business',{...knowledge,sources:[]}),[]);
});
test('policy UI displays original evidence, an explicit approval checkbox and stale status',()=>{
 const text=readFileSync(new URL('../app/knowledge/policy-panel.tsx',import.meta.url),'utf8');
 for(const pattern of [/원문과 대조/,/setConfirmed[(]false[)]/,/data.stale/,/confirmed/,/수정 초안 저장/,/검토한 버전 승인/])assert.match(text,pattern);
 assert.doesNotMatch(text,/dangerouslySetInnerHTML/);
});
