import * as THREE from 'three';
import {loadGlb} from './glbLoader.js';
import {applyShipLivery,stationShipFaction} from './shipLivery.js';

// Coordinates use the Blender station author's frame (Z up, front -Y).
// Ships remain separate reusable assets, rather than duplicated into station GLBs.
export const STATION_OCCUPANTS = {
  "league-yard": {
    "radius": 90.29042090621726,
    "ships": [
      {
        "hull": "concord-cruiser",
        "capital": true,
        "deck": -3.32,
        "keel": 14,
        "at": [
          0,
          4,
          0
        ],
        "size": [
          24,
          34,
          82
        ]
      },
      {
        "hull": "speedster",
        "at": [
          -34,
          -72,
          -7.14
        ],
        "size": [
          5,
          3,
          10
        ]
      },
      {
        "hull": "astra",
        "at": [
          34,
          -72,
          -7.14
        ],
        "size": [
          5,
          3,
          10
        ]
      },
      {
        "hull": "legionary",
        "at": [
          -7,
          -46,
          -3.32
        ],
        "size": [
          10,
          5,
          14
        ],
        "heading": 0,
        "berth": true
      },
      {
        "hull": "torsas",
        "at": [
          7,
          -46,
          -3.32
        ],
        "size": [
          10,
          5,
          14
        ],
        "heading": 0,
        "berth": true
      }
    ]
  },
  "argent": {
    "radius": 94.69084023605122,
    "ships": [
      {
        "hull": "concord-frigate",
        "capital": true,
        "deck": -13,
        "keel": 18,
        "at": [
          0,
          0,
          -9
        ],
        "size": [
          23,
          21,
          76
        ]
      },
      {
        "hull": "lancer",
        "at": [
          0,
          -84,
          -3.64
        ],
        "size": [
          11,
          5,
          13
        ]
      }
    ]
  },
  "helix": {
    "radius": 86.00093022759303,
    "ships": [
      {
        "hull": "atlas",
        "at": [
          -5,
          -63,
          -15.64
        ],
        "size": [
          8,
          5,
          12
        ]
      },
      {
        "hull": "wayfarer",
        "at": [
          6,
          -61,
          -15.64
        ],
        "size": [
          8,
          5,
          11
        ]
      }
    ]
  },
  "rook": {
    "radius": 76.42587219279665,
    "ships": [
      {
        "hull": "vanguard",
        "at": [
          -17,
          -40,
          -9.64
        ],
        "size": [
          12,
          5,
          12
        ]
      },
      {
        "hull": "lancer",
        "at": [
          17,
          -40,
          -9.64
        ],
        "size": [
          11,
          5,
          12
        ]
      }
    ]
  },
  "cairn": {
    "radius": 54.88516384531569,
    "ships": [
      {
        "hull": "wayfarer",
        "at": [
          -11,
          -26,
          -8.49
        ],
        "size": [
          12,
          6,
          18
        ]
      },
      {
        "hull": "prospector",
        "at": [
          12,
          18,
          -7.14
        ],
        "size": [
          10,
          5,
          12
        ]
      },
      {
        "hull": "talon",
        "at": [
          12,
          -23,
          -8.49
        ],
        "size": [
          11,
          5,
          13
        ]
      }
    ]
  },
  "gatehouse-twelve": {
    "radius": 63.853764118794686,
    "ships": [
      {
        "hull": "atlas",
        "at": [
          -19,
          5,
          -9.14
        ],
        "size": [
          12,
          6,
          15
        ]
      },
      {
        "hull": "vanguard",
        "at": [
          17,
          14,
          -9.14
        ],
        "size": [
          10,
          5,
          12
        ]
      },
      {
        "hull": "wayfarer",
        "at": [
          0,
          -26,
          -9.18
        ],
        "size": [
          10,
          5,
          14
        ]
      }
    ]
  },
  "blackglass": {
    "radius": 71.43039350964938,
    "ships": [
      {
        "hull": "talon",
        "at": [
          -6,
          -40,
          -13.49
        ],
        "size": [
          12,
          5,
          14
        ]
      },
      {
        "hull": "wayfarer",
        "at": [
          -24,
          -17,
          -11.94
        ],
        "size": [
          8,
          4,
          11
        ]
      },
      {
        "hull": "lancer",
        "at": [
          24,
          -17,
          -11.94
        ],
        "size": [
          8,
          4,
          11
        ]
      }
    ]
  },
  "cinder": {
    "radius": 87.15067406643723,
    "ships": [
      {
        "hull": "atlas",
        "at": [
          -10,
          -36,
          -18.49
        ],
        "size": [
          14,
          7,
          20
        ]
      },
      {
        "hull": "prospector",
        "at": [
          23,
          0,
          -16.14
        ],
        "size": [
          9,
          5,
          12
        ]
      }
    ]
  },
  "torchwell": {
    "radius": 63.324560795950255,
    "ships": [
      {
        "hull": "prospector",
        "at": [
          -10,
          -29,
          -13.49
        ],
        "size": [
          12,
          6,
          17
        ]
      },
      {
        "hull": "wayfarer",
        "at": [
          12,
          0,
          -10.64
        ],
        "size": [
          10,
          5,
          10
        ]
      }
    ]
  },
  "nacre": {
    "radius": 61.055361155712546,
    "ships": [
      {
        "hull": "lancer",
        "at": [
          -7,
          -43,
          -5.96
        ],
        "size": [
          11,
          5,
          14
        ]
      },
      {
        "hull": "talon",
        "at": [
          12,
          -43,
          -5.96
        ],
        "size": [
          10,
          5,
          12
        ]
      }
    ]
  },
  "shepherd": {
    "radius": 73.57554812808827,
    "ships": [
      {
        "hull": "wayfarer",
        "at": [
          -9,
          -30,
          -13.49
        ],
        "size": [
          12,
          6,
          16
        ]
      },
      {
        "hull": "talon",
        "at": [
          10,
          -25,
          -13.49
        ],
        "size": [
          10,
          5,
          12
        ]
      }
    ]
  },
  "haven": {
    "radius": 81.0009876483696,
    "ships": [
      {
        "hull": "andromeda",
        "at": [
          -5,
          -46,
          -8.14
        ],
        "size": [
          8,
          4,
          12
        ]
      },
      {
        "hull": "speedster",
        "at": [
          6,
          -45,
          -8.14
        ],
        "size": [
          7,
          4,
          11
        ]
      },
      {
        "hull": "legionary",
        "at": [
          43,
          0,
          7.5
        ],
        "size": [
          10,
          4.5,
          8
        ],
        "heading": 1.5707963267948966,
        "berth": true
      },
      {
        "hull": "astra",
        "at": [
          -43,
          0,
          7.5
        ],
        "size": [
          10,
          4.5,
          8
        ],
        "heading": -1.5707963267948966,
        "berth": true
      }
    ]
  },
  "cinderfall": {
    "radius": 75.00106665915709,
    "ships": [
      {
        "hull": "torsas",
        "at": [
          0,
          -37,
          -8.14
        ],
        "size": [
          9,
          4,
          12
        ]
      },
      {
        "hull": "astra",
        "at": [
          -31,
          -18,
          -13.5
        ],
        "size": [
          7,
          4,
          9
        ],
        "heading": 0,
        "berth": true
      },
      {
        "hull": "speedster",
        "at": [
          31,
          -18,
          -13.5
        ],
        "size": [
          7,
          4,
          9
        ],
        "heading": 0,
        "berth": true
      }
    ]
  }
};
export async function addStationOccupants(station, id, load = loadGlb, shipScale = null) {
    const spec=STATION_OCCUPANTS[id];
    if(!spec)return;
    const group=new THREE.Group();group.name='station-docked-ships';
    group.scale.setScalar(100/spec.radius);
    const steel=new THREE.MeshStandardMaterial({color:0x34434b,roughness:.7,metalness:.5});
    const gold=new THREE.MeshStandardMaterial({color:0xa98030,roughness:.65,metalness:.3});
    const light=new THREE.MeshStandardMaterial({color:0xbce8ec,emissive:0x83c8d5,emissiveIntensity:.8});
    const box=(name,position,size,material)=>{
        const m=new THREE.Mesh(new THREE.BoxGeometry(...size),material);m.name=name;m.position.set(...position);group.add(m);return m;
    };
    const templates = new Map();
    for(const item of spec.ships){
        if(!templates.has(item.hull))templates.set(item.hull,await load(new URL(`../../assets/models/${item.capital?'capital':'ships'}/${item.hull}.glb`,import.meta.url).href));
        const model=templates.get(item.hull).clone(true);
        applyShipLivery(model,stationShipFaction(id,item.hull),item.hull);
        // Original ship assets point along X; face them out through the berth.
        const leagueHull=['astra','torsas','andromeda','legionary'].includes(item.hull);
        model.rotation.y=(item.capital||item.hull==='speedster'?Math.PI/2:leagueHull?0:-Math.PI/2)+(item.heading??0);
        model.updateMatrixWorld(true);
        let bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
        const scale=shipScale?.(item.hull) ?? Math.min(item.size[0]/size.x,item.size[1]/size.y,item.size[2]/size.z);
        model.scale.setScalar(scale);model.updateMatrixWorld(true);
        bounds=new THREE.Box3().setFromObject(model);size=bounds.getSize(new THREE.Vector3());
        const center=bounds.getCenter(new THREE.Vector3()),[x,y,z]=item.at;
        const lift=item.capital?2:shipScale?Math.min(.45,scale*.05):.45;
        model.position.set(x-center.x,z+lift-bounds.min.y,-y-center.z);
        model.name=`berthed-${item.hull}`;model.userData.stationOccupant=true;group.add(model);
        if(item.berth){
            for(const side of [-1,1]){
                box('Occupied berth side stripe',[x+side*(size.x/2+.4),z+.03,-y],[.09,.06,size.z+.8],gold);
                box('Occupied berth end stripe',[x,z+.03,-y+side*(size.z/2+.4)],[size.x+.8,.06,.09],gold);
            }
        }
        // A maintenance cradle carries the hull; no engines or free-flight AI.
        for(const end of [-1,1]){
            const zz=-y+end*size.z*.27;
            box('Keel service cradle',[x,z+lift*.45,zz],[item.capital?item.keel*2+2:size.x*.72,lift*.9,.55],steel);
            if(item.capital)for(const side of [-1,1])box('Dock cradle pier',[x+side*item.keel,(item.deck+z)/2,zz],[.8,z-item.deck,.8],steel);
            for(const side of [-1,1]){
                box('Cradle side support',[x+side*size.x*.3,z+lift*.9,zz],[.35,lift,.55],gold);
            }
        }
        if(item.capital){
            // Tool heads and service walkways frame the hull without piercing it.
            for(const side of [-1,1])for(const end of [-1,1]){
                const xx=x+side*(size.x/2+1.3),zz=-y+end*size.z*.25;
                const deckY=z+lift+size.y*.35;
                box('Service gantry pillar',[x+side*item.keel,(item.deck+deckY)/2,zz],[.45,deckY-item.deck,.45],steel);
                box('Service gantry crossarm',[(xx+x+side*item.keel)/2,deckY-.25,zz],[Math.abs(xx-x-side*item.keel)+.5,.5,.5],steel);
                box('Shipyard work platform',[xx,z+lift+size.y*.35,zz],[1.8,.35,6],steel);
                box('Shipyard tool pedestal',[xx,z+lift+size.y*.35+1,zz],[.45,1.8,.45],gold);
                box('Active repair light',[xx-side*.35,z+lift+size.y*.35+1.8,zz],[.18,.18,.5],light);
            }
        }
    }
    group.updateMatrixWorld(true);station.add(group);
    return group;
}
