# store — the live world store + sim reducer + persistence

`game-store.ts` is the **live, subscribable world store**: it holds the authoritative run state and runs
the reducer (`createGameStore(initial)` → `{ getState, dispatch, subscribe, subscribeFx, getFxEpoch,
takePendingFx, bus }`). It was lifted OUT of React so the RAF loop (`src/controller/game-loop.ts`) and player
actions dispatch through the SAME reducer, and React reads it via `useSyncExternalStore`. A no-op dispatch
(reducer returns the same reference) skips the notify, matching `useReducer`'s bail-out. Cross-module signals
live on `bus` (`createGameSignals`), reserved for future non-view events.

`actions.ts` (the action-type map) and `persistence.ts` (maps the runtime state slice ↔ the
six-section account blob).

**VFX transport** — the reducer stays pure: it still emits pure-data `fx` events on the state it returns.
The store facade lifts each dispatch's `fx` batch into a `pendingFx` buffer (kept OUT of the subscribed
snapshot, so per-tick VFX never re-renders state consumers) and bumps `fxEpoch`; `FxLayer` subscribes via
`subscribeFx`/`getFxEpoch` and drains `takePendingFx()` in a **post-commit** effect (fresh DOM for VFX that
queries element positions). The former `state.fx` queue + `CLEAR_FX` action/handler are retired.

The reducer (`reducer.ts`) is a thin **combinator**: it merges the per-domain HANDLER MAPS from the
slice files into one dispatch table keyed by `action.type` and routes to the owner (unknown type →
state unchanged). Each action is owned by exactly one slice:

| Slice | Owns |
|---|---|
| `reducer-shell.ts` | screen/menu/AFK/minigame/reward + plumbing (regen, reset) |
| `reducer-board.ts` | merge board (generator tap, move / merge / swap) |
| `reducer-orders.ts` | fulfil / fill-gap / empty / reroll |
| `reducer-combat.ts` | level select, tick, limit break, win/loss/area/chest resolution |
| `reducer-gacha.ts` | summon |
| `reducer-heroes.ts` | swap, ascend, level-up(-max) |
| `reducer-gear.ts` | auto-equip/level, per-hero equip/level, fuse, equip-best, upgrade |

`reducer-helpers.ts` holds the shared orchestration primitives + `initState` / `buildBattle`; the
latter two are re-exported from `reducer.ts` so the module's public surface (`reducer`, `initState`,
`buildBattle`) is unchanged.

**Invariants** — every slice handler is pure over `(state, action)`; randomness comes from the module
PRNG (`sim-random.ts`, seeded by the controller from the run's persisted `state.seed` → `profile.seed` →
restored on load, so a FRESH run from a given seed is reproducible — the determinism gate; the rng CURSOR
is not persisted, so a mid-run reload restarts the stream from the seed rather than continuing the pre-save
stream), time from action payloads (`now`). One action.type =
one owning slice (no key collisions across the merged maps). Persistence is lossless:
`fromBlob(toBlob(slice))` reproduces the slice `initState` expects (wallets→`resources`,
heroes/gear→`items`, rest→`profile`/`features`). The `battle` is transient (rebuilt by `buildBattle` on
load) EXCEPT the active squad's limit-break charge, persisted as `features.battle.limitEnergy` (cid→energy)
and re-overlaid in `initState` — so a refresh keeps limit progress, while a switched-out hero (absent from
the map) resets to 0. No hidden multipliers — all tuning via `content.ts`.
