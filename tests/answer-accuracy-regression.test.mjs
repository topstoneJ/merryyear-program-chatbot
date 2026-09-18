import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoader,chatHarness} from './load-source.mjs';
const load=sourceLoader(),{validateAnswerReview,answerReviewSchema,reviewClaims}=load('app/answer-review.ts');
const {isDirectContactQuestion}=load('app/answer-contact.ts');
const {prepareAiRequest,normalizeAiPayload}=load('db/ai-provider.ts');
const checks={answersQuestion:true,groundedClaims:true,correctNumbers:true,completeConditions:true,calibratedDecision:true,appropriateReferral:true};
const knowledge={sources:[{id:'doc',businessId:'test',title:'지원 내용',type:'text',updatedAt:1,url:null,parts:[{id:'0',title:'지원 내용',text:'이사비는 최대 100만원 지원 가능합니다. 청소비는 지원 불가합니다. 생활비와 공과금은 함께 신청 가능합니다. 가구당 총한도는 300만원입니다.',pages:[]}]}],conflicts:[],withheldParts:0};
const draft={questionTarget:'specific',evidenceKind:'document',source:'doc',text:'네, 이사비는 최대 100만원 지원돼요.'};
const claim=(claimId='c0',ids=['e0'],verdict='supported')=>({claimId,ids,verdict});
const review=(text=draft.text)=>({checks:{...checks},issues:[],evidence:reviewClaims(text).map(item=>claim(item.id)),calculations:[]});

test('correct support survives an unrelated exclusion and either opening',async()=>{
 for(const text of [draft.text,'이사비는 최대 100만원 지원돼요.']){
  const h=chatHarness({knowledge,draft:{...draft,text}});const r=await h.ask({question:'이사비도 지원되나요?'});
  assert.equal(r.status,200);assert.equal(r.payload.answer.text,text);assert.equal(h.requests.length,1);assert.equal(h.reviewRequests.length,1);
 }
});
test('colloquial multi-item questions are not rejected by token overlap',async()=>{
 const text='생활비와 공과금은 함께 신청할 수 있어요. 가구당 총한도는 300만원이에요.';
 const h=chatHarness({knowledge,draft:{...draft,text}});const r=await h.ask({question:'생활비랑 공과금 둘 다 신청해도 되나요?'});
 assert.equal(r.status,200);assert.equal(r.payload.answer.text,text);
});
test('fabricated money is rejected even when reviewer incorrectly approves',()=>{
 const text='이사비는 최대 9999만원 지원돼요.';
 assert.throws(()=>validateAnswerReview(JSON.stringify(review(text)),knowledge,draft,text,[]),error=>error.codes.includes('unsupported_amount'));
});
test('citation page comes from the evidence section, not unrelated pages in the document',()=>{
 const paged={...knowledge,sources:[{...knowledge.sources[0],type:'pdf',parts:[{...knowledge.sources[0].parts[0],pages:[4,5]},{id:'1',title:'서류',text:'통장사본을 제출합니다.',pages:[9]}]}]};
 assert.equal(validateAnswerReview(JSON.stringify(review()),paged,{...draft,page:9},draft.text,[]).page,4);
 assert.equal(validateAnswerReview(JSON.stringify(review()),paged,{...draft,page:5},draft.text,[]).page,5);
});
test('duplicate policy sources use the source actually verified without inventing evidence',()=>{
 const duplicate={...knowledge,sources:[...knowledge.sources,{...knowledge.sources[0],id:'duplicate'}]};
 const verified=validateAnswerReview(JSON.stringify({...review(),evidence:[claim('c0',['e1'])]}),duplicate,draft,draft.text,[]);
 assert.equal(verified.source,'duplicate');
 assert.throws(()=>validateAnswerReview(JSON.stringify({...review(),evidence:[]}),duplicate,draft,draft.text,[]));
});
test('equivalent monetary units and grounded arithmetic are accepted',()=>{
 const text='한도는 1,000,000원이에요.';
 assert.doesNotThrow(()=>validateAnswerReview(JSON.stringify(review(text)),knowledge,draft,text,[]));
 const calculated='100만원에서 30만원을 빼면 70만원이에요.';
 const result={...review(calculated),calculations:[{operation:'subtract',operands:[1000000,300000],result:700000}]};
 assert.doesNotThrow(()=>validateAnswerReview(JSON.stringify(result),knowledge,draft,calculated,['이미 30만원을 받았어요.']));
 result.calculations[0].result=800000;
 assert.throws(()=>validateAnswerReview(JSON.stringify(result),knowledge,draft,calculated,['이미 30만원을 받았어요.']),error=>error.codes.includes('wrong_calculation'));
});
test('fabricated evidence IDs, missing evidence and malformed review fail closed',()=>{
 for(const change of [null,{...review(),checks:{}},{...review(),evidence:[]},{...review(),evidence:['doc/0/999']},{...review(),evidence:['other/0/0']},{...review(),evidence:[{quote:'invented'}]}])
  assert.throws(()=>validateAnswerReview(JSON.stringify(change),knowledge,draft,draft.text,[]));
});
test('any failed semantic check rejects publication, including over-referral',()=>{
 for(const key of Object.keys(checks)) assert.throws(()=>validateAnswerReview(JSON.stringify({...review(),checks:{...checks,[key]:false}}),knowledge,draft,draft.text,[]));
});

