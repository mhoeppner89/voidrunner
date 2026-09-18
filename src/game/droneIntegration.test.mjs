import assert from 'node:assert/strict';
import { COMMODITIES, SHIPS } from './data.js';
import { OUTFIT_ITEMS } from './outfitting.js';
import { createNewSave, hydrateSave } from './save.js';
import { cargoFree, cargoMass, quoteCommodityTrade } from './economy.js';
import { generateAsteroidField } from './worldData.js';
import { GameSession } from './game.js';
import { createDroneUnit, droneBayLayoutFor, normalizeDroneFleet } from './droneData.js';
import { startMining } from './droneMining.js';
import { createOutfittingState } from './outfitting.js';

assert.ok(generateAsteroidField(4242, {}).every(node => Number.isSafeInteger(node.remaining)), 'real generated deposits are mineable');
assert.ok(Object.values(COMMODITIES).every(c => c.mass === 1));
assert.equal(OUTFIT_ITEMS['mining-mk2'], undefined);
const old = createNewSave(77);
old.version = 15;
old.player.cargo = { medicine: 50 };
old.player.outfitting.loadouts.wayfarer.utility[0] = 'mining-mk2';
old.player.outfitting.locker['mining-mk2'] = 2;
old.player.equipment = ['mining-mk2']; // Compatibility mirror is not a fourth purchase.
const before = JSON.stringify(old);
const migrated = hydrateSave(old);
assert.equal(JSON.stringify(old), before, 'migration does not mutate the input');
assert.equal(migrated.player.credits, old.player.credits + 3 * 7600);
assert.equal(migrated.player.cargo.medicine, 50);
assert.equal(cargoMass(migrated.player), 50);
assert.equal(cargoFree(migrated.player), 0);
assert.equal(hydrateSave(migrated).player.credits, migrated.player.credits, 'refund exactly once');
const keyed = structuredClone(old);
keyed.player.outfitting.loadouts.wayfarer.utility = { 'utility-1': 'mining-mk2' };
assert.equal(hydrateSave(keyed).player.credits, migrated.player.credits, 'legacy keyed mount refunded');

const save = createNewSave(10);
save.player.cargo = { ore: 31 };
const unit = Object.values(save.player.droneFleet.unitsById)[0];
unit.state = 'docking'; unit.payload = { units: 1, unitMass: 1 };
assert.equal(cargoFree(save.player), 0, 'inbound cargo blocks every cargoFree consumer');
const pickup = { commodity: 'food', amount: 1, life: 10 };
GameSession.prototype.collectPickup.call({ save, setOwnMonitorStatus() {} }, pickup);
assert.equal(pickup.life, 10, 'pickup cannot steal reserved space');
assert.equal(save.player.cargo.food, undefined);
for (const hull of Object.keys(SHIPS)) {
 assert.equal(droneBayLayoutFor(hull).length > 0, ['wayfarer', 'prospector', 'torsas', 'astra'].includes(hull));
 assert.equal(GameSession.prototype.extractAsteroid.call({}, { remaining: 10 }, 100, 999), false, 'no direct extraction on any hull');
 if (!['wayfarer', 'prospector'].includes(hull)) {
  assert.equal(GameSession.prototype.miningDroneActionState.call({ save: { player: { shipId: hull } } }).code, 'no-bay');
 }
}
// Both authored drone hulls receive a complete fresh complement: Wayfarer has
// one two-slot bay, while Prospector has three. This guards the full player
// setup rather than only the isolated controller fixtures below.
for (const hull of ['wayfarer', 'prospector']) {
 const loadouts = createOutfittingState([hull]).loadouts;
 const fleet = normalizeDroneFleet(null, loadouts, { grantInitial: true });
 const fit = loadouts[hull];
 const assigned = fit.droneBays.flatMap(bay => bay.unitIds).filter(Boolean);
 assert.equal(assigned.length, hull === 'wayfarer' ? 2 : 6, `${hull} receives every bay slot`);
 assert.equal(new Set(assigned).size, assigned.length, `${hull} drone identities are unique`);
 assert.ok(assigned.every(id => fleet.unitsById[id]?.type === 'mining'), `${hull} complement is operational mining stock`);
}
// A new flight target does not cancel the assigned mining cycle.
const rt = Object.create(GameSession.prototype);
Object.assign(rt, { save, ships: [], renderer: { setTarget() {} }, audio: { play() {} }, setHyperdriveStatus() {}, deathTimer: 0 });
save.player.droneFleet.controller.phase = 'running';
rt.applyTarget({ id: 'another-contact', kind: 'asteroid' });
assert.equal(save.player.droneFleet.controller.phase, 'running');
rt.clearTarget();
assert.equal(save.player.droneFleet.controller.phase, 'running');
// Departure is queued once and resumes once, only after the fleet is stowed.
rt.recallAllDrones = () => {};
save.player.dockedAt = null; save.player.throttle = 0.4;
let departed = 0; rt.toggleHyperdrive = () => departed++;
assert.equal(rt.requestDroneDeparture('hyperdrive'), false);
assert.equal(save.player.throttle, 0);
rt.updateDroneDeparture(); assert.equal(departed, 0);
const defender = createDroneUnit('test-defender', 'pdc'); defender.state = 'returning';
save.player.droneFleet.unitsById[defender.id] = defender;
unit.state = 'stowed'; unit.payload = null;
rt.updateDroneDeparture(); assert.equal(departed, 0, 'PDC return also gates departure');
defender.state = 'stowed';
rt.updateDroneDeparture(); rt.updateDroneDeparture();
assert.equal(departed, 1); assert.equal(save.player.throttle, 0.4);

