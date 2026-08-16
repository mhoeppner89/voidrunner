// Pilot personalities: every NPC ship rolls a pilot once at spawn (seeded, so
// headless probes stay deterministic) and the profile lives as transient
// per-ship fields — exactly like the existing passRange. No new behavior
// states: each pilot is a bundle of multipliers applied where the AI constants
// live today (pass range, jink/spiral rolls, cover thresholds, flee threshold,
// fire gate/range/cooldown, deflection lead).
//
// A pilot is `{ tier, temperament, aim, reflex, evasion, ...temperament }` —
// tier stats (0..1, higher is better) plus flattened temperament multipliers.
// `rollPilot` merges them so call sites read one flat object.

export const TIER_LABELS = {
    novice: 'Novice',
    veteran: 'Veteran',
    ace: 'Ace',
};
export const TEMPERAMENT_LABELS = {
    timid: 'Timid',
    steady: 'Steady',
    aggressive: 'Aggressive',
    flamboyant: 'Flamboyant',
};
// Ability tier stats: aim (shot accuracy + deflection prediction + fire
// discipline), reflex (reaction latency + evasion cooldowns), evasion (jink /
// spiral strength and commitment).
export const TIERS = {
    novice: { aim: 0.42, reflex: 0.5, evasion: 0.55 },
    veteran: { aim: 0.72, reflex: 0.78, evasion: 0.82 },
    ace: { aim: 0.97, reflex: 0.95, evasion: 0.98 },
};
// Temperaments: multipliers around 1.0 (steady is the middle = current default).
// flamboyance is an additive flag (0/1) for showboating, read directly, not
// through pilotMod.
export const TEMPERAMENTS = {
    timid: {
        passRangeMul: 1.35, // keeps distance on the joust
        resetRangeMul: 1.15,
        fireRangeMul: 0.75, // only commits shots at short range
        coverShieldMul: 1.18, // ducks for cover while shields still healthy
        damageThresholdMul: 1.3, // flinches / seeks cover at higher hull damage
        coverHoldMul: 1.35, // hides out longer to recharge
        fleeMul: 2.3, // cuts and runs at ~half hull (0.22 * 2.3 ≈ 0.51)
        spiralMul: 0.65, // relies on cover instead of corkscrews
        jinkMul: 0.8,
        afterburnMul: 1.0,
        flamboyance: 0,
    },
    steady: {
        passRangeMul: 1.0,
        resetRangeMul: 1.0,
        fireRangeMul: 1.0,
        coverShieldMul: 1.0,
        damageThresholdMul: 1.0,
        coverHoldMul: 1.0,
        fleeMul: 1.0, // 0.22
        spiralMul: 1.0, // 0.45 gate
        jinkMul: 1.0,
        afterburnMul: 1.0,
        flamboyance: 0,
    },
    aggressive: {
        passRangeMul: 0.7, // presses into close range
        resetRangeMul: 0.85, // turns back sooner
        fireRangeMul: 1.3, // fires from further out
        coverShieldMul: 0.55, // rarely ducks for cover
        damageThresholdMul: 0.8,
        coverHoldMul: 0.6,
        fleeMul: 0.36, // fights to the last (~0.08)
        spiralMul: 0.9,
        jinkMul: 0.9,
        afterburnMul: 1.3, // > 1.2: burns afterburn in pursuit
        flamboyance: 0,
    },
    flamboyant: {
        passRangeMul: 0.85, // tighter standoff passes
        resetRangeMul: 0.95,
        fireRangeMul: 1.05,
        coverShieldMul: 0.9,
        damageThresholdMul: 1.0,
        coverHoldMul: 1.0,
        fleeMul: 0.9,
        spiralMul: 1.85, // showboats: corkscrews far more often (0.45 * 1.85 ≈ 0.83)
        jinkMul: 1.4, // extra jinks
        afterburnMul: 1.15,
        flamboyance: 1,
    },
};
// Tier weighting by threat (0..1: quiet lanes ≈ 0.2, ace warrant ≈ 1.0).
// Rows are picked by nearest threat; the row's three numbers are novice /
// veteran / ace weights.
export const TIER_WEIGHTS = [
    { threat: 0.2, weights: [0.5, 0.38, 0.12] },
    { threat: 0.55, weights: [0.32, 0.46, 0.22] },
    { threat: 1, weights: [0.14, 0.46, 0.4] },
];
// Temperament weights per faction: concord patrols lean steady, red-talons lean
// aggressive, salvagers/civilians lean timid.
export const TEMPERAMENT_WEIGHTS = {
    'free-merchants': { timid: 0.35, steady: 0.3, aggressive: 0.15, flamboyant: 0.2 },
    'frontier-miners': { timid: 0.25, steady: 0.45, aggressive: 0.15, flamboyant: 0.15 },
    concord: { timid: 0.12, steady: 0.58, aggressive: 0.12, flamboyant: 0.18 },
    'red-talons': { timid: 0.08, steady: 0.22, aggressive: 0.52, flamboyant: 0.18 },
};
const TIER_IDS = ['novice', 'veteran', 'ace'];
const TEMPERAMENT_IDS = ['timid', 'steady', 'aggressive', 'flamboyant'];
const weightedPick = (rng, weights) => {
    let roll = rng();
    for (const id of Object.keys(weights)) {
        roll -= weights[id];
        if (roll < 0)
            return id;
    }
    return Object.keys(weights)[Object.keys(weights).length - 1];
};
const tierWeights = (threat) => {
    let best = TIER_WEIGHTS[0];
    for (const row of TIER_WEIGHTS) {
        if (Math.abs(row.threat - threat) < Math.abs(best.threat - threat))
            best = row;
    }
    return best.weights;
};
// Roll a pilot from the seeded spawn RNG. `override` pins the profile:
// - { tier, temperament? } picks specific tables (arena difficulty, warrants)
// - a full flattened profile (has aim) is used verbatim (pinned bounty aces)
export const rollPilot = (rng, threat, faction, override) => {
    if (override) {
        if (override.aim !== undefined)
            return override;
        const tier = override.tier ?? 'veteran';
        const temperament = override.temperament ?? weightedPick(rng, TEMPERAMENT_WEIGHTS[faction] ?? TEMPERAMENT_WEIGHTS['free-merchants']);
        return { tier, temperament, ...TIERS[tier], ...TEMPERAMENTS[temperament] };
    }
    const tier = TIER_IDS[weightedPickIndex(rng, tierWeights(threat))];
    const temperament = weightedPick(rng, TEMPERAMENT_WEIGHTS[faction] ?? TEMPERAMENT_WEIGHTS['free-merchants']);
    return { tier, temperament, ...TIERS[tier], ...TEMPERAMENTS[temperament] };
};
const weightedPickIndex = (rng, weights) => {
    let roll = rng();
    for (let index = 0; index < weights.length; index += 1) {
        roll -= weights[index];
        if (roll < 0)
            return index;
    }
    return weights.length - 1;
};
// Apply a pilot multiplier to a base constant. Ships without a pilot (legacy
// paths) behave exactly like the pre-pilot game.
export const pilotMod = (ship, base, stat) => base * (ship.pilot?.[stat] ?? 1);
// Combat comms: temperament-driven lines while engaged with the player. Steady
// pilots stay silent professionals; the showy and the desperate talk. Lines
// are situation-aware — the picker in game.js chooses a pool by fight state:
// first contact, the player falling apart (gloat), the pilot's own hull
// (pressed), running (distress), the player's bounty rank when it's high
// (rank), or valuable sealed cargo in the player's hold (case/cargo) — and
// every pool carries several lines so the chatter rotates. Rank lines carry
// a {rank} placeholder the picker fills with the player's actual guild title.
// The proximity pools are separate: a one-off muttered reaction when the
// player closes to short range, rolled on its own seeded stream. A
// surrendered pilot skips the mutter and instead pleads once (plead pool)
// when the player closes in. Picks use the ship's seeded aiRng, so the
// chatter is deterministic like every other pilot roll.
export const PILOT_LINES = {
    timid: {
        // A nervous pilot only speaks up when things go wrong; the first line
        // of an engagement is a plea, not a threat.
        contact: [
            'Please — I don\'t want any trouble.',
            'Stay back. I\'m warning you.',
            'I\'m just passing through — leave me be!',
            'Can\'t we talk about this?',
        ],
        proximity: [
            'Stay back — that\'s close enough!',
            'You\'re getting too close. Please keep your distance.',
            'What do you want? Just... keep flying, okay?',
        ],
        rank: [
            'Heard you\'re a {rank}. Please — I surrender!',
            'A {rank} hunting little old me? I\'m not worth it!',
            'You\'re a {rank}? I\'ll pay you anything — just go!',
        ],
        case: [
            'The diplomatic case is yours — take it, please!',
            'That case isn\'t worth my life!',
            'It\'s just a sealed case — take it and go!',
        ],
        cargo: [
            'Take the cargo — just let me go!',
            'The sealed goods are yours, all of it!',
            'I\'ll drop the hold — don\'t shoot!',
        ],
        pressed: [
            'I\'m begging you — break off!',
            'This isn\'t worth dying for!',
            'Take the ship — just let me go!',
        ],
        surrender: {
            // Every line pleads for life and names the action being taken, so
            // the comms bar tells the player exactly what the ship is doing.
            flee: ['Please, I\'m running — don\'t follow me!', 'Let me go — I\'m fleeing right now, I swear!'],
            eject: ['I\'m dumping the hold — take it, just let me go!', 'The cargo\'s yours, I\'m ejecting it — please don\'t shoot!'],
            pay: ['Take my credits — I\'m paying you, just spare me!', 'Here, all my credits — please don\'t come after me!'],
            down: ['I\'m powering down — please don\'t shoot!', 'I surrender, everything\'s going dark — let me live!'],
            downEject: ['I\'m dumping everything and powering down — please!', 'The cargo\'s yours and I\'m going dark — spare me!'],
            downPay: ['My credits and my ship, I\'m powered down — just let me live!', 'Here\'s everything I have, I\'m shutting down — please!'],
        },
        // One last plea when the player closes in on a surrendered ship (see
        // maybeProximityLine) — then the pilot falls silent.
        plead: [
            'Please — I\'m down, don\'t shoot!',
            'I\'ve stopped fighting, I swear — just let me go!',
            'The fight\'s over — please spare me!',
        ],
        // A pilot the player beat before recognizes them on a later encounter
        // and defers instead of re-engaging (see maybeRecognitionLine).
        deference: [
            'You let me go once. I won\'t test that luck again.',
            'I remember you. Please — I\'m not here to fight.',
            'You spared me. I\'ll just be on my way, quietly.',
        ],
        // A pilot who escaped after surrendering comes back wary: they remember
        // the player and talk about it, but they're hostile and cut and run
        // earlier than their temperament usually would.
        wary: [
            'I got away from you once. I know your tricks now.',
            'You caught me off guard before. Not twice.',
            'Stay back — I remember what you did!',
        ],
        distress: [
            'Mayday — I\'m hit, I\'m hit!',
            'They\'re all over me — somebody break this off!',
            'This is too hot — I\'m pulling out!',
            'Cover fire, cover fire — I\'m running!',
            'Not worth the scrap — disengaging!',
            'I can\'t shake them — anyone, please!',
        ],
    },
    aggressive: {
        contact: [
            'Fresh meat on my scanners.',
            'This is my space. My rules.',
            'Don\'t bother running — it just makes this fun.',
            'Your flight recorder is going to make great viewing.',
        ],
        proximity: [
            'You\'re in my space.',
            'Close enough. I like my targets near.',
            'That\'s close. Keep coming.',
        ],
        rank: [
            'Heard they call you {rank}. I\'ll add you to my collection.',
            'A {rank} — the registry pays double for you, alive or dead.',
            'Think your {rank} title scares me? Watch.',
        ],
        case: [
            'That diplomatic case is coming off your hull.',
            'Hand over the case and I might let you keep the ship.',
            'Everyone in the sector wants that case. I\'m just the one who\'ll take it.',
        ],
        cargo: [
            'That sealed cargo is mine after I\'m done with you.',
            'I can smell the profit in your hold from here.',
            'Your haul is my retirement fund.',
        ],
        threat: [
            'You\'re mine. All of you.',
            'No quarter. No mercy.',
            'Your bounty is going up by the second.',
            'Burn for me.',
            'I\'ve scraped better pilots off my hull.',
            'Every breath you take is borrowed now.',
        ],
        gloat: [
            'I can smell the panic from here.',
            'That\'s it. Keep flailing.',
            'Your ship is a payment plan for my next upgrade.',
        ],
        surrender: {
            // Even the proud plead when the fight ends — grudgingly, and
            // naming the action so the player reads what's happening.
            flee: ['I\'m running — don\'t waste the fuel chasing me!', 'You win this round. I\'m out!'],
            eject: ['I\'m jettisoning the hold — take it and leave me be!', 'The cargo\'s yours, I\'m dumping it — don\'t push your luck!'],
            pay: ['Take the credits — I\'m paying you off, fight\'s over!', 'Here\'s my payment. This is where I walk!'],
            down: ['Fine — I\'m powering down. Don\'t make this a grave.', 'The ship\'s yours, I\'m going dark — just spare me!'],
            downEject: ['Dumping the hold and powering down. Satisfied?', 'Take the cargo, take the ship — I\'m going dark, leave me be!'],
            downPay: ['My credits, my ship, powered down — now walk away.', 'Here\'s my tribute — I\'m shutting down, don\'t finish me!'],
        },
        plead: [
            'I\'m done fighting — don\'t pull that trigger.',
            'The ship\'s yours. Mercy is all I\'m asking.',
            'You won. That\'s enough — let me live.',
        ],
        deference: [
            'You beat me once. I\'m not giving you a second notch.',
            'We both know how this ends. I\'m leaving.',
            'I remember you. Best for both of us if I go.',
        ],
        wary: [
            'Last time you got lucky. Luck runs out.',
            'You think I\'d let you close twice?',
            'I learned from you. Now deal with it.',
        ],
        pressed: [
            'You\'ll have to kill me to take this kill.',
            'I\'ve lost better ships than yours in worse fights.',
            'Keep pushing. See what happens.',
            'This is just the part where I get angry.',
        ],
    },
    flamboyant: {
        contact: [
            'Oh, a new playmate. Wonderful.',
            'Do you have any idea who you\'re facing?',
            'En garde, sweetheart.',
            'Let\'s make this one for the archives.',
        ],
        proximity: [
            'Oh, a visitor. How wonderful.',
            'Come closer — I don\'t bite. Much.',
            'We should do this more often, you and I.',
        ],
        rank: [
            'A {rank}? Oh, this is going to look wonderful on me.',
            'The famous {rank}. Your reputation precedes you — sadly, so do I.',
            'They said {rank}s fly pretty. Let\'s see.',
        ],
        case: [
            'That little case has half the sector chasing it. How delicious.',
            'The diplomatic case — a trophy worth the trouble.',
            'I\'ll take the case and leave you a story to tell.',
        ],
        cargo: [
            'I do love a target with a full hold.',
            'That cargo of yours? Consider it a gift to me.',
            'You haul, I take. It\'s the natural order.',
        ],
        taunt: [
            'Hold still — I want to look at you.',
            'You fly almost as pretty as you die.',
            'Did you catch that? Of course you didn\'t.',
            'This is art. You\'re just the canvas.',
            'Try to keep up, darling.',
            'I do love a warm target.',
            'Watch closely — I only do this once.',
        ],
        gloat: [
            'You\'re falling apart beautifully.',
            'I could do this all day. You can\'t.',
            'Is that your best? It\'s adorable.',
            'Almost over. Don\'t worry.',
        ],
        surrender: {
            // Dramatic, but still pleading — and always naming the action.
            flee: ['Au revoir, darling — I\'m fleeing with my dignity intact!', 'You\'ve won this round — I\'m running, don\'t follow!'],
            eject: ['I\'m tossing you the hold — a parting gift, do spare me!', 'The cargo\'s yours, I\'m dumping it — let me slip away, darling!'],
            pay: ['My credits are yours — a little ransom for my charm!', 'Take my payment — and please remember my generosity!'],
            down: ['I\'m powering down — do let me live to shine another day!', 'Dark and quiet, darling — spare the paint, and me!'],
            downEject: ['Everything\'s yours — cargo, glory, my life, if you please!', 'I\'m shedding my hold and going dark — do be kind!'],
            downPay: ['My credits and my ship, powered down — surely that\'s enough!', 'Here\'s my tribute — I\'m shutting down, spare your humble admirer!'],
        },
        plead: [
            'Oh, you wouldn\'t finish a surrendered ship... would you?',
            'I\'ve had my moment — do be a dear and let me live.',
            'You wouldn\'t deny me an encore, surely?',
        ],
        deference: [
            'Darling, I still owe you one. Best not to collect.',
            'You won our last dance. I\'ll sit this one out.',
            'The famous victor returns. I\'ll bow out gracefully.',
        ],
        wary: [
            'You think I\'d give you a second shot at me? Hardly.',
            'I slipped away once, darling. Watch me do it again.',
        ],
        pressed: [
            'You got lucky. Very lucky.',
            'I\'ve flown through worse than you, darling.',
            'This is getting interesting. I like it.',
        ],
    },        // Steady pilots stay silent professionals in a fight — no contact,
        // threat, or taunt pools above — but a pilot they surrendered to once is
        // worth breaking the silence for: recognition is the one line they speak.
    steady: {
        deference: [
            'You spared me. I owe you a clean passage.',
            'I remember what you did. I won\'t raise a hand.',
            'We\'ve done this before. I\'m taking the long way.',
        ],
        wary: [
            'You caught me once. I won\'t let it happen again.',
            'I escaped you once. I\'ll do it again.',
        ],
    },
    // Ace banter: the tier earns the right to talk even when the temperament
    // normally stays quiet (a steady ace is a professional, but a clean shot
    // deserves a word).
    ace: {
        taunt: [
            'I read your vector before you chose it.',
            'Clean shot. You never even saw it.',
            'You should have run while you could.',
            'That was me holding back.',
            'Your hull just bought me a drink.',
        ],
        gloat: [
            'You were dead the moment you crossed me.',
            'I\'ve counted your shots. You have two left.',
            'Every vector you fly is one I\'ve already flown.',
        ],
    },
};
