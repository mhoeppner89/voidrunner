import { GameSession } from './game/game.js';
import { createNewSave, hasSavedGame, loadGame, saveGame } from './game/save.js';
import { DOCK_LOCATION_IDS, LOCATIONS, SHIPS } from './game/data.js';
import { setLanguage, t } from './game/i18n.js';
import { GameUI } from './game/ui.js';
const host = document.querySelector('#app');
if (!host)
    throw new Error('Missing #app host element.');
const ui = new GameUI(host);
let session;
let cachedSave = loadGame();
const devPreviewParams = new URLSearchParams(location.search);
const vesperHoverPreview = devPreviewParams.get('vesper-hover') === '1';
const devAutoStart = devPreviewParams.get('dev-autostart') === '1';
const debrisCollisionTest = devPreviewParams.get('test') === 'debris-collision';
const devPreviewLocationParam = devPreviewParams.get('dev-dock');
const devPreviewLocation = DOCK_LOCATION_IDS.includes(devPreviewLocationParam) ? devPreviewLocationParam : undefined;
const devPreviewShipParam = devPreviewParams.get('dev-ship');
const devPreviewShip = SHIPS[devPreviewShipParam] ? devPreviewShipParam : undefined;
// Tilt state shared with the title screen, where no session (and no
// InputManager) exists yet. The gyro listener keeps live readings so
// ENABLE TILT STEER and SET NEUTRAL work before a career starts.
let tiltGranted = false;
let tiltBeta = 0;
let tiltGamma = 0;
let tiltAngle = 0;
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
        if (event.beta == null || event.gamma == null)
            return;
        // Same screen-frame rotation the InputManager applies (see input.js).
        tiltAngle = normalizeTiltAngle(globalThis.screen?.orientation?.angle ?? globalThis.window?.orientation ?? 0);
        const radians = (tiltAngle * Math.PI) / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        tiltBeta = event.beta * cos + event.gamma * sin;
        tiltGamma = -event.beta * sin + event.gamma * cos;
    }, { passive: true });
}
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
    session?.dispose();
    const save = mode === 'new' || mode === 'arena' ? createNewSave() : loadGame();
    if (!save) {
        ui.showToast(t('No autosave was found.'), 'warning');
        ui.showTitle(false);
        return;
    }
    // The save's language wins over the pre-save localStorage choice; keep
    // both mirrors in sync so the next boot and the settings UI agree.
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
    // The combat sim uses the same canonical factory hardpoints as a career.
    // Its disposable save still keeps the sortie consequence-free, while an
    // arena run can no longer bypass installed-only weapons through the old
    // flat equipment list.
    cachedSave = save;
    saveGame(save);
    session = new GameSession(save, ui, () => {
        session = undefined;
        cachedSave = loadGame();
        ui.showTitle(Boolean(cachedSave), cachedSave);
    }, mode === 'arena' ? arena : null, tiltGranted);
    void session.enableAudio();
};
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
const actions = {
    startNew: () => beginSession('new'),
    resume: () => beginSession('resume'),
    startArena: (environment, scenario, difficulty) => beginSession('arena', { environment, scenario, difficulty }),
    requestFullscreen: () => void enterFullscreen(),
    toggleFullscreen: () => void toggleFullscreen(),
    launch: () => {
        void session?.enableAudio();
        session?.launch();
    },
    setNav: (locationId) => session?.setNav(locationId),
    openMap: () => session?.openMap(),
    openShipMenu: () => session?.openShipMenu(),
    weaponCycle: () => session?.cycleWeapon(),
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
            setLanguage(value === 'en' ? 'en' : 'de');
            const save = session?.save ?? cachedSave ?? loadGame();
            if (save) {
                save.settings.language = value === 'en' ? 'en' : 'de';
                cachedSave = save;
                saveGame(save);
            }
            location.reload();
            return;
        }
        if (session) {
            session.setSetting(key, value);
            return;
        }
        // No session yet (title-screen options): write the setting straight
        // into the cached save and persist it, so sound/flight/tilt choices
        // made before a career starts carry into the next session.
        const save = cachedSave ?? loadGame();
        if (!save)
            return;
        if (key === 'music' || key === 'effects' || key === 'touchScale' || key === 'tiltSensitivity') {
            save.settings[key] = Number(value);
        }
        else if (key === 'steering') {
            save.settings.steering = value === 'stick' ? 'stick' : 'tilt';
        }
        else if (key === 'tiltInvertPitch' || key === 'tiltInvertYaw' || key === 'flightAssist' || key === 'aimAssist' || key === 'vibration') {
            save.settings[key] = Boolean(value);
        }
        else if (key === 'quality' && (value === 'auto' || value === 'low' || value === 'high')) {
            save.settings.quality = value;
        }
        cachedSave = save;
        saveGame(save);
    },
    enableTilt: async () => {
        // In a session the InputManager owns tilt; on the title screen there is
        // no session yet, so request permission here and let the next session
        // inherit it (the constructor auto-enables when tiltGranted is set).
        if (session)
            return session.enableTilt();
        const granted = await requestTiltPermission();
        if (!granted)
            return false;
        tiltGranted = true;
        const save = cachedSave ?? loadGame();
        if (save) {
            save.settings.steering = 'tilt';
            saveGame(save);
        }
        return true;
    },
    calibrateTilt: () => {
        if (session)
            return session.calibrateTilt();
        const save = cachedSave ?? loadGame();
        if (save) {
            save.settings.tiltNeutral = { beta: tiltBeta, gamma: tiltGamma, angle: tiltAngle };
            saveGame(save);
        }
        return true;
    },
};
ui.mugDemand = () => session?.activeMugDemand();
ui.setActions(actions);
ui.showTitle(hasSavedGame(), cachedSave);
window.addEventListener('pagehide', () => {
    if (session)
        saveGame(session.save);
});
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && session)
        saveGame(session.save);
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
    launch: () => session?.launch(),
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
            fuel: Math.round(save.player.fuel * 10) / 10,
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
