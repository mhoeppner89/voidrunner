import { SHIPS } from './data.js';
import { getEffectiveShipStats, repairCost, refillCost, equipmentUnlocked } from './shipStats.js';
import { createNewSave, hydrateSave } from './save.js';
let failures = 0;
const check = (label, actual, expected) => {
    const ok = typeof expected === 'number' ? Math.abs(actual - expected) < 1e-9 : actual === expected;
    if (ok)
        console.log(`ok - ${label}`);
    else {
        failures += 1;
        console.error(`FAIL ${label}: got ${actual}, expected ${expected}`);
    }
};
const checkTrue = (label, condition) => {
    if (condition)
        console.log(`ok - ${label}`);
    else {
        failures += 1;
        console.error(`FAIL ${label}`);
    }
};
const playerWith = (equipment, overrides = {}) => ({
    shipId: 'wayfarer',
    equipment,
    hull: 100,
    shield: 90,
    armor: 85,
    fuel: 100,
    missiles: 4,
    guildRank: { merchant: 0, bounty: 0, mining: 0, salvage: 0, syndicate: 0 },
    ...overrides,
});

// A bare wayfarer with an empty loadout resolves to the hull's own stat block.
const base = getEffectiveShipStats(playerWith([]));
check('wayfarer base shield', base.shield, 90);
check('wayfarer base armor', base.armor, 85);
check('wayfarer base hull', base.hull, 100);
check('wayfarer base cargo', base.cargo, 32);
check('wayfarer base fuel', base.fuel, 100);
check('wayfarer base gun damage', base.gunDamage, 10);
check('wayfarer base missile capacity', base.missileCapacity, 4);
check('wayfarer base max speed', base.maxSpeed, 50);
check('wayfarer base afterburn speed', base.afterburnSpeed, 75);
check('wayfarer base acceleration', base.acceleration, 21);
check('wayfarer base turn authority', base.angularAcceleration, 1.65);
check('wayfarer base radar range', base.radarRange, 1000);
check('wayfarer base scan range', base.scanRange, 500);
check('wayfarer base mining rate', base.miningRate, 1);

// Each piece of equipment applies its documented modifier on top of the hull.
const engineFit = getEffectiveShipStats(playerWith(['engine-mk2']));
check('engine-mk2 max speed', engineFit.maxSpeed, 50 * 1.18);
check('engine-mk2 afterburn', engineFit.afterburnSpeed, 75 * 1.18);
check('engine-mk2 acceleration', engineFit.acceleration, 21 * 1.18);
const thrusterFit = getEffectiveShipStats(playerWith(['thrusters-mk2']));
check('thrusters-mk2 turn authority', thrusterFit.angularAcceleration, 1.65 * 1.22);
const shieldFit = getEffectiveShipStats(playerWith(['shield-mk2']));
check('shield-mk2 capacity', shieldFit.shield, 135);
const armorFit = getEffectiveShipStats(playerWith(['armor-mk2']));
check('armor-mk2 capacity', armorFit.armor, 125);
const pulseFit = getEffectiveShipStats(playerWith(['pulse-mk2']));
check('pulse-mk2 gun damage', pulseFit.gunDamage, 13.5);
const cargoFit = getEffectiveShipStats(playerWith(['cargo-pods']));
check('cargo-pods capacity', cargoFit.cargo, 50);
const radarFit = getEffectiveShipStats(playerWith(['radar-mk2']));
check('radar-mk2 radar range', radarFit.radarRange, 1250);
check('radar-mk2 scan range', radarFit.scanRange, 750);
const miningFit = getEffectiveShipStats(playerWith(['mining-mk2']));
check('mining-mk2 rate', miningFit.miningRate, 1.7);
const salvageFit = getEffectiveShipStats(playerWith(['salvage-mk2']));
check('salvage-mk2 rate', salvageFit.salvageRate, 1.7);
check('salvage-mk2 range', salvageFit.salvageRange, 170);
// Modifiers compose when several pieces are fitted at once.
const comboFit = getEffectiveShipStats(playerWith(['engine-mk2', 'shield-mk2', 'cargo-pods', 'radar-mk2']));
check('combo keeps engine boost', comboFit.maxSpeed, 50 * 1.18);
check('combo keeps shield boost', comboFit.shield, 135);
check('combo keeps cargo boost', comboFit.cargo, 50);
check('combo keeps radar boost', comboFit.radarRange, 1250);

