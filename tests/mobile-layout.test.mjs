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

test("the mobile title block uses less top space", () => {
  assert.match(css, /\.intro \{ padding: 8px 4px 4px; transform: none; \}/);
  assert.match(css, /\.workspace \{[^}]*gap: 8px; padding: 10px 14px 24px; \}/);
  assert.match(css, /h1 \{[^}]*margin: 8px 0 12px;/);
  assert.match(css, /h1 \{[^}]*29px[^}]*line-height: 1\.35/);
  assert.doesNotMatch(css, /\.intro \{[^}]*translateY\(-20px\)/);
});

test("the stacked tablet home balances the space above and below the intro", () => {
  assert.match(css, /@media \(max-width: 1120px\)[\s\S]*?\.intro \{ padding-bottom: 0; transform: translateY\(-14px\); \}/);
});
