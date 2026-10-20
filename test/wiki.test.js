import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTextSpans,
  queryAtCaret,
  tagTargetsFromText,
  wikiTargetsFromText,
} from '../src/editor/wiki.js';

test('parse [[link]] #tag and block ref', () => {
  const tokens = parseTextSpans('see [[Page]] and #tag plus ((aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee))');
  assert.deepEqual(
    tokens.filter((t) => t.type !== 'text').map((t) => [t.type, t.content]),
    [
      ['link', 'Page'],
      ['tag', 'tag'],
      ['block-ref', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'],
    ],
  );
});

test('wikiTargetsFromText ignores tags', () => {
  assert.deepEqual(wikiTargetsFromText('[[A]] #b [[A]]'), ['A']);
});

test('tagTargetsFromText needs a boundary', () => {
  assert.deepEqual(tagTargetsFromText('x#no #yes'), ['yes']);
});

test('queryAtCaret detects open wiki and tag', () => {
  assert.deepEqual(queryAtCaret('hello [[Pa', 10), { kind: 'wiki', query: 'Pa', start: 6, end: 10 });
  assert.deepEqual(queryAtCaret('hi #ta', 6), { kind: 'tag', query: 'ta', start: 3, end: 6 });
  assert.equal(queryAtCaret('[[done]] ', 9), null);
});
