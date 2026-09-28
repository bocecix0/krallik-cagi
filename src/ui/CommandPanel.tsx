import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BUILDINGS, RES_NAMES, costText } from '../game/data';
import type { Cost, Entity, Res, TechId } from '../game/types';
import { sound } from '../audio/sound';
import { SOURCES } from '../render/manifest';
import { bldIcon, buildButtons, entityIcon, entityName, taskLabel, techIcon, unitIcon, type Btn } from './commands';
import type { Controller } from './controller';
import { C, F } from './theme';

export const PANEL_H = 128;
const RES_ICON: Record<Res, number> = { food: SOURCES.icon_food, wood: SOURCES.icon_wood, gold: SOURCES.icon_gold, stone: SOURCES.icon_stone };

/** Compact bottom action bar: one-line selection strip + horizontally scrolling command row. */
export function CommandPanel({ ctl, card }: { ctl: Controller; card?: boolean }) {
  const [tab, setTab] = useState<'eco' | 'mil'>('eco');
  const [tip, setTip] = useState<{ text: string; warn?: boolean } | null>(null);
  const armed = useRef<{ key: string; t: number } | null>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const w = ctl.w;
  const sel = ctl.selected();
  const selKey = sel.map((e) => e.id).join(',');

  useEffect(() => { setTip(null); }, [selKey]);
  const showTip = (text: string, ms = 1800, warn = false) => {
    setTip({ text, warn });
    if (tipTimer.current) clearTimeout(tipTimer.current);
    tipTimer.current = setTimeout(() => setTip(null), ms);
  };

  if (ctl.ghost) {
    const d = BUILDINGS[ctl.ghost.type];
    return (
      <View style={[s.bar, card && s.cardBar]}>
        <View style={s.placeRow}>
          <Image source={bldIcon(ctl.ghost.type)} style={s.placeImg} />
          <View style={{ flex: 1 }}>
            <Text style={s.name} numberOfLines={1}>{d.name}</Text>
            <CostRow cost={d.cost} w={ctl} />
            <Text style={[s.status, { color: ctl.ghost.valid ? C.green : C.warn }]} numberOfLines={1}>
              {ctl.ghost.valid ? 'Uygun — onayla' : 'Haritada boş bir yere dokun'}
            </Text>
          </View>
          <Pressable style={({ pressed }) => [s.placeBtn, s.cancel, pressed && s.pressed]} onPress={() => ctl.cancelPlacement()} hitSlop={6}>
            <Text style={s.placeTxt}>✕</Text>
          </Pressable>
          <Pressable disabled={!ctl.ghost.valid} style={({ pressed }) => [s.placeBtn, s.ok, !ctl.ghost?.valid && { opacity: 0.35 }, pressed && s.pressed]} onPress={() => ctl.confirmPlacement()} hitSlop={6}>
            <Text style={s.placeTxt}>✓</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const vills = sel.filter((e) => e.owner === 1 && e.type === 'villager');
  const buttons = buildButtons(ctl, tab);

  const press = (b: Btn) => {
    if (b.locked) { showTip(`${b.label}: ${b.locked} gerekli`, 1800, true); return; }
    if (b.danger) {
      const a = armed.current;
      if (!a || a.key !== b.key || Date.now() - a.t > 2500) { armed.current = { key: b.key, t: Date.now() }; showTip('Onaylamak için tekrar dokun', 2500, true); return; }
      armed.current = null;
    }
    if (b.cost && !w.canAfford(1, b.cost)) { showTip(`${b.label}: yetersiz kaynak (${costText(b.cost)})`, 2000, true); return; }
    showTip(`${b.label}${b.cost ? ' — ' + costText(b.cost) : ''}`, 1200);
    sound.play('click');
    b.onPress();
  };

  return (
    <View style={[s.bar, card && s.cardBar]}>
      {tip && (
        <View style={[s.tip, tip.warn && s.tipWarn]} pointerEvents="none">
          <Text style={s.tipTxt}>{tip.text}</Text>
        </View>
      )}
      <SelectionStrip ctl={ctl} sel={sel} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row} keyboardShouldPersistTaps="always">
        {vills.length > 0 && (
          <Pressable onPress={() => setTab(tab === 'eco' ? 'mil' : 'eco')} style={({ pressed }) => [s.btn, s.tabBtn, pressed && s.pressed]}>
            <Image source={tab === 'eco' ? SOURCES.icon_hammer : SOURCES.icon_sword} style={s.btnImg} />
            <Text style={s.btnLbl}>{tab === 'eco' ? 'Ekonomi' : 'Askeri'}</Text>
            <Text style={s.swap}>⇄</Text>
          </Pressable>
        )}
        {buttons.map((b) => {
          const afford = !b.cost || w.canAfford(1, b.cost);
          return (
            <Pressable key={b.key} onPress={() => press(b)} onLongPress={() => showTip(`${b.label}${b.cost ? ' — ' + costText(b.cost) : ''}. ${b.desc ?? ''}`, 3500)} delayLongPress={320}
              style={({ pressed }) => [s.btn, b.danger && s.btnDanger, (b.locked || !afford) && s.btnDim, pressed && s.pressed]}>
              <Image source={b.icon} style={s.btnImg} />
              <Text style={s.btnLbl} numberOfLines={1}>{b.label}</Text>
              {b.cost ? <CostRow cost={b.cost} w={ctl} small /> : null}
              {b.locked ? <Text style={s.lock}>🔒</Text> : null}
              {b.badge ? <View style={s.badge}><Text style={s.badgeTxt}>{b.badge}</Text></View> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function CostRow({ cost, w, small }: { cost: Cost; w: Controller; small?: boolean }) {
  const res = w.w.players[1].res;
  return (
    <View style={s.costRow}>
      {(Object.keys(cost) as Res[]).map((r) => (
        <View key={r} style={s.costItem}>
          <Image source={RES_ICON[r]} style={small ? s.costIconS : s.costIcon} />
          <Text style={[small ? s.costTxtS : s.costTxt, res[r] < (cost[r] ?? 0) && { color: '#ff8a7a' }]}>{cost[r]}</Text>
        </View>
      ))}
    </View>
  );
}

function SelectionStrip({ ctl, sel }: { ctl: Controller; sel: Entity[] }) {
  const w = ctl.w;
  if (!sel.length) {
    const idle = ctl.idleVillagers().length;
    return (
      <View style={s.strip}>
        <Text style={s.name}>Hızlı Eylemler</Text>
        <Text style={[s.status, { flex: 1, textAlign: 'right' }, idle > 0 && { color: C.warn }]} numberOfLines={1}>
          {idle > 0 ? `${idle} boşta köylü` : 'Bir birime dokunarak seç'}
        </Text>
      </View>
    );
  }
  if (sel.length > 1) {
    const groups = new Map<string, Entity[]>();
    sel.forEach((e) => groups.set(e.type, [...(groups.get(e.type) ?? []), e]));
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.stripScroll} contentContainerStyle={s.multi}>
        <Text style={[s.name, { marginRight: 6 }]}>{sel.length}</Text>
        {[...groups.entries()].map(([t, list]) => (
          <Pressable key={t} onPress={() => ctl.select(list)} style={s.chip}>
            <Image source={entityIcon(list[0])} style={s.chipImg} />
            <Text style={s.chipNum}>{list.length}</Text>
          </Pressable>
        ))}
      </ScrollView>
    );
  }
  const e = sel[0];
  const hpFrac = Math.max(0, e.hp / e.maxHp);
  const ownerColor = e.owner === 1 ? C.blue : e.owner === 2 ? C.red : C.goldDark;
  let status = '';
  if (e.kind === 'unit') {
    const st = w.unitStats(e);
    status = `⚔${st.attack} 🛡${st.melee}/${st.pierce}${st.range ? ` 🏹${st.range}` : ''}`;
    if (e.owner === 1) status += ` · ${taskLabel(e, w)}${e.carry && e.carry.amount >= 1 ? ` (${Math.floor(e.carry.amount)} ${RES_NAMES[e.carry.type]})` : ''}`;
  } else if (e.kind === 'resource') status = `Kalan ${Math.ceil(e.amount ?? 0)} ${RES_NAMES[e.resType as Res]}`;
  else if (!e.built) status = `İnşa %${Math.floor((e.progress ?? 0) * 100)}`;
  else if (e.type === 'farm') status = `Kalan ${Math.ceil(e.amount ?? 0)} Yiyecek`;
  else if (w.garrisonCap(e) > 0) status = `Sığınan ${w.garrisoned(e).length}/${w.garrisonCap(e)}`;
  return (
    <View style={s.strip}>
      <View style={[s.portrait, { borderColor: ownerColor }]}>
        <Image source={entityIcon(e)} style={s.portraitImg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.nameRow}>
          <Text style={s.name} numberOfLines={1}>{entityName(e, w)}{e.owner === 2 ? ' · Rakip' : ''}</Text>
          {e.kind !== 'resource' && <Text style={s.hpTxt}>{Math.ceil(e.hp)}/{e.maxHp}</Text>}
        </View>
        {e.kind !== 'resource' && (
          <View style={s.hpBar}><View style={[s.hpFill, { width: `${hpFrac * 100}%`, backgroundColor: hpFrac > 0.5 ? C.green : hpFrac > 0.25 ? '#e6c229' : C.red }]} /></View>
        )}
        <Text style={s.status} numberOfLines={1}>{status}</Text>
      </View>
      {e.queue && e.queue.length > 0 && e.owner === 1 && (
        <View style={s.queue}>
          {e.queue.slice(0, 4).map((q, i) => (
            <Pressable key={i} onPress={() => w.cancel(e, i)} style={s.qItem} hitSlop={4}>
              <Image source={q.kind === 'unit' ? unitIcon(q.id) : techIcon(q.id as TechId)} style={s.qImg} />
              {i === 0 && <View style={s.qBar}><View style={[s.qFill, { width: `${(q.progress / q.time) * 100}%` }, q.blocked && { backgroundColor: C.warn }]} /></View>}
            </Pressable>
          ))}
          {e.queue.length > 4 && <Text style={s.qMore}>+{e.queue.length - 4}</Text>}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { backgroundColor: C.wood, borderTopWidth: 2, borderColor: C.goldDark, paddingTop: 5, paddingBottom: 4, height: PANEL_H },
  cardBar: { borderTopWidth: 0, backgroundColor: 'rgba(36,26,18,0.94)' },
  strip: { height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 8 },
  stripScroll: { height: 44, flexGrow: 0 },
  portrait: { width: 40, height: 40, borderRadius: 7, borderWidth: 2, backgroundColor: '#1a130d', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  portraitImg: { width: 36, height: 36, resizeMode: 'contain' },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  name: { color: C.goldLight, fontFamily: F.head, fontSize: 13, flexShrink: 1 },
  hpTxt: { color: C.textDim, fontFamily: F.bodyB, fontSize: 10 },
  hpBar: { height: 4, backgroundColor: '#140e09', borderRadius: 2, marginVertical: 2, overflow: 'hidden' },
  hpFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  status: { color: C.textDim, fontFamily: F.body, fontSize: 11.5 },
  queue: { flexDirection: 'row', gap: 3, alignItems: 'center' },
  qItem: { width: 32, height: 32, borderRadius: 5, backgroundColor: '#1a130d', borderWidth: 1, borderColor: C.goldDark, alignItems: 'center', justifyContent: 'center' },
  qImg: { width: 26, height: 26, resizeMode: 'contain' },
  qBar: { position: 'absolute', bottom: 1, left: 2, right: 2, height: 3, backgroundColor: '#000' },
  qFill: { height: 3, backgroundColor: C.green },
  qMore: { color: C.textDim, fontFamily: F.bodyB, fontSize: 11 },
  multi: { alignItems: 'center', paddingHorizontal: 8, gap: 5 },
  chip: { width: 40, height: 40, borderRadius: 6, backgroundColor: '#1a130d', borderWidth: 1, borderColor: C.goldDark, alignItems: 'center', justifyContent: 'center' },
  chipImg: { width: 32, height: 32, resizeMode: 'contain' },
  chipNum: { position: 'absolute', bottom: 0, right: 3, color: C.text, fontFamily: F.bodyB, fontSize: 10 },
  row: { paddingHorizontal: 6, gap: 5, alignItems: 'center', paddingTop: 3 },
  btn: { width: 58, height: 70, borderRadius: 8, backgroundColor: C.wood2, borderWidth: 1.5, borderColor: C.goldDark, alignItems: 'center', paddingTop: 2, overflow: 'hidden' },
  tabBtn: { backgroundColor: '#3a2a1a', borderColor: C.gold },
  swap: { position: 'absolute', top: 1, right: 3, color: C.goldLight, fontSize: 10 },
  btnDim: { opacity: 0.42 },
  btnDanger: { borderColor: '#8a2a20' },
  btnImg: { width: 38, height: 34, resizeMode: 'contain' },
  btnLbl: { color: C.text, fontFamily: F.body, fontSize: 9.5, marginTop: 1, paddingHorizontal: 2 },
  costRow: { flexDirection: 'row', gap: 3, alignItems: 'center' },
  costItem: { flexDirection: 'row', alignItems: 'center' },
  costIcon: { width: 14, height: 14, resizeMode: 'contain', marginRight: 1 },
  costIconS: { width: 10, height: 10, resizeMode: 'contain' },
  costTxt: { color: C.text, fontFamily: F.bodyB, fontSize: 12 },
  costTxtS: { color: C.parchment, fontFamily: F.bodyB, fontSize: 9 },
  lock: { position: 'absolute', top: 1, right: 2, fontSize: 10 },
  badge: { position: 'absolute', top: 2, right: 2, backgroundColor: C.blue, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { color: '#fff', fontSize: 10, fontFamily: F.bodyB },
  pressed: { transform: [{ scale: 0.93 }], opacity: 0.85 },
  tip: { position: 'absolute', bottom: PANEL_H + 4, left: 10, right: 10, backgroundColor: 'rgba(234,220,188,0.97)', borderRadius: 8, borderWidth: 1.5, borderColor: C.goldDark, paddingHorizontal: 10, paddingVertical: 6, zIndex: 10 },
  tipWarn: { backgroundColor: 'rgba(255,214,190,0.97)', borderColor: '#b5452c' },
  tipTxt: { color: C.ink, fontFamily: F.body, fontSize: 13, lineHeight: 17 },
  placeRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10 },
  placeImg: { width: 64, height: 56, resizeMode: 'contain' },
  placeBtn: { width: 64, height: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  cancel: { backgroundColor: '#3a1a14', borderColor: '#b5452c' },
  ok: { backgroundColor: '#1d3a1f', borderColor: C.green },
  placeTxt: { color: C.text, fontFamily: F.headX, fontSize: 26 },
});
