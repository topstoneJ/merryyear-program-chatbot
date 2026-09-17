import { CONTACT_EMAIL_PATTERN, findBusinessContact, findBusinessEmail } from "./answer-contact";
import { separateCitations } from "./answer-citations";
import { decisionPrefixes, type AnswerSettings } from "./answer-settings";
import { sourceText, type AnswerKnowledge } from "./answer-knowledge";
import { ANSWER_DECISIONS, EVIDENCE_KINDS, RESOLUTIONS, QUESTION_TARGETS, isAnswerDecision, validateAnswerSemantics, type AnswerDecision, type AnswerDraft, type AnswerValidationContext } from "./answer-contract";

export { ANSWER_DECISIONS, EVIDENCE_KINDS, RESOLUTIONS, isAnswerDecision };
export type { AnswerDecision };
export type Answer = { text: string; source: string; page: number; confidence: number; review: boolean; decision: AnswerDecision; categoryId?: string };
export const NO_KNOWLEDGE_ANSWER: Answer = {
  text: "현재 자료에서 해당 기준을 확인하기 어려워요. 해당 사업 담당자에게 확인해 주세요. 현재 자료에는 확인된 담당자 연락처가 없어요.",
  source: "", page: 0, confidence: 65, review: true, decision: "fact",
};

