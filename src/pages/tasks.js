/**
 * Aggregated Tasks page (#/tasks) with status filter (open / done / all)
 * and Mongolian-aware keyword search over task text & document title.
 */
import { listAllTasks, toggleTaskChecked } from '../services/notes.js';
import { attachFieldIme } from '../ime/index.js';
import { appendHighlighted, fold } from '../search/text.js';
import { on } from '../events.js';
import { t } from '../i18n.js';
import { debounce, h } from '../util.js';

const STATUS_FILTERS = [
  { id: 'open', label: () => t('tasksOpen') },
  { id: 'done', label: () => t('tasksDone') },
  { id: 'all', label: () => t('all') },
];

export function mountTasks(container, { query = {} } = {}) {
  let statusFilter = ['open', 'done', 'all'].includes(query.status) ? query.status : 'open';
  const list = h('div', { class: 'doc-list task-list' });

  const filterInput = h('input', {
    class: 'mn-input search-input',
    type: 'text',
    placeholder: t('searchPlaceholder'),
    'aria-label': t('search'),
    spellcheck: 'false',
    lang: 'mn-Mong',
    autocomplete: 'off',
  });

  const filterChips = new Map();
  const filtersGroup = h('div', { class: 'page-head__group' },
    STATUS_FILTERS.map((f) => {
      const btn = h('button', {
        type: 'button',
        class: `chip${f.id === statusFilter ? ' is-active' : ''}`,
        onclick: () => {
          statusFilter = f.id;
          filterChips.forEach((el, id) => el.classList.toggle('is-active', id === statusFilter));
          renderFiltered();
        },
      }, f.label());
      filterChips.set(f.id, btn);
      return btn;
    }));

  const head = h('header', { class: 'note-view__head', dataset: { mnScrollY: '' } },
    h('h1', { class: 'page-head__title' }, t('tasks')),
    filterInput,
    filtersGroup);

  const body = h('section', { class: 'page mn-surface note-view__body' },
    h('div', { class: 'page-inner mn-columns' }, list));
  container.replaceChildren(h('div', { class: 'note-view' }, head, body));

  const ime = attachFieldIme(filterInput);
  let alive = true;
  let seq = 0;
  let allTasks = [];

  function taskCard(task, rawQuery) {
    const isDaily = task.docType === 'daily';
    const docTitle = task.docTitle || t('untitled');
    const blockQ = `?block=${encodeURIComponent(task.id)}`;
    const href = isDaily
      ? `#/today/${encodeURIComponent(task.docTitle)}${blockQ}`
      : `#/doc/${task.documentId}${blockQ}`;

    const textEl = h('span', {
      class: `doc-card__title task-card__text${task.checked ? ' is-checked' : ''}${task.text ? '' : ' is-untitled'}`,
    });
    const displayText = task.text || t('empty');
    if (rawQuery && task.text) appendHighlighted(textEl, displayText, rawQuery);
    else textEl.textContent = displayText;

    const sourceEl = h('span', { class: 'search-card__snippet task-card__source' });
    if (rawQuery && task.docTitle) appendHighlighted(sourceEl, docTitle, rawQuery);
    else sourceEl.textContent = docTitle;

    const checkBtn = h('button', {
      type: 'button',
      class: `doc-card__check task-card__check${task.checked ? ' is-on' : ''}`,
      'aria-label': task.checked ? t('tasksDone') : t('tasksOpen'),
      onclick: async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await toggleTaskChecked(task.id, !task.checked);
      },
    }, task.checked ? '✓' : '');

    return h('article', {
      class: `doc-card search-card task-card${isDaily ? ' doc-card--daily' : ''}`,
    },
      checkBtn,
      h('a', { class: 'doc-card__open search-card__open', href },
        textEl,
        sourceEl));
  }

  function renderFiltered() {
    if (!alive) return;
    const rawQuery = filterInput.value.trim();
    const qNorm = fold(rawQuery);

    const matched = allTasks.filter((task) => {
      if (statusFilter === 'open' && task.checked) return false;
      if (statusFilter === 'done' && !task.checked) return false;
      if (!qNorm) return true;
      return fold(task.text).includes(qNorm) || fold(task.docTitle).includes(qNorm);
    });

    if (!matched.length) {
      list.replaceChildren(h('p', { class: 'doc-list__empty' },
        qNorm ? t('noResults') : t('empty')));
      return;
    }

    list.replaceChildren(...matched.map((task) => taskCard(task, rawQuery)));
  }

  async function loadAndRender() {
    const token = ++seq;
    const rows = await listAllTasks();
    if (!alive || token !== seq) return;
    allTasks = rows;
    renderFiltered();
  }

  const onFilterInput = debounce(renderFiltered, 120);
  filterInput.addEventListener('input', onFilterInput);

  const offDocs = on('documents-changed', () => { void loadAndRender(); });
  const offBlocks = on('blocks-changed', () => { void loadAndRender(); });
  const offLocal = on('local-change', () => { void loadAndRender(); });
  void loadAndRender();

  return {
    destroy() {
      alive = false;
      onFilterInput.cancel();
      ime.destroy();
      offDocs();
      offBlocks();
      offLocal();
    },
  };
}
