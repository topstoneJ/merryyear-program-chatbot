import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/home-client.tsx", import.meta.url), "utf8");

test("verified answers display immediately without partial-text animation", () => {
  assert.doesNotMatch(source, /CACHE_CONFIRMATION_MS|remainingConfirmation/);
  assert.doesNotMatch(source, /ANSWER_REVEAL_CHARACTERS_PER_SECOND/);
  assert.doesNotMatch(source, /CACHE_REVEAL_MS/);
  assert.doesNotMatch(source, /response\.headers\.get\("x-chat-cache"\)/);
  assert.doesNotMatch(source, /requestAnimationFrame\(reveal\)/);
  assert.match(source, /<AnswerReveal answer=\{message\.answer\} \/>/);
});

test("a single complete accessible answer node is available to readers and collectors", () => {
  assert.doesNotMatch(source, /<span className="sr-only">\{answer\.text\}<\/span>/);
  assert.match(source, /data-answer-text="true" data-answer-complete="true"><AnswerText text=\{answer\.text\}/);
});
