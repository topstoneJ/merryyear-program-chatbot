import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("requested Azure UI and behavior updates are present without replacing storage adapters", async () => {
  const [knowledge, api, apiUi, answerSettings, answerUi, accountApi, accountUi, nav, loginApi, css, surfaces, pdfPage, runtime] = await Promise.all([
    source("db/knowledge.ts"), source("app/api/api-management/route.ts"), source("app/settings/api-management-panel.tsx"),
    source("app/answer-settings.ts"), source("app/settings/answer-settings-panel.tsx"), source("app/api/admin-accounts/route.ts"),
    source("app/settings/account-manager.tsx"), source("app/admin-nav.tsx"), source("app/api/admin-login/route.ts"),
    source("app/globals.css"), source("app/brand-surfaces.css"), source("app/knowledge/page.tsx"), source("db/runtime.ts"),
  ]);

  assert.match(runtime, /@azure\/storage-blob|postgres|pg/i);
  assert.match(knowledge, /GEMINI_API_KEY_DISABLED/);
  assert.match(api, /gemini_api_key_encrypted = \?/);
  assert.match(apiUi, /API 없음/);
  assert.match(apiUi, /usage\?\.apiKeyConfigured \? ` · 사용 모델/);
  assert.match(apiUi, /usage\?\.apiKeyConfigured && <p className="field-help">/);
  assert.match(apiUi, /API를 교체하면 각 API의 실제 호출 사용량이 모델별로 자동 합산됩니다/);

  assert.match(answerSettings, /답변 옵션은 최대 3개/);
  assert.match(answerUi, /희망하는 답변 방식을 최대 3개 체크해 주세요/);
  assert.match(answerUi, /selectedOptionCount >= 3/);
  assert.match(answerUi, /챗봇의 규칙/);
  assert.match(answerUi, /챗봇의 안내 방식/);
  assert.match(answerUi, /DISPLAY_RULES\.map/);
  const rulesSection = answerUi.slice(answerUi.indexOf('aria-labelledby="answer-rules-title"'), answerUi.indexOf('aria-labelledby="answer-options-title"'));
  assert.equal((rulesSection.match(/<table/g) || []).length, 1);

  assert.match(accountApi, /value\.length >= 8 && value\.length <= 20/);
  assert.match(accountApi, /8자 이상 20자 이하/);
  assert.match(accountUi, /영어 대소문자, 특수기호 포함 8자 이상/);
  assert.match(accountUi, /maxLength=\{20\}/);
  assert.match(accountUi, /value=\{editUsername\}/);

  assert.match(nav, /className="admin-link logout-link"/);
  assert.match(nav, /fetch\("\/api\/admin-login", \{ method: "DELETE" \}\)/);
  assert.match(nav, /window\.location\.assign\("\/"\)/);
  assert.match(loginApi, /Max-Age=0/);
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*\.knowledge-topbar \.topbar-actions[\s\S]*justify-content: safe center/);
  assert.match(css, /\.chat \{[^}]*border: 1px solid #8b77603d/);
  assert.match(css, /\.prompts button \{[^}]*border: 1px solid var\(--line\)/);
  assert.match(css, /\.answer\.review \{ background: var\(--brand-wash-soft\); border-color: #d9d9d9; \}/);
  assert.doesNotMatch(surfaces, /\.composer input:not\(:disabled\), \.prompts button/);
  assert.match(surfaces, /\.composer input:not\(:disabled\) \{ border-color: var\(--orange\); \}/);
  assert.match(pdfPage, /await import\("pdfjs-dist"\)/);
  assert.doesNotMatch(pdfPage, /await import\([^\n]*moduleUrl/);
});
