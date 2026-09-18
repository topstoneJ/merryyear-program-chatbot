import { answerSchema, AnswerContractError, type AnswerDraft } from "./answer-contract";
import type { AnswerKnowledge } from "./answer-knowledge";
import { reviewEvidence } from "./answer-review";

export const OUTCOMES = ["information", "partial_information", "need_user_info", "policy_unconfirmed", "policy_conflict", "staff_action", "all_personal_criteria_confirmed_met", "personal_disqualifier_confirmed_without_exception", "system_information", "unrelated"] as const;
type Outcome = typeof OUTCOMES[number];
const STATES: Record<Outcome, Pick<AnswerDraft, "decision" | "resolution" | "questionTarget">> = {
  information: { decision:"fact", resolution:"complete", questionTarget:"specific" },
  partial_information: { decision:"fact", resolution:"partial", questionTarget:"specific" },
  need_user_info: { decision:"need_info", resolution:"needs_user", questionTarget:"eligibility" },
  policy_unconfirmed: { decision:"consult", resolution:"missing_policy", questionTarget:"specific" },
  policy_conflict: { decision:"consult", resolution:"conflict", questionTarget:"specific" },
  staff_action: { decision:"consult", resolution:"action_required", questionTarget:"status" },
  all_personal_criteria_confirmed_met: { decision:"possible", resolution:"complete", questionTarget:"eligibility" },
  personal_disqualifier_confirmed_without_exception: { decision:"impossible", resolution:"complete", questionTarget:"eligibility" },
  system_information: { decision:"fact", resolution:"complete", questionTarget:"system" },
  unrelated: { decision:"out_of_scope", resolution:"complete", questionTarget:"unrelated" },
};

export const ANSWER_PLAN_INSTRUCTION = `[모델 출력 계약 answer-plan-v3]
앞의 규칙에 나오는 decision/resolution/questionTarget/evidenceKind/review/contactPhone/contactEvidence는 서버 내부 상태다. 이 필드들을 직접 출력하지 않는다. 모델은 categoryId, outcome, text, source, page, eligibilityEvidence의 6개 필드만 출력한다.
outcome 하나로 질문의 해결 상태를 선택한다:
information: 자료로 답할 수 있는 일반 정보, 특정 비용·조건·절차의 허용/불가, 한 가지 소득·나이 조건 충족 여부, 선정 심의 절차 안내. 개인 전체 자격이나 선정을 확정하는 것이 아니다.
partial_information: 핵심은 답할 수 있으나 부수적인 일부 정보만 미확인. 확인된 부분을 보존한다.
need_user_info: 개인 전체 신청 자격을 묻는데 결론을 바꿀 사용자 조건이 부족함. 이미 아는 조건은 보존하고 필요한 비식별 조건만 질문한다.
policy_unconfirmed: 필요한 정책이 없거나, 원문에서 해당 예외를 별도 문의/확인으로 정함. 이 경우 지원 불가가 아니다.
policy_conflict: 같은 범위의 정책이 직접 충돌하여 결론을 못 정함.
staff_action: 실제 접수·조회·승인·변경 등 담당자의 행위가 필요함.
all_personal_criteria_confirmed_met: 사용자가 개인 전체 신청 자격을 물었고 모든 필수 개인 자격·제외·예외를 원문과 사용자 진술로 확인하여 신청 요건을 충족함. 단일 조건 충족에는 금지. 선정 확정도 아님.
personal_disqualifier_confirmed_without_exception: 사용자가 개인 전체 신청 자격을 물었고 개인 전체 자격의 명시적 탈락 조건을 확인했으며 예외로 결론이 바뀌지 않음. 특정 비용·신청 방법의 금지는 information이다. 미확인 또는 별도 문의를 불가로 바꾸지 않는다.
system_information: 챗봇 자체 기능·제한·개인정보 주의만 설명.
unrelated: 선택 사업과 챗봇 이용 모두와 무관함.
먼저 text에 질문 범위의 답변을 작성하고 근거를 확인한 다음 마지막에 outcome 하나를 선택한다. 본문에서 다른 필수 자격을 더 확인해야 한다고 썼다면 all_personal_criteria_confirmed_met를 선택할 수 없다.
eligibilityEvidence는 두 개인 전체 자격 판정에서만 원문·사용자 진술을 연결한다. 각 항목은 policyEvidenceId(knowledge의 원문 행 id), userMessageId(userStatements의 id), result(met/unmet) 세 필드다. 원문이나 사용자 진술을 재작성·요약 인용하지 않고 제공된 ID만 선택한다. 서버가 실제 문구를 연결한다. AI의 이전 답변은 사용자 진술이 아니다. 나머지 outcome의 eligibilityEvidence는 []이다. 정책 근거를 새로 만들지 않는다.
source는 사업 사실에 사용한 실제 자료 ID이며 시스템 설명·무관한 답변은 빈 문자열이다. page는 해당 근거의 실제 쪽수, 모르면 0이다.
text는 질문의 결론을 먼저 설명하고 필요한 조건만 덧붙인다. 고정 판정 도입부, 출처 블록과 문의처 블록은 서버가 붙인다. 문의가 필요하면 무엇을 확인할지 설명한다. 서버가 계약·의미를 별도로 검증하므로 판정값을 맞추기 위해 정책을 바꾸지 않는다.`;

