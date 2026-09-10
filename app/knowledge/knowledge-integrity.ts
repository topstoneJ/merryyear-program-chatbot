export const MAX_KNOWLEDGE_CONTENT_LENGTH = 500_000;
export const MAX_ANALYSIS_INPUT_LENGTH = 120_000;

const TRUNCATION_MARKERS = ["[truncated for model]", "… [truncated for model]"];

export class KnowledgeIntegrityError extends Error {}

export function containsTruncationMarker(value: string) {
  return TRUNCATION_MARKERS.some((marker) => value.includes(marker));
}

export function validateKnowledgeContent(value: string, limit = MAX_KNOWLEDGE_CONTENT_LENGTH) {
  if (!value.trim()) throw new KnowledgeIntegrityError("데이터 내용을 입력해 주세요.");
  if (value.length > limit) throw new KnowledgeIntegrityError(`데이터가 너무 깁니다. ${limit.toLocaleString("ko-KR")}자 이하로 등록해 주세요.`);
  if (containsTruncationMarker(value)) throw new KnowledgeIntegrityError("내용이 잘린 데이터는 저장할 수 없습니다. 원문을 다시 확인해 주세요.");

  if (!value.includes('"structured-markdown"')) return value;
  let parsed: unknown;
  try { parsed = JSON.parse(value); }
  catch { throw new KnowledgeIntegrityError("구조화된 데이터 형식이 손상되었습니다. 원문을 다시 확인해 주세요."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return value;
  const structured = parsed as { format?: unknown; sections?: unknown };
  if (structured.format !== "structured-markdown") return value;
  if (!Array.isArray(structured.sections) || !structured.sections.length) {
    throw new KnowledgeIntegrityError("구조화된 데이터에 안내 항목이 없습니다. 원문을 다시 확인해 주세요.");
  }
  for (const section of structured.sections) {
    if (!section || typeof section !== "object" || Array.isArray(section)) throw new KnowledgeIntegrityError("안내 항목 형식이 손상되었습니다.");
    const item = section as { key?: unknown; title?: unknown; markdown?: unknown; pages?: unknown };
    if (typeof item.key !== "string" || typeof item.title !== "string" || typeof item.markdown !== "string" || !Array.isArray(item.pages)) {
      throw new KnowledgeIntegrityError("안내 항목 형식이 손상되었습니다.");
    }
  }
  return value;
}

export function validateAnalysisInput(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new KnowledgeIntegrityError(`${label}에서 분석할 내용을 찾지 못했습니다.`);
  if (trimmed.length > MAX_ANALYSIS_INPUT_LENGTH) {
    throw new KnowledgeIntegrityError(`${label}에서 추출한 내용이 너무 깁니다. ${MAX_ANALYSIS_INPUT_LENGTH.toLocaleString("ko-KR")}자 이하의 자료로 나누어 등록해 주세요.`);
  }
  if (containsTruncationMarker(trimmed)) {
    throw new KnowledgeIntegrityError("내용이 잘린 자료는 저장하거나 분석할 수 없습니다. 원문을 다시 등록해 주세요.");
  }
  return trimmed;
}
