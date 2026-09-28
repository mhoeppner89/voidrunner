import assert from 'node:assert/strict';
import { createEnemyLoadout } from './enemyLoadouts.js';

const wayfarer = createEnemyLoadout({ hullId: 'wayfarer', role: 'escort', pilot: { tier: 'veteran' } }, 0);
assert.deepEqual(wayfarer.droneTypes, ['attack']);

const prospect = createEnemyLoadout({ hullId: 'prospector', role: 'miner', pilot: { tier: 'veteran' } }, 0);
assert.deepEqual(prospect.droneTypes, ['pdc', 'pdc', 'pdc']);

const atlas = createEnemyLoadout({ hullId: 'atlas', role: 'trader', pilot: { tier: 'veteran' } }, 0);
assert.deepEqual(atlas.droneTypes, ['pdc', 'attack']);
assert.equal(atlas.turrets.length, 4, 'all four physical Atlas turret sockets remain available');
assert.equal(atlas.turrets.filter(Boolean).length, 4, 'the default NPC fit uses the Atlas defensive turret layout');

const arenaAtlas = createEnemyLoadout({ hullId: 'atlas', role: 'trader', pilot: { tier: 'veteran' } }, 0, 'support');
assert.equal(arenaAtlas.turrets.filter(Boolean).length, 4, 'explicit arena fits can use all four Atlas turrets');

console.log('NPC role loadouts passed: Wayfarer attack drone, defensive Prospector complement, Atlas mixed support pair, and all Atlas sockets retained for explicit fits.');
