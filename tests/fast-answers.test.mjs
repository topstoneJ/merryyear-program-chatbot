import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { sourceLoader } from "./load-source.mjs";

const intents = sourceLoader()("app/fast-answer-intents.ts");

test("fast answer meanings recognize standalone FAQ wording and reject personal or compound questions", () => {
  assert.equal(intents.cacheIntentForGeneralQuestion("신청 자격을 알려주세요"), "eligibility");
  assert.equal(intents.cacheIntentForGeneralQuestion("누가 신청 대상인가요?"), "eligibility");
  assert.equal(intents.cacheIntentForGeneralQuestion("신청방법은?"), "application");
  assert.equal(intents.cacheIntentForGeneralQuestion("신청 방법과 신청 기간을 알려주세요"), null);
  assert.equal(intents.cacheIntentForGeneralQuestion("제가 30살인데 신청할 수 있나요?"), null);
  assert.equal(intents.FAST_ANSWER_INTENTS.length, 7);
});

test("business management exposes persistent traffic-light fast answer controls", async () => {
  const [page, css, api, schema] = await Promise.all([
    readFile(new URL("../app/knowledge/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/fast-answers/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/azure-schema.ts", import.meta.url), "utf8"),
  ]);
  for (const text of ["빠른답변 완료", "빠른답변 확인", "빠른답변 필요", "개별 재생성", "전체 재생성", "편집 답변 검증·저장"]) assert.match(page, new RegExp(text));
  assert.match(css, /fast-answer-item\.green/); assert.match(css, /fast-answer-item\.orange/); assert.match(css, /fast-answer-item\.red/);
  assert.match(api, /requireAdminApi\(\{ businessId \}\)/);
  assert.match(api, /forceRefresh: true/);
  assert.match(api, /candidateText:/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS fast_answers/);
});
