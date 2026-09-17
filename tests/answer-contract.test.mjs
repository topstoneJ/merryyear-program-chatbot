import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader, chatHarness } from './load-source.mjs';

const load = sourceLoader();
const { parseGeminiAnswer } = load('app/answer-response.ts');
const { DEFAULT_ANSWER_SETTINGS } = load('app/answer-settings.ts');
const { normalizeAiPayload, prepareAiRequest } = load('db/ai-provider.ts');
const settings = { ...DEFAULT_ANSWER_SETTINGS, tone: 'friendly' };
const knowledge = { sources: [{ id: 'doc', businessId: 'test', title: '신청 공고', type: 'pdf', parts: [
  { id: '0', title: '신청 자격', text: '만 19세 이상만 신청할 수 있습니다. 나이 외의 자격 제한은 없습니다.', pages: [2] },
  { id: '1', title: '문의처', text: '담당자 문의: 02-1234-5678\n이메일: staff@example.org', pages: [3] },
] }], conflicts: [], withheldParts: 0 };
const draft = (overrides = {}) => ({ categoryId: 'content', questionTarget: 'general', decision: 'fact', evidenceKind: 'document', resolution: 'complete',
  eligibilityEvidence: [], text: '만 19세 이상이 신청 대상이에요.', source: 'doc', page: 2, review: false, contactPhone: '', contactEvidence: '', ...overrides });
const parse = (value, question = '신청 자격을 알려주세요.', context = {}) => parseGeminiAnswer(JSON.stringify(value), knowledge, settings, ['content'], question, context);
const personal = (overrides = {}) => draft({ questionTarget: 'eligibility', decision: 'possible', text: '현재 확인된 연령 기준에 해당해요. 최종 선정은 별도 심사를 거쳐요.',
  eligibilityEvidence: [{ sourceId: 'doc', quote: '만 19세 이상만 신청할 수 있습니다.', userStatement: '저는 만 20세예요', result: 'met' }], ...overrides });
const modelResponse = value => Response.json({ steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(value) }] }] });

test('all three providers deliver the same system rules and the same semantic validation', () => {
  const valid = draft(), invalid = personal();
  for (const [provider, key] of [['google','AIza-test'],['openai','sk-proj-test'],['anthropic','sk-ant-api03-test']]) {
    const request = prepareAiRequest(key, { body: JSON.stringify({ system_instruction: 'shared system rules', input: 'same evidence', response_format: { schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } } }) });
    const body = JSON.parse(request.init.body);
    assert.equal(body.system_instruction || body.instructions || body.system, 'shared system rules');
    for (const value of [valid, invalid]) {
      const text = JSON.stringify(value);
      const raw = provider === 'google' ? { status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text }] }] }
        : provider === 'openai' ? { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }] }
        : { stop_reason: 'end_turn', content: [{ type: 'text', text }] };
      const normalized = normalizeAiPayload(raw, provider).steps[0].content[0].text;
      const run = () => parseGeminiAnswer(normalized, knowledge, settings, ['content'], '신청 자격을 알려주세요.', { faq: true });
      if (value === valid) assert.equal(run().decision, 'fact');
      else assert.throws(run, /faq_requires_general_information/, provider);
    }
  }
});

test('general FAQ cannot contain applicant verdicts, ask personal questions or be out of scope', () => {
  for (const decision of ['possible','impossible','need_info','out_of_scope']) assert.throws(() => parse(draft({ decision })), /faq_requires_general_information/);
  assert.throws(() => parse(draft({ text: '가능해요.\n\n만 19세 이상이 대상이에요.' })), /verdict_in_information_answer/);
  assert.throws(() => parse(draft({ decision: 'possible' }), '사용자 정의 FAQ', { faq: true }), /faq_requires_general_information/);
  assert.equal(parse(draft()).decision, 'fact');
});