// A different hull reads its own base block, never the starter's.
const talonFit = getEffectiveShipStats(playerWith([], { shipId: 'talon' }));
check('talon base shield', talonFit.shield, SHIPS.talon.shield);
check('talon base speed', talonFit.maxSpeed, SHIPS.talon.maxSpeed);

// Guild-gated gear unlocks only with the required rank.
const freshGates = playerWith([]);
checkTrue('pulse-mk2 locked at bounty rank 0', !equipmentUnlocked(freshGates, 'pulse-mk2'));
const bountyPilot = playerWith([], { guildRank: { merchant: 0, bounty: 1, mining: 0, salvage: 0, syndicate: 0 } });
checkTrue('pulse-mk2 unlocks at bounty rank 1', equipmentUnlocked(bountyPilot, 'pulse-mk2'));
const merchantPilot = playerWith([], { guildRank: { merchant: 1, bounty: 0, mining: 0, salvage: 0, syndicate: 0 } });
checkTrue('cargo-pods unlocks at merchant rank 1', equipmentUnlocked(merchantPilot, 'cargo-pods'));
checkTrue('engine-mk2 has no guild gate', equipmentUnlocked(freshGates, 'engine-mk2'));

// A fresh career starts with an empty equipment rack and resolves cleanly.
const fresh = createNewSave(1234);
check('fresh save equipment empty', fresh.player.equipment.length, 0);
check('fresh save starts on wayfarer', fresh.player.shipId, 'wayfarer');
check('fresh save docks at helix', fresh.player.dockedAt, 'helix');
check('fresh save starting credits', fresh.player.credits, 3200);
check('fresh save resolves wayfarer stats', getEffectiveShipStats(fresh.player).cargo, 32);
check('fresh save resolves wayfarer shield', getEffectiveShipStats(fresh.player).shield, 90);

// Legacy saves carry their flat equipment array through hydration, and the
// fitted gear applies once stats are resolved.
const migrated = hydrateSave({
    version: 5,
    player: {
        shipId: 'wayfarer',
        dockedAt: 'helix',
        position: [0, 0, 0],
        hull: 100,
        shield: 90,
        armor: 85,
        fuel: 100,
        missiles: 4,
        credits: 3200,
        equipment: ['shield-mk2', 'pulse-mk2', 'cargo-pods', 'engine-mk2'],
    },
    world: { seed: 1234 },
});
check('migration preserves equipment rack', migrated.player.equipment.join(','), 'shield-mk2,pulse-mk2,cargo-pods,engine-mk2');
check('migrated shield resolves', getEffectiveShipStats(migrated.player).shield, 135);
check('migrated gun resolves', getEffectiveShipStats(migrated.player).gunDamage, 13.5);
check('migrated cargo resolves', getEffectiveShipStats(migrated.player).cargo, 50);
check('migrated engine resolves', getEffectiveShipStats(migrated.player).maxSpeed, 50 * 1.18);

// Repair and refill costs scale with what is actually missing.
const banged = playerWith([], { hull: 40, armor: 30, fuel: 30, missiles: 0 });
checkTrue('damaged hull costs more to repair', repairCost(banged) > repairCost(playerWith([])));
checkTrue('empty missiles cost more to refill', refillCost(banged) > refillCost(playerWith([])));
check('refill cost is whole credits', Number.isInteger(refillCost(banged)), true);

if (failures > 0) {
    console.error(`${failures} assertion(s) failed`);
    process.exit(1);
}
console.log('all shipStats assertions passed');
