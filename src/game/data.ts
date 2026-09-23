import type { Age, BuildingType, Cost, Res, ResourceNodeType, TechId, UnitType } from './types';

/** Global time multiplier (AoE2 "Normal" speed is 1.7x). */
export const GAME_SPEED = 1.5;
export const MAP_SIZE = 48;
export const MAX_POP = 100;

export const AGE_NAMES = ['Karanlık Çağ', 'Feodal Çağ', 'Kale Çağı', 'İmparatorluk Çağı'];

export interface UnitDef {
  name: string;
  cost: Cost;
  time: number;
  hp: number;
  attack: number;
  melee: number; // melee armor
  pierce: number; // pierce armor
  range: number; // tiles, 0 = melee (adjacent)
  reload: number;
  speed: number; // tiles / sec
  los: number;
  age: Age;
  from: BuildingType;
  cls: 'villager' | 'infantry' | 'archer' | 'cavalry' | 'monk' | 'siege';
  bonus?: Partial<Record<'infantry' | 'archer' | 'cavalry' | 'building' | 'villager' | 'monk' | 'siege', number>>;
  splash?: number;
  buildingsOnly?: boolean;
  desc: string;
}

export const UNITS: Record<UnitType, UnitDef> = {
  villager: { name: 'Köylü', cost: { food: 50 }, time: 25, hp: 25, attack: 3, melee: 0, pierce: 0, range: 0, reload: 2, speed: 0.8, los: 4, age: 0, from: 'town_center', cls: 'villager', bonus: { building: 3 }, desc: 'Kaynak toplar, bina inşa eder.' },
  militia: { name: 'Milis', cost: { food: 60, gold: 20 }, time: 21, hp: 40, attack: 4, melee: 0, pierce: 1, range: 0, reload: 2, speed: 0.9, los: 4, age: 0, from: 'barracks', cls: 'infantry', desc: 'Temel piyade.' },
  manatarms: { name: 'Zırhlı Piyade', cost: { food: 60, gold: 20 }, time: 21, hp: 45, attack: 6, melee: 0, pierce: 1, range: 0, reload: 2, speed: 0.9, los: 4, age: 1, from: 'barracks', cls: 'infantry', bonus: { building: 2 }, desc: 'Feodal çağ piyadesi. Okçulara karşı zayıf.' },
  spearman: { name: 'Mızrakçı', cost: { food: 35, wood: 25 }, time: 22, hp: 45, attack: 3, melee: 0, pierce: 0, range: 0, reload: 3, speed: 1.0, los: 4, age: 1, from: 'barracks', cls: 'infantry', bonus: { cavalry: 15 }, desc: 'Süvarilere karşı çok güçlü.' },
  archer: { name: 'Okçu', cost: { wood: 25, gold: 45 }, time: 35, hp: 30, attack: 4, melee: 0, pierce: 0, range: 4, reload: 2, speed: 0.96, los: 6, age: 1, from: 'archery_range', cls: 'archer', bonus: { infantry: 1 }, desc: 'Uzak menzilli. Piyadeye karşı etkili.' },
  skirmisher: { name: 'Avcı Er', cost: { food: 25, wood: 35 }, time: 22, hp: 30, attack: 2, melee: 0, pierce: 3, range: 4, reload: 3, speed: 0.96, los: 6, age: 1, from: 'archery_range', cls: 'archer', bonus: { archer: 3 }, desc: 'Okçu avcısı, ucuz.' },
  scout: { name: 'Keşif Süvarisi', cost: { food: 80 }, time: 30, hp: 45, attack: 3, melee: 0, pierce: 2, range: 0, reload: 2, speed: 1.55, los: 6, age: 0, from: 'stable', cls: 'cavalry', bonus: { monk: 6 }, desc: 'Hızlı keşif birimi.' },
  knight: { name: 'Şövalye', cost: { food: 60, gold: 75 }, time: 30, hp: 100, attack: 10, melee: 2, pierce: 2, range: 0, reload: 1.8, speed: 1.35, los: 4, age: 2, from: 'stable', cls: 'cavalry', desc: 'Ağır süvari. Çok güçlü.' },
  ram: { name: 'Koçbaşı', cost: { wood: 160, gold: 75 }, time: 36, hp: 175, attack: 2, melee: 0, pierce: 180, range: 0, reload: 5, speed: 0.5, los: 3, age: 2, from: 'siege_workshop', cls: 'siege', bonus: { building: 125 }, buildingsOnly: true, desc: 'Binaları yıkar. Oklara karşı neredeyse bağışık.' },
  mangonel: { name: 'Mancınık', cost: { wood: 160, gold: 135 }, time: 46, hp: 50, attack: 40, melee: 0, pierce: 6, range: 7, reload: 6, speed: 0.6, los: 9, age: 2, from: 'siege_workshop', cls: 'siege', bonus: { building: 35 }, splash: 1, desc: 'Alan hasarı veren taş atar. Toplu okçulara karşı etkili.' },
  monk: { name: 'Keşiş', cost: { gold: 100 }, time: 51, hp: 30, attack: 0, melee: 0, pierce: 0, range: 0, reload: 1, speed: 0.7, los: 11, age: 2, from: 'monastery', cls: 'monk', desc: 'Dost birimleri iyileştirir.' },
};

