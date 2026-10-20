/**
 * Command palette (⌘/Ctrl+K). Same command list drives desktop shortcuts
 * and the mobile-friendly searchable sheet. Typing also searches documents.
 */
import { portal } from 'mgl-common-ui';
import { h } from '../util.js';
import { t } from '../i18n.js';
import { navigate } from '../router.js';
import { syncNow } from '../sync/sync.js';
import { attachFieldIme, toggleImeMode } from '../ime/index.js';
import { createDocument, listDocuments } from '../services/notes.js';
import { pickAndImportDocument } from '../services/export.js';
import { searchNotes } from '../search/index.js';
import { canInstall, promptInstall } from '../pwa.js';
import { toast } from './toast.js';

let open = false;
let host = null;
/** @type {{ destroy: () => void, ime?: import('mgl-web-ime').MglIME } | null} */
let fieldIme = null;

function openDoc(doc) {
  if (doc.type === 'daily' && doc.title) {
    navigate(`/today/${encodeURIComponent(doc.title)}`);
  } else {
    navigate(`/doc/${doc.id}`);
  }
}

function commands() {
  const list = [
    { id: 'today', label: t('today'), run: () => navigate('/today') },
    { id: 'documents', label: t('documents'), run: () => navigate('/documents') },
    { id: 'tasks', label: t('tasks'), run: () => navigate('/tasks') },
    { id: 'tags', label: t('tags'), run: () => navigate('/tags') },
    { id: 'search', label: t('search'), run: () => navigate('/search') },
    { id: 'trash', label: t('trash'), run: () => navigate('/trash') },
    { id: 'settings', label: t('settings'), run: () => navigate('/settings') },
    {
      id: 'new',
      label: t('newDocument'),
      run: async () => {
        const doc = await createDocument({ title: '', type: 'normal' });
        navigate(`/doc/${doc.id}`);
      },
    },
    {
      id: 'import',
      label: t('import'),
      run: async () => {
        try {
          const doc = await pickAndImportDocument();
          if (!doc) return;
          toast(t('importDone'));
          navigate(`/doc/${doc.id}`);
        } catch {
          toast(t('importFailed'), { kind: 'error' });
        }
      },
    },
    { id: 'sync', label: t('sync'), run: () => syncNow() },
    { id: 'ime', label: t('imeToggle'), run: () => toggleImeMode() },
  ];
  if (canInstall()) {
    list.push({ id: 'install', label: t('installApp'), run: () => promptInstall() });
  }
  return list;
}

function closePalette() {
  open = false;
  fieldIme?.destroy?.();
  fieldIme = null;
  host?.remove();
  host = null;
}

function imeBusy() {
  const s = fieldIme?.ime?.getState?.();
  if (!s) return false;
  return Boolean(s.composition || (s.candidates?.length ?? 0) > 0);
}

function docItem(doc, { hint = '' } = {}) {
  const title = doc.title || t('untitled');
  return {
    id: `doc:${doc.id}`,
    label: title,
    hint,
    kind: 'doc',
    run: () => openDoc(doc),
  };
}

export function openCommandPalette() {
  if (open) {
    closePalette();
    return;
  }
  open = true;
  const staticCmds = commands();
  let filtered = staticCmds;
  let active = 0;
  let seq = 0;

  const input = h('input', {
    class: 'cmd-palette__input',
    type: 'text',
    placeholder: t('commandPlaceholder'),
    autocomplete: 'off',
    spellcheck: 'false',
    lang: 'mn-Mong',
  });
  const listEl = h('div', { class: 'cmd-palette__list', role: 'listbox' });
  const panel = h('div', { class: 'cmd-palette', role: 'dialog', 'aria-label': t('commands') },
    input, listEl);
  panel.addEventListener('click', (e) => e.stopPropagation());
  const backdrop = h('div', { class: 'cmd-palette-backdrop', onclick: closePalette }, panel);
  host = backdrop;
  portal(backdrop);
  fieldIme = attachFieldIme(input, { keepSelector: '.cmd-palette' });
  input.focus();

  const render = () => {
    listEl.replaceChildren(...filtered.map((cmd, i) => {
      const label = h('span', { class: 'cmd-palette__label' }, cmd.label);
      const hint = cmd.hint
        ? h('span', { class: 'cmd-palette__hint' }, cmd.hint)
        : null;
      const el = h('button', {
        type: 'button',
        class: `cmd-palette__item${i === active ? ' is-active' : ''}${cmd.kind === 'doc' ? ' cmd-palette__item--doc' : ''}`,
        role: 'option',
        'aria-selected': i === active ? 'true' : 'false',
        onclick: () => { void run(cmd); },
      }, label, hint);
      return el;
    }));
    listEl.querySelector('.cmd-palette__item.is-active')?.scrollIntoView?.({
      inline: 'nearest',
      block: 'nearest',
      behavior: 'smooth',
    });
  };

  const run = async (cmd) => {
    closePalette();
    await cmd.run();
  };

  const refresh = async () => {
    const q = input.value.trim();
    const token = ++seq;
    const qLow = q.toLowerCase();
    const cmds = q
      ? staticCmds.filter((c) => c.label.toLowerCase().includes(qLow) || c.id.includes(qLow))
      : staticCmds;

    let docs = [];
    if (q) {
      const hits = await searchNotes(q);
      if (token !== seq || !open) return;
      docs = hits.slice(0, 8).map((hit) => docItem(hit, { hint: hit.snippet || t('openDocument') }));
    } else {
      const recent = await listDocuments();
      if (token !== seq || !open) return;
      docs = recent.slice(0, 6).map((d) => docItem(d, { hint: t('recentDocuments') }));
    }

    filtered = [...docs, ...cmds];
    active = 0;
    render();
  };

  input.addEventListener('input', () => { void refresh(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closePalette();
      return;
    }
    // Let the IME own navigation / commit while composing.
    if (imeBusy()) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      active = Math.min(filtered.length - 1, active + 1);
      render();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(0, active - 1);
      render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[active]) void run(filtered[active]);
    }
  });

  void refresh();
}

export function installCommandShortcuts() {
  window.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandPalette();
      return;
    }
    if (mod && e.key.toLowerCase() === 'n' && !e.shiftKey) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
      e.preventDefault();
      void createDocument({ title: '', type: 'normal' }).then((doc) => navigate(`/doc/${doc.id}`));
    }
  });
}
