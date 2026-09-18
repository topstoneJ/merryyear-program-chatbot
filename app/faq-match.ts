export const FAQ_TOPICS = [
  ['사업소개','어떤 사업인가요?'], ['신청자격','신청 자격을 알려주세요.'],
  ['지원내용','어떤 지원을 받을 수 있나요?'], ['접수기간','접수 기간은 언제인가요?'],
  ['신청방법','어떻게 신청하나요?'], ['연락처','문의할 연락처를 알려주세요.'],
] as const;
export function faqTopicsFor(_businessName:string,_corpus:string) { return FAQ_TOPICS; }
export function faqPromptQuestion(text:string) {
  const sentence=text.normalize('NFC').trim().replace(/[.!?。？！]+$/u,'');
  return `${sentence}${/(?:주세요|바랍니다|합니다|됩니다)$/u.test(sentence)?'.':'?'}`;
}
// Preserve numbers, negation, word boundaries and every additional condition.
export function faqKey(text: string) { return text.normalize('NFC').trim().replace(/\s+/g,' ').replace(/[?.!。？！]+$/u,''); }
export function matchFaq<T extends { question:string }>(items:T[], question:string, history:unknown[]) {
  if(history.length) return null;
  const matches=items.filter(item=>faqKey(item.question)===faqKey(question));
  return matches.length===1?matches[0]:null;
}
