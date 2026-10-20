/**
 * One open document: block-editor + IME + debounced persist + wiki links.
 * Mirrors notes-app.editor.view/document-editor: ~2 s debounce → diff → ops,
 * flush on leave and before every pull, reload when remote ops touch the document.
 */
import { createBlockEditor } from 'block-editor';
import { applyBlockChanges, getBlocks } from '../services/notes.js';
import { storeImageFile, warmAssetUrls } from '../services/assets.js';
import { clearLinksForIds, handleLinkTap, rebuildLinksForRows } from '../services/links.js';
import { diffRows, nextSnapshot, rowsToTree, treeToRows } from './bridge.js';
import { createPlaceholderPlugin } from './placeholder.js';
import { createImagePlugin, pickImageFile, setPendingImageData } from './image.js';
import { createBookmarkPlugin, promptBookmark, setPendingBookmark } from './bookmark.js';
import { attachAutocomplete } from './autocomplete.js';
import { attachMarkdownShortcuts } from './markdown-shortcuts.js';
import { attachSelectionToolbar } from './selection-toolbar.js';
import { decorateHost, hydrateBlockRefTitles, WIKI_SEL } from './wiki.js';
import { attachEditorIme, commitPending } from '../ime/index.js';
import { onBeforePull } from '../sync/sync.js';
import { on } from '../events.js';
import { t } from '../i18n.js';
import { toast } from '../ui/toast.js';
import { debounce } from '../util.js';

const PERSIST_DEBOUNCE_MS = 2000;
const DECORATE_MS = 120;

