import { BUILDINGS, TECHS, UNITS } from './data';
import type { BuildingType, Difficulty, Entity, Res, TechId, UnitType } from './types';
import type { World } from './world';

type Point = { x: number; y: number };
type Snapshot = { villagers: Entity[]; army: Entity[]; buildings: Entity[]; enemies: Entity[]; resources: Entity[] };

const THINK: Record<Difficulty, number> = { easy: 1, normal: 0.75, hard: 0.5 };
const VILLAGER_TARGET: Record<Difficulty, number> = { easy: 26, normal: 34, hard: 38 };
const FEUDAL_VILLAGERS: Record<Difficulty, number> = { easy: 14, normal: 11, hard: 10 };
const CASTLE_VILLAGERS: Record<Difficulty, number> = { easy: 18, normal: 16, hard: 14 };
const FIRST_WAVE: Record<Difficulty, number> = { easy: 780, normal: 570, hard: 450 };
const WAVE_SIZE: Record<Difficulty, number> = { easy: 4, normal: 5, hard: 5 };
const RESOURCES: Res[] = ['food', 'wood', 'gold', 'stone'];

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
const isMilitary = (e: Entity): boolean => e.kind === 'unit' && e.type !== 'villager' && e.type !== 'monk';
const isTree = (e: Entity): boolean => e.kind === 'resource' && e.resType === 'wood';

export function difficultyLabel(d: Difficulty): string {
  switch (d) {
    case 'easy': return 'Kolay';
    case 'normal': return 'Normal';
    case 'hard': return 'Zor';
  }
}

export class EnemyAI {
  private readonly owner: number;
  private elapsed = 0;
  private base: Point;
  private forest?: Point;
  private gold?: Point;
  private wave = 0;
  private nextWave: number;
  private readonly waveUnits = new Set<number>();
  private readonly siegeVillagers = new Set<number>();
  private readonly retreatUntil = new Map<number, number>();

  constructor(w: World, owner: number) {
    this.owner = owner;
    this.base = { x: w.size / 2, y: w.size / 2 };
    this.nextWave = FIRST_WAVE[w.opts.difficulty];
    try {
      const tc = w.ownEntities(owner).find((e) => e.kind === 'building' && e.type === 'town_center');
      if (tc) this.base = w.centerOf(tc);
    } catch { /* A malformed world should not break the simulation loop. */ }
  }

