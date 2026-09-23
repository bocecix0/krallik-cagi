import { BUILD_RANGE, BUILDINGS, NODES, UNITS } from './data';
import { rectDist } from './pathfinding';
import type { BuildingType, Entity, Res, ResourceNodeType, TechId, UnitType } from './types';
import type { World } from './world';

const RES_COLOR: Record<Res, string> = { food: '#ff8a7a', wood: '#d9a86c', gold: '#ffd54a', stone: '#c9cdd4' };

function distToEntity(w: World, u: Entity, t: Entity) {
  if (t.kind === 'unit') return Math.hypot(t.x - u.x, t.y - u.y);
  const r = w.rectOf(t);
  const cx = Math.max(r.x0, Math.min(r.x1 + 1, u.x)), cy = Math.max(r.y0, Math.min(r.y1 + 1, u.y));
  return Math.hypot(cx - u.x, cy - u.y);
}

function isEnemy(a: Entity, b: Entity) { return a.owner !== 0 && b.owner !== 0 && a.owner !== b.owner; }

export function damage(w: World, attacker: Entity | null, target: Entity, amount: number) {
  if (target.dead) return;
  target.hp -= amount;
  target.lastHit = w.time;
  if (target.owner === 1 && attacker && (target.kind === 'building' || target.type === 'villager') && w.time - lastAlarm > 12) {
    lastAlarm = w.time;
    w.event(target.kind === 'building' ? 'Binalarınız saldırı altında!' : 'Köylüleriniz saldırı altında!', 'warn', target.x, target.y);
  }
  if (target.kind === 'unit' && attacker && target.order?.kind === 'idle' && target.type !== 'villager' && target.type !== 'monk') {
    w.setOrder(target, { kind: 'attack', target: attacker.id });
  }
  if (target.hp <= 0) {
    if (attacker) w.players[attacker.owner].stats.killed++;
    w.players[target.owner].stats.lost++;
    w.remove(target);
  }
}
let lastAlarm = -99;

function computeDamage(w: World, a: Entity, t: Entity) {
  const s = w.unitStats(a);
  let armor = 0, bonus = 0;
  if (t.kind === 'unit') {
    const ts = w.unitStats(t);
    armor = s.range > 0 ? ts.pierce : ts.melee;
    bonus = s.bonus?.[ts.cls as 'infantry'] ?? 0;
  } else if (t.kind === 'building') {
    const bd = BUILDINGS[t.type as BuildingType];
    armor = s.range > 0 ? bd.pierce : bd.melee;
    bonus = s.bonus?.building ?? 0;
  }
  return Math.max(1, s.attack - armor) + bonus;
}

function fire(w: World, from: { x: number; y: number }, owner: number, t: Entity, dmg: number, splash = 0) {
  const c = w.centerOf(t);
  const d = Math.hypot(c.x - from.x, c.y - from.y);
  const speed = splash ? 4.5 : 7;
  w.projectiles.push({ x: from.x, y: from.y, tx: c.x, ty: c.y, target: t.id, damage: dmg, speed, owner, life: 0, total: Math.max(0.15, d / speed), splash, kind: splash ? 'stone' : 'arrow' });
}

