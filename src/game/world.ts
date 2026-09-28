import { AGE_REQ, BUILDINGS, CARRY, FARM_FOOD, GAME_SPEED, MAP_SIZE, MARKET_START, MAX_POP, NODES, TECHS, UNITS, UPGRADES } from './data';
import { CIV_FREE_TECHS, CIV_IDS, civBuildingHpMul, civGatherMul, civLosBonus, civReloadMul, civTechCost, civUnitCost, civUnitHpMul } from './civs';
import { generateMap, mulberry32, type MapStyle } from './mapgen';
import { findFreeTileNear, findPath, rectDist, type Rect } from './pathfinding';
import {
  T, type BuildingType, type Cost, type Difficulty, type Entity, type FloatText, type Player, type Projectile,
  type CivId, type FxEvent, type Res, type ResourceNodeType, type TechId, type UnitType,
} from './types';

/** Turn a unit toward a world-space direction: left/right mirror + front/back view (4 isometric facings). */
export function face(u: Entity, dx: number, dy: number) {
  const sx = dx - dy, sy = dx + dy; // screen-space direction
  if (Math.abs(sx) > 0.02) u.facing = sx >= 0 ? 1 : -1;
  if (Math.abs(sy) > 0.02) u.back = sy < 0;
}

export interface GameEvent { text: string; t: number; kind: 'info' | 'warn' | 'good'; x?: number; y?: number }
export interface Corpse { x: number; y: number; type: string; owner: number; t: number; facing: 1 | -1 }

export interface WorldOptions { seed: number; style: MapStyle; difficulty: Difficulty; civ?: CivId; aiCiv?: CivId; restore?: SaveData }

/** Serialized game (JSON-safe). Terrain/exploration are packed as digit strings. */
export interface SaveData {
  v: 1;
  opts: Omit<WorldOptions, 'restore'>;
  time: number;
  nextId: number;
  terrain: string;
  explored: string;
  entities: Entity[];
  players: (Omit<Player, 'techs'> & { techs: TechId[] })[];
  prices: Record<'food' | 'wood' | 'gold' | 'stone', number> | Record<'food' | 'wood' | 'stone', number>;
  cam?: { x: number; y: number; zoom: number };
  savedAt?: number;
}

const newRes = () => ({ food: 0, wood: 0, gold: 0, stone: 0 });

export class World {
  size = MAP_SIZE;
  terrain: Uint8Array;
  /** blocking entity id per tile, -1 when free */
  occ: Int32Array;
  entities = new Map<number, Entity>();
  players: Player[];
  nextId = 1;
  time = 0;
  projectiles: Projectile[] = [];
  floats: FloatText[] = [];
  corpses: Corpse[] = [];
  events: GameEvent[] = [];
  /** visual effect requests for the renderer (dust, sparks...) */
  fx: FxEvent[] = [];
  /** sound requests for the audio layer (world stays audio-agnostic for headless sims) */
  sfx: { key: string; x?: number; y?: number }[] = [];
  visible: Uint8Array;
  explored: Uint8Array;
  winner = 0;
  opts: WorldOptions;
  rng: () => number;
  private fogTimer = 0;
  private endTimer = 0;
  /** hooks set by other modules */
  onUpdate: ((w: World, dt: number) => void)[] = [];
  version = 0; // bumps when entities are added/removed
  /** bump when explored / visible tiles change (render caches key on these) */
  exploredVersion = 0;
  fogVersion = 0;

