import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/home-client.tsx", import.meta.url), "utf8");

test("all verified answers reveal at a constant thirty characters per second", () => {
  assert.match(source, /ANSWER_REVEAL_CHARACTERS_PER_SECOND = 30/);
  assert.match(source, /characters\.length \/ ANSWER_REVEAL_CHARACTERS_PER_SECOND \* 1000/);
  assert.match(source, /requestAnimationFrame\(reveal\)/);
  assert.match(source, /<AnswerReveal answer=\{message\.answer\} \/>/);
});

test("answer animation preserves immediate accessible output and reduced motion", () => {
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /className="sr-only" data-answer-text="true" data-answer-complete="true">\{answer\.text\}<\/span>/);
  assert.match(source, /if \(reduceMotion\) return <div data-answer-text="true" data-answer-complete="true">/);
});
