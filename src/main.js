import { GameSession } from './game/game.js';
import { createNewSave, hasSavedGame, loadGame, saveGame } from './game/save.js';
import { GameUI } from './game/ui.js';
const host = document.querySelector('#app');
if (!host)
    throw new Error('Missing #app host element.');
const ui = new GameUI(host);
let session;
let cachedSave = loadGame();
const beginSession = (mode) => {
    session?.dispose();
    const save = mode === 'new' ? createNewSave() : loadGame();
    if (!save) {
        ui.showToast('No autosave was found.', 'warning');
        ui.showTitle(false);
        return;
    }
    cachedSave = save;
    saveGame(save);
    session = new GameSession(save, ui, () => {
        session = undefined;
        cachedSave = loadGame();
        ui.showTitle(Boolean(cachedSave), cachedSave);
    });
    void session.enableAudio();
};
const requestFullscreen = async () => {
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
const actions = {
    startNew: () => beginSession('new'),
    resume: () => beginSession('resume'),
    requestFullscreen: () => void requestFullscreen(),
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
        void navigator.serviceWorker.register('./sw.js').catch(() => undefined);
    });
}
window.__VOID_PRIVATEER__ = {
    newGame: () => beginSession('new'),
    resume: () => beginSession('resume'),
    getState: () => session?.save ?? cachedSave,
    getRuntime: () => session?.debugSnapshot(),
    launch: () => session?.launch(),
};
