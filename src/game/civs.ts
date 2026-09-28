import type { CivId, Cost, Res, ResourceNodeType, TechId, UnitType } from './types';

export interface CivDef {
  name: string;
  unique: UnitType;
  icon: string;
  tagline: string;
  bonuses: string[];
}

/** Four playable civilizations, AoE2-inspired: each gets a unique unit (trained at the Castle) and three bonuses. */
export const CIVS: Record<CivId, CivDef> = {
  turks: {
    name: 'Türkler', unique: 'janissary', icon: 'icon_civ_turks', tagline: 'Barut ve altın',
    bonuses: ['Altın toplama +%20', 'Yeniçeri +%25 can', 'Keşif süvarisi +2 görüş, Hafif Süvari bedava'],
  },
  byzantines: {
    name: 'Bizans', unique: 'cataphract', icon: 'icon_civ_byzantines', tagline: 'Savunma ve karşı birimler',
    bonuses: ['Binalar +%20 can', 'Mızrakçı ve Avcı Er %25 ucuz', 'İmparatorluk Çağı %33 ucuz'],
  },
  franks: {
    name: 'Franklar', unique: 'paladin', icon: 'icon_civ_franks', tagline: 'Ağır süvari',
    bonuses: ['Süvari +%20 can', 'At Koşumu bedava', 'Böğürtlen toplama +%15'],
  },
  mongols: {
    name: 'Moğollar', unique: 'mangudai', icon: 'icon_civ_mongols', tagline: 'Bozkır atlıları',
    bonuses: ['Avcılık +%40', 'Keşif süvarisi +2 görüş', 'Mangudai %25 hızlı atış'],
  },
};

export const CIV_IDS = Object.keys(CIVS) as CivId[];

/** technologies a civilization starts with for free */
export const CIV_FREE_TECHS: Partial<Record<CivId, TechId[]>> = { franks: ['horse_collar'] };

const scale = (c: Cost, m: number): Cost => {
  const out: Cost = {};
  (Object.keys(c) as Res[]).forEach((k) => { out[k] = Math.round((c[k] ?? 0) * m); });
  return out;
};

export function civUnitCost(civ: CivId, t: UnitType, base: Cost): Cost {
  if (civ === 'byzantines' && (t === 'spearman' || t === 'skirmisher')) return scale(base, 0.75);
  return base;
}

export function civTechCost(civ: CivId, t: TechId, base: Cost): Cost {
  if (civ === 'byzantines' && t === 'imperial') return scale(base, 0.67);
  if (civ === 'turks' && t === 'light_cavalry') return {};
  return base;
}

export function civGatherMul(civ: CivId, node: { type: ResourceNodeType | string; res: Res; animal?: boolean }): number {
  if (civ === 'turks' && node.res === 'gold') return 1.2;
  if (civ === 'franks' && node.type === 'berry') return 1.15;
  if (civ === 'mongols' && node.animal) return 1.4;
  return 1;
}

export function civUnitHpMul(civ: CivId, t: UnitType, cls: string): number {
  if (civ === 'turks' && t === 'janissary') return 1.25;
  if (civ === 'franks' && cls === 'cavalry') return 1.2;
  return 1;
}

export const civBuildingHpMul = (civ: CivId) => (civ === 'byzantines' ? 1.2 : 1);
export const civLosBonus = (civ: CivId, t: UnitType) => ((civ === 'turks' || civ === 'mongols') && t === 'scout' ? 2 : 0);
export const civReloadMul = (civ: CivId, t: UnitType) => (civ === 'mongols' && t === 'mangudai' ? 0.75 : 1);
