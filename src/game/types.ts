export type Res = 'food' | 'wood' | 'gold' | 'stone';
export type Resources = Record<Res, number>;
export type Cost = Partial<Resources>;

export type UnitType =
  | 'villager' | 'militia' | 'manatarms' | 'spearman' | 'archer'
  | 'skirmisher' | 'scout' | 'knight' | 'monk' | 'ram' | 'mangonel';

export type BuildingType =
  | 'town_center' | 'house' | 'lumber_camp' | 'mill' | 'mining_camp' | 'farm'
  | 'barracks' | 'archery_range' | 'stable' | 'blacksmith' | 'market'
  | 'monastery' | 'castle' | 'watch_tower' | 'palisade' | 'siege_workshop';

export type ResourceNodeType =
  | 'tree_oak' | 'tree_oak2' | 'tree_pine' | 'tree_birch'
  | 'berry' | 'gold' | 'stone' | 'sheep' | 'deer' | 'boar';

export type TechId =
  | 'loom' | 'wheelbarrow' | 'hand_cart' | 'double_bit_axe' | 'bow_saw'
  | 'horse_collar' | 'gold_mining' | 'stone_mining' | 'forging' | 'fletching'
  | 'scale_mail' | 'padded_archer' | 'man_at_arms' | 'feudal' | 'castle_age' | 'imperial'
  | 'long_swordsman' | 'champion' | 'pikeman' | 'crossbowman' | 'elite_skirmisher' | 'light_cavalry' | 'cavalier'
  | 'iron_casting' | 'bodkin_arrow' | 'chain_mail';

/** Terrain ids, also index into terrain atlases (draw order = priority). */
export const T = { DeepWater: 0, Water: 1, Sand: 2, Dirt: 3, Grass2: 4, Grass: 5, Forest: 6 } as const;
export const TERRAIN_COUNT = 7;

export type Age = 0 | 1 | 2 | 3;

export type EntityKind = 'unit' | 'building' | 'resource';

export type Order =
  | { kind: 'idle' }
  | { kind: 'move'; x: number; y: number }
  | { kind: 'gather'; target: number }
  | { kind: 'return'; target: number; resume?: number }
  | { kind: 'build'; target: number }
  | { kind: 'attack'; target: number }
  | { kind: 'garrison'; target: number };

export interface QueueItem {
  kind: 'unit' | 'tech';
  id: UnitType | TechId;
  progress: number; // seconds done
  time: number; // total seconds
  blocked?: boolean; // waiting for population room
}

export interface Entity {
  id: number;
  kind: EntityKind;
  type: UnitType | BuildingType | ResourceNodeType;
  owner: number; // 0 gaia, 1 player, 2 enemy
  /** units: float tile position (center). buildings/resources: top-left tile. */
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  dead?: boolean;
  // building / resource footprint
  size: number;
  // building
  built?: boolean;
  progress?: number; // 0..1 construction
  queue?: QueueItem[];
  rally?: { x: number; y: number };
  attackCd?: number;
  // resource (also farms)
  amount?: number;
  resType?: Res;
  // unit
  order?: Order;
  path?: { x: number; y: number }[];
  pathGoal?: string;
  repath?: number;
  carry?: { type: Res; amount: number };
  facing?: 1 | -1;
  anim?: number;
  working?: boolean;
  female?: boolean;
  lastHit?: number;
  /** true while the unit faces "up" the screen (north-east / north-west back view) */
  back?: boolean;
  /** countdown to the next tool-strike sound while working */
  hitT?: number;
  /** id of the building this unit is sheltering in */
  garrisonedIn?: number;
}

export interface Player {
  id: number;
  res: Resources;
  age: Age;
  techs: Set<TechId>;
  pop: number;
  popCap: number;
  color: string;
  name: string;
  defeated?: boolean;
  stats: { gathered: Resources; trained: number; killed: number; lost: number; built: number };
}

export interface Projectile {
  x: number; y: number; // tile space
  tx: number; ty: number;
  target: number;
  damage: number;
  speed: number;
  owner: number;
  life: number;
  total: number;
  /** splash radius in tiles (mangonel stones) */
  splash?: number;
  kind?: 'arrow' | 'stone';
}

/** one-shot visual effect requested by the simulation (consumed by the renderer) */
export interface FxEvent { kind: 'dust' | 'sparks' | 'impact' | 'collapse'; x: number; y: number; size: number }

export interface FloatText { x: number; y: number; text: string; color: string; t: number }

export type Difficulty = 'easy' | 'normal' | 'hard';
