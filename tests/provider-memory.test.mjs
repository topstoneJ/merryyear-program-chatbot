import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './load-source.mjs';

test('non-chat provider responses are consumed once without retaining a cloned stream', async t => {
  const payload = { steps: [{ type: 'model_output', content: [{ type: 'text', text: 'unchanged' }] }] };
  const upstream = Response.json(payload);
  t.mock.method(upstream, 'clone', () => { throw new Error('unneeded response clone'); });
  t.mock.method(globalThis, 'fetch', async () => upstream);
  const records = [];
  const { trackedGeminiFetch } = sourceLoader({
    './knowledge': { knowledgeEnv: () => ({ DB: { prepare: () => ({ bind: (...values) => ({ run: async () => records.push(values) }) }) } }) },
    './api-pricing': { readApiUsage: () => ({ input: 1, output: 1, thought: 0, cached: 0, estimatedUsd: 0 }) },
    './ai-provider': { prepareAiRequest: () => ({ url: 'https://test.invalid', init: {}, model: 'test', provider: 'google' }), normalizeAiPayload: value => value },
  })('db/api-usage.ts');
  const response = await trackedGeminiFetch('knowledge', {});
  assert.deepEqual(await response.json(), payload);
  assert.equal(upstream.bodyUsed, true);
  assert.equal(upstream.clone.mock.callCount(), 0);
  assert.equal(records.length, 1);
});