test('decision/resolution cross-product accepts only the documented pairs', () => {
  for (const [resolution, accepted] of Object.entries({ complete:['fact'], partial:['fact'], needs_user:['need_info'], missing_policy:['consult'], conflict:['consult'], action_required:['consult'] })) {
    for (const decision of ['fact','need_info','consult']) {
      const run = () => parse(draft({ questionTarget:'specific', decision, resolution }), '이 경우에는 어떻게 하나요?');
      if (accepted.includes(decision)) {
        const answer = run();
        assert.equal(answer.review, ['partial','missing_policy','conflict','action_required'].includes(resolution));
      } else assert.throws(run, /decision_resolution_mismatch/);
    }
  }
  assert.throws(() => parse(personal({ resolution:'missing_policy' }), '저는 만 20세예요. 신청할 수 있나요?'), /decision_resolution_mismatch/);
});

test('eligibility requires quotes from the right document and statements from the user', () => {
  const question = '저는 만 20세예요. 신청할 수 있나요?';
  assert.equal(parse(personal(), question).decision, 'possible');
  for (const evidence of [[], [{sourceId:'wrong',quote:'만 19세 이상만 신청할 수 있습니다.',userStatement:'저는 만 20세예요',result:'met'}],
    [{sourceId:'doc',quote:'소득 제한 없음',userStatement:'저는 만 20세예요',result:'met'}],
    [{sourceId:'doc',quote:'만 19세 이상만 신청할 수 있습니다.',userStatement:'소득이 없습니다',result:'met'}]])
    assert.throws(() => parse(personal({ eligibilityEvidence:evidence }), question));
  assert.throws(() => parse(personal(), '신청할 수 있나요?', { history:[{question:'문의해요',answer:'저는 만 20세예요'}] }), /user_statement_not_provided/);
  assert.equal(parse(personal(), '네', {history:[{question,answer:'연령 기준을 확인할게요.'}]}).decision, 'possible');
  assert.throws(() => parse(personal({eligibilityEvidence:[{...personal().eligibilityEvidence[0],result:'unmet'}]}),question), /possible_has_unmet/);
  assert.throws(() => parse(personal({decision:'impossible'}), question), /impossible_without_exclusion/);
  const excluded = personal({decision:'impossible',text:'연령 기준을 충족하지 못해요.',eligibilityEvidence:[{...personal().eligibilityEvidence[0],userStatement:'저는 만 17세예요',result:'unmet'}]});
  assert.equal(parse(excluded, '저는 만 17세예요. 신청할 수 있나요?').decision, 'impossible');
});

test('system/none cannot claim a business source; system explanation stays available without documents', () => {
  for (const evidenceKind of ['system','none']) assert.throws(() => parse(draft({ evidenceKind })), /evidence_source_mismatch/);
  assert.throws(() => parse(draft({questionTarget:'specific',source:'',page:0,evidenceKind:'system'}),'지원금은?'), /system_evidence_scope/);
  const value = draft({questionTarget:'system',source:'',page:0,evidenceKind:'system',text:'챗봇은 실제 접수를 대신할 수 없어요.'});
  assert.equal(parse(value, '챗봇이 접수해 주나요?').review, false);
});

test('eligibility verdicts cannot ignore a review flag or known conflicting evidence', () => {
  const question='저는 만 20세예요. 신청할 수 있나요?';
  assert.throws(()=>parse(personal({review:true}),question),/eligibility_requires_personal_evidence/);
  const conflicts=[{reason:'다른 연령 제한',left:{sourceId:'doc',partId:'0',quote:'만 19세 이상만 신청할 수 있습니다.'},right:{sourceId:'other',partId:'0',quote:'만 25세 이상'}}];
  assert.throws(()=>parseGeminiAnswer(JSON.stringify(personal()),{...knowledge,conflicts},settings,['content'],question),/eligibility_evidence_conflicts/);
});

test('a contradicting opening is retried instead of silently rewording the verdict', () => {
  assert.throws(()=>parse(draft({text:'담당자 문의가 필요해요. 신청할 수 있어요.'})),/contradictory_verdict/);
  assert.throws(()=>parse(personal({text:'불가능해요. 신청할 수 있어요.'}),'저는 만 20세예요. 신청할 수 있나요?'),/contradictory_verdict/);
});

