import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoader} from './load-source.mjs';
const {compilePolicyExcerpt}=sourceLoader()('app/policy-excerpt.ts');
const knowledge={sources:[{id:'doc',title:'원문',parts:[{id:'0',text:'**연령** 만 19세 이하\n등본상 동거',pages:[2]}]}],conflicts:[],withheldParts:0};
test('additional answers cannot paraphrase, forge, reorder or cite conflicted policy',()=>{
 assert.deepEqual(compilePolicyExcerpt({evidenceIds:['e1','e0','e0']},knowledge),{text:'**연령** 만 19세 이하\n등본상 동거',sources:['원문']});
 for(const value of [{evidenceIds:[]},{evidenceIds:['bad']},{evidenceIds:['e0'],text:'만 20세'}])assert.equal(compilePolicyExcerpt(value,knowledge),null);
 assert.equal(compilePolicyExcerpt({evidenceIds:['e0']},{...knowledge,conflicts:[{left:{sourceId:'doc',partId:'0'},right:{sourceId:'other',partId:'1'}}]}),null);
});
