/**
 * Block-tree Undo / Redo history manager.
 * Captures snapshots of `editor.getBlocks()` along with the active block ID
 * and UTF-16 caret offset so structural edits (split, merge, indent, type
 * conversion, image resize, wiki decoration) undo/redo cleanly.
 */
import { caretOffset, decorateHost, placeCaret } from './wiki.js';
import { canonicalJson } from '../util.js';

const MAX_HISTORY = 80;
const COALESCE_MS = 450;

export function createEditorHistory(host, editor, {
  isReadOnly = () => false,
  isImeComposing = () => false,
  onRestore = () => {},
} = {}) {
  const undoStack = [];
  const redoStack = [];
  let applying = false;
  let recordTimer = 0;
  let lastSig = '';

  function captureCaret() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const node = sel.anchorNode;
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    const wrapper = el?.closest?.('.block-wrapper');
    if (!wrapper || !host.contains(wrapper)) return null;
    const editable = el?.closest?.('.mgl-cell, .toggle-title, .block-content[contenteditable="true"]');
    return {
      blockId: wrapper.dataset.blockId || null,
      cellKey: editable?.classList?.contains('mgl-cell') ? (editable.dataset.key || null) : null,
      offset: editable ? (caretOffset(editable) ?? 0) : 0,
    };
  }

  function restoreCaret(caret) {
    if (!caret || !caret.blockId) return;
    const wrapper = host.querySelector(
      `.block-wrapper[data-block-id="${CSS.escape(caret.blockId)}"]`,
    );
    if (!wrapper) return;

    let target = null;
    if (caret.cellKey) {
      target = wrapper.querySelector(`.mgl-cell[data-key="${CSS.escape(caret.cellKey)}"]`);
    }
    if (!target) {
      target = wrapper.querySelector('.toggle-title, .block-content[contenteditable="true"]');
    }
    if (!target) return;

    target.focus({ preventScroll: true });
    placeCaret(target, caret.offset ?? 0);
  }

  function snapshotNow() {
    const blocks = editor.getBlocks();
    const sig = canonicalJson(blocks);
    return {
      blocks,
      sig,
      caret: captureCaret(),
    };
  }

  /** 立即将当前编辑器状态压入 Undo 栈（若与栈顶内容一致则仅更新栈顶光标位置） */
  function recordNow({ clearRedo = true } = {}) {
    if (applying || isReadOnly()) return;
    clearTimeout(recordTimer);
    recordTimer = 0;

    const snap = snapshotNow();
    if (snap.sig === lastSig) {
      if (undoStack.length && snap.caret) {
        undoStack[undoStack.length - 1].caret = snap.caret;
      }
      return;
    }

    lastSig = snap.sig;
    undoStack.push(snap);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    if (clearRedo) redoStack.length = 0;
  }

  /** 防抖记录：合并连续打字输入 */
  function scheduleRecord() {
    if (applying || isReadOnly()) return;
    clearTimeout(recordTimer);
    recordTimer = setTimeout(() => {
      recordNow({ clearRedo: true });
    }, COALESCE_MS);
  }

  function applySnapshot(snap) {
    if (!snap) return;
    applying = true;
    try {
      const scroller = host.querySelector('.editor-content');
      const scrollLeft = scroller ? scroller.scrollLeft : 0;
      const cloned = JSON.parse(JSON.stringify(snap.blocks));
      editor.setBlocks(cloned);
      lastSig = snap.sig;
      decorateHost(host);
      if (scroller) scroller.scrollLeft = scrollLeft;
      restoreCaret(snap.caret);
      onRestore();
    } finally {
      setTimeout(() => { applying = false; }, 0);
    }
  }

  function undo() {
    if (isReadOnly()) return false;
    // 先把尚未进入防抖栈的最新未保存击键落栈
    if (recordTimer) recordNow({ clearRedo: false });
    if (undoStack.length <= 1) return false;

    const current = undoStack.pop();
    redoStack.push(current);
    const prev = undoStack[undoStack.length - 1];
    applySnapshot(prev);
    return true;
  }

  function redo() {
    if (isReadOnly() || !redoStack.length) return false;
    clearTimeout(recordTimer);
    recordTimer = 0;

    const next = redoStack.pop();
    undoStack.push(next);
    applySnapshot(next);
    return true;
  }

  // 在发生结构性按键（Enter / Backspace / Tab）前，先把当前未防抖的文字变动落栈
  const onKeyDownCapture = (e) => {
    if (isReadOnly() || isImeComposing()) return;
    const mod = e.metaKey || e.ctrlKey;

    if (mod && !e.altKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      e.stopPropagation();
      redo();
      return;
    }

    if (e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Tab') {
      if (recordTimer) recordNow({ clearRedo: true });
      else if (undoStack.length) {
        const caret = captureCaret();
        if (caret) undoStack[undoStack.length - 1].caret = caret;
      }
    }
  };

  host.addEventListener('keydown', onKeyDownCapture, true);

  return {
    /** 初始加载或远端同步重载后，重置历史栈基线 */
    resetBaseline() {
      clearTimeout(recordTimer);
      recordTimer = 0;
      undoStack.length = 0;
      redoStack.length = 0;
      const snap = snapshotNow();
      lastSig = snap.sig;
      undoStack.push(snap);
    },
    recordNow,
    scheduleRecord,
    undo,
    redo,
    isApplying: () => applying,
    destroy() {
      clearTimeout(recordTimer);
      host.removeEventListener('keydown', onKeyDownCapture, true);
      undoStack.length = 0;
      redoStack.length = 0;
    },
  };
}
