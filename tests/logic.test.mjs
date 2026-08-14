import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
  clear() { this.#values.clear(); }
}

globalThis.window = { localStorage: new MemoryStorage() };

const data = await import('../dist/src/game/data.js');
const economy = await import('../dist/src/game/economy.js');
const missions = await import('../dist/src/game/missions.js');
const saveModule = await import('../dist/src/game/save.js');
const shipStats = await import('../dist/src/game/shipStats.js');

const fresh = (seed = 0x5eed1234) => saveModule.createNewSave(seed);

test('star-system markets are deterministic but location-specific', () => {
  const first = fresh(10101);
  const second = fresh(10101);
  assert.deepEqual(first.world.market, second.world.market);

  let differingCommodities = 0;
  for (const commodityId of data.commodityIds) {
    const prices = data.DOCK_LOCATION_IDS.map((locationId) => first.world.market[locationId][commodityId].lastPrice);
    if (new Set(prices).size > 1) differingCommodities += 1;
  }
  assert.ok(differingCommodities >= 7, `Only ${differingCommodities} commodities varied by location`);
});

test('buying and selling mutates credits, cargo, supply, demand, and trade statistics', () => {
  const save = fresh(20202);
  const item = save.world.market.helix.water;
  const initial = {
    credits: save.player.credits,
    supply: item.supply,
    demand: item.demand,
    trades: save.player.stats.trades,
  };

  const purchase = economy.buyCommodity(save, 'helix', 'water', 2);
  assert.equal(purchase.ok, true);
  assert.equal(purchase.quantity, 2);
  assert.equal(save.player.cargo.water, 2);
  assert.equal(save.player.credits, initial.credits - purchase.total);
  assert.equal(item.supply, initial.supply - 2);
  assert.ok(item.demand >= initial.demand);
  assert.equal(save.player.stats.trades, initial.trades + 2);

  const sale = economy.sellCommodity(save, 'rook', 'water', 1);
  assert.equal(sale.ok, true);
  assert.equal(save.player.cargo.water, 1);
  assert.equal(save.player.stats.trades, initial.trades + 3);
});

test('cargo mass and equipment constraints prevent impossible loads', () => {
  const save = fresh(30303);
  save.player.credits = 1_000_000;
  const capacity = economy.cargoCapacity(save.player);
  const machineMass = data.COMMODITIES.machinery.mass;
  save.player.cargo.machinery = Math.floor(capacity / machineMass);
  const remaining = economy.cargoFree(save.player);
  assert.ok(remaining < machineMass);

  const result = economy.buyCommodity(save, 'helix', 'machinery', 1);
  assert.equal(result.ok, false);
  assert.match(result.message, /Cargo hold/i);

  const beforeUpgrade = economy.cargoCapacity(save.player);
  save.player.equipment.push('cargo-pods');
  assert.equal(economy.cargoCapacity(save.player), beforeUpgrade + 18);
});

test('delivery contracts reserve cargo, pay at destination, and advance reputation', () => {
  const save = fresh(40404);
  const offer = save.world.offers.helix.find((mission) => mission.kind === 'delivery');
  assert.ok(offer, 'Expected a delivery offer at Helix');
  const startingCredits = save.player.credits;
  const startingGuildRep = save.player.guildRep.merchant;
  const accepted = missions.acceptMission(save, 'helix', offer.id);
  assert.equal(accepted.ok, true);
  assert.ok(save.player.sealedCargo.some((entry) => entry.missionId === offer.id));
  assert.equal(save.player.credits, startingCredits - offer.deposit);

  const messages = missions.completeMissionsAtDock(save, offer.destination);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /complete/i);
  assert.equal(save.activeMissions.some((mission) => mission.id === offer.id), false);
  assert.equal(save.player.sealedCargo.some((entry) => entry.missionId === offer.id), false);
  assert.equal(save.player.credits, startingCredits + offer.reward);
  assert.ok(save.player.guildRep.merchant > startingGuildRep);
  assert.ok(save.world.completedMissionIds.includes(offer.id));
});

test('procurement contracts consume open-market cargo only at the destination', () => {
  const save = fresh(50505);
  const offer = save.world.offers.helix.find((mission) => mission.kind === 'procurement');
  assert.ok(offer, 'Expected a procurement offer at Helix');
  const accepted = missions.acceptMission(save, 'helix', offer.id);
  assert.equal(accepted.ok, true);

  const beforeCargo = offer.quantity - 1;
  save.player.cargo[offer.commodity] = beforeCargo;
  assert.deepEqual(missions.completeMissionsAtDock(save, offer.destination), []);
  assert.equal(save.activeMissions.some((mission) => mission.id === offer.id), true);

  save.player.cargo[offer.commodity] = offer.quantity;
  const messages = missions.completeMissionsAtDock(save, offer.destination);
  assert.equal(messages.length, 1);
  assert.equal(save.player.cargo[offer.commodity], 0);
});

