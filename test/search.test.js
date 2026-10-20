import test from 'node:test';
import assert from 'node:assert/strict';
import { Document } from 'flexsearch';
import { encoder, matchRanges, snippetAround, snippetFor, terms } from '../src/search/text.js';

const NNBSP = '\u202F';
const MVS = '\u180E';

test('terms split traditional Mongolian on NNBSP', () => {
  assert.deepEqual(terms(`ᠬᠦᠮᠦᠨ${NNBSP}ᠪᠠᠶᠢᠨᠠ`), ['ᠬᠦᠮᠦᠨ', 'ᠪᠠᠶᠢᠨᠠ']);
});

test('terms ignore the Mongolian vowel separator', () => {
  assert.deepEqual(terms(`ᠪᠠᠶᠢᠨ${MVS}ᠠ`), terms('ᠪᠠᠶᠢᠨᠠ'));
});

test('terms lowercase Latin and drop punctuation', () => {
  assert.deepEqual(terms('Hello, World!'), ['hello', 'world']);
});

test('forward tokenizer matches a Mongolian prefix', () => {
  const index = new Document({
    tokenize: 'forward',
    encoder,
    document: { id: 'id', index: ['title', 'text'] },
  });
  index.add({
    id: '1',
    title: 'ᠲᠡᠮᠳᠡᠭ',
    text: `ᠬᠦᠮᠦᠨ${NNBSP}ᠪᠠᠶᠢᠨ${MVS}ᠠ`,
  });
  assert.equal(index.search('ᠬᠦ')[0].result[0], '1');
  assert.equal(index.search('ᠪᠠᠶᠢᠨᠠ')[0].result[0], '1');
  assert.equal(index.search('ᠲᠡᠮ')[0].field, 'title');
});

test('snippetAround keeps original marks and clips the window', () => {
  const text = `ᠡᠨᠡ${NNBSP}ᠪᠠᠶᠢᠨ${MVS}ᠠ${NNBSP}ᠭᠡᠵᠦ ᠬᠡᠯᠡᠪᠡ`;
  const snippet = snippetAround(text, 'ᠪᠠᠶᠢᠨᠠ', 2);
  assert.match(snippet, /ᠪᠠᠶᠢᠨ/);
  assert.match(snippet, new RegExp(MVS));
  assert.match(snippet, /^…/);
  assert.match(snippet, /…$/);
});

test('snippetFor uses the first matching block in reading order', () => {
  const blocks = [
    { id: 'a', parent_id: null, order_index: 1000, text: 'ᠡᠨᠡ ᠨᠢᠭᠡ' },
    { id: 'b', parent_id: null, order_index: 2000, text: 'ᠬᠣᠶᠠᠳᠤᠭᠠᠷ ᠬᠦᠮᠦᠨ' },
    { id: 'c', parent_id: 'b', order_index: 1000, text: 'ᠬᠦᠮᠦᠨ ᠳᠣᠲᠣᠷ᠎ᠠ' },
  ];
  const snippet = snippetFor(blocks, 'ᠬᠦᠮᠦᠨ');
  assert.match(snippet, /ᠬᠣᠶᠠᠳᠤᠭᠠᠷ/);
  assert.equal(snippetFor(blocks, 'ᠪᠠᠶᠢᠬᠤ'), '');
});

test('matchRanges finds folded Latin and Mongolian hits', () => {
  assert.deepEqual(matchRanges('Hello World', 'world'), [{ start: 6, end: 11 }]);
  const text = `ᠪᠠᠶᠢᠨ${MVS}ᠠ`;
  const ranges = matchRanges(text, 'ᠪᠠᠶᠢᠨᠠ');
  assert.equal(ranges.length, 1);
  assert.equal(text.slice(ranges[0].start, ranges[0].end), text);
});
