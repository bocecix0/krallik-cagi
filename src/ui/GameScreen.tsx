import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { SaveData } from '../game/world';
import { clearSave, saveGame } from './save';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AGE_NAMES } from '../game/data';
import type { MapStyle } from '../game/mapgen';
import type { CivId, Difficulty } from '../game/types';
import { CIVS } from '../game/civs';
import type { Loaded } from '../render/loader';
import { SOURCES } from '../render/manifest';
import { CommandPanel, PANEL_H } from './CommandPanel';
import { Controller } from './controller';
import { GameCanvas } from './GameCanvas';
import { Minimap } from './Minimap';
import { Objectives } from './Objectives';
import { EndOverlay, PauseOverlay, Toasts } from './Overlays';
import { C, F } from './theme';
import { fmtTime, TOP_H, TopBar } from './TopBar';

interface Props {
  assets: Loaded;
  settings: { difficulty: Difficulty; style: MapStyle; seed: number; civ: CivId; restore?: SaveData };
  onExit: () => void;
  onRestart: () => void;
}

export function GameScreen({ assets, settings, onExit, onRestart }: Props) {
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const ctl = useMemo(() => new Controller({ seed: settings.seed, style: settings.style, difficulty: settings.difficulty, civ: settings.civ, restore: settings.restore }), [settings]);
  // autosave: every 20s, when the app goes to background and when leaving the screen; the save is dropped once the game is decided
  useEffect(() => {
    const t = setInterval(() => { if (!ctl.paused) saveGame(ctl); }, 20000);
    const sub = AppState.addEventListener('change', (st) => { if (st !== 'active') saveGame(ctl); });
    return () => { clearInterval(t); sub.remove(); saveGame(ctl); };
  }, [ctl]);
  const decided = !!ctl.w.winner;
  useEffect(() => { if (decided) clearSave(); }, [decided]);
  const [, setHud] = useState(0);
  const [miniOpen, setMiniOpen] = useState(true);
  const [paused, setPaused] = useState(false);
  const size = useRef({ w: 1, h: 1 });
  if (__DEV__) (globalThis as unknown as { __ctl: Controller }).__ctl = ctl;
  const onHud = useCallback(() => setHud((x) => x + 1), []);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    size.current = { w: width, h: height };
    ctl.setViewport(width, height);
  };

  const gesture = useMemo(() => {
    // Camera moves by per-event deltas (changeX/Y) so a new touch can never "jump" the view.
    // When the finger count changes (2→1 after a pinch) the centroid leaps; that event is ignored.
    let pointers = 0;
    let pinching = false;
    const touch = () => { ctl.lastInput = performance.now(); ctl.fling = { vx: 0, vy: 0 }; };
    const pan = Gesture.Pan().runOnJS(true).minDistance(10).averageTouches(true)
      .onBegin(touch)
      .onStart((e) => {
        pointers = e.numberOfPointers;
        if (ctl.boxMode) ctl.box = { x0: e.x - e.translationX, y0: e.y - e.translationY, x1: e.x, y1: e.y };
      })
      .onChange((e) => {
        touch();
        if (ctl.box && ctl.boxMode) { ctl.box.x1 = e.x; ctl.box.y1 = e.y; return; }
        if (e.numberOfPointers !== pointers) { pointers = e.numberOfPointers; return; }
        if (Math.abs(e.changeX) > 150 || Math.abs(e.changeY) > 150) return;
        ctl.panBy(e.changeX, e.changeY);
      })
      .onEnd((e) => {
        if (ctl.boxMode) { ctl.boxSelect(); ctl.boxMode = false; ctl.rev++; return; }
        // flick: keep gliding with the release velocity (kinetic scrolling)
        if (!pinching && e.numberOfPointers <= 1 && Math.hypot(e.velocityX, e.velocityY) > 250) {
          const cap = 2400;
          ctl.fling = { vx: Math.max(-cap, Math.min(cap, e.velocityX)), vy: Math.max(-cap, Math.min(cap, e.velocityY)) };
        }
      })
      .onFinalize(() => { if (!ctl.boxMode) ctl.box = null; });
    const boxPan = Gesture.Pan().runOnJS(true).activateAfterLongPress(380)
      .onStart((e) => { touch(); ctl.box = { x0: e.x, y0: e.y, x1: e.x, y1: e.y }; })
      .onChange((e) => { touch(); if (ctl.box) { ctl.box.x1 = e.x; ctl.box.y1 = e.y; } })
      .onEnd(() => ctl.boxSelect())
      .onFinalize(() => { ctl.box = null; });
    const pinch = Gesture.Pinch().runOnJS(true)
      .onStart(() => { pinching = true; touch(); })
      .onChange((e) => { touch(); if (Number.isFinite(e.scaleChange) && e.scaleChange > 0.5 && e.scaleChange < 2) ctl.zoomAt(e.scaleChange, e.focalX, e.focalY); })
      .onFinalize(() => { pinching = false; });
    const tap = Gesture.Tap().runOnJS(true).maxDuration(350).maxDistance(16)
      .onBegin(touch)
      .onEnd((e, ok) => { if (ok && !pinching) ctl.tap(e.x, e.y); });
    return Gesture.Race(boxPan, Gesture.Simultaneous(pan, pinch), tap);
  }, [ctl]);

  const me = ctl.w.players[1];
  const idle = ctl.idleVillagers().length;
  const workers = ctl.workerCounts();
  const land = win.width > win.height;

  const agePill = (
    <View style={s.agePill} pointerEvents="none">
      <Image source={SOURCES[CIVS[me.civ].icon] ?? SOURCES.icon_age1} style={s.ageIcon} />
      <Image source={SOURCES[`icon_age${me.age + 1}`] ?? SOURCES.icon_age1} style={s.ageIcon} />
      <Text style={s.ageTxt}>{AGE_NAMES[me.age]}</Text>
      <Text style={s.timeTxt}>{fmtTime(ctl.w.time)}</Text>
    </View>
  );
  const map = (
    <GestureDetector gesture={gesture}>
      <View style={StyleSheet.absoluteFill} collapsable={false}>
        <GameCanvas ctl={ctl} assets={assets} size={size} onHud={onHud} />
      </View>
    </GestureDetector>
  );
  const groups = (
    <View style={s.groupRow} pointerEvents="box-none">
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
  );
  const fabs = (
    <>
      <Fab glyph="⬚" active={ctl.boxMode} onPress={() => { ctl.boxMode = !ctl.boxMode; ctl.rev++; }} />
      <Fab icon={SOURCES.bld_town_center} onPress={() => ctl.goHome()} />
      <Fab icon={SOURCES.unit_militia} onPress={() => ctl.selectArmy()} />
      <Fab icon={SOURCES.unit_villager_m} badge={idle > 0 ? String(idle) : undefined} warn={idle > 0} onPress={() => ctl.nextIdleVillager()} />
    </>
  );
  const minimap = (
    <View style={s.miniCol} pointerEvents="box-none">
      {miniOpen && <Minimap ctl={ctl} />}
      <Pressable onPress={() => setMiniOpen((o) => !o)} style={s.miniToggle} hitSlop={8}>
        <Text style={s.miniToggleTxt}>{miniOpen ? (land ? '▼' : '▲') : '🗺'}</Text>
      </Pressable>
    </View>
  );
  const overlays = (
    <>
      {ctl.boxMode && (
        <View style={s.boxHint} pointerEvents="none"><Text style={s.boxHintTxt}>Seçmek istediğin alanı parmağınla çiz</Text></View>
      )}
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
    </>
  );
  const topBar = (
    <TopBar res={me.res} workers={workers} pop={me.pop} cap={me.popCap} onRes={(r) => ctl.selectWorkers(r)}
      onMenu={() => { ctl.paused = true; setPaused(true); saveGame(ctl); }} extra={land ? agePill : undefined} />
  );

  if (land) {
    // Landscape: full-screen map with floating HUD — minimap under the left thumb, commands under the right thumb.
    const cardW = Math.min(560, Math.max(330, win.width * 0.56));
    return (
      <View style={s.root}>
        <View style={StyleSheet.absoluteFill} onLayout={onLayout}>{map}</View>
        <View style={[s.topLand, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>{topBar}</View>
        <View style={[s.leftCol, { top: insets.top + TOP_H + 6, left: insets.left + 6 }]} pointerEvents="box-none">
          {!ctl.ghost && <Objectives world={ctl.w} />}
          <Toasts events={ctl.w.events} time={ctl.w.time} onPress={(x, y) => ctl.centerOn(x, y)} />
        </View>
        <View style={[s.miniLand, { left: insets.left + 6, bottom: insets.bottom + 6 }]} pointerEvents="box-none">
          {groups}
          {minimap}
        </View>
        <View style={[s.fabsLand, { right: insets.right + 6, bottom: insets.bottom + PANEL_H + 14 }]} pointerEvents="box-none">{fabs}</View>
        <View style={[s.card, { right: insets.right + 6, bottom: insets.bottom + 6, width: cardW }]}>
          <CommandPanel ctl={ctl} card />
        </View>
        {overlays}
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {topBar}
      <View style={s.map} onLayout={onLayout}>
        {map}
        <View style={s.leftCol} pointerEvents="box-none">
          {agePill}
          {!ctl.ghost && <Objectives world={ctl.w} />}
          <Toasts events={ctl.w.events} time={ctl.w.time} onPress={(x, y) => ctl.centerOn(x, y)} />
        </View>
        <View style={s.miniWrap} pointerEvents="box-none">{minimap}</View>
        <View style={s.groups} pointerEvents="box-none">{groups}</View>
        <View style={s.fabs} pointerEvents="box-none">{fabs}</View>
      </View>
      <View style={{ paddingBottom: insets.bottom, backgroundColor: C.wood }}>
        <CommandPanel ctl={ctl} />
      </View>
      {overlays}
    </View>
  );
}

function Fab({ icon, glyph, onPress, warn, active, badge }: { icon?: number; glyph?: string; onPress: () => void; warn?: boolean; active?: boolean; badge?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={4} style={({ pressed }) => [s.fab, warn && s.fabWarn, active && s.fabActive, pressed && { transform: [{ scale: 0.9 }] }]}>
      {icon ? <Image source={icon} style={s.fabImg} /> : <Text style={s.fabGlyph}>{glyph}</Text>}
      {badge ? <View style={s.fabBadge}><Text style={s.fabBadgeTxt}>{badge}</Text></View> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  map: { flex: 1, overflow: 'hidden' },
  leftCol: { position: 'absolute', top: 6, left: 6, maxWidth: 205, gap: 5, alignItems: 'flex-start' },
  agePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(20,14,9,0.82)', borderRadius: 14, paddingLeft: 4, paddingRight: 9, paddingVertical: 3, borderWidth: 1, borderColor: C.goldDark },
  ageIcon: { width: 20, height: 20, resizeMode: 'contain' },
  ageTxt: { color: C.goldLight, fontFamily: F.head, fontSize: 11 },
  timeTxt: { color: C.textDim, fontFamily: F.bodyB, fontSize: 11, fontVariant: ['tabular-nums'] },
  miniWrap: { position: 'absolute', top: 6, right: 6, alignItems: 'flex-end' },
  miniCol: { alignItems: 'flex-end' },
  topLand: { position: 'absolute', left: 0, right: 0, top: 0 },
  miniLand: { position: 'absolute', gap: 6, alignItems: 'flex-start' },
  fabsLand: { position: 'absolute', gap: 6, alignItems: 'flex-end' },
  card: { position: 'absolute', borderRadius: 12, overflow: 'hidden', borderWidth: 1.5, borderColor: C.goldDark, backgroundColor: C.wood },
  groupRow: { flexDirection: 'row', gap: 6 },
  miniToggle: { marginTop: 4, width: 30, height: 22, borderRadius: 6, backgroundColor: 'rgba(20,14,9,0.85)', borderWidth: 1, borderColor: C.goldDark, alignItems: 'center', justifyContent: 'center' },
  miniToggleTxt: { color: C.goldLight, fontSize: 11 },
  groups: { position: 'absolute', left: 6, bottom: 8 },
  group: { width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(28,20,13,0.72)', borderWidth: 1, borderColor: '#4a3a28', alignItems: 'center', justifyContent: 'center' },
  groupOn: { borderColor: C.gold, backgroundColor: 'rgba(58,42,24,0.92)' },
  groupNum: { color: C.goldLight, fontFamily: F.headX, fontSize: 14 },
  groupCnt: { position: 'absolute', bottom: 0, right: 3, color: C.text, fontFamily: F.bodyB, fontSize: 9 },
  fabs: { position: 'absolute', right: 6, bottom: 8, gap: 7 },
  fab: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(28,20,13,0.88)', borderWidth: 1.5, borderColor: C.goldDark, alignItems: 'center', justifyContent: 'center' },
  fabWarn: { borderColor: C.warn },
  fabActive: { borderColor: C.goldLight, backgroundColor: '#5a4020' },
  fabImg: { width: 32, height: 32, resizeMode: 'contain' },
  fabGlyph: { color: C.goldLight, fontSize: 22, lineHeight: 26 },
  fabBadge: { position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.warn, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  fabBadgeTxt: { color: C.ink, fontFamily: F.bodyB, fontSize: 11 },
  boxHint: { position: 'absolute', bottom: 60, alignSelf: 'center', backgroundColor: 'rgba(20,14,9,0.85)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  boxHintTxt: { color: C.goldLight, fontFamily: F.bodyB, fontSize: 12 },
});
