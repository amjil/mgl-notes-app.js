import { listTagsWithCounts, notesForTag } from '../services/links.js';
import { on } from '../events.js';
import { t } from '../i18n.js';
import { mentionContext } from '../util/mention-context.js';
import { h } from '../util.js';

const DATE_TITLE = /^\d{4}-\d{2}-\d{2}$/;
const SNIP_RADIUS = 12;

function openHref(group) {
  if (group.type === 'daily' || DATE_TITLE.test(group.title)) {
    return `#/today/${encodeURIComponent(group.title)}`;
  }
  return `#/doc/${group.documentId}`;
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

function noteCard(tag, group) {
  const title = group.title || t('untitled');
  const mention = group.mentions[0];
  return h('article', {
    class: `doc-card search-card${group.type === 'daily' ? ' doc-card--daily' : ''}`,
  },
    h('a', { class: 'doc-card__open search-card__open', href: openHref(group) },
      h('span', { class: `doc-card__title${group.title ? '' : ' is-untitled'}` }, title),
      mention ? snippetEl(tag, mention) : null,
      group.mentions.length > 1
        ? h('span', { class: 'tag-card__more mn-upright' }, `+${group.mentions.length - 1}`)
        : null));
}

/** Browse all #tags, or notes under one selected tag. */
export function mountTags(container, { params = [] } = {}) {
  const selected = String(params[0] || '').trim();
  const list = h('div', { class: 'doc-list tag-list' });

  const title = selected
    ? h('h1', { class: 'page-head__title' }, `#${selected}`)
    : h('h1', { class: 'page-head__title' }, t('tags'));

  const back = selected
    ? h('a', { class: 'btn btn--ghost', href: '#/tags', title: t('tags') }, t('all'))
    : null;

  const head = h('header', { class: 'note-view__head' }, title, back);

  const body = h('section', { class: 'page mn-surface note-view__body' },
    h('div', { class: 'page-inner mn-columns' }, list));
  container.replaceChildren(h('div', { class: 'note-view' }, head, body));

  let alive = true;
  let seq = 0;

  async function render() {
    const token = ++seq;
    const tags = await listTagsWithCounts();
    if (!alive || token !== seq) return;

    if (!tags.length) {
      list.replaceChildren(h('p', { class: 'doc-list__empty' }, t('noTags')));
      return;
    }

    if (!selected) {
      list.replaceChildren(
        h('p', { class: 'doc-list__hint' }, t('tagsHint')),
        ...tags.map((row) => h('article', { class: 'doc-card tag-overview-card' },
          h('a', {
            class: 'doc-card__open',
            href: `#/tags/${encodeURIComponent(row.tag)}`,
          },
            h('span', { class: 'doc-card__title' }, `#${row.tag}`),
            h('span', { class: 'doc-card__meta mn-upright' }, String(row.count))))));
      return;
    }

    if (!tags.some((row) => row.tag === selected)) {
      list.replaceChildren(h('p', { class: 'doc-list__empty' }, t('noResults')));
      return;
    }

    const notes = await notesForTag(selected);
    if (!alive || token !== seq) return;
    if (!notes.length) {
      list.replaceChildren(h('p', { class: 'doc-list__empty' }, t('noResults')));
      return;
    }
    list.replaceChildren(...notes.map((g) => noteCard(selected, g)));
  }

  const offDocs = on('documents-changed', () => { void render(); });
  const offBlocks = on('blocks-changed', () => { void render(); });
  void render();

  return {
    destroy() {
      alive = false;
      offDocs();
      offBlocks();
    },
  };
}
