// Hostility alone is not permission for automatic weapons to start a fight.
export const combatTargetEligible = ship => Boolean(ship && ship.hull > 0 && !ship.race
    && !ship.surrendered && !ship.captured && !ship.poweredDown && !ship.standingDown
    && !ship.holdFire && !ship.pendingMug && !ship.pendingMugLeaderId);

// A retained target ID can outlast the firing-quality track during a search.
export function tracksActivePlayer(session, ship) {
    const player = session.save.player;
    return !session.arena?.observer && !player.dockedAt && player.hull > 0 && session.shipTracksPlayer(ship);
}
