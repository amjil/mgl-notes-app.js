/**
 * Theme-aware, resizable Table plugin for the vertical-lr block editor.
 * Replaces block-editor's built-in white fixed-size table plugin.
 * Persists `col-widths` and `row-heights` arrays in `data_json.data`.
 */

const DEFAULT_COL_W = 68;
const DEFAULT_ROW_H = 160;
const MIN_COL_W = 44;
const MAX_COL_W = 480;
const MIN_ROW_H = 72;
const MAX_ROW_H = 720;

const CSS = `
.mgl-editor-scope .mgl-table {
  writing-mode: horizontal-tb;
  -webkit-writing-mode: horizontal-tb;
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  margin: 0 12px 0 0;
  max-height: 100%;
}
.mgl-editor-scope .mgl-table-bar {
  display: flex;
  gap: 4px;
  writing-mode: horizontal-tb;
  user-select: none;
}
.mgl-editor-scope .mgl-table-bar button {
  font: 600 12px/1.2 var(--app-font-ui, sans-serif);
  padding: 4px 9px;
  border: 1px solid var(--app-line-strong, rgba(120, 95, 50, 0.28));
  border-radius: 6px;
  background: color-mix(in srgb, var(--app-bg-2, #ede6d6) 90%, transparent);
  color: var(--app-text, #1c221e);
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease;
}
.mgl-editor-scope .mgl-table-bar button:hover {
  background: var(--app-accent-soft, rgba(47, 125, 95, 0.13));
  border-color: var(--app-accent, #2f7d5f);
  color: var(--app-accent, #2f7d5f);
}
.note-editor.is-readonly .mgl-editor-scope .mgl-table-bar {
  display: none !important;
}
.mgl-editor-scope .mgl-table-grid {
  display: grid;
  border-top: 1px solid var(--app-line-strong, rgba(120, 95, 50, 0.32));
  border-left: 1px solid var(--app-line-strong, rgba(120, 95, 50, 0.32));
  border-radius: 6px;
  background: color-mix(in srgb, var(--app-bg-2, #ede6d6) 65%, var(--app-bg, #f4efe4));
  box-shadow: 0 2px 8px rgba(20, 24, 22, 0.04);
}
.mgl-editor-scope .mgl-cell-wrap {
  position: relative;
  display: flex;
  box-sizing: border-box;
  border-right: 1px solid var(--app-line-strong, rgba(120, 95, 50, 0.32));
  border-bottom: 1px solid var(--app-line-strong, rgba(120, 95, 50, 0.32));
  min-width: ${MIN_COL_W}px;
  min-height: ${MIN_ROW_H}px;
}
.mgl-editor-scope .mgl-cell-wrap.is-header {
  background: color-mix(in srgb, var(--app-accent-soft, rgba(47, 125, 95, 0.14)) 75%, transparent);
}
.mgl-editor-scope .mgl-cell {
  writing-mode: vertical-lr;
  -webkit-writing-mode: vertical-lr;
  text-orientation: mixed;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  padding: 8px 6px;
  border: 0 !important;
  background: transparent !important;
  color: var(--app-text, #1c221e);
  font-family: var(--app-font-mongol, serif);
  font-size: calc(18px * var(--app-font-scale, 1));
  line-height: 1.65;
  overflow: auto;
  outline: none;
}
.mgl-editor-scope .mgl-cell-wrap.is-header > .mgl-cell {
  font-weight: 600;
}
.mgl-editor-scope .mgl-cell:focus {
  background: color-mix(in srgb, var(--app-gold-soft, rgba(138, 106, 44, 0.16)) 65%, transparent) !important;
}

/* 列宽 / 行高拖拽手柄 */
.mgl-editor-scope .mgl-table-col-resizer {
  position: absolute;
  top: 0;
  right: -3px;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  z-index: 4;
  user-select: none;
  touch-action: none;
}
.mgl-editor-scope .mgl-table-row-resizer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -3px;
  height: 6px;
  cursor: row-resize;
  z-index: 4;
  user-select: none;
  touch-action: none;
}
.mgl-editor-scope .mgl-table-col-resizer:hover,
.mgl-editor-scope .mgl-table-col-resizer.is-dragging,
.mgl-editor-scope .mgl-table-row-resizer:hover,
.mgl-editor-scope .mgl-table-row-resizer.is-dragging {
  background: var(--app-accent, #2f7d5f);
  opacity: 0.65;
}
.note-editor.is-readonly .mgl-editor-scope .mgl-table-col-resizer,
.note-editor.is-readonly .mgl-editor-scope .mgl-table-row-resizer {
  display: none !important;
}
`;

function cellKey(c, r) {
  return `${c},${r}`;
}

function clamp(n, min, max, fallback) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.min(max, Math.max(min, v));
}

function normalizeSizes(arr, count, min, max, def) {
  const src = Array.isArray(arr) ? arr : [];
  return Array.from({ length: count }, (_, i) => clamp(src[i], min, max, def));
}

