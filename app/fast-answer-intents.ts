export const FAST_ANSWER_INTENTS = [
  { id: "overview", label: "사업 소개", question: "어떤 사업인가요?" },
  { id: "eligibility", label: "신청 자격", question: "신청 자격을 알려주세요." },
  { id: "application", label: "신청 방법", question: "어떻게 신청하나요?" },
  { id: "documents", label: "필요 서류", question: "어떤 서류가 필요한가요?" },
  { id: "period", label: "신청 기간", question: "언제 신청할 수 있나요?" },
  { id: "benefits", label: "지원 내용", question: "지원 내용을 알려주세요." },
  { id: "contact", label: "담당자 연락처", question: "담당자 연락처를 알려주세요." },
] as const;

export type FastAnswerIntentId = typeof FAST_ANSWER_INTENTS[number]["id"];
export function isFastAnswerIntent(value: unknown): value is FastAnswerIntentId { return FAST_ANSWER_INTENTS.some(intent => intent.id === value); }

export function cacheIntentForGeneralQuestion(question: string): FastAnswerIntentId | null {
  const compact = question.replace(/\s+/g, "");
  if (/\d|(?:저는|제가|제것|저희|우리|아이|아들|딸|부모|엄마|아빠|가족|가구|소득|월급|재산|주소|거주|생년|나이|학년|장애|질병|수술)/.test(compact)) return null;
  if (/(?:되나요|될까요|가능한가|가능할까|해당하나|받을수|신청할수)/.test(compact)) return null;
  const intents = [
    ["overview", /(?:사업소개|사업내용|어떤사업)/], ["eligibility", /(?:지원대상|신청자격|자격요건|신청조건|누가.*(?:지원|신청))/],
    ["application", /(?:신청방법|신청절차|신청.*어떻게|어떻게.*신청|접수방법)/], ["documents", /(?:제출서류|필요서류|어떤서류)/],
    ["period", /(?:접수기간|신청기간|언제.*신청)/], ["benefits", /(?:지원내용|지원금|어떤지원)/], ["contact", /(?:문의처|연락처|담당자|어디.*문의)/],
  ] as const;
  const matches = intents.filter(([, pattern]) => pattern.test(compact));
  return matches.length === 1 ? matches[0][0] : null;
}
