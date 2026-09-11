// Hull roles govern engagement geometry and weapons; pilot skill governs execution.
// Shared immutable profiles keep the 60 Hz combat loop allocation-free.
const PROFILES = {
    interceptor: Object.freeze({ role: 'interceptor', range: 220, projectileSpeed: 185, life: 1.8, interval: 0.24, damage: 6.5, pass: 34, reset: 145, extend: 2.8, standoff: 12 }),
    fighter: Object.freeze({ role: 'fighter', range: 250, projectileSpeed: 195, life: 1.9, interval: 0.32, damage: 8, pass: 52, reset: 235, extend: 4.2, standoff: 23 }),
    gunship: Object.freeze({ role: 'gunship', range: 380, projectileSpeed: 250, life: 2, interval: 0.85, damage: 22, pass: 170, reset: 300, extend: 8, standoff: 10 }),
};
export function combatProfile(ship) {
    if (ship.tutorialEnemy || ship.tutorialCompanion || ship.capitalClass) return undefined;
    if (ship.combatFit) return ship.combatFit.profile;
    const variant = ship.variant;
    if (variant === 'lancer' || (!variant && ship.role === 'bounty')) return PROFILES.gunship;
    if (variant === 'kestrel' || (!variant && ship.role === 'escort')) return PROFILES.interceptor;
    if (variant === 'talon' || variant === 'warden' || (!variant && (ship.role === 'pirate' || ship.role === 'patrol'))) return PROFILES.fighter;
    return undefined;
}
export function interceptTime(rx, ry, rz, vx, vy, vz, speed) {
    const a = vx*vx + vy*vy + vz*vz - speed*speed;
    const b = rx*vx + ry*vy + rz*vz;
    const c = rx*rx + ry*ry + rz*rz;
    if (Math.abs(a) < 1e-6) return b < 0 ? -c / (2*b) : Infinity;
    const d = b*b - a*c;
    if (d < 0) return Infinity;
    const root = Math.sqrt(d);
    const t1 = (-b-root)/a, t2 = (-b+root)/a;
    return Math.min(t1 > 0 ? t1 : Infinity, t2 > 0 ? t2 : Infinity);
}
