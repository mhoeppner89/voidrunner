export const BOT_DIFFICULTIES = Object.freeze(['novice', 'veteran', 'ace']);
export const BOT_DIFFICULTY_LABELS = Object.freeze({ novice: 'Novice', veteran: 'Veteran', ace: 'Ace' });

export const BOT_CHARACTERS = Object.freeze({
    brick: {
        name: 'Brick', style: 'Close-range brawler',
        starterShipId: 'wayfarer', starterGear: { guns: 'ripper', utility: 'recovery-shield' },
        hulls: ['legionary', 'vanguard'], equipment: ['shield-mk2', 'armor-mk2', 'ripper', 'shield-seeker-launcher'],
        range: 165, strafe: .20, aggression: 1,
    },
    latch: {
        name: 'Latch', style: 'Steady gunfighter',
        starterShipId: 'scrapper', starterGear: { guns: null, utility: 'capacitor-bank' },
        hulls: ['torsas', 'blade'], equipment: ['sustained-reactor', 'ion-blaster', 'shield-mk2', 'tracking-turret'],
        range: 240, strafe: .38, aggression: .88,
    },
    wisp: {
        name: 'Wisp', style: 'Flanking interceptor',
        starterShipId: 'speedster', starterGear: { guns: null, utility: 'thrusters-mk2' },
        hulls: ['talon', 'lancer'], equipment: ['engine-mk2', 'gauss-cannon', 'thrusters-mk2', 'capacitor-bank'],
        range: 320, strafe: .64, aggression: .94,
    },
});
