import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fixture} from '../helpers/session.mjs';
import * as THREE from '../../vendor/three.module.min.js';
import {LOCATIONS,SHIPS,sectorEncounterChance} from '../../src/game/data.js';
import {SYSTEMS,getRoute,jumpPiracyRisk} from '../../src/game/galaxy.js';
import {careerRegion,careerGroupSize,careerCombatHull,careerPilotTier,portPoliceStrength} from '../../src/game/careerDanger.js';
import {contractRegionDanger,generateMissionOffers} from '../../src/game/missions.js';
import {seededRandom} from '../../src/game/random.js';
import {createNewSave} from '../../src/game/save.js';
import {isTutorialActive} from '../../src/game/tutorialCampaign.js';

function career(systemId='helios-verge',locationId) {
    const s=fixture();s.arena=undefined;s.save.player.systemId=systemId;
    s.save.player.dockedAt=undefined;s.save.player.navTargetId=SYSTEMS[systemId].locationIds[0];
    s.save.player.position=locationId?[...LOCATIONS[locationId].position]:[-30000,200,-30000];
    s.nextEncounterAt=0;s.encounterCounter=0;s.lastCombatAt=-1000;
    s.updateStationTraffic=()=>{};s.updateCapitalTraffic=()=>{};
    s.playerExposureRange=()=>10000;s.utilityActive=false;s.activeMug=()=>undefined;
    s.missionEncounterPressure=()=>undefined;s.holdWorth=()=>0;
    s.stageHunterGroup=()=>{};s.threatAcquireTarget=()=>{};s.audio={play(){}};s.ui={pushEvent(){},pushSensor(){}};
    s.hyperdriveInterceptIds=new Set();s.interceptCounter=0;s.hyperdriveEncounterCooldownUntil=0;
    return s;
}
function sample(systemId,{locationId,dark=false,calm=false,beam=false,mission=false,gold=false}={}) {
    const s=career(systemId,locationId),counts={windows:600,hostileWindows:0,pirates:0,demons:0,aces:0,novices:0,maxGroup:0,seconds:0};
    if(dark)s.playerExposureRange=()=>0;
    if(beam){s.utilityActive=true;s.mugDemand=()=>undefined;s.sayPilotLine=()=>{};s.mugShare=()=>.2;}
    if(mission)s.missionEncounterPressure=()=>({kind:'sealed',level:1.05,message:'test'});
    for(let i=0;i<counts.windows;i++) {
        s.save.world.time=10000+i*200;s.ships=[];s.nextEncounterAt=0;
        if(calm)s.lastCombatAt=s.save.world.time;
        if(gold)s.save.world.goldHeatUntil=s.save.world.time+100;
        s.updateDynamicEncounters();
        const pirates=s.ships.filter(ship=>ship.faction==='pirates');
        counts.hostileWindows+=Number(pirates.length>0);counts.pirates+=pirates.length;
        counts.demons+=pirates.filter(ship=>ship.hullId==='demon').length;
        counts.aces+=pirates.filter(ship=>ship.pilot.tier==='ace').length;
        counts.novices+=pirates.filter(ship=>ship.pilot.tier==='novice').length;
        counts.maxGroup=Math.max(counts.maxGroup,pirates.length);counts.seconds+=s.nextEncounterAt-s.save.world.time;
        for(const ship of s.ships)assert.equal(ship.combatFit.fitId,`${ship.hullId}-standard`);
    }
    counts.threatsPerHour=counts.hostileWindows/counts.seconds*3600;
    return counts;
}

