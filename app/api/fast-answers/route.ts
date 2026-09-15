import { requireAdminApi } from "@/app/admin-session";
import { createChatTiming } from "@/app/chat-timing";
import { FAST_ANSWER_INTENTS, isFastAnswerIntent } from "@/app/fast-answer-intents";
import { askGemini } from "@/app/api/chat/route";
import { chatAnswerCacheKey, ensureKnowledgeSchema, getBusiness, loadKnowledgeContext } from "@/db/knowledge";
import { loadCategories } from "@/db/consultation-categories";

type StoredFastAnswer = { business_id: string; intent: string; answer_json: string; status: string; context_version: string; updated_at: number };

async function contextVersion(businessId: string) {
  const DB = await ensureKnowledgeSchema();
  const [business, sources, settings, categories] = await Promise.all([
    DB.prepare("SELECT id, name, notice_url, contact_department, contact_email, contact_phone, contact_hours, updated_at FROM businesses WHERE id = ?").bind(businessId).first(),
    DB.prepare("SELECT id, business_id, title, content, status, enabled, shared_all_businesses, updated_at FROM knowledge_sources WHERE business_id = ? OR shared_all_businesses = 1 ORDER BY id").bind(businessId).all(),
    DB.prepare("SELECT answer_settings_json, updated_at FROM site_settings WHERE id = 'default'").first(),
    loadCategories(DB),
  ]);
  return chatAnswerCacheKey(["fast-answer-context-v1", business, sources.results, settings, categories,
    process.env.GEMINI_MODEL || "gemini-3.8-flash", new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)]);
}

function parsedAnswer(value: string) { try { return JSON.parse(value); } catch { return null; } }
function signalFor(items: Array<{ signal: string }>) {
  const green = items.filter(item => item.signal === "green").length;
  return green === items.length ? "green" : green > 0 || items.some(item => item.signal === "orange") ? "orange" : "red";
}

export async function GET(request: Request) {
  const businessId = new URL(request.url).searchParams.get("businessId") || "";
  const denied = await requireAdminApi({ businessId }); if (denied) return denied;
  const DB = await ensureKnowledgeSchema(), version = await contextVersion(businessId);
  const rows = (await DB.prepare("SELECT * FROM fast_answers WHERE business_id = ?").bind(businessId).all<StoredFastAnswer>()).results;
  const byIntent = new Map(rows.map(row => [row.intent, row]));
  const items = FAST_ANSWER_INTENTS.map(intent => {
    const row = byIntent.get(intent.id), current = row?.context_version === version;
    const signal = !row || !current ? "red" : row.status === "ready" ? "green" : row.status === "review" ? "orange" : "red";
    const answer = row ? parsedAnswer(row.answer_json) : null;
    return { ...intent, signal, status: !row ? "준비 필요" : !current ? "자료 변경됨" : signal === "green" ? "사용 중" : signal === "orange" ? "확인 필요" : "생성 실패",
      answer: answer?.text || "", source: answer?.source || "", updatedAt: row?.updated_at || null };
  });
  return Response.json({ signal: signalFor(items), items }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { businessId?: string; intent?: unknown; action?: string; text?: string };
  const businessId = typeof body.businessId === "string" ? body.businessId : "";
  const denied = await requireAdminApi({ businessId }); if (denied) return denied;
  if (!isFastAnswerIntent(body.intent) || !["regenerate", "save"].includes(body.action || "")) return Response.json({ error: "올바른 빠른답변 요청이 아닙니다." }, { status: 400 });
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (body.action === "save" && (!text || text.length > 12000)) return Response.json({ error: "수정 답변을 확인해 주세요." }, { status: 400 });
  const DB = await ensureKnowledgeSchema(), business = await getBusiness(businessId);
  if (!business) return Response.json({ error: "사업을 찾을 수 없습니다." }, { status: 404 });
  const intent = FAST_ANSWER_INTENTS.find(item => item.id === body.intent)!;
  const version = await contextVersion(businessId), previous = await DB.prepare("SELECT answer_json FROM fast_answers WHERE business_id = ? AND intent = ?").bind(businessId, intent.id).first<{ answer_json: string }>();
  try {
    const knowledge = await loadKnowledgeContext(businessId), timing = createChatTiming();
    const answer = await askGemini(businessId, business.name, intent.question, knowledge, [], timing, { forceRefresh: true, candidateText: body.action === "save" ? text : undefined });
    timing.finish(200);
    const status = answer.decision === "fact" && !answer.review && Boolean(answer.source) ? "ready" : "review";
    await DB.prepare(`INSERT INTO fast_answers (business_id, intent, answer_json, status, context_version, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(business_id, intent) DO UPDATE SET answer_json = excluded.answer_json, status = excluded.status, context_version = excluded.context_version, updated_at = excluded.updated_at`)
      .bind(businessId, intent.id, JSON.stringify(answer), status, version, Date.now()).run();
    return Response.json({ item: { ...intent, signal: status === "ready" ? "green" : "orange", status: status === "ready" ? "사용 중" : "확인 필요", answer: answer.text, source: answer.source, updatedAt: Date.now() } });
  } catch {
    await DB.prepare(`INSERT INTO fast_answers (business_id, intent, answer_json, status, context_version, updated_at) VALUES (?, ?, ?, 'error', ?, ?)
      ON CONFLICT(business_id, intent) DO UPDATE SET status = 'error', context_version = excluded.context_version, updated_at = excluded.updated_at`)
      .bind(businessId, intent.id, previous?.answer_json || "", version, Date.now()).run();
    return Response.json({ error: "예상 답변을 만들지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }
}