export function createEditorSession(host, documentId, { focusBlockId = null } = {}) {
  host.classList.add('note-editor');
  const editor = createBlockEditor(host, {
    mode: 'notes',
    plugins: [createPlaceholderPlugin(), createImagePlugin(), createBookmarkPlugin()],
    onChange: () => {
      if (decorating) return;
      markDirty();
      scheduleDecorate();
    },
  });
  let snapshot = new Map();
  let dirty = false;
  let timer = 0;
  let chain = Promise.resolve();
  let destroyed = false;
  let loaded = false;
  let readOnly = false;
  let pendingFocus = focusBlockId || null;

  const imeHandle = attachEditorIme(host, editor, {
    keepSelector: '.note-editor .toolbar, .wiki-ac, .sel-toolbar',
  });
  const ac = attachAutocomplete(host);
  const md = attachMarkdownShortcuts(host, editor);
  const selBar = attachSelectionToolbar(host, { isReadOnly: () => readOnly });
  let pointerDown = false;
  let decorating = false;

  const scheduleDecorate = debounce(() => {
    if (destroyed || !loaded || pointerDown || decorating) return;
    // Skip while the user has an active range selection (anchor or focus).
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) {
      const a = sel.anchorNode;
      const f = sel.focusNode;
      if ((a && host.contains(a)) || (f && host.contains(f))) return;
    }
    decorating = true;
    try {
      decorateHost(host);
      void hydrateBlockRefTitles(host);
    } finally {
      // Allow MutationObserver-driven onChange from wrapping to settle first.
      setTimeout(() => { decorating = false; }, 0);
    }
  }, DECORATE_MS);

  function markDirty() {
    if (destroyed || !loaded || decorating) return;
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(() => { void persist(); }, PERSIST_DEBOUNCE_MS);
  }

  function persist() {
    clearTimeout(timer);
    if (!dirty || destroyed) return chain;
    dirty = false;
    // Snapshot blocks synchronously so pagehide/DOM teardown can't race the queue.
    const currentBlocks = editor.getBlocks();
    const run = async () => {
      const rows = treeToRows(currentBlocks, snapshot);
      const changes = diffRows(rows, snapshot);
      try {
        await applyBlockChanges(documentId, changes);
        snapshot = nextSnapshot(rows, snapshot);
        const linkRows = [
          ...(changes.created || []).map((r) => ({ id: r.id, text: r.text || '' })),
          ...(changes.updated || []).map(({ row }) => ({ id: row.id, text: row.text || '' })),
        ];
        if (changes.deleted?.length) await clearLinksForIds(changes.deleted);
        if (linkRows.length) await rebuildLinksForRows(linkRows);
        return true;
      } catch (e) {
        dirty = true;
        console.error('[editor] persist failed', e);
        return false;
      }
    };
    chain = chain.catch(() => null).then(run);
    return chain;
  }

  async function flush() {
    await commitPending(imeHandle.ime);
    return persist();
  }

  function caretBlockId() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const node = sel.anchorNode;
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    const wrapper = el && el.closest && el.closest('.block-wrapper');
    return wrapper && host.contains(wrapper) ? wrapper.dataset.blockId : null;
  }

  async function load() {
    const rows = await getBlocks(documentId);
    if (destroyed) return;
    await warmAssetUrls(rows);
    if (destroyed) return;
    const built = rowsToTree(rows);
    snapshot = built.snapshot;
    const scroller = host.querySelector('.editor-content');
    const scrollLeft = scroller ? scroller.scrollLeft : 0;
    const activeId = host.contains(document.activeElement) ? caretBlockId() : null;
    editor.setBlocks(built.tree.length ? built.tree : [{ type: 'paragraph', text: '' }]);
    loaded = true;
    applyReadOnly();
    decorateHost(host);
    void hydrateBlockRefTitles(host);
    imeHandle.refresh();
    if (scroller) scroller.scrollLeft = scrollLeft;
    if (activeId) {
      focusBlock(activeId, { preventScroll: true });
    } else if (pendingFocus) {
      focusBlock(pendingFocus);
      pendingFocus = null;
    }
  }

  function focusBlock(blockId, { preventScroll = false } = {}) {
    if (!blockId) return false;
    const wrapper = host.querySelector(`.block-wrapper[data-block-id="${CSS.escape(blockId)}"]`);
    if (!wrapper) return false;
    if (!preventScroll) {
      wrapper.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
    const target = wrapper.querySelector(':scope > .block-content');
    if (target && target.isContentEditable) {
      target.focus({ preventScroll: true });
      const range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    return true;
  }

  const onPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    pointerDown = true;
    scheduleDecorate.cancel?.();
  };
  const onPointerUp = () => {
    if (!pointerDown) return;
    pointerDown = false;
    // Defer: let the browser finalize the selection before we consider decorate.
    scheduleDecorate();
  };
  // Capture on window so drag-select that starts in the editor is tracked even
  // when the pointer leaves the host mid-gesture.
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onPointerUp, true);

  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const onClick = (e) => {
    const wiki = e.target.closest?.(WIKI_SEL);
    if (!wiki || !host.contains(wiki)) return;
    // Desktop: ⌘/Ctrl-click opens (plain click edits). Touch: tap opens like Flutter.
    if (!coarse && !(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    e.stopPropagation();
    if (wiki.classList.contains('wiki-link')) void handleLinkTap(wiki.dataset.wiki);
    else if (wiki.classList.contains('wiki-tag')) void handleLinkTap(wiki.dataset.tag);
    else if (wiki.classList.contains('wiki-block-ref')) void handleLinkTap({ type: 'block', id: wiki.dataset.block });
  };
  host.addEventListener('click', onClick);

  // Plain-text copy so wiki spans / vertical-lr selection still land on the clipboard.
  const onCopy = (e) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const anchor = sel.anchorNode;
    if (!anchor || !host.contains(anchor.nodeType === 1 ? anchor : anchor.parentElement)) return;
    const text = sel.toString().replace(/\u200b/g, '');
    if (!text || !e.clipboardData) return;
    e.clipboardData.setData('text/plain', text);
    e.preventDefault();
  };
  host.addEventListener('copy', onCopy);

  async function insertImageFromFile(file) {
    try {
      const stored = await storeImageFile(file);
      setPendingImageData({
        'asset-id': stored['asset-id'],
        url: stored.url || undefined,
        width: stored.width,
        height: stored.height,
      });
      editor.insertBlock('image');
    } catch (err) {
      console.error('[editor] image insert failed', err);
      toast(t('imageError'), { kind: 'error' });
    }
  }

  const onPaste = (e) => {
    if (readOnly) return;
    const files = Array.from(e.clipboardData?.files || []);
    let imgFile = files.find((f) => f.type.startsWith('image/'));
    if (!imgFile && e.clipboardData?.items) {
      const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
      if (item) imgFile = item.getAsFile();
    }
    if (!imgFile) return;
    e.preventDefault();
    void insertImageFromFile(imgFile);
  };

  const onDragOver = (e) => {
    if (readOnly) return;
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
    }
  };

  const onDrop = (e) => {
    if (readOnly) return;
    const files = Array.from(e.dataTransfer?.files || []);
    const imgFile = files.find((f) => f.type.startsWith('image/'));
    if (!imgFile) return;
    e.preventDefault();
    void insertImageFromFile(imgFile);
  };

  host.addEventListener('paste', onPaste);
  host.addEventListener('dragover', onDragOver);
  host.addEventListener('drop', onDrop);

  const onTableKeyDown = (e) => {
    if (e.key !== 'Tab' || e.defaultPrevented) return;
    const cell = e.target.closest?.('.mgl-cell');
    if (!cell || !host.contains(cell)) return;
    const tableWrapper = cell.closest('.block-wrapper[data-block-type="table"]');
    if (!tableWrapper) return;

    const cells = Array.from(tableWrapper.querySelectorAll('.mgl-cell'));
    const idx = cells.indexOf(cell);
    if (idx === -1) return;

    const nextIdx = e.shiftKey ? idx - 1 : idx + 1;
    if (nextIdx >= 0 && nextIdx < cells.length) {
      e.preventDefault();
      const target = cells[nextIdx];
      target.focus();
      const range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };
  host.addEventListener('keydown', onTableKeyDown);

  decorateToolbar(host, editor, insertImageFromFile);

  const offPull = onBeforePull(() => flush());
  const offRemote = on('blocks-changed', ({ documentIds }) => {
    if (destroyed || !documentIds || !documentIds.has(documentId)) return;
    if (dirty) return;
    chain = chain.catch(() => null).then(load);
  });
  const onHide = () => {
    if (document.visibilityState === 'hidden') void flush();
  };
  const onUnload = () => { void flush(); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onUnload);

  function applyReadOnly() {
    host.classList.toggle('is-readonly', readOnly);
    const toolbar = host.querySelector('.toolbar');
    if (toolbar) toolbar.hidden = readOnly;
    if (readOnly) selBar.hide();
    host.querySelectorAll('.block-content').forEach((el) => {
      const type = el.closest('.block-wrapper')?.dataset.blockType;
      const atomic = type === 'image' || type === 'divider' || type === 'bookmark'
        || type === 'table' || type === 'unsupported';
      if (atomic) {
        el.contentEditable = 'false';
        return;
      }
      el.contentEditable = readOnly ? 'false' : 'true';
    });
  }

  const ready = load();

  return {
    editor,
    ready,
    flush,
    focus() {
      if (!readOnly) editor.focus();
    },
    revealBlock(blockId) {
      return focusBlock(blockId);
    },
    setReadOnly(value) {
      readOnly = Boolean(value);
      applyReadOnly();
    },
    isReadOnly() {
      return readOnly;
    },
    async destroy() {
      if (destroyed) return;
      await flush();
      destroyed = true;
      clearTimeout(timer);
      scheduleDecorate.cancel?.();
      offPull();
      offRemote();
      host.removeEventListener('click', onClick);
      host.removeEventListener('copy', onCopy);
      host.removeEventListener('paste', onPaste);
      host.removeEventListener('dragover', onDragOver);
      host.removeEventListener('drop', onDrop);
      host.removeEventListener('keydown', onTableKeyDown);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('pointercancel', onPointerUp, true);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onUnload);
      ac.destroy();
      md.destroy();
      selBar.destroy();
      imeHandle.destroy();
      host.replaceChildren();
    },
  };
}

function decorateToolbar(host, editor, insertImageFromFile) {
  const toolbar = host.querySelector('.toolbar');
  if (!toolbar) return;

  toolbar.addEventListener('click', async (e) => {
    const btn = e.target.closest?.('button');
    if (!btn || !toolbar.contains(btn)) return;

    if (btn.dataset.block === 'image') {
      e.preventDefault();
      e.stopImmediatePropagation();
      const file = await pickImageFile();
      if (!file) return;
      await insertImageFromFile(file);
      return;
    }

    if (btn.dataset.block === 'bookmark') {
      e.preventDefault();
      e.stopImmediatePropagation();
      const data = await promptBookmark();
      if (!data) return;
      setPendingBookmark(data);
      editor.insertBlock('bookmark');
    }
  }, true);

  const group = document.createElement('div');
  group.className = 'toolbar-group';
  [['undo', '↶', t('undo')], ['redo', '↷', t('redo')]].forEach(([cmd, label, title]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = title;
    btn.textContent = label;
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => document.execCommand(cmd));
    group.append(btn);
  });
  const sep = document.createElement('div');
  sep.className = 'toolbar-sep';
  toolbar.prepend(group, sep);
}
