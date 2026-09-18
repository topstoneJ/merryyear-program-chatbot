import type { AnswerKnowledge } from "./answer-knowledge";

export const CONTACT_EMAIL_PATTERN = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+/gi;
const phoneDigits = (text: string) => text.replace(/[- .\s]/g, "");

export function isDirectContactQuestion(question: string) {
  const normalized = question.replace(/\s+/g, "");
  // An anchored allowlist for pure contact lookup only. Mixed intent must reach
  // the normal answer/review path; a keyword must never replace the question.
  const simpleLookup = /^(?:(?:이|해당)?사업(?:관련)?|재단)?(?:의)?(?:(?:담당자|담당부서|담당팀)(?:의)?)?(?:연락처|전화번호|이메일(?:주소)?|메일주소|문의처|문의시간|전화상담가능시간)(?:(?:와|과|및)(?:전화번호|이메일(?:주소)?|문의시간|전화상담가능시간))?(?:은|는|을|를|가|이)?(?:함께)?(?:알려(?:주세요|줘|주시겠어요)|무엇인가요|뭔가요|뭐예요|몇번인가요|어디인가요|있나요)?[?.!]*$/.test(normalized);
  const unansweredEmail = /^(?:이메일|메일)(?:문의)?를?(?:보냈|드렸)(?:지만|는데)?(?:답장|답변|회신)이?(?:없|안왔|오지않).*?(?:다른)?(?:문의|연락)(?:방법|수단|처)?(?:이|가)?(?:있나요|무엇인가요|뭔가요|어디인가요)?[?.!]*$/.test(normalized);
  const contactChange = /^(?:접수했던)?(?:복지관|기관|시설)?(?:의)?(?:연락)?담당자가?(?:퇴사|변경|교체).*?(?:연락)?담당자(?:변경)?(?:은|을|를)?(?:어디|누구|어느곳)(?:에|에게)?(?:알리|문의|연락)(?:나요|하면되나요|해야하나요)?[?.!]*$/.test(normalized);
  return simpleLookup || unansweredEmail || contactChange;
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
