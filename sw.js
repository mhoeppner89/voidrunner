// The title and first room are deliberately small to install. Other art, models,
// and any future code-split modules enter this cache when the app requests
// them, instead of blocking the first service-worker install on every asset
// in the game.
const CACHE = 'voidrunner-v717-0-8-2qi-match-bots';

// Static title imports and the first room for an offline return. Flight code
// and optional models enter the release cache when a session requests them.
const CORE_ASSETS = [
  './',
  './index.html',
  './favicon.svg',
  './manifest.webmanifest',
  './src/style.css',
  './src/station-ui.css',
  './src/main.js',
  './src/game/modelDelivery.js',
  './src/game/gamepad.js',
  './src/game/controllerBindings.js',
  './src/game/haptics.js',
  './src/game/controllerUi.js',
  './src/game/retroDisplay.js',
  './src/game/stationOrientation.js',
  './src/game/interfaceTerms.js',
  './src/game/transitAudio.js',
  './assets/fonts/void-vga.ttf',
  './assets/fonts/void-vga-text.ttf',
  './assets/fonts/barlow-semi-condensed-400.woff2',
  './assets/fonts/barlow-semi-condensed-500.woff2',
  './assets/fonts/barlow-semi-condensed-600.woff2',
  './assets/fonts/barlow-semi-condensed-700.woff2',
  './vendor/three.module.min.js',
  './vendor/three.core.min.js',
  './src/game/adventureDialogues.js',
  './src/game/graveyardLayout.js',
  './src/game/graveyardRacing.js',
  './src/game/raceDynamics.js',
  './src/game/raceHulls.js',
  './src/game/racePilot.js',
  './src/game/flightDynamics.js',
  './src/game/combatTactics.js',
  './src/game/enemyLoadouts.js',
  './src/game/weaponDamage.js',
  './src/game/weaponFlight.js',
  './src/game/cockpitDamage.js',
  './src/game/cockpitArtwork.js',
  './src/game/cockpitDefinitions.js',
  './src/game/cockpits/vanguard.js',
  './src/game/cockpits/lancer.js',
  './src/game/cockpits/atlas.js',
  './src/game/cockpits/blade.js',
  './src/game/cockpits/astra.js',
  './src/game/cockpits/scrapper.js',
  './src/game/cockpits/speedster.js',
  './src/game/cockpits/demon.js',
  './src/game/cockpits/mule.js',
  './src/game/cockpits/prospector.js',
  './src/game/cockpits/legionary.js',
  './src/game/cockpits/andromeda.js',
  './src/game/cockpits/torsas.js',
  './src/game/fleetPaintCatalog.js',
  './src/game/fleetEquipmentData.js',
  './src/game/paintDesign.js',
  './src/game/shipPaintMaskCatalog.js',
  './src/game/soundBank.js',
  './src/game/soundBankManifest.js',
  './src/game/soundEvents.js',
  './src/game/audioEngine.js',
  './src/game/audioAmbience.js',
  './src/game/audioMusic.js',
  './src/game/musicKit.js',
  './src/game/musicScore.js',
  './src/game/musicSpace.js',
  './src/game/musicFlight.js',
  './src/game/musicDocked.js',
  './src/game/frigateMounts.js',
  './src/game/capitalHulls.js',
  './src/game/ordnanceMarkers.js',
  './src/game/capitalMarkerCount.js',
  './src/game/corvetteMounts.js',
  './src/game/cruiserModelData.js',
  './src/game/audio.js',
  './src/game/arenaRun.js',
  './src/game/wingOrders.js',
  './src/game/shipPool.js',
  './src/game/turretLayouts.js',
  './src/game/pdcFireControl.js',
  './src/game/combatResources.js',
  './src/game/data.js',
  './src/game/factions.js',
  './src/game/careerDanger.js',
  './src/game/leagueContent.js',
  './src/game/stationDocks.js',
  './src/game/stationTraffic.js',
  './src/game/playerDocking.js',
  './src/game/combatTravel.js',
  './src/game/droneData.js',
  './src/game/droneMining.js',
  './src/game/droneService.js',
  './src/game/economy.js',
  './src/game/galaxy.js',
  './src/game/galaxyContent.js',
  './src/game/i18n-de.js',
  './src/game/equipmentNaming.js',
  './src/game/i18n.js',
  './src/game/localContracts.js',
  './src/game/missionWorldData.js',
  './src/game/asteroidFieldLayout.js',
  './src/game/asteroidRoutes.js',
  './src/game/combatTargeting.js',
  './src/game/missions.js',
  './src/game/missionOfferRefresh.js',
  './src/game/outfitting.js',
  './src/game/equipmentCatalog.js',
  './src/game/equipmentInventory.js',
  './src/game/equipmentUi.js',
  './src/game/arenaRunView.js',
  './src/game/hullCardView.js',
  './src/game/arenaSites.js',
  './src/game/fieldRoadmap.js',
  './src/game/itemIcons.js',
  './src/game/itemSprites.js',
  './src/game/equipmentStatPresentation.js',
  './src/game/careerLoot.js',
  './src/game/explorationData.js',
  './src/game/distressData.js',
  './src/game/lootVisuals.js',
  './src/game/pilots.js',
  './src/game/quests.js',
  './src/game/random.js',
  './src/game/racing.js',
  './src/game/save.js',
  './src/game/careerMetrics.js',
  './src/game/playerStrength.js',
  './src/game/shipProfiles.js',
  './src/game/shipTopDownProfile.js',
  './src/game/shipStats.js',
  './src/game/shipTrade.js',
  './src/game/tutorialCampaign.js',
  './src/game/tutorialText.js',
  './src/game/ui.js',
  './src/game/uiIcons.js',
  './src/game/canvasSizeCache.js',
  './src/game/weapons.js',
  './art/title-cockpit.webp',
  './art/locations/simplified/helix-hd-v1.webp',
  './art/locations/simplified/bar-helix-hd-v1.webp',
  './art/locations/simplified/market-helix-hd-v1.webp',
  './art/portraits/simplified/mara-vek-hd-v2.webp',
  './art/portraits/simplified/rin-vek-hd-v1.webp',
  './assets/models/ships/wayfarer.glb',
  './vendor/meshoptimizer-0.24.0/meshopt_decoder.module.js',
];

