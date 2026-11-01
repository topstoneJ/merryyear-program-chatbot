import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './load-source.mjs';

const request = (body, method = 'POST') => new Request('https://example.org/api/test', { method, body: JSON.stringify(body) });

function loginHarness(fail = false) {
  let reads = 0;
  const api = sourceLoader({ '@/db/admin-login-limits': { consumeAdminLoginAllowance: async () => ({ allowed: true }) }, '@/app/admin-session': {
    ADMIN_COOKIE: 'session',
    async findAdmin() { reads++; if (fail) throw new Error('SECRET_DATABASE_URL'); return { id: 'admin' }; },
    verifyPassword: async () => true,
    createAdminSession: async () => 'signed-test-token',
  } })('app/api/admin-login/route.ts');
  return { api, reads: () => reads };
}

test('login rejects malformed and oversized values before database access', async () => {
  const h = loginHarness();
  for (const body of [null, [], 'text', { id: {}, password: 'password' }, { id: 'admin', password: 'x'.repeat(1025) }]) {
    assert.equal((await h.api.POST(request(body))).status, 400);
  }
  assert.equal((await h.api.POST(new Request('https://test', { method: 'POST', body: '{' }))).status, 400);
  assert.equal(h.reads(), 0);
});

test('login redirects only to local paths, including backslash and control-character attacks', async () => {
  const h = loginHarness();
  for (const returnTo of ['//attacker.example', '/\\attacker.example', '/\t/attacker.example', 'https://attacker.example', {}]) {
    const response = await h.api.POST(request({ id: 'admin', password: 'password', returnTo }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).returnTo, '/knowledge');
  }
  const response = await h.api.POST(request({ id: 'admin', password: 'password', returnTo: '/settings?tab=api' }));
  assert.equal((await response.json()).returnTo, '/settings?tab=api');
  assert.match(response.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Lax/);
});

test('login outages provide a traceable safe response without leaking exception messages', async () => {
  const response = await loginHarness(true).api.POST(request({ id: 'admin', password: 'password' }));
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.requestId, response.headers.get('x-request-id'));
  assert.doesNotMatch(JSON.stringify(body), /SECRET_DATABASE_URL/);
});

test('Next API protection blocks cross-site writes and allows normal and non-browser requests', () => {
  const { proxy } = sourceLoader({ 'next/server': { NextResponse: { next: () => new Response(null, { status: 200 }) } } })('proxy.ts');
  for (const headers of [{ origin: 'https://attacker.example' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' }]) {
    assert.equal(proxy(new Request('https://example.org/api/settings', { method: 'PATCH', headers })).status, 403);
  }
  for (const headers of [{}, { origin: 'https://example.org' }, { origin: 'https://example.org', host: 'example.org' }]) {
    assert.equal(proxy(new Request('https://example.org/api/settings', { method: 'PATCH', headers })).status, 200);
  }
  assert.equal(proxy(new Request('https://example.org/api/settings', { headers: { origin: 'https://attacker.example' } })).status, 200);
});

test('administrator permission input rejects strings masquerading as booleans', async () => {
  let writes = 0;
  const api = sourceLoader({
    '@/app/admin-session': { requireAdminApi: async () => null, ensureBootstrapAdmin: async () => { writes++; throw new Error('unexpected'); } },
    '@/db/knowledge': {},
  })('app/api/admin-accounts/route.ts');
  for (const body of [null, [], { canManageSettings: 'false' }, { isSuperAdmin: 1 }, { businessIds: 'a' }, { businessIds: [null] }]) {
    assert.equal((await api.POST(request(body))).status, 400);
    assert.equal((await api.PATCH(request(body, 'PATCH'))).status, 400);
  }
  assert.equal(writes, 0);
});

test('public and administrator read APIs return safe failures when infrastructure fails', async () => {
  const fail = async () => { throw new Error('SECRET_DATABASE_URL'); };
  const load = sourceLoader({
    '@/app/admin-session': { requireAdminApi: fail, getAdminSession: fail },
    '@/db/knowledge': { ensureKnowledgeSchema: fail, getBusiness: fail },
    '@/app/favicon-image': {},
  });
  for (const name of ['settings', 'business-link', 'admin-access', 'admin-accounts', 'answer-settings', 'consultation-categories']) {
    const response = await load(`app/api/${name}/route.ts`).GET(new Request('https://example.org/api/test'));
    assert.equal(response.status, 503, name);
    const payload = await response.json();
    assert.equal(payload.requestId, response.headers.get('x-request-id'));
    assert.doesNotMatch(JSON.stringify(payload), /SECRET_DATABASE_URL/);
  }
});
