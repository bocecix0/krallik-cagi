"""Contact sheet per codex image session folder (mtime order) to verify batch mapping."""
import os, sys, glob
from PIL import Image, ImageDraw
GEN = os.path.expanduser("~/.codex/generated_images")
out_dir = sys.argv[1]
folders = sys.argv[2:]
for f in folders:
    files = sorted(glob.glob(os.path.join(GEN, f, "*.png")), key=os.path.getmtime)
    n = len(files); cols = 6; rows = (n + cols - 1) // cols
    sheet = Image.new("RGB", (cols * 200, rows * 200), (70, 100, 60))
    d = ImageDraw.Draw(sheet)
    for i, p in enumerate(files):
        im = Image.open(p).convert("RGBA"); im.thumbnail((190, 190))
        sheet.paste(im, ((i % cols) * 200 + 5, (i // cols) * 200 + 5), im)
        d.text(((i % cols) * 200 + 6, (i // cols) * 200 + 4), str(i), fill=(255, 255, 0))
    sheet.save(os.path.join(out_dir, f"sheet_{f[-6:]}.png"))
    print(f, n)
