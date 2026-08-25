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

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const cssHex = (value) => `#${value.toString(16).padStart(6, '0')}`;

export const LASER_FX_TUNING = {
    coreRadius: 0.3,
    coreLength: 3.6,
    glowWidth: 16,
    glowLength: 21,
    glowOpacity: 0.5,
    headSize: 8.5,
    headOpacity: 0.85,
    muzzleSize: 6.5,
    muzzleLife: 0.11,
    impactFlashSize: 5.4,
    impactFlashLife: 0.22,
    sparkCount: 12,
    sparkCountHeavy: 18,
    sparkSpeedMin: 14,
    sparkSpeedMax: 34,
    sparkLife: 0.55,
    sparkSize: 1.15,
    emberCount: 5,
    emberSpeedMin: 3,
    emberSpeedMax: 7,
    emberLife: 1.3,
    emberSize: 1.7,
};

// Faction palette shared by bolts, muzzle flashes and impacts: the core is a
// near-white hot tint of the faction color; glow and head ride the pure hue.
const LASER_FACTION_COLORS = {
    player: { bolt: 0xffc35a, core: 0xfff3d2 },
    'red-talons': { bolt: 0xff4b39, core: 0xffe2d8 },
    patrol: { bolt: 0x75cfff, core: 0xe6f9ff },
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

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
        return this.textureFor(key, () => {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const context = canvas.getContext('2d');
            const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
            gradient.addColorStop(0, inner);
            gradient.addColorStop(0.22, inner);
            gradient.addColorStop(1, `${outer}00`);
            context.fillStyle = gradient;
            context.fillRect(0, 0, 128, 128);
            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            return texture;
        });
    }
    // Elongated bolt glow: an elliptical blob stretched along the bolt axis —
    // hot middle, soft ends — drawn once and stretched by plane scale.
    boltStreakTexture() {
        return this.textureFor('bolt-streak', () => {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 256;
            const context = canvas.getContext('2d');
            context.translate(64, 128);
            context.scale(1, 2);
            const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 64);
            gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
            gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.4)');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            context.fillStyle = gradient;
            context.fillRect(-64, -128, 128, 256);
            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            return texture;
        });
    }
    sharedAssets() {
        if (!this.shared) {
            const tuning = LASER_FX_TUNING;
            const coreGeometry = new THREE.CapsuleGeometry(tuning.coreRadius, Math.max(0.2, tuning.coreLength - tuning.coreRadius * 2), 3, 8);
            coreGeometry.userData.shared = true;
            const glowGeometry = new THREE.PlaneGeometry(1, 1);
            glowGeometry.userData.shared = true;
            this.shared = { coreGeometry, glowGeometry, streak: this.boltStreakTexture(), factions: new Map() };
        }
        return this.shared;
    }
    factionAssets(faction) {
        const shared = this.sharedAssets();
        const key = LASER_FACTION_COLORS[faction] ? faction : 'patrol';
        let assets = shared.factions.get(key);
        if (!assets) {
            const tuning = LASER_FX_TUNING;
            const palette = LASER_FACTION_COLORS[key];
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
            // Crossed glow planes along the bolt axis: A spans X/Z (normal +Y),
            // B is A rotated a quarter-turn about the bolt axis (normal ±X), so
            // at least one plane is face-on from every view angle.
            const glowQuatA = new THREE.Quaternion().setFromAxisAngle(X_AXIS, -Math.PI / 2);
            const glowQuatB = new THREE.Quaternion().setFromAxisAngle(Z_AXIS, Math.PI / 2).multiply(glowQuatA);
            assets = { coreMaterial, glowMaterial, headMaterial, glowQuatA, glowQuatB };
            shared.factions.set(key, assets);
        }
        return assets;
    }
    // A laser bolt: group aligned by the renderer's velocity quaternion (the
    // bolt's local -Z points along travel). Per-bolt allocation is the group,
    // three meshes and one sprite — no canvases, no compiles.
    boltFor(faction) {
        const tuning = LASER_FX_TUNING;
        const assets = this.factionAssets(faction);
        const group = new THREE.Group();
        const core = new THREE.Mesh(this.sharedAssets().coreGeometry, assets.coreMaterial);
        core.rotation.x = Math.PI / 2;
        group.add(core);
        const glowA = new THREE.Mesh(this.sharedAssets().glowGeometry, assets.glowMaterial);
        glowA.scale.set(tuning.glowWidth, tuning.glowLength, 1);
        glowA.quaternion.copy(assets.glowQuatA);
        group.add(glowA);
        const glowB = new THREE.Mesh(this.sharedAssets().glowGeometry, assets.glowMaterial);
        glowB.scale.set(tuning.glowWidth, tuning.glowLength, 1);
        glowB.quaternion.copy(assets.glowQuatB);
        group.add(glowB);
        const head = new THREE.Sprite(assets.headMaterial);
        head.scale.setScalar(tuning.headSize);
        head.position.z = -(tuning.coreLength / 2);
        group.add(head);
        return group;
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
        return base.clone();
    }
    muzzleFlash(x, y, z, colorHex = LASER_FACTION_COLORS.player.bolt) {
        const tuning = LASER_FX_TUNING;
        const sprite = new THREE.Sprite(this.flashMaterial(colorHex, `muzzle-${colorHex.toString(16)}`, '#fff6d8'));
        sprite.position.set(x, y, z);
        sprite.scale.setScalar(tuning.muzzleSize);
        this.scene.add(sprite);
        this.effects.push({ object: sprite, velocities: [], life: tuning.muzzleLife, maxLife: tuning.muzzleLife });
    }
    // Layered hit: white-hot flash + faction-colored swell, a radial spark
    // burst, and for heavy (missile) hits a slow ember afterglow.
    impact(position, colorHex = 0xffc36a, heavy = false) {
        const tuning = LASER_FX_TUNING;
        const flash = new THREE.Sprite(this.flashMaterial(colorHex, `impact-${colorHex.toString(16)}`, '#ffffff'));
        flash.position.set(position[0], position[1], position[2]);
        flash.scale.setScalar(tuning.impactFlashSize);
        this.scene.add(flash);
        this.effects.push({ object: flash, velocities: [], life: tuning.impactFlashLife, maxLife: tuning.impactFlashLife });
        this.sparkBurst(position, colorHex, heavy ? tuning.sparkCountHeavy : tuning.sparkCount, tuning.sparkSpeedMin, tuning.sparkSpeedMax, tuning.sparkLife, tuning.sparkSize, 0.95);
        if (heavy)
            this.sparkBurst(position, 0xff8a4d, tuning.emberCount, tuning.emberSpeedMin, tuning.emberSpeedMax, tuning.emberLife, tuning.emberSize, 0.8);
    }
    sparkBurst(position, colorHex, count, speedMin, speedMax, life, size, opacity) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);
        for (let index = 0; index < count; index += 1) {
            // Rejection-sample a point in the unit sphere for even directions.
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
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
            fog: false,
        });
        const points = new THREE.Points(geometry, material);
        points.position.set(position[0], position[1], position[2]);
        this.scene.add(points);
        this.effects.push({ object: points, points, velocities, life, maxLife: life });
    }
    dispose() {
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
