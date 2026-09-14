import test from 'node:test';
import assert from 'node:assert/strict';
import { chatHarness, sourceLoader } from './load-source.mjs';
const knowledge = (text) => ({ sources: [{ id: 'doc', businessId: 'test', title: '사업 안내문', type: 'text', updatedAt: 1, url: null, parts: [{ id: '0', title: '문의처', text, pages: [] }] }], conflicts: [], withheldParts: 0 });
const referralDraft = { decision: 'consult', resolution: 'action_required', text: '개별 접수 결과는 담당자 확인이 필요해요.\n\n출처: 사업 안내문' };

test('citations remain last after the server adds both email and phone, regardless of source option', async () => {
  for (const showSources of [false, true]) {
    const h = chatHarness({ knowledge: knowledge('사업 담당자 문의\n전화번호: 02-1234-5678\n이메일: support@example.org'), settings: { showSources }, draft: referralDraft });
    const r = await h.ask(); const text = r.payload.answer.text;
    assert.equal(r.status, 200);
    assert.match(text, /이메일: support@example.org\n전화번호: 02-1234-5678/);
    assert(text.endsWith('출처: 사업 안내문'));
    assert.equal(text.match(/출처:/g).length, 1);
    assert.equal(h.records[0].answer, text);
  }
});

test('source display option adds a verified citation if the model omitted it', async () => {
  const h = chatHarness({ settings: { showSources: true, alwaysContact: true } });
  const r = await h.ask();
  assert(r.payload.answer.text.endsWith('출처: 공개 안내문'));
  assert.match(r.payload.answer.text, /이메일: 등록 자료에서 확인되지 않음\n전화번호: 02-1234-5678/);
});

test('email-only contact keeps both labels without inventing a phone', async () => {
  const h = chatHarness({ knowledge: knowledge('사업 담당자 문의 이메일: help@example.org'), draft: referralDraft });
  const r = await h.ask();
  assert.match(r.payload.answer.text, /이메일: help@example.org\n전화번호: 등록 자료에서 확인되지 않음/);
});

test('a phone already in the body cannot suppress the email and phone pair', async () => {
  const h = chatHarness({ knowledge: knowledge('사업 담당자 문의: 02-1234-5678\n이메일: help@example.org'), draft: { text: '담당자에게 02-1234-5678로 문의하세요.', contactPhone: '02-1234-5678', contactEvidence: '사업 담당자 문의: 02-1234-5678' } });
  assert.match((await h.ask()).payload.answer.text, /이메일: help@example.org\n전화번호: 02-1234-5678/);
});

test('unverified email in the body is withheld and replaced with verified paired contact', async () => {
  const h = chatHarness({ knowledge: knowledge('사업 담당자 문의: 02-1234-5678\n이메일: help@example.org'), draft: { text: '담당자에게 invented@example.net으로 문의하세요.' } });
  const text = (await h.ask()).payload.answer.text;
  assert.doesNotMatch(text, /invented@example.net/);
  assert.match(text, /이메일: help@example.org\n전화번호: 02-1234-5678/);
});

test('email pairing excludes other contact blocks, donations, ambiguity and conflicts', () => {
  const { findBusinessEmail } = sourceLoader()('app/answer-contact.ts');
  const data = knowledge('사업 담당자 문의: 02-1234-5678\n이메일: program@example.org\n\n다른 부서 문의: 02-9876-5432\n이메일: other@example.org\n\n후원 문의: 02-9999-9999\n이메일: donation@example.org');
  assert.equal(findBusinessEmail(data, '02-1234-5678'), 'program@example.org');
  assert.equal(findBusinessEmail(data, '02-9999-9999'), null);
  assert.equal(findBusinessEmail(data), null);
  data.conflicts = [{ left: { quote: 'program@example.org' }, right: { quote: 'changed@example.org' } }];
  assert.equal(findBusinessEmail(data, '02-1234-5678'), null);
});

test('ordinary answers stay free of automatic contact or source footers', async () => {
  const h = chatHarness();
  assert.equal((await h.ask()).payload.answer.text, '온라인으로 신청해요.');
});

test('next steps after a citation are moved before the final citation footer', async () => {
  const h = chatHarness({ draft: { text: '온라인으로 신청해요.\n출처: 공개 안내문\n다음 행동: 서류를 준비해 주세요.' } });
  const text = (await h.ask()).payload.answer.text;
  assert(text.endsWith('출처: 공개 안내문'));
  assert(text.indexOf('다음 행동') < text.indexOf('출처:'));
});
