import { Canvas, Picture, Skia, type SkPicture } from '@shopify/react-native-skia';
import { memo, useEffect, useRef, useState } from 'react';
import { AppState, Dimensions, StyleSheet } from 'react-native';
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
    const frame = (now: number) => {
      if (!active) return;
      raf = requestAnimationFrame(frame);
      const interacting = now - ctl.lastInput < 1200 || !!ctl.box || ctl.markers.length > 0;
      const minGap = interacting ? 0 : 1000 / 31;
      if (now - lastDraw < minGap) return;
      lastDraw = now;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      ctl.tick(dt);
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
      hudT += dt;
      if (hudT > 0.25 || ctl.rev !== lastRev) { hudT = 0; lastRev = ctl.rev; onHudRef.current(); }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); sub.remove(); };
  }, [ctl, assets, size]);

  return <Canvas style={StyleSheet.absoluteFill}>{pic && <Picture picture={pic} />}</Canvas>;
}

export const GameCanvas = memo(GameCanvasImpl);
