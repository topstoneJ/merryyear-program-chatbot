import { trackedGeminiFetch } from "@/db/api-usage";
import { accountBusinessIds, getAdminSession } from "@/app/admin-session";
import { ensureKnowledgeSchema, getConfiguredGeminiApiKey } from "@/db/knowledge";
import { loadCategories } from "@/db/consultation-categories";
import { CATEGORY_GUIDANCE, categoryRevision } from "@/db/semantic-category";

export async function POST() {
  const account = await getAdminSession();
  if (!account) return Response.json({ error: "관리자 로그인이 필요합니다." }, { status: 401 });
  if (!account.is_super_admin && account.can_view_consultations === 0) return Response.json({ error: "상담내역 조회 권한이 없습니다." }, { status: 403 });
  try {
    const DB = await ensureKnowledgeSchema();
    const categories = (await loadCategories(DB)).filter(c => !c.replacement_id);
    const revision = categoryRevision(categories);
    const ids = accountBusinessIds(account);
    const scope = account.is_super_admin ? "1 = 1" : `business_id IN (${ids.map(() => "?").join(",") || "''"})`;
    const bindings = account.is_super_admin ? [] : ids;
    const rows = (await DB.prepare(`SELECT id, question, answer FROM consultations WHERE ${scope} AND category_manual = 0 AND category_revision != ? ORDER BY created_at DESC LIMIT 25`).bind(...bindings, revision).all<{ id: string; question: string; answer: string }>()).results;
    if (!rows.length) return Response.json({ updated: 0, more: false });
    const apiKey = await getConfiguredGeminiApiKey();
    if (!apiKey) throw new Error("Missing API key");
    const response = await trackedGeminiFetch("classification", {
      method: "POST", signal: AbortSignal.timeout(60000),
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey, "Api-Revision": "2026-05-20" },
      body: JSON.stringify({ model: process.env.GEMINI_MODEL || "gemini-3.7-flash", store: false,
        system_instruction: CATEGORY_GUIDANCE,
        input: JSON.stringify({ categories: categories.map(c => ({ id: c.id, name: c.name })), consultations: rows.map(r => ({ ...r, answer: r.answer.slice(0, 6000) })) }),
        response_format: { type: "text", mime_type: "application/json", schema: { type: "object", properties: { classifications: { type: "array", items: { type: "object", properties: { id: { type: "string" }, categoryId: { type: "string", enum: categories.map(c => c.id) } }, required: ["id", "categoryId"] } } }, required: ["classifications"] } },
      }),
    });
    const payload = await response.json() as { steps?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }> };
    if (!response.ok) throw new Error("Classification failed");
    const text = payload.steps?.filter(s => s.type === "model_output").flatMap(s => s.content || []).filter(c => c.type === "text").map(c => c.text || "").join("") || "";
    const parsed = JSON.parse(text) as { classifications: Array<{ id: string; categoryId: string }> };
    const byId = new Map(parsed.classifications.map(c => [c.id, c.categoryId]));
    if (rows.some(r => !categories.some(c => c.id === byId.get(r.id)))) throw new Error("Incomplete classification");
    // A concurrent manual edit or category deletion wins over this background result.
    const results = await DB.batch(rows.map(r => DB.prepare(`UPDATE consultations SET category = ?, category_revision = ? WHERE id = ? AND category_manual = 0 AND EXISTS (SELECT 1 FROM consultation_categories WHERE id = ? AND replacement_id IS NULL)`)
      .bind(byId.get(r.id)!, revision, r.id, byId.get(r.id)!)));
    const updated = results.reduce((sum, r) => sum + (r.meta.changes || 0), 0);
    return Response.json({ updated, more: rows.length === 25 && updated > 0 });
  } catch { return Response.json({ error: "자동 재분류를 완료하지 못했습니다. 다시 시도해 주세요." }, { status: 502 }); }
}
