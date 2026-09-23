import type { SkImage } from '@shopify/react-native-skia';
import { MANIFEST, type ManifestKey } from './manifest';
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
  unit_ram: { w: 70 }, unit_mangonel: { w: 66 }, unit_mangonel_atk: { w: 62 }, unit_monk_atk: { h: 42 },
  unit_villager_m: { h: 38 }, unit_villager_f: { h: 37 }, unit_villager_carry: { h: 39 },
  unit_militia: { h: 40 }, unit_manatarms: { h: 41 }, unit_spearman: { h: 48 }, unit_archer: { h: 40 },
  unit_skirmisher: { h: 40 }, unit_scout: { h: 50 }, unit_knight: { h: 56 }, unit_monk: { h: 40 },
  nat_tree_oak: { w: 84, oy: 10 }, nat_tree_oak2: { w: 74, oy: 10 }, nat_tree_pine: { h: 100, oy: 10 }, nat_tree_birch: { w: 70, oy: 10 },
  nat_berry_bush: { w: 46, oy: 6 }, nat_gold_mine: { w: 66, oy: 6 }, nat_stone_mine: { w: 66, oy: 6 },
  nat_sheep: { w: 34, oy: 4 }, nat_deer: { w: 42, oy: 4 }, nat_boar: { w: 40, oy: 4 }, nat_stump: { w: 30, oy: 6 }, nat_rock: { w: 40, oy: 4 },
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

/** Chooses the sprite for a unit, including 2-frame task/attack/walk animations. */
export function unitKey(e: Entity, w?: World): string {
  const a = e.anim ?? 0;
  if (e.type === 'villager') {
    const base = e.female ? 'unit_villager_f' : 'unit_villager_m';
    if (e.working) {
      const job = villagerJob(e, w);
      if (job) return pick2(`unit_${e.female ? 'vilf' : 'vil'}_${job}`, base, Math.sin(a * 2.2) > -0.3);
    }
    const moving = !!e.path?.length;
    if (e.carry && e.carry.amount >= 3 && moving) {
      if (e.female) return pick2('unit_vilf_walk', base, Math.sin(a * 1.4) > 0);
      const k = e.carry.type === 'wood' ? 'unit_villager_carry' : `unit_vil_carry_${e.carry.type}`;
      if (has(k)) return k;
    }
    if (moving && e.female) return pick2('unit_vilf_walk', base, Math.sin(a * 1.4) > 0);
    return base;
  }
  const base = `unit_${e.type}`;
  if (e.working && e.order?.kind === 'attack') {
    const reload = UNITS[e.type as UnitType]?.reload ?? 2;
    return pick2(`${base}_atk`, base, (e.attackCd ?? 0) > reload - 0.45);
  }
  return base;
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
  const s = SPEC[key] ?? { h: 40 };
  if (s.w) return { w: s.w, h: s.w / aspect, oy: s.oy ?? 0 };
  const h = s.h ?? 40;
  return { w: h * aspect, h, oy: s.oy ?? 0 };
}
