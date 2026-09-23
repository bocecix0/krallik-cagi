import { T } from './types';
import type { ResourceNodeType } from './types';

export interface MapGenResult {
  size: number;
  terrain: Uint8Array;
  nodes: { type: ResourceNodeType; x: number; y: number }[];
  starts: { x: number; y: number }[];
}
export type MapStyle = 'anadolu' | 'goller';

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => { state = (state + 0x6d2b79f5) | 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const treeTypes: ResourceNodeType[] = ['tree_oak', 'tree_oak2', 'tree_pine', 'tree_birch'];
const cluster7 = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]];
const cluster5 = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
const cluster4 = [[0, 0], [1, 0], [0, 1], [1, 1]];

export function generateMap(size: number, seed: number, style: MapStyle): MapGenResult {
  const n = Math.max(16, Math.floor(size)); const rng = mulberry32(seed); const terrain = new Uint8Array(n * n); terrain.fill(T.Grass);
  const occupied = new Uint8Array(n * n); const nodes: { type: ResourceNodeType; x: number; y: number }[] = [];
  const idx = (x: number, y: number): number => y * n + x;
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < n && y < n;
  const centerDist = (x: number, y: number, s: { x: number; y: number }): number => Math.hypot(x - (s.x + 2), y - (s.y + 2));
  const jitter = Math.floor(rng() * 5) - 2;
  const p1 = Math.max(2, Math.min(n - 6, Math.floor(n * 0.72) + jitter));
  const starts = [{ x: p1, y: p1 }, { x: n - 4 - p1, y: n - 4 - p1 }];
  const protectedTile = (x: number, y: number): boolean => starts.some((s) => x >= s.x - 1 && x <= s.x + 4 && y >= s.y - 1 && y <= s.y + 4);
  const clearOfStarts = (x: number, y: number, radius: number): boolean => starts.every((s) => centerDist(x, y, s) > radius);
  const hash = (x: number, y: number, salt: number): number => { let v = Math.imul(x + salt, 374761393) ^ Math.imul(y - salt, 668265263) ^ seed; v = Math.imul(v ^ (v >>> 13), 1274126177); return ((v ^ (v >>> 16)) >>> 0) / 4294967296; };
  const noise = (x: number, y: number, scale: number, salt: number): number => {
    const gx = Math.floor(x / scale); const gy = Math.floor(y / scale); const fx = x / scale - gx; const fy = y / scale - gy;
    const sx = fx * fx * (3 - 2 * fx); const sy = fy * fy * (3 - 2 * fy);
    const a = hash(gx, gy, salt) * (1 - sx) + hash(gx + 1, gy, salt) * sx;
    const b = hash(gx, gy + 1, salt) * (1 - sx) + hash(gx + 1, gy + 1, salt) * sx;
    return a * (1 - sy) + b * sy;
  };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = noise(x, y, style === 'anadolu' ? 7 : 9, 17) * 0.68 + noise(x, y, 3.7, 83) * 0.32;
    terrain[idx(x, y)] = v < (style === 'anadolu' ? 0.37 : 0.31) ? T.Grass2 : v > (style === 'anadolu' ? 0.78 : 0.86) ? T.Dirt : T.Grass;
  }
  const paintLake = (cx: number, cy: number, radius: number): void => {
    for (let y = cy - radius - 2; y <= cy + radius + 2; y++) for (let x = cx - radius - 2; x <= cx + radius + 2; x++) {
      if (!inside(x, y) || !clearOfStarts(x, y, 9)) continue;
      const d = Math.hypot(x - cx, y - cy) + (hash(x, y, 211) - 0.5) * 0.7;
      if (d <= radius + 2) terrain[idx(x, y)] = d <= radius ? T.DeepWater : d <= radius + 1 ? T.Water : T.Sand;
    }
  };
  const lakeCount = style === 'goller' ? 2 + Math.floor(rng() * 2) : 1;
  for (let i = 0; i < lakeCount; i++) {
    let placed = false;
    for (let tries = 0; tries < 80 && !placed; tries++) {
      const x = 5 + Math.floor(rng() * (n - 10)); const y = 5 + Math.floor(rng() * (n - 10));
      if (clearOfStarts(x, y, 12) && Math.abs((x + y) - n) > 4) { paintLake(x, y, style === 'goller' ? 2 + Math.floor(rng() * 2) : 2); placed = true; }
    }
  }
  const land = (x: number, y: number): boolean => inside(x, y) && terrain[idx(x, y)] >= T.Dirt;
  const put = (type: ResourceNodeType, x: number, y: number): boolean => {
    if (!land(x, y) || occupied[idx(x, y)] || protectedTile(x, y)) return false;
    occupied[idx(x, y)] = 1; nodes.push({ type, x, y }); if (type.startsWith('tree_')) terrain[idx(x, y)] = T.Forest; return true;
  };
  for (const s of starts) for (let y = s.y - 1; y <= s.y + 4; y++) for (let x = s.x - 1; x <= s.x + 4; x++) if (inside(x, y)) { occupied[idx(x, y)] = 1; if (terrain[idx(x, y)] > T.Dirt) terrain[idx(x, y)] = T.Grass; }
  const growForest = (cx: number, cy: number, radius: number, type: ResourceNodeType, min = 0): void => {
    let count = 0;
    for (let y = cy - radius; y <= cy + radius; y++) for (let x = cx - radius; x <= cx + radius; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= radius && (d < radius - 1 || noise(x, y, 3.3, 301 + cx + cy) > 0.28) && clearOfStarts(x, y, 6) && put(type, x, y)) count++;
    }
    if (count < min) for (let y = cy - radius; y <= cy + radius; y++) for (let x = cx - radius; x <= cx + radius; x++) if (count < min && Math.hypot(x - cx, y - cy) <= radius + 1 && clearOfStarts(x, y, 6) && put(type, x, y)) count++;
  };
  const c0 = { x: starts[0].x + 2, y: starts[0].y + 2 }; const c1 = { x: starts[1].x + 2, y: starts[1].y + 2 };
  growForest(c0.x - 10, c0.y, 3, treeTypes[Math.floor(rng() * 4)], 25);
  growForest(c1.x + 10, c1.y, 3, treeTypes[Math.floor(rng() * 4)], 25);
  for (let i = 0; i < 6; i++) { const edge = i % 4; const p = 2 + Math.floor(rng() * (n - 4)); growForest(edge === 0 ? 2 : edge === 1 ? n - 3 : p, edge === 2 ? 2 : edge === 3 ? n - 3 : p, 3, treeTypes[Math.floor(rng() * 4)]); }
  for (let i = 0; i < n * n / 100; i++) growForest(3 + Math.floor(rng() * (n - 6)), 3 + Math.floor(rng() * (n - 6)), 2, treeTypes[Math.floor(rng() * 4)]);
  const mirror = (x: number, y: number): { x: number; y: number } => ({ x: n - 1 - x, y: n - 1 - y });
  const freePair = (x: number, y: number): boolean => { const m = mirror(x, y); return x > 0 && y > 0 && x < n - 1 && y < n - 1 && land(x, y) && land(m.x, m.y) && !occupied[idx(x, y)] && !occupied[idx(m.x, m.y)]; };
  const pair = (type: ResourceNodeType, x: number, y: number): void => { const m = mirror(x, y); put(type, x, y); put(type, m.x, m.y); };
  const choose = (minD0: number, maxD0: number, pattern: number[][], type: ResourceNodeType, separate = false): void => {
    // relax the distance band step by step so every player always gets its start resources
    for (let t = 0; t < 2400; t++) { const relax = Math.floor(t / 400); const minD = Math.max(3, minD0 - relax); const maxD = maxD0 + relax * 2;
      const x = Math.floor(rng() * n); const y = Math.floor(rng() * n); const d = Math.hypot(x - c1.x, y - c1.y);
      if (d < minD || d > maxD || !pattern.every(([ox, oy]) => Math.hypot(x + ox - c1.x, y + oy - c1.y) >= minD && Math.hypot(x + ox - c1.x, y + oy - c1.y) <= maxD && freePair(x + ox, y + oy))) continue;
      if (separate && nodes.some((v) => (v.type === 'sheep') && Math.hypot(v.x - x, v.y - y) <= 1)) continue;
      for (const [ox, oy] of pattern) pair(type, x + ox, y + oy); return;
    }
  };
  choose(5, 7, [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]], 'berry');
  for (let i = 0; i < 4; i++) choose(3, 7, [[0, 0]], 'sheep', true);
  choose(7, 9, cluster7, 'gold'); choose(11, 14, cluster4, 'gold'); choose(8, 11, cluster5, 'stone');
  for (let i = 0; i < 2; i++) choose(10, 14, [[0, 0]], 'deer'); choose(9, 12, [[0, 0]], 'boar');
  const neutral = (type: ResourceNodeType, pattern: number[][]): void => { for (let t = 0; t < 600; t++) { const x = Math.floor(n * 0.32 + rng() * n * 0.36); const y = Math.floor(n * 0.32 + rng() * n * 0.36); if (pattern.every(([ox, oy]) => x + ox > 0 && y + oy > 0 && x + ox < n - 1 && y + oy < n - 1 && land(x + ox, y + oy) && !occupied[idx(x + ox, y + oy)])) { for (const [ox, oy] of pattern) put(type, x + ox, y + oy); return; } } };
  for (let i = 0; i < 3; i++) neutral('gold', cluster4); for (let i = 0; i < 2; i++) neutral('stone', cluster4); for (let i = 0; i < 6; i++) neutral('deer', [[0, 0]]);
  return { size: n, terrain, nodes, starts };
}
