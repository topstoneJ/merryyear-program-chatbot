import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = fileURLToPath(new URL('../', import.meta.url));
export function sourceLoader(overrides = {}, sourceOverrides = {}) {
  const cache = new Map();
  function load(name, from = root) {
    if (Object.hasOwn(overrides, name)) return overrides[name];
    let path = name.startsWith('@/') ? resolve(root, name.slice(2)) : resolve(from, name);
    if (!existsSync(path)) path += '.ts';
    if (cache.has(path)) return cache.get(path);
    const exports = {}; cache.set(path, exports);
    const source = sourceOverrides[relative(root, path).split(sep).join('/')] ?? readFileSync(path, 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    new Function('require', 'exports', code)(id => load(id, dirname(path)), exports);
    return exports;
  }
  return name => load(name);
}

export function chatHarness(options = {}) {
  const requests = [], reviewRequests = [], records = [], answerCache = new Map();
  const fetchModel = async (_purpose, init) => {
    const request = JSON.parse(init.body);
    const input = typeof request.input === 'string' ? JSON.parse(request.input) : request.input;
    if(input?.serverMode==='policy_excerpt'){
      requests.push(request);
      return Response.json({steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(options.policyExcerpt??{evidenceIds:['e0']})}]}]});
    }
    if(input?.serverMode==='policy_coverage'){
      requests.push(request);
      return Response.json({steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(options.policyCoverage??{covered:true})}]}]});
    }
    if(input?.serverMode==='policy_selection'){
      requests.push(request);
      return Response.json({steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify({remainingQuestion:'',...(options.policySelection??{ruleId:'',coverage:'none'})})}]}]});
    }
    if (input?.serverMode === 'answer_review') {
      reviewRequests.push(request);
      if (options.reviewError) throw options.reviewError;
      if (options.reviewResponses?.length) return options.reviewResponses.shift();
      const source = input.knowledge.sources.find(item => item.id === input.candidate.draft.source);
      // Default success is a transport fixture, NOT a semantic judge. Tests for
      // bad answers must supply explicit review verdicts or use the validator.
      const review = options.reviews?.length ? options.reviews.shift() : options.review ?? {
        checks: { answersQuestion:true, groundedClaims:true, correctNumbers:true, completeConditions:true, calibratedDecision:true, appropriateReferral:true }, issues:[], calculations:[],
        evidence: input.candidate.claims.map(item=>({claimId:item.id, ids:source?.parts.flatMap(part => part.evidence.map(item => item.id))||[], verdict:source?'supported':'not_policy_claim'})),
      };
      return Response.json({steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(review)}]}]});
    }
    requests.push(request);
    if(options.apiErrors?.length) throw options.apiErrors.shift();
    if(options.apiError) throw options.apiError;
    if(options.responses?.length) return options.responses.shift();
    const outcome = draft.decision==='possible'?'all_personal_criteria_confirmed_met':draft.decision==='impossible'?'personal_disqualifier_confirmed_without_exception':draft.decision==='need_info'?'need_user_info':draft.decision==='out_of_scope'?'unrelated':draft.evidenceKind==='system'?'system_information':({partial:'partial_information',missing_policy:'policy_unconfirmed',conflict:'policy_conflict',action_required:'staff_action'}[draft.resolution]||'information');
    const wire = request.response_format?.schema.properties.outcome
      ? {categoryId:draft.categoryId,outcome,text:draft.text,source:draft.source,page:draft.page,eligibilityEvidence:draft.eligibilityEvidence.map(e=>({
        policyEvidenceId:input.knowledge.sources.find(s=>s.id===e.sourceId)?.parts.flatMap(p=>p.evidence).find(line=>line.text.includes(e.quote))?.id||'missing',
        userMessageId:input.userStatements.find(s=>s.text.includes(e.userStatement))?.id||'missing',result:e.result,
      }))} : draft;
    return Response.json({steps:[{type:'model_output',content:[{type:'text',text:options.raw ?? JSON.stringify(wire)}]}]});
  };
  const baseLoader = sourceLoader();
  const defaults = baseLoader('app/answer-settings.ts').DEFAULT_ANSWER_SETTINGS;
  const settings = { ...defaults, tone: 'friendly', ...options.settings };
  const knowledge = options.knowledge ?? { sources: [{ id: 'doc', businessId: 'test', title: '공개 안내문', type: 'text', updatedAt: 1, url: null, parts: [{id:'0',title:'안내',text:'신청은 온라인으로 합니다. 사업 담당자 문의: 02-1234-5678\n기관 대표번호: 02-9999-9999',pages:[]}]}], conflicts: [], withheldParts: 0 };
  const draft = { categoryId: 'content', questionTarget: 'general', eligibilityEvidence: [], decision: 'fact', evidenceKind: 'document', resolution: 'complete', text: '온라인으로 신청해요.', source: 'doc', page: 0, review: false, contactPhone: '', contactEvidence: '', ...options.draft };
  const load = sourceLoader({
    '@/app/admin-session': { getAdminSession: async () => options.admin || null },
    '@/app/admin-guide-context': { loadAdminGuideContext: async () => options.adminGuideContext || { account: { accessibleBusinessCount: 0 } } },
    '@/db/knowledge': {
      ensureKnowledgeSchema: async () => ({ prepare: () => ({first:async () => ({answer_settings_json: JSON.stringify(settings)})}) }),
      getBusiness: async () => ({id:'test', name:'테스트 사업', is_public:options.public ?? 1}),
      getConfiguredGeminiApiKey: async () => options.noApiKey ? undefined : 'test-only-not-a-real-key',
      loadKnowledgeContext: async () => { if (options.knowledgeError) throw options.knowledgeError; return knowledge; },
      recordConsultation: async value => records.push(value),
      consumeDailyQuestionAllowance: async () => ({ allowed: options.dailyAllowed !== false, count: options.dailyAllowed === false ? 101 : 1, limit: 100 }),
    },
    '@/db/consultation-categories': {loadCategories:async () => [{id:'content',name:'지원 내용'}]},
    '@/db/api-usage': { trackedGeminiFetch: fetchModel, trackedGeminiJson: async (purpose, init) => {
      const response = await fetchModel(purpose, init);
      return { response, payload: await response.json() };
    } },
  }, options.routeSource ? { 'app/api/chat/route.ts': options.routeSource } : {});
  const api = load('app/api/chat/route.ts');
  return {requests, reviewRequests, records, settings, knowledge, answerCache,
  async generate(question = '신청 방법은?', options = {}) {
    const timing = { measure: async (_name, work) => work(), add: () => {}, markCache: () => {} };
    return api.askGemini('test', '테스트 사업', question, knowledge, [], timing, options);
  }, async ask(body = {}) {
    const response = await api.POST(new Request('https://test/api/chat', {method:'POST',headers:options.requestHeaders,body:JSON.stringify({businessId:'test',question:'신청 방법은?',...body})}));
    return {status:response.status, payload:await response.json(), headers:response.headers};
  }};
}