  constructor(opts: WorldOptions) {
    this.opts = opts;
    this.rng = mulberry32(opts.seed ^ 0x9e3779b9);
    if (opts.restore) {
      const r = opts.restore;
      this.opts = { ...r.opts };
      this.rng = mulberry32((r.opts.seed ^ 0x9e3779b9) + Math.floor(r.time));
      const n = this.size * this.size;
      this.terrain = Uint8Array.from(r.terrain, (ch) => Number(ch));
      this.explored = Uint8Array.from(r.explored, (ch) => Number(ch));
      this.visible = new Uint8Array(n);
      this.occ = new Int32Array(n).fill(-1);
      this.players = r.players.map((p) => ({ ...p, techs: new Set(p.techs) }));
      this.time = r.time;
      this.nextId = r.nextId;
      this.prices = { ...this.prices, ...(r.prices as Record<'food' | 'wood' | 'stone', number>) };
      for (const e of r.entities) {
        const ent: Entity = { ...e, path: undefined, pathGoal: undefined, dead: false };
        this.entities.set(ent.id, ent);
        if (ent.kind === 'resource') this.occ[this.idx(ent.x, ent.y)] = ent.id;
        else if (ent.kind === 'building' && !BUILDINGS[ent.type as BuildingType].walkable)
          for (let j = 0; j < ent.size; j++) for (let i = 0; i < ent.size; i++) this.occ[this.idx(ent.x + i, ent.y + j)] = ent.id;
      }
      this.recountPop();
      this.updateFog();
      this.exploredVersion++;
      return;
    }
    const map = generateMap(this.size, opts.seed, opts.style);
    this.terrain = map.terrain;
    const n = this.size * this.size;
    this.occ = new Int32Array(n).fill(-1);
    this.visible = new Uint8Array(n);
    this.explored = new Uint8Array(n);
    const aiCiv = opts.aiCiv ?? CIV_IDS.filter((c) => c !== (opts.civ ?? 'turks'))[Math.floor(this.rng() * 3)];
    const civOf = (id: number): CivId => (id === 1 ? opts.civ ?? 'turks' : id === 2 ? aiCiv : 'turks');
    const mk = (id: number, name: string, color: string): Player => ({
      id, civ: civOf(id), name, color, res: { food: 200, wood: 200, gold: 100, stone: 200 }, age: 0, techs: new Set(CIV_FREE_TECHS[civOf(id)] ?? []), pop: 0, popCap: 0,
      stats: { gathered: newRes(), trained: 0, killed: 0, lost: 0, built: 0 },
    });
    this.players = [mk(0, 'Doğa', '#888'), mk(1, 'Sen', '#2f6fe0'), mk(2, 'Rakip', '#d8342c')];
    for (const nd of map.nodes) this.spawnNode(nd.type, nd.x, nd.y);
    map.starts.forEach((s, i) => {
      const owner = i + 1;
      this.spawnBuilding('town_center', owner, s.x, s.y, true);
      const vs: [number, number][] = [[-1, 1], [1, 4.6], [4.6, 1.5]];
      vs.forEach(([dx, dy], k) => {
        const u = this.spawnUnit('villager', owner, s.x + dx + 0.5, s.y + dy + 0.5);
        u.female = k === 1;
      });
      this.spawnUnit('scout', owner, s.x + 5.5, s.y + 5.5);
    });
    this.recountPop();
    this.updateFog();
  }

  /** Snapshot for Save / Continue (transient state such as paths, projectiles and effects is dropped). */
  toSave(): SaveData {
    const { restore: _r, ...opts } = this.opts;
    void _r;
    return {
      v: 1, opts, time: this.time, nextId: this.nextId,
      terrain: Array.from(this.terrain).join(''),
      explored: Array.from(this.explored).join(''),
      entities: [...this.entities.values()].map((e) => ({ ...e, path: undefined, pathGoal: undefined, repath: undefined })),
      players: this.players.map((p) => ({ ...p, techs: [...p.techs] })),
      prices: { ...this.prices },
      savedAt: Date.now(),
    };
  }

  // ---------- basic accessors ----------
  idx(x: number, y: number) { return y * this.size + x; }
  inBounds(x: number, y: number) { return x >= 0 && y >= 0 && x < this.size && y < this.size; }
  isWater(x: number, y: number) { const t = this.terrain[this.idx(x, y)]; return t === T.Water || t === T.DeepWater; }
  blocked = (x: number, y: number) => !this.inBounds(x, y) || this.occ[this.idx(x, y)] >= 0 || this.isWater(x, y);
  get(id: number | undefined) { return id === undefined ? undefined : this.entities.get(id); }
  player(id: number) { return this.players[id]; }
  rectOf(e: Entity): Rect {
    if (e.kind === 'unit') { const x = Math.floor(e.x), y = Math.floor(e.y); return { x0: x, y0: y, x1: x, y1: y }; }
    return { x0: e.x, y0: e.y, x1: e.x + e.size - 1, y1: e.y + e.size - 1 };
  }
  centerOf(e: Entity) { return e.kind === 'unit' ? { x: e.x, y: e.y } : { x: e.x + e.size / 2, y: e.y + e.size / 2 }; }
  isVisible(x: number, y: number) { return this.inBounds(x, y) && this.visible[this.idx(x, y)] === 1; }

