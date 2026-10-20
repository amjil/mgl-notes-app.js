import { enhanceSelect } from 'mgl-common-ui';
import { apiBase, setApiBase } from '../config.js';
import { locale, setLocale, t } from '../i18n.js';
import {
  dailyTemplate,
  fontScale,
  imeDefault,
  setDailyTemplate,
  setFontScale,
  setImeDefault,
  setTheme,
  theme,
} from '../prefs.js';
import { canInstall, onInstallAvailable, promptInstall } from '../pwa.js';
import { exportAllBackup, pickAndRestoreBackup } from '../services/export.js';
import { toast } from '../ui/toast.js';
import { h } from '../util.js';

export function mountSettings(container) {
  const selectApis = [];

  const serverInput = h('input', {
    class: 'mn-input mn-input-latin settings__input',
    type: 'url',
    value: apiBase(),
    spellcheck: 'false',
    autocomplete: 'off',
  });

  const fontSelect = h('select', { class: 'mn-select settings__select' },
    [0.9, 1, 1.1, 1.25].map((n) => h('option', {
      value: String(n),
      selected: Math.abs(fontScale() - n) < 0.01,
    }, `${Math.round(n * 100)}%`)));

  const imeSelect = h('select', { class: 'mn-select settings__select' },
    h('option', { value: 'mongol', selected: imeDefault() === 'mongol' }, 'MN'),
    h('option', { value: 'latin', selected: imeDefault() === 'latin' }, 'Latin'));

  const langSelect = h('select', { class: 'mn-select settings__select' },
    h('option', { value: 'mn', selected: locale() === 'mn' }, t('langMn')),
    h('option', { value: 'en', selected: locale() === 'en' }, t('langEn')));

  const themeSelect = h('select', { class: 'mn-select settings__select' },
    h('option', { value: 'auto', selected: theme() === 'auto' }, t('all')),
    h('option', { value: 'light', selected: theme() === 'light' }, '☀ Light'),
    h('option', { value: 'dark', selected: theme() === 'dark' }, '☾ Dark'));

  const templateInput = h('textarea', {
    class: 'mn-input settings__textarea',
    rows: '6',
    spellcheck: 'false',
    lang: 'mn-Mong',
    placeholder: t('dailyTemplateHint'),
  });
  templateInput.value = dailyTemplate();

  const installBtn = h('button', {
    type: 'button',
    class: 'btn btn--primary',
    disabled: !canInstall(),
    onclick: async () => {
      const ok = await promptInstall();
      if (ok) toast(t('installDone'));
    },
  }, t('installApp'));

  const offInstall = onInstallAvailable((available) => {
    installBtn.disabled = !available;
  });

  const backupBtn = h('button', {
    type: 'button',
    class: 'btn btn--ghost',
    onclick: async () => {
      try {
        backupBtn.disabled = true;
        await exportAllBackup();
        toast(t('exportDone'));
      } catch {
        toast(t('exportFailed'), { kind: 'error' });
      } finally {
        backupBtn.disabled = false;
      }
    },
  }, t('exportText'));

  const restoreBackupBtn = h('button', {
    type: 'button',
    class: 'btn btn--ghost',
    onclick: async () => {
      try {
        const res = await pickAndRestoreBackup();
        if (res) toast(t('importDone'));
      } catch {
        toast(t('importFailed'), { kind: 'error' });
      }
    },
  }, t('import'));

  const saveBtn = h('button', {
    type: 'button',
    class: 'btn btn--primary',
    onclick: () => {
      setApiBase(serverInput.value);
      setFontScale(fontSelect.value);
      setImeDefault(imeSelect.value);
      setTheme(themeSelect.value);
      setDailyTemplate(templateInput.value);
      setLocale(langSelect.value);
      toast(t('settingsSaved'));
    },
  }, t('confirm'));

  const row = (label, control, hint = null, tag = 'label') => h(tag, { class: 'settings__row' },
    h('span', { class: 'settings__label' }, label),
    h('div', { class: 'settings__control' },
      control,
      hint ? h('span', { class: 'settings__hint' }, hint) : null));

  const head = h('header', { class: 'note-view__head', dataset: { mnScrollY: '' } },
    h('h1', { class: 'page-head__title' }, t('settings')));

  const body = h('section', { class: 'page mn-surface note-view__body' },
    h('div', { class: 'page-inner mn-columns' },
      h('div', { class: 'settings' },
        row(t('language'), langSelect),
        row(t('server'), serverInput),
        row(t('fontSize'), fontSelect),
        row(t('imeDefault'), imeSelect),
        row(t('theme'), themeSelect),
        row(t('dailyTemplate'), templateInput, t('dailyTemplateHint')),
        row(t('installApp'), installBtn),
        row(`${t('exportText')} / ${t('import')}`, h('div', { class: 'page-head__group' }, backupBtn, restoreBackupBtn), null, 'div'),
        h('div', { class: 'settings__actions' }, saveBtn))));

  container.replaceChildren(h('div', { class: 'note-view' }, head, body));
  // enhanceSelect needs a parent node to wrap the native <select>.
  selectApis.push(
    enhanceSelect(fontSelect),
    enhanceSelect(imeSelect),
    enhanceSelect(langSelect),
    enhanceSelect(themeSelect),
  );

  return {
    destroy() {
      offInstall();
      selectApis.forEach((api) => api.destroy?.());
    },
  };
}
