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
    assert.doesNotMatch(text, /사업 담당자 문의/);
    assert(text.endsWith('출처: 사업 안내문'));
    assert.equal(text.match(/출처:/g).length, 1);
    assert.equal(h.records[0].answer, text);
  }
});

test('contact hours explicitly describe phone consultation rather than all inquiries', async () => {
  const h = chatHarness({ knowledge: knowledge('사업 담당자 문의\n전화번호: 02-1234-5678\n이메일: support@example.org\n전화 상담 가능 시간: 평일 오전 10시부터 12시, 오후 14시부터 17시'), draft: { ...referralDraft, text: '문의는 평일 오전 10시부터 12시, 오후 14시부터 17시까지 가능해요.\n\n출처: 사업 안내문' } });
  const text = (await h.ask({ question: '담당자 연락처를 알려주세요' })).payload.answer.text;
  assert.match(text, /전화 상담은 평일 오전 10시부터 12시, 오후 14시부터 17시까지 가능해요/);
  assert.doesNotMatch(text, /문의는 평일/);
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

test('a source-backed application email is an application channel, not a referral', async () => {
  const applicationKnowledge = { sources: [{ id: 'doc', businessId: 'test', title: '2026 안내문', type: 'text', updatedAt: 1, url: null, parts: [
    { id: '0', title: '신청 방법', text: '신청기관이 신청서, 신청 공문, 개인정보 동의서를 취합해 apply@example.org 이메일로 제출합니다.', pages: [] },
    { id: '1', title: '문의처', text: '사업 담당자 문의: 02-1234-5678\n이메일: help@example.org', pages: [] },
  ] }], conflicts: [], withheldParts: 0 };
  const h = chatHarness({ knowledge: applicationKnowledge, draft: { text: '신청 서류는 `apply@example.org`로 보내면 돼요.' } });
  const answer = (await h.ask({ question: '어떻게 신청하나요?' })).payload.answer;
  assert.equal(answer.review, false);
  assert.match(answer.text, /apply@example\.org/);
  assert.doesNotMatch(answer.text, /확인 필요|help@example\.org|02-1234-5678|`/);
});

test('FAQ readiness is derived by the server when registered contact details are complete', async () => {
  const contactKnowledge = { sources: [{ id: 'required', businessId: 'test', title: '사업 필수 정보', type: 'text', updatedAt: 1, url: null, parts: [
    { id: '0', title: '담당자 연락처', text: '담당 부서는 열매나눔재단 임팩트사업1팀이고, 전화는 02-2665-0046, 이메일은 impact@merryyear.org입니다. 전화 상담 가능 시간은 평일 10:00~12:00, 14:00~17:00입니다.', pages: [] },
  ] }], conflicts: [], withheldParts: 0 };
  const h = chatHarness({ knowledge: contactKnowledge, draft: { source: 'required', review: true, text: '담당 부서는 열매나눔재단 임팩트사업1팀이고, 전화는 02-2665-0046, 이메일은 impact@merryyear.org예요. 전화 상담 가능 시간은 평일 10:00~12:00, 14:00~17:00이에요.' } });
  const answer = (await h.ask({ question: '담당자 연락처를 알려주세요.' })).payload.answer;
  assert.equal(answer.review, false);
  assert.match(answer.text, /impact@merryyear\.org/);
  assert.match(answer.text, /02-2665-0046/);
});

test('an unrelated email elsewhere in the source cannot masquerade as an application channel', async () => {
  const mixedKnowledge = { sources: [{ id: 'doc', businessId: 'test', title: '통합 안내문', type: 'text', updatedAt: 1, url: null, parts: [
    { id: '0', title: '신청 방법', text: '신청서는 온라인 양식으로 제출합니다.', pages: [] },
    { id: '1', title: '후원 안내', text: '후원 문의 이메일: donation@example.org', pages: [] },
  ] }], conflicts: [], withheldParts: 0 };
  const h = chatHarness({ knowledge: mixedKnowledge, draft: { text: '신청 서류는 donation@example.org로 보내면 돼요.' } });
  const answer = (await h.ask({ question: '어떻게 신청하나요?' })).payload.answer;
  assert.equal(answer.review, true);
  assert.doesNotMatch(answer.text, /donation@example\.org/);
  assert.match(answer.text, /이메일 확인 필요/);
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
