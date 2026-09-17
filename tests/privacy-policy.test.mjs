import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const root = new URL("../", import.meta.url);

test("privacy policy placeholders use the configured institution details", async () => {
  const source = await readFile(new URL("app/privacy-policy.ts", root), "utf8");
  const output = {};
  new Function("exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(output);
  const resolved = output.resolvePrivacyPolicy("{기관명} 문의: {연락처}", "테스트재단", "02-123-4567");
  assert.equal(resolved, "테스트재단 문의: 02-123-4567");
  assert.match(output.DEFAULT_PRIVACY_POLICY, /국외 이전/);
  assert.match(output.DEFAULT_PRIVACY_POLICY, /최대 55일/);
});

test("main and settings screens expose readable and editable privacy dialogs", async () => {
  const [home, settings, css] = await Promise.all([
    readFile(new URL("app/home-client.tsx", root), "utf8"),
    readFile(new URL("app/settings/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.match(home, /<div className="home-utility-actions"><button className=\{`share-business/);
  assert.ok(home.indexOf("share-business") < home.indexOf("privacy-home-button"));
  assert.ok(home.indexOf("home-utility-actions") > home.indexOf("homepage-slot"));
  assert.match(home, /aria-labelledby="privacy-policy-title"/);
  assert.match(settings, /id="privacy-editor-title">개인정보처리방침<\/h2>/);
  assert.doesNotMatch(settings, /className="modal-kicker">메인 화면/);
  assert.match(settings, /onClick=\{openPrivacyEditor\}>내용 편집<\/button>/);
  assert.match(settings, /privacyEditorOpen &&/);
  assert.match(settings, /privacy-policy-only/);
  assert.match(settings, /maxLength=\{20_000\}/);
  assert.doesNotMatch(settings, /일반 텍스트로 입력해 주세요\. 줄바꿈은 메인 팝업에도 그대로 적용됩니다\./);
  assert.match(css, /\.home-utility-actions \{[^}]*justify-content: flex-end/);
  assert.match(css, /\.privacy-home-button \{[^}]*min-height: 34px/);
  assert.match(css, /\.share-business \{[^}]*min-height: 34px/);
  assert.match(css, /\.privacy-editor-modal > h2 \{ font-weight: 800; \}/);
  assert.match(css, /\.privacy-policy-modal/);
  assert.match(css, /\.privacy-editor-modal/);
});

test("privacy policy persists through public settings and both database backends", async () => {
  const [route, publicSettings, schema, azure, migration] = await Promise.all([
    readFile(new URL("app/api/settings/route.ts", root), "utf8"),
    readFile(new URL("app/public-settings.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("db/azure-schema.ts", root), "utf8"),
    readFile(new URL("drizzle/0026_privacy_policy.sql", root), "utf8"),
  ]);
  assert.match(route, /UPDATE site_settings SET privacy_policy = \?, updated_at = \?/);
  assert.match(publicSettings, /privacyPolicy: row\.privacy_policy/);
  assert.match(schema, /privacyPolicy: text\("privacy_policy"\)/);
  assert.match(azure, /ADD COLUMN IF NOT EXISTS privacy_policy/);
  assert.match(migration, /ADD COLUMN privacy_policy/);
});
