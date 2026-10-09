import {LEAGUE_FITS} from './leagueContent.js';
import {HULL_HARDPOINTS, OUTFIT_ITEMS, itemFitsMount} from './outfitting.js';
import {LAUNCHERS, WEAPONS, launcherIdForOutfit, weaponRange, weaponIdForOutfit} from './weapons.js';
import {getEffectiveShipStats} from './shipStats.js';
// Approved hulls have a recognizable stock fit; explicit observer/scenario fits override it.
export const HULL_NPC_FITS = Object.freeze({
 ...LEAGUE_FITS,
 scrapper:{guns:['pulse-cannon','pulse-cannon','pulse-cannon','pulse-cannon'],launcher:'seeker-launcher'},
 demon:{guns:['pulse-cannon','pulse-cannon','ripper','ripper'],launcher:'seeker-launcher'},
 mule:{guns:['pulse-cannon','pulse-cannon'],turret:'pdc',launcher:'seeker-launcher'},
 wayfarer:{guns:['beam-emitter','beam-emitter'],turret:'pdc',launcher:'seeker-launcher'},
 talon:{guns:['pulse-cannon','pulse-cannon','ion-blaster'],launcher:'shield-seeker-launcher'},
 lancer:{guns:['pulse-mk2','ion-blaster'],launchers:['seeker-launcher','shield-seeker-launcher'],turret:'pdc',drive:'thrusters-mk2'},
 prospector:{guns:['pulse-cannon'],turret:'pdc',launcher:'seeker-launcher'},
 atlas:{guns:['gauss-cannon'],turret:'pdc',launcher:'seeker-launcher',defense:'shield-mk2'},
 vanguard:{guns:['pulse-mk2','mortar'],launchers:['torpedo-launcher','torpedo-launcher','swarm-launcher'],turret:'pdc',defense:'shield-mk2'},
 blade:{guns:['pulse-mk2','gauss-cannon'],launchers:['seeker-launcher','shield-seeker-launcher'],turret:'pdc',power:'sustained-reactor'},
});
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
// Industrial combat doctrine reflects each ship's job: the Wayfarer has one
// attack drone, while Prospector and Atlas prioritize point defense.
const NPC_DRONE_DEFAULTS = Object.freeze({
    wayfarer: Object.freeze(['attack']),
    prospector: Object.freeze(['pdc', 'pdc', 'pdc']),
    atlas: Object.freeze(['pdc', 'pdc']),
});
export function createEnemyLoadout(ship, index, arenaFit) {
    const hullId = ship.hullId ?? (ship.role === 'bounty' ? 'lancer' : ship.role === 'trader' ? 'atlas' : ship.role === 'miner' ? 'prospector' : ship.role === 'escort' ? 'wayfarer' : ship.role === 'patrol' ? 'vanguard' : 'scrapper');
    const spec=HULL_HARDPOINTS[hullId];
    const explicit=arenaFit&&typeof arenaFit==='object';
    const observerFit=explicit?arenaFit:(OBSERVER_FITS[arenaFit]??HULL_NPC_FITS[hullId]);
    const guns=spec.guns.map((mount,i)=>{
        const item=observerFit?.guns?.[i];
        if(!item)return null;
        return itemFitsMount(OUTFIT_ITEMS[item],mount)?item:'pulse-cannon';
    });
    const turrets=spec.turrets.map((mount,i)=>{
        const item=observerFit?.turrets?.[i] ?? observerFit?.turret ?? null;
        return item && itemFitsMount(OUTFIT_ITEMS[item],mount) ? item : null;
    });
    const launchers=spec.launchers.map((mount,i)=>{
        const item=observerFit?.launchers?.[i] ?? observerFit?.launcher;
        return item && itemFitsMount(OUTFIT_ITEMS[item],mount) ? item : null;
    });
    const weapons=guns.filter(Boolean).map(weaponIdForOutfit);
    // Weapon choice defines close-range interceptor versus ranged fighter doctrine.
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
    const launcher = explicit && arenaFit.launcher && LAUNCHERS[arenaFit.launcher] ? arenaFit.launcher : launcherIdForOutfit(launchers.find(Boolean));
    return {hullId,guns,weapons,turrets,launchers,power:equipmentLoadout.power,drive:equipmentLoadout.drive,defense:equipmentLoadout.defense,utility:equipmentLoadout.utility,fitId:explicit ? 'scenario' : OBSERVER_FITS[arenaFit]?arenaFit:`${hullId}-standard`,profile,stats,attackOrder:[...weapons.keys()].filter(i=>weapons[i]).reverse(),resources:{...stats,shield:stats.shield},fireAt:weapons.map(()=>0),
        launcher,
        racks: launchers.some(Boolean) ? launchers.filter(Boolean).map(id=>{const launcher=launcherIdForOutfit(id);return {launcher,missiles:LAUNCHERS[launcher].capacity};}) : undefined,
        missiles:explicit ? (arenaFit.missiles??(LAUNCHERS[launcher]?.capacity??0)) : (LAUNCHERS[launcher]?.capacity??0),
        droneTypes:NPC_DRONE_DEFAULTS[hullId]};
}

// Shared by live NPC fitting and controlled balance fixtures.
export function profileForWeapons(weapons,tier='veteran') {
    const main=WEAPONS[weapons.at(-1)]??WEAPONS.pulse;
    // Tactical pass spacing is distinct from maximum weapon reach. Scatter/ion
    // fits still close to exploit pellet density; longer reach must not make
    // every fighter hang back like artillery. Firing uses weaponRange directly.
    const preferred={pulse:235,'pulse-mk2':250,beam:240,gauss:tier==='ace'?510:tier==='novice'?300:410,mortar:300,ion:85,ripper:85};
    const range=Math.min(weaponRange(main),preferred[main.id]??240);
    const role=range>=300?'gunship':range<100?'interceptor':'fighter';
    return {role,range,projectileSpeed:main.speed,life:main.life,interval:main.cooldown,
        pass:Math.max(30,range*0.3),reset:Math.max(140,range*0.8),extend:role==='gunship'?7:3,standoff:12};
}
