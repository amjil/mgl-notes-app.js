/**
 * Binary asset upload / download (Flutter-compatible).
 * Separate from the Operation log — mirrors notes-app.services.asset-sync.
 */
import { apiBase } from '../config.js';
import { clearSession, token } from '../session.js';
import { ApiError } from './client.js';

function authHeaders(extra = {}) {
  const headers = { Accept: 'application/json', ...extra };
  if (token()) headers.Authorization = `Bearer ${token()}`;
  return headers;
}

function errorMessage(body, status) {
  if (body && typeof body === 'object') {
    if (typeof body.error === 'string') return body.error;
    if (body.error && typeof body.error.message === 'string') return body.error.message;
    if (typeof body.message === 'string') return body.message;
  }
  return `HTTP ${status}`;
}

/** POST /api/assets/upload (multipart) */
export async function uploadAssetFile({
  id,
  filename,
  mimeType,
  sha256,
  sizeBytes,
  blob,
}) {
  const url = `${apiBase()}/api/assets/upload`;
  const form = new FormData();
  form.append('id', id);
  form.append('filename', filename || 'file');
  form.append('mime_type', mimeType || 'application/octet-stream');
  form.append('sha256', sha256 || '');
  form.append('size_bytes', String(sizeBytes ?? blob?.size ?? 0));
  form.append('file', blob, filename || 'file');

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    });
  } catch (e) {
    throw new ApiError('Cannot reach sync server', { status: 0, body: String(e) });
  }

  if (res.status === 401) clearSession('expired');
  if (!res.ok) {
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    throw new ApiError(errorMessage(data, res.status), { status: res.status, body: data });
  }
  return true;
}

/** GET /api/assets/:id → Blob */
export async function downloadAssetFile(id) {
  if (!id) throw new ApiError('Missing asset id', { status: 400 });
  const url = `${apiBase()}/api/assets/${encodeURIComponent(id)}`;

  let res;
  try {
    res = await fetch(url, { method: 'GET', headers: authHeaders() });
  } catch (e) {
    throw new ApiError('Cannot reach sync server', { status: 0, body: String(e) });
  }

  if (res.status === 401) clearSession('expired');
  if (!res.ok) {
    throw new ApiError(`Asset download failed: HTTP ${res.status}`, { status: res.status });
  }
  return res.blob();
}
