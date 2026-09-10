import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
async function load(path,deps){const out={};new Function('require','exports',ts.transpileModule(await readFile(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>deps[name]||require(name),out);return out;}
test('access endpoint exposes only permission and recognizes super admins',async()=>{
 let account=null;const route=await load('app/api/admin-access/route.ts',{'@/app/admin-session':{getAdminSession:async()=>account}});
 assert.equal((await route.GET()).status,401);
 for(const [value,expected] of [[{can_manage_settings:0},false],[{can_manage_settings:1},true],[{is_super_admin:1,can_manage_settings:0},true]]){account=value;const response=await route.GET();assert.deepEqual(await response.json(),{canManageSettings:expected});assert.equal(response.headers.get('Cache-Control'),'no-store');}
});
test('denied settings click opens an alert without navigation; allowed click navigates',async()=>{
 const previousWindow=globalThis.window,previousFetch=globalThis.fetch;const alerts=[],moves=[];let allowed=false,prevented=0;
 globalThis.window={alert:message=>alerts.push(message),location:{assign:url=>moves.push(url)}};
 globalThis.fetch=async()=>Response.json({canManageSettings:allowed});
 try{const nav=await load('app/admin-nav.tsx',{react:{useState:()=>[false,()=>{}],useEffect:()=>{}}});const link=nav.default({current:'knowledge'}).props.children.find(child=>child.props.href==='/settings');await link.props.onClick({preventDefault(){prevented++;}});assert.equal(alerts.length,1);assert.equal(moves.length,0);allowed=true;await link.props.onClick({preventDefault(){prevented++;}});assert.deepEqual(moves,['/settings']);assert.equal(prevented,2);}finally{globalThis.window=previousWindow;globalThis.fetch=previousFetch;}
});
test('guide is a direct top-level link between business management and settings',async()=>{
 const nav=await load('app/admin-nav.tsx',{react:{useState:()=>[false,()=>{}],useEffect:()=>{}}});
 const links=nav.default({current:'guide'}).props.children;
 assert.deepEqual(links.map(link=>link.props.href),['/consultations','/knowledge','/guide','/settings']);
 const guide=links.find(link=>link.props.href==='/guide');
 assert.match(guide.props.className,/active/);
 assert.equal(guide.props.onClick,undefined);
});
