/**
 * mgl-web-ime wiring, after xamt (assets/js/hooks/mongolian-ime.js,
 * message-composer.js, utils/ime-keyboard.js, utils/ime.js).
 *
 * Desktop: physical keyboard → IME candidate popup.
 * Mobile:  mgl-web-ime virtual keyboard + candidate bar; the OS keyboard is suppressed
 *           only when built-in IME is active ('mongol' | 'latin'). 'system' uses native IME.
 */
import {
  CandidateProvider,
  LocalCandidateProvider,
  MglIME,
  RemoteCandidateProvider,
  createCustomAdapter,
  measureCaretRect,
} from 'mgl-web-ime';
import 'mgl-web-ime/styles/ime.css';
import { imeBaseUrl } from '../config.js';

const REMOTE_TIMEOUT_MS = 800;
const FAILURES_BEFORE_TRIP = 3;

/** Remote candidates with a circuit breaker; falls back to local transliteration. */
class GatedRemoteProvider extends CandidateProvider {
  constructor(baseUrl) {
    super();
    this.local = new LocalCandidateProvider();
    this.remote = new RemoteCandidateProvider({ baseUrl, timeoutMs: REMOTE_TIMEOUT_MS });
    this.failures = 0;
    this.open = false;
    window.addEventListener('online', () => { this.open = false; this.failures = 0; });
  }

  async getCandidates(input, context = {}) {
    if (this.open || navigator.onLine === false) return this.local.getCandidates(input, context);
    const started = performance.now();
    const words = await this.remote.getCandidates(input, context);
    if (words.length) {
      this.failures = 0;
      return words;
    }
    if (performance.now() - started >= REMOTE_TIMEOUT_MS - 50) {
      this.failures += 1;
      if (this.failures >= FAILURES_BEFORE_TRIP) this.open = true;
    }
    return this.local.getCandidates(input, context);
  }

  async getNextWords(word) {
    if (this.open || navigator.onLine === false) return [];
    return this.remote.getNextWords(word);
  }
}

let sharedProvider = null;

export function imeProvider() {
  if (!sharedProvider) {
    const base = imeBaseUrl();
    sharedProvider = base ? new GatedRemoteProvider(base) : new LocalCandidateProvider();
  }
  return sharedProvider;
}

export function preferVirtualIme() {
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent)) {
    return true;
  }
  const touch = 'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0;
  return touch && window.matchMedia('(max-width: 960px)').matches;
}

// ---------------------------------------------------------------------------
// Mode shared by every instance (toggle button + desktop Shift tap)
// ---------------------------------------------------------------------------

const instances = new Set();
let currentMode = 'mongol';
const modeListeners = new Set();

export function imeMode() {
  return currentMode;
}

function isTargetFocused(target) {
  const active = document.activeElement;
  return Boolean(target && (target === active || target.contains?.(active)));
}

function applyModeToInstance(ime, mode) {
  const target = ime.targetEl;
  const mobile = preferVirtualIme();
  if (mode === 'system') {
    ime.disable();
    if (mobile) ime.setKeyboardMode('system');
    dismissVirtualIme(ime);
    if (owner === ime) owner = null;
    restoreNativeKeyboard(target);
  } else {
    ime.enable();
    if (ime.getState().mode !== mode) ime.setMode(mode);
    if (mobile) ime.setKeyboardMode('virtual');
    if (ime.keyboardMode === 'virtual') {
      suppressSystemKeyboard(target);
      if (isTargetFocused(target)) {
        owner = ime;
        ime.showKeyboard();
      } else {
        ime.hideKeyboard();
      }
    }
  }
}

export function setImeMode(mode) {
  const next = mode === 'latin' ? 'latin' : mode === 'system' ? 'system' : 'mongol';
  currentMode = next;
  instances.forEach((ime) => applyModeToInstance(ime, next));
  modeListeners.forEach((fn) => fn(next));
}

export function toggleImeMode() {
  const next = currentMode === 'mongol'
    ? 'latin'
    : currentMode === 'latin'
      ? 'system'
      : 'mongol';
  setImeMode(next);
}

export function onImeModeChange(fn) {
  modeListeners.add(fn);
  return () => modeListeners.delete(fn);
}

function register(ime) {
  instances.add(ime);
  applyModeToInstance(ime, currentMode);
  ime.on('mgl-ime-mode-change', (detail) => {
    if (currentMode === 'system') return;
    const mode = detail && detail.mode;
    if (mode && mode !== currentMode) setImeMode(mode);
  });
}

// ---------------------------------------------------------------------------
// System keyboard suppression / one virtual keyboard at a time
// ---------------------------------------------------------------------------

function isEditable(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') return true;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
}

