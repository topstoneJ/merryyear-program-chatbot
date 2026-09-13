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
  assert.match(page, /fileBase64: await fileToBase64\(file\)/);
  assert.match(page, /headers: \{ "Content-Type": "application\/json" \}/);
  assert.doesNotMatch(page, /await import\([^\n]*moduleUrl/);
  assert.ok(worker.length > 1_000_000);
});

test("PDF registration bypasses Azure multipart parsing and validates actual PDF bytes", async () => {
  const route = await readFile(new URL("app/api/knowledge/route.ts", root), "utf8");
  assert.match(route, /includes\("application\/json"\)/);
  assert.match(route, /Buffer\.from\(String\(value\("fileBase64"\)/);
  assert.match(route, /decode\(fileBytes\.subarray\(0, 5\)\) !== "%PDF-"/);
  assert.match(route, /new Response\(pdfBuffer\)\.body!/);
  assert.match(route, /customMetadata: \{ title: encodeURIComponent\(title\), businessId \}/);
});

test("production bundle contains the packaged PDF.js loader and public worker URL", async () => {
  const directory = new URL(".next/static/chunks/app/knowledge/", root);
  const files = (await readdir(directory)).filter((name) => name.endsWith(".js"));
  const bundle = (await Promise.all(files.map((name) => readFile(new URL(name, directory), "utf8")))).join("\n");
  assert.match(bundle, /pdfjs-6\.1\.200\/pdf\.worker\.min\.mjs/);
  assert.match(bundle, /Promise\.all\(\[n\.e\(/);
  assert.doesNotMatch(bundle, /Cannot find module/);
});