const cacheCoreAssets = async () => {
  const cache = await caches.open(CACHE);
  // Leave connections available for title controls and the pilot's next action.
  for (let i = 0; i < CORE_ASSETS.length; i += 4) {
    await Promise.all(CORE_ASSETS.slice(i, i + 4).map(async asset => {
      try {
        const response = await fetch(asset, {cache: 'no-cache', priority: 'low'});
        if (response.ok && !(isArtAsset({url: new URL(asset, self.location.href).href}) && isHtmlResponse(response)))
          await cache.put(asset, response);
      } catch { /* The next online request retries a missing entry. */ }
    }));
  }
};

self.addEventListener('install', (event) => {
  event.waitUntil(cacheCoreAssets().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith('voidrunner-') && key !== CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

// Optional art and model URLs are cached on demand. Keep a cached response
// authoritative for this release: the cache name changes on deploy, and a
// background revalidation here would duplicate the GLB/image warmup requests
// issued by the title shell.
const IMMUTABLE_ART = /\.(?:png|jpe?g|webp|gif|svg|avif|ico|woff2?|ttf|otf|mp3|ogg|glb(?:\.gz)?)$/i;
const isSameOrigin = (request) => new URL(request.url).origin === self.location.origin;
const isArtAsset = (request) => IMMUTABLE_ART.test(new URL(request.url).pathname);
// Some static hosts return their HTML entry page with status 200 for missing
// assets. Such a response cannot be decoded as art and must not become an
// authoritative cache hit for the rest of the release.
const isHtmlResponse = (response) => /\b(?:text\/html|application\/xhtml\+xml)\b/i.test(response.headers.get('content-type') ?? '');

// Under quota pressure discard the oldest optional art first. Keep opening
// assets, code, visited cockpits and ship textures available for offline resume.
const corePaths = new Set(CORE_ASSETS.map(path => new URL(path, self.location.href).pathname));
let lastStorageCheck = 0;
async function trimOptionalArt(cache) {
  const now = Date.now();
  if (now - lastStorageCheck < 60000 || !self.navigator?.storage?.estimate) return;
  lastStorageCheck = now;
  const {usage, quota} = await self.navigator.storage.estimate();
  if (!quota || usage < quota * 0.85) return;
  const optional = (await cache.keys()).filter(request => {
    const path = new URL(request.url).pathname;
    return !corePaths.has(path) && /\/(?:models\/wrecks|art\/(?:locations|portraits))\//.test(path);
  });
  for (const old of optional.slice(0, Math.ceil(optional.length / 3))) await cache.delete(old);
}

// Return the response immediately while exposing the cache-write promise
// separately. Fetch handlers register that promise with waitUntil(), so the
// worker cannot be terminated between serving a response and persisting it.
const cacheResponse = (request, response) => {
  if (!response || !response.ok || (isArtAsset(request) && isHtmlResponse(response)))
    return { response, persistence: Promise.resolve() };
  try {
    const copy = response.clone();
    const persistence = caches.open(CACHE)
      .then(async cache => {
        if (isArtAsset(request)) await trimOptionalArt(cache).catch(() => {});
        await cache.put(request, copy);
      })
      .catch(() => undefined);
    return { response, persistence };
  }
  catch {
    // Storage quota, private-mode, and clone failures must not break the
    // network response.
    return { response, persistence: Promise.resolve() };
  }
};

// One network request produces both promises. Callers use `response` for the
// fetch result and register `persistence` with the active FetchEvent.
let foregroundTransfers = 0;
let wreckTransfer;
const fetchAndCache = (request) => {
  foregroundTransfers++;
  wreckTransfer?.abort();
  let persistence = Promise.resolve();
  const response = fetch(request, { cache: 'no-cache' })
    .then((networkResponse) => {
      const cached = cacheResponse(request, networkResponse);
      persistence = cached.persistence;
      return cached.response;
    })
    .catch(() => undefined);
  const lifetime = response.then(() => persistence, () => persistence).finally(() => { foregroundTransfers--; });
  return { response, lifetime };
};

const offlineFallback = async (request) => {
  try {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached)
      return cached;
    // The game is not an SPA with arbitrary URL routes. Serving index.html
    // at /output/... made report links open an old game with relative asset
    // URLs under /output/... instead of the actual report.
    const scope = new URL('./', self.location.href);
    const path = new URL(request.url).pathname;
    const gameEntry = [scope.pathname, `${scope.pathname}index.html`, `${scope.pathname}game.html`].includes(path);
    if (request.mode === 'navigate' && gameEntry) {
      const shell = (await cache.match('./index.html')) ?? (await cache.match('./'));
      if (shell) return shell;
    }
  }
  catch { /* Storage failure must still produce an honest offline page. */ }
  if (request.mode === 'navigate') {
    return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page unavailable offline</title><style>body{margin:10vh auto;padding:24px;max-width:540px;background:#081322;color:#e9f0f3;font:18px/1.5 system-ui}button{padding:12px 20px;font:inherit;cursor:pointer}</style><h1>Page unavailable offline</h1><p>This page has not been saved for offline use. Reconnect or restart the local preview server, then reload.</p><button onclick="location.reload()">Reload</button></html>`, {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  return Response.error();
};

const cacheFirst = (request) => {
  let persistence = Promise.resolve();
  const response = (async () => {
    try {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      if (cached && cached.ok && !isHtmlResponse(cached))
        return cached;
    }
    catch {
      // If storage is unavailable, still try the network once.
    }
    const network = fetchAndCache(request);
    persistence = network.lifetime;
    return (await network.response) ?? Response.error();
  })();
  // The variable is updated before the response awaits the network, so this
  // lifetime promise includes the cache write on a cache miss and resolves
  // immediately on a cache hit.
  const lifetime = response.then(() => persistence, () => persistence);
  return { response, lifetime };
};

let saveDataRequested = false;
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || !isSameOrigin(request))
    return;

  saveDataRequested = request.headers?.get('Save-Data') === 'on';
  // The worker and module cache are release-versioned together.
  const pathname = new URL(request.url).pathname;
  if (isArtAsset(request) || /\/(?:src|vendor)\/.*\.(?:js|css)$/.test(pathname)) {
    const cache = cacheFirst(request);
    event.waitUntil(cache.lifetime);
    event.respondWith(cache.response);
    return;
  }

  // Navigations discover updates and retain a readable offline fallback.
  const network = fetchAndCache(request);
  event.waitUntil(network.lifetime);
  event.respondWith(network.response.then(response => response ?? offlineFallback(request)));
});

// The flight loop grants one transfer at a time and withdraws it on combat or
// docking. Cache the response body directly, without inflating or decoding it.
self.addEventListener('message', event => {
  const {type, file} = event.data ?? {};
  const port = event.ports[0];
  if (type !== 'cache-wreck' || !port || !/^assets\/models\/wrecks\/[\w-]+\.glb(?:\.gz)?$/.test(file)) return;
  const connection = self.navigator?.connection;
  if (foregroundTransfers || wreckTransfer || saveDataRequested || connection?.saveData ||
      ['slow-2g', '2g'].includes(connection?.effectiveType)) { port.postMessage(false); port.close(); return; }
  const controller = new AbortController();
  wreckTransfer = controller;
  port.onmessage = () => controller.abort();
  event.waitUntil((async () => {
    let saved = false;
    try {
      const cache = await caches.open(CACHE);
      if (!await cache.match(file)) {
        const response = await fetch(file, {priority:'low', signal:controller.signal});
        if (!response.ok || isHtmlResponse(response)) return;
        await trimOptionalArt(cache).catch(() => {});
        await cache.put(file, response);
      }
      saved = true;
    } catch { /* Offline, interrupted or out of quota: retry on a later idle flight. */ }
    finally { wreckTransfer = undefined; port.postMessage(saved); port.close(); }
  })());
});
