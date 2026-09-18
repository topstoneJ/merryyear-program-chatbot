import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoader} from './load-source.mjs';
const {matchFaq,FAQ_TOPICS}=sourceLoader()('app/faq-match.ts');
test('FAQ accepts only complete approved questions; preserves extra conditions and context',()=>{
 const entries=FAQ_TOPICS.map(([id,question])=>({id,question}));
 assert.equal(matchFaq(entries,'문의 전화번호를 알려주세요!',[])?.id,'전화');
 for(const q of ['담당자가 전화로 개인 신청도 된다고 했는데요','문의 전화번호를 알려주세요. 그리고 서류도요','생활비 한도가 얼마인가요? 4인 가구예요','생활비 한도가 얼마가 아닌가요?','생활비한도가얼마인가요','문의 전화번호를 알려주세요\n아까 그 사업']) assert.equal(matchFaq(entries,q,[]),null,q);
 assert.equal(matchFaq(entries,entries[0].question,[{question:'앞선 질문'}]),null);
 assert.equal(matchFaq([entries[0],entries[0]],entries[0].question,[]),null);
});
test('FAQ verification preserves edited text and rejects missing source evidence',async()=>{
 const calls=[];
 const load=sourceLoader({'@/db/knowledge':{},'@/db/ai-provider':{configuredAiModel:()=> 'test'},'@/db/api-usage':{trackedGeminiFetch:async(_,init)=>{calls.push(JSON.parse(init.body));return Response.json({steps:[{type:'model_output',content:[{type:'text',text:'{"valid":true}'}]}]});}}});
 const {verifyFaq}=load('db/faq.ts');
 const ctx={key:'test',knowledge:{sources:[{id:'doc',parts:[{text:'지원 한도는 300만원',pages:[1]}]}],conflicts:[],withheldParts:0}};
 const item={id:'한도',question:'가구당 최대 지원금은 얼마인가요?',text:'최대 300만 원이에요.  ',source:'doc',quote:'지원 한도는 300만원',page:1,version:'v'};
 assert.equal(await verifyFaq(ctx,item),true);
 assert.equal(JSON.parse(calls[0].input).candidate.text,item.text);
 assert.equal(await verifyFaq(ctx,{...item,quote:'허위 인용'}),false);
 assert.equal(await verifyFaq({...ctx,knowledge:{...ctx.knowledge,withheldParts:1}},item),false);
});
test('FAQ edit saves exact user text; failed verification and regeneration never write',async()=>{
 const writes=[];
 const item={id:'한도',question:'가구당 최대 지원금은 얼마인가요?',text:'기존 답변',version:'v1'};
 const version='v1'; let valid=true;
 const DB={prepare:()=>({bind:(...args)=>({run:async()=>writes.push(args)})})};
 const route=sourceLoader({'@/app/admin-session':{requireAdminApi:async()=>null},'@/db/faq':{
   faqContext:async()=>({DB,version}),listFaq:async()=>[item],
   verifyFaq:async()=>valid,
   generateFaq:async()=>{throw new Error('verification failed');},
 }})('app/api/faq/route.ts');
 const request=(body)=>new Request('https://test/api/faq',{method:'POST',body:JSON.stringify({businessId:'b',id:'한도',...body})});
 const text='  수정한 문장을 그대로.\n두 번째 줄  ';
 assert.equal((await route.POST(request({action:'edit',text}))).status,200);
 assert.equal(JSON.parse(writes[0][2]).text,text);
 valid=false;
 assert.equal((await route.POST(request({action:'edit',text:'틀린 금액'}))).status,422);
 assert.equal((await route.POST(request({action:'generate'}))).status,422);
 assert.equal(writes.length,1);
});
