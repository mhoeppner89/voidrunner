import * as THREE from 'three';

export const SPACE_EXPOSURE=1.18;
export const SYSTEM_STAR_PROFILE = Object.freeze({
    'helios-verge': Object.freeze({
        radius: 22000,
        core: 0xffe1a0,
        corona: [
            ['#fff5cf', '#ffaf3d', 48000, 0.55],
            ['#ffd57a', '#ff6b2a', 110000, 0.32],
            ['#ffe9a8', '#e07a3a', 220000, 0.14],
        ],
        hemisphere: [0xffd2a8, 0x32284c, 2.4],
        fill: [0x7a6caa, 1.0],
        key: [0xffa566, 5.0],
        rim: [0x66b9ff, 1.4],
    }),
    meridian: Object.freeze({
        radius: 19000,
        core: 0xfff2c7,
        corona: [
            ['#fffbea', '#efc86f', 44000, 0.52],
            ['#fff0b0', '#d89038', 98000, 0.28],
            ['#fff7d5', '#d6a652', 190000, 0.12],
        ],
        hemisphere: [0xffe7bd, 0x263b55, 2.3],
        fill: [0x7195bc, 1.0],
        key: [0xffc978, 4.8],
        rim: [0x77c9ff, 1.35],
    }),
    redwake: Object.freeze({
        // A compact red dwarf: physically smaller on the far shell and much
        // redder than Helios, with a restrained corona rather than a recolored
        // copy of the same yellow star.
        radius: 11000,
        core: 0xff6046,
        corona: [
            ['#ffb08a', '#e33b25', 30000, 0.48],
            ['#ff6a48', '#971c24', 66000, 0.29],
            ['#ee4937', '#5d1021', 135000, 0.13],
        ],
        hemisphere: [0xff8c69, 0x321421, 2.15],
        fill: [0x6a405d, 0.9],
        key: [0xff5538, 4.4],
        rim: [0xb65f8f, 1.15],
    }),
    'pale-ring': Object.freeze({
        // Pale Ring is lit by a blue giant: a larger blue-white disc with a
        // broad cold corona and correspondingly cool key light.
        radius: 38000,
        core: 0xe9fbff,
        corona: [
            ['#ffffff', '#8fdcff', 78000, 0.62],
            ['#c8efff', '#418dff', 165000, 0.38],
            ['#9edcff', '#245bb8', 310000, 0.17],
        ],
        hemisphere: [0xc8efff, 0x192b4f, 2.65],
        fill: [0x638bc7, 1.15],
        key: [0x9bdcff, 5.6],
        rim: [0xd7f6ff, 1.65],
    }),
});

export function applySpaceLighting(rig,systemId){
 const profile=SYSTEM_STAR_PROFILE[systemId]??SYSTEM_STAR_PROFILE['helios-verge'];
 const [sky,ground,hemi]=profile.hemisphere;rig.hemi.color.setHex(sky);rig.hemi.groundColor.setHex(ground);rig.hemi.intensity=hemi;
 rig.fill.color.setHex(profile.fill[0]);rig.fill.intensity=profile.fill[1];
 rig.key.color.setHex(systemId==='acheron'?0xffd5a0:profile.key[0]);rig.key.intensity=systemId==='acheron'?3.5:profile.key[1];rig.key.position.set(-.45,.18,1).normalize();
 rig.rim.color.setHex(profile.rim[0]);rig.rim.intensity=profile.rim[1];rig.rim.position.set(.58,-.24,-.78).normalize();
}
// Exact flight IBL: exterior films must not inherit a hangar's painted walls.
export function createSpaceEnvironment(){
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const context = canvas.getContext('2d');
        const gradient = context.createLinearGradient(0, 0, 0, 256);
        gradient.addColorStop(0, '#0a122c');
        gradient.addColorStop(0.18, '#54264c');
        gradient.addColorStop(0.34, '#a35a3c');
        gradient.addColorStop(0.46, '#ee9e50');
        gradient.addColorStop(0.52, '#ffd070');
        gradient.addColorStop(0.58, '#e07250');
        gradient.addColorStop(0.72, '#56284e');
        gradient.addColorStop(1, '#0a1132');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 512, 256);
        for (const [cx, cy, radius, fill] of [
            [120, 132, 170, 'rgba(255,170,80,0.85)'],
            [396, 132, 160, 'rgba(255,140,90,0.7)'],
            [250, 50, 110, 'rgba(196,108,238,0.42)'],
            [70, 210, 100, 'rgba(140,158,196,0.36)'],
            [430, 220, 80, 'rgba(120,236,196,0.28)'],
        ]) {
            const blob = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
            blob.addColorStop(0, fill);
            blob.addColorStop(1, 'rgba(0,0,0,0)');
            context.fillStyle = blob;
            context.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
        }
        // No star dots in the IBL canvas: scene.environment feeds every
        // standard material's specular, and 1px stars at 512x256 alias into
        // speckled dots on any glossy surface seen from orbit (Azure's seas).
        // The visible starfield is the Points shell from createStarfield.
        const texture = new THREE.CanvasTexture(canvas);
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
}
