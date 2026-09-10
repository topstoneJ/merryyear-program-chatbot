import { requireAdminApi } from "@/app/admin-session";
import { ensureKnowledgeSchema } from "@/db/knowledge";
import { COUNT_SOURCE_KIND_SQL } from "@/db/source-limits";
import { SOURCE_LIMITS, sourceLimitMessage } from "@/app/knowledge/source-limits";

async function context(id: string) {
  const denied = await requireAdminApi({ consultations: true }); if (denied) return { error: denied };
  const DB = await ensureKnowledgeSchema();
  const consultation = await DB.prepare("SELECT business_id, question FROM consultations WHERE id = ?").bind(id).first<{ business_id: string; question: string }>();
  if (!consultation) return { error: Response.json({ error: "상담내역을 찾을 수 없습니다." }, { status: 404 }) };
  const forbidden = await requireAdminApi({ businessId: consultation.business_id }); if (forbidden) return { error: forbidden };
  return { DB, consultation, sourceId: `consultation-supplement:${id}` };
}

export async function GET(request: Request) {
  try {
    const ctx = await context(new URL(request.url).searchParams.get("id") || "");
    if (ctx.error) return ctx.error;
    const source = await ctx.DB!.prepare("SELECT id, content, enabled FROM knowledge_sources WHERE id = ? AND business_id = ?")
      .bind(ctx.sourceId, ctx.consultation!.business_id).first<{ id: string; content: string; enabled: number }>();
    return Response.json({ content: source?.content || "", sourceId: source?.id || null, businessId: ctx.consultation!.business_id, enabled: source ? Boolean(source.enabled) : true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "답변 보완 내용을 불러오지 못했습니다." }, { status: 500 }); }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    if (typeof body.id !== "string" || typeof body.content !== "string" || !body.content.trim() || body.content.length > 20000) return Response.json({ error: "답변 보완 내용을 1~20,000자로 입력해 주세요." }, { status: 400 });
    const ctx = await context(body.id); if (ctx.error) return ctx.error;
    const now = Date.now();
    // Both editors read/write the same text source; no duplicate copy to synchronize.
    const result = await ctx.DB!.prepare(`INSERT INTO knowledge_sources (id, business_id, type, title, content, status, enabled, created_at, updated_at)
      SELECT ?, business_id, 'text', ?, ?, 'ready', 1, ?, ? FROM consultations WHERE id = ? AND business_id = ?
      AND (EXISTS(SELECT 1 FROM knowledge_sources WHERE id = ?) OR (${COUNT_SOURCE_KIND_SQL}) < ?)
      ON CONFLICT(id) DO UPDATE SET content = excluded.content, status = 'ready', updated_at = excluded.updated_at`)
      .bind(ctx.sourceId, `[답변 보완] ${ctx.consultation!.question}`.slice(0, 120), body.content.trim(), now, now, body.id, ctx.consultation!.business_id, ctx.sourceId, ctx.consultation!.business_id, "text", SOURCE_LIMITS.text).run();
    if (!result.meta.changes) return Response.json({ error: sourceLimitMessage("text") }, { status: 409 });
    return Response.json({ ok: true, sourceId: ctx.sourceId, content: body.content.trim() });
  } catch { return Response.json({ error: "답변 보완 내용을 저장하지 못했습니다." }, { status: 500 }); }
}
