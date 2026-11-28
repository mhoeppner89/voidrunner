import {careerRaidTier} from './careerDanger.js';
import {SKIDBLADNIR_LAUNCH_SOCKETS,SKIDBLADNIR_MOUNTS} from './skidbladnirMounts.js';

// Socket positions are in the validated, full-size flight frame (+X starboard, -Z bow).
const up=[0,1,0], down=[0,-1,0], aft=[0,0,1];
function seat(node,kind,label,position,normal=up){
    return {node,kind,label,position,normal,axis:1,side:normal[1],hull:kind==='broadside'?100:65,
        radius:kind==='broadside'?2.2:1.3,size:kind==='laser'?'M':'S',pedestal:0,visualScale:kind==='pdc'?2.05/.96:(node.endsWith('ventral')?2.20:2.45)/(.96*1.3),
        hitCenterOffset:[0,normal[1]*(kind==='broadside'?1.3:.7),0]};
}
const bridge=seat('mount_pdc_bridge','pdc','BRIDGE PDC',[0,5.27,-22.10526]);
const dorsal=seat('mount_laser_dorsal','laser','DORSAL LASER',[0,4.71,15.22807]);
const engines=[-1,1].map(side=>({node:side<0?'engine_port':'engine_starboard',kind:'engine',label:side<0?'PORT ENGINE':'STARBOARD ENGINE',
    position:[side*4.13,-.81,28],normal:aft,hull:120,hitShape:'cylinder',hitHalfLength:2.7,hitRadius:2.94,hitCenterOffset:[0,0,-2.7],exhaustRadius:2.3}));
const generator={node:'shield_generator',kind:'generator',label:'SHIELD GENERATOR',position:[0,6.04,19.64912],
    normal:up,hull:95,hitShape:'box',hitHalfExtents:[1.8,.67,1.8],hitCenterOffset:[0,-.67,0]};
const pods=Array.from({length:6},(_,i)=>{
    const side=i%2?1:-1;
    return {node:'pod_'+i,kind:'pod',label:'CARGO POD '+(i+1),hull:100,normal:[side,0,0],
        position:[side*8.76,0,[-10.31579,-1.47368,7.36842][i>>1]],hitShape:'box',hitHalfExtents:[3.08,2.95,3.85],hitCenterOffset:[-side*3.08,0,0]};
});
// The pitch pivot and twin barrel boxes come from ironjaw-broadside.glb.
const broadsideBarrels={pivotHeight:1.37, offset:.47, height:.06, reach:3.5, half:[.47,.60,2.12]};
const broadsides=[-1,1].map(side=>({...seat(side<0?'mount_heavy_port':'mount_heavy_starboard','broadside',
    side<0?'PORT BROADSIDE':'STARBOARD BROADSIDE',[side*4.78,2.65,-1.47368]),bearing:side,barrels:broadsideBarrels}));
const booster={node:'booster_port',kind:'booster',label:'PORT BOOSTER',hull:120,normal:aft,
    position:[-10.1,-.62,28.88772],hitCenterOffset:[.42,-.31,-7.63],hitHalfExtents:[2.35,2.15,7.64],hitShape:'box',exhaustRadius:1.3};
// The Barrage rides its engineering block 1.2 higher than the Drover (BARGE_LIFT).
// Racks sit on the old pod jaws; each is its own collision group (rack_N).
const BARGE_LIFT=1.2,toFlight=u=>u*56/57-28;
const bargeRacks=Array.from({length:6},(_,i)=>{
    const side=i%2?1:-1,z=toFlight([18,27,36][i>>1]-.2);
    return {node:'rack_'+i,kind:'rack',label:'LAUNCHER RACK '+(i+1),hull:90,normal:[side,0,0],position:[side*8.75,1.9,z],
        hitShape:'box',hitHalfExtents:[3.05,4.5,3.45],hitCenterOffset:[-side*3.05,0,0],partBit:1<<i,launchUp:2.4/6.8};
});
const bargeDish={node:'fire_control',kind:'dish',label:'FIRE CONTROL',hull:90,normal:up,position:[0,9.2,toFlight(6)],
    hitShape:'box',hitHalfExtents:[2.8,2.2,2.8],hitCenterOffset:[0,-.9,0]};
