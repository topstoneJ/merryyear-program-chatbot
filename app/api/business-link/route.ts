import { ensureKnowledgeSchema, getBusiness } from "@/db/knowledge";
import { getAdminSession, requireAdminApi } from "@/app/admin-session";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function GET(request: Request) {
  try {
    const businessId = new URL(request.url).searchParams.get("businessId") || "";
    const business = await getBusiness(businessId);
    if (!business || (!business.is_public && !(await getAdminSession())?.is_super_admin)) return Response.json({error:"사업을 찾을 수 없습니다."},{status:404,headers});
    if (/^https?:\/\//i.test(business.notice_url || "")) return Response.json({url:business.notice_url},{headers});
    const DB = await ensureKnowledgeSchema();
    const source = await DB.prepare(`SELECT k.source_url AS url FROM business_homepage_sources h
      JOIN knowledge_sources k ON k.id = h.source_id AND k.business_id = h.business_id
      WHERE h.business_id = ? AND k.type = 'website' AND k.enabled = 1 AND k.status != 'error'`).bind(businessId).first<{url:string}>();
    return Response.json({url:source?.url && /^https?:\/\//i.test(source.url) ? source.url : ""},{headers});
  } catch (error) {
    const requestId = crypto.randomUUID();
    console.error("api/business-link:GET", { requestId, kind: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", requestId }, { status: 503, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => null) as {id?:unknown; showOnMain?:unknown} | null;
    if (!body || typeof body.id !== "string" || !body.id || typeof body.showOnMain !== "boolean") return Response.json({error:"노출할 웹사이트를 확인해 주세요."},{status:400});
    const DB = await ensureKnowledgeSchema();
    const source = await DB.prepare("SELECT id, business_id, type, source_url, enabled, status FROM knowledge_sources WHERE id = ?").bind(body.id)
      .first<{id:string;business_id:string;type:string;source_url:string;enabled:number;status:string}>();
    const denied = await requireAdminApi({businessId:source?.business_id}); if (denied) return denied;
    if (!source) return Response.json({error:"자료를 찾을 수 없습니다."},{status:404});
    if (source.type !== "website" || !/^https?:\/\//i.test(source.source_url || "") || (body.showOnMain && (!source.enabled || source.status === "error")))
      return Response.json({error:"사용 중인 정상 웹사이트 자료만 메인에 노출할 수 있습니다."},{status:400});
    if (body.showOnMain) {
      await DB.prepare(`INSERT INTO business_homepage_sources (business_id, source_id) VALUES (?, ?)
        ON CONFLICT(business_id) DO UPDATE SET source_id = excluded.source_id`).bind(source.business_id,source.id).run();
      await DB.prepare("UPDATE businesses SET notice_url = ?, updated_at = ? WHERE id = ?").bind(source.source_url, Date.now(), source.business_id).run();
    } else {
      await DB.prepare("DELETE FROM business_homepage_sources WHERE business_id = ? AND source_id = ?").bind(source.business_id,source.id).run();
      await DB.prepare("UPDATE businesses SET notice_url = CASE WHEN notice_url = ? THEN '' ELSE notice_url END, updated_at = ? WHERE id = ?").bind(source.source_url, Date.now(), source.business_id).run();
    }
    return Response.json({ok:true},{headers});
  } catch (error) {
    const requestId = crypto.randomUUID();
    console.error("api/business-link:PATCH", { requestId, kind: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", requestId }, { status: 503, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
  }
}
