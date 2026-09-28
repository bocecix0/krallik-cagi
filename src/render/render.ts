import { BlendMode, FilterMode, MipmapMode, PaintStyle, Skia, type SkCanvas, type SkFont, type SkImage, type SkPaint, type SkPicture, type SkRect, type SkRSXform } from '@shopify/react-native-skia';
import { BUILDINGS } from '../game/data';
import { TH, TW, toScreenX, toScreenY, viewToWorld, type Camera } from '../game/iso';
import { TERRAIN_COUNT, type BuildingType, type Entity } from '../game/types';
import type { World } from '../game/world';
import { ATLAS } from './manifest';
import { FxSystem } from './fx';
import { buildingKey, nodeKey, spriteSize, unitKey, type Images } from './sprites';

const fxSystems = new WeakMap<World, FxSystem>();
function fxFor(w: World) {
  let f = fxSystems.get(w);
  if (!f) { f = new FxSystem(); fxSystems.set(w, f); }
  return f;
}

export interface Ghost { type: BuildingType; x: number; y: number; valid: boolean }
export interface Marker { x: number; y: number; t: number; color: string }
export interface RenderState {
  selection: Set<number>;
  ghost: Ghost | null;
  markers: Marker[];
  box: { x0: number; y0: number; x1: number; y1: number } | null; // view coords
  time: number;
}

const P = () => Skia.Paint();
const paints = {
  shadow: (() => { const p = P(); p.setColor(Skia.Color('rgba(0,0,0,0.28)')); return p; })(),
  sel: (() => { const p = P(); p.setStyle(PaintStyle.Stroke); p.setStrokeWidth(1.6); p.setAntiAlias(true); return p; })(),
  fill: P(),
  img: (() => { const p = P(); p.setAntiAlias(true); return p; })(),
  alpha: P(),
  text: P(),
  stroke: (() => { const p = P(); p.setStyle(PaintStyle.Stroke); p.setAntiAlias(true); return p; })(),
};
const colorCache = new Map<string, ReturnType<typeof Skia.Color>>();
/** Skia.Color parses the string every call; cache it (hot path: every frame, every unit). */
const color = (c: string) => {
  let v = colorCache.get(c);
  if (v === undefined) { v = Skia.Color(c); colorCache.set(c, v); }
  return v;
};

const srcCache = new WeakMap<SkImage, SkRect>();
function srcOf(img: SkImage) {
  let r = srcCache.get(img);
  if (!r) { r = Skia.XYWHRect(0, 0, img.width(), img.height()); srcCache.set(img, r); }
  return r;
}

function drawSprite(c: SkCanvas, img: SkImage | undefined, cx: number, by: number, w: number, h: number, flip: boolean, paint: SkPaint = paints.img, rot = 0) {
  if (!img) return;
  const src = srcOf(img);
  if (flip || rot) {
    c.save();
    c.translate(cx, by);
    if (rot) c.rotate(rot, 0, 0);
    if (flip) c.scale(-1, 1);
    c.drawImageRectOptions(img, src, Skia.XYWHRect(-w / 2, -h, w, h), FilterMode.Linear, MipmapMode.Linear, paint);
    c.restore();
  } else c.drawImageRectOptions(img, src, Skia.XYWHRect(cx - w / 2, by - h, w, h), FilterMode.Linear, MipmapMode.Linear, paint);
}

const flipCache = new WeakMap<SkImage, SkImage>();
/** Mirrored copy of a sprite (RSXform cannot flip), made once per image. */
function flippedOf(img: SkImage): SkImage {
  let f = flipCache.get(img);
  if (f) return f;
  f = img;
  try {
    const surf = Skia.Surface.Make(img.width(), img.height());
    if (surf) {
      const cv = surf.getCanvas();
      cv.clear(Skia.Color('transparent'));
      cv.translate(img.width(), 0);
      cv.scale(-1, 1);
      cv.drawImage(img, 0, 0);
      surf.flush();
      f = surf.makeImageSnapshot();
    }
  } catch {
    f = img;
  }
  flipCache.set(img, f);
  return f;
}

const SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.Linear };

/**
 * Collects consecutive (depth-ordered) sprites that share an image into one drawAtlas call.
 * Forests, mines and groups of identical units become a single GPU draw instead of dozens.
 */
