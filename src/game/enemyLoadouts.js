import {LEAGUE_FITS} from './leagueContent.js';
import {HULL_HARDPOINTS, OUTFIT_ITEMS,canonicalOutfitId, itemFitsMount,normalizeLoadout} from './outfitting.js';
import {LAUNCHERS, WEAPONS, launcherIdForOutfit, weaponRange, weaponIdForOutfit,weaponForOutfit} from './weapons.js';
import {getEffectiveShipStats} from './shipStats.js';
// Approved hulls have a recognizable stock fit; explicit observer/scenario fits override it.
export const HULL_NPC_FITS = Object.freeze({
 ...LEAGUE_FITS,
 scrapper:{guns:['pulse-cannon','pulse-cannon','pulse-cannon','pulse-cannon'],launcher:'seeker-launcher'},
 demon:{guns:['pulse-cannon','pulse-cannon','ripper','ripper'],launcher:'seeker-launcher'},
 mule:{guns:['pulse-cannon','pulse-cannon'],turret:'pdc',launcher:'seeker-launcher'},
 wayfarer:{guns:['beam-emitter','beam-emitter'],turret:'pdc',launcher:'seeker-launcher'},
 talon:{guns:['pulse-cannon','pulse-cannon','ion-blaster'],launcher:'shield-seeker-launcher'},
 lancer:{guns:['pulse-cannon-t2','ion-blaster'],launchers:['seeker-launcher','shield-seeker-launcher'],turret:'pdc',drive:'thrusters-mk2'},
 prospector:{guns:['pulse-cannon'],turret:'pdc',launcher:'seeker-launcher'},
 // A hauler mans the turret mounts its civilian crew can actually crew (`false`
 // leaves a reviewed hardpoint empty) and keeps its regulation point defence.
 // The hull keeps every mount; the stock NPC fit fills fewer of them, which is
 // what puts a tier-3 hauler at the tier-2 combat level instead of ahead of it
 // (see .freebuff/balance/main-loadouts.mjs).
 atlas:{guns:['gauss-cannon'],turrets:['pdc','pdc',false,false],launcher:'seeker-launcher',defense:'shield-mk2'},
 vanguard:{guns:['pulse-cannon-t2','mortar'],launchers:['torpedo-launcher','torpedo-launcher','swarm-launcher'],turret:'pdc',defense:'shield-mk2'},
 blade:{guns:['pulse-cannon-t2','gauss-cannon'],launchers:['seeker-launcher','shield-seeker-launcher'],turret:'pdc',power:'sustained-reactor'},
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
// Industrial combat doctrine reflects each ship's job and its crew: the
// Wayfarer flies one PDC drone, the Atlas keeps two regulation PDC escorts,
// and the Prospector mans one of its three bays with a PDC — like the Atlas's
// manned turrets, a civilian crew crews what it can afford to lose. A stock NPC
// hauler's anti-fighter power is set by this list, and it is the strongest
// balance lever in the hauler-versus-fighter band: three Prospector PDC drones
// beat both tier-1 combat hulls 7/8, one drone leaves the pair roughly even
// (measured by .freebuff/balance/main-loadouts.mjs).
const NPC_DRONE_DEFAULTS = Object.freeze({
    wayfarer: Object.freeze(['pdc']),
    prospector: Object.freeze(['pdc']),
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
        return itemFitsMount(OUTFIT_ITEMS[item],mount)?canonicalOutfitId(item):'pulse-cannon';
    });
    const turrets=spec.turrets.map((mount,i)=>{
        const item=observerFit?.turrets?.[i] ?? observerFit?.turret ?? null;
        return item && itemFitsMount(OUTFIT_ITEMS[item],mount) ? item : null;
    });
    const launchers=spec.launchers.map((mount,i)=>{
        const rackIndex=i-spec.stockGunCount;if(rackIndex<0||rackIndex>=spec.stockLauncherCount)return null;
        const item=observerFit?.launchers?.[rackIndex] ?? observerFit?.launcher;
        return item && itemFitsMount(OUTFIT_ITEMS[item],mount) ? item : null;
    });
    const gunIndices=guns.flatMap((id,i)=>id?[i]:[]);
    const weapons=gunIndices.map(i=>weaponIdForOutfit(guns[i]));
    // Weapon choice defines close-range interceptor versus ranged fighter doctrine.
    const profile=profileForWeapons(weapons.filter(Boolean),ship.pilot?.tier);
    const equipmentLoadout={mountSchema:4,guns,launchers,turrets,
        power:spec.power.map((mount)=>observerFit?.power && itemFitsMount(OUTFIT_ITEMS[observerFit.power],mount)?observerFit.power:null),
        drive:spec.drive.map((mount)=>observerFit?.drive && itemFitsMount(OUTFIT_ITEMS[observerFit.drive],mount)?observerFit.drive:null),
        defense:spec.defense.map((mount)=>observerFit?.defense && itemFitsMount(OUTFIT_ITEMS[observerFit.defense],mount)?observerFit.defense:null),
        utility:spec.utility.map((mount)=>observerFit?.utility && itemFitsMount(OUTFIT_ITEMS[observerFit.utility],mount)?observerFit.utility:null),
        fireGroups:{activeGroup:'ALL',assignments:Object.fromEntries(spec.guns.map((mount)=>[mount.id,'A']))}};
    equipmentLoadout.utility=[observerFit?.utility,observerFit?.power,observerFit?.drive,observerFit?.defense].filter(Boolean);while(equipmentLoadout.utility.length<spec.utility.length)equipmentLoadout.utility.push(null);
    const stats=observerFit
        ? getEffectiveShipStats({shipId:hullId,outfitting:{schema:4,locker:{},loadouts:{[hullId]:equipmentLoadout}}})
        : getEffectiveShipStats({shipId:hullId,equipment:[]});
    const launcher = explicit && arenaFit.launcher && LAUNCHERS[arenaFit.launcher] ? arenaFit.launcher : launcherIdForOutfit(launchers.find(Boolean));
    return {hullId,guns,weapons,gunIndices,weaponDefinitions:gunIndices.map(i=>weaponForOutfit(guns[i])),turrets,launchers,power:equipmentLoadout.power,drive:equipmentLoadout.drive,defense:equipmentLoadout.defense,utility:equipmentLoadout.utility,fitId:explicit ? 'scenario' : OBSERVER_FITS[arenaFit]?arenaFit:`${hullId}-standard`,profile,stats,attackOrder:[...weapons.keys()].filter(i=>weapons[i]).reverse(),resources:{...stats,shield:stats.shield},fireAt:weapons.map(()=>0),
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
    const preferred={pulse:235,beam:240,gauss:tier==='ace'?510:tier==='novice'?300:410,mortar:300,ion:85,ripper:85};
    const range=Math.min(weaponRange(main),preferred[main.id]??240);
    const role=range>=300?'gunship':range<100?'interceptor':'fighter';
    return {role,range,projectileSpeed:main.speed,life:main.life,interval:main.cooldown,
        pass:Math.max(30,range*0.3),reset:Math.max(140,range*0.8),extend:role==='gunship'?7:3,standoff:12};
}
