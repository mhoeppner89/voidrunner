import { LOCATIONS } from './data';
import { pick, randomBetween, randomInt, seededRandom } from './random';
import type { AsteroidNode, CommodityId, Vec3Tuple, WreckNode } from './types';

export interface GraveyardPiece {
  id: string;
  kind: 'beam' | 'hull' | 'panel' | 'engine' | 'ring';
  position: Vec3Tuple;
  rotation: Vec3Tuple;
  scale: Vec3Tuple;
  collisionRadius: number;
  moving: boolean;
  drift: Vec3Tuple;
  spin: Vec3Tuple;
}

export interface StaticObstacle {
  id: string;
  kind: 'planet' | 'station' | 'field' | 'graveyard' | 'asteroid' | 'wreck';
  position: Vec3Tuple;
  radius: number;
  velocity?: Vec3Tuple;
}

const sphericalOffset = (rng: () => number, radius: number, inner = 0): Vec3Tuple => {
  const u = rng();
  const v = rng();
  const theta = u * Math.PI * 2;
  const phi = Math.acos(2 * v - 1);
  const r = randomBetween(rng, inner, radius) * Math.cbrt(rng());
  return [
    Math.sin(phi) * Math.cos(theta) * r,
    Math.cos(phi) * r * 0.62,
    Math.sin(phi) * Math.sin(theta) * r,
  ];
};

