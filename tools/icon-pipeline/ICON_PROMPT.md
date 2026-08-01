# Icon generation — base prompt + references (operator-set)

The icon gen (`gen.sh`) is configured like the other categories, split into three operator-editable
inputs so you can set the look without touching the driver:

## 1. Base POSITIVE prompt — `ICON_POSITIVE.txt`
The locked style, prepended to every icon. Prepended before `Subject: <the icon's roster prompt>`.
Describe rendering, framing, palette discipline, background (flat white for the die-cut) — the shared
look every icon must share.

## 2. Base NEGATIVE — `ICON_NEGATIVE.txt`
A comma-separated list of things that must NOT appear. nano-banana (Gemini 2.5 Flash Image) has no
separate negative field, so this is appended to every prompt as an explicit "AVOID (must NOT appear): …"
clause (same technique the other categories bake into their positive string).

## 3. Style REFERENCE images — `reference/`
Image anchors attached to every generation (soft style lock), resolved per category like the
merge-icon pipeline:
- `reference/anchor-<category>.png` — a specific anchor for one Icons subtab (e.g. `anchor-chest.png`),
- else `reference/style-sheet.png` — the shared anchor for ALL icons,
- else every `reference/*.png` — all attached as soft anchors.
With no reference present, icons generate prompt-only. The trim tool's "Regenerate ×N" sets `REF` to
the current tile so variants iterate on it.

## Composition per icon
Final prompt = `ICON_POSITIVE.txt` + `Subject: <roster prompt from rosters/icons-<cat>.tsv>` +
(optional `OVERRIDES`) + `AVOID: ICON_NEGATIVE.txt`. Output is white-bg; the shared trim tool
die-cuts + outlines, then export downscales to 32×32.

Edit the two `.txt` files and drop images in `reference/` — no `gen.sh` change needed.
