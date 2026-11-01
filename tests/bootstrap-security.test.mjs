import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLocalSettings } from '../scripts/local-settings.mjs';
import { sourceLoader } from './load-source.mjs';

test('new local installations generate distinct passwords accepted by the account policy', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chatbot-bootstrap-'));
  try {
    const first = await loadLocalSettings(join(directory, 'first'));
    const second = await loadLocalSettings(join(directory, 'second'));
    assert.equal(first.created, true);
    assert.equal(second.created, true);
    assert.notEqual(first.settings.ADMIN_PASSWORD, second.settings.ADMIN_PASSWORD);
    assert.notEqual(first.settings.ADMIN_SESSION_SECRET, second.settings.ADMIN_SESSION_SECRET);
    for (const { settings } of [first, second]) {
      assert.equal(settings.ADMIN_PASSWORD.length, 20);
      assert.match(settings.ADMIN_PASSWORD, /[a-z]/);
      assert.match(settings.ADMIN_PASSWORD, /[A-Z]/);
      assert.match(settings.ADMIN_PASSWORD, /[^a-zA-Z0-9]/);
      assert.equal(settings.API_KEY_ENCRYPTION_SECRET.length, 64);
    }
    const original = await readFile(join(directory, 'first/settings.json'), 'utf8');
    const reopened = await loadLocalSettings(join(directory, 'first'));
    assert.equal(reopened.created, false);
    assert.deepEqual(reopened.settings, first.settings);
    assert.equal(await readFile(join(directory, 'first/settings.json'), 'utf8'), original);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('unreadable local settings fail instead of resetting administrator or encryption secrets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chatbot-bootstrap-'));
  try {
    await writeFile(join(directory, 'settings.json'), '{incomplete');
    await assert.rejects(loadLocalSettings(directory), SyntaxError);
    assert.equal(await readFile(join(directory, 'settings.json'), 'utf8'), '{incomplete');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Next.js rejects external framing while keeping the same-origin settings preview usable', async () => {
  const config = sourceLoader()('next.config.ts').default;
  const original = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    const rules = await config.headers();
    assert.equal(rules[0].source, '/:path*');
    const headers = Object.fromEntries(rules[0].headers.map(h => [h.key, h.value]));
    assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
    assert.equal(headers['X-Frame-Options'], 'DENY');
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
    assert.equal(headers['Strict-Transport-Security'], 'max-age=31536000');
    assert.equal(config.poweredByHeader, false);
    assert.equal(config.images.unoptimized, true);
    assert.equal(rules[1].source, '/settings/preview');
    const preview = Object.fromEntries(rules[1].headers.map(h => [h.key, h.value]));
    assert.match(preview['Content-Security-Policy'], /frame-ancestors 'self'/);
    assert.equal(preview['X-Frame-Options'], 'SAMEORIGIN');
    process.env.NODE_ENV = 'development';
    assert.equal((await config.headers())[0].headers.some(h => h.key === 'Strict-Transport-Security'), false);
  } finally {
    if (original === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original;
  }
});
