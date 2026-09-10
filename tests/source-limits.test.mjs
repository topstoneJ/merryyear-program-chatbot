import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
async function load(path,deps={}) {
  const code=ts.transpileModule(await readFile(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const output={};new Function('require','exports',code)(name=>deps[name],output);return output;
}
const limits=await load('app/knowledge/source-limits.ts'),sql=await load('db/source-limits.ts'),integrity=await load('app/knowledge/knowledge-integrity.ts');
async function setup() {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE knowledge_sources(id TEXT PRIMARY KEY,business_id TEXT,type TEXT,title TEXT,source_url TEXT,file_key TEXT,file_name TEXT,content TEXT,status TEXT,enabled INTEGER,created_at INTEGER,updated_at INTEGER);
    CREATE TABLE random_questions(id TEXT PRIMARY KEY,business_id TEXT,question TEXT,options_json TEXT,status TEXT,knowledge_source_id TEXT,selected_options_json TEXT,note TEXT,completed_at INTEGER);`);
  const DB={prepare(query){return {bind(...args){return {first:async column=>{const row=sqlite.prepare(query).get(...args);return column?row?.[column]:row;},all:async()=>({results:sqlite.prepare(query).all(...args)}),run:async()=>({meta:{changes:Number(sqlite.prepare(query).run(...args).changes)}})};}};},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements) results.push(await statement.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  let apiCalls=0;
  const deps={'@/db/knowledge':{ensureKnowledgeSchema:async()=>DB,getBusiness:async()=>({id:'one'}),knowledgeEnv:()=>({}),getConfiguredGeminiApiKey:async()=>{apiCalls++;return 'test';}},'@/app/admin-session':{requireAdminApi:async()=>null},'@/db/source-limits':sql,'@/app/knowledge/source-limits':limits,'@/app/knowledge/knowledge-integrity':integrity,'@/db/api-usage':{trackedGeminiFetch:async()=>{apiCalls++;throw new Error('unexpected AI call');}}};
  const route=await load('app/api/knowledge/route.ts',deps),random=await load('app/api/random-question/route.ts',deps);
  function seed(kind,count,business='one'){const insert=sqlite.prepare('INSERT INTO knowledge_sources(id,business_id,type,title,content,status,enabled,created_at,updated_at) VALUES(?,?,?,?,?,\'ready\',1,0,0)');for(let i=0;i<count;i++)insert.run(`${business}-${kind}-${i}`,business,kind,'자료','내용');}
  function request(kind,business='one'){const form=new FormData();form.set('businessId',business);form.set('type',kind);form.set('title','자료');form.set('content','추가 내용');return new Request('https://test/api/knowledge',{method:'POST',body:form});}
  return {sqlite,DB,route,random,seed,request,apiCalls:()=>apiCalls};
}
test('PDF and website caps reject before extraction/API use and include inactive entries',async()=>{
  const s=await setup();try{for(const kind of ['pdf','website']){s.seed(kind,10);s.sqlite.exec(`UPDATE knowledge_sources SET enabled=0 WHERE type='${kind}'`);assert.equal((await s.route.POST(s.request(kind))).status,409);}assert.equal(s.apiCalls(),0);}finally{s.sqlite.close();}
});
test('text cap is business-specific and permits the last slot; deletion releases a slot',async()=>{
  const s=await setup();try{s.seed('text',999);assert.equal((await s.route.POST(s.request('text'))).status,200);assert.equal((await s.route.POST(s.request('text'))).status,409);assert.equal((await s.route.POST(s.request('text','two'))).status,200);s.sqlite.exec("DELETE FROM knowledge_sources WHERE id='one-text-0'");assert.equal((await s.route.POST(s.request('text'))).status,200);}finally{s.sqlite.close();}
});
test('simultaneous requests cannot both occupy the final slot',async()=>{
  const s=await setup();try{s.seed('text',999);const responses=await Promise.all([s.route.POST(s.request('text')),s.route.POST(s.request('text'))]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal(s.sqlite.prepare("SELECT COUNT(*) AS count FROM knowledge_sources WHERE business_id='one'").get().count,1000);}finally{s.sqlite.close();}
});
test('random text has an independent cap that counts both legacy and new records',async()=>{
  const s=await setup();try{s.seed('random',998);s.seed('text',1);s.sqlite.exec("INSERT INTO random_questions(id,business_id,status,knowledge_source_id) VALUES('legacy','one','completed','one-text-0');INSERT INTO random_questions(id,business_id,status,question,options_json) VALUES('active','one','active','질문','[\"선택\"]');");
  const request=()=>new Request('https://test/api/random-question',{method:'POST',body:JSON.stringify({businessId:'one',questionId:'active',selectedOptions:['선택']})});assert.equal((await s.random.POST(request())).status,200);
  s.sqlite.exec("INSERT INTO random_questions(id,business_id,status,question,options_json) VALUES('next','one','active','질문','[\"선택\"]')");const response=await s.random.POST(new Request('https://test/api/random-question',{method:'POST',body:JSON.stringify({businessId:'one',questionId:'next',selectedOptions:['선택']})}));assert.equal(response.status,409);assert.equal(s.sqlite.prepare("SELECT status FROM random_questions WHERE id='next'").get().status,'active');assert.equal((await s.route.POST(s.request('text'))).status,200);
  }finally{s.sqlite.close();}
});
