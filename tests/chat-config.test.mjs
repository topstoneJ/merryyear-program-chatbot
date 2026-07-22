import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("production and local defaults use the supported Gemini model", async () => {
  const [route, envExample] = await Promise.all([
    readFile(new URL("app/api/chat/route.ts", root), "utf8"),
    readFile(new URL(".env.example", root), "utf8"),
  ]);

  assert.match(route, /process\.env\.GEMINI_MODEL \|\| "gemini-3\.5-flash"/);
  assert.match(envExample, /^GEMINI_MODEL=gemini-3\.5-flash$/m);
  assert.doesNotMatch(`${route}\n${envExample}`, /gemini-3\.6-flash/);
});

test("income eligibility keeps conclusion-first answer contracts", async () => {
  const route = await readFile(new URL("app/api/chat/route.ts", root), "utf8");

  assert.match(route, /가능합니다\. 소득 조건만 보면 기준 이하입니다\./);
  assert.match(route, /불가능합니다\. 소득 조건 기준을 초과합니다\./);
  assert.match(route, /추가 정보가 필요합니다\. 가구원 수를 알려주세요\./);
  assert.match(route, /담당자 문의가 필요합니다\./);
});
