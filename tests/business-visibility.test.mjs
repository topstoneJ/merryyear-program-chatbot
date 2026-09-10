import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
async function load(path, mocks) { const out={}; new Function("require","exports",ts.transpileModule(await readFile(new URL(path,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(()=>mocks,out);return out; }
test("main list exposes hidden businesses only to super admins and is never cached",async()=>{
 let account=null;const rows=[{id:"public",is_public:1},{id:"private",is_public:0}];
 const api=await load("../app/api/businesses/route.ts",{ADMIN_GUIDE_BUSINESS_ID:"__admin-guide",ADMIN_GUIDE_BUSINESS_NAME:"사업 안내 챗봇 운영 가이드",getAdminSession:async()=>account,listBusinesses:async hidden=>hidden?rows:rows.filter(r=>r.is_public)});
 for(const [viewer,ids] of [[null,["public"]],[{is_super_admin:0,can_manage_settings:1},["public","__admin-guide"]],[{is_super_admin:1},["public","private","__admin-guide"]]]){
 account=viewer;const r=await api.GET(new Request("https://test/api/businesses"));
 assert.equal(r.status,200);assert.deepEqual((await r.json()).businesses.map(b=>b.id),ids);assert.match(r.headers.get("Cache-Control"),/no-store/);assert.equal(r.headers.get("Vary"),"Cookie");
 }
});
test("new business insert explicitly starts private",async()=>{
 let insert="";
 const db={prepare:sql=>{if(sql.startsWith("INSERT"))insert=sql;return {first:async()=>({count:0,sort_order:0}),bind:()=>({run:async()=>{}})}}};
 const api=await load("../app/api/businesses/route.ts",{ADMIN_GUIDE_BUSINESS_ID:"__admin-guide",ADMIN_GUIDE_BUSINESS_NAME:"사업 안내 챗봇 운영 가이드",requireAdminApi:async()=>null,ensureKnowledgeSchema:async()=>db,getAdminSession:async()=>null,listBusinesses:async()=>[]});
 const details={name:"새 사업",isPublic:true,noticeUrl:"https://example.org/notice",contactDepartment:"담당팀",contactEmail:"contact@example.org",contactPhone:"02-1234-5678",contactHours:"평일 10시"};
 assert.equal((await api.POST(new Request("https://test",{method:"POST",body:JSON.stringify(details)}))).status,200);
 assert.match(insert,/sort_order, is_public, notice_url/);assert.match(insert,/VALUES \(\?, \?, \?, \?, \?, 0,/);
 assert.equal((await api.POST(new Request("https://test",{method:"POST",body:JSON.stringify({name:"누락 사업"})}))).status,400);
});
test("publishing requires every business information field",async()=>{
 const business={notice_url:"",contact_department:"담당팀",contact_email:"contact@example.org",contact_phone:"02-1234-5678",contact_hours:"평일 10시"};
 const db={prepare:sql=>({bind:()=>({first:async()=>business,run:async()=>({})})})};
 const api=await load("../app/api/businesses/route.ts",{ADMIN_GUIDE_BUSINESS_ID:"__admin-guide",ADMIN_GUIDE_BUSINESS_NAME:"사업 안내 챗봇 운영 가이드",requireAdminApi:async()=>null,ensureKnowledgeSchema:async()=>db});
 const response=await api.PATCH(new Request("https://test/api/businesses",{method:"PATCH",body:JSON.stringify({id:"one",isPublic:true})}));
 assert.equal(response.status,400);assert.match((await response.json()).error,/사업안내 공고 링크/);
});
test("admin guide is absent from management and rejects direct changes",async()=>{
 let prepared=0;
 const api=await load("../app/api/businesses/route.ts",{ADMIN_GUIDE_BUSINESS_ID:"__admin-guide",ADMIN_GUIDE_BUSINESS_NAME:"사업 안내 챗봇 운영 가이드",requireAdminApi:async()=>null,getAdminSession:async()=>({is_super_admin:1}),accountBusinessIds:()=>[],listBusinesses:async()=>[],ensureKnowledgeSchema:async()=>{prepared++;return {}}});
 const management=await api.GET(new Request("https://test/api/businesses?includeHidden=1"));
 assert.deepEqual((await management.json()).businesses,[]);
 assert.equal((await api.PATCH(new Request("https://test/api/businesses",{method:"PATCH",body:JSON.stringify({id:"__admin-guide",name:"변경"})}))).status,403);
 assert.equal((await api.DELETE(new Request("https://test/api/businesses?id=__admin-guide",{method:"DELETE"}))).status,403);
 assert.equal(prepared,0);
});
test("private chat is blocked before any knowledge or AI access for non-super-admins",async()=>{
 let account=null;
 const api=await load("../app/api/chat/route.ts",{ADMIN_GUIDE_BUSINESS_ID:"__admin-guide",MAX_CHAT_TURNS:100,MAX_CHAT_CHARACTERS:50000,chatHistorySize:()=>0,parseChatHistory:()=>[],maskResidentRegistrationNumber:s=>s,getBusiness:async()=>({is_public:0}),getAdminSession:async()=>account});
 for(const viewer of [null,{is_super_admin:0,can_manage_settings:1}]){account=viewer;assert.equal((await api.POST(new Request("https://test",{method:"POST",body:JSON.stringify({businessId:"private",question:"질문"})}))).status,404);}
});
