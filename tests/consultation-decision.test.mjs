import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const code = ts.transpileModule(await readFile(new URL("../db/consultation-decision.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
new Function("exports", code)(exports);
const decide = exports.decisionFromAnswer;
test("historical referral wording is classified as staff consultation", () => {
  for (const answer of ["등록된 자료 상으로 확인이 어렵습니다. 담당자에게 문의해 주세요", "탈락 시 담당자에게 전화로 문의하시면 심사의견을 자세하게 안내받으실 수 있습니다.", "담당자 문의가 필요합니다."]) assert.equal(decide(answer), "consult");
});
test("contact details alone and optional footer do not turn facts into referrals", () => {
  assert.equal(decide("사업 담당자 문의: 02-1234-5678"), "fact");
  assert.equal(decide("지원금은 300만 원입니다.\n\n기타 궁금한 사항은 담당자에게 문의해 주세요."), "fact");
  assert.equal(decide("가능합니다. 자세한 사항은 담당자에게 문의해 주세요."), "possible");
});
test("eligibility and insufficient question information retain distinct decisions", () => {
  assert.equal(decide("가능해요. 신청 조건에 맞아요."), "possible");
  assert.equal(decide("불가능해요. 연령 기준을 넘어요."), "impossible");
  assert.equal(decide("담당자 문의가 필요해요."), "consult");
  assert.equal(decide("추가 정보가 필요해요."), "need_info");
  assert.equal(decide("불가능합니다. 지원 대상이 아닙니다."), "impossible");
  assert.equal(decide("추가 정보가 필요합니다. 가구원 수를 알려주세요."), "need_info");
});

test("operation inquiries take precedence and income maps to eligibility", () => {
  for (const q of ["담당자가 누구야?", "탈락 사유 알려주는지 궁금해", "미선정 이유 안내 가능한가요?", "담당자 전화번호?"]) assert.equal(exports.categoryFromQuestion(q), "운영 문의");
  assert.equal(exports.categoryFromQuestion("가구 소득 기준은?"), "신청 자격");
  assert.equal(exports.categoryFromQuestion("지원 금액 얼마예요?"), "지원 내용");
  assert.equal(exports.categoryFromQuestion("지원 항목은?"), "지원 내용");
});

test("supported items, including short follow-ups, are support content", () => {
  for (const q of ["인덕션은 되는데 하이라이트는 됨?", "최저가로 사는거면 냉장고도 제일 작은거만 사야해?", "김치냉장고도 냉장고잖아", "김치냉장고 지원되나요", "냉장고는 필수가전인데 김치냉장고도 되나요? 같은 냉장고인데", "김치냉장고는요?", "얼음냉장고는요?", "제습기도 필수가전인가요?", "세탁기도 지원 대상인가요?", "지원물품은 무엇인가요?", "가구 구입 지원은?"]) {
    assert.equal(exports.categoryFromQuestion(q), "지원 내용", q);
  }
  assert.equal(exports.categoryFromQuestion("3인 가구 신청 자격은?"), "신청 자격");
});
