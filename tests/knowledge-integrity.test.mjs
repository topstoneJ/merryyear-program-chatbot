import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const output = {};
new Function("require", "exports", ts.transpileModule(await readFile(new URL("../app/knowledge/knowledge-integrity.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(require, output);

test("truncation markers and malformed structured content are rejected", () => {
  assert.throws(() => output.validateKnowledgeContent("원문 … [truncated for model]"), /잘린 데이터/);
  assert.throws(() => output.validateKnowledgeContent('{"format":"structured-markdown","sections":['), /형식이 손상/);
  assert.throws(() => output.validateKnowledgeContent('{"format":"structured-markdown","sections":[]}'), /안내 항목/);
});

test("valid structured content remains byte-for-byte unchanged", () => {
  const value = JSON.stringify({ format: "structured-markdown", sections: [{ key: "contact", title: "문의처", markdown: "02-0000-0000", pages: [1] }] });
  assert.equal(output.validateKnowledgeContent(value), value);
});

test("deployment migrations do not contain runtime knowledge or administrator records", async () => {
  const migrations = await readFile(new URL("../drizzle/0020_clone_snapshot.sql", import.meta.url), "utf8");
  assert.doesNotMatch(migrations, /\bINSERT\b/i);
});
