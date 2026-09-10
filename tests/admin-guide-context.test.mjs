import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './load-source.mjs';

function database(log) {
  const businesses = [
    {id:'allowed',name:'허용 사업',is_public:1,notice_url:'https://example.org',contact_department:'사업팀',contact_phone:'02-111-2222',contact_hours:'평일 10:00~17:00',sort_order:1,created_at:1},
    {id:'hidden',name:'권한 밖 사업',is_public:0,notice_url:'',contact_department:'',contact_phone:'',contact_hours:'',sort_order:2,created_at:2},
  ];
  return { prepare(sql) { log.push(sql); const statement = { bind(){ return statement; }, async all(){
    if(sql.includes('FROM businesses')) return {results:businesses};
    if(sql.includes('FROM knowledge_sources')) return {results:[{business_id:'allowed',type:'pdf',status:'ready',enabled:1,count:2,latest_at:10}]};
    if(sql.includes('FROM knowledge_conflict_checks')) return {results:[]};
    if(sql.includes('GROUP BY business_id, decision')) return {results:[{business_id:'allowed',decision:'fact',category:'지원 내용',count:3,review_count:0}]};
    if(sql.includes('GROUP BY business_id, question')) return {results:[{business_id:'allowed',question:'반복 질문',count:2}]};
    if(sql.includes('FROM admin_accounts')) return {results:[]};
    return {results:[]};
  }, async first(){
    if(sql.includes('FROM site_settings')) return {organization_name:'기관',contact:'02-000-0000',answer_settings_json:'{}',gemini_api_key_encrypted:null};
    if(sql.includes('FROM api_usage')) return {requests:4,failed:1};
    return null;
  }}; return statement; } };
}

function loadContext(account, log) {
  return sourceLoader({
    '@/app/admin-session': { accountBusinessIds: value => JSON.parse(value.business_ids_json || '[]') },
    '@/db/knowledge': { ensureKnowledgeSchema: async () => database(log) },
  })('app/admin-guide-context.ts').loadAdminGuideContext(account);
}

test('guide context never crosses the current account business or feature permissions', async () => {
  const log=[];
  const context=await loadContext({username:'limited',business_ids_json:'["allowed"]',is_super_admin:0,can_view_consultations:0,can_delete_consultations:0,can_manage_settings:0},log);
  assert.deepEqual(context.businesses.map(item=>item.name),['허용 사업']);
  assert.doesNotMatch(JSON.stringify(context),/권한 밖 사업|settings|consultationsLast30Days|administratorPermissions/);
  assert.ok(!log.some(sql=>sql.includes('FROM consultations')||sql.includes('FROM site_settings')||sql.includes('FROM admin_accounts')));
});

test('guide context includes consultation and setting summaries only with matching permissions', async () => {
  const log=[];
  const context=await loadContext({username:'manager',business_ids_json:'["allowed"]',is_super_admin:0,can_view_consultations:1,can_delete_consultations:0,can_manage_settings:1},log);
  assert.equal(context.consultationsLast30Days.repeatedQuestions[0].question,'반복 질문');
  assert.equal(context.settings.apiUsageLast30Days.failed,1);
  assert.ok(Array.isArray(context.administratorPermissions));
  assert.doesNotMatch(JSON.stringify(context),/권한 밖 사업/);
});
