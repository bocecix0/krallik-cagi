import { Canvas, Picture, Skia, type SkPicture } from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Image, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MapStyle } from '../game/mapgen';
import type { Difficulty } from '../game/types';
import type { Loaded } from '../render/loader';
import { SOURCES } from '../render/manifest';
import { renderScene } from '../render/render';
import { CommandPanel } from './CommandPanel';
import { Controller } from './controller';
import { Minimap } from './Minimap';
import { Objectives } from './Objectives';
import { EndOverlay, PauseOverlay, Toasts } from './Overlays';
import { C, F } from './theme';
import { TopBar } from './TopBar';

interface Props {
  assets: Loaded;
  settings: { difficulty: Difficulty; style: MapStyle; seed: number };
  onExit: () => void;
  onRestart: () => void;
}

export function GameScreen({ assets, settings, onExit, onRestart }: Props) {
  const insets = useSafeAreaInsets();
  const ctl = useMemo(() => new Controller({ seed: settings.seed, style: settings.style, difficulty: settings.difficulty }), [settings]);
  const [pic, setPic] = useState<SkPicture | null>(null);
  const [, setHud] = useState(0);
  const [miniOpen, setMiniOpen] = useState(true);
  const [paused, setPaused] = useState(false);
  const size = useRef({ w: 1, h: 1 });
  if (__DEV__) (globalThis as unknown as { __ctl: Controller }).__ctl = ctl;

  // render + sim loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let hudT = 0;
    let lastRev = -1;
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      ctl.tick(dt);
      if (size.current.w <= 1) {
        // onLayout not delivered yet (e.g. hidden web view): estimate the map area from the window
        const win = Dimensions.get('window');
        size.current = { w: win.width, h: Math.max(200, win.height - 390) };
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
      if (hudT > 0.2 || ctl.rev !== lastRev) { hudT = 0; lastRev = ctl.rev; setHud((x) => x + 1); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [ctl, assets]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    size.current = { w: width, h: height };
    ctl.setViewport(width, height);
  };

  const gesture = useMemo(() => {
    let lastX = 0, lastY = 0, lastScale = 1;
    const pan = Gesture.Pan().runOnJS(true).minDistance(8).maxPointers(2)
      .onStart((e) => { lastX = e.translationX; lastY = e.translationY; })
      .onUpdate((e) => {
        if (ctl.boxMode) { ctl.box = { x0: e.x - e.translationX, y0: e.y - e.translationY, x1: e.x, y1: e.y }; return; }
        ctl.panBy(e.translationX - lastX, e.translationY - lastY);
        lastX = e.translationX; lastY = e.translationY;
      })
      .onEnd(() => { if (ctl.boxMode) { ctl.boxSelect(); ctl.boxMode = false; ctl.rev++; } });
    const boxPan = Gesture.Pan().runOnJS(true).activateAfterLongPress(320)
      .onStart((e) => { ctl.box = { x0: e.x, y0: e.y, x1: e.x, y1: e.y }; })
      .onUpdate((e) => { if (ctl.box) { ctl.box.x1 = e.x; ctl.box.y1 = e.y; } })
      .onEnd(() => ctl.boxSelect())
      .onFinalize(() => { ctl.box = null; });
    const pinch = Gesture.Pinch().runOnJS(true)
      .onStart(() => { lastScale = 1; })
      .onUpdate((e) => { ctl.zoomAt(e.scale / lastScale, e.focalX, e.focalY); lastScale = e.scale; });
    const tap = Gesture.Tap().runOnJS(true).maxDuration(300).maxDistance(12)
      .onEnd((e, ok) => { if (ok) ctl.tap(e.x, e.y); });
    return Gesture.Race(boxPan, Gesture.Simultaneous(pan, pinch), tap);
  }, [ctl]);

  const me = ctl.w.players[1];
  const idle = ctl.idleVillagers().length;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <TopBar res={me.res} pop={me.pop} cap={me.popCap} age={me.age} time={ctl.w.time} onMenu={() => { ctl.paused = true; setPaused(true); }} />
      <View style={s.map} onLayout={onLayout}>
        <GestureDetector gesture={gesture}>
          <View style={StyleSheet.absoluteFill} collapsable={false}>
            <Canvas style={StyleSheet.absoluteFill}>{pic && <Picture picture={pic} />}</Canvas>
          </View>
        </GestureDetector>
        <Toasts events={ctl.w.events} time={ctl.w.time} onPress={(x, y) => ctl.centerOn(x, y)} />
        <View style={s.miniWrap} pointerEvents="box-none">
          {miniOpen && <Minimap ctl={ctl} />}
          <Pressable onPress={() => setMiniOpen((o) => !o)} style={s.miniToggle} hitSlop={8}>
            <Text style={s.miniToggleTxt}>{miniOpen ? '▲' : '🗺'}</Text>
          </Pressable>
        </View>
        {!ctl.ghost && <Objectives world={ctl.w} />}
        <View style={s.groups} pointerEvents="box-none">
          {[0, 1, 2].map((i) => {
            const n = ctl.groupSize(i);
            return (
              <Pressable key={i} onPress={() => ctl.selectGroup(i)} onLongPress={() => ctl.assignGroup(i)} delayLongPress={350}
                style={({ pressed }) => [s.group, n > 0 && s.groupOn, pressed && { transform: [{ scale: 0.92 }] }]}>
                <Text style={s.groupNum}>{i + 1}</Text>
                {n > 0 && <Text style={s.groupCnt}>{n}</Text>}
              </Pressable>
            );
          })}
        </View>
        <View style={s.fabs} pointerEvents="box-none">
          <Fab icon={SOURCES.unit_villager_m} label={String(idle)} warn={idle > 0} onPress={() => ctl.nextIdleVillager()} />
          <Fab icon={SOURCES.unit_militia} label="Ordu" onPress={() => ctl.selectArmy()} />
          <Fab icon={SOURCES.bld_town_center} label="Merkez" onPress={() => ctl.goHome()} />
          <Fab glyph="⬚" label="Alan Seç" active={ctl.boxMode} onPress={() => { ctl.boxMode = !ctl.boxMode; ctl.rev++; }} />
        </View>
      </View>
      <View style={{ paddingBottom: insets.bottom, backgroundColor: C.wood }}>
        <CommandPanel ctl={ctl} />
      </View>
      {paused && !ctl.w.winner && (
        <PauseOverlay
          speed={ctl.speed}
          onSpeed={(v) => { ctl.speed = v; setHud((x) => x + 1); }}
          onResume={() => { ctl.paused = false; setPaused(false); }}
          onRestart={onRestart}
          onExit={onExit}
        />
      )}
      {ctl.w.winner ? <EndOverlay world={ctl.w} onRestart={onRestart} onExit={onExit} /> : null}
    </View>
  );
}

