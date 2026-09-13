// Hostility alone is not permission for automatic weapons to start a fight.
export const combatTargetEligible = ship => Boolean(ship && ship.hull > 0 && !ship.race
    && !ship.surrendered && !ship.captured && !ship.poweredDown && !ship.standingDown
    && !ship.holdFire && !ship.pendingMug && !ship.pendingMugLeaderId);
