/**
 * sw.js — offline support.
 * - Precaches the app shell + range data on install.
 * - App code: cache-first (fast, offline). Range JSON: network-first so a redeploy
 *   with new charts shows up on the next online launch.
 * - VERSION is stamped with the commit SHA by the GitHub Pages workflow, so every
 *   deploy produces a new cache and the old one is deleted.
 */
const VERSION = 'dev';
const CACHE = `poker-warmup-${VERSION}`;

const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css', 'version.json',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'js/app.js', 'js/store.js', 'js/ranges.js', 'js/engine.js', 'js/ui.js', 'js/reasons.js', 'js/hh-import.js',
  'js/lib/hands.js', 'js/lib/notation.js', 'js/lib/eval.js',
  'js/modules/home.js', 'js/modules/warmup.js', 'js/modules/drill.js', 'js/modules/summary.js',
  'js/modules/facing3bet.js', 'js/modules/preflop.js', 'js/modules/math.js', 'js/modules/checkin.js',
  'js/modules/dashboard.js', 'js/modules/history.js', 'js/modules/settings.js', 'js/modules/editor.js',
  'data/ranges/index.json', 'data/ranges/cash-rfi.json', 'data/ranges/cash-facing-open.json',
  'data/ranges/cash-facing-3bet.json', 'data/ranges/cash-shorthanded.json', 'data/ranges/mtt-pushfold.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.all(ASSETS.map((a) => c.add(new Request(a, { cache: 'reload' })).catch(() => null))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('poker-warmup-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const isData = req.url.includes('/data/') || req.url.endsWith('version.json');
  e.respondWith(isData ? networkFirst(req) : cacheFirst(req));
});

async function cacheFirst(req) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  } catch {
    // Navigations fall back to the shell
    if (req.mode === 'navigate') return caches.match('index.html');
    throw new Error('offline');
  }
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  } catch {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw new Error('offline');
  }
}
