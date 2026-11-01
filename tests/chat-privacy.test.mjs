import test from 'node:test';
import assert from 'node:assert/strict';
import privacy from './load-chat-privacy.mjs';
import { chatHarness, sourceLoader } from './load-source.mjs';
const mask=privacy.maskResidentRegistrationNumber;
test('identity numbers retain only their first character',()=>{
 for(const [input,expected] of [
  ['900101-1234567','9*****-*******'],
  ['외국인등록번호 900101-5123456','외국인등록번호 9*****-*******'],
  ['여권번호 M12345678','여권번호 M********'],
  ['여권 AB1234567','여권 A********'],
  ['운전면허번호 11-22-123456-78','운전면허번호 1*-**-******-**'],
  ['면허번호 112212345678','면허번호 1***********'],
 ]) assert.equal(mask(input),expected);
});

test('untrusted questions mask telephone numbers and email without changing amounts or dates',()=>{
 const contacts=['010-1234-5678','01012345678','02-123-4567','031 1234 5678','070.1234.5678','+82 10 1234 5678','+82 (0)10-1234-5678','person+child@example.org'];
 for(const contact of contacts) {
  const result=privacy.maskPersonalInformation(`연락처 ${contact}로 연락해주세요`);
  assert.ok(!result.includes(contact),contact);
  assert.match(result,/\[(?:전화번호|이메일) 숨김\]/);
  assert.equal(privacy.maskPersonalInformation(result),result,'masking is idempotent');
 }
 for(const text of ['2026-11-01에 신청합니다','소득 1,234,567원','월 300만원, 생년월일 900101','만 14세 미만 아동','지원금 1000000000원']) assert.equal(privacy.maskPersonalInformation(text),text);
 // Answers still expose the validated institution contact, using identity-only masking.
 assert.equal(privacy.maskIdentityNumbers('담당자 02-1234-5678 / help@example.org'),'담당자 02-1234-5678 / help@example.org');
});

test('server masks current questions and supplied history before model calls and consultation storage', async()=>{
 const h=chatHarness();
 const result=await h.ask({question:'신청 방법은? 제 번호는 010-1234-5678, 이메일 a@example.org',history:[{question:'제 연락처는 031-123-4567',answer:'메일 b@example.org로 연락하셨나요?'}]});
 assert.equal(result.status,200);
 assert.equal(h.records.length,1);
 assert.ok(h.requests.length>0);
 const serialized=JSON.stringify({requests:h.requests,reviews:h.reviewRequests,records:h.records,payload:result.payload});
 for(const raw of ['010-1234-5678','a@example.org','031-123-4567','b@example.org']) assert.ok(!serialized.includes(raw),raw);
 assert.match(h.records[0].question,/\[전화번호 숨김\]/);
 const history=sourceLoader()('app/chat-context.ts').parseChatHistory([{question:'010-1234-5678',answer:'a@example.org'}]);
 assert.deepEqual(history,[{question:'[전화번호 숨김]',answer:'[이메일 숨김]'}]);
});
test('names, places and ordinary answer wording are never masked',()=>{
 for(const text of ['고등학생 자녀도 지원받을 수 있나요?', '고등학생 자녀도 지원을 받을 수 있나요?', '성명: 홍길동','김영석도 신청 가능한가요?','내가 아는 구도일이라는 애가 있는데','포천종복의 홍길동 매니저가 추천해줬는데요. 여기 신청하면 돈 주나요','만 19세 이하 아동을 지원하는 사업이에요. 개인에게 현금을 지급하는 것이 아닙니다.','경기도 안양','전화 02-1234-5678, 소득 300만원, 생년월일 900101']) assert.equal(mask(text),text);
 assert.equal(mask('홍길동 900101-1234567'),'홍길동 9*****-*******');
});
