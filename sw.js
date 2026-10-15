// The title and first room are deliberately small to install. Other art, models,
// and any future code-split modules enter this cache when the app requests
// them, instead of blocking the first service-worker install on every asset
// in the game.
const CACHE = 'voidrunner-v433-0-8-2gp-mining-transition';

// Keep only the title/dock shell's static module graph here. Mission data and
// cockpit silhouettes use their lightweight modules; the flight session,
// renderer, voxel builder, collision, Three.js, GLB loader, and ship showroom
// are loaded on demand after a sortie or shipyard interaction. This keeps the
// title screen bootable offline without precaching optional art or models.
// Drone data and service quotes are shell dependencies. Flight-only
// Drone modules are precached below; other flight modules are cached on first request
// with game.js, preserving the lazy flight module graph.
const CORE_ASSETS = [
  './',
  './index.html',
  './favicon.svg',
  './manifest.webmanifest',
  './src/style.css',
  './src/main.js',
  './vendor/three.module.min.js',
  './vendor/three.core.min.js',
  './src/game/adventureDialogues.js',
  './src/game/combatTactics.js',
  './src/game/enemyLoadouts.js',
  './src/game/npcGunnery.js',
  './src/game/turretClearance.js',
  './src/game/turrets.js',
  './src/game/weaponDamage.js',
  './src/game/weaponFlight.js',
  './src/game/cockpitDamage.js',
  './src/game/fleetPaintCatalog.js',
  './src/game/fleetEquipmentData.js',
  './src/game/fleetTurretClearance.js',
  './src/game/fleetPaint.js',
  './src/game/independentPaints.js',
  './src/game/wayfarerLiveries.js',
  './src/game/explosionFx.js',
  './src/game/capitalEngineExhaust.js',
  './src/game/battleshipModels.js',
  './src/game/battleshipModelData.js',
  './src/game/carrierModels.js',
  './src/game/carrierModelData.js',
  './src/game/sampleSfx.js',
  './src/game/sampleSfxManifest.js',
  './src/game/repairSites.js',
  './src/game/repairDrones.js',
  './src/game/capitalCombat.js',
  './src/game/npcDrones.js',
  './src/game/frigateMounts.js',
  './src/game/frigateComponents.js',
  './src/game/frigateCollisionData.js',
  './src/game/cruiserCombat.js',
  './src/game/cruiserModels.js',
  './src/game/cruiserModelData.js',
  './src/game/cruiserCollisionData.js',
  './src/game/audio.js',
  './src/game/arenaRun.js',
  './src/game/wingOrders.js',
  './src/game/shipPool.js',
  './src/game/turretLayouts.js',
  './src/game/turretModels.js',
  './src/game/turretModelData.js',
  './src/game/ordnanceModels.js',
  './src/game/ordnanceModelData.js',
  './assets/models/ordnance/ordnance-atlas.png',
  './src/game/pdcFireControl.js',
  './src/game/combatResources.js',
  './src/game/data.js',
  './src/game/factions.js',
  './src/game/careerDanger.js',
  './src/game/leagueContent.js',
  './src/game/blackHole.js',
  './src/game/stationOccupants.js',
    './src/game/shipLivery.js',
    './src/game/stationDocks.js',
    './src/game/stationTraffic.js',
    './src/game/stationCollision.js',
    './src/game/collisionSat.js',
    './src/game/shipCollisionData.js',
    './src/game/shipCollision.js',
    './src/game/shipLanding.js',
    './src/game/meshQueries.js',
    './src/game/surfaceMeshCandidates.js',
    './src/game/playerDocking.js',
    './src/game/combatTravel.js',
    './src/game/stationActivity.js',
  './src/game/droneData.js',
  './src/game/droneMining.js',
  './src/game/dronePdc.js',
  './src/game/droneService.js',
  './src/game/droneSystem.js',
  './src/game/droneFlight.js',
  './src/game/miningSurface.js',
  './src/game/economy.js',
  './src/game/galaxy.js',
  './src/game/galaxyContent.js',
  './src/game/i18n-de.js',
    './src/game/equipmentNaming.js',
  './src/game/i18n.js',
  './src/game/localContracts.js',
  './src/game/missionWorldData.js',
  './src/game/combatTargeting.js',
  './src/game/combatPiloting.js',
  './src/game/combatPlanning.js',
  './src/game/combatAwareness.js',
  './src/game/combatRecovery.js',
  './src/game/missions.js',
  './src/game/missionOfferRefresh.js',
  './src/game/outfitting.js',
  './src/game/equipmentCatalog.js',
  './src/game/equipmentInventory.js',
  './src/game/equipmentUi.js',
  './src/game/itemIcons.js',
  './src/game/equipmentStatPresentation.js',
  './src/game/careerLoot.js',
  './src/game/pilots.js',
  './src/game/quests.js',
  './src/game/random.js',
  './src/game/racing.js',
  './src/game/save.js',
  './src/game/careerMetrics.js',
  './src/game/playerStrength.js',
  './src/game/sensors.js',
  './src/game/shipProfiles.js',
  './src/game/shipTopDownProfile.js',
  './src/game/shipStats.js',
  './src/game/shipTrade.js',
  './src/game/tutorialCampaign.js',
  './src/game/tutorialText.js',
  './src/game/tutorialRuntime.js',
  './src/game/ui.js',
  './src/game/canvasSizeCache.js',
  './src/game/weapons.js',
  './art/title-cockpit.webp',
  './assets/remaster/cockpit-wayfarer-sprite.png',
  // A new career must have its actual first-room artwork when offline,
  // rather than only a cached shell with broken image placeholders.
  './art/locations/simplified/helix-hd-v1.webp',
  './art/locations/simplified/bar-helix-hd-v1.webp',
  './art/locations/simplified/market-helix-hd-v1.webp',
  './art/portraits/simplified/mara-vek-hd-v2.webp',
  './art/portraits/simplified/rin-vek-hd-v1.webp',
  './assets/remaster/landed-flat/wayfarer.webp',
];

