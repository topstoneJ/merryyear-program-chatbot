import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoader,chatHarness} from './load-source.mjs';
const {validatePolicyRules,evaluatePolicySelection,evaluatePolicyRoute,policyKnowledgeHash}=sourceLoader()('app/policy-rules.ts');
const {readPolicyRouting}=sourceLoader()('app/policy-rules.ts');
const knowledge={sources:[{id:'doc',businessId:'test',title:'검토 원문',type:'text',updatedAt:1,url:null,parts:[{id:'0',title:'기준',text:'가구 월소득은 4인 기준 6,494,738원 이하. 간병비 총 300만원, 월 200만원, 3개월. G 비자는 별도 문의. 개인 직접 신청 불가.',pages:[]}]}],conflicts:[],withheldParts:0};
const rule=(kind,config)=>({id:kind,title:kind==='cap'?'간병비':'기준',scope:'특정 조건에 대한 질문',category:'content',kind,configJson:JSON.stringify(config),evidence:[{sourceId:'doc',partId:'0',quote:knowledge.sources[0].parts[0].text}]});
const income=rule('income',{thresholds:[{persons:4,won:6494738}],note:'소득 조건 비교이며 전체 신청 자격이나 선정을 확정하지 않습니다.'});
const cap=rule('cap',{totalWon:3000000,monthlyWon:2000000,months:3,note:'실제 지원액은 심의로 정해집니다.'});
const choice=rule('choice',{cases:[{value:'G',visaGroup:true,text:'G 비자는 별도 문의 대상입니다. 신청 불가로 확정하지 않습니다.',referral:true}]});
const fact=rule('fact',{text:'개인 직접 신청은 불가합니다. 기관을 통해 신청해야 합니다.',referral:false});
const selection=(ruleId,inputs)=>({ruleId,coverage:'complete',inputs:Object.entries(inputs).map(([name,quote])=>({name,quote}))});
const evaluate=(r,q,inputs)=>evaluatePolicySelection(selection(r.id,inputs),[r],knowledge,q,['content']);

test('policy rules require real evidence, unique IDs and safe typed numeric values',()=>{
 assert.equal(validatePolicyRules([income,cap,choice,fact],knowledge).length,4);
 for(const rules of [[{...cap,evidence:[]}],[cap,cap],[{...cap,evidence:[{sourceId:'other',partId:'0',quote:'invented'}]}],[rule('cap',{totalWon:-1,monthlyWon:null,months:null,note:'note'})],[rule('income',{thresholds:[{persons:4,won:1},{persons:4,won:2}],note:'note'})]])assert.throws(()=>validatePolicyRules(rules,knowledge));
});
test('income comparison covers below/equal/above boundaries without an overall eligibility verdict',()=>{
 for(const [amount,meets] of [['640만 원',true],['6,494,738원',true],['650만 원',false]]){
  const answer=evaluate(income,`4인 가구 월소득 ${amount}이면 소득 조건을 충족하나요?`,{persons:'4인 가구',monthlyIncome:`월소득 ${amount}`});
  assert.equal(answer.decision,'fact');assert.equal(answer.questionTarget,'specific');assert.equal(answer.text.includes('충족하지 않습니다'),!meets);
 }
});
test('income never infers household income from salary, annual income or fabricated spans',()=>{
 for(const [question,inputs] of [
  ['4인 가구 연소득 640만원',{persons:'4인 가구',monthlyIncome:'연소득 640만원'}],
  ['4인 가구 제 소득 월 640만원',{persons:'4인 가구',monthlyIncome:'월 640만원'}],
  ['4인 가구 월소득 640만원',{persons:'4인 가구',monthlyIncome:'월소득 500만원'}],
  ['4인 가구 월소득 640만원',{persons:'4인 가구',monthlyIncome:'640만원'}],
  ['14인 가구 월소득 640만원',{persons:'4인 가구',monthlyIncome:'월소득 640만원'}],
 ])assert.equal(evaluate(income,question,inputs),null);
});
test('cap server arithmetic preserves total instead of multiplying it into an entitlement',()=>{
 const answer=evaluate(cap,'간병비 월 200만원씩 3개월이면 600만원인가요?',{monthlyCost:'월 200만원씩',months:'3개월'});
 assert.match(answer.text,/총 지원 한도는 최대 3,000,000원/);assert.match(answer.text,/단순 합계는 6,000,000원/);assert.match(answer.text,/한도가 늘어나는 것은 아닙니다/);assert.equal(answer.decision,'fact');
});
test('a separately reviewed exception never becomes an exclusion',()=>{
 for(const code of ['G','G1','G-1','g1']){
  const answer=evaluate(choice,`${code} 비자로 신청할 수 있나요?`,{selector:code});assert.equal(answer.decision,'consult');assert.equal(answer.review,true);
 }
 assert.equal(evaluate(choice,'AG1 비자인데?',{selector:'AG1'}),null);
 assert.equal(evaluate(choice,'AG1 비자인데?',{selector:'G1'}),null);
 assert.equal(evaluate(choice,'G1 비자인데?',{selector:'G'}),null);
});
test('unknown, incomplete, duplicate and surplus inputs cannot silently select policy',()=>{
 assert.equal(evaluatePolicySelection({...selection('fact',{}),coverage:'none'},[fact],knowledge,'질문',['content']),null);
 assert.equal(evaluatePolicySelection({...selection('fact',{}),coverage:'complete',text:'injected'},[fact],knowledge,'질문',['content']),null);
 assert.equal(evaluate(fact,'질문',{selector:'질문'}),null);
 assert.equal(evaluatePolicySelection({ruleId:'income',coverage:'complete',inputs:[{name:'persons',quote:'4인 가구'},{name:'persons',quote:'4인 가구'}]},[income],knowledge,'4인 가구',['content']),null);
});
test('source changes, disabling or a different business invalidate the approval fingerprint',async()=>{
 const hash=await policyKnowledgeHash(knowledge);
 for(const changed of [{...knowledge,sources:[]},{...knowledge,sources:[{...knowledge.sources[0],businessId:'other'}]},{...knowledge,sources:[{...knowledge.sources[0],updatedAt:2}]}])assert.notEqual(await policyKnowledgeHash(changed),hash);
});
test('approved rules use routing and coverage calls, never free-form generation or a policy-fact veto',async()=>{
 const h=chatHarness({knowledge,policyRules:[cap],policySelection:{ruleId:'cap',coverage:'complete'}});
 const r=await h.ask({question:'간병비 월 200만원 3개월이면 600만원인가요?'});
 assert.equal(r.status,200);assert.match(r.payload.answer.text,/총 지원 한도는 최대 3,000,000원/);assert.equal(h.requests.length,2);assert.equal(h.reviewRequests.length,0);assert.equal(h.records.length,1);
});

