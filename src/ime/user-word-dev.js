/**
 * Dev-only panel: submit words to IME POST /api/user_words (user overlay files).
 */
import { addUserWord, parseNextWordsField } from '../api/ime.js';
import { imeBaseUrl } from '../config.js';
import { toast } from '../ui/toast.js';
import { h } from '../util.js';
import { attachFieldIme, commitPending } from './index.js';

/**
 * @param {(label: string, control: HTMLElement, hint?: string | null, tag?: string) => HTMLElement} row
 * @returns {{ row: HTMLElement, destroy: () => void } | null}
 */
export function createImeUserWordDevRow(row) {
  if (!import.meta.env.DEV) return null;

  const wordInput = h('input', {
    class: 'mn-input settings__input settings__dev-ime-word',
    type: 'text',
    spellcheck: 'false',
    lang: 'mn-Mong',
    placeholder: 'word',
  });

  const nextInput = h('textarea', {
    class: 'mn-input settings__textarea settings__dev-ime-next',
    rows: '4',
    spellcheck: 'false',
    lang: 'mn-Mong',
    placeholder: 'nextWords (comma or newline)',
  });

  const imes = [attachFieldIme(wordInput), attachFieldIme(nextInput)];

  const submitBtn = h('button', {
    type: 'button',
    class: 'btn btn--ghost',
    onclick: async () => {
      submitBtn.disabled = true;
      try {
        for (const handle of imes) await commitPending(handle.ime);
        await addUserWord({
          word: wordInput.value,
          nextWords: parseNextWordsField(nextInput.value),
        });
        toast('user_words: ok');
      } catch (e) {
        toast(e?.message || 'user_words failed', { kind: 'error' });
      } finally {
        submitBtn.disabled = false;
      }
    },
  }, 'POST /api/user_words');

  const base = imeBaseUrl() || '(off — local dictionary only)';

  const control = h('div', { class: 'settings__control settings__dev-ime' },
    wordInput,
    nextInput,
    submitBtn,
    h('span', { class: 'settings__hint settings__hint--latin' }, `[DEV] ${base}`));

  return {
    row: row('[DEV] IME user word', control, 'POST /api/user_words → user overlay', 'div'),
    destroy() {
      imes.forEach((handle) => handle.destroy());
    },
  };
}
