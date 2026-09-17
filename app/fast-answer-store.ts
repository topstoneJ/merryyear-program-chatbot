import type { Answer } from "./answer-response";
import { chatAnswerCacheKey, getConfiguredGeminiApiKey } from "@/db/knowledge";
import { loadCategories } from "@/db/consultation-categories";
import type { DatabaseBinding } from "@/db/runtime";
import { aiProviderFromKey, configuredAiModel } from "@/db/ai-provider";
import { buildCoreSystemInstruction } from "./answer-rules";
import { buildAnswerInstruction, readAnswerSettings } from "./answer-settings";
import { ANSWER_CONTRACT_VERSION } from "./answer-contract";
import { CATEGORY_GUIDANCE } from "@/db/semantic-category";

type StoredFastAnswer = { answer_json: string; status: string; context_version: string };

export async function fastAnswerContextVersion(businessId: string, DB: DatabaseBinding) {
  const [business, sources, settings, categories] = await Promise.all([
    DB.prepare("SELECT id, name, notice_url, contact_department, contact_email, contact_phone, contact_hours, updated_at FROM businesses WHERE id = ?").bind(businessId).first(),
    DB.prepare("SELECT id, business_id, title, content, status, enabled, shared_all_businesses, updated_at FROM knowledge_sources WHERE business_id = ? OR shared_all_businesses = 1 ORDER BY id").bind(businessId).all(),
    DB.prepare("SELECT answer_settings_json, gemini_api_key_encrypted, updated_at FROM site_settings WHERE id = 'default'").first<{ answer_settings_json: string; gemini_api_key_encrypted: string | null; updated_at: number }>(),
    loadCategories(DB),
  ]);
  const apiKey = await getConfiguredGeminiApiKey(settings);
  const prompt = buildCoreSystemInstruction(categories.filter(category => !category.replacement_id), buildAnswerInstruction(readAnswerSettings(settings?.answer_settings_json)), CATEGORY_GUIDANCE);
  return chatAnswerCacheKey(["fast-answer-context-v3", ANSWER_CONTRACT_VERSION, prompt, business, sources.results,
    { answerSettings: settings?.answer_settings_json, updatedAt: settings?.updated_at }, categories,
    apiKey ? aiProviderFromKey(apiKey) : null, configuredAiModel(apiKey),
    new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)]);
}

export async function readReadyFastAnswer(DB: DatabaseBinding, businessId: string, intent: string): Promise<Answer | null> {
  const row = await DB.prepare("SELECT answer_json, status, context_version FROM fast_answers WHERE business_id = ? AND intent = ?")
    .bind(businessId, intent).first<StoredFastAnswer>();
  if (!row || row.status !== "ready" || !row.answer_json || row.context_version !== await fastAnswerContextVersion(businessId, DB)) return null;
  try {
    const answer = JSON.parse(row.answer_json) as Partial<Answer>;
    if (typeof answer.text !== "string" || !answer.text.trim() || answer.decision !== "fact"
      || typeof answer.source !== "string" || !answer.source.trim() || answer.review !== false
      || !Number.isInteger(answer.page) || (answer.page as number) < 0 || typeof answer.categoryId !== "string"
      || !Number.isFinite(answer.confidence)
      || /^(?:불가능|가능)(?:합니다|해요)[.!。]?(?:\s|$)/.test(answer.text.trim())) return null;
    return answer as Answer;
  } catch { return null; }
}
