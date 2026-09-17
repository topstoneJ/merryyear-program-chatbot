import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
async function load(path, deps = {}, fetcher = globalThis.fetch) {
  const code = ts.transpileModule(await readFile(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const output={};new Function('require','exports','fetch',code)(name=>deps[name],output,fetcher);return output;
}
const pricing=await load('db/api-pricing.ts');
const provider=await load('db/ai-provider.ts');
test('fees count discounted cached input and separately reported thinking tokens',()=>{
  const at=Date.UTC(2026,8,3);
  const usage=pricing.readApiUsage({usage:{total_input_tokens:1000000,total_output_tokens:100000,total_thought_tokens:100000,total_cached_tokens:200000}},'gemini-3.8-flash',at);
  assert.ok(Math.abs(usage.estimatedUsd-1.365)<1e-10);
  assert.equal(pricing.readApiUsage({},'gemini-3.8-flash',at).estimatedUsd,null);
  assert.equal(pricing.readApiUsage({usage:{total_input_tokens:2,total_output_tokens:3}},'unknown',at).estimatedUsd,null);
  assert.equal(pricing.modelRates('gemini-3.8-flash',Date.UTC(2027,0,1)).input,1.5);
});
test('daily aggregation follows the Korean calendar boundary',()=>{
  const before=pricing.koreanDayBounds(Date.UTC(2026,7,31,14,59));
  const after=pricing.koreanDayBounds(Date.UTC(2026,7,31,15));
  assert.equal(before.label,'2026년 8월 31일');assert.equal(after.label,'2026년 9월 1일');assert.equal(before.end,after.start);
});
test('usage wrapper preserves the response, records failed attempts, and never stores request data or keys',async()=>{
  const records=[];const DB={prepare:()=>({bind:(...values)=>({run:async()=>records.push(values)})})};
  let networkFail=false;
  const wrapper=await load('db/api-usage.ts',{'./knowledge':{knowledgeEnv:()=>({DB})},'./api-pricing':pricing,'./ai-provider':provider},async()=>{
    if(networkFail)throw new Error('network');return Response.json({steps:[{text:'answer'}],usage:{total_input_tokens:10,total_output_tokens:5,total_thought_tokens:2}});
  });
  const init={method:'POST',headers:{'x-goog-api-key':'test-secret'},body:JSON.stringify({model:'gemini-3.8-flash',input:'private-question'})};
  const response=await wrapper.trackedGeminiFetch('chat',init);assert.equal((await response.json()).steps[0].text,'answer');
  assert.equal(records.length,1);assert.equal(records[0][5],10);assert.equal(records[0][7],2);
  assert.ok(!JSON.stringify(records).includes('test-secret'));assert.ok(!JSON.stringify(records).includes('private-question'));
  networkFail=true;await assert.rejects(wrapper.trackedGeminiFetch('chat',init));assert.equal(records.length,2);assert.equal(records[1][4],0);assert.equal(records[1][9],null);
});

test('chat JSON path parses once and durably records success, HTTP errors and malformed responses', async()=>{
  const records=[],timings=[];let reads=0,mode='success';
  const payload={steps:[],usage:{total_input_tokens:20,total_output_tokens:7}};
  const DB={prepare:()=>({bind:(...values)=>({run:async()=>records.push(values)})})};
  const wrapper=await load('db/api-usage.ts',{'./knowledge':{knowledgeEnv:()=>({DB})},'./api-pricing':pricing,'./ai-provider':provider},async()=>{
    if(mode==='network')throw new Error('network');
    return {status:mode==='http'?429:200,ok:mode!=='http',clone(){throw new Error('must not clone');},async json(){reads++;if(mode==='malformed')throw new SyntaxError('malformed');return payload;}};
  });
  const init={body:JSON.stringify({model:'gemini-3.8-flash',input:'private-question'}),headers:{'x-goog-api-key':'secret'}};
  const result=await wrapper.trackedGeminiJson('chat',init,(...args)=>timings.push(args));
  assert.strictEqual(result.payload,payload);assert.equal(reads,1);assert.equal(records.length,1);
  assert.equal(records[0][5],20);assert.equal(records[0][6],7);
  mode='http';assert.equal((await wrapper.trackedGeminiJson('chat',init)).response.status,429);
  mode='malformed';await assert.rejects(wrapper.trackedGeminiJson('chat',init),SyntaxError);
  mode='network';await assert.rejects(wrapper.trackedGeminiJson('chat',init));
  assert.deepEqual(records.map(r=>r[4]),[200,429,200,0]);
  assert.deepEqual(timings.map(t=>t[0]),['model','usage']);
  assert.doesNotMatch(JSON.stringify(records),/private-question|secret/);
});
test('API management rejects unauthorized requests and saves or deletes only the encrypted API key',async()=>{
  let denied=true;const writes=[];
  const DB={prepare:sql=>({bind:(...args)=>({run:async()=>{writes.push({sql,args});}})})};
  const disabled='!disabled';
  const status=(stored,fallback)=>({apiKeyConfigured:stored!==disabled&&Boolean(stored||fallback),storedApiKeyConfigured:stored!==disabled&&Boolean(stored),environmentApiKeyConfigured:Boolean(fallback)});
  const route=await load('app/api/api-management/route.ts',{'@/app/admin-session':{requireAdminApi:async()=>denied?new Response(null,{status:403}):null},'@/db/api-pricing':pricing,'@/db/ai-provider':provider,'@/db/knowledge':{ensureKnowledgeSchema:async()=>DB,encryptConfiguredGeminiApiKey:async key=>'encrypted-'+key,GEMINI_API_KEY_DISABLED:disabled,configuredGeminiApiKeyStatus:status,getConfiguredGeminiApiKey:async()=>null}});
  const request=key=>new Request('https://test/api/api-management',{method:'PATCH',body:JSON.stringify({apiKey:key})});
  assert.equal((await route.GET()).status,403);assert.equal((await route.PATCH(request('test-only'))).status,403);assert.equal((await route.DELETE()).status,403);assert.equal(writes.length,0);
  denied=false;assert.equal((await route.PATCH(request(' '))).status,400);assert.equal(writes.length,0);
  assert.equal((await route.PATCH(request('test-only'))).status,200);assert.equal(writes[0].args[0],'encrypted-test-only');assert.ok(!writes[0].sql.includes('primary_color'));
  const deleted=await route.DELETE();assert.equal(deleted.status,200);assert.match(writes[1].sql,/gemini_api_key_encrypted = \?/);assert.equal(writes[1].args[0],disabled);assert.equal((await deleted.json()).apiKeyConfigured,false);
});

test('selected dates validate calendar days and reject future dates',()=>{
  const at=Date.UTC(2026,8,3);
  for(const value of ['2026-00-01','2026-13-01','2026-09-31','2025-02-29','1999-01-01','2027-01-01','',"2026-09-01' OR 1=1"]) assert.equal(pricing.selectedDayBounds(value,at),null);
  const leap=pricing.selectedDayBounds('2024-02-29',at);
  assert.equal(leap.end-leap.start,86400000);
  assert.equal(pricing.selectedDayBounds(null,at).key,'2026-09-03');
});
test('official pricing links follow each provider without assigning unknown models a price',()=>{
  assert.equal(pricing.modelPricingInfo('gemini-3.8-flash').provider,'Google');
  assert.equal(pricing.modelPricingInfo('anthropic/claude-sonnet-5').provider,'Anthropic');
  assert.equal(pricing.modelPricingInfo('gpt-5.4').provider,'OpenAI');
  assert.equal(pricing.modelPricingInfo('o3').provider,'OpenAI');
  assert.equal(pricing.modelPricingInfo('custom').pricingUrl,null);
  assert.equal(pricing.modelRates('claude-sonnet-5'),null);
});
test('OpenAI Responses usage separates reasoning, discounts cached input, and calculates the fee',()=>{
  const usage=pricing.readApiUsage({usage:{input_tokens:1000000,input_tokens_details:{cached_tokens:200000},output_tokens:200000,output_tokens_details:{reasoning_tokens:100000}}},'gpt-5.4-mini',Date.UTC(2026,8,17));
  assert.deepEqual(usage,{input:1000000,output:100000,thought:100000,cached:200000,estimatedUsd:1.515});
});
test('OpenAI keys use the Responses API and normalize output for existing answer parsers',()=>{
  assert.equal(provider.aiProviderFromKey('sk-proj-example'),'openai');
  const request=provider.prepareAiRequest('sk-proj-example',{method:'POST',body:JSON.stringify({system_instruction:'rules',input:'question',response_format:{schema:{type:'object'}}})});
  assert.equal(request.url,'https://api.openai.com/v1/responses');
  assert.equal(request.init.headers.Authorization,'Bearer sk-proj-example');
  const body=JSON.parse(request.init.body);assert.equal(body.instructions,'rules');assert.equal(body.model,'gpt-5.4-mini');assert.equal(body.text.format.type,'json_schema');
  assert.equal(body.text.format.strict,true);assert.equal(body.text.format.schema.additionalProperties,false);
  const payload=provider.normalizeAiPayload({output:[{type:'message',content:[{type:'output_text',text:'answer'}]}],usage:{input_tokens:3,output_tokens:2}},'openai');
  assert.equal(payload.steps[0].content[0].text,'answer');assert.equal(payload.usage.input_tokens,3);
});

test('Claude uses its own authentication, messages, strict schema and text response blocks',()=>{
  assert.equal(provider.aiProviderFromKey('sk-ant-api03-example'),'anthropic');
  const schema={type:'object',properties:{sections:{type:'array',items:{type:'object',properties:{text:{type:'string'}},required:['text']}}},required:['sections']};
  const request=provider.prepareAiRequest('sk-ant-api03-example',{body:JSON.stringify({system_instruction:'shared rules',input:'raw PDF sections remain separate',response_format:{schema}})});
  const body=JSON.parse(request.init.body);
  assert.equal(request.url,'https://api.anthropic.com/v1/messages');assert.equal(request.model,'claude-sonnet-4-6');
  assert.equal(request.init.headers['x-api-key'],'sk-ant-api03-example');assert.equal(request.init.headers['anthropic-version'],'2023-06-01');
  assert.equal(request.init.headers.Authorization,undefined);assert.equal(request.init.headers['x-goog-api-key'],undefined);
  assert.equal(body.system,'shared rules');assert.equal(body.max_tokens,16384);assert.equal(body.store,undefined);
  assert.deepEqual(body.messages,[{role:'user',content:'raw PDF sections remain separate'}]);
  assert.equal(body.output_config.format.schema.properties.sections.items.additionalProperties,false);
  assert.equal(schema.additionalProperties,undefined);
  const normalized=provider.normalizeAiPayload({stop_reason:'end_turn',content:[{type:'thinking',thinking:'not an answer'},{type:'text',text:'{"sections":[]}'}],usage:{input_tokens:10,output_tokens:20}},'anthropic');
  assert.equal(normalized.steps[0].content[0].text,'{"sections":[]}');assert.equal(normalized.usage.output_tokens,20);
});

test('refusals and incomplete output from any provider never become completed answers',()=>{
  for(const [name,payload] of [
    ['anthropic',{stop_reason:'max_tokens',content:[{type:'text',text:'{"text":"partial"}'}]}],
    ['anthropic',{stop_reason:'refusal',content:[{type:'text',text:'refused'}]}],
    ['openai',{status:'incomplete',output:[{type:'message',content:[{type:'output_text',text:'{"text":"partial"}'}]}]}],
    ['openai',{status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'refused'}]}]}],
    ['google',{status:'incomplete',steps:[{type:'model_output',content:[{type:'text',text:'{"text":"partial"}'}]}]}],
  ])assert.deepEqual(provider.normalizeAiPayload(payload,name).steps,[]);
});

