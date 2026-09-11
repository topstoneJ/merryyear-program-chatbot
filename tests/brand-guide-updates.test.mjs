import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {sourceLoader,chatHarness} from './load-source.mjs';
const require=createRequire(import.meta.url);
const builtins=Object.fromEntries(['node:sqlite','node:fs','node:fs/promises','node:path','node:crypto'].map(name=>[name,require(name)]));
const load=sourceLoader(builtins);
const {LocalDatabase}=load('db/local-runtime.ts');
const {brandTheme}=load('app/branding.ts');
const {ADMIN_GUIDE_SECTIONS}=load('app/admin-guide.ts');
const {offlineGuideAnswer}=load('app/admin-guide-offline.ts');

test('brand defaults and text contrast support black, gray, white and custom colors',()=>{
  assert.equal(brandTheme()['--orange'],'#000000');
  assert.equal(brandTheme()['--brand-secondary'],'#808080');
  assert.equal(brandTheme('#000000')['--on-primary'],'#ffffff');
  assert.equal(brandTheme('#ffffff')['--on-primary'],'#000000');
  assert.equal(brandTheme('#123456','#abcdef')['--brand-secondary'],'#abcdef');
  assert.equal(brandTheme('invalid','invalid')['--orange'],'#000000');
});

test('real database migrates secondary color without replacing existing institutional data',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'brand-migration-'));const DB=new LocalDatabase(dir);
  const loader=()=>sourceLoader({...builtins,'./runtime':{runtimeEnv:()=>({DB})}});
  try{
    await loader()('db/knowledge.ts').ensureKnowledgeSchema();
    let row=await DB.prepare("SELECT * FROM site_settings WHERE id='default'").first();
    assert.equal(row.primary_color,'#000000');assert.equal(row.secondary_color,'#808080');
    await DB.prepare("UPDATE site_settings SET organization_name='기존 기관',primary_color='#123456',updated_at=123").run();
    await DB.prepare('ALTER TABLE site_settings DROP COLUMN secondary_color').run();
    await loader()('db/knowledge.ts').ensureKnowledgeSchema();
    row=await DB.prepare('SELECT * FROM site_settings').first();
    assert.equal(row.primary_color,'#123456');assert.equal(row.secondary_color,'#808080');
    await DB.prepare("UPDATE site_settings SET organization_name='기존 기관',primary_color='#123456',secondary_color='#abcdef',updated_at=123").run();
    await loader()('db/knowledge.ts').ensureKnowledgeSchema();
    row=await DB.prepare('SELECT * FROM site_settings').first();
    assert.equal(row.organization_name,'기존 기관');assert.equal(row.primary_color,'#123456');assert.equal(row.secondary_color,'#abcdef');
    let denied=false;
    const api=sourceLoader({'@/app/admin-session':{requireAdminApi:async()=>denied?new Response(null,{status:403}):null},'@/db/knowledge':{ensureKnowledgeSchema:async()=>DB,knowledgeEnv:()=>({}),encryptConfiguredGeminiApiKey:async()=>''}})('app/api/settings/route.ts');
    const request=(secondary)=>{const form=new FormData();for(const key of ['organizationName','mainHeadline','mainSubcopy','chatbotGreeting'])form.set(key,'기존 기관');form.set('primaryColor','#123456');if(secondary!==undefined)form.set('secondaryColor',secondary);return new Request('https://test/api/settings',{method:'PATCH',body:form});};
    assert.equal((await api.PATCH(request('bad'))).status,400);
    denied=true;assert.equal((await api.PATCH(request('#445566'))).status,403);denied=false;
    assert.equal((await api.PATCH(request('#445566'))).status,200);
    assert.equal((await (await api.GET(new Request('https://test/api/settings'))).json()).settings.secondaryColor,'#445566');
    await api.PATCH(request());assert.equal((await DB.prepare('SELECT secondary_color FROM site_settings').first()).secondary_color,'#445566');
  }finally{DB.close();await rm(dir,{recursive:true,force:true});}
});

test('guide credits appear first and all 19 sections are sequentially numbered',()=>{
  assert.equal(ADMIN_GUIDE_SECTIONS.length,19);
  ADMIN_GUIDE_SECTIONS.forEach((section,index)=>assert(section.title.startsWith(`${index+1}. `)));
  assert.match(ADMIN_GUIDE_SECTIONS[0].title,/누가, 왜 만들었나요/);
  assert.match(ADMIN_GUIDE_SECTIONS[0].bullets[0],/사회복지법인 열매나눔재단/);
});

test('offline guide finds basic topics and never invents live data',()=>{
  for(const [question,expected] of [['누가 만들었나요?',/열매나눔재단/],['API 키는 어디서 등록하나요?',/API 관리/],['PDF 업로드 방법',/공식 문서/],['16번 알려줘',/로고/]])assert.match(offlineGuideAnswer(question).text,expected);
  assert.match(offlineGuideAnswer('오늘 날씨 알려줘').text,/관련 항목을 찾지 못/);
  assert.match(offlineGuideAnswer('우리 API 키 보여줘').text,/조회한 결과는 아닙니다/);
});

test('guide works without API keys, requires authentication and records no consultations',async()=>{
  const h=chatHarness({admin:{is_super_admin:0},noApiKey:true});
  const result=await h.ask({businessId:'__admin-guide',question:'API 키 등록 방법'});
  assert.equal(result.status,200);assert.match(result.payload.answer.text,/API 관리/);assert.equal(h.requests.length,0);assert.equal(h.records.length,0);
  const anonymous=chatHarness({noApiKey:true});assert.equal((await anonymous.ask({businessId:'__admin-guide'})).status,404);
});

test('guide falls back to the document when a registered API is unavailable',async()=>{
  const h=chatHarness({admin:{is_super_admin:1},apiError:new Error('unavailable')});
  const result=await h.ask({businessId:'__admin-guide',question:'누가 만들었나요?'});
  assert.equal(result.status,200);assert.match(result.payload.answer.text,/열매나눔재단/);assert.equal(h.records.length,0);
});

test('visual brand roles and API status are not hard-coded to orange or connection success',async()=>{
  const surfaces=await readFile(new URL('../app/brand-surfaces.css',import.meta.url),'utf8');
  assert.match(surfaces,/\.user-message\s*\{\s*background: var\(--brand-secondary\)/);
  const css=await readFile(new URL('../app/globals.css',import.meta.url),'utf8');assert.doesNotMatch(css,/#f26a2e|#f6b73c|#ee9f77/i);
  const ui=await readFile(new URL('../app/settings/api-management-panel.tsx',import.meta.url),'utf8');assert.match(ui,/API 키 미등록/);assert.match(ui,/실제 연결 미확인/);
  const blank=await readFile(new URL('../public/default-social-image.svg',import.meta.url),'utf8');assert.match(blank,/fill="#ffffff"/);assert.doesNotMatch(blank,/<text|<path|<circle/);
});