export function suppressSystemKeyboard(root) {
  if (!root || currentMode === 'system') return;
  const apply = (el) => {
    if (!isEditable(el)) return;
    el.setAttribute('inputmode', 'none');
    el.setAttribute('virtualkeyboardpolicy', 'manual');
  };
  apply(root);
  root.querySelectorAll?.('[contenteditable], input, textarea').forEach(apply);
  navigator.virtualKeyboard?.hide?.();
}

export function restoreNativeKeyboard(root) {
  if (!root) return;
  const restore = (el) => {
    if (!isEditable(el)) return;
    if (el.getAttribute('inputmode') === 'none') el.removeAttribute('inputmode');
    if (el.getAttribute('virtualkeyboardpolicy') === 'manual') {
      el.removeAttribute('virtualkeyboardpolicy');
    }
  };
  restore(root);
  root.querySelectorAll?.('[contenteditable], input, textarea').forEach(restore);
}

let owner = null;
const CLAIM_GRACE_MS = 500;
const GHOST_MOUSE_MS = 800;
let lastTouchAt = 0;

function inNode(event, node) {
  if (!node) return false;
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  return path.includes(node) || node === event.target || node.contains?.(event.target);
}

function dismissVirtualIme(ime) {
  ime.core?.setState?.({ keyboardVisible: false, candidateVisible: false, candidates: [], composition: '' });
  ime.hideCandidates?.();
  ime.hideKeyboard?.();
  if (ime.candidatesEl) ime.candidatesEl.visible = false;
}

export function dismissOwnedIme() {
  if (owner) {
    dismissVirtualIme(owner);
    owner = null;
  }
}

/**
 * Show this instance's keyboard while its field is focused; hide others.
 * `keepSelector` marks chrome (toolbar buttons) whose taps must not close it.
 */
function attachVirtualKeyboard(ime, { keepSelector = '' } = {}) {
  const target = ime.targetEl;
  const mobile = preferVirtualIme();
  if (ime.keyboardMode === 'virtual') ime.hideKeyboard();
  let claimedAt = 0;

  const onTargetFocus = () => {
    if (currentMode === 'system' || !ime.core?.state?.enabled) {
      dismissVirtualIme(ime);
      if (owner === ime) owner = null;
      restoreNativeKeyboard(target);
      return;
    }
    if (ime.keyboardMode !== 'virtual') return;
    suppressSystemKeyboard(target);
    instances.forEach((other) => {
      if (other === ime) return;
      other.hideCandidates?.();
      if (owner === other) other.hideKeyboard();
    });
    owner = ime;
    claimedAt = performance.now();
    ime.showKeyboard();
  };

  const release = () => {
    if (owner !== ime) return;
    dismissVirtualIme(ime);
    owner = null;
  };

  target?.addEventListener('focusin', onTargetFocus);
  target?.addEventListener('pointerdown', onTargetFocus);

  const onKeyPointer = (e) => e.preventDefault();
  const onDocPointer = (e) => {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') lastTouchAt = performance.now();
    else if (e.pointerType === 'mouse' && lastTouchAt && performance.now() - lastTouchAt < GHOST_MOUSE_MS) return;
    if (owner !== ime) return;
    if (performance.now() - claimedAt < CLAIM_GRACE_MS) return;
    if (inNode(e, target) || inNode(e, ime.keyboardEl) || inNode(e, ime.candidatesEl)) return;
    if (e.target?.closest?.('mgl-candidates, mgl-keyboard, mgl-emoji-picker')) return;
    if (keepSelector && e.target?.closest?.(keepSelector)) return;
    if (e.target?.closest?.('.ime-dev, [data-ime-dev]')) return;
    release();
  };

  if (mobile) {
    ime.keyboardEl?.addEventListener('pointerdown', onKeyPointer);
    ime.keyboardEl?.addEventListener('mousedown', onKeyPointer);
    document.addEventListener('pointerdown', onDocPointer, true);
  }

  if (isTargetFocused(target)) onTargetFocus();

  return () => {
    target?.removeEventListener('focusin', onTargetFocus);
    target?.removeEventListener('pointerdown', onTargetFocus);
    if (mobile) {
      ime.keyboardEl?.removeEventListener('pointerdown', onKeyPointer);
      ime.keyboardEl?.removeEventListener('mousedown', onKeyPointer);
      document.removeEventListener('pointerdown', onDocPointer, true);
    }
    if (owner === ime) {
      dismissVirtualIme(ime);
      owner = null;
    }
  };
}

/** Keep every mobile instance's candidate bar above the virtual keyboard. */
export function syncMobileCandidateBars() {
  instances.forEach((ime) => {
    if (ime.profile === 'mobile' && typeof ime.syncMobileChrome === 'function') {
      ime.syncMobileChrome();
    }
  });
}