class SpriteBatch {
  private img: SkImage | null = null;
  private srcs: SkRect[] = [];
  private xfs: SkRSXform[] = [];
  draws = 0;
  add(c: SkCanvas, img: SkImage | undefined, cx: number, by: number, w: number, flip: boolean, rotDeg = 0) {
    if (!img) return;
    const im = flip ? flippedOf(img) : img;
    if (im !== this.img) { this.flush(c); this.img = im; }
    const iw = im.width(), ih = im.height();
    const k = w / iw;
    const a = (rotDeg * Math.PI) / 180;
    const sc = k * Math.cos(a), ss = k * Math.sin(a);
    // pivot = bottom-centre of the image maps to (cx, by)
    this.srcs.push(srcOf(im));
    this.xfs.push(Skia.RSXform(sc, ss, cx - (sc * iw / 2 - ss * ih), by - (ss * iw / 2 + sc * ih)));
  }
  flush(c: SkCanvas) {
    if (this.img && this.xfs.length) {
      c.drawAtlas(this.img, this.srcs, this.xfs, paints.img, BlendMode.SrcOver, undefined, SAMPLING);
      this.draws++;
    }
    this.img = null;
    this.srcs = [];
    this.xfs = [];
  }
}
const batch = new SpriteBatch();

function diamondPath(x: number, y: number, s: number) {
  const p = Skia.Path.Make();
  p.moveTo(toScreenX(x, y), toScreenY(x, y));
  p.lineTo(toScreenX(x + s, y), toScreenY(x + s, y));
  p.lineTo(toScreenX(x + s, y + s), toScreenY(x + s, y + s));
  p.lineTo(toScreenX(x, y + s), toScreenY(x, y + s));
  p.close();
  return p;
}

function visibleRange(w: World, cam: Camera) {
  const corners = [viewToWorld(cam, 0, 0), viewToWorld(cam, cam.vw, 0), viewToWorld(cam, 0, cam.vh), viewToWorld(cam, cam.vw, cam.vh)];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of corners) {
    const a = p.x / (TW / 2), b = p.y / (TH / 2);
    const tx = (b + a) / 2, ty = (b - a) / 2;
    x0 = Math.min(x0, tx); x1 = Math.max(x1, tx); y0 = Math.min(y0, ty); y1 = Math.max(y1, ty);
  }
  const m = 4; // margin for tall sprites
  return { x0: Math.max(0, Math.floor(x0) - 2), y0: Math.max(0, Math.floor(y0) - 2), x1: Math.min(w.size - 1, Math.ceil(x1) + m), y1: Math.min(w.size - 1, Math.ceil(y1) + m) };
}

function onScreen(cam: Camera, wx: number, wy: number, pad: number) {
  const vx = (wx - cam.x) * cam.zoom + cam.vw / 2, vy = (wy - cam.y) * cam.zoom + cam.vh / 2;
  return vx > -pad && vy > -pad && vx < cam.vw + pad && vy < cam.vh + pad * 2;
}

/** cell origin offset so that a feathered diamond cell lands on its tile */
const CELL_SCALE = TW / ATLAS.tileW;

interface LayerCache { terrain?: SkPicture; terrainV: number; fog?: SkPicture; fogV: string }
const layerCache = new WeakMap<World, LayerCache>();
function cacheFor(w: World) {
  let c = layerCache.get(w);
  if (!c) { c = { terrainV: -1, fogV: '' }; layerCache.set(w, c); }
  return c;
}
function mapBounds(w: World) {
  const pad = 200;
  return Skia.XYWHRect(toScreenX(0, w.size) - pad, -pad, w.size * TW + pad * 2, w.size * TH + pad * 2);
}

/** Terrain for the whole explored map, recorded once per exploration change and replayed every frame. */
function drawTerrain(c: SkCanvas, w: World, atlas: SkImage) {
  const cache = cacheFor(w);
  if (!cache.terrain || cache.terrainV !== w.exploredVersion) {
    const rec = Skia.PictureRecorder();
    recordTerrain(rec.beginRecording(mapBounds(w)), w, atlas);
    cache.terrain = rec.finishRecordingAsPicture();
    cache.terrainV = w.exploredVersion;
  }
  c.drawPicture(cache.terrain);
}

