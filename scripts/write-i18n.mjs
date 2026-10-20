import { writeFileSync } from 'fs';

const u = (...cps) => String.fromCodePoint(...cps);

// Mongolian: ᠲ = U+1832 (TA), ᠢ = U+1822 (I) — do not confuse.
const MN = {
  appName: u(0x1832, 0x1821, 0x182E, 0x1833, 0x1821, 0x182D),
  today: u(0x1825, 0x1828, 0x1826, 0x1833, 0x1826, 0x1837),
  documents: u(0x1832, 0x1821, 0x182E, 0x1833, 0x1821, 0x182D),
  search: u(0x1821, 0x1837, 0x1822, 0x182C, 0x1826),
  searchPlaceholder: u(0x1821, 0x1837, 0x1822, 0x182C, 0x1826),
  noResults: `${u(0x1823, 0x182F, 0x1833, 0x1820, 0x182D, 0x1830, 0x1820, 0x1828)} ${u(0x1826, 0x182D, 0x1821, 0x1822)}`,
  daily: `${u(0x1821, 0x1833, 0x1826, 0x1837, 0x180E, 0x1826, 0x1828)} ${u(0x1832, 0x1821, 0x182E, 0x1833, 0x1821, 0x182D, 0x182F, 0x1821, 0x182F)}`,
  normal: `${u(0x1821, 0x1829)} ${u(0x1824, 0x1828)}`,
  all: u(0x182A, 0x1826, 0x182C, 0x1826),
  newDocument: u(0x1830, 0x1822, 0x1828, 0x180E, 0x1821),
  delete: u(0x1824, 0x1830, 0x1820, 0x1833, 0x182C, 0x1820, 0x182C, 0x1824),
  trash: `${u(0x182C, 0x1823, 0x182D, 0x180E, 0x1824, 0x1828)} ${u(0x1830, 0x1820, 0x182A, 0x1820)}`,
  restore: u(0x1830, 0x1821, 0x1837, 0x182D, 0x1821, 0x182D, 0x1821, 0x182C, 0x1826),
  destroyForever: `${u(0x182E, 0x1825, 0x1829, 0x182C, 0x1821)} ${u(0x1824, 0x1830, 0x1820, 0x1833, 0x182C, 0x1820, 0x182C, 0x1824)}`,
  cancel: u(0x182A, 0x1823, 0x182F, 0x1822, 0x1824),
  confirm: u(0x1832, 0x1821, 0x1836, 0x1822, 0x182F, 0x182A, 0x1826, 0x1837, 0x1822),
  confirmDeleteTitle: `${u(0x1824, 0x1830, 0x1820, 0x1833, 0x182C, 0x1820, 0x182C, 0x1824)} ${u(0x1824, 0x1824, 0x180B)}?`,
  confirmDeleteBody: `${u(0x182C, 0x1823, 0x182D, 0x180E, 0x1824, 0x1828)} ${u(0x1830, 0x1820, 0x182A, 0x1820, 0x202F, 0x1833, 0x1824)} ${u(0x1823, 0x1837, 0x1823, 0x182D, 0x1824, 0x182F, 0x1824, 0x1828, 0x180E, 0x1820)}`,
  confirmDestroyTitle: `${u(0x182E, 0x1825, 0x1829, 0x182C, 0x1821)} ${u(0x1824, 0x1830, 0x1820, 0x1833, 0x182C, 0x1820, 0x182C, 0x1824)} ${u(0x1824, 0x1824, 0x180B)}?`,
  confirmDestroyBody: `${u(0x1833, 0x1820, 0x182C, 0x1822, 0x1828)} ${u(0x1830, 0x1821, 0x1837, 0x182D, 0x1821, 0x182D, 0x1821, 0x1835, 0x1826)} ${u(0x1826, 0x182F, 0x1826)} ${u(0x182A, 0x1823, 0x182F, 0x1824, 0x182E, 0x1824, 0x1822)}`,
  trashEmpty: `${u(0x182C, 0x1823, 0x182D, 0x180E, 0x1824, 0x1828)} ${u(0x1830, 0x1820, 0x182A, 0x1820)} ${u(0x182C, 0x1823, 0x182D, 0x1823, 0x1830, 0x1823, 0x1828)}`,
  deleted: u(0x1824, 0x1830, 0x1820, 0x1833, 0x182D, 0x1820, 0x182D, 0x1830, 0x1820, 0x1828),
  untitled: `${u(0x182D, 0x1820, 0x1837, 0x1834, 0x1820, 0x182D)} ${u(0x1826, 0x182D, 0x1821, 0x1822)}`,
  titlePlaceholder: u(0x182D, 0x1820, 0x1837, 0x1834, 0x1820, 0x182D),
  empty: u(0x182C, 0x1823, 0x182D, 0x1823, 0x1830, 0x1823, 0x1828),
  prevDay: u(0x1821, 0x182E, 0x1826, 0x1828, 0x180E, 0x1821),
  nextDay: u(0x1833, 0x1820, 0x1837, 0x1820, 0x182D, 0x180E, 0x1820),
  backToToday: u(0x1825, 0x1828, 0x1826, 0x1833, 0x1826, 0x1837),
  logout: u(0x182D, 0x1820, 0x1837, 0x182C, 0x1824),
  login: u(0x1828, 0x1821, 0x182A, 0x1832, 0x1821, 0x1837, 0x1821, 0x182C, 0x1826),
  register: u(0x182A, 0x1826, 0x1837, 0x1822, 0x1833, 0x182C, 0x1821, 0x182D, 0x1826, 0x182F, 0x182C, 0x1826),
  sync: u(0x1830, 0x1822, 0x1829, 0x182C, 0x1821, 0x1837, 0x1821, 0x182D, 0x1826, 0x182F, 0x182C, 0x1826),
  back: u(0x182A, 0x1824, 0x1834, 0x1820, 0x182C, 0x1824),
  menu: u(0x1832, 0x1823, 0x182A, 0x1834, 0x1822),
  settings: u(0x1832, 0x1823, 0x182C, 0x1822, 0x1837, 0x1820, 0x182D, 0x1824, 0x182F, 0x1824, 0x182F, 0x1832, 0x1820),
  imeToggle: `${u(0x182E, 0x1823, 0x1829)} / Lat`,
  langMn: u(0x182E, 0x1823, 0x1829, 0x182D, 0x1823, 0x182F),
};

