import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("policy rule approval is absent from chat, management UI and schema initialization", async () => {
  const files = await Promise.all([
    "app/api/chat/route.ts",
    "app/knowledge/page.tsx",
    "db/knowledge.ts",
    "db/azure-schema.ts",
  ].map(path => readFile(new URL(path, root), "utf8")));
  const source = files.join("\n");
  assert.doesNotMatch(source, /policy-rules|policy_versions|PolicyPanel|loadActivePolicyRules|정책 규칙표/);
});

test("policy rule endpoints and implementation files are removed", async () => {
  for (const path of [
    "app/api/policy-rules/route.ts",
    "app/knowledge/policy-panel.tsx",
    "app/policy-rules.ts",
    "db/policy-store.ts",
  ]) await assert.rejects(access(new URL(path, root)));
});
