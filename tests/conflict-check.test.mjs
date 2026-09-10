import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function moduleFrom(path, dependencies = {}, fetchMock) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("require", "exports", "fetch", 'const originalRequire = require; require = (name) => name === "@/db/api-usage" ? { trackedGeminiFetch: (_purpose, init) => fetch("https://generativelanguage.googleapis.com/v1/interactions", init) } : originalRequire(name);\n' + code)((id) => {
    if (!(id in dependencies)) throw new Error(`Unexpected dependency: ${id}`);
    return dependencies[id];
  }, exports, fetchMock);
  return exports;
}
const core = await moduleFrom("../db/conflict-check.ts");
const rows = [
  { id: "a", business_id: "crisis", title: "공고", content: "담당자: 박영민", enabled: 1, status: "ready", updated_at: 1 },
  { id: "b", business_id: "crisis", title: "변경 안내", content: "담당자: 손오공", enabled: 1, status: "ready", updated_at: 2 },
];
const conflict = { left: { sourceId: "a", partId: "0", quote: "담당자: 박영민" }, right: { sourceId: "b", partId: "0", quote: "담당자: 손오공" }, reason: "동일 사업 담당자 이름이 다릅니다." };
async function harness(options = {}) {
  let reads = 0, writes = 0, calls = 0;
  const DB = { prepare(sql) { return { bind(...args) { return {
    async all() { assert.equal(args[0], "crisis"); reads++; return { results: options.changed && reads > 1 ? [...rows, { ...rows[0], id: "c" }] : options.rows || rows }; },
    async first() { return options.cache || null; },
    async run() { writes++; },
  }; } }; } };
  const route = await moduleFrom("../app/api/knowledge/conflicts/route.ts", {
    "@/app/admin-session": { requireAdminApi: async () => options.denied ? Response.json({}, { status: 403 }) : null },
    "@/db/knowledge": { ensureKnowledgeSchema: async () => DB, getConfiguredGeminiApiKey: async () => "test-only" },
    "@/db/conflict-check": core,
  }, async (_url, init) => {
    calls++;
    const sent = JSON.parse(init.body);
    assert.equal(sent.store, false);
    const docs = JSON.parse(sent.input);
    assert.equal(docs.length, 2);
    if (options.fail) return Response.json({}, { status: 503 });
    return Response.json({ steps: [{ type: "model_output", content: [{ type: "text", text: JSON.stringify(options.result || { checkedSourceIds: ["a", "b"], conflicts: [conflict] }) }] }] });
  });
  const response = options.readOnly ? await route.GET(new Request("https://test/api/knowledge/conflicts?businessId=crisis")) : await route.POST(new Request("https://test/api/knowledge/conflicts", { method: "POST", body: JSON.stringify({ businessId: "crisis" }) }));
  return { status: response.status, body: await response.json(), writes, calls, reads };
}
test("conflicting staff names preserve exact source evidence for both documents", async () => {
  const result = await harness();
  assert.equal(result.status, 200); assert.equal(result.writes, 1);
  assert.deepEqual(result.body.report.conflicts, [conflict]);
});
test("complete clean response is distinct from failure", async () => {
  const clean = await harness({ result: { checkedSourceIds: ["a", "b"], conflicts: [] } });
  assert.equal(clean.status, 200); assert.deepEqual(clean.body.report.conflicts, []);
  const failed = await harness({ fail: true });
  assert.equal(failed.status, 502); assert.equal(failed.writes, 0); assert.equal(failed.body.report, undefined);
});
test("invented quotations and incomplete coverage never become clean reports", async () => {
  for (const result of [{ checkedSourceIds: ["a"], conflicts: [] }, { checkedSourceIds: ["a", "b"], conflicts: [{ ...conflict, left: { ...conflict.left, quote: "없는 원문" } }] }]) {
    const response = await harness({ result }); assert.equal(response.status, 502); assert.equal(response.writes, 0);
  }
});
test("business permission denial prevents reads and AI calls", async () => {
  const result = await harness({ denied: true }); assert.equal(result.status, 403); assert.equal(result.reads, 0); assert.equal(result.calls, 0);
});
test("changed data during comparison is rejected rather than saved", async () => {
  const result = await harness({ changed: true }); assert.equal(result.status, 409); assert.equal(result.writes, 0);
});
test("unchanged snapshots reuse stored result without AI call", async () => {
  const result = await harness({ cache: { report: JSON.stringify({ conflicts: [] }) } }); assert.equal(result.calls, 0); assert.equal(result.status, 200);
});
test("unreadable sources are explicitly listed and no comparison is fabricated", async () => {
  const result = await harness({ rows: [{ ...rows[0], status: "error", content: "" }] });
  assert.equal(result.status, 200); assert.deepEqual(result.body.report.unavailableIds, ["a"]); assert.equal(result.calls, 0);
});
test("oversized input is not silently truncated", async () => {
  const result = await harness({ rows: [{ ...rows[0], content: "가".repeat(260000) }, rows[1]] });
  assert.equal(result.status, 422); assert.equal(result.calls, 0); assert.equal(result.writes, 0);
});
test("section title and pages survive extraction; content changes invalidate snapshots", async () => {
  const parts = core.documentParts(JSON.stringify({ format: "structured-markdown", sections: [{ title: "문의처", markdown: "담당자: 박영민", pages: [3] }] }));
  assert.deepEqual(parts, [{ id: "0", title: "문의처", text: "담당자: 박영민", pages: [3] }]);
  assert.notEqual(await core.snapshotKey(rows), await core.snapshotKey([{ ...rows[0], content: "담당자: 손오공" }, rows[1]]));
});

