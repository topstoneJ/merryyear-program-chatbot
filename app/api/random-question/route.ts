import { COUNT_SOURCE_KIND_SQL } from "@/db/source-limits";
import { SOURCE_LIMITS, sourceLimitMessage } from "@/app/knowledge/source-limits";
import { ensureKnowledgeSchema, getBusiness } from "@/db/knowledge";
import { requireAdminApi } from "@/app/admin-session";

type Prompt = { key: string; question: string; options: string[] };
type RandomQuestionRow = {
  id: string;
  business_id: string;
  question_key: string;
  question: string;
  options_json: string;
  status: "active" | "completed" | "skipped";
};

const COMMON_PROMPTS: Prompt[] = [
  {
    key: "common-unclear-rule",
    question: "공고문만으로 판단하기 어려운 질문이 들어오면 챗봇이 어떻게 안내해야 하나요?",
    options: ["담당자 문의가 필요하다고 안내", "신청은 가능하지만 최종 심사가 필요하다고 안내", "추가로 필요한 정보를 먼저 질문", "관련 서류를 제출하면 검토 가능하다고 안내"],
  },
  {
    key: "common-missing-documents",
    question: "필수 서류가 일부 누락된 신청에 적용할 운영 원칙이 있나요?",
    options: ["접수하지 않음", "보완 요청 후 접수", "접수 후 심사 과정에서 보완", "누락 서류 종류에 따라 다르게 처리"],
  },
  {
    key: "common-deadline-exception",
    question: "마감일 이후 도착하거나 시스템 오류로 늦어진 신청은 어떻게 처리하나요?",
    options: ["예외 없이 접수 불가", "오류 증빙이 있으면 검토", "담당자 사전 협의 시 검토", "별도 대기 명단으로 관리"],
  },
  {
    key: "common-duplicate-support",
    question: "다른 기관의 유사 지원을 이미 받은 신청자에게 적용할 중복지원 기준이 있나요?",
    options: ["동일 항목은 지원 불가", "지원 시기가 다르면 가능", "총 지원 한도 내에서 가능", "담당자 확인 후 개별 판단"],
  },
  {
    key: "common-result-notice",
    question: "심사 결과와 탈락 사유를 신청자에게 어느 범위까지 안내하나요?",
    options: ["선정 여부만 안내", "주요 탈락 사유도 안내", "요청한 경우에만 사유 안내", "심사 내용은 공개하지 않음"],
  },
  {
    key: "common-urgent-contact",
    question: "긴급하거나 예외적인 문의를 일반 문의와 다르게 처리하는 기준이 있나요?",
    options: ["긴급 연락처를 별도 안내", "제목에 긴급 표시를 요청", "관련 증빙을 먼저 요청", "일반 문의와 동일하게 순차 처리"],
  },
];

function promptsFor() {
  return COMMON_PROMPTS;
}

function publicQuestion(row: RandomQuestionRow) {
  return {
    id: row.id,
    question: row.question,
    options: JSON.parse(row.options_json) as string[],
  };
}