const lifted=mount=>({...mount,position:[mount.position[0],mount.position[1]+BARGE_LIFT,mount.position[2]]});
function moduleMount(node,label,position,half,hull,normal=up){
    return {node,kind:node,label,position,normal,hull,hitShape:'box',hitHalfExtents:half,markerLift:half[1]+.15,exportedSurface:true};
}
function drive(name,position,radius){
    return {node:'engine_'+name,kind:'engine',label:name.toUpperCase()+' ENGINE',position,normal:aft,hull:120,
        hitShape:'cylinder',hitHalfLength:5,hitRadius:radius,hitCenterOffset:[0,0,-5],exhaustRadius:radius*.8,exportedSurface:true};
}
export function patrolCorvette(faction,region,rng){
    const variant=faction==='alliance'?'siege':faction==='concord'?'picket':undefined;
    return variant&&careerRaidTier(region)>=2&&rng()<.10?variant:undefined;
}
export function patrolCapital(faction,region,rng){
    if(faction!=='alliance')return patrolCorvette(faction,region,rng);
    const tier=careerRaidTier(region);
    if(tier<2)return;
    const roll=rng();
    if(roll<.10)return 'siege';
    if(region.danger>=.5&&roll<.15)return 'skidbladnir';
}
function picketSeat(node,kind,label,position){
    return {...seat(node,kind,label,position),restDirection:[0,0,-1]};
}
export const CORVETTES={
    siege:{name:'Heimdall',shield:250,hull:800,speed:22,turn:Math.PI/18,preferredRange:1200,role:'patrol',faction:'alliance',
        mounts:[moduleMount('capacitor','LANCE CAPACITOR',[0,7,12.25],[3.47,3.98,7.96],120),
            moduleMount('rangefinder','RANGEFINDER',[0,10.21,23.9],[.8,.49,1.1],80),
            moduleMount('generator','SHIELD GENERATOR',[0,-4,12.8],[6.55,2.11,10.3],100,down),
            drive('port',[-5.43,-1.47,32],2.92),drive('starboard',[5.43,-1.47,32],2.92),
            seat('mount_laser_port','laser','PORT LASER',[-6.72,3.23,17.8]),
            seat('mount_laser_starboard','laser','STARBOARD LASER',[6.72,3.23,17.8])],readout:'TURRETS {turrets}/2'},
    picket:{name:'Tacita',shield:300,hull:600,speed:28,turn:.25,preferredRange:700,role:'patrol',faction:'concord',
        mounts:[{...moduleMount('emitter','ECM EMITTER',[0,8.54,12.96],[4.3,2.9,4.3],150),markerLift:3.7,partBit:1},
            moduleMount('generator','SHIELD GENERATOR',[0,5.12,11],[3.53,1,5.5],100),
            drive('port',[-5.42,3.46,24],2.17),drive('starboard',[5.42,3.46,24],2.17),
            picketSeat('mount_laser_port','laser','PORT LASER',[-3.35,3.96,-5.70]),picketSeat('mount_laser_starboard','laser','STARBOARD LASER',[3.35,3.96,-5.70]),
            picketSeat('mount_pdc_port','pdc','PORT PDC',[-8.45,3.90,7.83]),picketSeat('mount_pdc_starboard','pdc','STARBOARD PDC',[8.45,3.90,7.83])],readout:'TURRETS {turrets}/4'},
    drover:{name:'MV Njord',cargoHolds:6,shield:300,hull:900,speed:25,role:'trader',faction:'independents',mounts:[bridge,dorsal,seat('mount_laser_ventral','laser','VENTRAL LASER',[0,-3.36,-2.45614],down),generator,...engines,...pods],
        readout:'TURRETS {turrets}/3 · PODS {pods}/6'},
    // standoffCruise: share of top speed a corvette keeps on its broadside
    // orbit once in range, so it keeps manoeuvring instead of parking.
    ironjaw:{name:'Red Njord',shield:200,hull:1200,speed:30,standoffCruise:.5,role:'escort',faction:'pirates',mounts:[bridge,dorsal,...broadsides,generator,...engines,booster],
        readout:'GUNS {guns}/2 · TURRETS {turrets}/2'},
    // Missile artillery: shells the pilot from range; a fast crossing pass
    // breaks its lock and a rush draws one snap volley (bargeLaunchers.js).
    // It crawls while locking and relocates at full speed after each salvo.
    barge:{name:'Red Njord Barrage',shield:200,hull:700,speed:25,standoffCruise:.3,role:'escort',faction:'pirates',preferredRange:900,
        mounts:[bargeDish,{...lifted(dorsal)},lifted(generator),...engines.map(lifted),...bargeRacks],
        readout:'RACKS {racks}/6'},
};

