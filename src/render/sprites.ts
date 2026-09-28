import type { SkImage } from '@shopify/react-native-skia';
import { ANIMS, MANIFEST, type ManifestKey } from './manifest';
import { UNITS } from '../game/data';
import type { Entity, UnitType } from '../game/types';
import type { World } from '../game/world';

/**
 * How big a sprite is drawn in world pixels (tile = 64x32).
 * `h` = target height, or `w` = target width. `oy` = extra downward offset of the anchor in world px.
 */
interface SpriteSpec { h?: number; w?: number; oy?: number }

export const SPEC: Record<string, SpriteSpec> = {
  // task poses (2-frame animations alternate these with the base sprite)
  unit_vil_lumberjack: { h: 41 }, unit_vil_miner: { h: 39 }, unit_vil_builder: { h: 33 }, unit_vil_farmer: { h: 38 },
  unit_vil_hunter: { h: 38 }, unit_vil_carry_gold: { h: 39 }, unit_vil_carry_stone: { h: 38 }, unit_vil_carry_food: { h: 38 },
  unit_vilf_forager: { h: 33 }, unit_vilf_farmer: { h: 36 }, unit_vilf_builder: { h: 35 }, unit_vilf_lumberjack: { h: 39 },
  unit_vilf_miner: { h: 38 }, unit_vilf_walk: { h: 37 },
  unit_militia_atk: { h: 41 }, unit_manatarms_atk: { h: 44 }, unit_spearman_atk: { h: 42 }, unit_archer_atk: { h: 40 },
  unit_skirmisher_atk: { h: 41 }, unit_knight_atk: { h: 58 }, unit_scout_atk: { h: 51 },
  unit_janissary: { h: 41 }, unit_janissary_atk: { h: 41 }, unit_cataphract: { h: 54 }, unit_cataphract_atk: { h: 55 },
  unit_paladin: { h: 58 }, unit_paladin_atk: { h: 60 }, unit_mangudai: { h: 50 }, unit_mangudai_atk: { h: 51 },
  unit_ram: { w: 54 }, unit_mangonel: { w: 50 }, unit_mangonel_atk: { w: 48 }, unit_monk_atk: { h: 42 },
  unit_villager_m: { h: 38 }, unit_villager_f: { h: 37 }, unit_villager_carry: { h: 39 },
  unit_militia: { h: 40 }, unit_manatarms: { h: 41 }, unit_spearman: { h: 48 }, unit_archer: { h: 40 },
  unit_skirmisher: { h: 40 }, unit_scout: { h: 50 }, unit_knight: { h: 56 }, unit_monk: { h: 40 },
  nat_tree_oak: { w: 76, oy: 9 }, nat_tree_oak2: { w: 68, oy: 9 }, nat_tree_pine: { h: 92, oy: 9 }, nat_tree_birch: { w: 64, oy: 9 },
  nat_berry_bush: { w: 40, oy: 6 }, nat_gold_mine: { w: 56, oy: 7 }, nat_stone_mine: { w: 56, oy: 7 },
  nat_sheep: { w: 25, oy: 4 }, nat_deer: { w: 32, oy: 4 }, nat_boar: { w: 30, oy: 4 }, nat_stump: { w: 26, oy: 6 }, nat_rock: { w: 36, oy: 4 },
};

export type Images = Partial<Record<string, SkImage>>;

const has = (k: string) => k in MANIFEST;
const pick2 = (pose: string, base: string, phase: boolean) => (phase && has(pose) ? pose : base);

function villagerJob(e: Entity, w?: World): string {
  const o = e.order;
  if (o?.kind === 'build') return 'builder';
  if (o?.kind !== 'gather' || !w) return '';
  const t = w.get(o.target);
  if (!t) return '';
  if (t.kind === 'building') return 'farmer';
  if (t.type.startsWith('tree')) return 'lumberjack';
  if (t.type === 'gold' || t.type === 'stone') return 'miner';
  if (t.type === 'berry') return e.female ? 'forager' : 'farmer';
  return e.female ? 'forager' : 'hunter';
}

/** Picks a directional variant: back view (`_ne`) when facing up the screen, plus an optional walk frame. */
function directional(base: string, back: boolean, walkPhase: boolean | null): string {
  if (back) {
    const ne = base + '_ne';
    if (!has(ne)) return base;
    if (walkPhase && has(ne + '_walk')) return ne + '_walk';
    return ne;
  }
  if (walkPhase && has(base + '_walk')) return base + '_walk';
  return base;
}

/**
 * Chooses the sprite for a unit: 4 isometric facings (front/back x mirror), 2-frame walk cycle,
 * task poses for villagers and a strike frame for soldiers.
 */
