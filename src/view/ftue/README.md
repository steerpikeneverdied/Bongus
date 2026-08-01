# ftue — the first-time-user-experience coachmark layer (view)

A thin, **detachable guide layer** over gameplay. `FtueLayer.jsx` reads `{state, actions}`, picks the
first unseen beat from `beats.js` whose `show(state)` holds, and renders its coachmark; action beats
auto-advance when `done(state)` is met, info beats on GOT IT. Each beat records a persisted
`ftueSeen_<id>` flag (via `actions.setFlag`) so it fires once. By default the wrapper is click-through
(`pointer-events:none`) so the player still forges / merges / delivers / taps beneath — only GOT IT
captures input. Inline-styled + self-contained (no CSS-file coupling).

**Design rule (why the beats look the way they do):** a beat that teaches an ACTION must (a) SPOTLIGHT
the real thing to tap (`target`) and (b) carry a `done(state)` so it AUTO-DISMISSES the instant the
action lands — never a GOT IT on something the player already did. GOT IT / info beats are reserved for
pure "read this" spectacle with no action (`coldOpen`, `gotGear`, `alchemistExplain`). The equip/level
lesson is a guided chain — `gearOpen` (ring the HEROES nav) → `gearGearSquad` (Best Gear Squad button) →
`gearLevelSquad` (Level Up Squad button) — each auto-dismissing on the real state change. It is ARMED by the
good-gear chest pop (once, after the `gotGear` "YOU GOT SOME GEAR" message) AND re-armed by the first TWO
losses (`ftueGearGuideCount` caps it at 2). `normalOrder` teaches the repeatable order loop. The first
`limit` beat FREEZES the fight (`pause`) until the player fires it, and that first limit is a guaranteed
crit-kill (instant wave wipe).

**Guided-tutorial affordances (all optional, all declarative on the beat):**
- `pause: true` — freezes the sim while the beat is shown (via `flags.ftuePaused`, honoured by the
  controller battle tick).
- `target: '<css-selector>'` (or `(state) => selector` for a step-dependent target) — spotlights a DOM
  element. `mask: true` GREYS OUT everything but the target **and blocks input outside it** (only the
  target is tappable); without `mask` it's a non-blocking glow RING. The hole tracks the element's live
  `getBoundingClientRect` (relative to the `.app` overlay), so it fits a button of any shape/size.
  If the selector matches nothing, no spotlight/mask renders (the card still shows) — never a soft-lock.

**The FTUE never force-navigates the screen** (auto-`setScreen` was removed — it yanked the player mid-play,
e.g. delivering an order jumped to Heroes). To send the player to another screen, a beat spotlights the nav
button via a step-dependent target — `target: (s) => s.screen === '<screen>' ? '<in-screen sel>' : '[data-nav="<screen>"]'`
— so the PLAYER taps it. See `gearOpen` (HEROES → a hero tile) and `summon` (SUMMON → the free-pull button).

