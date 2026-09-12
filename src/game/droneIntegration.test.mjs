import assert from 'node:assert/strict';
import { COMMODITIES, SHIPS } from './data.js';
import { OUTFIT_ITEMS } from './outfitting.js';
import { createNewSave, hydrateSave } from './save.js';
import { cargoFree, cargoMass, quoteCommodityTrade } from './economy.js';
import { generateAsteroidField } from './worldData.js';
import { GameSession } from './game.js';
import { createDroneUnit, droneBayLayoutFor } from './droneData.js';

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
 assert.equal(droneBayLayoutFor(hull).length > 0, ['wayfarer', 'prospector'].includes(hull));
 assert.equal(GameSession.prototype.extractAsteroid.call({}, { remaining: 10 }, 100, 999), false, 'no direct extraction on any hull');
 if (!['wayfarer', 'prospector'].includes(hull)) {
  assert.equal(GameSession.prototype.miningDroneActionState.call({ save: { player: { shipId: hull } } }).code, 'no-bay');
 }
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