  event(text: string, kind: GameEvent['kind'] = 'info', x?: number, y?: number) {
    this.events.push({ text, kind, t: this.time, x, y });
    if (this.events.length > 20) this.events.shift();
  }
  sound(key: string, x?: number, y?: number) {
    if (this.sfx.length < 40) this.sfx.push({ key, x, y });
  }
  fxAt(kind: FxEvent['kind'], x: number, y: number, size = 1) {
    if (this.fx.length < 60) this.fx.push({ kind, x, y, size });
  }
  float(x: number, y: number, text: string, color: string) { this.floats.push({ x, y, text, color, t: 0 }); }

  // ---------- spawning ----------
  private add(e: Entity) { this.entities.set(e.id, e); this.version++; return e; }

  spawnNode(type: ResourceNodeType, x: number, y: number) {
    const d = NODES[type];
    const e = this.add({ id: this.nextId++, kind: 'resource', type, owner: 0, x, y, hp: 1, maxHp: 1, size: 1, amount: d.amount, resType: d.res, anim: this.rng() * 10, facing: this.rng() < 0.5 ? 1 : -1 });
    this.occ[this.idx(x, y)] = e.id;
    return e;
  }

  spawnBuilding(type: BuildingType, owner: number, x: number, y: number, built: boolean) {
    const d = BUILDINGS[type];
    const maxHp = Math.round(d.hp * (owner ? civBuildingHpMul(this.players[owner].civ) : 1));
    const e = this.add({
      id: this.nextId++, kind: 'building', type, owner, x, y, size: d.size, maxHp, hp: built ? maxHp : 1,
      built, progress: built ? 1 : 0, queue: [], attackCd: 0,
    });
    if (type === 'farm') { e.amount = this.farmFood(owner); e.resType = 'food'; }
    if (!d.walkable) for (let j = 0; j < d.size; j++) for (let i = 0; i < d.size; i++) this.occ[this.idx(x + i, y + j)] = e.id;
    if (built) this.recountPop();
    return e;
  }

  spawnUnit(type: UnitType, owner: number, x: number, y: number) {
    const hp = this.unitMaxHp(type, owner);
    return this.add({ id: this.nextId++, kind: 'unit', type, owner, x, y, size: 1, hp, maxHp: hp, order: { kind: 'idle' }, facing: 1, anim: this.rng() * 10, attackCd: 0, female: type === 'villager' && this.rng() < 0.5 });
  }

  remove(e: Entity) {
    if (e.dead) return;
    e.dead = true;
    if (e.kind === 'building') this.ungarrison(e);
    if (e.kind !== 'unit') {
      for (let j = 0; j < e.size; j++) for (let i = 0; i < e.size; i++) {
        const k = this.idx(e.x + i, e.y + j);
        if (this.occ[k] === e.id) this.occ[k] = -1;
      }
    }
    if (e.kind === 'unit' || e.kind === 'building') this.corpses.push({ x: e.x, y: e.y, type: e.type, owner: e.owner, t: 0, facing: e.facing ?? 1 });
    if (e.kind === 'building') { this.fxAt('collapse', e.x + e.size / 2, e.y + e.size / 2, e.size); if (e.type !== 'farm') this.sound('collapse', e.x + e.size / 2, e.y + e.size / 2); }
    else if (e.kind === 'unit') { this.fxAt('dust', e.x, e.y, 0.6); this.sound('death', e.x, e.y); }
    this.entities.delete(e.id);
    this.version++;
    if (e.kind === 'building' && e.owner) this.recountPop();
  }

  // ---------- players / economy ----------
  canAfford(owner: number, c: Cost) {
    const r = this.players[owner].res;
    return (Object.keys(c) as Res[]).every((k) => r[k] >= (c[k] ?? 0));
  }
  pay(owner: number, c: Cost) { const r = this.players[owner].res; (Object.keys(c) as Res[]).forEach((k) => (r[k] -= c[k] ?? 0)); }
  refund(owner: number, c: Cost) { const r = this.players[owner].res; (Object.keys(c) as Res[]).forEach((k) => (r[k] += c[k] ?? 0)); }
  has(owner: number, t: TechId) { return this.players[owner].techs.has(t); }

