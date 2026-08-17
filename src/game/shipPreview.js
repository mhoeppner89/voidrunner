import * as THREE from 'three';
import { createVoxelShipModel, paletteForFaction } from './voxelModels.js';

// A lightweight turntable renderer for the shipyard cards. Each card gets its
// own WebGL context (a dock sells at most two hulls at once), so the models can
// spin independently and are disposed cleanly when the market re-renders or the
// player launches.
export class ShipPreview {
    constructor(container, variant) {
        this.container = container;
        this.disposed = false;
        this.renderer = new THREE.WebGLRenderer({
            antialias: false,
            alpha: true,
            powerPreference: 'high-performance',
            depth: true,
            stencil: false,
        });
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.NeutralToneMapping;
        this.renderer.toneMappingExposure = 1.18;
        this.renderer.setPixelRatio(1);
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.domElement.className = 'ship-preview-canvas';
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
        this.renderer.domElement.style.imageRendering = 'pixelated';
        this.renderer.domElement.setAttribute('aria-hidden', 'true');
        container.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 1000);
        this.scene.add(this.camera);
        this.createLighting();
        this.scene.environment = this.createEnvironment();

        // The showroom paint is shared across every hull so the comparison stays
        // about shape and stats, not livery.
        const model = createVoxelShipModel(variant, paletteForFaction('player'));
        this.pivot = new THREE.Group();
        this.model = model.group;
        this.pivot.add(this.model);
        this.scene.add(this.pivot);
        this.frameModel();

        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(container);
        this.resize();

        this.clock = new THREE.Clock();
        this.rafId = requestAnimationFrame(this.tick);
    }
    createLighting() {
        // Same two-tone dusk as the flight scene: warm sun key, cool cyan rim.
        this.scene.add(new THREE.HemisphereLight(0xffd2a8, 0x32284c, 2.4));
        this.scene.add(new THREE.AmbientLight(0x7a6caa, 1.0));
        const sun = new THREE.DirectionalLight(0xffa566, 5.0);
        sun.position.set(-0.45, 0.18, 1.0).normalize();
        this.scene.add(sun);
        const rim = new THREE.DirectionalLight(0x66b9ff, 1.4);
        rim.position.set(0.58, -0.24, -0.78).normalize();
        this.scene.add(rim);
    }
    createEnvironment() {
        // A painterly horizon gradient so the glossy clearcoated hulls reflect
        // color instead of black. Kept simpler than the flight scene's IBL.
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const context = canvas.getContext('2d');
        const gradient = context.createLinearGradient(0, 0, 0, 128);
        gradient.addColorStop(0, '#0a122c');
        gradient.addColorStop(0.32, '#54264c');
        gradient.addColorStop(0.48, '#ee9e50');
        gradient.addColorStop(0.54, '#ffd070');
        gradient.addColorStop(0.68, '#56284e');
        gradient.addColorStop(1, '#0a1132');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 256, 128);
        const texture = new THREE.CanvasTexture(canvas);
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }
    frameModel() {
        // Center the model on the pivot origin, then pull the camera back to a
        // 3/4 top-front showroom angle that fits the whole hull in frame.
        const box = new THREE.Box3().setFromObject(this.pivot);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        this.model.position.sub(center);
        const radius = size.length() * 0.5;
        const fovHalf = THREE.MathUtils.degToRad(this.camera.fov * 0.5);
        const tanHalf = Math.tan(fovHalf);
        const aspect = this.container.clientWidth / Math.max(1, this.container.clientHeight);
        const fit = Math.min(tanHalf, tanHalf * aspect);
        const distance = (radius / Math.max(fit, 0.0001)) * 1.06;
        const azimuth = Math.PI / 3;
        const elevation = Math.PI / 6;
        this.camera.position.set(
            distance * Math.cos(elevation) * Math.sin(azimuth),
            distance * Math.sin(elevation),
            -distance * Math.cos(elevation) * Math.cos(azimuth),
        );
        this.camera.lookAt(0, 0, 0);
    }
    resize() {
        if (this.disposed)
            return;
        const width = Math.max(1, this.container.clientWidth);
        const height = Math.max(1, this.container.clientHeight);
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }
    tick = () => {
        if (this.disposed)
            return;
        this.pivot.rotation.y = this.clock.getElapsedTime() * 0.5;
        this.renderer.render(this.scene, this.camera);
        this.rafId = requestAnimationFrame(this.tick);
    };
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        cancelAnimationFrame(this.rafId);
        this.resizeObserver.disconnect();
        this.pivot.traverse((object) => {
            if (!(object instanceof THREE.Mesh))
                return;
            object.geometry?.dispose?.();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => {
                if (!material)
                    return;
                for (const value of Object.values(material)) {
                    if (value instanceof THREE.Texture)
                        value.dispose();
                }
                material.dispose();
            });
        });
        this.scene.environment?.dispose?.();
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