test('Claude usage counts separate cache reads/writes and bills 5 minute and 1 hour writes',()=>{
  const usage=pricing.readApiUsage({usage:{input_tokens:1000,output_tokens:100,cache_read_input_tokens:2000,cache_creation_input_tokens:1000,cache_creation:{ephemeral_5m_input_tokens:600,ephemeral_1h_input_tokens:400}}},'claude-sonnet-4-6',Date.UTC(2026,8,17));
  assert.equal(usage.input,4000);assert.equal(usage.cached,2000);assert.equal(usage.output,100);assert.equal(usage.thought,0);
  assert.ok(Math.abs(usage.estimatedUsd-0.00975)<1e-12);
  assert.equal(pricing.readApiUsage({},'claude-sonnet-4-6',Date.now()).estimatedUsd,null);
  assert.equal(pricing.readApiUsage({usage:{input_tokens:10,output_tokens:20}},'claude-unknown',Date.now()).estimatedUsd,null);
});

test('Claude raw usage and actual provider model reach usage storage before response normalization',async()=>{
  const records=[];const DB={prepare:()=>({bind:(...values)=>({run:async()=>records.push(values)})})};
  const wrapper=await load('db/api-usage.ts',{'./knowledge':{knowledgeEnv:()=>({DB})},'./api-pricing':pricing,'./ai-provider':provider},async(url,init)=>{
    assert.equal(url,'https://api.anthropic.com/v1/messages');assert.equal(JSON.parse(init.body).system,'rules');
    return Response.json({stop_reason:'end_turn',content:[{type:'text',text:'answer'}],usage:{input_tokens:100,output_tokens:50}});
  });
  const result=await wrapper.trackedGeminiJson('chat',{headers:{'x-goog-api-key':'sk-ant-api03-test'},body:JSON.stringify({system_instruction:'rules',input:'question'})});
  assert.equal(result.payload.steps[0].content[0].text,'answer');assert.equal(records[0][2],'claude-sonnet-4-6');
  assert.equal(records[0][5],100);assert.equal(records[0][6],50);assert.ok(Math.abs(records[0][9]-0.00105)<1e-12);
});
test('range route isolates Korean day boundaries and preserves costs across API key changes',async()=>{
  const {DatabaseSync}=await import('node:sqlite'); const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE api_usage (created_at INTEGER,model TEXT,purpose TEXT,status INTEGER,input_tokens INTEGER,output_tokens INTEGER,thought_tokens INTEGER,cached_tokens INTEGER,estimated_usd REAL);
    CREATE TABLE site_settings(id TEXT,gemini_api_key_encrypted TEXT); INSERT INTO site_settings VALUES('default','encrypted');`);
  const boundary=pricing.selectedDayBounds('2024-02-29').start;
  const insert=db.prepare('INSERT INTO api_usage VALUES(?,?,?,200,10,5,2,0,?)');
  insert.run(boundary-1,'gemini-3.8-flash','chat',9);
  insert.run(boundary,'claude-sonnet-5','chat',0.2);
  insert.run(boundary+1,'gpt-5.4','knowledge',null);
  insert.run(pricing.selectedDayBounds('2024-02-29').end,'gemini-3.8-flash','chat',7);
  const DB={prepare(sql){const stmt=db.prepare(sql);const wrap=args=>({first:async()=>stmt.get(...args)||null,all:async()=>({results:stmt.all(...args)})});return {...wrap([]),bind:(...args)=>wrap(args)};}};
  const route=await load('app/api/api-management/route.ts',{'@/app/admin-session':{requireAdminApi:async()=>null},'@/db/api-pricing':pricing,'@/db/ai-provider':provider,'@/db/knowledge':{ensureKnowledgeSchema:async()=>DB,getConfiguredGeminiApiKey:async()=> 'AIza-test',configuredGeminiApiKeyStatus:stored=>({apiKeyConfigured:Boolean(stored),storedApiKeyConfigured:Boolean(stored),environmentApiKeyConfigured:false})}});
  const get=(from,to=from)=>route.GET(new Request(`https://test/api/api-management?from=${from}&to=${to}`));
  const response=await get('2024-02-29');assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.dateKey,'2024-02-29~2024-02-29');assert.equal(result.totals.requests,2);assert.equal(result.totals.estimatedUsd,0.2);assert.equal(result.totals.unpriced,1);
  assert.deepEqual(result.models.map(m=>m.provider).sort(),['Anthropic','OpenAI']);
  const empty=await (await get('2023-12-01')).json();assert.equal(empty.totals.requests,0);assert.deepEqual(empty.models,[]);
  assert.equal((await get('invalid')).status,400);
  assert.equal((await get('2023-01-01','2024-01-02')).status,400);db.close();
});
