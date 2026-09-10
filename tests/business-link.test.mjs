import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {sourceLoader} from './load-source.mjs';

function setup() {
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(`CREATE TABLE businesses(id TEXT PRIMARY KEY,is_public INTEGER,notice_url TEXT DEFAULT '',updated_at INTEGER);
 INSERT INTO businesses VALUES ('a',1,'',0);
 CREATE TABLE business_homepage_sources(business_id TEXT PRIMARY KEY,source_id TEXT NOT NULL);
 CREATE TABLE knowledge_sources(id TEXT PRIMARY KEY,business_id TEXT,type TEXT,source_url TEXT,enabled INTEGER,status TEXT);
 INSERT INTO knowledge_sources VALUES ('notice','a','website','https://example.org/notice',1,'ready'),('new','a','website','https://example.org/latest',1,'ready'),('other','b','website','https://example.org/other',1,'ready'),('pdf','a','pdf',NULL,1,'ready');`);
 const DB={prepare(sql){return {bind(...args){return {first:async()=>sqlite.prepare(sql).get(...args),run:async()=>sqlite.prepare(sql).run(...args)}}}}};
 let denied=false,hidden=false,superAdmin=false;
 const api=sourceLoader({'@/db/knowledge':{ensureKnowledgeSchema:async()=>DB,getBusiness:async id=>({...sqlite.prepare('SELECT * FROM businesses WHERE id = ?').get(id),is_public:!hidden})},'@/app/admin-session':{getAdminSession:async()=>({is_super_admin:superAdmin}),requireAdminApi:async({businessId})=>denied || businessId!=='a' ? Response.json({}, {status:403}) : null}})('app/api/business-link/route.ts');
 return {sqlite,api,setDenied:v=>denied=v,setHidden:v=>hidden=v,setSuper:v=>superAdmin=v,
 select:(id,showOnMain=true)=>api.PATCH(new Request('https://test',{method:'PATCH',body:JSON.stringify({id,showOnMain})})),
 read:()=>api.GET(new Request('https://test?businessId=a'))};
}
test('homepage never falls back to newest and selection persists independently of other records',async()=>{
 const h=setup();try {
 assert.equal((await (await h.read()).json()).url,'');
 assert.equal((await h.select('notice')).status,200);assert.equal((await (await h.read()).json()).url,'https://example.org/notice');
 await h.select('new');assert.equal(h.sqlite.prepare('SELECT COUNT(*) AS n FROM business_homepage_sources').get().n,1);
 await h.select('notice',false);assert.equal((await (await h.read()).json()).url,'https://example.org/latest');
 await h.select('new',false);assert.equal((await (await h.read()).json()).url,'');
 }finally{h.sqlite.close();}
});
test('business permissions, public visibility and valid websites are enforced',async()=>{
 const h=setup();try {
 assert.equal((await h.select('other')).status,403);assert.equal((await h.select('pdf')).status,400);
 h.setDenied(true);assert.equal((await h.select('notice')).status,403);h.setDenied(false);
 await h.select('notice');h.setHidden(true);assert.equal((await h.read()).status,404);h.setSuper(true);assert.equal((await h.read()).status,200);
 h.sqlite.exec("UPDATE knowledge_sources SET enabled=0 WHERE id='notice'");assert.equal((await (await h.read()).json()).url,'https://example.org/notice');
 assert.equal((await h.select('notice')).status,400);
 h.sqlite.exec("DELETE FROM knowledge_sources WHERE id='notice'");assert.equal((await (await h.read()).json()).url,'https://example.org/notice');
 }finally{h.sqlite.close();}
});
