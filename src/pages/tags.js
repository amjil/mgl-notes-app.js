import { listTagsWithCounts, notesForTag } from '../services/links.js';
import { attachFieldIme } from '../ime/index.js';
import { appendHighlighted, fold } from '../search/text.js';
import { on } from '../events.js';
import { t } from '../i18n.js';
import { mentionContext } from '../util/mention-context.js';
import { debounce, h } from '../util.js';

const DATE_TITLE = /^\d{4}-\d{2}-\d{2}$/;
const SNIP_RADIUS = 12;

function openHref(group) {
  const first = group.mentions?.[0];
  const blockQ = first?.blockId ? `?block=${encodeURIComponent(first.blockId)}` : '';
  if (group.type === 'daily' || DATE_TITLE.test(group.title)) {
    return `#/today/${encodeURIComponent(group.title)}${blockQ}`;
  }
  return `#/doc/${group.documentId}${blockQ}`;
}

function snippetEl(tag, mention) {
  const ctx = mentionContext(mention.text, tag, 'tag', SNIP_RADIUS);
  const el = h('span', { class: 'search-card__snippet tag-card__snippet' });
  if (ctx.before) el.append(document.createTextNode(ctx.before));
  if (ctx.match) {
    el.append(h('span', { class: 'backlinks__mark backlinks__mark--tag' }, ctx.match));
  }
  if (ctx.after) el.append(document.createTextNode(ctx.after));
  if (!ctx.before && !ctx.match && !ctx.after) el.textContent = t('empty');
  return el;
}

function noteCard(tag, group, filterQuery = '') {
  const title = group.title || t('untitled');
  const mention = group.mentions[0];
  const titleEl = h('span', { class: `doc-card__title${group.title ? '' : ' is-untitled'}` });
  if (filterQuery && group.title) appendHighlighted(titleEl, title, filterQuery);
  else titleEl.textContent = title;

  return h('article', {
    class: `doc-card search-card${group.type === 'daily' ? ' doc-card--daily' : ''}`,
  },
    h('a', { class: 'doc-card__open search-card__open', href: openHref(group) },
      titleEl,
      mention ? snippetEl(tag, mention) : null,
      group.mentions.length > 1
        ? h('span', { class: 'tag-card__more mn-upright' }, `+${group.mentions.length - 1}`)
        : null));
}

/** Browse all #tags, or notes under one selected tag, with live Mongolian-aware filtering. */
export function mountTags(container, { params = [] } = {}) {
  const selected = String(params[0] || '').trim();
  const list = h('div', { class: 'doc-list tag-list' });

  const title = selected
    ? h('h1', { class: 'page-head__title' }, `#${selected}`)
    : h('h1', { class: 'page-head__title' }, t('tags'));

  const back = selected
    ? h('a', { class: 'btn btn--ghost', href: '#/tags', title: t('tags') }, t('all'))
    : null;

  const filterInput = h('input', {
    class: 'mn-input search-input',
    type: 'text',
    placeholder: t('searchPlaceholder'),
    'aria-label': t('search'),
    spellcheck: 'false',
    lang: 'mn-Mong',
    autocomplete: 'off',
  });

  const head = h('header', { class: 'note-view__head', dataset: { mnScrollY: '' } }, title, back, filterInput);

  const body = h('section', { class: 'page mn-surface note-view__body' },
    h('div', { class: 'page-inner mn-columns' }, list));
  container.replaceChildren(h('div', { class: 'note-view' }, head, body));

  const ime = attachFieldIme(filterInput);
  let alive = true;
  let seq = 0;
  let cachedTags = [];
  let cachedNotes = [];

  function renderFiltered() {
    if (!alive) return;
    const rawQuery = filterInput.value.trim();
    const qNorm = fold(rawQuery);

    if (!cachedTags.length) {
      list.replaceChildren(h('p', { class: 'doc-list__empty' }, t('noTags')));
      return;
    }

    // 1. 标签总览视图：过滤标签名
    if (!selected) {
      const matched = qNorm
        ? cachedTags.filter((row) => fold(row.tag).includes(qNorm))
        : cachedTags;

      if (!matched.length) {
        list.replaceChildren(h('p', { class: 'doc-list__empty' }, t('noResults')));
        return;
      }

      list.replaceChildren(
        h('p', { class: 'doc-list__hint' }, t('tagsHint')),
        ...matched.map((row) => {
          const labelEl = h('span', { class: 'doc-card__title' }, '#');
          if (rawQuery) appendHighlighted(labelEl, row.tag, rawQuery);
          else labelEl.append(document.createTextNode(row.tag));

          return h('article', { class: 'doc-card tag-overview-card' },
            h('a', {
              class: 'doc-card__open',
              href: `#/tags/${encodeURIComponent(row.tag)}`,
            },
              labelEl,
              h('span', { class: 'doc-card__meta mn-upright' }, String(row.count))));
        }),
      );
      return;
    }

    // 2. 单标签下的笔记列表视图：按笔记标题或提及段落内容过滤
    const matchedNotes = qNorm
      ? cachedNotes.filter((g) => {
        if (fold(g.title || '').includes(qNorm)) return true;
        return g.mentions.some((m) => fold(m.text || '').includes(qNorm));
      })
      : cachedNotes;

    if (!matchedNotes.length) {
      list.replaceChildren(h('p', { class: 'doc-list__empty' }, t('noResults')));
      return;
    }
    list.replaceChildren(...matchedNotes.map((g) => noteCard(selected, g, rawQuery)));
  }

  async function loadAndRender() {
    const token = ++seq;
    const tags = await listTagsWithCounts();
    if (!alive || token !== seq) return;
    cachedTags = tags;

    if (selected && tags.some((row) => row.tag === selected)) {
      const notes = await notesForTag(selected);
      if (!alive || token !== seq) return;
      cachedNotes = notes;
    } else {
      cachedNotes = [];
    }
    renderFiltered();
  }

  const onFilterInput = debounce(renderFiltered, 120);
  filterInput.addEventListener('input', onFilterInput);

  const offDocs = on('documents-changed', () => { void loadAndRender(); });
  const offBlocks = on('blocks-changed', () => { void loadAndRender(); });
  void loadAndRender();

  return {
    destroy() {
      alive = false;
      onFilterInput.cancel();
      ime.destroy();
      offDocs();
      offBlocks();
    },
  };
}
