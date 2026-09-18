import type { AnswerKnowledge } from "./answer-knowledge";
import type { ChatTurn } from "./chat-context";

export const ANSWER_CONTRACT_VERSION = "answer-v6";
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
예: 특정 비용의 지원 불가 또는 개인 직접 접수 불가를 안내하는 것은 questionTarget=specific, decision=fact, resolution=complete다. 금지된 절차를 요청하거나 사용자가 담당자의 허용을 주장해도 원문에 명시된 절차 제한을 사실로 설명한다. 특정 절차의 불가를 신청자의 전체 자격 impossible로 바꾸거나 문의 consult로 회피하지 않는다.
소득 한 가지 기준 충족, 나이 한 가지 기준 충족, 제출서류·통장 조건 질문도 specific/fact다. possible 도입부에 '다른 요건도 본다'는 단서를 붙이는 것은 금지한다. 자료에서 별도 문의로 정한 예외는 확인 전 impossible로 바꾸지 않고 consult로 안내한다.
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

// Markdown emphasis is presentation, not part of a policy condition.
const normalized = (value: string) => value.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();

const clearlyRelatedQuestion = (question: string) => /(?:챗봇|개인정보|신청|접수|지원|사업|재단|공고|안내문|서류|자격|대상|심사|선정|지급|정산|영수증|문의|담당|복지|아동|가정|생계|주거|의료|병원|월세|소득)/
  .test(question.replace(/\s+/g, ""));

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
  // Policy entailment is checked by the mandatory independent evidence review.
  // Word overlap and unrelated exclusions in the same section are not evidence.
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
  if (error instanceof AnswerContractError) {
    const details: Record<string, string> = {
      unexpected_eligibility_evidence: "possible/impossible이 아닌 응답의 eligibilityEvidence는 반드시 빈 배열 []입니다. 특정 조건·절차의 확인된 설명은 fact이며 전체 개인 자격 판정을 하지 마세요.",
      eligibility_quote_not_in_source: "개인 자격 근거는 knowledge 원문 행의 policyEvidenceId와 userStatements의 userMessageId로만 연결하세요. 먼저 해당 예외가 원문에서 허용/불가/별도 문의 중 무엇인지 확인하세요. 별도 문의라고 명시된 경우 신청 불가가 아닙니다. 이 경우 outcome=policy_unconfirmed, eligibilityEvidence=[]로 바꾸고 본문도 '불가'가 아니라 '자료만으로 확정 불가, 별도 확인 필요'로 고치세요.",
      invalid_eligibility_reference: "eligibilityEvidence에는 실제 policyEvidenceId, userMessageId, result 세 필드만 사용하세요. ID나 인용문을 만들지 마세요. 개인 전체 자격 판정이 아니면 eligibilityEvidence=[]입니다.",
      eligibility_requires_personal_evidence: "특정 비용·절차·소득 한 가지 조건 질문은 specific/fact입니다. 전체 자격 판정은 필요한 모든 사용자 조건과 원문 근거가 있어야 합니다.",
      impossible_without_exclusion: "전체 자격 불가를 입증한 조건이 없습니다. 특정 소득·나이 한 가지 조건의 비교 질문은 questionTarget=specific, decision=fact, resolution=complete, eligibilityEvidence=[]로 답하고 해당 조건 범위만 설명하세요.",
      decision_resolution_mismatch: "허용 조합을 맞추세요: fact=complete/partial, need_info=needs_user, consult=missing_policy/conflict/action_required, possible/impossible=complete. 문의·미확인 상태에서 지원 불가나 가능을 단정하지 마세요.",
    };
    return `[서버 검증 실패: ${error.code}] ${details[error.code] || ""} 응답 계약을 다시 적용하세요. 판정값만 바꾸지 말고 질문과 원문 근거부터 재검토하여 본문도 일치시킨 완전한 JSON을 반환하세요. 모델 출력은 6개 필드 계약을 유지합니다. 위 내부 상태의 대응 outcome은 fact=information, need_info=need_user_info, 별도 문의=policy_unconfirmed입니다. 개인 전체 자격 판정이 아니면 eligibilityEvidence=[]입니다.`;
  }
  if (error instanceof SyntaxError || error instanceof Error && /^(Invalid (?:AI|Gemini) response contract|Unknown answer source|Eligibility decision without a source)$/.test(error.message))
    return "[서버 형식 검증 실패] 요청된 JSON 스키마, 실제 출처 id와 근거 종류를 확인하여 완전한 JSON 객체를 반환하세요.";
  return "";
}
