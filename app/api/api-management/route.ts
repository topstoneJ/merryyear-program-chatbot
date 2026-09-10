import { requireAdminApi } from "@/app/admin-session";
import { ensureKnowledgeSchema, encryptConfiguredGeminiApiKey } from "@/db/knowledge";
import { koreanDayBounds, selectedRangeBounds, modelRates, modelPricingInfo } from "@/db/api-pricing";

export async function GET(request: Request) {
  const denied = await requireAdminApi({ settings: true }); if (denied) return denied;
  try {
    const url = new URL(request.url);
    const day = selectedRangeBounds(url.searchParams.get("from") || null, url.searchParams.get("to") || null);
    if (!day) return Response.json({ error: "조회 기간은 오늘까지 최대 1년으로 선택해 주세요." }, { status: 400 });
    const DB = await ensureKnowledgeSchema();
    const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
    const totals = await DB.prepare(`SELECT COUNT(*) AS requests, SUM(CASE WHEN status < 200 OR status >= 300 THEN 1 ELSE 0 END) AS failed,
      COALESCE(SUM(input_tokens), 0) AS inputTokens, COALESCE(SUM(output_tokens), 0) AS outputTokens,
      COALESCE(SUM(thought_tokens), 0) AS thoughtTokens, COALESCE(SUM(cached_tokens), 0) AS cachedTokens,
      COALESCE(SUM(estimated_usd), 0) AS estimatedUsd, SUM(CASE WHEN estimated_usd IS NULL THEN 1 ELSE 0 END) AS unpriced
      FROM api_usage WHERE created_at >= ? AND created_at < ?`).bind(day.start, day.end).first();
    const breakdown = await DB.prepare("SELECT purpose, COUNT(*) AS requests, COALESCE(SUM(estimated_usd), 0) AS estimatedUsd, SUM(CASE WHEN estimated_usd IS NULL THEN 1 ELSE 0 END) AS unpriced FROM api_usage WHERE created_at >= ? AND created_at < ? GROUP BY purpose ORDER BY requests DESC").bind(day.start, day.end).all();
    const started = await DB.prepare("SELECT MIN(created_at) AS firstAt FROM api_usage").first<{ firstAt: number | null }>();
    const models = await DB.prepare("SELECT model, COUNT(*) AS requests, COALESCE(SUM(estimated_usd), 0) AS estimatedUsd, SUM(CASE WHEN estimated_usd IS NULL THEN 1 ELSE 0 END) AS unpriced FROM api_usage WHERE created_at >= ? AND created_at < ? GROUP BY model ORDER BY requests DESC").bind(day.start, day.end).all<{model: string; requests: number; estimatedUsd: number; unpriced: number}>();
    const settings = await DB.prepare("SELECT gemini_api_key_encrypted FROM site_settings WHERE id = 'default'").first<{ gemini_api_key_encrypted: string | null }>();
    return Response.json({ date: day.label, dateKey: day.key, currentDate: koreanDayBounds().key, model, totals, breakdown: breakdown.results, trackingStartedAt: started?.firstAt || null,
      models: models.results.map(item => ({ ...item, ...modelPricingInfo(item.model) })),
      apiKeyConfigured: Boolean(settings?.gemini_api_key_encrypted || process.env.GEMINI_API_KEY), storedApiKeyConfigured: Boolean(settings?.gemini_api_key_encrypted), environmentApiKeyConfigured: Boolean(process.env.GEMINI_API_KEY), rates: modelRates(model), ...modelPricingInfo(model) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "API 사용량을 불러오지 못했습니다." }, { status: 500 }); }
}

export async function DELETE() {
  const denied = await requireAdminApi({ settings: true }); if (denied) return denied;
  try {
    const DB = await ensureKnowledgeSchema();
    await DB.prepare("UPDATE site_settings SET gemini_api_key_encrypted = NULL, updated_at = ? WHERE id = 'default'").bind(Date.now()).run();
    return Response.json({ apiKeyConfigured: Boolean(process.env.GEMINI_API_KEY), storedApiKeyConfigured: false });
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
