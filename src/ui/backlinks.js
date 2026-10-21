/**
 * Backlinks panel.
 * Desktop: collapsible sidebar; mobile (≤960px): right drawer above --app-ime-kb.
 */
import { portal } from 'mgl-common-ui';
import { backlinksForTitle } from '../services/links.js';
import { navigate } from '../router.js';
import { t } from '../i18n.js';
import { mentionContext } from '../util/mention-context.js';
import { h } from '../util.js';

const DATE_TITLE = /^\d{4}-\d{2}-\d{2}$/;
const MOBILE_MQ = '(max-width: 960px)';
const SNIP_RADIUS = 8;

function groupMentions(rows) {
  const map = new Map();
  rows.forEach((r) => {
    let g = map.get(r.documentId);
    if (!g) {
      g = {
        documentId: r.documentId,
        title: r.title || '',
        type: r.type || 'normal',
        mentions: [],
      };
      map.set(r.documentId, g);
    }
    g.mentions.push(r);
  });
  return [...map.values()].sort((a, b) => {
    const ta = a.title || '';
    const tb = b.title || '';
    return ta.localeCompare(tb) || a.documentId.localeCompare(b.documentId);
  });
}

function openDoc(group) {
  const first = group.mentions?.[0];
  const blockQ = first?.blockId ? `?block=${encodeURIComponent(first.blockId)}` : '';
  if (group.type === 'daily' || DATE_TITLE.test(group.title)) {
    navigate(`/today/${encodeURIComponent(group.title)}${blockQ}`);
  } else {
    navigate(`/doc/${group.documentId}${blockQ}`);
  }
}

function renderContext(target, mention) {
  const ctx = mentionContext(mention.text, target, mention.linkType, SNIP_RADIUS);
  const el = h('span', { class: 'backlinks__item-snip' });
  if (ctx.before) el.append(document.createTextNode(ctx.before));
  if (ctx.match) {
    el.append(h('span', {
      class: `backlinks__mark${mention.linkType === 'tag' ? ' backlinks__mark--tag' : ''}`,
    }, ctx.match));
  }
  if (ctx.after) el.append(document.createTextNode(ctx.after));
  if (!ctx.before && !ctx.match && !ctx.after) {
    el.textContent = t('empty');
  }
  const tip = `${ctx.before}${ctx.match}${ctx.after}`.trim();
  if (tip) el.title = tip;
  return el;
}

/**
 * @param {string} title
 * @param {{ excludeDocumentId?: string }} [opts]
 */
export function createBacklinksPanel(title, { excludeDocumentId = null } = {}) {
  const mobileMq = window.matchMedia(MOBILE_MQ);

  const countEl = h('span', { class: 'backlinks__count mn-upright', hidden: true }, '0');
  const list = h('div', { class: 'backlinks__list' });
  const body = h('div', { class: 'backlinks__body' }, list);

  const headBtn = h('button', {
    type: 'button',
    class: 'backlinks__head',
    title: t('backlinks'),
  },
    h('span', { class: 'backlinks__title' }, t('backlinks')),
    countEl);

  const sheetClose = h('button', {
    type: 'button',
    class: 'backlinks-sheet__close',
    title: t('cancel'),
    onclick: () => setOpen(false),
  }, '×');
  const sheetHead = h('div', { class: 'backlinks-sheet__head' },
    h('span', { class: 'backlinks-sheet__title' }, t('backlinks')),
    sheetClose);
  const sheet = h('div', {
    class: 'backlinks-sheet',
    role: 'dialog',
    'aria-label': t('backlinks'),
    'aria-hidden': 'true',
  }, sheetHead);
  const backdrop = h('div', {
    class: 'backlinks__backdrop',
    onclick: () => setOpen(false),
  });
  portal(backdrop);
  portal(sheet);

  // List/body first, head last → in vertical-lr column flex the head sits on the far right.
  const root = h('aside', { class: 'backlinks is-empty' }, body, headBtn);

  function isMobile() {
    return mobileMq.matches;
  }

  function placeBodyDesktop() {
    if (body.parentNode !== root) root.insertBefore(body, headBtn);
  }

  function placeBodySheet() {
    // Body first, sheet head last → vertical-lr column flex puts chrome on the far right.
    if (body.parentNode !== sheet) sheet.insertBefore(body, sheetHead);
  }

  function setOpen(open) {
    if (root.classList.contains('is-empty') && open) return;
    root.classList.toggle('is-open', open);
    if (isMobile()) {
      if (open) {
        placeBodySheet();
        // Force layout so the enter transition runs from off-screen.
        void sheet.offsetWidth;
        sheet.classList.add('is-open');
        backdrop.classList.add('is-open');
        sheet.setAttribute('aria-hidden', 'false');
      } else {
        sheet.classList.remove('is-open');
        backdrop.classList.remove('is-open');
        sheet.setAttribute('aria-hidden', 'true');
        // Keep body in the drawer until it finishes sliding out.
      }
      return;
    }
    placeBodyDesktop();
    sheet.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    sheet.setAttribute('aria-hidden', 'true');
  }

  headBtn.addEventListener('click', () => {
    if (root.classList.contains('is-empty')) return;
    setOpen(!root.classList.contains('is-open'));
  });

  const onKey = (e) => {
    if (e.key === 'Escape' && sheet.classList.contains('is-open')) setOpen(false);
  };
  window.addEventListener('keydown', onKey);

  const onMq = () => {
    // Re-home the body when crossing the desktop/mobile breakpoint.
    if (root.classList.contains('is-open') && !root.classList.contains('is-empty')) {
      setOpen(true);
    } else {
      setOpen(false);
    }
  };
  mobileMq.addEventListener?.('change', onMq);

  // Desktop starts open; narrow viewports start collapsed (drawer opens on demand).
  if (isMobile()) {
    setOpen(false);
  } else {
    root.classList.add('is-open');
  }

  async function refresh() {
    const clean = String(title || '').trim();
    if (!clean) {
      root.classList.add('is-empty');
      countEl.hidden = true;
      list.replaceChildren(h('p', { class: 'backlinks__empty' }, t('backlinksEmpty')));
      setOpen(false);
      return;
    }

    const rows = await backlinksForTitle(clean, { excludeDocumentId });
    const groups = groupMentions(rows);
    const backCount = rows.length;

    countEl.textContent = String(backCount);
    countEl.hidden = !backCount;
    root.classList.toggle('is-empty', !backCount);
    if (!backCount) {
      setOpen(false);
      list.replaceChildren(h('p', { class: 'backlinks__empty' }, t('backlinksEmpty')));
      return;
    }

    list.replaceChildren(...groups.map((g) => {
      const first = g.mentions[0];
      const more = g.mentions.length > 1
        ? h('span', { class: 'backlinks__more mn-upright' }, `+${g.mentions.length - 1}`)
        : null;
      const snip = renderContext(clean, first);
      const label = g.title || t('untitled');
      return h('button', {
        type: 'button',
        class: 'backlinks__item',
        title: snip.title ? `${label}\n${snip.title}` : label,
        onclick: () => openDoc(g),
      },
        h('span', { class: 'backlinks__item-head' },
          h('span', { class: `backlinks__item-title${g.title ? '' : ' is-untitled'}` },
            label),
          more),
        snip);
    }));
  }

  void refresh();
  return {
    root,
    setTitle(next) {
      title = next;
      void refresh();
    },
    refresh,
    destroy() {
      window.removeEventListener('keydown', onKey);
      mobileMq.removeEventListener?.('change', onMq);
      placeBodyDesktop();
      sheet.remove();
      backdrop.remove();
      root.classList.remove('is-open');
    },
  };
}
