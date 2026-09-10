import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader } from './load-source.mjs';

function harness() {
  const states = [], effects = [];
  let cursor = 0;
  const jsx = (type, props) => ({ type, props });
  const Component = sourceLoader({
    react: { useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; }, useEffect(fn) { effects.push(fn); } },
    'react/jsx-runtime': { jsx, jsxs: jsx },
  })('app/settings/account-manager.tsx').default;
  function render() { cursor = 0; return Component(); }
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return null;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) { const result = find(child, predicate); if (result) return result; }
    return null;
  }
  return { states, render, find };
}

for (const failure of ['network', 'invalid JSON']) test(`account permission save recovers from ${failure}`, async () => {
  const original = globalThis.fetch;
  const h = harness();
  h.render();
  h.states[0] = [{id:'test',username:'test',businessIds:[],isSuperAdmin:false}];
  globalThis.fetch = async () => { if (failure === 'network') throw new TypeError('offline'); return new Response('<html>unavailable</html>'); };
  try {
    const button = h.find(h.render(), n => n.type === 'button' && n.props.children === '권한 저장');
    await assert.doesNotReject(button.props.onClick());
    const tree = h.render();
    assert.equal(h.find(tree, n => n.type === 'button' && n.props.children === '권한 저장').props.disabled, false);
    assert.ok(h.find(tree, n => n.props?.className === 'settings-notice'));
  } finally { globalThis.fetch = original; }
});
