import { ensureKnowledgeSchema, listBusinesses } from "@/db/knowledge";

function publicBusiness(row: Awaited<ReturnType<typeof listBusinesses>>[number]) {
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    code: row.code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET() {
  try {
    return Response.json({ businesses: (await listBusinesses()).map(publicBusiness) });
  } catch (error) {
    console.error("Business list failed", error);
    return Response.json({ error: "사업 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: string };
    const name = body.name?.replace(/\s+/g, " ").trim().slice(0, 120);
    if (!name) return Response.json({ error: "사업명을 입력해 주세요." }, { status: 400 });

    const DB = await ensureKnowledgeSchema();
    const count = await DB.prepare("SELECT COUNT(*) AS count FROM businesses").first<{ count: number }>();
    const id = `business-${crypto.randomUUID()}`;
    const now = Date.now();
    const code = `B${Number(count?.count || 0) + 1}`;
    await DB.prepare("INSERT INTO businesses (id, name, short_name, code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, name, name, code, now, now).run();
    const business = (await listBusinesses()).find((item) => item.id === id);
    return Response.json({ business: business ? publicBusiness(business) : null });
  } catch (error) {
    console.error("Business create failed", error);
    return Response.json({ error: "사업을 추가하지 못했습니다." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { id?: string; name?: string };
    const name = body.name?.replace(/\s+/g, " ").trim().slice(0, 120);
    if (!body.id || !name) return Response.json({ error: "사업명과 대상을 확인해 주세요." }, { status: 400 });
    const DB = await ensureKnowledgeSchema();
    await DB.prepare("UPDATE businesses SET name = ?, short_name = ?, updated_at = ? WHERE id = ?")
      .bind(name, name, Date.now(), body.id).run();
    return Response.json({ ok: true, name });
  } catch (error) {
    console.error("Business rename failed", error);
    return Response.json({ error: "사업명을 변경하지 못했습니다." }, { status: 500 });
  }
}