test('systems and local POIs have coherent danger, with safer starting ports and riskier working areas',()=>{
    const order=['helios-verge','meridian','acheron','pale-ring','redwake'];
    for(let i=1;i<order.length;i++)assert.ok(careerRegion(order[i]).danger>careerRegion(order[i-1]).danger);
    for(const location of Object.values(LOCATIONS)) {
        assert.equal(location.security,careerRegion(location.systemId,location.id));
        assert.equal(sectorEncounterChance(location.id),location.security.jumpChance);
        assert.ok(location.encounterRate>0&&location.encounterRate<1);
    }
    assert.ok(sectorEncounterChance('rook')<.07);
    assert.ok(sectorEncounterChance('mourning-line')>sectorEncounterChance('helix')*3);
    assert.ok(sectorEncounterChance('redwake-belt')>sectorEncounterChance('shardbelt')*2);
});
test('actual position controls geography and pilots; selecting a distant dangerous target cannot increase local danger',()=>{
    const s=career('helios-verge','helix');s.save.player.navTargetId='mourning-line';
    assert.equal(s.careerLocationAt(),'helix');assert.equal(s.careerRegionAt().danger,.08);
    s.save.player.position=[...LOCATIONS['mourning-line'].position];s.activeInstanceId='helix';
    assert.equal(s.careerRegionAt().danger,.42);assert.equal(s.getWorldZone(),'graveyard');
    assert.equal(s.spawnThreat(s.save.player.position),.42);
    s.save.player.position=[-30000,200,-30000];assert.equal(s.careerLocationAt(),undefined);assert.equal(s.careerRegionAt().danger,.18);
});
test('lawful independent and military ports protect approaches; pirate ports do not count as police',()=>{
    for(const id of ['helix','rook','haven','blackglass','cinder']) {
        const l=LOCATIONS[id],s=career(l.systemId,id);
        assert.equal(s.policePresence(new THREE.Vector3(...l.position)),portPoliceStrength(l));
        assert.equal(s.policePresence(new THREE.Vector3(-30000,200,-30000)),0);
    }
    assert.equal(portPoliceStrength(LOCATIONS.blackglass),0);
    assert.ok(portPoliceStrength(LOCATIONS.helix)>portPoliceStrength(LOCATIONS.cinder));
});
test('seeded regional rolls change hulls, group sizes and pilot skill while keeping authored loadouts',()=>{
    const safe=careerRegion('helios-verge'),unsafe=careerRegion('redwake');
    const totals=[];
    for(const region of [safe,unsafe]) {
        const rng=seededRandom(923),result={demons:0,aces:0,novices:0,ships:0};
        for(let i=0;i<1000;i++) {
            const hull=careerCombatHull('pirates','pirate',region,rng);assert.ok(['scrapper','demon'].includes(hull));
            const tier=careerPilotTier(region,rng),group=careerGroupSize(region,rng);
            result.demons+=Number(hull==='demon');result.aces+=Number(tier==='ace');result.novices+=Number(tier==='novice');result.ships+=group;
            if(region===safe)assert.equal(group,1);
        }
        totals.push(result);
    }
    assert.ok(totals[1].demons>totals[0].demons*3);assert.ok(totals[1].aces>totals[0].aces*4);assert.ok(totals[1].novices<totals[0].novices/2);assert.ok(totals[1].ships>totals[0].ships*1.7);
    const s=career('helios-verge');
    const raider=s.spawnCareerRaider('pirate',[-30000,0,-30000],careerRegion('redwake'),()=>.1);
    assert.equal(raider.hullId,'demon');assert.equal(raider.pilot.tier,'novice');assert.equal(raider.combatFit.fitId,'demon-standard');
});
test('every regional fleet hull resolves to its real render variant, including Vanguard, Wayfarer and Atlas',()=>{
    const s=career('redwake');
    for(const id of Object.keys(SHIPS)) {
        const ship=s.spawnShip('patrol',[-30000,0,-30000],undefined,undefined,undefined,{faction:'independents',hullId:id});
        assert.equal(ship.variant,SHIPS[id].variant);
        assert.equal(ship.combatFit.fitId,`${id}-standard`);
    }
});
test('actual ambient encounter windows get progressively more dangerous and include different fleets',()=>{
    const safe=sample('helios-verge'),frontier=sample('pale-ring'),pirate=sample('redwake');
    assert.ok(frontier.threatsPerHour>safe.threatsPerHour*2);assert.ok(pirate.threatsPerHour>frontier.threatsPerHour*1.4);
    assert.equal(safe.maxGroup,1);assert.equal(pirate.maxGroup,3);
    assert.ok(pirate.demons/pirate.pirates>safe.demons/safe.pirates*2);
    assert.ok(pirate.aces/pirate.pirates>safe.aces/safe.pirates*2);
    console.log('Career seeded ambient samples:',JSON.stringify({safe,frontier,pirate}));
});
test('dark flight, combat recovery and gold heat still change encounter pressure',()=>{
    const bright=sample('pale-ring'),dark=sample('pale-ring',{dark:true}),recovering=sample('pale-ring',{calm:true});
    assert.ok(dark.hostileWindows<bright.hostileWindows);assert.ok(recovering.hostileWindows<bright.hostileWindows/2);
    const normal=sample('helios-verge',{locationId:'shardbelt'}),gold=sample('helios-verge',{locationId:'shardbelt',gold:true});
    assert.ok(gold.hostileWindows>normal.hostileWindows);
});
test('mission and extraction ambush branches also follow regional danger',()=>{
    for(const options of [{mission:true},{beam:true}]) {
        const safe=sample('helios-verge',{...options,locationId:'shardbelt'}),unsafe=sample('redwake',{...options,locationId:'redwake-belt'});
        assert.ok(unsafe.threatsPerHour>safe.threatsPerHour*2);assert.equal(safe.maxGroup,2);assert.equal(unsafe.maxGroup,3);
    }
});
test('wreck ambushes follow regional danger and cannot stack; mining disputes cannot add to a fight',()=>{
    const counts=[];
    for(const systemId of ['helios-verge','redwake']) {
        const s=career(systemId);s.save.world.time=10000;s.salvageAmbushTriggered=new Set();s.claimDisputesTriggered=new Set();s.asteroids=[];s.salvageMugDemand=()=>undefined;
        let encounters=0,max=0;
        for(let i=0;i<400;i++) {
            s.ships=[];const node={id:`wreck-${i}`,salvage:'ore',remaining:1000,ambushEligibleAt:0};
            s.triggerSalvageAmbush(node);encounters+=Number(s.ships.length>0);max=Math.max(max,s.ships.length);
            if(s.ships.length){const before=s.ships.length;s.triggerSalvageAmbush({...node,id:'another'});assert.equal(s.ships.length,before);s.triggerClaimDispute('another');assert.equal(s.ships.length,before);}
        }
        counts.push({encounters,max});
    }
    assert.ok(counts[1].encounters>counts[0].encounters*3);assert.equal(counts[0].max,1);assert.equal(counts[1].max,3);
});
test('encounters cannot stack during fights, races or the tutorial; arena hardware and overrides remain authoritative',()=>{
    for(const mode of ['fight','race','tutorial','arena']) {
        const s=career('redwake');s.save.world.time=10000;
        if(mode==='fight')s.ships=[{hull:1,hostile:true,position:[...s.save.player.position]}];
        if(mode==='race')s.activeRace={};if(mode==='arena')s.arena={};
        if(mode==='tutorial'){s.save=createNewSave(718,{tutorial:true});assert.equal(isTutorialActive(s.save),true);}
        const count=s.ships.length;s.updateDynamicEncounters();assert.equal(s.ships.length,count);
        assert.equal(s.spawnJumpPointPirates(getRoute('pale-redwake')),false);
        assert.equal(s.spawnHyperdriveIntercept(),false);
    }
    const s=career('redwake');s.arena={};const p=s.spawnShip('pirate',[-30000,0,-30000],undefined,undefined,{tier:'ace'},{hullId:'talon'});
    assert.equal(p.hullId,'talon');assert.equal(p.pilot.tier,'ace');
    const lesson=career('redwake');lesson.save=createNewSave(718,{tutorial:true});
    for(let i=0;i<10;i++){const enemy=lesson.spawnShip('pirate',[-30000,0,-30000],undefined,undefined,{tier:'novice'});assert.equal(enemy.hullId,i%5===4?'demon':'scrapper');assert.equal(enemy.pilot.tier,'novice');}
});
test('jump cargo pressure follows the corridor and arrival jurisdiction, staying finite and bounded',()=>{
    const safe=jumpPiracyRisk('verge-meridian',8000),dangerous=jumpPiracyRisk('pale-redwake',8000);
    assert.ok(dangerous>safe*3);
    assert.ok(jumpPiracyRisk('pale-redwake',8000,{arrivalSystemId:'redwake'})>jumpPiracyRisk('pale-redwake',8000,{arrivalSystemId:'pale-ring'}));
    assert.ok(jumpPiracyRisk('verge-meridian',8000)>jumpPiracyRisk('verge-meridian',0));
    assert.equal(jumpPiracyRisk('pale-redwake',Number.MAX_VALUE),1);
});
test('procedural contracts price destination and transit danger and pin the warrant hull',()=>{
    assert.ok(contractRegionDanger('helix','blackglass')>contractRegionDanger('helix','rook')*3);
    assert.equal(contractRegionDanger('meridian-prime','haven'),careerRegion('pale-ring').danger,'route crosses the exposed Pale Ring');
    const s=career(),offers=generateMissionOffers('helix',s.save);
    for(const m of offers) {
        if(m.kind==='bounty')assert.ok(['scrapper','demon'].includes(m.hullId));
        if(['delivery','transport','smuggle','bounty','salvage'].includes(m.kind)&&!m.authored)assert.ok(Number.isFinite(m.danger),m.kind);
    }
});
