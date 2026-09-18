import { requireAdminApi } from "@/app/admin-session";
import { configuredGeminiApiKeyStatus, ensureKnowledgeSchema, encryptConfiguredGeminiApiKey, GEMINI_API_KEY_DISABLED, getConfiguredGeminiApiKey } from "@/db/knowledge";
import { koreanDayBounds, selectedRangeBounds, modelRates, modelPricingInfo } from "@/db/api-pricing";
import { aiProviderFromKey, configuredAiModel } from "@/db/ai-provider";

export async function GET(request: Request) {
  const denied = await requireAdminApi({ settings: true }); if (denied) return denied;
  try {
    const url = new URL(request.url);
    const day = selectedRangeBounds(url.searchParams.get("from") || null, url.searchParams.get("to") || null);
    if (!day) return Response.json({ error: "조회 기간은 오늘까지 최대 1년으로 선택해 주세요." }, { status: 400 });
    const DB = await ensureKnowledgeSchema();
    const totals = await DB.prepare(`SELECT COUNT(*) AS requests, SUM(CASE WHEN status < 200 OR status >= 300 THEN 1 ELSE 0 END) AS failed,
      CAST(COALESCE(SUM(input_tokens), 0) AS BIGINT) AS "inputTokens", CAST(COALESCE(SUM(output_tokens), 0) AS BIGINT) AS "outputTokens",
      CAST(COALESCE(SUM(thought_tokens), 0) AS BIGINT) AS "thoughtTokens", CAST(COALESCE(SUM(cached_tokens), 0) AS BIGINT) AS "cachedTokens",
      COALESCE(SUM(estimated_usd), 0) AS "estimatedUsd", SUM(CASE WHEN estimated_usd IS NULL THEN 1 ELSE 0 END) AS unpriced
      FROM api_usage WHERE created_at >= ? AND created_at < ?`).bind(day.start, day.end).first();
    const breakdown = await DB.prepare(`SELECT purpose, COUNT(*) AS requests, COALESCE(SUM(estimated_usd), 0) AS "estimatedUsd", SUM(CASE WHEN estimated_usd IS NULL THEN 1 ELSE 0 END) AS unpriced FROM api_usage WHERE created_at >= ? AND created_at < ? GROUP BY purpose ORDER BY requests DESC`).bind(day.start, day.end).all();
    const started = await DB.prepare(`SELECT MIN(created_at) AS "firstAt" FROM api_usage`).first<{ firstAt: number | null }>();
    const models = await DB.prepare(`SELECT model, COUNT(*) AS requests,
      CAST(COALESCE(SUM(input_tokens), 0) AS BIGINT) AS "inputTokens", CAST(COALESCE(SUM(output_tokens), 0) AS BIGINT) AS "outputTokens",
      CAST(COALESCE(SUM(thought_tokens), 0) AS BIGINT) AS "thoughtTokens", COALESCE(SUM(estimated_usd), 0) AS "estimatedUsd",
      SUM(CASE WHEN input_tokens IS NULL OR output_tokens IS NULL THEN 1 ELSE 0 END) AS unmeasured,
      SUM(CASE WHEN estimated_usd IS NULL THEN 1 ELSE 0 END) AS unpriced
      FROM api_usage WHERE created_at >= ? AND created_at < ? GROUP BY model ORDER BY requests DESC`).bind(day.start, day.end).all<{model: string; requests: number; inputTokens: number; outputTokens: number; thoughtTokens: number; estimatedUsd: number; unmeasured: number; unpriced: number}>();
    const settings = await DB.prepare("SELECT gemini_api_key_encrypted FROM site_settings WHERE id = 'default'").first<{ gemini_api_key_encrypted: string | null }>();
    const apiKey = await getConfiguredGeminiApiKey(settings);
    const model = configuredAiModel(apiKey);
    return Response.json({ date: day.label, dateKey: day.key, currentDate: koreanDayBounds().key, model, totals, breakdown: breakdown.results, trackingStartedAt: started?.firstAt || null,
      models: models.results.map(item => ({ ...item, ...modelPricingInfo(item.model) })),
      ...configuredGeminiApiKeyStatus(settings?.gemini_api_key_encrypted), apiProvider: apiKey ? aiProviderFromKey(apiKey) : null, rates: modelRates(model), ...modelPricingInfo(model) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "API 사용량을 불러오지 못했습니다." }, { status: 500 }); }
}

export async function DELETE() {
  const denied = await requireAdminApi({ settings: true }); if (denied) return denied;
  try {
    const DB = await ensureKnowledgeSchema();
    await DB.prepare("UPDATE site_settings SET gemini_api_key_encrypted = ?, updated_at = ? WHERE id = 'default'").bind(GEMINI_API_KEY_DISABLED, Date.now()).run();
    return Response.json(configuredGeminiApiKeyStatus(GEMINI_API_KEY_DISABLED));
  } catch { return Response.json({ error: "API 키를 삭제하지 못했습니다." }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  const denied = await requireAdminApi({ settings: true }); if (denied) return denied;
  try {
    const body = await request.json() as { apiKey?: unknown };
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    if (!apiKey || apiKey.length > 300 || /\s/.test(apiKey)) return Response.json({ error: "올바른 API 키를 입력해 주세요." }, { status: 400 });
    const DB = await ensureKnowledgeSchema();
    const encrypted = await encryptConfiguredGeminiApiKey(apiKey);
    await DB.prepare("UPDATE site_settings SET gemini_api_key_encrypted = ?, updated_at = ? WHERE id = 'default'").bind(encrypted, Date.now()).run();
    return Response.json({ apiKeyConfigured: true });
  } catch { return Response.json({ error: "API 키를 저장하지 못했습니다." }, { status: 500 }); }
}
