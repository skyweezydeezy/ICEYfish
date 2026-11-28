/* Service worker: lets the app open offline and keeps card images you've already seen. */
importScripts('version.js');                              // the version number: one more with every merge (see version.js)
const VERSION = 'isf-v' + self.ISF_VERSION;
const SHELL = ['./', 'index.html', 'version.js', 'styles.css', 'app.js', 'versus.js', 'remote.js', 'qr.js', 'remember.js', 'install.js', 'versus.css', 'decide.js', 'choices.js', 'choices.css', 'sim.js', 'source.js', 'charts.js', 'suggest.js', 'compare.js', 'tune.js', 'profile.js', 'tags.js', 'combos.js', 'decks/index.json', 'decks/fastest.json', 'looks.js', 'audio.js', 'card-sounds.js', 'card-effects.js', 'dice.js', 'battle.js', 'tutorial.js', 'tutorial.css', 'puzzle.js', 'puzzle-core.js', 'puzzle.css', 'puzzles.json', 'worker.js', 'manifest.webmanifest', 'logo.svg', 'donate-qr.jpg', 'whatsnew.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
const IMG = 'gf-img-v1';
const MAX_IMAGES = 600;
const LOCAL = location.hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(location.hostname);

// the page asks which version it is running (the version pill in the top bar)
self.addEventListener('message', e => { if (e.data === 'version' && e.ports && e.ports[0]) e.ports[0].postMessage({ version: VERSION }); });

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== IMG).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_IMAGES) await Promise.all(keys.slice(0, keys.length - MAX_IMAGES).map(k => cache.delete(k)));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // card images: cache-first (they never change)
  if (url.hostname === 'cards.scryfall.io') {
    e.respondWith(caches.open(IMG).then(async cache => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) { cache.put(req, res.clone()); trim(cache); }
      return res;
    }));
    return;
  }
  // the app itself: use the cached copy right away, refresh it in the background
  if (url.origin === location.origin && (url.pathname.endsWith('/sw.js') || url.pathname.endsWith('/version.js'))) return;          // always the deployed one: the version pill compares it with the running one
  if (url.origin === location.origin && !url.pathname.includes('/api/')) {
    e.respondWith(caches.open(VERSION).then(async cache => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
      // run from your own PC (start.bat): always show the files on disk, so an update shows up at once
      if (LOCAL) return net;
      return hit || net;
    }));
  }
});
