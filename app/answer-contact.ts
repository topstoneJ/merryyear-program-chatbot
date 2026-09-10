import type { AnswerKnowledge } from "./answer-knowledge";

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
  return { phone: ranked[0].phone, evidence: ranked[0].evidence };
}
