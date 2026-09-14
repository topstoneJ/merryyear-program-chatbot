import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { sourceLoader, chatHarness } from './load-source.mjs';
const require = createRequire(import.meta.url);
const builtins = Object.fromEntries(['node:sqlite', 'node:fs', 'node:fs/promises', 'node:path', 'node:crypto'].map(name => [name, require(name)]));
const { LocalDatabase } = sourceLoader(builtins)('db/local-runtime.ts');

test('shared scope migrates safely, persists through API edits, and applies to every business without duplicates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shared-knowledge-'));
  const DB = new LocalDatabase(dir);
  let forbidden = false;
  const knowledge = () => sourceLoader({ ...builtins, './runtime': { runtimeEnv: () => ({ DB }) } })('db/knowledge.ts');
  try {
    await knowledge().ensureKnowledgeSchema();
    await DB.prepare("INSERT INTO knowledge_sources (id,business_id,type,title,content,status,enabled,created_at,updated_at) VALUES ('common','original','text','공통 안내','신청은 온라인으로 합니다.','ready',1,1,1)").run();
    await DB.prepare('ALTER TABLE knowledge_sources DROP COLUMN shared_all_businesses').run();
    const runtime = knowledge(); await runtime.ensureKnowledgeSchema();
    assert.equal((await DB.prepare("SELECT shared_all_businesses FROM knowledge_sources WHERE id='common'").first()).shared_all_businesses, 0);
    assert.equal((await runtime.loadKnowledgeContext('other')).sources.length, 0);
    const api = sourceLoader({
      '@/db/knowledge': runtime,
      '@/app/admin-session': { requireAdminApi: async ({ businessId }) => { assert.equal(businessId, 'original'); return forbidden ? new Response(null, { status: 403 }) : null; } },
      '@/db/api-usage': {}, '@/app/safe-website': {},
    })('app/api/knowledge/route.ts');
    const patch = body => api.PATCH(new Request('https://test/api/knowledge', { method: 'PATCH', body: JSON.stringify({ id: 'common', title: '공통 안내', content: '신청은 온라인으로 합니다.', ...body }) }));
    assert.equal((await patch({ sharedAllBusinesses: 'true' })).status, 400);
    forbidden = true; assert.equal((await patch({ sharedAllBusinesses: true })).status, 403);
    forbidden = false; assert.equal((await patch({ sharedAllBusinesses: true })).status, 200);
    for (const businessId of ['original', 'other', 'future-business']) {
      const context = await runtime.loadKnowledgeContext(businessId);
      assert.deepEqual(context.sources.map(s => s.id), ['common']);
      assert.equal(context.sources[0].businessId, 'original');
      assert.equal(context.sources[0].sharedAllBusinesses, true);
    }
    const detail = await (await api.GET(new Request('https://test/api/knowledge?id=common'))).json();
    assert.equal(detail.source.sharedAllBusinesses, true);
    const context = await runtime.loadKnowledgeContext('test');
    const chat = chatHarness({ knowledge: context, draft: { source: 'common' } });
    const reply = await chat.ask();
    assert.equal(reply.status, 200);
    assert.equal(JSON.parse(chat.requests[0].input).knowledge.sources[0].id, 'common');
    assert.match(chat.requests[0].system_instruction, /sharedAllBusinesses=true/);
    await patch({}); // Older clients must preserve sharing.
    assert.equal((await runtime.loadKnowledgeContext('other')).sources.length, 1);
    await patch({ enabled: false });
    assert.equal((await runtime.loadKnowledgeContext('other')).sources.length, 0);
    await patch({ enabled: true });
    await DB.prepare("UPDATE knowledge_sources SET status='error' WHERE id='common'").run();
    assert.equal((await runtime.loadKnowledgeContext('other')).sources.length, 0);
    const retained = await DB.prepare("SELECT title,content,status FROM knowledge_sources WHERE id='common'").first();
    const scopeOnly = await api.PATCH(new Request('https://test/api/knowledge', { method: 'PATCH', body: JSON.stringify({ id: 'common', sharedAllBusinesses: false }) }));
    assert.equal(scopeOnly.status, 200);
    assert.deepEqual(await DB.prepare("SELECT title,content,status FROM knowledge_sources WHERE id='common'").first(), retained);
    await patch({ sharedAllBusinesses: false });
    assert.equal((await runtime.loadKnowledgeContext('other')).sources.length, 0);
    assert.equal((await runtime.loadKnowledgeContext('original')).sources.length, 1);
  } finally { DB.close(); await rm(dir, { recursive: true, force: true }); }
});

test('favicon contains wide, tall, and square images in the exact center without stretching', async () => {
  const { centeredFavicon } = sourceLoader({ sharp: { default: sharp } })('app/favicon-image.ts');
  for (const [width, height] of [[120, 40], [40, 120], [64, 64]]) {
    const original = await sharp({ create: { width, height, channels: 4, background: '#ff0000' } }).png().toBuffer();
    const bytes = await centeredFavicon(Uint8Array.from(original).buffer);
    const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 32); assert.equal(info.height, 32);
    const points = [];
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (data[(y * 32 + x) * 4 + 3] > 128) points.push([x, y]);
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
    assert(Math.abs((left + right) / 2 - 15.5) <= .5);
    assert(Math.abs((top + bottom) / 2 - 15.5) <= .5);
    assert(Math.abs((right - left + 1) / (bottom - top + 1) - width / height) < .1);
  }
});

test('favicon endpoint centers stored icons and logo fallbacks while leaving original logo bytes intact', async () => {
  const original = await sharp({ create: { width: 120, height: 40, channels: 4, background: '#ff0000' } }).png().toBuffer();
  let row = { logo_key: 'logo', favicon_key: null };
  const { centeredFavicon } = sourceLoader({ sharp: { default: sharp } })('app/favicon-image.ts');
  const route = sourceLoader({
    '@/app/favicon-image': { centeredFavicon },
    '@/app/admin-session': {},
    '@/db/knowledge': { ensureKnowledgeSchema: async () => ({ prepare: () => ({ first: async () => row }) }), knowledgeEnv: () => ({ KNOWLEDGE_FILES: { get: async () => ({ body: Uint8Array.from(original), httpMetadata: { contentType: 'image/png' } }) } }) },
  })('app/api/settings/route.ts');
  for (const faviconKey of [null, 'custom']) {
    row.favicon_key = faviconKey;
    const response = await route.GET(new Request('https://test/api/settings?asset=favicon'));
    assert.equal(response.status, 200);
    const metadata = await sharp(new Uint8Array(await response.arrayBuffer())).metadata();
    assert.equal(metadata.width, 32); assert.equal(metadata.height, 32);
  }
  const logo = await route.GET(new Request('https://test/api/settings?logo=1'));
  assert.deepEqual(new Uint8Array(await logo.arrayBuffer()), new Uint8Array(original));
});
