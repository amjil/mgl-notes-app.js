/**
 * UI strings. Navigation labels follow the Flutter mobile drawer.
 * Supported locales: mn (traditional Mongolian, default) and en.
 */
import { emit } from './events.js';

const LOCALE_KEY = 'mgl.locale';

const MN = {
  "appName": "ᠲᠡᠮᠳᠡᠭ",
  "today": "ᠥᠨᠦᠳᠦᠷ",
  "documents": "ᠲᠡᠮᠳᠡᠭ",
  "tasks": "ᠠᠵᠢᠯ",
  "noOpenTasks": "ᠨᠡᠭᠡᠭᠡᠭᠰᠡᠨ ᠠᠵᠢᠯ ᠦᠭᠡᠢ",
  "search": "ᠡᠷᠢᠬᠦ",
  "searchPlaceholder": "ᠡᠷᠢᠬᠦ",
  "tags": "ᠱᠣᠰᠢᠭ᠎ᠠ",
  "graph": "ᠬᠣᠯᠪᠣᠭᠠᠰᠤ ᠤᠨ ᠵᠢᠷᠤᠭ",
  "noTags": "ᠱᠣᠰᠢᠭ᠎ᠠ ᠦᠭᠡᠢ",
  "tagsHint": "ᠱᠣᠰᠢᠭ᠎ᠠ ᠪᠠᠷ ᠰᠢᠭᠦᠬᠦ",
  "noResults": "ᠣᠯᠳᠠᠭᠰᠠᠨ ᠦᠭᠡᠢ",
  "daily": "ᠡᠳᠦᠷ᠎ᠦᠨ ᠲᠡᠮᠳᠡᠭᠯᠡᠯ",
  "normal": "ᠡᠩ ᠦᠨ",
  "all": "ᠪᠦᠬᠦ",
  "newDocument": "ᠰᠢᠨ᠎ᠡ",
  "newSubDocument": "ᠳᠡᠭᠡᠳᠦ",
  "childDocuments": "ᠳᠡᠭᠡᠳᠦ ᠲᠡᠮᠳᠡᠭ",
  "parentDocument": "ᠡᠴᠢᠭᠡ",
  "moveDocument": "ᠰᠢᠯᠵᠢᠭᠦᠯᠬᠦ",
  "moveRoot": "— ᠡᠬᠢ ᠲᠦᠪᠰᠢᠨ —",
  "delete": "ᠤᠰᠠᠳᠬᠠᠬᠤ",
  "trash": "ᠬᠣᠭ ᠤᠨ ᠰᠠᠪᠠ",
  "restore": "ᠰᠡᠷᠭᠡᠭᠡᠬᠦ",
  "destroyForever": "ᠮᠥᠩᠬᠡ ᠤᠰᠠᠳᠬᠠᠬᠤ",
  "cancel": "ᠪᠣᠯᠢᠬᠤ",
  "confirm": "ᠲᠡᠶᠢᠮᠦ",
  "confirmDeleteTitle": "ᠤᠰᠠᠳᠬᠠᠬᠤ ᠤᠤ᠋?",
  "confirmDeleteBody": "ᠬᠣᠭ ᠤᠨ ᠰᠠᠪᠠ ᠳᠤ ᠣᠷᠣᠭᠤᠯᠤᠨ᠎ᠠ",
  "confirmDestroyTitle": "ᠮᠥᠩᠬᠡ ᠤᠰᠠᠳᠬᠠᠬᠤ ᠤᠤ᠋?",
  "confirmDestroyBody": "ᠳᠠᠬᠢᠨ ᠰᠡᠷᠭᠡᠭᠡᠵᠦ ᠦᠯᠦ ᠪᠣᠯᠤᠮᠤᠢ",
  "trashEmpty": "ᠬᠣᠭ ᠤᠨ ᠰᠠᠪᠠ ᠬᠣᠭᠣᠰᠣᠨ",
  "deleted": "ᠤᠰᠠᠳᠬᠠᠭᠰᠠᠨ",
  "untitled": "ᠭᠠᠷᠴᠠᠭ ᠦᠭᠡᠢ",
  "titlePlaceholder": "ᠭᠠᠷᠴᠠᠭ",
  "empty": "ᠬᠣᠭᠣᠰᠣᠨ",
  "prevDay": "ᠡᠮᠦᠨ᠎ᠡ",
  "nextDay": "ᠳᠠᠷᠠᠭ᠎ᠠ",
  "backToToday": "ᠥᠨᠦᠳᠦᠷ",
  "logout": "ᠭᠠᠷᠬᠤ",
  "login": "ᠨᠡᠪᠲᠡᠷᠡᠬᠦ",
  "register": "ᠪᠦᠷᠢᠳᠬᠡᠭᠦᠯᠬᠦ",
  "sync": "ᠢᠵᠢᠯᠢᠰᠬᠡᠬᠦ",
  "back": "ᠪᠤᠴᠠᠬᠤ",
  "menu": "ᠲᠣᠪᠶᠣᠭ",
  "settings": "ᠲᠣᠬᠢᠷᠠᠭᠤᠯᠤᠯᠲᠠ",
  "imeToggle": "ᠮᠣᠩ / Lat",
  "langMn": "ᠮᠣᠩᠭᠣᠯ",
  "unsupportedBlock": "ᠡᠨᠡ ᠪᠦᠯᠦᠭ ᠢ ᠸᠧᠪ ᠳᠡᠭᠡᠷ᠎ᠡ ᠵᠠᠰᠠᠬᠤ ᠤ ᠬᠠᠷᠠᠬᠠᠨ ᠳᠡᠮᠵᠢᠬᠦ ᠦᠭᠡᠢ",
  "email": "ᠴᠠᠬᠢᠮ ᠰᠢᠤᠳᠠᠨ",
  "password": "ᠨᠢᠭᠤᠴᠠ ᠦᠭᠡ",
  "displayName": "ᠨᠡᠷ᠎ᠡ",
  "server": "ᠦᠢᠯᠡᠴᠢᠯᠡᠭᠦᠷ",
  "haveAccount": "ᠪᠦᠷᠢᠳᠬᠡᠯ ᠪᠠᠶᠢᠨ᠎ᠠ ᠤᠤ? ᠨᠡᠪᠲᠡᠷᠡᠬᠦ",
  "noAccount": "ᠪᠦᠷᠢᠳᠬᠡᠯ ᠦᠭᠡᠢ ᠤᠤ? ᠪᠦᠷᠢᠳᠬᠡᠭᠦᠯᠬᠦ",
  "undo": "ᠪᠤᠴᠠᠭᠠᠬᠤ",
  "redo": "ᠳᠠᠬᠢᠨ ᠦᠢᠯᠡᠳᠬᠦ",
  "syncOk": "ᠢᠵᠢᠯᠢᠰᠪᠡ",
  "syncing": "ᠢᠵᠢᠯᠢᠰᠬᠡᠵᠦ ᠪᠠᠶᠢᠨ᠎ᠠ…",
  "syncError": "ᠢᠵᠢᠯᠢᠰᠬᠡᠬᠦ ᠠᠯᠳᠠᠭ᠎ᠠ",
  "syncOffline": "ᠰᠦᠯᠵᠢᠶ᠎ᠡ ᠦᠭᠡᠢ",
  "sessionExpired": "ᠬᠤᠭᠤᠴᠠᠭ᠎ᠠ ᠳᠠᠭᠤᠰᠪᠠ — ᠳᠠᠬᠢᠨ ᠨᠡᠪᠲᠡᠷᠡᠨ᠎ᠡ ᠦᠦ",
  "settingsSaved": "ᠬᠠᠳᠠᠭᠠᠯᠠᠪᠠ",
  "fontSize": "ᠦᠰᠦᠭ ᠦᠨ ᠬᠡᠮᠵᠢᠶ᠎ᠡ",
  "imeDefault": "ᠣᠷᠣᠭᠤᠯᠬᠤ ᠠᠷᠭ᠎ᠠ",
  "theme": "ᠥᠩᠭᠡ",
  "language": "ᠬᠡᠯᠡ",
  "langEn": "English",
  "installApp": "ᠬᠡᠷᠡᠭᠯᠡᠭᠡᠨ ᠤᠭᠰᠠᠷᠠᠬᠤ",
  "installDone": "ᠤᠭᠰᠠᠷᠠᠪᠠ",
  "updateReady": "ᠰᠢᠨᠡᠴᠢᠯᠡᠯ ᠪᠡᠯᠡᠨ — ᠳᠠᠬᠢᠨ ᠨᠡᠭᠡᠭᠡᠨ᠎ᠡ ᠦᠦ",
  "commands": "ᠵᠠᠷᠯᠢᠭ",
  "commandPlaceholder": "ᠵᠠᠷᠯᠢᠭ ᠪᠢᠴᠢᠬᠦ…",
  "more": "ᠪᠤᠰᠠᠳ",
  "exportText": "ᠪᠢᠴᠢ ᠭᠠᠷᠭᠠᠬᠤ",
  "exportHtml": "HTML ᠭᠠᠷᠭᠠᠬᠤ",
  "exportDone": "ᠭᠠᠷᠭᠠᠪᠠ",
  "exportFailed": "ᠭᠠᠷᠭᠠᠵᠤ ᠴᠢᠳᠠᠭᠰᠠᠨ ᠦᠭᠡᠢ",
  "backupAll": "ᠨᠡᠭᠡᠬᠦᠮᠵᠢ",
  "restoreBackup": "ᠨᠡᠭᠡᠬᠦᠮᠵᠢ ᠣᠷᠣᠭᠤᠯᠬᠤ",
  "restoreBackupBody": "ᠢᠳᠡᠨᠲᠢᠬᠢ ᠨᠢ ᠨᠢᠭᠡ ᠲᠡᠮᠳᠡᠭ ᠢ ᠳᠡᠭᠡᠷ᠎ᠡ ᠨᠢ ᠪᠢᠴᠢᠨ᠎ᠡ.",
  "import": "ᠣᠷᠣᠭᠤᠯᠬᠤ",
  "importDone": "ᠣᠷᠣᠭᠤᠯᠪᠠ",
  "importFailed": "ᠣᠷᠣᠭᠤᠯᠵᠤ ᠴᠢᠳᠠᠭᠰᠠᠨ ᠦᠭᠡᠢ",
  "share": "ᠬᠤᠪᠢᠶᠠᠯᠴᠠᠬᠤ",
  "shareFailed": "ᠬᠤᠪᠢᠶᠠᠯᠴᠠᠵᠤ ᠴᠢᠳᠠᠭᠰᠠᠨ ᠦᠭᠡᠢ",
  "backlinks": "ᠡᠷᠭᠢᠬᠦ ᠬᠣᠯᠪᠣᠭᠠᠰᠤ",
  "backlinksEmpty": "ᠡᠷᠭᠢᠬᠦ ᠬᠣᠯᠪᠣᠭᠠᠰᠤ ᠦᠭᠡᠢ",
  "fmtToolbar": "ᠬᠡᠯᠪᠡᠷᠢ",
  "fmtBold": "ᠪᠦᠳᠦᠭᠦᠨ",
  "fmtItalic": "ᠨᠠᠯᠠᠭᠤ",
  "fmtUnderline": "ᠳᠣᠣᠷ᠎ᠠ ᠵᠢᠷᠤᠭᠠᠰᠤ",
  "fmtLink": "ᠬᠣᠯᠪᠣᠭᠠᠰᠤ",
  "fmtLinkPrompt": "ᠬᠣᠯᠪᠣᠭᠠᠰᠤ URL (http:// ᠡᠰᠡᠪᠡᠯ https://)",
  "image": "ᠵᠢᠷᠤᠭ",
  "imageEmpty": "ᠵᠢᠷᠤᠭ ᠨᠡᠮᠡᠬᠦ",
  "imageError": "ᠵᠢᠷᠤᠭ ᠨᠡᠮᠡᠵᠦ ᠴᠢᠳᠠᠭᠰᠠᠨ ᠦᠭᠡᠢ",
  "bookmark": "ᠬᠠᠪᠴᠢᠭᠤᠷ",
  "bookmarkUrl": "ᠬᠠᠪᠴᠢᠭᠤᠷ URL",
  "bookmarkTitle": "ᠭᠠᠷᠴᠠᠭ",
  "bookmarkDesc": "ᠲᠠᠶᠢᠯᠪᠤᠷᠢ",
  "readingMode": "ᠤᠩᠰᠢᠬᠤ",
  "exitReading": "ᠵᠠᠰᠠᠬᠤ",
  "select": "ᠰᠣᠩᠭᠣᠬᠤ",
  "selected": "ᠰᠣᠩᠭᠣᠭᠰᠠᠨ",
  "selectAll": "ᠪᠦᠭᠦᠳᠡ ᠶᠢ ᠰᠣᠩᠭᠣᠬᠤ",
  "clearSelection": "ᠠᠷᠢᠯᠭᠠᠬᠤ",
  "batchDelete": "ᠰᠣᠩᠭᠣᠭᠰᠠᠨ ᠢ ᠤᠰᠠᠳᠬᠠᠬᠤ",
  "batchRestore": "ᠰᠣᠩᠭᠣᠭᠰᠠᠨ ᠢ ᠰᠡᠷᠭᠡᠭᠡᠬᠦ",
  "batchDestroy": "ᠰᠣᠩᠭᠣᠭᠰᠠᠨ ᠢ ᠮᠥᠩᠬᠡ ᠤᠰᠠᠳᠬᠠᠬᠤ",
  "conflictBadge": "ᠵᠥᠷᠢᠴᠡᠯ",
  "conflictRename": "ᠭᠠᠷᠴᠠᠭ ᠳᠠᠪᠬᠤᠴᠠᠪᠠ — ᠨᠡᠷ᠎ᠡ ᠶᠢ ᠥᠭᠡᠷᠡᠴᠢᠯᠡᠪᠡ",
  "conflictKeptLocal": "ᠳᠣᠲᠣᠭᠠᠳᠤ ᠵᠠᠰᠠᠪᠤᠷᠢ ᠶᠢ ᠦᠯᠡᠳᠡᠭᠡᠪᠡ",
  "conflictNotice": "ᠡᠨᠡ ᠲᠡᠮᠳᠡᠭᠯᠡᠯ ᠪᠣᠯ ᠵᠥᠷᠢᠴᠡᠯ ᠲᠡᠢ ᠬᠠᠭᠤᠯᠪᠤᠷᠢ",
  "dailyTemplate": "ᠡᠳᠦᠷ ᠦᠨ ᠵᠠᠭᠪᠤᠷ",
  "dailyTemplateHint": "ᠮᠥᠷ ᠪᠦᠷᠢ ᠳᠦ ᠨᠢᠭᠡ ᠴᠣᠭᠴᠠ ᠮᠥᠷ. ᠰᠢᠨ᠎ᠡ ᠡᠳᠦᠷ ᠦᠨ ᠲᠡᠮᠳᠡᠭᠯᠡᠯ ᠡᠬᠢᠯᠡᠬᠦ ᠳᠦ ᠬᠡᠷᠡᠭᠯᠡᠨ᠎ᠡ.",
  "openDocument": "ᠨᠡᠭᠡᠭᠡᠬᠦ",
  "recentDocuments": "ᠰᠠᠶᠢᠬᠠᠨ ᠤ",
  "review": "ᠳᠠᠪᠲᠠᠬᠤ",
  "fcFrontPlaceholder": "ᠠᠰᠠᠭᠤᠯᠲᠠ…",
  "fcBackPlaceholder": "ᠬᠠᠷᠢᠭᠤᠯᠲᠠ…",
  "reviewShowAnswer": "ᠬᠠᠷᠢᠭᠤ ᠬᠠᠷᠠᠬᠤ",
  "reviewDone": "ᠥᠨᠦᠳᠦᠷ ᠦᠨ ᠳᠠᠪᠲᠠᠯᠭ᠎ᠠ ᠳᠠᠭᠤᠰᠪᠠ",
  "reviewAll": "ᠪᠦᠬᠦ ᠬᠠᠢᠷᠴᠠᠭ ᠳᠠᠪᠲᠠᠬᠤ",
  "gradeAgain": "ᠳᠠᠬᠢᠬᠤ",
  "gradeHard": "ᠪᠡᠷᠬᠡ",
  "gradeGood": "ᠰᠠᠶᠢᠨ",
  "gradeEasy": "ᠠᠮᠠᠷ"
};

