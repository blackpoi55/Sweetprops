import test from 'node:test';
import assert from 'node:assert/strict';
import { op, chunk, extractResult, OPS } from '../server/luau.js';

test('every op builds a chunk with ARGS and pcall', () => {
  for (const name of Object.keys(OPS)) {
    const c = op(name, { target: { id: 'abc' } });
    assert.match(c, /local ARGS = HttpService:JSONDecode\(\[=+\[/);
    assert.match(c, /pcall\(function\(\)/);
  }
});

test('long bracket never collides with payload', () => {
  const c = chunk('return 1', { s: 'a]==]b]===]c' });
  assert.match(c, /\[====\[/);
});

test('extractResult handles plain, wrapped and noisy output', () => {
  assert.deepEqual(extractResult('{"ok":true,"data":[1,2]}'), [1, 2]);
  assert.equal(extractResult(JSON.stringify({ result: '{"ok":true,"data":5}' })), 5);
  assert.equal(extractResult('Output:\n{"ok":true,"data":"x"}\n'), 'x');
  assert.throws(() => extractResult('{"ok":false,"error":"boom"}'), /boom/);
  assert.throws(() => extractResult('nothing here'), /อ่านผล/);
});

test('unknown op throws', () => {
  assert.throws(() => op('nope'), /unknown op/);
});
