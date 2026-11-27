// Laser FX (visual gauntlet overhaul) — bolts, muzzle flashes, impacts.
//
// Why this exists: at Voidrunner's world scale one internal-resolution pixel
// is ~3.8 world units at a 60-unit engagement range, so the old bare
// 0.16-radius capsule bolt was a sub-pixel speck. A bolt is now a hot core +
// a crossed additive glow pair (bold tracer read at range) + a hot head
// sprite, with layered impact flashes and spark bursts.
//
// Performance contract: every geometry/material/texture is created ONCE per
// faction (or per color) and reused; steady-state combat allocates only the
// small per-bolt Group/Mesh wrappers and per-event cloned flash materials —
// never canvases, never shader compiles (the old code built a fresh 256×256
// canvas texture per bolt and disposed it on death, churning texture uploads
// mid-fight). Everything cached here is flagged `userData.shared`, which the
// renderer's disposeObject skips; release everything through dispose().
import * as THREE from 'three';
import { createOrdnanceModel } from './ordnanceModels.js';
import { createStreakBurst, createShockRing, createArcBurst, coneDirections } from './impactFx.js';

const cssHex = (value) => `#${value.toString(16).padStart(6, '0')}`;

export const LASER_FX_TUNING = {
    // Review pass (v0.7.6): laser bolts render at half their first-pass size.
    boltScale: 0.5,
    // Review pass (v0.7.1): the r1 overhaul read as blinding flashes when a
    // bolt crossed the camera. The core keeps its read; the additive layers
    // (glow, head, muzzle, impact flash) give back most of their size and
    // opacity, and close-range attenuation bites much harder.
    coreRadius: 0.2,
    coreLength: 4.0,
    glowWidth: 4.0,
    glowLength: 10,
    glowOpacity: 0.13,
    headSize: 2.7,
    headOpacity: 0.42,
    muzzleSize: 0.5,
    muzzleLife: 0.06,
    impactFlashSize: 3.8,
    impactFlashLife: 0.2,
    // Belt-rock hits: a matte chip burst (solid stone, normal blending) plus a
    // slow dust puff. Chips fly OUTWARD from the rock (hemisphere-biased about
    // the surface normal) and shed speed; dust hangs and fades in place.
    chipCount: 12,
    chipSpeedMin: 10,
    chipSpeedMax: 26,
    chipLife: 0.45,
    chipSize: 1.3,
    chipColor: 0x8d939b,
    chipDamping: 2.5,
    dustCount: 9,
    dustSpeedMin: 2,
    dustSpeedMax: 7,
    dustLife: 0.8,
    dustSize: 3.2,
    dustColor: 0x555b63,
    dustDamping: 5,
    // Camera-distance attenuation: a bolt crossing 8 units from the camera
    // must not paint a screen-filling wash. Scale the whole bolt group by
    // dist/attenuationRange (clamped) so close tracers shrink and distant ones
    // keep their read. Applied per bolt per frame — allocation-free.
    attenuationRange: 60,
    attenuationMin: 0.2,
    attenuationMax: 0.92,
    // Range compensation: beyond farRange a bolt grows by up to farGrowthMax
    // (+140%) over farGrowthRange metres, keeping roughly its screen size.
    farRange: 90,
    farGrowthRange: 250,
    farGrowthMax: 1.4,
};