test('verified contact never clears partial or unresolved-policy review', () => {
  for (const resolution of ['partial','missing_policy','conflict','action_required']) {
    const value = draft({decision:resolution==='partial'?'fact':'consult',resolution,review:false,text:'확인된 신청 기준을 설명하고 나머지는 담당자에게 확인해 주세요.'});
    assert.equal(parse(value, '담당자 연락처와 미확인 기준을 알려주세요.').review, true);
  }
  assert.equal(parse(draft({review:true}), '담당자 연락처를 알려주세요.').review, true);
});

test('model citations cannot inject invented source names or pages', () => {
  const answer = parse(draft({ text:'만 19세 이상이 대상이에요.\n\n출처: 위조 문서 999쪽 https://fake.invalid',page:999 }));
  assert.doesNotMatch(answer.text,/위조|999|fake/);
  assert.ok(answer.text.endsWith('출처: 신청 공고'));
  assert.equal(answer.review,true);
});

test('invalid FAQ is corrected once with specific feedback; only corrected output is stored', async () => {
  const h = chatHarness({knowledge,responses:[modelResponse(personal()),modelResponse(draft())]});
  const result = await h.ask({question:'신청 자격을 알려주세요.'});
  assert.equal(result.status,200); assert.equal(result.payload.answer.decision,'fact');
  assert.equal(h.requests.length,2); assert.match(h.requests[1].system_instruction,/faq_requires_general_information/);
  assert.equal(JSON.parse(h.requests[0].input).serverMode,'faq');
  assert.equal(h.records.length,1); assert.doesNotMatch(h.records[0].answer,/가능해요/);
});

test('two failed validations never publish or save the invalid answer', async () => {
  const h = chatHarness({knowledge,draft:personal()});
  const result = await h.ask({question:'신청 자격을 알려주세요.'});
  assert.equal(result.status,502); assert.equal(result.payload.answer,undefined);
  assert.equal(h.requests.length,2); assert.equal(h.records.length,0); assert.equal(h.answerCache.size,0);
});

test('fast answer generation retries review output and returns only a ready FAQ', async () => {
  const review = draft({ resolution:'partial', review:true });
  const h = chatHarness({knowledge,responses:[modelResponse(review),modelResponse(draft())]});
  const answer = await h.generate('신청 자격을 알려주세요.', { faq:true, forceRefresh:true, requireReady:true });
  assert.equal(answer.review,false); assert.equal(answer.decision,'fact'); assert.equal(answer.source,'신청 공고');
  assert.equal(h.requests.length,2); assert.match(h.requests[1].system_instruction,/faq_requires_ready_answer/);
  assert.match(h.requests[1].system_instruction,/신청 주소·이메일·전화번호가 출처 원문에 있으면 담당자 문의가 아니라 확인된 신청 정보/);
});

test('fast answer generation never returns a review result as a successful regeneration', async () => {
  const h = chatHarness({knowledge,draft:draft({ resolution:'partial', review:true })});
  await assert.rejects(() => h.generate('신청 자격을 알려주세요.', { faq:true, forceRefresh:true, requireReady:true }), /faq_requires_ready_answer/);
  assert.equal(h.requests.length,2);
});

test('valid normal answers need one model call; history prevents a FAQ shortcut', async () => {
  const h = chatHarness({readyFastAnswer:{text:'cached',decision:'fact'}});
  const result=await h.ask({question:'신청 자격을 알려주세요.',history:[{question:'저는 20세예요',answer:'다른 조건을 확인해요.'}]});
  assert.equal(result.status,200); assert.equal(h.requests.length,1);
  assert.equal(JSON.parse(h.requests[0].input).conversation.previousConversation.length,1);
  assert.equal(JSON.parse(h.requests[0].input).serverMode,'conversation');
});
