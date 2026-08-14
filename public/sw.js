const CACHE = 'voidrunner-v7-portrait-remaster';
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([
    './',
    './index.html',
    './favicon.svg',
    './manifest.webmanifest',
    './src/style.css',
    './src/main.js',
    './src/game/audio.js',
    './src/game/data.js',
    './src/game/economy.js',
    './src/game/game.js',
    './src/game/input.js',
    './src/game/missions.js',
    './src/game/random.js',
    './src/game/render.js',
    './src/game/save.js',
    './src/game/shipStats.js',
    './src/game/types.js',
    './src/game/ui.js',
    './src/game/worldData.js',
    './vendor/three.module.min.js',
    './vendor/three.core.min.js',
    './art/career-mining.webp',
    './art/locations/v3/azure.png',
    './art/locations/v3/bar-azure.png',
    './art/locations/v3/bar-helix.png',
    './art/locations/v3/bar-rook.png',
    './art/locations/v3/bar-vesper.png',
    './art/locations/v3/helix.png',
    './art/locations/v3/market-azure.png',
    './art/locations/v3/market-helix.png',
    './art/locations/v3/market-rook.png',
    './art/locations/v3/market-vesper.png',
    './art/locations/v3/rook.png',
    './art/locations/v3/vesper.png',
    './art/portraits/captain-dorne.webp',
    './art/portraits/devi-castor.webp',
    './art/portraits/doctor-ames.webp',
    './art/portraits/ivo-senn.webp',
    './art/portraits/kes-ali.webp',
    './art/portraits/linh-sorel.webp',
    './art/portraits/mara-vek.webp',
    './art/portraits/oskar-brill.webp',
    './art/portraits/ren-iverson.webp',
    './art/portraits/sana-kell.webp',
    './art/portraits/tovik.webp',
    './art/portraits/yara-tan.webp',
    './art/sprites/player-courier/01.png',
    './art/sprites/cargo-hauler/01.png',
    './art/title-cockpit.webp',
    './assets/remaster/cockpit-frame.webp',
  ])));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});
