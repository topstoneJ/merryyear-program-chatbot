import assert from 'node:assert/strict';
import test from 'node:test';
import { chatHarness, sourceLoader } from './load-source.mjs';

test('consultations older than one year are deleted at the exact retention boundary', async () => {
  const calls = [];
  const DB = { prepare(sql) { return { values: [], bind(...values) { this.values = values; return this; }, async run() { calls.push({ sql, values: this.values }); return { meta: { changes: 1 } }; } }; } };
  const { CONSULTATION_RETENTION_MS, deleteExpiredConsultations } = sourceLoader({ './runtime': { runtimeEnv: () => ({}) } })('db/knowledge.ts');
  const now = Date.UTC(2026, 8, 18, 12);
  await deleteExpiredConsultations(DB, now);
  assert.equal(calls[0].sql, 'DELETE FROM consultations WHERE created_at < ?');
  assert.equal(calls[0].values[0], now - CONSULTATION_RETENTION_MS);
});

test('the 101st daily question is blocked before model generation', async () => {
  const h = chatHarness({ dailyAllowed: false, requestHeaders: { 'x-forwarded-for': '203.0.113.4' } });
  const result = await h.ask();
  assert.equal(result.status, 429);
  assert.equal(result.payload.code, 'daily_question_limit');
  assert.equal(result.payload.error, '오늘은 너무 많이 질문하셨어요. 내일 다시 해주세요.');
  assert.equal(h.requests.length, 0);
  assert.equal(h.records.length, 0);
});

test('new consultation records keep the conversation session and turn order', async () => {
  const h = chatHarness();
  const result = await h.ask({ sessionId: 'session-123', history: [{ question: '첫 질문', answer: '첫 답변' }] });
  assert.equal(result.status, 200);
  assert.equal(h.records[0].sessionId, 'session-123');
  assert.equal(h.records[0].turnIndex, 1);
});

test('chat handoff questions receive the fixed privacy-safe system answer', async () => {
  const h = chatHarness();
  const result = await h.ask({ question: '챗봇이랑 얘기하면 사람한테도 전달돼?' });
  assert.equal(result.status, 200);
  assert.match(result.payload.answer.text, /개인정보를 입력하지 않은 질문의 상황 정보/);
  assert.match(result.payload.answer.text, /담당자와 직접 소통하려면/);
  assert.equal(h.requests.length, 0);
});
