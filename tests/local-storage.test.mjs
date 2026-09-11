import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { sourceLoader } from './load-source.mjs';
import { isRuntimeData } from '../scripts/check-deployment-data.mjs';

const require = createRequire(import.meta.url);
const builtins = Object.fromEntries(['node:sqlite', 'node:fs', 'node:fs/promises', 'node:path', 'node:crypto'].map(name => [name, require(name)]));
const load = sourceLoader(builtins);
const { LocalDatabase, LocalObjects } = load('db/local-runtime.ts');
const { storageMode } = load('db/storage-mode.ts');

test('local execution ignores Azure credentials; Azure cannot select local storage', () => {
  assert.equal(storageMode({ DATABASE_URL: 'postgresql://production', AZURE_STORAGE_ACCOUNT_NAME: 'production' }), 'local');
  assert.equal(storageMode({ WEBSITE_INSTANCE_ID: 'app-instance' }), 'azure');
  assert.throws(() => storageMode({ DATA_BACKEND: 'azure' }), /disabled outside Azure/);
  assert.throws(() => storageMode({ WEBSITE_INSTANCE_ID: 'app-instance', DATA_BACKEND: 'local' }), /disabled on Azure/);
  assert.throws(() => storageMode({ DATA_BACKEND: 'typo' }), /Invalid/);
});

test('shared schema initializes locally and independent databases persist through restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chatbot-isolation-'));
  let first, second, reopened;
  try {
    first = new LocalDatabase(join(directory, 'first'));
    second = new LocalDatabase(join(directory, 'second'));
    for (const DB of [first, second]) {
      const isolated = sourceLoader({ ...builtins, './runtime': { runtimeEnv: () => ({ DB }) } });
      await isolated('db/knowledge.ts').ensureKnowledgeSchema();
    }
    await first.prepare("UPDATE site_settings SET organization_name = ? WHERE id = 'default'").bind('Local test institution').run();
    assert.equal((await second.prepare("SELECT organization_name FROM site_settings").first()).organization_name, '기관명 미설정');
    await assert.rejects(first.batch([
      first.prepare("UPDATE site_settings SET organization_name = 'rollback'"),
      first.prepare('INSERT INTO missing_table VALUES (1)'),
    ]));
    first.close(); first = undefined;
    reopened = new LocalDatabase(join(directory, 'first'));
    assert.equal((await reopened.prepare('SELECT organization_name FROM site_settings').first()).organization_name, 'Local test institution');
    const blobs = new LocalObjects(join(directory, 'first'));
    await blobs.put('../logo', new Blob(['local image bytes']).stream(), { httpMetadata: { contentType: 'image/png' } });
    const saved = await new LocalObjects(join(directory, 'first')).get('../logo');
    assert.equal(await new Response(saved.body).text(), 'local image bytes');
    assert.equal(saved.httpMetadata.contentType, 'image/png');
    assert.equal(await new LocalObjects(join(directory, 'second')).get('../logo'), null);
    await blobs.delete('../logo');
    assert.equal(await blobs.get('../logo'), null);
  } finally {
    first?.close(); second?.close(); reopened?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('deployment checks reject local data and secrets while allowing source assets', () => {
  for (const path of ['.local-data/settings.json', '.local-data/objects/abc.json', '.env.local', 'backup.sqlite-wal', 'uploads/file.png', 'public/notice.pdf']) assert.equal(isRuntimeData(path), true, path);
  for (const path of ['db/local-runtime.ts', '.env.example', 'public/default-favicon.svg', 'public/vendor/pdfjs-6.1.200/pdf.min.mjs']) assert.equal(isRuntimeData(path), false, path);
});
