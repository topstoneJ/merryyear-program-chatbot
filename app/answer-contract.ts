import type { AnswerKnowledge } from "./answer-knowledge";
import type { ChatTurn } from "./chat-context";

export const ANSWER_CONTRACT_VERSION = "answer-v5";
export const ANSWER_DECISIONS = ["possible", "impossible", "consult", "need_info", "fact", "out_of_scope"] as const;
export const EVIDENCE_KINDS = ["document", "system", "none"] as const;
export const RESOLUTIONS = ["complete", "partial", "missing_policy", "conflict", "needs_user", "action_required"] as const;
export const QUESTION_TARGETS = ["general", "specific", "eligibility", "system", "status", "unrelated"] as const;
export type AnswerDecision = typeof ANSWER_DECISIONS[number];
export const isAnswerDecision = (value: unknown): value is AnswerDecision => typeof value === "string" && (ANSWER_DECISIONS as readonly string[]).includes(value);
export type AnswerValidationContext = { history?: ChatTurn[] };
type EligibilityEvidence = { sourceId: string; quote: string; userStatement: string; result: "met" | "unmet" };
export type AnswerDraft = {
  categoryId: string; questionTarget: typeof QUESTION_TARGETS[number]; decision: AnswerDecision;
  evidenceKind: typeof EVIDENCE_KINDS[number]; resolution: typeof RESOLUTIONS[number];
  eligibilityEvidence: EligibilityEvidence[];
  text: string; source: string; page: number; review: boolean; contactPhone: string; contactEvidence: string;
};

export const ANSWER_CONTRACT_INSTRUCTION = `[응답 계약 ${ANSWER_CONTRACT_VERSION}]
questionTarget: general=일반 사업 안내, specific=특정 비용·품목·절차, eligibility=사용자 개인의 전체 신청 자격, system=챗봇 기능, status=개별 처리 상태, unrelated=완전히 무관한 질문.
허용 조합:
complete → fact 또는 근거를 갖춘 possible/impossible. partial → fact. needs_user → need_info. missing_policy/conflict/action_required → consult.
possible/impossible은 questionTarget=eligibility, evidenceKind=document, resolution=complete일 때만 허용한다. 개인 조건 없는 일반 신청 자격 설명과 특정 품목의 지원 여부는 fact이다.
evidenceKind=document이면 source는 실제 핵심 근거 id. system/none이면 source="", page=0. system은 questionTarget=system, decision=fact, resolution=complete인 챗봇 기능·제한 설명에만 쓴다.
out_of_scope는 questionTarget=unrelated, evidenceKind=none, resolution=complete, source="", page=0, review=false이다.
eligibilityEvidence는 possible/impossible에만 채운다. 각 항목은 sourceId, quote(해당 문서 한 섹션의 연속 원문), userStatement(현재 또는 이전 사용자 메시지의 연속 원문), result(met/unmet)이다. 나머지 판정에서는 []이다. 사용자 조건을 이전 AI 답변에서 가져오지 않는다. 최신 정정을 우선한다.
possible은 필수 요건과 제외 조건을 빠짐없이 검토하고 각 근거·사용자 조건을 제시할 수 있을 때만 쓴다. 하나라도 미확인이면 needs_user/need_info 또는 missing_policy/consult이다. impossible은 예외 적용 여부까지 확인된 명시적 탈락 사유의 unmet 근거가 있어야 한다.
text에는 본문만 작성한다. '가능해요/불가능해요/담당자 문의가 필요해요/추가 정보가 필요해요' 같은 고정 도입부와 출처 문단은 서버가 조립한다. 개인 자격은 현재 확인된 신청 요건의 범위로만 설명하고 최종 선정·승인을 보장하지 않는다.
partial/missing_policy/conflict/action_required이면 review=true. 연락처를 안다는 이유로 자료 부족·충돌의 검토 상태를 해제하지 않는다.`;

export class AnswerContractError extends Error {
  constructor(public readonly code: string) { super("Invalid answer semantics: " + code); }
}

