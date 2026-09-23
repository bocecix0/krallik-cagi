import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { AGE_NAMES, BUILDINGS, ECO_BUILDS, MIL_BUILDS, NODES, RES_NAMES, TECHS, UNITS, costText } from '../game/data';
import type { BuildingType, Cost, Entity, Res, ResourceNodeType, TechId, UnitType } from '../game/types';
import { SOURCES } from '../render/manifest';
import type { Controller } from './controller';
import { C, F } from './theme';

interface Btn {
  key: string;
  icon: ImageSourcePropType;
  label: string;
  cost?: Cost;
  desc?: string;
  locked?: string; // reason
  badge?: string;
  danger?: boolean;
  onPress: () => void;
}

const unitIcon = (t: string) => SOURCES[`unit_${t}`] ?? SOURCES.unit_villager_m;
const bldIcon = (t: string) => SOURCES[`bld_${t}`] ?? SOURCES.bld_house;
const nodeIcon = (t: string) => SOURCES[t === 'berry' ? 'nat_berry_bush' : t === 'gold' ? 'nat_gold_mine' : t === 'stone' ? 'nat_stone_mine' : `nat_${t}`];
const techIcon = (t: TechId) => SOURCES[`tech_${t}`] ?? SOURCES[TECHS[t].icon] ?? SOURCES.icon_research;

export function entityName(e: Entity, w?: Controller['w']) {
  if (e.kind === 'unit') return w ? w.unitName(e) : UNITS[e.type as UnitType].name;
  if (e.kind === 'building') return BUILDINGS[e.type as BuildingType].name;
  return NODES[e.type as ResourceNodeType].name;
}
export function entityIcon(e: Entity) {
  if (e.kind === 'unit') return e.type === 'villager' && e.female ? SOURCES.unit_villager_f : unitIcon(e.type);
  if (e.kind === 'building') return bldIcon(e.type);
  return nodeIcon(e.type);
}

function taskLabel(e: Entity, ctl: Controller) {
  const o = e.order;
  if (!o) return '';
  switch (o.kind) {
    case 'idle': return 'Boşta';
    case 'move': return 'Hareket ediyor';
    case 'attack': return 'Saldırıyor';
    case 'build': return 'İnşa ediyor';
    case 'return': return 'Kaynak taşıyor';
    case 'gather': { const t = ctl.w.get(o.target); const r = t?.resType as Res | undefined; return r ? `${RES_NAMES[r]} topluyor` : 'Topluyor'; }
  }
}

