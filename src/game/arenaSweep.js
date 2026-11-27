// Arena range control: hiding is allowed, camping is not.
//
// Opponents in the Arena see and lose the pilot under exactly the career's
// rules (occlusion, range, the last-known search). What the Arena adds is a
// referee. Once no opponent has had the pilot resolved for SWEEP_GRACE
// seconds, range control sweeps the field and hands every hunter the pilot's
// position at that moment, then repeats every SWEEP_INTERVAL seconds while the
// pilot stays hidden. The sweep is a snapshot, never a live track: breaking
// away after the ping still makes the hunters search. The pilot hears the
// countdown first, so a hide is a breather or an ambush, not a stalemate.
//
// Callouts: while one opponent sees the pilot, every opponent that does not
// re-anchors on that sighting (a snapshot each second) instead of sweeping a
// stale spot or loitering at its entry.
import {t} from './i18n.js';

export const SWEEP_GRACE = 8;
export const SWEEP_WARNING = 3;
export const SWEEP_INTERVAL = 6;
const CALLOUT_INTERVAL = 1;
const CALLOUT_MOVE = 80;

const hunter = (ship) => ship.hull > 0 && ship.hostile && ship.targetId === 'player' && !ship.surrendered && !ship.captured;

// A position from range control or a teammate is fresh intel: the hunter may
// burn a long clear leg to it (the travel AI reads `search.urgent`).
const urgent = (session, ship, anchor) => {
    session.beginSearch(ship, anchor, 'hostile');
    ship.search.urgent = true;
};

export function updateArenaSweep(session, dt) {
    const arena = session.arena;
    if (!arena || arena.observer)
        return;
    const player = session.save.player;
    const state = arena.sweep ??= { hidden: 0, nextAt: SWEEP_GRACE, warned: false, calloutAt: 0 };
    let hunters = 0, spotter;
    for (const ship of session.ships) {
        if (!hunter(ship))
            continue;
        hunters++;
        // An entering contact that loses the pilot inside its briefing
        // window searches the briefed position at full burn.
        if (ship.search && !ship.search.urgent && ship.search.startedAt <= (ship.arenaEntryIntelUntil ?? -Infinity))
            ship.search.urgent = true;
        if (!spotter && session.shipTracksPlayer(ship))
            spotter = ship;
    }
    const now = session.save.world.time;
    if (player.hull <= 0 || player.dockedAt || !hunters || spotter) {
        state.hidden = 0;
        state.nextAt = SWEEP_GRACE;
        state.warned = false;
        if (spotter && now >= state.calloutAt) {
            state.calloutAt = now + CALLOUT_INTERVAL;
            const sighting = spotter.lastResolvedPlayer ?? player.position;
            for (const ship of session.ships) {
                if (ship === spotter || !hunter(ship) || session.shipTracksPlayer(ship))
                    continue;
                // Keep a search that already heads for this spot: re-anchoring
                // every second would reset its approach for nothing.
                const anchor = ship.search?.anchor;
                if (anchor && Math.hypot(anchor[0] - sighting[0], anchor[1] - sighting[1], anchor[2] - sighting[2]) < CALLOUT_MOVE)
                    continue;
                urgent(session, ship, sighting);
            }
        }
        return;
    }
    state.hidden += dt;
    if (!state.warned && state.hidden >= state.nextAt - SWEEP_WARNING) {
        state.warned = true;
        session.runRadio(t('Range control sweep in {seconds} seconds.', { seconds: SWEEP_WARNING }), t('SWEEP {seconds} S', { seconds: SWEEP_WARNING }));
    }
    if (state.hidden < state.nextAt)
        return;
    state.nextAt += SWEEP_INTERVAL;
    state.warned = false;
    for (const ship of session.ships) {
        if (!hunter(ship))
            continue;
        ship.lastResolvedPlayer = [...player.position];
        urgent(session, ship, ship.lastResolvedPlayer);
    }
    session.ui.pushEvent(t('Range sweep: your position is out.'), 'danger', 3200);
    session.audio?.play?.('scan');
}