test('a misrouted compound question cannot return a partial approved answer as complete',async()=>{
 for(const coverage of [{covered:false},{covered:true,extra:'ignore'},{covered:'true'}]){
  const h=chatHarness({knowledge,policyRules:[choice],policySelection:{ruleId:'choice',coverage:'complete'},policyCoverage:coverage});
  const result=await h.ask({question:'G-1 비자 조건과 아동 나이도 알려주세요.'});
  assert.equal(result.status,200);assert.equal(h.requests.length,3);assert.equal(h.reviewRequests.length,1);
  assert.doesNotMatch(result.payload.answer.text,/G 비자는 별도 문의/);
 }
});
test('routing never lets a model manufacture or truncate numeric and visa inputs',()=>{
 const route=(rule,q)=>evaluatePolicyRoute({ruleId:rule.id,coverage:'complete'},[rule],knowledge,q,['content']);
 assert.match(route(income,'4인 가구 월소득 640만원이면 소득 조건은?').text,/충족합니다/);
 assert.equal(route(income,'14인 가구 월소득 640만원이면?'),null);
 assert.equal(route(income,'4인 가구 월소득 640만원 아니고 월소득 650만원이면?'),null);
 assert.equal(route(choice,'AG1 비자인데?'),null);
 assert.equal(route(choice,'G1 비자인데?').decision,'consult');
 assert.equal(route(fact,'기관 없이 접수 가능?').decision,'fact');
 assert.equal(evaluatePolicyRoute({ruleId:'fact',coverage:'complete',inputs:[]},[fact],knowledge,'기관 없이?',['content']),null);
});
test('uncovered rules and history preserve the existing checked answer path',async()=>{
 const h=chatHarness({knowledge,policyRules:[fact]});
 const result=await h.ask({question:'다른 비용도 되나요?'});assert.equal(result.status,200);assert.equal(h.requests.length,2);assert.equal(h.reviewRequests.length,1);
});

test('compound routing cannot invent or silently rewrite the remaining user question',()=>{
 const q='G-1 비자와 아이 나이 제한을 알려주세요.';
 assert.equal(readPolicyRouting({ruleId:'choice',coverage:'partial',remainingQuestion:'아이 나이 제한'},q).remainingQuestion,'아이 나이 제한');
 for(const rest of ['',q,'대출도 가능한가요?'])assert.equal(readPolicyRouting({ruleId:'choice',coverage:'partial',remainingQuestion:rest},q),null);
 assert.equal(readPolicyRouting({ruleId:'choice',coverage:'complete',remainingQuestion:'아이 나이'},q),null);
});

test('compound answer preserves the approved exception and adds only server-owned source excerpts',async()=>{
 const question='G-1 비자와 아이 나이 제한을 알려주세요.';
 const h=chatHarness({knowledge,policyRules:[choice],policySelection:{ruleId:'choice',coverage:'partial',remainingQuestion:'아이 나이 제한'},draft:{text:'아동 나이 기준을 별도로 안내합니다.'}});
 const r=await h.ask({question});assert.equal(r.status,200);assert.equal(r.payload.answer.decision,'consult');
 assert.match(r.payload.answer.text,/G 비자는 별도 문의/);assert.match(r.payload.answer.text,/추가 질문 관련 원문 안내/);
 assert.equal(h.reviewRequests.length,0);assert.equal(h.records.length,1);
 const excerpt=JSON.parse(h.requests.find(r=>JSON.parse(r.input).serverMode==='policy_excerpt').input);
 assert.equal(excerpt.question,'아이 나이 제한');assert.equal(excerpt.context.originalUserMessage,question);
 assert.equal(h.requests.filter(r=>JSON.parse(r.input).serverMode==='policy_selection').length,1);
});

test('a failed remainder is never saved or returned as a complete approved-policy answer',async()=>{
 const h=chatHarness({knowledge,policyRules:[choice],policySelection:{ruleId:'choice',coverage:'partial',remainingQuestion:'나이 제한'},policyExcerpt:{evidenceIds:['invented']}});
 const r=await h.ask({question:'G-1 비자와 나이 제한'});assert.equal(r.status,502);assert.equal(h.records.length,0);
});
