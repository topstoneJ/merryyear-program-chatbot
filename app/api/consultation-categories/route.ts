import { requireAdminApi } from "@/app/admin-session";
import { ensureKnowledgeSchema } from "@/db/knowledge";
import { loadCategories } from "@/db/consultation-categories";

export async function GET() {
  const denied = await requireAdminApi({ consultations: true }); if (denied) return denied;
  const DB = await ensureKnowledgeSchema();
  return Response.json({ categories: (await loadCategories(DB)).filter(item => !item.replacement_id) });
}

export async function POST(request: Request) {
  const denied = await requireAdminApi({ consultations: true }); if (denied) return denied;
  try {
    const body = await request.json();
    const DB = await ensureKnowledgeSchema();
    const categories = await loadCategories(DB);
    const active = categories.filter(item => !item.replacement_id);
    const current = active.find(item => item.id === body.id);
    if (!["add", "rename", "delete"].includes(body.action)) return Response.json({ error: "올바른 작업을 선택해 주세요." }, { status: 400 });
    if (body.action !== "add" && !current) return Response.json({ error: "이미 삭제된 유형입니다. 목록을 새로고침해 주세요." }, { status: 404 });
    if (body.action === "delete") {
      const target = active.find(item => item.id === body.replacementId && item.id !== body.id);
      if (!target) return Response.json({ error: "상담을 옮길 다른 유형을 선택해 주세요." }, { status: 400 });
      // One atomic batch keeps historical records and future automatic routing together.
      const result = await DB.batch([
        DB.prepare("UPDATE consultation_categories SET replacement_id = ?, name = ? WHERE id = ? AND replacement_id IS NULL AND EXISTS (SELECT 1 FROM consultation_categories WHERE id = ? AND replacement_id IS NULL)").bind(target.id, `__deleted:${current!.id}`, current!.id, target.id),
        DB.prepare("UPDATE consultations SET category = (SELECT replacement_id FROM consultation_categories WHERE id = ?) WHERE category = ? AND EXISTS (SELECT 1 FROM consultation_categories WHERE id = ? AND replacement_id IS NOT NULL)").bind(current!.id, current!.id, current!.id),
      ]);
      if (!result[0].meta.changes) return Response.json({ error: "유형이 변경되었습니다. 목록을 새로고침해 주세요." }, { status: 409 });
    } else {
      const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
      if (!name || name.length > 30 || name.startsWith("__deleted:")) return Response.json({ error: "유형 이름을 1~30자로 입력해 주세요." }, { status: 400 });
      if (active.some(item => item.name === name && item.id !== current?.id)) return Response.json({ error: "이미 있는 유형 이름입니다." }, { status: 409 });
      if (body.action === "add") await DB.prepare("INSERT INTO consultation_categories (id, name, sort_order) VALUES (?, ?, ?)").bind(crypto.randomUUID(), name, Math.max(...categories.map(item => item.sort_order)) + 1).run();
      else {
        const result = await DB.prepare("UPDATE consultation_categories SET name = ? WHERE id = ? AND replacement_id IS NULL").bind(name, current!.id).run();
        if (!result.meta.changes) return Response.json({ error: "이미 삭제된 유형입니다." }, { status: 409 });
      }
    }
    return Response.json({ categories: (await loadCategories(DB)).filter(item => !item.replacement_id) });
  } catch (error) {
    if (String(error).includes("UNIQUE")) return Response.json({ error: "이미 있는 유형 이름입니다." }, { status: 409 });
    return Response.json({ error: "질문 유형을 저장하지 못했습니다. 다시 시도해 주세요." }, { status: 500 });
  }
}
