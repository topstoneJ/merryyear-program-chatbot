import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("data management supports dynamic businesses and editable knowledge", async () => {
  const page = await readFile(new URL("app/knowledge/page.tsx", root), "utf8");
  assert.match(page, /사업별 데이터/);
  assert.match(page, /신규 사업 추가/);
  assert.match(page, /사업명 수정/);
  assert.match(page, /등록 데이터 확인 및 수정/);
  assert.match(page, /\/api\/businesses/);
  assert.match(page, /\/api\/knowledge\?id=/);
});

test("public answers omit confidence labels", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  assert.doesNotMatch(page, /근거 신뢰도/);
  assert.doesNotMatch(page, /신뢰도 \$\{message\.answer\.confidence\}/);
});

test("random text prompts create persistent multi-select knowledge", async () => {
  const [page, route, schema, exportRoute] = await Promise.all([
    readFile(new URL("app/knowledge/page.tsx", root), "utf8"),
    readFile(new URL("app/api/random-question/route.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("app/api/export/route.ts", root), "utf8"),
  ]);
  assert.match(page, /텍스트\(랜덤\)/);
  assert.match(page, /type="checkbox"/);
  assert.match(page, /복수 선택 가능/);
  assert.match(page, /새로운 랜덤 질문으로 바꿨습니다/);
  assert.match(route, /status = 'completed'/);
  assert.match(route, /INSERT INTO knowledge_sources/);
  assert.match(schema, /randomQuestions/);
  assert.match(exportRoute, /randomQuestions/);
});

test("consultation history defaults to one month and exposes summaries", async () => {
  const page = await readFile(new URL("app/consultations/page.tsx", root), "utf8");
  const route = await readFile(new URL("app/api/consultations/route.ts", root), "utf8");
  assert.match(page, /monthAgo\.setMonth\(monthAgo\.getMonth\(\) - 1\)/);
  assert.match(page, /상담 내역 요약/);
  assert.match(page, /상담 내역과 요약/);
  assert.match(route, /byDecision/);
  assert.match(route, /byCategory/);
});

test("Drive export is protected and versioned", async () => {
  const route = await readFile(new URL("app/api/export/route.ts", root), "utf8");
  assert.match(route, /DRIVE_EXPORT_KEY/);
  assert.match(route, /authorization/);
  assert.match(route, /dataVersion/);
  assert.match(route, /Cache-Control/);
});
