export type ConflictPart = { id: string; title: string; text: string; pages: number[] };
export type ConflictDocument = { id: string; title: string; enabled: boolean; parts: ConflictPart[] };
export type ConflictEvidence = { sourceId: string; partId: string; quote: string };
export type KnowledgeConflict = { left: ConflictEvidence; right: ConflictEvidence; reason: string };
export type ConflictReport = { checkedAt: number; documents: ConflictDocument[]; conflicts: KnowledgeConflict[]; unavailableIds: string[] };

export function documentParts(content: string): ConflictPart[] {
  try {
    const data = JSON.parse(content);
    if (data.format === "structured-markdown" && Array.isArray(data.sections)) {
      return data.sections.map((s: { title?: string; markdown?: string; pages?: number[] }, i: number) => ({
        id: String(i), title: s.title || "안내", text: s.markdown || "", pages: s.pages || [],
      })).filter((s: ConflictPart) => s.text.trim());
    }
  } catch { /* Plain text and legacy section format remain readable. */ }
  return content.trim() ? [{ id: "0", title: "본문", text: content, pages: [] }] : [];
}

export async function snapshotKey(rows: unknown) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(rows)));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function validateConflicts(raw: unknown, documents: ConflictDocument[]): KnowledgeConflict[] {
  const data = raw as { checkedSourceIds?: unknown; conflicts?: unknown };
  if (!Array.isArray(data?.checkedSourceIds) || !Array.isArray(data.conflicts)) throw new Error("검사 결과가 불완전합니다.");
  const checked = new Set(data.checkedSourceIds);
  if (checked.size !== documents.length || documents.some((d) => !checked.has(d.id))) throw new Error("일부 자료의 검사가 완료되지 않았습니다.");
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
  const evidence = (value: unknown): ConflictEvidence => {
    const e = value as ConflictEvidence;
    const part = documents.find((d) => d.id === e?.sourceId)?.parts.find((p) => p.id === e?.partId);
    if (!part || typeof e.quote !== "string" || !e.quote.trim() || !normalize(part.text).includes(normalize(e.quote))) {
      throw new Error("충돌 근거를 원문에서 확인하지 못했습니다. 다시 검사해 주세요.");
    }
    return { sourceId: e.sourceId, partId: e.partId, quote: e.quote.trim() };
  };
  const seen = new Set<string>();
  return data.conflicts.flatMap((value) => {
    const c = value as KnowledgeConflict;
    const left = evidence(c.left), right = evidence(c.right);
    if (left.sourceId === right.sourceId || typeof c.reason !== "string" || !c.reason.trim()) throw new Error("충돌 비교 결과가 올바르지 않습니다.");
    const key = [JSON.stringify(left), JSON.stringify(right)].sort().join("|");
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ left, right, reason: c.reason.trim() }];
  });
}