export async function GET(request: Request) {
  try {
    const businessId = new URL(request.url).searchParams.get("businessId") || "";
    { const denied = await requireAdminApi({ businessId }); if (denied) return denied; }
    if (!businessId || !await getBusiness(businessId)) {
      return Response.json({ error: "올바른 사업을 선택해 주세요." }, { status: 400 });
    }
    const DB = await ensureKnowledgeSchema();
    const active = await DB.prepare(
      "SELECT * FROM random_questions WHERE business_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1",
    ).bind(businessId).first<RandomQuestionRow>();
    if (active) return Response.json({ question: publicQuestion(active) });

    const completed = await DB.prepare("SELECT question_key FROM random_questions WHERE business_id = ?")
      .bind(businessId).all<{ question_key: string }>();
    const completedKeys = new Set(completed.results.map((item) => item.question_key));
    const promptPool = promptsFor();
    let candidates = promptPool.filter((prompt) => !completedKeys.has(prompt.key));
    const recycled = candidates.length === 0;
    if (recycled) candidates = promptPool;
    const prompt = candidates[Math.floor(Math.random() * candidates.length)];
    const id = crypto.randomUUID();
    const questionKey = recycled ? `${prompt.key}-${id}` : prompt.key;
    await DB.prepare(
      "INSERT INTO random_questions (id, business_id, question_key, question, options_json, status, selected_options_json, note, created_at) VALUES (?, ?, ?, ?, ?, 'active', '[]', '', ?)",
    ).bind(id, businessId, questionKey, prompt.question, JSON.stringify(prompt.options), Date.now()).run();
    return Response.json({ question: { id, question: prompt.question, options: prompt.options } });
  } catch (error) {
    console.error("Random question load failed", { requestId: crypto.randomUUID(), kind: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "랜덤 질문을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { businessId?: string; questionId?: string; selectedOptions?: string[]; note?: string; action?: "complete" | "skip" };
    { const denied = await requireAdminApi({ businessId: body.businessId }); if (denied) return denied; }
    if (!body.businessId || !body.questionId) {
      return Response.json({ error: "사업과 질문을 확인해 주세요." }, { status: 400 });
    }
    const DB = await ensureKnowledgeSchema();
    const row = await DB.prepare(
      "SELECT * FROM random_questions WHERE id = ? AND business_id = ? AND status = 'active'",
    ).bind(body.questionId, body.businessId).first<RandomQuestionRow>();
    if (!row) return Response.json({ error: "이미 완료했거나 사용할 수 없는 질문입니다." }, { status: 409 });

    if (body.action === "skip") {
      await DB.prepare(
        "UPDATE random_questions SET status = 'skipped', completed_at = ? WHERE id = ? AND status = 'active'",
      ).bind(Date.now(), row.id).run();
      return Response.json({ ok: true, skipped: true });
    }

    const allowed = new Set(JSON.parse(row.options_json) as string[]);
    const selected = [...new Set((body.selectedOptions || []).map((item) => item.trim()).filter((item) => allowed.has(item)))];
    const note = String(body.note || "").replace(/\u0000/g, "").trim().slice(0, 2_000);
    if (!selected.length && !note) return Response.json({ error: "해당하는 항목을 하나 이상 선택해 주세요." }, { status: 400 });

    const now = Date.now();
    const sourceId = crypto.randomUUID();
    const title = `랜덤 질문 · ${row.question.replace(/[?？]/g, "").slice(0, 70)}`;
    const content = [
      `[담당자 보완 안내]`,
      `질문: ${row.question}`,
      selected.length ? `적용되는 내용:\n${selected.map((item) => `- ${item}`).join("\n")}` : "",
      note ? `추가 설명:\n${note}` : "",
    ].filter(Boolean).join("\n\n");

    const results = await DB.batch([
      DB.prepare(
        `INSERT INTO knowledge_sources (id, business_id, type, title, content, status, enabled, created_at, updated_at) SELECT ?, ?, 'random', ?, ?, 'ready', 1, ?, ? WHERE (${COUNT_SOURCE_KIND_SQL}) < ? AND EXISTS(SELECT 1 FROM random_questions WHERE id = ? AND status = 'active')`,
      ).bind(sourceId, body.businessId, title, content, now, now, body.businessId, "random", SOURCE_LIMITS.random, row.id),
      DB.prepare(
        "UPDATE random_questions SET status = 'completed', selected_options_json = ?, note = ?, knowledge_source_id = ?, completed_at = ? WHERE id = ? AND status = 'active' AND EXISTS(SELECT 1 FROM knowledge_sources WHERE id = ?)",
      ).bind(JSON.stringify(selected), note, sourceId, now, row.id, sourceId),
    ]);
    if (!results[0].meta.changes) return Response.json({ error: sourceLimitMessage("random") }, { status: 409 });

    return Response.json({ ok: true, sourceId });
  } catch (error) {
    console.error("Random question save failed", { requestId: crypto.randomUUID(), kind: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "선택한 내용을 저장하지 못했습니다." }, { status: 500 });
  }
}
