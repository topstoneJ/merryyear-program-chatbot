import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './load-source.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
function harness(t) {
  const states = [], effects = [], pending = [];
  let cursor = 0, updates = 0;
  const jsx = (type, props) => ({ type, props });
  const Component = sourceLoader({
    react: {
      useState(initial) {
        const i = cursor++;
        if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
        return [states[i], value => { updates++; states[i] = typeof value === 'function' ? value(states[i]) : value; }];
      },
      useEffect(run, deps) {
        const i = cursor++, previous = effects[i];
        if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index]))) {
          pending.push(() => { previous?.cleanup?.(); effects[i] = { deps, cleanup: run() }; });
        }
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
  })('app/settings/api-management-panel.tsx').default;
  const requests = [];
  t.mock.method(globalThis, 'fetch', (url, init) => new Promise((resolve, reject) => requests.push({ url, init, resolve, reject })));
  function render() { cursor = 0; const tree = Component(); pending.splice(0).forEach(commit => commit()); return tree; }
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return null;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, predicate); if (found) return found; }
    return null;
  }
  function text(node) {
    if (node === null || node === undefined || typeof node === 'boolean') return '';
    if (typeof node !== 'object') return String(node);
    return [node.props?.children].flat(Infinity).map(text).join('');
  }
  return { requests, render, find, text, updateCount: () => updates,
    unmount() { effects.forEach(effect => effect?.cleanup?.()); },
    setDate(value) { find(render(), node => node.props?.['aria-label'] === '시작일').props.onChange({ target: { value } }); return render(); },
  };
}
const usage = model => ({ model, provider:'OpenAI', apiKeyConfigured:true, storedApiKeyConfigured:true, environmentApiKeyConfigured:false,
  rates:null, pricingUrl:null, totals:{requests:1,failed:0,inputTokens:10,outputTokens:5,thoughtTokens:0,cachedTokens:0,estimatedUsd:0,unpriced:0}, models:[],breakdown:[] });

test('date changes abort the old request and late results cannot replace the latest period', async t => {
  const h=harness(t);h.render();
  h.setDate('2024-02-01');
  assert.equal(h.requests.length,2);assert.equal(h.requests[0].init.signal.aborted,true);
  assert.equal(h.requests[1].init.signal.aborted,false);
  h.requests[1].resolve(Response.json(usage('latest-model')));await flush();
  assert.match(h.text(h.render()),/latest-model/);
  h.requests[0].resolve(Response.json(usage('stale-model')));await flush();
  const text=h.text(h.render());assert.match(text,/latest-model/);assert.doesNotMatch(text,/stale-model/);
});

test('late failures and unmounted requests do not update panel state', async t => {
  const h=harness(t);h.render();h.setDate('2024-03-01');
  h.requests[1].resolve(Response.json(usage('latest-model')));await flush();
  const updates=h.updateCount();h.requests[0].reject(new Error('stale error'));await flush();
  assert.equal(h.updateCount(),updates);assert.doesNotMatch(h.text(h.render()),/stale error/);
  h.setDate('2024-04-01');h.unmount();const afterUnmount=h.updateCount();
  assert.equal(h.requests[2].init.signal.aborted,true);
  h.requests[2].resolve(Response.json(usage('after-unmount')));await flush();
  assert.equal(h.updateCount(),afterUnmount);
});

test('refresh immediately hides the old result and a failed request can be retried', async t => {
  const h=harness(t);h.render();h.requests[0].resolve(Response.json(usage('old-model')));await flush();
  h.find(h.render(),node=>node.type==='button' && node.props.children==='새로고침').props.onClick();
  const loading=h.render();assert.match(h.text(loading),/불러오는 중/);assert.doesNotMatch(h.text(loading),/old-model/);
  h.requests[1].reject(new Error('network failure'));await flush();
  assert.match(h.text(h.render()),/network failure/);
  h.find(h.render(),node=>node.type==='button' && node.props.children==='새로고침').props.onClick();
  assert.doesNotMatch(h.text(h.render()),/network failure/);
  h.requests[2].resolve(Response.json(usage('recovered-model')));await flush();
  assert.match(h.text(h.render()),/recovered-model/);
});

test('saving a key refreshes the latest selected dates, not dates captured when saving began', async t => {
  const h=harness(t);h.render();h.requests[0].resolve(Response.json(usage('before-save')));await flush();
  h.find(h.render(),node=>node.type==='input' && node.props.type==='password').props.onChange({target:{value:'sk-test'}});
  const saving=h.find(h.render(),node=>node.type==='button' && node.props.children==='API 키 저장').props.onClick();
  assert.equal(h.requests[1].init.method,'PATCH');
  h.setDate('2024-05-01');assert.equal(h.requests.length,3);
  h.requests[1].resolve(Response.json({apiKeyConfigured:true}));await saving;await flush();h.render();
  assert.equal(h.requests[2].init.signal.aborted,true);assert.match(h.requests[3].url,/from=2024-05-01/);
  h.requests[3].resolve(Response.json(usage('new-key-model')));await flush();
  assert.match(h.text(h.render()),/new-key-model/);
});