export interface BuildingDef {
  name: string;
  cost: Cost;
  time: number;
  hp: number;
  size: number;
  age: Age;
  pop?: number;
  drop?: Res[];
  trains?: UnitType[];
  techs?: TechId[];
  attack?: number;
  range?: number;
  los: number;
  melee: number;
  pierce: number;
  walkable?: boolean;
  desc: string;
  eco?: boolean;
}

const ALL: Res[] = ['food', 'wood', 'gold', 'stone'];

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  town_center: { name: 'Şehir Merkezi', cost: { wood: 275, stone: 100 }, time: 150, hp: 2400, size: 4, age: 2, pop: 5, drop: ALL, trains: ['villager'], techs: ['loom', 'wheelbarrow', 'hand_cart', 'feudal', 'castle_age', 'imperial'], attack: 5, range: 6, los: 8, melee: 3, pierce: 5, desc: 'Köylü üretir, tüm kaynakları kabul eder, çağ atlatır.', eco: true },
  house: { name: 'Ev', cost: { wood: 25 }, time: 25, hp: 550, size: 2, age: 0, pop: 5, los: 2, melee: 0, pierce: 7, desc: '+5 nüfus.', eco: true },
  lumber_camp: { name: 'Kereste Kampı', cost: { wood: 100 }, time: 35, hp: 600, size: 2, age: 0, drop: ['wood'], techs: ['double_bit_axe', 'bow_saw'], los: 4, melee: 0, pierce: 7, desc: 'Odun bırakma noktası.', eco: true },
  mill: { name: 'Değirmen', cost: { wood: 100 }, time: 35, hp: 600, size: 2, age: 0, drop: ['food'], techs: ['horse_collar'], los: 4, melee: 0, pierce: 7, desc: 'Yiyecek bırakma noktası.', eco: true },
  mining_camp: { name: 'Maden Kampı', cost: { wood: 100 }, time: 35, hp: 600, size: 2, age: 0, drop: ['gold', 'stone'], techs: ['gold_mining', 'stone_mining'], los: 4, melee: 0, pierce: 7, desc: 'Altın ve taş bırakma noktası.', eco: true },
  farm: { name: 'Tarla', cost: { wood: 60 }, time: 15, hp: 480, size: 3, age: 0, los: 1, melee: 0, pierce: 0, walkable: true, desc: 'Sonsuz olmayan yiyecek kaynağı (175).', eco: true },
  barracks: { name: 'Kışla', cost: { wood: 175 }, time: 50, hp: 1200, size: 3, age: 0, trains: ['militia', 'manatarms', 'spearman'], techs: ['man_at_arms', 'long_swordsman', 'champion', 'pikeman'], los: 5, melee: 0, pierce: 7, desc: 'Piyade eğitir.' },
  archery_range: { name: 'Okçuluk Alanı', cost: { wood: 175 }, time: 50, hp: 1200, size: 3, age: 1, trains: ['archer', 'skirmisher'], techs: ['crossbowman', 'elite_skirmisher'], los: 5, melee: 0, pierce: 7, desc: 'Okçu eğitir.' },
  stable: { name: 'Ahır', cost: { wood: 175 }, time: 50, hp: 1200, size: 3, age: 1, trains: ['scout', 'knight'], techs: ['light_cavalry', 'cavalier'], los: 5, melee: 0, pierce: 7, desc: 'Süvari eğitir.' },
  blacksmith: { name: 'Demirci', cost: { wood: 150 }, time: 40, hp: 1200, size: 3, age: 1, techs: ['forging', 'fletching', 'scale_mail', 'padded_archer', 'iron_casting', 'bodkin_arrow', 'chain_mail'], los: 5, melee: 0, pierce: 7, desc: 'Saldırı ve zırh geliştirmeleri.' },
  market: { name: 'Pazar', cost: { wood: 175 }, time: 60, hp: 2100, size: 4, age: 1, los: 5, melee: 0, pierce: 7, desc: 'Kale Çağı gereksinimi.', eco: true },
  monastery: { name: 'Manastır', cost: { wood: 175 }, time: 40, hp: 2100, size: 3, age: 2, trains: ['monk'], los: 6, melee: 0, pierce: 7, desc: 'Keşiş eğitir.' },
  castle: { name: 'Kale', cost: { stone: 650 }, time: 200, hp: 4800, size: 4, age: 2, pop: 20, attack: 11, range: 8, los: 11, melee: 8, pierce: 11, desc: 'Güçlü savunma yapısı, ok atar.' },
  watch_tower: { name: 'Gözetleme Kulesi', cost: { wood: 25, stone: 125 }, time: 80, hp: 700, size: 1, age: 1, attack: 5, range: 7, los: 9, melee: 1, pierce: 7, desc: 'Yaklaşan düşmanlara ok atar.' },
  siege_workshop: { name: 'Kuşatma Atölyesi', cost: { wood: 200 }, time: 40, hp: 1500, size: 3, age: 2, trains: ['ram', 'mangonel'], los: 5, melee: 0, pierce: 7, desc: 'Koçbaşı ve mancınık üretir.' },
  palisade: { name: 'Çit Duvar', cost: { wood: 2 }, time: 5, hp: 250, size: 1, age: 0, los: 1, melee: 2, pierce: 5, desc: 'Ucuz ahşap duvar.' },
};

