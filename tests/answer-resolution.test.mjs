import test from 'node:test';
import assert from 'node:assert/strict';
import {chatHarness} from './load-source.mjs';

test('system capability guidance survives without any business documents',async()=>{
 const h=chatHarness({knowledge:{sources:[],conflicts:[],withheldParts:0},draft:{source:'',evidenceKind:'system',text:'챗봇은 신청 접수를 대신할 수 없어요.'}});
 const r=await h.ask();assert.equal(r.status,200);assert.equal(r.payload.answer.text,'챗봇은 신청 접수를 대신할 수 없어요.');assert.equal(r.payload.answer.review,false);
});
test('informational partial answers preserve supported content without forced referral',async()=>{
 const h=chatHarness({settings:{alwaysContact:false},draft:{resolution:'partial',text:'신청은 온라인이에요. 대체서류 인정 여부는 확인이 필요해요.',contactPhone:'02-1234-5678',contactEvidence:'사업 담당자 문의: 02-1234-5678'}});
 const r=await h.ask();assert.match(r.payload.answer.text,/신청은 온라인/);assert.doesNotMatch(r.payload.answer.text,/02-1234-5678/);assert.equal(r.payload.answer.review,true);
});
test('missing policy can use a separate contact document without claiming it proves policy',async()=>{
 const h=chatHarness({draft:{source:'',evidenceKind:'none',resolution:'missing_policy',decision:'consult',text:'대체서류 인정 기준은 확인이 어려워요.',contactPhone:'02-1234-5678',contactEvidence:'사업 담당자 문의: 02-1234-5678'}});
 const r=await h.ask();assert.equal(r.status,200);assert.equal(r.payload.answer.source,'');assert.match(r.payload.answer.text,/대체서류/);assert.match(r.payload.answer.text,/02-1234-5678/);
});
test('unverified phone in prose cannot bypass contact verification',async()=>{
 const h=chatHarness({draft:{resolution:'partial',text:'담당자에게 02-1111-1111로 문의하세요.',contactPhone:'02-1111-1111',contactEvidence:'위조된 담당자 번호 02-1111-1111'}});
 const r=await h.ask();assert.doesNotMatch(r.payload.answer.text,/02-1111-1111/);assert.match(r.payload.answer.text,/02-1234-5678/);
});
test('unsupported policy still cannot pass as an unsourced fact',async()=>{
 const h=chatHarness({draft:{source:'',evidenceKind:'none',text:'지원금 999만원이 확정됐어요.'}});
 const r=await h.ask();assert.doesNotMatch(r.payload.answer.text,/999|확정/);assert.match(r.payload.answer.text,/담당자/);
});

test('staff referrals recover a missing model contact from registered text',async()=>{
 const h=chatHarness({draft:{decision:'consult',resolution:'missing_policy',evidenceKind:'none',source:'',text:'대체 서류 인정 기준은 담당자 확인이 필요해요.'}});
 const r=await h.ask();assert.match(r.payload.answer.text,/02-1234-5678/);assert.equal(JSON.parse(h.requests[0].input).verifiedBusinessContact.phone,'02-1234-5678');
});

test('direct contact questions always include the verified email and phone and become cache-ready',async()=>{
 const knowledge={sources:[{id:'business-details-test',businessId:'test',title:'사업 필수 정보',type:'text',updatedAt:1,url:null,parts:[{id:'0',title:'사업 필수 정보',text:'담당 부서: 임팩트사업1팀\n이메일: impact@merryyear.org\n연락처: 02-2665-0046',pages:[]}]}],conflicts:[],withheldParts:0};
 const h=chatHarness({knowledge,draft:{decision:'consult',resolution:'action_required',evidenceKind:'document',source:'business-details-test',review:true,text:'안내된 담당 부서로 문의해 주세요.',contactPhone:'',contactEvidence:''}});
 const first=await h.ask({question:'담당자 연락처를 알려주세요.'});
 assert.match(first.payload.answer.text,/impact@merryyear\.org/);
 assert.match(first.payload.answer.text,/02-2665-0046/);
 assert.equal(first.payload.answer.decision,'fact');
 assert.equal(first.payload.answer.review,false);
 assert.equal(first.headers.get('X-Chat-Cache'),'miss');
 const second=await h.ask({question:'문의처를 알려줘'});
 assert.equal(second.headers.get('X-Chat-Cache'),'hit');
 assert.equal(h.requests.length,1);
});

test('staff contact recognition allows a line break between the department and phone',async()=>{
 const knowledge={sources:[{id:'contact',businessId:'test',title:'문의처',type:'text',updatedAt:1,url:null,parts:[{id:'0',title:'문의처',text:'예시기관 사업운영팀 담당자\n사업 담당자 전화번호: 02-1234-5678',pages:[]}]}],conflicts:[],withheldParts:0};
 const h=chatHarness({knowledge,draft:{decision:'consult',resolution:'missing_policy',evidenceKind:'none',source:'',text:'담당자 확인이 필요해요.',contactPhone:'',contactEvidence:''}});
 const r=await h.ask();assert.match(r.payload.answer.text,/02-1234-5678/);assert.equal(JSON.parse(h.requests[0].input).verifiedBusinessContact.phone,'02-1234-5678');
});

test('business inquiry section wins over unrelated phone numbers in other sources',async()=>{
 const knowledge={sources:[
  {id:'site',businessId:'test',title:'기관 홈페이지',type:'website',updatedAt:2,url:null,parts:[{id:'0',title:'기관 소개',text:'후원 문의: 02-9999-9999',pages:[]}]},
  {id:'guide',businessId:'test',title:'2026 공고문',type:'pdf',updatedAt:1,url:null,parts:[{id:'7',title:'문의처',text:'예시기관 사업운영팀\n사업 담당자 전화번호: 02-1234-5678',pages:[7]}]},
 ],conflicts:[],withheldParts:0};
 const h=chatHarness({knowledge,draft:{decision:'consult',resolution:'missing_policy',evidenceKind:'none',source:'',text:'담당자 확인이 필요해요.',contactPhone:'',contactEvidence:''}});
 const r=await h.ask();assert.match(r.payload.answer.text,/02-1234-5678/);assert.doesNotMatch(r.payload.answer.text,/02-9999-9999/);
});

test('verified business contact removes a contradictory missing-contact claim',async()=>{
 const h=chatHarness({draft:{decision:'consult',resolution:'missing_policy',evidenceKind:'none',source:'',text:'담당자 확인이 필요해요. 현재 자료에는 확인된 담당자 연락처가 없어요.',contactPhone:'',contactEvidence:''}});
 const r=await h.ask();assert.match(r.payload.answer.text,/02-1234-5678/);assert.doesNotMatch(r.payload.answer.text,/연락처가 없/);
});

test('transient generation failure is retried once',async()=>{
 const h=chatHarness({apiErrors:[new Error('temporary upstream failure')]});
 const r=await h.ask();assert.equal(r.status,200);assert.equal(h.requests.length,2);
});