/** Track the virtual keyboard height in --app-ime-kb so the shell shrinks above it. */
export function trackImeKeyboard() {
  const root = document.documentElement;
  let observer = null;
  let watched = null;

  const apply = (el) => {
    const height = el?.offsetHeight || 0;
    root.style.setProperty('--app-ime-kb', `${height}px`);
    document.body.classList.toggle('mgl-ime-mobile-open', height > 0);
    syncMobileCandidateBars();
  };
  const watch = (el) => {
    observer?.disconnect();
    watched = el || null;
    if (!el) {
      apply(null);
      return;
    }
    observer = new ResizeObserver(() => apply(el));
    observer.observe(el);
    apply(el);
  };

  document.addEventListener('mgl-ime-keyboard-show', (e) => {
    if (currentMode === 'system') {
      instances.forEach((ime) => dismissVirtualIme(ime));
      owner = null;
      watch(null);
      return;
    }
    watch(e.target);
  });
  document.addEventListener('mgl-ime-keyboard-hide', (e) => {
    const visible = document.querySelector('mgl-keyboard[visible]');
    if (visible && visible !== e.target) watch(visible);
    else if (watched === e.target || !visible) watch(null);
  });
}

// ---------------------------------------------------------------------------
// Instances
// ---------------------------------------------------------------------------

function createIme(options, { keepSelector } = {}) {
  const virtual = preferVirtualIme();
  const builtInKb = currentMode !== 'system';
  const initialEngineMode = currentMode === 'latin' ? 'latin' : 'mongol';
  const ime = new MglIME({
    profile: virtual ? 'mobile' : 'auto',
    keyboard: virtual ? (builtInKb ? 'virtual' : 'system') : 'auto',
    mode: initialEngineMode,
    provider: imeProvider(),
    mount: document.body,
    ...options,
  });
  if (currentMode === 'system') ime.disable();
  if (ime.keyboardMode === 'virtual' && builtInKb) {
    suppressSystemKeyboard(ime.targetEl);
  }
  const detachKeyboard = attachVirtualKeyboard(ime, { keepSelector });
  register(ime);
  return {
    ime,
    destroy() {
      detachKeyboard();
      instances.delete(ime);
      ime.destroy();
    },
  };
}

/** IME for a plain <input> / <textarea> (document title, search, command palette). */
export function attachFieldIme(el, { keepSelector } = {}) {
  return createIme({ target: el }, { keepSelector });
}

/**
 * IME for the block editor. Each block is its own contenteditable, so the
 * adapter always targets the one holding the caret. Enter / Backspace from
 * the IME route through the editor's split / merge so they behave like keys.
 */
export function attachEditorIme(host, editor, { keepSelector } = {}) {
  const root = () => host.querySelector('.editor-content') || host;
  const adapter = buildEditorAdapter(root, editor);
  const handle = createIme({ target: root(), adapter }, { keepSelector });
  const { ime } = handle;

  const syncKbAttr = (target) => {
    if (currentMode === 'system') restoreNativeKeyboard(target);
    else if (ime.keyboardMode === 'virtual') suppressSystemKeyboard(target);
  };

  const onFocusIn = (e) => syncKbAttr(e.target);
  root().addEventListener('focusin', onFocusIn);

  let scrollRaf = 0;
  const onScroll = () => {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      if (ime.keyboardMode === 'virtual') return;
      if (!ime.candidatesEl?.visible) return;
      const rect = adapter.getCaretRect?.();
      if (rect) ime.candidatesEl.positionNear(rect);
    });
  };
  const content = root();
  content.addEventListener('scroll', onScroll, { passive: true });

  return {
    ime,
    /** Re-apply inputmode=none after the editor rebuilt its blocks. */
    refresh() {
      syncKbAttr(root());
    },
    destroy() {
      root().removeEventListener('focusin', onFocusIn);
      content.removeEventListener('scroll', onScroll);
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      handle.destroy();
    },
  };
}

export async function commitPending(ime) {
  const state = ime?.getState?.();
  if (!state || !state.enabled) return;
  if (state.composition || (state.candidates?.length ?? 0) > 0) {
    await ime.core?.commitCurrent?.({ addSpaceAfter: false });
  }
}

// ---------------------------------------------------------------------------
// Adapter (contenteditable text ↔ offsets), from xamt message-composer.js
// ---------------------------------------------------------------------------

const EDITABLE_PART = '.mgl-cell, .toggle-title, .block-content[contenteditable="true"]';
const SKIP = '.list-marker, .callout-icon, .toggle-arrow, input';

let lastEditable = null;