export const ECO_BUILDS: BuildingType[] = ['house', 'lumber_camp', 'mill', 'mining_camp', 'farm', 'market', 'town_center', 'palisade'];
export const MIL_BUILDS: BuildingType[] = ['barracks', 'archery_range', 'stable', 'blacksmith', 'siege_workshop', 'monastery', 'watch_tower', 'castle'];

export interface TechDef {
  name: string;
  cost: Cost;
  time: number;
  age: Age;
  desc: string;
  requires?: TechId;
  icon: string;
}

export const TECHS: Record<TechId, TechDef> = {
  loom: { name: 'Dokuma Tezgahı', cost: { gold: 50 }, time: 25, age: 0, desc: 'Köylü +15 can, +1/+2 zırh.', icon: 'icon_research' },
  wheelbarrow: { name: 'El Arabası', cost: { food: 175, wood: 50 }, time: 75, age: 1, desc: 'Köylü +%10 hız, +%25 taşıma.', icon: 'icon_research' },
  hand_cart: { name: 'Yük Arabası', cost: { food: 300, wood: 200 }, time: 55, age: 2, desc: 'Köylü +%10 hız, +%50 taşıma.', requires: 'wheelbarrow', icon: 'icon_research' },
  double_bit_axe: { name: 'Çift Ağızlı Balta', cost: { food: 100, wood: 50 }, time: 25, age: 1, desc: 'Odun toplama +%20.', icon: 'icon_wood' },
  bow_saw: { name: 'Yay Testere', cost: { food: 150, wood: 100 }, time: 50, age: 2, desc: 'Odun toplama +%20.', requires: 'double_bit_axe', icon: 'icon_wood' },
  horse_collar: { name: 'At Koşumu', cost: { food: 75, wood: 75 }, time: 20, age: 1, desc: 'Tarlalar +75 yiyecek.', icon: 'icon_food' },
  gold_mining: { name: 'Altın Madenciliği', cost: { food: 100, wood: 75 }, time: 30, age: 1, desc: 'Altın toplama +%15.', icon: 'icon_gold' },
  stone_mining: { name: 'Taş Madenciliği', cost: { food: 100, wood: 75 }, time: 30, age: 1, desc: 'Taş toplama +%15.', icon: 'icon_stone' },
  forging: { name: 'Dövme', cost: { food: 150 }, time: 50, age: 1, desc: 'Piyade ve süvari +1 saldırı.', icon: 'icon_sword' },
  fletching: { name: 'Tüy Ok', cost: { food: 100, gold: 50 }, time: 30, age: 1, desc: 'Okçular ve kuleler +1 saldırı, +1 menzil.', icon: 'icon_sword' },
  scale_mail: { name: 'Pullu Zırh', cost: { food: 100 }, time: 40, age: 1, desc: 'Piyade +1/+1 zırh.', icon: 'icon_research' },
  padded_archer: { name: 'Dolgulu Okçu Zırhı', cost: { food: 100 }, time: 40, age: 1, desc: 'Okçular +1/+1 zırh.', icon: 'icon_research' },
  man_at_arms: { name: 'Zırhlı Piyade', cost: { food: 100, gold: 40 }, time: 40, age: 1, desc: 'Milisleri Zırhlı Piyadeye yükseltir.', icon: 'icon_sword' },
  long_swordsman: { name: 'Uzun Kılıçlı', cost: { food: 200, gold: 65 }, time: 45, age: 2, desc: 'Zırhlı Piyade → Uzun Kılıçlı (+3 saldırı, +15 can).', requires: 'man_at_arms', icon: 'icon_sword' },
  champion: { name: 'Şampiyon', cost: { food: 750, gold: 350 }, time: 100, age: 3, desc: 'Uzun Kılıçlı → Şampiyon (+3 saldırı, +10 can, +1/+1 zırh).', requires: 'long_swordsman', icon: 'icon_sword' },
  pikeman: { name: 'Kargılı', cost: { food: 215, gold: 90 }, time: 45, age: 2, desc: 'Mızrakçı → Kargılı (+1 saldırı, +10 can, süvariye +7).', icon: 'icon_sword' },
  crossbowman: { name: 'Arbaletçi', cost: { food: 125, gold: 75 }, time: 35, age: 2, desc: 'Okçu → Arbaletçi (+1 saldırı, +1 menzil, +5 can).', icon: 'icon_sword' },
  elite_skirmisher: { name: 'Seçkin Avcı Er', cost: { wood: 230, gold: 130 }, time: 50, age: 2, desc: 'Avcı Er → Seçkin (+1 saldırı, +1 menzil, +5 can, +1 ok zırhı).', icon: 'icon_sword' },
  light_cavalry: { name: 'Hafif Süvari', cost: { food: 150, gold: 50 }, time: 45, age: 2, desc: 'Keşif Süvarisi → Hafif Süvari (+15 can, +3 saldırı).', icon: 'icon_sword' },
  cavalier: { name: 'Kavalye', cost: { food: 300, gold: 300 }, time: 100, age: 3, desc: 'Şövalye → Kavalye (+20 can, +2 saldırı).', icon: 'icon_sword' },
  iron_casting: { name: 'Demir Döküm', cost: { food: 220, gold: 120 }, time: 60, age: 2, desc: 'Piyade ve süvari +1 saldırı.', requires: 'forging', icon: 'icon_sword' },
  bodkin_arrow: { name: 'Delici Ok', cost: { food: 200, gold: 100 }, time: 35, age: 2, desc: 'Okçular ve kuleler +1 saldırı, +1 menzil.', requires: 'fletching', icon: 'icon_sword' },
  chain_mail: { name: 'Zincir Zırh', cost: { food: 200, gold: 100 }, time: 55, age: 2, desc: 'Piyade +1/+1 zırh.', requires: 'scale_mail', icon: 'icon_research' },
  feudal: { name: 'Feodal Çağa Geç', cost: { food: 500 }, time: 130, age: 0, desc: '2 Karanlık Çağ binası gerekir.', icon: 'icon_age2' },
  castle_age: { name: 'Kale Çağına Geç', cost: { food: 800, gold: 200 }, time: 160, age: 1, desc: '2 Feodal Çağ binası gerekir.', icon: 'icon_age3' },
  imperial: { name: 'İmparatorluk Çağına Geç', cost: { food: 1000, gold: 800 }, time: 190, age: 2, desc: '2 Kale Çağı binası gerekir.', icon: 'icon_age4' },
};

