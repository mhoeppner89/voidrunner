// Sound events: how bank buffers are stacked into what the player hears.
//
// An event is a list of layers played together. Every trigger picks a fresh
// variant and pitch for each layer, so one event never sounds identical
// twice. Layer tuple: [bankId, gain, options]
//   vary   random pitch spread (0.04 = ±4 %)
//   rate   base playback rate
//   delay  seconds after the trigger
//   prox   minimum proximity (0..1) for the layer to play; own-ship events
//          have proximity 1, so `prox` also separates cockpit detail from
//          what a distant ship's shot sounds like
//   chance probability the layer plays at all
// Event fields:
//   bus      'cockpit' (own ship, short room), 'world' (outside, long tail) or
//            'ui' (non-diegetic: ignores concussion and distance)
//   room / space   reverb send levels
//   spacing  minimum seconds between triggers
//   duck     [musicGain, holdSeconds, releaseSeconds]: big moments push the score down
//   muffle   0..1 concussion: briefly closes the world low-pass
//   range    audible distance for spatial playback
//   priority 0..3, higher survives voice limiting
//   gain     overall trim
export const SOUND_EVENTS = {
    // ------------------------------------------------------------- weapons
    laser: { bus: 'cockpit', room: 0.2, space: 0.1, layers: [['laser', 0.8, { vary: 0.035 }], ['laser-snap', 0.26, { vary: 0.06, prox: 0.9 }], ['energy-tail', 0.36, { vary: 0.08 }], ['thump', 0.22, { vary: 0.05, prox: 0.9 }]] },
    beam: { bus: 'cockpit', room: 0.16, space: 0.08, layers: [['beam', 0.8, { vary: 0.03 }], ['beam-sizzle', 0.5, { vary: 0.05 }]] },
    gauss: { bus: 'cockpit', room: 0.22, space: 0.22, duck: [0.8, 0.05, 0.3], priority: 2, layers: [['gauss', 0.8, { vary: 0.03 }], ['rail-crack', 0.62, { vary: 0.04 }], ['thump', 0.5, { prox: 0.9 }], ['mech-clack', 0.3, { delay: 0.16, prox: 0.9, vary: 0.05 }]] },
    pdc: { bus: 'cockpit', room: 0.1, space: 0.05, spacing: 0.035, layers: [['pdc', 0.75, { vary: 0.05 }], ['pdc-tick', 0.34, { vary: 0.08 }]] },
    ripper: { bus: 'cockpit', room: 0.2, space: 0.14, priority: 2, layers: [['ripper', 0.8, { vary: 0.04 }], ['ripper-blast', 0.5, { vary: 0.05 }], ['thump', 0.36, { prox: 0.9 }], ['mech-clack', 0.26, { delay: 0.12, prox: 0.9, vary: 0.05 }]] },
    ion: { bus: 'cockpit', room: 0.18, space: 0.12, layers: [['ion', 0.8, { vary: 0.04 }], ['ion-sizzle', 0.5, { vary: 0.06 }], ['thump', 0.16, { prox: 0.9, rate: 1.2 }]] },
    mortar: { bus: 'cockpit', room: 0.2, space: 0.2, duck: [0.8, 0.05, 0.3], priority: 2, layers: [['mortar', 0.8, { vary: 0.04 }], ['plasma-whoosh', 0.6, { vary: 0.05 }], ['thump', 0.45, { prox: 0.9, rate: 0.85 }]] },
    missile: { bus: 'cockpit', room: 0.16, space: 0.22, priority: 2, layers: [['missile', 0.75, { vary: 0.04 }], ['missile-ignite', 0.62, { vary: 0.05 }], ['thump', 0.3, { prox: 0.9 }], ['mech-clack', 0.3, { prox: 0.9, rate: 0.8 }]] },
    capacitorEmpty: { bus: 'cockpit', room: 0.1, spacing: 2, priority: 2, layers: [['capacitor-empty', 1]] },

    // ------------------------------------------------------ taking damage
    shield: { bus: 'cockpit', room: 0.14, space: 0.1, spacing: 0.065, muffle: 0.12, priority: 2, layers: [['shield', 0.8, { vary: 0.05 }], ['shield-zap', 0.55, { vary: 0.08 }], ['thump', 0.2, { rate: 1.3 }]] },
    hit: { bus: 'cockpit', room: 0.2, spacing: 0.065, muffle: 0.5, duck: [0.72, 0.08, 0.45], priority: 3, layers: [['hit', 0.75, { vary: 0.05 }], ['hull-thud', 0.75, { vary: 0.06 }], ['metal-clang', 0.28, { vary: 0.1 }], ['rattle', 0.5, { delay: 0.03 }], ['spark', 0.35, { delay: 0.07, chance: 0.4 }]] },
    shieldBreak: { bus: 'cockpit', room: 0.18, space: 0.2, spacing: 2, muffle: 0.7, duck: [0.5, 0.25, 0.9], priority: 3, layers: [['shield-collapse', 1], ['spark', 0.4, { delay: 0.3 }], ['thump', 0.5, { rate: 0.7 }]] },
    shieldRestore: { bus: 'cockpit', room: 0.14, spacing: 3, priority: 1, layers: [['shield-restore', 0.8]] },
    targetShieldBreak: { bus: 'ui', spacing: 1.5, priority: 2, layers: [['target-shield-down', 1]] },
    hullAlarm: { bus: 'ui', room: 0.12, spacing: 1, priority: 3, layers: [['alarm-hull', 1]] },
    spark: { bus: 'cockpit', room: 0.12, spacing: 0.2, layers: [['spark', 1, { vary: 0.1 }]] },
    creak: { bus: 'cockpit', room: 0.2, spacing: 2.5, priority: 0, layers: [['creak', 1, { vary: 0.08 }]] },
    chatter: { bus: 'cockpit', room: 0.08, spacing: 2, priority: 0, layers: [['chatter', 1, { vary: 0.06 }]] },

    // --------------------------------------------------------------- world
    impact: { bus: 'world', space: 0.18, spacing: 0.035, range: 520, layers: [['impact', 0.8, { vary: 0.06 }], ['metal-clang', 0.42, { vary: 0.1 }], ['spark', 0.25, { chance: 0.5, prox: 0.3 }]] },
    rock: { bus: 'world', space: 0.2, spacing: 0.035, range: 520, layers: [['rock', 0.8, { vary: 0.06 }], ['rock-crumble', 0.6, { vary: 0.08 }]] },
    explosion: {
        bus: 'world', space: 0.42, range: 900, duck: [0.45, 0.25, 1.2], muffle: 0.55, priority: 3,
        layers: [['explosion', 1, { vary: 0.05 }], ['blast-crack', 0.62, { vary: 0.06, prox: 0.25 }], ['sub-boom', 0.85, { vary: 0.05, prox: 0.3 }], ['debris-tail', 0.5, { delay: 0.12, prox: 0.2 }], ['shockwave', 0.5, { delay: 0.25, prox: 0.6 }]],
    },
    capitalExplosion: {
        bus: 'world', space: 0.5, range: 1800, duck: [0.3, 0.6, 2.6], muffle: 0.8, priority: 3,
        layers: [['capitalExplosion', 1], ['blast-crack', 0.7, { rate: 0.8 }], ['sub-boom', 1, { rate: 0.8 }], ['capital-groan', 0.85, { delay: 0.4 }], ['debris-tail', 0.6, { delay: 0.3, rate: 0.85 }], ['shockwave', 0.8, { delay: 0.5, prox: 0.3 }]],
    },
    flyby: { bus: 'world', space: 0.2, spacing: 0.25, range: 260, priority: 1, layers: [['flyby', 1, { vary: 0.12 }]] },
    whizz: { bus: 'world', space: 0.06, spacing: 0.07, range: 60, priority: 1, layers: [['whizz', 1, { vary: 0.15 }]] },

    // ---------------------------------------------------------- ship systems
    afterburnerOn: { bus: 'cockpit', room: 0.1, space: 0.15, spacing: 0.4, priority: 2, layers: [['ab-ignite', 0.8, { vary: 0.04 }], ['thump', 0.3, { rate: 0.75 }]] },
    afterburnerOff: { bus: 'cockpit', room: 0.1, spacing: 0.4, layers: [['ab-off', 0.8, { vary: 0.05 }]] },
    scan: { bus: 'cockpit', room: 0.1, space: 0.2, layers: [['scan-ping', 0.9]] },
    dock: { bus: 'cockpit', room: 0.2, space: 0.15, priority: 2, layers: [['dock', 0.85], ['dock-clamp', 0.7]] },
    pickup: { bus: 'cockpit', room: 0.14, layers: [['pickup', 0.5, { vary: 0.05 }], ['pickup-chime', 0.8]] },
    salvage: { bus: 'cockpit', room: 0.16, spacing: 1.65, layers: [['salvage', 0.9], ['mech-clack', 0.3, { rate: 0.7 }]] },
    hyperSpool: { bus: 'cockpit', room: 0.1, space: 0.2, priority: 3, layers: [['hyperSpool', 0.75], ['hyper-charge', 0.8]] },
    hyperActive: { bus: 'cockpit', space: 0.3, spacing: 1.5, duck: [0.4, 0.5, 1.8], muffle: 0.4, priority: 3, layers: [['hyper-engage', 1], ['hyperActive', 0.45]] },
    hyperDrop: { bus: 'cockpit', space: 0.3, spacing: 0.4, duck: [0.55, 0.2, 1], muffle: 0.3, priority: 3, layers: [['hyperDrop', 0.75], ['hyper-exit', 0.9]] },
    slipstream: { bus: 'cockpit', room: 0.1, space: 0.2, layers: [['slipstream', 0.9, { vary: 0.06 }]] },

    // ----------------------------------------------------------- interface
    ui: { bus: 'ui', spacing: 0.035, layers: [['ui-click', 1, { vary: 0.03 }]] },
    uiHover: { bus: 'ui', spacing: 0.05, priority: 0, layers: [['ui-hover', 1, { vary: 0.05 }]] },
    uiTab: { bus: 'ui', spacing: 0.05, layers: [['ui-tab', 1]] },
    uiOpen: { bus: 'ui', spacing: 0.15, layers: [['ui-open', 1]] },
    uiClose: { bus: 'ui', spacing: 0.15, layers: [['ui-close', 1]] },
    confirm: { bus: 'ui', spacing: 0.12, layers: [['ui-confirm', 1]] },
    deny: { bus: 'ui', spacing: 0.25, layers: [['ui-deny', 1]] },
    purchase: { bus: 'ui', spacing: 0.2, layers: [['ui-purchase', 1]] },
    equip: { bus: 'ui', spacing: 0.2, layers: [['ui-equip', 1]] },
    weaponSwitch: { bus: 'ui', spacing: 0.08, layers: [['mech-clack', 0.5, { rate: 0.8, vary: 0.04 }], ['ui-tab', 0.8]] },
    targetCycle: { bus: 'ui', spacing: 0.05, layers: [['target-cycle', 1]] },
    targetLock: { bus: 'ui', spacing: 0.4, priority: 2, layers: [['target-lock', 1]] },
    lockWarning: { bus: 'ui', spacing: 1.2, priority: 3, layers: [['lock-warning', 1]] },
    missileAlert: { bus: 'ui', spacing: 0.3, priority: 3, layers: [['missile-alert', 1]] },
    alert: { bus: 'ui', spacing: 0.65, priority: 2, layers: [['alert', 1]] },
    // The generic caution keeps its name: dozens of gameplay systems raise it.
    warning: { bus: 'ui', spacing: 0.65, priority: 2, layers: [['alert', 1]] },
    threat: { bus: 'ui', spacing: 1.5, priority: 3, layers: [['alert', 0.9], ['lock-warning', 0.25, { rate: 0.5 }]] },
    success: { bus: 'ui', spacing: 0.2, priority: 2, layers: [['ui-confirm', 1]] },
    reward: { bus: 'ui', spacing: 0.6, priority: 2, layers: [['success-sting', 1]] },
    discovery: { bus: 'ui', spacing: 0.6, priority: 2, layers: [['scan-ping', 0.6, { rate: 1.12 }], ['ui-confirm', 0.8, { delay: 0.12 }]] },
    kill: { bus: 'ui', spacing: 0.3, priority: 2, layers: [['kill-confirm', 1]] },
    countdown: { bus: 'ui', spacing: 0.2, priority: 2, layers: [['countdown', 1]] },
    raceGo: { bus: 'ui', spacing: 0.5, priority: 2, layers: [['race-go', 1]] },
    commsOpen: { bus: 'ui', spacing: 0.12, layers: [['comms-open', 1, { vary: 0.04 }]] },
    commsClose: { bus: 'ui', spacing: 0.12, layers: [['comms-close', 1]] },

    // ------------------------------------------- ambience detail (scattered)
    clank: { bus: 'world', space: 0.2, priority: 0, layers: [['clank', 1, { vary: 0.12 }]] },
    pneumatic: { bus: 'world', space: 0.15, priority: 0, layers: [['pneumatic', 1, { vary: 0.1 }]] },
    paChirp: { bus: 'world', space: 0.2, priority: 0, layers: [['pa-chirp', 1]] },
    rockKnock: { bus: 'world', space: 0.3, priority: 0, layers: [['rock-knock', 1, { vary: 0.15 }]] },
    metalGroan: { bus: 'world', space: 0.3, priority: 0, layers: [['metal-groan', 1, { vary: 0.1 }]] },
    voidWhisper: { bus: 'world', space: 0.35, priority: 0, layers: [['void-whisper', 1, { vary: 0.06 }]] },
};
// Longest plausible tail per event is derived from its buffers at play time;
// events not listed above fall back to the generic hull impact.
export const FALLBACK_EVENT = 'impact';
