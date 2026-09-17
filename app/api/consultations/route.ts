import { isAnswerDecision } from "@/app/answer-response";
import { decisionFromAnswer } from "@/db/consultation-decision";
import { loadCategories, resolveCategory } from "@/db/consultation-categories";
import { deleteExpiredConsultations, ensureKnowledgeSchema, listBusinesses, type ConsultationRow } from "@/db/knowledge";
import { accountBusinessIds, getAdminSession, requireAdminApi } from "@/app/admin-session";
import { isOutsideBusinessHours } from "@/app/business-hours";

function validRange(from: number, to: number, now: number) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to || to > now + 24 * 60 * 60 * 1_000) return false;
  const fromDate = new Date(from);
  const limit = new Date(from);
  limit.setFullYear(fromDate.getFullYear() + 1);
  return to <= limit.getTime() + 24 * 60 * 60 * 1_000;
}

export async function GET(request: Request) {
  const denied = await requireAdminApi({ consultations: true }); if (denied) return denied;
  try {
    const url = new URL(request.url);
    const businessId = url.searchParams.get("businessId") || "";
    const account = await getAdminSession();
    const allBusinesses = await listBusinesses();
    const allowedIds = account?.is_super_admin ? allBusinesses.map(item => item.id) : account ? accountBusinessIds(account) : [];
    if (businessId && !allowedIds.includes(businessId)) return Response.json({ error: "이 사업에 대한 접근 권한이 없습니다." }, { status: 403 });
    if (businessId && !allBusinesses.some(item => item.id === businessId)) return Response.json({ error: "사업을 찾을 수 없습니다." }, { status: 404 });

    const now = Date.now();
    const from = Number(url.searchParams.get("from")) || now - 30 * 24 * 60 * 60 * 1_000;
    const to = Number(url.searchParams.get("to")) || now;
    if (!validRange(from, to, now)) return Response.json({ error: "조회 기간은 오늘까지 최대 1년으로 선택해 주세요." }, { status: 400 });
    const DB = await ensureKnowledgeSchema();
    await deleteExpiredConsultations(DB, now);
    const categories = await loadCategories(DB);
    const placeholders = allowedIds.map(() => "?").join(",") || "''";
    // Repair historical classifications within the caller's permitted date/business scope.
    const candidates = businessId
      ? await DB.prepare("SELECT id, business_id, question, category_manual, category, answer, decision, review, review_manual, created_at FROM consultations WHERE business_id = ? AND created_at BETWEEN ? AND ?")
        .bind(businessId, from, to).all<Pick<ConsultationRow, "id" | "business_id" | "question" | "category" | "category_manual" | "answer" | "decision" | "review" | "review_manual" | "created_at">>()
      : await DB.prepare(`SELECT id, business_id, question, category_manual, category, answer, decision, review, review_manual, created_at FROM consultations WHERE business_id IN (${placeholders}) AND created_at BETWEEN ? AND ?`)
        .bind(...allowedIds, from, to).all<Pick<ConsultationRow, "id" | "business_id" | "question" | "category" | "category_manual" | "answer" | "decision" | "review" | "review_manual" | "created_at">>();
    const repairs = [];
    for (const row of candidates.results) {
      const decision = isAnswerDecision(row.decision) ? row.decision : decisionFromAnswer(row.answer);
      const category = resolveCategory(row.category, categories).id;
      const review = !row.review_manual && decision === "consult" ? 1 : row.review;
      if (decision !== row.decision || review !== row.review || category !== row.category) repairs.push(
        DB.prepare("UPDATE consultations SET decision = ?, review = CASE WHEN review_manual = 1 THEN review ELSE ? END WHERE id = ?").bind(decision, review, row.id),
      );
    }
    for (let i = 0; i < repairs.length; i += 50) await DB.batch(repairs.slice(i, i + 50));
    const result = businessId
      ? await DB.prepare("SELECT * FROM consultations WHERE business_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC LIMIT 1000")
        .bind(businessId, from, to).all<ConsultationRow>()
      : await DB.prepare(`SELECT * FROM consultations WHERE business_id IN (${placeholders}) AND created_at BETWEEN ? AND ? ORDER BY created_at DESC LIMIT 1000`)
        .bind(...allowedIds, from, to).all<ConsultationRow>();

    const consultations = result.results.map((row) => ({
      id: row.id,
      businessId: row.business_id,
      sessionId: row.session_id || "",
      turnIndex: row.turn_index || 0,
      question: row.question,
      answer: row.answer,
      summary: row.summary,
      decision: row.decision,
      category: resolveCategory(row.category, categories).name,
      categoryId: resolveCategory(row.category, categories).id,
      source: row.source,
      confidence: row.confidence,
      review: Boolean(row.review),
      createdAt: row.created_at,
    }));
    const totals = businessId
      ? await DB.prepare(`SELECT decision, category, COUNT(*) AS count, SUM(review) AS review_count
          FROM consultations WHERE business_id = ? AND created_at BETWEEN ? AND ? GROUP BY decision, category`)
        .bind(businessId, from, to).all<{ decision: string; category: string; count: number; review_count: number }>()
      : await DB.prepare(`SELECT decision, category, COUNT(*) AS count, SUM(review) AS review_count
          FROM consultations WHERE business_id IN (${placeholders}) AND created_at BETWEEN ? AND ? GROUP BY decision, category`)
        .bind(...allowedIds, from, to).all<{ decision: string; category: string; count: number; review_count: number }>();
    const byDecision: Record<string, number> = {};
    const categoryCounts = new Map<string, number>();
    let total = 0;
    let reviewTotal = 0;
    const hoursByBusiness = new Map(allBusinesses.map(item => [item.id, item.contact_hours || ""]));
    const offHoursTotal = candidates.results.filter(row => isOutsideBusinessHours(row.created_at, hoursByBusiness.get(row.business_id) || "")).length;
    for (const row of totals.results) {
      total += row.count;
      reviewTotal += row.review_count;
      byDecision[row.decision] = (byDecision[row.decision] || 0) + row.count;
      const name = resolveCategory(row.category, categories).name;
      categoryCounts.set(name, (categoryCounts.get(name) || 0) + row.count);
    }
    const byCategory = [...categoryCounts].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);
    return Response.json({ categories: categories.filter(item => !item.replacement_id), canDelete: Boolean(account?.is_super_admin || account?.can_delete_consultations), consultations, summary: { total, byDecision, byCategory, reviewTotal, offHoursTotal } });
  } catch (error) {
    console.error("Consultation list failed", { requestId: crypto.randomUUID(), kind: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "상담 내역을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const denied = await requireAdminApi({ consultations: true }); if (denied) return denied;
  try {
    const { id, categoryId, review } = await request.json();
    if (typeof id !== "string" || (categoryId === undefined && review === undefined) || (categoryId !== undefined && typeof categoryId !== "string") || (review !== undefined && typeof review !== "boolean")) return Response.json({ error: "상담과 질문 유형을 선택해 주세요." }, { status: 400 });
    const DB = await ensureKnowledgeSchema();
    const row = await DB.prepare("SELECT business_id FROM consultations WHERE id = ?").bind(id).first<{ business_id: string }>();
    if (!row) return Response.json({ error: "상담내역을 찾을 수 없습니다." }, { status: 404 });
    const forbidden = await requireAdminApi({ businessId: row.business_id }); if (forbidden) return forbidden;
    const assignments: string[] = [];
    const values: (string | number)[] = [];
    if (categoryId !== undefined) { assignments.push("category = ?", "category_manual = 1"); values.push(categoryId); }
    if (review !== undefined) { assignments.push("review = ?", "review_manual = 1"); values.push(review ? 1 : 0); }
    values.push(id);
    const categoryGuard = categoryId !== undefined ? " AND EXISTS (SELECT 1 FROM consultation_categories WHERE id = ? AND replacement_id IS NULL)" : "";
    if (categoryId !== undefined) values.push(categoryId);
    const result = await DB.prepare(`UPDATE consultations SET ${assignments.join(", ")} WHERE id = ?${categoryGuard}`).bind(...values).run();
    if (!result.meta.changes) return Response.json({ error: "상담내역 또는 질문 유형이 변경되었습니다. 새로고침해 주세요." }, { status: 409 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "상담내역을 변경하지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const account = await getAdminSession();
    if (!account) return Response.json({ error: "관리자 로그인이 필요합니다." }, { status: 401 });
    if (!account.is_super_admin && (!account.can_delete_consultations || account.can_view_consultations === 0)) return Response.json({ error: "상담내역 삭제 권한이 없습니다." }, { status: 403 });
    const id = new URL(request.url).searchParams.get("id")?.trim();
    let ids: string[] = id ? [id] : [];
    if (!id) {
      const body = await request.json().catch(() => null) as { ids?: unknown } | null;
      if (Array.isArray(body?.ids)) ids = [...new Set(body.ids.filter((value): value is string => typeof value === "string").map(value => value.trim()).filter(Boolean))];
    }
    if (!ids.length || ids.length > 1000) return Response.json({ error: "삭제할 상담내역을 선택해 주세요." }, { status: 400 });
    const DB = await ensureKnowledgeSchema();
    if (ids.length === 1) {
      if (!account.is_super_admin) {
        const row = await DB.prepare("SELECT business_id FROM consultations WHERE id = ?").bind(ids[0]).first<{ business_id: string }>();
        if (!row) return Response.json({ error: "상담내역을 찾을 수 없습니다." }, { status: 404 });
        if (!accountBusinessIds(account).includes(row.business_id)) return Response.json({ error: "이 사업에 대한 접근 권한이 없습니다." }, { status: 403 });
      }
      const result = await DB.prepare("DELETE FROM consultations WHERE id = ?").bind(ids[0]).run();
      if (!result.meta.changes) return Response.json({ error: "이미 삭제되었거나 존재하지 않는 상담내역입니다." }, { status: 404 });
      return Response.json({ ok: true, deleted: result.meta.changes });
    }
    if (!account.is_super_admin) {
      const allowed = new Set(accountBusinessIds(account));
      for (let offset = 0; offset < ids.length; offset += 50) {
        const chunk = ids.slice(offset, offset + 50);
        const rows = await DB.prepare(`SELECT id, business_id FROM consultations WHERE id IN (${chunk.map(() => "?").join(",")})`).bind(...chunk).all<{ id: string; business_id: string }>();
        if (rows.results.length !== chunk.length) return Response.json({ error: "일부 상담내역이 이미 삭제되었습니다. 새로고침해 주세요." }, { status: 409 });
        if (rows.results.some(row => !allowed.has(row.business_id))) return Response.json({ error: "이 사업에 대한 접근 권한이 없습니다." }, { status: 403 });
      }
    }
    let deleted = 0;
    for (let offset = 0; offset < ids.length; offset += 50) {
      const results = await DB.batch(ids.slice(offset, offset + 50).map(value => DB.prepare("DELETE FROM consultations WHERE id = ?").bind(value)));
      deleted += results.reduce((count, result) => count + Number(result.meta.changes || 0), 0);
    }
    if (!deleted) return Response.json({ error: "이미 삭제되었거나 존재하지 않는 상담내역입니다." }, { status: 404 });
    return Response.json({ ok: true, deleted });
  } catch {
    return Response.json({ error: "상담내역을 삭제하지 못했습니다. 다시 시도해 주세요." }, { status: 500 });
  }
}
