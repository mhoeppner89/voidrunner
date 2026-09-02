// The title screen is deliberately cheap to install. Optional art, models,
// and any future code-split modules enter this cache when the app requests
// them, instead of blocking the first service-worker install on every asset
// in the game.
const CACHE = 'voidrunner-v177-0-7-36-hybrid-flight';

// Keep only the title/dock shell's static module graph here. Mission data and
// cockpit silhouettes use their lightweight modules; the flight session,
// renderer, voxel builder, collision, Three.js, GLB loader, and ship showroom
// are loaded on demand after a sortie or shipyard interaction. This keeps the
// title screen bootable offline without precaching optional art or models.
const CORE_ASSETS = [
  './',
  './index.html',
  './favicon.svg',
  './manifest.webmanifest',
  './src/style.css',
  './src/main.js',
  './src/game/audio.js',
  './src/game/combatResources.js',
  './src/game/data.js',
  './src/game/economy.js',
  './src/game/galaxy.js',
  './src/game/galaxyContent.js',
  './src/game/i18n-de.js',
  './src/game/i18n.js',
  './src/game/missionWorldData.js',
  './src/game/missions.js',
  './src/game/outfitting.js',
  './src/game/pilots.js',
  './src/game/random.js',
  './src/game/racing.js',
  './src/game/save.js',
  './src/game/shipProfiles.js',
  './src/game/shipTopDownProfile.js',
  './src/game/shipStats.js',
  './src/game/shipTrade.js',
  './src/game/ui.js',
  './src/game/weapons.js',
  './art/title-cockpit.webp',
];

// Cache core files independently. A transient failure for one request must
// not turn an otherwise valid worker install into a failed install. The
// network-first fetch path below will fill any missing entry on the next load.
const cacheCoreAssets = async () => {
  const cache = await caches.open(CACHE);
  await Promise.all(CORE_ASSETS.map(async (asset) => {
    try {
      const response = await fetch(asset, { cache: 'no-cache' });
      if (response.ok)
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

// Return the response immediately while exposing the cache-write promise
// separately. Fetch handlers register that promise with waitUntil(), so the
// worker cannot be terminated between serving a response and persisting it.
const cacheResponse = (request, response) => {
  if (!response || !response.ok)
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
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached)
    return cached;
  if (request.mode === 'navigate')
    return (await cache.match('./index.html')) ?? (await cache.match('./')) ?? Response.error();
  return Response.error();
};

const cacheFirst = (request) => {
  let persistence = Promise.resolve();
  const response = (async () => {
    try {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      if (cached)
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
