import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoader,chatHarness} from './load-source.mjs';
const load=sourceLoader(),{buildAnswerKnowledge}=load('app/answer-knowledge.ts');
const {parseGeminiAnswer}=load('app/answer-response.ts');
const row=(id,extra={})=>({id,business_id:'test',type:'text',title:id,content:'신청 안내',enabled:1,status:'ready',updated_at:1,...extra});

test('only active selected-business sources reach the model',()=>{
 const result=buildAnswerKnowledge([row('good'),row('other',{business_id:'private'}),row('hidden',{enabled:0}),row('error',{status:'error'})],'test');
 assert.deepEqual(result.sources.map(s=>s.id),['good']);
});
test('review-required body, page, heading and cached quotes are withheld together',()=>{
 const a=row('a',{type:'pdf',content:JSON.stringify({format:'structured-markdown',sections:[{title:'지원 품목',markdown:'냉장고',pages:[2],status:'reviewed'},{title:'비공개 추출',markdown:'검토 전 비밀',pages:[9],status:'review_required'}]})});
 const report={conflicts:[{reason:'의심',left:{sourceId:'a',partId:'1',quote:'검토 전 비밀'},right:{sourceId:'b',partId:'0',quote:'신청 안내'}}]};
 const result=buildAnswerKnowledge([a,row('b')],'test',report);
 assert.equal(result.withheldParts,1);assert.equal(result.conflicts.length,0);
 assert.doesNotMatch(JSON.stringify(result),/비밀|비공개 추출/);assert.deepEqual(result.sources[0].parts[0].pages,[2]);
});
test('section headings preserve allowance versus exclusion meaning',()=>{
 const result=buildAnswerKnowledge([row('a',{content:JSON.stringify({format:'structured-markdown',sections:[{title:'지원 품목',markdown:'냉장고'},{title:'지원 제외 품목',markdown:'에어컨'}]})})],'test');
 assert.deepEqual(result.sources[0].parts.map(p=>p.title),['지원 품목','지원 제외 품목']);
});
test('website and text evidence never acquire PDF pages',()=>{
 for(const type of ['website','text']) assert.deepEqual(buildAnswerKnowledge([row(type,{type,content:JSON.stringify({format:'structured-markdown',sections:[{markdown:'내용',pages:[1]}]})})],'test').sources[0].parts[0].pages,[]);
});
test('oversize knowledge fails without silently dropping conflicting documents',()=>{
 assert.throws(()=>buildAnswerKnowledge([row('large',{content:'x'.repeat(250001)})],'test'),/safe comparison limit/);
});
test('strict response contract rejects invented documents and malformed decision fields',()=>{
 const h=chatHarness();const draft={categoryId:'content',decision:'fact',evidenceKind:'document',resolution:'complete',text:'답변',source:'doc',page:0,review:false,contactPhone:'',contactEvidence:''};
 for(const change of [{source:'invented'},{page:-1},{page:'1'},{decision:'unknown'},{decision:undefined},{review:'false'},{categoryId:'invented'},{extra:true}]) assert.throws(()=>parseGeminiAnswer(JSON.stringify({...draft,...change}),h.knowledge,h.settings,['content']));
 const k=buildAnswerKnowledge([row('a',{type:'pdf',content:JSON.stringify({format:'structured-markdown',sections:[{markdown:'내용',pages:[2]}]})}),row('b',{type:'pdf',content:JSON.stringify({format:'structured-markdown',sections:[{markdown:'다른 내용',pages:[3]}]})})],'test');
 const mismatched=parseGeminiAnswer(JSON.stringify({...draft,source:'a',page:3}),k,h.settings,['content']);
 assert.equal(mismatched.page,0);assert.equal(mismatched.review,true);
 assert.equal(parseGeminiAnswer(JSON.stringify({...draft,source:'a',page:2}),k,h.settings,['content']).page,2);
});
test('operator question survives unverified page metadata without publishing the page',async()=>{
 const h=chatHarness({draft:{text:'이 사업은 열매나눔재단에서 운영해요.',page:1}});
 const r=await h.ask({question:'이 사업을 운영하는 기관은 어디인가요?'});
 assert.equal(r.status,200);assert.equal(r.payload.answer.text,'이 사업은 열매나눔재단에서 운영해요.');
 assert.equal(r.payload.answer.page,0);assert.equal(r.payload.answer.review,true);assert.equal(h.records.length,1);
 assert.deepEqual(h.requests[0].response_format.schema.properties.page.enum,[0]);
 assert.deepEqual(h.requests[0].response_format.schema.properties.source.enum,['','doc']);
});
test('unsourced policy facts are replaced with an honest evidence limit',async()=>{
 const h=chatHarness({draft:{source:'',text:'지원금은 999만원이에요.'}});const r=await h.ask();
 assert.equal(r.status,200);assert.doesNotMatch(r.payload.answer.text,/999/);assert.equal(r.payload.answer.review,true);assert.equal(r.payload.answer.page,0);
});
test('empty knowledge can still reach system capability rules without bundled numeric policies',async()=>{
 const h=chatHarness({knowledge:{sources:[],conflicts:[],withheldParts:0},draft:{source:'',evidenceKind:'none',resolution:'missing_policy',decision:'consult',text:'현재 자료에서 신청 기준을 확인하기 어려워요.'}});const r=await h.ask({businessId:'crisis',question:'아이 3명이고 보증금 500만원인데 가능해요?'});
 assert.equal(r.status,200);assert.equal(h.requests.length,1);assert.equal(r.payload.answer.source,'');assert.equal(r.payload.answer.review,true);assert.doesNotMatch(r.payload.answer.text,/5,359|가능해요|소득/);
});
test('knowledge and model outages return technical errors, not conflict decisions',async()=>{
 for(const options of [{knowledgeError:new Error('DB down')},{apiError:new Error('timeout')},{raw:'not-json'}]) {const h=chatHarness(options),r=await h.ask();assert.equal(r.status,502);assert.equal(h.records.length,0);assert.match(r.payload.error,/잠시 후/);}
});
test('a non-public business cannot be queried anonymously',async()=>{
 const h=chatHarness({public:0});assert.equal((await h.ask()).status,404);assert.equal(h.requests.length,0);
});
