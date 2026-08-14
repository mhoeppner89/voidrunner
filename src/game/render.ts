import * as THREE from 'three';
import { LOCATIONS } from './data';
import { clamp, seededRandom } from './random';
import type {
  AsteroidNode,
  FlightMode,
  LocationId,
  ProjectileEntity,
  PickupEntity,
  ShipEntity,
  Vec3Tuple,
  WreckNode,
} from './types';
import type { GraveyardPiece } from './worldData';

interface TimedEffect {
  object: THREE.Object3D;
  velocities: THREE.Vector3[];
  life: number;
  maxLife: number;
  points?: THREE.Points;
}

const tupleToVector = (tuple: Vec3Tuple, out = new THREE.Vector3()): THREE.Vector3 => out.set(tuple[0], tuple[1], tuple[2]);

const cssHex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

const factionColor = (faction: ShipEntity['faction']): number => {
  switch (faction) {
    case 'concord':
      return 0x6eb4d0;
    case 'free-merchants':
      return 0xd39b52;
    case 'frontier-miners':
      return 0xbba06c;
    case 'salvage-union':
      return 0x76a69b;
    case 'red-talons':
      return 0xcf4d3c;
  }
};

export class SpaceRenderer {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(74, 1, 0.08, 3400);
  readonly renderer: THREE.WebGLRenderer;

  private readonly shell: HTMLElement | null;
  private readonly dynamicRoot = new THREE.Group();
  private readonly locationMeshes = new Map<LocationId, THREE.Object3D>();
  private readonly shipMeshes = new Map<string, THREE.Group>();
  private readonly projectileMeshes = new Map<string, THREE.Object3D>();
  private readonly pickupMeshes = new Map<string, THREE.Object3D>();
  private readonly graveyardMeshes = new Map<string, THREE.Object3D>();
  private readonly wreckNodeMeshes = new Map<string, THREE.Object3D>();
  private readonly effects: TimedEffect[] = [];
  private readonly cockpit = new THREE.Group();
  private readonly cockpitWarning: THREE.Mesh;
  private readonly utilityBeam: THREE.Mesh;
  private readonly utilityBeamMaterial: THREE.MeshBasicMaterial;
  private readonly tmpMatrix = new THREE.Matrix4();
  private readonly tmpPosition = new THREE.Vector3();
  private readonly tmpQuaternion = new THREE.Quaternion();
  private readonly tmpScale = new THREE.Vector3();
  private readonly pixelTextures = new Set<THREE.Texture>();
  private readonly screenTextures: THREE.CanvasTexture[] = [];
  private readonly forward = new THREE.Vector3();
  private asteroidMesh!: THREE.InstancedMesh;
  private asteroids: AsteroidNode[];
  private graveyard: GraveyardPiece[];
  private wreckNodes: WreckNode[];
  private viewportWidth = 1;
  private viewportHeight = 1;
  private lastQualityScale = 1;
  private qualityMode: 'auto' | 'low' | 'high';
  private contextLost = false;
  private fovTarget = 74;
  private targetId?: string;
  private selectedAsteroidId?: string;
  private selectedWreckId?: string;

  constructor(
    private readonly container: HTMLElement,
    seed: number,
    asteroids: AsteroidNode[],
    graveyard: GraveyardPiece[],
    wreckNodes: WreckNode[],
    quality: 'auto' | 'low' | 'high',
  ) {
    this.asteroids = asteroids;
    this.qualityMode = quality;
    this.shell = this.container.closest<HTMLElement>('#game-shell');
    this.graveyard = graveyard;
    this.wreckNodes = wreckNodes;

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      depth: true,
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.24;
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = false;
    this.renderer.setClearColor(0x061331, 1);
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.id = 'space-canvas';
    this.renderer.domElement.classList.add('retro-pixel-canvas');
    this.renderer.domElement.style.imageRendering = 'pixelated';
    this.renderer.domElement.setAttribute('aria-label', 'Three-dimensional spaceflight view');

    this.scene.fog = new THREE.FogExp2(0x071945, 0.00034);
    this.scene.add(this.dynamicRoot);
    this.scene.add(this.camera);

    this.createLighting();
    this.createStarfield(seed, quality);
    this.createNebulae(seed, quality);
    this.createFieldDust(seed, quality);
    this.createLocations();
    this.asteroidMesh = this.createAsteroids();
    this.createGraveyard();
    this.createWreckNodes();
    this.createCockpit();

    this.utilityBeamMaterial = new THREE.MeshBasicMaterial({
      color: 0x83e7d4,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.utilityBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, 1, 8, 1, true), this.utilityBeamMaterial);
    this.utilityBeam.visible = false;
    this.scene.add(this.utilityBeam);

    this.cockpitWarning = this.cockpit.getObjectByName('warning-light') as THREE.Mesh;
    window.addEventListener('resize', this.resize);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
    this.resize();
  }