  update(w: World, dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0 || !w.players[this.owner]) return;
    this.elapsed += dt;
    const interval = THINK[w.opts.difficulty];
    if (this.elapsed < interval) return;
    this.elapsed %= interval;
    try { this.think(w); } catch { /* AI decisions must never stop simulation. */ }
  }

  private think(w: World): void {
    const own = w.ownEntities(this.owner);
    const snap: Snapshot = { villagers: [], army: [], buildings: [], enemies: [], resources: [] };
    for (const e of own) {
      if (e.kind === 'building') snap.buildings.push(e);
      else if (e.kind === 'unit' && e.type === 'villager') snap.villagers.push(e);
      else if (isMilitary(e)) snap.army.push(e);
    }
    for (const e of w.entities.values()) {
      if (e.kind === 'resource') snap.resources.push(e);
      else if (e.owner === 1) snap.enemies.push(e);
    }
    const tc = snap.buildings.find((e) => e.type === 'town_center' && e.built);
    if (tc) this.base = w.centerOf(tc);
    for (const v of snap.villagers) if (v.order?.kind === 'build' && v.path?.length === 0 && !v.working) {
      w.setOrder(v, { kind: 'build', target: v.order.target });
    }
    this.releaseRetreats(w);
    const targets = this.allocateEconomy(w, snap);
    this.manageBuildings(w, snap, tc, targets);
    this.manageResearch(w, snap, tc);
    this.trainVillagers(w, snap, tc);
    this.trainMilitary(w, snap);
    this.defend(w, snap, tc);
    this.manageWaves(w, snap, tc);
  }

  private trainVillagers(w: World, s: Snapshot, tc?: Entity): void {
    if (!tc) return;
    const p = w.player(this.owner), d = w.opts.difficulty;
    const saving = (p.age === 0 && s.villagers.length >= FEUDAL_VILLAGERS[d]) ||
      (p.age === 1 && s.villagers.length >= CASTLE_VILLAGERS[d]);
    const aging = (tc.queue ?? []).some((q) => q.kind === 'tech' && (q.id === 'feudal' || q.id === 'castle_age'));
    const queued = (tc.queue ?? []).filter((q) => q.kind === 'unit' && q.id === 'villager').length;
    if (!saving && !aging && queued < 1 && s.villagers.length + queued < VILLAGER_TARGET[d]) w.train(tc, 'villager');
  }

  private economyTargets(w: World, n: number): Record<Res, number> {
    const p = w.player(this.owner), d = w.opts.difficulty;
    let foodShare = 0.52, woodShare = 0.32, goldMin = 0;
    if (p.age === 0) {
      const saving = n >= FEUDAL_VILLAGERS[d];
      foodShare = saving ? (d === 'easy' ? 0.75 : 0.82) : 0.56;
      woodShare = saving ? 0.15 : 0.32;
      goldMin = 0;
    } else if (p.age === 1) {
      foodShare = n >= CASTLE_VILLAGERS[d] ? 0.68 : 0.62;
      woodShare = 0.22;
      goldMin = Math.min(n, 3);
    } else {
      foodShare = 0.48;
      woodShare = 0.28;
      goldMin = Math.min(n, Math.max(6, Math.round(n * 0.2)));
    }
    let gold = Math.min(n, goldMin);
    let food = Math.min(n - gold, Math.round(n * foodShare));
    let wood = Math.min(n - food - gold, Math.round(n * woodShare));
    if (p.res.wood > 800 && wood > 2) { const moved = Math.min(wood - 2, Math.ceil((p.res.wood - 800) / 300)); wood -= moved; food += moved; }
    if (p.res.food > 900 && food > 2) { food--; gold++; }
    if (p.res.gold > 800 && gold > (p.age >= 2 ? 6 : 3)) { gold--; food++; }
    const remainder = Math.max(0, n - food - wood - gold);
    if (p.age < 2) wood += remainder;
    return { food, wood, gold, stone: p.age >= 2 ? remainder : 0 };
  }

  private villagerResource(w: World, v: Entity): Res | undefined {
    if (v.order?.kind === 'gather') return w.get(v.order.target)?.resType;
    if (v.order?.kind === 'return') return v.carry?.type ?? w.get(v.order.resume)?.resType;
    return v.carry?.type;
  }

  private allocateEconomy(w: World, s: Snapshot): Record<Res, number> {
    const available = s.villagers.filter((v) => !this.retreatUntil.has(v.id) && !this.siegeVillagers.has(v.id) && v.order?.kind !== 'build');
    const targets = this.economyTargets(w, available.length);
    const counts: Record<Res, number> = { food: 0, wood: 0, gold: 0, stone: 0 };
    for (const v of available) {
      const res = this.villagerResource(w, v);
      if (res) counts[res]++;
    }
    for (const v of available.filter((u) => (u.order?.kind ?? 'idle') === 'idle')) {
      const wanted = this.largestDeficit(targets, counts);
      if (wanted && this.orderGather(w, s, v, wanted)) counts[wanted]++;
    }
    for (let moves = 0; moves < 4; moves++) {
      const wanted = this.largestDeficit(targets, counts);
      if (!wanted) break;
      const source = RESOURCES.reduce<Res | undefined>((best, r) => {
        const surplus = counts[r] - targets[r], bestSurplus = best ? counts[best] - targets[best] : 0;
        return surplus > bestSurplus ? r : best;
      }, undefined);
      if (!source || counts[source] <= targets[source]) break;
      const candidates = available.filter((v) => this.villagerResource(w, v) === source);
      candidates.sort((a, b) => (a.carry?.amount ?? 0) - (b.carry?.amount ?? 0));
      if (!candidates[0] || !this.orderGather(w, s, candidates[0], wanted)) break;
      counts[source]--; counts[wanted]++;
    }
    return targets;
  }

  private largestDeficit(targets: Record<Res, number>, counts: Record<Res, number>): Res | undefined {
    let best: Res | undefined, amount = 0;
    for (const r of RESOURCES) if (targets[r] - counts[r] > amount) { best = r; amount = targets[r] - counts[r]; }
    return best;
  }

  private orderGather(w: World, s: Snapshot, v: Entity, res: Res): boolean {
    let node: Entity | undefined;
    if (res === 'food') {
      node = s.buildings.find((b) => b.type === 'farm' && b.built && (b.amount ?? 0) > 0 &&
        !s.villagers.some((o) => o.order?.kind === 'gather' && o.order.target === b.id));
      if (!node) node = w.nearestNode('food', this.base.x, this.base.y, 15);
      if (!node) node = w.nearestNode('food', v.x, v.y, 22);
    } else if (res === 'wood') {
      const camp = s.buildings.find((b) => b.type === 'lumber_camp' && b.built);
      if (camp) { const c = w.centerOf(camp); node = w.nearestNode('wood', c.x, c.y, 7); }
      node ??= w.nearestNode('wood', v.x, v.y, 28);
    } else if (res === 'gold') {
      const camp = s.buildings.find((b) => b.type === 'mining_camp' && b.built);
      if (camp) { const c = w.centerOf(camp); node = w.nearestNode('gold', c.x, c.y, 8); }
      node ??= w.nearestNode('gold', v.x, v.y, 30);
    } else node = w.nearestNode(res, v.x, v.y, 30);
    if (!node) return false;
    w.setOrder(v, { kind: 'gather', target: node.id });
    return true;
  }

  private manageBuildings(w: World, s: Snapshot, tc: Entity | undefined, targets: Record<Res, number>): void {
    const p = w.player(this.owner), has = (type: BuildingType) => s.buildings.some((b) => b.type === type);
    if (!tc && p.age >= 2 && this.build(w, s, 'town_center', this.base, 7, 2)) return;
    const houseGoing = s.buildings.some((b) => b.type === 'house' && !b.built);
    const queuedUnits = s.buildings.reduce((n, b) => n + (b.queue ?? []).filter((q) => q.kind === 'unit').length, 0);
    if (p.pop + queuedUnits + 1 >= p.popCap && p.popCap < 100 && !houseGoing && this.build(w, s, 'house', this.base, 10, 1)) return;
    if (!has('barracks') && this.build(w, s, 'barracks', this.base, 11, 2)) return;
    if (p.age >= 1 && !has('stable')) { this.build(w, s, 'stable', this.base, 12, 2); return; }
    if (p.age >= 1 && !has('blacksmith')) { this.build(w, s, 'blacksmith', this.base, 11, 1); return; }
    const woodWorkers = s.villagers.filter((v) => this.villagerResource(w, v) === 'wood');
    if (woodWorkers.length >= 2 && !s.buildings.some((b) => b.type === 'lumber_camp' && !b.built)) {
      const camps = s.buildings.filter((b) => b.type === 'lumber_camp');
      let tree = woodWorkers.map((v) => v.order?.kind === 'gather' ? w.get(v.order.target) : undefined)
        .find((n) => n && isTree(n) && !camps.some((c) => distance(w.centerOf(c), w.centerOf(n)) <= 6));
      tree ??= this.forestNode(w, s.resources);
      if (tree && camps.length === 0 && !camps.some((c) => distance(w.centerOf(c), w.centerOf(tree!)) <= 6) &&
          this.build(w, s, 'lumber_camp', w.centerOf(tree), 3, 1)) return;
    }
    const goldTarget = w.nearestNode('gold', this.base.x, this.base.y, 24);
    if (targets.gold >= 2 && goldTarget && !has('mining_camp') &&
        this.build(w, s, 'mining_camp', w.centerOf(goldTarget), 3, 1)) return;
    const berry = w.nearestNode('food', this.base.x, this.base.y, 12, (e) => e.type === 'berry');
    if (p.age >= 1 && berry && !has('mill') && p.res.wood >= 160 && this.build(w, s, 'mill', w.centerOf(berry), 3, 1)) return;
    if (p.age >= 1 && !has('archery_range') && p.res.wood > 450 && this.build(w, s, 'archery_range', this.base, 13, 2)) return;
    const naturalFood = s.resources.reduce((sum, e) => sum + (e.resType === 'food' && distance(w.centerOf(e), this.base) <= 16 ? e.amount ?? 0 : 0), 0);
    const naturalSlots = Math.min(targets.food, 4, Math.floor(naturalFood / 180));
    const farms = s.buildings.filter((b) => b.type === 'farm' && (b.amount ?? 0) > 0);
    const farmsGoing = farms.filter((b) => !b.built).length;
    if (farms.length + naturalSlots < targets.food && farmsGoing < 2) {
      const mill = s.buildings.find((b) => b.type === 'mill' && b.built);
      if (this.build(w, s, 'farm', mill ? w.centerOf(mill) : this.base, 11, 1)) return;
    }
    const militaryBuildings = s.buildings.filter((b) => b.type === 'barracks' || b.type === 'stable' || b.type === 'archery_range');
    if (p.age >= 1 && p.res.wood > 800 && militaryBuildings.length < Math.max(2, Math.floor(s.villagers.length / 10))) {
      const type: BuildingType = p.age >= 2 && militaryBuildings.filter((b) => b.type === 'stable').length < 2 ? 'stable' : 'barracks';
      this.build(w, s, type, this.base, 15, 2);
    }
  }

  private build(w: World, s: Snapshot, type: BuildingType, anchor: Point, radius: number, count: number): boolean {
    if (!w.canAfford(this.owner, BUILDINGS[type].cost)) return false;
    const candidates = s.villagers.filter((v) => !this.retreatUntil.has(v.id) && v.order?.kind !== 'build');
    candidates.sort((a, b) => distance(a, anchor) - distance(b, anchor));
    const builders = candidates.slice(0, Math.min(count, candidates.length));
    if (!builders.length) return false;
    const size = BUILDINGS[type].size, cx = Math.floor(anchor.x - size / 2), cy = Math.floor(anchor.y - size / 2);
    for (let r = 0; r <= radius; r++) {
      for (let dx = -r; dx <= r; dx++) for (const dy of r === 0 ? [0] : [-r, r]) {
        if (this.placeAt(w, s, type, cx + dx, cy + dy, builders)) return true;
      }
      for (let dy = -r + 1; dy < r; dy++) for (const dx of [-r, r]) {
        if (this.placeAt(w, s, type, cx + dx, cy + dy, builders)) return true;
      }
    }
    return false;
  }

  private placeAt(w: World, s: Snapshot, type: BuildingType, x: number, y: number, builders: Entity[]): boolean {
    if (!w.canPlace(type, x, y, this.owner)) return false;
    const size = BUILDINGS[type].size;
    for (const b of s.buildings) {
      if (type === 'farm' && (b.type === 'town_center' || b.type === 'mill')) continue;
      if (x - 1 <= b.x + b.size - 1 && x + size >= b.x && y - 1 <= b.y + b.size - 1 && y + size >= b.y) return false;
    }
    return w.placeBuilding(this.owner, type, x, y, builders) !== null;
  }

  private forestNode(w: World, resources: Entity[]): Entity | undefined {
    if (this.forest) {
      const live = resources.find((e) => isTree(e) && distance(w.centerOf(e), this.forest!) <= 4);
      if (live) return live;
    }
    const trees = resources.filter((e) => isTree(e) && distance(w.centerOf(e), this.base) <= 12);
    let best: Entity | undefined, density = -1;
    for (const tree of trees) {
      const c = w.centerOf(tree), score = trees.reduce((n, e) => n + (distance(c, w.centerOf(e)) <= 3 ? 1 : 0), 0);
      if (score > density) { best = tree; density = score; }
    }
    if (best) this.forest = w.centerOf(best);
    return best;
  }

  private goldPoint(w: World): Point {
    if (!this.gold) {
      const node = w.nearestNode('gold', this.base.x, this.base.y, 18);
      if (node) this.gold = w.centerOf(node);
    }
    return this.gold ?? this.base;
  }

  private manageResearch(w: World, s: Snapshot, tc?: Entity): void {
    const p = w.player(this.owner), count = s.villagers.length, d = w.opts.difficulty;
    if (p.age === 0 && count >= FEUDAL_VILLAGERS[w.opts.difficulty] && w.ageReqCount(this.owner) >= 2 &&
        this.research(w, tc, 'feudal', 0)) return;
    if (p.age === 1 && count >= CASTLE_VILLAGERS[d] && w.ageReqCount(this.owner) >= 2 &&
        this.research(w, tc, 'castle_age', 0)) return;
    if (p.age === 1) {
      const barracks = s.buildings.find((b) => b.type === 'barracks' && b.built);
      this.research(w, barracks, 'man_at_arms', 0);
      return;
    }
    if (p.age === 0 && count >= FEUDAL_VILLAGERS[d]) return;
    if (p.age === 0) return;
    if (p.age < 1) return;
    const barracks = s.buildings.find((b) => b.type === 'barracks' && b.built);
    if (this.research(w, barracks, 'man_at_arms', p.age === 1 ? 650 : 100)) return;
    const upgrades: [BuildingType, TechId][] = [
      ['lumber_camp', 'double_bit_axe'], ['mill', 'horse_collar'], ['mining_camp', 'gold_mining'],
      ['blacksmith', 'forging'], ['town_center', 'wheelbarrow'],
    ];
    for (const [type, tech] of upgrades) {
      const building = s.buildings.find((b) => b.type === type && b.built);
      if (this.research(w, building, tech, 100)) return;
    }
  }

  private research(w: World, building: Entity | undefined, tech: TechId, foodReserve: number): boolean {
    if (!building || !w.techAvailable(this.owner, tech)) return false;
    const cost = TECHS[tech].cost, foodAfter = w.player(this.owner).res.food - (cost.food ?? 0);
    if (foodAfter < foodReserve || !w.canAfford(this.owner, cost)) return false;
    return w.research(building, tech);
  }

  private trainMilitary(w: World, s: Snapshot): void {
    const p = w.player(this.owner);
    const queued = s.buildings.reduce((n, b) => n + (b.queue ?? []).filter((q) => q.kind === 'unit').length, 0);
    if (p.pop + queued >= p.popCap) return;
    const total = (type: UnitType) => s.army.filter((u) => u.type === type).length + s.buildings.reduce((n, b) =>
      n + (b.queue ?? []).filter((q) => q.kind === 'unit' && q.id === type).length, 0);
    let choices: UnitType[] = [];
    if (p.age === 0) {
      if (this.wave === 0 && s.army.length + queued < WAVE_SIZE[w.opts.difficulty]) choices = ['militia'];
    } else if (p.age === 1) {
      const savingCastle = s.villagers.length >= CASTLE_VILLAGERS[w.opts.difficulty];
      const cap = w.opts.difficulty === 'easy' ? 8 : w.opts.difficulty === 'normal' ? 9 : 10;
      if (w.has(this.owner, 'man_at_arms') && s.army.length + queued < cap && (!savingCastle || s.army.length + queued < 7)) {
        choices = ['manatarms'];
      }
    } else choices = total('knight') < Math.max(4, total('manatarms')) ? ['knight', 'manatarms'] : ['manatarms', 'knight'];
    for (const type of choices) {
      const source = s.buildings.find((b) => b.built && b.type === UNITS[type].from && (b.queue?.length ?? 0) < 2);
      const cost = UNITS[type].cost;
      const reserve = p.age === 1 && s.villagers.length >= CASTLE_VILLAGERS[w.opts.difficulty]
        ? w.opts.difficulty === 'easy' ? 600 : w.opts.difficulty === 'normal' ? 450 : 250 : 0;
      if (source && p.res.food - (cost.food ?? 0) >= reserve && w.train(source, type)) return;
    }
  }

  private defend(w: World, s: Snapshot, tc?: Entity): void {
    const threats = s.enemies.filter((e) => e.kind === 'unit' && s.buildings.some((b) => distance(w.centerOf(e), w.centerOf(b)) <= 12));
    if (threats.length) {
      const target = threats.reduce((best, e) => distance(w.centerOf(e), this.base) < distance(w.centerOf(best), this.base) ? e : best);
      for (const u of s.army) if ((u.order?.kind ?? 'idle') === 'idle') w.setOrder(u, { kind: 'attack', target: target.id });
    }
    const attacked = s.villagers.some((v) => w.time - (v.lastHit ?? -Infinity) < 3);
    if (!attacked || s.army.length >= Math.max(4, threats.length * 2)) return;
    const refuge = tc ? w.centerOf(tc) : this.base;
    for (const v of s.villagers) if (distance(v, refuge) <= 8) {
      this.retreatUntil.set(v.id, Math.max(this.retreatUntil.get(v.id) ?? 0, w.time + 20));
      w.setOrder(v, { kind: 'move', x: refuge.x, y: refuge.y });
    }
  }

  private releaseRetreats(w: World): void {
    for (const [id, until] of this.retreatUntil) if (w.time >= until || !w.get(id)) {
      const v = w.get(id);
      if (v) w.setOrder(v, { kind: 'idle' });
      this.retreatUntil.delete(id);
    }
  }

  private manageWaves(w: World, s: Snapshot, tc?: Entity): void {
    for (const id of [...this.waveUnits]) if (!w.get(id)) this.waveUnits.delete(id);
    for (const id of [...this.siegeVillagers]) if (!w.get(id)) this.siegeVillagers.delete(id);
    let target = this.attackTarget(w, s);
    if (!target) this.waveUnits.clear();
    else for (const id of this.waveUnits) {
      const u = w.get(id);
      if (u && (u.order?.kind !== 'attack' || !w.get(u.order.target))) w.setOrder(u, { kind: 'attack', target: target.id });
    }
    if (!tc && target) for (const u of s.army) {
      this.waveUnits.add(u.id);
      if (u.order?.kind !== 'attack' || !w.get(u.order.target)) w.setOrder(u, { kind: 'attack', target: target.id });
    }
    if (w.time >= this.nextWave) {
      const needed = WAVE_SIZE[w.opts.difficulty];
      if (target && s.army.length >= needed) {
        for (const u of s.army) { this.waveUnits.add(u.id); w.setOrder(u, { kind: 'attack', target: target.id }); }
        this.wave++;
        const base = w.opts.difficulty === 'easy' ? 150 : w.opts.difficulty === 'normal' ? 90 : 70;
        this.nextWave = w.time + base + w.rng() * 20;
      } else this.nextWave = w.time + 15;
    }
    if (this.wave >= 2 && target && w.opts.difficulty !== 'easy') {
      const count = w.opts.difficulty === 'hard' ? 6 : 5;
      const candidates = s.villagers.filter((v) => !this.retreatUntil.has(v.id) && v.order?.kind !== 'build');
      candidates.sort((a, b) => distance(a, w.centerOf(target!)) - distance(b, w.centerOf(target!)));
      for (const v of candidates) {
        if (this.siegeVillagers.size >= count) break;
        this.siegeVillagers.add(v.id);
      }
      for (const id of this.siegeVillagers) {
        const v = w.get(id);
        if (v && (v.order?.kind !== 'attack' || v.order.target !== target.id)) w.setOrder(v, { kind: 'attack', target: target.id });
      }
    }
    const idle = s.army.filter((u) => !this.waveUnits.has(u.id) && (u.order?.kind ?? 'idle') === 'idle');
    if (!idle.length) return;
    const humanTc = s.enemies.find((e) => e.kind === 'building' && e.type === 'town_center');
    const toward = humanTc ? w.centerOf(humanTc) : { x: w.size / 2, y: w.size / 2 };
    const from = tc ? w.centerOf(tc) : this.base, dx = toward.x - from.x, dy = toward.y - from.y, len = Math.hypot(dx, dy) || 1;
    w.moveGroup(idle, from.x + dx / len * 5, from.y + dy / len * 5);
  }

  private attackTarget(w: World, s: Snapshot): Entity | undefined {
    const humanTc = s.enemies.find((e) => e.kind === 'building' && e.type === 'town_center');
    const humanBase = humanTc ? w.centerOf(humanTc) : { x: w.size / 2, y: w.size / 2 };
    const villagers = s.enemies.filter((e) => e.kind === 'unit' && e.type === 'villager');
    if (villagers.length) return villagers.reduce((best, e) => distance(w.centerOf(e), this.base) < distance(w.centerOf(best), this.base) ? e : best);
    const military = s.enemies.filter(isMilitary);
    if (military.length) return military.reduce((best, e) => distance(w.centerOf(e), humanBase) < distance(w.centerOf(best), humanBase) ? e : best);
    if (humanTc) return humanTc;
    return s.enemies.find((e) => e.kind === 'building');
  }
}
