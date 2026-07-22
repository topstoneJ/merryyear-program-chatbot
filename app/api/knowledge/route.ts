import { ensureKnowledgeSchema, getBusiness, knowledgeEnv, type KnowledgeSourceRow } from "@/db/knowledge";

const TYPES = new Set(["website", "pdf", "text"]);

function cleanText(value: string, limit = 120_000) {
  return value.replace(/\u0000/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, limit);
}

function htmlToText(html: string) {
  return cleanText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&#39;/gi, "'")
      .replace(/&quot;/gi, "\"")
      .replace(/\s+/g, " "),
    80_000,
  );
}

function publicSource(row: KnowledgeSourceRow) {
  return {
    id: row.id,
    businessId: row.business_id,
    type: row.type,
    title: row.title,
    url: row.source_url,
    fileName: row.file_name,
    status: row.status,
    enabled: Boolean(row.enabled),
    contentLength: row.content.length,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const DB = await ensureKnowledgeSchema();
    if (id) {
      const source = await DB.prepare("SELECT * FROM knowledge_sources WHERE id = ?").bind(id).first<KnowledgeSourceRow>();
      if (!source) return Response.json({ error: "지식을 찾을 수 없습니다." }, { status: 404 });
      return Response.json({ source: { ...publicSource(source), content: source.content } });
    }

    const businessId = url.searchParams.get("businessId") || "enterprise";
    if (!await getBusiness(businessId)) return Response.json({ error: "올바른 사업을 선택해 주세요." }, { status: 400 });
    const result = await DB.prepare(
      "SELECT * FROM knowledge_sources WHERE business_id = ? ORDER BY updated_at DESC",
    ).bind(businessId).all<KnowledgeSourceRow>();
    return Response.json({ sources: result.results.map(publicSource) });
  } catch (error) {
    console.error("Knowledge list failed", error);
    return Response.json({ error: "지식 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const businessId = String(form.get("businessId") || "");
    const type = String(form.get("type") || "");
    const title = cleanText(String(form.get("title") || ""), 120);
    if (!await getBusiness(businessId) || !TYPES.has(type) || !title) {
      return Response.json({ error: "사업, 자료 형식, 제목을 확인해 주세요." }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const now = Date.now();
    let sourceUrl: string | null = null;
    let fileKey: string | null = null;
    let fileName: string | null = null;
    let content = "";
    let status: "ready" | "stored" | "error" = "ready";

    if (type === "website") {
      const rawUrl = String(form.get("url") || "").trim();
      const parsed = new URL(rawUrl);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error("웹사이트 주소는 http 또는 https여야 합니다.");
      sourceUrl = parsed.toString();
      try {
        const response = await fetch(sourceUrl, { headers: { "User-Agent": "MerryYearKnowledgeBot/1.0" } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        content = htmlToText(await response.text());
        if (content.length < 40) status = "error";
      } catch {
        status = "error";
      }
    } else if (type === "text") {
      content = cleanText(String(form.get("content") || ""));
      if (!content) return Response.json({ error: "데이터 내용을 입력해 주세요." }, { status: 400 });
    } else {
      const file = form.get("file");
      if (!(file instanceof File) || file.type !== "application/pdf") {
        return Response.json({ error: "PDF 파일을 선택해 주세요." }, { status: 400 });
      }
      if (file.size > 20 * 1024 * 1024) return Response.json({ error: "PDF는 20MB 이하만 등록할 수 있습니다." }, { status: 400 });
      fileName = cleanText(file.name, 180);
      content = cleanText(String(form.get("extractedText") || ""));
      const { KNOWLEDGE_FILES } = knowledgeEnv();
      if (!KNOWLEDGE_FILES) throw new Error("Knowledge file storage is unavailable");
      const safeName = fileName.replace(/[^a-zA-Z0-9._가-힣-]/g, "-");
      fileKey = `knowledge/${businessId}/${id}/${safeName}`;
      await KNOWLEDGE_FILES.put(fileKey, file.stream(), {
        httpMetadata: { contentType: "application/pdf" },
        customMetadata: { title, businessId },
      });
      status = content.length >= 20 ? "ready" : "stored";
    }

    const DB = await ensureKnowledgeSchema();
    await DB.prepare(
      "INSERT INTO knowledge_sources (id, business_id, type, title, source_url, file_key, file_name, content, status, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
    ).bind(id, businessId, type, title, sourceUrl, fileKey, fileName, content, status, now, now).run();

    const result = await DB.prepare("SELECT * FROM knowledge_sources WHERE id = ?").bind(id).first<KnowledgeSourceRow>();
    return Response.json({ source: result ? publicSource(result) : null });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("http")
      ? error.message
      : "지식을 등록하지 못했습니다.";
    console.error("Knowledge create failed", error);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { id?: string; enabled?: boolean; title?: string; content?: string };
    if (!body.id) return Response.json({ error: "변경할 지식을 확인해 주세요." }, { status: 400 });
    const DB = await ensureKnowledgeSchema();
    if (typeof body.enabled === "boolean") {
      await DB.prepare("UPDATE knowledge_sources SET enabled = ?, updated_at = ? WHERE id = ?")
        .bind(body.enabled ? 1 : 0, Date.now(), body.id).run();
    } else {
      const title = cleanText(String(body.title || ""), 120);
      const content = cleanText(String(body.content || ""));
      if (!title || !content) return Response.json({ error: "제목과 내용을 입력해 주세요." }, { status: 400 });
      await DB.prepare("UPDATE knowledge_sources SET title = ?, content = ?, status = 'ready', updated_at = ? WHERE id = ?")
        .bind(title, content, Date.now(), body.id).run();
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Knowledge update failed", error);
    return Response.json({ error: "지식 설정을 변경하지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ error: "삭제할 지식을 확인해 주세요." }, { status: 400 });
    const DB = await ensureKnowledgeSchema();
    const source = await DB.prepare("SELECT file_key FROM knowledge_sources WHERE id = ?").bind(id).first<{ file_key: string | null }>();
    if (source?.file_key) await knowledgeEnv().KNOWLEDGE_FILES?.delete(source.file_key);
    await DB.prepare("DELETE FROM knowledge_sources WHERE id = ?").bind(id).run();
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Knowledge delete failed", error);
    return Response.json({ error: "지식을 삭제하지 못했습니다." }, { status: 500 });
  }
}
