import test from 'node:test';
import assert from 'node:assert/strict';
import privacy from './load-chat-privacy.mjs';
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
test('names, places and ordinary answer wording are never masked',()=>{
 for(const text of ['고등학생 자녀도 지원받을 수 있나요?', '고등학생 자녀도 지원을 받을 수 있나요?', '성명: 홍길동','김영석도 신청 가능한가요?','내가 아는 구도일이라는 애가 있는데','포천종복의 홍길동 매니저가 추천해줬는데요. 여기 신청하면 돈 주나요','만 19세 이하 아동을 지원하는 사업이에요. 개인에게 현금을 지급하는 것이 아닙니다.','경기도 안양','전화 02-1234-5678, 소득 300만원, 생년월일 900101']) assert.equal(mask(text),text);
 assert.equal(mask('홍길동 900101-1234567'),'홍길동 9*****-*******');
});
