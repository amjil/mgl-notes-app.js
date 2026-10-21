import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDocumentForest } from '../src/services/notes.js';

test('buildDocumentForest nests by parent_id and sorts roots by edited time', () => {
  const docs = [
    { id: 'a', title: 'A', parent_id: null, edited_at: '2026-01-01', updated_at: '2026-01-01' },
    { id: 'b', title: 'B', parent_id: 'a', edited_at: '2026-01-03', updated_at: '2026-01-03' },
    { id: 'c', title: 'C', parent_id: 'a', edited_at: '2026-01-02', updated_at: '2026-01-02' },
    { id: 'd', title: 'D', parent_id: null, edited_at: '2026-01-04', updated_at: '2026-01-04' },
  ];
  const forest = buildDocumentForest(docs);
  assert.equal(forest.length, 2);
  assert.equal(forest[0].doc.id, 'd');
  assert.equal(forest[1].doc.id, 'a');
  assert.deepEqual(forest[1].children.map((n) => n.doc.id), ['b', 'c']);
  assert.equal(forest[1].children[0].depth, 1);
});

test('buildDocumentForest treats missing parent as root', () => {
  const docs = [
    { id: 'x', title: 'X', parent_id: 'gone', edited_at: '2026-01-01', updated_at: '2026-01-01' },
  ];
  const forest = buildDocumentForest(docs);
  assert.equal(forest.length, 1);
  assert.equal(forest[0].doc.id, 'x');
  assert.equal(forest[0].depth, 0);
});

test('buildDocumentForest breaks parent cycles without stack overflow', () => {
  const docs = [
    { id: 'a', title: 'A', parent_id: 'b', edited_at: '2026-01-01', updated_at: '2026-01-01' },
    { id: 'b', title: 'B', parent_id: 'a', edited_at: '2026-01-02', updated_at: '2026-01-02' },
  ];
  const forest = buildDocumentForest(docs);
  const ids = new Set();
  const walk = (nodes) => {
    for (const n of nodes) {
      assert.equal(ids.has(n.doc.id), false);
      ids.add(n.doc.id);
      walk(n.children);
    }
  };
  walk(forest);
  assert.equal(ids.size, 2);
});
