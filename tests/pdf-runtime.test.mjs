import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("PDF.js remains a browser URL import and its runtime files ship publicly", async () => {
  const [page, pdf, worker] = await Promise.all([
    readFile(new URL("app/knowledge/page.tsx", root), "utf8"),
    readFile(new URL("public/vendor/pdfjs-6.1.200/pdf.min.mjs", root)),
    readFile(new URL("public/vendor/pdfjs-6.1.200/pdf.worker.min.mjs", root)),
  ]);
  assert.match(page, /import\(\/\* webpackIgnore: true \*\/ \/\* @vite-ignore \*\/ moduleUrl\)/);
  assert.ok(pdf.length > 400_000);
  assert.ok(worker.length > 1_000_000);
});

test("production bundle does not replace the PDF.js URL with an empty module context", async () => {
  const directory = new URL(".next/static/chunks/app/knowledge/", root);
  const files = (await readdir(directory)).filter((name) => name.endsWith(".js"));
  const bundle = (await Promise.all(files.map((name) => readFile(new URL(name, directory), "utf8")))).join("\n");
  assert.match(bundle, /pdfjs-6\.1\.200\/pdf\.min\.mjs/);
  assert.doesNotMatch(bundle, /Cannot find module/);
});
