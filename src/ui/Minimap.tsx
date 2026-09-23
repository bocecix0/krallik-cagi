import { Canvas, Picture, Skia, type SkPicture } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { clampCamera, toScreenX, viewToWorld } from '../game/iso';
import { T } from '../game/types';
import type { Controller } from './controller';
import { C } from './theme';

const TERRAIN_COLORS: Record<number, string> = {
  [T.DeepWater]: '#1d3f6e', [T.Water]: '#2f6f94', [T.Sand]: '#d8c38a', [T.Dirt]: '#8a6a43',
  [T.Grass2]: '#8c9a3e', [T.Grass]: '#5f8a33', [T.Forest]: '#2f5a23',
};
const NODE_COLORS: Record<string, string> = { gold: '#ffd54a', stone: '#b9bcc2', berry: '#d44a6a', sheep: '#fff', deer: '#c98a4a', boar: '#6a4a3a' };

export const MINI_W = 148;
export const MINI_H = MINI_W / 2;

const terrainCache = new WeakMap<object, { key: string; pic: SkPicture }>();

/** terrain + resources layer; only re-recorded when exploration/visibility changes */
function terrainLayer(ctl: Controller): SkPicture {
  const w = ctl.w;
  const key = w.exploredVersion + ':' + w.fogVersion;
  const hit = terrainCache.get(w);
  if (hit && hit.key === key) return hit.pic;
  const rec = Skia.PictureRecorder();
  const c = rec.beginRecording(Skia.XYWHRect(0, 0, MINI_W, MINI_H));
  const n = w.size;
  const s = MINI_W / n;
  const p = Skia.Paint();
  const map = (x: number, y: number) => ({ x: (x - y) * (s / 2) + MINI_W / 2, y: (x + y) * (s / 4) });
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const k = w.idx(x, y);
    if (!w.explored[k]) continue;
    const m = map(x + 0.5, y + 0.5);
    let col = TERRAIN_COLORS[w.terrain[k]] ?? '#5f8a33';
    const e = w.get(w.occ[k]);
    if (e?.kind === 'resource') col = NODE_COLORS[e.type] ?? '#244a1c';
    p.setColor(Skia.Color(col));
    if (!w.visible[k]) p.setAlphaf(0.55);
    c.drawRect(Skia.XYWHRect(m.x - s / 2, m.y - s / 4, s + 0.3, s / 2 + 0.3), p);
    p.setAlphaf(1);
  }
  const pic = rec.finishRecordingAsPicture();
  terrainCache.set(w, { key, pic });
  return pic;
}

function draw(ctl: Controller): SkPicture {
  const w = ctl.w;
  const rec = Skia.PictureRecorder();
  const c = rec.beginRecording(Skia.XYWHRect(0, 0, MINI_W, MINI_H));
  const n = w.size;
  const s = MINI_W / n;
  const p = Skia.Paint();
  const map = (x: number, y: number) => ({ x: (x - y) * (s / 2) + MINI_W / 2, y: (x + y) * (s / 4) });
  c.drawPicture(terrainLayer(ctl));
  for (const e of w.entities.values()) {
    if (e.kind === 'resource' || e.owner === 0 || e.garrisonedIn) continue;
    const cx = e.kind === 'unit' ? e.x : e.x + e.size / 2, cy = e.kind === 'unit' ? e.y : e.y + e.size / 2;
    const k = w.idx(Math.floor(cx), Math.floor(cy));
    if (e.owner !== 1 && (e.kind === 'unit' ? !w.visible[k] : !w.explored[k])) continue;
    const m = map(cx, cy);
    p.setColor(Skia.Color(e.owner === 1 ? '#4d8bff' : '#ff3b30'));
    const r = e.kind === 'building' ? Math.max(2.2, e.size * s * 0.35) : 1.6;
    c.drawRect(Skia.XYWHRect(m.x - r, m.y - r / 1.4, r * 2, r * 1.4), p);
  }
  // camera viewport
  const cam = ctl.cam;
  const corners = [viewToWorld(cam, 0, 0), viewToWorld(cam, cam.vw, 0), viewToWorld(cam, cam.vw, cam.vh), viewToWorld(cam, 0, cam.vh)];
  const path = Skia.Path.Make();
  const scale = MINI_W / (toScreenX(n, 0) - toScreenX(0, n));
  corners.forEach((pt, i) => {
    const mx = pt.x * scale + MINI_W / 2, my = pt.y * scale;
    if (i === 0) path.moveTo(mx, my); else path.lineTo(mx, my);
  });
  path.close();
  const st = Skia.Paint();
  st.setStyle(1); st.setColor(Skia.Color('#ffffff')); st.setStrokeWidth(1);
  c.drawPath(path, st);
  return rec.finishRecordingAsPicture();
}

export function Minimap({ ctl }: { ctl: Controller }) {
  const [pic, setPic] = useState<SkPicture | null>(null);
  useEffect(() => {
    const t = setInterval(() => setPic(draw(ctl)), 700);
    setPic(draw(ctl));
    return () => clearInterval(t);
  }, [ctl]);
  const onPress = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    const scale = MINI_W / (toScreenX(ctl.w.size, 0) - toScreenX(0, ctl.w.size));
    ctl.cam.x = (locationX - MINI_W / 2) / scale;
    ctl.cam.y = locationY / scale;
    clampCamera(ctl.cam, ctl.w.size);
    setPic(draw(ctl));
  };
  return (
    <View style={s.wrap}>
      <Pressable onPress={onPress}>
        <Canvas style={{ width: MINI_W, height: MINI_H }}>{pic && <Picture picture={pic} />}</Canvas>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 4, backgroundColor: 'rgba(20,14,9,0.88)', borderRadius: 8, borderWidth: 1.5, borderColor: C.goldDark },
});
