import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoader} from './load-source.mjs';
const knowledge={sources:[{id:'doc',title:'사업',parts:[{id:'0',text:'신청 방법\n개인 신청 불가.\n기관 신청만 가능.',pages:[]}]}],conflicts:[],withheldParts:0};
const rule={id:'apply',title:'신청 경로',scope:'직접 신청 가능 여부',category:'content',kind:'fact',configJson:JSON.stringify({text:'기관 신청만 가능합니다.',referral:false}),evidenceIds:['e1','e2']};
function harness(rules){
 let sent;
 const load=sourceLoader({
  '@/db/knowledge':{getConfiguredGeminiApiKey:async()=>'test',ensureKnowledgeSchema:async()=>({})},
  '@/db/consultation-categories':{loadCategories:async()=>[{id:'content',name:'사업 내용'}]},
  '@/db/api-usage':{trackedGeminiJson:async(_purpose,init)=>{sent=JSON.parse(init.body);return{response:Response.json({}),payload:{steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify({rules})}]}]}};}},
 });
 return {generate:()=>load('db/policy-extraction.ts').proposePolicyRules(knowledge),request:()=>sent};
}
test('policy extraction uses source IDs and server-owned exact quotations with surrounding context',async()=>{
 const h=harness([rule]),result=await h.generate();
 assert.deepEqual(result[0].evidence,[{sourceId:'doc',partId:'0',quote:knowledge.sources[0].parts[0].text}]);
 assert.equal('evidenceIds' in result[0],false);
 assert.equal(JSON.parse(h.request().input).knowledge.sources[0].parts[0].evidence[1].id,'e1');
});
test('policy extraction rejects invented, missing evidence and extra fields rather than weakening validation',async()=>{
 for(const change of [{evidenceIds:['fake']},{evidenceIds:[]},{evidenceIds:null},{evidence:[{quote:'forged'}]},{category:'unknown'}]){
  await assert.rejects(harness([{...rule,...change}]).generate());
 }
});