function Fab({ icon, glyph, label, onPress, warn, active }: { icon?: number; glyph?: string; label: string; onPress: () => void; warn?: boolean; active?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.fab, warn && s.fabWarn, active && s.fabActive, pressed && { transform: [{ scale: 0.92 }] }]}>
      {icon ? <Image source={icon} style={s.fabImg} /> : <Text style={s.fabGlyph}>{glyph}</Text>}
      <Text style={[s.fabLbl, warn && { color: C.warn }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  map: { flex: 1, overflow: 'hidden' },
  miniWrap: { position: 'absolute', top: 8, right: 8, alignItems: 'flex-end' },
  miniToggle: { marginTop: 4, width: 30, height: 22, borderRadius: 6, backgroundColor: 'rgba(20,14,9,0.85)', borderWidth: 1, borderColor: C.goldDark, alignItems: 'center', justifyContent: 'center' },
  miniToggleTxt: { color: C.goldLight, fontSize: 11 },
  groups: { position: 'absolute', left: 8, top: 120, gap: 8 },
  group: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(28,20,13,0.75)', borderWidth: 1, borderColor: '#4a3a28', alignItems: 'center', justifyContent: 'center' },
  groupOn: { borderColor: C.gold, backgroundColor: 'rgba(58,42,24,0.92)' },
  groupNum: { color: C.goldLight, fontFamily: F.headX, fontSize: 15 },
  groupCnt: { position: 'absolute', bottom: 1, right: 4, color: C.text, fontFamily: F.bodyB, fontSize: 9 },
  fabs: { position: 'absolute', right: 8, bottom: 10, gap: 8 },
  fab: { width: 54, height: 58, borderRadius: 12, backgroundColor: 'rgba(28,20,13,0.9)', borderWidth: 1.5, borderColor: C.goldDark, alignItems: 'center', justifyContent: 'center' },
  fabWarn: { borderColor: C.warn },
  fabActive: { borderColor: C.goldLight, backgroundColor: '#4a3620' },
  fabImg: { width: 34, height: 34, resizeMode: 'contain' },
  fabGlyph: { color: C.goldLight, fontSize: 26, lineHeight: 34 },
  fabLbl: { color: C.text, fontFamily: F.bodyB, fontSize: 10, marginTop: -1 },
});
