import { AudioManager } from './game/audio.js';
import { createNewSave, defaultSettings, loadGame, loadSettingsPreferences, saveGame, saveSettingsPreferences } from './game/save.js';
import { DOCK_LOCATION_IDS, LOCATIONS, SHIPS } from './game/data.js';
import { getLanguage, setLanguage, t } from './game/i18n.js';
import { GameUI } from './game/ui.js';
const host = document.querySelector('#app');
if (!host)
    throw new Error('Missing #app host element.');
const ui = new GameUI(host);
let session;
let sessionStarting;
let gameSessionModulePromise;
let cachedSave = loadGame();
const loadGameSession = () => {
    gameSessionModulePromise ??= import('./game/game.js');
    return gameSessionModulePromise;
};
const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
// Title options must work before the first career save exists. Preferences
// override the factory defaults (and an older career mirror), while language
// remains anchored to i18n's dedicated boot key so the static shell agrees.
const titleSettings = {
    ...defaultSettings(),
    ...(cachedSave?.settings ?? {}),
    ...(loadSettingsPreferences() ?? {}),
    language: getLanguage(),
};
const titleSave = () => cachedSave ?? { settings: titleSettings };
const syncTitleSettings = (settings = {}) => {
    Object.assign(titleSettings, defaultSettings(), settings, { language: getLanguage() });
    saveSettingsPreferences(titleSettings);
};
const showTitleScreen = () => {
    // Notices belong to the session that emitted them. Do not carry recovery,
    // combat, or dock feedback onto the title screen or into the next sortie.
    ui.clearToasts();
    ui.showTitle(Boolean(cachedSave), titleSave());
};
const devPreviewParams = new URLSearchParams(location.search);
const vesperHoverPreview = devPreviewParams.get('vesper-hover') === '1';
const devAutoStart = devPreviewParams.get('dev-autostart') === '1';
const debrisCollisionTest = devPreviewParams.get('test') === 'debris-collision';
const devPreviewLocationParam = devPreviewParams.get('dev-dock');
const devPreviewLocation = DOCK_LOCATION_IDS.includes(devPreviewLocationParam) ? devPreviewLocationParam : undefined;
const devPreviewShipParam = devPreviewParams.get('dev-ship');
const devPreviewShip = SHIPS[devPreviewShipParam] ? devPreviewShipParam : undefined;
const SHIP_WARM_ASSETS = Object.freeze({
    wayfarer: ['./assets/models/ships/wayfarer.glb', './assets/remaster/cockpit-frame.webp'],
    vanguard: ['./assets/models/ships/vanguard.glb', './assets/remaster/cockpit-vanguard.webp'],
    talon: ['./assets/models/ships/talon.glb', './assets/remaster/cockpit-talon.webp'],
    prospector: ['./assets/models/ships/prospector.glb', './assets/remaster/cockpit-prospector.webp'],
    lancer: ['./assets/models/ships/lancer.glb', './assets/remaster/cockpit-lancer.webp'],
    atlas: ['./assets/models/ships/atlas.glb', './assets/remaster/cockpit-atlas.webp'],
});
const warmedBinaries = new Map();
const warmBinary = (url, priority = 'low') => {
    let pending = warmedBinaries.get(url);
    if (!pending) {
        pending = fetch(url, { cache: 'force-cache', priority })
            .then(async (response) => {
                if (response.ok)
                    await response.arrayBuffer();
            });
        warmedBinaries.set(url, pending);
    }
    return pending;
};
const warmLikelyFlightAssets = async () => {
    const connection = navigator.connection ?? navigator.mozConnection ?? navigator.webkitConnection;
    if (sessionStarting || session?.renderer || connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? '') || document.visibilityState !== 'visible')
        return;
    const warmSave = cachedSave ?? { player: { shipId: 'wayfarer', dockedAt: 'helix', navTargetId: 'shardbelt' } };
    const shipId = warmSave.player?.shipId && SHIP_WARM_ASSETS[warmSave.player.shipId] ? warmSave.player.shipId : 'wayfarer';
    const [model] = SHIP_WARM_ASSETS[shipId];
    await Promise.allSettled([
        warmBinary(model),
        ui.preloadSessionAssets(warmSave, { priority: 'low' }),
        loadGameSession(),
    ]);
};
const scheduleLikelyFlightWarmup = () => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
        // Protect the title's first paint, then start low-priority work as soon
        // as the browser has an idle slice. A short timeout prevents a busy
        // title animation from postponing the warm-up until after Start.
        if (typeof requestIdleCallback === 'function')
            requestIdleCallback(() => void warmLikelyFlightAssets(), { timeout: 750 });
        else
            window.setTimeout(() => void warmLikelyFlightAssets(), 80);
    }));
};
// Tilt state shared with the title screen, where no session (and no
// InputManager) exists yet. The gyro listener keeps live readings so
// ENABLE TILT STEER and SET NEUTRAL work before a career starts.
let tiltGranted = false;
let tiltSeen = false;
let tiltBeta = 0;
let tiltGamma = 0;
let tiltAngle = 0;
const tiltSampleWaiters = new Set();
const normalizeTiltAngle = (value) => {
    let angle = Number(value);
    if (!Number.isFinite(angle))
        angle = 0;
    while (angle > 180)
        angle -= 360;
    while (angle < -180)
        angle += 360;
    return angle;
};
if (typeof DeviceOrientationEvent !== 'undefined') {
    window.addEventListener('deviceorientation', (event) => {
        const rawBeta = Number(event.beta);
        const rawGamma = Number(event.gamma);
        if (!Number.isFinite(rawBeta) || !Number.isFinite(rawGamma))
            return;
        // Same screen-frame rotation the InputManager applies (see input.js).
        tiltAngle = normalizeTiltAngle(globalThis.screen?.orientation?.angle ?? globalThis.window?.orientation ?? 0);
        const radians = (tiltAngle * Math.PI) / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        tiltBeta = rawBeta * cos + rawGamma * sin;
        tiltGamma = -rawBeta * sin + rawGamma * cos;
        tiltSeen = true;
        for (const resolve of tiltSampleWaiters)
            resolve(true);
        tiltSampleWaiters.clear();
    }, { passive: true });
}
const waitForTitleTiltSample = (timeoutMs = 1800) => {
    if (tiltSeen)
        return Promise.resolve(true);
    return new Promise((resolve) => {
        const finish = (seen) => {
            clearTimeout(timeoutId);
            tiltSampleWaiters.delete(finish);
            resolve(seen);
        };
        const timeoutId = setTimeout(() => finish(false), timeoutMs);
        tiltSampleWaiters.add(finish);
    });
};
const requestTiltPermission = async () => {
    if (typeof DeviceOrientationEvent === 'undefined')
        return false;
    const request = DeviceOrientationEvent.requestPermission;
    if (typeof request !== 'function')
        return true;
    try {
        return (await request.call(DeviceOrientationEvent)) === 'granted';
    }
    catch {
        return false;
    }
};
const beginSession = (mode, arena) => {
    if (sessionStarting)
        return sessionStarting;
    const previousSession = session;
    session = undefined;
    previousSession?.dispose();
    ui.clearToasts();
    const save = mode === 'new' || mode === 'arena' ? createNewSave() : loadGame();
    if (!save) {
        ui.showToast(t('No autosave was found.'), 'warning');
        ui.showTitle(false, titleSave());
        return Promise.resolve(undefined);
    }
    // Controls, display, and audio are player preferences rather than
    // career-specific progress. Apply the latest global record to new,
    // resumed, and simulator sessions alike.
    Object.assign(save.settings, titleSettings);
    // iOS only accepts the orientation permission request in the original
    // tap/click task. Start it here, before the deferred game module and scene
    // work, then hand the resolved state to the InputManager. Previously a new
    // session tried too late and silently changed tilt back to stick steering.
    const touchDevice = Number(navigator.maxTouchPoints ?? 0) > 0
        || Boolean(globalThis.matchMedia?.('(any-pointer: coarse)').matches);
    const shouldStartTilt = save.settings.steering !== 'stick' && (touchDevice || tiltGranted);
    const tiltPermissionRequest = shouldStartTilt
        ? (tiltGranted ? Promise.resolve(true) : requestTiltPermission())
        : Promise.resolve(false);
    // Keep the language mirrors in sync so the next boot and settings UI agree.
    // The probe/dev key (`__VOID_PRIVATEER_PROBE_LANG__`) is single-shot: it
    // forces the boot language once, then clears itself — a value left behind
    // by a dev session used to override the player's saved choice forever.
    const probeLanguage = typeof localStorage !== 'undefined' ? localStorage.getItem('__VOID_PRIVATEER_PROBE_LANG__') : null;
    setLanguage(probeLanguage ?? save.settings?.language);
    if (probeLanguage && typeof localStorage !== 'undefined')
        localStorage.removeItem('__VOID_PRIVATEER_PROBE_LANG__');
    if (vesperHoverPreview && mode !== 'arena') {
        // Keep the visual preview reachable from either title-screen button
        // without changing the normal career flow when the flag is absent.
        save.player.dockedAt = 'vesper';
        save.player.lastDockedAt = 'vesper';
        save.player.velocity = [0, 0, 0];
        save.player.throttle = 0;
    }
    if (devPreviewLocation && mode !== 'arena') {
        // Dev-only direct station preview. It is query-gated and never runs
        // in the normal career flow, but uses the same saved-game dock path.
        save.player.dockedAt = devPreviewLocation;
        save.player.lastDockedAt = devPreviewLocation;
        save.player.systemId = LOCATIONS[devPreviewLocation].systemId;
        save.player.position = [...LOCATIONS[devPreviewLocation].position];
        save.player.velocity = [0, 0, 0];
        save.player.throttle = 0;
        if (devPreviewShip)
            save.player.shipId = devPreviewShip;
    }
    if (mode === 'arena')
        save.arena = arena;
    syncTitleSettings(save.settings);
    // The combat sim uses the same canonical factory hardpoints as a career.
    // Its disposable save still keeps the sortie consequence-free, while an
    // arena run can no longer bypass installed-only weapons through the old
    // flat equipment list.
    cachedSave = save;
    saveGame(save);
    // Create and resume the audio context inside the original tap/click task;
    // the heavier game module arrives asynchronously afterwards. This keeps
    // sound working on mobile browsers without making the title load the full
    // flight runtime up front.
    const audioManager = new AudioManager();
    void audioManager.enable();
    ui.setLoading(true, t(mode === 'arena' ? 'PREPARING FLIGHT' : 'LOADING CAREER'));
    const starting = (async () => {
        await nextPaint();
        const shipId = SHIP_WARM_ASSETS[save.player.shipId] ? save.player.shipId : 'wayfarer';
        const [tiltPermission, gameModule] = await Promise.all([
            tiltPermissionRequest,
            loadGameSession(),
            Promise.allSettled([
                warmBinary(SHIP_WARM_ASSETS[shipId][0], 'high'),
                ui.preloadSessionAssets(save, { priority: 'high', includeLocation: mode !== 'arena' }),
            ]),
        ]);
        if (tiltPermission === true)
            tiltGranted = true;
        const { GameSession } = gameModule;
        const nextSession = new GameSession(save, ui, () => {
            session = undefined;
            cachedSave = loadGame();
            if (cachedSave) {
                Object.assign(cachedSave.settings, titleSettings);
                saveGame(cachedSave);
            }
            showTitleScreen();
        }, mode === 'arena' ? arena : null, tiltPermission, audioManager);
        session = nextSession;
        if (!arena && save.player.dockedAt)
            await nextSession.prepareDockedFlightRuntime({ showLoading: false });
        else if (nextSession.renderer)
            await nextSession.prepareFlightScene();
        return nextSession;
    })().catch((error) => {
        console.error('Session startup failed.', error);
        audioManager.dispose();
        session = undefined;
        showTitleScreen();
        ui.showToast(t('Flight systems could not be loaded. Reload and try again.'), 'danger', 5200);
        return undefined;
    }).finally(() => {
        ui.setLoading(false);
        if (sessionStarting === starting)
            sessionStarting = undefined;
    });
    sessionStarting = starting;
    return starting;
};
const withSession = (callback) => session
    ? callback(session)
    : sessionStarting?.then((ready) => ready ? callback(ready) : undefined);
