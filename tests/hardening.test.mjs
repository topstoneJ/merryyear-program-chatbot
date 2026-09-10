import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './load-source.mjs';
const load = sourceLoader({ 'next/headers': {}, '@/db/knowledge': {} });
const { publicWebsiteUrl, fetchWebsite } = load('app/safe-website.ts');
const { accountBusinessIds } = load('app/admin-session.ts');
test('worker rejects cross-site writes and catches infrastructure failures without leaking errors', async () => {
  let calls = 0;
  const worker = sourceLoader({
    'vinext/server/image-optimization': {},
    'vinext/server/app-router-entry': { default: { fetch: async () => { calls++; throw new Error('SECRET_DATABASE_DETAIL'); } } },
  })('worker/index.ts').default;
  const denied = await worker.fetch(new Request('https://example.org/api/settings', { method: 'PATCH', headers: { origin: 'https://attacker.example' } }), {}, {});
  assert.equal(denied.status, 403); assert.equal(calls, 0);
  const response = await worker.fetch(new Request('https://example.org/api/settings'), {}, {});
  assert.equal(response.status, 503);
  const body = await response.json(); assert.ok(body.requestId); assert.doesNotMatch(JSON.stringify(body), /SECRET_DATABASE_DETAIL/);
});
test('invalid permission JSON fails closed without crashing', () => {
  for (const value of ['null', '{}', 'true', '"allowed"', 'broken']) assert.deepEqual(accountBusinessIds({ business_ids_json: value }), []);
  assert.deepEqual(accountBusinessIds({ business_ids_json: '["allowed",null,42]' }), ['allowed']);
});
test('website input blocks credentials, private IPs and alternate numeric loopback forms', () => {
  for (const url of ['http://127.0.0.1', 'http://2130706433', 'http://0x7f000001', 'http://10.0.0.1', 'http://169.254.169.254', 'http://[::1]', 'http://localhost', 'https://u:p@example.org', 'file:///secret']) assert.throws(() => publicWebsiteUrl(url));
  assert.equal(publicWebsiteUrl('https://example.org/notice').hostname, 'example.org');
});
test('redirect cannot bypass private address checks', async () => {
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/secret' } }); };
  try { await assert.rejects(fetchWebsite('https://example.org')); assert.equal(calls, 1); }
  finally { globalThis.fetch = original; }
});