function activeEditable(root) {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const node = sel.anchorNode;
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    const part = el?.closest?.(EDITABLE_PART);
    if (part && root.contains(part)) {
      lastEditable = part;
      return part;
    }
  }
  if (lastEditable && root.contains(lastEditable)) return lastEditable;
  return root.querySelector(EDITABLE_PART);
}

function skipped(node) {
  return node.nodeType === 1 && node.matches?.(SKIP);
}

function serializedLength(node) {
  if (!node) return 0;
  if (node.nodeType === 3) return node.data.length;
  if (node.nodeName === 'BR') return 1;
  if (skipped(node)) return 0;
  let length = 0;
  for (const child of node.childNodes) length += serializedLength(child);
  return length;
}

function serializeText(node) {
  if (!node) return '';
  if (node.nodeType === 3) return node.data;
  if (node.nodeName === 'BR') return '\n';
  if (skipped(node)) return '';
  let text = '';
  for (const child of node.childNodes) text += serializeText(child);
  return text;
}

function caretIndex(root, container, offset) {
  const range = document.createRange();
  try {
    range.setStart(root, 0);
    range.setEnd(container, offset);
  } catch {
    return serializedLength(root);
  }
  return serializedLength(range.cloneContents());
}

function pointFromIndex(root, index) {
  let left = Math.max(0, index);
  const visit = (node) => {
    if (node.nodeType === 3) {
      if (left <= node.data.length) return { node, offset: left };
      left -= node.data.length;
      return null;
    }
    if (node.nodeName === 'BR') {
      if (left <= 0) {
        const parent = node.parentNode;
        return { node: parent, offset: Array.prototype.indexOf.call(parent.childNodes, node) };
      }
      left -= 1;
      return null;
    }
    if (skipped(node)) return null;
    if (node.nodeType === 1) {
      for (const child of node.childNodes) {
        const hit = visit(child);
        if (hit) return hit;
      }
    }
    return null;
  };
  const hit = visit(root);
  if (hit) return hit;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let last = null;
  while (walker.nextNode()) last = walker.currentNode;
  if (last) return { node: last, offset: last.data.length };
  return { node: root, offset: root.childNodes.length };
}

function placeRange(el, start, end) {
  const from = pointFromIndex(el, start);
  const to = pointFromIndex(el, end);
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function focusPart(el) {
  if (!el) return;
  const host = el.closest('[contenteditable="true"]') || el;
  if (document.activeElement !== host) host.focus({ preventScroll: true });
}

function buildEditorAdapter(getRoot, editor) {
  return createCustomAdapter({
    getElement: () => activeEditable(getRoot()),
    focus: () => focusPart(activeEditable(getRoot())),
    blur: () => {
      const el = activeEditable(getRoot());
      (el?.closest('[contenteditable="true"]') || el)?.blur?.();
    },
    getText: () => serializeText(activeEditable(getRoot())),
    getSelection: () => {
      const el = activeEditable(getRoot());
      const sel = window.getSelection();
      if (!el || !sel || sel.rangeCount === 0) {
        const len = serializedLength(el);
        return { start: len, end: len };
      }
      const range = sel.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer) && el !== range.commonAncestorContainer) {
        const len = serializedLength(el);
        return { start: len, end: len };
      }
      const start = caretIndex(el, range.startContainer, range.startOffset);
      const end = range.collapsed ? start : caretIndex(el, range.endContainer, range.endOffset);
      return { start, end };
    },
    setSelection: ({ start, end }) => {
      const el = activeEditable(getRoot());
      if (el) placeRange(el, start, end ?? start);
    },
    insertText: (text) => {
      const el = activeEditable(getRoot());
      focusPart(el);
      if (text === '\n' || text === '\r\n') {
        if (!el?.closest('.mgl-cell') && editor.insertBreak()) return;
        document.execCommand('insertLineBreak');
        return;
      }
      document.execCommand('insertText', false, text);
    },
    deleteBackward: () => {
      const el = activeEditable(getRoot());
      focusPart(el);
      if (!el?.closest('.mgl-cell') && editor.deleteAtBoundary()) return;
      document.execCommand('delete');
    },
    deleteForward: () => {
      focusPart(activeEditable(getRoot()));
      document.execCommand('forwardDelete');
    },
    replaceSelection: (text) => {
      focusPart(activeEditable(getRoot()));
      document.execCommand('insertText', false, text);
    },
    getCaretRect: () => {
      const el = activeEditable(getRoot());
      const sel = window.getSelection();
      const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
      const inside = range && el && (el === range.commonAncestorContainer || el.contains(range.commonAncestorContainer));
      if (!inside) return measureCaretRect(null, el);
      const caret = range.cloneRange();
      caret.collapse(true);
      return measureCaretRect(caret, el);
    },
  });
}
