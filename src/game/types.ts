export type Vec3Tuple = [number, number, number];
export type QuatTuple = [number, number, number, number];

export type LocationId = 'helix' | 'rook' | 'vesper' | 'azure' | 'shardbelt' | 'mourning-line';
export type DockLocationId = Exclude<LocationId, 'shardbelt' | 'mourning-line'>;
export type FactionId = 'concord' | 'free-merchants' | 'frontier-miners' | 'salvage-union' | 'red-talons';
export type GuildId = 'merchant' | 'bounty' | 'mining' | 'salvage';
export type CommodityId =
  | 'water'
  | 'food'
  | 'medicine'
  | 'electronics'
  | 'machinery'
  | 'ore'
  | 'scrap'
  | 'luxuries'
  | 'arms';
export type EquipmentId =
  | 'engine-mk2'
  | 'thrusters-mk2'
  | 'shield-mk2'
  | 'armor-mk2'
  | 'pulse-mk2'
  | 'radar-mk2'
  | 'cargo-pods'
  | 'mining-mk2'
  | 'salvage-mk2';
export type ShipId = 'wayfarer' | 'vanguard';
export type FlightMode = 'combat' | 'mining' | 'salvage';
export type MissionKind = 'delivery' | 'procurement' | 'transport' | 'bounty';
export type MissionStatus = 'offered' | 'active' | 'completed' | 'failed';
export type EntityRole = 'pirate' | 'trader' | 'miner' | 'patrol' | 'bounty' | 'escort';
export type WorldZone = 'open' | 'near-location' | 'asteroid-field' | 'graveyard';

export interface LocationDefinition {
  id: LocationId;
  name: string;
  shortName: string;
  kind: 'planet' | 'station' | 'field' | 'graveyard';
  position: Vec3Tuple;
  radius: number;
  dockRadius?: number;
  faction: FactionId;
  accent: string;
  secondary: string;
  description: string;
  shipForSale?: ShipId;
  economy?: Partial<Record<CommodityId, number>>;
  marketBias?: Partial<Record<CommodityId, number>>;
  people?: PersonDefinition[];
}

export interface PersonDefinition {
  id: string;
  name: string;
  role: string;
  affiliation: string;
  lines: string[];
  portraitSeed: number;
}

export interface CommodityDefinition {
  id: CommodityId;
  name: string;
  description: string;
  basePrice: number;
  mass: number;
  legal: boolean;
  category: string;
}

export interface EquipmentDefinition {
  id: EquipmentId;
  name: string;
  category: 'engine' | 'maneuver' | 'shield' | 'armor' | 'weapon' | 'radar' | 'cargo' | 'mining' | 'salvage';
  price: number;
  description: string;
  stat: string;
  requiredGuild?: GuildId;
  requiredRank?: number;
}

export interface ShipDefinition {
  id: ShipId;
  name: string;
  className: string;
  price: number;
  description: string;
  maxSpeed: number;
  afterburnSpeed: number;
  acceleration: number;
  angularAcceleration: number;
  angularDamping: number;
  shield: number;
  armor: number;
  hull: number;
  cargo: number;
  fuel: number;
  missileCapacity: number;
  gunDamage: number;
}

export interface MarketItemState {
  supply: number;
  demand: number;
  lastPrice: number;
}

export interface Mission {
  id: string;
  kind: MissionKind;
  title: string;
  issuer: string;
  origin: DockLocationId;
  destination?: DockLocationId;
  targetZone?: LocationId;
  commodity?: CommodityId;
  quantity?: number;
  targetName?: string;
  reward: number;
  deposit: number;
  deadline: number;
  status: MissionStatus;
  guild: GuildId;
  guildRep: number;
  faction: FactionId;
  briefing: string;
  acceptedAt?: number;
}

export interface SealedCargo {
  missionId: string;
  label: string;
  units: number;
  mass: number;
}