export function answerPlanSchema(categories: string[], knowledge: AnswerKnowledge, userStatements: string[] = [""]) {
  const previous = answerSchema(categories, knowledge).properties;
  const properties = { text:previous.text, source:previous.source, page:previous.page, categoryId:previous.categoryId,
    eligibilityEvidence:{type:"array",items:{type:"object",additionalProperties:false,properties:{
      policyEvidenceId:{type:"string",enum:["",...reviewEvidence(knowledge).map(e=>e.id)]},
      userMessageId:{type:"string",enum:userStatements.map((_,i)=>`u${i}`)},
      result:{type:"string",enum:["met","unmet"]},
    },required:["policyEvidenceId","userMessageId","result"]}}, outcome:{type:"string", enum:OUTCOMES} };
  return {type:"object", additionalProperties:false, properties, required:Object.keys(properties)};
}

export function compileAnswerPlan(raw: string, knowledge?:AnswerKnowledge, userStatements:string[]=[]): AnswerDraft {
  const value = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, ""));
  const keys = ["categoryId", "outcome", "text", "source", "page", "eligibilityEvidence"];
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length
    || keys.some(key => !Object.hasOwn(value, key)) || !OUTCOMES.includes(value.outcome)
    || !Array.isArray(value.eligibilityEvidence)) throw new AnswerContractError("invalid_answer_plan");
  const outcome = value.outcome as Outcome;
  const personal = outcome === "all_personal_criteria_confirmed_met" || outcome === "personal_disqualifier_confirmed_without_exception";
  const references=new Map(knowledge?reviewEvidence(knowledge).map(e=>[e.id,e]):[]);
  if(value.eligibilityEvidence.length>80)throw new AnswerContractError("invalid_answer_plan");
  const eligibilityEvidence:AnswerDraft["eligibilityEvidence"]=personal?value.eligibilityEvidence.map((item:Record<string,unknown>)=>{
    if(!item||typeof item!=="object"||Object.keys(item).length!==3||!["policyEvidenceId","userMessageId","result"].every(k=>Object.hasOwn(item,k))
      ||typeof item.policyEvidenceId!=="string"||typeof item.userMessageId!=="string"||!/^u(?:0|[1-9]\d*)$/.test(item.userMessageId)||!["met","unmet"].includes(String(item.result)))throw new AnswerContractError("invalid_eligibility_reference");
    const ref=references.get(item.policyEvidenceId),statement=userStatements[Number(item.userMessageId.slice(1))];
    if(!ref||!statement)throw new AnswerContractError("invalid_eligibility_reference");
    return {sourceId:ref.sourceId,quote:ref.text,userStatement:statement,result:item.result as "met"|"unmet"};
  }):[];
  return { categoryId:value.categoryId, text:value.text, source:value.source, page:value.page, ...STATES[outcome],
    evidenceKind:outcome === "system_information" ? "system" : value.source ? "document" : "none",
    // Non-verdict evidence is unused metadata, never a basis for eligibility.
    eligibilityEvidence,
    review:["partial_information", "policy_unconfirmed", "policy_conflict", "staff_action"].includes(outcome),
    contactPhone:"", contactEvidence:"",
  };
}
