/**
 * Multi-block selection & batch actions (copy / cut / delete / convert type)
 * for the vertical-lr block editor.
 */
import { portal } from 'mgl-common-ui';
import { editablePlainText } from './wiki.js';
import { t } from '../i18n.js';
import { toast } from '../ui/toast.js';
import { h } from '../util.js';

const CONVERT_TYPES = [
  { type: 'paragraph', label: '¶', title: 'Paragraph' },
  { type: 'heading-2', label: 'H2', title: 'Heading' },
  { type: 'task', label: '☑', title: 'Task' },
  { type: 'list-item', label: '•', title: 'List' },
  { type: 'ordered-list-item', label: '1.', title: 'Ordered List' },
  { type: 'blockquote', label: '❝', title: 'Quote' },
];

export function attachBlockSelection(host, editor, {
  isReadOnly = () => false,
  onMutate = () => {},
} = {}) {
  let selectedWrappers = [];
  let anchorWrapper = null;
  let dragging = false;
  let bar = null;

  function topLevelOrSiblingWrappers(startWrapper, endWrapper) {
    if (!startWrapper || !endWrapper) return [];
    // 若两个块在同一个父容器下，取同级区间；否则提升到顶级块容器取区间
    const container = host.querySelector('.editor-content') || host;
    const sameParent = startWrapper.parentElement === endWrapper.parentElement
      && startWrapper.parentElement;
    const scope = sameParent || container;
    const all = Array.from(scope.children).filter((el) => el.classList?.contains('block-wrapper'));
    const a = sameParent ? startWrapper : startWrapper.closest('.editor-content > .block-wrapper') || startWrapper;
    const b = sameParent ? endWrapper : endWrapper.closest('.editor-content > .block-wrapper') || endWrapper;
    const i1 = all.indexOf(a);
    const i2 = all.indexOf(b);
    if (i1 === -1 || i2 === -1) return [startWrapper];
    return all.slice(Math.min(i1, i2), Math.max(i1, i2) + 1);
  }

  function clearSelection() {
    if (!selectedWrappers.length) return;
    selectedWrappers.forEach((w) => w.classList.remove('is-block-selected'));
    selectedWrappers = [];
    anchorWrapper = null;
    host.classList.remove('has-block-selection');
    hideBar();
  }

  function applySelection(wrappers) {
    selectedWrappers.forEach((w) => w.classList.remove('is-block-selected'));
    selectedWrappers = wrappers.filter((w) => w && host.contains(w));
    if (selectedWrappers.length === 0) {
      host.classList.remove('has-block-selection');
      hideBar();
      return;
    }
    host.classList.add('has-block-selection');
    selectedWrappers.forEach((w) => w.classList.add('is-block-selected'));
    window.getSelection()?.removeAllRanges();
    showBar();
  }

  // -------------------------------------------------------------------------
  // 批量操作实现：复制 / 删除 / 转换块类型
  // -------------------------------------------------------------------------

  function serializeSelectedText() {
    return selectedWrappers.map((w) => {
      const type = w.dataset.blockType || 'paragraph';
      const content = w.querySelector(':scope > .block-content, :scope > .toggle-header > .toggle-title');
      const text = editablePlainText(content).trim();
      if (type === 'divider') return '---';
      if (type === 'heading-1') return `# ${text}`;
      if (type === 'heading-2') return `## ${text}`;
      if (type === 'heading-3') return `### ${text}`;
      if (type === 'task') {
        const checked = w.querySelector(':scope > input[type="checkbox"]')?.checked;
        return `${checked ? '[x]' : '[ ]'} ${text}`;
      }
      if (type === 'list-item') return `• ${text}`;
      if (type === 'ordered-list-item') return `1. ${text}`;
      if (type === 'blockquote') return `> ${text}`;
      return text;
    }).filter(Boolean).join('\n');
  }

  async function copySelectedBlocks() {
    if (!selectedWrappers.length) return;
    const text = serializeSelectedText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast(t('exportDone'));
    } catch {
      /* fallback handled by copy event */
    }
  }

  function deleteSelectedBlocks() {
    if (isReadOnly() || !selectedWrappers.length) return;
    const toRemove = [...selectedWrappers];
    const first = toRemove[0];
    const nextFocusTarget = first.previousElementSibling || toRemove[toRemove.length - 1].nextElementSibling;
    clearSelection();

    toRemove.forEach((w) => w.remove());

    // 若删空了整个编辑器，保底插入一个空段落
    const container = host.querySelector('.editor-content');
    if (container && !container.querySelector('.block-wrapper')) {
      editor.setBlocks([{ type: 'paragraph', text: '' }]);
    } else if (nextFocusTarget) {
      const editable = nextFocusTarget.querySelector('.block-content[contenteditable="true"], .toggle-title');
      editable?.focus({ preventScroll: true });
    }
    onMutate();
  }

  function convertSelectedBlocks(targetType) {
    if (isReadOnly() || !selectedWrappers.length) return;
    // 读取当前树，批量修改选中 blockId 的类型并重新回写
    const selectedIds = new Set(selectedWrappers.map((w) => w.dataset.blockId).filter(Boolean));
    if (!selectedIds.size) return;

    const ATOMIC = new Set(['divider', 'table', 'image', 'bookmark', 'unsupported']);
    const walk = (nodes) => nodes.map((node) => {
      const next = { ...node };
      if (selectedIds.has(node.id) && !ATOMIC.has(node.type)) {
        next.type = targetType;
        if (targetType === 'task' && next.checked === undefined) next.checked = false;
      }
      if (Array.isArray(node.children) && node.children.length) {
        next.children = walk(node.children);
      }
      return next;
    });

    const nextTree = walk(editor.getBlocks());
    editor.setBlocks(nextTree);
    onMutate();

    // 重新高亮转换后的块
    const restored = Array.from(host.querySelectorAll('.block-wrapper'))
      .filter((w) => selectedIds.has(w.dataset.blockId));
    applySelection(restored);
  }

  // -------------------------------------------------------------------------
  // 浮动批量操作工具栏
  // -------------------------------------------------------------------------

  function hideBar() {
    if (bar) bar.hidden = true;
  }

  function ensureBar() {
    if (bar) return bar;
    const countEl = h('span', { class: 'block-sel-bar__count' }, '0');
    const typeBtns = CONVERT_TYPES.map((item) => h('button', {
      type: 'button',
      class: 'sel-toolbar__btn',
      title: item.title,
      onmousedown: (e) => e.preventDefault(),
      onclick: () => convertSelectedBlocks(item.type),
    }, item.label));

    const copyBtn = h('button', {
      type: 'button',
      class: 'sel-toolbar__btn',
      title: t('exportText'),
      onmousedown: (e) => e.preventDefault(),
      onclick: () => { void copySelectedBlocks(); },
    }, '⎘');

    const delBtn = h('button', {
      type: 'button',
      class: 'sel-toolbar__btn block-sel-bar__danger',
      title: t('batchDelete'),
      onmousedown: (e) => e.preventDefault(),
      onclick: () => deleteSelectedBlocks(),
    }, '✕');

    const clearBtn = h('button', {
      type: 'button',
      class: 'sel-toolbar__btn',
      title: t('clearSelection'),
      onmousedown: (e) => e.preventDefault(),
      onclick: () => clearSelection(),
    }, 'Esc');

    bar = h('div', {
      class: 'sel-toolbar block-sel-bar',
      role: 'toolbar',
      hidden: true,
    },
      countEl,
      h('div', { class: 'sel-toolbar__group' }, ...typeBtns),
      h('div', { class: 'sel-toolbar__group' }, copyBtn, delBtn, clearBtn));

    portal(bar);
    return bar;
  }

  function showBar() {
    if (isReadOnly() || !selectedWrappers.length) {
      hideBar();
      return;
    }
    const el = ensureBar();
    const countEl = el.querySelector('.block-sel-bar__count');
    if (countEl) countEl.textContent = `${selectedWrappers.length}`;
    el.hidden = false;
  }

  // -------------------------------------------------------------------------
  // 交互监听：Shift+点击、跨块鼠标拖拽、⌘+A 二段全选、快捷键删除/复制
  // -------------------------------------------------------------------------

  const onPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    if (bar && bar.contains(e.target)) return;

    const wrapper = e.target.closest?.('.block-wrapper');
    if (!wrapper || !host.contains(wrapper)) {
      clearSelection();
      return;
    }

    // Shift + 点击：从上一个焦点块或锚点块扩展到当前点击块
    if (e.shiftKey) {
      const currentActive = anchorWrapper
        || document.activeElement?.closest?.('.block-wrapper');
      if (currentActive && currentActive !== wrapper && host.contains(currentActive)) {
        e.preventDefault();
        anchorWrapper = currentActive;
        applySelection(topLevelOrSiblingWrappers(anchorWrapper, wrapper));
        return;
      }
    }

    clearSelection();
    anchorWrapper = wrapper;
    dragging = true;
  };

  const onPointerMove = (e) => {
    if (!dragging || !anchorWrapper) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const overWrapper = target?.closest?.('.block-wrapper');
    if (!overWrapper || !host.contains(overWrapper)) return;

    // 一旦指针跨出了起始块，立刻切换为多块框选模式
    if (overWrapper !== anchorWrapper) {
      applySelection(topLevelOrSiblingWrappers(anchorWrapper, overWrapper));
    } else if (selectedWrappers.length > 0) {
      applySelection([anchorWrapper]);
    }
  };

  const onPointerUp = () => {
    dragging = false;
  };

  const onKeyDown = (e) => {
    if (isReadOnly()) return;
    const mod = e.metaKey || e.ctrlKey;

    // 1. ⌘/Ctrl + A 二段式全选：若当前块文本已全选或已有块选中，则全选所有顶级块
    if (mod && e.key.toLowerCase() === 'a') {
      const container = host.querySelector('.editor-content');
      if (!container) return;
      if (selectedWrappers.length > 0) {
        e.preventDefault();
        applySelection(Array.from(container.querySelectorAll(':scope > .block-wrapper')));
        return;
      }
      const sel = window.getSelection();
      const node = sel?.anchorNode;
      const editable = (node?.nodeType === 1 ? node : node?.parentElement)
        ?.closest?.('.block-content[contenteditable="true"], .toggle-title');
      if (editable && host.contains(editable)) {
        const fullLen = editablePlainText(editable).length;
        const selLen = sel.toString().replace(/\u200b/g, '').length;
        if (fullLen === 0 || selLen >= fullLen) {
          e.preventDefault();
          applySelection(Array.from(container.querySelectorAll(':scope > .block-wrapper')));
        }
      }
      return;
    }

    if (!selectedWrappers.length) return;

    // 2. 多块选中状态下的键盘交互
    if (e.key === 'Escape') {
      e.preventDefault();
      clearSelection();
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      deleteSelectedBlocks();
    } else if (e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      const last = selectedWrappers[selectedWrappers.length - 1];
      const first = selectedWrappers[0];
      const edge = anchorWrapper === first ? last : first;
      const next = e.key === 'ArrowRight'
        ? edge.nextElementSibling
        : edge.previousElementSibling;
      if (next && next.classList.contains('block-wrapper')) {
        applySelection(topLevelOrSiblingWrappers(anchorWrapper || first, next));
      }
    }
  };

  const onCopy = (e) => {
    if (!selectedWrappers.length || !e.clipboardData) return;
    const text = serializeSelectedText();
    e.clipboardData.setData('text/plain', text);
    e.preventDefault();
    toast(t('exportDone'));
  };

  const onCut = (e) => {
    if (isReadOnly() || !selectedWrappers.length || !e.clipboardData) return;
    const text = serializeSelectedText();
    e.clipboardData.setData('text/plain', text);
    e.preventDefault();
    deleteSelectedBlocks();
  };

  host.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onPointerUp, true);
  window.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('copy', onCopy, true);
  document.addEventListener('cut', onCut, true);

  return {
    clear: clearSelection,
    hasSelection: () => selectedWrappers.length > 0,
    destroy() {
      clearSelection();
      host.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('pointercancel', onPointerUp, true);
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('copy', onCopy, true);
      document.removeEventListener('cut', onCut, true);
      bar?.remove();
      bar = null;
    },
  };
}
