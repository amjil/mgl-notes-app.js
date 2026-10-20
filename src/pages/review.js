/**
 * Spaced Repetition Review page (#/review).
 * Keyboard shortcuts: Space = Reveal answer, 1 = Again, 2 = Hard, 3 = Good, 4 = Easy.
 */
import { listFlashcards, recordFlashcardReview, scheduleSm2 } from '../services/flashcards.js';
import { t } from '../i18n.js';
import { h } from '../util.js';

export function mountReview(container) {
  let queue = [];
  let index = 0;
  let revealed = false;
  let alive = true;

  const progressEl = h('span', { class: 'note-date mn-upright' }, '0 / 0');
  const stage = h('div', { class: 'review-stage' });

  const head = h('header', { class: 'note-view__head', dataset: { mnScrollY: '' } },
    h('h1', { class: 'page-head__title' }, t('review')),
    progressEl);

  const body = h('section', { class: 'page mn-surface note-view__body' },
    h('div', { class: 'page-inner mn-columns' }, stage));

  container.replaceChildren(h('div', { class: 'note-view' }, head, body));

  async function loadQueue() {
    queue = await listFlashcards({ dueOnly: true });
    index = 0;
    revealed = false;
    if (alive) render();
  }

  async function gradeCurrent(grade) {
    const card = queue[index];
    if (!card) return;
    await recordFlashcardReview(card.blockId, grade);
    if (grade === 0) {
      queue.push({ ...card, reps: 0, interval: 1 });
    }
    index += 1;
    revealed = false;
    render();
  }

  function render() {
    const total = queue.length;
    if (index >= total) {
      progressEl.textContent = `${total} / ${total}`;
      stage.replaceChildren(
        h('div', { class: 'review-done' },
          h('p', { class: 'doc-list__empty' }, t('reviewDone')),
          h('button', {
            type: 'button',
            class: 'btn btn--ghost',
            onclick: () => void loadAllCards(),
          }, t('reviewAll'))),
      );
      return;
    }

    progressEl.textContent = `${index + 1} / ${total}`;
    const card = queue[index];

    const sourceLink = h('a', {
      class: 'review-card__source',
      href: `#/doc/${card.documentId}`,
    }, card.docTitle || t('untitled'));

    const frontEl = h('div', { class: 'review-card__front' }, card.front || t('empty'));
    const backEl = revealed
      ? h('div', { class: 'review-card__back' }, card.back || t('empty'))
      : null;

    const actions = !revealed
      ? h('button', {
        type: 'button',
        class: 'btn btn--primary review-card__reveal',
        onclick: () => {
          revealed = true;
          render();
        },
      }, t('reviewShowAnswer'))
      : h('div', { class: 'review-card__grades' },
        ...[
          { grade: 0, label: t('gradeAgain'), cls: 'btn--danger' },
          { grade: 1, label: t('gradeHard'), cls: 'btn--ghost' },
          { grade: 2, label: t('gradeGood'), cls: 'btn--primary' },
          { grade: 3, label: t('gradeEasy'), cls: 'btn--ghost' },
        ].map(({ grade, label, cls }) => {
          const preview = scheduleSm2(card, grade);
          return h('button', {
            type: 'button',
            class: `btn ${cls} review-grade-btn`,
            onclick: () => void gradeCurrent(grade),
          },
            h('span', null, label),
            h('span', { class: 'review-grade-btn__days mn-upright' }, `${preview.interval}d`));
        }));

    stage.replaceChildren(
      h('article', { class: 'review-card' },
        sourceLink,
        frontEl,
        backEl,
        actions),
    );
  }

  async function loadAllCards() {
    queue = await listFlashcards({ dueOnly: false });
    index = 0;
    revealed = false;
    if (alive) render();
  }

  const onKey = (e) => {
    if (e.target.closest?.('input, textarea, [contenteditable="true"]')) return;
    if (index >= queue.length) return;
    if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      revealed = true;
      render();
    } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
      e.preventDefault();
      void gradeCurrent(Number(e.key) - 1);
    }
  };
  window.addEventListener('keydown', onKey);
  void loadQueue();

  return {
    destroy() {
      alive = false;
      window.removeEventListener('keydown', onKey);
    },
  };
}
