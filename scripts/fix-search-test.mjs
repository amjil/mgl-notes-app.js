import { writeFileSync } from 'fs';

const src = `import test from 'node:test';
import assert from 'node:assert/strict';
import { Document } from 'flexsearch';
import { encoder, matchRanges, snippetAround, snippetFor, terms } from '../src/search/text.js';

const NNBSP = '\\u202F';
const MVS = '\\u180E';

test('terms split traditional Mongolian on NNBSP', () => {
  assert.deepEqual(terms(\`\\u182C\\u1826\\u182E\\u1826\\u1828\${NNBSP}\\u182A\\u1820\\u1836\\u1822\\u1828\\u1820\`), ['\\u182C\\u1826\\u182E\\u1826\\u1828', '\\u182A\\u1820\\u1836\\u1822\\u1828\\u1820']);
});

test('terms ignore the Mongolian vowel separator', () => {
  assert.deepEqual(terms(\`\\u182A\\u1820\\u1836\\u1822\\u1828\${MVS}\\u1820\`), terms('\\u182A\\u1820\\u1836\\u1822\\u1828\\u1820'));
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
    title: '\\u1832\\u1821\\u182E\\u1833\\u1821\\u182D',
    text: \`\\u182C\\u1826\\u182E\\u1826\\u1828\${NNBSP}\\u182A\\u1820\\u1836\\u1822\\u1828\${MVS}\\u1820\`,
  });
  assert.equal(index.search('\\u182C\\u1826')[0].result[0], '1');
  assert.equal(index.search('\\u182A\\u1820\\u1836\\u1822\\u1828\\u1820')[0].result[0], '1');
  assert.equal(index.search('\\u1832\\u1821\\u182E')[0].field, 'title');
});

test('snippetAround keeps original marks and clips the window', () => {
  const text = \`\\u1821\\u1828\\u1821\${NNBSP}\\u182A\\u1820\\u1836\\u1822\\u1828\${MVS}\\u1820\${NNBSP}\\u182D\\u1821\\u1835\\u1826 \\u182C\\u1821\\u182F\\u1821\\u182A\\u1821\`;
  const snippet = snippetAround(text, '\\u182A\\u1820\\u1836\\u1822\\u1828\\u1820', 2);
  assert.match(snippet, /\\u182A\\u1820\\u1836\\u1822\\u1828/);
  assert.match(snippet, new RegExp(MVS));
  assert.match(snippet, /^…/);
  assert.match(snippet, /…$/);
});

test('snippetFor uses the first matching block in reading order', () => {
  const blocks = [
    { id: 'a', parent_id: null, order_index: 1000, text: '\\u1821\\u1828\\u1821 \\u1828\\u1822\\u182D\\u1821' },
    { id: 'b', parent_id: null, order_index: 2000, text: '\\u182C\\u1823\\u1836\\u1820\\u1833\\u1824\\u182D\\u1820\\u1837 \\u182C\\u1826\\u182E\\u1826\\u1828' },
    { id: 'c', parent_id: 'b', order_index: 1000, text: '\\u182C\\u1826\\u182E\\u1826\\u1828 \\u1833\\u1823\\u1832\\u1823\\u1837\\u180E\\u1820' },
  ];
  const snippet = snippetFor(blocks, '\\u182C\\u1826\\u182E\\u1826\\u1828');
  assert.match(snippet, /\\u182C\\u1823\\u1836\\u1820\\u1833\\u1824\\u182D\\u1820\\u1837/);
  assert.equal(snippetFor(blocks, '\\u182A\\u1820\\u1836\\u1822\\u182C\\u1824'), '');
});

test('matchRanges finds folded Latin and Mongolian hits', () => {
  assert.deepEqual(matchRanges('Hello World', 'world'), [{ start: 6, end: 11 }]);
  const text = \`\\u182A\\u1820\\u1836\\u1822\\u1828\${MVS}\\u1820\`;
  const ranges = matchRanges(text, '\\u182A\\u1820\\u1836\\u1822\\u1828\\u1820');
  assert.equal(ranges.length, 1);
  assert.equal(text.slice(ranges[0].start, ranges[0].end), text);
});
`;

