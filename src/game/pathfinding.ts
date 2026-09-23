export interface Rect { x0: number; y0: number; x1: number; y1: number }
export type BlockedFn = (x: number, y: number) => boolean;

let capacity = 0;
let gScore = new Float32Array(0);
let cameFrom = new Int32Array(0);
let closed = new Uint8Array(0);

const SQRT2 = 1.4142;
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

export function rectDist(x: number, y: number, r: Rect): number {
  const dx = x < r.x0 ? r.x0 - x : x > r.x1 ? x - r.x1 : 0;
  const dy = y < r.y0 ? r.y0 - y : y > r.y1 ? y - r.y1 : 0;
  return Math.max(dx, dy);
}

function octileToRect(x: number, y: number, r: Rect): number {
  const dx = x < r.x0 ? r.x0 - x : x > r.x1 ? x - r.x1 : 0;
  const dy = y < r.y0 ? r.y0 - y : y > r.y1 ? y - r.y1 : 0;
  const min = Math.min(dx, dy);
  return dx + dy + (SQRT2 - 2) * min;
}

function ensure(n: number): void {
  if (capacity === n) return;
  capacity = n;
  gScore = new Float32Array(n);
  cameFrom = new Int32Array(n);
  closed = new Uint8Array(n);
}

function push(heap: number[], scores: number[], node: number, score: number): void {
  let i = heap.length;
  heap.push(node); scores.push(score);
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (scores[p] <= score) break;
    heap[i] = heap[p]; scores[i] = scores[p]; i = p;
  }
  heap[i] = node; scores[i] = score;
}

function pop(heap: number[], scores: number[]): number {
  const result = heap[0];
  const node = heap.pop(); const score = scores.pop();
  if (heap.length === 0 || node === undefined || score === undefined) return result;
  let i = 0;
  while (true) {
    let child = i * 2 + 1;
    if (child >= heap.length) break;
    if (child + 1 < heap.length && scores[child + 1] < scores[child]) child++;
    if (scores[child] >= score) break;
    heap[i] = heap[child]; scores[i] = scores[child]; i = child;
  }
  heap[i] = node; scores[i] = score;
  return result;
}

export function findPath(w: number, h: number, blocked: BlockedFn, sx: number, sy: number, goal: Rect, range: number, maxIter = 5000): { x: number; y: number }[] {
  w = Math.floor(w); h = Math.floor(h); sx = Math.floor(sx); sy = Math.floor(sy);
  if (w <= 0 || h <= 0 || sx < 0 || sy < 0 || sx >= w || sy >= h) return [];
  let effectiveRange = range;
  if (range < 1) {
    let goalHasFreeTile = false;
    for (let y = goal.y0; y <= goal.y1 && !goalHasFreeTile; y++) for (let x = goal.x0; x <= goal.x1; x++) {
      if (!blocked(x, y)) { goalHasFreeTile = true; break; }
    }
    if (!goalHasFreeTile) effectiveRange = 1;
  }
  const reaches = (x: number, y: number): boolean => !blocked(x, y) && rectDist(x, y, goal) <= effectiveRange;
  if (reaches(sx, sy)) return [];
  const n = w * h; ensure(n);
  gScore.fill(Infinity); cameFrom.fill(-1); closed.fill(0);
  const start = sy * w + sx;
  gScore[start] = 0;
  const heap: number[] = []; const scores: number[] = [];
  const heuristic = (x: number, y: number): number => Math.max(0, octileToRect(x, y, goal) - effectiveRange);
  push(heap, scores, start, heuristic(sx, sy));
  let best = start; let bestH = heuristic(sx, sy); let found = -1;
  for (let iter = 0; heap.length > 0 && iter < maxIter; iter++) {
    const cur = pop(heap, scores);
    if (closed[cur]) continue;
    closed[cur] = 1;
    const x = cur % w; const y = (cur / w) | 0;
    const hCur = heuristic(x, y);
    if (hCur < bestH) { best = cur; bestH = hCur; }
    if (reaches(x, y)) { found = cur; break; }
    for (let d = 0; d < 8; d++) {
      const nx = x + DX[d]; const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || blocked(nx, ny)) continue;
      if (d >= 4 && (blocked(x + DX[d], y) || blocked(x, y + DY[d]))) continue;
      const next = ny * w + nx;
      if (closed[next]) continue;
      const nextG = gScore[cur] + (d < 4 ? 1 : SQRT2);
      if (nextG >= gScore[next]) continue;
      gScore[next] = nextG; cameFrom[next] = cur;
      push(heap, scores, next, nextG + heuristic(nx, ny));
    }
  }
  const end = found >= 0 ? found : best;
  if (end === start) return [];
  const path: { x: number; y: number }[] = [];
  for (let at = end; at !== start && at >= 0; at = cameFrom[at]) path.push({ x: at % w, y: (at / w) | 0 });
  path.reverse();
  return path;
}

export function findFreeTileNear(w: number, h: number, blocked: BlockedFn, x: number, y: number, maxRadius = 8): { x: number; y: number } | null {
  const cx = Math.floor(x); const cy = Math.floor(y);
  for (let r = 0; r <= Math.max(0, Math.floor(maxRadius)); r++) {
    for (let dx = -r; dx <= r; dx++) {
      const ys = r === 0 ? [0] : [-r, r];
      for (const dy of ys) {
        const px = cx + dx; const py = cy + dy;
        if (px >= 0 && py >= 0 && px < w && py < h && !blocked(px, py)) return { x: px, y: py };
      }
    }
    for (let dy = -r + 1; dy < r; dy++) {
      for (const dx of [-r, r]) {
        const px = cx + dx; const py = cy + dy;
        if (px >= 0 && py >= 0 && px < w && py < h && !blocked(px, py)) return { x: px, y: py };
      }
    }
  }
  return null;
}
