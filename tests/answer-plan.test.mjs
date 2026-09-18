import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoader,chatHarness} from './load-source.mjs';
const {OUTCOMES,compileAnswerPlan,answerPlanSchema}=sourceLoader()('app/answer-plan.ts');
const wire=extra=>({categoryId:'content',outcome:'information',text:'확인된 설명',source:'doc',page:0,eligibilityEvidence:[],...extra});
test('single-outcome prompt excludes the competing legacy classification workflow',()=>{
 const load=sourceLoader(),{buildCoreSystemInstruction}=load('app/answer-rules.ts'),{ANSWER_PLAN_INSTRUCTION}=load('app/answer-plan.ts');
 const prompt=buildCoreSystemInstruction([{id:'content',name:'내용'}],'표현 설정','분류',ANSWER_PLAN_INSTRUCTION);
 assert.match(prompt,/outcome 하나/);assert.doesNotMatch(prompt,/5\. 답변 대상과 확인 상태|8\. 출처·문의처·출력 계약|10\. 출력 전 확인/);
 assert.match(prompt,/지시의 우선순위와 근거 종류/);assert.match(prompt,/근거 자료 선택/);assert.match(prompt,/개인정보/);
});
test('single outcome compiles to coherent internal states for every branch',()=>{
 const expected={information:['fact','complete'],partial_information:['fact','partial'],need_user_info:['need_info','needs_user'],policy_unconfirmed:['consult','missing_policy'],policy_conflict:['consult','conflict'],staff_action:['consult','action_required'],all_personal_criteria_confirmed_met:['possible','complete'],personal_disqualifier_confirmed_without_exception:['impossible','complete'],system_information:['fact','complete'],unrelated:['out_of_scope','complete']};
 for(const outcome of OUTCOMES){const result=compileAnswerPlan(JSON.stringify(wire({outcome})));assert.deepEqual([result.decision,result.resolution],expected[outcome]);}
});
test('model cannot override server-owned outcome state or supply unknown output fields',()=>{
 for(const extra of [{outcome:'invented'},{decision:'possible'},{resolution:'complete'},{review:false},{contactPhone:'02-9999-9999'}]) assert.throws(()=>compileAnswerPlan(JSON.stringify(wire(extra))));
 const schema=answerPlanSchema(['content'],{sources:[],conflicts:[],withheldParts:0});
 assert.deepEqual(schema.required,['text','source','page','categoryId','eligibilityEvidence','outcome']);
 assert.equal(schema.properties.outcome.enum.includes('eligible'),false);
 assert.equal(schema.properties.outcome.enum.includes('ineligible'),false);
});
test('non-verdict surplus eligibility metadata cannot create an eligibility verdict',()=>{
 const evidence=[{sourceId:'doc',quote:'arbitrary',userStatement:'arbitrary',result:'met'}];
 const fact=compileAnswerPlan(JSON.stringify(wire({eligibilityEvidence:evidence})));
 assert.equal(fact.decision,'fact');assert.deepEqual(fact.eligibilityEvidence,[]);
 assert.throws(()=>compileAnswerPlan(JSON.stringify(wire({outcome:'all_personal_criteria_confirmed_met',eligibilityEvidence:evidence}))),/invalid_eligibility_reference/);
});

test('personal evidence selects IDs and the server preserves exact source and user wording',()=>{
 const knowledge={sources:[{id:'doc',parts:[{id:'0',text:'### 기준\n**6개월 이내** 발생한 위기',pages:[1]}]}],conflicts:[],withheldParts:0};
 const evidence=[{policyEvidenceId:'e1',userMessageId:'u0',result:'unmet'}];
 const raw=JSON.stringify(wire({outcome:'personal_disqualifier_confirmed_without_exception',eligibilityEvidence:evidence}));
 const result=compileAnswerPlan(raw,knowledge,['위기는 1년 전에 생겼어요.']);
 assert.deepEqual(result.eligibilityEvidence,[{sourceId:'doc',quote:'**6개월 이내** 발생한 위기',userStatement:'위기는 1년 전에 생겼어요.',result:'unmet'}]);
 for(const change of [{policyEvidenceId:'fake'},{userMessageId:'u9'},{userMessageId:'u00'},{quote:'invented'},{result:'unknown'}]){
  assert.throws(()=>compileAnswerPlan(JSON.stringify(wire({outcome:'personal_disqualifier_confirmed_without_exception',eligibilityEvidence:[{...evidence[0],...change}]})),knowledge,['위기는 1년 전에 생겼어요.']),/invalid_eligibility_reference/);
 }
});
test('unconfirmed policy is always reviewed consultation, not a contradictory complete verdict',async()=>{
 const h=chatHarness({raw:JSON.stringify(wire({outcome:'policy_unconfirmed',text:'자료에 별도 확인으로 안내되어 있어요.'}))});
 const r=await h.ask({question:'이 예외는 어떻게 하나요?'});
 assert.equal(r.status,200);assert.equal(r.payload.answer.decision,'consult');assert.equal(r.payload.answer.review,true);assert.equal(h.reviewRequests.length,1);
});
