import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("the public mobile layout stays within the viewport", () => {
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*?\.public-shell \{[^}]*overflow-x: clip/);
  assert.match(css, /\.topbar \{[^}]*max-width: 100%;[^}]*min-width: 0/);
  assert.match(css, /\.workspace \{[^}]*max-width: 100%;[^}]*min-width: 0/);
  assert.match(css, /\.intro, \.chat \{[^}]*max-width: 100%;[^}]*min-width: 0/);
});

test("the mobile title block is no longer pulled toward the topbar", () => {
  assert.match(css, /\.intro \{ padding: 24px 4px 8px; transform: none; \}/);
  assert.doesNotMatch(css, /\.intro \{[^}]*translateY\(-20px\)/);
});
