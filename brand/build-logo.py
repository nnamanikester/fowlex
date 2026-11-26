"""Build the Fowlex logo set from the chosen Recraft concepts.

Usage: python build.py <concepts_dir> <out_dir> [wordmark_face_index]
"""
import os
import re
import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTCollection
from svgpathtools import parse_path

CONCEPTS, OUT = sys.argv[1], sys.argv[2]
FACE = int(sys.argv[3]) if len(sys.argv) > 3 else 0

RED = "#BA2234"
CHARCOAL = "#0E212A"
CREAM = "#FBF6EE"
WHITE = "#FFFFFF"


def load_mark(name):
    """Return ([(d, role)], bbox) with the background dropped; role is 'red' or 'dark'."""
    s = open(os.path.join(CONCEPTS, name)).read()
    parts, box = [], [1e9, -1e9, 1e9, -1e9]
    for m in re.finditer(r"<path([^>]*)>", s):
        a = m.group(1)
        d = re.search(r'\sd="([^"]*)"', a).group(1)
        r, g, b = map(int, re.search(r'fill="rgb\((\d+),(\d+),(\d+)\)"', a).groups())
        if min(r, g, b) > 240:
            continue  # white background
        role = "red" if r > 120 and g < 80 else "dark"
        xmin, xmax, ymin, ymax = parse_path(d).bbox()
        box = [min(box[0], xmin), max(box[1], xmax), min(box[2], ymin), max(box[3], ymax)]
        parts.append((d, role))
    return parts, box


def wordmark(text, tracking=0.14):
    """Outline `text` in Futura. Returns (path_d, width, cap_height) in font units, baseline y=0, y down."""
    font = TTCollection("/System/Library/Fonts/Supplemental/Futura.ttc").fonts[FACE]
    gs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font["hmtx"]
    upm, cap = font["head"].unitsPerEm, font["OS/2"].sCapHeight
    pen = SVGPathPen(gs)
    x, last_right = 0, 0
    for i, ch in enumerate(text):
        gname = cmap[ord(ch)]
        gs[gname].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))
        bp = BoundsPen(gs)
        gs[gname].draw(bp)
        last_right = x + bp.bounds[2]
        x += hmtx[gname][0] + (tracking * upm if i < len(text) - 1 else 0)
    # left edge of the first glyph, so the wordmark sits flush
    bp = BoundsPen(gs)
    gs[cmap[ord(text[0])]].draw(bp)
    left = bp.bounds[0]
    return pen.getCommands(), left, last_right, cap


def colors(variant):
    """Map roles -> fill for each colour variant; also returns background or None."""
    return {
        "color": ({"red": RED, "dark": CHARCOAL, "word": CHARCOAL}, None),
        "reverse": ({"red": RED, "dark": CREAM, "word": CREAM}, CHARCOAL),
        "mono-dark": ({"red": CHARCOAL, "dark": CHARCOAL, "word": CHARCOAL}, None),
        "mono-white": ({"red": WHITE, "dark": WHITE, "word": WHITE}, CHARCOAL),
    }[variant]


def mark_group(parts, box, fills, x, y, h):
    """Place a mark so its bbox top-left is at (x, y) with height h."""
    s = h / (box[3] - box[2])
    body = "".join(f'<path fill="{fills[r]}" d="{d}"/>' for d, r in parts)
    return f'<g transform="translate({x:.2f} {y:.2f}) scale({s:.5f}) translate({-box[0]:.2f} {-box[2]:.2f})">{body}</g>', (box[1] - box[0]) * s


def word_group(word, fill, x, baseline, cap_px):
    d, left, right, cap = word
    s = cap_px / cap
    return f'<g transform="translate({x:.2f} {baseline:.2f}) scale({s:.5f}) translate({-left:.2f} 0)"><path fill="{fill}" d="{d}"/></g>', (right - left) * s


def svg(w, h, body, bg, preview_bg=False):
    # Reverse / white variants carry their dark background so they render visibly anywhere.
    rect = f'<rect width="{w:.0f}" height="{h:.0f}" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}">{rect}{body}</svg>\n'


def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w").write(content)


rooster, rbox = load_mark("1-rooster-line-a.svg")
fmark, fbox = load_mark("3-f-monogram-a.svg")
word = wordmark("FOWLEX")
r_aspect = (rbox[1] - rbox[0]) / (rbox[3] - rbox[2])
f_aspect = (fbox[1] - fbox[0]) / (fbox[3] - fbox[2])

for v in ["color", "reverse", "mono-dark", "mono-white"]:
    fills, bg = colors(v)

    # Rooster mark alone
    H, P = 1000, 120
    g, w = mark_group(rooster, rbox, fills, P, P, H)
    write(f"{OUT}/svg/fowlex-mark-{v}.svg", svg(w + 2 * P, H + 2 * P, g, bg))

    # Horizontal lockup: mark + wordmark, cap height 38% of mark, optically centred
    H, P, gap = 600, 90, 150
    cap = H * 0.32
    g1, mw = mark_group(rooster, rbox, fills, P, P, H)
    baseline = P + H * 0.62 + cap / 2
    g2, ww = word_group(word, fills["word"], P + mw + gap, baseline, cap)
    write(f"{OUT}/svg/fowlex-logo-horizontal-{v}.svg", svg(P + mw + gap + ww + P, H + 2 * P, g1 + g2, bg))

    # Stacked lockup: mark above, wordmark centred below
    H, P, gap = 700, 110, 110
    cap = H * 0.2
    _, ww = word_group(word, fills["word"], 0, 0, cap)
    mw = H * r_aspect
    W = max(mw, ww) + 2 * P
    g1, _ = mark_group(rooster, rbox, fills, (W - mw) / 2, P, H)
    g2, _ = word_group(word, fills["word"], (W - ww) / 2, P + H + gap + cap, cap)
    write(f"{OUT}/svg/fowlex-logo-stacked-{v}.svg", svg(W, P + H + gap + cap + P, g1 + g2, bg))

    # F monogram icon, square canvas
    S = 1000
    h = S * 0.78
    g, w = mark_group(fmark, fbox, fills, 0, 0, h)
    g, _ = mark_group(fmark, fbox, fills, (S - w) / 2, (S - h) / 2, h)
    write(f"{OUT}/svg/fowlex-icon-{v}.svg", svg(S, S, g, bg))

# App icons: full-bleed square (platforms round the corners themselves)
for name, bgc, fills in [
    ("light", CREAM, {"red": RED, "dark": CHARCOAL}),
    ("dark", CHARCOAL, {"red": RED, "dark": CREAM}),
    ("red", RED, {"red": CREAM, "dark": CHARCOAL}),
]:
    S, h = 1024, 1024 * 0.7
    w = h * f_aspect
    g, _ = mark_group(fmark, fbox, fills, (S - w) / 2, (S - h) / 2, h)
    write(f"{OUT}/svg/fowlex-app-icon-{name}.svg", svg(S, S, g, bgc))

print("aspects", round(r_aspect, 3), round(f_aspect, 3))
print("\n".join(sorted(os.listdir(f"{OUT}/svg"))))
