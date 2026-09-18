import { requireAdminApi } from "@/app/admin-session";
import { parseAnswerSettings, readAnswerSettings } from "@/app/answer-settings";
import { ensureKnowledgeSchema } from "@/db/knowledge";

export async function GET() {
  try {
    const denied = await requireAdminApi({ settings: true });
    if (denied) return denied;
    const DB = await ensureKnowledgeSchema();
    const row = await DB.prepare("SELECT answer_settings_json FROM site_settings WHERE id = 'default'").first<{ answer_settings_json: string }>();
    return Response.json({ settings: readAnswerSettings(row?.answer_settings_json) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const requestId = crypto.randomUUID();
    console.error("api/answer-settings:GET", { requestId, kind: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", requestId }, { status: 503, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
  }
}

export async function PATCH(request: Request) {
  const denied = await requireAdminApi({ settings: true });
  if (denied) return denied;
  let settings;
  try { settings = parseAnswerSettings(await request.json()); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "입력 내용을 확인해 주세요." }, { status: 400 }); }
  try {
    const DB = await ensureKnowledgeSchema();
    const result = await DB.prepare("UPDATE site_settings SET answer_settings_json = ? WHERE id = 'default'").bind(JSON.stringify(settings)).run();
    if (!result.meta.changes) return Response.json({ error: "설정을 찾을 수 없습니다." }, { status: 404 });
    return Response.json({ settings }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Answer settings update failed", { requestId: crypto.randomUUID(), kind: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "답변 설정을 저장하지 못했습니다. 다시 시도해 주세요." }, { status: 500 });
  }
}
