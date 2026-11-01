import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import * as nodeCrypto from 'node:crypto';
import * as nodeNet from 'node:net';
import { sourceLoader } from './load-source.mjs';

const req = (body, method = 'POST', url = 'https://test/api/admin-accounts') => new Request(url, { method, body: JSON.stringify(body) });
function database() {
  const db = new DatabaseSync(':memory:');
  const DB = { prepare(sql) {
    let values = [];
    const statement = { bind(...args) { values = args; return statement; },
      async first() { return db.prepare(sql).get(...values) || null; },
      async all() { return { results: db.prepare(sql).all(...values) }; },
      async run() { return { meta: db.prepare(sql).run(...values) }; } };
    return statement;
  } };
  return { db, DB };
}
function accounts() {
  const { db, DB } = database();
  db.exec(`CREATE TABLE admin_accounts (id TEXT PRIMARY KEY, username TEXT UNIQUE, password_hash TEXT, password_salt TEXT,
    business_ids_json TEXT, can_manage_settings INTEGER, can_view_consultations INTEGER, can_delete_consultations INTEGER,
    is_super_admin INTEGER, created_at INTEGER, updated_at INTEGER)`);
  for (const [id, business, view, superAdmin] of [['actor','a',0,0], ['peer','a',0,0], ['foreign','b',0,0], ['powerful','a',1,0], ['root','a',1,1]]) {
    db.prepare('INSERT INTO admin_accounts VALUES (?, ?, ?, ?, ?, 1, ?, 0, ?, 0, 0)').run(id, id, 'hash', 'salt', JSON.stringify([business]), view, superAdmin);
  }
  const api = sourceLoader({
    '@/app/admin-session': {
      requireAdminApi: async () => null, ensureBootstrapAdmin: async () => DB,
      getAdminSession: async () => db.prepare("SELECT * FROM admin_accounts WHERE id = 'actor'").get(),
      accountBusinessIds: a => JSON.parse(a.business_ids_json), hashPassword: async () => ({ hash: 'new', salt: 'new' }), verifyPassword: async () => true,
    },
    '@/db/knowledge': { listBusinesses: async () => [{id:'a',name:'A'}, {id:'b',name:'B'}] },
  })('app/api/admin-accounts/route.ts');
  return { db, api };
}

