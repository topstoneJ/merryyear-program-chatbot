import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function moduleAt(path, require) {
  const output = {};
  const code = ts.transpileModule(await readFile(new URL('../' + path, import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function('require', 'exports', code)(require, output);
  return output;
}
const branding = await moduleAt('app/branding.ts', () => ({}));
const png = new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])], 'icon.png', {type:'image/png'});
test('brand images reject unsupported, oversized and mismatched content', async () => {
  assert.equal(await branding.validBrandImage(png), true);
  for (const file of [new File(['<svg/>'], 'a.svg',{type:'image/svg+xml'}),new File(['not PNG'], 'a.png',{type:'image/png'}),new File([new Uint8Array(3*1024*1024+1)],'large.png',{type:'image/png'})]) assert.equal(await branding.validBrandImage(file), false);
});
test('saved image links change when replaced; no image preserves defaults', () => {
  assert.equal(branding.brandingUrls(null).socialImageUrl, '/default-social-image.svg');
  assert.notEqual(branding.brandingUrls({favicon_key:'first'}).faviconUrl, branding.brandingUrls({favicon_key:'second'}).faviconUrl);
});
test('settings authenticate uploads, preserve unselected images, and serve saved bytes publicly', async () => {
  let denied = true;
  let row = {logo_key:null,favicon_key:'old-icon',social_image_key:'old-social',gemini_api_key_encrypted:'encrypted',updated_at:0};
  const objects = new Map();
  const DB = {prepare(sql) { return { async first(){return row;},bind(...values){return {async run(){row = values.length === 3 ? {...row,social_image_key:values[0],updated_at:values[1],social_caption:values[2]} : {...row, favicon_key:values[9],social_image_key:values[10],updated_at:values[8]};}};}};}};
  const api = await moduleAt('app/api/settings/route.ts', name => name === '@/app/branding' ? branding : name === '@/app/admin-session' ? {requireAdminApi: async () => denied ? new Response(null,{status:403}) : null} : {ensureKnowledgeSchema:async()=>DB,encryptConfiguredGeminiApiKey:async()=>'',knowledgeEnv:()=>({KNOWLEDGE_FILES:{async put(key,stream,meta){objects.set(key,{body:await new Response(stream).arrayBuffer(),...meta});},async get(key){return objects.get(key);}}})});
  function request(file) {
    const form = new FormData();
    for(const key of ['organizationName','mainHeadline','mainSubcopy','chatbotGreeting']) form.set(key,'Example');
    form.set('primaryColor','#123456'); if(file) form.set('favicon',file);
    return new Request('https://example.test/api/settings',{method:'PATCH',body:form});
  }
  assert.equal((await api.PATCH(request(png))).status,403); assert.equal(objects.size,0);
  denied = false;
  assert.equal((await api.PATCH(request(new File(['bad'],'a.png',{type:'image/png'})))).status,400); assert.equal(objects.size,0);
  const response = await api.PATCH(request(png)); assert.equal(response.status,200);
  assert.notEqual(row.favicon_key,'old-icon'); assert.equal(row.social_image_key,'old-social');
  const saved = row.favicon_key; await api.PATCH(request()); assert.equal(row.favicon_key,saved);
  const image = await api.GET(new Request('https://example.test/api/settings?asset=favicon'));
  assert.equal(image.status,200); assert.equal(image.headers.get('content-type'),'image/png');
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()),new Uint8Array(await png.arrayBuffer()));
  const form = new FormData(); form.set('action','social-image-only'); form.set('socialImage',png);
  const originalIcon = row.favicon_key;
  const result = await api.PATCH(new Request('https://example.test/api/settings',{method:'PATCH',body:form}));
  assert.equal(result.status,200); assert.notEqual(row.social_image_key,'old-social');
  assert.equal(row.favicon_key,originalIcon); assert.equal(row.gemini_api_key_encrypted,'encrypted');
});

test('default thumbnail uses white 1200x630 canvas and centers the original logo without distortion', async () => {
  const originalImage = globalThis.Image, originalDocument = globalThis.document;
  let drawn, captionDrawn;
  const context = {fillStyle:'',fillRect(...args){assert.equal(this.fillStyle,'#ffffff');assert.deepEqual(args,[0,0,1200,630]);},drawImage(...args){drawn=args;},fillText(...args){captionDrawn=args;}};
  const canvas = {width:0,height:0,getContext:()=>context,toBlob:callback=>callback(new Blob(['png'],{type:'image/png'}))};
  globalThis.Image = class {naturalWidth=420;naturalHeight=106;async decode(){assert.equal(this.src,'/default-organization-logo.svg');}};
  globalThis.document = {createElement:()=>canvas,fonts:{ready:Promise.resolve()}};
  try {
    const generator = await moduleAt('app/settings/default-social-image.ts',()=>({}));
    const file = await generator.createDefaultSocialImage('함께 만드는 변화');
    assert.equal(file.type,'image/png'); assert.equal(canvas.width,1200); assert.equal(canvas.height,630);
    assert.equal(drawn[1]+drawn[3]/2,600); assert.equal(drawn[2]+drawn[4]/2,315);
    assert.ok(Math.abs(drawn[3]/drawn[4]-420/106)<0.0001);
    assert.equal(captionDrawn,undefined);
  } finally { globalThis.Image=originalImage;globalThis.document=originalDocument; }
});

test("thumbnail caption validates 20 Unicode characters and rejects 21", () => {
  assert.equal(branding.validSocialCaption("가".repeat(20)),true);
  assert.equal(branding.validSocialCaption("가".repeat(21)),false);
  assert.equal(branding.validSocialCaption("😀".repeat(20)),true);
});

test('share caption is used for Open Graph and Twitter descriptions while the image stays unchanged',async()=>{
  let caption='함께 만드는 변화';
  const deps={'@/db/knowledge':{knowledgeEnv:()=>({DB:{prepare:()=>({first:async()=>({social_caption:caption,social_image_key:'existing'})})}})},'@/app/branding':branding,'next/font/google':{Noto_Sans_KR:()=>({})},'react/jsx-runtime':{},'./globals.css':{}};
  const layout=await moduleAt('app/layout.tsx',name=>deps[name]);
  const meta=await layout.generateMetadata();assert.equal(meta.openGraph.description,caption);assert.equal(meta.twitter.description,caption);assert.equal(meta.description,caption);
  caption='';const fallback=await layout.generateMetadata();assert.equal(fallback.openGraph.description,fallback.description);assert.deepEqual(fallback.openGraph.images,meta.openGraph.images);
});
