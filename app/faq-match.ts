export const FAQ_TOPICS = [
  ['소개','어떤 사업인가요?'], ['자격','신청 자격을 알려주세요.'],
  ['방법','어떻게 신청하나요?'], ['한도','가구당 최대 지원금은 얼마인가요?'],
  ['생활비','생활비 한도가 얼마인가요?'], ['공과금','공과금 지원 한도가 얼마인가요?'],
  ['전화','문의 전화번호를 알려주세요.'], ['이메일','접수 이메일을 알려주세요.'],
] as const;
// Preserve numbers, negation, word boundaries and every additional condition.
export function faqKey(text: string) { return text.normalize('NFC').trim().replace(/\s+/g,' ').replace(/[?.!。？！]+$/u,''); }
export function matchFaq<T extends { question:string }>(items:T[], question:string, history:unknown[]) {
  if(history.length) return null;
  const matches=items.filter(item=>faqKey(item.question)===faqKey(question));
  return matches.length===1?matches[0]:null;
}