  farmFood(owner: number) { return FARM_FOOD + (this.has(owner, 'horse_collar') ? 75 : 0); }
  carryCap(owner: number) { return CARRY * (1 + (this.has(owner, 'wheelbarrow') ? 0.25 : 0) + (this.has(owner, 'hand_cart') ? 0.25 : 0)); }
  unitMaxHp(type: UnitType, owner: number) {
    let hp = UNITS[type].hp + (type === 'villager' && this.has(owner, 'loom') ? 15 : 0);
    for (const t of this.players[owner].techs) { const u = UPGRADES[t]; if (u?.hp && u.units.includes(type)) hp += u.hp; }
    return Math.round(hp * (owner ? civUnitHpMul(this.players[owner].civ, type, UNITS[type].cls) : 1));
  }
  /** civilization-adjusted prices */
  unitCost(owner: number, t: UnitType) { return owner ? civUnitCost(this.players[owner].civ, t, UNITS[t].cost) : UNITS[t].cost; }
  techCost(owner: number, t: TechId) { return owner ? civTechCost(this.players[owner].civ, t, TECHS[t].cost) : TECHS[t].cost; }
  /** is this unit available to the owner's civilization? */
  civAllows(owner: number, t: UnitType) {
    const c = UNITS[t].civ;
    return !c || this.players[owner].civ === c;
  }
  /** Display name including upgrade line (e.g. Zırhlı Piyade → Uzun Kılıçlı → Şampiyon). */
  unitName(e: Entity) {
    let name = UNITS[e.type as UnitType]?.name ?? e.type;
    for (const t of this.players[e.owner].techs) { const u = UPGRADES[t]; if (u?.name && u.units.includes(e.type as UnitType)) name = u.name; }
    return name;
  }

  // ---------- market ----------
  prices: Record<'food' | 'wood' | 'stone', number> = { food: MARKET_START, wood: MARKET_START, stone: MARKET_START + 30 };
  buyPrice(r: 'food' | 'wood' | 'stone') { return Math.round(this.prices[r] * 1.3); }
  sellPrice(r: 'food' | 'wood' | 'stone') { return Math.round(this.prices[r] * 0.7); }
  trade(owner: number, r: 'food' | 'wood' | 'stone', buy: boolean) {
    const p = this.players[owner].res;
    if (buy) {
      const cost = this.buyPrice(r);
      if (p.gold < cost) { if (owner === 1) this.event('Yetersiz altın', 'warn'); return false; }
      p.gold -= cost; p[r] += 100; this.prices[r] = Math.min(9999, this.prices[r] + 5);
      if (owner === 1) this.sound('coin');
    } else {
      if (p[r] < 100) { if (owner === 1) this.event('En az 100 gerekli', 'warn'); return false; }
      p[r] -= 100; p.gold += this.sellPrice(r); this.prices[r] = Math.max(20, this.prices[r] - 5);
      if (owner === 1) this.sound('coin');
    }
    return true;
  }

  unitStats(e: Entity) {
    const d = UNITS[e.type as UnitType];
    const o = e.owner;
    let attack = d.attack, melee = d.melee, pierce = d.pierce, range = d.range, speed = d.speed;
    if (d.cls === 'infantry' || d.cls === 'cavalry') attack += this.has(o, 'forging') ? 1 : 0;
    if (d.cls === 'archer') { const f = this.has(o, 'fletching') ? 1 : 0; attack += f; range += f; }
    if (d.cls === 'infantry' && this.has(o, 'scale_mail')) { melee++; pierce++; }
    if (d.cls === 'archer' && this.has(o, 'padded_archer')) { melee++; pierce++; }
    let bonus = d.bonus;
    for (const t of this.players[o].techs) {
      const u = UPGRADES[t];
      if (!u || !u.units.includes(e.type as UnitType)) continue;
      attack += u.attack ?? 0; melee += u.melee ?? 0; pierce += u.pierce ?? 0; range += u.range ?? 0;
      if (u.bonusCav) bonus = { ...bonus, cavalry: (bonus?.cavalry ?? 0) + u.bonusCav };
    }
    if (d.cls === 'villager') {
      if (this.has(o, 'loom')) { melee += 1; pierce += 2; }
      speed *= 1 + (this.has(o, 'wheelbarrow') ? 0.1 : 0) + (this.has(o, 'hand_cart') ? 0.1 : 0);
    }
    const civ = this.players[o]?.civ ?? 'turks';
    return { attack, melee, pierce, range, speed, reload: d.reload * civReloadMul(civ, e.type as UnitType), los: d.los + civLosBonus(civ, e.type as UnitType), cls: d.cls, bonus };
  }