test('settings operators cannot grant new business or consultation authority', async () => {
  const { db, api } = accounts();
  try {
    for (const permissions of [{businessIds:['b']}, {canViewConsultations:true}, {canDeleteConsultations:true}, {isSuperAdmin:true}]) {
      assert.equal((await api.POST(req({username:'newuser', password:'Valid-Test1!', ...permissions}))).status, 403);
      assert.equal((await api.PATCH(req({id:'actor', ...permissions}, 'PATCH'))).status, 403);
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM admin_accounts').get().count, 5);
    assert.equal(db.prepare("SELECT business_ids_json FROM admin_accounts WHERE id = 'actor'").get().business_ids_json, '["a"]');
    assert.equal((await api.POST(req({username:'newuser', password:'Valid-Test1!', businessIds:['a']}))).status, 200);
  } finally { db.close(); }
});

test('higher privilege and outside-scope accounts are hidden and cannot be edited or deleted', async () => {
  const { db, api } = accounts();
  try {
    const listing = await (await api.GET()).json();
    assert.deepEqual(listing.accounts.map(a => a.id).sort(), ['actor','peer']);
    assert.deepEqual(listing.businesses.map(b => b.id), ['a']);
    for (const id of ['foreign','powerful','root']) {
      assert.equal((await api.PATCH(req({id, username:'changed', currentPassword:'known-target-password'}, 'PATCH'))).status, 403);
      assert.notEqual((await api.DELETE(req({currentPassword:'correct'}, 'DELETE', `https://test/api/admin-accounts?id=${id}`))).status, 200);
    }
    assert.equal((await api.PATCH(req({id:'peer', businessIds:['a'], canManageSettings:true}, 'PATCH'))).status, 200);
    assert.equal((await api.DELETE(req({currentPassword:'correct'}, 'DELETE', 'https://test/api/admin-accounts?id=peer'))).status, 200);
  } finally { db.close(); }
});

test('business writes require business authority and global reorder requires all businesses', async () => {
  let writes = 0;
  const api = sourceLoader({
    '@/app/admin-session': {
      requireAdminApi: async o => o?.businessId === 'b' ? new Response(null,{status:403}) : null,
      getAdminSession: async () => ({business_ids_json:'["a"]'}), accountBusinessIds: () => ['a'], verifyPassword: async () => true,
    },
    '@/db/knowledge': { listBusinesses: async () => [{id:'a'}, {id:'b'}], ensureKnowledgeSchema: async () => { writes++; throw new Error('unexpected write'); } },
    '@/db/data-maintenance': {},
  })('app/api/businesses/route.ts');
  assert.equal((await api.PATCH(req({id:'b', name:'changed'},'PATCH'))).status,403);
  assert.equal((await api.PATCH(req({order:['b','a']},'PATCH'))).status,403);
  assert.equal((await api.DELETE(req({password:'correct'},'DELETE','https://test/api/businesses?id=b'))).status,403);
  assert.equal(writes,0);
});

test('login limits survive module restarts, block parallel guesses, and expire without storing identifiers', async () => {
  const { db, DB } = database();
  const saved = process.env.ADMIN_SESSION_SECRET;
  process.env.ADMIN_SESSION_SECRET = 'test-only-session-secret';
  const loader = () => sourceLoader({ 'node:crypto':nodeCrypto, 'node:net':nodeNet, './knowledge': {ensureKnowledgeSchema:async()=>DB} })('db/admin-login-limits.ts');
  const request = n => new Request('https://test/api/admin-login', {headers:{'x-forwarded-for':`203.0.113.${n}`}});
  try {
    const now = 60 * 60 * 1000;
    const first = loader();
    const results = await Promise.all(Array.from({length:14},(_,i)=>first.consumeAdminLoginAllowance(request(i+1),'sensitive-admin-name',now)));
    assert.equal(results.filter(r=>r.allowed).length,10);
    const blocked = await loader().consumeAdminLoginAllowance(request(90),'sensitive-admin-name',now);
    assert.equal(blocked.allowed,false); assert.equal(blocked.retryAfter,900);
    assert.doesNotMatch(JSON.stringify(db.prepare('SELECT * FROM admin_login_limits').all()),/sensitive-admin-name|203\.0\.113/);
    assert.equal((await loader().consumeAdminLoginAllowance(request(1),'sensitive-admin-name',now+900_000)).allowed,true);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM admin_login_limits').get().count,2);
    for(let i=0;i<29;i++) assert.equal((await first.consumeAdminLoginAllowance(request(1),`user-${i}`,now+900_000)).allowed,true);
    assert.equal((await first.consumeAdminLoginAllowance(request(1),'another-user',now+900_000)).allowed,false);
  } finally { db.close(); if(saved===undefined)delete process.env.ADMIN_SESSION_SECRET;else process.env.ADMIN_SESSION_SECRET=saved; }
});

test('rate-limited login returns Retry-After before any password or account work', async () => {
  let reads=0;
  const api=sourceLoader({
    '@/app/admin-session': {findAdmin:async()=>{reads++;}},
    '@/db/admin-login-limits': {consumeAdminLoginAllowance:async()=>({allowed:false,retryAfter:123})},
  })('app/api/admin-login/route.ts');
  const response=await api.POST(req({id:'admin',password:'wrong'}));
  assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'123');assert.equal(reads,0);
});

test('export authentication rejects short, missing, malformed and incorrect tokens before DB access', async () => {
  const saved=process.env.DRIVE_EXPORT_KEY;process.env.DRIVE_EXPORT_KEY='x'.repeat(40);
  let reads=0;
  const api=sourceLoader({'node:crypto':nodeCrypto, '@/db/knowledge':{ensureKnowledgeSchema:async()=>{reads++;throw new Error('unavailable');}}})('app/api/export/route.ts');
  try {
    for(const authorization of ['', 'Basic '+process.env.DRIVE_EXPORT_KEY, process.env.DRIVE_EXPORT_KEY, 'Bearer wrong', 'Bearer '+process.env.DRIVE_EXPORT_KEY+' trailing']) {
      assert.equal((await api.GET(new Request('https://test/api/export',{headers:{authorization}}))).status,401);
    }
    assert.equal(reads,0);
    assert.equal((await api.GET(new Request('https://test/api/export',{headers:{authorization:'Bearer '+process.env.DRIVE_EXPORT_KEY}}))).status,500);
    assert.equal(reads,1);
    const {matchesSecretToken}=sourceLoader({'node:crypto':nodeCrypto})('app/secret-token.ts');
    assert.equal(matchesSecretToken('short','short'),false);
    assert.equal(matchesSecretToken('replace-with-a-long-random-secret','replace-with-a-long-random-secret'),false);
    assert.equal(matchesSecretToken('x'.repeat(40),'x'.repeat(40)),true);
    assert.equal(matchesSecretToken('x'.repeat(40),'x'.repeat(39)),false);
    process.env.DRIVE_EXPORT_KEY='replace-with-a-long-random-secret';
    assert.equal((await api.GET(new Request('https://test/api/export',{headers:{authorization:'Bearer '+process.env.DRIVE_EXPORT_KEY}}))).status,401);
    assert.equal(reads,1);
  } finally {if(saved===undefined)delete process.env.DRIVE_EXPORT_KEY;else process.env.DRIVE_EXPORT_KEY=saved;}
});
