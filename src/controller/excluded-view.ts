// === excluded-view — the memoized per-frequency state views the controller hands to the view ===
//
// A stable "excluded view" of state: its identity changes ONLY when a NON-excluded slice changes, so
// consumers of that view skip re-renders driven by the excluded high-frequency slices. Pure + React-free
// (so it's headlessly testable — see scripts/smoke-view.mjs). GameContext memoizes the result in a ref.
/* eslint-disable @typescript-eslint/no-explicit-any */

// META view — screens / Board / Orders / NavBar: skip BOTH the 5Hz battle tick and the 1Hz regen tick.
// HUD view — the currency bar (Header): keeps energy/now (1Hz regen) but skips the 5Hz battle tick.
// `nextId` is a per-tick internal id counter (a BATTLE_TICK bumps it for every fx event it mints); it is
// NOT a slice any view renders, so it MUST be excluded or it would defeat the split by minting a fresh
// view identity ~5Hz. `fx` no longer lives on state, but stays listed for safety.
export const META_EXCLUDE = new Set(['battle', 'fx', 'energy', 'now', 'nextId']);
export const HUD_EXCLUDE = new Set(['battle', 'fx', 'nextId']);

// Returns `prev` unchanged when no non-excluded slice changed, else a fresh shallow copy without the
// excluded keys. Shared by the meta + hud views (different exclude sets) — one mechanism, two configs.
export function excludedView(state: any, prev: any, exclude: Set<string>): any {
  let same = !!prev;
  if (same) {
    for (const k in state) { if (exclude.has(k)) continue; if (state[k] !== prev[k]) { same = false; break; } }
    if (same) for (const k in prev) { if (!exclude.has(k) && !(k in state)) { same = false; break; } }
  }
  if (same) return prev;
  const view: any = {};
  for (const k in state) if (!exclude.has(k)) view[k] = state[k];
  return view;
}
