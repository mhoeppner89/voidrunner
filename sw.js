const CACHE = 'voidrunner-v160-0-7-19-torn-wrecks';
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
    './src/game/galaxy.js',
    './src/game/galaxyContent.js',
    './src/game/combatResources.js',
    './src/game/economy.js',
    './src/game/outfitting.js',
    './src/game/entityStore.js',
    './src/game/game.js',
    './src/game/hullCollision.js',
    './src/game/input.js',
    './src/game/laserFx.js',
    './src/game/missions.js',
    './src/game/npcNav.js',
    './src/game/pilots.js',
    './src/game/random.js',
    './src/game/racing.js',
    './src/game/weapons.js',
    './src/game/render.js',
    './src/game/save.js',
    './src/game/shipStats.js',
    './src/game/shipMounts.js',
    './src/game/shipPreview.js',
    './src/game/shipProfiles.js',
    './src/game/shipTrade.js',
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
    './art/commodities/arms.webp',
    './art/commodities/electronics.webp',
    './art/commodities/food.webp',
    './art/commodities/gold.webp',
    './art/commodities/luxuries.webp',
    './art/commodities/machinery.webp',
    './art/commodities/medicine.webp',
    './art/commodities/ore.webp',
    './art/commodities/scrap.webp',
    './art/commodities/water.webp',
    './art/outfitting/armor-mk2.webp',
    './art/outfitting/cargo-pods.webp',
    './art/outfitting/engine-mk2.webp',
    './art/outfitting/gauss-cannon.webp',
    './art/outfitting/ion-blaster.webp',
    './art/outfitting/mining-mk2.webp',
    './art/outfitting/mortar.webp',
    './art/outfitting/pdc.webp',
    './art/outfitting/pulse-cannon.webp',
    './art/outfitting/pulse-mk2.webp',
    './art/outfitting/radar-mk2.webp',
    './art/outfitting/ripper.webp',
    './art/outfitting/salvage-mk2.webp',
    './art/outfitting/seeker-launcher.webp',
    './art/outfitting/shield-mk2.webp',
    './art/outfitting/swarm-launcher.webp',
    './art/outfitting/thrusters-mk2.webp',
    './art/outfitting/torpedo-launcher.webp',
    './art/outfitting/v2/dealer-mechanic-portrait-v2.png',
    './art/outfitting/v2/dealer-workshop-backdrop-v2.png',
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
    './art/locations/v4/argent.webp',
    './art/locations/v4/blackglass.webp',
    './art/locations/v4/boreal.webp',
    './art/locations/v4/cairn.webp',
    './art/locations/v4/cinder.webp',
    './art/locations/v4/gatehouse-twelve.webp',
    './art/locations/v4/meridian-prime.webp',
    './art/locations/v4/nacre.webp',
    './art/locations/v4/shepherd.webp',
    './art/locations/v4/torchwell.webp',
    './art/locations/v5/bar-argent-hd-v1.png',
    './art/locations/v5/bar-blackglass-hd-v1.png',
    './art/locations/v5/bar-boreal-hd-v1.png',
    './art/locations/v5/bar-cairn-hd-v1.png',
    './art/locations/v5/bar-cinder-hd-v1.png',
    './art/locations/v5/bar-meridian-prime-hd-v1.png',
    './art/locations/v5/bar-nacre-hd-v1.png',
    './art/locations/v5/market-argent-hd-v1.png',
    './art/locations/v5/market-blackglass-hd-v1.png',
    './art/locations/v5/market-boreal-hd-v1.png',
    './art/locations/v5/market-cinder-hd-v1.png',
    './art/locations/v5/market-meridian-prime-hd-v1.png',
    './art/locations/v5/market-nacre-hd-v1.png',
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
// cockpit frame, fonts, and versioned GLB models): the URL changes when a new
// asset is published, so it never needs a blocking revalidation. Serve the
// cached copy immediately and refresh it in the background
// (stale-while-revalidate) so returning to a station or capital-ship patrol
// never waits for the same large asset twice.
const IMMUTABLE_ART = /\.(?:png|jpe?g|webp|gif|svg|avif|ico|woff2?|ttf|otf|glb)$/i;
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
