import type { AnswerKnowledge } from "./answer-knowledge";

export const CONTACT_EMAIL_PATTERN = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+/gi;
const phoneDigits = (text: string) => text.replace(/[- .\s]/g, "");

export function isDirectContactQuestion(question: string) {
  const normalized = question.replace(/\s+/g, "");
  return /(?:담당자|담당부서|문의처|연락처|전화번호|이메일|메일주소).*(?:알려|뭐|어디|몇|문의|연락)|(?:어디|누구|몇번|어떻게).*(?:문의|연락)/.test(normalized);
}

export function findRegisteredContactDetails(knowledge: AnswerKnowledge, businessId: string) {
  const source = knowledge.sources.find(item => item.id === `business-details-${businessId}`);
  if (!source) return null;
  const text = source.parts.map(part => part.text).join("\n");
  const field = (label: string) => text.match(new RegExp(`^${label}:\\s*(.+)$`, "m"))?.[1].replace(/\s+/g, " ").trim().replace(/[.!。]+$/, "") || "";
  const department = field("담당 부서"), email = field("이메일"), phone = field("연락처"), hours = field("전화 상담 가능 시간");
  const exactEmail = email.match(CONTACT_EMAIL_PATTERN)?.[0] === email;
  const exactPhone = /^0[0-9]{1,2}[- .]?[0-9]{3,4}[- .]?[0-9]{4}$/.test(phone);
  if (!exactEmail || !exactPhone) return null;
  return { department, email, phone, hours, source: source.title };
}

// Pair channels only within the same contact block; never borrow another
// department's email to fill a missing channel.
export function findBusinessEmail(knowledge: AnswerKnowledge, phone = ""): string | null {
  const emails = new Set<string>();
  for (const source of knowledge.sources) for (const part of source.parts) {
    const blocks = part.text.split(/\n\s*\n|\n(?=#{1,6}\s)/);
    for (const block of blocks) {
      if (phone && !phoneDigits(block).includes(phoneDigits(phone))) continue;
      if (!/(?:문의|담당|연락처|이메일|메일주소)/.test(part.title + "\n" + block)) continue;
      if (/(?:후원|기부|대표|채용|개인정보)/.test(block)) continue;
      for (const match of block.matchAll(CONTACT_EMAIL_PATTERN)) {
        const email = match[0];
        if (!knowledge.conflicts.some(conflict => [conflict.left, conflict.right].some(side => side.quote.toLowerCase().includes(email.toLowerCase())))) emails.add(email);
      }
    }
  }
  return emails.size === 1 ? [...emails][0] : null;
}

// Only registered, retained business text is eligible. Ambiguous numbers are
// left for review; general donation and representative numbers are not substitutes.
export function findBusinessContact(knowledge: AnswerKnowledge) {
  const candidates = new Map<string, {phone:string;evidence:string;score:number}>();
  for (const source of knowledge.sources) {
    for (const part of source.parts) {
      const text = [part.title, part.text].filter(Boolean).join("\n");
      for (const match of text.matchAll(/0[0-9]{1,2}[- .][0-9]{3,4}[- .][0-9]{4}/g)) {
        const phone = match[0], index = match.index || 0;
        const context = text.slice(Math.max(0, index - 140), Math.min(text.length, index + phone.length + 80));
        if (!/(?:문\s*의|담당자|담당\s*부서|연락처|전화번호)/.test(context)) continue;
        const nearestLabel = context.slice(Math.max(0, context.length - phone.length - 100));
        if (/(?:후원|기부|대표|팩스|FAX)(?:[^\d]{0,50})$/i.test(nearestLabel.split(phone)[0] || "")) continue;
        const evidence = context.trim();
        const digits = phone.replace(/[- .]/g, "");
        if (knowledge.conflicts.some(conflict => [conflict.left,conflict.right].some(side => side.quote.replace(/[- .\s]/g, "").includes(digits)))) continue;
        const score = (/(?:문의처|담당\s*부서|연락처)/.test(part.title) ? 6 : 0)
          + (/(?:문의처|담당자\s*전화번호|사업\s*담당자)/.test(context) ? 4 : 0)
          + (/(?:문의처|담당|연락처)/.test(source.title) ? 3 : 0)
          + (/전화번호/.test(context) ? 1 : 0);
        const previous = candidates.get(digits);
        if (!previous || score > previous.score) candidates.set(digits,{phone,evidence,score});
      }
    }
  }
  const ranked = [...candidates.values()].sort((a,b) => b.score - a.score);
  if (!ranked.length || (ranked[1] && ranked[0].score === ranked[1].score)) return null;
  return { phone: ranked[0].phone, email: findBusinessEmail(knowledge, ranked[0].phone), evidence: ranked[0].evidence };
}