function parseTableData(raw) {
  const d = raw || {};
  const cols = Math.max(1, Number(d['col-count'] ?? d.colCount ?? 2) || 2);
  const rows = Math.max(1, Number(d['row-count'] ?? d.rowCount ?? 2) || 2);
  const rawCells = d.cells || {};
  const cells = {};
  Object.keys(rawCells).forEach((k) => {
    cells[String(k)] = rawCells[k] == null ? '' : String(rawCells[k]);
  });
  const colWidths = normalizeSizes(
    d['col-widths'] ?? d.colWidths,
    cols,
    MIN_COL_W,
    MAX_COL_W,
    DEFAULT_COL_W,
  );
  const rowHeights = normalizeSizes(
    d['row-heights'] ?? d.rowHeights,
    rows,
    MIN_ROW_H,
    MAX_ROW_H,
    DEFAULT_ROW_H,
  );
  return { cols, rows, cells, colWidths, rowHeights };
}

function parseSizeList(str, count, min, max, def) {
  const parts = String(str || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return normalizeSizes(parts, count, min, max, def);
}

function applyGridSizes(grid, colWidths, rowHeights) {
  grid.dataset.cols = String(colWidths.length);
  grid.dataset.rows = String(rowHeights.length);
  grid.dataset.colWidths = colWidths.join(',');
  grid.dataset.rowHeights = rowHeights.join(',');
  grid.style.gridTemplateColumns = colWidths.map((w) => `${w}px`).join(' ');
  grid.style.gridTemplateRows = rowHeights.map((h) => `${h}px`).join(' ');
}

function readTableDom(tableEl) {
  const grid = tableEl.querySelector('.mgl-table-grid');
  const cols = Math.max(1, Number(grid?.dataset.cols) || 2);
  const rows = Math.max(1, Number(grid?.dataset.rows) || 2);
  const colWidths = parseSizeList(grid?.dataset.colWidths, cols, MIN_COL_W, MAX_COL_W, DEFAULT_COL_W);
  const rowHeights = parseSizeList(grid?.dataset.rowHeights, rows, MIN_ROW_H, MAX_ROW_H, DEFAULT_ROW_H);
  const cells = {};
  grid?.querySelectorAll('.mgl-cell').forEach((cell) => {
    const val = cell.textContent.replace(/\u200b/g, '').trim();
    if (val) cells[cell.dataset.key] = val;
  });
  return { cols, rows, cells, colWidths, rowHeights };
}

function pruneCells(cells, axis, limit) {
  const out = {};
  Object.keys(cells).forEach((k) => {
    const [c, r] = k.split(',').map(Number);
    if ((axis === 'c' && c >= limit) || (axis === 'r' && r >= limit)) return;
    out[k] = cells[k];
  });
  return out;
}

function bindResizer(handle, axis, index, grid, notify) {
  const stop = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  handle.addEventListener('mousedown', stop);
  handle.addEventListener('touchstart', stop, { passive: false });

  handle.addEventListener('dblclick', (e) => {
    stop(e);
    if (grid.closest('.note-editor.is-readonly')) return;
    const cols = Number(grid.dataset.cols) || 2;
    const rows = Number(grid.dataset.rows) || 2;
    const colWidths = parseSizeList(grid.dataset.colWidths, cols, MIN_COL_W, MAX_COL_W, DEFAULT_COL_W);
    const rowHeights = parseSizeList(grid.dataset.rowHeights, rows, MIN_ROW_H, MAX_ROW_H, DEFAULT_ROW_H);
    if (axis === 'col') colWidths[index] = DEFAULT_COL_W;
    else rowHeights[index] = DEFAULT_ROW_H;
    applyGridSizes(grid, colWidths, rowHeights);
    if (typeof notify === 'function') notify();
    grid.dispatchEvent(new Event('input', { bubbles: true }));
  });

  handle.addEventListener('pointerdown', (e) => {
    stop(e);
    if (grid.closest('.note-editor.is-readonly')) return;
    const cols = Number(grid.dataset.cols) || 2;
    const rows = Number(grid.dataset.rows) || 2;
    const colWidths = parseSizeList(grid.dataset.colWidths, cols, MIN_COL_W, MAX_COL_W, DEFAULT_COL_W);
    const rowHeights = parseSizeList(grid.dataset.rowHeights, rows, MIN_ROW_H, MAX_ROW_H, DEFAULT_ROW_H);

    const startPos = axis === 'col' ? e.clientX : e.clientY;
    const startSize = axis === 'col' ? colWidths[index] : rowHeights[index];
    let changed = false;

    handle.classList.add('is-dragging');
    try { handle.setPointerCapture(e.pointerId); } catch { /* ignore */ }

    const onMove = (ev) => {
      const curPos = axis === 'col' ? ev.clientX : ev.clientY;
      const delta = curPos - startPos;
      if (Math.abs(delta) > 1) changed = true;
      if (axis === 'col') {
        colWidths[index] = clamp(startSize + delta, MIN_COL_W, MAX_COL_W, DEFAULT_COL_W);
      } else {
        rowHeights[index] = clamp(startSize + delta, MIN_ROW_H, MAX_ROW_H, DEFAULT_ROW_H);
      }
      applyGridSizes(grid, colWidths, rowHeights);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      handle.classList.remove('is-dragging');
      if (changed) {
        if (typeof notify === 'function') notify();
        grid.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };

    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
  });
}

function renderGrid(grid, { cols, rows, cells, colWidths, rowHeights }, notify) {
  const cw = normalizeSizes(colWidths, cols, MIN_COL_W, MAX_COL_W, DEFAULT_COL_W);
  const rh = normalizeSizes(rowHeights, rows, MIN_ROW_H, MAX_ROW_H, DEFAULT_ROW_H);
  applyGridSizes(grid, cw, rh);
  grid.replaceChildren();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wrap = document.createElement('div');
      wrap.className = `mgl-cell-wrap${c === 0 ? ' is-header' : ''}`;

      const cell = document.createElement('div');
      cell.className = `mgl-cell${c === 0 ? ' mgl-cell-header' : ''}`;
      cell.setAttribute('contenteditable', 'true');
      cell.spellcheck = false;
      cell.dataset.key = cellKey(c, r);
      cell.textContent = cells[cellKey(c, r)] || '';

      const colHandle = document.createElement('span');
      colHandle.className = 'mgl-table-col-resizer';
      colHandle.contentEditable = 'false';
      bindResizer(colHandle, 'col', c, grid, notify);

      const rowHandle = document.createElement('span');
      rowHandle.className = 'mgl-table-row-resizer';
      rowHandle.contentEditable = 'false';
      bindResizer(rowHandle, 'row', r, grid, notify);

      wrap.append(cell, colHandle, rowHandle);
      grid.appendChild(wrap);
    }
  }
}

