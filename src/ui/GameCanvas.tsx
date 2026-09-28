import { Canvas, Picture, Skia, type SkPicture } from '@shopify/react-native-skia';
import { memo, useEffect, useRef, useState } from 'react';
import { AppState, Dimensions, StyleSheet } from 'react-native';
import { sound } from '../audio/sound';
import type { SoundKey } from '../audio/manifest';
import { toScreenX, toScreenY } from '../game/iso';
import type { Loaded } from '../render/loader';
import { renderScene } from '../render/render';
import type { Controller } from './controller';

interface Props {
  ctl: Controller;
  assets: Loaded;
  size: { current: { w: number; h: number } };
  onHud: () => void;
}

/**
 * Owns the game loop. Only this component re-renders per frame (the HUD refreshes ~4x/s),
 * and the frame rate adapts: 60fps while the player touches the map, 30fps otherwise.
 */
function GameCanvasImpl({ ctl, assets, size, onHud }: Props) {
  const [pic, setPic] = useState<SkPicture | null>(null);
  const onHudRef = useRef(onHud);
  onHudRef.current = onHud;

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastDraw = 0;
    let hudT = 0;
    let lastRev = -1;
    let active = AppState.currentState !== 'background';
    const sub = AppState.addEventListener('change', (st) => {
      active = st === 'active';
      if (active) { last = performance.now(); raf = requestAnimationFrame(frame); }
    });
    // exponential moving averages (ms) of the JS work per frame; decide the frame cap from real cost
    const perf = { tick: 0, render: 0, fps: 60 };
    if (__DEV__) {
      const g = globalThis as unknown as { __perf: typeof perf; __bench: (n: number) => { tick: number; render: number } };
      g.__perf = perf;
      // dev-only micro benchmark (works even when the browser pane is hidden and rAF is paused)
      g.__bench = (n: number) => {
        let tk = 0, rd = 0;
        for (let i = 0; i < n; i++) {
          const a = performance.now();
          ctl.tick(1 / 60);
          const b = performance.now();
          const rec = Skia.PictureRecorder();
          renderScene(rec.beginRecording(Skia.XYWHRect(0, 0, ctl.cam.vw, ctl.cam.vh)), ctl.w, ctl.cam, assets.images, assets.atlas, assets.font,
            { selection: ctl.sel, ghost: ctl.ghost, markers: ctl.markers, box: ctl.box, time: b / 1000 });
          rec.finishRecordingAsPicture();
          rd += performance.now() - b; tk += b - a;
        }
        return { tick: tk / n, render: rd / n };
      };
    }
    const frame = (now: number) => {
      if (!active) return;
      raf = requestAnimationFrame(frame);
      // cheap frames (most devices) always run at full rate; only heavy devices drop to 30fps when the player isn't touching
      const heavy = perf.tick + perf.render > 9;
      const interacting = now - ctl.lastInput < 1200 || !!ctl.box || ctl.markers.length > 0;
      const minGap = heavy && !interacting ? 1000 / 31 : 0;
      if (now - lastDraw < minGap) return;
      perf.fps = perf.fps * 0.95 + (1000 / Math.max(1, now - lastDraw)) * 0.05;
      lastDraw = now;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const t0 = performance.now();
      ctl.tick(dt);
      const t1 = performance.now();
      perf.tick = perf.tick * 0.9 + (t1 - t0) * 0.1;
      playWorldSounds(ctl);
      if (size.current.w <= 1) {
        // onLayout not delivered yet (e.g. hidden web view): estimate the map area from the window
        const win = Dimensions.get('window');
        size.current = { w: win.width, h: Math.max(200, win.height - 220) };
      }
      const { w, h } = size.current;
      if (ctl.cam.vw !== w || ctl.cam.vh !== h) ctl.setViewport(w, h);
      const rec = Skia.PictureRecorder();
      const canvas = rec.beginRecording(Skia.XYWHRect(0, 0, w, h));
      renderScene(canvas, ctl.w, ctl.cam, assets.images, assets.atlas, assets.font, {
        selection: ctl.sel, ghost: ctl.ghost, markers: ctl.markers, box: ctl.box, time: now / 1000,
      });
      setPic(rec.finishRecordingAsPicture());
      perf.render = perf.render * 0.9 + (performance.now() - t1) * 0.1;
      hudT += dt;
      if (hudT > 0.25 || ctl.rev !== lastRev) { hudT = 0; lastRev = ctl.rev; onHudRef.current(); }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); sub.remove(); };
  }, [ctl, assets, size]);

  return <Canvas style={StyleSheet.absoluteFill}>{pic && <Picture picture={pic} />}</Canvas>;
}

export const GameCanvas = memo(GameCanvasImpl);

/** Plays queued world sounds; positional ones are attenuated by distance from the camera and dropped off-screen. */
function playWorldSounds(ctl: Controller) {
  const q = ctl.w.sfx;
  if (!q.length) return;
  const cam = ctl.cam;
  const halfW = cam.vw / 2 / cam.zoom, halfH = cam.vh / 2 / cam.zoom;
  for (const ev of q) {
    let vol = 1;
    if (ev.x !== undefined && ev.y !== undefined) {
      const dx = (toScreenX(ev.x, ev.y) - cam.x) / (halfW + 60), dy = (toScreenY(ev.x, ev.y) - cam.y) / (halfH + 60);
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      if (d > 1.15) continue;
      vol = 1 - Math.min(0.75, d * 0.6);
    }
    sound.play(ev.key as SoundKey, vol);
  }
  q.length = 0;
}
