import {HULL_HARDPOINTS, OUTFIT_ITEMS, itemFitsMount} from './outfitting.js';
import {WEAPONS, weaponRange, weaponIdForOutfit} from './weapons.js';
import {getEffectiveShipStats} from './shipStats.js';
const FITS = [
    ['pulse-cannon','pulse-cannon','gauss-cannon'],
    ['ripper','ripper','ion-blaster'],
    ['pulse-cannon','pulse-cannon','mortar'],
    ['pulse-cannon','pulse-cannon','beam-emitter'],
];
export function createEnemyLoadout(ship, index) {
    const hullId = ship.role === 'bounty' ? 'lancer' : ship.role === 'trader' ? 'atlas' : ship.role === 'miner' ? 'prospector' : ship.role === 'escort' ? 'wayfarer' : ship.role === 'patrol' ? 'vanguard' : 'talon';
    const spec=HULL_HARDPOINTS[hullId], choices=FITS[index % FITS.length];
    const guns=spec.guns.map((mount,i)=>{
        const item=i===spec.guns.length-1?choices[2]:choices[i % choices.length];
        return itemFitsMount(OUTFIT_ITEMS[item],mount)?item:'pulse-cannon';
    });
    const weapons=guns.map(weaponIdForOutfit);
    const profile=profileForWeapons(weapons,ship.pilot?.tier);
    const stats=getEffectiveShipStats({shipId:hullId,equipment:[]});
    return {hullId,guns,weapons,turrets:spec.turrets.map(()=>index%2===0?'pdc':'tracking-turret'),profile,stats,attackOrder:[...weapons.keys()].reverse(),resources:{...stats,shield:ship.maxShield},fireAt:weapons.map(()=>0),
        launcher: hullId==='lancer'?'torpedo':index%3===0?'seeker':undefined,
        missiles: hullId==='lancer'?2:index%3===0?4:0};
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
