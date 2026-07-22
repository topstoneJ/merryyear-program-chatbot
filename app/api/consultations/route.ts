import { ensureKnowledgeSchema, getBusiness, type ConsultationRow } from "@/db/knowledge";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const businessId = url.searchParams.get("businessId") || "enterprise";
    if (!await getBusiness(businessId)) return Response.json({ error: "사업을 찾을 수 없습니다." }, { status: 404 });

    const now = Date.now();
    const from = Number(url.searchParams.get("from")) || now - 30 * 24 * 60 * 60 * 1_000;
    const to = Number(url.searchParams.get("to")) || now;
    const DB = await ensureKnowledgeSchema();
    const result = await DB.prepare(
      "SELECT * FROM consultations WHERE business_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC LIMIT 1000",
    ).bind(businessId, from, to).all<ConsultationRow>();

    const consultations = result.results.map((row) => ({
      id: row.id,
      businessId: row.business_id,
      question: row.question,
      answer: row.answer,
      summary: row.summary,
      decision: row.decision,
      category: row.category,
      source: row.source,
      confidence: row.confidence,
      review: Boolean(row.review),
      createdAt: row.created_at,
    }));
    const byDecision = Object.fromEntries(["possible", "impossible", "consult", "need_info", "fact"].map((key) => [key, consultations.filter((item) => item.decision === key).length]));
    const byCategory = [...new Set(consultations.map((item) => item.category))]
      .map((category) => ({ category, count: consultations.filter((item) => item.category === category).length }))
      .sort((a, b) => b.count - a.count);

    return Response.json({ consultations, summary: { total: consultations.length, byDecision, byCategory } });
  } catch (error) {
    console.error("Consultation list failed", error);
    return Response.json({ error: "상담 내역을 불러오지 못했습니다." }, { status: 500 });
  }
}
