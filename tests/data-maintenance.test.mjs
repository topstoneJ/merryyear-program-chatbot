import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { sourceLoader } from './load-source.mjs';

const require = createRequire(import.meta.url);
const builtins = Object.fromEntries(['node:sqlite', 'node:fs', 'node:fs/promises', 'node:path', 'node:crypto'].map(n => [n, require(n)]));

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'maintenance-test-'));
  const { LocalDatabase } = sourceLoader(builtins)('db/local-runtime.ts');
  const DB = new LocalDatabase(directory);
  t.after(async () => { DB.close(); await rm(directory, { recursive: true, force: true }); });
  const load = sourceLoader({ ...builtins, './runtime': { runtimeEnv: () => ({ DB }) } });
  await load('db/knowledge.ts').ensureKnowledgeSchema();
  const maintenance = load('db/data-maintenance.ts');
  for (const id of ['remove', 'keep']) {
    await DB.prepare('INSERT INTO businesses (id,name,short_name,code,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(id,id,id,id,0,0).run();
    await DB.prepare("INSERT INTO knowledge_sources (id,business_id,type,title,file_key,created_at,updated_at) VALUES (?,?,'pdf',?,?,0,0)").bind(id,id,id,`${id}.pdf`).run();
    await DB.prepare('INSERT INTO knowledge_source_revisions (id,source_id,title,content,reason,created_at) VALUES (?,?,?,?,?,0)').bind(id,id,id,'private source','edit').run();
    await DB.prepare('INSERT INTO knowledge_conflict_checks (business_id,snapshot_key,report) VALUES (?,?,?)').bind(id,'key','private report').run();
    await DB.prepare('INSERT INTO business_homepage_sources (business_id,source_id) VALUES (?,?)').bind(id,id).run();
  }
  return { DB, maintenance, load };
}

