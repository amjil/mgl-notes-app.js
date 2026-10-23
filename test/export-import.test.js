import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAllBackupPayload,
  buildDocumentExportHtml,
  htmlToImportText,
  parseAllBackup,
  parseExportLine,
  parseExportText,
} from '../src/services/export.js';
import { rowsToTree } from '../src/editor/bridge.js';

test('parseExportLine maps markers back to block types', () => {
  assert.deepEqual(parseExportLine('# Hello'), {
    type: 'heading-1', text: 'Hello', checked: false, data_json: null,
  });
  assert.deepEqual(parseExportLine('## Sub'), {
    type: 'heading-2', text: 'Sub', checked: false, data_json: null,
  });
  assert.deepEqual(parseExportLine('### Deep'), {
    type: 'heading-3', text: 'Deep', checked: false, data_json: null,
  });
  assert.deepEqual(parseExportLine('[x] done'), {
    type: 'todo', text: 'done', checked: true, data_json: null,
  });
  assert.deepEqual(parseExportLine('[ ] open'), {
    type: 'todo', text: 'open', checked: false, data_json: null,
  });
  assert.deepEqual(parseExportLine('• item'), {
    type: 'list-item', text: 'item', checked: false, data_json: null,
  });
  assert.deepEqual(parseExportLine('1. ordered'), {
    type: 'ordered-list-item', text: 'ordered', checked: false, data_json: null,
  });
  assert.deepEqual(parseExportLine('---'), {
    type: 'divider', text: '', checked: false, data_json: null,
  });
  const bm = parseExportLine('[Docs](https://example.com)');
  assert.equal(bm.type, 'bookmark');
  assert.deepEqual(JSON.parse(bm.data_json), {
    data: { title: 'Docs', url: 'https://example.com', desc: '' },
  });
  assert.deepEqual(parseExportLine('plain'), {
    type: 'paragraph', text: 'plain', checked: false, data_json: null,
  });
});

test('parseExportText uses first line as title and blank separator', () => {
  const { title, blocks } = parseExportText('My note\n\n# Intro\nbody\n• bullet');
  assert.equal(title, 'My note');
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].type, 'heading-1');
  assert.equal(blocks[0].text, 'Intro');
  assert.equal(blocks[1].text, 'body');
  assert.equal(blocks[2].type, 'list-item');
});

test('parseExportText falls back to filename when empty', () => {
  const { title, blocks } = parseExportText('', { filename: 'from-file.txt' });
  assert.equal(title, 'from-file');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'paragraph');
});

test('HTML export keeps nested blocks and Oyun Qagan Tig font', () => {
  const { tree } = rowsToTree([
    {
      id: 'a',
      parent_id: null,
      type: 'paragraph',
      text: 'root',
      order_index: 1000,
      checked: false,
      data_json: null,
    },
    {
      id: 'b',
      parent_id: 'a',
      type: 'paragraph',
      text: 'child',
      order_index: 1000,
      checked: false,
      data_json: null,
    },
  ]);
  const html = buildDocumentExportHtml({ title: 'Note', tree });
  assert.match(html, /block-children/);
  assert.match(html, /data-block-type="paragraph"/);
  assert.match(html, />root</);
  assert.match(html, />child</);
  assert.match(html, /Oyun Qagan Tig/);
  assert.match(html, /padding-top:\s*28px/);
});

test('htmlToImportText recovers title and paragraph lines', () => {
  const html = `<!doctype html><html><head><title>T1</title></head>`
    + `<body><p>T1</p>\n<p># Head</p>\n<p>line</p></body></html>`;
  const text = htmlToImportText(html);
  const { title, blocks } = parseExportText(text);
  assert.equal(title, 'T1');
  assert.equal(blocks[0].type, 'heading-1');
  assert.equal(blocks[0].text, 'Head');
  assert.equal(blocks[1].text, 'line');
});

test('full-library JSON backup keeps tree, spans, and live rows', () => {
  const payload = buildAllBackupPayload(
    [
      { id: 'd1', title: 'Parent', parent_id: null, deleted_at: null },
      { id: 'd2', title: 'Child', parent_id: 'd1', deleted_at: null },
      { id: 'd3', title: 'Gone', parent_id: null, deleted_at: '2026-01-01T00:00:00Z' },
    ],
    [
      {
        id: 'b1',
        document_id: 'd1',
        parent_id: null,
        text: 'See [[Child]] and ((aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee))',
        data_json: JSON.stringify({ 'content-spans': [{ start: 0, end: 3, attrs: { bold: true } }] }),
        deleted_at: null,
      },
      { id: 'b2', document_id: 'd2', parent_id: 'b-missing', text: 'nested', deleted_at: null },
      { id: 'b3', document_id: 'd3', text: 'trashed doc block', deleted_at: null },
      { id: 'b4', document_id: 'd1', text: 'trashed block', deleted_at: '2026-01-02T00:00:00Z' },
    ],
    '2026-10-19T00:00:00.000Z',
  );
  assert.equal(payload.version, 1);
  assert.deepEqual(payload.documents.map((d) => d.id), ['d1', 'd2']);
  assert.deepEqual(payload.blocks.map((b) => b.id), ['b1', 'b2']);
  assert.match(payload.blocks[0].text, /\[\[Child\]\]/);
  assert.ok(payload.blocks[0].data_json.includes('content-spans'));

  const parsed = parseAllBackup(JSON.stringify(payload));
  assert.equal(parsed.documents.length, 2);
  assert.equal(parsed.blocks.length, 2);
  assert.throws(() => parseAllBackup('{"version":2,"documents":[],"blocks":[]}'), /Unsupported/);
  assert.throws(() => parseAllBackup('not-json'), /Invalid/);
});
