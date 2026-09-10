import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("deployment source contains no cloned runtime data or administrator password", async () => {
  const [snapshot, adminUsersMigration, knowledgeDb, envExample, ignore, workflow] = await Promise.all([
    readFile(new URL("drizzle/0020_clone_snapshot.sql", root), "utf8"),
    readFile(new URL("drizzle/0008_admin_users.sql", root), "utf8"),
    readFile(new URL("db/knowledge.ts", root), "utf8"),
    readFile(new URL(".env.example", root), "utf8"),
    readFile(new URL(".gitignore", root), "utf8"),
    readFile(new URL(".github/workflows/azure-deploy.yml", root), "utf8"),
  ]);

  assert.doesNotMatch(snapshot, /\bINSERT\b/i);
  assert.doesNotMatch(adminUsersMigration, /\bINSERT\b/i);
  assert.doesNotMatch(knowledgeDb, /INSERT OR IGNORE INTO admin_users/i);
  assert.match(envExample, /^ADMIN_ID=chatbot01$/m);
  assert.match(envExample, /^ADMIN_PASSWORD=$/m);
  assert.match(ignore, /^\/azure-stage\*\/$/m);
  assert.match(ignore, /^\*\.db$/m);
  assert.match(ignore, /^\*\.backup$/m);
  assert.match(ignore, /^\/build\/$/m);
  assert.match(workflow, /publish-profile: \$\{\{ secrets\.AZURE_WEBAPP_PUBLISH_PROFILE \}\}/);
  assert.doesNotMatch(workflow, /ADMIN_PASSWORD=/);
});
