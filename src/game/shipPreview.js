import {FLEET_EQUIPMENT,equipmentHullId,droneDock} from './fleetEquipmentData.js';
import {applyFleetPaint} from './fleetPaint.js';
import {fleetPaintPath,resolveFleetPaint} from './fleetPaintCatalog.js';
import * as THREE from 'three';
import { createVoxelShipModel, paletteForFaction } from './voxelModels.js';
import { loadGlb } from './glbLoader.js';
import { GLB_SHIP_CONFIG } from './render.js';
import { FrameBudget } from './frameBudget.js';
import { TURRET_LAYOUTS } from './turretLayouts.js';
import { createTurretModel, paintFrigateTurret } from './turretModels.js';

// A bounding sphere fits every turntable angle, including wide hulls on a
// narrow card. Keep a little margin for turrets and the perspective near side.
export const previewCameraDistance = (radius, fov, aspect) => {
    const verticalHalf = THREE.MathUtils.degToRad(fov * .5);
    const horizontalHalf = Math.atan(Math.tan(verticalHalf) * Math.max(aspect, .0001));
    return Math.max(radius, .01) * 1.08 / Math.sin(Math.min(verticalHalf, horizontalHalf));
};

// A lightweight turntable renderer for the selected showroom hull. The old
// card grid created several small WebGL contexts; the broker now keeps one
// large preview alive and disposes it when the market re-renders or the player
// launches. A voxel hull renders immediately, then the flight GLB swaps in.
export class ShipPreview {
    constructor(container, variant, options={}) {
        this.container = container;
        this.variant = variant;
        this.disposed = false;
        this.visible = true;
        this.frameBudget = new FrameBudget();
        const touchDevice = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: touchDevice ? 'low-power' : 'default',
            depth: true,
            stencil: false,
        });
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.NeutralToneMapping;
        this.renderer.toneMappingExposure = 1.18;
        this.renderer.setPixelRatio(touchDevice ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.domElement.className = 'ship-preview-canvas';
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
        this.renderer.domElement.style.imageRendering = 'auto';
        this.renderer.domElement.setAttribute('aria-hidden', 'true');
        container.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 1000);
        this.scene.add(this.camera);
        this.createLighting();
        this.scene.environment = this.createEnvironment();

        // The voxel hull is an instant placeholder: it keeps the card from
        // flashing empty while the GLB fetch is in flight, exactly like the
        // flight scene's voxel-until-GLB path.
        const placeholder = createVoxelShipModel(variant, paletteForFaction('player'));
        this.pivot = new THREE.Group();
        this.model = placeholder.group;
        this.pivot.add(this.model);
        this.scene.add(this.pivot);
        this.frameModel();

        // Swap in the real hull once it loads; it carries the same baked yaw +
        // scale the flight scene uses, so the showroom matches the ship you fly.
        loadPreviewGlb(variant,options).then((glb) => {
            if (this.disposed) {
                if (glb)
                    disposeObject(glb);
                return;
            }
            if (!glb)
                return; // load failed; keep the voxel placeholder
            this.pivot.remove(this.model);
            disposeObject(this.model);
            this.model = glb;
            this.pivot.add(glb);
            this.frameModel();
        });

        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(container);
        if (typeof IntersectionObserver === 'function') {
            this.visibilityObserver = new IntersectionObserver(entries => {
                this.visible = entries.some(entry => entry.isIntersecting);
                this.frameBudget.reset();
            });
            this.visibilityObserver.observe(container);
        }
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
        const rotation = this.pivot.rotation.y;
        this.pivot.rotation.y = 0;
        const box = new THREE.Box3().setFromObject(this.pivot);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        this.model.position.sub(center);
        this.modelRadius = size.length() * 0.5;
        this.pivot.rotation.y = rotation;
        this.updateCameraFraming();
    }
    updateCameraFraming() {
        const aspect = this.container.clientWidth / Math.max(1, this.container.clientHeight);
        const distance = previewCameraDistance(this.modelRadius ?? 1, this.camera.fov, aspect);
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
        this.updateCameraFraming();
    }
    tick = (now) => {
        if (this.disposed)
            return;
        if (this.visible && !document.hidden && this.frameBudget.take(now, 30) !== null) {
            this.pivot.rotation.y = this.clock.getElapsedTime() * 0.5;
            this.renderer.render(this.scene, this.camera);
        }
        this.rafId = requestAnimationFrame(this.tick);
    };
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        cancelAnimationFrame(this.rafId);
        this.resizeObserver.disconnect();
        this.visibilityObserver?.disconnect();
        disposeObject(this.pivot);
        this.scene.environment?.dispose?.();
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
// Load one GLB hull for the showroom, baking in the same per-variant yaw and
// world scale the flight scene applies. Each preview owns its copy, so cards
// can be disposed independently (variants never repeat in a dock's stock).
export const loadPreviewGlb = async (variant,options={}) => {
 const config=GLB_SHIP_CONFIG[variant];if(!config)return null;
 const hullId=equipmentHullId(variant),hull=FLEET_EQUIPMENT[hullId];
 const entity={id:'player',faction:'player',livery:options.paint??'original'};
 const paint=resolveFleetPaint(hullId,entity);
 try {
  const model=await loadGlb(fleetPaintPath(hullId,paint)??config.path??`assets/models/ships/${config.file}`);
  model.rotation.y=config.yaw;model.scale.setScalar(config.scale*(config.baseScale??1));
  const assembly=new THREE.Group();assembly.add(model);model.updateMatrixWorld(true);
  let armor;model.traverse(o=>{if(!armor&&o.material?.map&&!/glass|canopy|window/i.test(o.material.name))armor=o.material;});
  for(const [i,t]of (hull?.turrets??[]).entries()) {
   if(t.embedded||options.fit&&!options.fit.turrets?.[i])continue;
   const turret=createTurretModel(t.kind,t.size,t.pedestal??0,t.footprintScale??1);turret.name=`equipped-turret-${i}`;
   turret.position.fromArray(t.position);turret.quaternion.copy(equipmentRotation(t.normal));turret.scale.multiplyScalar(t.scale);
   if(hullId==='legionary'||hullId==='blade'&&Math.abs(t.normal[2])>.9)turret.userData.pitch.rotation.x=Math.PI/2;
   if(armor)paintFrigateTurret(turret,armor);assembly.add(turret);
  }
  applyFleetPaint(assembly,hullId,entity);
  // Only fitted, surviving stowed drones are shown on the owned ship.
  const bays=options.fit?.droneBays;
  if(bays)for(let bay=0;bay<bays.length;bay++)for(let slot=0;slot<bays[bay].unitIds.length;slot++) {
   const unit=options.fleet?.unitsById?.[bays[bay].unitIds[slot]];if(!unit||unit.hull<=0||unit.state!=='stowed')continue;
   const dock=droneDock(hullId,unit.type,bay,slot);if(!dock)continue;
   const drone=await loadGlb(`assets/models/drones/${unit.type==='mining'?'mining':'combat'}-drone.glb`);
   drone.scale.setScalar(1.15);drone.position.fromArray(dock.position);drone.quaternion.copy(equipmentRotation(dock.normal));
   if(unit.type==='repair'||unit.type==='attack')drone.traverse(o=>{if(o.isMesh)o.material.color.lerp(new THREE.Color(unit.type==='repair'?0x68ffb0:0xff7860),.25);});
   assembly.add(drone);
  }
  assembly.userData.livery=paint;return assembly;
 }catch(error){console.warn(`GLB hull ${variant} failed to load for the shipyard preview.`,error);return null;}
};
function equipmentRotation(normal) {
 const n=new THREE.Vector3(...normal).normalize(),z=new THREE.Vector3(0,0,1).addScaledVector(n,-n.z);
 if(z.lengthSq()<.01)z.set(1,0,0);z.normalize();const x=n.clone().cross(z).normalize();z.crossVectors(x,n);
 return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,n,z));
}
// Release the GPU resources (geometry, materials, textures) of one model
// subtree. Used both when a placeholder is swapped out and on final dispose.
export const disposeObject = (root) => {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    root.traverse((object) => {
        if (!(object instanceof THREE.Mesh))
            return;
        if (object.geometry && !object.geometry.userData.shared) geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material])
            if (material && !material.userData.shared) materials.add(material);
    });
    for (const material of materials)
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    for (const geometry of geometries) geometry.dispose();
    for (const texture of textures) texture.dispose();
    for (const material of materials) material.dispose();
};
