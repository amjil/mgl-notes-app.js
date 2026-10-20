/**
 * Local image blobs for image blocks (Flutter-compatible asset-id in data_json).
 * Small / compressed files keep a data: URL so ops sync can carry preview bytes;
 * full binary goes through /api/assets upload+download.
 */
import { downloadAssetFile, uploadAssetFile } from '../api/assets.js';
import { get, getAll, put, transaction, req } from '../db/idb.js';
import { emit } from '../events.js';
import { loggedIn } from '../session.js';
import { makeOperation } from '../sync/ops.js';
import { newId, nowIso } from '../util.js';

const MAX_SYNC_BYTES = 400_000;
const urlCache = new Map();

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Compact WebP/JPEG DataURL for cross-device preview sync (≤ ~MAX_SYNC_BYTES binary). */
function compressImageToDataUrl(objectUrl, maxDim = 1280, quality = 0.82) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const nw = img.naturalWidth || 150;
      const nh = img.naturalHeight || 150;
      const scale = Math.min(1, maxDim / Math.max(nw, nh));
      const w = Math.max(1, Math.round(nw * scale));
      const h = Math.max(1, Math.round(nh * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      let dataUrl = canvas.toDataURL('image/webp', quality);
      if (!dataUrl.startsWith('data:image/webp')) {
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(dataUrl.length <= MAX_SYNC_BYTES * 1.37 ? dataUrl : null);
    };
    img.onerror = () => resolve(null);
    img.src = objectUrl;
  });
}

function probeImageDimensions(url, maxSide = 260) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const nw = img.naturalWidth || 150;
      const nh = img.naturalHeight || 150;
      const scale = Math.min(1, maxSide / Math.max(nw, nh));
      resolve({
        width: Math.max(48, Math.round(nw * scale)),
        height: Math.max(48, Math.round(nh * scale)),
      });
    };
    img.onerror = () => resolve({ width: 150, height: 150 });
    img.src = url;
  });
}

