import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sourceLoader, chatHarness } from './load-source.mjs';

const before = readFileSync(new URL('./fixtures/chat-before-latency.fixture', import.meta.url), 'utf8');

test('model requests, validated answers and saved consultations match deployed baseline', async t => {
  t.mock.method(Date, 'now', () => Date.UTC(2026,8,14,4));
  t.mock.method(console, 'info', () => {});
  const cases = [
    {name:'ordinary',options:{}},
    {name:'eligibility',options:{draft:{decision:'possible',text:'확인된 조건에서 신청 가능합니다.'}}},
    {name:'excluded',options:{draft:{decision:'impossible',text:'제외 조건에 해당합니다.'}}},
    {name:'conflict',options:{draft:{decision:'consult',resolution:'conflict',text:'적용 기준을 확인해야 합니다.'}}},
    {name:'missing policy',options:{draft:{source:'',resolution:'missing_policy',text:'기준이 없습니다.'}}},
    {name:'invalid source',options:{draft:{source:'invented'}}},
    {name:'invalid output',options:{raw:'not json'}},
    {name:'no API',options:{noApiKey:true}},
    {name:'private',options:{public:0}},
    {name:'format',options:{settings:{showSources:true,alwaysContact:true,length:'detailed'}}},
    {name:'correction',options:{},body:{question:'아니요, 300만원이에요.',history:[{question:'월소득 200만원',answer:'200만원이 맞나요?'}]}},
    {name:'long history',options:{},body:{question:'제 상황도 이어서 확인해 주세요',history:Array.from({length:80},()=>({question:'조건 확인',answer:'확인된 내용입니다.'.repeat(20)}))}},
    {name:'large knowledge',options:{knowledge:{sources:[{id:'doc',businessId:'test',title:'전체 원문',type:'text',updatedAt:1,url:null,parts:[{id:'0',title:'지원 및 제외',text:'조건과 예외를 모두 확인하세요.'.repeat(8000),pages:[]}]}],conflicts:[],withheldParts:1}}},
    {name:'admin',options:{admin:{id:'admin'},adminGuideContext:{businesses:[]}},body:{businessId:'__admin-guide'}},
  ];
  for (const scenario of cases) {
    const old = chatHarness({...scenario.options,routeSource:before});
    const current = chatHarness(scenario.options);
    const a = await old.ask(scenario.body), b = await current.ask(scenario.body);
    const normalize = requests => requests.map(request => ({...request, input: JSON.parse(request.input)}));
    assert.deepEqual(normalize(current.requests), normalize(old.requests), `${scenario.name}: full model payload`);
    assert.deepEqual(b.payload, a.payload, `${scenario.name}: validated answer`);
    assert.equal(b.status,a.status,`${scenario.name}: status`);
    assert.deepEqual(current.records,old.records,`${scenario.name}: saved consultation`);
    assert.equal(b.headers.get('Cache-Control'),'no-store');
    assert.match(b.headers.get('Server-Timing'),/^total;dur=\d+$/);
  }
});

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

test('only a current green FAQ bypasses generation; everything else keeps full context', async () => {
  const preparedAnswer = { text:'기관을 통해 신청해요.', source:'공개 안내문', page:0, confidence:95, review:false, decision:'fact', categoryId:'content' };
  const prepared = chatHarness({readyFastAnswer:preparedAnswer});
  const first = await prepared.ask({question:'신청방법은?'});
  const second = await prepared.ask({question:'신청방법을 알려줘'});
  assert.equal(first.headers.get('X-Chat-Cache'),'hit');
  assert.equal(second.headers.get('X-Chat-Cache'),'hit');
  assert.deepEqual(first.payload.answer,preparedAnswer);
  assert.deepEqual(second.payload.answer,preparedAnswer);
  assert.equal(prepared.requests.length,0);
  assert.equal(prepared.records.length,2);

  const notPrepared = chatHarness();
  await notPrepared.ask({question:'신청방법은?'});
  await notPrepared.ask({question:'신청방법은?'});
  assert.equal(notPrepared.requests.length,2);

  for (const question of [
    '신청 방법과 신청 기간을 알려주세요',
    '제가 30살인데 신청할 수 있나요?',
    '담당자에게 자주 전화하면 선정에 유리할까요?',
  ]) {
    const contextual = chatHarness({readyFastAnswer:preparedAnswer});
    const body={question,history:[{question:'이전 질문',answer:'이전 답변'}]};
    const response=await contextual.ask(body);
    assert.equal(response.headers.get('X-Chat-Cache'),'bypass',question);
    assert.equal(contextual.requests.length,1,question);
    assert.equal(JSON.parse(contextual.requests[0].input).conversation.previousConversation.length,1,question);
  }
});
