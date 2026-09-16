const MAX_PDF_BYTES = 20 * 1024 * 1024;

type DoclingPage = {
  page_number?: unknown;
  markdown?: unknown;
};

type DoclingResponse = {
  pages?: unknown;
};

export class DocumentConversionError extends Error {}

function serviceConfig() {
  const endpoint = process.env.DOCLING_SERVICE_URL?.trim().replace(/\/$/, "");
  if (!endpoint) return null;
  const token = process.env.DOCLING_SHARED_SECRET?.trim();
  if (!token) throw new DocumentConversionError("문서 분석 서비스 인증 설정이 없습니다.");
  let url: URL;
  try { url = new URL(endpoint); }
  catch { throw new DocumentConversionError("문서 분석 서비스 주소가 올바르지 않습니다."); }
  if (!/^https?:$/.test(url.protocol)) throw new DocumentConversionError("문서 분석 서비스 주소가 올바르지 않습니다.");
  return { endpoint: url.toString().replace(/\/$/, ""), token };
}

function browserFallback(value: string) {
  return value.replace(/\u0000/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function parsePages(payload: DoclingResponse) {
  if (!Array.isArray(payload.pages)) throw new DocumentConversionError("문서 분석 결과 형식이 올바르지 않습니다.");
  const pages = (payload.pages as DoclingPage[]).flatMap((page) => {
    const pageNumber = Number(page?.page_number);
    const markdown = typeof page?.markdown === "string" ? page.markdown.trim() : "";
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || !markdown) return [];
    return [`[${pageNumber}쪽]\n${markdown}`];
  });
  if (!pages.length) throw new DocumentConversionError("문서 분석 결과에서 내용을 찾지 못했습니다.");
  return pages.join("\n\n");
}

export async function convertPdfForAnalysis(options: {
  bytes: Uint8Array;
  fileName: string;
  browserExtractedText: string;
  fetcher?: typeof fetch;
}) {
  const fallback = browserFallback(options.browserExtractedText);
  const config = serviceConfig();
  if (!config) return { text: fallback, engine: "pdfjs" as const };
  if (!options.bytes.length || options.bytes.length > MAX_PDF_BYTES) {
    throw new DocumentConversionError("PDF는 20MB 이하만 분석할 수 있습니다.");
  }

  const form = new FormData();
  const pdfBuffer = options.bytes.buffer.slice(
    options.bytes.byteOffset,
    options.bytes.byteOffset + options.bytes.byteLength,
  ) as ArrayBuffer;
  form.set("file", new Blob([pdfBuffer], { type: "application/pdf" }), options.fileName || "document.pdf");

  const timeoutMs = Math.min(Math.max(Number(process.env.DOCLING_TIMEOUT_MS) || 180_000, 10_000), 600_000);
  try {
    const response = await (options.fetcher || fetch)(`${config.endpoint}/v1/convert`, {
      method: "POST",
      headers: { "X-Docling-Token": config.token },
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`Docling HTTP ${response.status}`);
    return { text: parsePages(await response.json() as DoclingResponse), engine: "docling" as const };
  } catch (error) {
    console.error("Docling conversion failed", {
      kind: error instanceof Error ? error.name : "UnknownError",
      reason: error instanceof Error ? error.message.slice(0, 200) : "Unknown failure",
    });
    if (fallback) return { text: fallback, engine: "pdfjs-fallback" as const };
    throw new DocumentConversionError("PDF 문서 분석에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  }
}