  gatherRate(owner: number, node: Entity) {
    if (node.kind === 'building') return 0.32; // farm
    const d = NODES[node.type as ResourceNodeType];
    let m = 1;
    if (d.res === 'wood') m += (this.has(owner, 'double_bit_axe') ? 0.2 : 0) + (this.has(owner, 'bow_saw') ? 0.2 : 0);
    if (d.res === 'gold' && this.has(owner, 'gold_mining')) m += 0.15;
    if (d.res === 'stone' && this.has(owner, 'stone_mining')) m += 0.15;
    if (owner === 2) m *= this.opts.difficulty === 'easy' ? 0.8 : this.opts.difficulty === 'hard' ? 1.2 : 1;
    if (owner) m *= civGatherMul(this.players[owner].civ, { type: node.type, res: d.res, animal: d.animal });
    return d.rate * m;
  }

  recountPop() {
    for (const p of this.players) { p.pop = 0; p.popCap = 0; }
    for (const e of this.entities.values()) {
      const p = this.players[e.owner];
      if (!e.owner) continue;
      if (e.kind === 'unit') p.pop++;
      else if (e.kind === 'building' && e.built) p.popCap += BUILDINGS[e.type as BuildingType].pop ?? 0;
    }
    for (const p of this.players) p.popCap = Math.min(MAX_POP, p.popCap);
  }

  /** distinct building types toward next age */
  ageReqCount(owner: number) {
    const age = this.players[owner].age;
    const need = AGE_REQ[age] ?? [];
    const have = new Set<string>();
    for (const e of this.entities.values()) if (e.owner === owner && e.kind === 'building' && e.built && need.includes(e.type as BuildingType)) have.add(e.type);
    return have.size;
  }

  // ---------- queries ----------
  ownEntities(owner: number) { const out: Entity[] = []; for (const e of this.entities.values()) if (e.owner === owner) out.push(e); return out; }

  nearestDrop(owner: number, res: Res, x: number, y: number) {
    let best: Entity | undefined, bd = 1e9;
    for (const e of this.entities.values()) {
      if (e.owner !== owner || e.kind !== 'building' || !e.built) continue;
      const d = BUILDINGS[e.type as BuildingType];
      if (!d.drop?.includes(res)) continue;
      const dist = rectDist(Math.floor(x), Math.floor(y), this.rectOf(e));
      if (dist < bd) { bd = dist; best = e; }
    }
    return best;
  }

