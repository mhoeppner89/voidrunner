// Checkpoint the active career group separately from the seeded capital damage ledger.
// Save only gameplay data. Steering scratches, meshes and references are rebuilt on load.
import {registerInventoryDefinitions} from './equipmentInventory.js';
import {restoreNpcDrones} from './npcDrones.js';
import {applyCapitalSubsystemEffects} from './capitalCombat.js';
import {launchCycle} from './arenaBattle.js';
import {LOCATIONS,spawnClearance} from './data.js';
import {TRAFFIC_HULLS} from './corvetteMounts.js';

const fields = [
    'id','name','role','variant','hullId','faction','guild','livery','instanceId','pilot','task','destination',
    'position','rotation','velocity','portraitIndex','recognitionName','fuel','lastResolvedPlayer','playerIntelPosition','hull','maxHull','shield','maxShield','energy','shieldDelay','combatFit',
    'capitalClass','capitalSpawnKey','capitalMountHull','missingPods','collisionVariant','lostDroneBays',
    'cargo','equipmentRecords','lootKey','repairDronesHeld','hostile','targetId','combatThreatId','combatThreatUntil',
    'frigateEncounterId','launchOwner','formationSlot','formationPoint','formationTrail','convoyEscape','convoyPort',
    'convoyFormed','convoyDistress','scanned','dark','surrendered','poweredDown','standingDown','fleeing','claimed','driveWear','crippled',
    'playerDamageTaken','identifiedByPlayer','playerIdentified','playerAwareness','playerSensorAwareness',
    'fireCooldown','missileCooldown','spawnTime','lifetime','attackPhase','stationDock','stationTraffic','stationDockCompleted','mugCapable','pendingMug','pendingMugLeaderId',
    'demandUntil','holdFire','jumpPursuit','squadId','combatTeamId',
];
function checkpointShip(ship) {
    const state={};
    for(const key of fields)if(ship[key]!==undefined)state[key]=ship[key];
    return {state,leader:ship.convoyLeader?.id,
        lanes:ship.carrierBattle?.lanes?.map(({subsystem,remaining,retryIn})=>({subsystem,remaining,retryIn})),
        drones:ship.droneFleet&&Object.values(ship.droneFleet.unitsById).map(({prevPosition,prevRotation,...unit})=>unit)};
}
export function checkpointFrigateEncounter(session) {
    const world=session.save.world;
    const members=(session.ships??[]).filter(ship=>ship.frigateEncounterId&&ship.hull>0&&!ship.captured);
    if(members.length){
        world.frigateEncounter={systemId:session.save.player.systemId,entityCounter:session.entityCounter,members:members.map(checkpointShip)};
    }else if(session.frigateTrafficReady || world.frigateEncounter&&world.frigateEncounter.systemId!==session.save.player.systemId){
        world.frigateEncounter=null;
    }
}
// Prototype saves kept damage and remaining cargo at the seeded spawn point.
// Recover the nearest surviving local hull once. Those saves did not track escorts.
function restoreLegacyHull(session,range) {
    const {world,player}=session.save;
    const port=LOCATIONS[player.dockedAt??player.lastDockedAt];
    const distanceTo=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]);
    const portRadius=port?.systemId===player.systemId?spawnClearance(port):0;
    const atPort=portRadius>0&&distanceTo(player.position,port.position)<=portRadius;
    let nearest=range,selected;
    for(const [key,record] of Object.entries(world.capitalTraffic??{})){
        const [system,variant,...coordinates]=key.split(':');
        if(system!==player.systemId||TRAFFIC_HULLS[variant]?.capitalClass!=='frigate'||
            record?.retired||!(record?.hull>0)||!Array.isArray(record.mounts)||coordinates.length!==3)continue;
        const position=coordinates.map(Number);
        // Planet-side saves can be at the centre while traffic orbits the approach sphere.
        let distance=distanceTo(position,player.position);
        if(atPort)distance=Math.min(distance,Math.abs(distanceTo(position,port.position)-portRadius));
        if(distance<nearest){nearest=distance;selected={variant,position};}
    }
    return Boolean(selected&&session.spawnTrafficCapital(selected.variant,selected.position,true));
}
export function restoreFrigateEncounter(session,legacyRange) {
    if(session.arena||session.restoringFrigateEncounter)return false;
    const saved=session.save.world.frigateEncounter;
    if(saved===undefined&&legacyRange&&!session.frigateTrafficReady&&session.save.world.capitalTraffic)
        return restoreLegacyHull(session,legacyRange);
    if(saved?.systemId!==session.save.player.systemId||!saved?.members?.length)return false;
    if(session.frigateTrafficReady)return true;
    const ships=new Map();
    session.restoringFrigateEncounter=true;
    try {
        for(const {state,lanes,drones} of saved.members){
            const ship=TRAFFIC_HULLS[state.variant]
                ?session.spawnTrafficCapital(state.variant,state.position,false,state.pilot)
                :session.spawnShip(state.role,state.position,undefined,state.name,state.pilot,{hullId:state.hullId,faction:state.faction,guild:state.guild});
            Object.assign(ship,structuredClone(state));
            // A fresh pirate defaults to targeting the player. An explicitly idle escort stays idle.
            ship.targetId=state.targetId;
            if(ship.pendingMugLeaderId)ship.demandUntil=Infinity;
            for(const {item} of ship.equipmentRecords??[])registerInventoryDefinitions({items:{[item.id]:item}});
            if(ship.capitalClass)applyCapitalSubsystemEffects(ship);
            if(lanes){
                const battle=ship.carrierBattle={target:ship,trafficCarrier:ship};
                for(const bay of launchCycle(battle,TRAFFIC_HULLS[ship.variant].launch,0)){
                    const record=lanes.find(lane=>lane.subsystem===bay.subsystem);
                    if(record){bay.remaining=record.remaining;bay.retryIn=record.retryIn??0;}
                }
            }
            if(drones)restoreNpcDrones(session,ship,drones);
            ships.set(ship.id,ship);
        }
        for(const {state,leader} of saved.members)if(leader)ships.get(state.id).convoyLeader=ships.get(leader);
        session.entityCounter=Math.max(session.entityCounter,saved.entityCounter??0);
        session.frigateTrafficReady=true;
        return true;
    }finally{session.restoringFrigateEncounter=false;}
}
