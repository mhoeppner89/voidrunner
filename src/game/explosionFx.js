import * as THREE from 'three';
import { seededRandom } from './random.js';
import { createStreakBurst, createShockRing } from './impactFx.js';

// Explosion variants. All are GPU-driven batched draws: one instanced
// fireball/smoke cloud (secondary blasts are extra instances with a delay and
// an offset, not extra draws), one spark-streak burst, one burning-debris
// burst and a shock ring. No per-frame particle allocations, dynamic lights or
// postprocessing passes.
//   fireball — the classic: flash, rolling fire, smoke.
//   chain    — a chain reaction: two or more secondaries cook off across the hull.
//   breach   — an energy core breach: blue-white core flash and a wide shock
//              ring in a random plane.
//   breakup  — the hull snaps in two: blasts at both ends along one axis.
export const EXPLOSION_VARIANTS = ['fireball', 'chain', 'breach', 'breakup'];
// Heft: big things come apart slowly. A fighter's break-up stays violent
// (heft 1); heavier hulls shed speed and tumble steeply with size, so a
// frigate's pieces drift apart instead of flying like a fighter's scaled up.
export function blastHeft(size, reference, power) {
    return Math.min(1, Math.max(.02, (reference / Math.max(size, 1e-3)) ** power));
}
// Fighter explosions run at scale 1.6 (NPC_FIGHTER_SCALE).
const FIGHTER_BLAST = 1.6, FIGHTER_SHARDS = FIGHTER_BLAST * .65;
export function createShipExplosion(position, scale = 1, { velocity, variant, seed, capital: capitalPace = 0 } = {}) {
    const random = seededRandom(seed ?? position.join(':') + ':blast');
    const flak = variant === 'flak';
    const kind = flak ? 'flak' : EXPLOSION_VARIANTS.includes(variant) ? variant : EXPLOSION_VARIANTS[Math.floor(random() * EXPLOSION_VARIANTS.length)];
    const root = new THREE.Group();
    root.position.fromArray(position);
    root.scale.setScalar(Math.max(.1, scale));
    const time = { value: 0 };
    // Capital destruction takes longer, with secondary hull sections igniting
    // after the first flash. Small ship timing stays unchanged.
    // Big ships pass their own pace (corvette .5, frigate .75, larger 1).
    const capital = flak ? 0 : Math.max(capitalPace, Math.min(1, (scale - 3) / 9), 0);
    const pace = { value: 1 + capital * 1.8 };
    const delay = capital * 3;
    // Blast centres: [x, y, z, start]. Secondaries scale with the hull.
    const axis = new THREE.Vector3(random() * 2 - 1, (random() * 2 - 1) * .4, random() * 2 - 1).normalize();
    const centres = [[0, 0, 0, 0]];
    if (kind === 'chain') {
        const count = 2 + Math.round(capital * 3);
        for (let i = 0; i < count; i++) {
            const z = random() * 2 - 1, a = random() * Math.PI * 2, r = Math.sqrt(1 - z * z), reach = 1.6 + random() * 1.6;
            centres.push([Math.cos(a) * r * reach, z * reach * .6, Math.sin(a) * r * reach, .2 + i * (.2 + random() * .14) + capital * i * .4]);
        }
    }
    if (kind === 'breakup') centres.push([axis.x * 3.6, axis.y * 3.6, axis.z * 3.6, .1], [-axis.x * 3.3, -axis.y * 3.3, -axis.z * 3.3, .38]);
    const perCentre = kind === 'fireball' || kind === 'breach' ? 14 : 9;
    const count = centres.length * perCentre;
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0, 1,-1,0, 1,1,0, -1,1,0], 3));
    const drift = new Float32Array(count * 3), params = new Float32Array(count * 3), offsets = new Float32Array(count * 3);
    let index = 0;
    for (const [cx, cy, cz, start] of centres) {
        const secondary = start > 0, size = secondary ? .7 : 1;
        for (let i = 0; i < perCentre; i++, index++) {
            const z = random() * 2 - 1, a = random() * Math.PI * 2, r = Math.sqrt(1 - z * z);
            drift.set([Math.cos(a) * r, Math.sin(a) * r, z], index * 3);
            offsets.set([cx, cy, cz], index * 3);
            // params: spread (0 marks the centre's flash), noise seed, start time.
            params.set(i === 0 ? [0, size, start + delay * (secondary ? 1 : 0)] : [(1.8 + random() * 2) * size, random() * 19, start + random() * (.14 + delay)], index * 3);
        }
    }
    geometry.setAttribute('drift', new THREE.InstancedBufferAttribute(drift, 3));
    geometry.setAttribute('params', new THREE.InstancedBufferAttribute(params, 3));
    geometry.setAttribute('offset', new THREE.InstancedBufferAttribute(offsets, 3));
    geometry.instanceCount = count;
    // Breach burns hotter and whiter, with thin smoke; chains leave more soot.
    const heat = { value: kind === 'breach' ? .35 : 0 }, soot = { value: kind === 'chain' || kind === 'breakup' ? 1.25 : 1 };
    const flashTint = { value: new THREE.Color(kind === 'breach' ? 0xcfe8ff : 0xffe3a6) };
    const material = new THREE.ShaderMaterial({
        uniforms: { time, pace, heat, soot, flashTint, flak: {value:Number(flak)} }, transparent: true, depthWrite: false,
        vertexShader: `
            attribute vec3 drift; attribute vec3 params; attribute vec3 offset; uniform float time; uniform float pace; uniform float flak;
            varying vec2 blastUv; varying float age; varying float seed; varying float flash; varying float visibility;
            void main() {
                blastUv=position.xy; age=max(0.,(time-params.z)/pace); seed=params.y;
                flash=1.-step(.1,params.x);
                if(flash>.5) age=max(0.,time-params.z);
                float started=step(params.z,time);
                float spread=1.-exp(-age*2.2);
                vec3 centre=offset+drift*params.x*spread*2.2;
                vec4 view=modelViewMatrix*vec4(centre,1.);
                float radius=mix((.65+spread*2.8)*(0.85+params.x*.12), (2.+age*32.)*params.y, flash)*started;
                float worldScale=length(modelMatrix[0].xyz);
                visibility=1.;
                if(flak>.5){
                    vec4 origin=modelViewMatrix[3];
                    float depth=max(0.,-origin.z);
                    float focal=max(projectionMatrix[0][0],projectionMatrix[1][1]);
                    // The fire reaches 30 units; the cooling smoke expands to 56.
                    // Keep the angular cap throughout both phases.
                    float cooling=smoothstep(.4,1.8,age);
                    float extent=mix(30.,56.,cooling);
                    float shrink=min(1.,.12*depth/(extent*focal));
                    if(flash>.5){
                        radius=min(28.+12.*clamp(age/.12,0.,1.),.1*depth/focal);
                        view=origin;
                    }else{
                        float bloom=1.-exp(-age*16.);
                        float driftRadius=(.28+.07*params.x)*extent*bloom;
                        view=origin;
                        view.xyz+=mat3(modelViewMatrix)*drift*(driftRadius*shrink/worldScale);
                        radius=extent*(.20+.25*bloom)*shrink*started;
                        visibility=smoothstep(15.,60.,depth);
                    }
                }else radius*=worldScale;
                view.xy+=position.xy*radius;
                gl_Position=projectionMatrix*view;
            }`,
        fragmentShader: `
            precision highp float;
            uniform float heat; uniform float soot; uniform float flak; uniform vec3 flashTint;
            varying vec2 blastUv; varying float age; varying float seed; varying float flash; varying float visibility;
            float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
            float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
                return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
            void main(){
                float r=length(blastUv);
                if(r>1.) discard;
                if(flash>.5){
                    float a=exp(-r*r*5.)*max(0.,1.-age/mix(.22,.1,flak));
                    vec3 tint=flashTint;
                    if(flak>.5){
                        tint=mix(vec3(1.,.14,.012),vec3(1.,.78,.44),1.-smoothstep(.08,.55,r));
                        a*=1.-smoothstep(.55,1.,r);
                    }
                    gl_FragColor=vec4(tint,a); return;
                }
                vec2 p=blastUv*3.8+seed;
                float n=noise(p+age*.23)*.6+noise(p*2.1-age*.31)*.28+noise(p*4.3)*.12;
                float density=smoothstep(.02,.55,1.-r+(n-.5)*.65);
                float h=clamp(1.3+heat-age*.9/soot+(n-.5)*1.3-r*.3,0.,1.);
                vec3 smoke=vec3(.14,.12,.105)*(0.8+n*.7)/soot;
                vec3 fire=mix(vec3(.62,.075,.009),vec3(1.,.48,.055),smoothstep(.1,.65,h));
                fire=mix(fire,mix(vec3(1.,.94,.69),vec3(.86,.94,1.),heat*2.),smoothstep(.7,1.,h));
                vec3 color=mix(smoke,fire,smoothstep(.12,.55,h));
                if(flak>.5){
                    vec3 charcoal=vec3(.015,.010,.007)*(.6+n);
                    float tongue=1.-smoothstep(.28,.9,r+(n-.5)*.9);
                    float flame=(1.-smoothstep(.13,.48,age))*tongue;
                    vec3 hot=mix(vec3(.68,.055,.008),vec3(1.,.42,.035),n);
                    color=mix(charcoal,hot,flame);
                }
                float fade=(1.-smoothstep(mix(1.3,2.,flak)*soot,mix(2.5,4.,flak)*soot,age))*smoothstep(0.,.08,age);
                gl_FragColor=vec4(color,density*fade*.86*visibility);
            }`,
    });
    const cloud = new THREE.Mesh(geometry, material);
    cloud.frustumCulled = false; cloud.raycast = () => undefined;
    root.add(cloud);
    // Hot sparks, then a few long-burning chunks trailing fire. Both live in
    // the root's scaled frame; heft keeps a frigate's from flying a fighter's
    // pattern scaled up.
    const heft = blastHeft(scale, FIGHTER_BLAST, .75);
    const parts = [
        createStreakBurst({ count: flak ? 36 : kind === 'breach' ? 48 : 40, speedMin: (flak ? 45 : 18) * heft, speedMax: (flak ? 115 : 58) * heft, drag: 1.4, lifeMin: .45 * pace.value, lifeMax: 1.1 * pace.value, width: flak ? .08 : .15, lag: flak ? .035 : .06, nearClip: flak ? 15 : 0,
            hot: flak ? 0xffa148 : 0xfffbe8, cool: kind === 'breach' ? 0x5aa8ff : 0xff6a1e, random, delay: flak ? .07 : (i) => centres[i % centres.length][3] }),
    ];
    if(!flak)parts.push(
        createStreakBurst({ count: kind === 'breakup' ? 12 : 8, direction: kind === 'breakup' ? (i, out, rnd) => out.copy(axis).multiplyScalar(i % 2 ? 1 : -1).add(new THREE.Vector3(rnd() - .5, rnd() - .5, rnd() - .5).multiplyScalar(.9)) : undefined,
            speedMin: 8 * heft, speedMax: 20 * heft, drag: .5, lifeMin: 1.6 * pace.value, lifeMax: 2.6 * pace.value, width: .34, lag: .35, hot: 0xffd27a, cool: 0xc02a08, random }),
        createShockRing({ radius: kind === 'breach' ? 9 : 4.5, life: kind === 'breach' ? .55 : .32, hex: kind === 'breach' ? 0xbfe2ff : 0xffd9a0, opacity: kind === 'breach' ? .8 : .45, thickness: kind === 'breach' ? .12 : .22,
            normal: kind === 'breach' ? [axis.x, axis.y + .6, axis.z] : undefined }),
    );
    for (const part of parts) root.add(part.object);
    const duration = Math.max((flak ? 4.1 : 2.65) * pace.value + delay + Math.max(...centres.map((c) => c[3])), ...parts.map((part) => part.life));
    // The blast keeps the dying ship's momentum and slowly sheds it.
    const momentum = velocity ? new THREE.Vector3().fromArray(velocity) : undefined;
    return {
        object: root, life: duration, maxLife: duration, variant: kind,
        update(dt) {
            time.value += dt;
            for (const part of parts) part.update(dt);
            // A followed wreck already carries the momentum (renderer followObject).
            if (momentum && !this.followObject) { root.position.addScaledVector(momentum, dt); momentum.multiplyScalar(Math.exp(-.45 * dt)); }
        },
        dispose() { root.removeFromParent(); geometry.dispose(); material.dispose(); for (const part of parts) part.dispose(); },
    };
}

