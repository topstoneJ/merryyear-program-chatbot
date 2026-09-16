import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../app/document-converter.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const converter = {};
new Function("exports", code)(converter);

function withEnv(values, run) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  return Promise.resolve(run()).finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
}

test("uses PDF.js text when the Docling service is not configured", async () => {
  delete process.env.DOCLING_SERVICE_URL;
  const result = await converter.convertPdfForAnalysis({
    bytes: new TextEncoder().encode("%PDF-test"), fileName: "test.pdf", browserExtractedText: "[1쪽]\n기존 추출",
  });
  assert.equal(result.engine, "pdfjs");
  assert.equal(result.text, "[1쪽]\n기존 추출");
});

test("converts page-preserving Docling output and sends the shared secret", async () => withEnv({
  DOCLING_SERVICE_URL: "https://docling.internal/", DOCLING_SHARED_SECRET: "secret",
}, async () => {
  const result = await converter.convertPdfForAnalysis({
    bytes: new TextEncoder().encode("%PDF-test"), fileName: "공고.pdf", browserExtractedText: "fallback",
    fetcher: async (url, init) => {
      assert.equal(url, "https://docling.internal/v1/convert");
      assert.equal(init.headers["X-Docling-Token"], "secret");
      assert.ok(init.body instanceof FormData);
      return Response.json({ pages: [
        { page_number: 1, markdown: "# 사업 안내" },
        { page_number: 2, markdown: "|항목|내용|\n|-|-|" },
      ] });
    },
  });
  assert.equal(result.engine, "docling");
  assert.equal(result.text, "[1쪽]\n# 사업 안내\n\n[2쪽]\n|항목|내용|\n|-|-|");
}));

test("falls back to browser extraction when Docling is temporarily unavailable", async () => withEnv({
  DOCLING_SERVICE_URL: "https://docling.internal", DOCLING_SHARED_SECRET: "secret",
}, async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await converter.convertPdfForAnalysis({
      bytes: new TextEncoder().encode("%PDF-test"), fileName: "test.pdf", browserExtractedText: "[1쪽]\n대체 원문",
      fetcher: async () => new Response("failure", { status: 503 }),
    });
    assert.equal(result.engine, "pdfjs-fallback");
    assert.match(result.text, /대체 원문/);
  } finally { console.error = originalError; }
}));

test("fails safely when both Docling and the browser extraction are empty", async () => withEnv({
  DOCLING_SERVICE_URL: "https://docling.internal", DOCLING_SHARED_SECRET: "secret",
}, async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(() => converter.convertPdfForAnalysis({
      bytes: new TextEncoder().encode("%PDF-test"), fileName: "scan.pdf", browserExtractedText: "",
      fetcher: async () => new Response("failure", { status: 503 }),
    }), /PDF 문서 분석에 실패/);
  } finally { console.error = originalError; }
}));
