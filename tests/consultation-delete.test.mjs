import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const code = ts.transpileModule(await readFile(new URL("../app/api/consultations/route.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
async function remove(account, id = "record-1", changes = 1) {
  const exports = {};
  const calls = [];
  const dependencies = {
    "@/db/consultation-decision": {},
    "@/app/admin-session": { getAdminSession: async () => account, accountBusinessIds: a => a.businessIds || [] },
    "@/db/knowledge": { ensureKnowledgeSchema: async () => ({ prepare(sql) { return { bind(value) { calls.push({ sql, value }); return { first: async () => ({business_id:"allowed"}), run: async () => ({ meta: { changes } }) }; } }; } }) },
  };
  new Function("require", "exports", code)((name) => dependencies[name], exports);
  const response = await exports.DELETE(new Request(`https://test/api/consultations?id=${encodeURIComponent(id)}`, { method: "DELETE" }));
  return { status: response.status, calls };
}
test("anonymous and non-master admins cannot delete, including settings admins", async () => {
  for (const account of [null, { is_super_admin: 0, can_manage_settings: 1 }]) {
    const result = await remove(account);
    assert.equal(result.status, account ? 403 : 401);
    assert.equal(result.calls.length, 0);
  }
});
test("master deletion targets exactly the selected record with parameter binding", async () => {
  const result = await remove({ is_super_admin: 1 });
  assert.equal(result.status, 200);
  assert.deepEqual(result.calls, [{ sql: "DELETE FROM consultations WHERE id = ?", value: "record-1" }]);
});
test("missing IDs and already-deleted records are reported", async () => {
  assert.equal((await remove({ is_super_admin: 1 }, "")).status, 400);
  assert.equal((await remove({ is_super_admin: 1 }, "record-1", 0)).status, 404);
});

test("delegated deletion is restricted to the assigned businesses and requires view permission", async () => {
  const granted={is_super_admin:0,can_view_consultations:1,can_delete_consultations:1,businessIds:['allowed']};
  assert.equal((await remove(granted)).status,200);
  const forbidden=await remove({...granted,businessIds:['other']});assert.equal(forbidden.status,403);assert.ok(!forbidden.calls.some(c=>c.sql.startsWith('DELETE')));
  assert.equal((await remove({...granted,can_view_consultations:0})).status,403);
});
