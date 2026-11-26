import {careerRaidTier} from './careerDanger.js';

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
export const CORVETTES={
    drover:{name:'MV Njord',cargoHolds:6,shield:300,hull:900,speed:25,role:'trader',faction:'independents',mounts:[bridge,dorsal,seat('mount_laser_ventral','laser','VENTRAL LASER',[0,-3.36,-2.45614],down),generator,...engines,...pods],
        readout:'TURRETS {turrets}/3 · PODS {pods}/6'},
    ironjaw:{name:'Red Njord',shield:200,hull:1200,speed:30,role:'escort',faction:'pirates',mounts:[bridge,dorsal,...broadsides,generator,...engines,booster],
        readout:'GUNS {guns}/2 · TURRETS {turrets}/2'}
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
export const ROOKERY_LAUNCH={
    every:25,cap:8,mast:'mast',fighter:'scrapper',
    bays:[{subsystem:'bay_port',socket:'launch_port'},{subsystem:'bay_starboard',socket:'launch_starboard'}],
    sockets:Object.fromEntries([-1,1].map(side=>['launch_'+(side<0?'port':'starboard'),{
        game_position:[side*11.6578,-.07,-27.14],direction_game:[side*.26066583,0,-.96542901]}])),
};
export const TRAFFIC_HULLS={...CORVETTES,
    caravan:{name:'Brigid',capitalClass:'frigate',shield:500,hull:2000,speed:20,turn:.15,regen:10,cargoHolds:4,
        role:'trader',faction:'independents',dronePort:[0,7.81,-3.9],readout:'TURRETS {turrets}/4 · STACKS {stacks}/4',
        mounts:[...frigateSystems,seat('mount_laser_ventral','laser','VENTRAL LASER',[0,-5.85,-22],down),
            {node:'drone_hangar',kind:'hangar',label:'DRONE HANGAR',hull:160,normal:up,position:[0,7.81,-3.9],hitShape:'box',hitHalfExtents:[4.6,2.2,6.1],hitCenterOffset:[0,-2.7,1.9]},
            ...Array.from({length:4},(_,i)=>{const side=i%2?1:-1;return {node:'stack_'+i,kind:'stack',label:'CARGO STACK '+(i+1),hull:150,normal:[side,0,0],
                position:[side*15.85,0,i<2?-16:12],hitShape:'box',hitHalfExtents:[5.35,5.1,10.92],hitCenterOffset:[-side*5.35,-.18,0],partBit:1<<i};})]},
    rookery:{name:'Red Brigid',capitalClass:'frigate',shield:500,hull:2400,speed:20,turn:.15,regen:10,preferredRange:1200,launch:ROOKERY_LAUNCH,
        role:'escort',faction:'pirates',readout:'GUNS {guns}/2 · BAYS {bays}/2',mounts:[...frigateSystems,
            ...[-1,1].map((side,i)=>({...broadsides[i],node:'mount_broadside_'+(side<0?'port':'starboard'),position:[side*17.88,4.03,-2]})),
            {node:'mast',kind:'mast',label:'FLIGHT CONTROL',hull:120,normal:up,position:[0,13.36,-2],hitShape:'box',hitHalfExtents:[4.4,5.2,5.9],hitCenterOffset:[0,-5.2,0]},
            ...[-1,1].map((side,i)=>({node:'bay_'+(side<0?'port':'starboard'),kind:'bay',label:side<0?'PORT BAY':'STARBOARD BAY',hull:300,normal:[side,0,0],
                position:[side*19.95,0,-2],hitShape:'box',hitHalfExtents:[8,5.75,28.3],hitCenterOffset:[-side*8,.45,-3.15],partBit:1<<i,bearing:side}))]},
};
export const CORVETTE_TRAFFIC={convoyChance:.15,raidChance:.15,minRaidTier:2};
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