export function unitKey(e: Entity, w?: World): string {
  const a = e.anim ?? 0;
  const moving = !!e.path?.length;
  const step = moving ? Math.sin(a * 1.4) > 0 : null;
  if (e.type === 'villager') {
    const base = e.female ? 'unit_villager_f' : 'unit_villager_m';
    if (e.working) {
      const job = villagerJob(e, w);
      if (job) return pick2(`unit_${e.female ? 'vilf' : 'vil'}_${job}`, base, Math.sin(a * 2.2) > -0.3);
    }
    if (moving && !e.back && e.carry && e.carry.amount >= 3 && !e.female) {
      // loaded villagers walking toward the camera show what they carry
      const k = e.carry.type === 'wood' ? 'unit_villager_carry' : `unit_vil_carry_${e.carry.type}`;
      if (has(k)) return step ? k : directional(base, false, true);
    }
    if (moving && !e.back && e.female) return pick2('unit_vilf_walk', base, !!step);
    return directional(base, !!e.back, step);
  }
  const base = `unit_${e.type}`;
  if (e.working && e.order?.kind === 'attack') {
    const reload = UNITS[e.type as UnitType]?.reload ?? 2;
    if ((e.attackCd ?? 0) > reload - 0.45 && has(`${base}_atk`)) return `${base}_atk`;
    return directional(base, !!e.back, null);
  }
  return directional(base, !!e.back, step);
}

/** on-screen height (world px) of the median frame of each villager animation */
const ANIM_H: Record<string, number> = {
  vil_m_walk: 38, vil_m_walkback: 38, vil_m_chop: 40, vil_m_mine: 40, vil_m_build: 31, vil_m_farm: 37, vil_m_carrywood: 41, vil_m_carrysack: 40,
  vil_f_walk: 37, vil_f_walkback: 37, vil_f_chop: 39, vil_f_mine: 39, vil_f_build: 36, vil_f_farm: 35, vil_f_forage: 36, vil_f_carry: 37,
};
/** frame index at which the tool hits (for synced strike sounds) */
export const STRIKE: Record<string, { frame: number; sound: string }> = {
  chop: { frame: 2, sound: 'chop' }, mine: { frame: 2, sound: 'mine' }, build: { frame: 2, sound: 'hammer' },
};

export interface AnimFrame { key: string; name: string; action: string; frame: number; w: number; h: number; top: number }

/**
 * Frame-registered villager animations (4-frame strips): walk / walk-back, chop, mine, build, farm, forage, carry.
 * Returns null when the strip is missing so the renderer can fall back to static sprites.
 */
export function villagerAnim(e: Entity, w?: World): AnimFrame | null {
  const g = e.female ? 'f' : 'm';
  const a = e.anim ?? 0;
  let action: string;
  let frame: number;
  if (e.working) {
    const job = villagerJob(e, w);
    action = job === 'lumberjack' ? 'chop' : job === 'miner' ? 'mine' : job === 'builder' ? 'build'
      : job === 'forager' ? (e.female ? 'forage' : 'farm') : job === 'hunter' ? 'chop' : 'farm';
    frame = Math.floor(a * 1.25);
  } else if (e.path?.length) {
    if (e.back) action = 'walkback';
    else if (e.carry && e.carry.amount >= 3) action = e.female ? 'carry' : e.carry.type === 'wood' ? 'carrywood' : 'carrysack';
    else action = 'walk';
    frame = Math.floor(a * 0.9);
  } else {
    action = e.back ? 'walkback' : 'walk';
    frame = 1; // the "passing" frame doubles as a neutral stance
  }
  const name = `vil_${g}_${action}`;
  const A = ANIMS[name];
  if (!A) return null;
  const k = (ANIM_H[name] ?? 38) / A.fig;
  const f = ((frame % A.n) + A.n) % A.n;
  return { key: `anim_${name}_${f}`, name, action, frame: f, w: A.w * k, h: A.h * k, top: ANIM_H[name] ?? 38 };
}

export function nodeKey(type: string): string {
  switch (type) {
    case 'berry': return 'nat_berry_bush';
    case 'gold': return 'nat_gold_mine';
    case 'stone': return 'nat_stone_mine';
    default: return `nat_${type}`;
  }
}

export function buildingKey(type: string): string {
  return `bld_${type}`;
}

/** Returns draw size in world px for a manifest sprite (buildings sized by footprint). */
export function spriteSize(key: string, footprint?: number) {
  const m = (MANIFEST as Record<string, { w: number; h: number }>)[key];
  if (!m) return { w: 32, h: 32, oy: 0 };
  const aspect = m.w / m.h;
  if (footprint) {
    const w = footprint * 64 * (footprint === 1 ? 1.15 : 1.06);
    return { w, h: w / aspect, oy: footprint * 1.5 };
  }
  const s = SPEC[key] ?? SPEC[key.replace(/_(ne_walk|ne|walk)$/, '')] ?? { h: 40 };
  if (s.w) return { w: s.w, h: s.w / aspect, oy: s.oy ?? 0 };
  const h = s.h ?? 40;
  return { w: h * aspect, h, oy: s.oy ?? 0 };
}