  private createLighting(): void {
    const ambient = new THREE.HemisphereLight(0x8fb9e8, 0x1b2148, 1.65);
    this.scene.add(ambient);
    const sunLight = new THREE.PointLight(0xffe2aa, 22000, 2200, 1.65);
    sunLight.position.set(0, 0, 0);
    this.scene.add(sunLight);
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(18, 28, 16),
      new THREE.MeshBasicMaterial({ color: 0xffd889 }),
    );
    this.scene.add(sun);
    const corona = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.radialTexture('#fff0b2', '#ff8f36'),
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    corona.scale.setScalar(92);
    this.scene.add(corona);
  }

  private radialTexture(inner: string, outer: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d')!;
    const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, inner);
    gradient.addColorStop(0.22, inner);
    gradient.addColorStop(1, `${outer}00`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private createStarfield(seed: number, quality: 'auto' | 'low' | 'high'): void {
    const rng = seededRandom(`${seed}:stars`);
    const count = quality === 'low' ? 1250 : 2200;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();
    for (let index = 0; index < count; index += 1) {
      const radius = 1200 + rng() * 1200;
      const theta = rng() * Math.PI * 2;
      const phi = Math.acos(2 * rng() - 1);
      positions[index * 3] = Math.sin(phi) * Math.cos(theta) * radius;
      positions[index * 3 + 1] = Math.cos(phi) * radius;
      positions[index * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
      color.setHSL(0.57 + (rng() - 0.5) * 0.2, 0.32 + rng() * 0.48, 0.74 + rng() * 0.24);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({ size: quality === 'low' ? 1.3 : 1.6, sizeAttenuation: false, vertexColors: true });
    this.scene.add(new THREE.Points(geometry, material));
  }

  private createNebulae(seed: number, quality: 'auto' | 'low' | 'high'): void {
    if (quality === 'low') return;
    const rng = seededRandom(`${seed}:nebula`);
    const texture = this.nebulaTexture(seed);
    for (let index = 0; index < 3; index += 1) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      const angle = rng() * Math.PI * 2;
      sprite.position.set(Math.cos(angle) * 1500, (rng() - 0.5) * 650, Math.sin(angle) * 1500);
      sprite.scale.set(900 + rng() * 500, 500 + rng() * 300, 1);
      this.scene.add(sprite);
    }
  }

  private nebulaTexture(seed: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d')!;
    const rng = seededRandom(`${seed}:nebula-texture`);
    context.clearRect(0, 0, 512, 512);
    for (let i = 0; i < 42; i += 1) {
      const x = rng() * 512;
      const y = rng() * 512;
      const radius = 35 + rng() * 120;
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      const hue = rng() > 0.55 ? '52, 105, 126' : '93, 57, 104';
      gradient.addColorStop(0, `rgba(${hue}, ${0.035 + rng() * 0.08})`);
      gradient.addColorStop(1, `rgba(${hue}, 0)`);
      context.fillStyle = gradient;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private configurePixelTexture(texture: THREE.CanvasTexture, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestMipmapNearestFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    this.pixelTextures.add(texture);
    return texture;
  }

  private createPixelPanelTexture(
    seed: string,
    base: number,
    accent: number,
    kind: 'hull' | 'metal' | 'rock' | 'rust' | 'planet' = 'metal',
    size = 64,
  ): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d')!;
    const rng = seededRandom(`pixel-texture:${seed}:${kind}`);
    const baseColor = new THREE.Color(base);
    const accentColor = new THREE.Color(accent);
    context.fillStyle = cssHex(base);
    context.fillRect(0, 0, size, size);

    const block = kind === 'planet' ? 2 : kind === 'rock' ? 4 : 8;
    for (let y = 0; y < size; y += block) {
      for (let x = 0; x < size; x += block) {
        const noise = (rng() - 0.5) * (kind === 'rock' ? 0.46 : kind === 'planet' ? 0.28 : 0.18);
        const shade = baseColor.clone().offsetHSL((rng() - 0.5) * 0.018, (rng() - 0.5) * 0.08, noise);
        if (kind === 'rust' && rng() > 0.72) shade.lerp(new THREE.Color(0x6f3522), 0.55 + rng() * 0.3);
        if (kind === 'rock' && rng() > 0.83) shade.lerp(accentColor, 0.18 + rng() * 0.22);
        context.fillStyle = `#${shade.getHexString()}`;
        context.fillRect(x, y, block, block);
      }
    }

    if (kind === 'hull' || kind === 'metal' || kind === 'rust') {
      context.strokeStyle = `rgba(${Math.round(accentColor.r * 255)}, ${Math.round(accentColor.g * 255)}, ${Math.round(accentColor.b * 255)}, .38)`;
      context.lineWidth = 1;
      for (let x = 0; x < size; x += 16) context.strokeRect(x + 0.5, 0.5, 15, size - 1);
      for (let y = 0; y < size; y += 16) context.strokeRect(0.5, y + 0.5, size - 1, 15);
      context.fillStyle = 'rgba(3, 5, 5, .6)';
      for (let i = 0; i < size / 8; i += 1) {
        const x = Math.floor(rng() * (size - 6));
        const y = Math.floor(rng() * (size - 2));
        context.fillRect(x, y, 4 + Math.floor(rng() * 8), 1);
      }
      if (kind === 'hull') {
        context.fillStyle = `rgba(${Math.round(accentColor.r * 255)}, ${Math.round(accentColor.g * 255)}, ${Math.round(accentColor.b * 255)}, .62)`;
        for (let i = 0; i < 6; i += 1) {
          const x = 4 + Math.floor(rng() * (size - 12));
          const y = 4 + Math.floor(rng() * (size - 12));
          context.fillRect(x, y, 6, 2);
        }
      }
    } else if (kind === 'planet') {
      context.globalAlpha = 0.52;
      for (let y = 4; y < size; y += 7) {
        context.fillStyle = rng() > 0.5 ? cssHex(accent) : 'rgba(255,255,255,.08)';
        context.fillRect(0, y, size, rng() > 0.8 ? 2 : 1);
      }
      context.globalAlpha = 1;
    }

    return this.configurePixelTexture(new THREE.CanvasTexture(canvas));
  }

  private createInstrumentTexture(seed: string, accent = 0x62d4bc): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    const rng = seededRandom(`instrument:${seed}`);
    context.fillStyle = '#020807';
    context.fillRect(0, 0, 128, 64);
    context.strokeStyle = 'rgba(73, 122, 108, .55)';
    context.lineWidth = 1;
    for (let x = 0; x <= 128; x += 8) {
      context.beginPath();
      context.moveTo(x + 0.5, 0);
      context.lineTo(x + 0.5, 64);
      context.stroke();
    }
    for (let y = 0; y <= 64; y += 8) {
      context.beginPath();
      context.moveTo(0, y + 0.5);
      context.lineTo(128, y + 0.5);
      context.stroke();
    }
    const color = new THREE.Color(accent);
    context.fillStyle = `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},.9)`;
    for (let i = 0; i < 24; i += 1) {
      const x = 6 + Math.floor(rng() * 116);
      const y = 6 + Math.floor(rng() * 52);
      context.fillRect(x, y, 2 + Math.floor(rng() * 8), rng() > 0.72 ? 2 : 1);
    }
    context.strokeStyle = `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},.9)`;
    context.beginPath();
    context.moveTo(6, 50);
    for (let x = 8; x < 124; x += 4) context.lineTo(x, 42 - Math.floor(rng() * 18));
    context.stroke();
    const texture = this.configurePixelTexture(new THREE.CanvasTexture(canvas));
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    this.screenTextures.push(texture);
    return texture;
  }

  private createGrimeTexture(seed: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 160;
    const context = canvas.getContext('2d')!;
    const rng = seededRandom(`grime:${seed}`);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(205, 184, 137, .12)';
    for (let i = 0; i < 85; i += 1) {
      const x = Math.floor(rng() * canvas.width);
      const y = Math.floor(rng() * canvas.height);
      const size = rng() > 0.9 ? 2 : 1;
      context.fillRect(x, y, size, size);
    }
    context.strokeStyle = 'rgba(192, 166, 118, .13)';
    context.lineWidth = 1;
    for (let i = 0; i < 10; i += 1) {
      const x = rng() * canvas.width;
      const y = rng() * canvas.height;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + (rng() - 0.5) * 48, y + (rng() - 0.5) * 16);
      context.stroke();
    }
    const texture = this.configurePixelTexture(new THREE.CanvasTexture(canvas));
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  private createFieldDust(seed: number, quality: 'auto' | 'low' | 'high'): void {
    const rng = seededRandom(`${seed}:field-dust`);
    const count = quality === 'low' ? 260 : 520;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const field = rng() > 0.5 ? LOCATIONS.shardbelt.position : LOCATIONS['mourning-line'].position;
      positions[index * 3] = field[0] + (rng() - 0.5) * 300;
      positions[index * 3 + 1] = field[1] + (rng() - 0.5) * 190;
      positions[index * 3 + 2] = field[2] + (rng() - 0.5) * 300;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0x7fc7e8,
      size: quality === 'high' ? 0.85 : 0.72,
      transparent: true,
      opacity: 0.34,
      sizeAttenuation: true,
      depthWrite: false,
    });
    this.scene.add(new THREE.Points(geometry, material));
  }

  private createLocations(): void {
    this.createPlanet('vesper', 0xa85f36, 0x281611, 0xd78a54, false);
    this.createPlanet('azure', 0x2b8889, 0x0d2f3a, 0x83e0c7, true);
    this.createHelixStation();
    this.createRookStation();

    (Object.keys(LOCATIONS) as LocationId[]).forEach((id) => {
      const location = LOCATIONS[id];
      const beacon = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.radialTexture(location.accent, location.accent),
          transparent: true,
          opacity: location.kind === 'field' || location.kind === 'graveyard' ? 0.28 : 0.12,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      beacon.position.set(...location.position);
      beacon.scale.setScalar(location.radius * (location.kind === 'planet' ? 3.5 : 2.4));
      beacon.name = `beacon-${id}`;
      this.scene.add(beacon);
    });
  }

  private createPlanet(id: 'vesper' | 'azure', color: number, dark: number, atmosphere: number, ringed: boolean): void {
    const location = LOCATIONS[id];
    const group = new THREE.Group();
    group.position.set(...location.position);
    const surfaceTexture = this.createPixelPanelTexture(`${id}-surface`, color, atmosphere, 'planet', 128);
    surfaceTexture.repeat.set(3, 1.5);
    const surface = new THREE.Mesh(
      new THREE.SphereGeometry(location.radius, 32, 20),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: surfaceTexture,
        roughness: 0.94,
        metalness: 0.02,
        emissive: dark,
        emissiveIntensity: 0.16,
        flatShading: true,
      }),
    );
    surface.name = 'surface';
    group.add(surface);
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(location.radius * 1.01, 28, 18),
      new THREE.MeshBasicMaterial({ color: atmosphere, transparent: true, opacity: id === 'azure' ? 0.12 : 0.055, depthWrite: false, wireframe: id === 'vesper' }),
    );
    clouds.name = 'clouds';
    group.add(clouds);
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(location.radius * 1.06, 32, 18),
      new THREE.MeshBasicMaterial({ color: atmosphere, transparent: true, opacity: 0.09, side: THREE.BackSide, depthWrite: false }),
    );
    group.add(halo);
    if (ringed) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(location.radius * 1.45, location.radius * 2.05, 64),
        new THREE.MeshBasicMaterial({ color: 0x6c8d87, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }),
      );
      ring.rotation.x = Math.PI / 2.7;
      ring.rotation.z = 0.38;
      group.add(ring);
    }
    this.scene.add(group);
    this.locationMeshes.set(id, group);
  }

  private createHelixStation(): void {
    const location = LOCATIONS.helix;
    const group = new THREE.Group();
    group.position.set(...location.position);
    group.rotation.set(0.18, 0.45, -0.08);

    const hullMap = this.createPixelPanelTexture('helix-hull', 0x4a463d, 0xd69b42, 'metal');
    hullMap.repeat.set(5, 2);
    const darkMap = this.createPixelPanelTexture('helix-dark', 0x171d1c, 0x675638, 'metal');
    darkMap.repeat.set(4, 2);
    const metal = new THREE.MeshStandardMaterial({ color: 0x9a907d, map: hullMap, roughness: 0.72, metalness: 0.72, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: 0x6c7168, map: darkMap, roughness: 0.84, metalness: 0.62, flatShading: true });
    const accent = new THREE.MeshBasicMaterial({ color: 0xe0a343, toneMapped: false });
    const window = new THREE.MeshBasicMaterial({ color: 0x59cbb8, toneMapped: false });

    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 6.2, 48, 12), metal);
    spindle.rotation.z = Math.PI / 2;
    group.add(spindle);
    for (const x of [-18, -6, 8, 18]) {
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(7.1, 7.1, 2.1, 12), dark);
      collar.rotation.z = Math.PI / 2;
      collar.position.x = x;
      group.add(collar);
    }

    const ring = new THREE.Group();
    ring.name = 'rotor';
    const torus = new THREE.Mesh(new THREE.TorusGeometry(20.5, 3.2, 8, 36), metal);
    ring.add(torus);
    const innerTorus = new THREE.Mesh(new THREE.TorusGeometry(14.2, 0.72, 6, 32), dark);
    ring.add(innerTorus);
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(1.2, 13, 1.2), dark);
      spoke.position.set(Math.cos(angle) * 7.4, Math.sin(angle) * 7.4, 0);
      spoke.rotation.z = angle - Math.PI / 2;
      ring.add(spoke);
      const module = new THREE.Mesh(new THREE.BoxGeometry(index % 3 === 0 ? 8.6 : 6.2, 4.2, 4.8), index % 2 ? dark : metal);
      module.position.set(Math.cos(angle) * 20.5, Math.sin(angle) * 20.5, 0);
      module.rotation.z = angle;
      ring.add(module);
      const light = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.32, 0.22), index % 3 === 0 ? window : accent);
      light.position.set(Math.cos(angle) * 24.2, Math.sin(angle) * 24.2, 1.7);
      light.rotation.z = angle;
      ring.add(light);
    }
    group.add(ring);

    const refinery = new THREE.Group();
    refinery.position.x = -22;
    for (const y of [-6.5, 0, 6.5]) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.7, 12, 10), metal);
      tank.rotation.z = Math.PI / 2;
      tank.position.y = y;
      refinery.add(tank);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 4.1, 1, 10), dark);
      cap.rotation.z = Math.PI / 2;
      cap.position.set(-6, y, 0);
      refinery.add(cap);
    }
    group.add(refinery);

    const dockAssembly = new THREE.Group();
    dockAssembly.position.x = 27;
    const dock = new THREE.Mesh(new THREE.CylinderGeometry(7.8, 7.8, 13, 12, 1, true), dark);
    dock.rotation.z = Math.PI / 2;
    dockAssembly.add(dock);
    const bayRim = new THREE.Mesh(new THREE.TorusGeometry(7.6, 0.8, 6, 12), metal);
    bayRim.rotation.y = Math.PI / 2;
    bayRim.position.x = 6.5;
    dockAssembly.add(bayRim);
    const bayDark = new THREE.Mesh(new THREE.CircleGeometry(6.6, 12), new THREE.MeshBasicMaterial({ color: 0x010302 }));
    bayDark.rotation.y = Math.PI / 2;
    bayDark.position.x = 6.55;
    dockAssembly.add(bayDark);
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, 0.7), index % 2 ? accent : window);
      lamp.position.set(6.72, Math.cos(angle) * 6.9, Math.sin(angle) * 6.9);
      dockAssembly.add(lamp);
    }
    group.add(dockAssembly);

    this.scene.add(group);
    this.locationMeshes.set('helix', group);
  }

  private createRookStation(): void {
    const location = LOCATIONS.rook;
    const group = new THREE.Group();
    group.position.set(...location.position);
    group.rotation.set(-0.08, -0.36, 0.12);

    const hullMap = this.createPixelPanelTexture('rook-hull', 0x44535b, 0x7cc6dc, 'metal');
    hullMap.repeat.set(4, 3);
    const darkMap = this.createPixelPanelTexture('rook-dark', 0x141c20, 0x456b78, 'metal');
    darkMap.repeat.set(5, 3);
    const metal = new THREE.MeshStandardMaterial({ color: 0xa1b2b5, map: hullMap, roughness: 0.61, metalness: 0.82, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: 0x6f7b7c, map: darkMap, roughness: 0.78, metalness: 0.76, flatShading: true });
    const accent = new THREE.MeshBasicMaterial({ color: 0x7fd4eb, toneMapped: false });
    const warning = new THREE.MeshBasicMaterial({ color: 0xe06343, toneMapped: false });

    const core = new THREE.Mesh(new THREE.BoxGeometry(22, 18, 34), metal);
    group.add(core);
    const armorTop = new THREE.Mesh(new THREE.BoxGeometry(16, 5, 39), dark);
    armorTop.position.y = 10.5;
    group.add(armorTop);
    const armorBottom = armorTop.clone();
    armorBottom.position.y = -10.5;
    group.add(armorBottom);

    for (let axis = 0; axis < 4; axis += 1) {
      const angle = axis * Math.PI * 0.5;
      const arm = new THREE.Group();
      arm.rotation.z = angle;
      const truss = new THREE.Mesh(new THREE.BoxGeometry(8, 5.5, 34), dark);
      truss.position.x = 18;
      arm.add(truss);
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(11, 10, 15), metal);
      pylon.position.set(30, 0, axis % 2 ? 7 : -7);
      arm.add(pylon);
      const turretBase = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.2, 6.2, 8), metal);
      turretBase.position.set(37, 0, 0);
      turretBase.rotation.z = Math.PI / 2;
      arm.add(turretBase);
      const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 9, 6), dark);
      gun.rotation.z = Math.PI / 2;
      gun.position.set(42, 0, -2.2);
      arm.add(gun);
      const gun2 = gun.clone();
      gun2.position.z = 2.2;
      arm.add(gun2);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.36, 0.36), axis === 2 ? warning : accent);
      strip.position.set(31, -5.1, 7.7);
      arm.add(strip);
      group.add(arm);
    }

    const dockHousing = new THREE.Mesh(new THREE.BoxGeometry(16, 14, 12), dark);
    dockHousing.position.z = 23;
    group.add(dockHousing);
    const dockMouth = new THREE.Mesh(new THREE.CircleGeometry(6.2, 8), new THREE.MeshBasicMaterial({ color: 0x010304 }));
    dockMouth.position.z = 29.1;
    group.add(dockMouth);
    for (let i = 0; i < 8; i += 1) {
      const a = i / 8 * Math.PI * 2;
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.25), i % 3 === 0 ? warning : accent);
      lamp.position.set(Math.cos(a) * 7.2, Math.sin(a) * 7.2, 29.4);
      group.add(lamp);
    }

    for (const x of [-7, 0, 7]) {
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 13, 6), dark);
      antenna.position.set(x, 17, -9 + x * 0.6);
      group.add(antenna);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.7, 6, 4), x === 0 ? warning : accent);
      tip.position.set(x, 23.7, -9 + x * 0.6);
      group.add(tip);
    }

    this.scene.add(group);
    this.locationMeshes.set('rook', group);
  }

  private createAsteroids(): THREE.InstancedMesh {
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    const rockMap = this.createPixelPanelTexture('shardbelt-rock', 0x625e54, 0xb89d67, 'rock');
    rockMap.repeat.set(2.4, 2.4);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: rockMap,
      roughness: 1,
      metalness: 0.06,
      flatShading: true,
      vertexColors: true,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, this.asteroids.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.asteroidMesh = mesh;
    this.updateAsteroidInstances();
    return mesh;
  }

  private updateAsteroidInstances(): void {
    if (!this.asteroidMesh) return;
    const color = new THREE.Color();
    this.asteroids.forEach((node, index) => {
      this.tmpPosition.set(...node.position);
      this.tmpQuaternion.setFromEuler(new THREE.Euler(...node.rotation));
      this.tmpScale.set(node.radius * node.scale[0], node.radius * node.scale[1], node.radius * node.scale[2]);
      this.tmpMatrix.compose(this.tmpPosition, this.tmpQuaternion, this.tmpScale);
      this.asteroidMesh.setMatrixAt(index, this.tmpMatrix);
      if (node.id === this.selectedAsteroidId) color.setHex(0xcfe884);
      else if (node.scanned) color.setHex(node.richness > 1.65 ? 0x9c8b68 : 0x696257);
      else color.setHex(0x5b5851);
      this.asteroidMesh.setColorAt(index, color);
    });
    this.asteroidMesh.instanceMatrix.needsUpdate = true;
    if (this.asteroidMesh.instanceColor) this.asteroidMesh.instanceColor.needsUpdate = true;
  }

  private createGraveyard(): void {
    const metalMap = this.createPixelPanelTexture('graveyard-metal', 0x344144, 0x7ca79f, 'metal');
    metalMap.repeat.set(3.5, 2.2);
    const rustMap = this.createPixelPanelTexture('graveyard-rust', 0x48362f, 0xb7683e, 'rust');
    rustMap.repeat.set(4.2, 2.6);
    const metal = new THREE.MeshStandardMaterial({ color: 0x879394, map: metalMap, roughness: 0.76, metalness: 0.74, flatShading: true });
    const rust = new THREE.MeshStandardMaterial({ color: 0x8f7768, map: rustMap, roughness: 0.92, metalness: 0.48, flatShading: true });
    const dead = new THREE.MeshBasicMaterial({ color: 0x9dbbb3, transparent: true, opacity: 0.25 });
    this.graveyard.forEach((piece) => {
      let geometry: THREE.BufferGeometry;
      switch (piece.kind) {
        case 'beam':
          geometry = new THREE.BoxGeometry(1, 1, 1);
          break;
        case 'engine':
          geometry = new THREE.CylinderGeometry(0.7, 1, 1, 10, 1, true);
          break;
        case 'panel':
          geometry = new THREE.BoxGeometry(1, 0.12, 1);
          break;
        case 'ring':
          geometry = new THREE.TorusGeometry(1, 0.18, 6, 18);
          break;
        case 'hull':
        default:
          geometry = new THREE.BoxGeometry(1, 1, 1);
          break;
      }
      const mesh = new THREE.Mesh(geometry, piece.kind === 'panel' || piece.id.includes('carrier') ? rust : metal);
      mesh.position.set(...piece.position);
      mesh.rotation.set(...piece.rotation);
      mesh.scale.set(...piece.scale);
      mesh.userData.spin = new THREE.Vector3(...piece.spin);
      this.scene.add(mesh);
      this.graveyardMeshes.set(piece.id, mesh);
      if (piece.kind === 'engine') {
        const glow = new THREE.Mesh(new THREE.CircleGeometry(0.45, 12), dead);
        glow.position.z = 0.52;
        mesh.add(glow);
      }
    });
  }

  private createWreckNodes(): void {
    const geometry = new THREE.OctahedronGeometry(1, 0);
    this.wreckNodes.forEach((node) => {
      const material = new THREE.MeshBasicMaterial({
        color: node.rarity === 'rare' ? 0xd9b86f : node.rarity === 'uncommon' ? 0x79b9ae : 0x647279,
        transparent: true,
        opacity: 0.28,
        wireframe: true,
      });
      const marker = new THREE.Mesh(geometry, material);
      marker.position.set(...node.position);
      marker.scale.setScalar(node.radius * 1.6);
      marker.visible = node.scanned || node.id === this.selectedWreckId;
      this.scene.add(marker);
      this.wreckNodeMeshes.set(node.id, marker);
    });
  }

  private createCockpit(): void {
    const frameMap = this.createPixelPanelTexture('cockpit-frame', 0x171a18, 0x8f7544, 'metal', 64);
    frameMap.repeat.set(5, 2);
    const consoleMap = this.createPixelPanelTexture('cockpit-console', 0x242821, 0xd29a3f, 'rust', 64);
    consoleMap.repeat.set(4, 2);
    const frameMaterial = new THREE.MeshBasicMaterial({ color: 0x77776a, map: frameMap, depthTest: false, depthWrite: false });
    const darkMaterial = new THREE.MeshBasicMaterial({ color: 0x343a35, map: consoleMap, depthTest: false, depthWrite: false });
    const edgeMaterial = new THREE.MeshBasicMaterial({ color: 0x756e58, depthTest: false, depthWrite: false });
    const blackMaterial = new THREE.MeshBasicMaterial({ color: 0x050807, depthTest: false, depthWrite: false });
    const amberMaterial = new THREE.MeshBasicMaterial({ color: 0xe1a343, depthTest: false, depthWrite: false, toneMapped: false });
    const tealMaterial = new THREE.MeshBasicMaterial({ color: 0x55cdb8, depthTest: false, depthWrite: false, toneMapped: false });
    const warningMaterial = new THREE.MeshBasicMaterial({ color: 0x6f211a, depthTest: false, depthWrite: false, toneMapped: false });
    const leftScreenMaterial = new THREE.MeshBasicMaterial({ map: this.createInstrumentTexture('cockpit-left', 0x57d6bc), color: 0xb2ffe9, depthTest: false, depthWrite: false });
    const rightScreenMaterial = new THREE.MeshBasicMaterial({ map: this.createInstrumentTexture('cockpit-right', 0x58c8d6), color: 0xb9f6ff, depthTest: false, depthWrite: false });

    const addMesh = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      position: [number, number, number],
      rotation: [number, number, number] = [0, 0, 0],
      order = 999,
      name?: string,
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      mesh.rotation.set(...rotation);
      mesh.renderOrder = order;
      mesh.frustumCulled = false;
      if (name) mesh.name = name;
      this.cockpit.add(mesh);
      return mesh;
    };

    addMesh(new THREE.BoxGeometry(3.15, 0.5, 0.72), darkMaterial, [0, -0.98, -1.54], [-0.12, 0, 0]);
    addMesh(new THREE.BoxGeometry(1.25, 0.26, 0.42), frameMaterial, [0, -0.73, -1.76], [-0.07, 0, 0], 1000);
    addMesh(new THREE.BoxGeometry(3.28, 0.055, 0.07), edgeMaterial, [0, -0.69, -1.92], [0, 0, 0], 1002);
    addMesh(new THREE.BoxGeometry(0.62, 0.22, 0.36), blackMaterial, [0, -0.84, -1.91], [-0.03, 0, 0], 1001);

    const leftConsole = addMesh(new THREE.BoxGeometry(1.06, 0.82, 1.28), darkMaterial, [-1.38, -0.69, -1.29], [-0.09, -0.27, -0.07]);
    const rightConsole = addMesh(new THREE.BoxGeometry(1.06, 0.82, 1.28), darkMaterial, [1.38, -0.69, -1.29], [-0.09, 0.27, 0.07]);
    leftConsole.scale.z = rightConsole.scale.z = 1.04;

    addMesh(new THREE.BoxGeometry(0.74, 0.46, 0.07), frameMaterial, [-1.09, -0.56, -1.77], [-0.05, 0.18, -0.02], 1000);
    addMesh(new THREE.PlaneGeometry(0.62, 0.34), leftScreenMaterial, [-1.085, -0.555, -1.815], [-0.05, 0.18, -0.02], 1001);
    addMesh(new THREE.BoxGeometry(0.74, 0.46, 0.07), frameMaterial, [1.09, -0.56, -1.77], [-0.05, -0.18, 0.02], 1000);
    addMesh(new THREE.PlaneGeometry(0.62, 0.34), rightScreenMaterial, [1.085, -0.555, -1.815], [-0.05, -0.18, 0.02], 1001);

    // Dense rows of instrument lamps and physical switches.
    for (let row = 0; row < 2; row += 1) {
      for (let column = 0; column < 7; column += 1) {
        const x = -0.62 + column * 0.205;
        const material = column === 6 && row === 0 ? warningMaterial : (column + row) % 3 === 0 ? tealMaterial : amberMaterial;
        const lamp = addMesh(new THREE.BoxGeometry(0.11, 0.042, 0.024), material, [x, -0.708 - row * 0.075, -1.955], [0, 0, 0], 1003);
        if (column === 6 && row === 0) lamp.name = 'warning-light';
      }
    }

    for (const side of [-1, 1]) {
      for (let column = 0; column < 3; column += 1) {
        addMesh(
          new THREE.BoxGeometry(0.085, 0.045, 0.024),
          column === 1 ? tealMaterial : amberMaterial,
          [side * (0.91 + column * 0.12), -0.85, -1.84],
          [0, side * -0.12, 0],
          1003,
        );
      }
    }

    // Heavy canopy rails, layered to create the enclosed Privateer-style cockpit silhouette.
    addMesh(new THREE.BoxGeometry(0.105, 2.55, 0.13), frameMaterial, [-1.08, 0.34, -1.56], [0, 0, -0.305], 998);
    addMesh(new THREE.BoxGeometry(0.105, 2.55, 0.13), frameMaterial, [1.08, 0.34, -1.56], [0, 0, 0.305], 998);
    addMesh(new THREE.BoxGeometry(0.052, 2.42, 0.15), edgeMaterial, [-1.01, 0.35, -1.64], [0, 0, -0.305], 999);
    addMesh(new THREE.BoxGeometry(0.052, 2.42, 0.15), edgeMaterial, [1.01, 0.35, -1.64], [0, 0, 0.305], 999);
    addMesh(new THREE.BoxGeometry(1.72, 0.12, 0.14), frameMaterial, [0, 1.13, -1.59], [0, 0, 0], 998);
    addMesh(new THREE.BoxGeometry(1.58, 0.045, 0.15), edgeMaterial, [0, 1.07, -1.66], [0, 0, 0], 999);
    addMesh(new THREE.BoxGeometry(0.5, 0.18, 0.2), darkMaterial, [0, 1.0, -1.69], [0, 0, 0], 999);

    // Console seams, vents, and fasteners.
    for (const x of [-1.42, -1.16, -0.9, 0.9, 1.16, 1.42]) {
      addMesh(new THREE.BoxGeometry(0.14, 0.025, 0.025), blackMaterial, [x, -0.91, -1.78], [0, 0, 0], 1002);
    }
    const boltGeometry = new THREE.CircleGeometry(0.025, 6);
    for (const [x, y] of [[-1.46, -0.47], [-0.82, -0.69], [0.82, -0.69], [1.46, -0.47], [-0.72, -0.93], [0.72, -0.93]] as Array<[number, number]>) {
      addMesh(boltGeometry, edgeMaterial, [x, y, -1.965], [0, 0, 0], 1004);
    }

    // A restrained grime layer gives the canopy a tactile, aged surface without hiding targets.
    addMesh(
      new THREE.PlaneGeometry(3.72, 2.38),
      new THREE.MeshBasicMaterial({
        map: this.createGrimeTexture('wayfarer-canopy'),
        transparent: true,
        opacity: 0.34,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NormalBlending,
      }),
      [0, 0.08, -1.98],
      [0, 0, 0],
      1005,
    );

    this.cockpit.traverse((object) => {
      object.frustumCulled = false;
      if (object instanceof THREE.Mesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          material.depthTest = false;
          material.depthWrite = false;
        });
      }
    });
    this.camera.add(this.cockpit);
    this.cockpit.visible = false;
  }

  private createPrismGeometry(points: Array<[number, number]>, thickness: number): THREE.BufferGeometry {
    const vertices: number[] = [];
    const half = thickness * 0.5;
    for (const [x, z] of points) vertices.push(x, half, z);
    for (const [x, z] of points) vertices.push(x, -half, z);
    const indices: number[] = [];
    const count = points.length;
    for (let i = 1; i < count - 1; i += 1) indices.push(0, i, i + 1);
    for (let i = 1; i < count - 1; i += 1) indices.push(count, count + i + 1, count + i);
    for (let i = 0; i < count; i += 1) {
      const next = (i + 1) % count;
      indices.push(i, count + i, count + next, i, count + next, next);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  private createShipMesh(entity: ShipEntity): THREE.Group {
    const group = new THREE.Group();
    const faction = factionColor(entity.faction);
    const hostile = entity.hostile;
    const primary = hostile ? 0x66352f : faction;
    const secondary = hostile ? 0xa94231 : entity.faction === 'concord' ? 0x7bc7dc : entity.faction === 'frontier-miners' ? 0xd0a34e : 0xd39b52;
    const hullMap = this.createPixelPanelTexture(`ship-${entity.role}-${entity.faction}`, primary, secondary, 'hull');
    hullMap.repeat.set(2.2, 3.2);
    const darkMap = this.createPixelPanelTexture(`ship-dark-${entity.role}`, 0x171b1b, secondary, 'metal');
    darkMap.repeat.set(2.4, 2.8);
    const hull = new THREE.MeshStandardMaterial({
      color: 0xb9b2a0,
      map: hullMap,
      roughness: 0.61,
      metalness: 0.73,
      flatShading: true,
      emissive: hostile ? 0x210705 : 0x020707,
      emissiveIntensity: hostile ? 0.2 : 0.06,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x5e625d,
      map: darkMap,
      roughness: 0.78,
      metalness: 0.66,
      flatShading: true,
      emissive: 0x010202,
      emissiveIntensity: 0.03,
    });
    const canopy = new THREE.MeshBasicMaterial({
      color: hostile ? 0xe15b3c : entity.faction === 'concord' ? 0x73d7eb : 0x54c9b7,
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
    });
    const glow = new THREE.MeshBasicMaterial({
      color: hostile ? 0xff5937 : entity.role === 'miner' ? 0xe1b04c : 0x6ad9f1,
      transparent: true,
      opacity: 0.96,
      toneMapped: false,
    });
    const accent = new THREE.MeshBasicMaterial({ color: secondary, toneMapped: false });
    const engineFlareTexture = this.radialTexture(cssHex(glow.color.getHex()), cssHex(glow.color.getHex()));

    const specs = entity.role === 'trader'
      ? { length: 8.4, width: 2.8, height: 1.2, wing: 6.4, engines: 3, scale: 1.08 }
      : entity.role === 'miner'
        ? { length: 6.8, width: 2.6, height: 1.35, wing: 5.2, engines: 2, scale: 1.04 }
        : entity.role === 'bounty'
          ? { length: 6.6, width: 2.1, height: 0.95, wing: 5.7, engines: 3, scale: 1.03 }
          : entity.role === 'patrol'
            ? { length: 6.1, width: 2.3, height: 1.05, wing: 5.4, engines: 2, scale: 1.03 }
            : entity.role === 'pirate'
              ? { length: 5.8, width: 1.9, height: 0.9, wing: 5.8, engines: 2, scale: 1 }
              : { length: 5.4, width: 1.9, height: 0.9, wing: 4.8, engines: 2, scale: 0.98 };

    const bodyPoints: Array<[number, number]> = [
      [-0.16, -specs.length * 0.52],
      [0.16, -specs.length * 0.52],
      [specs.width * 0.46, -specs.length * 0.15],
      [specs.width * 0.5, specs.length * 0.38],
      [specs.width * 0.34, specs.length * 0.5],
      [-specs.width * 0.34, specs.length * 0.5],
      [-specs.width * 0.5, specs.length * 0.38],
      [-specs.width * 0.46, -specs.length * 0.15],
    ];
    const body = new THREE.Mesh(this.createPrismGeometry(bodyPoints, specs.height), hull);
    group.add(body);

    const upperDeck = new THREE.Mesh(
      this.createPrismGeometry([
        [-specs.width * 0.23, -specs.length * 0.31],
        [specs.width * 0.23, -specs.length * 0.31],
        [specs.width * 0.31, specs.length * 0.18],
        [specs.width * 0.2, specs.length * 0.35],
        [-specs.width * 0.2, specs.length * 0.35],
        [-specs.width * 0.31, specs.length * 0.18],
      ], specs.height * 0.62),
      dark,
    );
    upperDeck.position.y = specs.height * 0.57;
    group.add(upperDeck);

    const cockpit = new THREE.Mesh(
      this.createPrismGeometry([
        [-specs.width * 0.16, -specs.length * 0.31],
        [specs.width * 0.16, -specs.length * 0.31],
        [specs.width * 0.2, -specs.length * 0.06],
        [-specs.width * 0.2, -specs.length * 0.06],
      ], specs.height * 0.14),
      canopy,
    );
    cockpit.position.y = specs.height * 0.91;
    group.add(cockpit);

    const leftWingPoints: Array<[number, number]> = [
      [-specs.width * 0.38, -specs.length * 0.16],
      [-specs.wing * 0.5, specs.length * (entity.role === 'pirate' ? -0.06 : 0.02)],
      [-specs.wing * 0.43, specs.length * 0.33],
      [-specs.width * 0.35, specs.length * 0.26],
    ];
    const rightWingPoints = leftWingPoints.map(([x, z]) => [-x, z] as [number, number]).reverse();
    const wingThickness = entity.role === 'trader' ? 0.34 : 0.24;
    const leftWing = new THREE.Mesh(this.createPrismGeometry(leftWingPoints, wingThickness), dark);
    const rightWing = new THREE.Mesh(this.createPrismGeometry(rightWingPoints, wingThickness), dark);
    leftWing.position.y = rightWing.position.y = entity.role === 'miner' ? -0.18 : -0.05;
    group.add(leftWing, rightWing);

    const addEngine = (x: number, y: number, z: number, radius = 0.34): void => {
      const engine = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.78, radius, radius * 1.7, 8, 1, true), dark);
      engine.rotation.x = Math.PI / 2;
      engine.position.set(x, y, z - radius * 0.2);
      group.add(engine);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.82, radius * 0.12, 4, 8), accent);
      rim.position.set(x, y, z + radius * 0.7);
      group.add(rim);
      const flame = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.65, 8), glow);
      flame.position.set(x, y, z + radius * 0.77);
      group.add(flame);
      const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: engineFlareTexture, transparent: true, opacity: 0.36, blending: THREE.AdditiveBlending, depthWrite: false }));
      flare.position.set(x, y, z + radius * 0.88);
      flare.scale.setScalar(radius * 3.4);
      group.add(flare);
    };

    const engineSpread = specs.engines === 3 ? 0.84 : 0.7;
    for (let index = 0; index < specs.engines; index += 1) {
      const x = (index - (specs.engines - 1) / 2) * engineSpread;
      addEngine(x, -0.05, specs.length * 0.51, entity.role === 'trader' ? 0.38 : 0.33);
    }

    if (entity.role === 'trader') {
      for (const side of [-1, 1]) {
        for (const z of [-0.35, 1.55]) {
          const pod = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.12, 2.1), hull);
          pod.position.set(side * 1.58, -0.12, z);
          group.add(pod);
          const band = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 2.16), accent);
          band.position.set(side * 1.58, 0.18, z);
          group.add(band);
        }
      }
    } else if (entity.role === 'miner') {
      for (const side of [-1, 1]) {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.66, 3.2, 8), hull);
        tank.rotation.x = Math.PI / 2;
        tank.position.set(side * 1.55, -0.15, 0.85);
        group.add(tank);
        const drillArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 2.2), dark);
        drillArm.position.set(side * 0.78, -0.22, -specs.length * 0.42);
        group.add(drillArm);
        const drill = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.72, 6), accent);
        drill.rotation.x = -Math.PI / 2;
        drill.position.set(side * 0.78, -0.22, -specs.length * 0.59);
        group.add(drill);
      }
    } else {
      const weaponCount = entity.role === 'bounty' || entity.role === 'patrol' ? 4 : 2;
      for (let index = 0; index < weaponCount; index += 1) {
        const side = index % 2 === 0 ? -1 : 1;
        const row = Math.floor(index / 2);
        const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.65, 6), dark);
        gun.rotation.x = Math.PI / 2;
        gun.position.set(side * (specs.width * 0.5 + row * 0.42), -0.18, -specs.length * 0.25 + row * 0.25);
        group.add(gun);
      }
      if (entity.role === 'pirate') {
        for (const side of [-1, 1]) {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 1.8), accent);
          blade.position.set(side * specs.wing * 0.41, 0.35, specs.length * 0.16);
          blade.rotation.z = side * -0.26;
          group.add(blade);
        }
      }
    }

    // Pixel-sized running lights make distant silhouettes readable without large HUD markers.
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.12), side < 0 ? new THREE.MeshBasicMaterial({ color: 0xd94c3d, toneMapped: false }) : new THREE.MeshBasicMaterial({ color: 0x62d5b9, toneMapped: false }));
      lamp.position.set(side * specs.wing * 0.42, 0.05, specs.length * 0.22);
      group.add(lamp);
    }

    group.scale.setScalar(specs.scale);
    group.userData.baseScale = specs.scale;
    group.userData.engineGlow = glow;
    group.userData.damageMaterials = [hull, dark];
    return group;
  }

  syncShips(entities: ShipEntity[]): void {
    const live = new Set(entities.map((entity) => entity.id));
    for (const [id, mesh] of this.shipMeshes) {
      if (!live.has(id)) {
        this.dynamicRoot.remove(mesh);
        this.disposeObject(mesh);
        this.shipMeshes.delete(id);
      }
    }
    entities.forEach((entity) => {
      let mesh = this.shipMeshes.get(entity.id);
      if (!mesh) {
        mesh = this.createShipMesh(entity);
        this.dynamicRoot.add(mesh);
        this.shipMeshes.set(entity.id, mesh);
      }
      mesh.position.set(...entity.position);
      mesh.quaternion.set(...entity.rotation);
      const damage = 1 - entity.hull / entity.maxHull;
      const baseScale = Number(mesh.userData.baseScale ?? 1);
      mesh.scale.setScalar(baseScale * (1 + Math.sin(performance.now() * 0.013 + entity.spawnTime) * 0.006));
      mesh.visible = entity.hull > 0;
      mesh.traverse((object) => {
        if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) {
          object.material.emissiveIntensity = entity.hostile ? 0.18 + damage * 0.28 : damage * 0.12;
        }
      });
    });
  }

  syncProjectiles(projectiles: ProjectileEntity[]): void {
    const live = new Set(projectiles.map((entity) => entity.id));
    for (const [id, mesh] of this.projectileMeshes) {
      if (!live.has(id)) {
        this.dynamicRoot.remove(mesh);
        this.disposeObject(mesh);
        this.projectileMeshes.delete(id);
      }
    }
    projectiles.forEach((projectile) => {
      let mesh = this.projectileMeshes.get(projectile.id);
      if (!mesh) {
        if (projectile.kind === 'laser') {
          mesh = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.08, 0.8, 3, 6),
            new THREE.MeshBasicMaterial({
              color: projectile.faction === 'player' ? 0xffc35a : projectile.faction === 'red-talons' ? 0xff4b39 : 0x75cfff,
            }),
          );
          mesh.rotation.x = Math.PI / 2;
        } else {
          const group = new THREE.Group();
          const body = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 6), new THREE.MeshBasicMaterial({ color: 0xe8e0cb }));
          body.rotation.x = -Math.PI / 2;
          group.add(body);
          const flare = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: this.radialTexture('#fff1ad', '#ff5029'),
              transparent: true,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            }),
          );
          flare.position.z = 0.55;
          flare.scale.setScalar(1.4);
          group.add(flare);
          mesh = group;
        }
        this.dynamicRoot.add(mesh);
        this.projectileMeshes.set(projectile.id, mesh);
      }
      mesh.position.set(...projectile.position);
      if (projectile.velocity[0] || projectile.velocity[1] || projectile.velocity[2]) {
        this.forward.set(projectile.velocity[0], projectile.velocity[1], projectile.velocity[2]).normalize();
        this.tmpQuaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), this.forward);
        mesh.quaternion.copy(this.tmpQuaternion);
      }
    });
  }


  syncPickups(pickups: PickupEntity[]): void {
    const live = new Set(pickups.map((pickup) => pickup.id));
    for (const [id, mesh] of this.pickupMeshes) {
      if (!live.has(id)) {
        this.dynamicRoot.remove(mesh);
        this.disposeObject(mesh);
        this.pickupMeshes.delete(id);
      }
    }
    pickups.forEach((pickup) => {
      let mesh = this.pickupMeshes.get(pickup.id);
      if (!mesh) {
        const color = pickup.source === 'mining' ? 0xd7c07a : pickup.rarity === 'rare' ? 0xe3a9ff : 0x80d1bf;
        const group = new THREE.Group();
        const body = new THREE.Mesh(
          pickup.source === 'mining' ? new THREE.DodecahedronGeometry(0.62, 0) : new THREE.BoxGeometry(0.9, 0.52, 0.72),
          new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.45, emissive: color, emissiveIntensity: 0.16 }),
        );
        group.add(body);
        const glow = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: this.radialTexture(`#${color.toString(16).padStart(6, '0')}`, `#${color.toString(16).padStart(6, '0')}`), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        glow.scale.setScalar(3.2);
        group.add(glow);
        mesh = group;
        this.dynamicRoot.add(mesh);
        this.pickupMeshes.set(pickup.id, mesh);
      }
      mesh.position.set(...pickup.position);
      mesh.rotation.x += 0.018;
      mesh.rotation.y += 0.024;
    });
  }

  setTarget(targetId?: string, asteroidId?: string, wreckId?: string): void {
    this.targetId = targetId;
    this.selectedAsteroidId = asteroidId;
    this.selectedWreckId = wreckId;
    this.updateAsteroidInstances();
    this.wreckNodeMeshes.forEach((mesh, id) => {
      const node = this.wreckNodes.find((entry) => entry.id === id);
      mesh.visible = Boolean(node?.scanned || id === wreckId);
      const material = (mesh as THREE.Mesh).material;
      if (material instanceof THREE.MeshBasicMaterial) {
        material.opacity = id === wreckId ? 0.8 : 0.28;
      }
    });
  }

  setCockpitVisible(_visible: boolean): void {
    // The remastered cockpit is a responsive DOM art layer; the legacy geometry would double the canopy struts.
    this.cockpit.visible = false;
  }

  setDamageWarning(level: number): void {
    const normalized = clamp(level, 0, 1);
    this.shell?.style.setProperty('--damage-warning', normalized.toFixed(3));
    const material = this.cockpitWarning?.material;
    if (material instanceof THREE.MeshBasicMaterial) {
      material.opacity = 0;
      material.transparent = true;
    }
  }

  updateCamera(position: Vec3Tuple, rotation: [number, number, number, number], angularVelocity: Vec3Tuple, speedRatio: number, afterburner: boolean, dt: number): void {
    this.camera.position.set(...position);
    this.camera.quaternion.set(...rotation);
    this.fovTarget = afterburner ? 84 : 74 + speedRatio * 2.5;
    this.camera.fov += (this.fovTarget - this.camera.fov) * (1 - Math.exp(-5 * dt));
    this.camera.updateProjectionMatrix();

    const shiftX = clamp(-angularVelocity[1] * 2.8, -9, 9);
    const shiftY = clamp(angularVelocity[0] * 2.0 - speedRatio * 2.2, -7, 5);
    const roll = clamp(-angularVelocity[2] * 0.34, -1.5, 1.5);
    this.shell?.style.setProperty('--cockpit-shift-x', `${shiftX.toFixed(2)}px`);
    this.shell?.style.setProperty('--cockpit-shift-y', `${shiftY.toFixed(2)}px`);
    this.shell?.style.setProperty('--cockpit-roll', `${roll.toFixed(2)}deg`);
    this.shell?.style.setProperty('--cockpit-zoom', afterburner ? '1.035' : '1.018');
  }

  setUtilityBeam(active: boolean, mode: FlightMode, start: Vec3Tuple, end?: Vec3Tuple): void {
    if (!active || !end) {
      this.utilityBeam.visible = false;
      this.utilityBeamMaterial.opacity = 0;
      return;
    }
    const a = tupleToVector(start, this.tmpPosition);
    const b = tupleToVector(end, this.forward);
    const distance = a.distanceTo(b);
    this.utilityBeam.position.copy(a).lerp(b, 0.5);
    this.utilityBeam.scale.set(mode === 'mining' ? 0.62 : 1.05, distance, mode === 'mining' ? 0.62 : 1.05);
    this.utilityBeam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    this.utilityBeamMaterial.color.setHex(mode === 'mining' ? 0xe2b45e : 0x74d5c4);
    this.utilityBeamMaterial.opacity = 0.54 + Math.sin(performance.now() * 0.03) * 0.18;
    this.utilityBeam.visible = true;
  }

  spawnExplosion(position: Vec3Tuple, hostile = true, scale = 1): void {
    const count = 28;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];
    const rng = seededRandom(`${position.join(':')}:${performance.now()}`);
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = 0;
      positions[index * 3 + 1] = 0;
      positions[index * 3 + 2] = 0;
      velocities.push(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize().multiplyScalar((2 + rng() * 9) * scale));
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: hostile ? 0xff7a3d : 0x7fc9d6,
      size: 1.8 * scale,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    points.position.set(...position);
    this.scene.add(points);
    this.effects.push({ object: points, points, velocities, life: 1.05, maxLife: 1.05 });
  }

  spawnImpact(position: Vec3Tuple, color = 0xffc36a): void {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.radialTexture('#ffffff', `#${color.toString(16).padStart(6, '0')}`), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    sprite.position.set(...position);
    sprite.scale.setScalar(3.4);
    this.scene.add(sprite);
    this.effects.push({ object: sprite, velocities: [], life: 0.18, maxLife: 0.18 });
  }

  private updateEffects(dt: number): void {
    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      const effect = this.effects[index]!;
      effect.life -= dt;
      const ratio = clamp(effect.life / effect.maxLife, 0, 1);
      if (effect.points) {
        const positions = effect.points.geometry.getAttribute('position') as THREE.BufferAttribute;
        effect.velocities.forEach((velocity, particleIndex) => {
          positions.setXYZ(
            particleIndex,
            positions.getX(particleIndex) + velocity.x * dt,
            positions.getY(particleIndex) + velocity.y * dt,
            positions.getZ(particleIndex) + velocity.z * dt,
          );
        });
        positions.needsUpdate = true;
        const material = effect.points.material;
        if (material instanceof THREE.PointsMaterial) material.opacity = ratio;
      } else if (effect.object instanceof THREE.Sprite) {
        effect.object.scale.multiplyScalar(1 + dt * 4.2);
        const material = effect.object.material;
        if (material instanceof THREE.SpriteMaterial) material.opacity = ratio;
      }
      if (effect.life <= 0) {
        this.scene.remove(effect.object);
        this.disposeObject(effect.object);
        this.effects.splice(index, 1);
      }
    }
  }

  updateWorld(dt: number): void {
    this.asteroids.forEach((node) => {
      if (!node.moving) return;
      node.position[0] += node.velocity[0] * dt;
      node.position[1] += node.velocity[1] * dt;
      node.position[2] += node.velocity[2] * dt;
      node.rotation[0] += node.rotationSpeed[0] * dt;
      node.rotation[1] += node.rotationSpeed[1] * dt;
      node.rotation[2] += node.rotationSpeed[2] * dt;
      const center = LOCATIONS.shardbelt.position;
      const dx = node.position[0] - center[0];
      const dy = node.position[1] - center[1];
      const dz = node.position[2] - center[2];
      if (Math.hypot(dx, dy, dz) > 165) {
        node.position[0] = center[0] - dx * 0.82;
        node.position[1] = center[1] - dy * 0.82;
        node.position[2] = center[2] - dz * 0.82;
      }
    });
    this.updateAsteroidInstances();

    this.graveyard.forEach((piece) => {
      if (!piece.moving) return;
      piece.position[0] += piece.drift[0] * dt;
      piece.position[1] += piece.drift[1] * dt;
      piece.position[2] += piece.drift[2] * dt;
      piece.rotation[0] += piece.spin[0] * dt;
      piece.rotation[1] += piece.spin[1] * dt;
      piece.rotation[2] += piece.spin[2] * dt;
      const mesh = this.graveyardMeshes.get(piece.id);
      if (mesh) {
        mesh.position.set(...piece.position);
        mesh.rotation.set(...piece.rotation);
      }
    });

    const helixRotor = this.locationMeshes.get('helix')?.getObjectByName('rotor');
    if (helixRotor) helixRotor.rotation.z += dt * 0.16;
    const vesper = this.locationMeshes.get('vesper');
    if (vesper) {
      const surface = vesper.getObjectByName('surface');
      const clouds = vesper.getObjectByName('clouds');
      if (surface) surface.rotation.y += dt * 0.012;
      if (clouds) clouds.rotation.y += dt * 0.018;
    }
    const azure = this.locationMeshes.get('azure');
    if (azure) {
      const surface = azure.getObjectByName('surface');
      const clouds = azure.getObjectByName('clouds');
      if (surface) surface.rotation.y += dt * 0.009;
      if (clouds) clouds.rotation.y += dt * 0.016;
    }
    this.wreckNodeMeshes.forEach((mesh) => {
      mesh.rotation.x += dt * 0.22;
      mesh.rotation.y -= dt * 0.17;
    });
    this.updateEffects(dt);
  }

  render(): void {
    if (this.contextLost) return;
    this.renderer.render(this.scene, this.camera);
  }

  projectToScreen(position: Vec3Tuple): { x: number; y: number; visible: boolean; behind: boolean } {
    const vector = tupleToVector(position, this.tmpPosition).project(this.camera);
    const behind = vector.z > 1;
    return {
      x: (vector.x * 0.5 + 0.5) * this.viewportWidth,
      y: (-vector.y * 0.5 + 0.5) * this.viewportHeight,
      visible: vector.z >= -1 && vector.z <= 1 && vector.x >= -1.2 && vector.x <= 1.2 && vector.y >= -1.2 && vector.y <= 1.2,
      behind,
    };
  }

  getCameraForward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
  }

  setQualityScale(scale: number): void {
    const next = clamp(scale, 0.55, 1.35);
    if (Math.abs(next - this.lastQualityScale) < 0.05) return;
    this.lastQualityScale = next;
    this.resize();
  }

  private resize = (): void => {
    const rect = this.container.getBoundingClientRect();
    this.viewportWidth = Math.max(1, rect.width);
    this.viewportHeight = Math.max(1, rect.height);
    const aspect = this.viewportWidth / this.viewportHeight;
    const baseWidth = this.qualityMode === 'low'
      ? 640
      : this.qualityMode === 'high'
        ? 1280
        : this.viewportWidth < 900
          ? 720
          : 960;
    const renderWidth = Math.max(288, Math.round(Math.min(this.viewportWidth, baseWidth) * this.lastQualityScale));
    const renderHeight = Math.max(180, Math.round(renderWidth / aspect));
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(renderWidth, renderHeight, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.dataset.renderResolution = `${renderWidth}x${renderHeight}`;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  };

  private onContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
  };

  private onContextRestored = (): void => {
    this.contextLost = false;
    this.resize();
  };

  private disposeObject(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.Sprite)) return;
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => {
        if (!material) return;
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) value.dispose();
        }
        material.dispose();
      });
    });
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.disposeObject(this.scene);
    this.pixelTextures.forEach((texture) => texture.dispose());
    this.pixelTextures.clear();
    this.screenTextures.length = 0;
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
