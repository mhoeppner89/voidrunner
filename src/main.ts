import { GameSession } from './game/game';
import { createNewSave, hasSavedGame, loadGame, saveGame } from './game/save';
import type { CommodityId, EquipmentId, GuildId, LocationId, ShipId } from './game/types';
import { GameUI, type UIActions } from './game/ui';

const host = document.querySelector<HTMLElement>('#app');
if (!host) throw new Error('Missing #app host element.');

const ui = new GameUI(host);
let session: GameSession | undefined;
let cachedSave = loadGame();

const beginSession = (mode: 'new' | 'resume'): void => {
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

const requestFullscreen = async (): Promise<void> => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    const orientation = screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> };
    await orientation.lock?.('landscape');
  } catch {
    ui.showToast('Fullscreen or orientation lock was declined by the browser.', 'info');
  }
};

const actions: UIActions = {
  startNew: () => beginSession('new'),
  resume: () => beginSession('resume'),
  requestFullscreen: () => void requestFullscreen(),
  launch: () => {
    void session?.enableAudio();
    session?.launch();
  },
  setNav: (locationId: LocationId) => session?.setNav(locationId),
  trade: (kind: 'buy' | 'sell', commodityId: CommodityId, quantity: number) => session?.trade(kind, commodityId, quantity),
  acceptMission: (missionId: string) => session?.acceptMission(missionId),
  repair: () => session?.repair(),
  refuel: () => session?.refuel(),
  buyEquipment: (equipmentId: EquipmentId) => session?.buyEquipment(equipmentId),
  buyShip: (shipId: ShipId) => session?.buyShip(shipId),
  switchShip: (shipId: ShipId) => session?.switchShip(shipId),
  joinGuild: (guildId: GuildId) => session?.joinGuild(guildId),
  saveNow: () => session?.saveNow(),
  resumeFlight: () => session?.resumeFlight(),
  quitToTitle: () => session?.quitToTitle(),
  setSetting: (key, value) => session?.setSetting(key, value),
};
ui.setActions(actions);
ui.showTitle(hasSavedGame(), cachedSave);

window.addEventListener('pagehide', () => {
  if (session) saveGame(session.save);
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && session) saveGame(session.save);
});

const isProductionBuild = (import.meta as ImportMeta & { env?: { PROD?: boolean } }).env?.PROD ?? location.protocol !== 'file:';
if ('serviceWorker' in navigator && isProductionBuild) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}

declare global {
  interface Window {
    __VOID_PRIVATEER__?: {
      newGame: () => void;
      resume: () => void;
      getState: () => unknown;
      getRuntime: () => unknown;
      launch: () => void;
    };
  }
}

window.__VOID_PRIVATEER__ = {
  newGame: () => beginSession('new'),
  resume: () => beginSession('resume'),
  getState: () => session?.save ?? cachedSave,
  getRuntime: () => session?.debugSnapshot(),
  launch: () => session?.launch(),
};