export function answerSchema(categoryIds: string[], knowledge: AnswerKnowledge) {
  const sourceIds = knowledge.sources.map(source => source.id);
  const properties = {
    categoryId: { type: "string", enum: categoryIds },
    questionTarget: { type: "string", enum: QUESTION_TARGETS },
    decision: { type: "string", enum: ANSWER_DECISIONS },
    evidenceKind: { type: "string", enum: EVIDENCE_KINDS },
    resolution: { type: "string", enum: RESOLUTIONS },
    eligibilityEvidence: { type: "array", items: { type: "object", additionalProperties: false,
      properties: { sourceId: { type: "string", enum: ["", ...sourceIds] }, quote: { type: "string" }, userStatement: { type: "string" }, result: { type: "string", enum: ["met", "unmet"] } },
      required: ["sourceId", "quote", "userStatement", "result"] } },
    text: { type: "string" }, source: { type: "string", enum: ["", ...sourceIds] },
    page: { type: "integer", enum: [...new Set([0, ...knowledge.sources.flatMap(source => source.parts.flatMap(part => part.pages))])] },
    review: { type: "boolean" }, contactPhone: { type: "string" }, contactEvidence: { type: "string" },
  };
  return { type: "object", additionalProperties: false, properties, required: Object.keys(properties) };
}

const normalized = (value: string) => value.replace(/\s+/g, " ").trim();

const clearlyRelatedQuestion = (question: string) => /(?:챗봇|개인정보|신청|접수|지원|사업|재단|공고|안내문|서류|자격|대상|심사|선정|지급|정산|영수증|문의|담당|복지|아동|가정|생계|주거|의료|병원|월세|소득)/
  .test(question.replace(/\s+/g, ""));

const specificPolicyQuestion = (question: string) => /(?:가능|할\s*수\s*있|되나요|돼요|됩니까|인정|포함|지원되|신청되|제출되|바꿀|변경|재검토|앞당|우선|대체)/
  .test(question);

const topicStopWords = new Set(["이거", "저거", "그거", "제가", "저희", "우리", "어떤", "경우", "정도", "내용", "사업", "지원", "신청", "가능", "관련", "대한", "있", "없"]);
function topicTokens(question: string) {
  return [...new Set(question.replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/).map(token => token
    .replace(/(?:인가요|되나요|돼요|됩니까|있나요|없나요|할까요|할수|합니다|해요|나요|까요|습니까|이라면|이면요|이면|으로|에서|에게|까지|부터|처럼|보다|이라도|는데|은|는|이|가|을|를|도|에|와|과|할|한)$/u, ""))
    .filter(token => token.length >= 2 && !topicStopWords.has(token)))];
}

function sourceSupportsSpecificQuestion(draft: AnswerDraft, knowledge: AnswerKnowledge, question: string) {
  if (draft.questionTarget !== "specific" || draft.decision !== "fact" || draft.evidenceKind !== "document"
    || draft.resolution !== "complete" || !specificPolicyQuestion(question)) return true;
  const source = knowledge.sources.find(item => item.id === draft.source);
  const topics = topicTokens(question);
  if (!source || !topics.length) return false;
  const required = topics.length <= 2 ? topics.length : Math.ceil(topics.length * 0.67);
  const answer = draft.text.trim();
  const positive = /^(?:네[,.\s]|가능|지원(?:돼|됩|해|할)|인정(?:돼|됩)|포함(?:돼|됩)|신청할\s*수\s*있|제출할\s*수\s*있)/.test(answer);
  const negative = /^(?:아니요[,.\s]|불가능|지원(?:되지|하지\s*않)|인정(?:되지|하지\s*않)|포함(?:되지|하지\s*않)|(?:신청|제출)할\s*수\s*없)/.test(answer);
  return source.parts.some(part => {
    const text = `${part.title}\n${part.text}`.replace(/\s+/g, "");
    if (topics.filter(topic => text.includes(topic)).length < required) return false;
    const positiveEvidence = /(?:가능|할수있|지원(?:품목|대상|가능|한다|함)|포함(?:된다|함)|인정(?:된다|함)|허용)/.test(text);
    const negativeEvidence = /(?:불가|할수없|제외|지원하지않|인정되지않|금지)/.test(text);
    if (positive && (!positiveEvidence || negativeEvidence)) return false;
    if (negative && !negativeEvidence) return false;
    return true;
  });
}

