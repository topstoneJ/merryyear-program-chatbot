import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './load-source.mjs';

function fixture() {
  let apiKey='AIza-test';
  const answer={text:'만 19세 이상이 신청 대상이에요.',source:'신청 안내',page:0,confidence:95,review:false,decision:'fact',categoryId:'content'};
  const settings={answer_settings_json:'{}',gemini_api_key_encrypted:'encrypted',updated_at:1};
  let row;
  const DB={prepare(sql){return {bind(){return this;},async first(){
    if(sql.includes('FROM fast_answers'))return row;
    if(sql.includes('FROM site_settings'))return settings;
    return {id:'test',name:'사업',updated_at:1};
  },async all(){return {results:[]};}};}};
  const deps={'@/db/knowledge':{chatAnswerCacheKey:async input=>JSON.stringify(input),getConfiguredGeminiApiKey:async()=>apiKey},
    '@/db/consultation-categories':{loadCategories:async()=>[{id:'content',name:'지원 내용'}]}};
  const store=sourceLoader(deps)('app/fast-answer-store.ts');
  return {store,DB,answer,settings,setKey:value=>{apiKey=value;},setRow:value=>{row=value;},loadWithRules:instruction=>sourceLoader({...deps,'./answer-rules':{buildCoreSystemInstruction:()=>instruction}})('app/fast-answer-store.ts')};
}

test('FAQ fingerprint changes with provider, model, current prompt and settings without exposing key',async t=>{
  const f=fixture();const version=()=>f.store.fastAnswerContextVersion('test',f.DB);
  const google=await version();f.setKey('sk-proj-test');const openai=await version();f.setKey('sk-ant-api03-test');const anthropic=await version();
  assert.notEqual(google,openai);assert.notEqual(openai,anthropic);
  assert.doesNotMatch(anthropic,/sk-ant-api03-test|encrypted/);
  const original=process.env.ANTHROPIC_MODEL;t.after(()=>{if(original===undefined)delete process.env.ANTHROPIC_MODEL;else process.env.ANTHROPIC_MODEL=original;});
  process.env.ANTHROPIC_MODEL='claude-test-model';assert.notEqual(await version(),anthropic);
  assert.notEqual(await f.loadWithRules('new rule').fastAnswerContextVersion('test',f.DB),await version());
  const old=await version();f.settings.answer_settings_json=JSON.stringify({tone:'friendly'});assert.notEqual(await version(),old);
});

test('FAQ read rejects stale, review and invalid stored answers even if the row claims ready',async()=>{
  const f=fixture();const version=await f.store.fastAnswerContextVersion('test',f.DB);
  const row=value=>({status:'ready',context_version:version,answer_json:JSON.stringify({...f.answer,...value})});
  for(const value of [{decision:'possible'},{decision:'consult'},{review:true},{source:''},{page:-1},{categoryId:null},{confidence:null},{text:'가능해요. 신청 대상이에요.'}]) {
    f.setRow(row(value));assert.equal(await f.store.readReadyFastAnswer(f.DB,'test','eligibility'),null);
  }
  f.setRow({...row({}),context_version:'previous-contract'});assert.equal(await f.store.readReadyFastAnswer(f.DB,'test','eligibility'),null);
  f.setRow({...row({}),status:'review'});assert.equal(await f.store.readReadyFastAnswer(f.DB,'test','eligibility'),null);
  f.setRow(row({}));assert.deepEqual(await f.store.readReadyFastAnswer(f.DB,'test','eligibility'),f.answer);
});

test('Anthropic environment key works without overriding explicit API deletion',async t=>{
  const saved=Object.fromEntries(['OPENAI_API_KEY','GEMINI_API_KEY','ANTHROPIC_API_KEY'].map(key=>[key,process.env[key]]));
  t.after(()=>{for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
  delete process.env.OPENAI_API_KEY;delete process.env.GEMINI_API_KEY;process.env.ANTHROPIC_API_KEY='sk-ant-api03-environment-test';
  const knowledge=sourceLoader({'./runtime':{runtimeEnv:()=>{throw new Error('unexpected DB access');}}})('db/knowledge.ts');
  assert.equal(await knowledge.getConfiguredGeminiApiKey(null),'sk-ant-api03-environment-test');
  assert.equal(await knowledge.getConfiguredGeminiApiKey({gemini_api_key_encrypted:'!disabled'}),undefined);
  assert.equal(knowledge.configuredGeminiApiKeyStatus(null).environmentApiKeyConfigured,true);
});
