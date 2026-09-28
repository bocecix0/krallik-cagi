"""Slices GPT-generated animation strips (assets/raw/sheet_*.png) into registered frames.

Each strip holds N frames of the same character side by side. We split on empty columns, find each
frame's foot anchor (bottom row + centroid of the lower body) and paste every frame onto a shared
canvas with the anchor at the bottom-centre, so the character never jumps between frames.
Output: assets/game/anim_<name>_<i>.webp (+ _red team variant) and metadata for the manifest.
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "assets", "raw")
OUT = os.path.join(ROOT, "assets", "game")
MAX_H = 300  # canvas height cap in px (sprites are ~40 world px tall; leaves headroom for zoom * dpr)


def split_frames(a: np.ndarray, want: int = 4):
    """Return [x0, x1) column ranges of the frames, using empty-column gaps; falls back to equal cells."""
    occ = (a > 24).sum(axis=0) > 0
    segs, start = [], None
    for x, v in enumerate(occ):
        if v and start is None:
            start = x
        elif not v and start is not None:
            segs.append([start, x]); start = None
    if start is not None:
        segs.append([start, len(occ)])
    # merge specks / tiny detached bits into the nearest neighbour
    w = a.shape[1]
    segs = [s for s in segs if s[1] - s[0] > 2]
    while len(segs) > want:
        widths = [s[1] - s[0] for s in segs]
        i = int(np.argmin(widths))
        if i == 0: j = 1
        elif i == len(segs) - 1: j = i - 1
        else: j = i - 1 if segs[i][0] - segs[i - 1][1] < segs[i + 1][0] - segs[i][1] else i + 1
        lo, hi = min(i, j), max(i, j)
        segs[lo] = [segs[lo][0], segs[hi][1]]
        del segs[hi]
    if len(segs) != want:
        cell = w / want
        segs = [[int(i * cell), int((i + 1) * cell)] for i in range(want)]
    return segs


def anchor_of(alpha: np.ndarray):
    """(ax, ay) = foot point: bottom-most opaque row, x = centroid of the lower 22% of the figure."""
    ys, xs = np.where(alpha > 24)
    top, bottom = ys.min(), ys.max()
    h = bottom - top + 1
    low = ys >= bottom - max(4, int(h * 0.22))
    ax = float(xs[low].mean())
    return ax, float(bottom), int(top), int(xs.min()), int(xs.max())


def process(to_red, want=4):
    meta = {}
    for f in sorted(os.listdir(RAW)):
        if not (f.startswith("sheet_") and f.endswith(".png")):
            continue
        name = f[len("sheet_"):-4]
        im = Image.open(os.path.join(RAW, f)).convert("RGBA")
        arr = np.asarray(im)
        segs = split_frames(arr[:, :, 3], want)
        frames = []
        for x0, x1 in segs:
            sub = arr[:, x0:x1]
            ax, ay, top, left, right = anchor_of(sub[:, :, 3])
            frames.append((sub, ax, ay, top, left, right))
        # shared canvas: widest reach left/right of the anchor, tallest figure above it
        reach = max(max(ax - left, right - ax) for _, ax, _, _, left, right in frames)
        tall = max(ay - top for _, _, ay, top, _, _ in frames)
        cw, ch = int(np.ceil(reach * 2)) + 6, int(np.ceil(tall)) + 6
        heights = sorted(ay - top for _, _, ay, top, _, _ in frames)
        scale = min(1.0, MAX_H / ch)
        out_w, out_h = max(1, round(cw * scale)), max(1, round(ch * scale))
        for i, (sub, ax, ay, top, left, right) in enumerate(frames):
            canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
            piece = Image.fromarray(sub, "RGBA")
            canvas.alpha_composite(piece, (int(round(cw / 2 - ax)), int(round(ch - 3 - ay))))
            canvas = canvas.resize((out_w, out_h), Image.LANCZOS)
            key = f"anim_{name}_{i}"
            canvas.save(os.path.join(OUT, key + ".webp"), quality=90, method=4)
            to_red(canvas).save(os.path.join(OUT, key + "_red.webp"), quality=90, method=4)
        meta[name] = {"n": len(frames), "w": out_w, "h": out_h, "fig": round(heights[len(heights) // 2] * scale, 1)}
        print(f"anim {name}: {len(frames)} frames, canvas {out_w}x{out_h}")
    return meta
