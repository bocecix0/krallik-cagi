import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { EnemyAI } from '../game/ai';
import { BUILDINGS } from '../game/data';
import { clampCamera, toScreenX, toScreenY, toTile, viewToWorld, type Camera } from '../game/iso';
import { simStep } from '../game/sim';
import type { BuildingType, Entity } from '../game/types';
import { World, type WorldOptions } from '../game/world';
import { pick, unitsInRect } from '../render/pick';
import type { Ghost, Marker } from '../render/render';

const haptic = (s: 'light' | 'medium' = 'light') => {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(s === 'light' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
};

export class Controller {
  w: World;
  ai: EnemyAI;
  cam: Camera = { x: 0, y: 0, zoom: 1, vw: 1, vh: 1 };
  sel = new Set<number>();
  ghost: Ghost | null = null;
  markers: Marker[] = [];
  box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  boxMode = false;
  paused = false;
  speed = 1;
  private lastTap = { t: 0, id: -1 };
  /** timestamp (performance.now) of the last touch on the map; drives the adaptive frame rate */
  lastInput = 0;
  private idleIdx = 0;
  /** increments whenever selection/mode changes so the HUD refreshes immediately */
  rev = 0;

  constructor(opts: WorldOptions) {
    this.w = new World(opts);
    this.ai = new EnemyAI(this.w, 2);
    this.w.onUpdate.push(simStep, (w, dt) => this.ai.update(w, dt));
    const tc = this.w.ownEntities(1).find((e) => e.type === 'town_center');
    if (tc) this.centerOn(tc.x + 2, tc.y + 2);
    this.cam.zoom = 1.1;
  }

  setViewport(vw: number, vh: number) { this.cam.vw = vw; this.cam.vh = vh; clampCamera(this.cam, this.w.size); }
  centerOn(tx: number, ty: number) { this.cam.x = toScreenX(tx, ty); this.cam.y = toScreenY(tx, ty); clampCamera(this.cam, this.w.size); }
  panBy(dx: number, dy: number) { this.cam.x -= dx / this.cam.zoom; this.cam.y -= dy / this.cam.zoom; clampCamera(this.cam, this.w.size); }
  zoomAt(factor: number, fx: number, fy: number) {
    const before = viewToWorld(this.cam, fx, fy);
    this.cam.zoom *= factor;
    clampCamera(this.cam, this.w.size);
    const after = viewToWorld(this.cam, fx, fy);
    this.cam.x += before.x - after.x; this.cam.y += before.y - after.y;
    clampCamera(this.cam, this.w.size);
  }

  selected(): Entity[] {
    const out: Entity[] = [];
    for (const id of [...this.sel]) { const e = this.w.get(id); if (e && !e.dead) out.push(e); else this.sel.delete(id); }
    return out;
  }
  select(list: Entity[]) { this.sel = new Set(list.map((e) => e.id)); this.rev++; }

  tick(dt: number) {
    if (!this.paused) this.w.update(dt * this.speed);
    this.markers = this.markers.filter((m) => (m.t += dt) < 0.8);
  }

  private marker(x: number, y: number, color: string) { this.markers.push({ x, y, t: 0, color }); }

  tap(vx: number, vy: number) {
    const wp = viewToWorld(this.cam, vx, vy);
    const tile = toTile(wp.x, wp.y);
    if (this.ghost) { this.moveGhost(tile.x, tile.y); return; }
    // finger-sized tolerance: ~18dp around the touch point
    const hit = pick(this.w, wp.x, wp.y, 18 / this.cam.zoom);
    const sel = this.selected();
    const ownUnits = sel.filter((e) => e.kind === 'unit' && e.owner === 1);
    const vills = ownUnits.filter((e) => e.type === 'villager');
    const now = Date.now();
    const dbl = hit && now - this.lastTap.t < 320 && this.lastTap.id === hit.id;
    this.lastTap = { t: now, id: hit?.id ?? -1 };

    if (dbl && hit && hit.owner === 1) {
      // double tap: select all of that type on screen
      const same = [...this.w.entities.values()].filter((e) => e.owner === 1 && e.type === hit.type && !e.garrisonedIn && this.onScreen(e));
      this.select(same.slice(0, 40));
      haptic('medium');
      return;
    }
    const villagerAction = hit && hit.owner === 1 && hit.kind === 'building' && vills.length > 0 &&
      (!hit.built || hit.hp < hit.maxHp || hit.type === 'farm' || (vills.some((v) => v.carry && (BUILDINGS[hit.type as BuildingType].drop ?? []).includes(v.carry.type))));
    if (hit && hit.owner === 1 && !villagerAction) { this.select([hit]); haptic(); return; }
    if (ownUnits.length) {
      const kind = this.w.command(ownUnits, tile.x, tile.y, hit);
      const col = kind === 'attack' ? '#ff5a4a' : kind === 'gather' || kind === 'build' || kind === 'return' ? '#ffd54a' : '#7dff8a';
      if (hit) this.marker(hit.kind === 'unit' ? hit.x : hit.x + hit.size / 2, hit.kind === 'unit' ? hit.y : hit.y + hit.size / 2, col);
      else this.marker(tile.x, tile.y, col);
      haptic();
      return;
    }
    const prod = sel.find((e) => e.kind === 'building' && e.owner === 1 && BUILDINGS[e.type as BuildingType].trains);
    if (prod && (!hit || hit.kind === 'resource')) {
      prod.rally = { x: tile.x, y: tile.y };
      this.marker(tile.x, tile.y, '#6fa8ff');
      haptic();
      return;
    }
    if (hit) { this.select([hit]); return; }
    this.select([]);
  }

  onScreen(e: Entity) {
    const sx = toScreenX(e.x, e.y), sy = toScreenY(e.x, e.y);
    const v = { x: (sx - this.cam.x) * this.cam.zoom + this.cam.vw / 2, y: (sy - this.cam.y) * this.cam.zoom + this.cam.vh / 2 };
    return v.x > 0 && v.y > 0 && v.x < this.cam.vw && v.y < this.cam.vh;
  }

  boxSelect() {
    if (!this.box) return;
    const a = viewToWorld(this.cam, this.box.x0, this.box.y0), b = viewToWorld(this.cam, this.box.x1, this.box.y1);
    const units = unitsInRect(this.w, a.x, a.y, b.x, b.y);
    const military = units.filter((u) => u.type !== 'villager');
    this.select((military.length ? military : units).slice(0, 60));
    this.box = null;
    if (units.length) haptic('medium');
  }

  // ---------- placement ----------
  startPlacement(type: BuildingType) {
    const spot = this.suggestSpot(type);
    this.ghost = { type, x: spot.x, y: spot.y, valid: this.w.canPlace(type, spot.x, spot.y, 1) };
    const size = BUILDINGS[type].size;
    // only move the camera when the suggested spot is not already visible
    const sx = toScreenX(spot.x + size / 2, spot.y + size / 2), sy = toScreenY(spot.x + size / 2, spot.y + size / 2);
    const vx = (sx - this.cam.x) * this.cam.zoom + this.cam.vw / 2, vy = (sy - this.cam.y) * this.cam.zoom + this.cam.vh / 2;
    if (vx < 40 || vy < 60 || vx > this.cam.vw - 40 || vy > this.cam.vh - 40) this.centerOn(spot.x + size / 2, spot.y + size / 2);
    this.rev++;
  }

  /** Smart default position: camps next to their resource, farms around TC/mill, others near the view centre. */
  suggestSpot(type: BuildingType) {
    const w = this.w;
    const size = BUILDINGS[type].size;
    const tc = this.townCenter();
    const base = tc ? { x: tc.x + 2, y: tc.y + 2 } : (() => { const c = viewToWorld(this.cam, this.cam.vw / 2, this.cam.vh / 2); return toTile(c.x, c.y); })();
    const explored = (e: { x: number; y: number }) => w.explored[w.idx(e.x, e.y)] === 1;
    let anchor = { x: base.x, y: base.y };
    let near: ((x: number, y: number) => boolean) | null = null;
    const res = type === 'lumber_camp' ? 'wood' : type === 'mining_camp' ? 'gold' : type === 'mill' ? 'food' : null;
    if (res) {
      const node = w.nearestNode(res, base.x, base.y, 30, (e) => explored(e) && (type !== 'mill' || e.type === 'berry'))
        ?? (type === 'mining_camp' ? w.nearestNode('stone', base.x, base.y, 30, explored) : undefined);
      if (node) {
        anchor = { x: node.x, y: node.y };
        const rt = node.resType;
        near = (x, y) => { for (let j = -1; j <= size; j++) for (let i = -1; i <= size; i++) { const e = w.get(w.occ[w.idx(Math.max(0, Math.min(w.size - 1, x + i)), Math.max(0, Math.min(w.size - 1, y + j)))]); if (e?.kind === 'resource' && e.resType === rt) return true; } return false; };
      }
    } else if (type !== 'farm') {
      const c = viewToWorld(this.cam, this.cam.vw / 2, this.cam.vh / 2);
      anchor = toTile(c.x, c.y);
    }
    let best = { x: Math.floor(anchor.x - size / 2), y: Math.floor(anchor.y - size / 2) }, bestD = 1e9;
    const ax = Math.floor(anchor.x), ay = Math.floor(anchor.y);
    for (let r = 0; r <= 12; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = ax + dx - Math.floor(size / 2), y = ay + dy - Math.floor(size / 2);
        if (!w.canPlace(type, x, y, 1)) continue;
        if (near && !near(x, y)) continue;
        const d = Math.hypot(x + size / 2 - base.x, y + size / 2 - base.y) * (res ? 0.3 : 1) + Math.hypot(dx, dy);
        if (d < bestD) { bestD = d; best = { x, y }; }
      }
      if (bestD < 1e9 && r >= 3) break;
    }
    return best;
  }
  moveGhost(tx: number, ty: number) {
    if (!this.ghost) return;
    const size = BUILDINGS[this.ghost.type].size;
    this.ghost.x = Math.floor(tx - size / 2 + 0.5);
    this.ghost.y = Math.floor(ty - size / 2 + 0.5);
    this.ghost.valid = this.w.canPlace(this.ghost.type, this.ghost.x, this.ghost.y, 1);
    this.rev++;
  }
  confirmPlacement() {
    const g = this.ghost;
    if (!g) return false;
    const builders = this.selected().filter((e) => e.type === 'villager' && e.owner === 1);
    const b = this.w.placeBuilding(1, g.type, g.x, g.y, builders);
    if (!b) { haptic('medium'); return false; }
    haptic('medium');
    this.marker(g.x + BUILDINGS[g.type].size / 2, g.y + BUILDINGS[g.type].size / 2, '#ffd54a');
    // farms & walls & houses: keep placing if still affordable
    if (!(g.type === 'farm' || g.type === 'palisade' || g.type === 'house') || !this.w.canAfford(1, BUILDINGS[g.type].cost)) this.ghost = null;
    else this.moveGhost(g.x + BUILDINGS[g.type].size / 2 + (g.type === 'palisade' ? 1 : BUILDINGS[g.type].size), g.y + BUILDINGS[g.type].size / 2);
    this.rev++;
    return true;
  }
  cancelPlacement() { this.ghost = null; this.rev++; }

  // ---------- shortcuts ----------
  idleVillagers() { return this.w.ownEntities(1).filter((e) => e.type === 'villager' && e.order?.kind === 'idle' && !e.garrisonedIn); }
  nextIdleVillager() {
    const idle = this.idleVillagers();
    if (!idle.length) return;
    const v = idle[this.idleIdx++ % idle.length];
    this.select([v]);
    this.centerOn(v.x, v.y);
  }
  selectArmy() {
    const army = this.w.ownEntities(1).filter((e) => e.kind === 'unit' && e.type !== 'villager' && !e.garrisonedIn);
    this.select(army.slice(0, 60));
    if (army[0]) { const cx = army.reduce((s, e) => s + e.x, 0) / army.length, cy = army.reduce((s, e) => s + e.y, 0) / army.length; this.centerOn(cx, cy); }
  }
  goHome() {
    const tc = this.w.ownEntities(1).find((e) => e.type === 'town_center');
    if (tc) { this.select([tc]); this.centerOn(tc.x + 2, tc.y + 2); }
  }
  /** Picks a builder (idle first, else nearest to the view centre) and enters placement mode. */
  quickBuild(type: BuildingType) {
    const vills = this.w.ownEntities(1).filter((e) => e.type === 'villager' && !e.garrisonedIn);
    if (!vills.length) return;
    const c = viewToWorld(this.cam, this.cam.vw / 2, this.cam.vh / 2);
    const t = toTile(c.x, c.y);
    const idle = vills.filter((v) => v.order?.kind === 'idle');
    const pool = idle.length ? idle : vills;
    pool.sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y));
    this.select([pool[0]]);
    this.startPlacement(type);
  }
  townCenter() { return this.w.ownEntities(1).find((e) => e.type === 'town_center' && e.built); }

  // ---------- control groups ----------
  groups: number[][] = [[], [], []];
  assignGroup(i: number) { this.groups[i] = this.selected().filter((e) => e.owner === 1).map((e) => e.id); haptic('medium'); this.rev++; }
  groupSize(i: number) { return this.groups[i].filter((id) => { const e = this.w.get(id); return e && !e.dead; }).length; }
  selectGroup(i: number) {
    const list = this.groups[i].map((id) => this.w.get(id)).filter((e): e is Entity => !!e && !e.dead);
    if (!list.length) return;
    const again = list.length === this.sel.size && list.every((e) => this.sel.has(e.id));
    this.select(list);
    if (again || list.length === 1) {
      const cx = list.reduce((s, e) => s + this.w.centerOf(e).x, 0) / list.length, cy = list.reduce((s, e) => s + this.w.centerOf(e).y, 0) / list.length;
      this.centerOn(cx, cy);
    }
    haptic();
  }

  /** villagers per resource (gathering it or carrying it home) */
  workerCounts() {
    const c = { food: 0, wood: 0, gold: 0, stone: 0 };
    for (const e of this.w.entities.values()) {
      if (e.owner !== 1 || e.type !== 'villager' || e.garrisonedIn) continue;
      const o = e.order;
      let r = o?.kind === 'gather' ? this.w.get(o.target)?.resType : o?.kind === 'return' ? e.carry?.type : undefined;
      if (o?.kind === 'build' && this.w.get(o.target)?.type === 'farm') r = 'food';
      if (r) c[r]++;
    }
    return c;
  }
  private workerIdx = 0;
  /** tap on a resource counter: cycle through villagers working it */
  selectWorkers(r: 'food' | 'wood' | 'gold' | 'stone') {
    const list = this.w.ownEntities(1).filter((e) => e.type === 'villager' && !e.garrisonedIn &&
      ((e.order?.kind === 'gather' && this.w.get(e.order.target)?.resType === r) || (e.order?.kind === 'return' && e.carry?.type === r)));
    if (!list.length) return;
    const v = list[this.workerIdx++ % list.length];
    this.select([v]);
    this.centerOn(v.x, v.y);
  }

  stop() { this.selected().forEach((e) => e.kind === 'unit' && e.owner === 1 && this.w.setOrder(e, { kind: 'idle' })); this.rev++; }
  deleteSelected() { this.selected().forEach((e) => e.owner === 1 && this.w.remove(e)); this.w.recountPop(); this.select([]); }
}
