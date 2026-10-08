import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, buildSize, buildTriangles, cleanPartNames, propName } from '../server/prompts.js';

test('buildPrompt adds style and quality hints', () => {
  const p = buildPrompt({ prompt: 'treasure chest', style: 'cute' });
  assert.match(p, /^treasure chest, cute stylized cartoon/);
  assert.match(p, /game-ready prop/);
});

test('buildPrompt with no style keeps idea first', () => {
  assert.match(buildPrompt({ prompt: 'แมวอ้วน', style: 'none' }), /^แมวอ้วน, single game-ready/);
});

test('buildSize applies aspect and custom studs', () => {
  assert.deepEqual(buildSize({ size: 'm' }), { x: 8, y: 8, z: 8 });
  assert.deepEqual(buildSize({ size: 'm', aspect: 'tall' }), { x: 4.8, y: 8, z: 4.8 });
  assert.deepEqual(buildSize({ customStuds: 10, aspect: 'flat' }), { x: 10, y: 2.5, z: 10 });
});

test('buildTriangles clamps to StudioMCP limits', () => {
  assert.equal(buildTriangles({ detail: 'high' }), 20000);
  assert.equal(buildTriangles({ customTris: 999999 }), 20000);
  assert.equal(buildTriangles({ customTris: 3 }), 12);
});

test('cleanPartNames and propName', () => {
  assert.equal(cleanPartNames(' body,lid ,\n handle,, '), 'body, lid, handle');
  assert.equal(propName('wooden treasure chest with gold'), 'WoodenTreasureChestWith');
  assert.equal(propName('!!!'), 'SweetProp');
});

test('sanitize swaps words Roblox moderation rejects', async () => {
  const { sanitize } = await import('../server/prompts.js');
  assert.equal(sanitize('a Grumpy fat tiger'), 'a unimpressed fat tiger');
  assert.match(buildPrompt({ prompt: 'grumpy cat' }), /^unimpressed cat/);
});

test('propName keeps Thai vowel marks', () => {
  assert.equal(propName('ตุ๊กตาเสืออ้วน น่ารัก'), 'ตุ๊กตาเสืออ้วนน่ารัก');
});