test("page refresh reads cached results only, even when no cached comparison exists", async () => {
  const empty = await harness({readOnly:true});
  assert.equal(empty.status,200); assert.equal(empty.body.report,null); assert.equal(empty.calls,0); assert.equal(empty.writes,0);
  const cached = await harness({readOnly:true,cache:{report:JSON.stringify({conflicts:[conflict]})}});
  assert.deepEqual(cached.body.report.conflicts,[conflict]); assert.equal(cached.calls,0); assert.equal(cached.writes,0);
  const denied = await harness({readOnly:true,denied:true}); assert.equal(denied.status,403); assert.equal(denied.reads,0);
});

test("temporary comparison failures retry, permission failures stop, exhausted retries reject", async () => {
  const client = await moduleFrom("../app/knowledge/conflict-client.ts");
  let calls = 0;
  const report = {conflicts:[]};
  const result = await client.checkAfterMutation("crisis",async () => ++calls < 3 ? Response.json({},{status:502}) : Response.json({report}),async()=>{});
  assert.equal(calls,3);assert.deepEqual(result,report);
  calls=0;
  await assert.rejects(client.checkAfterMutation("crisis",async()=>{calls++;return Response.json({},{status:403});},async()=>{}));assert.equal(calls,1);
  calls=0;
  await assert.rejects(client.checkAfterMutation("crisis",async()=>{calls++;throw new Error('offline');},async()=>{}));assert.equal(calls,3);
});

test("data filters distinguish random-origin text after renaming and combine with search", async () => {
  const {filterSources,sourceKind} = await moduleFrom("../app/knowledge/source-filter.ts");
  const items = [{type:'pdf',title:'자료',url:null,fileName:'file.pdf'}, {type:'website',title:'자료',url:'https://example.test',fileName:null}, {type:'text',title:'랜덤 질문이라는 제목의 일반 텍스트',url:null,fileName:null}, {type:'text',isRandom:true,title:'이름을 바꾼 보완 자료',url:null,fileName:null}];
  assert.equal(filterSources(items,'all','').length,4);
  for (const kind of ['pdf','website','text','random']) assert.equal(filterSources(items,kind,'').length,1);
  assert.equal(sourceKind(items[2]),'text'); assert.equal(sourceKind(items[3]),'random');
  assert.equal(filterSources(items,'random','보완').length,1); assert.equal(filterSources(items,'pdf','보완').length,0);
});
