import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
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
  assert.match(workflow, /AZURE_WEBAPP_NAME: \$\{\{ vars\.AZURE_WEBAPP_NAME \}\}/);
  assert.match(workflow, /AZURE_RESOURCE_GROUP: \$\{\{ vars\.AZURE_RESOURCE_GROUP \}\}/);
  assert.match(workflow, /AZURE_WEBAPP_URL: \$\{\{ vars\.AZURE_WEBAPP_URL \}\}/);
  assert.doesNotMatch(workflow, /merryyear|열매나눔/i);
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

test('a fresh installation starts without institution or business seed data', async () => {
  const [knowledgeDb, home, layout] = await Promise.all([
    readFile(new URL('../db/knowledge.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/home-client.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8'),
  ]);
  const deployableDefaults = `${knowledgeDb}\n${home}\n${layout}`;
  assert.doesNotMatch(deployableDefaults, /열매나눔|merryyear|위기아동|사회적기업 시설/i);
  assert.doesNotMatch(knowledgeDb, /INSERT(?: OR IGNORE)? INTO businesses/i);
  assert.match(knowledgeDb, /기관명 미설정/);
  assert.match(home, /등록된 사업이 없습니다/);
});

test('the deployable public directory contains no institution-specific legacy assets', async () => {
  const publicFiles = new Set(await readdir(new URL('../public/', import.meta.url)));
  for (const file of [
    'merryyear-logo.png',
    'crisis-family-2026.pdf',
    'social-enterprise-2026.pdf',
    'social-enterprise-application-2026.hwp',
    'og.png',
    'default-social-logo.png',
    'favicon.png',
    'favicon.svg',
    'favicon-16x16.png',
    'favicon-32x32.png',
    'apple-touch-icon.png',
  ]) assert.equal(publicFiles.has(file), false, `${file} must not ship`);
});
