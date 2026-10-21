import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const { window } = new JSDOM('<!doctype html><body></body>');
globalThis.document = window.document;

const { htmlToRich, richToHtml, normalizeSpans } = await import('../src/editor/spans.js');
const { rowsToTree, treeToRows, diffRows } = await import('../src/editor/bridge.js');

const row = (over) => ({
  id: 'b1', document_id: 'd1', parent_id: null, type: 'paragraph', text: '',
  checked: false, data_json: null, order_index: 1000, ...over,
});

test('html → text + spans, ZWSP and placeholder <br> dropped', () => {
  const { text, spans } = htmlToRich('\u200bᠠ<b>ᠪᠣ</b><i><b>ᠯ</b></i><br>');
  assert.equal(text, 'ᠠᠪᠣᠯ');
  assert.deepEqual(spans, [
    { start: 1, end: 3, attrs: { bold: true } },
    { start: 3, end: 4, attrs: { bold: true, italic: true } },
  ]);
});

test('soft line break survives as \\n', () => {
  assert.equal(htmlToRich('a<br>b').text, 'a\nb');
  assert.equal(richToHtml('a\nb', []), 'a<br>b');
});

test('spans → html → spans round-trip', () => {
  const spans = [{ start: 0, end: 2, attrs: { bold: true } }, { start: 2, end: 4, attrs: { link: 'https://x.y' } }];
  const html = richToHtml('abcd', spans);
  assert.deepEqual(htmlToRich(html).spans, spans);
});

test('normalizeSpans merges adjacent equal runs and maps href → link', () => {
  const out = normalizeSpans('abcd', [
    { start: 0, end: 1, attrs: { bold: true } },
    { start: 1, end: 2, attrs: { bold: true } },
    { start: 2, end: 3, attrs: { href: 'u' } },
  ]);
  assert.deepEqual(out, [
    { start: 0, end: 2, attrs: { bold: true } },
    { start: 2, end: 3, attrs: { link: 'u' } },
  ]);
});

test('rows → tree honours parent_id and order_index; todo → task', () => {
  const rows = [
    row({ id: 'b2', order_index: 2000, text: 'two' }),
    row({ id: 'b1', order_index: 1000, text: 'one' }),
    row({ id: 'c1', parent_id: 'b1', type: 'todo', checked: true, text: 'child', data_json: '{"data":{}}' }),
    row({ id: 'orphan', parent_id: 'missing' }),
  ];
  const { tree, snapshot } = rowsToTree(rows);
  assert.deepEqual(tree.map((n) => n.id), ['b1', 'b2']);
  assert.equal(tree[0].children[0].type, 'task');
  assert.equal(tree[0].children[0].checked, true);
  assert.equal(snapshot.has('orphan'), false);
});

test('unchanged tree produces no diff (Flutter data_json bytes kept)', () => {
  const rows = [
    row({ id: 'b1', text: 'ᠠᠪ', data_json: '{"content-spans":[{"attrs":{"bold":true},"end":1,"start":0}]}' }),
    row({ id: 'c1', parent_id: 'b1', type: 'todo', text: 't', data_json: '{"data":{}}' }),
    row({ id: 't1', order_index: 2000, type: 'table', data_json: '{"data":{"col-count":2,"row-count":2,"cells":{"0,0":"ᠠ"}}}' }),
    row({ id: 'img', order_index: 3000, type: 'image', text: '', data_json: '{"data":{"asset-id":"a1"}}' }),
  ];
  const { tree, snapshot } = rowsToTree(rows);
  assert.equal(tree[2].type, 'image');
  assert.equal(tree[2].data['asset-id'], 'a1');
  const out = treeToRows(tree, snapshot);
  const diff = diffRows(out, snapshot);
  assert.deepEqual(diff, { created: [], updated: [], deleted: [] });
});

test('image and bookmark round-trip through data_json', () => {
  const rows = [
    row({
      id: 'img',
      type: 'image',
      data_json: '{"data":{"asset-id":"a1","width":120,"height":80}}',
    }),
    row({
      id: 'bm',
      order_index: 2000,
      type: 'bookmark',
      text: 'Example',
      data_json: '{"data":{"url":"https://example.com","title":"Example","desc":"d"}}',
    }),
  ];
  const { tree, snapshot } = rowsToTree(rows);
  assert.equal(tree[0].type, 'image');
  assert.equal(tree[1].type, 'bookmark');
  tree[0].data.width = 200;
  tree[1].data.title = 'Changed';
  const out = treeToRows(tree, snapshot);
  const diff = diffRows(out, snapshot);
  assert.equal(diff.updated.length, 2);
  const img = diff.updated.find((u) => u.row.id === 'img').row;
  const bm = diff.updated.find((u) => u.row.id === 'bm').row;
  assert.match(img.data_json, /"width":200/);
  assert.equal(bm.text, 'Changed');
  assert.match(bm.data_json, /"title":"Changed"/);
});

test('edits map to create / update / move / delete', () => {
  const rows = [row({ id: 'b1', text: 'a' }), row({ id: 'b2', order_index: 2000, text: 'b' })];
  const { tree, snapshot } = rowsToTree(rows);
  tree[0].html = 'a<b>!</b>';
  tree.splice(1, 1);
  tree.unshift({ id: 'n1', type: 'heading-1', html: 'new', children: [] });
  const diff = diffRows(treeToRows(tree, snapshot), snapshot);
  assert.deepEqual(diff.created.map((r) => [r.id, r.type, r.order_index]), [['n1', 'heading-1', 500]]);
  assert.equal(diff.updated.length, 1);
  const upd = diff.updated[0].row;
  assert.equal(upd.text, 'a!');
  assert.equal(upd.order_index, 1000);
  assert.equal(upd.data_json, '{"content-spans":[{"start":1,"end":2,"attrs":{"bold":true}}]}');
  assert.deepEqual(diff.deleted, ['b2']);
});

test('task rows always carry {"data":{}} like Flutter', () => {
  const tree = [{ id: 'x', type: 'task', html: 'do', checked: true, children: [] }];
  const [r] = treeToRows(tree);
  assert.equal(r.type, 'todo');
  assert.equal(r.checked, true);
  assert.equal(r.data_json, '{"data":{}}');
});
