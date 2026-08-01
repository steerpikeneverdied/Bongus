#!/usr/bin/env python3
"""seed-icons.py — render each icon-manifest emoji to a transparent PNG so the file-driven trim
tool can LIST the Icons section and use the glyph as the generation reference anchor.

Reads icon-manifest.json (produced by build-icon-manifest.mjs) and writes one PNG per icon to
  assets/icons-<category>/<slug>.png
These seeds are the tool thumbnail + the AI-generation style anchor — NOT the final art (that comes
from generate → die-cut → export). Idempotent: overwrites in place. macOS-only (Apple Color Emoji).
"""
import glob
import json
import os
import shutil
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(HERE, "icon-manifest.json")
ASSETS = os.path.join(HERE, "assets")
OUT = 256  # seed canvas size

EMOJI_FONT = "/System/Library/Fonts/Apple Color Emoji.ttc"
# Fallback chain for non-color glyphs (✕ ✓ ★ ◆ ✦ ➖ ☾ ⛁ …) that Apple Color Emoji doesn't carry.
# Arial Unicode first (broadest BMP+symbol coverage); per-glyph coverage is checked so we never
# emit a ".notdef" tofu box.
SYMBOL_FONTS = [
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/STIXGeneral.otf",
    "/System/Library/Fonts/Apple Symbols.ttf",
    "/System/Library/Fonts/Menlo.ttc",
]
ABSENT = "\U000F0000"  # plane-15 PUA — effectively never assigned; renders as .notdef/tofu
APPLE_EMOJI_STRIKES = [137, 96, 64, 48, 40, 32, 20]  # bitmap strikes; 137 → ~160px glyphs


def _emoji_font(size):
    for s in APPLE_EMOJI_STRIKES:
        try:
            return ImageFont.truetype(EMOJI_FONT, s), s
        except OSError:
            continue
    return None, None


def _covers(font, glyph):
    """True if the font has a real glyph for `glyph` (not a .notdef tofu box). Dependency-free:
    compare the rendered mask against a guaranteed-absent codepoint's mask."""
    try:
        g = font.getmask(glyph, mode="L")
        if g.size == (0, 0):
            return False
        ref = font.getmask(ABSENT, mode="L")
        return not (g.size == ref.size and bytes(g) == bytes(ref))
    except Exception:
        return False


def _symbol_font(size, glyph):
    for path in SYMBOL_FONTS:
        if not os.path.exists(path):
            continue
        try:
            f = ImageFont.truetype(path, size)
        except OSError:
            continue
        if _covers(f, glyph):
            return f
    return None


def _fit(img):
    """Crop to non-transparent bbox, then paste centered onto an OUT×OUT transparent square."""
    bbox = img.getbbox()
    if not bbox:
        return None
    cropped = img.crop(bbox)
    w, h = cropped.size
    scale = (OUT * 0.86) / max(w, h)
    cropped = cropped.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (OUT, OUT), (0, 0, 0, 0))
    canvas.paste(cropped, ((OUT - cropped.width) // 2, (OUT - cropped.height) // 2), cropped)
    return canvas


def render_emoji(glyph):
    font, strike = _emoji_font(OUT)
    if not font:
        return None
    img = Image.new("RGBA", (strike * 2, strike * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    try:
        d.text((strike // 2, strike // 2), glyph, font=font, embedded_color=True)
    except Exception:
        return None
    return _fit(img)


def render_symbol(glyph):
    font = _symbol_font(200, glyph)
    if not font:
        return None
    img = Image.new("RGBA", (OUT * 2, OUT * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # Near-white with a thin dark outline so text-symbol seeds read on the tool's dark canvas.
    d.text((OUT, OUT), glyph, font=font, fill=(235, 238, 242, 255), anchor="mm",
           stroke_width=6, stroke_fill=(20, 22, 26, 255))
    return _fit(img)


def render_placeholder(slug):
    """Last resort when no installed font carries the glyph (e.g. ⛁): a neutral rounded tile with
    the slug so the icon still LISTS in the tool and can be generated. Marks 'art needed'."""
    font = None
    for path in SYMBOL_FONTS:
        if os.path.exists(path):
            try:
                font = ImageFont.truetype(path, 34)
                break
            except OSError:
                continue
    img = Image.new("RGBA", (OUT, OUT), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([28, 28, OUT - 28, OUT - 28], radius=28, fill=(38, 40, 46, 255),
                        outline=(90, 96, 104, 255), width=4)
    if font:
        d.text((OUT // 2, OUT // 2), slug.replace("-", "\n"), font=font, fill=(203, 208, 214, 255),
               anchor="mm", align="center")
    return img


def main():
    manifest = json.load(open(MANIFEST))
    # Clear stale icons-* dirs first so a rename/split leaves no old-slug seeds behind (only die-cut
    # _256/_trim outputs would live here too, but none exist pre-generation — seeds are placeholders).
    for d in glob.glob(os.path.join(ASSETS, "icons-*")):
        if os.path.isdir(d):
            shutil.rmtree(d)
    written, placeheld = 0, []
    for entry in manifest:
        cat, slug, glyph = entry["category"], entry["slug"], entry["emoji"]
        img = render_emoji(glyph) or render_symbol(glyph)
        if img is None:
            img = render_placeholder(slug)
            placeheld.append(f"{glyph} ({slug})")
        d = os.path.join(ASSETS, f"icons-{cat}")
        os.makedirs(d, exist_ok=True)
        img.save(os.path.join(d, f"{slug}.png"))
        written += 1
    print(f"seeded {written}/{len(manifest)} icon PNGs under assets/icons-*/")
    if placeheld:
        print("  no font glyph — text placeholder written (generate art): " + ", ".join(placeheld))


if __name__ == "__main__":
    main()
