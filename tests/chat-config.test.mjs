import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("production and local defaults use the supported Gemini model", async () => {
  const [route, envExample] = await Promise.all([
    readFile(new URL("app/api/chat/route.ts", root), "utf8"),
    readFile(new URL(".env.example", root), "utf8"),
  ]);

  assert.match(route, /process\.env\.GEMINI_MODEL \|\| "gemini-3\.8-flash"/);
  assert.match(envExample, /^GEMINI_MODEL=gemini-3\.8-flash$/m);
  assert.doesNotMatch(`${route}\n${envExample}`, /gemini-3\.[56]-flash/);
});





test("PDF knowledge can be managed with document-specific dynamic sections", async () => {
  const page = await readFile(new URL("../app/knowledge/page.tsx", import.meta.url), "utf8");
  assert.match(page, /derivePdfSections/);
  assert.match(page, /데이터 확인 및 수정/);
  assert.doesNotMatch(page, /PDF 항목별 데이터 관리/);
  assert.match(page, /안내 항목/);
  assert.match(page, /관리자 수정/);
  assert.match(page, /원본 출처/);
  assert.match(page, /addDetailSection/);
  assert.match(page, /moveDetailSection/);
  for (const tab of ["사업개요", "지원조건", "신청대상", "모집일정", "심사방법", "제출서류", "문의처", "기타"]) {
    assert.match(page, new RegExp(`title: "${tab}"`));
  }
  assert.match(page, /사후 지출\|지출 내역/);
  assert.ok(page.indexOf("semanticTag: \"documents\"") < page.indexOf("semanticTag: \"benefit\""));
  assert.match(page, /structured-markdown/);
  assert.match(page, /마크다운 미리보기/);
  assert.match(page, /AI 분석/);
});

test("PDF upload uses Gemini structured JSON with markdown section bodies", async () => {
  const [route, knowledge] = await Promise.all([
    readFile(new URL("../app/api/knowledge/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/knowledge.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /analyzeSourceWithGemini/);
  assert.match(route, /gemini-3\.8-flash/);
  assert.match(route, /markdown: \{ type: "string" \}/);
  assert.match(route, /format: "structured-markdown"/);
  assert.match(knowledge, /buildAnswerKnowledge/);
});

test("website uploads use AI structure and exclude unrelated page chrome", async () => {
  const route = await readFile(new URL("../app/api/knowledge/route.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/knowledge/page.tsx", import.meta.url), "utf8");
  assert.match(route, /analyzeSourceWithGemini\(title, sourceUrl, extractedText, "웹사이트"\)/);
  assert.match(route, /사이트 메뉴·푸터·기관 홍보·다른 게시물/);
  assert.match(page, /payload\.source\.type === "pdf" \|\| payload\.source\.type === "website"/);
});


test("reusable institution branding settings are persisted and applied", async () => {
  const [settingsPage, settingsRoute, home, schema] = await Promise.all([
    readFile(new URL("../app/settings/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/settings/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/home-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  ]);
  for (const label of ["기관명", "연락처", "기관 로고", "메인 페이지 문구", "챗봇 기본 안내문", "메인 컬러"]) assert.match(settingsPage, new RegExp(label));
  assert.match(settingsRoute, /site_settings/);
  assert.match(schema, /siteSettings/);
  assert.match(home, /fetch\("\/api\/settings"\)/);
  assert.match(home, /siteSettings\.chatbotGreeting/);
  assert.match(home, /siteSettings\.primaryColor/);
  const apiPanel = await readFile(new URL("../app/settings/api-management-panel.tsx", import.meta.url), "utf8");
  assert.match(apiPanel, /<span>API 키<\/span>/);
  assert.doesNotMatch(settingsPage, /Gemini API 키|제미나이/);
  assert.match(apiPanel, /type="password"/);
  assert.match(settingsPage, /type="button" className="cancel-button"/);
  assert.match(settingsPage, /onClick=\{openPreview\}/);
  assert.match(settingsRoute, /encryptConfiguredGeminiApiKey/);
});
