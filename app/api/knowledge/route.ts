import { trackedGeminiFetch } from "@/db/api-usage";
import { configuredAiModel } from "@/db/ai-provider";
import { fetchWebsite, publicWebsiteUrl } from "@/app/safe-website";
import { ensureKnowledgeSchema, getBusiness, getConfiguredGeminiApiKey, knowledgeEnv, type KnowledgeSourceRow } from "@/db/knowledge";
import { requireAdminApi } from "@/app/admin-session";
import { COUNT_SOURCE_KIND_SQL } from "@/db/source-limits";
import { SOURCE_LIMITS, sourceLimitMessage, type LimitedSourceKind } from "@/app/knowledge/source-limits";
import { KnowledgeIntegrityError, validateAnalysisInput, validateKnowledgeContent } from "@/app/knowledge/knowledge-integrity";
import { convertPdfForAnalysis, DocumentConversionError } from "@/app/document-converter";

const TYPES = new Set(["website", "pdf", "text"]);

function cleanText(value: string, limit = 120_000) {
  return value.replace(/\u0000/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, limit);
}

function cleanAnalysisInput(value: string, label: "PDF" | "웹사이트" | "텍스트") {
  const content = value.replace(/\u0000/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return validateAnalysisInput(content, label);
}

function htmlToText(html: string) {
  return cleanAnalysisInput(
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
    "웹사이트",
  );
}

function publicSource(row: KnowledgeSourceRow & { is_random?: number; is_main?: number }) {
  return {
    id: row.id,
    businessId: row.business_id,
    type: row.type === "random" ? "text" : row.type,
    isMain: Boolean(row.is_main),
    isRandom: row.type === "random" || Boolean(row.is_random),
    title: row.title,
    url: row.source_url,
    fileName: row.file_name,
    status: row.status,
    enabled: Boolean(row.enabled),
    sharedAllBusinesses: row.shared_all_businesses === 1,
    contentLength: row.content.length,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type AiSection = { key: string; title: string; markdown: string; pages: number[]; status: "ai_analyzed" | "review_required" };

const NOTICE_SECTION_TEMPLATES = [
  ["overview", "사업개요"], ["conditions", "지원조건"], ["eligibility", "신청대상"], ["schedule", "모집일정"],
  ["screening", "심사방법"], ["documents", "제출서류"], ["contact", "문의처"], ["other", "기타"],
] as const;

async function analyzeSourceWithGemini(title: string, sourceLabel: string, extractedText: string, sourceKind: "PDF" | "웹사이트") {
  const apiKey = await getConfiguredGeminiApiKey();
  const model = configuredAiModel(apiKey);
  if (!apiKey) throw new Error("AI 분석을 위한 API 키가 설정되지 않았습니다.");
  if (extractedText.length < 20) throw new Error("PDF에서 분석할 텍스트를 충분히 추출하지 못했습니다. 이미지 PDF라면 OCR이 필요합니다.");
  const isNotice = /공고|모집|지원사업|신청 안내|모집요강|공모/.test(`${title} ${sourceLabel}`);
  const sectionInstruction = isNotice
    ? "공고문이므로 key와 title을 다음 8개로 정확히 고정하고 순서도 유지하세요: overview/사업개요, conditions/지원조건, eligibility/신청대상, schedule/모집일정, screening/심사방법, documents/제출서류, contact/문의처, other/기타. 빈 항목도 반드시 포함하세요. 영수증·계약서·견적서·세금계산서·사진·사후 지출증빙은 제출서류에 넣으세요."
    : "문서의 실제 목차와 용도에 맞춰 서로 겹치지 않는 항목을 동적으로 만드세요. 문의, 일정, 대상 등은 의미가 드러나는 간결한 key를 사용하세요.";
  const response = await trackedGeminiFetch("knowledge", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey, "Api-Revision": "2026-05-20" },
    body: JSON.stringify({
      model, store: false,
      system_instruction: `당신은 복지·비영리기관의 ${sourceKind} 지식 구조화 담당자입니다. 원문에 있는 사업 안내 정보만 사용하고, 사이트 메뉴·푸터·기관 홍보·다른 게시물·개인정보처리방침·반복 문구는 제외하세요. 금액·날짜·조건·제출자료·연락처는 생략하지 마세요. 각 항목 본문은 읽기 쉬운 한국어 마크다운으로 작성하세요. 제목 중복, 과도한 요약, 추측을 금지합니다. PDF는 실제 근거 페이지를 기록하고 웹사이트는 pages를 빈 배열로 반환하세요. 불확실하거나 원문이 깨진 항목은 review_required로 표시하세요. 의미 있는 사업 내용을 한 번만 반영하고 남는 관련 내용은 기타에 넣으세요. ${sectionInstruction}`,
      input: `${sourceKind} 제목: ${title}\n원본: ${sourceLabel}\n\n추출 원문:\n${cleanAnalysisInput(extractedText, sourceKind)}`,
      response_format: { type: "text", mime_type: "application/json", schema: {
        type: "object", properties: {
          documentType: { type: "string" },
          sections: { type: "array", items: { type: "object", properties: {
            key: { type: "string" }, title: { type: "string" }, markdown: { type: "string" },
            pages: { type: "array", items: { type: "integer" } },
            status: { type: "string", enum: ["ai_analyzed", "review_required"] },
          }, required: ["key", "title", "markdown", "pages", "status"] } },
        }, required: ["documentType", "sections"],
      } },
    }),
  });
  const payload = await response.json() as { error?: { message?: string }; steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> };
  if (!response.ok) throw new Error(payload.error?.message || "AI PDF 분석에 실패했습니다.");
  const output = payload.steps?.filter((step) => step.type === "model_output").flatMap((step) => step.content || []).filter((item) => item.type === "text").map((item) => item.text || "").join("").trim();
  if (!output) throw new Error("AI가 PDF 분석 결과를 반환하지 않았습니다.");
  const parsed = JSON.parse(output) as { documentType?: string; sections?: AiSection[] };
  let sections = (parsed.sections || []).map((section) => ({
    key: cleanText(section.key, 40), title: cleanText(section.title, 60), markdown: cleanText(section.markdown),
    pages: [...new Set((section.pages || []).map(Number).filter((page) => Number.isInteger(page) && page > 0))],
    status: section.status === "review_required" ? "review_required" : "ai_analyzed",
  })).filter((section) => section.key && section.title);
  if (isNotice) {
    const byKey = new Map(sections.map((section) => [section.key, section]));
    sections = NOTICE_SECTION_TEMPLATES.map(([key, sectionTitle]) => ({ key, title: sectionTitle, markdown: byKey.get(key)?.markdown || "", pages: byKey.get(key)?.pages || [], status: byKey.get(key)?.status || "review_required" }));
  }
  return validateKnowledgeContent(JSON.stringify({ version: 1, format: "structured-markdown", documentType: parsed.documentType || (isNotice ? "공고문" : "안내문"), analyzedBy: model, sections }));
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const DB = await ensureKnowledgeSchema();
    if (id) {
      const source = await DB.prepare("SELECT k.*, EXISTS(SELECT 1 FROM business_homepage_sources h WHERE h.business_id = k.business_id AND h.source_id = k.id) AS is_main, EXISTS(SELECT 1 FROM random_questions r WHERE r.knowledge_source_id = k.id) AS is_random FROM knowledge_sources k WHERE k.id = ?").bind(id).first<KnowledgeSourceRow>();
      if (!source) return Response.json({ error: "지식을 찾을 수 없습니다." }, { status: 404 });
      const denied = await requireAdminApi({ businessId: source.business_id }); if (denied) return denied;
      return Response.json({ source: { ...publicSource(source), content: source.content } });
    }

    const businessId = url.searchParams.get("businessId") || "";
    { const denied = await requireAdminApi({ businessId }); if (denied) return denied; }
    if (!await getBusiness(businessId)) return Response.json({ error: "올바른 사업을 선택해 주세요." }, { status: 400 });
    const result = await DB.prepare(
      "SELECT k.*, EXISTS(SELECT 1 FROM business_homepage_sources h WHERE h.business_id = k.business_id AND h.source_id = k.id) AS is_main, EXISTS(SELECT 1 FROM random_questions r WHERE r.knowledge_source_id = k.id) AS is_random FROM knowledge_sources k WHERE k.business_id = ? ORDER BY k.updated_at DESC",
    ).bind(businessId).all<KnowledgeSourceRow>();
    return Response.json({ sources: result.results.map(publicSource) });
  } catch (error) {
    console.error("Knowledge list failed", { requestId: crypto.randomUUID(), kind: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "지식 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let stage = "read-form";
  try {
    const isJson = request.headers.get("content-type")?.toLowerCase().includes("application/json");
    const json = isJson ? await request.json() as Record<string, unknown> : null;
    const form = isJson ? null : await request.formData();
    const value = (key: string) => json ? json[key] : form?.get(key);
    const businessId = String(value("businessId") || "");
    stage = "authorize";
    { const denied = await requireAdminApi({ businessId }); if (denied) return denied; }
    const type = String(value("type") || "");
    const title = cleanText(String(value("title") || ""), 120);
    if (!await getBusiness(businessId) || !TYPES.has(type) || !title) {
      return Response.json({ error: "사업, 자료 형식, 제목을 확인해 주세요." }, { status: 400 });
    }
    const kind = type as LimitedSourceKind;
    stage = "prepare-database";
    const DB = await ensureKnowledgeSchema();
    const count = await DB.prepare(COUNT_SOURCE_KIND_SQL).bind(businessId, kind).first<number>("COUNT(*)");
    if (Number(count) >= SOURCE_LIMITS[kind]) return Response.json({ error: sourceLimitMessage(kind) }, { status: 409 });

    const id = crypto.randomUUID();
    const now = Date.now();
    let sourceUrl: string | null = null;
    let fileKey: string | null = null;
    let fileName: string | null = null;
    let content = "";
    let status: "ready" | "stored" | "error" = "ready";

    if (type === "website") {
      const rawUrl = String(value("url") || "").trim();
      let parsed: URL;
      try { parsed = publicWebsiteUrl(rawUrl); }
      catch { return Response.json({ error: "공개 웹사이트의 http 또는 https 주소를 입력해 주세요." }, { status: 400 }); }
      sourceUrl = parsed.toString();
      try {
        const extractedText = htmlToText(await fetchWebsite(sourceUrl));
        if (extractedText.length < 40) status = "error";
        else content = await analyzeSourceWithGemini(title, sourceUrl, extractedText, "웹사이트");
      } catch (error) {
        if (error instanceof KnowledgeIntegrityError) throw error;
        status = "error";
      }
    } else if (type === "text") {
      content = validateKnowledgeContent(cleanAnalysisInput(String(value("content") || ""), "텍스트"));
    } else {
      const file = form?.get("file");
      const fileType = isJson ? String(value("fileType") || "") : file instanceof File ? file.type : "";
      if (fileType !== "application/pdf") {
        return Response.json({ error: "PDF 파일을 선택해 주세요." }, { status: 400 });
      }
      let fileBytes: Uint8Array;
      try {
        fileBytes = isJson
          ? new Uint8Array(Buffer.from(String(value("fileBase64") || ""), "base64"))
          : new Uint8Array(await (file as File).arrayBuffer());
      } catch { return Response.json({ error: "PDF 파일을 읽지 못했습니다." }, { status: 400 }); }
      if (!fileBytes.length || fileBytes.length > 20 * 1024 * 1024) return Response.json({ error: "PDF는 20MB 이하만 등록할 수 있습니다." }, { status: 400 });
      if (new TextDecoder("ascii").decode(fileBytes.subarray(0, 5)) !== "%PDF-") return Response.json({ error: "올바른 PDF 파일을 선택해 주세요." }, { status: 400 });
      fileName = cleanText(String(isJson ? value("fileName") : (file as File).name), 180);
      stage = "analyze-pdf";
      const converted = await convertPdfForAnalysis({
        bytes: fileBytes,
        fileName,
        browserExtractedText: String(value("extractedText") || ""),
      });
      const extractedText = cleanAnalysisInput(converted.text, "PDF");
      content = await analyzeSourceWithGemini(title, fileName, extractedText, "PDF");
      const { KNOWLEDGE_FILES } = knowledgeEnv();
      if (!KNOWLEDGE_FILES) throw new Error("Knowledge file storage is unavailable");
      const safeName = fileName.replace(/[^a-zA-Z0-9._가-힣-]/g, "-");
      fileKey = `knowledge/${businessId}/${id}/${safeName}`;
      stage = "store-pdf";
      const pdfBuffer = fileBytes.buffer.slice(fileBytes.byteOffset, fileBytes.byteOffset + fileBytes.byteLength) as ArrayBuffer;
      await KNOWLEDGE_FILES.put(fileKey, new Response(pdfBuffer).body!, {
        httpMetadata: { contentType: "application/pdf" },
        customMetadata: { title: encodeURIComponent(title), businessId },
      });
      status = "ready";
    }

    stage = "insert-database";
    const inserted = await DB.prepare(
      `INSERT INTO knowledge_sources (id, business_id, type, title, source_url, file_key, file_name, content, status, enabled, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ? WHERE (${COUNT_SOURCE_KIND_SQL}) < ?`,
    ).bind(id, businessId, type, title, sourceUrl, fileKey, fileName, content, status, now, now, businessId, kind, SOURCE_LIMITS[kind]).run();
    if (!inserted.meta.changes) {
      if (fileKey) await knowledgeEnv().KNOWLEDGE_FILES?.delete(fileKey);
      return Response.json({ error: sourceLimitMessage(kind) }, { status: 409 });
    }

    const result = await DB.prepare("SELECT * FROM knowledge_sources WHERE id = ?").bind(id).first<KnowledgeSourceRow>();
    return Response.json({ source: result ? publicSource(result) : null });
  } catch (error) {
    const message = error instanceof KnowledgeIntegrityError || error instanceof DocumentConversionError ? error.message : error instanceof Error && ["AI 분석을 위한 API 키가 설정되지 않았습니다.", "PDF에서 분석할 텍스트를 충분히 추출하지 못했습니다. 이미지 PDF라면 OCR이 필요합니다."].includes(error.message)
      ? error.message : "지식을 등록하지 못했습니다.";
    console.error("Knowledge create failed", {
      requestId: crypto.randomUUID(), stage,
      kind: error instanceof Error ? error.name : "UnknownError",
      reason: error instanceof Error ? error.message.slice(0, 300) : "Unknown failure",
    });
    return Response.json({ error: message }, { status: error instanceof KnowledgeIntegrityError || error instanceof DocumentConversionError ? 400 : 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const rawBody = await request.json() as unknown;
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      return Response.json({ error: "변경할 지식 정보를 확인해 주세요." }, { status: 400 });
    }
    const body = rawBody as { id?: unknown; enabled?: unknown; title?: unknown; content?: unknown; sharedAllBusinesses?: unknown };
    if (body.sharedAllBusinesses !== undefined && typeof body.sharedAllBusinesses !== "boolean") return Response.json({ error: "공통 적용 여부를 확인해 주세요." }, { status: 400 });
    if (typeof body.id !== "string" || !body.id.trim()) return Response.json({ error: "변경할 지식을 확인해 주세요." }, { status: 400 });
    const sourceId = body.id.trim();
    const DB = await ensureKnowledgeSchema();
    const source = await DB.prepare("SELECT business_id, title, content, shared_all_businesses FROM knowledge_sources WHERE id = ?").bind(sourceId).first<{ business_id: string; title: string; content: string; shared_all_businesses: number }>();
    if (!source) return Response.json({ error: "지식을 찾을 수 없습니다." }, { status: 404 });
    { const denied = await requireAdminApi({ businessId: source?.business_id }); if (denied) return denied; }
    if (typeof body.enabled === "boolean") {
      await DB.prepare("UPDATE knowledge_sources SET enabled = ?, updated_at = ? WHERE id = ?")
        .bind(body.enabled ? 1 : 0, Date.now(), sourceId).run();
    } else if (typeof body.sharedAllBusinesses === "boolean" && body.title === undefined && body.content === undefined) {
      // Scope changes must not rewrite or re-analyze the retained source content.
      await DB.prepare("UPDATE knowledge_sources SET shared_all_businesses = ?, updated_at = ? WHERE id = ?")
        .bind(Number(body.sharedAllBusinesses), Date.now(), sourceId).run();
    } else {
      const title = cleanText(typeof body.title === "string" ? body.title : "", 120);
      const content = validateKnowledgeContent(typeof body.content === "string" ? body.content.replace(/\u0000/g, "").trim() : "");
      if (!title) return Response.json({ error: "제목과 내용을 입력해 주세요." }, { status: 400 });
      const now = Date.now();
      await DB.batch([
        DB.prepare("INSERT INTO knowledge_source_revisions (id, source_id, title, content, reason, created_at) VALUES (?, ?, ?, ?, 'manual_update', ?)")
          .bind(crypto.randomUUID(), sourceId, source.title, source.content, now),
        DB.prepare("UPDATE knowledge_sources SET title = ?, content = ?, status = 'ready', updated_at = ?, shared_all_businesses = ? WHERE id = ?")
          .bind(title, content, now, typeof body.sharedAllBusinesses === "boolean" ? Number(body.sharedAllBusinesses) : source.shared_all_businesses, sourceId),
        DB.prepare("DELETE FROM knowledge_conflict_checks WHERE business_id = ?").bind(source.business_id),
      ]);
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Knowledge update failed", { requestId: crypto.randomUUID(), kind: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: error instanceof KnowledgeIntegrityError ? error.message : "지식 설정을 변경하지 못했습니다." }, { status: error instanceof KnowledgeIntegrityError ? 400 : 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ error: "삭제할 지식을 확인해 주세요." }, { status: 400 });
    const DB = await ensureKnowledgeSchema();
    const source = await DB.prepare("SELECT file_key, business_id FROM knowledge_sources WHERE id = ?").bind(id).first<{ file_key: string | null; business_id: string }>();
    { const denied = await requireAdminApi({ businessId: source?.business_id }); if (denied) return denied; }
    if (source?.file_key) await knowledgeEnv().KNOWLEDGE_FILES?.delete(source.file_key);
    await DB.prepare("DELETE FROM knowledge_sources WHERE id = ?").bind(id).run();
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Knowledge delete failed", { requestId: crypto.randomUUID(), kind: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "지식을 삭제하지 못했습니다." }, { status: 500 });
  }
}
