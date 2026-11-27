import { updateAutomaticTurrets } from '../turrets.js';
import { fireMatchBeam, fireMatchRound, hullExtents } from './matchProjectiles.js';

// Each human uses the player tracking model of the existing turret controller.
// It sees the same projectiles, terrain and ship poses as the forward guns.
export function createTurretSession(combat) {
    const session = {
        save: { player: null, world: { time: 0 } },
        renderer: {},
        get ships() { return combat.actors; },
        projectiles: combat.projectiles,
        projStore: {
            getPos: (slot, out) => out.fromArray(combat.projectiles[slot].position),
            getVel: (slot, out) => out.fromArray(combat.projectiles[slot].velocity),
        },
        playerStats: () => session.save.player.stats,
        turretHullExtents: hullExtents,
        npcHullExtents: hullExtents,
        lineBlocked: (from, to) => Boolean(combat.terrainHit?.(from, to)),
        fireBeam(ownerId, weapon, muzzle, direction, mountId) {
            fireMatchBeam(combat, session.save.player, weapon, mountId, muzzle, direction);
        },
        spawnGunProjectile(ownerId, weapon, muzzle, direction, velocity, targetId, mountId) {
            const target = combat.actors.find(actor => actor.id === targetId);
            combat.events.push({ type: 'shot', ownerId, targetId, weaponId: weapon.id, mountId,
                kind: weapon.kind, position: muzzle.toArray(), tint: weapon.tint });
            return fireMatchRound(combat, session.save.player, weapon, mountId, muzzle, direction, target);
        },
    };
    return session;
}

export function stepPilotTurrets(combat, actor, target, dt) {
    const session = combat.turrets;
    if (!actor.turretRuntime) session.pdcDefenseChannels?.delete(actor.id);
    session.save.player = actor;
    session.save.world.time = combat.time;
    updateAutomaticTurrets(session, actor, actor.id, dt, { target });
}
