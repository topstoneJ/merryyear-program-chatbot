import { ensureKnowledgeSchema } from "@/db/knowledge";
import { matchesSecretToken } from "@/app/secret-token";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const configuredKey = process.env.DRIVE_EXPORT_KEY;
  const suppliedKey = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!matchesSecretToken(configuredKey, suppliedKey)) {
    console.info("security_event", { event: "drive_export", outcome: "denied", requestId, at: new Date().toISOString() });
    return Response.json({ error: "인증이 필요합니다." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const DB = await ensureKnowledgeSchema();
    const [businesses, knowledge, consultations, randomQuestions] = await Promise.all([
      DB.prepare("SELECT * FROM businesses ORDER BY created_at ASC").all(),
      DB.prepare("SELECT id, business_id, type, title, source_url, file_name, content, status, enabled, created_at, updated_at FROM knowledge_sources ORDER BY updated_at ASC").all(),
      DB.prepare("SELECT * FROM consultations ORDER BY created_at ASC").all(),
      DB.prepare("SELECT * FROM random_questions ORDER BY created_at ASC").all(),
    ]);
    const businessRows = businesses.results as Array<Record<string, unknown>>;
    const knowledgeRows = knowledge.results as Array<Record<string, unknown>>;
    const consultationRows = consultations.results as Array<Record<string, unknown>>;
    const randomQuestionRows = randomQuestions.results as Array<Record<string, unknown>>;
    const latest = (rows: Array<Record<string, unknown>>, key: string) => rows.reduce((max, row) => Math.max(max, Number(row[key] || 0)), 0);
    const dataVersion = [
      businessRows.length, latest(businessRows, "updated_at"),
      knowledgeRows.length, latest(knowledgeRows, "updated_at"),
      consultationRows.length, latest(consultationRows, "created_at"),
      randomQuestionRows.length, latest(randomQuestionRows, "completed_at"),
    ].join("-");
    console.info("security_event", { event: "drive_export", outcome: "success", requestId, at: new Date().toISOString() });
    return Response.json({
      schemaVersion: 2,
      dataVersion,
      exportedAt: new Date().toISOString(),
      businesses: businessRows,
      knowledgeSources: knowledgeRows,
      consultations: consultationRows,
      randomQuestions: randomQuestionRows,
    }, { headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
  } catch (error) {
    console.error("Drive export failed", { requestId, kind: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "백업 데이터를 만들지 못했습니다." }, { status: 500 });
  }
}
