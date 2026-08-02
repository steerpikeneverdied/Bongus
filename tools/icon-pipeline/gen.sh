#!/usr/bin/env bash
# === ICON art gen driver (batch/TSV) ===
# Reads rosters/icons-<cat>.tsv (slug<TAB>subject) and generates each UI/gameplay ICON in the locked
# icon style via Fortis (Gemini 2.5 Flash Image). UNTRIMMED white bg — the SHARED trim tool die-cuts
# + applies the outline treatment afterwards. Output → the trim tool's icons-<cat> category.
#
# BASE PROMPT is operator-set, split like the other categories:
#   ICON_POSITIVE.txt  — the locked positive style (prepended to every subject)
#   ICON_NEGATIVE.txt  — comma-list of things to AVOID (appended; nano-banana has no separate neg field)
# STYLE REFERENCES (image anchors), resolved per category like merge-icon-pipeline:
#   reference/anchor-<cat>.png  → this category's anchor (cat = the OUT folder minus 'icons-')
#   reference/style-sheet.png   → the shared icon style anchor (all categories)
#   reference/*.png             → any refs present (all attached as soft anchors)
#   REF=<path[,path]> env       → forced anchor for this run (the trim tool's ×N-variants sets this)
# With no reference present it generates prompt-only (plain gateway). bash 3.2 compatible.
#
# Usage (the trim tool's Regen buttons set TSV/OUT/FORCE for you, per category):
#   TSV=rosters/icons-currency.tsv OUT=../char-art-pipeline/trim/assets/icons-currency FORCE=1 bash gen.sh
set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
TSV="${TSV:-$ROOT/rosters/icons-ui.tsv}"           # override per category: TSV=rosters/icons-<cat>.tsv
GEN_REF="$(cd "$ROOT/../char-art-pipeline" && pwd)/gen-image-fortis-ref.sh"   # with style references
GEN_PLAIN="$(cd "$ROOT/../anim-pipeline" && pwd)/gen-image-fortis.sh"         # prompt-only (no reference yet)
CONC="${CONC:-6}"
FORCE="${FORCE:-0}"
OUT="${OUT:-$(cd "$ROOT/.." && pwd)/char-art-pipeline/trim/assets/icons-ui}"
REFDIR="$ROOT/reference"
mkdir -p "$ROOT/raw" "$ROOT/logs" "$OUT"

CAT="$(basename "$OUT" | sed 's/^icons-//')"

# ── operator spec (v: icons are white-bg + 512): the operator does the chroma + trim, so KEEP Gemini's
# flat white background (never auto-strip to alpha), and deliver the source at SRC_SIZE (Gemini emits
# ~1024). Overridable via env for one-off runs. Applies to BOTH the tool's ⟳ regen and CLI runs.
export NO_REMBG="${NO_REMBG:-1}"
SRC_SIZE="${SRC_SIZE:-512}"

# ── operator-set base prompt (positive + negative), read at run time ──
# Per-category override ICON_POSITIVE-<cat>.txt (e.g. banner) wins over the global ICON_POSITIVE.txt.
POSITIVE="$(cat "$ROOT/ICON_POSITIVE-$CAT.txt" 2>/dev/null || cat "$ROOT/ICON_POSITIVE.txt" 2>/dev/null)"
[ -z "$POSITIVE" ] && POSITIVE="A single crisp video-game UI icon of ONE object on a solid flat pure-white background."
NEGATIVE="$(cat "$ROOT/ICON_NEGATIVE-$CAT.txt" 2>/dev/null || cat "$ROOT/ICON_NEGATIVE.txt" 2>/dev/null)"

# ── style reference resolution (per category, like merge): anchor-<cat> wins, else the global style-sheet ──
if [ -z "${REF:-}" ]; then
  if   [ -f "$REFDIR/anchor-$CAT.png" ]; then REF="$REFDIR/anchor-$CAT.png"
  elif [ -f "$REFDIR/style-sheet.png" ]; then REF="$REFDIR/style-sheet.png"
  else REF="$(ls "$REFDIR"/*.png 2>/dev/null | grep -v '/anchor-' | paste -sd, -)"; fi
