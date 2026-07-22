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

export function knowledgeEnv() {
  return env as unknown as { DB?: D1Database; KNOWLEDGE_FILES?: R2Bucket };
}

export async function ensureKnowledgeSchema() {
  const { DB } = knowledgeEnv();
  if (!DB) throw new Error("Knowledge database is unavailable");
  await DB.batch([
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
  ]);
  return DB;
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
