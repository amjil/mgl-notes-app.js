import test from 'node:test';
import assert from 'node:assert/strict';
import { mentionContext } from '../src/util/mention-context.js';

test('mentionContext highlights [[wiki]] match', () => {
  const ctx = mentionContext('see [[Notes]] today', 'Notes', 'wiki');
  assert.equal(ctx.match, '[[Notes]]');
  assert.equal(ctx.before, 'see ');
  assert.equal(ctx.after, ' today');
});

test('mentionContext highlights #tag match', () => {
  const ctx = mentionContext('topic #ideas next', 'ideas', 'tag');
  assert.equal(ctx.match, '#ideas');
  assert.match(ctx.before, /topic $/);
  assert.match(ctx.after, /^ next/);
});

test('mentionContext falls back when target missing', () => {
  const ctx = mentionContext('plain text here', 'Missing', 'wiki', 8);
  assert.equal(ctx.match, '');
  assert.ok(ctx.after.length > 0);
});