fi

corner_light() {  # $1 = png ; echoes LIGHT or DARK/MISS
  python3 - "$1" <<'PY' 2>/dev/null || echo MISS
import sys; from PIL import Image
im=Image.open(sys.argv[1]).convert("RGB"); w,h=im.size
pts=[im.getpixel((3,3)),im.getpixel((w-4,3)),im.getpixel((3,h-4)),im.getpixel((w-4,h-4))]
print("LIGHT" if sum(sum(p) for p in pts)/12>200 else "DARK")
PY
}

gen_one() {  # $1=slug  $2=subject
  local slug="$1" subj="$2" prompt t st
  prompt="${POSITIVE} Subject: ${subj}."
  # OVERRIDES = critical elements that outrank the base style (e.g. "gold coin, embossed crown")
  [ -n "${OVERRIDES:-}" ] && prompt="${prompt} — CRITICAL OVERRIDES (ABSOLUTE priority over any conflicting detail above): ${OVERRIDES}."
  [ -n "$NEGATIVE" ] && prompt="${prompt} — AVOID (must NOT appear): ${NEGATIVE}."
  for t in 1 2 3 4; do
    rm -f "$ROOT/raw/$slug.png"
    if [ -n "$REF" ]; then
      SKIP_SHRINK=1 "$GEN_REF" "$ROOT/raw/$slug.png" "$prompt" "$REF" > "$ROOT/logs/$slug.log" 2>&1 || true
    else
      SKIP_SHRINK=1 "$GEN_PLAIN" "$ROOT/raw/$slug.png" "$prompt" > "$ROOT/logs/$slug.log" 2>&1 || true
    fi
    if [ -f "$ROOT/raw/$slug.png" ]; then
      st="$(corner_light "$ROOT/raw/$slug.png")"
      if [ "$st" != "DARK" ]; then cp "$ROOT/raw/$slug.png" "$OUT/$slug.png"; sips -Z "$SRC_SIZE" "$OUT/$slug.png" >/dev/null 2>&1; echo "OK   $slug ($st)"; return 0; fi
      echo "  ..$slug try $t bg=DARK, retrying"
    else
      echo "  ..$slug try $t NO_IMAGE, retrying"
    fi
    sleep 2
  done
  if [ -f "$ROOT/raw/$slug.png" ]; then cp "$ROOT/raw/$slug.png" "$OUT/$slug.png"; sips -Z "$SRC_SIZE" "$OUT/$slug.png" >/dev/null 2>&1; echo "WARN $slug (kept non-white bg)"; return 0; fi
  echo "FAIL $slug"; return 1
}

# Build worklist (respect explicit slug args, skip existing unless FORCE)
declare_args="$*"
want() { [ -z "$declare_args" ] && return 0; for a in $declare_args; do [ "$a" = "$1" ] && return 0; done; return 1; }

echo "icon gen · cat=$CAT · ref=${REF:-<none, prompt-only>}"
running=0; total=0
while IFS=$'\t' read -r slug subject; do
  [ -z "${slug:-}" ] && continue
  case "$slug" in \#*) continue;; esac
  want "$slug" || continue
  if [ "$FORCE" != "1" ] && [ -f "$OUT/${slug}_256.png" ]; then echo "skip $slug (exported already)"; continue; fi
  gen_one "$slug" "$subject" &
  running=$((running+1)); total=$((total+1))
  if [ "$running" -ge "$CONC" ]; then wait; running=0; fi
done < "$TSV"
wait
echo "=== batch done: attempted $total ==="
echo "output count: $(ls "$OUT"/*.png 2>/dev/null | grep -vE '_(trim|256)\.png$' | wc -l | tr -d ' ')  -> $OUT"
