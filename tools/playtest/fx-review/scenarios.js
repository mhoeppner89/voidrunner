// Named combat-effect moments shared by the FX review's live loop
// (?scenario=name) and the screenshot capture (capture.mjs).
//   query   — review URL parameters (camera distance, target surface, explosion kind)
//   actions — what happens, against the window.__FX_REVIEW__ hook `fx`
//   at      — seconds after the actions at which capture.mjs takes its frame
//   period  — seconds between repeats in the live loop
export const SCENARIOS = {
    'pulse-impact': { label: 'Pulse hits, bare hull', query: 'distance=45', actions: 'fx.fire(1);fx.fire(1);fx.fire(0)', at: .29, period: 1.6 },
    'shield-impact': { label: 'Pulse hits, shield', query: 'distance=45&surface=shield', actions: 'fx.fire(1);fx.fire(0)', at: .27, period: 1.6 },
    'magrail-impact': { label: 'Magrail slug', query: 'distance=45', actions: 'fx.fire(3)', at: .13, period: 1.8 },
    'ion-impact': { label: 'Ion strike', query: 'distance=45', actions: 'fx.fire(6)', at: .3, period: 1.8 },
    'mortar-impact': { label: 'Plasma mortar', query: 'distance=45', actions: 'fx.fire(7)', at: .5, period: 2.4 },
    'missile-impact': { label: 'Missile', query: 'distance=50', actions: 'fx.fire(8)', at: .95, period: 3.2 },
    'pdc-ripper': { label: 'PDC burst and scatter', query: 'distance=55', actions: 'fx.fire(4);fx.fire(5)', at: .27, period: 1.6 },
    'pulse-flight': { label: 'Pulse bolts in flight', query: 'distance=70', actions: 'fx.fire(0);fx.fire(1);fx.fire(2)', at: .16, period: 1.2 },
    'magrail': { label: 'Magrail in flight', query: 'distance=60', actions: 'fx.fire(3)', at: .07, period: 1.4 },
    'mortar-flight': { label: 'Mortar orb in flight', query: 'distance=70', actions: 'fx.fire(7)', at: .3, period: 2.4 },
    'explosion-fireball': { label: 'Explosion: fireball', query: 'distance=60&variant=fireball', actions: 'fx.blowUp(0)', at: .8, period: 3.4 },
    'explosion-chain': { label: 'Explosion: chain reaction', query: 'distance=60&variant=chain', actions: 'fx.blowUp(0)', at: .7, period: 3.8 },
    'explosion-breach': { label: 'Explosion: core breach', query: 'distance=60&variant=breach', actions: 'fx.blowUp(0)', at: .3, period: 3.4 },
    'explosion-breakup': { label: 'Explosion: break-up', query: 'distance=60&variant=breakup', actions: 'fx.blowUp(0)', at: .6, period: 3.6 },
    'explosion-frigate': { label: 'Explosion: frigate', query: 'distance=200&variant=chain', actions: 'fx.blowUp(3)', at: 1.4, period: 7 },
};
