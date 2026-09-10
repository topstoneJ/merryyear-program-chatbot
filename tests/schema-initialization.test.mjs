import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './load-source.mjs';

test('concurrent requests share one schema initialization', async () => {
  let noticeColumnAlters = 0;
  const DB = {
    async batch() {},
    prepare(sql) {
      const statement = {
        bind() { return statement; },
        async all() {
          if (sql.includes('table_info(businesses)')) return {results:[{name:'is_public'},{name:'contact_department'},{name:'contact_phone'},{name:'contact_hours'}]};
          if (sql.includes('table_info(site_settings)')) return {results:[{name:'gemini_api_key_encrypted'}]};
          if (sql.includes('table_info(admin_accounts)')) return {results:[{name:'is_super_admin'}]};
          return {results:[]};
        },
        async first() { return null; },
        async run() {
          if (sql.includes('ADD COLUMN notice_url')) {
            noticeColumnAlters += 1;
            await new Promise(resolve => setTimeout(resolve, 5));
            if (noticeColumnAlters > 1) throw new Error('duplicate column');
          }
          return {};
        },
      };
      return statement;
    },
  };
  const knowledge = sourceLoader({
    './runtime': { runtimeEnv: () => ({DB}) },
    './azure-schema': { ensureAzureSchema: async () => {} },
  })('db/knowledge.ts');
  const results = await Promise.all(Array.from({length:8}, () => knowledge.ensureKnowledgeSchema()));
  assert.ok(results.every(result => result === DB));
  assert.equal(noticeColumnAlters, 1);
});