const add = (a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export const generateAsteroidField = (seed: number, depleted: Record<string, number>, scanned: string[] = []): AsteroidNode[] => {
  const rng = seededRandom(`${seed}:asteroid-field`);
  const center = LOCATIONS.shardbelt.position;
  const nodes: AsteroidNode[] = [];

  // Rock crown: a flyable tunnel through a ring of massive static bodies.
  const ringRadius = 34;
  for (let index = 0; index < 14; index += 1) {
    const angle = (index / 14) * Math.PI * 2;
    const radial = ringRadius + randomBetween(rng, -3, 4);
    const local: Vec3Tuple = [Math.cos(angle) * radial, Math.sin(angle) * radial * 0.82, randomBetween(rng, -7, 7)];
    const id = `rock-crown-${index}`;
    const remaining = Math.max(0, depleted[id] ?? randomBetween(rng, 2.8, 5.8));
    nodes.push({
      id,
      position: add(center, local),
      velocity: [0, 0, 0],
      radius: randomBetween(rng, 7.5, 12.5),
      scale: [randomBetween(rng, 0.8, 1.4), randomBetween(rng, 0.7, 1.3), randomBetween(rng, 0.8, 1.5)],
      rotation: [rng() * Math.PI, rng() * Math.PI, rng() * Math.PI],
      rotationSpeed: [0, 0, 0],
      moving: false,
      resource: 'ore',
      richness: randomBetween(rng, 1.4, 2.5),
      remaining,
      scanned: scanned.includes(id),
      tunnelPart: true,
    });
  }

  for (let index = 0; index < 52; index += 1) {
    let offset = sphericalOffset(rng, 145, 25);
    // Keep the central tunnel approach readable.
    if (Math.hypot(offset[0], offset[1]) < 26 && Math.abs(offset[2]) < 85) offset = [offset[0] + 42, offset[1], offset[2]];
    const id = `asteroid-static-${index}`;
    const remaining = Math.max(0, depleted[id] ?? randomBetween(rng, 1.2, 5.4));
    nodes.push({
      id,
      position: add(center, offset),
      velocity: [0, 0, 0],
      radius: randomBetween(rng, 3.2, 12.5),
      scale: [randomBetween(rng, 0.65, 1.5), randomBetween(rng, 0.6, 1.4), randomBetween(rng, 0.7, 1.55)],
      rotation: [rng() * Math.PI, rng() * Math.PI, rng() * Math.PI],
      rotationSpeed: [0, 0, 0],
      moving: false,
      resource: 'ore',
      richness: randomBetween(rng, 0.75, 2.4),
      remaining,
      scanned: scanned.includes(id),
      tunnelPart: false,
    });
  }

  for (let index = 0; index < 26; index += 1) {
    const offset = sphericalOffset(rng, 138, 15);
    const speed = randomBetween(rng, 0.25, 1.15);
    const theta = rng() * Math.PI * 2;
    const id = `asteroid-drift-${index}`;
    const remaining = Math.max(0, depleted[id] ?? randomBetween(rng, 0.4, 1.8));
    nodes.push({
      id,
      position: add(center, offset),
      velocity: [Math.cos(theta) * speed, randomBetween(rng, -0.25, 0.25), Math.sin(theta) * speed],
      radius: randomBetween(rng, 0.8, 3.1),
      scale: [randomBetween(rng, 0.7, 1.35), randomBetween(rng, 0.7, 1.35), randomBetween(rng, 0.7, 1.35)],
      rotation: [rng() * Math.PI, rng() * Math.PI, rng() * Math.PI],
      rotationSpeed: [randomBetween(rng, -0.25, 0.25), randomBetween(rng, -0.25, 0.25), randomBetween(rng, -0.25, 0.25)],
      moving: true,
      resource: 'ore',
      richness: randomBetween(rng, 0.45, 1.35),
      remaining,
      scanned: scanned.includes(id),
      tunnelPart: false,
    });
  }
  return nodes;
};

export const generateGraveyardPieces = (seed: number): GraveyardPiece[] => {
  const rng = seededRandom(`${seed}:graveyard-pieces`);
  const center = LOCATIONS['mourning-line'].position;
  const pieces: GraveyardPiece[] = [];

  // Ribbed capital-ship passage. The center line stays open for flight.
  for (let rib = 0; rib < 7; rib += 1) {
    const z = center[2] - 58 + rib * 18;
    const radius = 20 + Math.sin(rib * 1.7) * 2.2;
    for (let segment = 0; segment < 8; segment += 1) {
      const angle = (segment / 8) * Math.PI * 2;
      pieces.push({
        id: `rib-${rib}-${segment}`,
        kind: 'beam',
        position: [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius, z],
        rotation: [0, 0, angle],
        scale: [1.2, 7.2, 1.2],
        collisionRadius: 4.2,
        moving: false,
        drift: [0, 0, 0],
        spin: [0, 0, 0],
      });
    }
  }

  pieces.push({
    id: 'carrier-keel-left',
    kind: 'hull',
    position: [center[0] - 29, center[1] - 6, center[2] + 2],
    rotation: [0.08, 0.12, -0.16],
    scale: [7, 3.2, 44],
    collisionRadius: 15,
    moving: false,
    drift: [0, 0, 0],
    spin: [0, 0, 0],
  });
  pieces.push({
    id: 'carrier-keel-right',
    kind: 'hull',
    position: [center[0] + 31, center[1] + 8, center[2] - 4],
    rotation: [-0.05, -0.1, 0.14],
    scale: [6, 2.7, 38],
    collisionRadius: 13,
    moving: false,
    drift: [0, 0, 0],
    spin: [0, 0, 0],
  });
  pieces.push({
    id: 'carrier-engine',
    kind: 'engine',
    position: [center[0] + 47, center[1] - 16, center[2] - 34],
    rotation: [0.2, 0.7, -0.15],
    scale: [9, 9, 14],
    collisionRadius: 12,
    moving: false,
    drift: [0, 0, 0],
    spin: [0, 0, 0],
  });

  for (let index = 0; index < 42; index += 1) {
    const offset = sphericalOffset(rng, 138, 35);
    const moving = index >= 27;
    const speed = moving ? randomBetween(rng, 0.08, 0.55) : 0;
    const heading = rng() * Math.PI * 2;
    const large = index < 12;
    pieces.push({
      id: `wreck-piece-${index}`,
      kind: pick(rng, ['panel', 'beam', 'hull', 'engine'] as const),
      position: add(center, offset),
      rotation: [rng() * Math.PI, rng() * Math.PI, rng() * Math.PI],
      scale: large
        ? [randomBetween(rng, 2.5, 7.5), randomBetween(rng, 1.2, 4), randomBetween(rng, 5, 17)]
        : [randomBetween(rng, 0.5, 2.8), randomBetween(rng, 0.4, 2.2), randomBetween(rng, 1.2, 6)],
      collisionRadius: large ? randomBetween(rng, 5, 11) : randomBetween(rng, 1, 3.5),
      moving,
      drift: moving ? [Math.cos(heading) * speed, randomBetween(rng, -0.18, 0.18), Math.sin(heading) * speed] : [0, 0, 0],
      spin: moving
        ? [randomBetween(rng, -0.12, 0.12), randomBetween(rng, -0.12, 0.12), randomBetween(rng, -0.12, 0.12)]
        : [0, 0, 0],
    });
  }
  return pieces;
};

export const generateWreckNodes = (seed: number, depleted: Record<string, number>, scanned: string[] = []): WreckNode[] => {
  const rng = seededRandom(`${seed}:wreck-nodes`);
  const center = LOCATIONS['mourning-line'].position;
  const salvageTypes: CommodityId[] = ['scrap', 'electronics', 'machinery', 'arms'];
  const names = ['Courier bow', 'Patrol avionics bay', 'Freighter spindle', 'Carrier lifeboat rack', 'Gunship reactor shroud', 'Survey ship core'];
  const nodes: WreckNode[] = [];

  for (let index = 0; index < 24; index += 1) {
    const offset = sphericalOffset(rng, 122, 18);
    const rarityRoll = rng();
    const rarity = rarityRoll > 0.9 ? 'rare' : rarityRoll > 0.62 ? 'uncommon' : 'common';
    const salvage = rarity === 'rare' ? pick(rng, ['electronics', 'arms'] as CommodityId[]) : pick(rng, salvageTypes);
    const id = `salvage-node-${index}`;
    nodes.push({
      id,
      name: `${pick(rng, names)} ${String.fromCharCode(65 + randomInt(rng, 0, 18))}-${randomInt(rng, 10, 99)}`,
      position: add(center, offset),
      radius: randomBetween(rng, 2.2, 5.8),
      salvage,
      rarity,
      remaining: Math.max(0, depleted[id] ?? (rarity === 'rare' ? randomBetween(rng, 2.2, 4.2) : randomBetween(rng, 0.9, 2.8))),
      scanned: scanned.includes(id),
      hazard: rarity === 'rare' ? randomBetween(rng, 0.7, 1.5) : randomBetween(rng, 0.1, 0.9),
    });
  }
  return nodes;
};

export const buildStaticObstacles = (asteroids: AsteroidNode[], graveyard: GraveyardPiece[]): StaticObstacle[] => {
  const obstacles: StaticObstacle[] = [];
  (['helix', 'rook', 'vesper', 'azure'] as const).forEach((id) => {
    const location = LOCATIONS[id];
    obstacles.push({ id, kind: location.kind, position: [...location.position], radius: location.radius * (location.kind === 'planet' ? 1.04 : 0.78) });
  });
  asteroids.forEach((node) => obstacles.push({ id: node.id, kind: 'asteroid', position: node.position, radius: node.radius * 0.9, velocity: node.velocity }));
  graveyard.forEach((piece) => obstacles.push({ id: piece.id, kind: 'wreck', position: piece.position, radius: piece.collisionRadius, velocity: piece.drift }));
  return obstacles;
};