// Cache core files independently. A transient failure for one request must
// not turn an otherwise valid worker install into a failed install. The
// network-first fetch path below will fill any missing entry on the next load.
const cacheCoreAssets = async () => {
  const cache = await caches.open(CACHE);
  await Promise.all(CORE_ASSETS.map(async (asset) => {
    try {
      const response = await fetch(asset, { cache: 'no-cache' });
      if (response.ok && !(isArtAsset({ url: new URL(asset, self.location.href).href }) && isHtmlResponse(response)))
        await cache.put(asset, response);
    }
    catch {
      // Keep installing. Offline fallback remains available for files that
      // did succeed, and a later online request can populate this entry.
    }
  }));
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
const IMMUTABLE_ART = /\.(?:png|jpe?g|webp|gif|svg|avif|ico|woff2?|ttf|otf|glb)$/i;
const isSameOrigin = (request) => new URL(request.url).origin === self.location.origin;
const isArtAsset = (request) => IMMUTABLE_ART.test(new URL(request.url).pathname);
// Some static hosts return their HTML entry page with status 200 for missing
// assets. Such a response cannot be decoded as art and must not become an
// authoritative cache hit for the rest of the release.
const isHtmlResponse = (response) => /\b(?:text\/html|application\/xhtml\+xml)\b/i.test(response.headers.get('content-type') ?? '');

// Return the response immediately while exposing the cache-write promise
// separately. Fetch handlers register that promise with waitUntil(), so the
// worker cannot be terminated between serving a response and persisting it.
const cacheResponse = (request, response) => {
  if (!response || !response.ok || (isArtAsset(request) && isHtmlResponse(response)))
    return { response, persistence: Promise.resolve() };
  try {
    const copy = response.clone();
    const persistence = caches.open(CACHE)
      .then((cache) => cache.put(request, copy))
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
const fetchAndCache = (request) => {
  let persistence = Promise.resolve();
  const response = fetch(request, { cache: 'no-cache' })
    .then((networkResponse) => {
      const cached = cacheResponse(request, networkResponse);
      persistence = cached.persistence;
      return cached.response;
    })
    .catch(() => undefined);
  const lifetime = response.then(() => persistence, () => persistence);
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

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || !isSameOrigin(request))
    return;

  if (isArtAsset(request)) {
    const cache = cacheFirst(request);
    event.waitUntil(cache.lifetime);
    event.respondWith(cache.response);
    return;
  }

  // HTML, JavaScript, CSS, and non-core modules remain network-first with
  // explicit revalidation, so a deploy is visible on the next load. Cached
  // shell/module responses keep the game usable when the network is absent.
  const network = fetchAndCache(request);
  event.waitUntil(network.lifetime);
  event.respondWith((async () => {
    return (await network.response) ?? (await offlineFallback(request));
  })());
});