test('bounty completion updates warrants, credits, guild standing, and pirate reputation', () => {
  const save = fresh(60606);
  const offer = save.world.offers.helix.find((mission) => mission.kind === 'bounty');
  assert.ok(offer, 'Expected a bounty offer at Helix');
  const accepted = missions.acceptMission(save, 'helix', offer.id);
  assert.equal(accepted.ok, true);
  const credits = save.player.credits;
  const pirateRep = save.player.reputation['red-talons'];

  const result = missions.completeBountyMission(save, offer.id);
  assert.equal(result.ok, true);
  assert.equal(save.player.credits, credits + offer.reward + offer.deposit);
  assert.ok(save.world.bountyKills.includes(offer.targetName));
  assert.ok(save.player.guildRep.bounty >= offer.guildRep + 2);
  assert.ok(save.player.reputation['red-talons'] < pirateRep);
});

test('mission deadlines fail contracts and remove sealed cargo', () => {
  const save = fresh(70707);
  const offer = save.world.offers.helix.find((mission) => mission.kind === 'transport' || mission.kind === 'delivery');
  assert.ok(offer);
  assert.equal(missions.acceptMission(save, 'helix', offer.id).ok, true);
  save.world.time = offer.deadline + 0.1;
  const messages = missions.failExpiredMissions(save);
  assert.equal(messages.length, 1);
  assert.ok(save.world.failedMissionIds.includes(offer.id));
  assert.equal(save.activeMissions.length, 0);
  assert.equal(save.player.sealedCargo.length, 0);
});

test('guild progression uses independent reputation tracks and unlock thresholds', () => {
  const save = fresh(80808);
  const credits = save.player.credits;
  assert.equal(missions.joinGuild(save, 'merchant').ok, true);
  assert.equal(save.player.credits, credits - missions.guildJoinCost('merchant'));
  assert.equal(save.player.guildRep.merchant, 1);

  const rankMessage = missions.awardCareerProgress(save, 'merchant', 70, 'free-merchants');
  assert.equal(save.player.guildRank.merchant, 2);
  assert.match(rankMessage, /rank advanced/i);
  assert.equal(save.player.guildRank.bounty, 0);
});

test('the second ship is substantially stronger and equipment changes effective stats', () => {
  const starter = data.SHIPS.wayfarer;
  const advanced = data.SHIPS.vanguard;
  assert.ok(advanced.price >= starter.price + 40_000);
  assert.ok(advanced.maxSpeed > starter.maxSpeed * 1.25);
  assert.ok(advanced.shield > starter.shield * 1.5);
  assert.ok(advanced.armor > starter.armor * 1.5);
  assert.ok(advanced.cargo > starter.cargo * 1.4);

  const save = fresh(90909);
  const base = shipStats.getEffectiveShipStats(save.player);
  save.player.equipment.push('engine-mk2', 'thrusters-mk2', 'shield-mk2', 'armor-mk2', 'pulse-mk2', 'radar-mk2');
  const upgraded = shipStats.getEffectiveShipStats(save.player);
  assert.ok(upgraded.maxSpeed > base.maxSpeed);
  assert.ok(upgraded.angularAcceleration > base.angularAcceleration);
  assert.ok(upgraded.shield > base.shield);
  assert.ok(upgraded.armor > base.armor);
  assert.ok(upgraded.gunDamage > base.gunDamage);
  assert.ok(upgraded.scanRange > base.scanRange);
});

test('save serialization restores world, missions, inventory, discoveries, and settings', () => {
  window.localStorage.clear();
  const save = fresh(100100);
  save.player.credits = 12_345;
  save.player.cargo.ore = 7;
  save.player.equipment.push('mining-mk1');
  save.player.discovered.push('shardbelt');
  save.world.depletedAsteroids['ore-test'] = 0.35;
  save.world.scannedNodes.push('ore-test');
  save.settings.touchScale = 1.2;
  const offer = save.world.offers.helix[0];
  assert.equal(missions.acceptMission(save, 'helix', offer.id).ok, true);

  assert.equal(saveModule.saveGame(save), true);
  const loaded = saveModule.loadGame();
  assert.ok(loaded);
  assert.equal(loaded.player.credits, save.player.credits);
  assert.equal(loaded.player.cargo.ore, 7);
  assert.ok(loaded.player.equipment.includes('mining-mk1'));
  assert.ok(loaded.player.discovered.includes('shardbelt'));
  assert.equal(loaded.world.depletedAsteroids['ore-test'], 0.35);
  assert.ok(loaded.world.scannedNodes.includes('ore-test'));
  assert.equal(loaded.settings.touchScale, 1.2);
  assert.equal(loaded.activeMissions.length, 1);
});