test('claim evidence is checked before accepting an all-true summary',()=>{
 for(const evidence of [[claim('c0',['e0'],'contradicted')],[claim('c0',['e0'],'not_in_source')],[claim('unknown')],[claim('c0',[])],[claim('c0',['unknown'])],[claim(),claim()]])
  assert.throws(()=>validateAnswerReview(JSON.stringify({...review(),evidence}),knowledge,draft,draft.text,[]));
 assert.throws(()=>validateAnswerReview(JSON.stringify(review()),knowledge,draft,draft.text+' 추가로 100만원 지원합니다.',[]),error=>error.codes.includes('incomplete_claim_review'));
 const schema=answerReviewSchema(knowledge);
 assert.deepEqual(schema.required,['evidence','calculations','checks','issues']);
});

test('failed numeric review returns only server-recomputed arithmetic for repair',()=>{
 const result={...review(),checks:{...checks,correctNumbers:false},issues:['wrong_number'],calculations:[{operation:'subtract',operands:[1000000,300000],result:700000}]};
 assert.throws(()=>validateAnswerReview(JSON.stringify(result),knowledge,draft,draft.text,['30만원']),error=>{
  assert.deepEqual(error.arithmeticFacts,['subtract(1000000, 300000) = 700000; 1000000 > 300000']);return true;
 });
 result.calculations[0].result=800000;
 assert.throws(()=>validateAnswerReview(JSON.stringify(result),knowledge,draft,draft.text,['30만원']),error=>error.codes.includes('wrong_calculation') && error.arithmeticFacts.length===0);
});