function findEnemyNear(w: World, u: Entity, radius: number, unitsOnly = false) {
  let best: Entity | undefined, bd = radius;
  const buildingsOnly = u.kind === 'unit' && UNITS[u.type as UnitType]?.buildingsOnly;
  for (const e of w.entities.values()) {
    if (!isEnemy(u, e) || e.kind === 'resource' || e.garrisonedIn) continue;
    if (unitsOnly && e.kind !== 'unit') continue;
    if (buildingsOnly && e.kind !== 'building') continue;
    const d = distToEntity(w, u, e) + (e.kind === 'building' ? 2 : 0);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function updateUnit(w: World, u: Entity, dt: number) {
  if (u.garrisonedIn) { u.hp = Math.min(u.maxHp, u.hp + dt * 0.5); return; }
  const st = w.unitStats(u);
  const o = u.order ?? { kind: 'idle' };
  u.attackCd = Math.max(0, (u.attackCd ?? 0) - dt);
  u.working = false;
  switch (o.kind) {
    case 'idle': {
      if (u.type !== 'villager' && u.type !== 'monk') {
        u.repath = (u.repath ?? 0) - dt;
        if (u.repath <= 0) {
          u.repath = 0.6;
          const e = findEnemyNear(w, u, st.los);
          if (e) w.setOrder(u, { kind: 'attack', target: e.id });
        }
      }
      if (u.type === 'monk') healNearby(w, u, dt);
      break;
    }
    case 'move':
      if (w.moveToPoint(u, o.x, o.y, dt, st.speed)) w.setOrder(u, { kind: 'idle' });
      break;
    case 'gather': return gather(w, u, o.target, dt, st.speed);
    case 'return': return returnRes(w, u, o.target, o.resume, dt, st.speed);
    case 'build': return build(w, u, o.target, dt, st.speed);
    case 'garrison': {
      const b = w.get(o.target);
      if (!b || b.dead || !b.built || b.owner !== u.owner || w.garrisoned(b).length >= w.garrisonCap(b)) { w.setOrder(u, { kind: 'idle' }); return; }
      if (w.moveTo(u, w.rectOf(b), 1, dt, st.speed)) { u.garrisonedIn = b.id; u.path = []; u.order = { kind: 'idle' }; }
      return;
    }
    case 'attack': {
      const t = w.get(o.target);
      if (!t || t.dead || (UNITS[u.type as UnitType].buildingsOnly && t.kind !== 'building')) { w.setOrder(u, { kind: 'idle' }); u.repath = 0; return; }
      const d = distToEntity(w, u, t);
      const inRange = st.range > 0 ? d <= st.range + 0.4 : d <= 0.95;
      if (inRange) {
        u.path = [];
        const c = w.centerOf(t);
        if (Math.abs(c.x - u.x - (c.y - u.y)) > 0.05) u.facing = c.x - u.x - (c.y - u.y) >= 0 ? 1 : -1;
        u.working = true;
        u.anim = (u.anim ?? 0) + dt * 6;
        if (u.attackCd! <= 0) {
          u.attackCd = st.reload;
          const dmg = computeDamage(w, u, t);
          if (st.range > 0) fire(w, { x: u.x, y: u.y }, u.owner, t, dmg, UNITS[u.type as UnitType].splash ?? 0);
          else damage(w, u, t, dmg);
        }
      } else {
        w.moveTo(u, w.rectOf(t), st.range > 0 ? Math.max(1, Math.floor(st.range)) : 1, dt, st.speed, t.kind === 'unit');
      }
      break;
    }
  }
}

/** Visual close-up: slide towards a work point but stop `keep` tiles away (never enters blocked tiles). */
function stepToward(u: Entity, tx: number, ty: number, keep: number, step: number) {
  const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
  if (d <= keep + 0.02) return;
  const m = Math.min(step, d - keep);
  const nx = u.x + (dx / d) * m, ny = u.y + (dy / d) * m;
  if (Math.floor(nx) !== Math.floor(u.x) || Math.floor(ny) !== Math.floor(u.y)) return; // stay on our own tile
  u.x = nx; u.y = ny;
}

function healNearby(w: World, u: Entity, dt: number) {
  for (const e of w.entities.values()) {
    if (e.kind !== 'unit' || e.owner !== u.owner || e.hp >= e.maxHp || e === u) continue;
    if (Math.hypot(e.x - u.x, e.y - u.y) < 4) { e.hp = Math.min(e.maxHp, e.hp + dt * 1.5); u.working = true; break; }
  }
}

function gather(w: World, u: Entity, targetId: number, dt: number, speed: number) {
  let t = w.get(targetId);
  const cap = w.carryCap(u.owner);
  if (!t || t.dead || (t.amount ?? 0) <= 0 || (t.kind === 'building' && (!t.built || t.owner !== u.owner))) {
    const res: Res | undefined = u.carry?.type ?? (t?.resType as Res | undefined);
    const next = res && t?.kind !== 'building' ? w.nearestNode(res, u.x, u.y, 8, (e) => sameFamily(e, t)) : undefined;
    if (next) { w.setOrder(u, { kind: 'gather', target: next.id }); return; }
    if (u.carry && u.carry.amount > 0) { const d = w.nearestDrop(u.owner, u.carry.type, u.x, u.y); if (d) { w.setOrder(u, { kind: 'return', target: d.id }); return; } }
    w.setOrder(u, { kind: 'idle' });
    return;
  }
  const res = t.resType as Res;
  if (u.carry && u.carry.type !== res) u.carry = undefined; // switching resource drops the load (AoE2 behaviour)
  if ((u.carry?.amount ?? 0) >= cap) {
    const d = w.nearestDrop(u.owner, res, u.x, u.y);
    if (d) w.setOrder(u, { kind: 'return', target: d.id, resume: t.id });
    else u.working = false;
    return;
  }
  const isFarm = t.kind === 'building';
  const rect = w.rectOf(t);
  let arrived: boolean;
  if (isFarm) {
    arrived = u.x >= t.x && u.y >= t.y && u.x < t.x + t.size && u.y < t.y + t.size;
    if (!arrived) w.moveToPoint(u, t.x + t.size / 2, t.y + t.size / 2, dt, speed);
    else if (Math.hypot(t.x + t.size / 2 - u.x, t.y + t.size / 2 - u.y) > 0.4) w.moveToPoint(u, t.x + t.size / 2, t.y + t.size / 2, dt, speed);
  } else arrived = w.moveTo(u, rect, 1, dt, speed) && rectDist(Math.floor(u.x), Math.floor(u.y), rect) <= 1;
  if (!arrived) return;
  u.path = [];
  u.working = true;
  u.anim = (u.anim ?? 0) + dt * 5;
  if (!isFarm) {
    const dx = t.x + 0.5 - u.x, dy = t.y + 0.5 - u.y;
    if (Math.abs(dx - dy) > 0.05) u.facing = dx - dy >= 0 ? 1 : -1;
    stepToward(u, t.x + 0.5, t.y + 0.5, 0.7, speed * dt);
  }
  const amt = Math.min(w.gatherRate(u.owner, t) * dt, t.amount!);
  t.amount! -= amt;
  u.carry = { type: res, amount: (u.carry?.amount ?? 0) + amt };
  if (t.amount! <= 0.001) {
    if (isFarm) { w.remove(t); if (u.owner === 1) w.event('Bir tarla tükendi', 'info', t.x, t.y); }
    else { w.remove(t); if (NODES[t.type as ResourceNodeType].res === 'wood') w.corpses.push({ x: t.x, y: t.y, type: 'stump', owner: 0, t: -60, facing: 1 }); }
  }
}

function sameFamily(e: Entity, t?: Entity) {
  if (!t) return true;
  const a = NODES[e.type as ResourceNodeType], b = NODES[t.type as ResourceNodeType];
  if (!a || !b) return true;
  return a.res === b.res && !!a.animal === !!b.animal;
}

function returnRes(w: World, u: Entity, dropId: number, resume: number | undefined, dt: number, speed: number) {
  if (!u.carry || u.carry.amount <= 0) { w.setOrder(u, resume ? { kind: 'gather', target: resume } : { kind: 'idle' }); return; }
  let d = w.get(dropId);
  const acc = d ? BUILDINGS[d.type as BuildingType]?.drop : undefined;
  if (!d || d.dead || !d.built || !acc?.includes(u.carry.type)) {
    d = w.nearestDrop(u.owner, u.carry.type, u.x, u.y);
    if (!d) { w.setOrder(u, { kind: 'idle' }); return; }
    u.order = { kind: 'return', target: d.id, resume };
  }
  if (!w.moveTo(u, w.rectOf(d), 1, dt, speed)) return;
  const p = w.players[u.owner];
  const amt = Math.floor(u.carry.amount + 0.0001);
  p.res[u.carry.type] += amt;
  p.stats.gathered[u.carry.type] += amt;
  if (u.owner === 1 && amt > 0) w.float(u.x, u.y, `+${amt}`, RES_COLOR[u.carry.type]);
  u.carry = undefined;
  w.setOrder(u, resume ? { kind: 'gather', target: resume } : { kind: 'idle' });
}

function build(w: World, u: Entity, id: number, dt: number, speed: number) {
  const b = w.get(id);
  if (!b || b.dead || b.owner !== u.owner) { w.setOrder(u, { kind: 'idle' }); return; }
  const done = b.built && b.hp >= b.maxHp;
  if (done) { afterBuild(w, u, b); return; }
  const d = BUILDINGS[b.type as BuildingType];
  const rect = w.rectOf(b);
  const arrived = d.walkable ? w.moveTo(u, rect, 1, dt, speed) || rectDist(Math.floor(u.x), Math.floor(u.y), rect) <= BUILD_RANGE : w.moveTo(u, rect, 1, dt, speed);
  if (!arrived) return;
  u.path = [];
  u.working = true;
  u.anim = (u.anim ?? 0) + dt * 6;
  const c = w.centerOf(b);
  if (Math.abs(c.x - u.x - (c.y - u.y)) > 0.05) u.facing = c.x - u.x - (c.y - u.y) >= 0 ? 1 : -1;
  if (!d.walkable) {
    // hug the wall: nearest point of the footprint
    const nx = Math.max(b.x, Math.min(b.x + b.size, u.x)), ny = Math.max(b.y, Math.min(b.y + b.size, u.y));
    stepToward(u, nx, ny, 0.32, speed * dt);
  }
  if (!b.built) {
    const inc = dt / d.time;
    b.progress = Math.min(1, (b.progress ?? 0) + inc);
    b.hp = Math.min(b.maxHp, b.hp + inc * b.maxHp);
    if (b.progress >= 1) {
      b.built = true;
      w.players[b.owner].stats.built++;
      w.recountPop();
      if (b.owner === 1) w.event(`${d.name} tamamlandı`, 'good', b.x, b.y);
    }
  } else {
    b.hp = Math.min(b.maxHp, b.hp + (dt / d.time) * b.maxHp * 0.5); // repair
  }
}

function afterBuild(w: World, u: Entity, b: Entity) {
  let res: Res | undefined;
  let pred: ((e: Entity) => boolean) | undefined;
  if (b.type === 'farm') {
    const busy = [...w.entities.values()].some((o) => o !== u && o.order?.kind === 'gather' && o.order.target === b.id);
    if (!busy) { w.setOrder(u, { kind: 'gather', target: b.id }); return; }
  }
  if (b.type === 'lumber_camp') res = 'wood';
  if (b.type === 'mining_camp') { res = w.nearestNode('gold', b.x + 1, b.y + 1, 7) ? 'gold' : 'stone'; }
  if (b.type === 'mill') { res = 'food'; pred = (e) => e.type === 'berry'; }
  const n = res ? w.nearestNode(res, b.x + 1, b.y + 1, 9, pred) : undefined;
  w.setOrder(u, n ? { kind: 'gather', target: n.id } : { kind: 'idle' });
}

function updateBuilding(w: World, b: Entity, dt: number) {
  if (!b.built) return;
  const d = BUILDINGS[b.type as BuildingType];
  const q = b.queue?.[0];
  if (q) {
    const p = w.players[b.owner];
    if (q.kind === 'unit' && p.pop >= p.popCap) {
      if (!q.blocked) { q.blocked = true; if (b.owner === 1) w.event('Nüfus sınırı — ev inşa et!', 'warn'); }
    } else {
      q.blocked = false;
      q.progress += dt;
      if (q.progress >= q.time) {
        b.queue!.shift();
        if (q.kind === 'unit') spawnTrained(w, b, q.id as UnitType);
        else w.applyTech(b.owner, q.id as TechId);
      }
    }
  }
  if (d.attack) {
    b.attackCd = Math.max(0, (b.attackCd ?? 0) - dt);
    if (b.attackCd! <= 0) {
      const c = w.centerOf(b);
      const range = (d.range ?? 6) + (w.has(b.owner, 'fletching') ? 1 : 0) + b.size / 2;
      const pseudo = { ...b, x: c.x, y: c.y, kind: 'unit' as const };
      const t = findEnemyNear(w, pseudo, range, true);
      if (t) {
        b.attackCd = 2;
        const ts = w.unitStats(t);
        const dmg = Math.max(1, d.attack + (w.has(b.owner, 'fletching') ? 1 : 0) - ts.pierce);
        // every sheltered unit adds one arrow per volley (AoE2 garrison rule)
        const arrows = 1 + Math.min(10, w.garrisoned(b).length);
        for (let i = 0; i < arrows; i++) fire(w, { x: c.x + (w.rng() - 0.5) * b.size * 0.6, y: c.y + (w.rng() - 0.5) * b.size * 0.6 }, b.owner, t, i === 0 ? dmg : Math.max(1, dmg - 2));
      }
    }
  }
}

function spawnTrained(w: World, b: Entity, t: UnitType) {
  const sp = w.spawnPoint(b);
  const u = w.spawnUnit(t, b.owner, sp.x + 0.5, sp.y + 0.5);
  w.players[b.owner].stats.trained++;
  w.recountPop();
  if (b.rally) {
    const tx = Math.floor(b.rally.x), ty = Math.floor(b.rally.y);
    const target = w.inBounds(tx, ty) ? w.get(w.occ[w.idx(tx, ty)]) : undefined;
    if (t === 'villager' && target?.kind === 'resource') w.setOrder(u, { kind: 'gather', target: target.id });
    else w.setOrder(u, { kind: 'move', x: b.rally.x, y: b.rally.y });
  }
  if (b.owner === 1) w.event(`${UNITS[t].name} hazır`, 'info');
}

function updateProjectiles(w: World, dt: number) {
  w.projectiles = w.projectiles.filter((p) => {
    p.life += dt;
    const t = w.get(p.target);
    if (t && !t.dead) { const c = w.centerOf(t); p.tx = c.x; p.ty = c.y; }
    if (p.life >= p.total) {
      if (p.splash) {
        // area damage around the impact point (enemies of the shooter only)
        for (const e of [...w.entities.values()]) {
          if (e.owner === p.owner || e.owner === 0 || e.kind === 'resource' || e.garrisonedIn) continue;
          const c = w.centerOf(e);
          const d = Math.hypot(c.x - p.tx, c.y - p.ty) - (e.kind === 'building' ? e.size / 2 : 0);
          if (d <= p.splash) damage(w, null, e, e === t ? p.damage : Math.max(1, Math.round(p.damage * 0.5)));
        }
        w.float(p.tx, p.ty, '💥', '#fff');
      } else if (t && !t.dead) damage(w, null, t, p.damage);
      return false;
    }
    return true;
  });
}

/** Soft separation so units standing still don't stack perfectly. */
function separate(w: World, units: Entity[], dt: number) {
  const buckets = new Map<number, Entity[]>();
  for (const u of units) {
    const k = Math.floor(u.x) * 1000 + Math.floor(u.y);
    const b = buckets.get(k);
    if (b) b.push(u); else buckets.set(k, [u]);
  }
  for (const u of units) {
    if (u.path?.length) continue;
    const bx = Math.floor(u.x), by = Math.floor(u.y);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const b = buckets.get((bx + dx) * 1000 + by + dy);
      if (!b) continue;
      for (const o of b) {
        if (o === u) continue;
        const ex = u.x - o.x, ey = u.y - o.y, d = Math.hypot(ex, ey);
        if (d < 0.42 && d > 0.0001) {
          const push = ((0.42 - d) / d) * dt * 1.5;
          const nx = u.x + ex * push, ny = u.y + ey * push;
          if (!w.blocked(Math.floor(nx), Math.floor(ny)) || w.get(w.occ[w.idx(Math.floor(nx), Math.floor(ny))])?.type === 'farm') { u.x = nx; u.y = ny; }
        } else if (d <= 0.0001) { u.x += (w.rng() - 0.5) * 0.02; u.y += (w.rng() - 0.5) * 0.02; }
      }
    }
  }
}

export function simStep(w: World, dt: number) {
  const units: Entity[] = [];
  const blds: Entity[] = [];
  for (const e of w.entities.values()) {
    if (e.kind === 'unit') { if (!e.garrisonedIn) units.push(e); else updateUnit(w, e, dt); }
    else if (e.kind === 'building') blds.push(e);
    else if (e.type === 'sheep' || e.type === 'deer') e.anim = (e.anim ?? 0) + dt;
  }
  for (const u of units) if (!u.dead) updateUnit(w, u, dt);
  for (const b of blds) if (!b.dead) updateBuilding(w, b, dt);
  updateProjectiles(w, dt);
  separate(w, units, dt);
}

export { distToEntity, isEnemy };
