import { env } from "cloudflare:workers";

export type KnowledgeSourceRow = {
  id: string;
  business_id: string;
  type: "website" | "pdf" | "text";
  title: string;
  source_url: string | null;
  file_key: string | null;
  file_name: string | null;
  content: string;
  status: "ready" | "stored" | "error";
  enabled: number;
  created_at: number;
  updated_at: number;
};

export type BusinessRow = {
  id: string;
  name: string;
  short_name: string;
  code: string;
  created_at: number;
  updated_at: number;
};

export type ConsultationRow = {
  id: string;
  business_id: string;
  question: string;
  answer: string;
  summary: string;
  decision: string;
  category: string;
  source: string;
  confidence: number;
  review: number;
  created_at: number;
};

export function knowledgeEnv() {
  return env as unknown as { DB?: D1Database; KNOWLEDGE_FILES?: R2Bucket };
}

export async function ensureKnowledgeSchema() {
  const { DB } = knowledgeEnv();
  if (!DB) throw new Error("Knowledge database is unavailable");
  await DB.batch([
    DB.prepare(`CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      code TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS knowledge_sources (
      id TEXT PRIMARY KEY NOT NULL,
      business_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      source_url TEXT,
      file_key TEXT,
      file_name TEXT,
      content TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'ready',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    DB.prepare("CREATE INDEX IF NOT EXISTS knowledge_business_idx ON knowledge_sources (business_id, updated_at)"),
    DB.prepare(`CREATE TABLE IF NOT EXISTS consultations (
      id TEXT PRIMARY KEY NOT NULL,
      business_id TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      summary TEXT NOT NULL,
      decision TEXT NOT NULL,
      category TEXT NOT NULL,
      source TEXT NOT NULL,
      confidence INTEGER NOT NULL DEFAULT 0,
      review INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`),
    DB.prepare("CREATE INDEX IF NOT EXISTS consultation_business_date_idx ON consultations (business_id, created_at)"),
    DB.prepare("INSERT OR IGNORE INTO businesses (id, name, short_name, code, created_at, updated_at) VALUES ('enterprise', '사회적기업 시설·운영비 지원사업', '사회적기업 지원', 'SE', 0, 0)"),
    DB.prepare("INSERT OR IGNORE INTO businesses (id, name, short_name, code, created_at, updated_at) VALUES ('crisis', '위기아동가정 지원사업', '위기아동가정 지원', 'CA', 0, 0)"),
  ]);
  return DB;
}

export async function listBusinesses() {
  const DB = await ensureKnowledgeSchema();
  const result = await DB.prepare("SELECT * FROM businesses ORDER BY CASE id WHEN 'enterprise' THEN 0 WHEN 'crisis' THEN 1 ELSE 2 END, created_at ASC")
    .all<BusinessRow>();
  return result.results;
}

export async function getBusiness(businessId: string) {
  const DB = await ensureKnowledgeSchema();
  return DB.prepare("SELECT * FROM businesses WHERE id = ?").bind(businessId).first<BusinessRow>();
}

function decisionFromAnswer(answer: string) {
  if (answer.startsWith("가능합니다.")) return "possible";
  if (answer.startsWith("불가능합니다.")) return "impossible";
  if (answer.startsWith("담당자 문의가 필요합니다.")) return "consult";
  if (answer.startsWith("추가 정보가 필요합니다.")) return "need_info";
  return "fact";
}

function categoryFromQuestion(question: string) {
  if (/(자격|대상|가능|신청할 수)/.test(question)) return "신청 자격";
  if (/(금액|얼마|지원금|한도)/.test(question)) return "지원 금액";
  if (/(기간|언제|마감|접수)/.test(question)) return "신청 기간";
  if (/(서류|방법|어떻게|제출)/.test(question)) return "신청 방법";
  if (/(소득|월급|가구)/.test(question)) return "소득 기준";
  return "기타";
}

export async function recordConsultation(input: {
  businessId: string;
  question: string;
  answer: string;
  source: string;
  confidence: number;
  review?: boolean;
}) {
  const DB = await ensureKnowledgeSchema();
  const firstParagraph = input.answer.split(/\n\s*\n/)[0]?.trim() || input.answer.trim();
  await DB.prepare(`INSERT INTO consultations
    (id, business_id, question, answer, summary, decision, category, source, confidence, review, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      crypto.randomUUID(),
      input.businessId,
      input.question.slice(0, 2_000),
      input.answer.slice(0, 20_000),
      firstParagraph.slice(0, 500),
      decisionFromAnswer(input.answer),
      categoryFromQuestion(input.question),
      input.source.slice(0, 500),
      input.confidence,
      input.review ? 1 : 0,
      Date.now(),
    ).run();
}

export async function loadKnowledgeContext(businessId: string) {
  try {
    const DB = await ensureKnowledgeSchema();
    const result = await DB.prepare(
      "SELECT title, type, source_url, file_name, content FROM knowledge_sources WHERE business_id = ? AND enabled = 1 AND status != 'error' ORDER BY updated_at DESC LIMIT 20",
    ).bind(businessId).all<Pick<KnowledgeSourceRow, "title" | "type" | "source_url" | "file_name" | "content">>();

    let used = 0;
    return result.results.flatMap((source) => {
      const label = source.type === "website"
        ? `${source.title} (${source.source_url || "웹사이트"})`
        : source.type === "pdf"
          ? `${source.title} (${source.file_name || "PDF"})`
          : source.title;
      const remaining = 14_000 - used;
      if (remaining <= 0) return [];
      const content = source.content.trim().slice(0, remaining);
      used += content.length;
      return content ? [`[추가 지식 · ${label}]\n${content}`] : [];
    }).join("\n\n");
  } catch {
    return "";
  }
}
