import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/home-client.tsx", import.meta.url), "utf8");

test("all answers reveal at a constant thirty characters per second", () => {
  assert.doesNotMatch(source, /CACHE_CONFIRMATION_MS|remainingConfirmation/);
  assert.match(source, /ANSWER_REVEAL_CHARACTERS_PER_SECOND = 30/);
  assert.match(source, /characters\.length \/ ANSWER_REVEAL_CHARACTERS_PER_SECOND \* 1000/);
  assert.doesNotMatch(source, /CACHE_REVEAL_MS/);
  assert.doesNotMatch(source, /response\.headers\.get\("x-chat-cache"\)/);
  assert.match(source, /requestAnimationFrame\(reveal\)/);
  assert.match(source, /<AnswerReveal answer=\{message\.answer\} \/>/);
});

test("answer animation preserves immediate accessible output", () => {
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /<span className="sr-only">\{answer\.text\}<\/span>/);
  assert.match(source, /if \(reduceMotion\) return <AnswerText text=\{answer\.text\} \/>/);
});
