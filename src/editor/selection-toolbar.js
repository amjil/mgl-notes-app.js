/**
 * Selection formatting toolbar.
 * Desktop: floats beside the selection; mobile (≤960px): fixed bottom bar above --app-ime-kb.
 */
import { portal } from 'mgl-common-ui';
import { t } from '../i18n.js';
import { promptDialog } from '../ui/prompt.js';

const MOBILE_MQ = '(max-width: 960px)';
const FORMAT = [
  { cmd: 'bold', label: 'B', titleKey: 'fmtBold', html: '<b>B</b>' },
  { cmd: 'italic', label: 'I', titleKey: 'fmtItalic', html: '<i>I</i>' },
  { cmd: 'underline', label: 'U', titleKey: 'fmtUnderline', html: '<u>U</u>' },
];

function safeHttpUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  try {
    const u = new URL(s.includes(':') ? s : `https://${s}`);
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(u.protocol)) return null;
    return u.href;
  } catch {
    return null;
  }
}

function selectionInHost(host) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
  const node = sel.anchorNode;
  const el = node?.nodeType === 1 ? node : node?.parentElement;
  if (!el || !host.contains(el)) return null;
  if (!el.closest?.('.block-content[contenteditable="true"], .toggle-title')) return null;
  return sel;
}

export function attachSelectionToolbar(host, { isReadOnly = () => false } = {}) {
  let bar = null;
  let buttons = [];
  let visible = false;
  /** True while a primary pointer is down — never show the bar mid-drag. */
  let pointerDown = false;
  const mobileMq = window.matchMedia(MOBILE_MQ);

  function hide() {
    if (!bar) return;
    bar.hidden = true;
    bar.classList.remove('is-visible');
    bar.style.visibility = '';
    visible = false;
  }

  function ensure() {
    if (bar) return bar;
    bar = document.createElement('div');
    bar.className = 'sel-toolbar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', t('fmtToolbar'));
    bar.hidden = true;

    const group = document.createElement('div');
    group.className = 'sel-toolbar__group';

    buttons = FORMAT.map((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sel-toolbar__btn';
      btn.dataset.cmd = item.cmd;
      btn.title = t(item.titleKey);
      btn.innerHTML = item.html;
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => {
        if (!selectionInHost(host)) return;
        document.execCommand(item.cmd);
        refreshActive();
        host.dispatchEvent(new Event('input', { bubbles: true }));
        schedule();
      });
      group.append(btn);
      return btn;
    });

    const linkBtn = document.createElement('button');
    linkBtn.type = 'button';
    linkBtn.className = 'sel-toolbar__btn';
    linkBtn.dataset.action = 'link';
    linkBtn.title = t('fmtLink');
    linkBtn.textContent = 'Link';
    linkBtn.addEventListener('mousedown', (e) => e.preventDefault());
    linkBtn.addEventListener('click', async () => {
      const sel = selectionInHost(host);
      if (!sel) return;
      const savedRange = sel.getRangeAt(0).cloneRange();
      hide();
      const res = await promptDialog({
        title: t('fmtLink'),
        fields: [
          { name: 'url', label: t('fmtLinkPrompt'), value: 'https://', latin: true, required: true },
        ],
      });
      if (!res) return;
      const url = safeHttpUrl(res.url);
      if (!url) return;
      const liveSel = window.getSelection();
      liveSel.removeAllRanges();
      liveSel.addRange(savedRange);
      document.execCommand('createLink', false, url);
      host.dispatchEvent(new Event('input', { bubbles: true }));
      schedule();
    });
    group.append(linkBtn);
    buttons.push(linkBtn);

    bar.append(group);
    portal(bar);
    return bar;
  }

  function refreshActive() {
    buttons.forEach((btn) => {
      if (!btn.dataset.cmd) return;
      let on = false;
      try {
        on = document.queryCommandState(btn.dataset.cmd);
      } catch {
        on = false;
      }
      btn.classList.toggle('is-active', on);
    });
  }

  function positionDesktop(el) {
    const sel = selectionInHost(host);
    if (!sel) return;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const box = (rect.width || rect.height)
      ? rect
      : range.getClientRects()[0];
    if (!box) return;

    const pad = 8;
    // Measure off-screen without toggling visibility (avoids selection flicker).
    el.hidden = false;
    el.style.visibility = 'hidden';
    el.style.top = '-9999px';
    el.style.left = '-9999px';
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // Prefer above the selection; fall back below. Horizontal center on range.
    let left = box.left + box.width / 2 - w / 2;
    let top = box.top - h - 8;
    if (top < pad) top = box.bottom + 8;
    if (left < pad) left = pad;
    if (left + w > window.innerWidth - pad) left = window.innerWidth - w - pad;
    if (top + h > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - h - pad);
    el.style.top = `${Math.round(top)}px`;
    el.style.left = `${Math.round(left)}px`;
    el.style.visibility = 'visible';
  }

  function show() {
    if (pointerDown) return;
    if (isReadOnly() || host.classList.contains('is-readonly')) {
      hide();
      return;
    }
    if (!selectionInHost(host)) {
      hide();
      return;
    }
    const el = ensure();
    const mobile = mobileMq.matches;
    el.classList.toggle('is-mobile', mobile);
    el.hidden = false;
    el.classList.add('is-visible');
    visible = true;
    refreshActive();
    if (mobile) {
      el.style.top = '';
      el.style.left = '';
      el.style.visibility = 'visible';
    } else {
      positionDesktop(el);
    }
  }

  let timer = 0;
  function schedule() {
    clearTimeout(timer);
    // Wait until after pointerup so the bar never appears under an active drag.
    if (pointerDown) return;
    timer = setTimeout(show, 80);
  }

  const onSelChange = () => {
    if (pointerDown) {
      hide();
      return;
    }
    schedule();
  };
  const onPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    if (bar && bar.contains(e.target)) return;
    pointerDown = true;
    clearTimeout(timer);
    hide();
  };
  const onPointerUp = () => {
    if (!pointerDown) return;
    pointerDown = false;
    schedule();
  };
  const onKeyUp = (e) => {
    // Shift+arrows create a selection without pointerup.
    if (e.key === 'Shift' || e.key.startsWith('Arrow')) schedule();
  };
  const onScroll = () => {
    if (!visible || pointerDown) return;
    if (mobileMq.matches) return;
    const el = ensure();
    positionDesktop(el);
  };
  const onResize = () => {
    if (visible && !pointerDown) show();
  };
  document.addEventListener('selectionchange', onSelChange);
  // Capture on window: drag often ends outside the editor host.
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onPointerUp, true);
  host.addEventListener('keyup', onKeyUp);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize);
  mobileMq.addEventListener?.('change', onResize);

  return {
    hide,
    refresh: show,
    destroy() {
      clearTimeout(timer);
      hide();
      document.removeEventListener('selectionchange', onSelChange);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('pointercancel', onPointerUp, true);
      host.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      mobileMq.removeEventListener?.('change', onResize);
      bar?.remove();
      bar = null;
      buttons = [];
    },
  };
}