// Actual opaque armor shards, separate from the short-lived glowing trails.
// calm (0–1): big ships shed their plates more slowly (user request).
export function createHullDebris(position, scale = 1, velocity = [0,0,0], calm = 0) {
    const random=seededRandom(position.join(':')+':hull-shards');
    const root=new THREE.Group();root.position.fromArray(position);
    const inheritedVelocity=new THREE.Vector3().fromArray(velocity);
    // Torn, bent armour rather than identical rectangular bricks. Two skins
    // and a ragged perimeter give the plates thickness from every direction.
    const rim=[[-.5,-.3],[-.24,-.52],[.38,-.4],[.5,.08],[.18,.5],[-.4,.34]],vertices=[],indices=[];
    for(const side of [-1,1])for(const [x,z]of rim)vertices.push(x,side*.18+(x>0?.5:-.15)*z,z);
    for(let i=1;i<rim.length-1;i++){indices.push(0,i,i+1,6,6+i+1,6+i);}
    for(let i=0;i<rim.length;i++){const j=(i+1)%rim.length;indices.push(i,6+j,j,i,6+i,6+j);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const material=new THREE.MeshStandardMaterial({color:0xb1a89c,roughness:.87,metalness:.5,flatShading:true});
    // Many small flecks, few big plates. Equal blast energy per fragment
    // means speed falls with mass (v ∝ 1/√m ∝ size^-1.5, softened here):
    // flecks fly and tumble several times faster than the big plates.
    const COUNT=36;
    const chunks=new THREE.InstancedMesh(geometry,material,COUNT);
    chunks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);chunks.frustumCulled=false;
    chunks.raycast=()=>undefined;root.add(chunks);
    const parts=[],matrix=new THREE.Object3D(),color=new THREE.Color();
    // Heavier hulls throw their plates out slower and tumble them less.
    const heft=blastHeft(scale,FIGHTER_SHARDS,1.25)*(1-.45*calm),turn=Math.sqrt(heft);
    for(let i=0;i<COUNT;i++) {
        const z=random()*2-1,a=random()*Math.PI*2,r=Math.sqrt(1-z*z),mass=.22+random()**2.4*.9;
        const speed=(4+random()*5)*Math.min(5,(.7/mass)**1.25)*scale*heft,tumble=Math.min(6,.8/mass)*(1+random()*1.5)*turn;
        parts.push({velocity:[Math.cos(a)*r*speed,Math.sin(a)*r*speed,z*speed],
            size:[(.4+random()*.5)*mass*1.6*scale,(.08+random()*.14)*Math.sqrt(mass)*scale,(.35+random()*.5)*mass*1.6*scale],
            spin:[(random()*2-1)*tumble,(random()*2-1)*tumble,(random()*2-1)*tumble]});
        color.setHex(i%3===0?0x7c4a27:i%3===1?0x687580:0xc1b69d);chunks.setColorAt(i,color);
    }
    let age=0;
    const effect={object:root,life:14,maxLife:14,update(dt){
        age+=dt;root.position.addScaledVector(inheritedVelocity,dt);const fade=Math.min(1,Math.max(0,(14-age)/3));
        for(let i=0;i<parts.length;i++) {const p=parts[i];
            matrix.position.set(p.velocity[0]*age,p.velocity[1]*age,p.velocity[2]*age);
            matrix.rotation.set(p.spin[0]*age,p.spin[1]*age,p.spin[2]*age);
            matrix.scale.set(p.size[0]*fade,p.size[1]*fade,p.size[2]*fade);matrix.updateMatrix();chunks.setMatrixAt(i,matrix.matrix);
        }chunks.instanceMatrix.needsUpdate=true;
    }};effect.update(0);return effect;
}