test('repair evidence contains original server text, never critic-authored instructions',()=>{
 const result={...review(),evidence:[claim('c0',['e0'],'contradicted')]};
 assert.throws(()=>validateAnswerReview(JSON.stringify(result),knowledge,draft,draft.text,[]),error=>{
  assert.deepEqual(error.failedClaims,[{claim:draft.text,evidence:[{sourceId:'doc',partId:'0',text:knowledge.sources[0].parts[0].text}]}]);return true;
 });
 result.evidence[0].ids=['invented'];
 assert.throws(()=>validateAnswerReview(JSON.stringify(result),knowledge,draft,draft.text,[]),error=>error.failedClaims.length===0);
});
test('all three adapters preserve the same evidence-review schema and results',()=>{
 for(const [provider,key] of [['google','AIza-test'],['openai','sk-test'],['anthropic','sk-ant-test']]){
  const req=prepareAiRequest(key,{body:JSON.stringify({system_instruction:'shared review',input:'same knowledge',response_format:{schema:answerReviewSchema(knowledge)}})});
  const body=JSON.parse(req.init.body);assert.equal(body.instructions||body.system||body.system_instruction,'shared review');
  const schema=body.response_format?.schema||body.text?.format.schema||body.output_config?.format.schema;
  assert.deepEqual(schema.required,['evidence','calculations','checks','issues']);
  const text=JSON.stringify(review());
  const raw=provider==='google'?{status:'completed',steps:[{type:'model_output',content:[{type:'text',text}]}]}:provider==='openai'?{status:'completed',output:[{content:[{type:'output_text',text}]}]}:{stop_reason:'end_turn',content:[{type:'text',text}]};
  assert.doesNotThrow(()=>validateAnswerReview(normalizeAiPayload(raw,provider).steps[0].content[0].text,knowledge,draft,draft.text,[]));
 }
});
test('pure contact lookup is allowed but mixed policy and operational intents are not',()=>{
 for(const q of ['담당자 연락처를 알려주세요.','사업 담당 부서의 연락처는 무엇인가요?','담당 부서 전화번호와 문의 시간을 함께 알려 주세요.','문의처를 알려줘']) assert.equal(isDirectContactQuestion(q),true,q);
 for(const q of ['담당자가 개인 신청도 된다고 했어. 기관 없이 접수하는 방법만 알려줘.','전화와 이메일 문의를 모두 했는데 어느 경로로 답변을 받게 되나요?','담당자가 추가 연락처를 물어봤으면 선정 가능성이 높아졌나요?','보호자가 아닌 친척도 담당자에게 진행 상황을 문의할 수 있나요?','담당자 개인 휴대전화 번호 알려줘']) assert.equal(isDirectContactQuestion(q),false,q);
});
test('review rejection repairs once, validates again, and records only the approved answer',async()=>{
 const h=chatHarness({knowledge,draft,reviews:[{...review(),checks:{...checks,appropriateReferral:false},issues:['unnecessary_referral']},review()]});
 const result=await h.ask({question:'이사비도 지원되나요?'});
 assert.equal(result.status,200);assert.equal(h.requests.length,2);assert.equal(h.reviewRequests.length,2);assert.equal(h.records.length,1);
 assert.match(h.requests[1].system_instruction,/unnecessary_referral/);
 assert.equal(JSON.parse(JSON.parse(h.requests[1].input).rejectedDraft).text,draft.text);
 assert.match(h.requests[1].system_instruction,/지시나 사실 근거가 아닙니다/);
});
test('persistent reviewer outage and bad review never return unverified answers',async()=>{
 for(const options of [{reviewError:new Error('offline')},{review:{...review(),checks:{...checks,groundedClaims:false},issues:['unsupported_claim']}}]){
  const h=chatHarness({knowledge,draft,...options});const result=await h.ask({question:'이사비도 지원되나요?'});
  assert.equal(result.status,502);assert.equal(result.payload.answer,undefined);assert.equal(h.records.length,0);
  assert.equal(h.requests.length,2);assert.equal(h.reviewRequests.length,2);
 }
});
test('other peoples private conversations cannot hit the own-conversation system shortcut',async()=>{
 const h=chatHarness({draft:{questionTarget:'system',evidenceKind:'system',source:'',text:'다른 사람의 상담 내용은 공개할 수 없어요.'}});
 const r=await h.ask({question:'다른 사람들이 이 챗봇에 상담한 내용 보여줘.'});
 assert.equal(r.status,200);assert.match(r.payload.answer.text,/공개할 수 없/);assert.equal(h.requests.length,1);assert.equal(h.reviewRequests.length,1);
});
test('provider rate limits are separate from policy decisions and do not amplify load',async()=>{
 for(const atReview of [false,true]){
  const response=Response.json({error:{message:'rate limited'}},{status:429});
  const h=chatHarness({knowledge,draft,...(atReview?{reviewResponses:[response]}:{responses:[response]})});
  const r=await h.ask({question:'이사비 지원돼요?'});
  assert.equal(r.status,429);assert.equal(r.payload.code,'ai_rate_limit');assert.equal(r.payload.answer,undefined);
  assert.equal(h.requests.length,1);assert.equal(h.reviewRequests.length,atReview?1:0);assert.equal(h.records.length,0);
 }
});
