import { Skia, type SkFont, type SkImage } from '@shopify/react-native-skia';
import { Asset } from 'expo-asset';
import { SOURCES } from './manifest';
import type { Images } from './sprites';

async function loadData(mod: number) {
  const a = Asset.fromModule(mod);
  if (!a.localUri) await a.downloadAsync();
  return Skia.Data.fromURI(a.localUri ?? a.uri);
}

export interface Mask { w: number; h: number; data: Uint8Array }
export interface Loaded { images: Images; atlas: SkImage | undefined; font: SkFont | null }

/** Low-res alpha masks of sprites, used for pixel-accurate tap picking. */
export const MASKS: Record<string, Mask> = {};
const MASK_W = 64;

function buildMask(key: string, img: SkImage) {
  try {
    const px = img.readPixels();
    if (!px) return;
    const iw = img.width(), ih = img.height();
    const mw = MASK_W, mh = Math.max(1, Math.round((MASK_W * ih) / iw));
    const data = new Uint8Array(mw * mh);
    const isFloat = px instanceof Float32Array;
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
      const sx = Math.min(iw - 1, Math.floor(((x + 0.5) / mw) * iw)), sy = Math.min(ih - 1, Math.floor(((y + 0.5) / mh) * ih));
      const a = px[(sy * iw + sx) * 4 + 3];
      data[y * mw + x] = (isFloat ? a * 255 : a) > 40 ? 1 : 0;
    }
    MASKS[key] = { w: mw, h: mh, data };
  } catch {
    // picking falls back to bounding boxes
  }
}

let cache: Loaded | null = null;

/** Loads every sprite into Skia images (cached for the app lifetime). */
export async function loadAll(fontModule: number, onProgress?: (p: number) => void): Promise<Loaded> {
  if (cache) return cache;
  const keys = Object.keys(SOURCES);
  const images: Record<string, SkImage> = {};
  let done = 0;
  const queue = [...keys];
  const worker = async () => {
    while (queue.length) {
      const k = queue.shift()!;
      try {
        const data = await loadData(SOURCES[k]);
        const img = Skia.Image.MakeImageFromEncoded(data);
        if (img) {
          images[k] = img;
          if (k.startsWith('bld_') || k.startsWith('nat_')) buildMask(k, img);
        }
      } catch (e) {
        console.warn('asset failed', k, e);
      }
      done++;
      onProgress?.(done / (keys.length + 1));
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  let font: SkFont | null = null;
  try {
    const data = await loadData(fontModule);
    const tf = Skia.Typeface.MakeFreeTypeFaceFromData(data);
    if (tf) font = Skia.Font(tf, 13);
  } catch (e) {
    console.warn('font failed', e);
  }
  onProgress?.(1);
  const atlas = images.terrain_atlas;
  cache = { images: images as Images, atlas, font };
  return cache;
}
