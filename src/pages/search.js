import { attachFieldIme } from '../ime/index.js';
import { searchNotes } from '../search/index.js';
import { appendHighlighted } from '../search/text.js';
import { t } from '../i18n.js';
import { debounce, h } from '../util.js';

function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function resultCard(hit, query) {
  const isDaily = hit.type === 'daily';
  const title = hit.title || t('untitled');
  const href = isDaily
    ? `#/today/${encodeURIComponent(hit.title)}`
    : `#/doc/${hit.id}`;

  const titleEl = h('span', { class: `doc-card__title${hit.title ? '' : ' is-untitled'}` });
  if (hit.title) appendHighlighted(titleEl, title, query);
  else titleEl.textContent = title;

  let snippetEl = null;
  if (hit.snippet) {
    snippetEl = h('span', { class: 'search-card__snippet' });
    appendHighlighted(snippetEl, hit.snippet, query);
  }

  return h('article', { class: `doc-card search-card${isDaily ? ' doc-card--daily' : ''}` },
    h('a', { class: 'doc-card__open search-card__open', href },
      titleEl,
      snippetEl,
      h('span', { class: 'doc-card__meta mn-upright' }, shortDate(hit.edited_at || hit.updated_at))));
}

/** Full-text search. An empty query does not run a search. */
export function mountSearch(container) {
  const list = h('div', { class: 'doc-list search-list' });
  const input = h('input', {
    class: 'mn-input search-input',
    type: 'text',
    placeholder: t('searchPlaceholder'),
    'aria-label': t('search'),
    spellcheck: 'false',
    lang: 'mn-Mong',
    autocomplete: 'off',
  });

  const head = h('header', { class: 'note-view__head' },
    h('h1', { class: 'page-head__title' }, t('search')),
    input);

  const body = h('section', { class: 'page mn-surface note-view__body' },
    h('div', { class: 'page-inner mn-columns' }, list));
  container.replaceChildren(h('div', { class: 'note-view' }, head, body));

  const ime = attachFieldIme(input);
  let alive = true;
  let seq = 0;

  const run = debounce(async () => {
    const q = input.value.trim();
    const token = ++seq;
    if (!q) {
      list.replaceChildren();
      return;
    }
    const hits = await searchNotes(q);
    if (!alive || token !== seq) return;
    if (!hits.length) {
      list.replaceChildren(h('p', { class: 'doc-list__empty' }, t('noResults')));
      return;
    }
    list.replaceChildren(...hits.map((hit) => resultCard(hit, q)));
  }, 200);

  input.addEventListener('input', run);

  return {
    destroy() {
      alive = false;
      run.cancel();
      ime.destroy();
    },
  };
}