/** Unit-line upgrades: stat deltas applied per researched tech, plus the new display name. */
export interface Upgrade { units: UnitType[]; hp?: number; attack?: number; melee?: number; pierce?: number; range?: number; name?: string; bonusCav?: number }
export const UPGRADES: Partial<Record<TechId, Upgrade>> = {
  long_swordsman: { units: ['manatarms'], attack: 3, hp: 15, name: 'Uzun Kılıçlı' },
  champion: { units: ['manatarms'], attack: 3, hp: 10, melee: 1, pierce: 1, name: 'Şampiyon' },
  pikeman: { units: ['spearman'], attack: 1, hp: 10, bonusCav: 7, name: 'Kargılı' },
  crossbowman: { units: ['archer'], attack: 1, range: 1, hp: 5, name: 'Arbaletçi' },
  elite_skirmisher: { units: ['skirmisher'], attack: 1, range: 1, hp: 5, pierce: 1, name: 'Seçkin Avcı Er' },
  light_cavalry: { units: ['scout'], attack: 3, hp: 15, name: 'Hafif Süvari' },
  cavalier: { units: ['knight'], attack: 2, hp: 20, name: 'Kavalye' },
  iron_casting: { units: ['militia', 'manatarms', 'spearman', 'scout', 'knight'], attack: 1 },
  bodkin_arrow: { units: ['archer', 'skirmisher'], attack: 1, range: 1 },
  chain_mail: { units: ['militia', 'manatarms', 'spearman'], melee: 1, pierce: 1 },
};

