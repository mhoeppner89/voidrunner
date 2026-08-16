import { GameSession } from './game/game.js';
import { createNewSave, hasSavedGame, loadGame, saveGame } from './game/save.js';
import { GameUI } from './game/ui.js';
const host = document.querySelector('#app');
if (!host)
    throw new Error('Missing #app host element.');
const ui = new GameUI(host);
let session;
let cachedSave = loadGame();
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
    }, mode === 'arena' ? arena : null);
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
    enableTilt: () => session?.enableTilt() ?? Promise.resolve(false),
    calibrateTilt: () => session?.calibrateTilt(),
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
window.__VOID_PRIVATEER__ = {
    newGame: () => beginSession('new'),
    resume: () => beginSession('resume'),
    startArena: (environment, scenario) => beginSession('arena', { environment, scenario }),
    getState: () => session?.save ?? cachedSave,
    getRuntime: () => session,
    debugShips: () => session?.ships,
    pickTarget: (x, y) => session?.renderer?.pickTarget(x, y),
    projectToScreen: (position) => session?.renderer?.projectToScreen(position),
    launch: () => session?.launch(),
    saveNow: () => session?.saveNow(),
};