// Standard plus the webkit-prefixed element (older Safari/Edge), so the
// switch's enter/exit decision matches what the browser actually reports.
const fullscreenElement = () => document.fullscreenElement ?? document.webkitFullscreenElement ?? null;
const enterFullscreen = async () => {
    try {
        if (!fullscreenElement())
            await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        const orientation = screen.orientation;
        await orientation.lock?.('landscape');
    }
    catch {
        ui.showToast(t('Fullscreen or orientation lock was declined by the browser.'), 'info');
    }
};
const toggleFullscreen = async () => {
    // A click on the switch while already fullscreen leaves fullscreen.
    if (fullscreenElement()) {
        try {
            await document.exitFullscreen();
        }
        catch { /* ignore */ }
        return;
    }
    await enterFullscreen();
};
const assignSetting = (settings, key, value) => {
    if (key === 'music' || key === 'effects' || key === 'touchScale' || key === 'tiltSensitivity') {
        settings[key] = Number(value);
    }
    else if (key === 'steering') {
        settings.steering = value === 'stick' ? 'stick' : 'tilt';
    }
    else if (key === 'tiltInvertPitch' || key === 'tiltInvertYaw' || key === 'flightAssist' || key === 'aimAssist' || key === 'vibration') {
        settings[key] = Boolean(value);
    }
    else if (key === 'quality' && (value === 'auto' || value === 'low' || value === 'high')) {
        settings.quality = value;
    }
    else {
        return false;
    }
    return true;
};
const actions = {
    startNew: () => beginSession('new'),
    resume: () => beginSession('resume'),
    startArena: (environment, scenario, difficulty) => beginSession('arena', { environment, scenario, difficulty }),
    requestFullscreen: () => void enterFullscreen(),
    toggleFullscreen: () => void toggleFullscreen(),
    launch: () => {
        void withSession((ready) => {
            // Audio resume is best-effort and can remain pending in browsers
            // that decline or defer the gesture. It must never hold up the
            // staged WebGL preparation or keep the player trapped at the dock.
            void ready.enableAudio();
            return ready.launch();
        });
    },
    setNav: (locationId) => session?.setNav(locationId),
    openMap: () => session?.openMap(),
    openShipMenu: () => session?.openShipMenu(),
    weaponCycle: () => session?.cycleWeapon(),
    launcherCycle: () => session?.cycleLauncher(),
    selectTarget: (kind, id) => session?.selectTarget(kind, id),
    trade: (kind, commodityId, quantity) => session?.trade(kind, commodityId, quantity),
    jettison: (commodityId) => session?.jettisonCargo(commodityId),
    payOffMug: () => session?.payOffMug(),
    patrolReply: () => session?.patrolReply(),
    paySyndicateBerth: () => session?.paySyndicateBerth(),
    acceptMission: (missionId) => session?.acceptMission(missionId),
    repair: () => session?.repair(),
    refuel: () => session?.refuel(),
    buyEquipment: (equipmentId) => session?.buyEquipment(equipmentId),
    applyOutfitting: (shipId, draft, options) => session?.applyOutfitting(shipId, draft, options),
    buyShip: (shipId) => session?.buyShip(shipId),
    switchShip: (shipId) => session?.switchShip(shipId),
    joinGuild: (guildId) => session?.joinGuild(guildId),
    saveNow: () => session?.saveNow(),
    resumeFlight: () => session?.resumeFlight(),
    quitToTitle: () => session?.quitToTitle(),
    setSetting: (key, value) => {
        // Language changes always persist, reload, and work even before any
        // save exists: the title-screen flag and the options selector route
        // through here, and the reload guarantees every surface (static HUD
        // included) renders in the new language.
        if (key === 'language') {
            const language = value === 'en' ? 'en' : 'de';
            setLanguage(language);
            titleSettings.language = language;
            saveSettingsPreferences(titleSettings);
            const save = session?.save ?? cachedSave ?? loadGame();
            if (save) {
                save.settings.language = language;
                cachedSave = save;
                saveGame(save);
            }
            location.reload();
            return;
        }
        if (session) {
            session.setSetting(key, value);
            syncTitleSettings(session.save.settings);
            return;
        }
        // No session yet (including a true first run): update the global
        // preference record and mirror it into an existing career if present.
        if (!assignSetting(titleSettings, key, value))
            return;
        saveSettingsPreferences(titleSettings);
        const save = cachedSave ?? loadGame();
        if (save) {
            assignSetting(save.settings, key, value);
            cachedSave = save;
            saveGame(save);
        }
    },
    enableTilt: async () => {
        // In a session the InputManager owns tilt; on the title screen there is
        // no session yet, so request permission here and let the next session
        // inherit it (the constructor auto-enables when tiltGranted is set).
        if (session) {
            const granted = await session.enableTilt();
            if (granted)
                syncTitleSettings(session.save.settings);
            return granted;
        }
        const granted = await requestTiltPermission();
        if (!granted)
            return false;
        tiltGranted = true;
        if (!await waitForTitleTiltSample())
            return false;
        titleSettings.steering = 'tilt';
        saveSettingsPreferences(titleSettings);
        const save = cachedSave ?? loadGame();
        if (save) {
            save.settings.steering = 'tilt';
            cachedSave = save;
            saveGame(save);
        }
        return true;
    },
    calibrateTilt: () => {
        if (session) {
            const calibrated = session.calibrateTilt();
            if (calibrated)
                syncTitleSettings(session.save.settings);
            return calibrated;
        }
        if (!tiltSeen)
            return false;
        titleSettings.tiltNeutral = { beta: tiltBeta, gamma: tiltGamma, angle: tiltAngle };
        saveSettingsPreferences(titleSettings);
        const save = cachedSave ?? loadGame();
        if (save) {
            save.settings.tiltNeutral = { beta: tiltBeta, gamma: tiltGamma, angle: tiltAngle };
            cachedSave = save;
            saveGame(save);
        }
        return true;
    },
};
ui.mugDemand = () => session?.activeMugDemand();
ui.setActions(actions);
showTitleScreen();
scheduleLikelyFlightWarmup();
window.addEventListener('pagehide', () => {
    if (session)
        saveGame(session.save);
});
const pauseFlightOnFocusLoss = () => {
    if (!session || session.save.player.dockedAt || ui.isModalOpen)
        return false;
    ui.showPause();
    return true;
};
window.addEventListener('blur', pauseFlightOnFocusLoss);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && session) {
        pauseFlightOnFocusLoss();
        saveGame(session.save);
    }
});
const isProductionBuild = import.meta.env?.PROD ?? location.protocol !== 'file:';
if ('serviceWorker' in navigator && isProductionBuild) {
    // Register the worker for offline/asset caching. A new deploy's worker
    // takes over on the NEXT full page load (skipWaiting + clients.claim),
    // never by force-reloading the running page — that surprise reload was
    // dumping players straight back to the title screen mid-interaction.
    window.addEventListener('load', () => {
        void navigator.serviceWorker.register('./sw.js').catch(() => undefined);
    });
}
window.__VOID_PRIVATEER__ = {
    newGame: () => beginSession('new'),
    resume: () => beginSession('resume'),
    startArena: (environment, scenario, difficulty) => beginSession('arena', { environment, scenario, difficulty }),
    getState: () => session?.save ?? cachedSave,
    getRuntime: () => session,
    debugShips: () => session?.ships,
    pickTarget: (x, y) => session?.renderer?.pickTarget(x, y),
    projectToScreen: (position) => session?.renderer?.projectToScreen(position),
    launch: () => withSession((ready) => ready.launch()),
    restartArena: () => session?.arena && session.restartArena(),
    jumpToSystem: (systemId) => session?.debugJumpToSystem(systemId),
    saveNow: () => session?.saveNow(),
    // Mock story-mission line: pins the comms bar in amber, mutes all chatter
    // until dismissed (tap the CONTINUE bar) or the duration elapses.
    playStoryLine: (name, text) => session?.playStoryLine(name, text),
};

