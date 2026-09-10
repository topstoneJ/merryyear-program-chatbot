import { ensureKnowledgeSchema, listBusinesses } from "@/db/knowledge";
import { accountBusinessIds, getAdminSession, requireAdminApi, verifyPassword } from "@/app/admin-session";
import { ADMIN_GUIDE_BUSINESS_ID, ADMIN_GUIDE_BUSINESS_NAME } from "@/app/admin-guide";

const adminGuideBusiness = {
  id: ADMIN_GUIDE_BUSINESS_ID,
  name: ADMIN_GUIDE_BUSINESS_NAME,
  shortName: ADMIN_GUIDE_BUSINESS_NAME,
  code: "ADMIN_GUIDE",
  sortOrder: Number.MAX_SAFE_INTEGER,
  isPublic: false,
  noticeUrl: "",
  contactDepartment: "",
  contactEmail: "",
  contactPhone: "",
  contactHours: "",
  createdAt: 0,
  updatedAt: 0,
  readOnly: true,
};

function publicBusiness(row: Awaited<ReturnType<typeof listBusinesses>>[number]) {
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    code: row.code,
    sortOrder: row.sort_order,
    isPublic: Boolean(row.is_public),
    noticeUrl: row.notice_url,
    contactDepartment: row.contact_department,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    contactHours: row.contact_hours,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(request: Request) {
  try {
    const includeHidden = new URL(request.url).searchParams.get("includeHidden") === "1";
    if (includeHidden) { const denied = await requireAdminApi(); if (denied) return denied; const account = await getAdminSession(); const allowed = new Set(account ? accountBusinessIds(account) : []); return Response.json({ businesses: (await listBusinesses(true)).filter(item => account?.is_super_admin || allowed.has(item.id)).map(publicBusiness) }); }
    const account = await getAdminSession();
    const businesses = (await listBusinesses(Boolean(account?.is_super_admin))).map(publicBusiness);
    return Response.json({ businesses: account ? [...businesses, adminGuideBusiness] : businesses }, { headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });
  } catch (error) {
    console.error("Business list failed", { requestId: crypto.randomUUID(), kind: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "사업 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await requireAdminApi({ settings: true }); if (denied) return denied;
  try {
    const body = await request.json() as { name?: string; noticeUrl?: string; contactDepartment?: string; contactEmail?: string; contactPhone?: string; contactHours?: string };
    if (!body || typeof body !== "object" || Array.isArray(body) || [body.name, body.noticeUrl, body.contactDepartment, body.contactEmail, body.contactPhone, body.contactHours].some(value => value !== undefined && typeof value !== "string")) return Response.json({ error: "사업 입력값을 확인해 주세요." }, { status: 400 });
    const name = body.name?.replace(/\s+/g, " ").trim().slice(0, 120);
    if (!name) return Response.json({ error: "사업명을 입력해 주세요." }, { status: 400 });

    const DB = await ensureKnowledgeSchema();
    const count = await DB.prepare("SELECT COUNT(*) AS count FROM businesses").first<{ count: number }>();
    const last = await DB.prepare("SELECT MAX(sort_order) AS sort_order FROM businesses").first<{ sort_order: number | null }>();
    const id = `business-${crypto.randomUUID()}`;
    const now = Date.now();
    const code = `B${Number(count?.count || 0) + 1}`;
    const details = cleanBusinessDetails(body);
    if (details.error) return Response.json({ error: details.error }, { status: 400 });
    const missing = missingBusinessDetails(details);
    if (missing.length) return Response.json({ error: `사업을 생성하려면 필수 정보를 입력해 주세요: ${missing.join(", ")}` }, { status: 400 });
    await DB.prepare("INSERT INTO businesses (id, name, short_name, code, sort_order, is_public, notice_url, contact_department, contact_email, contact_phone, contact_hours, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, name, name, code, Number(last?.sort_order || 0) + 10, details.noticeUrl, details.contactDepartment, details.contactEmail, details.contactPhone, details.contactHours, now, now).run();
    const account = await getAdminSession();
    if (account) await DB.prepare("UPDATE admin_accounts SET business_ids_json = ?, updated_at = ? WHERE id = ?")
      .bind(JSON.stringify([...new Set([...accountBusinessIds(account), id])]), now, account.id).run();
    const business = (await listBusinesses()).find((item) => item.id === id);
    return Response.json({ business: business ? publicBusiness(business) : null });
  } catch (error) {
    console.error("Business create failed", { requestId: crypto.randomUUID(), kind: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "사업을 추가하지 못했습니다." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const denied = await requireAdminApi({ settings: true }); if (denied) return denied;
  try {
    const body = await request.json() as { id?: string; name?: string; order?: string[]; isPublic?: boolean; noticeUrl?: string; contactDepartment?: string; contactEmail?: string; contactPhone?: string; contactHours?: string };
    if (!body || typeof body !== "object" || Array.isArray(body)
      || (body.order !== undefined && (!Array.isArray(body.order) || body.order.some(id => typeof id !== "string")))
      || (body.isPublic !== undefined && typeof body.isPublic !== "boolean")
      || [body.id, body.name, body.noticeUrl, body.contactDepartment, body.contactEmail, body.contactPhone, body.contactHours].some(value => value !== undefined && typeof value !== "string")) return Response.json({ error: "사업 입력값을 확인해 주세요." }, { status: 400 });
    if (body.id === ADMIN_GUIDE_BUSINESS_ID || body.order?.includes(ADMIN_GUIDE_BUSINESS_ID)) return Response.json({ error: "운영 가이드는 수정할 수 없습니다." }, { status: 403 });
    if (body.order) {
      const current = await listBusinesses();
      const uniqueIds = new Set(body.order);
      const validOrder = body.order.length === current.length
        && uniqueIds.size === current.length
        && current.every((business) => uniqueIds.has(business.id));
      if (!validOrder) return Response.json({ error: "사업 순서 정보를 확인해 주세요." }, { status: 400 });

      const DB = await ensureKnowledgeSchema();
      const now = Date.now();
      await DB.batch(body.order.map((id, index) => DB.prepare("UPDATE businesses SET sort_order = ?, updated_at = ? WHERE id = ?")
        .bind((index + 1) * 10, now, id)));
      return Response.json({ ok: true, businesses: (await listBusinesses()).map(publicBusiness) });
    }
    if (!body.id) return Response.json({ error: "사업 대상을 확인해 주세요." }, { status: 400 });
    const DB = await ensureKnowledgeSchema();
    if (typeof body.isPublic === "boolean") {
      if (body.isPublic) {
        const business = await DB.prepare("SELECT notice_url, contact_department, contact_email, contact_phone, contact_hours FROM businesses WHERE id = ?").bind(body.id)
          .first<{ notice_url: string; contact_department: string; contact_email: string; contact_phone: string; contact_hours: string }>();
        const missing = missingBusinessDetails({
          noticeUrl: business?.notice_url || "", contactDepartment: business?.contact_department || "",
          contactEmail: business?.contact_email || "",
          contactPhone: business?.contact_phone || "", contactHours: business?.contact_hours || "",
        });
        if (missing.length) return Response.json({ error: `공개하려면 필수 정보를 입력해 주세요: ${missing.join(", ")}` }, { status: 400 });
      }
      await DB.prepare("UPDATE businesses SET is_public = ?, updated_at = ? WHERE id = ?")
        .bind(body.isPublic ? 1 : 0, Date.now(), body.id).run();
      return Response.json({ ok: true, isPublic: body.isPublic });
    }
    const name = body.name?.replace(/\s+/g, " ").trim().slice(0, 120);
    if (!name) return Response.json({ error: "사업명을 입력해 주세요." }, { status: 400 });
    const details = cleanBusinessDetails(body);
    if (details.error) return Response.json({ error: details.error }, { status: 400 });
    await DB.prepare("UPDATE businesses SET name = ?, short_name = ?, notice_url = ?, contact_department = ?, contact_email = ?, contact_phone = ?, contact_hours = ?, updated_at = ? WHERE id = ?")
      .bind(name, name, details.noticeUrl, details.contactDepartment, details.contactEmail, details.contactPhone, details.contactHours, Date.now(), body.id).run();
    return Response.json({ ok: true, name, ...details });
  } catch (error) {
    console.error("Business rename failed", { requestId: crypto.randomUUID(), kind: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "사업명을 변경하지 못했습니다." }, { status: 500 });
  }
}

function cleanBusinessDetails(body: { noticeUrl?: string; contactDepartment?: string; contactEmail?: string; contactPhone?: string; contactHours?: string }) {
  const noticeUrl = String(body.noticeUrl || "").trim().slice(0, 2_000);
  const contactDepartment = String(body.contactDepartment || "").replace(/\s+/g, " ").trim().slice(0, 120);
  const contactEmail = String(body.contactEmail || "").trim().slice(0, 254);
  const contactPhone = String(body.contactPhone || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const contactHours = String(body.contactHours || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (noticeUrl && !/^https?:\/\/[^\s]+$/i.test(noticeUrl)) return { noticeUrl, contactDepartment, contactEmail, contactPhone, contactHours, error: "사업안내 공고 링크는 http:// 또는 https:// 주소로 입력해 주세요." };
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return { noticeUrl, contactDepartment, contactEmail, contactPhone, contactHours, error: "이메일 형식을 확인해 주세요." };
  return { noticeUrl, contactDepartment, contactEmail, contactPhone, contactHours, error: "" };
}

function missingBusinessDetails(details: { noticeUrl: string; contactDepartment: string; contactEmail: string; contactPhone: string; contactHours: string }) {
  return [
    !details.noticeUrl && "사업안내 공고 링크",
    !details.contactDepartment && "담당 부서",
    !details.contactEmail && "이메일",
    !details.contactPhone && "연락처",
    !details.contactHours && "전화 가능 시간",
  ].filter((value): value is string => Boolean(value));
}

export async function DELETE(request: Request) {
  const denied = await requireAdminApi({ settings: true }); if (denied) return denied;
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ error: "삭제할 사업을 확인해 주세요." }, { status: 400 });
    if (id === ADMIN_GUIDE_BUSINESS_ID) return Response.json({ error: "운영 가이드는 삭제할 수 없습니다." }, { status: 403 });
    const account = await getAdminSession(), body = await request.json().catch(() => ({})) as { password?: string };
    if (!account || !await verifyPassword(String(body.password || ""), account)) return Response.json({ error: "본인 비밀번호가 올바르지 않습니다." }, { status: 400 });
    const current = await listBusinesses();
    if (!current.some((business) => business.id === id)) {
      return Response.json({ error: "사업을 찾을 수 없습니다." }, { status: 404 });
    }
    const DB = await ensureKnowledgeSchema();
    await DB.batch([
      DB.prepare("DELETE FROM knowledge_sources WHERE business_id = ?").bind(id),
      DB.prepare("DELETE FROM consultations WHERE business_id = ?").bind(id),
      DB.prepare("DELETE FROM random_questions WHERE business_id = ?").bind(id),
      DB.prepare("DELETE FROM businesses WHERE id = ?").bind(id),
    ]);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Business delete failed", { requestId: crypto.randomUUID(), kind: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "사업을 삭제하지 못했습니다." }, { status: 500 });
  }
}
