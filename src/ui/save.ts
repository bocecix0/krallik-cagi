import AsyncStorage from '@react-native-async-storage/async-storage';
import { AGE_NAMES } from '../game/data';
import { CIVS } from '../game/civs';
import type { SaveData } from '../game/world';
import type { Controller } from './controller';

const KEY = 'krallik-cagi:save:v1';

export interface SaveSummary { civ: string; age: string; time: number; difficulty: string; savedAt: number }

/** Writes the current game to device storage (localStorage on web). Never throws. */
export async function saveGame(ctl: Controller) {
  if (ctl.w.winner) return clearSave();
  try {
    const data: SaveData = { ...ctl.w.toSave(), cam: { x: ctl.cam.x, y: ctl.cam.y, zoom: ctl.cam.zoom } };
    await AsyncStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage full / unavailable: skip silently
  }
}

export async function loadSave(): Promise<SaveData | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    return data.v === 1 ? data : null;
  } catch {
    return null;
  }
}

export async function clearSave() {
  try { await AsyncStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function summarize(d: SaveData): SaveSummary {
  const me = d.players[1];
  const diff = { easy: 'Kolay', normal: 'Normal', hard: 'Zor' }[d.opts.difficulty] ?? d.opts.difficulty;
  return { civ: CIVS[me.civ]?.name ?? '', age: AGE_NAMES[me.age] ?? '', time: d.time, difficulty: diff, savedAt: d.savedAt ?? 0 };
}
