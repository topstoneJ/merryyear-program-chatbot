import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("section bullets are visually distinct from detail bullets", async () => {
  const route = await readFile(new URL("../app/api/chat/route.ts", import.meta.url), "utf8");
  assert.match(route, /function distinguishSectionBullets/);
  assert.match(route, /startsSection/);
  assert.match(route, /◆/);
  const settings = await readFile(new URL("../app/answer-settings.ts", import.meta.url), "utf8");
  assert.match(settings, /소제목은 ◆, 세부 항목은 •/);
  assert.doesNotMatch(route, /답변 형식: 개조식/);
  assert.match(route, /distinguishSectionBullets\(removeMarkdownEmphasis/);
});
