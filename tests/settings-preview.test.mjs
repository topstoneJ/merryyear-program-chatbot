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
 for(const value of ['미리보기 기관','수정된 제목','저장 전 보조 문구','blob:draft-logo','--orange:#123456','--brand-secondary:#abcdef','placeholder="궁금한 내용을 적어 주세요"']) assert.ok(html.includes(value),value);
 assert.ok(!html.includes('href="/consultations"'));
});
