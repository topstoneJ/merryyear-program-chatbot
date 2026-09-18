export const FAQ_TOPICS = [
  ['소개','어떤 사업인가요?'], ['자격','신청 자격을 알려주세요.'],
  ['방법','어떻게 신청하나요?'], ['한도','가구당 최대 지원금은 얼마인가요?'],
  ['생활비','생활비 한도가 얼마인가요?'], ['공과금','공과금 지원 한도가 얼마인가요?'],
  ['전화','문의 전화번호를 알려주세요.'], ['이메일','접수 이메일을 알려주세요.'],
] as const;
export const FACILITY_FINANCE_FAQ_TOPICS = [
  ['사업 소개','어떤 기업을 위한 사업인가요?'], ['신청 요건','신청할 수 있는 기업의 요건은 무엇인가요?'],
  ['지원 용도','지원금을 어떤 용도로 사용할 수 있나요?'], ['지원 한도','지원 한도는 얼마인가요?'],
  ['금리와 상환','금리와 상환 조건은 어떻게 되나요?'], ['담보와 보증','담보나 보증이 필요한가요?'],
  ['제출 서류','신청할 때 어떤 서류가 필요한가요?'], ['신청과 문의','신청 방법과 문의처를 알려주세요.'],
] as const;
export function faqTopicsFor(businessName:string, corpus:string) {
  const profile=`${businessName}\n${corpus}`;
  return /시설운영비|운영비.{0,12}(?:대출|융자)|(?:대출|융자).{0,12}(?:상환|금리)/u.test(profile) ? FACILITY_FINANCE_FAQ_TOPICS : FAQ_TOPICS;
}
// Preserve numbers, negation, word boundaries and every additional condition.
export function faqKey(text: string) { return text.normalize('NFC').trim().replace(/\s+/g,' ').replace(/[?.!。？！]+$/u,''); }
export function matchFaq<T extends { question:string }>(items:T[], question:string, history:unknown[]) {
  if(history.length) return null;
  const matches=items.filter(item=>faqKey(item.question)===faqKey(question));
  return matches.length===1?matches[0]:null;
}
