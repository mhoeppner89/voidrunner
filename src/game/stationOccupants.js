import * as THREE from 'three';
import {loadGlb} from './glbLoader.js';
import {applyShipLivery,stationShipFaction,SHIP_LIVERIES} from './shipLivery.js';

// Coordinates use the Blender station author's frame (Z up, front -Y).
// Ships remain separate reusable assets, rather than duplicated into station GLBs.
export const STATION_OCCUPANTS = {
  "helix": {
    "radius": 84.42890708589043,
    "ships": [
      {
        "hull": "atlas",
        "at": [
          -5,
          -28.2,
          -13.5
        ],
        "size": [
          2,
          1.5,
          3
        ]
      },
      {
        "hull": "wayfarer",
        "at": [
          5,
          -28.2,
          -13.5
        ],
        "size": [
          2,
          1.5,
          3
        ]
      }
    ]
  },
  "rook": {
    "radius": 66.17620712925944,
    "ships": [
      {
        "hull": "vanguard",
        "at": [
          -2.8,
          -24.2,
          -11
        ],
        "size": [
          2,
          1.5,
          3
        ]
      },
      {
        "hull": "lancer",
        "at": [
          2.8,
          -24.2,
          -11
        ],
        "size": [
          2,
          1.5,
          3
        ]
      },
      {
        "id": "rook-port-frigate",
        "hull": "concord-frigate",
        "capital": true,
        "moored": true,
        "at": [
          -30,
          13,
          -37.5
        ],
        "size": [
          23,
          21,
          76
        ],
        "roll": 3.141592653589793,
        "dockPort": [
          -30,
          13,
          -26.7
        ],
        "outward": [
          0,
          0,
          -1
        ]
      },
      {
        "id": "rook-starboard-frigate",
        "hull": "concord-frigate",
        "capital": true,
        "moored": true,
        "at": [
          30,
          13,
          -37.5
        ],
        "size": [
          23,
          21,
          76
        ],
        "roll": 3.141592653589793,
        "dockPort": [
          30,
          13,
          -26.7
        ],
        "outward": [
          0,
          0,
          -1
        ]
      }
    ]
  },
  "cairn": {
    "radius": 43.812098785609436,
    "ships": [
      {
        "hull": "prospector",
        "at": [
          -9,
          -23.2,
          -11
        ],
        "size": [
          2,
          1.5,
          3
        ]
      },
      {
        "hull": "talon",
        "at": [
          9,
          -23.2,
          -11
        ],
        "size": [
          2,
          1.5,
          3
        ]
      }
    ]
  },
  "argent": {
    "radius": 76.72142364228878,
    "ships": [
      {
        "hull": "lancer",
        "at": [
          -5,
          -60.2,
          0
        ],
        "size": [
          2,
          1.5,
          3
        ]
      },
      {
        "hull": "atlas",
        "at": [
          5,
          -60.2,
          0
        ],
        "size": [
          2,
          1.5,
          3
        ]
      },
      {
        "hull": "concord-frigate",
        "capital": true,
        "deck": -19.5,
        "keel": 18,
        "at": [
          0,
          0,
          -15
        ],
        "size": [
          23,
          21,
          76
        ]
      }
    ]
  },
  "blackglass": {
    "radius": 62.13694553162394,
    "ships": [
      {
        "hull": "demon",
        "at": [
          -7,
          -19.2,
          -12
        ],
        "size": [
          2,
          1.5,
          3
        ]
      },
      {
        "hull": "scrapper",
        "at": [
          7,
          -19.2,
          -12
        ],
        "size": [
          2,
          1.5,
          3
        ]
      }
    ]
  },
  "cinder": {
    "radius": 67.62396025078685,
    "ships": [
      {
        "hull": "atlas",
        "at": [
          -10,
          -24.2,
          -21
        ],
        "size": [
          2,
          1.5,
          3
        ]
      },
      {
        "hull": "prospector",
        "at": [
          11,
          -24.2,
          -21
        ],
        "size": [
          2,
          1.5,
          3
        ]
      }
    ]
  },
  "torchwell": {
    "radius": 56.588608523483096,
    "ships": [
      {
        "hull": "prospector",
        "at": [
          -10,
          -16.2,
          -10
        ],
        "size": [
          2,
          1.5,
          3
        ]
      },
      {
        "hull": "wayfarer",
        "at": [
          18,
          -16.2,
          -10
        ],
        "size": [
          2,
          1.5,
          3
        ]
      }
    ]
  },
  "nacre": {
    "radius": 69.19421949553792,
    "ships": [
      {
        "hull": "talon",
        "at": [
          -6,
          -53.2,
          -12
        ],
        "size": [
          2,
          1.5,
          3
        ]
      },
      {
        "hull": "lancer",
        "at": [
          6,
          -53.2,
          -12
        ],
        "size": [
          2,
          1.5,
          3
        ]
      }
    ]
  },
  "shepherd": {
    "radius": 73.45663382096357,
    "ships": [
      {
        "hull": "wayfarer",
        "at": [
          -9,
          -14.2,
          -14
        ],
        "size": [
          2,
          1.5,
          3
        ]
      },
      {
        "hull": "talon",
        "at": [
          9,
          -14.2,
          -14
        ],
        "size": [
          2,
          1.5,
          3
        ]
      }
    ]
  },
  "haven": {
    "radius": 53.369191767187296,
    "ships": [
      {
        "hull": "andromeda",
        "at": [
          -6,
          -17.2,
          -11
        ],
        "size": [
          2,
          1.5,
          3
        ]
      },
      {
        "hull": "speedster",
        "at": [
          6,
          -17.2,
          -11
        ],
        "size": [
          2,
          1.5,
          3
        ]
      }
    ]
  },
  "league-yard": {
    "radius": 87.61906180075616,
    "ships": [
      {
        "hull": "speedster",
        "at": [
          -8,
          -71.2,
          -14
        ],
        "size": [
          2,
          1.5,
          3
        ]
      },
      {
        "hull": "astra",
        "at": [
          8,
          -71.2,
          -14
        ],
        "size": [
          2,
          1.5,
          3
        ]
      },
      {
        "hull": "concord-cruiser",
        "capital": true,
        "deck": -14.5,
        "keel": 14,
        "at": [
          0,
          -2,
          -11
        ],
        "size": [
          24,
          34,
          82
        ]
      }
    ]
  },
  "cinderfall": {
    "radius": 56.65351361979899,
    "ships": [
      {
        "hull": "prospector",
        "at": [
          -6,
          -17.2,
          -19
        ],
        "size": [
          2,
          1.5,
          3
        ]
      },
      {
        "hull": "atlas",
        "at": [
          6,
          -17.2,
          -19
        ],
        "size": [
          2,
          1.5,
          3
        ]
      }
    ]
  },
  "gatehouse-twelve": {
    "radius": 49.874241873349874,
    "ships": [
      {
        "hull": "atlas",
        "at": [
          -7,
          -27.2,
          -12.5
        ],
        "size": [
          2,
          1.5,
          3
        ]
      },
      {
        "hull": "vanguard",
        "at": [
          7,
          -27.2,
          -12.5
        ],
        "size": [
          2,
          1.5,
          3
        ]
      }
    ]
  }
};
export async function addStationOccupants(station, id, load = loadGlb, shipScale = null) {
    const spec=STATION_OCCUPANTS[id];
    if(!spec)return;
    const group=new THREE.Group();group.name='station-docked-ships';
    group.scale.setScalar(100/spec.radius);
    const steel=new THREE.MeshStandardMaterial({color:id==='rook'?SHIP_LIVERIES.concord.main:0x34434b,roughness:.7,metalness:.5});
    const gold=new THREE.MeshStandardMaterial({color:id==='rook'?SHIP_LIVERIES.concord.accent:0xa98030,roughness:.65,metalness:.3});
    const light=new THREE.MeshStandardMaterial({color:0xbce8ec,emissive:0x83c8d5,emissiveIntensity:.8});
    const fixtures=new Map();
    const box=(name,position,size,material)=>{
        const parts=fixtures.get(material)??[];fixtures.set(material,parts);parts.push({name,position,size});
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
        model.scale.setScalar(scale);
        // Roll after sizing: the same real hull keeps its scale at an inverted berth.
        if(item.roll)model.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),item.roll));
        model.updateMatrixWorld(true);
        bounds=new THREE.Box3().setFromObject(model);size=bounds.getSize(new THREE.Vector3());
        const center=bounds.getCenter(new THREE.Vector3()),[x,y,z]=item.at;
        const lift=item.capital?2:shipScale?Math.min(.45,scale*.05):.45;
        model.position.set(x-center.x,z-(item.moored?center.y:bounds.min.y-lift),-y-center.z);
        model.name=`berthed-${item.id??item.hull}`;model.userData.stationOccupant=true;model.userData.stationBerth=item;group.add(model);
        if(item.moored){
            // Outside berths use sealed telescopic gangways, not a shipyard
            // floor or free-floating maintenance cradles. Fit their end to an
            // actual hull intersection so model silhouettes remain untouched.
            const [px,py,pz]=item.dockPort,port=new THREE.Vector3(px,pz,-py),out=new THREE.Vector3(item.outward[0],item.outward[2],-item.outward[1]);
            group.updateMatrixWorld(true);
            const hit=new THREE.Raycaster(port.clone().applyMatrix4(group.matrixWorld),out.clone().transformDirection(group.matrixWorld),0,30*group.scale.x).intersectObject(model,true)[0];
            if(!hit)throw Error(`Capital berth ${item.id} does not meet its ship`);
            const end=group.worldToLocal(hit.point.clone()),length=end.distanceTo(port),mid=port.clone().lerp(end,.5);
            const axis=Math.abs(out.x)>.5?0:Math.abs(out.y)>.5?1:2;
            const section=(along,across)=>{const size=[across,across,across];size[axis]=along;return size;};
            box('Sealed capital docking gangway',mid.toArray(),section(length+.24,2.3),steel);
            const ribs=length<3?1:4;
            for(let step=0;step<=ribs;step++){
                const point=port.clone().lerp(end,step/ribs);
                box('Capital gangway pressure rib',point.toArray(),section(.18,2.65),gold);
            }
            box('Capital hull docking seal',end.toArray(),section(.32,3.1),steel);
            model.userData.dockingContact={port:port.toArray(),end:end.toArray(),length};
            continue;
        }
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
    // Cradles and gantries are static, untextured boxes with three finishes.
    // One unit box per finish keeps their exact dimensions and shading while
    // replacing up to 42 separate geometry buffers and draw calls.
    const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion();
    for(const [material,parts]of fixtures){
        const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(),material,parts.length);
        mesh.name='Dock service fixtures';mesh.userData.fixtures=parts;
        for(let i=0;i<parts.length;i++)mesh.setMatrixAt(i,matrix.compose(position.fromArray(parts[i].position),rotation,scale.fromArray(parts[i].size)));
        mesh.computeBoundingBox();mesh.computeBoundingSphere();group.add(mesh);
    }
    group.updateMatrixWorld(true);station.add(group);
    return group;
}
