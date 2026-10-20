/**
 * Floating [[wikilink / #tag / ((block autocomplete (after block-editor widgets.autocomplete).
 */
import { portal } from 'mgl-common-ui';
import { caretOffset, editablePlainText, placeCaret, queryAtCaret } from './wiki.js';
import { blockSuggestions, linkSuggestions, tagSuggestions } from '../services/links.js';

export function attachAutocomplete(host) {
  let menu = null;
  let items = [];
  let active = 0;
  let ctx = null; // { el, start, end, kind }

  function hide() {
    if (menu) {
      menu.remove();
      menu = null;
    }
    items = [];
    ctx = null;
    active = 0;
  }

  function ensureMenu() {
    if (menu) return menu;
    menu = document.createElement('div');
    menu.className = 'wiki-ac';
    menu.setAttribute('role', 'listbox');
    portal(menu);
    return menu;
  }

  function render() {
    if (!items.length) {
      hide();
      return;
    }
    const el = ensureMenu();
    el.replaceChildren(...items.map((item, i) => {
      const label = typeof item === 'string' ? item : item.label;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `wiki-ac__item${i === active ? ' is-active' : ''}`;
      btn.setAttribute('role', 'option');
      btn.textContent = label;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        void accept(i);
      });
      return btn;
    }));
    position(el);
  }

  function position(el) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const pad = 8;
    // Vertical-lr editor: open to the next column (right of caret), align top.
    let left = rect.right + 6;
    let top = rect.top;
    el.style.visibility = 'hidden';
    el.style.display = 'flex';
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (left + w > window.innerWidth - pad) left = Math.max(pad, rect.left - w - 6);
    if (top + h > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - h - pad);
    if (top < pad) top = pad;
    el.style.top = `${Math.round(top)}px`;
    el.style.left = `${Math.round(left)}px`;
    el.style.visibility = 'visible';
  }

  function setRangeByOffsets(el, start, end) {
    placeCaret(el, start);
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    const startRange = sel.getRangeAt(0).cloneRange();
    placeCaret(el, end);
    if (!sel.rangeCount) return null;
    const endRange = sel.getRangeAt(0);
    const range = document.createRange();
    range.setStart(startRange.startContainer, startRange.startOffset);
    range.setEnd(endRange.startContainer, endRange.startOffset);
    sel.removeAllRanges();
    sel.addRange(range);
    return range;
  }

  async function accept(index) {
    if (!ctx || !items[index]) return;
    const item = items[index];
    const { el, start, end, kind } = ctx;
    let insert;
    if (kind === 'block') {
      const id = typeof item === 'string' ? item : item.id;
      insert = `((${id})) `;
    } else if (kind === 'wiki') {
      insert = `[[${item}]] `;
    } else {
      insert = `#${item} `;
    }
    el.focus();
    setRangeByOffsets(el, start, end);
    document.execCommand('insertText', false, insert);
    placeCaret(el, start + insert.length);
    hide();
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  async function refresh() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) {
      hide();
      return;
    }
    const node = sel.anchorNode;
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    const part = el?.closest?.('.block-content[contenteditable="true"], .toggle-title');
    if (!part || !host.contains(part) || part.closest('.mgl-cell')) {
      hide();
      return;
    }
    const offset = caretOffset(part);
    if (offset == null) {
      hide();
      return;
    }
    const plain = editablePlainText(part);
    const q = queryAtCaret(plain, offset);
    if (!q) {
      hide();
      return;
    }
    ctx = { el: part, start: q.start, end: q.end, kind: q.kind };
    if (q.kind === 'block') {
      items = await blockSuggestions(q.query);
    } else if (q.kind === 'wiki') {
      items = await linkSuggestions(q.query);
      if (q.query.trim()) {
        const t = q.query.trim();
        if (!items.includes(t)) items = [t, ...items].slice(0, 20);
      }
    } else {
      items = await tagSuggestions(q.query);
      if (q.query.trim()) {
        const t = q.query.trim();
        if (!items.includes(t)) items = [t, ...items].slice(0, 20);
      }
    }
    active = 0;
    render();
  }

  function onKeyDown(e) {
    if (!menu) return;
    // Items are vertical columns laid out left→right; Left/Right match that axis.
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      active = (active + 1) % items.length;
      render();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      active = (active - 1 + items.length) % items.length;
      render();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (!items.length) return;
      e.preventDefault();
      e.stopPropagation();
      void accept(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hide();
    }
  }

  const navKeys = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', 'Tab', 'Escape'];
  const onInput = () => { void refresh(); };
  const onKeyUp = (e) => {
    if (navKeys.includes(e.key)) return;
    void refresh();
  };
  const onPointer = (e) => {
    if (menu && !menu.contains(e.target)) hide();
  };

  host.addEventListener('input', onInput);
  host.addEventListener('keyup', onKeyUp);
  host.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('pointerdown', onPointer, true);

  return {
    refresh,
    hide,
    destroy() {
      hide();
      host.removeEventListener('input', onInput);
      host.removeEventListener('keyup', onKeyUp);
      host.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointer, true);
    },
  };
}
