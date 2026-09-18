import {LEAGUE_FITS} from './leagueContent.js';
import {HULL_HARDPOINTS, OUTFIT_ITEMS, itemFitsMount} from './outfitting.js';
import {LAUNCHERS, WEAPONS, launcherIdForOutfit, weaponRange, weaponIdForOutfit} from './weapons.js';
import {getEffectiveShipStats} from './shipStats.js';
const FITS = [
    ['pulse-cannon','pulse-cannon','gauss-cannon'],
    ['ripper','ripper','ion-blaster'],
    ['pulse-cannon','pulse-cannon','mortar'],
    ['pulse-cannon','pulse-cannon','beam-emitter'],
];
// Observer presets are deliberately expressed as real outfitting item ids.
// createEnemyLoadout still checks every choice against the active hull's
// mounts, so a medium-only weapon simply falls back to the universal pulse
// cannon on a small bay instead of creating an impossible ship.
const OBSERVER_FITS = Object.freeze({
    balanced: Object.freeze({ guns: ['pulse-cannon', 'pulse-cannon', 'gauss-cannon'], turret: 'pdc', launcher: 'seeker-launcher' }),
    assault: Object.freeze({ guns: ['ripper', 'ripper', 'ion-blaster'], turret: 'tracking-turret', launcher: 'swarm-launcher', drive: 'engine-mk2', defense: 'recovery-shield' }),
    support: Object.freeze({ guns: ['pulse-cannon', 'pulse-cannon', 'mortar'], turret: 'pdc', launcher: 'seeker-launcher', power: 'capacitor-bank', defense: 'shield-mk2' }),
    beam: Object.freeze({ guns: ['beam-emitter', 'beam-emitter', 'beam-emitter'], turret: 'tracking-turret', launcher: 'seeker-launcher', power: 'sustained-reactor' }),
});
export function createEnemyLoadout(ship, index, arenaFit) {
    const hullId = ship.hullId ?? (ship.role === 'bounty' ? 'lancer' : ship.role === 'trader' ? 'atlas' : ship.role === 'miner' ? 'prospector' : ship.role === 'escort' ? 'wayfarer' : ship.role === 'patrol' ? 'vanguard' : 'talon');
    const spec=HULL_HARDPOINTS[hullId], choices=FITS[index % FITS.length];
    const observerFit = (typeof arenaFit === 'string' ? OBSERVER_FITS[arenaFit] : undefined) ?? LEAGUE_FITS[hullId];
    const guns=spec.guns.map((mount,i)=>{
        const item=observerFit?.guns ? observerFit.guns[i] : arenaFit?.guns ? arenaFit.guns[i] : i===spec.guns.length-1?choices[2]:choices[i % choices.length];
        if(!item)return null;
        return itemFitsMount(OUTFIT_ITEMS[item],mount)?item:'pulse-cannon';
    });
    const turrets=spec.turrets.map((mount,i)=>{
        const item=observerFit?.turret ?? arenaFit?.turrets?.[i] ?? (observerFit ? null : index%2===0?'pdc':'tracking-turret');
        return item && itemFitsMount(OUTFIT_ITEMS[item],mount) ? item : null;
    });
    const launchers=spec.launchers.map((mount,i)=>{
        const item=observerFit?.launchers?.[i] ?? observerFit?.launcher;
        return item && itemFitsMount(OUTFIT_ITEMS[item],mount) ? item : null;
    });
    const weapons=guns.filter(Boolean).map(weaponIdForOutfit);
    const profile=profileForWeapons(weapons.filter(Boolean),ship.pilot?.tier);
    const equipmentLoadout={guns,launchers,turrets,
        power:spec.power.map((mount)=>observerFit?.power && itemFitsMount(OUTFIT_ITEMS[observerFit.power],mount)?observerFit.power:null),
        drive:spec.drive.map((mount)=>observerFit?.drive && itemFitsMount(OUTFIT_ITEMS[observerFit.drive],mount)?observerFit.drive:null),
        defense:spec.defense.map((mount)=>observerFit?.defense && itemFitsMount(OUTFIT_ITEMS[observerFit.defense],mount)?observerFit.defense:null),
        utility:spec.utility.map((mount)=>observerFit?.utility && itemFitsMount(OUTFIT_ITEMS[observerFit.utility],mount)?observerFit.utility:null),
        fireGroups:{activeGroup:'ALL',assignments:Object.fromEntries(spec.guns.map((mount)=>[mount.id,'A']))}};
    const stats=observerFit
        ? getEffectiveShipStats({shipId:hullId,outfitting:{schema:3,locker:{},loadouts:{[hullId]:equipmentLoadout}}})
        : getEffectiveShipStats({shipId:hullId,equipment:[]});
    const launcher = observerFit ? launcherIdForOutfit(launchers.find(Boolean)) : hullId==='lancer'?'torpedo':index%3===0?'seeker':undefined;
    return {hullId,guns,weapons,turrets,launchers,power:equipmentLoadout.power,drive:equipmentLoadout.drive,defense:equipmentLoadout.defense,utility:equipmentLoadout.utility,fitId:observerFit ? arenaFit : undefined,profile,stats,attackOrder:[...weapons.keys()].filter(i=>weapons[i]).reverse(),resources:{...stats,shield:stats.shield},fireAt:weapons.map(()=>0),
        launcher,
        racks: LEAGUE_FITS[hullId] ? launchers.filter(Boolean).map(id=>{const launcher=launcherIdForOutfit(id);return {launcher,missiles:LAUNCHERS[launcher].capacity};}) : undefined,
        missiles:observerFit ? (LAUNCHERS[launcher]?.capacity ?? 0) : hullId==='lancer'?2:index%3===0?4:0};
}

// Shared by live NPC fitting and controlled balance fixtures.
export function profileForWeapons(weapons,tier='veteran') {
    const main=WEAPONS[weapons.at(-1)];
    // Tactical pass spacing is distinct from maximum weapon reach. Scatter/ion
    // fits still close to exploit pellet density; longer reach must not make
    // every fighter hang back like artillery. Firing uses weaponRange directly.
    const preferred={pulse:235,'pulse-mk2':250,beam:240,gauss:tier==='ace'?510:tier==='novice'?300:410,mortar:300,ion:85,ripper:85};
    const range=Math.min(weaponRange(main),preferred[main.id]??240);
    const role=range>=300?'gunship':range<100?'interceptor':'fighter';
    return {role,range,projectileSpeed:main.speed,life:main.life,interval:main.cooldown,
        pass:Math.max(30,range*0.3),reset:Math.max(140,range*0.8),extend:role==='gunship'?7:3,standoff:12};
}
