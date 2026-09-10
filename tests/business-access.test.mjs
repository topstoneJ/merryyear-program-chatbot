import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
test('business settings action runs only after permission succeeds',async()=>{
 const source=await readFile(new URL('../app/knowledge/page.tsx',import.meta.url),'utf8');
 const start=source.indexOf('  async function withBusinessSettingsPermission('),end=source.indexOf('  async function saveBusiness(',start);
 const code=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 for(const [status,access,expected] of [[200,false,0],[200,true,1],[401,false,0],[500,false,0]]){
  let actions=0;const alerts=[];
  const gate=new Function('fetch','window',code+'; return withBusinessSettingsPermission;')(async()=>Response.json({canManageSettings:access},{status}),{alert:msg=>alerts.push(msg)});
  await gate(()=>{actions++;});assert.equal(actions,expected);assert.equal(alerts.length,expected?0:1);
 }
});
