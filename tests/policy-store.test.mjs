import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {sourceLoader} from './load-source.mjs';

test('actual policy SQL preserves versions, rejects stale writes and gates approval',async()=>{
 const sqlite=new DatabaseSync(':memory:');
 const DB={prepare(sql){
  let values=[];const statement={sql,bind(...args){values=args;return statement;},
   async run(){return{meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}};},
   async first(){return sqlite.prepare(sql).get(...values)||null;},
  };return statement;
 },async batch(statements){for(const s of statements)if(/^CREATE TABLE IF NOT EXISTS (businesses|policy_versions) [(]/.test(s.sql))await s.run();}};
 try{
  await sourceLoader()('db/azure-schema.ts').ensureAzureSchema(DB);
  sqlite.prepare("INSERT INTO businesses (id,name,short_name,code,created_at,updated_at) VALUES ('business','test','test','test',1,1)").run();
  const knowledge={sources:[{id:'doc',parts:[{id:'0',text:'기관 신청만 가능.',pages:[]}]}],conflicts:[],withheldParts:0};
  const rules=[{id:'apply',title:'신청',scope:'신청 경로',category:'content',kind:'fact',configJson:'{"text":"기관 신청만 가능.","referral":false}',evidence:[{sourceId:'doc',partId:'0',quote:'기관 신청만 가능.'}]}];
  const load=sourceLoader({'./knowledge':{ensureKnowledgeSchema:async()=>DB}});
  const store=load('db/policy-store.ts'),hash=await load('app/policy-rules.ts').policyKnowledgeHash(knowledge);
  await store.savePolicyDraft('business',0,rules,knowledge,'admin');
  await assert.rejects(store.savePolicyDraft('business',0,rules,knowledge,'second'),/policy_version_conflict/);
  assert.deepEqual(await store.loadActivePolicyRules('business',knowledge),[]);
  await assert.rejects(store.setPolicyApproval('business',1,'old-hash','admin',true),/policy_version_conflict/);
  await store.setPolicyApproval('business',1,hash,'admin',true);
  assert.deepEqual(await store.loadActivePolicyRules('business',knowledge),rules);
  const saves=await Promise.allSettled([store.savePolicyDraft('business',1,rules,knowledge,'admin'),store.savePolicyDraft('business',1,rules,knowledge,'second')]);
  assert.equal(saves.filter(s=>s.status==='fulfilled').length,1);
  assert.deepEqual(await store.loadActivePolicyRules('business',knowledge),[]);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM policy_versions').get().count,2);
  assert.equal(sqlite.prepare('SELECT rules_json FROM policy_versions WHERE revision=1').get().rules_json,JSON.stringify(rules));
  await assert.rejects(store.setPolicyApproval('business',1,hash,'admin',true),/policy_version_conflict/);
  await store.setPolicyApproval('business',2,hash,'admin',true);
  await store.setPolicyApproval('business',2,hash,'admin',false);
  assert.deepEqual(await store.loadActivePolicyRules('business',knowledge),[]);
 }finally{sqlite.close();}
});
