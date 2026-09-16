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
  const compact = question.replace(/[^0-9A-Za-z가-힣]/g, "").toLowerCase();
  if (!compact || /\d/.test(compact)) return null;
  // FAQ is a high-precision shortcut, not a topic search. Personal situations,
  // judgments, exceptions, changes, comparisons and multi-part requests need the
  // full question and conversation context.
  if (/(?:저는|제가|제것|저희|우리|아이|아들|딸|부모|보호자|엄마|아빠|가족|가구|소득|월급|재산|주소|거주|생년|나이|학년|장애|질병|수술|상황|사정|결과|선정|심사|승인|확률|가능성|유리|불리|무조건|예외|긴급|우선|변경|바뀌|수정|지웠|못받|부재|퇴사|직접|각각|함께|동시에|순서|단계|차이|구분|왜|어떻게처리|보장)/.test(compact)) return null;
  if (/(?:되나요|될까요|가능한가|가능할까|해당하나|받을수|신청할수|면어떻게|하면|했는데|인데|지만)/.test(compact)) return null;
  const intents = [
    ["overview", /^(?:이)?(?:사업)?(?:소개|내용)(?:를|을)?(?:알려주세요|알려줘|해주세요|해줘)?$|^(?:이)?(?:건|사업은|사업이)?(?:어떤|무슨)사업(?:인가요|이야|입니까)?$/],
    ["eligibility", /^(?:지원대상|신청자격|자격요건|신청조건)(?:은|이|을|를)?(?:무엇인가요|뭔가요|알려주세요|알려줘|해주세요|해줘)?$|^누가(?:지원|신청)(?:대상)?(?:인가요|할수있나요)?$/],
    ["application", /^(?:신청방법|신청절차|접수방법)(?:은|이|을|를)?(?:무엇인가요|뭔가요|알려주세요|알려줘|해주세요|해줘)?$|^(?:어떻게신청하나요|신청은어떻게하나요)$/],
    ["documents", /^(?:제출서류|필요서류|신청서류|구비서류)(?:는|가|를)?(?:무엇인가요|뭔가요|알려주세요|알려줘|해주세요|해줘|필요한가요)?$|^어떤서류가필요한가요$/],
    ["period", /^(?:접수기간|신청기간)(?:은|이|을|를)?(?:언제인가요|언제예요|알려주세요|알려줘|해주세요|해줘)?$|^언제신청할수있나요$/],
    ["benefits", /^(?:지원내용|지원항목|지원혜택)(?:은|이|을|를)?(?:무엇인가요|뭔가요|알려주세요|알려줘|해주세요|해줘)?$|^어떤지원을(?:받을수있나요|해주나요)$/],
    ["contact", /^(?:담당자|문의)?(?:문의처|연락처|전화번호|이메일)(?:는|가|은|이|을|를)?(?:무엇인가요|뭔가요|어디인가요|알려주세요|알려줘|주세요|줘)?$|^(?:어디로|어디에)문의(?:하면되나요|하나요)$/],
  ] as const;
  const matches = intents.filter(([, pattern]) => pattern.test(compact));
  return matches.length === 1 ? matches[0][0] : null;
}