  nearestNode(res: Res, x: number, y: number, maxDist: number, pred?: (e: Entity) => boolean) {
    let best: Entity | undefined, bd = maxDist * maxDist;
    for (const e of this.entities.values()) {
      if (e.kind !== 'resource' || e.resType !== res || (e.amount ?? 0) <= 0) continue;
      if (pred && !pred(e)) continue;
      const dx = e.x + 0.5 - x, dy = e.y + 0.5 - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // ---------- placement ----------
  canPlace(type: BuildingType, x: number, y: number, owner: number) {
    const s = BUILDINGS[type].size;
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const tx = x + i, ty = y + j;
      if (!this.inBounds(tx, ty) || this.occ[this.idx(tx, ty)] >= 0 || this.isWater(tx, ty)) return false;
      if (owner === 1 && !this.explored[this.idx(tx, ty)]) return false;
      if (type === 'farm') for (const e of this.entities.values()) if (e.type === 'farm' && !e.dead && tx >= e.x && ty >= e.y && tx < e.x + e.size && ty < e.y + e.size) return false;
    }
    return true;
  }

  placeBuilding(owner: number, type: BuildingType, x: number, y: number, builders: Entity[]) {
    const d = BUILDINGS[type];
    if (d.age > this.players[owner].age) return null;
    if (!this.canAfford(owner, d.cost)) { if (owner === 1) this.event('Yetersiz kaynak', 'warn'); return null; }
    if (!this.canPlace(type, x, y, owner)) return null;
    this.pay(owner, d.cost);
    const b = this.spawnBuilding(type, owner, x, y, false);
    // move units standing inside the footprint out of the way
    for (const u of this.entities.values()) {
      if (u.kind !== 'unit' || d.walkable) continue;
      if (u.x >= x && u.y >= y && u.x < x + d.size && u.y < y + d.size) {
        const f = findFreeTileNear(this.size, this.size, this.blocked, Math.floor(u.x), Math.floor(u.y), 6);
        if (f) { u.x = f.x + 0.5; u.y = f.y + 0.5; u.path = undefined; }
      }
    }
    for (const u of builders) if (u.type === 'villager') this.setOrder(u, { kind: 'build', target: b.id });
    return b;
  }

  // ---------- production ----------
  canTrain(b: Entity, t: UnitType) {
    const d = UNITS[t];
    return b.built && d.age <= this.players[b.owner].age && (BUILDINGS[b.type as BuildingType].trains ?? []).includes(t) && this.civAllows(b.owner, t);
  }
  train(b: Entity, t: UnitType) {
    if (!this.canTrain(b, t) || (b.queue?.length ?? 0) >= 6) return false;
    const cost = this.unitCost(b.owner, t);
    if (!this.canAfford(b.owner, cost)) { if (b.owner === 1) this.event('Yetersiz kaynak', 'warn'); return false; }
    this.pay(b.owner, cost);
    b.queue!.push({ kind: 'unit', id: t, progress: 0, time: UNITS[t].time });
    return true;
  }
  techAvailable(owner: number, t: TechId) {
    const d = TECHS[t];
    const p = this.players[owner];
    if (p.techs.has(t) || d.age > p.age) return false;
    if (d.requires && !p.techs.has(d.requires)) return false;
    if ((t === 'feudal' && p.age !== 0) || (t === 'castle_age' && p.age !== 1) || (t === 'imperial' && p.age !== 2)) return false;
    for (const e of this.entities.values()) if (e.owner === owner && e.queue?.some((q) => q.id === t)) return false;
    return true;
  }
  research(b: Entity, t: TechId) {
    if (!b.built || !this.techAvailable(b.owner, t) || (b.queue?.length ?? 0) >= 6) return false;
    const isAge = t === 'feudal' || t === 'castle_age' || t === 'imperial';
    if (isAge && this.ageReqCount(b.owner) < 2) { if (b.owner === 1) this.event('Önce 2 farklı gerekli bina inşa et', 'warn'); return false; }
    const d = TECHS[t];
    const cost = this.techCost(b.owner, t);
    if (!this.canAfford(b.owner, cost)) { if (b.owner === 1) this.event('Yetersiz kaynak', 'warn'); return false; }
    this.pay(b.owner, cost);
    b.queue!.push({ kind: 'tech', id: t, progress: 0, time: d.time });
    return true;
  }
  cancel(b: Entity, i: number) {
    const q = b.queue?.[i];
    if (!q) return;
    this.refund(b.owner, q.kind === 'unit' ? this.unitCost(b.owner, q.id as UnitType) : this.techCost(b.owner, q.id as TechId));
    b.queue!.splice(i, 1);
  }

  applyTech(owner: number, t: TechId) {
    const p = this.players[owner];
    p.techs.add(t);
    if (t === 'feudal') p.age = 1;
    if (t === 'castle_age') p.age = 2;
    if (t === 'imperial') p.age = 3;
    for (const e of this.entities.values()) {
      if (e.owner !== owner || e.kind !== 'unit') continue;
      if (t === 'loom' && e.type === 'villager') { e.maxHp += 15; e.hp += 15; }
      if (t === 'man_at_arms' && e.type === 'militia') { e.type = 'manatarms'; e.maxHp = UNITS.manatarms.hp; e.hp = Math.min(e.maxHp, e.hp + 5); }
      const up = UPGRADES[t];
      if (up?.hp && up.units.includes(e.type as UnitType)) { e.maxHp += up.hp; e.hp += up.hp; }
    }
    if (owner === 1) { this.event(`${TECHS[t].name.replace(/ Geç$/, '')} tamamlandı`, 'good'); this.sound(t === 'feudal' || t === 'castle_age' || t === 'imperial' ? 'ageup' : 'built'); }
  }

  // ---------- garrison ----------
  garrisonCap(b: Entity) { return b.type === 'town_center' ? 15 : b.type === 'castle' ? 20 : b.type === 'watch_tower' ? 5 : 0; }
  garrisoned(b: Entity) { const out: Entity[] = []; for (const e of this.entities.values()) if (e.garrisonedIn === b.id) out.push(e); return out; }
  ungarrison(b: Entity) {
    for (const u of this.garrisoned(b)) {
      u.garrisonedIn = undefined;
      const sp = findFreeTileNear(this.size, this.size, this.blocked, b.x + b.size, b.y + b.size, 8) ?? { x: b.x + b.size, y: b.y + b.size };
      u.x = sp.x + 0.5 + (this.rng() - 0.5) * 0.3; u.y = sp.y + 0.5 + (this.rng() - 0.5) * 0.3;
      this.setOrder(u, { kind: 'idle' });
    }
  }
  /** Town bell: nearby villagers run into the closest shelter building. */
  ringBell(owner: number, b: Entity) {
    const room = this.garrisonCap(b) - this.garrisoned(b).length;
    const c = this.centerOf(b);
    const vills = [...this.entities.values()].filter((e) => e.owner === owner && e.type === 'villager' && !e.garrisonedIn && Math.hypot(e.x - c.x, e.y - c.y) < 16)
      .sort((a, z) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(z.x - c.x, z.y - c.y)).slice(0, Math.max(0, room));
    vills.forEach((v) => this.setOrder(v, { kind: 'garrison', target: b.id }));
    if (owner === 1 && vills.length) { this.event(`Alarm! ${vills.length} köylü sığınıyor`, 'warn'); this.sound('bell'); }
    return vills.length;
  }

  // ---------- orders ----------
  setOrder(u: Entity, o: Entity['order']) {
    u.order = o;
    u.path = undefined;
    u.pathGoal = undefined;
    u.working = false;
  }

  /** Give a "smart" right-click style command to a group. */
  command(units: Entity[], tx: number, ty: number, target?: Entity) {
    const own = units.filter((u) => u.kind === 'unit' && u.owner === 1);
    if (!own.length) return;
    if (target && target.owner !== 1 && target.owner !== 0) {
      own.forEach((u) => (UNITS[u.type as UnitType].buildingsOnly && target.kind !== 'building') ? this.moveGroup([u], tx, ty) : this.setOrder(u, { kind: 'attack', target: target.id }));
      return 'attack';
    }
    const vills = own.filter((u) => u.type === 'villager');
    const others = own.filter((u) => u.type !== 'villager');
    let kind: string = 'move';
    if (target && vills.length) {
      if (target.kind === 'resource') { vills.forEach((u) => this.setOrder(u, { kind: 'gather', target: target.id })); kind = 'gather'; }
      else if (target.kind === 'building' && target.owner === 1) {
        if (!target.built || target.hp < target.maxHp) { vills.forEach((u) => this.setOrder(u, { kind: 'build', target: target.id })); kind = 'build'; }
        else if (target.type === 'farm') { vills.slice(0, 1).forEach((u) => this.setOrder(u, { kind: 'gather', target: target.id })); kind = 'gather'; }
        else {
          const acc = BUILDINGS[target.type as BuildingType].drop ?? [];
          vills.forEach((u) => (u.carry && acc.includes(u.carry.type) ? this.setOrder(u, { kind: 'return', target: target.id }) : this.moveGroup([u], tx, ty)));
          kind = 'return';
        }
      } else this.moveGroup(vills, tx, ty);
      if (others.length) this.moveGroup(others, tx, ty);
      return kind;
    }
    this.moveGroup(own, tx, ty);
    return kind;
  }

  moveGroup(units: Entity[], tx: number, ty: number) {
    const n = units.length;
    const cols = Math.ceil(Math.sqrt(n));
    units.forEach((u, i) => {
      const ox = (i % cols) - (cols - 1) / 2, oy = Math.floor(i / cols) - (Math.ceil(n / cols) - 1) / 2;
      let gx = Math.floor(tx + ox * 0.9), gy = Math.floor(ty + oy * 0.9);
      if (this.blocked(gx, gy)) { const f = findFreeTileNear(this.size, this.size, this.blocked, gx, gy, 5); if (f) { gx = f.x; gy = f.y; } }
      this.setOrder(u, { kind: 'move', x: gx + 0.5, y: gy + 0.5 });
    });
  }

  /** Path-following; returns true when the unit is within `range` tiles of the rect. */
  moveTo(u: Entity, goal: Rect, range: number, dt: number, speed: number, moving = false) {
    const ux = Math.floor(u.x), uy = Math.floor(u.y);
    const distNow = rectDist(ux, uy, goal);
    if (distNow <= range && !u.path?.length) return true;
    const key = `${goal.x0},${goal.y0},${goal.x1},${goal.y1},${range}`;
    u.repath = (u.repath ?? 0) - dt;
    // also re-plan (throttled) when an empty path left us out of range, e.g. after being pushed by separation
    if (!u.path || u.pathGoal !== key || (moving && u.repath <= 0) || (!u.path.length && u.repath <= 0)) {
      u.path = findPath(this.size, this.size, this.blocked, ux, uy, goal, range, 3000);
      u.pathGoal = key;
      u.repath = 1 + this.rng();
      if (!u.path.length) return distNow <= range + 0.5; // unreachable or arrived
    }
    let step = speed * dt;
    while (step > 0 && u.path.length) {
      const p = u.path[0];
      const px = p.x + 0.5, py = p.y + 0.5;
      const dx = px - u.x, dy = py - u.y, d = Math.hypot(dx, dy);
      face(u, dx, dy);
      if (d <= step) { u.x = px; u.y = py; step -= d; u.path.shift(); if (rectDist(p.x, p.y, goal) <= range) { u.path = []; return true; } }
      else { u.x += (dx / d) * step; u.y += (dy / d) * step; step = 0; }
    }
    u.anim = (u.anim ?? 0) + dt * 8;
    return false;
  }

  moveToPoint(u: Entity, x: number, y: number, dt: number, speed: number) {
    const gx = Math.floor(x), gy = Math.floor(y);
    const arrived = this.moveTo(u, { x0: gx, y0: gy, x1: gx, y1: gy }, 0, dt, speed);
    if (arrived) {
      const dx = x - u.x, dy = y - u.y, d = Math.hypot(dx, dy), s = speed * dt;
      if (d > 0.05) { u.x += (dx / d) * Math.min(s, d); u.y += (dy / d) * Math.min(s, d); return false; }
    }
    return arrived;
  }

  spawnPoint(b: Entity) {
    const tx = b.x + b.size, ty = b.y + b.size;
    return findFreeTileNear(this.size, this.size, this.blocked, tx, ty, 8) ?? { x: tx, y: ty };
  }

  // ---------- update ----------
  update(realDt: number) {
    if (this.winner) return;
    let dt = Math.min(realDt, 0.1) * GAME_SPEED;
    while (dt > 0) {
      const step = Math.min(dt, 1 / 30);
      this.time += step;
      for (const f of this.onUpdate) f(this, step);
      dt -= step;
    }
    this.floats = this.floats.filter((f) => (f.t += realDt) < 1.4);
    this.corpses = this.corpses.filter((c) => (c.t += realDt) < 12);
    this.fogTimer -= realDt;
    if (this.fogTimer <= 0) { this.fogTimer = 0.2; this.updateFog(); }
    this.endTimer -= realDt;
    if (this.endTimer <= 0) { this.endTimer = 1; this.checkEnd(); }
  }

  private prevVisible: Uint8Array | null = null;
  updateFog() {
    if (!this.prevVisible) this.prevVisible = new Uint8Array(this.visible.length);
    this.prevVisible.set(this.visible);
    this.visible.fill(0);
    let newlyExplored = false;
    const s = this.size;
    for (const e of this.entities.values()) {
      if (e.owner !== 1 || e.garrisonedIn) continue;
      let los = 0;
      if (e.kind === 'unit') los = this.unitStats(e).los;
      else if (e.kind === 'building') los = e.built ? BUILDINGS[e.type as BuildingType].los + e.size / 2 : 2;
      const c = this.centerOf(e);
      const r2 = los * los;
      for (let y = Math.max(0, Math.floor(c.y - los)); y <= Math.min(s - 1, Math.ceil(c.y + los)); y++)
        for (let x = Math.max(0, Math.floor(c.x - los)); x <= Math.min(s - 1, Math.ceil(c.x + los)); x++) {
          const dx = x + 0.5 - c.x, dy = y + 0.5 - c.y;
          if (dx * dx + dy * dy <= r2) { const k = y * s + x; this.visible[k] = 1; if (!this.explored[k]) { this.explored[k] = 1; newlyExplored = true; } }
        }
    }
    if (newlyExplored) this.exploredVersion++;
    const pv = this.prevVisible;
    for (let i = 0; i < pv.length; i++) if (pv[i] !== this.visible[i]) { this.fogVersion++; break; }
  }

  checkEnd() {
    for (const pid of [1, 2]) {
      const p = this.players[pid];
      let alive = false;
      for (const e of this.entities.values()) {
        if (e.owner !== pid) continue;
        if (e.kind === 'unit' || (e.kind === 'building' && e.type !== 'palisade' && e.type !== 'farm' && e.type !== 'house')) { alive = true; break; }
      }
      if (!alive) { p.defeated = true; this.winner = pid === 1 ? 2 : 1; }
    }
  }
}
