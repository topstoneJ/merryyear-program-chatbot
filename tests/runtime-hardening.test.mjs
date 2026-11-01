import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { sourceLoader } from './load-source.mjs';

function runtimeHarness({ failInitialization = false, failRollback = false, poolSize = '5' } = {}) {
  let creates = 0, upload;
  const pools = [];
  const released = [];
  const originalFailure = new Error('database-private-detail');
  class FakePool extends EventEmitter {
    constructor(options) { super(); this.options = options; pools.push(this); }
    async connect() {
      return {
        async query(sql) {
          if (sql === 'FAIL') throw originalFailure;
          if (sql === 'ROLLBACK' && failRollback) throw new Error('rollback-private-detail');
          return { rowCount: 0, rows: [] };
        },
        release(discard) { released.push(discard); },
      };
    }
  }
  const container = {
    async createIfNotExists() { if (++creates === 1 && failInitialization) throw new Error('temporary'); },
    getBlobClient() { return { async download() { return { readableStreamBody: Readable.from([Buffer.from('saved')]) }; } }; },
    getBlockBlobClient(key) { return { async uploadStream(stream, blockSize, concurrency, options) {
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      upload = { key, blockSize, concurrency, options, text: Buffer.concat(chunks).toString() };
    } }; },
  };
  const saved = Object.fromEntries(['DATABASE_URL', 'DATABASE_POOL_SIZE', 'AZURE_STORAGE_CONNECTION_STRING'].map(key => [key, process.env[key]]));
  try {
    process.env.DATABASE_URL = 'test-only';
    process.env.DATABASE_POOL_SIZE = poolSize;
    process.env.AZURE_STORAGE_CONNECTION_STRING = 'test-only';
    const runtime = sourceLoader({
      '@azure/identity': {},
      '@azure/storage-blob': { BlobServiceClient: { fromConnectionString: () => ({ getContainerClient: () => container }) } },
      'node:stream': { Readable },
      pg: { Pool: FakePool, types: { setTypeParser() {} } },
      './storage-mode': { storageMode: () => 'azure' },
      './local-runtime': {},
    })('db/runtime.ts').runtimeEnv();
    return { ...runtime, pool: pools[0], released, originalFailure, creates: () => creates, upload: () => upload };
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test('idle pool failures are handled without exposing database error details', () => {
  const h = runtimeHarness({ poolSize: 'invalid' });
  assert.equal(h.pool.options.max, 5);
  const logs = [], original = console.error;
  console.error = (...args) => logs.push(args);
  try { assert.doesNotThrow(() => h.pool.emit('error', new Error('SECRET_DATABASE_URL'))); }
  finally { console.error = original; }
  assert.ok(logs[0][1].requestId);
  assert.doesNotMatch(JSON.stringify(logs), /SECRET_DATABASE_URL/);
});

test('failed rollback discards the connection and preserves the original failure', async () => {
  const h = runtimeHarness({ failRollback: true });
  await assert.rejects(h.DB.batch([h.DB.prepare('FAIL')]), error => error === h.originalFailure);
  assert.deepEqual(h.released, [true]);
});

test('successful transactions release their connection normally', async () => {
  const h = runtimeHarness();
  assert.deepEqual(await h.DB.batch([h.DB.prepare('SELECT 1')]), [{ success: true, meta: { changes: 0 } }]);
  assert.deepEqual(h.released, [false]);
});

test('temporary blob initialization failures can recover without restarting the server', async () => {
  const h = runtimeHarness({ failInitialization: true });
  await assert.rejects(h.KNOWLEDGE_FILES.get('file'), /temporary/);
  const [first, second] = await Promise.all([h.KNOWLEDGE_FILES.get('file'), h.KNOWLEDGE_FILES.get('file')]);
  assert.equal(h.creates(), 2);
  assert.equal(await new Response(first.body).text(), 'saved');
  assert.equal(await new Response(second.body).text(), 'saved');
});

test('blob upload streams unchanged bytes with bounded parallel buffering and metadata', async () => {
  const h = runtimeHarness();
  await h.KNOWLEDGE_FILES.put('file', new Blob(['first', '둘째']).stream(), {
    httpMetadata: { contentType: 'application/pdf' }, customMetadata: { title: 'test' },
  });
  assert.deepEqual(h.upload(), {
    key: 'file', blockSize: 4 * 1024 * 1024, concurrency: 2,
    options: { blobHTTPHeaders: { blobContentType: 'application/pdf' }, metadata: { title: 'test' } },
    text: 'first둘째',
  });
});
