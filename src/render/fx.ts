import { BlurStyle, Skia, type SkCanvas, type SkImage, type SkPaint } from '@shopify/react-native-skia';
import { toScreenX, toScreenY, type Camera } from '../game/iso';
import { T, type Entity } from '../game/types';
import type { World } from '../game/world';
import type { Images } from './sprites';
import { buildingKey, spriteSize } from './sprites';

/** A short-lived sprite particle in world-pixel space (z = height above ground). */
interface Particle {
  img: string;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  t: number; life: number;
  s0: number; s1: number; // size (world px) at birth / death
  a0: number; a1: number; // alpha at birth / death
  rot: number; vr: number;
}

interface Flock { x: number; y: number; vx: number; vy: number; t: number; life: number; flap: number }

const MAX_PARTICLES = 90;
const CHIMNEY: Record<string, [number, number]> = {
  // chimney position as fraction of the building sprite (x from centre, y from bottom)
  house: [0.14, 0.8], town_center: [0.1, 0.92], blacksmith: [0.17, 0.88], castle: [0.0, 0.95], mill: [-0.1, 0.6],
};

const hash = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };

/**
 * Render-side visual effects: consumes World.fx events and runs ambient emitters
 * (chimney smoke, fires on damaged buildings, birds, cloud shadows, water glints).
 * Everything is bounded (particle cap, on-screen-only emitters) to keep frames cheap.
 */
