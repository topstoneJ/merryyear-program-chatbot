import type { ConflictReport } from "../db/conflict-check";

export type KnowledgeInputRow = {
  id: string; business_id: string; type: string; title: string;
  content: string; enabled: number; status: string; updated_at: number;
  source_url?: string | null; file_name?: string | null;
  shared_all_businesses?: number;
};
export type AnswerKnowledgeSource = {
  id: string; businessId: string; title: string; type: string;
  updatedAt: number; url: string | null;
  sharedAllBusinesses?: boolean;
  parts: Array<{ id: string; title: string; text: string; pages: number[] }>;
};
export type AnswerKnowledge = {
  sources: AnswerKnowledgeSource[];
  conflicts: Array<{ reason: string; left: { sourceId: string; partId: string; quote: string }; right: { sourceId: string; partId: string; quote: string } }>;
  withheldParts: number;
};
const normalized = (text: string) => text.replace(/\s+/g, " ").trim();

export function buildAnswerKnowledge(rows: KnowledgeInputRow[], businessId: string, report?: ConflictReport | null): AnswerKnowledge {
  let withheldParts = 0;
  const sources = rows.filter(row => (row.business_id === businessId || row.shared_all_businesses === 1) && row.enabled && row.status !== "error")
    .sort((a, b) => b.updated_at - a.updated_at || a.id.localeCompare(b.id))
    .flatMap(row => {
      let parts: AnswerKnowledgeSource["parts"] = [];
      let structured = false;
      try {
        const value = JSON.parse(row.content);
        if (value.format === "structured-markdown" && Array.isArray(value.sections)) {
          structured = true;
          parts = value.sections.flatMap((section: { title?: string; markdown?: string; pages?: number[]; status?: string }, index: number) => {
            if (section.status === "review_required") { withheldParts++; return []; }
            if (typeof section.markdown !== "string" || !section.markdown.trim()) return [];
            const pages = row.type === "pdf" && Array.isArray(section.pages)
              ? [...new Set(section.pages.filter(page => Number.isInteger(page) && page > 0))] : [];
            return [{ id: String(index), title: typeof section.title === "string" ? section.title : "", text: section.markdown.trim(), pages }];
          });
        }
      } catch { /* Previously registered plain text remains usable. */ }
      if (!structured && row.content.trim()) {
        const pages = row.type === "pdf"
          ? [...new Set([...row.content.matchAll(/(?:\[|출처 페이지:\s*)(\d+)\s*(?:쪽\]|(?=,|\s|$))/g)].map(match => Number(match[1])))]
          : [];
        parts = [{ id: "0", title: "본문", text: row.content.trim(), pages }];
      }
      return parts.length ? [{ id: row.id, businessId: row.business_id, sharedAllBusinesses: row.shared_all_businesses === 1, title: row.title, type: row.type,
        updatedAt: row.updated_at, url: row.source_url || null, parts }] : [];
    });
  const conflicts = (report?.conflicts || []).filter(conflict => {
    const left = sources.find(source => source.id === conflict.left.sourceId);
    const right = sources.find(source => source.id === conflict.right.sourceId);
    return left && right && left.updatedAt === right.updatedAt && [conflict.left, conflict.right].every(side => {
      const part = sources.find(source => source.id === side.sourceId)?.parts.find(part => part.id === side.partId);
      return part && side.quote.trim() && normalized(part.text).includes(normalized(side.quote));
    });
  });
  const context = { sources, conflicts, withheldParts };
  if (JSON.stringify(context).length > 250_000) throw new Error("Knowledge context exceeds safe comparison limit");
  return context;
}

export function sourceText(source: AnswerKnowledgeSource) {
  return source.parts.map(part => [part.title, part.text].filter(Boolean).join("\n")).join("\n\n");
}
