import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const code = ts.transpileModule(await readFile(new URL("../app/answer-text.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
new Function("require", "exports", code)(createRequire(import.meta.url), exports);
const render = (text) => renderToStaticMarkup(createElement(exports.default, { text }));

test("section titles render bold without diamonds and preserve list items", () => {
  const html = render("담당자는 손오공입니다.\n\n◆ 담당자 안내\n• 이름: 손오공\n\n");
  assert.ok(html.includes("<strong>담당자 안내</strong>"));
  assert.ok(!html.includes("◆"));
  assert.ok(html.includes("• 이름: 손오공"));
  assert.ok(html.endsWith("• 이름: 손오공</span></p>"));
});
test("markdown headings are supported and arbitrary HTML is escaped", () => {
  assert.ok(render("**신청 대상**").includes("<strong>신청 대상</strong>"));
  assert.ok(render("<script>alert(1)</script>").includes("&lt;script&gt;"));
});
