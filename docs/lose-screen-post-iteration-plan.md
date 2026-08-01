# LOSE screen — POST-ITERATION PLAN

Work to do **after** the lose-screen mockup (`docs/mockups/lose-screen.html`) is approved and we port
it into the live game. The mockup is the source of truth for the visual + interaction design; this
file tracks what has to land in real code once the design is signed off.

## Already shipped live (not deferred)

- **Recommended power range on the area list** — `MapScreen` zone rows show `⚔ min–max`.
  Impl: `src/game/combat/recommended-power.ts` → re-exported via `src/model/map.js` → rendered in
  `src/view/screens/MapScreen.jsx`; `fmtKr` (rounded, no decimals) added to `src/view/fmt.js`.
  Derived from the enemy wave, in `heroPower`-comparable units.

## Shipped live — redesigned LOSE screen (was "post-iteration")

Ported 1:1 from the mockup into `src/view/LoseScreen.jsx` (new), rendered by `src/view/Autobattler.jsx`
on `battle.status === 'lost'` (replaces the old `.lose-banner`). Because it renders inside `.battle`,
it dims ONLY the combat area (header/board/nav stay visible).

- [x] Redesigned LOSE state: flat-black stripe wipe (L→R), italic red/purple letter-by-letter slam,
      downward limit-blob drip particles from inside the glyph bottoms, node-dot + level, italic-white
      heartbeat **RETURN TO … in Ns**, **Hero Screen** / **Get More Heroes** buttons.
- [x] Buttons wired: Hero Screen → `setScreen('heroes')`; Get More Heroes → `setScreen('gacha')`.
- [x] Auto-restart: unchanged controller flow — `RESOLVE_LOSS` replays the same level (`recovering`)
      after `BATTLE.loseBannerMs`; the countdown is the visual sync of that timer.
- [x] **SQUAD POWER vs RECOMMENDED** on the live lose screen — squad = Σ deployed `heroPower`;
      recommended = `recommendedPowerForLevel(level)`; `fmtKr` (rounded, no decimals). Squad number
      red/green/orange vs recommended; recommended text pulses when below.
- Drip VFX tuning lives in data: `_vfx.json combat.loseDrips` (schema in `config/schemas/singletons.ts`).
  Strings in `data/strings.js combat.*`.
- **Pacing change (flagged):** `_battle.json loseBannerMs 1400 → 3500` so the ~3.5s ceremony/countdown
  fits. This also lengthens the auto-retry delay after every loss — revert to a smaller value if the
  auto-retry should feel snappier (the countdown auto-syncs to whatever it is).

- [ ] Still deferred: extend recommended power to a per-node display / node popup (beyond the area
      range + lose screen).

## New — FIX enemy compositions per level (operator, this session)

- [ ] Make each level's enemy **composition deterministic / fixed** — not RNG-selected in
      `buildWave` (`src/game/combat/battle.ts`). Same level → the same enemies every time.
- **Why it matters here:** `recommendedPowerForLevel` currently approximates the wave with a **fixed
      seed** (`makeRng(level)`) because composition is RNG. Once compositions are fixed, recommended
      power is computed from the **actual** composition — exact, not an estimate — and the seed hack
      in `recommended-power.ts` can be removed.
