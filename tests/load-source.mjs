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
  const requests = [], records = [];
  const fetchModel = async (_purpose, init) => {
    requests.push(JSON.parse(init.body));
    if(options.apiErrors?.length) throw options.apiErrors.shift();
    if(options.apiError) throw options.apiError;
    if(options.responses?.length) return options.responses.shift();
    return Response.json({steps:[{type:'model_output',content:[{type:'text',text:options.raw ?? JSON.stringify(draft)}]}]});
  };
  const baseLoader = sourceLoader();
  const defaults = baseLoader('app/answer-settings.ts').DEFAULT_ANSWER_SETTINGS;
  const settings = { ...defaults, tone: 'friendly', ...options.settings };
  const knowledge = options.knowledge ?? { sources: [{ id: 'doc', businessId: 'test', title: '공개 안내문', type: 'text', updatedAt: 1, url: null, parts: [{id:'0',title:'안내',text:'신청은 온라인으로 합니다. 사업 담당자 문의: 02-1234-5678\n기관 대표번호: 02-9999-9999',pages:[]}]}], conflicts: [], withheldParts: 0 };
  const draft = { categoryId: 'content', decision: 'fact', evidenceKind: 'document', resolution: 'complete', text: '온라인으로 신청해요.', source: 'doc', page: 0, review: false, contactPhone: '', contactEvidence: '', ...options.draft };
  const load = sourceLoader({
    '@/app/admin-session': { getAdminSession: async () => options.admin || null },
    '@/app/admin-guide-context': { loadAdminGuideContext: async () => options.adminGuideContext || { account: { accessibleBusinessCount: 0 } } },
    '@/db/knowledge': {
      ensureKnowledgeSchema: async () => ({ prepare: () => ({first:async () => ({answer_settings_json: JSON.stringify(settings)})}) }),
      getBusiness: async () => ({id:'test', name:'테스트 사업', is_public:options.public ?? 1}),
      getConfiguredGeminiApiKey: async () => options.noApiKey ? undefined : 'test-only-not-a-real-key',
      loadKnowledgeContext: async () => { if (options.knowledgeError) throw options.knowledgeError; return knowledge; },
      recordConsultation: async value => records.push(value),
    },
    '@/db/consultation-categories': {loadCategories:async () => [{id:'content',name:'지원 내용'}]},
    '@/db/api-usage': { trackedGeminiFetch: fetchModel, trackedGeminiJson: async (purpose, init) => {
      const response = await fetchModel(purpose, init);
      return { response, payload: await response.json() };
    } },
  }, options.routeSource ? { 'app/api/chat/route.ts': options.routeSource } : {});
  const api = load('app/api/chat/route.ts');
  return {requests, records, settings, knowledge, async ask(body = {}) {
    const response = await api.POST(new Request('https://test/api/chat', {method:'POST',body:JSON.stringify({businessId:'test',question:'신청 방법은?',...body})}));
    return {status:response.status, payload:await response.json(), headers:response.headers};
  }};
}
