# icon-pipeline — the Icons section's gen driver

Sibling gen pipeline for the trim tool's **Icons** section (the `icons-<cat>` categories), alongside
`char-art-pipeline`, `merge-icon-pipeline`, `gear-pipeline`, `loot-pipeline`. Generates real art for
every gameplay icon that previously rendered as a raw emoji.

## The flow

1. **Registry** — every icon lives in `src/data/assets.js` (`ui.*`/`status.*`/`node.*`/`fx.*`/
   `banner.*`/`gear.*` + the `icon.*` entries). This is the single source.
2. **Manifest + seeds** — `trim/build-icon-manifest.mjs` builds `trim/icon-manifest.json` (a deduped
   VIEW over the registry: glyph shared across ≥2 categories → the `general` bucket) and writes the
   `rosters/icons-<cat>.tsv` here. `trim/seed-icons.py` renders each emoji to
   `trim/assets/icons-<cat>/<slug>.png` (the tool thumbnail + this pipeline's generation anchor).
3. **Generate** — the trim tool's Regen buttons call `gen.sh` per category (via the server's
   `_regen_plan`), which reuses `../char-art-pipeline/gen-image-fortis-ref.sh` with the locked
   `ICON_PROMPT.md` style, anchored to each icon's emoji seed → white-bg art in `trim/assets/icons-<cat>/`.
4. **Die-cut** — the shared trim tool die-cuts + applies the outline treatment → `<slug>_256.png`.
5. **Export** — `../char-art-pipeline/export-to-game.mjs --icons` copies each `_256.png` to
   `assets/combatclean/icons/<slug>.png`, points EVERY registry key that shares the icon (manifest
   `assetKeys`) at it in `assets.json`, keeps `assets.js` `art:` honest, then gates on
   `assets:validate` + `npm run build`.

## Regenerating the manifest/rosters/seeds

```
node trim/build-icon-manifest.mjs     # rebuild icon-manifest.json + rosters/ from assets.js
python3 trim/seed-icons.py            # (re)render the emoji seeds
```

Run both after adding/removing an `icon.*` entry in `src/data/assets.js`. `SUBJECTS` in the manifest
builder seeds the roster prompts; refine any `rosters/icons-<cat>.tsv` row freely (the builder only
overwrites on re-run, so keep manual edits in mind).