// Faction palette shared by bolts, muzzle flashes and impacts: the core is a
// near-white hot tint of the faction color; glow and head ride the pure hue.
const LASER_FACTION_COLORS = {
    player: { bolt: 0xffc35a, core: 0xfff3d2 },
    'pirates': { bolt: 0xff4b39, core: 0xffe2d8 },
    patrol: { bolt: 0x75cfff, core: 0xe6f9ff },
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
// Toward white: the hot core of a tinted (signature) projectile.
const lighten = (hex, t = .6) => [16, 8, 0].reduce((n, shift) => n | Math.round((hex >> shift & 255) + (255 - (hex >> shift & 255)) * t) << shift, 0);
const hexRgb = (hex) => { const n = parseInt(hex.slice(1, 7), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
// A small sRGB texture from a function of (u, v) in [-1, 1]. Built from data,
// not a 2D canvas, so effects also construct headless (tests, workers).
function pixelTexture(width, height, shade) {
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const [r, g, b, a] = shade((x + .5) / width * 2 - 1, (y + .5) / height * 2 - 1), i = (y * width + x) * 4;
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
    }
    const texture = new THREE.DataTexture(data, width, height);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
}


export class LaserFx {
    constructor(scene, effects) {
        this.scene = scene;
        // The renderer's transient-FX list: entries { object, velocities?, life,
        // maxLife } are advanced/faded/disposed by the renderer's updateEffects.
        this.effects = effects;
        this.shared = null;
        this.textures = new Map();
        this.materials = new Map();
    }
    textureFor(key, maker) {
        let texture = this.textures.get(key);
        if (!texture) {
            texture = maker();
            texture.userData.shared = true;
            this.textures.set(key, texture);
        }
        return texture;
    }
    materialFor(key, maker) {
        let material = this.materials.get(key);
        if (!material) {
            material = maker();
            material.userData.shared = true;
            this.materials.set(key, material);
        }
        return material;
    }
    // Radial glow sprite texture, hot center → transparent rim.
    radialTexture(key, inner, outer) {
        const a = hexRgb(inner), b = hexRgb(outer);
        return this.textureFor(key, () => pixelTexture(128, 128, (u, v) => {
            // Same stops as the former canvas gradient: solid core to 22%,
            // then towards the outer colour at zero alpha on the rim.
            const r = Math.min(1, Math.hypot(u, v)), t = Math.max(0, (r - .22) / .78);
            return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 1 - t];
        }));
    }
    // Elongated bolt glow: an elliptical blob stretched along the bolt axis —
    // hot middle, soft ends — drawn once and stretched by plane scale.
    boltStreakTexture() {
        return this.textureFor('bolt-streak', () => pixelTexture(128, 256, (u, v) => {
            const r = Math.min(1, Math.hypot(u, v));
            const alpha = r < .35 ? .95 + (.4 - .95) * r / .35 : .4 * (1 - (r - .35) / .65);
            return [255, 255, 255, alpha];
        }));
    }
    // Soft turbulent cloud (smoke), ring (ion) or plasma blob, drawn once.
    cloudTexture(kind = 'smoke') {
        return this.textureFor(`weapon-cloud:${kind}`, () => {
            const size=128,data=new Uint8Array(size*size*4);
            const hash=(x,y)=>{let n=Math.imul(x,374761393)^Math.imul(y,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
            const noise=(x,y)=>{const ix=Math.floor(x),iy=Math.floor(y);let a=x-ix,b=y-iy;a=a*a*(3-2*a);b=b*b*(3-2*b);return (hash(ix,iy)*(1-a)+hash(ix+1,iy)*a)*(1-b)+(hash(ix,iy+1)*(1-a)+hash(ix+1,iy+1)*a)*b;};
            for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
                const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1,r=Math.hypot(u,v);
                const turbulence=.18+.55*noise(u*3+7,v*3+4)+.3*noise(u*7+13,v*7+9)+.15*noise(u*15+21,v*15+16);
                const edge=Math.max(0,1-r),i=(y*size+x)*4;
                let alpha=edge*edge*Math.max(.05,turbulence);
                if(kind==='ion')alpha=Math.exp(-Math.pow((r-.57-Math.sin(Math.atan2(v,u)*7)*.045)/.075,2))*.65+edge**5*.5;
                if(kind==='plasma')alpha=edge**1.5*Math.max(.08,turbulence);
                data[i]=255;data[i+1]=255;data[i+2]=255;data[i+3]=Math.round(Math.min(1,alpha)*255);
            }
            const texture=new THREE.DataTexture(data,size,size);texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearFilter;
            texture.needsUpdate=true;return texture;
        });
    }
    // Every projectile's in-flight visual. The renderer pools the result per
    // kind/faction/launcher and disposes it through disposeObject.
    projectileFor(projectile) {
        let mesh;
        if (projectile.kind === 'laser') {
            // Gauntlet overhaul: hot core + crossed additive glow pair
            // + head sprite (boltFor). Shared assets per faction;
            // the per-bolt cost is just the small group wrapper.
            mesh = this.boltFor(projectile.faction, projectile.tint);
        }
        else if (projectile.kind === 'gauss') {
            // Magrail slug: a long hypervelocity tracer — thin white-blue
            // core, three times the laser bolt's length so the lane it
            // owns reads at a glance, plus a cold additive glow at the head.
            const tint = projectile.tint;
            mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 6.4, 3, 6), new THREE.MeshBasicMaterial({ color: tint ? lighten(tint, .5) : 0xcfeeff }));
            mesh.geometry.rotateX(Math.PI / 2);
            const glow = new THREE.Sprite(new THREE.SpriteMaterial({
                map: tint ? this.radialTexture(`sprite-tint-${tint}`, cssHex(lighten(tint, .75)), cssHex(tint)) : this.radialTexture('sprite-#eaffff-#4fb8d8', '#eaffff', '#4fb8d8'),
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            }));
            glow.scale.setScalar(1.0);
            mesh.add(glow);
        }
        else if (projectile.kind === 'pdc') {
            // Point-defense stub: a short COLD white-blue dart — kept
            // far from the pulse laser's amber so the two streams
            // never read as the same gun at combat distance.
            mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.065, 3.2, 4), new THREE.MeshBasicMaterial({
                color: projectile.faction === 'player' ? 0xdce9ff : 0xff8a5b,
            }));
            mesh.geometry.rotateX(Math.PI / 2);
        }
        else if (projectile.kind === 'ripper') {
            // Scattergun pellet: a small warm spark; seven per shell
            // reads as a cloud without any one pellet drawing attention.
            const tint = projectile.tint;
            mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.48, 2, 4), new THREE.MeshBasicMaterial({ color: tint ? lighten(tint, .35) : 0xffb066 }));
            const glint = new THREE.Sprite(new THREE.SpriteMaterial({
                map: tint ? this.radialTexture(`sprite-tint-${tint}`, cssHex(lighten(tint, .75)), cssHex(tint)) : this.radialTexture('sprite-#ffe9c9-#ff7a2b', '#ffe9c9', '#ff7a2b'),
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            }));
            mesh.geometry.rotateX(Math.PI/2);
            glint.scale.setScalar(0.42);
            glint.material.opacity=.55;
            mesh.add(glint);
        }
        else if (projectile.kind === 'ion') {
            // Ion Lance bolt: a cool cyan blob with an arcing halo —
            // reads as energy discharge rather than a kinetic round.
            mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), new THREE.MeshBasicMaterial({ color: projectile.tint ? lighten(projectile.tint, .4) : 0x69e4f2 }));
            const arc = new THREE.Sprite(new THREE.SpriteMaterial({
                map: this.cloudTexture('ion'), color: projectile.tint ?? 0x6bdfff,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            }));
            arc.scale.setScalar(1.25);
            arc.material.opacity=.65;
            mesh.add(arc);
        }
        else if (projectile.kind === 'mortar') {
            // Sunlance orb: big slow ember with a heavy additive halo —
            // the slowest thing in the sky, so it must look dangerous.
            mesh = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshBasicMaterial({ color: projectile.tint ? lighten(projectile.tint, .6) : 0xffe2a0 }));
            const halo = new THREE.Sprite(new THREE.SpriteMaterial({
                map: this.cloudTexture('plasma'), color: projectile.tint ?? 0xff7729,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            }));
            halo.scale.setScalar(2.3);
            halo.material.opacity=.8;
            mesh.add(halo);
        }
        else {
            // Same Blender-authored, textured geometry as the ordnance review.
            const group = new THREE.Group();
            const flak=projectile.launcherId==='flak';
            const body = createOrdnanceModel(flak?'torpedo':projectile.launcherId);
            if(flak){
                body.material=body.material.clone();
                body.material.userData.shared=false;body.material.userData.borrowedTextures=true;
                body.material.color.setHex(0x58524e);
                body.scale.setScalar(.65);
                body.userData.length*=.65;
                group.add(this.flakTrail());
            }
            group.add(body);
            const exhaust = new THREE.Group();
            exhaust.name = 'ordnance-exhaust';
            group.add(exhaust);
            const flare = new THREE.Sprite(new THREE.SpriteMaterial({
                map: this.radialTexture('sprite-#fff1ad-#ff5029', '#fff1ad', '#ff5029'),
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            }));
            flare.position.z = body.userData.length*.49;
            flare.scale.setScalar(flak?2.8:projectile.launcherId==='torpedo'?1.6:(projectile.launcherId?.includes('swarm') ? .5 : .8));
            exhaust.add(flare);
            // Engine plume: an additive teardrop behind the nozzle —
            // tagged so the frame pass can flicker it. Sized so the
            // missile reads as a moving ember at 30-60 units.
            const plume = new THREE.Mesh(new THREE.ConeGeometry(.28,2.8,5,1,true),new THREE.MeshBasicMaterial({
                color:0xffb66b,transparent:true,blending:THREE.AdditiveBlending,
                depthWrite:false,opacity:.4,side:THREE.DoubleSide,forceSinglePass:true,
            }));
            plume.geometry.rotateX(Math.PI/2);
            plume.position.z=body.userData.length*.5+1.4;
            plume.name = 'plume';
            exhaust.add(plume);
            mesh = group;
        }
        return mesh;
    }
    // One instanced strip per motor. Each puff recedes along the fixed launch
    // bearing, widens and fades over 0.55 seconds. No particle objects to tick.
    flakTrail(){
        const count=8,g=new THREE.InstancedBufferGeometry();
        g.setIndex([0,1,2,0,2,3]);
        g.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));
        g.setAttribute('lane',new THREE.InstancedBufferAttribute(Float32Array.from({length:count},(_,i)=>i/count),1));
        g.instanceCount=count;
        const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,
            uniforms:{age:{value:0},smoke:{value:this.cloudTexture('smoke')}},
            vertexShader:`attribute float lane; uniform float age; varying vec2 puffUV; varying float opacity;
                void main(){float t=fract(age/.55+lane); float size=.55+2.8*t;
                vec4 view=modelViewMatrix*vec4(sin(lane*34.)*t,cos(lane*17.)*t,2.+t*49.5,1.);
                float depth=-view.z;
                if(depth<15.){gl_Position=vec4(2.,2.,2.,1.);return;}
                size=min(size,.025*depth/max(projectionMatrix[0][0],projectionMatrix[1][1]));
                view.xy+=position.xy*size; puffUV=position.xy*.5+.5;
                opacity=(1.-t)*step(t*.55,age)*smoothstep(15.,30.,depth);gl_Position=projectionMatrix*view;}`,
            fragmentShader:`uniform sampler2D smoke;varying vec2 puffUV;varying float opacity;
                void main(){gl_FragColor=vec4(.34,.31,.28,texture2D(smoke,puffUV).a*opacity);}`});
        const mesh=new THREE.Mesh(g,mat);mesh.name='flak-trail';mesh.frustumCulled=false;
        return mesh;
    }
    sharedAssets() {
        if (!this.shared) {
            const tuning = LASER_FX_TUNING;
            const boltScale = tuning.boltScale ?? 1;
            const coreGeometry = new THREE.CapsuleGeometry(tuning.coreRadius * boltScale, Math.max(0.2, (tuning.coreLength - tuning.coreRadius * 2) * boltScale), 3, 8);
            coreGeometry.userData.shared = true;
            // The two crossed streaks have identical material and depth.
            // Put both quads in one mesh, preserving each plane's UVs.
            const w = tuning.glowWidth * boltScale / 2, l = tuning.glowLength * boltScale / 2;
            const glowGeometry = new THREE.BufferGeometry();
            glowGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
                -w,0,-l, w,0,-l, -w,0,l, w,0,l,
                0,-w,-l, 0,w,-l, 0,-w,l, 0,w,l,
            ], 3));
            glowGeometry.setAttribute('uv', new THREE.Float32BufferAttribute([
                0,1, 1,1, 0,0, 1,0, 0,1, 1,1, 0,0, 1,0,
            ], 2));
            glowGeometry.setIndex([0,2,1, 2,3,1, 4,6,5, 6,7,5]);
            glowGeometry.userData.shared = true;
            this.shared = { coreGeometry, glowGeometry, streak: this.boltStreakTexture(), factions: new Map() };
        }
        return this.shared;
    }
    // Signature-tinted bolts share assets per colour, like factions do.
    factionAssets(faction, tint) {
        const shared = this.sharedAssets();
        const key = tint ? `tint-${tint}` : LASER_FACTION_COLORS[faction] ? faction : 'patrol';
        let assets = shared.factions.get(key);
        if (!assets) {
            const tuning = LASER_FX_TUNING;
            const palette = tint ? { bolt: tint, core: lighten(tint, .7) } : LASER_FACTION_COLORS[key];
            const coreMaterial = new THREE.MeshBasicMaterial({ color: palette.core, fog: false, toneMapped: false });
            coreMaterial.userData.shared = true;
            const glowMaterial = new THREE.MeshBasicMaterial({
                color: palette.bolt,
                map: shared.streak,
                transparent: true,
                opacity: tuning.glowOpacity,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide,
                forceSinglePass: true,
                fog: false,
                toneMapped: false,
            });
            glowMaterial.userData.shared = true;
            const headMaterial = new THREE.SpriteMaterial({
                map: this.radialTexture(`bolt-head-${key}`, '#ffffff', cssHex(palette.bolt)),
                transparent: true,
                opacity: tuning.headOpacity,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                fog: false,
                toneMapped: false,
            });
            headMaterial.userData.shared = true;
            assets = { coreMaterial, glowMaterial, headMaterial };
            shared.factions.set(key, assets);
        }
        return assets;
    }
    // A laser bolt: group aligned by the renderer's velocity quaternion (the
    // bolt's local -Z points along travel). Per-bolt allocation is the group,
    // two meshes and one sprite — no canvases, no compiles.
    boltFor(faction, tint) {
        const tuning = LASER_FX_TUNING;
        const assets = this.factionAssets(faction, tint);
        const group = new THREE.Group();
        const core = new THREE.Mesh(this.sharedAssets().coreGeometry, assets.coreMaterial);
        core.rotation.x = Math.PI / 2;
        group.add(core);
        group.add(new THREE.Mesh(this.sharedAssets().glowGeometry, assets.glowMaterial));
        const head = new THREE.Sprite(assets.headMaterial);
        head.scale.setScalar(tuning.headSize * tuning.boltScale);
        head.position.z = -(tuning.coreLength * tuning.boltScale / 2);
        group.add(head);
        return group;
    }
    // Camera-distance attenuation for one bolt group: allocation-free — reads
    // numbers off the already-set mesh position and the camera. Call after the
    // renderer positions the bolt each frame.
    attenuate(group, cameraPosition, targetScale = group.scale, grow = true) {
        const dx = cameraPosition.x - group.position.x;
        const dy = cameraPosition.y - group.position.y;
        const dz = cameraPosition.z - group.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const tuning = LASER_FX_TUNING;
        // Close tracers shrink; distant ones grow again so enemy fire still
        // reads at long range instead of fading to a sub-pixel speck.
        const far = grow ? 1 + clamp((dist - tuning.farRange) / tuning.farGrowthRange, 0, tuning.farGrowthMax) : 1;
        targetScale.setScalar(clamp(dist / tuning.attenuationRange, tuning.attenuationMin, tuning.attenuationMax) * far);
    }
    // Cloned per-event material so updateEffects can fade opacity without
    // cross-talk between simultaneous flashes; the underlying map stays shared.
    flashMaterial(colorHex, key, inner) {
        const base = this.materialFor(key, () => new THREE.SpriteMaterial({
            map: this.radialTexture(`${key}-map`, inner, cssHex(colorHex)),
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
            toneMapped: false,
        }));
        // Material.clone() deep-copies userData, so the clone inherited the
        // cache's `shared` flag and disposeObject skipped every flash clone —
        // a per-shot material leak. Per-event clones are disposable by
        // definition; their map texture stays flagged shared (textureFor), so
        // the cache survives the clone's disposal.
        const clone = base.clone();
        clone.userData.shared = false;
        return clone;
    }
    muzzleFlash(x, y, z, colorHex = LASER_FACTION_COLORS.player.bolt, scale = 1) {
        const tuning = LASER_FX_TUNING;
        // Review fix: the muzzle pop sat ~10u from the third-person camera,
        // additive with a near-white core — every shot strobed the screen.
        // Small, faction-tinted, half-opacity, and flagged `muzzle` so the
        // renderer fades it without the generic sprite growth branch.
        const sprite = new THREE.Sprite(this.flashMaterial(colorHex, `muzzle-${colorHex.toString(16)}`, cssHex(colorHex)));
        sprite.position.set(x, y, z);
        sprite.scale.setScalar(tuning.muzzleSize * scale);
        this.scene.add(sprite);
        this.effects.push({ object: sprite, velocities: [], life: tuning.muzzleLife, maxLife: tuning.muzzleLife, muzzle: true });
    }
    // Generic hit without surface information (ram scrapes, scripted hits).
    impact(position, colorHex = 0xffc36a, heavy = false) {
        // No surface to stick a scorch to: a static glow would float in space.
        this.weaponImpact({ position, color: colorHex, heavy, kind: heavy ? 'missile' : 'laser', noScorch: true });
    }
    add(effect) {
        if (!effect.object.parent) this.scene.add(effect.object);
        this.effects.push(effect);
        return effect;
    }
    flash(position, colorHex, size, life, inner = '#ffffff') {
        const flash = new THREE.Sprite(this.flashMaterial(colorHex, `impact-${colorHex.toString(16)}`, inner));
        flash.position.set(position[0], position[1], position[2]);
        flash.scale.setScalar(size);
        this.scene.add(flash);
        this.effects.push({ object: flash, velocities: [], life, maxLife: life });
    }
    // A short-lived molten glow left on the plate that was hit. Parented to
    // the hull so it rides along; bounded by the caller's effect budget.
    scorch(position, attach, size = 1.5, life = 1.4) {
        if (this.noScorch) return;
        // At most a handful glowing per hull keeps a long burst cheap.
        if (attach) { if ((attach.userData.scorches ?? 0) >= 6) return; attach.userData.scorches = (attach.userData.scorches ?? 0) + 1; }
        const material = this.flashMaterial(0xff7a2a, 'scorch-ff7a2a', '#ffd9a0');
        const sprite = new THREE.Sprite(material);
        const world = new THREE.Vector3().fromArray(position);
        if (attach) {
            attach.updateWorldMatrix(true, false);
            attach.worldToLocal(world);
            sprite.position.copy(world);
            const scale = new THREE.Vector3().setFromMatrixScale(attach.matrixWorld);
            sprite.scale.setScalar(size / Math.max(1e-3, scale.x));
            attach.add(sprite);
        } else {
            sprite.position.copy(world);
            sprite.scale.setScalar(size);
            this.scene.add(sprite);
        }
        const base = sprite.scale.x;
        return this.add({
            object: sprite, life, maxLife: life,
            update(dt) {
                this.age = (this.age ?? 0) + dt;
                const k = Math.max(0, 1 - this.age / life);
                // A white-hot pop, then a dull orange glow that cools away.
                material.opacity = this.age < .08 ? 1 : .75 * k * k;
                sprite.scale.setScalar(base * (this.age < .08 ? 1.3 : .7 + .3 * k));
            },
            dispose() { if (attach) attach.userData.scorches = Math.max(0, (attach.userData.scorches ?? 1) - 1); sprite.removeFromParent(); material.dispose(); },
        });
    }
    // Weapon- and surface-specific hit. `normal` points out of the struck
    // surface, `direction` along the shot; both are optional unit arrays.
    // `shielded` hits stay on the shield shell (the renderer adds its ripple).
    weaponImpact({ position, normal, direction, kind = 'laser', color = 0xffc36a, heavy = false, shielded = false, attach, noScorch = false, tint }) {
        // A signature weapon's hits take its colour in place of the kind's own.
        const T = (hex) => tint ?? hex;
        this.noScorch = noScorch;
        const dir = direction ?? (normal ? [-normal[0], -normal[1], -normal[2]] : [0, 0, -1]);
        const out = normal ?? [-dir[0], -dir[1], -dir[2]];
        // Mirror the shot about the surface: sparks leave on the bounce side.
        const dot = dir[0] * out[0] + dir[1] * out[1] + dir[2] * out[2];
        const bounce = [dir[0] - 2 * dot * out[0], dir[1] - 2 * dot * out[1], dir[2] - 2 * dot * out[2]];
        if (shielded) {
            // Energy splashes across the shell: a cool flash and sparks that
            // skitter almost tangent to it. No hull damage, so no scorch.
            const cool = T(kind === 'ion' ? 0x7ff3ff : 0x9fd8ff);
            this.flash(position, cool, kind === 'gauss' || heavy ? 4.2 : 2.6, .16);
            this.add(createStreakBurst({ position, count: heavy ? 16 : 10, direction: coneDirections(out, 1.45), speedMin: 14, speedMax: 34, drag: 4, lifeMin: .18, lifeMax: .36, width: .1, hot: 0xeefbff, cool: T(0x3d8bff) }));
            if (kind === 'gauss' || heavy) this.add(createShockRing({ position, normal: out, radius: heavy ? 7 : 4.5, life: .32, hex: T(0x8fd4ff), opacity: .7 }));
            if (kind === 'ion') this.add(createArcBurst({ position, radius: 3.2, branches: 5, life: .32, around: out, ...(tint ? { hex: tint } : {}) }));
            return;
        }
        switch (kind) {
        case 'gauss':
            // A slug punches through: pinpoint flash, spall thrown out of the
            // far side along the shot, a little back-spray and a shock ring.
            this.flash(position, T(0xd8f4ff), 3.2, .14);
            this.add(createStreakBurst({ position, count: 16, direction: coneDirections(dir, .42), speedMin: 55, speedMax: 120, drag: 2.2, lifeMin: .2, lifeMax: .42, width: .11, lag: .03, hot: 0xffffff, cool: T(0x7fc8ff) }));
            this.add(createStreakBurst({ position, count: 7, direction: coneDirections(bounce, .8), speedMin: 20, speedMax: 45, drag: 3, lifeMin: .2, lifeMax: .4, width: .1, hot: 0xfff1c4, cool: T(0xff7a2a) }));
            this.add(createShockRing({ position, radius: 3.6, life: .22, hex: T(0xcfeeff), opacity: .75 }));
            this.scorch(position, attach, 1.3, 1.1);
            return;
        case 'ion':
            // Ion discharge: electric arcs crawl over the plate, a cold ring.
            this.flash(position, T(0x7ff3ff), 2.4, .14);
            this.add(createArcBurst({ position, radius: 3.6, branches: 6, life: .42, around: out, ...(tint ? { hex: tint } : {}) }));
            this.add(createShockRing({ position, radius: 4.2, life: .3, hex: T(0x6be6ff), opacity: .6 }));
            this.add(createStreakBurst({ position, count: 6, direction: coneDirections(out, 1.2), speedMin: 10, speedMax: 26, drag: 4, lifeMin: .2, lifeMax: .35, width: .08, hot: 0xeaffff, cool: T(0x3fc4ff) }));
            return;
        case 'mortar':
        case 'missile':
            // Plasma or warhead splash: a big bloom, a slow ember fountain
            // off the surface and a broad ring. Missiles add the game's blast.
            this.flash(position, T(kind === 'mortar' ? 0xffb35c : 0xff8a4d), kind === 'mortar' ? 6.5 : 5, .22);
            this.add(createStreakBurst({ position, count: 22, direction: coneDirections(out, 1.35), speedMin: 10, speedMax: 34, drag: 1.6, lifeMin: .5, lifeMax: 1.05, width: .16, lag: .07, hot: 0xfff0b0, cool: T(kind === 'mortar' ? 0xff5418 : 0xff3a10) }));
            this.add(createShockRing({ position, radius: kind === 'mortar' ? 10 : 8, life: .4, hex: T(kind === 'mortar' ? 0xffc06a : 0xffa060), opacity: .42, thickness: .14 }));
            this.scorch(position, attach, 2.4, 1.8);
            return;
        case 'pdc':
            this.flash(position, color, 1.1, .08);
            this.add(createStreakBurst({ position, count: 4, direction: coneDirections(bounce, .9), speedMin: 16, speedMax: 34, drag: 3.5, lifeMin: .12, lifeMax: .24, width: .06, lag: .03, hot: 0xfff6dc, cool: T(0xffa040) }));
            return;
        case 'ripper':
            this.flash(position, color, 1.5, .1);
            this.add(createStreakBurst({ position, count: 5, direction: coneDirections(bounce, 1), speedMin: 14, speedMax: 32, drag: 3, lifeMin: .15, lifeMax: .3, width: .08, hot: 0xfff1c4, cool: T(0xff7a2a) }));
            if (Math.random() < .35) this.scorch(position, attach, .9, .8);
            return;
        default:
            // Pulse / beam: white-hot pop in the faction colour, molten
            // sparks spraying off the bounce side and a cooling scorch.
            this.flash(position, color, LASER_FX_TUNING.impactFlashSize, LASER_FX_TUNING.impactFlashLife);
            this.add(createStreakBurst({ position, count: heavy ? 20 : 12, direction: coneDirections(bounce, 1.05), speedMin: 16, speedMax: 42, drag: 2.8, lifeMin: .22, lifeMax: .5, width: .1, hot: 0xfff1c4, cool: color === 0xffcb62 || color === 0xffc36a ? 0xff6a1e : color }));
            this.scorch(position, attach, 1.4, 1.3);
        }
    }
    // Asteroid/belt hit: a matte grey chip burst and a slow dust puff, both
    // pushed outward from the rock surface. Unlike the hot additive impact
    // sparks (laserFx.impact), chips use NORMAL blending and damped velocity
    // so they read as solid stone knocked off the belt — dust hangs and fades.
    rockImpact(position, rockCenter) {
        const tuning = LASER_FX_TUNING;
        this.rockBurst(position, rockCenter, tuning.chipColor, tuning.chipCount, tuning.chipSpeedMin, tuning.chipSpeedMax, tuning.chipLife, tuning.chipSize, 0.95, tuning.chipDamping);
        this.rockBurst(position, rockCenter, tuning.dustColor, tuning.dustCount, tuning.dustSpeedMin, tuning.dustSpeedMax, tuning.dustLife, tuning.dustSize, 0.4, tuning.dustDamping);
    }
    // Fine soot and metal flecks, pushed away from the struck surface.
    salvageImpact(position, center) {
        // The ordinary weapon impact already supplies sparks; one muted dust
        // batch avoids allocating two particle systems for each hit.
        this.rockBurst(position,center,0x817b70,9,1,6,.75,2,.32,4);
    }
    // A released cargo pod leaves a few solid, thick pieces of plating behind.
    // One instanced draw call per release; the actual collectible stays still.
    salvageRelease(position, direction, released = 1) {
        if(!this.salvageGeometry){
            this.salvageGeometry=new THREE.BoxGeometry(1,.16,.65);
            this.salvageGeometry.userData.shared=true;
        }
        const material=this.materialFor('salvage-shards',()=>new THREE.MeshStandardMaterial({color:0x9ca8a9,metalness:.58,roughness:.76}));
        const count=Math.min(9,5+released*2),mesh=new THREE.InstancedMesh(this.salvageGeometry,material,count);
        mesh.name='salvage-release-fragments';mesh.position.set(...position);mesh.frustumCulled=false;
        const length=Math.hypot(direction.x,direction.y,direction.z)||1;
        const nx=-direction.x/length,ny=-direction.y/length,nz=-direction.z/length;
        const pieces=Array.from({length:count},(_,piecesIndex)=>{
            let x=Math.random()*2-1,y=Math.random()*2-1,z=Math.random()*2-1;
            if(x*nx+y*ny+z*nz<0){x=-x;y=-y;z=-z;}
            const magnitude=Math.hypot(x,y,z)||1,large=piecesIndex<2,speed=large?3+Math.random()*3:7+Math.random()*10;
            return {x:0,y:0,z:0,vx:x/magnitude*speed+nx*2,vy:y/magnitude*speed+ny*2,vz:z/magnitude*speed+nz*2,
                rx:Math.random()*6,ry:Math.random()*6,rz:Math.random()*6,
                ax:(Math.random()-.5)*4,ay:(Math.random()-.5)*4,az:(Math.random()-.5)*4,
                size:large?1.4+Math.random()*.7:.35+Math.random()*.8,wide:large?1.6:.7+Math.random()*.7};
        });
        const transform=new THREE.Object3D();let age=0;const life=1.2;
        const update=dt=>{age+=dt;const fade=Math.min(1,Math.max(0,(life-age)/.3));
            for(let i=0;i<count;i++){const p=pieces[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.rx+=p.ax*dt;p.ry+=p.ay*dt;p.rz+=p.az*dt;
                transform.position.set(p.x,p.y,p.z);transform.rotation.set(p.rx,p.ry,p.rz);transform.scale.set(p.size*p.wide*fade,p.size*fade,p.size*fade);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);}
            mesh.instanceMatrix.needsUpdate=true;
        };
        update(0);this.scene.add(mesh);this.effects.push({object:mesh,life,maxLife:life,update});
    }
    rockBurst(position, rockCenter, colorHex, count, speedMin, speedMax, life, size, opacity, damping) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);
        // Outward hemisphere: the hit normal (away from the rock centre) biases
        // the burst so chips fly off the surface instead of through it.
        const ox = position[0] - rockCenter[0];
        const oy = position[1] - rockCenter[1];
        const oz = position[2] - rockCenter[2];
        const olen = Math.hypot(ox, oy, oz) || 1;
        const nx = ox / olen;
        const ny = oy / olen;
        const nz = oz / olen;
        for (let index = 0; index < count; index += 1) {
            // Rejection-sample the unit sphere, then mirror any direction that
            // points into the rock so the burst fills the outward hemisphere.
            let vx = 0;
            let vy = 0;
            let vz = 0;
            let len = 0;
            do {
                vx = Math.random() * 2 - 1;
                vy = Math.random() * 2 - 1;
                vz = Math.random() * 2 - 1;
                len = Math.hypot(vx, vy, vz);
            } while (len > 1 || len < 1e-4);
            if (vx * nx + vy * ny + vz * nz < 0) {
                vx = -vx;
                vy = -vy;
                vz = -vz;
            }
            const speed = speedMin + (speedMax - speedMin) * Math.random();
            velocities[index * 3] = (vx / len) * speed;
            velocities[index * 3 + 1] = (vy / len) * speed;
            velocities[index * 3 + 2] = (vz / len) * speed;
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const material = new THREE.PointsMaterial({
            color: colorHex,
            size,
            sizeAttenuation: true,
            transparent: true,
            opacity,
            blending: THREE.NormalBlending,
            depthWrite: false,
            fog: false,
        });
        const points = new THREE.Points(geometry, material);
        points.position.set(position[0], position[1], position[2]);
        this.scene.add(points);
        this.effects.push({ object: points, points, velocities, life, maxLife: life, damping });
    }
    dispose() {
        this.salvageGeometry?.dispose();this.salvageGeometry=undefined;
        if (this.shared) {
            this.shared.coreGeometry.dispose();
            this.shared.glowGeometry.dispose();
            this.shared.streak.dispose();
            this.shared.factions.forEach((assets) => {
                assets.coreMaterial.dispose();
                assets.glowMaterial.dispose();
                assets.headMaterial.dispose();
            });
            this.shared.factions.clear();
            this.shared = null;
        }
        this.textures.forEach((texture) => texture.dispose());
        this.textures.clear();
        this.materials.forEach((material) => material.dispose());
        this.materials.clear();
    }
}

