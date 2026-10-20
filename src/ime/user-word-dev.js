/**
 * Dev-only page body: submit words to IME POST /api/user_words (user overlay files).
 */
import { addUserWord, parseNextWordsField } from '../api/ime.js';
import { imeBaseUrl } from '../config.js';
import { toast } from '../ui/toast.js';
import { h } from '../util.js';
import { attachFieldIme, commitPending, preferVirtualIme, suppressSystemKeyboard } from './index.js';

/**
 * @param {HTMLElement} container
 * @returns {{ destroy: () => void } | null}
 */
export function mountImeUserWordDev(container) {
  if (!import.meta.env.DEV) return null;

  const wordInput = h('input', {
    class: 'mn-input settings__input ime-dev__word',
    type: 'text',
    spellcheck: 'false',
    lang: 'mn-Mong',
    placeholder: 'word',
  });

  const nextInput = h('textarea', {
    class: 'mn-input settings__textarea ime-dev__next',
    rows: '6',
    spellcheck: 'false',
    lang: 'mn-Mong',
    placeholder: 'nextWords (comma or newline)',
  });

  const virtual = preferVirtualIme();
  const imeOpts = { keepSelector: '.ime-dev' };
  const wordIme = attachFieldIme(wordInput, imeOpts);
  const nextIme = attachFieldIme(nextInput, imeOpts);

  /** @type {(() => void) | null} */
  let blockOsKeyboard = null;
  if (virtual) {
    blockOsKeyboard = () => suppressSystemKeyboard(nextInput);
    blockOsKeyboard();
    nextInput.addEventListener('focusin', blockOsKeyboard);
    nextInput.addEventListener('pointerdown', blockOsKeyboard);
  }

  const submitBtn = h('button', {
    type: 'button',
    class: 'btn btn--primary',
    onclick: async () => {
      submitBtn.disabled = true;
      try {
        await commitPending(wordIme.ime);
        await commitPending(nextIme.ime);
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

  const panel = h('div', { class: 'settings ime-dev', 'data-ime-dev': '1' },
    h('div', { class: 'settings__row' },
      h('span', { class: 'settings__label' }, 'word'),
      h('div', { class: 'settings__control' }, wordInput)),
    h('div', { class: 'settings__row' },
      h('span', { class: 'settings__label' }, 'nextWords'),
      h('div', { class: 'settings__control' },
        nextInput,
        h('span', { class: 'settings__hint settings__hint--latin' }, 'Optional; prepended on server (max 64).'))),
    h('div', { class: 'settings__row' },
      h('span', { class: 'settings__label' }, 'server'),
      h('div', { class: 'settings__control' },
        h('span', { class: 'settings__hint settings__hint--latin' }, base),
        submitBtn)));

  const head = h('header', { class: 'note-view__head', dataset: { mnScrollY: '' } },
    h('h1', { class: 'page-head__title settings__hint--latin' }, '[DEV] IME user_words'));

  const body = h('section', { class: 'page mn-surface note-view__body' },
    h('div', { class: 'page-inner mn-columns' }, panel));

  container.replaceChildren(h('div', { class: 'note-view' }, head, body));

  const offNext = () => {
    if (!blockOsKeyboard) return;
    nextInput.removeEventListener('focusin', blockOsKeyboard);
    nextInput.removeEventListener('pointerdown', blockOsKeyboard);
  };

  return {
    destroy() {
      offNext();
      wordIme.destroy();
      nextIme.destroy();
    },
  };
}
