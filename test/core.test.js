import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSpans, richToHtml } from '../src/editor/spans.js';
import { diffRows, rowsToTree } from '../src/editor/bridge.js';
import { conflictCopyTitle, lwwOk } from '../src/sync/conflict.js';
import { fold, matchRanges, orderedBlocks, snippetAround } from '../src/search/text.js';
import { parseExportLine, parseExportText } from '../src/services/export.js';

test('search/text: Mongolian FVS/MVS folding and highlight range mapping', () => {
  // 含 U+180E (MVS) 与 U+180B (FVS1) 的传统蒙古文字符串
  const raw = 'ᠮᠣᠩᠭᠣᠯ ᠪᠢᠴᠢᠭ\u180Eᠦᠨ ᠲᠡᠮᠳᠡᠭ';
  const query = 'ᠪᠢᠴᠢᠭᠦᠨ'; // 不带 U+180E 查询也能命中带 U+180E 的原文
  assert.equal(fold('ᠪᠢᠴᠢᠭ\u180Eᠦᠨ'), fold('ᠪᠢᠴᠢᠭᠦᠨ'));
  assert.equal(fold('ᠠ\u180Bᠪ'), fold('ᠠᠪ'));

  const ranges = matchRanges(raw, query);
  assert.equal(ranges.length, 1);
  assert.equal(raw.slice(ranges[0].start, ranges[0].end), 'ᠪᠢᠴᠢᠭ\u180Eᠦᠨ');

  const snip = snippetAround(raw, query, 4);
  assert.ok(snip.includes('ᠪᠢᠴᠢᠭ\u180Eᠦᠨ'));
});

test('search/text: orderedBlocks traverses tree in DFS reading order', () => {
  const blocks = [
    { id: 'b2', parent_id: null, order_index: 2000, text: 'Root 2' },
    { id: 'c1', parent_id: 'b1', order_index: 1000, text: 'Child 1.1' },
    { id: 'b1', parent_id: null, order_index: 1000, text: 'Root 1' },
  ];
  const ordered = orderedBlocks(blocks).map((b) => b.id);
  assert.deepEqual(ordered, ['b1', 'c1', 'b2']);
});

test('editor/spans: normalizeSpans merges adjacent runs and handles overlaps', () => {
  const text = 'HelloWorld';
  const spans = [
    { start: 0, end: 5, attrs: { bold: true } },
    { start: 5, end: 10, attrs: { bold: true } },
  ];
  const norm = normalizeSpans(text, spans);
  assert.deepEqual(norm, [{ start: 0, end: 10, attrs: { bold: true } }]);

  const html = richToHtml('A&B', [{ start: 0, end: 3, attrs: { bold: true, italic: true } }]);
  assert.equal(html, '<b><i>A&amp;B</i></b>');
});

test('editor/bridge: rowsToTree and diffRows detect created/updated/deleted', () => {
  const initialRows = [
    { id: '1', parent_id: null, type: 'todo', text: 'Task 1', checked: false, data_json: null, order_index: 1000 },
    { id: '2', parent_id: '1', type: 'paragraph', text: 'Sub', checked: false, data_json: null, order_index: 1000 },
  ];
  const { tree, snapshot } = rowsToTree(initialRows);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].type, 'task'); // todo -> task
  assert.equal(tree[0].children.length, 1);

  const nextRows = [
    { id: '1', parent_id: null, type: 'todo', text: 'Task 1 edited', checked: true, data_json: null, order_index: 1000 },
    { id: '3', parent_id: null, type: 'paragraph', text: 'New', checked: false, data_json: null, order_index: 2000 },
  ];
  const diff = diffRows(nextRows, snapshot);
  assert.equal(diff.created.length, 1);
  assert.equal(diff.created[0].id, '3');
  assert.equal(diff.updated.length, 1);
  assert.equal(diff.updated[0].row.id, '1');
  assert.deepEqual(diff.deleted, ['2']);
});

test('sync/conflict: LWW clock skew guard and conflictCopyTitle', () => {
  const now = Date.parse('2026-10-19T12:00:00Z');
  // 正常情况：远端比本地新 -> 允许覆盖
  assert.equal(lwwOk('2026-10-19T11:00:00Z', '2026-10-19T11:30:00Z', now), true);
  // 正常情况：本地比远端新 -> 拒绝覆盖
  assert.equal(lwwOk('2026-10-19T11:50:00Z', '2026-10-19T11:30:00Z', now), false);
  // 本地时钟异常超前超过 5 分钟 -> 强制允许远端覆盖，防止卡死
  assert.equal(lwwOk('2026-10-19T13:00:00Z', '2026-10-19T11:30:00Z', now), true);

  const title1 = conflictCopyTitle('Note', '1234-5678-abcd', ['Note']);
  assert.equal(title1, 'Note (Conflicted copy - Device abcd)');
  const title2 = conflictCopyTitle('Note', '1234-5678-abcd', ['Note', title1]);
  assert.equal(title2, 'Note (Conflicted copy - Device abcd) (2)');
});

test('services/export: round-trip parseExportLine and parseExportText', () => {
  assert.deepEqual(parseExportLine('[x] Buy milk'), {
    type: 'todo',
    text: 'Buy milk',
    checked: true,
    data_json: null,
  });
  const parsed = parseExportText('My Title\n\n# Heading\n• Item 1');
  assert.equal(parsed.title, 'My Title');
  assert.equal(parsed.blocks.length, 2);
  assert.equal(parsed.blocks[0].type, 'heading-1');
  assert.equal(parsed.blocks[1].type, 'list-item');
});
