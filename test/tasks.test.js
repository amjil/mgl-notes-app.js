import test from 'node:test';
import assert from 'node:assert/strict';
import { collectOpenTasks } from '../src/services/notes.js';

const docs = [
  { id: 'd1', title: 'Inbox', type: 'normal', deleted_at: null },
  { id: 'd2', title: '2026-10-19', type: 'daily', deleted_at: null },
  { id: 'd3', title: 'Gone', type: 'normal', deleted_at: '2026-10-01T00:00:00Z' },
];

test('collectOpenTasks keeps unchecked todos in live documents, newest first', () => {
  const tasks = collectOpenTasks([
    { id: 'b-old', document_id: 'd1', type: 'todo', text: 'old', checked: false, deleted_at: null, updated_at: '2026-10-01T00:00:00Z' },
    { id: 'b-new', document_id: 'd2', type: 'todo', text: 'new', checked: false, deleted_at: null, updated_at: '2026-10-19T12:00:00Z' },
    { id: 'b-done', document_id: 'd1', type: 'todo', text: 'done', checked: true, deleted_at: null, updated_at: '2026-10-19T13:00:00Z' },
    { id: 'b-para', document_id: 'd1', type: 'paragraph', text: 'not a task', checked: false, deleted_at: null, updated_at: '2026-10-19T14:00:00Z' },
    { id: 'b-del', document_id: 'd1', type: 'todo', text: 'deleted', checked: false, deleted_at: '2026-10-02T00:00:00Z', updated_at: '2026-10-19T15:00:00Z' },
    { id: 'b-trash-doc', document_id: 'd3', type: 'todo', text: 'in trash', checked: false, deleted_at: null, updated_at: '2026-10-19T16:00:00Z' },
  ], docs);
  assert.deepEqual(tasks.map((t) => t.id), ['b-new', 'b-old']);
  assert.equal(tasks[0].documentTitle, '2026-10-19');
  assert.equal(tasks[0].documentType, 'daily');
  assert.equal(tasks[1].documentTitle, 'Inbox');
});

test('collectOpenTasks treats empty text as empty string', () => {
  const tasks = collectOpenTasks([
    { id: 'b1', document_id: 'd1', type: 'todo', text: '', checked: false, deleted_at: null, updated_at: '2026-10-19T00:00:00Z' },
  ], docs);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].text, '');
});