function recordTerrain(c: SkCanvas, w: World, atlas: SkImage) {
  const byType: { srcs: SkRect[]; xf: SkRSXform[] }[] = Array.from({ length: TERRAIN_COUNT + 1 }, () => ({ srcs: [], xf: [] }));
  const ox = (ATLAS.cellW / 2) * CELL_SCALE, oy = ATLAS.marginY * CELL_SCALE;
  for (let y = 0; y < w.size; y++) for (let x = 0; x < w.size; x++) {
    const k = w.idx(x, y);
    if (!w.explored[k]) continue;
    const sx = toScreenX(x, y), sy = toScreenY(x, y);
    const t = w.terrain[k];
    const v = (x % 4) + (y % 4) * 4;
    const bucket = byType[t];
    bucket.srcs.push(Skia.XYWHRect(v * ATLAS.cellW, t * ATLAS.cellH, ATLAS.cellW, ATLAS.cellH));
    bucket.xf.push(Skia.RSXform(CELL_SCALE, 0, sx - ox, sy - oy));
  }
  for (let t = 0; t < TERRAIN_COUNT; t++) {
    const b = byType[t];
    if (b.srcs.length) c.drawAtlas(atlas, b.srcs, b.xf, paints.img, BlendMode.SrcOver);
  }
}

function drawFog(c: SkCanvas, w: World, atlas: SkImage) {
  const cache = cacheFor(w);
  const key = w.fogVersion + ':' + w.exploredVersion;
  if (!cache.fog || cache.fogV !== key) {
    const rec = Skia.PictureRecorder();
    recordFog(rec.beginRecording(mapBounds(w)), w, atlas);
    cache.fog = rec.finishRecordingAsPicture();
    cache.fogV = key;
  }
  c.drawPicture(cache.fog);
}

function recordFog(c: SkCanvas, w: World, atlas: SkImage) {
  const dark: SkRSXform[] = [], dim: SkRSXform[] = [];
  // fog cells fade from their centre and are drawn enlarged so neighbouring cells blend smoothly
  const k = CELL_SCALE * 1.6;
  const ox = (ATLAS.cellW / 2) * k, oy = (ATLAS.marginY + ATLAS.tileW / 4) * k;
  for (let y = 0; y < w.size; y++) for (let x = 0; x < w.size; x++) {
    const i = w.idx(x, y);
    if (w.visible[i]) continue;
    const cx = toScreenX(x + 0.5, y + 0.5), cy = toScreenY(x + 0.5, y + 0.5);
    (w.explored[i] ? dim : dark).push(Skia.RSXform(k, 0, cx - ox, cy - oy));
  }
  // map border: treat outside of the map as unexplored darkness
  for (let i = -2; i < w.size + 2; i++) {
    for (const [x, y] of [[i, -1], [i, -2], [-1, i], [-2, i], [i, w.size], [i, w.size + 1], [w.size, i], [w.size + 1, i]]) {
      const cx = toScreenX(x + 0.5, y + 0.5), cy = toScreenY(x + 0.5, y + 0.5);
      dark.push(Skia.RSXform(k, 0, cx - ox, cy - oy));
    }
  }
  const src = Skia.XYWHRect(0, TERRAIN_COUNT * ATLAS.cellH, ATLAS.cellW, ATLAS.cellH);
  if (dark.length) c.drawAtlas(atlas, dark.map(() => src), dark, paints.img, BlendMode.SrcOver);
  if (dim.length) {
    paints.alpha.setAlphaf(0.5);
    c.drawAtlas(atlas, dim.map(() => src), dim, paints.alpha, BlendMode.SrcOver);
    paints.alpha.setAlphaf(1);
  }
}

function depthOf(e: Entity) { return e.kind === 'unit' ? e.x + e.y : e.x + e.y + e.size; }

function drawHp(c: SkCanvas, cx: number, top: number, wdt: number, frac: number, own: boolean) {
  paints.fill.setColor(color('rgba(0,0,0,0.65)'));
  c.drawRect(Skia.XYWHRect(cx - wdt / 2 - 1, top - 1, wdt + 2, 5), paints.fill);
  paints.fill.setColor(color(frac > 0.5 ? (own ? '#4ade80' : '#f87171') : frac > 0.25 ? '#facc15' : '#ef4444'));
  c.drawRect(Skia.XYWHRect(cx - wdt / 2, top, wdt * Math.max(0, frac), 3), paints.fill);
}