const shared = {
  unsupportedBlock: 'This block type is not editable on the web yet',
  email: 'Email',
  password: 'Password',
  displayName: 'Display name',
  server: 'Server',
  haveAccount: 'Have an account? Log in',
  noAccount: 'No account? Register',
  undo: 'Undo',
  redo: 'Redo',
  syncOk: 'Synced',
  syncing: 'Syncing…',
  syncError: 'Sync error',
  syncOffline: 'Offline',
  sessionExpired: 'Session expired — log in again',
  settingsSaved: 'Saved',
  fontSize: 'Font size',
  imeDefault: 'IME',
  language: 'Language',
  langEn: 'English',
  installApp: 'Install app',
  installDone: 'App installed',
  updateReady: 'Update ready — reopen to apply',
  commands: 'Commands',
  commandPlaceholder: 'Type a command…',
  more: 'More',
  exportText: 'Export text',
  exportHtml: 'Export HTML',
  exportDone: 'Exported',
  share: 'Share',
  shareFailed: 'Share failed',
  backlinks: 'Backlinks',
  backlinksEmpty: 'No backlinks',
  image: 'Image',
  imageEmpty: 'Add image',
  imageError: 'Could not add image',
  bookmark: 'Bookmark',
  bookmarkUrl: 'Bookmark URL',
  bookmarkTitle: 'Title',
  bookmarkDesc: 'Description (optional)',
  readingMode: 'Read',
  exitReading: 'Edit',
  select: 'Select',
  selected: 'Selected',
  selectAll: 'Select all',
  clearSelection: 'Clear',
  batchDelete: 'Delete selected',
  batchRestore: 'Restore selected',
  batchDestroy: 'Destroy selected',
  conflictBadge: 'Conflict',
  conflictRename: 'Title conflict — local copy renamed',
  conflictKeptLocal: 'Kept local edits (newer than remote)',
  conflictNotice: 'This note looks like a conflict copy',
  dailyTemplate: 'Daily template',
  dailyTemplateHint: 'One paragraph per line. Applied when a new daily note is created.',
  openDocument: 'Open',
  recentDocuments: 'Recent',
};