// Seeded, actual sell quotes: ordinary ore approaches 6k; gold adds a substantial premium.
let oreTotal = 0, goldTotal = 0;
for (let seed = 1; seed <= 32; seed++) {
 const s = createNewSave(seed);
 s.player.cargo = { ore: 32 };
 oreTotal += quoteCommodityTrade(s, 'helix', 'ore', 'sell', 32).total;
 s.player.cargo = { ore: 29, gold: 3 };
 goldTotal += quoteCommodityTrade(s, 'helix', 'ore', 'sell', 29).total + quoteCommodityTrade(s, 'helix', 'gold', 'sell', 3).total;
}
const average = oreTotal / 32;
assert.ok(average > 5000 && average < 7000, `ore haul average ${average}`);
assert.ok(goldTotal > oreTotal * 1.5, 'three gold raises a haul substantially');
console.log(`Drone integration passed; mean Helix haul: ore ${average.toFixed(0)} cr; 29 ore + 3 gold ${(goldTotal / 32).toFixed(0)} cr.`);

// The live adapter gives each miner its own launch lane and work point.
// Equal-duration mining verifies that two units contribute twice, not just render twice.
function measureMiners(hull, limit) {
 const loadouts = createOutfittingState([hull]).loadouts;
 const save = createNewSave(4242);
 Object.assign(save.player, { shipId: hull, dockedAt: null, cargo: {}, position: [0, 0, 80],
  velocity: [0, 0, 0], rotation: [0, 0, 0, 1], angularVelocity: [0, 0, 0] });
 save.player.outfitting.loadouts = loadouts;
 save.player.droneFleet = normalizeDroneFleet(null, loadouts, { grantInitial: true });
 if (limit === 1) loadouts[hull].droneBays[0].unitIds[1] = null;
 const node = generateAsteroidField(4242, {})[0];
 Object.assign(node, { position: [0, 0, 0], moving: false, scanned: true, remaining: 1000 });
 save.player.currentTargetId = node.id;
 const rt = Object.create(GameSession.prototype);
 Object.assign(rt, { save, asteroids: [node], deathTimer: 0, playerStats: () => ({ cargo: 1000 }) });
 let ctx = rt.prepareMiningDroneContext();
 assert.equal(ctx.unitIds.length, limit ?? (hull === 'wayfarer' ? 2 : 6));
 assert.equal(new Set(ctx.unitIds.map(id => ctx.bayAnchors[id].launch.position.join(','))).size, ctx.unitIds.length);
 assert.equal(new Set(ctx.unitIds.map(id => ctx.getWorkPoint(save.player.droneFleet.unitsById[id], ctx).position.join(','))).size, ctx.unitIds.length);
 assert.equal(startMining(save.player.droneFleet, ctx).ok, true);
 for (let i = 0; i < 120 * 60; i++) {
  ctx = rt.prepareMiningDroneContext(1 / 60);
  rt.miningDroneSystem.update(save.player.droneFleet, 1 / 60, ctx, []);
 }
 return save.player.cargo.ore ?? 0;
}
const soloYield = measureMiners('wayfarer', 1);
const pairYield = measureMiners('wayfarer');
const sixYield = measureMiners('prospector');
assert.ok(soloYield > 0);
assert.ok(pairYield / soloYield >= 1.8 && pairYield / soloYield <= 2.2);
assert.ok(sixYield / pairYield >= 2.7 && sixYield / pairYield <= 3.3);
console.log(`120s mining deliveries: one ${soloYield}, pair ${pairYield}, three pairs ${sixYield}`);
