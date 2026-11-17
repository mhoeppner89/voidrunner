import SPACE from './musicSpace.js';
import FLIGHT from './musicFlight.js';
import DOCKED from './musicDocked.js';

// The score catalogue: every piece, which ones are cleared for live play,
// how the rotating contexts pace themselves and which theme each dock gets.
export const MUSIC_CONTEXTS = Object.freeze(['open', 'planet', 'field', 'graveyard', 'stealth', 'combat', 'station']);
export const MUSIC_PIECES = Object.freeze([...SPACE, ...FLIGHT, ...DOCKED]);
export const PIECE_BY_ID = Object.freeze(Object.fromEntries(MUSIC_PIECES.map((piece) => [piece.id, piece])));
export const PIECES_BY_CONTEXT = Object.freeze(Object.fromEntries(MUSIC_CONTEXTS.map((context) => [context, MUSIC_PIECES.filter((piece) => piece.context === context)])));

// Rotating contexts: a piece plays for `minutes`, closes with its cadence,
// then the music rests (`rest`, seconds) before another piece begins.
// Contexts not listed (docked, stealth, combat) hold their piece.
export const ROTATION = Object.freeze({
    open: { minutes: [3, 5.5], rest: [30, 90] },
    planet: { minutes: [2.5, 4.5], rest: [20, 45] },
    field: { minutes: [2.5, 4.5], rest: [20, 45] },
    graveyard: { minutes: [2.5, 4.5], rest: [20, 45] },
});

// Pieces approved for the game. Everything else plays only on the music
// review page (tools/playtest/sound-review/music.html) until approved.
export const APPROVED_PIECES = new Set([
    'open-drift', 'open-long-wave', 'open-tidal-lock', 'open-helios-horizon', 'open-helios-haulers',
    'open-meridian-lattice', 'open-meridian-concourse', 'open-redwake-ember', 'open-redwake-smuggler',
    'open-pale-rime', 'open-pale-survey', 'open-acheron-horizon', 'open-acheron-vigil',
    'planet-wind', 'planet-trade-winds', 'planet-high-altitude', 'planet-frostline',
    'field-steel', 'field-foundry', 'field-red-shoals', 'field-icefall',
    'graveyard-lament', 'graveyard-requiem', 'graveyard-debris-hymn',
    'stealth-heart', 'stealth-held-breath', 'stealth-shadow-line',
    'combat-drums', 'combat-breakneck', 'combat-broadside', 'combat-cutthroat',
    'combat-drum-line', 'combat-low-orbit', 'combat-iron-gamelan', 'combat-burn-pattern',
    'dock-lounge', 'dock-bastion', 'dock-harbour', 'dock-shipworks', 'dock-cinderfall', 'dock-pitlane', 'dock-blackglass',
    'dock-cinder', 'dock-nacre', 'dock-vesper', 'dock-azure', 'dock-meridian', 'dock-boreal',
]);
export const isApproved = (piece) => APPROVED_PIECES.has(piece.id);

// Docked themes by location; unknown or unapproved docks get the lounge.
export const DOCK_FALLBACK = 'dock-lounge';
export const DOCK_THEMES = Object.freeze(Object.fromEntries(PIECES_BY_CONTEXT.station.flatMap((piece) => (piece.locations ?? []).map((id) => [id, piece.id]))));
export function dockThemeFor(dockId) {
    const piece = PIECE_BY_ID[DOCK_THEMES[dockId]];
    return piece && isApproved(piece) ? piece : PIECE_BY_ID[DOCK_FALLBACK];
}

// Selection weight: the nearest region wins, then the star system, then the
// piece's general weight (default 1). Signature pieces use weight 0 so they
// stay at home.
export function pieceWeight(piece, systemId, regionId) {
    if (piece.regions && regionId && regionId in piece.regions) return piece.regions[regionId];
    if (piece.systems && systemId && systemId in piece.systems) return piece.systems[systemId];
    return piece.weight ?? 1;
}
