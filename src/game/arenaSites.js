// Arena sites: real places from the career map, each staged for a fight.
//
// A site names where the pilot starts and where opponents come from. The
// geometry is the career's own (Shardbelt tunnels, the Mourning Line wrecks,
// the regional belts and rings), so the Arena teaches the same terrain the
// career flies through. The staging itself lives in arenaStaging.js; this
// module stays data-only so the run rules and the menus can read it headless.
//
// `stage` picks the staging recipe:
//   open      open space, opponents ahead; reinforcements swing in on a flank
//   horizon   open space facing the Acheron black hole: they come out of the disk
//   rim       the Shardbelt edge entry, looking into the rock
//   tunnel    inside a Shardbelt passage: head-on down the bore, late arrivals behind
//   mouth     off a tunnel mouth facing the rock: they come around its shoulders
//   pocket    a clear pocket inside a field, opponents hidden among the pieces
//   bay       at the open end of the carrier wreck's hangar: they come down the deck
//   wreck     beside the wrecked battleship: they come over and under the hull
//   lane      at one end of a cleared freight lane: a joust between the rock walls
//   shell     inside a belt's rock shell, opponents behind the large rocks
//   sheet     above a thin ice ring: they rise through the ice
export const ARENA_SITES = Object.freeze({
    'verge-lanes': Object.freeze({ name: 'Verge lanes', place: 'Helios Verge', systemId: 'helios-verge', environment: 'open', stage: 'open',
        tip: 'Open space. Nothing to hide behind; late arrivals swing in on a flank.' }),
    'acheron-horizon': Object.freeze({ name: 'Event horizon', place: 'Acheron', systemId: 'acheron', environment: 'open', stage: 'horizon',
        tip: 'Open space facing the black hole. They come out of the glare.' }),
    'shardbelt-rim': Object.freeze({ name: 'Shardbelt rim', place: 'Helios Verge', systemId: 'helios-verge', environment: 'asteroid-field', instanceId: 'shardbelt', stage: 'rim',
        tip: 'The edge of the rock. Open space behind you, cover ahead.' }),
    'shardbelt-heart': Object.freeze({ name: 'Heart tunnel', place: 'Shardbelt', systemId: 'helios-verge', environment: 'asteroid-field', instanceId: 'shardbelt', stage: 'tunnel', passage: 'heart',
        tip: 'Inside the main bore. They come head-on down the tunnel; late arrivals from behind.' }),
    'shardbelt-chimney': Object.freeze({ name: 'Broken chimney', place: 'Shardbelt', systemId: 'helios-verge', environment: 'asteroid-field', instanceId: 'shardbelt', stage: 'mouth', passage: 'chimney',
        tip: 'Off the chimney mouth, facing the rock. They come around its shoulders; the shaft is your way out.' }),
    'mourning-center': Object.freeze({ name: 'Grave pocket', place: 'Mourning Line', systemId: 'helios-verge', environment: 'debris-field', instanceId: 'mourning-line', stage: 'pocket',
        tip: 'A clear pocket among the dead. Contacts appear from behind the wreckage.' }),
    'mourning-carrier': Object.freeze({ name: 'Carrier hangar', place: 'Mourning Line', systemId: 'helios-verge', environment: 'debris-field', instanceId: 'mourning-line', stage: 'bay',
        tip: 'The open hangar deck of a dead carrier. They come straight down it.' }),
    'mourning-battleship': Object.freeze({ name: 'Battleship wreck', place: 'Mourning Line', systemId: 'helios-verge', environment: 'debris-field', instanceId: 'mourning-line', stage: 'wreck',
        tip: 'Beside a broken battleship. They come over and under the hull.' }),
    'foundry-lanes': Object.freeze({ name: 'Foundry Lanes', place: 'Meridian', systemId: 'meridian', environment: 'asteroid-field', instanceId: 'foundry-lanes', stage: 'lane',
        tip: 'A cleared freight lane between rock walls. A joust down the lane.' }),
    'redwake-belt': Object.freeze({ name: 'Redwake Belt', place: 'Redwake', systemId: 'redwake', environment: 'asteroid-field', instanceId: 'redwake-belt', stage: 'shell',
        tip: 'Pirate rock. Contacts use the big rocks for cover.' }),
    'pale-rings': Object.freeze({ name: 'Pale Rings', place: 'Pale Ring', systemId: 'pale-ring', environment: 'asteroid-field', instanceId: 'pale-rings', stage: 'sheet',
        tip: 'Above a thin ice ring. They rise through the ice below you.' }),
});
export const ARENA_SITE_IDS = Object.freeze(Object.keys(ARENA_SITES));
// Old saves and non-run sorties name an environment, not a site.
export const SITE_FOR_ENVIRONMENT = Object.freeze({ open: 'verge-lanes', 'asteroid-field': 'shardbelt-rim', 'debris-field': 'mourning-center' });
export const arenaSite = (id) => ARENA_SITES[id] ?? ARENA_SITES['verge-lanes'];
