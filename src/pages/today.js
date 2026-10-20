import { portal } from 'mgl-common-ui';
import { ensureDaily, listDocuments } from '../services/notes.js';
import { exportDocument, shareDocument } from '../services/export.js';
import { firstSync } from '../sync/sync.js';
import { on } from '../events.js';
import { navigate } from '../router.js';
import { t } from '../i18n.js';
import { dailyTemplateLines } from '../prefs.js';
import { addDays, dateTitle, h, parseDateTitle } from '../util.js';
import { createBacklinksPanel } from '../ui/backlinks.js';
import { toast } from '../ui/toast.js';
import { mountNoteView } from './note-view.js';

const FIRST_SYNC_WAIT_MS = 4000;

async function openCalendarPicker(initialDate, onPick) {
  const dailyDocs = await listDocuments({ type: 'daily' });
  const existingDates = new Set(dailyDocs.map((d) => d.title));

  let viewYear = initialDate.getFullYear();
  let viewMonth = initialDate.getMonth(); // 0-11
  const selectedKey = dateTitle(initialDate);
  const todayKey = dateTitle(new Date());

  const grid = h('div', { class: 'cal-picker__grid' });
  const monthLabel = h('span', { class: 'cal-picker__title' });

  const close = () => {
    window.removeEventListener('keydown', onKey, true);
    backdrop.remove();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  function renderMonth() {
    monthLabel.textContent = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells = [];

    for (let i = 0; i < firstDay; i++) {
      cells.push(h('span', { class: 'cal-picker__cell is-pad' }));
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(viewYear, viewMonth, d);
      const key = dateTitle(dt);
      const hasNote = existingDates.has(key);
      const isSelected = key === selectedKey;
      const isTodayCell = key === todayKey;

      cells.push(h('button', {
        type: 'button',
        class: `cal-picker__cell${isSelected ? ' is-selected' : ''}${isTodayCell ? ' is-today' : ''}${hasNote ? ' has-note' : ''}`,
        onclick: () => {
          close();
          onPick(dt);
        },
      }, String(d)));
    }
    grid.replaceChildren(...cells);
  }

  const head = h('div', { class: 'cal-picker__head' },
    h('button', {
      type: 'button',
      class: 'btn btn--ghost cal-picker__nav',
      onclick: () => {
        viewMonth -= 1;
        if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
        renderMonth();
      },
    }, '‹'),
    monthLabel,
    h('button', {
      type: 'button',
      class: 'btn btn--ghost cal-picker__nav',
      onclick: () => {
        viewMonth += 1;
        if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
        renderMonth();
      },
    }, '›'));

  const panel = h('div', {
    class: 'cal-picker',
    role: 'dialog',
    onclick: (e) => e.stopPropagation(),
  }, head, grid);

  const backdrop = h('div', {
    class: 'cmd-palette-backdrop',
    onclick: close,
  }, panel);

  renderMonth();
  window.addEventListener('keydown', onKey, true);
  portal(backdrop);
}

/** Daily note for a date (default today); type "daily", title YYYY-MM-DD, not renamable. */
export async function mountToday(container, { params = [], query = {} } = {}) {
  const date = parseDateTitle(params[0]) || new Date();
  const title = dateTitle(date);
  const isToday = title === dateTitle();

  // Pull first so the daily note another device already created is reused.
  await Promise.race([firstSync(), new Promise((r) => setTimeout(r, FIRST_SYNC_WAIT_MS))]);
  const doc = await ensureDaily(title, { paragraphs: dailyTemplateLines() });

  const go = (d) => navigate(`/today/${dateTitle(d)}`);
  let view = null;
  const readBtn = h('button', {
    type: 'button',
    class: 'btn btn--ghost note-read-btn',
    title: t('readingMode'),
    onclick: () => {
      if (!view) return;
      const next = !view.isReading();
      view.setReading(next);
      readBtn.textContent = next ? t('exitReading') : t('readingMode');
      readBtn.title = readBtn.textContent;
    },
  }, t('readingMode'));

  const more = h('details', { class: 'note-more' },
    h('summary', { class: 'btn btn--ghost', title: t('more') }, '⋯'),
    h('div', { class: 'note-more__menu', dataset: { mnScrollX: '' } },
      h('button', {
        type: 'button',
        class: 'note-more__item',
        onclick: async () => {
          await exportDocument(doc.id, 'text');
          toast(t('exportDone'));
        },
      }, t('exportText')),
      h('button', {
        type: 'button',
        class: 'note-more__item',
        onclick: async () => {
          try {
            const shared = await shareDocument(doc.id);
            if (!shared) toast(t('exportDone'));
          } catch (e) {
            if (e?.name !== 'AbortError') toast(t('shareFailed'), { kind: 'error' });
          }
        },
      }, t('share'))));

  const head = [
    h('h1', { class: 'page-head__title' }, isToday ? t('today') : t('daily')),
    h('button', {
      type: 'button',
      class: 'btn btn--ghost note-date mn-upright',
      onclick: () => void openCalendarPicker(date, go),
    }, title),
    h('div', { class: 'page-head__group' },
      h('button', { type: 'button', class: 'btn btn--ghost', title: t('prevDay'), onclick: () => go(addDays(date, -1)) },
        h('span', { class: 'btn__icon' }, '←'), t('prevDay')),
      isToday ? null : h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => navigate('/today') }, t('backToToday')),
      h('button', { type: 'button', class: 'btn btn--ghost', title: t('nextDay'), onclick: () => go(addDays(date, 1)) },
        h('span', { class: 'btn__icon' }, '→'), t('nextDay'))),
    h('div', { class: 'note-view__spacer' }),
    h('div', { class: 'note-view__actions' }, readBtn, more),
  ];

  view = mountNoteView(container, { head, documentId: doc.id, focusBlockId: query.block || null });
  const backlinks = createBacklinksPanel(title, { excludeDocumentId: doc.id });
  container.querySelector('.note-view')?.append(backlinks.root);
  const offLinks = on('blocks-changed', () => { void backlinks.refresh(); });
  return {
    async destroy() {
      offLinks();
      backlinks.destroy?.();
      await view.destroy();
    },
  };
}
