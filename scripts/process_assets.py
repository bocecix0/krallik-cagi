"""Processes assets/raw/*.png -> assets/game/*.png + terrain atlas + src/render/manifest.ts

- sprites: background removal (if no alpha), trim, downscale
- team color: *_red variants (blue hues -> red) for units and buildings
- terrain: seamless textures -> feathered isometric diamond atlas (4x4 variants per terrain) + fog cell
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "assets", "raw")
OUT = os.path.join(ROOT, "assets", "game")
os.makedirs(OUT, exist_ok=True)

# Write every output atomically (temp file + rename) so a running Metro bundler never sees half-written images.
_orig_save = Image.Image.save


def _atomic_save(self, fp, *args, **kwargs):
    if isinstance(fp, str) and os.path.dirname(os.path.abspath(fp)) == os.path.abspath(OUT):
        tmpdir = os.path.join(ROOT, ".gen", "tmp")
        os.makedirs(tmpdir, exist_ok=True)
        tmp = os.path.join(tmpdir, os.path.basename(fp))
        _orig_save(self, tmp, *args, **kwargs)
        _replace(tmp, fp)
        return None
    return _orig_save(self, fp, *args, **kwargs)


Image.Image.save = _atomic_save


def _replace(src, dst):
    """os.replace with retries: on Windows the bundler may hold the target open for a moment."""
    import time
    for i in range(40):
        try:
            os.replace(src, dst)
            return
        except PermissionError:
            time.sleep(0.05 * (i + 1))
    os.replace(src, dst)

TERRAINS = ["tex_water_deep", "tex_water", "tex_sand", "tex_dirt", "tex_grass2", "tex_grass", "tex_forest"]
TILE_W, TILE_H = 128, 64
MX, MY = 32, 16
CELL_W, CELL_H = TILE_W + 2 * MX, TILE_H + 2 * MY
TEX = 512  # texture covers 4x4 tiles

NO_RED = {"bld_farm", "bld_foundation", "bld_rubble"}
MAX_DIM = {"unit": 256, "nat": 320, "bld": 720, "icon": 160, "ui": 1400}


def remove_bg(im: Image.Image) -> Image.Image:
    """Flood-fill style removal of a flat background color sampled from the corners."""
    a = np.asarray(im.convert("RGB")).astype(np.int16)
    h, w, _ = a.shape
    corners = np.array([a[0, 0], a[0, -1], a[-1, 0], a[-1, -1]])
    bg = np.median(corners, axis=0)
    dist = np.abs(a - bg).sum(axis=2)
    mask = dist < 60
    # keep only background regions connected to the border
    from collections import deque
    seen = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if mask[y, x] and not seen[y, x]:
                seen[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if mask[y, x] and not seen[y, x]:
                seen[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True; q.append((ny, nx))
    alpha = np.where(seen, 0, 255).astype(np.uint8)
    out = im.convert("RGBA")
    out.putalpha(Image.fromarray(alpha))
    return out


def trim(im: Image.Image) -> Image.Image:
    a = np.asarray(im)[:, :, 3]
    ys, xs = np.where(a > 12)
    if len(xs) == 0:
        return im
    return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def to_red(im: Image.Image) -> Image.Image:
    arr = np.asarray(im).copy()
    rgb = arr[:, :, :3].astype(np.float32) / 255.0
    hsv = np.asarray(Image.fromarray(arr[:, :, :3]).convert("HSV")).astype(np.float32)
    hue = hsv[:, :, 0] * 360 / 255
    sat = hsv[:, :, 1] / 255
    val = hsv[:, :, 2] / 255
    sel = (hue > 195) & (hue < 265) & (sat > 0.28) & (val > 0.12)
    # blue -> red: new hue ~ 0-5 deg keeping sat/val
    hsv2 = hsv.copy()
    hsv2[:, :, 0] = np.where(sel, (hue - 225) * 0.3 % 360 * 255 / 360, hsv[:, :, 0])
    hsv2[:, :, 1] = np.where(sel, np.minimum(255, hsv[:, :, 1] * 1.05), hsv[:, :, 1])
    red = np.asarray(Image.fromarray(hsv2.astype(np.uint8), "HSV").convert("RGB"))
    out = arr.copy()
    out[:, :, :3] = np.where(sel[:, :, None], red, arr[:, :, :3])
    return Image.fromarray(out, "RGBA")


def fit(im: Image.Image, maxd: int) -> Image.Image:
    w, h = im.size
    s = min(1.0, maxd / max(w, h))
    if s < 1:
        im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    return im


def diamond_cell(tex: np.ndarray, vx: int, vy: int, feather: float) -> np.ndarray:
    ys, xs = np.mgrid[0:CELL_H, 0:CELL_W].astype(np.float32)
    a = (xs + 0.5 - CELL_W / 2) / (TILE_W / 2)
    b = (ys + 0.5 - MY) / (TILE_H / 2)
    u = (b + a) / 2
    v = (b - a) / 2
    d = np.maximum.reduce([-u, u - 1, -v, v - 1, np.zeros_like(u)])
    alpha = np.clip(1 - d / feather, 0, 1)
    alpha = alpha * alpha * (3 - 2 * alpha)
    per = TEX // 4
    tx = (((vx + u) * per) % TEX).astype(np.int32)
    ty = (((vy + v) * per) % TEX).astype(np.int32)
    rgb = tex[ty, tx]
    return np.dstack([rgb, (alpha * 255).astype(np.uint8)])


def fog_cell() -> np.ndarray:
    """Black diamond whose alpha fades from the centre outward (drawn enlarged so neighbours blend)."""
    ys, xs = np.mgrid[0:CELL_H, 0:CELL_W].astype(np.float32)
    a = (xs + 0.5 - CELL_W / 2) / (TILE_W / 2)
    b = (ys + 0.5 - MY) / (TILE_H / 2)
    u = (b + a) / 2 - 0.5
    v = (b - a) / 2 - 0.5
    d = np.maximum(np.abs(u), np.abs(v)) * 2  # 0 centre, 1 tile edge
    alpha = np.clip((1.25 - d) / 0.75, 0, 1)
    alpha = alpha * alpha * (3 - 2 * alpha)
    out = np.zeros((CELL_H, CELL_W, 4), np.uint8)
    out[:, :, 3] = (alpha * 255).astype(np.uint8)
    return out


def build_atlas():
    atlas = np.zeros((CELL_H * (len(TERRAINS) + 1), CELL_W * 16, 4), np.uint8)
    for t, name in enumerate(TERRAINS):
        p = os.path.join(RAW, name + ".png")
        if not os.path.exists(p):
            fallback = {"tex_water_deep": "tex_water", "tex_forest": "tex_grass"}.get(name, "tex_grass")
            p = os.path.join(RAW, fallback + ".png")
            print("atlas: missing", name, "-> using", fallback)
        im = Image.open(p).convert("RGB").resize((TEX, TEX), Image.LANCZOS)
        tex = np.asarray(im)
        if name == "tex_water_deep" and not os.path.exists(os.path.join(RAW, name + ".png")):
            tex = (tex * np.array([0.55, 0.65, 0.85])).astype(np.uint8)
        if name == "tex_forest" and not os.path.exists(os.path.join(RAW, name + ".png")):
            tex = (tex * np.array([0.7, 0.8, 0.65])).astype(np.uint8)
        feather = 0.3 if name.startswith("tex_water") else 0.26
        for v in range(16):
            atlas[t * CELL_H:(t + 1) * CELL_H, v * CELL_W:(v + 1) * CELL_W] = diamond_cell(tex, v % 4, v // 4, feather)
    # fog cell: black feathered diamond
    atlas[len(TERRAINS) * CELL_H:, 0:CELL_W] = fog_cell()
    Image.fromarray(atlas, "RGBA").save(os.path.join(OUT, "terrain_atlas.webp"), quality=92, method=4)


def main():
    manifest = {}
    for f in sorted(os.listdir(RAW)):
        if not f.endswith(".png"):
            continue
        key = f[:-4]
        if key.startswith("tex_") or key.startswith("sheet_"):
            continue
        im = Image.open(os.path.join(RAW, f))
        is_art = key.startswith("ui_menu_bg") or key.startswith("ui_loading")
        if im.mode != "RGBA" or np.asarray(im.convert("RGBA"))[:, :, 3].min() > 250:
            if not is_art:
                im = remove_bg(im)
        im = im.convert("RGBA")
        if not is_art:
            im = trim(im)
        prefix = key.split("_")[0]
        im = fit(im, MAX_DIM.get(prefix, 512))
        if is_art:
            im = im.convert("RGB")
            im.save(os.path.join(OUT, key + ".jpg"), quality=86)
            manifest[key] = {"file": key + ".jpg", "w": im.size[0], "h": im.size[1]}
            continue
        im.save(os.path.join(OUT, key + ".webp"), quality=90, method=4)
        manifest[key] = {"file": key + ".webp", "w": im.size[0], "h": im.size[1]}
        if (prefix in ("unit", "bld")) and key not in NO_RED:
            to_red(im).save(os.path.join(OUT, key + "_red.webp"), quality=90, method=4)
            manifest[key + "_red"] = {"file": key + "_red.webp", "w": im.size[0], "h": im.size[1]}
    import process_anims
    anims = process_anims.process(to_red)
    for name, m in anims.items():
        for i in range(m["n"]):
            k = f"anim_{name}_{i}"
            manifest[k] = {"file": k + ".webp", "w": m["w"], "h": m["h"]}
            manifest[k + "_red"] = {"file": k + "_red.webp", "w": m["w"], "h": m["h"]}
    build_atlas()
    manifest["terrain_atlas"] = {"file": "terrain_atlas.webp", "w": CELL_W * 16, "h": CELL_H * (len(TERRAINS) + 1)}

    base = [k for k in manifest if not k.endswith("_red") and k != "terrain_atlas"]
    lines = ["// AUTO-GENERATED by scripts/process_assets.py — do not edit", "/* eslint-disable */", ""]
    lines.append(f"export const ATLAS = {{ cellW: {CELL_W}, cellH: {CELL_H}, tileW: {TILE_W}, marginY: {MY} }};")
    lines.append("")
    lines.append("export const MANIFEST = {")
    for k in base:
        m = manifest[k]
        lines.append(f"  {k}: {{ w: {m['w']}, h: {m['h']} }},")
    lines.append("} as const;")
    lines.append("export type ManifestKey = keyof typeof MANIFEST;")
    lines.append("")
    lines.append("/** frame-registered animations: n frames of w x h px; fig = median figure height in px */")
    lines.append("export const ANIMS: Record<string, { n: number; w: number; h: number; fig: number }> = {")
    for name, m in anims.items():
        lines.append(f"  {name}: {{ n: {m['n']}, w: {m['w']}, h: {m['h']}, fig: {m['fig']} }},")
    lines.append("};")
    lines.append("")
    lines.append("export const SOURCES: Record<string, number> = {")
    for k, m in manifest.items():
        lines.append(f"  {k}: require('../../assets/game/{m['file']}'),")
    lines.append("};")
    mpath = os.path.join(ROOT, "src", "render", "manifest.ts")
    with open(mpath + ".tmp", "w", encoding="utf-8") as fh:
        fh.write(chr(10).join(lines) + chr(10))
    _replace(mpath + ".tmp", mpath)
    print("processed", len(manifest), "assets")


if __name__ == "__main__":
    main()
