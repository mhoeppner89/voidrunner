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
    drover:{shield:300,hull:900,speed:25,role:'trader',faction:'independents',mounts:[bridge,dorsal,seat('mount_laser_ventral','laser','VENTRAL LASER',[0,-3.36,-2.45614],down),generator,...engines,...pods],
        readout:'TURRETS {turrets}/3 · PODS {pods}/6'},
    ironjaw:{shield:200,hull:1200,speed:30,role:'escort',faction:'pirates',mounts:[bridge,dorsal,...broadsides,generator,...engines,booster],
        readout:'GUNS {guns}/2 · TURRETS {turrets}/2'}
};

export const CORVETTE_TRAFFIC={convoyChance:.15,raidChance:.15,minRaidTier:2};
export function convoyTraffic(owner,rng){return owner==='independents'&&rng()<CORVETTE_TRAFFIC.convoyChance;}
export function raidCorvette(region,rng){return careerRaidTier(region)>=CORVETTE_TRAFFIC.minRaidTier&&rng()<CORVETTE_TRAFFIC.raidChance;}