// Collision envelopes and exterior marker positions come from the flight-frame exports.
const frigateSystems=[
    ...[-1,1].map(side=>seat('mount_pdc_'+(side<0?'port':'starboard'),'pdc',side<0?'PORT PDC':'STARBOARD PDC',[side*7.65,6.55,-42])),
    seat('mount_laser_dorsal','laser','DORSAL LASER',[0,8.42,38]),
    ...[-1,1].map(side=>({node:'generator_'+(side<0?'port':'starboard'),kind:'generator',label:side<0?'PORT GENERATOR':'STARBOARD GENERATOR',
        position:[side*17.05,.25,32],normal:[side,0,0],hull:95,hitShape:'box',hitHalfExtents:[1.5,3,3],hitCenterOffset:[-side*1.5,0,0]})),
    ...['port','centre','starboard'].map((name,i)=>({node:'engine_'+name,kind:'engine',label:name.toUpperCase()+' ENGINE',position:[(i-1)*8,-.94,52],
        normal:aft,hull:150,hitShape:'cylinder',hitRadius:3.8,hitHalfLength:3.6,hitCenterOffset:[0,0,-3.6],exhaustRadius:3})),
];
const oldRookeryBayHull=300;
const rookeryBayHull=180;
const rookeryBays=[-1,1].flatMap(bearing=>[-17.5,13].map((z,i)=>{
    const side=bearing<0?'port':'starboard';
    return {node:`bay_${side}_${i+1}`,kind:'bay',label:`${side.toUpperCase()} BAY ${i+1}`,
        position:[bearing*5,0,z],normal:[bearing,0,0],bearing,hull:rookeryBayHull,radius:4,markerLift:.4,exportedSurface:true};
}));
export const ROOKERY_LAUNCH={
    mast:'mast',fighter:'scrapper',
    bays:[rookeryBays[0],rookeryBays[2],rookeryBays[1],rookeryBays[3]]
        .map(({node})=>({subsystem:node,socket:node.replace('bay_','launch_')})),
    sockets:Object.fromEntries(rookeryBays.map(({node,position:[,,z],bearing})=>[node.replace('bay_','launch_'),{
        start_game_position:[bearing*14.4,0,z],game_position:[bearing*24.6,0,z],direction_game:[bearing,0,0]}])),
};
export const SKIDBLADNIR_LAUNCH={fighter:'speedster',sockets:SKIDBLADNIR_LAUNCH_SOCKETS,
    bays:Object.keys(SKIDBLADNIR_LAUNCH_SOCKETS).map(socket=>({subsystem:socket.replace('launch_','bay_'),socket})),
};
export const TRAFFIC_HULLS={...CORVETTES,
    caravan:{name:'Brigid',capitalClass:'frigate',shield:500,hull:2000,speed:20,turn:.15,regen:10,cargoHolds:4,
        role:'trader',faction:'independents',dronePort:[0,7.81,-3.9],readout:'TURRETS {turrets}/4 · STACKS {stacks}/4',
        mounts:[...frigateSystems,seat('mount_laser_ventral','laser','VENTRAL LASER',[0,-5.85,-22],down),
            {node:'drone_hangar',kind:'hangar',label:'DRONE HANGAR',hull:160,normal:up,position:[0,7.81,-3.9],hitShape:'box',hitHalfExtents:[4.6,2.2,6.1],hitCenterOffset:[0,-2.7,1.9]},
            ...Array.from({length:4},(_,i)=>{const side=i%2?1:-1;return {node:'stack_'+i,kind:'stack',label:'CARGO STACK '+(i+1),hull:150,normal:[side,0,0],
                position:[side*15.85,0,i<2?-16:12],hitShape:'box',hitHalfExtents:[5.35,5.1,10.92],hitCenterOffset:[-side*5.35,-.18,0],partBit:1<<i};})]},
    rookery:{name:'Red Brigid',capitalClass:'frigate',shield:500,hull:2400,speed:20,turn:.15,regen:10,preferredRange:1200,launch:ROOKERY_LAUNCH,
        role:'escort',faction:'pirates',readout:'GUNS {guns}/2 · BAYS {bays}/4',mounts:[...frigateSystems,
            ...[-1,1].map((side,i)=>({...broadsides[i],node:'mount_broadside_'+(side<0?'port':'starboard'),position:[side*17.88,4.03,-2]})),
            {node:'mast',kind:'mast',label:'FLIGHT CONTROL',hull:120,normal:up,position:[0,13.36,-2],hitShape:'box',hitHalfExtents:[4.4,5.2,5.9],hitCenterOffset:[0,-5.2,0]},
            ...rookeryBays]},
    skidbladnir:{name:'Skidbladnir',capitalClass:'frigate',shield:500,hull:2300,speed:22,turn:.16,regen:10,preferredRange:1300,
        standoffCruise:.35,role:'patrol',faction:'alliance',readout:'TURRETS {turrets}/4 · BAYS {bays}/6',
        mounts:SKIDBLADNIR_MOUNTS,launch:SKIDBLADNIR_LAUNCH},
};
export const CORVETTE_TRAFFIC={convoyChance:.15,raidChance:.15,minRaidTier:2,bargeShare:1/3};
export const FRIGATE_TRAFFIC={convoyChance:.05,minConvoyTier:2,towChance:.25,raidChance:.05,minRaidTier:3,raidEscorts:2};
export function raidCarrier(_systemId,region,rng){return (region.piratePressure??1)>0&&careerRaidTier(region)>=FRIGATE_TRAFFIC.minRaidTier&&rng()<FRIGATE_TRAFFIC.raidChance;}
export function convoyVariant(owner,region,rng,allowFrigate=true){
    if(owner!=='independents')return false;
    const roll=rng();
    if(roll<CORVETTE_TRAFFIC.convoyChance)return 'drover';
    return allowFrigate&&careerRaidTier(region)>=FRIGATE_TRAFFIC.minConvoyTier&&roll<CORVETTE_TRAFFIC.convoyChance+FRIGATE_TRAFFIC.convoyChance?'caravan':false;
}
export function convoyTraffic(owner,rng){return owner==='independents'&&rng()<CORVETTE_TRAFFIC.convoyChance;}
export function raidCorvette(region,rng){return (region.piratePressure??1)>0&&careerRaidTier(region)>=CORVETTE_TRAFFIC.minRaidTier&&rng()<CORVETTE_TRAFFIC.raidChance;}

// The original Tacita carried a centre engine and one ventral PDC. Carry its
// damage to the surviving systems and both replacement defence mounts.
export function restorePicketMounts(values,layout) {
    return layout===2?values:[...values.slice(0,4),values[5],values[6],values[7],values[7]];
}

export function currentRookeryBay(node) {
    return node==='bay_port'||node==='bay_starboard'?node+'_1':node;
}

export function restoreRookeryBays(ship) {
    if(ship.variant!=='rookery'||ship.capitalMountHull?.length!==13)return;
    const old=ship.capitalMountHull;
    // The old side assembly was one damage pool. Carry its condition across
    // both new berths on that side while preserving damage to the other systems.
    ship.capitalMountHull=[...old.slice(0,11),...rookeryBays.map(({bearing})=>{
        const side=bearing<0?0:1;
        return (ship.missingPods&(1<<side))?0:rookeryBayHull*old[11+side]/oldRookeryBayHull;
    })];
    ship.missingPods=0;
    const turrets=ship.combatFit?.turrets;
    if(turrets?.length===13)turrets.push(null,null);
}