async function sha256Hex(blob) {
  if (!globalThis.crypto?.subtle) return '';
  const buf = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function emitAssetChange() {
  emit('local-change', { documentIds: new Set() });
}

export function cachedAssetUrl(assetId) {
  return assetId ? (urlCache.get(assetId) || null) : null;
}

export async function resolveAssetUrl(assetId) {
  if (!assetId) return null;
  if (urlCache.has(assetId)) return urlCache.get(assetId);
  const row = await get('assets', assetId);
  if (row?.blob) {
    const url = URL.createObjectURL(row.blob);
    urlCache.set(assetId, url);
    return url;
  }
  if (row && row.upload_status === 'pending_download' && loggedIn()) {
    try {
      await downloadOne(row);
      return urlCache.get(assetId) || null;
    } catch (e) {
      console.warn('[assets] download failed', assetId, e);
    }
  }
  return null;
}

export async function warmAssetUrls(rows) {
  const ids = new Set();
  (rows || []).forEach((row) => {
    if (row?.type !== 'image' || !row.data_json) return;
    try {
      const data = JSON.parse(row.data_json)?.data;
      if (data?.['asset-id']) ids.add(data['asset-id']);
    } catch { /* ignore */ }
  });
  await Promise.all([...ids].map((id) => resolveAssetUrl(id)));
}

/** Store a picked file; returns fields for image block data_json. */
export async function storeImageFile(file) {
  if (!file || !String(file.type || '').startsWith('image/')) {
    throw new Error('Not an image');
  }
  const id = newId();
  const blob = file instanceof Blob ? file : new Blob([file]);
  const mime = file.type || blob.type || 'image/png';
  const filename = file.name || `image-${id}.png`;
  const sha256 = await sha256Hex(blob);
  const createdAt = nowIso();

  await put('assets', {
    id,
    blob,
    mime,
    name: filename,
    filename,
    size: blob.size,
    sha256,
    upload_status: 'pending',
    created_at: createdAt,
    deleted_at: null,
  });

  await put('operations', makeOperation('asset', id, 'asset_create', {
    id,
    filename,
    mime_type: mime,
    size_bytes: blob.size,
    sha256,
  }, createdAt));
  emitAssetChange();

  const objectUrl = URL.createObjectURL(blob);
  urlCache.set(id, objectUrl);

  const { width, height } = await probeImageDimensions(objectUrl);

  let url = null;
  if (blob.size <= MAX_SYNC_BYTES) {
    try {
      url = await blobToDataUrl(blob);
    } catch {
      url = null;
    }
  } else {
    url = await compressImageToDataUrl(objectUrl);
  }
  return { 'asset-id': id, url, objectUrl, width, height };
}

/** Insert metadata from a pulled asset_create (binary not yet downloaded). */
export async function insertRemoteAssetMetadata({
  id,
  filename,
  mimeType,
  sizeBytes,
  sha256,
  createdAt,
}) {
  if (!id) return;
  const existing = await get('assets', id);
  if (existing) return;
  await put('assets', {
    id,
    blob: null,
    mime: mimeType || 'application/octet-stream',
    name: filename || 'file',
    filename: filename || 'file',
    size: Number(sizeBytes) || 0,
    sha256: sha256 || '',
    upload_status: 'pending_download',
    created_at: createdAt || nowIso(),
    deleted_at: null,
  });
}

export async function markUploaded(assetId) {
  const row = await get('assets', assetId);
  if (!row) return;
  await put('assets', { ...row, upload_status: 'uploaded' });
}

export async function markDownloaded(assetId, blob) {
  const row = await get('assets', assetId);
  if (!row) return;
  const cached = urlCache.get(assetId);
  if (cached) {
    URL.revokeObjectURL(cached);
    urlCache.delete(assetId);
  }
  const objectUrl = URL.createObjectURL(blob);
  urlCache.set(assetId, objectUrl);
  await put('assets', {
    ...row,
    blob,
    size: blob.size || row.size,
    upload_status: 'uploaded',
  });
}

export async function softDeleteAsset(assetId) {
  if (!assetId) return;
  const now = nowIso();
  const cached = urlCache.get(assetId);
  if (cached) {
    URL.revokeObjectURL(cached);
    urlCache.delete(assetId);
  }
  await transaction(['assets', 'operations'], 'readwrite', async (s) => {
    const row = await req(s.assets.get(assetId));
    if (row) {
      s.assets.put({
        ...row,
        blob: null,
        deleted_at: now,
        upload_status: 'deleted',
      });
    }
    s.operations.put(makeOperation('asset', assetId, 'asset_delete', {
      deleted_at: now,
    }, now));
  });
  emitAssetChange();
}

export async function deleteAsset(assetId) {
  if (!assetId) return;
  const cached = urlCache.get(assetId);
  if (cached) {
    URL.revokeObjectURL(cached);
    urlCache.delete(assetId);
  }
  await transaction('assets', 'readwrite', async (s) => {
    await req(s.assets.delete(assetId));
  });
}

export async function markAssetDeletedLocal(assetId, deletedAt) {
  if (!assetId) return;
  const cached = urlCache.get(assetId);
  if (cached) {
    URL.revokeObjectURL(cached);
    urlCache.delete(assetId);
  }
  const row = await get('assets', assetId);
  if (!row) return;
  await put('assets', {
    ...row,
    blob: null,
    deleted_at: deletedAt || nowIso(),
    upload_status: 'deleted',
  });
}

async function downloadOne(row) {
  const blob = await downloadAssetFile(row.id);
  const expectedSize = Number(row.size) || 0;
  if (expectedSize > 0 && blob.size !== expectedSize) {
    throw new Error(`Asset download size mismatch (${row.id})`);
  }
  if (row.sha256 && globalThis.crypto?.subtle) {
    const actual = await sha256Hex(blob);
    if (actual && actual !== row.sha256) {
      throw new Error(`Asset download integrity check failed (${row.id})`);
    }
  }
  await markDownloaded(row.id, blob);
}

/** Upload all assets with upload_status=pending. */
export async function uploadPendingAssets() {
  if (!loggedIn()) return;
  const rows = (await getAll('assets')).filter(
    (r) => r && !r.deleted_at && r.upload_status === 'pending' && r.blob,
  );
  for (const row of rows) {
    try {
      await uploadAssetFile({
        id: row.id,
        filename: row.filename || row.name || 'file',
        mimeType: row.mime || 'application/octet-stream',
        sha256: row.sha256 || '',
        sizeBytes: row.size || row.blob.size,
        blob: row.blob,
      });
      await markUploaded(row.id);
    } catch (e) {
      console.warn('[assets] upload failed', row.id, e);
      if (e && e.network) throw e;
    }
  }
}

/** Download assets marked pending_download. */
export async function downloadMissingAssets() {
  if (!loggedIn()) return;
  const rows = (await getAll('assets')).filter(
    (r) => r && !r.deleted_at && r.upload_status === 'pending_download',
  );
  for (const row of rows) {
    try {
      await downloadOne(row);
    } catch (e) {
      console.warn('[assets] download failed', row.id, e);
      if (e && e.network) throw e;
    }
  }
}

/** Whether an unsynced op may be pushed (asset_create waits for upload). */
export async function isOpPushable(op) {
  if (!op || op.action !== 'asset_create') return true;
  const row = await get('assets', op.entity_id);
  return Boolean(row && row.upload_status === 'uploaded');
}

export function imageSrcFromData(data = {}) {
  if (data.url && /^(https?:|data:image\/)/i.test(data.url)) return data.url;
  const cached = cachedAssetUrl(data['asset-id']);
  if (cached) return cached;
  return data.url || '';
}
