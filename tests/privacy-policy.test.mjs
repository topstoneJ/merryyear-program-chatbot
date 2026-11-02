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
  const refreshed = output.refreshPrivacyPolicyDraft(output.DEFAULT_PRIVACY_POLICY, { server: "Microsoft Azure App Service", region: "Korea Central", apiProvider: "Google", apiModel: "gemini-test" });
  assert.match(refreshed, /서비스 운영 서버: Microsoft Azure App Service\(Korea Central\)/);
  assert.match(refreshed, /Google API\(gemini-test\)/);
  assert.doesNotMatch(refreshed, /OpenAI GPT API/);
  assert.match(refreshed, /4\. 제3자 제공/);
  assert.match(output.DEFAULT_PRIVACY_POLICY, /국외 이전/);
  assert.doesNotMatch(output.DEFAULT_PRIVACY_POLICY, /Korea Central|OpenAI GPT API|최대 30일|2026년 9월 17일/);
  assert.match(output.DEFAULT_PRIVACY_POLICY, /IP 주소의 해시값/);
  assert.match(output.DEFAULT_PRIVACY_POLICY, /365일/);
  assert.match(output.DEFAULT_PRIVACY_POLICY, /기관이 설정한 정기 작업/);
  assert.match(refreshed, /데이터베이스와 파일 저장소의 지역은 웹서버 지역과 다를 수/);
  assert.match(refreshed, /반복 질문/);
  assert.match(refreshed, /승인 FAQ/);
  const openai = output.refreshPrivacyPolicyDraft(output.DEFAULT_PRIVACY_POLICY, { server: "현재 배포 서버", apiProvider: "OpenAI" });
  assert.match(openai, /store: false/);
  assert.match(openai, /모든 로그 보관이 중단되는 것은 아닙니다/);
  assert.match(openai, /\n4\. 제3자 제공/);
  const custom = "기관이 확정한 별도 문안";
  assert.equal(output.resolvePrivacyPolicy(custom, "기관", "연락처"), custom);
  assert.equal(output.resolvePrivacyPolicy("{개인정보담당부서}: {연락처}", "기관", "  "), "기관 개인정보 담당부서: 기관 개인정보 담당부서");
  const draft = output.applyPrivacyInquiry("1. 기존 조항\n기관 확정 내용\n\n7. 개인정보 문의\n옛 연락처\n\n8. 시행일\n2026-11-02", "실제 담당팀", "문의공용@example.org");
  assert.match(draft, /담당 부서: 실제 담당팀\n연락처: 문의공용@example\.org/);
  assert.match(draft, /1\. 기존 조항\n기관 확정 내용/);
  assert.match(draft, /8\. 시행일\n2026-11-02/);
  assert.doesNotMatch(draft, /옛 연락처/);
  assert.deepEqual(output.privacyInquiryFields(draft), { department: "실제 담당팀", contact: "문의공용@example.org" });
  const inherited = output.applyPrivacyInquiry(draft, "실제 담당팀", "");
  assert.match(output.resolvePrivacyPolicy(inherited, "기관", "02-123-4567"), /담당 부서: 실제 담당팀\n연락처: 02-123-4567/);
  assert.equal(output.privacyInquiryFields(inherited).contact, "");
  assert.equal(output.applyPrivacyInquiry(inherited, "실제 담당팀", ""), inherited, "repeated application must not duplicate the inquiry section");
  const emptyFields = output.privacyInquiryFields("7. 개인정보 문의\n담당 부서:\n연락처:\n접수 내용: 문의");
  assert.deepEqual(emptyFields, { department: "", contact: "" });
});

test("main and settings screens expose readable and editable privacy dialogs", async () => {
  const [home, settings, css] = await Promise.all([
    readFile(new URL("app/home-client.tsx", root), "utf8"),
    readFile(new URL("app/settings/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.match(home, /<div className=\{`home-utility-actions\$\{isAdminGuide \? " guide-actions" : ""\}`\}><button className=\{`share-business/);
  assert.ok(home.indexOf("share-business") < home.indexOf("privacy-home-button"));
  assert.ok(home.indexOf("home-utility-actions") > home.indexOf("homepage-slot"));
  assert.match(home, /aria-labelledby="privacy-policy-title"/);
  assert.match(settings, /id="privacy-editor-title">개인정보처리방침<\/h2>/);
  assert.doesNotMatch(settings, /className="modal-kicker">메인 화면/);
  assert.match(settings, /onClick=\{openPrivacyEditor\}>내용 편집<\/button>/);
  assert.match(settings, /privacyEditorOpen &&/);
  assert.match(settings, /privacy-policy-only/);
  assert.match(settings, /privacy-policy-refresh/);
  assert.match(settings, /privacyRefreshing \? "수정본 생성 중…" : "새로고침"/);
  assert.match(settings, /maxLength=\{20_000\}/);
  assert.doesNotMatch(settings, /일반 텍스트로 입력해 주세요\. 줄바꿈은 메인 팝업에도 그대로 적용됩니다\./);
  assert.match(css, /\.home-utility-actions \{[^}]*justify-content: flex-end/);
  assert.match(css, /\.home-utility-actions\.guide-actions \{[^}]*margin-top: 14px/);
  assert.match(css, /\.privacy-home-button \{[^}]*min-height: 34px/);
  assert.match(css, /\.share-business \{[^}]*min-height: 34px/);
  assert.match(css, /\.privacy-editor-modal > h2 \{ font-weight: 800; \}/);
  assert.match(css, /\.privacy-policy-modal/);
  assert.match(css, /\.privacy-policy-modal h2 \{[^}]*font-weight: 800/);
  assert.match(css, /\.answer-settings-actions \{ position: static;/);
  assert.doesNotMatch(css, /\.answer-settings-actions \{[^}]*position: sticky/);
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