export class FxSystem {
  private parts: Particle[] = [];
  private emit = new Map<number, number>(); // entity id -> next emit time
  private flocks: Flock[] = [];
  private nextFlock = 8;
  private last = 0;
  private paint: SkPaint = Skia.Paint();
  private shadow: SkPaint = (() => {
    const p = Skia.Paint();
    p.setColor(Skia.Color('rgba(10,20,30,1)'));
    p.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 38, true));
    return p;
  })();
  private glint: SkPaint = (() => { const p = Skia.Paint(); p.setColor(Skia.Color('#ffffff')); p.setAntiAlias(true); return p; })();

  private spawn(p: Partial<Particle> & { img: string; x: number; y: number }) {
    if (this.parts.length >= MAX_PARTICLES) this.parts.shift();
    this.parts.push({ z: 0, vx: 0, vy: 0, vz: 0, t: 0, life: 1, s0: 20, s1: 30, a0: 1, a1: 0, rot: 0, vr: 0, ...p });
  }

  private burst(kind: string, x: number, y: number, size: number) {
    const sx = toScreenX(x, y), sy = toScreenY(x, y);
    if (kind === 'sparks') {
      this.spawn({ img: 'fx_sparks', x: sx, y: sy, z: 30 * size, vz: 14, life: 1.1, s0: 30 * size, s1: 55 * size, a0: 1, a1: 0 });
      return;
    }
    const n = kind === 'collapse' ? 4 + Math.round(size * 2) : kind === 'impact' ? 3 : 2 + Math.round(size * 2);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random();
      const sp = (kind === 'collapse' ? 14 : 8) * size;
      this.spawn({
        img: kind === 'collapse' && i % 2 ? 'fx_smoke' : 'fx_dust', x: sx + Math.cos(ang) * 6 * size, y: sy + Math.sin(ang) * 3 * size,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.5, vz: 6 + Math.random() * 8, life: 1 + Math.random() * 0.8,
        s0: 18 * size + 8, s1: 44 * size + 16, a0: 0.85, a1: 0, rot: Math.random() * 360, vr: (Math.random() - 0.5) * 40,
      });
    }
  }

  update(w: World, cam: Camera, time: number) {
    const dt = Math.min(0.1, this.last ? time - this.last : 0.016);
    this.last = time;
    // one-shot events from the simulation
    for (const ev of w.fx) this.burst(ev.kind, ev.x, ev.y, ev.size);
    w.fx.length = 0;

    // ambient emitters, only for buildings near the camera
    const halfW = cam.vw / 2 / cam.zoom + 120, halfH = cam.vh / 2 / cam.zoom + 160;
    for (const e of w.entities.values()) {
      if (e.kind !== 'building' || !e.built) continue;
      const cx = toScreenX(e.x + e.size, e.y + e.size), by = toScreenY(e.x + e.size, e.y + e.size);
      if (Math.abs(cx - cam.x) > halfW || Math.abs(by - cam.y) > halfH) continue;
      if (e.owner !== 1 && !w.visible[w.idx(Math.floor(e.x + e.size / 2), Math.floor(e.y + e.size / 2))]) continue;
      const next = this.emit.get(e.id) ?? time + hash(e.id) * 2;
      if (time < next) continue;
      const s = spriteSize(buildingKey(e.type), e.size);
      const dmg = 1 - e.hp / e.maxHp;
      const ch = CHIMNEY[e.type];
      if (dmg > 0.4) {
        // burning building: thick smoke columns above the fire spots
        const k = Math.floor(hash(e.id + time) * 3);
        const fx = (hash(e.id * 3 + k) - 0.5) * s.w * 0.6, fy = s.h * (0.3 + hash(e.id * 7 + k) * 0.3);
        this.spawn({ img: 'fx_smoke', x: cx + fx, y: by, z: fy, vx: 3, vz: 16, life: 2.4, s0: 14, s1: 46, a0: 0.55, a1: 0, rot: Math.random() * 360, vr: 12 });
        this.emit.set(e.id, time + 0.35);
      } else if (ch) {
        this.spawn({ img: 'fx_smoke', x: cx + ch[0] * s.w, y: by, z: ch[1] * s.h, vx: 4 + Math.random() * 2, vz: 10, life: 3, s0: 6, s1: 26, a0: 0.45, a1: 0, rot: Math.random() * 360, vr: 10 });
        this.emit.set(e.id, time + 1.1 + hash(e.id + time) * 0.8);
      } else this.emit.set(e.id, time + 5);
    }

    for (const p of this.parts) {
      p.t += dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += p.vr * dt;
      p.vx *= 0.98; p.vy *= 0.98;
    }
    this.parts = this.parts.filter((p) => p.t < p.life);

    // birds: a flock crosses the map every ~25-45s
    if (time > this.nextFlock) {
      this.nextFlock = time + 25 + Math.random() * 20;
      const fromLeft = Math.random() < 0.5;
      const y0 = cam.y - cam.vh / 2 / cam.zoom + Math.random() * (cam.vh / cam.zoom) * 0.7;
      const x0 = fromLeft ? cam.x - cam.vw / cam.zoom : cam.x + cam.vw / cam.zoom;
      this.flocks.push({ x: x0, y: y0, vx: (fromLeft ? 1 : -1) * 55, vy: 8 * (Math.random() - 0.5), t: 0, life: 14, flap: Math.random() * 6 });
    }
    for (const f of this.flocks) { f.t += dt; f.x += f.vx * dt; f.y += f.vy * dt; }
    this.flocks = this.flocks.filter((f) => f.t < f.life);
  }

  /** fires on damaged buildings + particles (drawn after objects, before fog) */
  drawWorld(c: SkCanvas, w: World, imgs: Images, time: number, visibleBuildings: Entity[]) {
    for (const e of visibleBuildings) {
      if (!e.built) continue;
      const dmg = 1 - e.hp / e.maxHp;
      if (dmg <= 0.4) continue;
      const s = spriteSize(buildingKey(e.type), e.size);
      const cx = toScreenX(e.x + e.size, e.y + e.size), by = toScreenY(e.x + e.size, e.y + e.size);
      const n = dmg > 0.75 ? 3 : dmg > 0.55 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const fx = (hash(e.id * 3 + k) - 0.5) * s.w * 0.6, fy = s.h * (0.3 + hash(e.id * 7 + k) * 0.3);
        const flick = Math.sin(time * 9 + k * 2 + e.id) * 0.12;
        const img = imgs[Math.sin(time * 6 + k) > 0 ? 'fx_fire' : 'fx_fire2'] ?? imgs.fx_fire;
        this.sprite(c, img, cx + fx, by - fy, (22 + e.size * 4) * (1 + flick), 1, 0);
      }
    }
    for (const p of this.parts) {
      const k = p.t / p.life;
      const size = p.s0 + (p.s1 - p.s0) * k;
      const alpha = p.a0 + (p.a1 - p.a0) * k;
      this.sprite(c, imgs[p.img], p.x, p.y - p.z, size, alpha, p.rot, true);
    }
    void w;
  }

  /** ambient layer above everything in the world (cloud shadows, water glints, birds) */
  drawAmbient(c: SkCanvas, w: World, cam: Camera, imgs: Images, time: number) {
    // water glints on visible water tiles near the camera
    const halfW = cam.vw / 2 / cam.zoom, halfH = cam.vh / 2 / cam.zoom;
    const r = 1.6;
    for (let y = 0; y < w.size; y++) for (let x = 0; x < w.size; x++) {
      const t = w.terrain[w.idx(x, y)];
      if (t !== T.Water && t !== T.DeepWater) continue;
      const sx = toScreenX(x + 0.5, y + 0.5), sy = toScreenY(x + 0.5, y + 0.5);
      if (Math.abs(sx - cam.x) > halfW || Math.abs(sy - cam.y) > halfH) continue;
      if (!w.visible[w.idx(x, y)]) continue;
      const h = hash(x * 131 + y);
      const a = Math.pow(Math.max(0, Math.sin(time * (0.9 + h) + h * 40)), 12);
      if (a < 0.05) continue;
      this.glint.setAlphaf(a * 0.8);
      const ox = (hash(x + y * 7) - 0.5) * 30, oy = (hash(x * 3 + y) - 0.5) * 12;
      c.drawOval(Skia.XYWHRect(sx + ox - r * 2.5, sy + oy - r * 0.6, r * 5, r * 1.2), this.glint);
    }
    this.glint.setAlphaf(1);

    // slow drifting cloud shadows give the flat map some depth
    for (let i = 0; i < 4; i++) {
      const span = 1400;
      const cxw = ((time * (7 + i * 2) + i * 520) % (span * 2)) - span + cam.x;
      const cyw = cam.y + Math.sin(i * 1.7) * 220 + Math.sin(time * 0.05 + i) * 40;
      this.shadow.setAlphaf(0.06);
      c.drawOval(Skia.XYWHRect(cxw - 170, cyw - 60, 340, 120), this.shadow);
      c.drawOval(Skia.XYWHRect(cxw - 90, cyw - 90, 220, 110), this.shadow);
    }
    this.shadow.setAlphaf(1);

    for (const f of this.flocks) {
      const fade = Math.min(1, f.t, f.life - f.t);
      const img = imgs.fx_birds;
      if (!img) continue;
      this.sprite(c, img, f.x, f.y + Math.sin((f.t + f.flap) * 3) * 4, 70, fade * 0.9, 0, false, f.vx < 0);
    }
  }

  private sprite(c: SkCanvas, img: SkImage | undefined, cx: number, cy: number, size: number, alpha: number, rot: number, centred = false, flip = false) {
    if (!img || alpha <= 0.01) return;
    const aspect = img.width() / img.height();
    const w = size, h = size / aspect;
    this.paint.setAlphaf(Math.min(1, alpha));
    c.save();
    c.translate(cx, centred ? cy : cy - h / 2);
    if (rot) c.rotate(rot, 0, 0);
    if (flip) c.scale(-1, 1);
    c.drawImageRect(img, Skia.XYWHRect(0, 0, img.width(), img.height()), Skia.XYWHRect(-w / 2, -h / 2, w, h), this.paint);
    c.restore();
  }
}
