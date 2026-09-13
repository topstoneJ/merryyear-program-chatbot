import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("PDF.js is bundled from the installed package and its worker ships publicly", async () => {
  const [page, worker] = await Promise.all([
    readFile(new URL("app/knowledge/page.tsx", root), "utf8"),
    readFile(new URL("public/vendor/pdfjs-6.1.200/pdf.worker.min.mjs", root)),
  ]);
  assert.match(page, /await import\("pdfjs-dist"\)/);
  assert.doesNotMatch(page, /await import\([^\n]*moduleUrl/);
  assert.ok(worker.length > 1_000_000);
});

test("production bundle contains the packaged PDF.js loader and public worker URL", async () => {
  const directory = new URL(".next/static/chunks/app/knowledge/", root);
  const files = (await readdir(directory)).filter((name) => name.endsWith(".js"));
  const bundle = (await Promise.all(files.map((name) => readFile(new URL(name, directory), "utf8")))).join("\n");
  assert.match(bundle, /pdfjs-6\.1\.200\/pdf\.worker\.min\.mjs/);
  assert.match(bundle, /Promise\.all\(\[n\.e\(/);
  assert.doesNotMatch(bundle, /Cannot find module/);
});