// Small, stable browser-game hooks for the shared Playwright development
// loop. Keep this deliberately narrower than getRuntime(): it describes only
// the live, player-relevant scene and never serializes the renderer's circular
// object graph.
window.render_game_to_text = () => {
    const runtime = session;
    const save = runtime?.save ?? cachedSave;
    if (!save)
        return JSON.stringify({ mode: 'title', coordinates: 'world [x,y,z]; +y is up; ship forward is local -z' });
    const race = runtime?.activeRace;
    return JSON.stringify({
        mode: save.player.dockedAt ? 'docked' : race?.state ? `race-${race.state}` : 'flight',
        testMode: runtime?.arena?.testMode ?? null,
        coordinates: 'world [x,y,z]; +y is up; ship forward is local -z',
        player: {
            systemId: save.player.systemId,
            position: save.player.position.map((value) => Math.round(value * 10) / 10),
            velocity: save.player.velocity.map((value) => Math.round(value * 10) / 10),
            throttle: Math.round(save.player.throttle * 100),
            flightAssist: Boolean(save.settings.flightAssist),
            fuel: Math.round(save.player.fuel * 10) / 10,
            missiles: save.player.missiles,
            maxMissiles: runtime?.playerStats?.().missileCapacity ?? null,
            activeLauncherMountId: save.player.activeLauncherMountId ?? null,
            launcherMagazines: Object.entries(save.player.launcherMagazines ?? {}).map(([mountId, magazine]) => ({
                mountId,
                launcherId: magazine.launcherId,
                ordnanceId: magazine.ordnanceId,
                rounds: magazine.rounds,
                selected: mountId === save.player.activeLauncherMountId,
            })),
            dockedAt: save.player.dockedAt ?? null,
            targetId: save.player.currentTargetId ?? null,
            navTargetId: save.player.navTargetId,
        },
        galaxy: {
            plannedSystemId: save.world.plannedSystemId ?? null,
            plannedDestinationId: save.world.plannedDestinationId ?? null,
            pendingJump: save.world.pendingJump ?? null,
        },
        market: save.player.dockedAt ? {
            locationId: save.player.dockedAt,
            terminal: runtime?.ui?.dockTerminal ?? null,
            point: runtime?.ui?.marketPoint || null,
            selectedCommodityId: runtime?.ui?.marketCommodityId ?? null,
            quantity: runtime?.ui?.marketQuantity ?? 1,
            credits: save.player.credits,
        } : null,
        race: race ? {
            courseId: race.course.id,
            state: race.state,
            gate: save.player.raceGateIndex ?? 0,
            gateCount: race.course.gates.length,
            rank: race.playerRank,
            draft: Math.round((race.slipstream?.strength ?? 0) * 100) / 100,
            shortcutId: race.shortcut?.id ?? null,
            visibleCourseGates: runtime.renderer?.raceGateMeshes?.filter((mesh) => mesh.visible).length ?? 0,
            visibleShortcutGates: runtime.renderer?.raceShortcutMeshes?.filter((mesh) => mesh.visible).length ?? 0,
            racers: race.racers.map((racer) => ({
                id: racer.id,
                variant: racer.variant,
                gate: racer.raceGateIndex,
                finished: Boolean(racer.raceFinished),
                position: racer.position.map((value) => Math.round(value * 10) / 10),
            })),
        } : null,
    });
};

// Deterministic stepping for browser QA. Normal play continues to use the
// fixed-step rAF accumulator; this hook simply advances that same simulation
// in exact 60 Hz slices and renders the resulting state once.
window.advanceTime = (milliseconds) => {
    if (!session || session.save.player.dockedAt)
        return;
    const steps = Math.max(1, Math.min(600, Math.round(Number(milliseconds) / (1000 / 60))));
    const actions = { throttleDelta: 0, pitch: 0, yaw: 0, roll: 0 };
    session.simAccumulator = 0;
    for (let index = 0; index < steps; index += 1)
        session.updateSimulation(1 / 60, actions);
    session.simAccumulator = 0;
    session.syncRender(0, performance.now());
};

// Query-gated development boot used by the shared browser-game smoke client.
// It never alters a normal load and avoids timing a click against the title
// screen while the first 3D session is still being constructed.
if (debrisCollisionTest) {
    document.title = 'Voidrunner — Debris Collision Test';
    beginSession('arena', {
        environment: 'debris-field',
        scenario: 'free-flight',
        difficulty: 'rookie',
        testMode: 'debris-collision',
    });
}
else if (devAutoStart)
    beginSession('new');
