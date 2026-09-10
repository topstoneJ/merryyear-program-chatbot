import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
const code=ts.transpileModule(await readFile(new URL('../app/api/admin-accounts/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function attempt({password='current-secret',id='target',denied=false}={}){
 const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE admin_accounts(id TEXT PRIMARY KEY,is_super_admin INTEGER); INSERT INTO admin_accounts VALUES('current',0),('target',0),('root',1);");
 const verified=[];const current={id:'current'};
 const DB={prepare(sql){const stmt=db.prepare(sql);return {bind:(...args)=>({first:async()=>stmt.get(...args),run:async()=>({meta:stmt.run(...args)})})}}};
 const deps={'@/app/admin-session':{requireAdminApi:async()=>denied?new Response(null,{status:403}):null,getAdminSession:async()=>current,ensureBootstrapAdmin:async()=>DB,verifyPassword:async(value,account)=>{verified.push(account.id);return value==='current-secret'&&account===current;}},'@/db/knowledge':{}};
 const out={};new Function('require','exports',code)(name=>deps[name],out);
 const response=await out.DELETE(new Request('https://test/api/admin-accounts?id='+id,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword:password})}));
 const remaining=db.prepare('SELECT id FROM admin_accounts ORDER BY id').all().map(x=>x.id);db.close();return {status:response.status,remaining,verified};
}
test('account deletion requires the current login password and never accepts the target password',async()=>{
 for(const password of ['',null,'target-secret','wrong']) {const result=await attempt({password});assert.equal(result.status,400);assert.equal(result.remaining.length,3);}
 const result=await attempt();assert.equal(result.status,200);assert.deepEqual(result.remaining,['current','root']);assert.deepEqual(result.verified,['current']);
});
test('permission, self-deletion, super-admin and nonexistent-account protections remain enforced',async()=>{
 for(const options of [{denied:true},{id:'current'},{id:'root'},{id:'missing'}]) {const result=await attempt(options);assert.notEqual(result.status,200);assert.equal(result.remaining.length,3);}
});
