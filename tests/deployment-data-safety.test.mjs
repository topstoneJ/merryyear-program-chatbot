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
  assert.match(envExample, /^ADMIN_BOOTSTRAP_REVISION=$/m);
  assert.match(ignore, /^\/azure-stage\*\/$/m);
  assert.match(ignore, /^\*\.db$/m);
  assert.match(ignore, /^\*\.backup$/m);
  assert.match(ignore, /^\/build\/$/m);
  assert.match(workflow, /creds: \$\{\{ secrets\.AZURE_CREDENTIALS \}\}/);
  assert.match(workflow, /cp \.next\/standalone\/server\.js deploy\/server\.js/);
  assert.match(workflow, /pnpm install --prod --frozen-lockfile --config\.node-linker=hoisted --dir runtime-deps/);
  assert.match(workflow, /cp -R runtime-deps\/node_modules deploy\/node_modules/);
  assert.match(workflow, /require\('\.\/deploy\/node_modules\/next\/dist\/server\/next'\)/);
  assert.match(workflow, /az webapp restart/);
  assert.doesNotMatch(workflow, /ADMIN_PASSWORD=/);
});

test('a revisioned bootstrap keeps exactly one configured super administrator without embedding credentials', async () => {
  const session = await readFile(new URL('../app/admin-session.ts', import.meta.url), 'utf8');
  assert.match(session, /ADMIN_BOOTSTRAP_REVISION/);
  assert.match(session, /UPDATE admin_accounts SET is_super_admin = 0/);
  assert.match(session, /DELETE FROM admin_accounts WHERE username = \?/);
  assert.match(session, /INSERT INTO data_repairs/);
  assert.doesNotMatch(session, /ADMIN_PASSWORD\s*=\s*["']/);
});
