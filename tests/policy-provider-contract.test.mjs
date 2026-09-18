import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoader} from './load-source.mjs';
const load=sourceLoader();
const {prepareAiRequest}=load('db/ai-provider.ts');
const {policySelectionSchema,policyCoverageSchema}=load('app/policy-rules.ts');
const {answerPlanSchema}=load('app/answer-plan.ts');
test('policy and source-ID contracts travel unchanged through all three provider adapters',()=>{
 const schemas=[policySelectionSchema([{id:'one'}]),policyCoverageSchema,answerPlanSchema(['content'],{sources:[],conflicts:[],withheldParts:0},['질문'])];
 for(const schema of schemas)for(const [key,provider] of [['sk-unit-test','openai'],['sk-ant-unit-test','anthropic'],['unit-google-test','google']]){
  const request=prepareAiRequest(key,{method:'POST',body:JSON.stringify({system_instruction:'test only',input:'{}',response_format:{schema}})});
  assert.equal(request.provider,provider);
  const body=JSON.parse(request.init.body),actual=provider==='openai'?body.text.format.schema:provider==='anthropic'?body.output_config.format.schema:body.response_format.schema;
  assert.deepEqual(actual,schema);
 }
});
