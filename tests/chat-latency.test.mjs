import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './load-source.mjs';

test('default seeding is shared across concurrent reads; actual category rows stay fresh', async () => {
  const {loadCategories} = sourceLoader()('db/consultation-categories.ts');
  let writes=0, reads=0, batches=0, name='original';
  const DB={prepare(sql){return {bind(){return this;},async run(){writes++;},async all(){reads++;return {results:[{id:'one',name,replacement_id:null}]};}};},async batch(statements){batches++;for(const s of statements)await s.run();}};
  const results=await Promise.all(Array.from({length:20},()=>loadCategories(DB)));
  assert.equal(batches,1);assert.equal(writes,8);assert.equal(reads,20);
  assert.ok(results.every(r=>r[0].name==='original'));
  name='renamed';assert.equal((await loadCategories(DB))[0].name,'renamed');
  assert.equal(writes,8);
});

test('failed category initialization is retried, not cached as success', async () => {
  const {loadCategories}=sourceLoader()('db/consultation-categories.ts');let tries=0;
  const DB={prepare(){return {bind(){return this;},async all(){return {results:[]};}};},async batch(){if(++tries===1)throw new Error('temporary failure');}};
  await assert.rejects(loadCategories(DB));await loadCategories(DB);await loadCategories(DB);assert.equal(tries,2);
});

test('timing records failures without question, model output or exception text',async t=>{
  const logs=[];t.mock.method(console,'info',(...args)=>logs.push(args));
  const timing=sourceLoader()('app/chat-timing.ts').createChatTiming();
  await assert.rejects(timing.measure('model',async()=>{throw new Error('secret-question');}));
  timing.finish(502);timing.finish(502);
  assert.equal(logs.length,1);assert.equal(logs[0][1].status,502);
  assert.ok(logs[0][1].stagesMs.model>=0);assert.doesNotMatch(JSON.stringify(logs),/secret-question/);
});

test('request-scoped API settings avoid another query and preserve key deletion opt-out',async t=>{
  const saved=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='environment-fallback';
  t.after(()=>{if(saved===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=saved;});
  const knowledge=sourceLoader({'./runtime':{runtimeEnv:()=>{throw new Error('unexpected database read');}}})('db/knowledge.ts');
  assert.equal(await knowledge.getConfiguredGeminiApiKey({gemini_api_key_encrypted:'!disabled'}),undefined);
  assert.equal(await knowledge.getConfiguredGeminiApiKey({gemini_api_key_encrypted:null}),'environment-fallback');
  assert.equal(await knowledge.getConfiguredGeminiApiKey(null),'environment-fallback');
});
