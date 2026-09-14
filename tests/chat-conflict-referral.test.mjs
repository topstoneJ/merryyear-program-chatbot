import test from 'node:test';import assert from 'node:assert/strict';import {chatHarness} from './load-source.mjs';
const fixed='신청 방법은 온라인이에요. 제출 기한은 자료가 상충하여 담당자 확인이 필요해요.';
test('conflicting evidence uses the consult result while preserving supported facts',async()=>{
 const h=chatHarness({draft:{decision:'consult',resolution:'conflict',text:fixed,contactPhone:'02-1234-5678',contactEvidence:'사업 담당자 문의: 02-1234-5678'}});const r=await h.ask();
 assert.equal(r.payload.answer.text,'담당자 문의가 필요해요.\n\n'+fixed+'\n\n사업 담당자 문의\n이메일: 등록 자료에서 확인되지 않음\n전화번호: 02-1234-5678');assert.equal(h.records[0].decision,'consult');assert.equal(r.payload.answer.review,true);assert.equal(h.requests.length,1);
});
test('unverified, representative and absent contacts are omitted',async()=>{
 for(const [contactPhone,contactEvidence] of [['02-9999-9999','기관 대표번호: 02-9999-9999'],['02-1111-1111','사업 담당자 문의: 02-1111-1111'],['','']]){
 const h=chatHarness({draft:{decision:'consult',resolution:'conflict',text:fixed,contactPhone,contactEvidence}});const answer=(await h.ask()).payload.answer.text;assert.match(answer,/자료가 상충하여 담당자 확인이 필요/);assert.match(answer,/이메일: 등록 자료에서 확인되지 않음\n전화번호: 02-1234-5678/);assert.doesNotMatch(answer,/02-9999-9999|02-1111-1111/);}
});
test('out-of-scope response remains exact regardless of enabled style options',async()=>{
 const h=chatHarness({settings:{alwaysContact:true,showSources:true},draft:{decision:'out_of_scope',source:'',page:0}}),r=await h.ask();assert.equal(r.payload.answer.text,'답변할 수 없는 질문입니다.');assert.equal(r.payload.answer.source,'');assert.equal(r.payload.answer.page,0);
});
test('ordinary fact answers are not converted to conflict and need-info is not automatically review-needed',async()=>{
 const h=chatHarness();assert.equal((await h.ask()).payload.answer.text,'온라인으로 신청해요.');
 const q=chatHarness({draft:{decision:'need_info',source:'',text:'어떤 지원 내용이 궁금한가요?'}});assert.equal((await q.ask()).payload.answer.review,false);
});
test('admin guide requires an admin session and never enters business consultation history',async()=>{
 const denied=chatHarness({draft:{source:'admin-guide'}});const deniedResult=await denied.ask({businessId:'__admin-guide',question:'처음에는 어떻게 하나요?'});assert.equal(deniedResult.status,404);assert.equal(denied.requests.length,0);
 const h=chatHarness({admin:{is_super_admin:0},adminGuideContext:{account:{accessibleBusinessCount:1},businesses:[{name:'허용 사업'}]},raw:JSON.stringify({text:'사업을 비공개로 등록하고 자료를 먼저 점검해요.'})});const r=await h.ask({businessId:'__admin-guide',question:'처음에는 어떻게 하나요?'});
 assert.equal(r.status,200);assert.match(r.payload.answer.text,/비공개로 등록/);assert.equal(r.payload.answer.decision,'fact');assert.equal(r.payload.answer.review,false);assert.equal(h.records.length,0);assert.deepEqual(Object.keys(h.requests[0].response_format.schema.properties),['text']);
 assert.deepEqual(JSON.parse(h.requests[0].input).operatingState.businesses,[{name:'허용 사업'}]);
 const referral=chatHarness({admin:{is_super_admin:0},raw:JSON.stringify({text:'전화번호는 02-1234-5678입니다.'})});const blocked=await referral.ask({businessId:'__admin-guide',question:'없는 내용은 어떻게 하나요?'});
 assert.equal(blocked.payload.answer.text,'운영 가이드와 조회 가능한 현재 상태에서 확인할 수 없는 내용입니다.');assert.doesNotMatch(blocked.payload.answer.text,/02-/);
});
test('resident numbers are masked in the model payload, response and stored consultation',async()=>{
 const h=chatHarness({draft:{text:'900101-1234567은 다시 입력하지 마세요.'}}),r=await h.ask({question:'성명 홍길동 900101-1234567 신청 가능해요?'});
 for(const value of [h.requests,h.records,r.payload])assert.doesNotMatch(JSON.stringify(value),/900101-1234567/);assert.match(h.records[0].question,/홍길동/);
});
test('passport, driver licence and foreign registration numbers are masked before model use and storage',async()=>{
 const values=['여권번호 M12345678','운전면허번호 11-22-123456-78','외국인등록번호 900101-5123456'];
 for(const question of values){
  const h=chatHarness(),r=await h.ask({question});
  for(const value of [h.requests,h.records,r.payload]){
   const serialized=JSON.stringify(value);
   assert.doesNotMatch(serialized,/M12345678|11-22-123456-78|900101-5123456/);
  }
  assert.match(h.records[0].question,/^[^\dA-Z]*[1-9A-Z]\*/i);
 }
});
