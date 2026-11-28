export const DEPLOYMENT_SECONDS = 2;
export const ARRIVAL_DROP_SECONDS = .45;
const SHIP_ARRIVAL_WINDOW = .8;

// Warming meshes or loading terrain can put the first draw after the arrival.
// Consume the cue once and leave stale traffic in ordinary flight.
export function takeShipJumpArrival(ship, now) {
    const at = ship.jumpArrivalAt;
    if (at === undefined || at > now) return false;
    ship.jumpArrivalAt = undefined;
    return now - at <= SHIP_ARRIVAL_WINDOW && ship.hull > 0 && !ship.jumpPursuit
        && !ship.launchOwner && !ship.carrierLaunch && !ship.stationDock && !ship.race
        && !ship.tutorialCompanion && !ship.tutorialPatrol;
}