Object.assign(MN, shared);

const EN = {
  appName: 'Notes',
  today: 'Today',
  documents: 'Notes',
  search: 'Search',
  searchPlaceholder: 'Search',
  noResults: 'No results',
  daily: 'Daily',
  normal: 'Notes',
  all: 'All',
  newDocument: 'New',
  delete: 'Delete',
  trash: 'Trash',
  restore: 'Restore',
  destroyForever: 'Delete forever',
  cancel: 'Cancel',
  confirm: 'OK',
  confirmDeleteTitle: 'Move to trash?',
  confirmDeleteBody: 'You can restore it later from Trash.',
  confirmDestroyTitle: 'Delete forever?',
  confirmDestroyBody: 'This cannot be undone.',
  trashEmpty: 'Trash is empty',
  deleted: 'Deleted',
  untitled: 'Untitled',
  titlePlaceholder: 'Title',
  empty: 'Empty',
  prevDay: 'Prev',
  nextDay: 'Next',
  backToToday: 'Today',
  logout: 'Log out',
  login: 'Log in',
  register: 'Register',
  sync: 'Sync',
  back: 'Back',
  menu: 'Menu',
  settings: 'Settings',
  imeToggle: 'MN / Lat',
  langMn: 'Mongolian',
  ...shared,
};

const src = `/**
 * UI strings. Navigation labels follow the Flutter mobile drawer.
 * Supported locales: mn (traditional Mongolian, default) and en.
 */
import { emit } from './events.js';

const LOCALE_KEY = 'mgl.locale';

const MN = ${JSON.stringify(MN, null, 2)};

const EN = ${JSON.stringify(EN, null, 2)};

const DICTS = { mn: MN, en: EN };

function readStoredLocale() {
  try {
    const v = globalThis.localStorage?.getItem?.(LOCALE_KEY);
    return v === 'en' || v === 'mn' ? v : 'mn';
  } catch {
    return 'mn';
  }
}

let current = readStoredLocale();

export function locale() {
  return current;
}

export function setLocale(next) {
  const value = next === 'en' ? 'en' : 'mn';
  if (value === current) return current;
  current = value;
  try {
    globalThis.localStorage?.setItem?.(LOCALE_KEY, value);
  } catch { /* ignore */ }
  try {
    if (globalThis.document?.documentElement) {
      globalThis.document.documentElement.lang = value === 'en' ? 'en' : 'mn';
    }
  } catch { /* ignore */ }
  emit('locale-changed', { locale: value });
  return value;
}

export function applyLocale() {
  try {
    if (globalThis.document?.documentElement) {
      globalThis.document.documentElement.lang = current === 'en' ? 'en' : 'mn';
    }
  } catch { /* ignore */ }
}

export function t(key) {
  const dict = DICTS[current] || MN;
  return dict[key] ?? EN[key] ?? key;
}

/** Titles produced by sync title-conflict renames. */
export function isConflictTitle(title) {
  return /\\(Conflicted copy\\b/i.test(String(title || ''));
}
`;

writeFileSync(new URL('../src/i18n.js', import.meta.url), src, 'utf8');
console.log('ok', Object.keys(MN).length);
