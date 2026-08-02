# controller — the fixed-step run-loop + facade seam

`GameContext.tsx` creates the live world store (`src/game/store/game-store.ts` — the authoritative state
+ the reducer, lifted OUT of React), drives the fixed-step simulation loop, and exposes `{ state, actions }`
to the view. React reads the store via `useSyncExternalStore`; consumers pick the narrowest view:
`useGame` (full state — combat surfaces), `useMetaGame` (state minus battle/fx/energy/now — screens,
Board, Orders, NavBar), `useHudGame` (state minus battle/fx, KEEPS energy/now — the currency bar),
`useActions` (actions only), `useGameStore` (the store, for FxLayer's fx buffer). Ported from MergeCombat's
controller, then re-architected onto the framework's fixed-step loop + subscribable store.

**Owns** — the single **fixed-step accumulator on `requestAnimationFrame`** (`src/controller/game-loop.ts`),
which is the sim's ONLY clock: it advances energy regen, the battle tick (fixed `dt = C.BATTLE.tickMs`, in
whole steps clamped by `C.BATTLE.maxCatchupMs`), and the five battle-status resolvers (clearing→SHOW_COMPLETE,
lost→RESOLVE_LOSS, won→RESOLVE_WIN, chest→RESOLVE_CHEST, intro→START_COMBAT) — **replacing** the former two
`setInterval` timers + five `setTimeout` resolvers (framework rule: never `setInterval`/`setTimeout` for sim
timing). Also owns throttled autosave and the visibilitychange flush / RESUME_AFK. Seeds the sim PRNG
(`seedSim`) from the run's **persisted seed** at boot — a fresh run gets a boundary-generated seed
(`makeSeed`), a saved run replays from `state.seed` — so runs are reproducible; entropy is produced only
here, never in the sim.

**Headless engine / full screens** (`isFullScreen` / `engineHeadless` in `GameContext`) — a FULL SCREEN
(hero menu `menuHeroId`, a `minigame`, the `map` or `gacha` screen) or the manual background toggle
(`state.headless` → `HeadlessScreen`) hides the combat panel + `FxLayer`. **`requestAnimationFrame` does not
run while the tab is hidden**, so the loop pauses in the background for EVERY mode; headless-while-VISIBLE
still ticks (combat advances behind the map/gacha screen). On refocus the controller credits the offline gap
via RESUME_AFK for **all** modes (the old setInterval let headless combat tick in a hidden tab + skipped
RESUME_AFK — deliberately dropped for the correct rAF + offline-accrual model). The AFK collect popup
(`afkOpen`) and the dev Marksman pause both FREEZE the loop. fx is no longer drained here: the store buffers
each dispatch's fx events and `FxLayer` subscribes + drains them post-commit; an unmounted `FxLayer` simply
drops them.

`dev-pause.ts` is a dev-only mutable flag (not game state) that the loop checks alongside the AFK-popup
guard — set by the Marksman markup tool's `GameAdapter.setPaused` (`main.tsx`) so the sim holds still while
annotating a frame. Always `false` in a shipped build (Marksman only mounts behind `import.meta.env.DEV`).

**Invariants** — the view NEVER dispatches raw reducer actions; it calls the `actions` map only. All
persistence goes through `src/game/store/persistence.ts` (the six-section account), never localStorage
directly. Randomness + time live at this boundary (the seed + `now` are injected; the reducer is pure over
its inputs). fx flows sim → store buffer → `FxLayer` (post-commit), never through the subscribed React state.