test('business deletion removes linked records atomically and retries failed file deletion', async t => {
  const { DB, maintenance: m } = await fixture(t);
  await DB.prepare('CREATE TABLE approved_faq (business_id TEXT, id TEXT, payload TEXT, PRIMARY KEY (business_id,id))').run();
  await DB.prepare("INSERT INTO approved_faq VALUES ('remove','faq','private answer')").run();
  await DB.prepare('INSERT INTO approved_faq VALUES (?,?,?)').bind('keep','linked',JSON.stringify({source:'remove',quote:'deleted source'})).run();
  await DB.prepare('INSERT INTO approved_faq VALUES (?,?,?)').bind('keep','unrelated',JSON.stringify({source:'keep',quote:'retained source'})).run();
  await m.deleteBusinessData(DB, 'remove');
  for (const [table, key] of [['businesses','id'],['knowledge_sources','business_id'],['knowledge_source_revisions','source_id'],['approved_faq','business_id'],['business_homepage_sources','business_id'],['knowledge_conflict_checks','business_id']]) {
    assert.equal(await DB.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${key} = ?`).bind('remove').first('count'), 0, table);
  }
  assert.equal(await DB.prepare("SELECT COUNT(*) AS count FROM businesses WHERE id = 'keep'").first('count'), 1);
  assert.deepEqual((await DB.prepare('SELECT id FROM approved_faq').all()).results.map(row => row.id), ['unrelated']);
  const failed = await m.drainFileDeletions(DB, { delete: async () => { throw new Error('offline'); } });
  assert.equal(failed.pendingFiles, 1);
  const keys = [];
  assert.deepEqual(await m.drainFileDeletions(DB, { delete: async key => keys.push(key) }), { deletedFiles: 1, pendingFiles: 0 });
  assert.deepEqual(keys, ['remove.pdf']);
  assert.deepEqual(await m.drainFileDeletions(DB, { delete: async () => assert.fail('no duplicate') }), { deletedFiles: 0, pendingFiles: 0 });
});

test('failed relational deletion rolls back both source deletion and queued keys', async t => {
  const { DB, maintenance: m } = await fixture(t);
  await DB.prepare("CREATE TRIGGER reject_delete BEFORE DELETE ON businesses BEGIN SELECT RAISE(ABORT, 'test failure'); END").run();
  await assert.rejects(m.deleteBusinessData(DB, 'remove'));
  assert.equal(await DB.prepare("SELECT COUNT(*) AS count FROM knowledge_source_revisions WHERE source_id = 'remove'").first('count'), 1);
  assert.equal(await DB.prepare('SELECT COUNT(*) AS count FROM pending_file_deletions').first('count'), 0);
});

test('file still referenced by another business is never deleted', async t => {
  const { DB, maintenance: m } = await fixture(t);
  await DB.prepare("UPDATE knowledge_sources SET file_key = 'remove.pdf' WHERE id = 'keep'").run();
  await m.deleteBusinessData(DB, 'remove');
  assert.deepEqual(await m.drainFileDeletions(DB, { delete: async () => assert.fail('live file') }), { deletedFiles: 0, pendingFiles: 0 });
});

test('scheduled maintenance deletes expired consultations, preserving boundary and recent records', async t => {
  const { DB, maintenance: m, load } = await fixture(t);
  const now = Date.now(), cutoff = now - load('db/knowledge.ts').CONSULTATION_RETENTION_MS;
  for (const [id, created] of [['old',cutoff-1],['boundary',cutoff],['new',now]]) {
    await DB.prepare("INSERT INTO consultations (id,business_id,question,answer,summary,decision,category,source,created_at) VALUES (?,'keep','q','a','s','consult','c','source',?)").bind(id,created).run();
  }
  assert.equal((await m.runDataMaintenance(DB, null, now)).deletedConsultations, 1);
  assert.deepEqual((await DB.prepare('SELECT id FROM consultations ORDER BY created_at').all()).results.map(r=>r.id), ['boundary','new']);
});

test('maintenance requires a dedicated strong token and reports retry failures', async () => {
  const previous = process.env.RETENTION_MAINTENANCE_KEY;
  let calls = 0;
  const load = sourceLoader({ ...builtins,
    '@/db/knowledge': { ensureKnowledgeSchema: async () => ({}), knowledgeEnv: () => ({ KNOWLEDGE_FILES: null }) },
    '@/db/data-maintenance': { runDataMaintenance: async () => { calls++; return { pendingFiles: 1 }; } },
  });
  const { POST } = load('app/api/maintenance/route.ts');
  const request = token => new Request('https://test/api/maintenance', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  try {
    process.env.RETENTION_MAINTENANCE_KEY = '';
    assert.equal((await POST(request('anything'))).status, 503);
    process.env.RETENTION_MAINTENANCE_KEY = 'maintenance-secret-for-tests-only-1234';
    assert.equal((await POST(request('wrong'))).status, 401);
    assert.equal(calls, 0);
    assert.equal((await POST(request(process.env.RETENTION_MAINTENANCE_KEY))).status, 503);
    assert.equal(calls, 1);
  } finally {
    if (previous === undefined) delete process.env.RETENTION_MAINTENANCE_KEY;
    else process.env.RETENTION_MAINTENANCE_KEY = previous;
  }
});

test('provider requests preserve caller cancellation and also have a deadline', () => {
  const { boundedAiRequest } = sourceLoader({ './knowledge': {}, './api-pricing': {}, './ai-provider': {} })('db/api-usage.ts');
  const controller = new AbortController();
  const request = boundedAiRequest({ signal: controller.signal, method: 'POST' });
  assert.ok(request.signal instanceof AbortSignal);
  assert.notEqual(request.signal, controller.signal);
  controller.abort(new Error('cancelled'));
  assert.equal(request.signal.aborted, true);
  assert.equal(request.signal.reason.message, 'cancelled');
  assert.ok(boundedAiRequest({}).signal instanceof AbortSignal);
});
