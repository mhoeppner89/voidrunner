const CACHE = 'voidrunner-v105-0-6-0a-bar-circuit-racing';
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
    './src/game/entityStore.js',
    './src/game/game.js',
    './src/game/input.js',
    './src/game/laserFx.js',
    './src/game/missions.js',
    './src/game/pilots.js',
    './src/game/random.js',
    './src/game/racing.js',
    './src/game/weapons.js',
    './src/game/render.js',
    './src/game/save.js',
    './src/game/shipStats.js',
    './src/game/types.js',
    './src/game/i18n.js',
    './src/game/i18n-de.js',
    './src/game/ui.js',
    './src/game/worldData.js',
    './src/game/quests.js',
    './src/game/voxelModels.js',
    './src/game/glbLoader.js',
    './assets/models/ships/atlas.glb',
    './assets/models/ships/lancer.glb',
    './assets/models/ships/prospector.glb',
    './assets/models/ships/talon.glb',
    './assets/models/ships/vanguard.glb',
    './assets/models/ships/wayfarer.glb',
    './vendor/three.module.min.js',
    './vendor/three.core.min.js',
    './art/career-mining.webp',
    './art/locations/v3/azure.png',
    './art/locations/v3/azure-hd-v1.png',
    './art/locations/v3/bar-azure.png',
    './art/locations/v3/bar-azure-hd-v1.png',
    './art/locations/v3/bar-helix.png',
    './art/locations/v3/bar-helix-hd-v1.png',
    './art/locations/v3/bar-rook.png',
    './art/locations/v3/bar-rook-hd-v1.png',
    './art/locations/v3/bar-vesper.png',
    './art/locations/v3/bar-vesper-hd-v1.png',
    './art/locations/v3/helix.png',
    './art/locations/v3/helix-hd-v1.png',
    './art/locations/v3/market-azure.png',
    './art/locations/v3/market-azure-hd-v1.png',
    './art/locations/v3/market-helix.png',
    './art/locations/v3/market-helix-hd-v1.png',
    './art/locations/v3/market-rook.png',
    './art/locations/v3/market-rook-hd-v1.png',
    './art/locations/v3/market-vesper.png',
    './art/locations/v3/market-vesper-hd-v1.png',
    './art/locations/v3/rook.png',
    './art/locations/v3/rook-hd-v1.png',
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
    './assets/remaster/cockpit-vanguard.webp',
    './assets/remaster/cockpit-talon.webp',
    './assets/remaster/cockpit-prospector.webp',
    './assets/remaster/cockpit-lancer.webp',
    './assets/remaster/cockpit-atlas.webp',
    './assets/remaster/ship-isometric-wayfarer-vesper-lit.png',
    './assets/remaster/ship-isometric-wayfarer-vesper-lit-v2.png',
    './assets/remaster/ship-isometric-wayfarer-vesper-lit-v3.png',
    './assets/remaster/ship-isometric-talon-vesper-lit-v1.png',
    './assets/remaster/ship-isometric-vanguard-vesper-lit-v1.png',
    './assets/remaster/ship-isometric-prospector-vesper-lit-v1.png',
    './assets/remaster/ship-isometric-atlas-vesper-lit-v1.png',
    './assets/remaster/ship-isometric-lancer-vesper-lit-v1.png',
  ])));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});
// Immutable, content-addressed art (sprites, location plates, portraits, the
// cockpit frame, fonts): the URL only changes when a new image is published,
// so it never needs a blocking revalidation. Serve the cached copy immediately
// and refresh it in the background (stale-while-revalidate) so returning to a
// station never re-downloads the plates — the old network-first path forced a
// revalidation round trip on every image, every time.
const IMMUTABLE_ART = /\.(?:png|jpe?g|webp|gif|svg|avif|ico|woff2?|ttf|otf)$/i;
const isArtAsset = (request) => IMMUTABLE_ART.test(new URL(request.url).pathname);
const staleWhileRevalidate = async (request) => {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request, { cache: 'no-cache' }).then((response) => {
    if (response && response.ok)
      cache.put(request, response.clone());
    return response;
  }).catch(() => undefined);
  return cached ?? (await network);
};
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (isArtAsset(event.request)) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }
  // App shell (HTML/JS/CSS) stays network-first, but never trusts the HTTP
  // cache: GitHub Pages serves every asset with `max-age=600`, so after a
  // deploy a plain fetch() can keep returning the stale-but-fresh pre-deploy
  // bytes. `cache: 'no-cache'` forces conditional revalidation on every
  // request, so the moment a new build is live the next load picks it up.
  event.respondWith(fetch(event.request, { cache: 'no-cache' }).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});