export function renderScene(c: SkCanvas, w: World, cam: Camera, imgs: Images, atlas: SkImage | undefined, font: SkFont | null, rs: RenderState) {
  c.clear(color('#07090c'));
  c.save();
  c.translate(cam.vw / 2, cam.vh / 2);
  c.scale(cam.zoom, cam.zoom);
  c.translate(-cam.x, -cam.y);
  const r = visibleRange(w, cam);
  if (atlas) drawTerrain(c, w, atlas);

  // ground layer: farms, corpses/stumps
  for (const cp of w.corpses) {
    if (!w.explored[w.idx(Math.floor(cp.x), Math.floor(cp.y))]) continue;
    if (cp.type === 'stump') {
      const s = spriteSize('nat_stump');
      drawSprite(c, imgs.nat_stump, toScreenX(cp.x + 0.5, cp.y + 0.5), toScreenY(cp.x + 0.5, cp.y + 0.5) + s.oy, s.w, s.h, false);
    } else if (cp.type in BUILDINGS) {
      const size = BUILDINGS[cp.type as BuildingType].size;
      const s = spriteSize('bld_rubble', size);
      paints.alpha.setAlphaf(Math.max(0, 1 - cp.t / 12));
      drawSprite(c, imgs.bld_rubble, toScreenX(cp.x + size, cp.y + size), toScreenY(cp.x + size, cp.y + size) + s.oy, s.w, s.h, false, paints.alpha);
      paints.alpha.setAlphaf(1);
    } else {
      // fallen unit: fade out, lying down
      const key = cp.type === 'villager' ? 'unit_villager_m' : (`unit_${cp.type}` as const);
      const img = (cp.owner === 2 ? imgs[`${key}_red` as keyof Images] : imgs[key as keyof Images]) as SkImage | undefined;
      const s = spriteSize(key as never);
      paints.alpha.setAlphaf(Math.max(0, 0.8 - cp.t / 15));
      drawSprite(c, img, toScreenX(cp.x, cp.y), toScreenY(cp.x, cp.y) + 4, s.w, s.h, cp.facing < 0, paints.alpha, 80 * cp.facing);
      paints.alpha.setAlphaf(1);
    }
  }

  const objs: Entity[] = [];
  for (const e of w.entities.values()) {
    if (e.garrisonedIn) continue;
    const cx = e.kind === 'unit' ? e.x : e.x + e.size / 2, cy = e.kind === 'unit' ? e.y : e.y + e.size / 2;
    if (cx < r.x0 - 3 || cy < r.y0 - 3 || cx > r.x1 + 3 || cy > r.y1 + 3) continue;
    const tx = Math.floor(cx), ty = Math.floor(cy);
    if (!w.inBounds(tx, ty)) continue;
    if (e.kind === 'unit' && e.owner !== 1 && !w.visible[w.idx(tx, ty)]) continue;
    if (e.kind !== 'unit' && !w.explored[w.idx(Math.min(w.size - 1, e.x), Math.min(w.size - 1, e.y))] && !w.explored[w.idx(tx, ty)]) continue;
    if (e.type === 'farm') {
      const s = spriteSize('bld_farm', e.size);
      const frac = Math.max(0.35, (e.amount ?? 0) / 250);
      paints.alpha.setAlphaf(e.built ? Math.min(1, 0.55 + frac) : 0.6);
      drawSprite(c, imgs.bld_farm, toScreenX(e.x + e.size, e.y + e.size), toScreenY(e.x + e.size, e.y + e.size) + s.oy, s.w, s.h, false, paints.alpha);
      paints.alpha.setAlphaf(1);
      if (rs.selection.has(e.id)) { paints.sel.setColor(color('#fff')); c.drawPath(diamondPath(e.x, e.y, e.size), paints.sel); }
      continue;
    }
    objs.push(e);
  }

  // selection rings + shadows under units
  for (const e of objs) {
    if (e.kind === 'unit') {
      const sx = toScreenX(e.x, e.y), sy = toScreenY(e.x, e.y);
      const big = e.type === 'knight' || e.type === 'scout';
      c.drawOval(Skia.XYWHRect(sx - (big ? 16 : 10), sy - 4, big ? 32 : 20, 8), paints.shadow);
      if (rs.selection.has(e.id)) {
        paints.sel.setColor(color(e.owner === 1 ? '#ffffff' : '#ff6b6b'));
        c.drawOval(Skia.XYWHRect(sx - (big ? 19 : 13), sy - 6, big ? 38 : 26, 12), paints.sel);
      }
    } else if (rs.selection.has(e.id)) {
      paints.sel.setColor(color(e.owner === 1 ? '#ffffff' : e.owner === 2 ? '#ff6b6b' : '#ffe08a'));
      c.drawPath(diamondPath(e.x, e.y, e.size), paints.sel);
    }
  }

  objs.sort((a, b) => depthOf(a) - depthOf(b));
  const t = rs.time;
  const overlays: (() => void)[] = [];
  const visibleBuildings: Entity[] = [];
  batch.draws = 0;
  for (const e of objs) {
    if (e.kind === 'resource') {
      const key = nodeKey(e.type);
      const s = spriteSize(key);
      const cx = toScreenX(e.x + 0.5, e.y + 0.5), by = toScreenY(e.x + 0.5, e.y + 0.5) + s.oy;
      const sway = e.type.startsWith('tree') ? Math.sin(t * 0.8 + (e.anim ?? 0)) * 0.9 : 0;
      const bob = e.type === 'sheep' || e.type === 'deer' ? Math.abs(Math.sin(t * 1.3 + (e.anim ?? 0))) * 0.8 : 0;
      const shrink = e.type === 'gold' || e.type === 'stone' || e.type === 'berry' ? 0.75 + 0.25 * Math.min(1, (e.amount ?? 0) / 150) : 1;
      batch.add(c, imgs[key], cx, by - bob, s.w * shrink, e.facing === -1, sway);
    } else if (e.kind === 'building') {
      visibleBuildings.push(e);
      const key = buildingKey(e.type);
      const s = spriteSize(key, e.size);
      const cx = toScreenX(e.x + e.size, e.y + e.size), by = toScreenY(e.x + e.size, e.y + e.size) + s.oy;
      const img = e.owner === 2 ? imgs[`${key}_red`] ?? imgs[key] : imgs[key];
      if (!e.built) {
        batch.flush(c);
        const fs = spriteSize('bld_foundation', e.size);
        drawSprite(c, imgs.bld_foundation, cx, by, fs.w, fs.h, false);
        const p = e.progress ?? 0;
        if (p > 0.05 && img) {
          c.save();
          const visibleH = s.h * p;
          c.clipRect(Skia.XYWHRect(cx - s.w, by - visibleH, s.w * 2, visibleH + 2), 1, true);
          paints.alpha.setAlphaf(0.9);
          drawSprite(c, img, cx, by, s.w, s.h, false, paints.alpha);
          paints.alpha.setAlphaf(1);
          c.restore();
        }
      } else batch.add(c, img, cx, by, s.w, false);
      if (rs.selection.has(e.id) || e.hp < e.maxHp) {
        const frac = e.hp / e.maxHp, own = e.owner === 1, top = by - s.h - 4, wd = Math.min(80, e.size * 22);
        overlays.push(() => drawHp(c, cx, top, wd, frac, own));
      }
      if (rs.selection.has(e.id) && e.rally && e.owner === 1) {
        const rally = e.rally;
        overlays.push(() => {
          const fx = toScreenX(rally.x, rally.y), fy = toScreenY(rally.x, rally.y);
          if (imgs.fx_flag) { drawSprite(c, imgs.fx_flag, fx, fy + 2, 22, 30, false, paints.img, Math.sin(t * 3) * 3); return; }
          paints.fill.setColor(color('#2f6fe0'));
          paints.stroke.setColor(color('#fff')); paints.stroke.setStrokeWidth(1.5);
          c.drawLine(fx, fy, fx, fy - 18, paints.stroke);
          c.drawRect(Skia.XYWHRect(fx, fy - 18, 10, 7), paints.fill);
        });
      }
    } else {
      const key = unitKey(e, w);
      const s = spriteSize(key);
      const sx = toScreenX(e.x, e.y), sy = toScreenY(e.x, e.y);
      const moving = !!e.path?.length;
      const a = e.anim ?? 0;
      const bob = moving ? Math.abs(Math.sin(a * 1.4)) * 2.2 : Math.sin(t * 2 + e.id) * 0.3;
      const rot = e.working ? Math.sin(a * 2.2) * 2.5 : moving ? Math.sin(a * 1.4) * 2 : 0;
      const img = e.owner === 2 ? imgs[`${key}_red`] ?? imgs[key] : imgs[key];
      batch.add(c, img, sx, sy + 2 - bob, s.w, e.facing === -1, rot);
      if (rs.selection.has(e.id) || (e.hp < e.maxHp && e.owner !== 0)) {
        const frac = e.hp / e.maxHp, own = e.owner === 1, top = sy - s.h - 5;
        overlays.push(() => drawHp(c, sx, top, 26, frac, own));
      }

    }
  }

  batch.flush(c);
  const fx = fxFor(w);
  fx.update(w, cam, t);
  fx.drawWorld(c, w, imgs, t, visibleBuildings);
  for (const o of overlays) o();

  // projectiles
  paints.stroke.setColor(color('#3b2a18')); paints.stroke.setStrokeWidth(1.6);
  for (const p of w.projectiles) {
    const k = p.life / p.total;
    const x = p.x + (p.tx - p.x) * k, y = p.y + (p.ty - p.y) * k;
    const k2 = Math.min(1, k + 0.08);
    const x2 = p.x + (p.tx - p.x) * k2, y2 = p.y + (p.ty - p.y) * k2;
    const arc = Math.sin(Math.PI * k) * 22 + 14, arc2 = Math.sin(Math.PI * k2) * 22 + 14;
    if (p.kind === 'stone') {
      const sx = toScreenX(x, y), sy = toScreenY(x, y) - Math.sin(Math.PI * k) * 60 - 14;
      if (imgs.proj_stone) drawSprite(c, imgs.proj_stone, sx, sy + 5, 10, 10, false);
      else { paints.fill.setColor(color('#6b6b6b')); c.drawCircle(sx, sy, 4, paints.fill); }
      continue;
    }
    c.drawLine(toScreenX(x, y), toScreenY(x, y) - arc, toScreenX(x2, y2), toScreenY(x2, y2) - arc2, paints.stroke);
  }

  if (atlas) drawFog(c, w, atlas);
  fx.drawAmbient(c, w, cam, imgs, t);

  // move markers
  for (const m of rs.markers) {
    const k = m.t / 0.8;
    const sx = toScreenX(m.x, m.y), sy = toScreenY(m.x, m.y);
    paints.stroke.setColor(color(m.color)); paints.stroke.setAlphaf(1 - k); paints.stroke.setStrokeWidth(2);
    c.drawOval(Skia.XYWHRect(sx - 6 - k * 14, sy - 3 - k * 7, 12 + k * 28, 6 + k * 14), paints.stroke);
    paints.stroke.setAlphaf(1);
  }

  // placement ghost
  if (rs.ghost) {
    const g = rs.ghost;
    const size = BUILDINGS[g.type].size;
    paints.fill.setColor(color(g.valid ? 'rgba(80,220,120,0.35)' : 'rgba(240,60,60,0.4)'));
    c.drawPath(diamondPath(g.x, g.y, size), paints.fill);
    const key = buildingKey(g.type);
    const s = spriteSize(key, size);
    paints.alpha.setAlphaf(0.7);
    drawSprite(c, imgs[key], toScreenX(g.x + size, g.y + size), toScreenY(g.x + size, g.y + size) + s.oy, s.w, s.h, false, paints.alpha);
    paints.alpha.setAlphaf(1);
  }

  // floating texts
  if (font) {
    for (const f of w.floats) {
      const sx = toScreenX(f.x, f.y), sy = toScreenY(f.x, f.y) - 40 - f.t * 18;
      paints.text.setColor(color('#000')); paints.text.setAlphaf(Math.max(0, 1 - f.t / 1.4) * 0.7);
      c.drawText(f.text, sx - 9, sy + 1, paints.text, font);
      paints.text.setColor(color(f.color)); paints.text.setAlphaf(Math.max(0, 1 - f.t / 1.4));
      c.drawText(f.text, sx - 10, sy, paints.text, font);
    }
  }
  c.restore();

  if (rs.box) {
    const b = rs.box;
    const rect = Skia.XYWHRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
    paints.fill.setColor(color('rgba(255,255,255,0.12)'));
    c.drawRect(rect, paints.fill);
    paints.stroke.setColor(color('#fff')); paints.stroke.setStrokeWidth(1);
    c.drawRect(rect, paints.stroke);
  }
}
