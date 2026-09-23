import type { ImageSourcePropType } from 'react-native';
import { AGE_NAMES, BUILDINGS, ECO_BUILDS, MIL_BUILDS, NODES, RES_NAMES, TECHS, UNITS } from '../game/data';
import type { BuildingType, Cost, Entity, Res, ResourceNodeType, TechId, UnitType } from '../game/types';
import type { World } from '../game/world';
import { SOURCES } from '../render/manifest';
import type { Controller } from './controller';

export interface Btn {
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

export const unitIcon = (t: string) => SOURCES[`unit_${t}`] ?? SOURCES.unit_villager_m;
export const bldIcon = (t: string) => SOURCES[`bld_${t}`] ?? SOURCES.bld_house;
const nodeIcon = (t: string) => SOURCES[t === 'berry' ? 'nat_berry_bush' : t === 'gold' ? 'nat_gold_mine' : t === 'stone' ? 'nat_stone_mine' : `nat_${t}`];
export const techIcon = (t: TechId) => SOURCES[`tech_${t}`] ?? SOURCES[TECHS[t].icon] ?? SOURCES.icon_research;

export function entityName(e: Entity, w?: World) {
  if (e.kind === 'unit') return w ? w.unitName(e) : UNITS[e.type as UnitType].name;
  if (e.kind === 'building') return BUILDINGS[e.type as BuildingType].name;
  return NODES[e.type as ResourceNodeType].name;
}
export function entityIcon(e: Entity) {
  if (e.kind === 'unit') return e.type === 'villager' && e.female ? SOURCES.unit_villager_f : unitIcon(e.type);
  if (e.kind === 'building') return bldIcon(e.type);
  return nodeIcon(e.type);
}

export function taskLabel(e: Entity, w: World) {
  const o = e.order;
  if (e.garrisonedIn) return 'Sığındı';
  if (!o) return '';
  switch (o.kind) {
    case 'idle': return 'Boşta';
    case 'move': return 'Yürüyor';
    case 'attack': return 'Saldırıyor';
    case 'build': return 'İnşa ediyor';
    case 'return': return 'Kaynak taşıyor';
    case 'garrison': return 'Sığınıyor';
    case 'gather': { const t = w.get(o.target); const r = t?.resType as Res | undefined; return r ? `${RES_NAMES[r]} topluyor` : 'Topluyor'; }
  }
}

/** Builds the contextual command list for the current selection. */
export function buildButtons(ctl: Controller, tab: 'eco' | 'mil'): Btn[] {
  const w = ctl.w;
  const me = w.players[1];
  const sel = ctl.selected();
  const own = sel.filter((e) => e.owner === 1);
  const vills = own.filter((e) => e.type === 'villager');
  const units = own.filter((e) => e.kind === 'unit');
  const bld = sel.length === 1 && sel[0].kind === 'building' && sel[0].owner === 1 ? sel[0] : null;
  const out: Btn[] = [];

  if (vills.length) {
    for (const t of tab === 'eco' ? ECO_BUILDS : MIL_BUILDS) {
      const d = BUILDINGS[t];
      out.push({ key: t, icon: bldIcon(t), label: d.name, cost: d.cost, desc: d.desc, locked: d.age > me.age ? AGE_NAMES[d.age] : undefined, onPress: () => ctl.startPlacement(t) });
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
      out.push({ key: u, icon: unitIcon(u), label: ud.name, cost: ud.cost, desc: ud.desc, badge: queued ? String(queued) : undefined, locked: ud.age > me.age ? AGE_NAMES[ud.age] : undefined, onPress: () => w.train(bld, u) });
    }
    for (const t of d.techs ?? []) {
      const td = TECHS[t];
      if (me.techs.has(t)) continue;
      const isAge = t === 'feudal' || t === 'castle_age' || t === 'imperial';
      if (isAge && td.age !== me.age) continue;
      if (td.requires && !me.techs.has(td.requires)) continue;
      if ([...w.entities.values()].some((e) => e.owner === 1 && e.queue?.some((q) => q.id === t))) continue;
      const req = isAge ? ` (${w.ageReqCount(1)}/2 bina)` : '';
      out.push({ key: t, icon: techIcon(t), label: isAge ? 'Çağ Atla' : td.name, cost: td.cost, desc: td.desc + req, locked: td.age > me.age ? AGE_NAMES[td.age] : undefined, onPress: () => w.research(bld, t) });
    }
    if (bld.type === 'market') {
      for (const r of ['food', 'wood', 'stone'] as const) {
        const icon = SOURCES[`icon_${r}`];
        out.push({ key: 'buy_' + r, icon, label: `Al`, cost: { gold: w.buyPrice(r) }, desc: `100 ${RES_NAMES[r]} satın al.`, onPress: () => w.trade(1, r, true) });
        out.push({ key: 'sell_' + r, icon, label: `Sat +${w.sellPrice(r)}`, cost: { [r]: 100 }, desc: `100 ${RES_NAMES[r]} sat, ${w.sellPrice(r)} Altın kazan.`, onPress: () => w.trade(1, r, false) });
      }
    }
    if (w.garrisonCap(bld) > 0) {
      const inside = w.garrisoned(bld).length;
      if (bld.type === 'town_center') out.push({ key: 'bell', icon: SOURCES.icon_pop, label: 'Alarm', desc: `Alarm Çanı: yakındaki köylüler sığınır, her biri +1 ok atar (${inside}/${w.garrisonCap(bld)}).`, onPress: () => w.ringBell(1, bld) });
      if (inside) out.push({ key: 'ungarrison', icon: unitIcon('villager'), label: 'Çıkar', badge: String(inside), desc: 'Sığınan birimleri dışarı çıkar.', onPress: () => w.ungarrison(bld) });
    }
  }
  if (!sel.length) {
    // quick actions: the most common economy commands without hunting for units on the map
    const tc = ctl.townCenter();
    if (tc) {
      const q = tc.queue?.filter((x) => x.id === 'villager').length ?? 0;
      out.push({ key: 'q_vil', icon: unitIcon('villager'), label: 'Köylü', cost: UNITS.villager.cost, desc: 'Şehir Merkezinde köylü üret.', badge: q ? String(q) : undefined, onPress: () => w.train(tc, 'villager') });
    }
    const next = (['feudal', 'castle_age', 'imperial'] as TechId[])[me.age];
    if (tc && next && w.techAvailable(1, next)) {
      const td = TECHS[next];
      out.push({ key: 'q_age', icon: techIcon(next), label: 'Çağ Atla', cost: td.cost, desc: `${td.name}. ${td.desc} (${w.ageReqCount(1)}/2)`, onPress: () => w.research(tc, next) });
    }
    for (const t of ['house', 'farm', 'lumber_camp', 'mining_camp', 'mill', 'barracks'] as BuildingType[]) {
      const d = BUILDINGS[t];
      out.push({ key: 'q_' + t, icon: bldIcon(t), label: d.name, cost: d.cost, desc: d.desc + ' (en yakın köylü inşa eder)', onPress: () => ctl.quickBuild(t) });
    }
  }
  if (units.length) out.push({ key: 'stop', icon: SOURCES.icon_sword, label: 'Dur', desc: 'Birimleri durdur.', onPress: () => ctl.stop() });
  if (own.length && !(bld && bld.type === 'town_center')) out.push({ key: 'del', icon: SOURCES.bld_rubble, label: 'Sil', desc: 'Seçileni yok et (iki kez dokun).', danger: true, onPress: () => ctl.deleteSelected() });
  return out;
}