export function createTablePlugin() {
  return {
    type: 'table',
    label: '⊞',
    title: 'Table',
    atomic: true,
    css: CSS,
    defaultData() {
      return {
        'col-count': 2,
        'row-count': 2,
        'col-widths': [DEFAULT_COL_W, DEFAULT_COL_W],
        'row-heights': [DEFAULT_ROW_H, DEFAULT_ROW_H],
        cells: {},
      };
    },
    build({ data, notify }) {
      const root = document.createElement('div');
      root.className = 'mgl-table';

      const bar = document.createElement('div');
      bar.className = 'mgl-table-bar';
      bar.contentEditable = 'false';
      bar.innerHTML = [
        '<button type="button" data-table="add-col">+ Col</button>',
        '<button type="button" data-table="del-col">− Col</button>',
        '<button type="button" data-table="add-row">+ Row</button>',
        '<button type="button" data-table="del-row">− Row</button>',
      ].join('');

      const grid = document.createElement('div');
      grid.className = 'mgl-table-grid';

      const parsed = parseTableData(data);
      renderGrid(grid, parsed, notify);
      root.append(bar, grid);

      bar.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-table]');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        let { cols, rows, cells, colWidths, rowHeights } = readTableDom(root);
        const act = btn.dataset.table;

        if (act === 'add-col') {
          cols += 1;
          colWidths.push(colWidths[colWidths.length - 1] || DEFAULT_COL_W);
        } else if (act === 'del-col' && cols > 1) {
          cols -= 1;
          colWidths.pop();
          cells = pruneCells(cells, 'c', cols);
        } else if (act === 'add-row') {
          rows += 1;
          rowHeights.push(rowHeights[rowHeights.length - 1] || DEFAULT_ROW_H);
        } else if (act === 'del-row' && rows > 1) {
          rows -= 1;
          rowHeights.pop();
          cells = pruneCells(cells, 'r', rows);
        }

        renderGrid(grid, { cols, rows, cells, colWidths, rowHeights }, notify);
        if (typeof notify === 'function') notify();
      });

      return root;
    },
    read(wrapper) {
      const tableEl = wrapper.querySelector('.mgl-table');
      if (!tableEl) {
        return {
          html: '',
          text: '',
          data: {
            'col-count': 2,
            'row-count': 2,
            'col-widths': [DEFAULT_COL_W, DEFAULT_COL_W],
            'row-heights': [DEFAULT_ROW_H, DEFAULT_ROW_H],
            cells: {},
          },
        };
      }
      const { cols, rows, cells, colWidths, rowHeights } = readTableDom(tableEl);
      return {
        html: '',
        text: Object.keys(cells).sort().map((k) => cells[k]).join(' '),
        data: {
          'col-count': cols,
          'row-count': rows,
          'col-widths': colWidths,
          'row-heights': rowHeights,
          cells,
        },
      };
    },
    attach(editorContent, { notify }) {
      editorContent.addEventListener('keydown', (e) => {
        const cell = e.target.closest?.('.mgl-cell');
        if (!cell || !editorContent.contains(cell)) return;
        if (e.key === 'Tab') {
          e.preventDefault();
          e.stopPropagation();
          const all = Array.from(cell.closest('.mgl-table').querySelectorAll('.mgl-cell'));
          const idx = all.indexOf(cell);
          const next = all[idx + (e.shiftKey ? -1 : 1)];
          if (next) next.focus();
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          document.execCommand('insertLineBreak');
          if (typeof notify === 'function') notify();
        }
      }, true);
    },
  };
}
