import assert from 'node:assert/strict';
import { createEnemyLoadout } from '../../src/game/enemyLoadouts.js';

const wayfarer = createEnemyLoadout({ hullId: 'wayfarer', role: 'escort', pilot: { tier: 'veteran' } }, 0);
assert.deepEqual(wayfarer.droneTypes, ['attack']);

// A civilian hauler mans fewer mounts than its hull carries: the Prospector
// flies one PDC drone of three bays, the Atlas two PDC drones and two of its
// four turrets. The free mounts stay free for explicit arena/observer fits.
const prospect = createEnemyLoadout({ hullId: 'prospector', role: 'miner', pilot: { tier: 'veteran' } }, 0);
assert.deepEqual(prospect.droneTypes, ['pdc']);

const atlas = createEnemyLoadout({ hullId: 'atlas', role: 'trader', pilot: { tier: 'veteran' } }, 0);
assert.deepEqual(atlas.droneTypes, ['pdc', 'pdc']);
assert.equal(atlas.turrets.length, 4, 'all four physical Atlas turret sockets remain available');
assert.equal(atlas.turrets.filter(Boolean).length, 2, 'the default NPC fit mans two of the four Atlas turret sockets');

// The Mule keeps both PDC sockets: its two turrets cover different arcs, so a
// freighter that stands down one of them loses its belly/upper coverage.
const mule = createEnemyLoadout({ hullId: 'mule', role: 'trader', pilot: { tier: 'veteran' } }, 0);
assert.deepEqual(mule.turrets, ['pdc', 'pdc'], 'the Mule mans both PDC sockets');

const arenaAtlas = createEnemyLoadout({ hullId: 'atlas', role: 'trader', pilot: { tier: 'veteran' } }, 0, 'support');
assert.equal(arenaAtlas.turrets.filter(Boolean).length, 4, 'explicit arena fits can use all four Atlas turrets');

console.log('NPC role loadouts passed: Wayfarer attack drone, one defensive Prospector drone, a two-drone Atlas with two manned turrets, and all Atlas sockets retained for explicit fits.');
