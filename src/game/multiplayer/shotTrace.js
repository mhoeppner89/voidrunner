import { segmentShipColliderHit } from '../shipCollision.js';

// Beams, projectiles and lock checks use the same hull scale and terrain
// ordering. Terrain wins ties, so cover at the point of impact still counts.
export function traceMatchShot(from, to, shooter, actors, { terrainHit, canHit, padding = 0, skipId } = {}) {
    const terrain = terrainHit?.(from, to);
    let nearest = terrain?.t ?? Infinity;
    let actorHit;

    for (const actor of actors) {
        if (actor.id === shooter.id || actor.id === skipId || actor.hull <= 0 || (canHit && !canHit(shooter, actor))) continue;
        const t = segmentShipColliderHit(from, to, actor.position, actor.rotation, actor.variant, actor.scale ?? 1, padding);
        if (t !== undefined && t < nearest) {
            nearest = t;
            actorHit = actor;
        }
    }

    return actorHit ? { t: nearest, actor: actorHit } : terrain;
}