**Anchoring convention** — targets reference stable hooks: the nav buttons' existing `data-nav="<screen>"`,
the board generators' `.mb-gen`, the whole merge board `.mb-board`, the potion order's `.order.potion`, a
deliverable order's `.order.ready`, the Heroes-screen squad power-up buttons `data-ftue="gear-squad"` /
`data-ftue="level-squad"`, `data-ftue="pull"` on the gacha x1 button (force-enabled while `flags.ftueFirstPull`
is armed so the free pull can't be blocked by a 0-coin balance), and combat hero chips
`[data-battle-hero="<cid>"]` (DOM, not canvas) with their `.lb-btn` limit button — the `limit` beat rings the
charged hero's limit (`.hero-chip.can-fire .lb-btn`), and `alchemistUse` ISOLATES (masks) the recruited
Alchemist's OWN limit via `flags.ftueAlchemistCid` (set by `SUMMON`). Keep a beat's `target` in sync with the
rendered anchor — a dropped anchor silently disables its spotlight.

**The FTUE is overrides + flags, not tutorial logic in gameplay.** The sim-side of the layer is a
config singleton (`src/data/config/schemas/ftue.ts` → `C.FTUE`) read through guarded hooks:
- `buildWave` (battle) — zone-1 `zoneEnemyCounts` + pinned `firstEnemies`, when `flags.ftueActive`.
- `initState` (reducer-helpers) — arms `flags.ftueActive` on a fresh save (from `enabledByDefault`);
  opens with `orderSlotTarget(…, 0)` = `startingOrderSlots` (1) order slot and forces order [0] to the
  Limit Potion (`firstOrder*`) — the ONLY opening order. The good-gear blade order (`secondOrder*`,
  `forceSlot`) now arrives as the FIRST refill (see `FILL_ORDER_GAP`), not as a second opening slot. Starts
  the FTUE run with `specialOrders` OFF (the opening roll + gap-fills suppress specials until they unlock).
- `FULFILL_ORDER` (reducer-orders) — a delivered order carrying `forceSlot` grants a deterministic
  slot+rarity piece via `Gear.rollGearInSlot` (the guided armour reward). Normal orders never set it.
  On the good-gear (`forceSlot`) delivery — the guided chest pop — sets `ftueGearChest` (the "YOU GOT SOME
  GEAR" `gotGear` beat) and ARMS the gear-up guide via `armGearGuide`. On the first NON-forced delivery arms
  `flags.ftueNormalOrder` (the `normalOrder` beat's auto-dismiss). And ramps the active order-slot count:
  appends `orderSlotTarget(ftueActive, ordersCompleted) − current` extra pending slots (0 or 1) so the count
  grows one per completion up to `ORDER_CONFIG.active` (off-FTUE the target = active, so 0 — unchanged).
- `FILL_ORDER_GAP` (reducer-orders) — the FIRST refill after the opening potion is forced to the guided
  good-gear blade order (`buildFtueGearOrder` from `C.FTUE.secondOrder*`); monotonic `flags.ftueGearGiven`
  makes it fire exactly once. Later refills roll normally.
- `FULFILL_ORDER` potion branch (reducer-orders) — returns the CONSUMED `board` (the special/gear branches
  always did); omitting it was why a delivered LIMIT POTION order didn't consume its tiles.
- `TAP_GENERATOR` (reducer-board) — arms the monotonic `flags.ftueForged` on the FIRST successful forge
  (drives the `forge` beat's auto-dismiss; board-seeded tiles mean tile-count can't detect the tap).
- lose branch of `RESOLVE_COMBAT` (reducer-combat) — on the FIRST TWO defeats (`ftueGearGuideCount` cap)
  re-arms the gear-up guide via `armGearGuide` (reducer-helpers): sets `ftueGearArmed`, resets the squad
  "tapped" flags + the chain's seen flags so `gearOpen → gearGearSquad → gearLevelSquad` re-shows.
- `LEVEL_UP_SQUAD` / `EQUIP_BEST_SQUAD` (reducer-heroes / -gear) — the Heroes-screen squad power-up buttons;
  under the FTUE they set `ftueSquadLeveled` / `ftueSquadGeared` (the gear-guide steps' auto-dismiss).
- `RESOLVE_WIN` (reducer-combat) — arms `flags.ftueFirstPull` when the player reaches `summonAtLevel`
  (level 5 — "things are getting tough, hire a hero") + flips `flags.specialOrders` true on reaching
  `specialsUnlockAtLevel`. Its `TAP_LIMIT` handler records `ftueLimitFired` (first limit) + `ftueAlchemistUsed`
  (the recruited `firstPullHero` firing its AOE limit), and passes `critKill` to `Battle.fireLimitBreak` on
  the FIRST FTUE limit so it instantly wipes the wave (guaranteed crit).
- `SUMMON` (reducer-gacha) — the predetermined free pull (`C.FTUE.firstPullHero`); the recruit arrives
  battle-ready (full limit) AND the screen auto-returns to `merge` so the paused Alchemist-explain beat
  fires. Clears `ftueFirstPull`, sets `ftuePulled`, and records `ftueAlchemistCid` (the recruit's cid) so
  `alchemistUse` can spotlight its limit button.
- battle tick (controller `GameContext`) — honours `flags.ftuePaused`, so a `pause` coachmark beat (the
  `limit` beat — freeze until the first limit break — and the Alchemist-explain beat) freezes combat while
  it's on screen. No beat force-navigates.

**Removal contract** — the whole layer detaches with near-zero gameplay impact:
- **Disable for new players:** `_ftue.json` `enabledByDefault:false` → `initState` never sets
  `flags.ftueActive` → every hook falls through to vanilla gameplay (verified build-green).
- **Delete entirely:** drop `src/view/ftue/` + its one `<FtueLayer/>` mount in `Game.jsx`, remove the
  `ftue` manifest singleton + `_ftue.json`, and delete the guarded hook lines above (each falls through
  to vanilla gameplay when its flag is unset). No other gameplay code references the layer.

**Invariants** — view-only (reads state, dispatches only `setFlag`); no game logic here; beats gate on
observable state so the sequence self-heals across refreshes (seen flags persist on the account).
