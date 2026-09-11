// Original deck anchors, retained behind the canopy. Forward mounts may
// depress by up to 10 degrees when the baked model clearance permits it.
export const TURRET_LAYOUTS = {
    wayfarer:[{size:'S',position:[0,1.12,0.15],side:1,forwardCone:10,label:'TOP TURRET'}],
    talon:[],
    vanguard:[{size:'S',position:[0,1.12,0.1],side:1,forwardCone:10,label:'TOP TURRET'},{size:'S',position:[0,-1.12,0.1],side:-1,forwardCone:10,label:'LOWER TURRET'}],
    prospector:[{size:'S',position:[0,1.12,0.5],side:1,label:'REAR TOP TURRET'}],
    lancer:[{size:'M',position:[0,1.12,0.2],side:1,forwardCone:10,label:'TOP TURRET'}],
    atlas:[{size:'S',position:[0,1.12,0.55],side:1,label:'REAR TOP TURRET'},{size:'S',position:[0,-1.12,-0.55],side:-1,forwardCone:10,label:'FORWARD LOWER TURRET'}],
};