/** Market: starting gold price for 100 units (buy +30% / sell -30% commission). */
export const MARKET_START = 100;

export const AGE_TECH: Partial<Record<TechId, Age>> = { feudal: 1, castle_age: 2, imperial: 3 };

/** Buildings that count toward the next age requirement, keyed by current age. */
export const AGE_REQ: Record<number, BuildingType[]> = {
  0: ['lumber_camp', 'mill', 'mining_camp', 'barracks'],
  1: ['archery_range', 'stable', 'blacksmith', 'market'],
  2: ['monastery', 'castle', 'siege_workshop', 'town_center'],
};

export interface NodeDef { name: string; res: Res; amount: number; rate: number; size: number; animal?: boolean }

export const NODES: Record<ResourceNodeType, NodeDef> = {
  tree_oak: { name: 'Ağaç', res: 'wood', amount: 100, rate: 0.39, size: 1 },
  tree_oak2: { name: 'Ağaç', res: 'wood', amount: 100, rate: 0.39, size: 1 },
  tree_pine: { name: 'Çam', res: 'wood', amount: 100, rate: 0.39, size: 1 },
  tree_birch: { name: 'Huş', res: 'wood', amount: 100, rate: 0.39, size: 1 },
  berry: { name: 'Böğürtlen Çalısı', res: 'food', amount: 125, rate: 0.31, size: 1 },
  gold: { name: 'Altın Madeni', res: 'gold', amount: 800, rate: 0.38, size: 1 },
  stone: { name: 'Taş Ocağı', res: 'stone', amount: 350, rate: 0.36, size: 1 },
  sheep: { name: 'Koyun', res: 'food', amount: 100, rate: 0.33, size: 1, animal: true },
  deer: { name: 'Geyik', res: 'food', amount: 140, rate: 0.41, size: 1, animal: true },
  boar: { name: 'Yaban Domuzu', res: 'food', amount: 340, rate: 0.41, size: 1, animal: true },
};

export const FARM_FOOD = 175;
export const FARM_RATE = 0.32;
export const CARRY = 10;
export const BUILD_RANGE = 1.3;

export const RES_NAMES: Record<Res, string> = { food: 'Yiyecek', wood: 'Odun', gold: 'Altın', stone: 'Taş' };

export function costText(c: Cost) {
  return (Object.keys(c) as Res[]).map((k) => `${c[k]} ${RES_NAMES[k]}`).join(' · ');
}
