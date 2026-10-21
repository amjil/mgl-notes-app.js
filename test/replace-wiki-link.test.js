import test from 'node:test';
import assert from 'node:assert/strict';

import { replaceWikiLinkInBlock } from '../src/services/notes.js';

test('replaceWikiLinkInBlock: renames [[wiki]] and shifts content-spans by delta', () => {
  const text = '参见 [[旧题]] 了解 重点';
  const data_json = JSON.stringify({
    'content-spans': [{ start: 13, end: 15, attrs: { bold: true } }],
  });

  const result = replaceWikiLinkInBlock({ text, data_json }, '旧题', '新的长标题');
  assert.ok(result);
  assert.equal(result.text, '参见 [[新的长标题]] 了解 重点');

  const extra = JSON.parse(result.data_json);
  assert.deepEqual(extra['content-spans'], [
    { start: 16, end: 18, attrs: { bold: true } },
  ]);
});

test('replaceWikiLinkInBlock: no match returns null', () => {
  const result = replaceWikiLinkInBlock({ text: '无链接段落', data_json: null }, '旧题', '新题');
  assert.equal(result, null);
});
