/**
 * Flashcard block plugin — stores front in row.text (or data.front),
 * back & SM-2 scheduling state (due, interval, ease, reps) in data_json.data.
 */
import { t } from '../i18n.js';

const CSS = `
.mgl-editor-scope .mgl-flashcard {
  writing-mode: vertical-lr;
  -webkit-writing-mode: vertical-lr;
  text-orientation: mixed;
  display: inline-flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.75rem 0.6rem;
  margin: 0 0.4rem;
  border: 1px solid color-mix(in srgb, var(--mn-accent, #2f7d5f) 38%, var(--mn-line, #ddd));
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--mn-surface, #fff) 92%, rgba(47, 125, 95, 0.05));
  font-family: var(--app-font-mongol);
  min-inline-size: 24rem;
  max-block-size: 100%;
  box-sizing: border-box;
}
.mgl-editor-scope .mgl-flashcard__col {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 0.35rem;
  min-inline-size: 11rem;
  min-block-size: 3rem;
}
.mgl-editor-scope .mgl-flashcard__badge {
  writing-mode: horizontal-tb;
  flex: 0 0 auto;
  align-self: flex-start;
  padding: 0.15rem 0.35rem;
  border-radius: 0.35rem;
  background: var(--app-accent-soft);
  color: var(--app-accent);
  font: 700 11px/1.2 var(--app-font-ui);
  user-select: none;
}
.mgl-editor-scope .mgl-flashcard__col--back .mgl-flashcard__badge {
  background: var(--app-gold-soft);
  color: var(--app-accent-2);
}
.mgl-editor-scope .mgl-flashcard__field {
  flex: 1 1 auto;
  min-inline-size: 10rem;
  min-block-size: 2.75rem;
  padding: 0.35rem 0.25rem;
  outline: none;
  border-radius: 0.35rem;
  line-height: 1.75;
}
.mgl-editor-scope .mgl-flashcard__field:focus {
  background: color-mix(in srgb, var(--app-gold-soft) 45%, transparent);
}
.mgl-editor-scope .mgl-flashcard__field:empty::before {
  content: attr(data-placeholder);
  color: var(--app-muted);
  opacity: 0.65;
}
.mgl-editor-scope .mgl-flashcard__sep {
  inline-size: 100%;
  block-size: 1px;
  background: var(--app-line);
}
`;

export function createFlashcardPlugin() {
  return {
    type: 'flashcard',
    label: '🗂',
    atomic: true,
    css: CSS,
    defaultData() {
      return { front: '', back: '', reps: 0, interval: 0, ease: 2.5, due: null };
    },
    build({ data, text }) {
      const frontText = data?.front ?? text ?? '';
      const backText = data?.back ?? '';

      const card = document.createElement('div');
      card.className = 'mgl-flashcard';
      if (data?.due) card.dataset.due = String(data.due);
      if (data?.interval != null) card.dataset.interval = String(data.interval);
      if (data?.ease != null) card.dataset.ease = String(data.ease);
      if (data?.reps != null) card.dataset.reps = String(data.reps);

      const makeCol = (badgeText, value, placeholder, cls, isBack = false) => {
        const col = document.createElement('div');
        col.className = `mgl-flashcard__col${isBack ? ' mgl-flashcard__col--back' : ''}`;

        const badge = document.createElement('span');
        badge.className = 'mgl-flashcard__badge';
        badge.textContent = badgeText;

        const field = document.createElement('div');
        field.className = `mgl-flashcard__field mgl-cell ${cls}`;
        field.contentEditable = 'true';
        field.spellcheck = false;
        field.dataset.placeholder = placeholder;
        field.textContent = value;

        col.append(badge, field);
        return col;
      };

      const sep = document.createElement('div');
      sep.className = 'mgl-flashcard__sep';

      card.append(
        makeCol('Q', frontText, t('fcFrontPlaceholder'), 'fc-front', false),
        sep,
        makeCol('A', backText, t('fcBackPlaceholder'), 'fc-back', true),
      );
      return card;
    },
    read(wrapper) {
      const card = wrapper.querySelector('.mgl-flashcard');
      const front = (card?.querySelector('.fc-front')?.textContent || '').replace(/\u200b/g, '').trim();
      const back = (card?.querySelector('.fc-back')?.textContent || '').replace(/\u200b/g, '').trim();
      const data = { front, back };
      if (card?.dataset.due) data.due = card.dataset.due;
      if (card?.dataset.interval != null) data.interval = Number(card.dataset.interval) || 0;
      if (card?.dataset.ease != null) data.ease = Number(card.dataset.ease) || 2.5;
      if (card?.dataset.reps != null) data.reps = Number(card.dataset.reps) || 0;
      return {
        html: '',
        text: front,
        data,
      };
    },
  };
}
