#!/usr/bin/env python3
"""Turn one logo image into every app icon + splash resource.
   usage:  python3 scripts/make-resources.py path/to/logo.png   (needs: pip install pillow)
   Writes mobile/resources/{logo,icon-only,icon-foreground,icon-background,splash,splash-dark}.png
   Built for a square, full-bleed artwork (1024x1024+)."""
import sys, pathlib
from PIL import Image, ImageDraw, ImageFilter

src = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path(__file__).parent.parent / '../assets/img/logo.png')
out = pathlib.Path(__file__).parent.parent / 'resources'
out.mkdir(exist_ok=True)
logo = Image.open(src).convert('RGBA')

def canvas(size, scale, bg):
    c = Image.new('RGBA', (size, size), bg)
    s = int(size * scale)
    l = logo.resize((s, s), Image.LANCZOS)
    c.alpha_composite(l, ((size - s) // 2, (size - s) // 2))
    return c

BLACK = (0, 0, 0, 255)

def rounded(img, frac=0.22):
    m = Image.new('L', img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, *img.size), radius=int(img.size[0] * frac), fill=255)
    r = img.copy(); r.putalpha(m); return r

# Full-bleed artwork (opaque, fills the square): the icon should be the art itself, not a small logo on black.
full = logo.convert('RGB').resize((1024, 1024), Image.LANCZOS).convert('RGBA')
tile = rounded(full)
tile.save(out / 'logo.png')                      # in-app splash logo (rounded)
full.save(out / 'icon-only.png')                 # legacy launcher icon: the art, edge to edge
# Adaptive icon: Android crops the outer third, so the whole picture sits inside the safe zone
# and a blurred, darkened copy of it fills the rest instead of flat black.
bg = full.filter(ImageFilter.GaussianBlur(28)); bg = Image.blend(bg, Image.new('RGBA', bg.size, BLACK), .35)
bg.save(out / 'icon-background.png')
fg = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0)); s = int(1024 * 0.66)
fg.alpha_composite(rounded(full.resize((s, s), Image.LANCZOS), .12), ((1024 - s) // 2, (1024 - s) // 2))
fg.save(out / 'icon-foreground.png')
# Splash: plain black (no logo). The app icon stays icon-only.
sp = Image.new('RGBA', (2732, 2732), BLACK)
sp.save(out / 'splash.png'); sp.save(out / 'splash-dark.png')
print('resources written to', out)