const EN = {
  "appName": "Notes",
  "today": "Today",
  "documents": "Notes",
  "tasks": "Tasks",
  "noOpenTasks": "No open tasks",
  "search": "Search",
  "searchPlaceholder": "Search",
  "tags": "Tags",
  "graph": "Graph",
  "noTags": "No tags yet",
  "tagsHint": "Pick a tag to browse notes",
  "noResults": "No results",
  "daily": "Daily",
  "normal": "Notes",
  "all": "All",
  "newDocument": "New",
  "newSubDocument": "New sub-page",
  "moveDocument": "Move to…",
  "moveRoot": "— Top level (Root) —",
  "childDocuments": "Sub-pages",
  "parentDocument": "Parent",
  "delete": "Delete",
  "trash": "Trash",
  "restore": "Restore",
  "destroyForever": "Delete forever",
  "cancel": "Cancel",
  "confirm": "OK",
  "confirmDeleteTitle": "Move to trash?",
  "confirmDeleteBody": "You can restore it later from Trash.",
  "confirmDestroyTitle": "Delete forever?",
  "confirmDestroyBody": "This cannot be undone.",
  "trashEmpty": "Trash is empty",
  "deleted": "Deleted",
  "untitled": "Untitled",
  "titlePlaceholder": "Title",
  "empty": "Empty",
  "prevDay": "Prev",
  "nextDay": "Next",
  "backToToday": "Today",
  "logout": "Log out",
  "login": "Log in",
  "register": "Register",
  "sync": "Sync",
  "back": "Back",
  "menu": "Menu",
  "settings": "Settings",
  "imeToggle": "MN / Lat",
  "langMn": "Mongolian",
  "unsupportedBlock": "This block type is not editable on the web yet",
  "email": "Email",
  "password": "Password",
  "displayName": "Display name",
  "server": "Server",
  "haveAccount": "Have an account? Log in",
  "noAccount": "No account? Register",
  "undo": "Undo",
  "redo": "Redo",
  "syncOk": "Synced",
  "syncing": "Syncing…",
  "syncError": "Sync error",
  "syncOffline": "Offline",
  "sessionExpired": "Session expired — log in again",
  "settingsSaved": "Saved",
  "fontSize": "Font size",
  "imeDefault": "IME",
  "theme": "Theme",
  "language": "Language",
  "langEn": "English",
  "installApp": "Install app",
  "installDone": "App installed",
  "updateReady": "Update ready — reopen to apply",
  "commands": "Commands",
  "commandPlaceholder": "Type a command…",
  "more": "More",
  "exportText": "Export text",
  "exportHtml": "Export HTML",
  "exportDone": "Exported",
  "exportFailed": "Export failed",
  "backupAll": "Full backup",
  "restoreBackup": "Restore backup",
  "restoreBackupBody": "Notes with the same id are skipped. Missing notes are added.",
  "import": "Import",
  "importDone": "Imported",
  "importFailed": "Import failed",
  "share": "Share",
  "shareFailed": "Share failed",
  "backlinks": "Backlinks",
  "backlinksEmpty": "No backlinks",
  "fmtToolbar": "Format",
  "fmtBold": "Bold",
  "fmtItalic": "Italic",
  "fmtUnderline": "Underline",
  "fmtLink": "Link",
  "fmtLinkPrompt": "Link URL (http:// or https://)",
  "image": "Image",
  "imageEmpty": "Add image",
  "imageError": "Could not add image",
  "bookmark": "Bookmark",
  "bookmarkUrl": "Bookmark URL",
  "bookmarkTitle": "Title",
  "bookmarkDesc": "Description (optional)",
  "readingMode": "Read",
  "exitReading": "Edit",
  "select": "Select",
  "selected": "Selected",
  "selectAll": "Select all",
  "clearSelection": "Clear",
  "batchDelete": "Delete selected",
  "batchRestore": "Restore selected",
  "batchDestroy": "Destroy selected",
  "conflictBadge": "Conflict",
  "conflictRename": "Title conflict — local copy renamed",
  "conflictKeptLocal": "Kept local edits (newer than remote)",
  "conflictNotice": "This note looks like a conflict copy",
  "dailyTemplate": "Daily template",
  "dailyTemplateHint": "One paragraph per line. Applied when a new daily note is created.",
  "openDocument": "Open",
  "recentDocuments": "Recent",
  "review": "Review",
  "fcFrontPlaceholder": "Question / Front…",
  "fcBackPlaceholder": "Answer / Back…",
  "reviewShowAnswer": "Show answer",
  "reviewDone": "All caught up for today!",
  "reviewAll": "Practice all cards",
  "gradeAgain": "Again",
  "gradeHard": "Hard",
  "gradeGood": "Good",
  "gradeEasy": "Easy"
};

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
  return /\(Conflicted copy\b/i.test(String(title || ''));
}
