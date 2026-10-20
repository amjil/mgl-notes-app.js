/* Production offline shell for MGL Notes (Traditional Mongolian). */
const CACHE_NAME = 'mgl-notes-shell-v1';
const FONT_CACHE = 'mgl-notes-fonts-v1';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
];

const FONTS = [
  './fonts/OyunQaganTig.ttf',
];

function isFontRequest(request, url) {
  if (request.destination === 'font') return true;
  return /\.(woff2?|ttf|otf)$/i.test(url.pathname);
}

function isLiveData(url) {
  if (url.pathname.startsWith('/api/')) return true;
  return url.port === '3003' || url.port === '4001';
}

async function putOk(cache, request, response) {
  if (response && response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function precache(cache, urls) {
  await Promise.all(urls.map(async (url) => {
    try {
      const res = await fetch(url, { cache: 'reload' });
      if (res.ok) await cache.put(url, res);
    } catch {
      /* missing optional assets must not fail install */
    }
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const [shell, fonts] = await Promise.all([
      caches.open(CACHE_NAME),
      caches.open(FONT_CACHE),
    ]);
    await Promise.all([
      precache(shell, SHELL),
      precache(fonts, FONTS),
    ]);
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((k) => k !== CACHE_NAME && k !== FONT_CACHE)
        .map((k) => caches.delete(k)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (url.pathname.endsWith('/sw.js')) return;

  // 1. API sync + remote IME lexicon: Network-Only (never cache)
  if (isLiveData(url)) return;

  // 2. Mongolian fonts: Cache-First so offline vertical text does not fall back
  if (isFontRequest(request, url)) {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const res = await fetch(request);
        return putOk(cache, request, res);
      }),
    );
    return;
  }

  // 3. Same-origin static assets + navigation: Stale-While-Revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then((res) => putOk(cache, request, res))
          .catch(() => null);

        if (cached) return cached;
        const net = await networkPromise;
        if (net) return net;
        if (request.mode === 'navigate') {
          return (await cache.match('./index.html'))
            || (await cache.match('./'))
            || Response.error();
        }
        return Response.error();
      }),
    );
  }
});