// The above accidentally double-escaped. Build with real characters via fromCodePoint.
const u = (...cps) => String.fromCodePoint(...cps);
const kumun = u(0x182C, 0x1826, 0x182E, 0x1826, 0x1828);
const bayina = u(0x182A, 0x1820, 0x1836, 0x1822, 0x1828, 0x1820);
const temdeg = u(0x1832, 0x1821, 0x182E, 0x1833, 0x1821, 0x182D);
const ene = u(0x1821, 0x1828, 0x1821);
const nige = u(0x1828, 0x1822, 0x182D, 0x1821);
const hoyadugar = u(0x182C, 0x1823, 0x1836, 0x1820, 0x1833, 0x1824, 0x182D, 0x1820, 0x1837);
const dotora = u(0x1833, 0x1823, 0x1832, 0x1823, 0x1837, 0x180E, 0x1820);
const geju = u(0x182D, 0x1821, 0x1835, 0x1826);
const kelebe = u(0x182C, 0x1821, 0x182F, 0x1821, 0x182A, 0x1821);
const bayihu = u(0x182A, 0x1820, 0x1836, 0x1822, 0x182C, 0x1824);

const out = `import test from 'node:test';
import assert from 'node:assert/strict';
import { Document } from 'flexsearch';
import { encoder, matchRanges, snippetAround, snippetFor, terms } from '../src/search/text.js';

const NNBSP = '\\u202F';
const MVS = '\\u180E';

test('terms split traditional Mongolian on NNBSP', () => {
  assert.deepEqual(terms(\`${kumun}\${NNBSP}${bayina}\`), ['${kumun}', '${bayina}']);
});

test('terms ignore the Mongolian vowel separator', () => {
  assert.deepEqual(terms(\`${u(0x182A, 0x1820, 0x1836, 0x1822, 0x1828)}\${MVS}${u(0x1820)}\`), terms('${bayina}'));
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
    title: '${temdeg}',
    text: \`${kumun}\${NNBSP}${u(0x182A, 0x1820, 0x1836, 0x1822, 0x1828)}\${MVS}${u(0x1820)}\`,
  });
  assert.equal(index.search('${u(0x182C, 0x1826)}')[0].result[0], '1');
  assert.equal(index.search('${bayina}')[0].result[0], '1');
  assert.equal(index.search('${u(0x1832, 0x1821, 0x182E)}')[0].field, 'title');
});

test('snippetAround keeps original marks and clips the window', () => {
  const text = \`${ene}\${NNBSP}${u(0x182A, 0x1820, 0x1836, 0x1822, 0x1828)}\${MVS}${u(0x1820)}\${NNBSP}${geju} ${kelebe}\`;
  const snippet = snippetAround(text, '${bayina}', 2);
  assert.match(snippet, /${u(0x182A, 0x1820, 0x1836, 0x1822, 0x1828)}/);
  assert.match(snippet, new RegExp(MVS));
  assert.match(snippet, /^…/);
  assert.match(snippet, /…$/);
});

test('snippetFor uses the first matching block in reading order', () => {
  const blocks = [
    { id: 'a', parent_id: null, order_index: 1000, text: '${ene} ${nige}' },
    { id: 'b', parent_id: null, order_index: 2000, text: '${hoyadugar} ${kumun}' },
    { id: 'c', parent_id: 'b', order_index: 1000, text: '${kumun} ${dotora}' },
  ];
  const snippet = snippetFor(blocks, '${kumun}');
  assert.match(snippet, /${hoyadugar}/);
  assert.equal(snippetFor(blocks, '${bayihu}'), '');
});

test('matchRanges finds folded Latin and Mongolian hits', () => {
  assert.deepEqual(matchRanges('Hello World', 'world'), [{ start: 6, end: 11 }]);
  const text = \`${u(0x182A, 0x1820, 0x1836, 0x1822, 0x1828)}\${MVS}${u(0x1820)}\`;
  const ranges = matchRanges(text, '${bayina}');
  assert.equal(ranges.length, 1);
  assert.equal(text.slice(ranges[0].start, ranges[0].end), text);
});
`;

writeFileSync(new URL('../test/search.test.js', import.meta.url), out, 'utf8');
console.log('fixed search.test.js');