export function parseGeminiAnswer(raw: string, knowledge: AnswerKnowledge, settings: AnswerSettings, categoryIds: string[], question = "", context: AnswerValidationContext = {}): Answer {
  const parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim());
  const keys = ["categoryId", "questionTarget", "decision", "evidenceKind", "resolution", "eligibilityEvidence", "text", "source", "page", "review", "contactPhone", "contactEvidence"];
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object" || Object.keys(parsed).length !== keys.length
    || keys.some(key => !Object.hasOwn(parsed, key)) || !isAnswerDecision(parsed.decision)
    || !EVIDENCE_KINDS.includes(parsed.evidenceKind) || !RESOLUTIONS.includes(parsed.resolution) || !QUESTION_TARGETS.includes(parsed.questionTarget)
    || !Array.isArray(parsed.eligibilityEvidence) || parsed.eligibilityEvidence.length > 50
    || parsed.eligibilityEvidence.some((item: AnswerDraft["eligibilityEvidence"][number]) => !item || typeof item !== "object" || Array.isArray(item)
      || Object.keys(item).length !== 4 || !["sourceId", "quote", "userStatement"].every(key => typeof item[key as keyof typeof item] === "string" && item[key as keyof typeof item].trim())
      || !["met", "unmet"].includes(item.result))
    || !categoryIds.includes(parsed.categoryId) || !["text", "source", "contactPhone", "contactEvidence"].every(key => typeof parsed[key] === "string")
    || !parsed.text.trim() || parsed.text.length > 20_000 || typeof parsed.review !== "boolean"
    || !Number.isInteger(parsed.page) || parsed.page < 0) throw new Error("Invalid Gemini response contract");
  const source = knowledge.sources.find(source => source.id === parsed.source);
  if (parsed.source && !source) throw new Error("Unknown answer source");
  // A verified document can still have unavailable page metadata. Do not turn an
  // optional, unverified citation into an outage or present the invented page.
  const pageVerified = parsed.page === 0 || Boolean(source?.type === "pdf" && source.parts.some(part => part.pages.includes(parsed.page)));
  const page = pageVerified ? parsed.page : 0;
  if (!source && ["possible", "impossible"].includes(parsed.decision)) throw new Error("Eligibility decision without a source");

  if (parsed.decision === "out_of_scope") {
    validateAnswerSemantics(parsed, knowledge, question, context);
    return { text: "답변할 수 없는 질문입니다. 해당 사업과 관련된 질문을 해주세요.", source: "", page: 0, confidence: 95, review: false, decision: parsed.decision, categoryId: parsed.categoryId };
  }
  const fallbackContact = findBusinessContact(knowledge);
  const separated = separateCitations(parsed.text);
  let phone = parsed.contactPhone.trim(), evidence = parsed.contactEvidence.trim();

  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  const contactSource = knowledge.sources.find(candidate => evidence && normalize(sourceText(candidate)).includes(normalize(evidence)));
  let verifiedContact = contactSource && /^0[0-9]{1,2}[- .]?[0-9]{3,4}[- .]?[0-9]{4}$/.test(phone)
    && /담당|문의|연락/.test(evidence) && !/대표\s*(전화|번호)|대표번호/.test(evidence)
    && evidence.replace(/[- .\s]/g, "").includes(phone.replace(/[- .]/g, ""))
    && !knowledge.conflicts.some(conflict => [conflict.left, conflict.right].some(side => side.quote.replace(/[- .\s]/g, "").includes(phone.replace(/[- .]/g, ""))));
  // A partial answer can still satisfy an informational question. Referral is
  // reserved for unresolved policy/operations, conflicts, or an explicit consult
  // decision instead of being appended to every incomplete comparison.
  const modelRequestsReferral = /(?:담당자|담당\s*부서).{0,60}(?:문의|확인)/s.test(parsed.text);
  const directContactRequest = /(?:담당자|담당\s*부서|문의처|연락처|전화번호|이메일)/.test(question.replace(/\s+/g, ""));
  const needsReferral = ["missing_policy", "conflict", "action_required"].includes(parsed.resolution)
    || parsed.decision === "consult" || modelRequestsReferral || directContactRequest;
  if (!verifiedContact && fallbackContact && (needsReferral || (parsed.decision === "fact" && !source && parsed.evidenceKind !== "system") || settings.alwaysContact)) {
    ({phone,evidence} = fallbackContact); verifiedContact = true;
  }
  // A missing document is not a missing system capability rule. Unsupported policy
  // assertions are still discarded; a verified contact alone is not policy evidence.
  const unsupported = parsed.decision === "fact" && !source && parsed.evidenceKind !== "system";
  if (parsed.evidenceKind === "document" && !source && !needsReferral && !unsupported && parsed.decision !== "need_info") throw new Error("Unknown answer source");
  const email = findBusinessEmail(knowledge, verifiedContact ? phone : "");
  const referral = "이메일: " + (email || "등록 자료에서 확인되지 않음")
    + "\n전화번호: " + (verifiedContact ? phone : "등록 자료에서 확인되지 않음");
  if (unsupported) return { ...NO_KNOWLEDGE_ANSWER, decision: "consult", categoryId: parsed.categoryId,
    text: (settings.tone === "friendly" ? "현재 자료에서 해당 기준을 확인하기 어려워요." : "현재 자료에서 해당 기준을 확인하기 어렵습니다.") + "\n\n" + referral };
  validateAnswerSemantics(parsed, knowledge, question, context);
  const prefixes = decisionPrefixes(settings);
  const prefix = parsed.decision === "fact" ? "" : prefixes[parsed.decision as keyof typeof prefixes];
  const plainBody = separated.body.replace(/`([^`\n]+)`/g, "$1");
  const conflictsWith = (value: string) => knowledge.conflicts.some(conflict => [conflict.left, conflict.right]
    .some(side => side.quote.toLowerCase().includes(value.toLowerCase())));
  const sourceHasApplicationChannel = (value: string, phoneNumber = false) => {
    if (!source || conflictsWith(value)) return false;
    return source.parts.some(part => {
      const text = part.text, found = phoneNumber ? phoneDigitsIn(text, value) : text.toLowerCase().includes(value.toLowerCase());
      if (!found) return false;
      const index = text.toLowerCase().indexOf(value.toLowerCase());
      const nearby = index < 0 ? text : text.slice(Math.max(0, index - 180), Math.min(text.length, index + value.length + 180));
      const channelContext = `${part.title}\n${nearby}`;
      const unrelatedChannel = /(?:후원|기부|채용)\s*(?:문의|담당|이메일|메일|전화|연락처)|개인정보\s*(?:문의|담당|보호|처리방침|관리)|대표\s*(?:이메일|메일|전화|번호|연락처)/.test(channelContext);
      return /(?:신청|접수|제출|서류|송부|보내|등록|예약)/.test(channelContext) && !unrelatedChannel;
    });
  };
  const sourceHasEmail = (value: string) => sourceHasApplicationChannel(value);
  const sourceHasPhone = (value: string) => sourceHasApplicationChannel(value, true);
  const bodyEmails = [...plainBody.matchAll(CONTACT_EMAIL_PATTERN)].map(match => match[0]);
  const bodyPhones = [...plainBody.matchAll(/0[0-9]{1,2}[- .]?[0-9]{3,4}[- .]?[0-9]{4}/g)].map(match => match[0]);
  const hasUnverifiedBodyContact = bodyEmails.some(value => !sourceHasEmail(value) && (!email || value.toLowerCase() !== email.toLowerCase()))
    || bodyPhones.some(value => !sourceHasPhone(value) && (!verifiedContact || value.replace(/[- .]/g, "") !== phone.replace(/[- .]/g, "")));
  let body = plainBody.replace(/0[0-9]{1,2}[- .]?[0-9]{3,4}[- .]?[0-9]{4}/g, (value: string) => sourceHasPhone(value) || (verifiedContact && value.replace(/[- .]/g, "") === phone.replace(/[- .]/g, "")) ? value : "[연락처 확인 필요]")
    .replace(CONTACT_EMAIL_PATTERN, (value: string) => sourceHasEmail(value) || (email && value.toLowerCase() === email.toLowerCase()) ? value : "[이메일 확인 필요]")
    .replace(/(?:사업\s*)?담당자\s*문의\s*(?:\n|$)/g, "")
    .replace(/문의는\s*((?:평일|주말|매일)[^\n.!?]*(?:가능해요|가능합니다))/g, "전화 상담은 $1")
    .replace(/문의\s*가능\s*시간은/g, "전화 상담 가능 시간은");
  if (verifiedContact) {
    body = body
      .replace(/(?:현재\s*)?자료(?:에서|에는)?\s*(?:확인된\s*)?담당자\s*연락처(?:를\s*확인할\s*수|가)?\s*(?:없습니다|없어요|어렵습니다|어려워요)[.!]?/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  const withoutPrefix = prefix ? body.replace(/^(?:불가능(?:합니다|해요)|가능(?:합니다|해요)|담당자 문의가 필요(?:합니다|해요)|추가 정보가 필요(?:합니다|해요))[.!]?\s*/, "") : body;
  const referralAlreadyPresent = verifiedContact && email && phoneDigitsIn(body, phone) && body.toLowerCase().includes(email.toLowerCase());
  const verifiedDirectContact = directContactRequest && verifiedContact && Boolean(email)
    && parsed.decision === "fact" && parsed.resolution === "complete";
  const review = parsed.review || ["partial", "missing_policy", "conflict", "action_required"].includes(parsed.resolution)
    || hasUnverifiedBodyContact || (needsReferral && !verifiedDirectContact) || !pageVerified;
  const shouldAppendReferral = needsReferral || settings.alwaysContact;
  const sourceUrl = source?.url && /^https?:\/\//i.test(source.url) ? source.url : "";
  const citations = (settings.showSources || separated.citations || /출처|근거/.test(question)) && source
    ? `출처: ${source.title}${page ? ` (${page}쪽)` : ""}${sourceUrl ? `\n${sourceUrl}` : ""}` : "";
  return { text: [prefix ? [prefix, withoutPrefix].filter(Boolean).join("\n\n") : body, shouldAppendReferral ? (referralAlreadyPresent ? "" : referral) : "", citations].filter(Boolean).join("\n\n"),
    source: source?.title || "", page, review, decision: parsed.decision, categoryId: parsed.categoryId,
    // Historical UI indicator, not a measured model confidence/probability.
    confidence: review ? 65 : parsed.decision === "need_info" ? 80 : 95 };
}

function phoneDigitsIn(text: string, phone: string) { return text.replace(/[- .\s]/g, "").includes(phone.replace(/[- .]/g, "")); }
