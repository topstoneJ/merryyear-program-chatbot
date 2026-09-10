import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("administrator edit UI supports username changes and the required password policy", async () => {
  const manager = await readFile(new URL("app/settings/account-manager.tsx", root), "utf8");
  assert.match(manager, /<h2>관리자 수정<\/h2>/);
  assert.match(manager, /<span>아이디<\/span><input autoFocus maxLength=\{60\} autoComplete="username" value=\{editUsername\}/);
  assert.match(manager, /영어 대소문자, 특수기호 포함 8자 이상/);
  assert.match(manager, /type="password" maxLength=\{20\}/);
  assert.doesNotMatch(manager, /20자까지|최대 20자/);
  assert.match(manager, /\!validPassword\(password\)/);
});

test("administrator permissions include super administrator beside settings access", async () => {
  const manager = await readFile(new URL("app/settings/account-manager.tsx", root), "utf8");
  assert.match(manager, /설정화면 접근<\/label><label><input type="checkbox" disabled=\{!canManageSuperAdmins\} checked=\{account\.isSuperAdmin\}/);
  assert.match(manager, /isSuperAdmin: canSuperAdmin/);
  assert.match(manager, /isSuperAdmin: account\.isSuperAdmin/);
});

test("administrator account API validates credentials and protects super administrator assignment", async () => {
  const route = await readFile(new URL("app/api/admin-accounts/route.ts", root), "utf8");
  assert.match(route, /UPDATE admin_accounts SET username = \?/);
  assert.match(route, /value\.length <= 20/);
  assert.match(route, /\/\[a-z\]\//);
  assert.match(route, /\/\[A-Z\]\//);
  assert.match(route, /최고관리자만 최고관리자를 지정할 수 있습니다/);
  assert.match(route, /최고관리자는 한 명 이상 필요합니다/);
});
