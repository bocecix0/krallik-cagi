import { toScreenX, toScreenY, toTile } from '../game/iso';
import type { Entity } from '../game/types';
import type { World } from '../game/world';
import { MASKS } from './loader';
import { buildingKey, nodeKey, spriteSize, unitKey } from './sprites';

function visibleToPlayer(w: World, e: Entity) {
  const cx = Math.floor(e.kind === 'unit' ? e.x : e.x + e.size / 2), cy = Math.floor(e.kind === 'unit' ? e.y : e.y + e.size / 2);
  if (!w.inBounds(cx, cy)) return false;
  if (e.kind === 'unit' && e.owner !== 1) return w.visible[w.idx(cx, cy)] === 1;
  return w.explored[w.idx(cx, cy)] === 1;
}

/** Tests the sprite's low-res alpha mask; returns null when no mask is available. */
function maskHit(key: string, left: number, top: number, sw: number, sh: number, wx: number, wy: number, flip = false): boolean | null {
  const m = MASKS[key];
  if (!m) return null;
  let u = (wx - left) / sw;
  const v = (wy - top) / sh;
  if (u < 0 || v < 0 || u >= 1 || v >= 1) return false;
  if (flip) u = 1 - u;
  const x = Math.floor(u * m.w), y = Math.floor(v * m.h);
  // small dilation so thin parts are still tappable
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const xx = x + dx, yy = y + dy;
    if (xx >= 0 && yy >= 0 && xx < m.w && yy < m.h && m.data[yy * m.w + xx]) return true;
  }
  return false;
}

/** Picks the top-most entity under a world-pixel point. `slop` is extra touch radius in world px. */
export function pick(w: World, wx: number, wy: number, slop: number): Entity | undefined {
  const tile = toTile(wx, wy);
  let bestUnit: Entity | undefined, bestUnitD = 1e9;
  let bestSprite: Entity | undefined, bestSpriteDepth = -1e9;
  let bestGround: Entity | undefined;
  for (const e of w.entities.values()) {
    if (e.garrisonedIn || !visibleToPlayer(w, e)) continue;
    if (e.kind === 'unit') {
      const s = spriteSize(unitKey(e));
      const sx = toScreenX(e.x, e.y), sy = toScreenY(e.x, e.y);
      const hw = Math.max(s.w / 2, 12) + slop;
      if (wx > sx - hw && wx < sx + hw && wy > sy - s.h - slop && wy < sy + 6 + slop) {
        const d = Math.hypot(wx - sx, wy - (sy - s.h / 2));
        if (d < bestUnitD) { bestUnitD = d; bestUnit = e; }
      }
      continue;
    }
    let key: string, cx: number, by: number, sw: number, sh: number;
    if (e.kind === 'building') {
      key = buildingKey(e.type);
      const s = spriteSize(key as never, e.size);
      cx = toScreenX(e.x + e.size, e.y + e.size); by = toScreenY(e.x + e.size, e.y + e.size) + s.oy; sw = s.w; sh = s.h;
      if (tile.x >= e.x && tile.y >= e.y && tile.x < e.x + e.size && tile.y < e.y + e.size) bestGround = e;
    } else {
      key = nodeKey(e.type);
      const s = spriteSize(key as never);
      cx = toScreenX(e.x + 0.5, e.y + 0.5); by = toScreenY(e.x + 0.5, e.y + 0.5) + s.oy; sw = s.w; sh = s.h;
      if (Math.floor(tile.x) === e.x && Math.floor(tile.y) === e.y && !bestGround) bestGround = e;
    }
    const hit = maskHit(key, cx - sw / 2, by - sh, sw, sh, wx, wy, e.facing === -1 && e.kind === 'resource');
    const boxHit = hit ?? (wx > cx - sw * 0.4 && wx < cx + sw * 0.4 && wy > by - sh * 0.9 && wy < by);
    if (!boxHit) continue;
    const depth = e.x + e.y + e.size;
    if (depth > bestSpriteDepth) { bestSpriteDepth = depth; bestSprite = e; }
  }
  if (bestUnit) return bestUnit;
  // near-miss on a unit (small targets on a phone): take the closest unit within the slop radius
  if (!bestSprite) {
    let near: Entity | undefined, nd = slop * 1.6;
    for (const e of w.entities.values()) {
      if (e.kind !== 'unit' || e.garrisonedIn || !visibleToPlayer(w, e)) continue;
      const d = Math.hypot(wx - toScreenX(e.x, e.y), wy - (toScreenY(e.x, e.y) - 18));
      if (d < nd) { nd = d; near = e; }
    }
    if (near) return near;
  }
  return bestSprite ?? bestGround;
}

/** All own units whose feet are inside a world-pixel rect. */
export function unitsInRect(w: World, x0: number, y0: number, x1: number, y1: number) {
  const out: Entity[] = [];
  const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
  for (const e of w.entities.values()) {
    if (e.kind !== 'unit' || e.owner !== 1 || e.garrisonedIn) continue;
    const sx = toScreenX(e.x, e.y), sy = toScreenY(e.x, e.y) - 15;
    if (sx >= ax && sx <= bx && sy >= ay && sy <= by) out.push(e);
  }
  return out;
}
