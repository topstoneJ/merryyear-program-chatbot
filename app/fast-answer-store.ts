import type { Answer } from "./answer-response";
import { chatAnswerCacheKey } from "@/db/knowledge";
import { loadCategories } from "@/db/consultation-categories";
import type { DatabaseBinding } from "@/db/runtime";

type StoredFastAnswer = { answer_json: string; status: string; context_version: string };

export async function fastAnswerContextVersion(businessId: string, DB: DatabaseBinding) {
  const [business, sources, settings, categories] = await Promise.all([
    DB.prepare("SELECT id, name, notice_url, contact_department, contact_email, contact_phone, contact_hours, updated_at FROM businesses WHERE id = ?").bind(businessId).first(),
    DB.prepare("SELECT id, business_id, title, content, status, enabled, shared_all_businesses, updated_at FROM knowledge_sources WHERE business_id = ? OR shared_all_businesses = 1 ORDER BY id").bind(businessId).all(),
    DB.prepare("SELECT answer_settings_json, updated_at FROM site_settings WHERE id = 'default'").first(),
    loadCategories(DB),
  ]);
  return chatAnswerCacheKey(["fast-answer-context-v2", business, sources.results, settings, categories,
    process.env.GEMINI_MODEL || "gemini-3.8-flash", new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)]);
}

export async function readReadyFastAnswer(DB: DatabaseBinding, businessId: string, intent: string): Promise<Answer | null> {
  const row = await DB.prepare("SELECT answer_json, status, context_version FROM fast_answers WHERE business_id = ? AND intent = ?")
    .bind(businessId, intent).first<StoredFastAnswer>();
  if (!row || row.status !== "ready" || !row.answer_json || row.context_version !== await fastAnswerContextVersion(businessId, DB)) return null;
  try {
    const answer = JSON.parse(row.answer_json) as Partial<Answer>;
    if (typeof answer.text !== "string" || !answer.text.trim() || typeof answer.decision !== "string"
      || typeof answer.source !== "string" || typeof answer.review !== "boolean") return null;
    return answer as Answer;
  } catch { return null; }
}
