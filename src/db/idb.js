/**
 * IndexedDB mirror of the Flutter Drift schema (documents / blocks / operations).
 * One database per signed-in user so accounts never mix.
 *
 * Rows use the server field names (snake_case) and ISO-8601 timestamps.
 * operations.synced is 0/1 because booleans are not valid index keys.
 */

const VERSION = 4;

let db = null;
let dbName = null;

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function openDatabase(userId) {
  const name = `mgl-notes-${userId}`;
  if (db && dbName === name) return Promise.resolve(db);
  closeDatabase();

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('documents')) {
        const docs = d.createObjectStore('documents', { keyPath: 'id' });
        docs.createIndex('title', 'title');
      }
      if (!d.objectStoreNames.contains('blocks')) {
        const blocks = d.createObjectStore('blocks', { keyPath: 'id' });
        blocks.createIndex('document_id', 'document_id');
      }
      if (!d.objectStoreNames.contains('operations')) {
        const ops = d.createObjectStore('operations', { keyPath: 'id' });
        ops.createIndex('synced', 'synced');
      }
      if (!d.objectStoreNames.contains('meta')) {
        d.createObjectStore('meta', { keyPath: 'key' });
      }
      // Local derived wiki/tag index — never synced (notes-app.services.link).
      // v4: PK includes link_type so [[Title]] and #Title coexist.
      if (d.objectStoreNames.contains('block_links')) {
        d.deleteObjectStore('block_links');
      }
      const links = d.createObjectStore('block_links', {
        keyPath: ['source_id', 'target_id', 'link_type'],
      });
      links.createIndex('source_id', 'source_id');
      links.createIndex('target_id', 'target_id');
      // Force full reindex after schema change (main.js checks links_indexed).
      if (d.objectStoreNames.contains('meta')) {
        req.transaction.objectStore('meta').delete('links_indexed');
      }
      // Local image blobs for image blocks (asset-id in data_json).
      if (!d.objectStoreNames.contains('assets')) {
        d.createObjectStore('assets', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      db = req.result;
      dbName = name;
      db.onversionchange = () => closeDatabase();
      void requestPersistentStorage();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

export function closeDatabase() {
  if (db) db.close();
  db = null;
  dbName = null;
}

function requireDb() {
  if (!db) throw new Error('Database is not open');
  return db;
}

/**
 * Run `fn(stores)` inside one transaction; resolves after commit with fn's result.
 * `fn` may return a promise only for chained IDB requests in the same tx.
 */
export function transaction(storeNames, mode, fn) {
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];
  return new Promise((resolve, reject) => {
    const tx = requireDb().transaction(names, mode);
    const stores = {};
    names.forEach((n) => { stores[n] = tx.objectStore(n); });
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    try {
      Promise.resolve(fn(stores, tx)).then((value) => { result = value; }, (err) => {
        try { tx.abort(); } catch { /* already finished */ }
        reject(err);
      });
    } catch (err) {
      try { tx.abort(); } catch { /* already finished */ }
      reject(err);
    }
  });
}

export function req(request) {
  return promisify(request);
}

export function get(store, key) {
  return transaction(store, 'readonly', (s) => req(s[store].get(key)));
}

export function getAll(store) {
  return transaction(store, 'readonly', (s) => req(s[store].getAll()));
}

export function getAllByIndex(store, index, value) {
  return transaction(store, 'readonly', (s) => req(s[store].index(index).getAll(value)));
}

export function put(store, value) {
  return transaction(store, 'readwrite', (s) => req(s[store].put(value)));
}

export async function getMeta(key, fallback = null) {
  const row = await get('meta', key);
  return row ? row.value : fallback;
}

export function setMeta(key, value) {
  return put('meta', { key, value });
}

/** 判断异常是否由浏览器磁盘/存储配额耗尽引起 */
export function isQuotaError(err) {
  if (!err) return false;
  const name = String(err.name || '');
  const msg = String(err.message || '');
  return (
    name === 'QuotaExceededError'
    || name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || err.code === 22
    || err.code === 1014
    || /quota|storage full|disk full/i.test(msg)
  );
}

/** 向浏览器申请持久化存储权限，防止移动端系统在空间不足时自动清理笔记库 */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) {
      const persisted = await navigator.storage.persisted();
      if (!persisted) await navigator.storage.persist();
    }
  } catch {
    /* ignore */
  }
}

/** 检查当前站点存储配额使用率，返回 { usage, quota, ratio, nearLimit } */
export async function estimateStorageUsage() {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const ratio = quota > 0 ? usage / quota : 0;
    return {
      usage,
      quota,
      ratio,
      // 使用率超过 90% 或剩余空间不足 15MB 时视为濒临上限
      nearLimit: quota > 0 && (ratio >= 0.9 || (quota - usage) < 15 * 1024 * 1024),
    };
  } catch {
    return null;
  }
}