export interface PlayerState {
  position: Vec3Tuple;
  rotation: QuatTuple;
  velocity: Vec3Tuple;
  angularVelocity: Vec3Tuple;
  throttle: number;
  credits: number;
  fuel: number;
  shield: number;
  armor: number;
  hull: number;
  missiles: number;
  shipId: ShipId;
  ownedShips: ShipId[];
  cargo: Partial<Record<CommodityId, number>>;
  sealedCargo: SealedCargo[];
  equipment: EquipmentId[];
  mode: FlightMode;
  navTargetId: LocationId;
  currentTargetId?: string;
  dockedAt?: DockLocationId;
  lastDockedAt: DockLocationId;
  reputation: Record<FactionId, number>;
  guildRep: Record<GuildId, number>;
  guildRank: Record<GuildId, number>;
  discovered: LocationId[];
  stats: {
    kills: number;
    trades: number;
    mined: number;
    salvaged: number;
    contracts: number;
  };
}

export interface PersistentWorldState {
  time: number;
  economyClock: number;
  encounterClock: number;
  market: Record<DockLocationId, Record<CommodityId, MarketItemState>>;
  offers: Record<DockLocationId, Mission[]>;
  depletedAsteroids: Record<string, number>;
  depletedWrecks: Record<string, number>;
  completedMissionIds: string[];
  failedMissionIds: string[];
  bountyKills: string[];
  scannedNodes: string[];
  danger: number;
  seed: number;
}

export interface SettingsState {
  music: number;
  effects: number;
  flightAssist: boolean;
  aimAssist: boolean;
  quality: 'auto' | 'low' | 'high';
  touchScale: number;
  vibration: boolean;
}

export interface GameSave {
  version: number;
  createdAt: number;
  updatedAt: number;
  player: PlayerState;
  world: PersistentWorldState;
  activeMissions: Mission[];
  settings: SettingsState;
}

export interface InputActions {
  pitch: number;
  yaw: number;
  roll: number;
  throttleDelta: number;
  throttleSet?: number;
  fire: boolean;
  missile: boolean;
  afterburner: boolean;
  targetNext: boolean;
  targetNearestHostile: boolean;
  cycleMode: boolean;
  navNext: boolean;
  autopilot: boolean;
  interact: boolean;
  scan: boolean;
  pause: boolean;
  map: boolean;
}

export interface ShipEntity {
  id: string;
  name: string;
  role: EntityRole;
  faction: FactionId;
  position: Vec3Tuple;
  velocity: Vec3Tuple;
  rotation: QuatTuple;
  shield: number;
  maxShield: number;
  armor: number;
  maxArmor: number;
  hull: number;
  maxHull: number;
  speed: number;
  turnRate: number;
  gunDamage: number;
  hostile: boolean;
  bountyValue: number;
  targetId?: string;
  aiState: 'travel' | 'patrol' | 'attack' | 'flee' | 'mine';
  destination?: Vec3Tuple;
  fireCooldown: number;
  missileCooldown: number;
  shieldDelay: number;
  spawnTime: number;
  lifetime: number;
  missionId?: string;
}

export interface ProjectileEntity {
  id: string;
  kind: 'laser' | 'missile';
  ownerId: string;
  position: Vec3Tuple;
  velocity: Vec3Tuple;
  damage: number;
  life: number;
  targetId?: string;
  faction: FactionId | 'player';
}

export interface AsteroidNode {
  id: string;
  position: Vec3Tuple;
  velocity: Vec3Tuple;
  radius: number;
  scale: Vec3Tuple;
  rotation: Vec3Tuple;
  rotationSpeed: Vec3Tuple;
  moving: boolean;
  resource: CommodityId;
  richness: number;
  remaining: number;
  scanned: boolean;
  tunnelPart: boolean;
}

export interface WreckNode {
  id: string;
  name: string;
  position: Vec3Tuple;
  radius: number;
  salvage: CommodityId;
  rarity: 'common' | 'uncommon' | 'rare';
  remaining: number;
  scanned: boolean;
  hazard: number;
}

export interface RuntimeMessage {
  id: number;
  text: string;
  tone: 'info' | 'warning' | 'danger' | 'success';
  expiresAt: number;
}

export interface PickupEntity {
  id: string;
  commodity: CommodityId;
  position: Vec3Tuple;
  velocity: Vec3Tuple;
  amount: number;
  source: 'mining' | 'salvage' | 'combat';
  rarity: 'common' | 'uncommon' | 'rare';
  life: number;
}
