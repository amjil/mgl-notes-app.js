import {
  buildDocumentForest,
  createDocument,
  deleteDocument,
  listDocuments,
} from '../services/notes.js';
import { pickAndImportDocument } from '../services/export.js';
import { on } from '../events.js';
import { navigate } from '../router.js';
import { t } from '../i18n.js';
import { attachFieldIme } from '../ime/index.js';
import { searchNotes } from '../search/index.js';
import { appendHighlighted } from '../search/text.js';
import { confirmDialog } from '../ui/confirm.js';
import { toast } from '../ui/toast.js';
import { debounce, h } from '../util.js';

const FILTERS = [
  { id: '', label: () => t('all') },
  { id: 'normal', label: () => t('normal') },
  { id: 'daily', label: () => t('daily') },
];

function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function stripHashQueryParam(key) {
  const raw = location.hash.replace(/^#/, '') || '/today';
  const [pathPart, queryPart = ''] = raw.split('?');
  const params = new URLSearchParams(queryPart);
  if (!params.has(key)) return;
  params.delete(key);
  const qs = params.toString();
  const next = qs ? `${pathPart}?${qs}` : pathPart;
  history.replaceState(null, '', `#${next.startsWith('/') ? next : `/${next}`}`);
}

/** Documents list: forest by parent_id; columns run left → right. */
export function mountDocuments(container, { query = {}, name } = {}) {
  const type = query.type || '';
  const list = h('div', { class: 'doc-list doc-tree' });
  const selected = new Set();
  /** Document ids whose child lists are expanded (default: collapsed). */
  const expanded = new Set();
  let selecting = false;
  let docsCache = [];

  const filters = h('div', { class: 'page-head__group' }, FILTERS.map((f) => h('a', {
    class: `chip${f.id === type ? ' is-active' : ''}`,
    href: f.id ? `#/documents?type=${f.id}` : '#/documents',
  }, f.label())));

  const newBtn = h('button', {
    type: 'button',
    class: 'btn btn--primary',
    onclick: async () => {
      const doc = await createDocument({ title: '', type: 'normal' });
      navigate(`/doc/${doc.id}`);
    },
  }, `＋ ${t('newDocument')}`);

  const importBtn = h('button', {
    type: 'button',
    class: 'btn btn--ghost',
    title: t('import'),
    onclick: async () => {
      try {
        const doc = await pickAndImportDocument();
        if (!doc) return;
        toast(t('importDone'));
        navigate(`/doc/${doc.id}`);
      } catch {
        toast(t('importFailed'), { kind: 'error' });
      }
    },
  }, t('import'));

  const selectBtn = h('button', {
    type: 'button',
    class: 'btn btn--ghost',
    onclick: () => {
      selecting = !selecting;
      if (!selecting) selected.clear();
      selectBtn.classList.toggle('is-active', selecting);
      selectBtn.textContent = selecting ? t('clearSelection') : t('select');
      render();
    },
  }, t('select'));

  const batchBar = h('div', { class: 'batch-bar', hidden: true });

  const searchInput = h('input', {
    class: 'mn-input search-input page-head__search-input',
    type: 'text',
    value: query.q || '',
    placeholder: t('searchPlaceholder'),
    'aria-label': t('search'),
    spellcheck: 'false',
    lang: 'mn-Mong',
    autocomplete: 'off',
  });

  const searchCloseBtn = h('button', {
    type: 'button',
    class: 'btn btn--ghost page-head__search-close',
    title: t('cancel'),
    'aria-label': t('cancel'),
    onclick: () => closeSearchPanel(),
  }, '✕');

  const searchFloat = h('div', {
    class: 'page-head__search-float',
    hidden: true,
    role: 'search',
  }, searchInput, searchCloseBtn);

  let searchOpen = false;
  /** @type {HTMLButtonElement | null} */
  let searchToggleBtn = null;

  function syncSearchToggle() {
    if (!searchToggleBtn) return;
    searchToggleBtn.classList.toggle('is-active', searchOpen);
    searchToggleBtn.setAttribute('aria-expanded', searchOpen ? 'true' : 'false');
  }

  function openSearchPanel() {
    searchOpen = true;
    searchFloat.hidden = false;
    head.classList.add('is-search-open');
    syncSearchToggle();
    requestAnimationFrame(() => searchInput.focus());
  }

  function closeSearchPanel() {
    if (!searchOpen && !searchInput.value.trim()) return;
    searchOpen = false;
    searchFloat.hidden = true;
    head.classList.remove('is-search-open');
    syncSearchToggle();
    const hadQuery = searchInput.value.trim();
    searchInput.value = '';
    stripHashQueryParam('search');
    stripHashQueryParam('q');
    if (hadQuery) void render();
  }

  searchToggleBtn = h('button', {
    type: 'button',
    class: 'btn btn--ghost page-head__search-btn',
    title: t('search'),
    'aria-label': t('search'),
    'aria-expanded': 'false',
    onclick: () => {
      if (searchOpen) closeSearchPanel();
      else openSearchPanel();
    },
  }, '⌕');

  const titleBlock = h('div', { class: 'page-head__title-block' },
    h('h1', { class: 'page-head__title' }, t('documents')),
    searchFloat);

  const head = h('header', { class: 'note-view__head', dataset: { mnScrollY: '' } },
    titleBlock,
    searchToggleBtn,
    newBtn,
    importBtn,
    selectBtn,
    filters);

  const body = h('section', { class: 'page mn-surface note-view__body' },
    h('div', { class: 'page-inner mn-columns' }, list));
  container.replaceChildren(h('div', { class: 'note-view' }, head, body), batchBar);

  const ime = attachFieldIme(searchInput);
  let searchSeq = 0;

  function syncBatchBar() {
    const n = selected.size;
    batchBar.hidden = !selecting || n === 0;
    if (batchBar.hidden) {
      batchBar.replaceChildren();
      return;
    }
    batchBar.replaceChildren(
      h('span', { class: 'batch-bar__count' }, `${n}`),
      h('button', {
        type: 'button',
        class: 'btn btn--ghost batch-bar__btn',
        onclick: () => {
          docsCache.forEach((d) => selected.add(d.id));
          render();
        },
      }, t('selectAll')),
      h('button', {
        type: 'button',
        class: 'btn btn--danger batch-bar__btn',
        onclick: async () => {
          const ok = await confirmDialog({
            title: t('confirmDeleteTitle'),
            body: t('confirmDeleteBody'),
            confirmLabel: t('batchDelete'),
            danger: true,
          });
          if (!ok) return;
          for (const id of [...selected]) await deleteDocument(id);
          selected.clear();
          selecting = false;
          selectBtn.classList.remove('is-active');
          selectBtn.textContent = t('select');
          render();
        },
      }, t('batchDelete')),
    );
  }

  function toggleSelect(id) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
  }

  function renderSearchHit(hit, q) {
    const isDaily = hit.type === 'daily';
    const title = hit.title || t('untitled');
    const href = isDaily
      ? `#/today/${encodeURIComponent(hit.title)}`
      : `#/doc/${hit.id}`;

    const titleEl = h('span', { class: `doc-card__title${hit.title ? '' : ' is-untitled'}` });
    if (hit.title) appendHighlighted(titleEl, title, q);
    else titleEl.textContent = title;

    let snippetEl = null;
    if (hit.snippet) {
      snippetEl = h('span', { class: 'search-card__snippet' });
      appendHighlighted(snippetEl, hit.snippet, q);
    }

    return h('article', { class: `doc-card search-card${isDaily ? ' doc-card--daily' : ''}` },
      h('a', { class: 'doc-card__open search-card__open', href },
        titleEl,
        snippetEl,
        h('span', { class: 'doc-card__meta mn-upright' }, shortDate(hit.edited_at || hit.updated_at))));
  }

  function renderCard(doc, { toggle = null } = {}) {
    const isDaily = doc.type === 'daily';
    const title = doc.title || t('untitled');
    const isSelected = selected.has(doc.id);
    const openHref = isDaily ? `#/today/${encodeURIComponent(doc.title)}` : `#/doc/${doc.id}`;

    const open = selecting
      ? h('button', {
        type: 'button',
        class: 'doc-card__open',
        onclick: () => { toggleSelect(doc.id); render(); },
      },
        h('span', { class: `doc-card__check${isSelected ? ' is-on' : ''}`, 'aria-hidden': 'true' }, isSelected ? '✓' : ''),
        h('span', { class: `doc-card__title${doc.title ? '' : ' is-untitled'}` }, title),
        h('span', { class: 'doc-card__meta mn-upright' }, shortDate(doc.edited_at || doc.updated_at)))
      : h('a', { class: 'doc-card__open', href: openHref },
        h('span', { class: `doc-card__title${doc.title ? '' : ' is-untitled'}` }, title),
        h('span', { class: 'doc-card__meta mn-upright' }, shortDate(doc.edited_at || doc.updated_at)));

    const childBtn = (!selecting && !isDaily)
      ? h('button', {
        type: 'button',
        class: 'doc-card__child',
        title: t('newSubDocument'),
        'aria-label': t('newSubDocument'),
        onclick: async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const child = await createDocument({ title: '', type: 'normal', parentId: doc.id });
          navigate(`/doc/${child.id}`);
        },
      }, '＋')
      : null;

    return h('article', {
      class: `doc-card${isDaily ? ' doc-card--daily' : ''}${isSelected ? ' is-selected' : ''}`,
    },
      toggle,
      open,
      childBtn,
      selecting ? null : h('button', {
        type: 'button',
        class: 'doc-card__delete',
        title: t('delete'),
        'aria-label': t('delete'),
        onclick: async () => {
          const ok = await confirmDialog({
            title: t('confirmDeleteTitle'),
            body: t('confirmDeleteBody'),
            confirmLabel: t('delete'),
            danger: true,
          });
          if (ok) await deleteDocument(doc.id);
        },
      }, '✕'));
  }

  function renderNode(node) {
    const childCount = node.children?.length || 0;
    const isOpen = expanded.has(node.doc.id);
    const toggle = childCount
      ? h('button', {
        type: 'button',
        class: `doc-tree__toggle${isOpen ? '' : ' is-collapsed'}`,
        title: `${t('childDocuments')} (${childCount})`,
        'aria-expanded': isOpen ? 'true' : 'false',
        'aria-label': `${t('childDocuments')} (${childCount})`,
        onclick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (expanded.has(node.doc.id)) expanded.delete(node.doc.id);
          else expanded.add(node.doc.id);
          void render();
        },
      },
        h('span', { class: 'doc-tree__toggle-icon mn-upright', 'aria-hidden': 'true' }, isOpen ? '‹' : '›'),
        isOpen
          ? null
          : h('span', { class: 'doc-tree__toggle-count mn-upright' }, String(childCount)))
      : null;

    const kids = childCount && isOpen
      ? h('div', { class: 'doc-tree__children' }, ...node.children.map(renderNode))
      : null;

    return h('div', {
      class: `doc-tree__node${isOpen ? '' : ' is-collapsed'}`,
      dataset: { depth: String(node.depth) },
    }, renderCard(node.doc, { toggle }), kids);
  }

  async function render() {
    const q = searchInput.value.trim();
    const token = ++searchSeq;

    if (q) {
      batchBar.hidden = true;
      const hits = await searchNotes(q);
      if (token !== searchSeq) return;
      const filteredHits = type ? hits.filter((d) => (d.type || 'normal') === type) : hits;
      if (!filteredHits.length) {
        list.replaceChildren(h('p', { class: 'doc-list__empty' }, t('noResults')));
        return;
      }
      list.replaceChildren(...filteredHits.map((hit) => renderSearchHit(hit, q)));
      return;
    }

    docsCache = await listDocuments({ type: type || null });
    if (token !== searchSeq) return;
    syncBatchBar();
    if (!docsCache.length) {
      list.replaceChildren(h('p', { class: 'doc-list__empty' }, t('empty')));
      return;
    }
    const forest = buildDocumentForest(docsCache);
    list.replaceChildren(...forest.map(renderNode));
  }

  const onSearchInput = debounce(render, 180);
  searchInput.addEventListener('input', onSearchInput);

  const onKeyDown = (e) => {
    if (e.key === 'Escape' && searchOpen) {
      e.preventDefault();
      closeSearchPanel();
    }
  };
  document.addEventListener('keydown', onKeyDown);

  const off = on('documents-changed', render);

  if (query.search === '1' || query.q || name === 'search') openSearchPanel();
  render();

  return {
    destroy() {
      off();
      document.removeEventListener('keydown', onKeyDown);
      onSearchInput.cancel();
      ime.destroy();
    },
  };
}
