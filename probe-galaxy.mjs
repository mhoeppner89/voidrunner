// Focused browser regression probe for the 0.7.10 galaxy slice.
//
// This uses the stable browser hooks plus the live runtime travel control. It
// checks the real navigation map, renderer system filter, dock UI, persistence
// path, and the data-only route helpers in the browser that consumes them.
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

let chromium;
try {
    ({ chromium } = await import('playwright'));
}
catch {
    // Playwright is bundled with the Codex desktop runtime rather than this
    // small game repository, so keep the probe runnable without package edits.
    ({ chromium } = await import('/Users/mhoeppner/.codex/node_modules/playwright/index.mjs'));
}

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const BASE_URL = process.env.VOIDRUNNER_BASE_URL ?? 'http://127.0.0.1:4173/';
const BASE_PORT = new URL(BASE_URL).port || '4173';
const QA_DIR = '/tmp/voidrunner-galaxy-qa';
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const checks = [];
const pageErrors = [];
const check = (name, ok, detail = '') => {
    checks.push({ name, ok: Boolean(ok), detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` · ${detail}` : ''}`);
};

const serverIsReady = async () => {
    try {
        const response = await fetch(BASE_URL);
        return response.ok;
    }
    catch {
        return false;
    }
};

const ensureServer = async () => {
    if (await serverIsReady())
        return null;
    const server = spawn('python3', ['-m', 'http.server', BASE_PORT, '--bind', '127.0.0.1'], {
        cwd: ROOT,
        stdio: ['ignore', 'ignore', 'ignore'],
    });
    for (let attempt = 0; attempt < 60; attempt += 1) {
        if (await serverIsReady())
            return server;
        await wait(100);
    }
    server.kill();
    throw new Error(`local game server did not become ready on port ${BASE_PORT}`);
};

const waitForHook = async (page) => {
    await page.waitForFunction(() => Boolean(window.__VOID_PRIVATEER__), undefined, { timeout: 15000 });
};

const waitForState = async (page, predicate, label) => {
    await page.waitForFunction(predicate, undefined, { timeout: 15000 }).catch((error) => {
        throw new Error(`timed out waiting for ${label}: ${error.message}`);
    });
};

let server;
let browser;
try {
    await mkdir(QA_DIR, { recursive: true });
    server = await ensureServer();
    browser = await chromium.launch({
        headless: true,
        args: ['--disable-gpu', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu-sandbox'],
    });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const captureLocationApproach = async (locationId, filename, distanceScale = 3.4) => {
        await page.evaluate(async ({ id, distanceScale: scale }) => {
            const runtime = window.__VOID_PRIVATEER__.getRuntime();
            const { LOCATIONS } = await import('/src/game/data.js');
            const THREE = await import('/vendor/three.module.min.js');
            const location = LOCATIONS[id];
            const center = new THREE.Vector3(...location.position);
            const distance = Math.max(1200, location.radius * scale);
            const position = center.clone().add(new THREE.Vector3(location.radius * 0.62, location.radius * 0.24, distance));
            const direction = center.clone().sub(position).normalize();
            const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
            runtime.save.player.position = [position.x, position.y, position.z];
            runtime.save.player.rotation = [rotation.x, rotation.y, rotation.z, rotation.w];
            runtime.save.player.velocity = [0, 0, 0];
            runtime.save.player.angularVelocity = [0, 0, 0];
            runtime.save.player.throttle = 0;
            runtime.save.player.navTargetId = id;
            runtime.save.player.currentTargetId = id;
            runtime.resetPlayerInterpolation(true);
            runtime.updateActiveInstance(true);
            runtime.renderer.setTarget(undefined, undefined, undefined, id);
        }, { id: locationId, distanceScale });
        await wait(220);
        await page.screenshot({ path: `${QA_DIR}/${filename}`, fullPage: true });
    };
    page.on('pageerror', (error) => pageErrors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
        if (message.type() === 'error')
            pageErrors.push(`console.error: ${message.text()}`);
    });

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await waitForHook(page);
    await page.evaluate(() => window.__VOID_PRIVATEER__.newGame());
    await waitForState(page, () => window.__VOID_PRIVATEER__.getState()?.player?.dockedAt === 'helix', 'new Helios Verge career');

    const newState = await page.evaluate(() => {
        const state = window.__VOID_PRIVATEER__.getState();
        return { systemId: state.player.systemId, dockedAt: state.player.dockedAt };
    });
    check('new game starts in Helios Verge', newState.systemId === 'helios-verge', JSON.stringify(newState));

    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime()?.dockAt?.('cairn'));
    await waitForState(page, () => window.__VOID_PRIVATEER__.getState()?.player?.dockedAt === 'cairn', 'Cairn Yard docking');
    await page.waitForSelector('#dock-screen:not(.is-hidden)', { timeout: 5000 });
    const cairnConcourse = await page.evaluate(() => ({
        location: document.querySelector('#dock-screen')?.dataset.location,
        art: document.querySelector('#dock-screen .dock-backdrop img')?.getAttribute('src') ?? '',
        proceduralPlate: Boolean(document.querySelector('#dock-screen .procedural-location-plate')),
        services: Boolean(document.querySelector('[data-dock-hotspot="services"]')),
        raceDesk: Boolean(document.querySelector('[data-dock-hotspot="bar"]')),
        market: Boolean(document.querySelector('[data-dock-hotspot="market"]')),
        commodityMarket: Boolean(document.querySelector('[data-market-point="commodities"]')),
        shipyard: Boolean(document.querySelector('[data-market-point="shipyard"]')),
    }));
    check('Cairn Yard concourse shows services and race desk only', cairnConcourse.location === 'cairn'
        && cairnConcourse.art.endsWith('/art/locations/v6/concourse-cairn-hd-v2.png')
        && !cairnConcourse.proceduralPlate
        && cairnConcourse.services
        && cairnConcourse.raceDesk
        && !cairnConcourse.market
        && !cairnConcourse.commodityMarket
        && !cairnConcourse.shipyard, JSON.stringify(cairnConcourse));
    await page.screenshot({ path: `${QA_DIR}/cairn-concourse-race-desk.png`, fullPage: true });

    await page.locator('[data-dock-hotspot="services"]').click();
    await page.waitForSelector('#dock-screen .service-grid', { timeout: 5000 });
    const cairnServices = await page.evaluate(() => ({
        repair: Boolean(document.querySelector('#dock-screen [data-ui-command="repair"]')),
        fuel: Boolean(document.querySelector('#dock-screen [data-ui-command="refuel"]')),
    }));
    check('Cairn Yard service desk offers repairs and fuel', cairnServices.repair && cairnServices.fuel, JSON.stringify(cairnServices));
    await page.locator('[data-ui-command="dock-concourse"]').click();
    await page.waitForSelector('#dock-screen [data-dock-hotspot="bar"]', { timeout: 5000 });
    await page.locator('[data-dock-hotspot="bar"]').click();
    await page.waitForSelector('#dock-screen .bar-scene', { timeout: 5000 });
    const cairnBoard = await page.evaluate(() => ({
        bar: Boolean(document.querySelector('#dock-screen .bar-scene')),
        raceBoard: Boolean(document.querySelector('#dock-screen [data-bar-panel="missions"]')),
        market: Boolean(document.querySelector('#dock-screen [data-market-point="commodities"]')),
        shipyard: Boolean(document.querySelector('#dock-screen [data-market-point="shipyard"]')),
    }));
    check('Cairn Yard bar exposes the race board without market or shipyard', cairnBoard.bar
        && cairnBoard.raceBoard
        && !cairnBoard.market
        && !cairnBoard.shipyard, JSON.stringify(cairnBoard));
    await page.locator('[data-bar-panel="missions"]').click();
    await page.waitForSelector('#dock-screen .mission-card', { timeout: 5000 });
    const cairnRaces = await page.evaluate(async () => {
        const { raceOffersForLocation } = await import('/src/game/racing.js');
        const expected = raceOffersForLocation('cairn');
        const cards = [...document.querySelectorAll('#dock-screen .mission-card.race')];
        const ids = cards.map((card) => card.querySelector('[data-mission-id]')?.dataset.missionId).filter(Boolean);
        const normalizedIds = ids.map((id) => id.replace(/^race-/, ''));
        return { expected, ids, normalizedIds, count: cards.length };
    });
    check('Cairn Yard lists all three Mourning Line races', cairnRaces.expected.length === 3
        && cairnRaces.expected.every((id) => cairnRaces.normalizedIds.includes(id)), JSON.stringify(cairnRaces));

    await page.evaluate(() => window.__VOID_PRIVATEER__.launch());
    await waitForState(page, () => !window.__VOID_PRIVATEER__.getState()?.player?.dockedAt, 'launch into Helios Verge');
    const galaxyQuality = await page.evaluate(async () => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const THREE = await import('/vendor/three.module.min.js');
        const concourseArt = {
            cairn: '/art/locations/v6/concourse-cairn-hd-v2.png',
            'meridian-prime': '/art/locations/v6/concourse-meridian-prime-hd-v2.png',
            argent: '/art/locations/v6/concourse-argent-hd-v2.png',
            'gatehouse-twelve': '/art/locations/v6/concourse-gatehouse-twelve-hd-v2.png',
            blackglass: '/art/locations/v6/concourse-blackglass-hd-v2.png',
            cinder: '/art/locations/v6/concourse-cinder-hd-v2.png',
            torchwell: '/art/locations/v6/concourse-torchwell-hd-v2.png',
            nacre: '/art/locations/v6/concourse-nacre-hd-v2.png',
            boreal: '/art/locations/v6/concourse-boreal-hd-v2.png',
            shepherd: '/art/locations/v6/concourse-shepherd-hd-v2.png',
        };
        const artIds = Object.keys(concourseArt);
        const art = await Promise.all(artIds.map(async (id) => {
            const path = concourseArt[id];
            const response = await fetch(path);
            return { id, ok: response.ok, markup: runtime.ui.locationIllustration(id).includes(path.slice(1)) };
        }));
        const serviceArtPaths = {
            'meridian-prime': {
                bar: '/art/locations/v5/bar-meridian-prime-hd-v1.png',
                market: '/art/locations/v5/market-meridian-prime-hd-v1.png',
            },
            argent: {
                bar: '/art/locations/v6/bar-argent-hd-v2.png',
                market: '/art/locations/v6/market-argent-hd-v2.png',
            },
            blackglass: {
                bar: '/art/locations/v6/bar-blackglass-hd-v2.png',
                market: '/art/locations/v6/market-blackglass-hd-v2.png',
            },
            cinder: {
                bar: '/art/locations/v6/bar-cinder-hd-v2.png',
                market: '/art/locations/v6/market-cinder-hd-v2.png',
            },
            nacre: {
                bar: '/art/locations/v5/bar-nacre-hd-v1.png',
                market: '/art/locations/v5/market-nacre-hd-v1.png',
            },
            boreal: {
                bar: '/art/locations/v6/bar-boreal-hd-v2.png',
                market: '/art/locations/v5/market-boreal-hd-v1.png',
            },
        };
        const majorServiceIds = Object.keys(serviceArtPaths);
        const serviceArt = await Promise.all(majorServiceIds.map(async (id) => {
            const { bar: barPath, market: marketPath } = serviceArtPaths[id];
            const [barResponse, marketResponse] = await Promise.all([fetch(barPath), fetch(marketPath)]);
            return {
                id,
                barOk: barResponse.ok,
                marketOk: marketResponse.ok,
                barMarkup: runtime.ui.locationIllustration(id, 'bar').includes(barPath.slice(1)),
                marketMarkup: runtime.ui.locationIllustration(id, 'market').includes(marketPath.slice(1)),
                distinct: runtime.ui.locationIllustration(id, 'bar') !== runtime.ui.locationIllustration(id, 'market'),
            };
        }));
        const cairnBarPath = '/art/locations/v6/mission-cairn-hd-v1.png';
        const cairnBar = {
            ok: (await fetch(cairnBarPath)).ok,
            markup: runtime.ui.locationIllustration('cairn', 'bar').includes(cairnBarPath.slice(1)),
        };
        const stationIds = ['cairn', 'argent', 'gatehouse-twelve', 'cinder', 'torchwell', 'nacre', 'shepherd'];
        const stations = stationIds.map((id) => {
            const model = runtime.renderer.locationMeshes.get(id)?.getObjectByName(`station-identity-${id}`);
            return {
                id,
                identity: model?.userData.stationIdentity,
                highDetail: model?.userData.highDetail,
                detailMeshes: model?.userData.detailMeshes ?? 0,
            };
        });
        const blackglass = runtime.renderer.locationMeshes.get('blackglass');
        const fields = ['foundry-lanes', 'redwake-belt', 'pale-rings'].map((id) => {
            const nodes = runtime.regionalFields.get(id) ?? [];
            const obstacles = runtime.activeFieldObstacles(id);
            const first = obstacles[0];
            return {
                id,
                nodes: nodes.length,
                batches: runtime.renderer.regionalAsteroidMeshes.filter((entry) => entry.id === id).length,
                obstacleCount: obstacles.length,
                exactMesh: first?.shape === 'asteroid' && first.meshVerts?.length > 0 && first.meshIndices?.length > 0,
                centerBlocked: first ? !runtime.entryPositionClear(new THREE.Vector3(first.x, first.y, first.z), [first], 1) : false,
            };
        });
        const gates = runtime.renderer.jumpPointVisuals.map((visual) => ({
            id: visual.id,
            parts: visual.landmark.children.length,
            activationRadius: visual.landmark.userData.activationRadius,
        }));
        return {
            art,
            serviceArt,
            cairnBar,
            stations,
            blackglassParts: blackglass?.children.length ?? 0,
            fields,
            gates,
        };
    });
    check('all ten new docks use their own loadable artwork', galaxyQuality.art.length === 10
        && galaxyQuality.art.every((entry) => entry.ok && entry.markup), JSON.stringify(galaxyQuality.art));
    check('major ports use distinct loadable HD bar and market scenes', galaxyQuality.serviceArt.length === 6
        && galaxyQuality.serviceArt.every((entry) => entry.barOk && entry.marketOk && entry.barMarkup && entry.marketMarkup && entry.distinct)
        && galaxyQuality.cairnBar.ok && galaxyQuality.cairnBar.markup, JSON.stringify({ serviceArt: galaxyQuality.serviceArt, cairnBar: galaxyQuality.cairnBar }));
    check('new stations use high-detail polygon silhouettes', galaxyQuality.stations.every((entry) => entry.identity === entry.id
        && entry.highDetail && entry.detailMeshes >= 45)
        && galaxyQuality.blackglassParts >= 2, JSON.stringify({ stations: galaxyQuality.stations, blackglassParts: galaxyQuality.blackglassParts }));
    check('regional asteroid fields render exact collidable rock meshes', galaxyQuality.fields.every((field) => field.nodes >= 90
        && field.batches >= 4
        && field.obstacleCount === field.nodes
        && field.exactMesh
        && field.centerBlocked), JSON.stringify(galaxyQuality.fields));
    check('jump points use engineered multi-part landmarks with a 1 km activation envelope', galaxyQuality.gates.length === 6
        && galaxyQuality.gates.every((gate) => gate.parts >= 25 && gate.activationRadius === 1000), JSON.stringify(galaxyQuality.gates));
    await captureLocationApproach('cairn', 'cairn-flight-model.png', 3.8);
    const heliosPlacement = await page.evaluate(async () => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const { LOCATIONS } = await import('/src/game/data.js');
        const distance = (first, second) => Math.hypot(
            LOCATIONS[first].position[0] - LOCATIONS[second].position[0],
            LOCATIONS[first].position[1] - LOCATIONS[second].position[1],
            LOCATIONS[first].position[2] - LOCATIONS[second].position[2],
        );
        return {
            helixShardbelt: distance('helix', 'shardbelt'),
            cairnMourning: distance('cairn', 'mourning-line'),
            helixMourning: distance('helix', 'mourning-line'),
            cairnShardbelt: distance('cairn', 'shardbelt'),
            cairnFieldVisible: Boolean(runtime.renderer.instanceRoots.get('mourning-line')?.visible),
        };
    });
    check('Helios hubs sit beside their own activity fields', heliosPlacement.helixShardbelt <= 25000
        && heliosPlacement.helixShardbelt > 5000
        && heliosPlacement.cairnMourning <= 15000
        && heliosPlacement.helixMourning > heliosPlacement.helixShardbelt * 5
        && heliosPlacement.cairnShardbelt > heliosPlacement.cairnMourning * 5
        && heliosPlacement.cairnFieldVisible, JSON.stringify(heliosPlacement));
    await captureLocationApproach('helix', 'helix-shardbelt-horizon.png', 3.8);
    const helixFieldVisible = await page.evaluate(() => Boolean(window.__VOID_PRIVATEER__.getRuntime()
        ?.renderer?.instanceRoots?.get('shardbelt')?.visible));
    check('the Shardbelt is visible on Helix approaches', helixFieldVisible);
    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime()?.openMap?.());
    await page.waitForSelector('#map-panel:not(.is-hidden)', { timeout: 5000 });

    const initialMapView = await page.evaluate(() => ({
        active: document.querySelector('.map-card')?.dataset.activeView,
        sectorVisible: !document.querySelector('#map-sector-view')?.hidden,
        galaxyHidden: Boolean(document.querySelector('#map-galaxy-view')?.hidden),
        selected: document.querySelector('[data-map-view][aria-selected="true"]')?.dataset.mapView,
    }));
    check('navigation opens on the dedicated sector chart', initialMapView.active === 'sector'
        && initialMapView.sectorVisible
        && initialMapView.galaxyHidden
        && initialMapView.selected === 'sector', JSON.stringify(initialMapView));
    const inspectRegionalHitTargets = () => page.evaluate(() => [...document.querySelectorAll('.regional-system')].filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }).map((node) => {
        const rect = node.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('.regional-system');
        return { id: node.dataset.mapTargetId, hit: hit?.dataset.mapTargetId };
    }));
    const inspectMapLayout = () => page.evaluate(() => {
        const stage = document.querySelector('.system-map');
        const stageRect = stage?.getBoundingClientRect();
        const expectedIds = window.__VOID_PRIVATEER__.getRuntime()?.currentNavLocationIds?.() ?? [];
        const nodes = [...document.querySelectorAll('.system-map .map-node')].filter((node) => {
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        });
        const rects = nodes.map((node) => ({
            id: node.dataset.mapTargetId,
            layout: node.dataset.mapLayout,
            rect: node.getBoundingClientRect().toJSON(),
        }));
        const overlaps = [];
        for (let first = 0; first < rects.length; first += 1) {
            for (let second = first + 1; second < rects.length; second += 1) {
                const a = rects[first].rect;
                const b = rects[second].rect;
                if (Math.min(a.right, b.right) > Math.max(a.left, b.left)
                    && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top))
                    overlaps.push(`${rects[first].id}:${rects[second].id}`);
            }
        }
        const outside = stageRect ? rects.filter(({ rect }) => rect.left < stageRect.left
            || rect.right > stageRect.right
            || rect.top < stageRect.top
            || rect.bottom > stageRect.bottom).map(({ id }) => id) : ['missing-stage'];
        const spatialIds = rects.filter(({ layout }) => layout === 'spatial').map(({ id }) => id);
        const fallbackIds = rects.filter(({ layout }) => layout !== 'spatial').map(({ id }) => id);
        const nodeLabels = nodes.map((node) => {
            const label = node.querySelector('b');
            const style = label ? getComputedStyle(label) : null;
            const nodeRect = node.getBoundingClientRect();
            const labelRect = label?.getBoundingClientRect();
            return {
                id: node.dataset.mapTargetId,
                size: Number.parseFloat(style?.fontSize ?? '0'),
                family: style?.fontFamily ?? '',
                clipped: Boolean(label && (label.scrollWidth > label.clientWidth + 1 || label.scrollHeight > label.clientHeight + 1)),
                outsideBox: Boolean(labelRect && (labelRect.left < nodeRect.left - 1
                    || labelRect.right > nodeRect.right + 1
                    || labelRect.top < nodeRect.top - 1
                    || labelRect.bottom > nodeRect.bottom + 1)),
            };
        });
        const centers = Object.fromEntries(rects.map(({ id, rect }) => [id, {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
        }]));
        const pairDistance = (first, second) => centers[first] && centers[second]
            ? Math.hypot(centers[first].x - centers[second].x, centers[first].y - centers[second].y)
            : null;
        const star = document.querySelector('.system-map .map-star');
        const starRect = star?.getBoundingClientRect();
        const starOverlaps = starRect ? rects.filter(({ rect }) => Math.min(rect.right, starRect.right) > Math.max(rect.left, starRect.left)
            && Math.min(rect.bottom, starRect.bottom) > Math.max(rect.top, starRect.top)).map(({ id }) => id) : ['missing-star'];
        const panel = document.querySelector('#map-panel');
        const crt = document.querySelector('.global-crt-overlay');
        return {
            nodeCount: rects.length,
            expectedIds,
            missingIds: expectedIds.filter((id) => !spatialIds.includes(id)),
            fallbackIds,
            overlaps,
            outside,
            width: stageRect?.width,
            height: stageRect?.height,
            nodeLabels,
            pairDistances: {
                helixShardbelt: pairDistance('helix', 'shardbelt'),
                cairnMourning: pairDistance('cairn', 'mourning-line'),
                helixMourning: pairDistance('helix', 'mourning-line'),
                cairnShardbelt: pairDistance('cairn', 'shardbelt'),
            },
            starMarkersInPlot: document.querySelectorAll('.system-map .map-star').length,
            orbitCount: document.querySelectorAll('.system-map .map-orbit').length,
            starOverlaps,
            locationSubtitles: document.querySelectorAll('.system-map .map-node span').length,
            panelZ: Number.parseInt(getComputedStyle(panel).zIndex, 10),
            crtZ: Number.parseInt(getComputedStyle(crt).zIndex, 10),
        };
    });
    const inspectGalaxyLayout = () => page.evaluate(() => {
        const stage = document.querySelector('.galaxy-map-stage');
        const stageRect = stage?.getBoundingClientRect();
        const nodes = [...document.querySelectorAll('.galaxy-map-stage .regional-system')].filter((node) => {
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        });
        const rects = nodes.map((node) => ({ id: node.dataset.mapTargetId, rect: node.getBoundingClientRect().toJSON() }));
        const overlaps = [];
        for (let first = 0; first < rects.length; first += 1) {
            for (let second = first + 1; second < rects.length; second += 1) {
                const a = rects[first].rect;
                const b = rects[second].rect;
                if (Math.min(a.right, b.right) > Math.max(a.left, b.left)
                    && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top))
                    overlaps.push(`${rects[first].id}:${rects[second].id}`);
            }
        }
        const outside = stageRect ? rects.filter(({ rect }) => rect.left < stageRect.left
            || rect.right > stageRect.right
            || rect.top < stageRect.top
            || rect.bottom > stageRect.bottom).map(({ id }) => id) : ['missing-stage'];
        const labels = nodes.map((node) => {
            const label = node.querySelector('b');
            const style = getComputedStyle(label);
            return {
                id: node.dataset.mapTargetId,
                size: Number.parseFloat(style.fontSize),
                family: style.fontFamily,
                clipped: label.scrollWidth > label.clientWidth,
            };
        });
        return {
            ids: nodes.map((node) => node.dataset.mapTargetId),
            orders: Object.fromEntries(nodes.map((node) => [node.dataset.mapTargetId, Number(node.dataset.systemOrder)])),
            positions: Object.fromEntries(nodes.map((node) => [node.dataset.mapTargetId, {
                left: Number.parseFloat(node.style.left),
                top: Number.parseFloat(node.style.top),
            }])),
            routes: [...document.querySelectorAll('.regional-route-lines line')].map((line) => ({
                id: line.dataset.routeId,
                from: line.dataset.fromSystem,
                to: line.dataset.toSystem,
            })),
            labels,
            overlaps,
            outside,
            width: stageRect?.width,
            height: stageRect?.height,
        };
    });
    const inspectVisibleMapText = () => page.evaluate(() => {
        const card = document.querySelector('.map-card');
        const entries = [...document.querySelectorAll([
            '.map-card > header .eyebrow',
            '.map-card > header h2',
            '.map-card > header button',
            '.map-section-heading > span',
            '.map-section-heading > b',
            '.system-map .map-node b',
            '.galaxy-map-stage .regional-system span',
            '.galaxy-map-stage .regional-system b',
            '.map-card > footer > span',
        ].join(','))].filter((node) => {
            const rect = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden';
        }).map((node) => {
            const host = node.closest('.map-node, .regional-system, .map-section-heading, header, footer');
            const rect = node.getBoundingClientRect();
            const hostRect = host?.getBoundingClientRect();
            return {
                text: node.textContent?.trim() ?? '',
                clipped: node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1,
                outsideBox: Boolean(hostRect && (rect.left < hostRect.left - 1
                    || rect.right > hostRect.right + 1
                    || rect.top < hostRect.top - 1
                    || rect.bottom > hostRect.bottom + 1)),
            };
        });
        return {
            horizontalOverflow: Boolean(card && card.scrollWidth > card.clientWidth + 1),
            failures: entries.filter((entry) => entry.clipped || entry.outsideBox),
            count: entries.length,
        };
    });
    const desktopMapLayout = await inspectMapLayout();
    const desktopSectorText = await inspectVisibleMapText();
    check('system map nodes stay separate on desktop', desktopMapLayout.nodeCount > 0
        && desktopMapLayout.missingIds.length === 0
        && desktopMapLayout.fallbackIds.length === 0
        && desktopMapLayout.overlaps.length === 0
        && desktopMapLayout.outside.length === 0, JSON.stringify(desktopMapLayout));
    check('desktop sector restores its star and three orbits without covering locations', desktopMapLayout.starMarkersInPlot === 1
        && desktopMapLayout.orbitCount === 3
        && desktopMapLayout.starOverlaps.length === 0, JSON.stringify(desktopMapLayout));
    check('desktop sector uses clean readable labels above CRT noise', desktopMapLayout.nodeLabels.every((entry) => entry.size >= 11
        && !entry.clipped
        && !entry.outsideBox
        && !/lucida console|courier new/i.test(entry.family))
        && desktopMapLayout.locationSubtitles === 0
        && desktopMapLayout.panelZ > desktopMapLayout.crtZ, JSON.stringify(desktopMapLayout));
    check('desktop sector text stays inside its boxes', !desktopSectorText.horizontalOverflow
        && desktopSectorText.count > 0
        && desktopSectorText.failures.length === 0, JSON.stringify(desktopSectorText));
    check('sector chart groups Helix with the Shardbelt and Cairn with Mourning', desktopMapLayout.pairDistances.helixShardbelt < desktopMapLayout.pairDistances.helixMourning
        && desktopMapLayout.pairDistances.cairnMourning < desktopMapLayout.pairDistances.cairnShardbelt * 0.7, JSON.stringify(desktopMapLayout.pairDistances));
    await page.screenshot({ path: `${QA_DIR}/sector-map.png`, fullPage: true });

    await page.locator('[data-map-view="galaxy"]').click();
    await page.waitForSelector('#map-galaxy-view:not([hidden])', { timeout: 5000 });
    const desktopGalaxyLayout = await inspectGalaxyLayout();
    const desktopGalaxyText = await inspectVisibleMapText();
    const desktopRegionalHits = await inspectRegionalHitTargets();
    const expectedRoutePairs = ['helios-verge>meridian', 'meridian>pale-ring', 'pale-ring>redwake'];
    check('galaxy toggle gives all four systems their own full chart', desktopGalaxyLayout.ids.length === 4
        && ['helios-verge', 'meridian', 'pale-ring', 'redwake'].every((id) => desktopGalaxyLayout.ids.includes(id))
        && desktopGalaxyLayout.width > 1000
        && desktopGalaxyLayout.height >= 390
        && desktopGalaxyLayout.overlaps.length === 0
        && desktopGalaxyLayout.outside.length === 0, JSON.stringify(desktopGalaxyLayout));
    check('galaxy chart follows the Helios–Meridian–Pale Ring–Redwake corridor', desktopGalaxyLayout.routes.map((route) => `${route.from}>${route.to}`).join('|') === expectedRoutePairs.join('|')
        && desktopGalaxyLayout.orders['helios-verge'] === 1
        && desktopGalaxyLayout.orders.meridian === 2
        && desktopGalaxyLayout.orders['pale-ring'] === 3
        && desktopGalaxyLayout.orders.redwake === 4
        && new Set(Object.values(desktopGalaxyLayout.positions).map((point) => point.top)).size >= 3, JSON.stringify(desktopGalaxyLayout));
    check('desktop galaxy labels remain clean and readable', desktopGalaxyLayout.labels.every((entry) => entry.size >= 13
        && !entry.clipped
        && !/lucida console|courier new/i.test(entry.family)), JSON.stringify(desktopGalaxyLayout.labels));
    check('desktop galaxy text stays inside its boxes', !desktopGalaxyText.horizontalOverflow
        && desktopGalaxyText.count > 0
        && desktopGalaxyText.failures.length === 0, JSON.stringify(desktopGalaxyText));
    await page.screenshot({ path: `${QA_DIR}/galaxy-map.png`, fullPage: true });

    await page.setViewportSize({ width: 844, height: 390 });
    await wait(100);
    const phoneGalaxyLayout = await inspectGalaxyLayout();
    const phoneGalaxyText = await inspectVisibleMapText();
    const phoneRegionalHits = await inspectRegionalHitTargets();
    check('landscape-phone galaxy chart keeps all four systems separate', phoneGalaxyLayout.ids.length === 4
        && phoneGalaxyLayout.overlaps.length === 0
        && phoneGalaxyLayout.outside.length === 0
        && phoneGalaxyLayout.labels.every((entry) => entry.size >= 10 && !entry.clipped), JSON.stringify(phoneGalaxyLayout));
    check('landscape-phone galaxy text stays inside its boxes', !phoneGalaxyText.horizontalOverflow
        && phoneGalaxyText.count > 0
        && phoneGalaxyText.failures.length === 0, JSON.stringify(phoneGalaxyText));
    await page.screenshot({ path: `${QA_DIR}/galaxy-map-844x390.png`, fullPage: true });

    await page.locator('[data-map-view="sector"]').click();
    await page.waitForSelector('#map-sector-view:not([hidden])', { timeout: 5000 });
    const phoneMapLayout = await inspectMapLayout();
    const phoneSectorText = await inspectVisibleMapText();
    check('system map nodes stay separate on landscape phone', phoneMapLayout.nodeCount > 0
        && phoneMapLayout.missingIds.length === 0
        && phoneMapLayout.fallbackIds.length === 0
        && phoneMapLayout.overlaps.length === 0
        && phoneMapLayout.outside.length === 0, JSON.stringify(phoneMapLayout));
    check('phone sector keeps legible labels, star, and orbit structure', phoneMapLayout.nodeLabels.every((entry) => entry.size >= 10
        && !entry.clipped
        && !entry.outsideBox
        && !/lucida console|courier new/i.test(entry.family))
        && phoneMapLayout.starMarkersInPlot === 1
        && phoneMapLayout.orbitCount === 3
        && phoneMapLayout.starOverlaps.length === 0
        && phoneMapLayout.locationSubtitles === 0, JSON.stringify(phoneMapLayout));
    check('landscape-phone sector text stays inside its boxes', !phoneSectorText.horizontalOverflow
        && phoneSectorText.count > 0
        && phoneSectorText.failures.length === 0, JSON.stringify(phoneSectorText));
    check('regional system buttons own their visible hit areas', desktopRegionalHits.every((entry) => entry.id === entry.hit)
        && phoneRegionalHits.every((entry) => entry.id === entry.hit), JSON.stringify({ desktop: desktopRegionalHits, phone: phoneRegionalHits }));
    await page.screenshot({ path: `${QA_DIR}/sector-map-844x390.png`, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });
    await wait(100);
    const assertCurrentSystemMap = async (label) => {
        await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime()?.openMap?.());
        await page.waitForSelector('#map-panel:not(.is-hidden)', { timeout: 5000 });
        await page.locator('[data-map-view="sector"]').click();
        await page.waitForSelector('#map-sector-view:not([hidden])', { timeout: 5000 });
        const desktopLayout = await inspectMapLayout();
        await page.setViewportSize({ width: 844, height: 390 });
        await wait(80);
        const phoneLayout = await inspectMapLayout();
        await page.setViewportSize({ width: 1280, height: 720 });
        await wait(80);
        const readable = (layout) => layout.nodeCount === layout.expectedIds.length
            && layout.missingIds.length === 0
            && layout.fallbackIds.length === 0
            && layout.overlaps.length === 0
            && layout.outside.length === 0
            && layout.starMarkersInPlot === 1
            && layout.orbitCount === 3
            && layout.starOverlaps.length === 0;
        check(`${label} system map uses real spatial positions for every node`, readable(desktopLayout) && readable(phoneLayout), JSON.stringify({ desktop: desktopLayout, phone: phoneLayout }));
        await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime()?.ui?.hideMap?.());
        await wait(80);
    };

    await page.locator('[data-map-view="galaxy"]').click();
    await page.waitForSelector('#map-galaxy-view:not([hidden])', { timeout: 5000 });
    await page.locator('.regional-system[data-map-target-id="redwake"]').evaluate((node) => node.click());
    await waitForState(page, () => {
        const state = window.__VOID_PRIVATEER__.getState();
        return state?.world?.plannedSystemId === 'redwake' && state.player?.navTargetId === 'verge-meridian-point';
    }, 'three-hop Redwake route plot');
    const endToEndPlot = await page.evaluate(async () => {
        const state = window.__VOID_PRIVATEER__.getState();
        const { planRoute } = await import('/src/game/galaxy.js');
        const plan = planRoute('helios-verge', 'redwake');
        return {
            plannedSystemId: state.world.plannedSystemId,
            navTargetId: state.player.navTargetId,
            hops: plan?.hopCount,
            systemPath: plan?.systemPath,
            routeIds: plan?.routeIds,
        };
    });
    check('plotting Redwake from Helios starts the three-jump corridor at Meridian', endToEndPlot.plannedSystemId === 'redwake'
        && endToEndPlot.navTargetId === 'verge-meridian-point'
        && endToEndPlot.hops === 3
        && endToEndPlot.systemPath?.join('>') === 'helios-verge>meridian>pale-ring>redwake'
        && endToEndPlot.routeIds?.join('>') === 'verge-meridian>meridian-pale>pale-redwake', JSON.stringify(endToEndPlot));

    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime()?.openMap?.());
    await page.waitForSelector('#map-panel:not(.is-hidden)', { timeout: 5000 });
    await page.locator('[data-map-view="galaxy"]').click();
    await page.waitForSelector('#map-galaxy-view:not([hidden])', { timeout: 5000 });
    await page.locator('.regional-system[data-map-target-id="meridian"]').evaluate((node) => node.click());
    await waitForState(page, () => {
        const state = window.__VOID_PRIVATEER__.getState();
        return state?.world?.plannedSystemId === 'meridian' && state.player?.navTargetId === 'verge-meridian-point';
    }, 'Meridian route plot');
    const plotted = await page.evaluate(async () => {
        const state = window.__VOID_PRIVATEER__.getState();
        const galaxy = await import('/src/game/galaxy.js');
        const plan = galaxy.planRoute('helios-verge', 'meridian');
        const route = galaxy.routeBetweenSystems('helios-verge', 'meridian');
        return {
            plannedSystemId: state.world.plannedSystemId,
            navTargetId: state.player.navTargetId,
            nextJumpPointId: plan?.nextJumpPointId,
            routeId: route?.id,
            fuelCost: route?.fuelCost,
            creditCost: route?.creditCost,
            cost: plan?.cost,
        };
    });
    check('Meridian plots the zero-cost Helios jump point', plotted.plannedSystemId === 'meridian'
        && plotted.navTargetId === 'verge-meridian-point'
        && plotted.nextJumpPointId === 'verge-meridian-point'
        && plotted.routeId === 'verge-meridian'
        && plotted.fuelCost === 0
        && plotted.creditCost === 0
        && plotted.cost?.fuel === 0
        && plotted.cost?.credits === 0, JSON.stringify(plotted));

    const jumpProximity = await page.evaluate(async () => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const { LOCATIONS, JUMP_POINT_ACTIVATION_RADIUS } = await import('/src/game/data.js');
        const jumpPoint = LOCATIONS['verge-meridian-point'];
        runtime.save.player.position = [jumpPoint.position[0] + 1001, jumpPoint.position[1], jumpPoint.position[2]];
        const outside = Boolean(runtime.readyJumpPoint());
        runtime.save.player.position = [jumpPoint.position[0] + 999, jumpPoint.position[1], jumpPoint.position[2]];
        const inside = Boolean(runtime.readyJumpPoint());
        return { activationRadius: JUMP_POINT_ACTIVATION_RADIUS, outside, inside };
    });
    check('system jump only arms inside 1 km of the physical gate', jumpProximity.activationRadius === 1000
        && !jumpProximity.outside
        && jumpProximity.inside, JSON.stringify(jumpProximity));
    await page.evaluate(async () => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const { LOCATIONS } = await import('/src/game/data.js');
        const THREE = await import('/vendor/three.module.min.js');
        const jumpPoint = LOCATIONS['verge-meridian-point'];
        const normal = new THREE.Vector3(...jumpPoint.position).normalize();
        if (normal.lengthSq() < 0.001)
            normal.set(0, 0, 1);
        const position = new THREE.Vector3(...jumpPoint.position).addScaledVector(normal, 1400);
        const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), normal.clone().negate());
        runtime.save.player.position = [position.x, position.y, position.z];
        runtime.save.player.rotation = [rotation.x, rotation.y, rotation.z, rotation.w];
        runtime.save.player.velocity = [0, 0, 0];
        runtime.save.player.angularVelocity = [0, 0, 0];
        runtime.save.player.throttle = 0;
        runtime.save.player.currentTargetId = jumpPoint.id;
        runtime.resetPlayerInterpolation(true);
        runtime.renderer.setTarget(undefined, undefined, undefined, jumpPoint.id);
    });
    await wait(180);
    await page.screenshot({ path: `${QA_DIR}/jump-point-approach.png`, fullPage: true });

    const jumpApproach = await page.evaluate(async () => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const { LOCATIONS } = await import('/src/game/data.js');
        const THREE = await import('/vendor/three.module.min.js');
        const jumpPoint = LOCATIONS['verge-meridian-point'];
        const normal = new THREE.Vector3(...jumpPoint.position).normalize();
        if (normal.lengthSq() < 0.001)
            normal.set(0, 0, 1);
        const inward = normal.clone().negate();
        const start = new THREE.Vector3(...jumpPoint.position).addScaledVector(normal, 48);
        const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), inward);
        const before = {
            credits: runtime.save.player.credits,
            fuel: runtime.save.player.fuel,
        };
        runtime.save.player.position = [start.x, start.y, start.z];
        runtime.save.player.rotation = [rotation.x, rotation.y, rotation.z, rotation.w];
        runtime.save.player.velocity = [0, 0, 0];
        runtime.save.player.angularVelocity = [0, 0, 0];
        runtime.save.player.throttle = 0;
        // A physical gate must work even if another local destination is still
        // selected and no hyperdrive action is pressed.
        runtime.save.player.navTargetId = 'shardbelt';
        runtime.resetPlayerInterpolation(true);
        return {
            before,
            navTargetId: runtime.save.player.navTargetId,
            autopilot: runtime.autopilot,
            armedJumpPointId: runtime.armedJumpPointId,
            rendererArmedId: runtime.renderer.armedJumpPointId,
            galaxyJump: runtime.galaxyJump ? { ...runtime.galaxyJump } : null,
            pendingJump: runtime.save.world.pendingJump ? { ...runtime.save.world.pendingJump } : null,
        };
    });
    check('gate approach requires no hyperdrive activation or selected gate', !jumpApproach.autopilot
        && jumpApproach.navTargetId === 'shardbelt'
        && jumpApproach.armedJumpPointId == null
        && jumpApproach.rendererArmedId == null
        && jumpApproach.galaxyJump == null
        && jumpApproach.pendingJump == null, JSON.stringify(jumpApproach));
    const autoArmed = await page.evaluate(() => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        runtime.updateSimulation(1 / 60, {});
        return {
            armedJumpPointId: runtime.armedJumpPointId,
            rendererArmedId: runtime.renderer.armedJumpPointId,
            galaxyJump: runtime.galaxyJump,
            pendingJump: runtime.save.world.pendingJump,
        };
    });
    check('entering the 1 km volume automatically makes the gate live', autoArmed.armedJumpPointId === 'verge-meridian-point'
        && autoArmed.rendererArmedId === 'verge-meridian-point'
        && autoArmed.galaxyJump == null
        && autoArmed.pendingJump == null, JSON.stringify(autoArmed));
    await wait(80);
    await page.screenshot({ path: `${QA_DIR}/jump-gate-auto-live.png`, fullPage: true });
    const crossing = await page.evaluate(async () => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const { LOCATIONS } = await import('/src/game/data.js');
        const THREE = await import('/vendor/three.module.min.js');
        const jumpPoint = LOCATIONS['verge-meridian-point'];
        const normal = new THREE.Vector3(...jumpPoint.position).normalize();
        const inward = normal.clone().negate();
        const start = new THREE.Vector3(...jumpPoint.position).addScaledVector(normal, 2.2);
        const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), inward);
        runtime.save.player.position = [start.x, start.y, start.z];
        runtime.save.player.rotation = [rotation.x, rotation.y, rotation.z, rotation.w];
        runtime.save.player.velocity = [inward.x * 9, inward.y * 9, inward.z * 9];
        runtime.save.player.angularVelocity = [0, 0, 0];
        runtime.save.player.throttle = 0.06;
        runtime.resetPlayerInterpolation(true);
        let steps = 0;
        let maxStepTravel = 0;
        let previous = [...runtime.save.player.position];
        while (!runtime.galaxyJump && steps < 180) {
            runtime.updateSimulation(1 / 60, {});
            const current = runtime.save.player.position;
            maxStepTravel = Math.max(maxStepTravel, Math.hypot(
                current[0] - previous[0],
                current[1] - previous[1],
                current[2] - previous[2],
            ));
            previous = [...current];
            steps += 1;
        }
        return {
            steps,
            maxStepTravel,
            systemId: runtime.save.player.systemId,
            armedJumpPointId: runtime.armedJumpPointId,
            fx: runtime.hyperdriveFx,
            duration: runtime.galaxyJump ? runtime.galaxyJump.completeAt - runtime.galaxyJump.startedAt : null,
            galaxyJump: runtime.galaxyJump ? { ...runtime.galaxyJump } : null,
            pendingJump: runtime.save.world.pendingJump ? { ...runtime.save.world.pendingJump } : null,
        };
    });
    check('a normal-speed fly-through starts a sub-second transition', crossing.systemId === 'helios-verge'
        && crossing.armedJumpPointId == null
        && crossing.maxStepTravel < 1.5
        && crossing.fx === 'gate'
        && crossing.duration > 0
        && crossing.duration <= 0.6
        && crossing.galaxyJump?.fromSystemId === 'helios-verge'
        && crossing.galaxyJump?.toSystemId === 'meridian'
        && crossing.pendingJump?.toLocationId === 'meridian-verge-point', JSON.stringify(crossing));
    const jumpResult = await page.evaluate(async (before) => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const { LOCATIONS } = await import('/src/game/data.js');
        const endpoint = LOCATIONS['meridian-verge-point'];
        let steps = 0;
        while (runtime.save.player.systemId === 'helios-verge' && steps < 12) {
            runtime.updateSimulation(0.05, {});
            steps += 1;
        }
        const position = runtime.save.player.position;
        const distance = Math.hypot(position[0] - endpoint.position[0], position[1] - endpoint.position[1], position[2] - endpoint.position[2]);
        const expectedDistance = Math.max(180, endpoint.radius * 0.82);
        return {
            systemId: runtime.save.player.systemId,
            pendingJump: runtime.save.world.pendingJump,
            galaxyJump: runtime.galaxyJump,
            credits: runtime.save.player.credits,
            fuel: runtime.save.player.fuel,
            beforeCredits: before.credits,
            beforeFuel: before.fuel,
            arrivalLocationId: endpoint.id,
            distance,
            expectedDistance,
            steps,
            speed: Math.hypot(...runtime.save.player.velocity),
        };
    }, jumpApproach.before);
    check('gate transit is free and emerges moving through the Meridian aperture', jumpResult.systemId === 'meridian'
        && jumpResult.pendingJump == null
        && jumpResult.galaxyJump == null
        && jumpResult.credits === jumpResult.beforeCredits
        && jumpResult.fuel === jumpResult.beforeFuel
        && jumpResult.steps <= 12
        && jumpResult.speed >= 25
        && Math.abs(jumpResult.distance - jumpResult.expectedDistance) < 2, JSON.stringify(jumpResult));
    await wait(150);
    const renderer = await page.evaluate(async () => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const { LOCATIONS } = await import('/src/game/data.js');
        const visibleIds = [...(runtime?.renderer?.locationMeshes ?? new Map())]
            .filter(([, mesh]) => mesh.visible)
            .map(([id]) => id);
        return {
            visibleIds,
            nonMeridianIds: visibleIds.filter((id) => LOCATIONS[id]?.systemId !== 'meridian'),
            hasMeridianPrime: visibleIds.includes('meridian-prime'),
        };
    });
    check('renderer shows only Meridian location meshes', renderer.visibleIds.length > 0
        && renderer.nonMeridianIds.length === 0
        && renderer.hasMeridianPrime, JSON.stringify(renderer));
    await captureLocationApproach('argent', 'argent-flight-model.png', 3.6);
    await assertCurrentSystemMap('Meridian');
    await page.screenshot({ path: `${QA_DIR}/meridian-flight.png`, fullPage: true });
    const meridianShipMeshes = await page.evaluate(() => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const liveIds = new Set((runtime?.ships ?? []).map((ship) => ship.id));
        const meshIds = [...(runtime?.renderer?.shipMeshes ?? new Map()).keys()];
        return {
            liveCount: liveIds.size,
            meshCount: meshIds.length,
            staleIds: meshIds.filter((id) => !liveIds.has(id)),
        };
    });
    check('Meridian renderer ship meshes match live ships', meridianShipMeshes.staleIds.length === 0
        && meridianShipMeshes.meshCount === meridianShipMeshes.liveCount, JSON.stringify(meridianShipMeshes));

    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime()?.dockAt?.('meridian-prime'));
    await waitForState(page, () => window.__VOID_PRIVATEER__.getState()?.player?.dockedAt === 'meridian-prime', 'Meridian Prime docking');
    await page.waitForSelector('#dock-screen:not(.is-hidden)', { timeout: 5000 });
    const dock = await page.evaluate(() => ({
        location: document.querySelector('#dock-screen')?.dataset.location,
        title: document.querySelector('#dock-screen h2')?.textContent?.trim() ?? '',
        marketHotspot: Boolean(document.querySelector('[data-dock-hotspot="market"]')),
    }));
    check('Meridian Prime dock renders', dock.location === 'meridian-prime' && dock.title.includes('Meridian Prime') && dock.marketHotspot, JSON.stringify(dock));
    await page.locator('[data-dock-hotspot="market"]').click();
    await page.waitForSelector('#dock-screen .market-scene', { timeout: 5000 });
    await page.locator('[data-market-point="commodities"]').first().click();
    await page.waitForSelector('#dock-screen .market-screen', { timeout: 5000 });
    await page.waitForSelector('#dock-screen .commodity-exchange', { timeout: 5000 });
    const market = await page.evaluate(() => ({
        dock: document.querySelector('#dock-screen')?.dataset.location,
        screen: Boolean(document.querySelector('#dock-screen .commodity-exchange')),
        cards: document.querySelectorAll('#dock-screen .commodity-card').length,
    }));
    check('Meridian commodity market renders', market.dock === 'meridian-prime' && market.screen && market.cards > 0, JSON.stringify(market));
    await page.screenshot({ path: `${QA_DIR}/meridian-market.png`, fullPage: true });

    const risk = await page.evaluate(async () => {
        const { jumpPiracyRisk } = await import('/src/game/galaxy.js');
        const empty = jumpPiracyRisk('verge-meridian', 0);
        const cheap = jumpPiracyRisk('verge-meridian', 250);
        const valuable = jumpPiracyRisk('verge-meridian', 5000);
        const redwake = jumpPiracyRisk('pale-redwake', 5000);
        return { empty, cheap, valuable, redwake, clamped: jumpPiracyRisk('pale-redwake', 1e300) };
    });
    check('cargo piracy pressure is monotonic and Redwake is riskier', risk.empty >= 0
        && risk.empty < risk.cheap
        && risk.cheap < risk.valuable
        && risk.redwake > risk.valuable
        && risk.clamped >= 0
        && risk.clamped <= 1, JSON.stringify(risk));

    // The real Helios → Meridian jump above supplies the clean Meridian flight
    // capture. Use the debug hook only to stage the two other new systems for
    // visual QA, taking one hop at a time when a destination is not adjacent.
    const captureDebugFlight = async (systemId, filename) => {
        const reached = await page.evaluate(async (targetId) => {
            const hook = window.__VOID_PRIVATEER__;
            let hops = 0;
            while (hook.getState()?.player?.systemId !== targetId && hops < 4) {
                if (!hook.jumpToSystem(targetId))
                    break;
                hops += 1;
                await new Promise((resolve) => setTimeout(resolve, 120));
            }
            const state = hook.getState();
            return { systemId: state?.player?.systemId, dockedAt: state?.player?.dockedAt, hops };
        }, systemId);
        check(`${systemId} debug capture reaches in-flight state`, reached.systemId === systemId && !reached.dockedAt, JSON.stringify(reached));
        await page.waitForFunction((targetId) => {
            const state = window.__VOID_PRIVATEER__.getState();
            return state?.player?.systemId === targetId && !state?.player?.dockedAt;
        }, systemId, { timeout: 5000 });
        const star = await page.evaluate(() => {
            const renderer = window.__VOID_PRIVATEER__.getRuntime()?.renderer;
            return {
                radius: renderer?.starBody?.scale?.x,
                color: renderer?.starBody?.material?.color?.getHex?.(),
            };
        });
        if (systemId === 'redwake')
            check('Redwake is lit by a compact red dwarf', Math.abs(star.radius - 11000) < 0.1 && star.color === 0xff6046, JSON.stringify(star));
        if (systemId === 'pale-ring')
            check('Pale Ring is lit by a large blue giant', Math.abs(star.radius - 38000) < 0.1 && star.color === 0xe9fbff, JSON.stringify(star));
        await assertCurrentSystemMap(systemId);
        await wait(150);
        await page.screenshot({ path: `${QA_DIR}/${filename}`, fullPage: true });
        if (systemId === 'redwake')
            await captureLocationApproach('cinder', 'cinder-flight-model.png', 3.7);
        if (systemId === 'pale-ring')
            await captureLocationApproach('nacre', 'nacre-flight-model.png', 3.7);
    };
    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime()?.launch());
    await waitForState(page, () => !window.__VOID_PRIVATEER__.getState()?.player?.dockedAt, 'launch before regional flight captures');
    await captureDebugFlight('redwake', 'redwake-flight.png');
    await captureDebugFlight('pale-ring', 'pale-ring-flight.png');
    await page.evaluate(async () => {
        const hook = window.__VOID_PRIVATEER__;
        let hops = 0;
        while (hook.getState()?.player?.systemId !== 'meridian' && hops < 3) {
            if (!hook.jumpToSystem('meridian'))
                break;
            hops += 1;
            await new Promise((resolve) => setTimeout(resolve, 120));
        }
    });
    await waitForState(page, () => window.__VOID_PRIVATEER__.getState()?.player?.systemId === 'meridian', 'return to Meridian after flight captures');
    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime()?.dockAt?.('meridian-prime'));
    await waitForState(page, () => window.__VOID_PRIVATEER__.getState()?.player?.dockedAt === 'meridian-prime', 'redock Meridian after flight captures');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForHook(page);
    const reloaded = await page.evaluate(() => {
        const state = window.__VOID_PRIVATEER__.getState();
        return { systemId: state?.player?.systemId, dockedAt: state?.player?.dockedAt };
    });
    check('reload preserves the active system', reloaded.systemId === 'meridian', JSON.stringify(reloaded));
    await page.evaluate(() => window.__VOID_PRIVATEER__.resume());
    await waitForState(page, () => window.__VOID_PRIVATEER__.getState()?.player?.systemId === 'meridian'
        && window.__VOID_PRIVATEER__.getState()?.player?.dockedAt === 'meridian-prime', 'resume after reload');

    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime()?.launch());
    await waitForState(page, () => !window.__VOID_PRIVATEER__.getState()?.player?.dockedAt, 'launch for return jump');
    await page.evaluate(() => window.__VOID_PRIVATEER__.getRuntime()?.openMap?.());
    await page.waitForSelector('#map-panel:not(.is-hidden)', { timeout: 5000 });
    await page.locator('[data-map-view="galaxy"]').click();
    await page.waitForSelector('#map-galaxy-view:not([hidden])', { timeout: 5000 });
    await page.locator('.regional-system[data-map-target-id="helios-verge"]').evaluate((node) => node.click());
    await waitForState(page, () => {
        const state = window.__VOID_PRIVATEER__.getState();
        return state?.world?.plannedSystemId === 'helios-verge' && state.player?.navTargetId === 'meridian-verge-point';
    }, 'Helios return route plot');
    const returnPlotted = await page.evaluate(async () => {
        const state = window.__VOID_PRIVATEER__.getState();
        const galaxy = await import('/src/game/galaxy.js');
        const plan = galaxy.planRoute('meridian', 'helios-verge');
        const route = galaxy.routeBetweenSystems('meridian', 'helios-verge');
        return {
            plannedSystemId: state.world.plannedSystemId,
            navTargetId: state.player.navTargetId,
            nextJumpPointId: plan?.nextJumpPointId,
            routeId: route?.id,
            fuelCost: route?.fuelCost,
            creditCost: route?.creditCost,
            cost: plan?.cost,
        };
    });
    check('Meridian plots the zero-cost route back to Helios', returnPlotted.plannedSystemId === 'helios-verge'
        && returnPlotted.navTargetId === 'meridian-verge-point'
        && returnPlotted.nextJumpPointId === 'meridian-verge-point'
        && returnPlotted.routeId === 'verge-meridian'
        && returnPlotted.fuelCost === 0
        && returnPlotted.creditCost === 0
        && returnPlotted.cost?.fuel === 0
        && returnPlotted.cost?.credits === 0, JSON.stringify(returnPlotted));
    const returnApproach = await page.evaluate(async () => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const { LOCATIONS } = await import('/src/game/data.js');
        const THREE = await import('/vendor/three.module.min.js');
        const jumpPoint = LOCATIONS['meridian-verge-point'];
        runtime.clearTransientSpace();
        const normal = new THREE.Vector3(...jumpPoint.position).normalize();
        if (normal.lengthSq() < 0.001)
            normal.set(0, 0, 1);
        const travelDirection = normal.clone();
        const start = new THREE.Vector3(...jumpPoint.position).addScaledVector(normal, -48);
        const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), travelDirection);
        const before = {
            credits: runtime.save.player.credits,
            fuel: runtime.save.player.fuel,
        };
        runtime.save.player.position = [start.x, start.y, start.z];
        runtime.save.player.rotation = [rotation.x, rotation.y, rotation.z, rotation.w];
        runtime.save.player.velocity = [0, 0, 0];
        runtime.save.player.angularVelocity = [0, 0, 0];
        runtime.save.player.throttle = 0;
        runtime.save.player.navTargetId = 'foundry-lanes';
        runtime.resetPlayerInterpolation(true);
        return {
            before,
            navTargetId: runtime.save.player.navTargetId,
            autopilot: runtime.autopilot,
            armedJumpPointId: runtime.armedJumpPointId,
            galaxyJump: runtime.galaxyJump ? { ...runtime.galaxyJump } : null,
            pendingJump: runtime.save.world.pendingJump ? { ...runtime.save.world.pendingJump } : null,
        };
    });
    check('Meridian return approach also needs no activation or gate selection', !returnApproach.autopilot
        && returnApproach.navTargetId === 'foundry-lanes'
        && returnApproach.armedJumpPointId == null
        && returnApproach.galaxyJump == null
        && returnApproach.pendingJump == null, JSON.stringify(returnApproach));
    const returnAutoArmed = await page.evaluate(() => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        runtime.updateSimulation(1 / 60, {});
        return {
            armedJumpPointId: runtime.armedJumpPointId,
            galaxyJump: runtime.galaxyJump,
            pendingJump: runtime.save.world.pendingJump,
        };
    });
    check('Meridian gate also becomes live automatically', returnAutoArmed.armedJumpPointId === 'meridian-verge-point'
        && returnAutoArmed.galaxyJump == null
        && returnAutoArmed.pendingJump == null, JSON.stringify(returnAutoArmed));
    const returnResult = await page.evaluate(async (before) => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const { LOCATIONS } = await import('/src/game/data.js');
        const THREE = await import('/vendor/three.module.min.js');
        const jumpPoint = LOCATIONS['meridian-verge-point'];
        const endpoint = LOCATIONS['verge-meridian-point'];
        const normal = new THREE.Vector3(...jumpPoint.position).normalize();
        const start = new THREE.Vector3(...jumpPoint.position).addScaledVector(normal, -2.2);
        const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), normal);
        runtime.save.player.position = [start.x, start.y, start.z];
        runtime.save.player.rotation = [rotation.x, rotation.y, rotation.z, rotation.w];
        runtime.save.player.velocity = [normal.x * 9, normal.y * 9, normal.z * 9];
        runtime.save.player.angularVelocity = [0, 0, 0];
        runtime.save.player.throttle = 0.06;
        runtime.resetPlayerInterpolation(true);
        let steps = 0;
        let maxStepTravel = 0;
        let previous = [...runtime.save.player.position];
        while (runtime.save.player.systemId === 'meridian' && steps < 120) {
            runtime.updateSimulation(1 / 60, {});
            if (runtime.save.player.systemId === 'meridian') {
                const current = runtime.save.player.position;
                maxStepTravel = Math.max(maxStepTravel, Math.hypot(
                    current[0] - previous[0],
                    current[1] - previous[1],
                    current[2] - previous[2],
                ));
                previous = [...current];
            }
            steps += 1;
        }
        const position = runtime.save.player.position;
        const distance = Math.hypot(position[0] - endpoint.position[0], position[1] - endpoint.position[1], position[2] - endpoint.position[2]);
        const expectedDistance = Math.max(180, endpoint.radius * 0.82);
        return {
            systemId: runtime.save.player.systemId,
            pendingJump: runtime.save.world.pendingJump,
            galaxyJump: runtime.galaxyJump,
            credits: runtime.save.player.credits,
            fuel: runtime.save.player.fuel,
            beforeCredits: before.credits,
            beforeFuel: before.fuel,
            arrivalLocationId: endpoint.id,
            distance,
            expectedDistance,
            steps,
            maxStepTravel,
        };
    }, returnApproach.before);
    await wait(150);
    check('Meridian-to-Helios aperture transit is free and completes quickly', returnResult.systemId === 'helios-verge'
        && returnResult.pendingJump == null
        && returnResult.galaxyJump == null
        && returnResult.credits === returnResult.beforeCredits
        && returnResult.fuel === returnResult.beforeFuel
        && returnResult.steps <= 120
        && returnResult.maxStepTravel < 1.5
        && Math.abs(returnResult.distance - returnResult.expectedDistance) < 2, JSON.stringify(returnResult));
    const heliosShipMeshes = await page.evaluate(() => {
        const runtime = window.__VOID_PRIVATEER__.getRuntime();
        const liveIds = new Set((runtime?.ships ?? []).map((ship) => ship.id));
        const meshIds = [...(runtime?.renderer?.shipMeshes ?? new Map()).keys()];
        return {
            liveCount: liveIds.size,
            meshCount: meshIds.length,
            staleIds: meshIds.filter((id) => !liveIds.has(id)),
        };
    });
    check('Helios renderer ship meshes match live ships', heliosShipMeshes.staleIds.length === 0
        && heliosShipMeshes.meshCount === heliosShipMeshes.liveCount, JSON.stringify(heliosShipMeshes));
    check('page and console remain error-free', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

    await context.close();
}
catch (error) {
    console.error(`PROBE ERROR: ${error.message}`);
    process.exitCode = 1;
}
finally {
    if (browser)
        await browser.close().catch(() => undefined);
    if (server)
        server.kill();
}

const failures = checks.filter((entry) => !entry.ok);
console.log(`\nGalaxy probe: ${checks.length - failures.length}/${checks.length} checks passed`);
if (failures.length) {
    for (const failure of failures)
        console.error(`FAILED: ${failure.name}${failure.detail ? ` · ${failure.detail}` : ''}`);
    process.exitCode = 1;
}
