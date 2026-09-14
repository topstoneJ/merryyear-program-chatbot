import privacy from './load-chat-privacy.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {sourceLoader} from './load-source.mjs';
const branding=sourceLoader()('app/branding.ts');
const require=createRequire(import.meta.url);
const output={};
new Function('require','exports',ts.transpileModule(await readFile(new URL('../app/home-client.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>name==='./branding'?branding:name==='./resident-number'?privacy:name==='./answer-text'?{default:()=>null}:name==='./admin-guide'?{ADMIN_GUIDE_BUSINESS_ID:'__admin-guide',ADMIN_GUIDE_BUSINESS_NAME:'사업 안내 챗봇 운영 가이드'}:name==='./chat-context'?{CHAT_LIMIT_MESSAGE:'대화가 길어져 더 이상 이어갈 수 없습니다. 새로고침하여 새 대화를 시작해 주세요.',MAX_CHAT_CHARACTERS:50000,MAX_CHAT_TURNS:100}:name==='./browser-branding'?{syncBrowserBranding:()=>{}}:require(name),output);
test('main preview renders unsaved branding and text from the draft',()=>{
 const html=renderToStaticMarkup(React.createElement(output.HomeClient,{previewSettings:{organizationName:'미리보기 기관',contact:'test',logoUrl:'blob:draft-logo',mainHeadline:'{기관명} 수정된 제목',mainSubcopy:'저장 전 보조 문구',chatbotGreeting:'저장 전 인사말',chatPlaceholder:'궁금한 내용을 적어 주세요',primaryColor:'#123456',secondaryColor:'#abcdef'}}));
 for(const value of ['미리보기 기관','수정된 제목','저장 전 보조 문구','blob:draft-logo','--orange:#123456','--gold:#123456','--hero-gradient-color:#abcdef','placeholder="궁금한 내용을 적어 주세요"']) assert.ok(html.includes(value),value);
 assert.ok(!html.includes('href="/consultations"'));
});

test('secondary color is saved and previewed, and only colors the home background', async()=>{
 const settings=await readFile(new URL('../app/settings/page.tsx',import.meta.url),'utf8');
 const css=await readFile(new URL('../app/globals.css',import.meta.url),'utf8');
 assert.match(settings,/aria-label="서브컬러"/);
 assert.match(settings,/"primaryColor", "secondaryColor"\] as const\) form.set/);
 assert.match(settings,/sessionStorage.setItem\([^\n]*primaryColor, secondaryColor/);
 const rules=css.split('}').filter(rule=>rule.includes('--hero-gradient-color'));
 assert.equal(rules.length,1);
 assert.match(rules[0],/^\s*\.public-shell\s*\{/);
 assert.match(rules[0],/radial-gradient/);
 assert.doesNotMatch(rules[0],/--orange|--brand-surface/);
 const html=renderToStaticMarkup(React.createElement(output.HomeClient));
 assert.ok(html.includes('--hero-gradient-color:#808080'));
});

test('logo loading keeps a fixed slot and design controls use the compact requested order', async()=>{
 const [home,settings,uploads,css]=await Promise.all([
  readFile(new URL('../app/home-client.tsx',import.meta.url),'utf8'),
  readFile(new URL('../app/settings/page.tsx',import.meta.url),'utf8'),
  readFile(new URL('../app/settings/brand-image-upload.tsx',import.meta.url),'utf8'),
  readFile(new URL('../app/globals.css',import.meta.url),'utf8'),
 ]);
 assert.match(home,/settingsLoaded && <img className=\{logoReady/);
 assert.match(css,/\.brand-logo-media \{[^}]*flex: 0 0 210px[^}]*width: 210px[^}]*height: 52px/);
 assert.match(css,/\.brand-logo-media img \{[^}]*object-fit: contain[^}]*opacity: 0/);
 const loadingHtml=renderToStaticMarkup(React.createElement(output.HomeClient));
 assert.match(loadingHtml,/<span class="brand-logo-media"><\/span>/);
 assert.doesNotMatch(loadingHtml,/default-organization-logo/);
 assert.match(css,/\.design-logo-card \{ grid-column: 1; grid-row: 1; \}/);
 assert.match(css,/\.design-favicon-card \{ grid-column: 2; grid-row: 1; \}/);
 assert.match(css,/\.design-color-card \{ grid-column: 1; grid-row: 2; \}/);
 assert.ok(settings.indexOf('design-logo-card') < settings.indexOf('design-color-card'));
 assert.ok(settings.indexOf('design-color-card') < settings.indexOf('design-favicon-card'));
 assert.doesNotMatch(settings,/채팅 말풍선과 버튼 색상은 바뀌지 않습니다/);
 assert.match(settings,/design-control-row"><button[\s\S]{0,400}>초기화<\/button><button className="logo-upload"/);
 assert.match(uploads,/brand-image-actions[\s\S]*초기화[\s\S]*brand-image-file/);
 assert.match(css,/\.brand-image-field \{[^}]*padding: 0[^}]*border: 0/);
});
