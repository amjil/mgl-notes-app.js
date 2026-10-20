/**
 * Register the service worker (production) and surface install / update UX.
 */
import { t } from './i18n.js';
import { toast } from './ui/toast.js';

let deferredPrompt = null;
const installListeners = new Set();

export function onInstallAvailable(fn) {
  installListeners.add(fn);
  if (deferredPrompt) fn(true);
  return () => installListeners.delete(fn);
}

export function canInstall() {
  return !!deferredPrompt;
}

export async function promptInstall() {
  if (!deferredPrompt) return false;
  const prompt = deferredPrompt;
  deferredPrompt = null;
  installListeners.forEach((fn) => fn(false));
  prompt.prompt();
  const { outcome } = await prompt.userChoice;
  return outcome === 'accepted';
}

function setPrompt(e) {
  e.preventDefault();
  deferredPrompt = e;
  installListeners.forEach((fn) => fn(true));
}

export function initPwa() {
  window.addEventListener('beforeinstallprompt', setPrompt);
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installListeners.forEach((fn) => fn(false));
    toast(t('installDone'));
  });

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  const activateWaiting = (worker) => {
    if (!worker || worker.state !== 'installed' || !navigator.serviceWorker.controller) return;
    toast(t('updateReady'));
    worker.postMessage({ type: 'SKIP_WAITING' });
  };

  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then((reg) => {
    activateWaiting(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => activateWaiting(worker));
    });
  }).catch((e) => {
    console.warn('[pwa] sw register failed', e);
  });
}