// Advance one transient effect from the renderer's list (or the FX review's).
// Entries either bring their own update(dt) or are one of the generic kinds:
// a point burst with velocities (optionally damped), a warp streak, a muzzle
// pop or a growing flash sprite. `ratio` is the remaining life fraction.
export function stepTransientEffect(effect, dt, ratio) {
    if (effect.update) { effect.update(dt); return; }
    if (effect.points) {
        const positions = effect.points.geometry.getAttribute('position');
        const vel = effect.velocities;
        const count = vel.length / 3;
        for (let i = 0; i < count; i += 1)
            positions.setXYZ(i, positions.getX(i) + vel[i * 3] * dt, positions.getY(i) + vel[i * 3 + 1] * dt, positions.getZ(i) + vel[i * 3 + 2] * dt);
        // Damped bursts (rock chips/dust) shed speed so they read as solid
        // debris; sparks keep flying at constant velocity.
        if (effect.damping) {
            const damp = Math.max(0, 1 - effect.damping * dt);
            for (let i = 0; i < count * 3; i += 1) vel[i] *= damp;
        }
        positions.needsUpdate = true;
        const material = effect.points.material;
        if (material instanceof THREE.PointsMaterial) material.opacity = ratio;
        return;
    }
    if (effect.streak) {
        // The warp streak extends along the heading as it fades.
        effect.streak.scale.y += dt * 300;
        const material = effect.streak.material;
        if (material instanceof THREE.MeshBasicMaterial) material.opacity = ratio * 0.85;
        return;
    }
    if (effect.muzzle) {
        // Muzzle pops fade at half opacity and do NOT grow: a flash, not a
        // bloom (growing x4.2/s strobed the screen on every shot).
        const material = effect.object.material;
        if (material instanceof THREE.SpriteMaterial) material.opacity = ratio * 0.5;
        return;
    }
    if (effect.object instanceof THREE.Sprite) {
        effect.object.scale.multiplyScalar(1 + dt * 4.2);
        const material = effect.object.material;
        if (material instanceof THREE.SpriteMaterial) material.opacity = ratio;
    }
}
