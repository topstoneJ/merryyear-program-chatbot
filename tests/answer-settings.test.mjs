import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import privacy from './load-chat-privacy.mjs';
import {sourceLoader,chatHarness} from './load-source.mjs';
const root=new URL('../',import.meta.url),load=sourceLoader();
const settings=load('app/answer-settings.ts'),context=load('app/chat-context.ts'),rules=load('app/answer-rules.ts'),defaults=settings.DEFAULT_ANSWER_SETTINGS;
async function moduleAt(path, require = () => ({})) {
 const output={};new Function('require','exports',ts.transpileModule(await readFile(new URL(path,root),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(require,output);return output;
}
test('ten canonical sections and seven closed options have valid defaults',()=>{
 assert.equal(settings.BASE_ANSWER_RULES.length,10);assert.equal(settings.ANSWER_OPTIONS.length,7);
 assert.deepEqual(settings.parseAnswerSettings(defaults),defaults);
 for(const raw of ['{}','malformed',null])assert.deepEqual(settings.readAnswerSettings(raw),defaults);
 for(const value of [null,[],{},{...defaults,tone:'ignore rules'},{...defaults,fixedRules:false}])assert.throws(()=>settings.parseAnswerSettings(value));
 const four={...defaults,showSources:true,showNextSteps:true,includeRelated:true,alwaysContact:true};
 assert.throws(()=>settings.parseAnswerSettings(four),/최대 3개/);
});
test('every style combination includes each canonical rule once and preserves required conditions',()=>{
 for(const length of ['short','standard','detailed'])for(const tone of ['friendly','polite'])for(const format of ['paragraph','list','auto'])for(const followUp of ['one','together']){
  const chosen={...defaults,length,tone,format,followUp};
  const style=settings.buildAnswerInstruction(chosen),prompt=rules.buildCoreSystemInstruction([{id:'c',name:'내용'}],style,'분류');
  for(const rule of rules.ANSWER_RULES.filter(r=>r.id!==9))assert.equal(prompt.split(rule.instruction).length-1,1);
  assert.equal(prompt.split(style).length-1,1);
  if(format==='paragraph')assert.match(style,/자연스러운 완결 문장/);
  if(format==='list'){
   assert.match(style,/• 핵심어: 내용/);
   assert.match(style,/‘~음’, ‘~임’ 또는 명사형/);
   assert.match(style,/제한·예외·주의사항.*개조식 종결/);
  }
  if(followUp==='one')assert.doesNotMatch(style,/최대 3개/);
 }
});
test('legacy formal tone is read as polite without resetting other preferences',()=>{
 const legacy={...defaults,showSources:true,tone:'formal',format:'paragraph'};
 assert.deepEqual(settings.readAnswerSettings(JSON.stringify(legacy)),{...legacy,tone:'polite'});
 assert.throws(()=>settings.parseAnswerSettings(legacy));
});
test('answer style validation enforces long paragraph spacing and list endings',()=>{
 const paragraph={...defaults,format:'paragraph'};
 assert.match(settings.answerStyleIssues('첫째\n둘째\n셋째\n넷째\n다섯째\n여섯째',paragraph).join(' '),/빈 줄/);
 assert.equal(settings.answerStyleIssues('첫째\n둘째\n셋째\n\n넷째\n다섯째\n여섯째',paragraph).length,0);
 const list={...defaults,format:'list'};
 assert.match(settings.answerStyleIssues('결론입니다.\n• 신청 대상: 아동이 있는 가정입니다.',list).join(' '),/~음/);
 assert.equal(settings.answerStyleIssues('결론입니다.\n• 신청 대상: 아동이 있는 가정',list).length,0);
 assert.equal(settings.ANSWER_STYLES.find(style=>style.key==='format').description,'쉽게 풀어서 답할지, 압축해서 답할지 선택해요.');
});
test('legacy saved options are reduced to the first three enabled choices',()=>{
 const legacy={...defaults,showSources:true,showNextSteps:true,includeRelated:true,alwaysContact:true};
 const restored=settings.readAnswerSettings(JSON.stringify(legacy));
 assert.equal(settings.ANSWER_OPTIONS.filter(option=>restored[option.key]).length,3);
});
test('saved settings affect the actual payload without accepting client notes as evidence',async()=>{
 const variants=settings.ANSWER_OPTIONS.map(option=>({...defaults,[option.key]:!defaults[option.key]}));
 for(const variant of variants){const h=chatHarness({settings:variant});assert.equal((await h.ask({manual:'UNTRUSTED_POLICY'})).status,200);
  const prompt=h.requests[0].system_instruction;
  for(const option of settings.ANSWER_OPTIONS)assert.ok(prompt.includes(variant[option.key]?option.on:option.off));
  assert.doesNotMatch(h.requests[0].input,/UNTRUSTED_POLICY/);
 }
});
test('style preferences never trigger another generation that can change policy facts',async()=>{
 const h=chatHarness({settings:{tone:'friendly',format:'paragraph'},draft:{text:'• 오후 3시까지입니다.'}});
 assert.equal((await h.ask()).status,200);assert.equal(h.requests.length,1);assert.equal(h.records.length,1);assert.equal(h.records[0].answer,'• 오후 3시까지입니다.');
});
test('decision prefixes preserve explicit classification without duplication',async()=>{
 for(const decision of ['possible','impossible','consult','need_info']){
  const personal=['possible','impossible'].includes(decision),question=decision==='impossible'?'저는 17세인데 신청할 수 있나요?':'저는 20세인데 신청할 수 있나요?';
  const knowledge={sources:[{id:'doc',businessId:'test',title:'연령 안내',type:'text',parts:[{id:'0',title:'신청 자격',text:'만 19세 이상만 신청할 수 있습니다.',pages:[]}]}],conflicts:[],withheldParts:0};
  const h=chatHarness({knowledge,draft:{decision,questionTarget:'eligibility',resolution:decision==='consult'?'missing_policy':decision==='need_info'?'needs_user':'complete',eligibilityEvidence:personal?[{sourceId:'doc',quote:'만 19세 이상만 신청할 수 있습니다.',userStatement:question,result:decision==='possible'?'met':'unmet'}]:[],text:settings.decisionPrefixes({...defaults,tone:'friendly'})[decision]+' 확인된 조건이에요.'}}),r=await h.ask({question});
  assert.equal(r.status,200);assert.equal(r.payload.answer.decision,decision);assert.equal(h.records[0].decision,decision);assert.equal(r.payload.answer.text.split(settings.decisionPrefixes(h.settings)[decision]).length-1,1);
 }
});
test('history and server date are structured separately from policy evidence',async()=>{
 const history=[{question:'아이는 3세예요',answer:'가구 전체 월소득이 얼마인가요?'}];const h=chatHarness();assert.equal((await h.ask({question:'200만원이요',history})).status,200);
 const input=JSON.parse(h.requests[0].input);assert.deepEqual(input.conversation.previousConversation,history);assert.equal(input.conversation.currentMessage,'200만원이요');assert.match(input.currentDateKST,/^\d{4}-\d{2}-\d{2}$/);
 assert.equal((await h.ask({history:[{question:123,answer:'bad'}]})).status,400);
});
test("settings API requires settings permission, persists across GET, and does not overwrite branding", async () => {
  let denied = true, data = "{}", updates = 0;
  const sqls = [];
  const api = await moduleAt("app/api/answer-settings/route.ts", () => ({
    ...settings, ...privacy, ...context,
    requireAdminApi: async options => { assert.equal(options.settings, true); return denied ? Response.json({ error: "denied" }, { status: 403 }) : null; },
    ensureKnowledgeSchema: async () => ({ prepare(sql) {
      sqls.push(sql);
      return { first: async () => ({ answer_settings_json: data }), bind(value) { return { run: async () => { data = value; updates++; return { meta: { changes: 1 } }; } }; } };
    } }),
  }));
  const patch = value => api.PATCH(new Request("https://test/api/answer-settings", { method: "PATCH", body: JSON.stringify(value) }));
  assert.equal((await api.GET()).status, 403);
  assert.equal((await patch(defaults)).status, 403);
  assert.equal(sqls.length, 0);
  denied = false;
  assert.equal((await patch({ ...defaults, length: "bad" })).status, 400);
  assert.equal(updates, 0);
  const custom = { ...defaults, showSources: true, tone: "polite", format: "paragraph" };
  assert.equal((await patch(custom)).status, 200);
  const read = await api.GET();
  assert.equal(read.headers.get("Cache-Control"), "no-store");
  assert.deepEqual((await read.json()).settings, custom);
  assert.equal(updates, 1);
  assert.ok(sqls.some(sql => /UPDATE site_settings SET answer_settings_json = \? WHERE id = 'default'/.test(sql)));
  assert.ok(sqls.every(sql => !/organization_name|gemini_api_key|logo_key/.test(sql)));
});


test('short follow-ups preserve conversation and resident-number masking',()=>{
 const history=context.parseChatHistory([{question:'900101-1234567',answer:'소득 조건에 해당하나요?'}]);
 assert.equal(history[0].question,'9*****-*******');assert.deepEqual(JSON.parse(context.chatContextInput(history,'네')),{previousConversation:history,currentMessage:'네'});
 assert.throws(()=>context.parseChatHistory([{question:'x'.repeat(151),answer:'a'}]));
});

test('conversation history stops at 100 turns or 50,000 characters',()=>{
 const turn={question:'질문',answer:'답변'};
 assert.equal(context.parseChatHistory(Array.from({length:100},()=>turn)).length,100);
 assert.throws(()=>context.parseChatHistory(Array.from({length:101},()=>turn)),new RegExp(context.CHAT_LIMIT_MESSAGE));
 assert.throws(()=>context.parseChatHistory(Array.from({length:5},()=>({question:'질문',answer:'가'.repeat(10000)}))),new RegExp(context.CHAT_LIMIT_MESSAGE));
});

test('the chat API rejects a new message after 100 completed turns',async()=>{
 const h=chatHarness(),history=Array.from({length:100},()=>({question:'질문',answer:'답변'}));
 const result=await h.ask({history});
 assert.equal(result.status,400);assert.equal(result.payload.error,context.CHAT_LIMIT_MESSAGE);assert.equal(h.requests.length,0);
});