export function validateAnswerSemantics(draft: AnswerDraft, knowledge: AnswerKnowledge, question: string, context: AnswerValidationContext) {
  const fail = (code: string): never => { throw new AnswerContractError(code); };
  const decision = draft.decision, resolution = draft.resolution;
  if (draft.evidenceKind === "document" ? !draft.source : Boolean(draft.source || draft.page)) fail("evidence_source_mismatch");
  if (draft.evidenceKind === "system" && (draft.questionTarget !== "system" || decision !== "fact" || resolution !== "complete")) fail("system_evidence_scope");
  if (decision === "out_of_scope") {
    if (draft.questionTarget !== "unrelated" || draft.evidenceKind !== "none" || resolution !== "complete"
      || draft.review || draft.contactPhone || draft.contactEvidence || draft.eligibilityEvidence.length) fail("out_of_scope_contract");
    if (clearlyRelatedQuestion(question)) fail("related_question_out_of_scope");
    return;
  }
  if (draft.questionTarget === "unrelated") fail("unrelated_target_mismatch");
  if (!sourceSupportsSpecificQuestion(draft, knowledge, question)) fail("unsupported_specific_claim");
  const allowed: Record<AnswerDraft["resolution"], readonly AnswerDecision[]> = {
    complete: ["fact", "possible", "impossible"], partial: ["fact"], needs_user: ["need_info"],
    missing_policy: ["consult"], conflict: ["consult"], action_required: ["consult"],
  };
  if (!allowed[resolution].includes(decision)) fail("decision_resolution_mismatch");
  if (["possible", "impossible"].includes(decision)) {
    if (draft.questionTarget !== "eligibility" || draft.evidenceKind !== "document" || !draft.eligibilityEvidence.length || draft.review) fail("eligibility_requires_personal_evidence");
    const statements = [...(context.history || []).map(turn => turn.question), question].map(normalized);
    for (const evidence of draft.eligibilityEvidence) {
      const source = knowledge.sources.find(item => item.id === evidence.sourceId);
      if (!source?.parts.some(part => normalized(part.text).includes(normalized(evidence.quote)))) fail("eligibility_quote_not_in_source");
      if (!statements.some(statement => statement.includes(normalized(evidence.userStatement)))) fail("eligibility_user_statement_not_provided");
      if (knowledge.conflicts.some(conflict => [conflict.left, conflict.right].some(side => side.sourceId === evidence.sourceId
        && (normalized(side.quote).includes(normalized(evidence.quote)) || normalized(evidence.quote).includes(normalized(side.quote)))))) fail("eligibility_evidence_conflicts");
    }
    if (decision === "possible" && draft.eligibilityEvidence.some(item => item.result !== "met")) fail("possible_has_unmet_condition");
    if (decision === "impossible" && !draft.eligibilityEvidence.some(item => item.result === "unmet")) fail("impossible_without_exclusion");
  } else if (draft.eligibilityEvidence.length) fail("unexpected_eligibility_evidence");
  // Standalone verdicts are not silently removed: the remaining body may carry
  // the same wrong conclusion. Ask the model to reconsider the whole answer.
  const opening = draft.text.trim().replace(/^[*#\s]+/, "");
  if (!["possible", "impossible"].includes(decision) && /^(?:불가능|가능)(?:합니다|해요)[.!。]?(?:\s|$)/.test(opening)) fail("verdict_in_information_answer");
  if (decision === "possible" && /^불가능(?:합니다|해요)/.test(opening)
    || decision === "impossible" && /^가능(?:합니다|해요)/.test(opening)) fail("contradictory_verdict");
  if (decision !== "consult" && /^담당자 문의가 필요(?:합니다|해요)/.test(opening)
    || decision !== "need_info" && /^추가 정보가 필요(?:합니다|해요)/.test(opening)) fail("contradictory_verdict");
}

export function contractRepairInstruction(error: unknown) {
  if (error instanceof AnswerContractError) return `[서버 검증 실패: ${error.code}] 응답 계약을 다시 적용하세요. 판정값만 바꾸지 말고 질문과 원문 근거부터 재검토하여 본문도 일치시킨 완전한 JSON을 반환하세요.`;
  if (error instanceof SyntaxError || error instanceof Error && /^(Invalid (?:AI|Gemini) response contract|Unknown answer source|Eligibility decision without a source)$/.test(error.message))
    return "[서버 형식 검증 실패] 요청된 JSON 스키마, 실제 출처 id와 근거 종류를 확인하여 완전한 JSON 객체를 반환하세요.";
  return "";
}
