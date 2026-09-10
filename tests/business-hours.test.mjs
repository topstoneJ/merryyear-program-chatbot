import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../app/business-hours.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const hours = {};
new Function("exports", code)(hours);

test("business-specific phone hours determine off-hours in Korea", () => {
  assert.equal(hours.isOutsideBusinessHours(Date.parse("2026-09-07T00:30:00Z"), "평일 09:00~11:00"), false);
  assert.equal(hours.isOutsideBusinessHours(Date.parse("2026-09-07T02:30:00Z"), "평일 09:00~11:00"), true);
  assert.equal(hours.isOutsideBusinessHours(Date.parse("2026-09-06T00:30:00Z"), "평일 09:00~11:00"), true);
  assert.equal(hours.isOutsideBusinessHours(Date.parse("2026-09-06T00:30:00Z"), "매일 09:00~11:00"), false);
});
