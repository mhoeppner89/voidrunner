import { GameSession } from './game/game.js';
import { createNewSave, hasSavedGame, loadGame, saveGame } from './game/save.js';
import { GameUI } from './game/ui.js';
import { ShowcaseRenderer } from './game/showcase.js';
const host = document.querySelector('#app');
if (!host)
    throw new Error('Missing #app host element.');
const ui = new GameUI(host);
let session;
let cachedSave = loadGame();
// Tilt state shared with the title screen, where no session (and no
// InputManager) exists yet. The gyro listener keeps live readings so
// ENABLE TILT STEER and SET NEUTRAL work before a career starts.
let tiltGranted = false;
let tiltBeta = 0;
let tiltGamma = 0;
if (typeof DeviceOrientationEvent !== 'undefined') {
    window.addEventListener('deviceorientation', (event) => {
        if (event.beta == null || event.gamma == null)
            return;
        // Same screen-frame rotation the InputManager applies (see input.js).
        const radians = ((screen?.orientation?.angle ?? window.orientation ?? 0) * Math.PI) / 180;
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
        ui.showToast('No autosave was found.', 'warning');
        ui.showTitle(false);
        return;
    }
    if (mode === 'arena')
        save.arena = arena;
    cachedSave = save;
    saveGame(save);
    session = new GameSession(save, ui, () => {
        session = undefined;
        cachedSave = loadGame();
        ui.showTitle(Boolean(cachedSave), cachedSave);
    }, mode === 'arena' ? arena : null, tiltGranted);
    void session.enableAudio();
};
const enterFullscreen = async () => {
    try {
        if (!document.fullscreenElement)
            await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        const orientation = screen.orientation;
        await orientation.lock?.('landscape');
    }
    catch {
        ui.showToast('Fullscreen or orientation lock was declined by the browser.', 'info');
    }
};
const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
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
    startArena: (environment, scenario) => beginSession('arena', { environment, scenario }),
    requestFullscreen: () => void enterFullscreen(),
    toggleFullscreen: () => void toggleFullscreen(),
    launch: () => {
        void session?.enableAudio();
        session?.launch();
    },
    setNav: (locationId) => session?.setNav(locationId),
    openMap: () => session?.openMap(),
    openShipMenu: () => session?.openShipMenu(),
    selectTarget: (kind, id) => session?.selectTarget(kind, id),
    trade: (kind, commodityId, quantity) => session?.trade(kind, commodityId, quantity),
    acceptMission: (missionId) => session?.acceptMission(missionId),
    repair: () => session?.repair(),
    refuel: () => session?.refuel(),
    buyEquipment: (equipmentId) => session?.buyEquipment(equipmentId),
    buyShip: (shipId) => session?.buyShip(shipId),
    switchShip: (shipId) => session?.switchShip(shipId),
    joinGuild: (guildId) => session?.joinGuild(guildId),
    saveNow: () => session?.saveNow(),
    resumeFlight: () => session?.resumeFlight(),
    quitToTitle: () => session?.quitToTitle(),
    setSetting: (key, value) => session?.setSetting(key, value),
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
            save.settings.tiltNeutral = { beta: tiltBeta, gamma: tiltGamma };
            saveGame(save);
        }
        return true;
    },
};
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
// Workbench-only path: when the page is loaded with `?test=showcase` the
// harness bypasses the title UI and loads a clean showroom scene so each
// ship / planet / station can be captured on a turntable without any
// contamination from the player's actual location, asteroids, or HUD.
const startupParams = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
let showcaseInstance = null;
if (startupParams?.get('test') === 'showcase') {
    const host = document.querySelector('#app');
    if (host) host.innerHTML = '<div id="showcase-host" style="position:fixed;inset:0;background:#0c1531;"></div>';
    showcaseInstance = new ShowcaseRenderer(document.querySelector('#showcase-host'));
}

if ('serviceWorker' in navigator && isProductionBuild) {
    window.addEventListener('load', () => {
        // If a returning player is controlled by a stale service worker from a
        // previous deploy, a fresh push installs the new one (skipWaiting +
        // clients.claim) but nothing reloads the page — so the old build keeps
        // running until the player manually refreshes. Reload once when the new
        // service worker takes control so deployed updates actually show up.
        const alreadyControlled = Boolean(navigator.serviceWorker.controller);
        void navigator.serviceWorker.register('./sw.js').then(() => {
            if (!alreadyControlled) return;
            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (refreshing) return;
                refreshing = true;
                window.location.reload();
            });
        }).catch(() => undefined);
    });
}
// Determine the loaded surface so the harness can always speak to *something*,
// even on the title screen.
window.__VOID_PRIVATEER__ = {
    newGame: () => beginSession('new'),
    resume: () => beginSession('resume'),
    startArena: (environment, scenario) => beginSession('arena', { environment, scenario }),
    getState: () => session?.save ?? cachedSave,
    getRuntime: () => session,
    getLocations: () => session?.renderer?.locationMeshes ?? null,
    getLocation: (id) => session?.renderer?.locationMeshes?.get(id) ?? null,
    debugShips: () => session?.ships,
    pickTarget: (x, y) => session?.renderer?.pickTarget(x, y),
    projectToScreen: (position) => session?.renderer?.projectToScreen(position),
    launch: () => session?.launch(),
    saveNow: () => session?.saveNow(),
    setChaseCamera: (active, offset) => session?.renderer?.setChaseCamera?.(active, offset),
    renderChaseFrame: () => session?.renderer?.renderChaseFrame?.(),
    cinematicFrame: (targetId, opts) => {
        const r = session?.renderer;
        if (!r) return null;
        const target = (() => {
            if (!targetId) return null;
            if (targetId.type === 'ship') {
                const map = r.shipMeshes;
                return map?.get(targetId.entityId) ?? r.shipMeshes?.get(targetId.entityId);
            }
            if (targetId.type === 'location') return r.locationMeshes?.get(targetId.locationId);
            if (targetId.type === 'instanceRoot') return r.instanceRoots?.get(targetId.locationId);
            if (targetId.type === 'asteroid') {
                // Find the instanced mesh that contains this asteroid node index.
                const nodeIndex = targetId.nodeIndex;
                for (const { mesh, entries } of r.asteroidMeshes) {
                    if (entries[nodeIndex]) return mesh;
                }
                return null;
            }
            return null;
        })();
        if (!target) return { error: `no target for ${JSON.stringify(targetId)}` };
        return r.cinematicFrame(target, opts);
    },
    setCockpitVisible: (visible) => session?.renderer?.setCockpitVisible?.(visible),
    clusterFrame: (opts) => session?.renderer?.clusterFrame?.(opts),
    spawnShipAt: (role, x, y, z) => session?.spawnShip?.(role, [x, y, z]),
    getAsteroidCenter: () => session?.renderer?.asteroidMeshes?.[0]?.mesh?.position?.toArray?.() ?? null,
    getAsteroidMeshes: () => {
        const r = session?.renderer;
        if (!r) return null;
        return { meshes: r.asteroidMeshes?.map(({ mesh }) => mesh.position.toArray()) };
    },
    ...(startupParams?.get('test') === 'showcase' && showcaseInstance
        ? {
            showcase: {
                listPoses: () => Object.keys(showcaseInstance.poseItems).concat(['lineup']),
                renderPose: (name, opts) => showcaseInstance.render(name, opts),
                snapshotPose: (name, opts) => showcaseInstance.snapshot(name, opts),
                renderer: showcaseInstance,
            },
            isShowcase: true,
        }
        : {}),
};
