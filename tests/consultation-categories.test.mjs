import {sourceLoader} from './load-source.mjs';
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";

function moduleAt(path, deps = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}; new Function("require", "exports", "fetch", 'const originalRequire = require; require = (name) => name === "@/db/api-usage" ? { trackedGeminiFetch: (_purpose, init) => fetch("https://generativelanguage.googleapis.com/v1/interactions", init) } : originalRequire(name);\n' + code)(name => deps[name], exports, deps.__fetch || globalThis.fetch); return exports;
}
const helper = moduleAt("../db/consultation-categories.ts");
const classifier = moduleAt("../db/consultation-decision.ts");
function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE consultations (id TEXT PRIMARY KEY, business_id TEXT, question TEXT, answer TEXT, summary TEXT, decision TEXT, category TEXT, source TEXT, confidence INTEGER, review INTEGER, created_at INTEGER)");
  db.exec(readFileSync(new URL("../drizzle/0011_neat_vermin.sql", import.meta.url), "utf8"));
  db.exec(readFileSync(new URL("../drizzle/0012_wise_sugar_man.sql", import.meta.url), "utf8"));
  db.exec(readFileSync(new URL("../drizzle/0013_plain_randall_flagg.sql", import.meta.url), "utf8"));
  const DB = { prepare(sql) {
    let values = [];
    return { bind(...args) { values = args; return this; }, async all() { return { results: db.prepare(sql).all(...values) }; }, async first() { return db.prepare(sql).get(...values) || null; }, async run() { return { meta: db.prepare(sql).run(...values) }; } };
  }, async batch(statements) { db.exec("BEGIN"); try { const result = []; for (const statement of statements) result.push(await statement.run()); db.exec("COMMIT"); return result; } catch (error) { db.exec("ROLLBACK"); throw error; } } };
  let account = { business_ids_json: '["allowed"]', is_super_admin: 0 };
  db.exec("CREATE TABLE random_questions (knowledge_source_id TEXT)");
  const deps = { "@/app/answer-response": sourceLoader()("app/answer-response.ts"), "@/app/business-hours": moduleAt("../app/business-hours.ts"), "@/db/source-limits": moduleAt("../db/source-limits.ts"), "@/app/knowledge/source-limits": moduleAt("../app/knowledge/source-limits.ts"), "@/db/consultation-categories": helper, "@/db/consultation-decision": classifier, "@/db/semantic-category": moduleAt("../db/semantic-category.ts"), "@/db/ai-provider": { configuredAiModel: () => "gemini-3.8-flash" }, "@/db/knowledge": { getConfiguredGeminiApiKey: async () => "test-key", ensureKnowledgeSchema: async () => DB, deleteExpiredConsultations: async () => ({ meta: { changes: 0 } }), getBusiness: async () => ({}), listBusinesses: async () => [{ id: "allowed", contact_hours: "평일 10:00~12:00, 14:00~17:00" }, { id: "other", contact_hours: "평일 10:00~12:00, 14:00~17:00" }] }, "@/app/admin-session": {
    getAdminSession: async () => account, accountBusinessIds: value => JSON.parse(value.business_ids_json), requireAdminApi: async options => !account ? Response.json({}, { status: 401 }) : options?.businessId && !JSON.parse(account.business_ids_json).includes(options.businessId) ? Response.json({}, { status: 403 }) : null,
  } };
  const supplement = moduleAt("../app/api/consultations/supplement/route.ts", deps);
  deps.__fetch = async (_url, init) => {
    const data = JSON.parse(JSON.parse(init.body).input);
    return Response.json({ steps: [{ type: "model_output", content: [{ type: "text", text: JSON.stringify({ classifications: data.consultations.map(row => ({ id: row.id, categoryId: "지출 증빙" })) }) }] }] });
  };
  const reclassify = moduleAt("../app/api/consultations/reclassify/route.ts", deps);
  const categories = moduleAt("../app/api/consultation-categories/route.ts", deps);
  const consultations = moduleAt("../app/api/consultations/route.ts", deps);
  const request = (body, method = "POST") => new Request("https://test/api", { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
  return { db, DB, reclassify, categories, consultations, supplement, request, setAccount: value => { account = value; } };
}

test("defaults, rename, add, duplicate protection, delete redirects, and no default resurrection", async () => {
  const s = setup();
  assert.equal((await (await s.categories.GET()).json()).categories.length, 8);
  assert.equal((await s.categories.POST(s.request({ action: "rename", id: "지원 내용", name: "지원내용" }))).status, 200);
  const add = await (await s.categories.POST(s.request({ action: "add", name: "물품 문의" }))).json();
  const custom = add.categories.find(item => item.name === "물품 문의");
  assert.ok(custom);
  assert.equal((await s.categories.POST(s.request({ action: "add", name: "물품 문의" }))).status, 409);
  assert.equal((await s.categories.POST(s.request({ action: "delete", id: "지원 내용", replacementId: custom.id }))).status, 200);
  const list = await helper.loadCategories(s.DB);
  assert.equal(helper.resolveCategory(classifier.categoryFromQuestion("김치냉장고 지원되나요"), list).id, custom.id);
  assert.equal(list.filter(item => item.id === "지원 내용" && !item.replacement_id).length, 0);
  assert.equal((await s.categories.POST(s.request({ action: "delete", id: custom.id, replacementId: "지원 내용" }))).status, 400);
  s.db.close();
});

test("resolved legacy categories do not cause repeated no-op writes when listing consultations", async () => {
  const s = setup();
  try {
    await helper.loadCategories(s.DB);
    s.db.prepare("INSERT INTO consultations (id, business_id, question, answer, summary, decision, category, source, confidence, review, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run('legacy', 'allowed', '신청 방법', '온라인 신청', '요약', 'fact', 'unknown-legacy-category', '자료', 90, 0, Date.now() - 1000);
    s.db.exec("CREATE TABLE repair_writes (id TEXT); CREATE TRIGGER count_repairs AFTER UPDATE ON consultations BEGIN INSERT INTO repair_writes VALUES (NEW.id); END;");
    for (let i = 0; i < 2; i++) {
      const response = await s.consultations.GET(new Request('https://test/api/consultations'));
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.consultations.length, 1);
      assert.equal(data.consultations[0].categoryId, helper.resolveCategory('unknown-legacy-category', await helper.loadCategories(s.DB)).id);
    }
    assert.equal(s.db.prepare('SELECT COUNT(*) AS count FROM repair_writes').get().count, 0);
  } finally { s.db.close(); }
});

test("manual choice survives GET repair and updates full-range summary; unauthorized business denied", async () => {
  const s = setup(); await helper.loadCategories(s.DB);
  s.db.prepare("INSERT INTO consultations (id, business_id, question, answer, summary, decision, category, source, confidence, review, created_at, category_manual) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("c1", "allowed", "냉장고 지원되나요", "가능합니다.", "요약", "possible", "기타", "자료", 90, 0, Date.now(), 0);
  const response = await s.consultations.PATCH(s.request({ id: "c1", categoryId: "운영 문의" }, "PATCH"));
  assert.equal(response.status, 200);
  const get = async () => (await s.consultations.GET(new Request("https://test/api/consultations"))).json();
  let data = await get();
  assert.equal(data.consultations[0].category, "운영 문의");
  assert.equal(data.summary.byCategory[0].category, "운영 문의");
  await s.categories.POST(s.request({ action: "rename", id: "운영 문의", name: "사업 운영" }));
  data = await get(); assert.equal(data.consultations[0].category, "사업 운영");
  await s.categories.POST(s.request({ action: "delete", id: "운영 문의", replacementId: "신청 방법" }));
  data = await get(); assert.equal(data.consultations[0].category, "신청 방법");
  assert.equal(s.db.prepare("SELECT category_manual FROM consultations WHERE id='c1'").get().category_manual, 1);
  s.db.exec("UPDATE consultations SET business_id='other' WHERE id='c1'");
  assert.equal((await s.consultations.PATCH(s.request({ id: "c1", categoryId: "기타" }, "PATCH"))).status, 403);
  s.setAccount(null);
  assert.equal((await s.categories.POST(s.request({ action: "add", name: "차단" }))).status, 401);
  s.db.close();
});

test("manual review clearing survives automatic repair and rechecking updates totals", async () => {
  const s = setup(); await helper.loadCategories(s.DB);
  s.db.prepare("INSERT INTO consultations (id, business_id, question, answer, summary, decision, category, source, confidence, review, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("review1", "allowed", "담당자는?", "담당자에게 문의해 주세요.", "요약", "consult", "운영 문의", "자료", 65, 1, Date.now() - 1000);
  const get = async () => (await s.consultations.GET(new Request("https://test/api/consultations"))).json();
  assert.equal((await get()).summary.reviewTotal, 1);
  const patch = review => s.consultations.PATCH(s.request({ id: "review1", review }, "PATCH"));
  assert.equal((await patch(false)).status, 200);
  for (let i = 0; i < 2; i++) {
    const data = await get();
    assert.equal(data.consultations[0].review, false);
    assert.equal(data.consultations[0].decision, "consult");
    assert.equal(data.summary.reviewTotal, 0);
  }
  assert.equal((await patch(true)).status, 200);
  assert.equal((await get()).summary.reviewTotal, 1);
  assert.equal((await patch("false")).status, 400);
  s.db.exec("UPDATE consultations SET business_id='other' WHERE id='review1'");
  assert.equal((await patch(false)).status, 403);
  assert.equal(s.db.prepare("SELECT review FROM consultations WHERE id='review1'").get().review, 1);
  s.db.close();
});

test("off-hours summary uses Korean weekends and weekday working windows", async () => {
  const s = setup(); await helper.loadCategories(s.DB);
  const insert = s.db.prepare("INSERT INTO consultations (id, business_id, question, answer, summary, decision, category, source, confidence, review, created_at) VALUES (?, 'allowed', '문의', '안내', '요약', 'fact', '지원 내용', '자료', 90, 0, ?)");
  const times = [
    "2026-09-05T06:00:00Z", // Saturday 15:00 KST
    "2026-09-07T00:59:00Z", // Monday 09:59 KST
    "2026-09-07T01:00:00Z", // Monday 10:00 KST
    "2026-09-07T02:59:00Z", // Monday 11:59 KST
    "2026-09-07T03:00:00Z", // Monday 12:00 KST
    "2026-09-07T05:00:00Z", // Monday 14:00 KST
    "2026-09-07T07:59:00Z", // Monday 16:59 KST
    "2026-09-07T08:00:00Z", // Monday 17:00 KST
  ];
  times.forEach((time, index) => insert.run(`time-${index}`, Date.parse(time)));
  const response = await s.consultations.GET(new Request("https://test/api/consultations?from=1788566400000&to=1788825599999"));
  const data = await response.json();
  assert.equal(data.summary.total, 8);
  assert.equal(data.summary.offHoursTotal, 4);
  s.db.close();
});

test("bulk deletion removes exactly the submitted visible records", async () => {
  const s = setup();
  const insert = s.db.prepare("INSERT INTO consultations (id, business_id, question) VALUES (?, 'allowed', '문의')");
  insert.run("visible-1"); insert.run("visible-2"); insert.run("not-visible");
  s.setAccount({ business_ids_json: '["allowed"]', is_super_admin: 0, can_view_consultations: 1, can_delete_consultations: 1 });
  const response = await s.consultations.DELETE(s.request({ ids: ["visible-1", "visible-2"] }, "DELETE"));
  assert.equal(response.status, 200);
  assert.deepEqual(s.db.prepare("SELECT id FROM consultations ORDER BY id").all().map(row => row.id), ["not-visible"]);
  s.db.close();
});


test("answer supplements share one text source across both editors and enforce business access", async () => {
  const s = setup();
  s.db.exec("CREATE TABLE knowledge_sources (id TEXT PRIMARY KEY, business_id TEXT, type TEXT, title TEXT, content TEXT, status TEXT, enabled INTEGER, created_at INTEGER, updated_at INTEGER)");
  s.db.prepare("INSERT INTO consultations (id, business_id, question) VALUES (?, ?, ?)").run("s1", "allowed", "지원 내용은?");
  const get = async () => (await s.supplement.GET(new Request("https://test/api?id=s1"))).json();
  const put = content => s.supplement.PUT(s.request({ id: "s1", content }, "PUT"));
  assert.equal((await get()).content, "");
  assert.equal((await put("추가할 내용: 서류 안내")).status, 200);
  assert.equal((await get()).content, "추가할 내용: 서류 안내");
  assert.equal((await put("빼야 할 내용: 확정적인 표현")).status, 200);
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM knowledge_sources").get().n, 1);
  s.db.exec("UPDATE knowledge_sources SET content='사업별 관리에서 수정한 내용', enabled=0");
  assert.equal((await get()).content, "사업별 관리에서 수정한 내용");
  assert.equal((await put("재수정")).status, 200);
  assert.equal((await get()).enabled, false);
  assert.equal((await put("")).status, 400);
  s.db.exec("UPDATE consultations SET business_id='other' WHERE id='s1'");
  assert.equal((await put("권한 없음")).status, 403);
  assert.equal((await s.supplement.GET(new Request("https://test/api?id=s1"))).status, 403);
  s.db.close();
});


test("semantic backfill saves model classification once and preserves manual/business scope", async () => {
  const s = setup(); await helper.loadCategories(s.DB);
  const insert = s.db.prepare("INSERT INTO consultations (id, business_id, question, answer, category, category_manual, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  insert.run("auto", "allowed", "영수증 잃어버렸어요", "증빙 서류를 확인해 주세요.", "기타", 0, Date.now());
  insert.run("manual", "allowed", "영수증 잃어버렸어요", "안내", "운영 문의", 1, Date.now());
  insert.run("other", "other", "영수증 잃어버렸어요", "안내", "기타", 0, Date.now());
  assert.equal((await (await s.reclassify.POST()).json()).updated, 1);
  assert.equal(s.db.prepare("SELECT category FROM consultations WHERE id='auto'").get().category, "지출 증빙");
  assert.equal(s.db.prepare("SELECT category FROM consultations WHERE id='manual'").get().category, "운영 문의");
  assert.equal(s.db.prepare("SELECT category FROM consultations WHERE id='other'").get().category, "기타");
  assert.equal((await (await s.reclassify.POST()).json()).updated, 0);
  const get = await s.consultations.GET(new Request("https://test/api/consultations"));
  assert.equal(get.status, 200);
  assert.equal(s.db.prepare("SELECT category FROM consultations WHERE id='auto'").get().category, "지출 증빙");
  s.db.close();
});

test('explicit facts survive listing and legacy conflict results normalize to consult',async()=>{
 const s=setup();await helper.loadCategories(s.DB);
 for(const [id,decision,answer] of [['fact','fact','불가능합니다. 인건비 사용만 제한됩니다.'],['conflict','conflict','등록된 자료 상으로 확인이 어렵습니다. 담당자에게 문의해 주세요']])s.db.prepare("INSERT INTO consultations (id,business_id,question,answer,summary,decision,category,source,confidence,review,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(id,'allowed','지원 내용?',answer,'요약',decision,'지원 내용','자료',65,0,Date.now());
 const data=await(await s.consultations.GET(new Request('https://test/api/consultations'))).json();assert.equal(data.consultations.find(c=>c.id==='fact').decision,'fact');assert.equal(data.consultations.find(c=>c.id==='conflict').decision,'consult');assert.equal(data.consultations.find(c=>c.id==='conflict').review,true);assert.equal(s.db.prepare("SELECT decision FROM consultations WHERE id='conflict'").get().decision,'consult');s.db.close();
});