export function CommandPanel({ ctl }: { ctl: Controller }) {
  const [tab, setTab] = useState<'eco' | 'mil'>('eco');
  const [info, setInfo] = useState<string>('');
  const w = ctl.w;
  const me = w.players[1];
  const sel = ctl.selected();

  if (ctl.ghost) {
    const d = BUILDINGS[ctl.ghost.type];
    return (
      <View style={s.panel}>
        <View style={s.placeRow}>
          <Image source={bldIcon(ctl.ghost.type)} style={s.placeImg} />
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{d.name}</Text>
            <Text style={s.dim}>{costText(d.cost)}</Text>
            <Text style={[s.dim, { color: ctl.ghost.valid ? C.green : C.warn }]}>{ctl.ghost.valid ? 'Konum uygun — onayla' : 'Haritaya dokunarak yer seç'}</Text>
          </View>
        </View>
        <View style={s.placeBtns}>
          <Pressable style={({ pressed }) => [s.bigBtn, s.cancel, pressed && s.pressed]} onPress={() => ctl.cancelPlacement()}>
            <Text style={s.bigTxt}>✕ İptal</Text>
          </Pressable>
          <Pressable disabled={!ctl.ghost.valid} style={({ pressed }) => [s.bigBtn, s.ok, !ctl.ghost?.valid && { opacity: 0.4 }, pressed && s.pressed]} onPress={() => ctl.confirmPlacement()}>
            <Text style={s.bigTxt}>✓ İnşa Et</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const own = sel.filter((e) => e.owner === 1);
  const vills = own.filter((e) => e.type === 'villager');
  const units = own.filter((e) => e.kind === 'unit');
  const bld = sel.length === 1 && sel[0].kind === 'building' && sel[0].owner === 1 ? sel[0] : null;
  const buttons: Btn[] = [];

  if (vills.length) {
    const list = tab === 'eco' ? ECO_BUILDS : MIL_BUILDS;
    for (const t of list) {
      const d = BUILDINGS[t];
      buttons.push({
        key: t, icon: bldIcon(t), label: d.name, cost: d.cost, desc: d.desc,
        locked: d.age > me.age ? AGE_NAMES[d.age] : undefined,
        onPress: () => ctl.startPlacement(t),
      });
    }
  }
  if (bld && bld.built) {
    const d = BUILDINGS[bld.type as BuildingType];
    const hasMaa = w.has(1, 'man_at_arms');
    for (const u of d.trains ?? []) {
      if (u === 'militia' && hasMaa) continue;
      if (u === 'manatarms' && !hasMaa) continue;
      const ud = UNITS[u];
      const queued = bld.queue?.filter((q) => q.id === u).length ?? 0;
      buttons.push({
        key: u, icon: unitIcon(u), label: ud.name, cost: ud.cost, desc: ud.desc, badge: queued ? String(queued) : undefined,
        locked: ud.age > me.age ? AGE_NAMES[ud.age] : undefined,
        onPress: () => w.train(bld, u),
      });
    }
    for (const t of d.techs ?? []) {
      const td = TECHS[t];
      if (me.techs.has(t)) continue;
      const isAge = t === 'feudal' || t === 'castle_age' || t === 'imperial';
      if (isAge && td.age !== me.age) continue;
      if (td.requires && !me.techs.has(td.requires)) continue;
      const inQueue = w.entities.size && [...w.entities.values()].some((e) => e.owner === 1 && e.queue?.some((q) => q.id === t));
      if (inQueue) continue;
      const req = isAge ? `${w.ageReqCount(1)}/2 bina` : undefined;
      buttons.push({
        key: t, icon: techIcon(t), label: td.name, cost: td.cost, desc: td.desc + (req ? ` (${req})` : ''),
        locked: td.age > me.age ? AGE_NAMES[td.age] : undefined,
        onPress: () => w.research(bld, t),
      });
    }
  }
  if (bld && bld.built && bld.type === 'market') {
    for (const r of ['food', 'wood', 'stone'] as const) {
      const icon = SOURCES[`icon_${r}`];
      buttons.push({ key: 'buy_' + r, icon, label: `Al ${w.buyPrice(r)}`, desc: `100 ${RES_NAMES[r]} satın al: ${w.buyPrice(r)} Altın.`, onPress: () => w.trade(1, r, true) });
      buttons.push({ key: 'sell_' + r, icon, label: `Sat ${w.sellPrice(r)}`, desc: `100 ${RES_NAMES[r]} sat: ${w.sellPrice(r)} Altın kazan.`, onPress: () => w.trade(1, r, false) });
    }
  }
  if (bld && bld.built && w.garrisonCap(bld) > 0) {
    const inside = w.garrisoned(bld).length;
    if (bld.type === 'town_center') buttons.push({ key: 'bell', icon: SOURCES.icon_pop, label: 'Alarm Çanı', desc: `Yakındaki köylüler sığınır, her biri +1 ok atar (${inside}/${w.garrisonCap(bld)}).`, onPress: () => w.ringBell(1, bld) });
    if (inside) buttons.push({ key: 'ungarrison', icon: unitIcon('villager'), label: 'Çıkar', badge: String(inside), desc: 'Sığınan birimleri dışarı çıkar.', onPress: () => w.ungarrison(bld) });
  }
  if (!sel.length) {
    // quick actions: the most common economy commands without hunting for units on the map
    const tc = ctl.townCenter();
    if (tc) {
      const q = tc.queue?.filter((x) => x.id === 'villager').length ?? 0;
      buttons.push({ key: 'q_vil', icon: unitIcon('villager'), label: 'Köylü', cost: UNITS.villager.cost, desc: 'Şehir Merkezinde köylü üret.', badge: q ? String(q) : undefined, onPress: () => w.train(tc, 'villager') });
    }
    for (const t of ['house', 'farm', 'lumber_camp', 'mining_camp', 'mill'] as BuildingType[]) {
      const d = BUILDINGS[t];
      buttons.push({ key: 'q_' + t, icon: bldIcon(t), label: d.name, cost: d.cost, desc: d.desc + ' (en yakın köylü inşa eder)', onPress: () => ctl.quickBuild(t) });
    }
    const next = (['feudal', 'castle_age', 'imperial'] as TechId[])[me.age];
    if (tc && next && w.techAvailable(1, next)) {
      const td = TECHS[next];
      buttons.push({ key: 'q_age', icon: techIcon(next), label: 'Çağ Atla', cost: td.cost, desc: `${td.name}. ${td.desc} (${w.ageReqCount(1)}/2)`, onPress: () => w.research(tc, next) });
    }
    buttons.push({ key: 'q_mil', icon: bldIcon('barracks'), label: BUILDINGS.barracks.name, cost: BUILDINGS.barracks.cost, desc: BUILDINGS.barracks.desc, onPress: () => ctl.quickBuild('barracks') });
  }
  if (units.length) {
    buttons.push({ key: 'stop', icon: SOURCES.icon_sword, label: 'Dur', desc: 'Birimleri durdur.', onPress: () => ctl.stop() });
  }
  if (own.length && !(bld && bld.type === 'town_center')) {
    buttons.push({ key: 'del', icon: SOURCES.bld_rubble, label: 'Sil', desc: 'Seçileni yok et.', danger: true, onPress: () => ctl.deleteSelected() });
  }

  return (
    <View style={s.panel}>
      <SelectionInfo ctl={ctl} sel={sel} />
      {vills.length > 0 && (
        <View style={s.tabs}>
          {(['eco', 'mil'] as const).map((k) => (
            <Pressable key={k} onPress={() => setTab(k)} style={[s.tab, tab === k && s.tabOn]}>
              <Image source={k === 'eco' ? SOURCES.icon_hammer : SOURCES.icon_sword} style={s.tabIcon} />
              <Text style={[s.tabTxt, tab === k && { color: C.goldLight }]}>{k === 'eco' ? 'Ekonomi' : 'Askeri'}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <Text style={s.info} numberOfLines={2}>{info || (buttons.length ? 'Basılı tut: detay · Dokun: uygula' : '')}</Text>
      <View style={s.grid}>
        {buttons.map((b) => {
          const afford = !b.cost || w.canAfford(1, b.cost);
          return (
            <Pressable
              key={b.key}
              onPress={() => { if (b.locked) { setInfo(`${b.label}: ${b.locked} gerekli`); return; } setInfo(`${b.label}${b.cost ? ' — ' + costText(b.cost) : ''}`); b.onPress(); }}
              onLongPress={() => setInfo(`${b.label}${b.cost ? ' — ' + costText(b.cost) : ''}. ${b.desc ?? ''}`)}
              style={({ pressed }) => [s.btn, b.danger && s.btnDanger, (!afford || b.locked) && s.btnDim, pressed && s.pressed]}
            >
              <Image source={b.icon} style={s.btnImg} />
              {b.locked ? <Text style={s.lock}>🔒</Text> : null}
              {b.badge ? <View style={s.badge}><Text style={s.badgeTxt}>{b.badge}</Text></View> : null}
              <Text style={s.btnLbl} numberOfLines={1}>{b.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SelectionInfo({ ctl, sel }: { ctl: Controller; sel: Entity[] }) {
  const w = ctl.w;
  if (!sel.length) {
    const idle = ctl.idleVillagers().length;
    return (
      <View style={s.infoBox}>
        <Text style={s.hint}>Hızlı Eylemler</Text>
        <Text style={s.dim}>Birime/binaya dokun: seç · Sürükle: kaydır · İki parmak: yakınlaştır · Basılı tut + sürükle: alan seçimi</Text>
        {idle > 0 && <Text style={[s.dim, { color: C.warn }]}>{idle} boşta köylü var</Text>}
      </View>
    );
  }
  if (sel.length > 1) {
    const groups = new Map<string, Entity[]>();
    sel.forEach((e) => groups.set(e.type, [...(groups.get(e.type) ?? []), e]));
    return (
      <View style={[s.infoBox, s.multi]}>
        {[...groups.entries()].slice(0, 8).map(([t, list]) => (
          <Pressable key={t} onPress={() => ctl.select(list)} style={s.multiItem}>
            <Image source={entityIcon(list[0])} style={s.multiImg} />
            <Text style={s.multiNum}>{list.length}</Text>
          </Pressable>
        ))}
      </View>
    );
  }
  const e = sel[0];
  const hpFrac = e.hp / e.maxHp;
  const ownerColor = e.owner === 1 ? C.blue : e.owner === 2 ? C.red : C.textDim;
  let line2 = '';
  if (e.kind === 'unit') {
    const st = w.unitStats(e);
    line2 = `⚔ ${st.attack}  🛡 ${st.melee}/${st.pierce}${st.range ? `  🏹 ${st.range}` : ''}`;
  } else if (e.kind === 'resource') line2 = `Kalan: ${Math.ceil(e.amount ?? 0)} ${RES_NAMES[e.resType as Res]}`;
  else if (!e.built) line2 = `İnşa: %${Math.floor((e.progress ?? 0) * 100)}`;
  else if (e.type === 'farm') line2 = `Kalan: ${Math.ceil(e.amount ?? 0)} Yiyecek`;
  else if (w.garrisonCap(e) > 0) line2 = `Sığınan: ${w.garrisoned(e).length}/${w.garrisonCap(e)}`;
  return (
    <View style={s.infoBox}>
      <View style={s.single}>
        <View style={[s.portrait, { borderColor: ownerColor }]}>
          <Image source={entityIcon(e)} style={s.portraitImg} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{entityName(e, w)}{e.owner === 2 ? ' (Rakip)' : ''}</Text>
          {e.kind !== 'resource' && (
            <View style={s.hpBar}><View style={[s.hpFill, { width: `${hpFrac * 100}%`, backgroundColor: hpFrac > 0.5 ? C.green : hpFrac > 0.25 ? '#e6c229' : C.red }]} /><Text style={s.hpTxt}>{Math.ceil(e.hp)}/{e.maxHp}</Text></View>
          )}
          <Text style={s.dim}>{line2}</Text>
          {e.kind === 'unit' && e.owner === 1 && <Text style={s.dim}>{taskLabel(e, ctl)}{e.carry ? ` · ${Math.floor(e.carry.amount)} ${RES_NAMES[e.carry.type]}` : ''}</Text>}
        </View>
      </View>
      {e.queue && e.queue.length > 0 && e.owner === 1 && (
        <View style={s.queue}>
          {e.queue.map((q, i) => (
            <Pressable key={i} onPress={() => w.cancel(e, i)} style={s.qItem}>
              <Image source={q.kind === 'unit' ? unitIcon(q.id) : techIcon(q.id as TechId)} style={s.qImg} />
              {i === 0 && <View style={s.qBar}><View style={[s.qFill, { width: `${(q.progress / q.time) * 100}%` }, q.blocked && { backgroundColor: C.warn }]} /></View>}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  panel: { backgroundColor: C.wood, borderTopWidth: 2, borderColor: C.goldDark, paddingHorizontal: 8, paddingTop: 6, paddingBottom: 6, minHeight: 292 },
  infoBox: { minHeight: 64, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 6, borderWidth: 1, borderColor: '#4a3a28' },
  hint: { color: C.text, fontFamily: F.bodyB, fontSize: 14 },
  dim: { color: C.textDim, fontFamily: F.body, fontSize: 12.5 },
  single: { flexDirection: 'row', alignItems: 'center' },
  portrait: { width: 56, height: 56, borderRadius: 8, borderWidth: 2, backgroundColor: '#1a130d', marginRight: 8, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  portraitImg: { width: 52, height: 52, resizeMode: 'contain' },
  name: { color: C.goldLight, fontFamily: F.head, fontSize: 14 },
  hpBar: { height: 12, backgroundColor: '#140e09', borderRadius: 3, marginVertical: 3, overflow: 'hidden', justifyContent: 'center' },
  hpFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  hpTxt: { color: '#fff', fontSize: 9, textAlign: 'center', fontFamily: F.bodyB },
  queue: { flexDirection: 'row', marginTop: 6, gap: 4 },
  qItem: { width: 34, height: 34, borderRadius: 5, backgroundColor: '#1a130d', borderWidth: 1, borderColor: C.goldDark, alignItems: 'center', justifyContent: 'center' },
  qImg: { width: 28, height: 28, resizeMode: 'contain' },
  qBar: { position: 'absolute', bottom: 1, left: 2, right: 2, height: 4, backgroundColor: '#000' },
  qFill: { height: 4, backgroundColor: C.green },
  multi: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  multiItem: { width: 48, height: 52, borderRadius: 6, backgroundColor: '#1a130d', borderWidth: 1, borderColor: C.goldDark, alignItems: 'center' },
  multiImg: { width: 38, height: 38, resizeMode: 'contain' },
  multiNum: { color: C.text, fontFamily: F.bodyB, fontSize: 12, marginTop: -2 },
  tabs: { flexDirection: 'row', marginTop: 6, gap: 6 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 5, borderRadius: 6, backgroundColor: '#1a130d', borderWidth: 1, borderColor: '#4a3a28' },
  tabOn: { borderColor: C.gold, backgroundColor: C.woodLight },
  tabIcon: { width: 18, height: 18, resizeMode: 'contain', marginRight: 5 },
  tabTxt: { color: C.textDim, fontFamily: F.head, fontSize: 12 },
  info: { color: C.parchment, fontFamily: F.body, fontSize: 12, marginVertical: 4, minHeight: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  btn: { width: '18.4%', aspectRatio: 1, borderRadius: 8, backgroundColor: C.wood2, borderWidth: 1.5, borderColor: C.goldDark, alignItems: 'center', paddingBottom: 2, paddingTop: 3, overflow: 'hidden' },
  btnDim: { opacity: 0.45 },
  btnDanger: { borderColor: '#8a2a20' },
  btnImg: { width: '88%', flex: 1, minHeight: 0, resizeMode: 'contain' },
  btnLbl: { color: C.text, fontFamily: F.body, fontSize: 10 },
  lock: { position: 'absolute', top: 2, right: 3, fontSize: 11 },
  badge: { position: 'absolute', top: 2, right: 2, backgroundColor: C.blue, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { color: '#fff', fontSize: 10, fontFamily: F.bodyB },
  pressed: { transform: [{ scale: 0.94 }], opacity: 0.85 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  placeImg: { width: 72, height: 60, resizeMode: 'contain' },
  placeBtns: { flexDirection: 'row', gap: 10, marginTop: 10 },
  bigBtn: { flex: 1, height: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  cancel: { backgroundColor: '#3a1a14', borderColor: '#8a2a20' },
  ok: { backgroundColor: '#1d3a1f', borderColor: C.green },
  bigTxt: { color: C.text, fontFamily: F.head, fontSize: 16 },
});
