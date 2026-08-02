# CLAUDE.md — Combat Clean

> **Template note (delete this block once filled in).** This file was scaffolded from the
> bishop-game-framework template. Replace every `<…>` placeholder with your game's specifics, fill in
> the **Module index** as you build, and write the **Core mechanic** section. The *Architecture
> hard rules*, *Conventions*, and *Docs-track-code rule* below are the framework contract — keep
> them. This file is **kept current**: see the docs-track-code rule at the bottom.

Guidance for Claude Code when working in this repository.

## What this is

**Combat Clean** — a **blank, data-driven merge + auto-battler starter** built on the
bishop-game-framework app skeleton + the real `@fortis/bishop-*` engine (published npm packages),
with the data-layer contracts modelled on the systems present in **MergeCombat** (merge chains,
generators, heroes, enemies, gear, rarities, zones, banners, an id-keyed currency wallet). It ships
with **no gameplay loop yet** — the value here is the *machinery*: every piece of content is
schema-validated JSON across three registries linked by one id/key, the account is the six-section
economy blob ready to become server-authoritative, and `npm run build` + the config gates are green
from day one. Single-player, short-session mobile. The view is a **top-down 2D HTML5 Canvas**. Ships
to mobile via **Capacitor**.

## Repository layout

```
<game>/                    <- git root (the project root)
  src/                     <- game source (see Module index)
  scripts/                 <- dev/device launch + tooling scripts
  docs/                    <- design docs + all UI mockups/prototypes (docs/mockups/)
  android/  ios/           <- Capacitor native projects (generated, gitignored)
  dist/                    <- production build output (gitignored)
  .claude/                 <- architecture-enforcement agents + workflows + skills
  changesets/              <- pending change batches (see the changeset skills)
  index.html               <- game entry
```

## Stack

Vite 5 · TypeScript (strict) · React 18 (UI overlay only) · Tailwind CSS v4 (utility-first styling,
via `@tailwindcss/vite`) · HTML5 Canvas 2D (game view) · Capacitor 6 (device). **No game
engine/framework** — the simulation is plain TypeScript. The view is swappable (sprite/3D later)
without touching logic.

## Commands

| Command | What |
|---|---|
| `npm run dev` | Vite dev server + opens the game (HMR; `src/data/*.json` hot-reloads into the running sim) |
| `npm run build` | `tsc` typecheck + production bundle to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run cap:sync` | Build + sync web assets into native projects |
| `npm run cap:android:deploy` | Build APK → install → launch on a connected Android device |
| `npm run cap:ios` | Build + open the iOS project in Xcode |

First device setup: `npx cap add android` / `npx cap add ios` (the `android/`/`ios/` folders are
gitignored). Full command reference: [`COMMANDS.md`](./COMMANDS.md).

## Working with the bishop engine packages

The `@fortis/bishop-*` engine packages are consumed as **published npm dependencies** from the
Fortis registry (`@fortis:registry=https://nexus.prod.infra-area1.com/repository/fortis-npm/`,
configured in your `~/.npmrc` with auth). This game depends on **7** of them (see `dependencies` in
`package.json`), all pinned to `^1.0.0`:

`@fortis/bishop-config-registry`, `@fortis/bishop-asset-registry`, `@fortis/bishop-asset-types-2d`,
`@fortis/bishop-asset-processors`, `@fortis/bishop-render-contract`, `@fortis/bishop-meta-contract`,
`@fortis/bishop-meta-client`.

They ship prebuilt `dist/` — there is no local build step (no submodule, no workspaces). Import via
their package names + subpath exports, e.g. `@fortis/bishop-config-registry/vite`,
`@fortis/bishop-config-registry/node`, `@fortis/bishop-asset-types-2d/schema`.

- **Fresh clone:** `npm install` (requires `@fortis` registry auth in `~/.npmrc`).
- **Bumping the engine:** bump the version range in `package.json` (or `npm update @fortis/bishop-*`),
  then `npm install`, `npm run build`, and commit the updated `package-lock.json`.

## Architecture — the hard rules

These are the framework contract. They are enforced by the advisory `arch-*` review agents in
`.claude/` (run `arch-review` after changes). Do not regress them.

The rationale, the layer diagram, and the dependency-direction diagram behind these rules live in
the stable architectural spec, imported here as context: @ARCHITECTURE.md

1. **Data / logic / view / UI are separated.** `src/data` (JSON) ← `src/game` (logic) → read by
   `src/view` (render) and `src/ui` (React).
2. **View is a pure reader (OVERRIDING RULE).** `src/view` and `src/ui` may only READ simulation
   state and subscribe to signals. **Zero game logic in the view; zero rendering/DOM in `src/game`.**
   The view is swappable without touching logic. `src/game` must run headless.
3. **Module-per-folder.** Each system lives in its own folder with its files + a `README.md`
   (signals + invariants only — see template below), e.g. `game/<system>/<thing>.ts` — not
   `game/systems/...` MVC buckets. Modules are independently addable/removable.
4. **Dependency injection.** Modules never construct each other. In the framework skeleton this is a
   composition root (`src/core/bootstrap/composition.ts`) resolved by token (`src/app/tokens.ts`).
   **This port omits that scaffolding** — it wires through the React controller
   (`src/controller/GameContext.tsx`), which owns construction of the reducer / timers / actions the
   view reads. Keep cross-module construction to that single seam; never `new` a module from another.
5. **Events over references.** Cross-module communication goes through `GameSignals`
   (`src/game/signals.ts`) on `world.bus`, not direct imports of other modules' classes.
6. **Composition over inheritance.** An entity is a flat data record; behaviour lives in stateless
   Systems + per-entity Brains. No controller class hierarchy. Prefer adding a component field + a
   system/brain over subclassing.
7. **Specificity over generalization.** Prefer distinct concrete implementations over premature
   base classes (e.g. a player-controlled brain vs an AI brain as siblings, not a deep tree).
   Generalize later, once 3+ concrete cases prove the shape.
8. **All tuning is data (HARD RULE).** Every gameplay number, threshold, duration, speed, rate,
   count, colour, or any other tunable value **must** live in `src/data/*.json` and be read via
   `src/data/store.ts`. **No magic literals in `src/game`, `src/view`, `src/ui`, or `src/input`.**
   Structural constants (array lengths, loop indices, zero-checks, `Math.PI`) are fine; anything a
   designer would tune is not. Enforced by the `arch-data-values` agent.

## Data layer — the three registries (Bishop config-registry)

Content is expressed as schema-validated JSON via the real `@fortis/bishop-*` engine (npm packages).
The manifest `src/data/config/manifest.ts` (`CATEGORIES`) is the contract SSOT the build, the scaffold
CLI, and the edit hook all read.

- **Three registries, one identity.** logical (`src/data/config/game/**`, pure gameplay data) /
  visual (`src/data/visual-config/**`, the VSM) / UI (`src/data/config/ui/**`, presentation) — linked
  ONLY by a numeric `id` (id-kind) or string `key` (key-kind).
- **id-kind vs key-kind.** Can a new entry be added with DATA ALONE → **id-kind** (`zConfig`). Does
  each entry require CODE (a coded mechanic/enum the runtime switches on) → **key-kind**
  (`zKeyConfig`). Here: `chains`/`generators`/`rarities`/`gearSlots`/`heroClasses` are key-kind;
  `heroes`/`enemies`/`gearPieces`/`zones`/`banners`/`resources` are id-kind; `battle`/`energy`/
  `progression`/`gearLoadout`/`ftue` (+ `minigame`) are singletons. **Hero-class = the logical `heroes` entry
  (the stateless template: base stats/abilities + `classKey` + optional `slots` loadout); the stateful
  instance is `Character` on the account. Equip slots are per-class** (`heroes.slots` else
  `gearLoadout.defaultSlots`); a `classBound` slot (the class accessory) only accepts pieces whose
  `classKey` matches — see `src/game/gear/README.md`.
- **Model logical intent as a TYPED FIELD or a ref, NEVER a tag.** References are declared in the
  schema — `configRef('enemies')` (numeric → id-kind, field named `*ConfigId`/`*ConfigIds`, enforced
  by `config lint`) / `stringConfigRef('rarities','key')` (string → key-kind). **Do NOT use `tags`
  for logical content that is already a keyConfig type** (rarities, chains, …): those are a
  clearly-identified enum, and expressing the type in the schema validates the intention — a bare
  string key/value tag can't tell the schema what it means. `tags` is UI/design grouping only; never
  gate game logic on a tag.
- **Ids never reuse** (`_id-ledger.json` high-water). Author via `npm run scaffold -- config create
  <cat> --name <slug>`, then edit the JSON directly — the PreToolUse edit hook
  (`config/validate-edit-hook.mjs`) re-validates every write; run `npm run game-config:validate` for
  cross-entity ref integrity.
- **Per-category defaults (`_default.json`).** A category folder MAY hold a reserved
  `<cat>/_default.json`: a PARTIAL config deep-merged UNDER every entity of that category (the entity
  always wins; precedence schema `.default()` < `_default.json` < entity value). It keeps a value
  shared by most entities DRY without a runtime multiplier — applied at LOAD time by `scanConfigDir`
  (config-registry `node.ts`), so the build (`virtual:game-config`) and the scaffold CLI both honour
  it and `createEntity` never bakes it into new files. The edit hook shape-checks `_default.json`
  (known-field check via `validateCategoryDefault`, not a full-entity parse). Only add one when a
  category clearly benefits.
- **`store.ts` vs config-registry — no parallel data path.** `src/data/store.ts` (+ `game.json`) owns
  SIM/VIEW live-HMR globals (world size, fixed step). The config-registry owns CONTENT entities +
  content-tier tuning singletons. Each global has exactly one home. `_global.json` holds only the
  well-known id `refs` + `schemaVersion`.
- **Account = the six-section blob** (`src/account`, `@fortis/bishop-meta-contract`): `resources` (id-keyed
  wallet) / `unlocks` / `items` / `profile` / `features`. Every change is a transaction → patch →
  `applyPatch`. Backed locally now; a server swap is a wiring change (see `src/account/README.md`).
- **Baked, statically imported.** The build folds everything into `virtual:game-config` (+
  `virtual:asset-registry`) — no runtime `fetch` of `/data/*.json` (Capacitor-safe). Runtime reads via
  `src/data/config/repository.ts` / `ui-config-repository.ts`; **zod never enters the browser bundle**
  (runtime imports only inferred types).

## Module index

> Keep this table current — it is the map of the codebase. (See docs-track-code rule.) The core
> rows below ship with the framework skeleton; add one row per game module as you build.

| Module | Path | Purpose |
|---|---|---|
| DI container | `src/core/di` | Token-keyed IoC container (register/resolve/create). |
| Events | `src/core/events` | `Signal<T>` observer primitive. |
| Data | `src/data` | Sim/view live-HMR globals: tuning JSON + typed `store.ts` (+ `types.ts`). |
| Config (logical) | `src/data/config` | `manifest.ts` (CATEGORIES contract) + `game/**` per-entity JSON + `repository.ts` + `ui/**` + `ui-config-repository.ts`. The three-registry data layer. |
| Visual (VSM) | `src/view/combat/vsm` | Per-entity visual config schema + repository (thin, opt-in). |
| Account | `src/account` | Six-section economy blob + transactions + local store (`@fortis/bishop-meta-contract`). |
| Engine (npm) | `@fortis/bishop-*` | Published npm packages from the Fortis registry. 7 consumed as deps: config-registry, asset-registry, asset-types-2d, asset-processors, render-contract, meta-contract, meta-client. See "Working with the bishop engine packages". |
| Scaffold CLI | `config/` | `scaffold.mjs` + per-registry authoring + the blocking edit hook. |
| Game contracts | `src/game` | `types.ts` (World/System/Brain/etc.), `signals.ts` (signal hub), `content.ts` (read-model over `virtual:game-config`), `rng.ts`/`sim-random.ts` (seeded PRNG), `boot-content.ts`. |
| Game systems | `src/game/<system>` | The 12 ported pure sim modules: board, merge, generator, energy, orders, heroes, gear, gacha, rarities, progression, map, combat. Read config via `content.ts`; take an injected `rng`. |
| Store | `src/game/store` | `game-store.ts` = the live, subscribable world store (`createGameStore` → `getState`/`dispatch`/`subscribe` + a post-commit fx buffer `subscribeFx`/`getFxEpoch`/`takePendingFx` + `bus`) that runs the reducer OUTSIDE React; `actions.ts` (action map); `reducer.ts` = thin combinator over per-domain handler-map slices (`reducer-shell/board/orders/combat/gacha/heroes/gear.ts`) + shared `reducer-helpers.ts` (orchestration primitives + `initState`/`buildBattle`); `persistence.ts` (runtime slice ↔ six-section account blob; persists the run `seed`). |
| Game loop | `src/controller/game-loop.ts` | The single fixed-step accumulator on `requestAnimationFrame` (the sim's ONLY clock): advances regen + the battle tick (fixed `dt = C.BATTLE.tickMs`, clamp `maxCatchupMs`) + the 5 status resolvers, dispatching through the store. Replaces the former `setInterval`/`setTimeout` sim timers. |
| Minigame | `src/game/minigame` + `src/view/minigame` | Modular minigame harness. `game/minigame/meta.ts` = the server-authoritative reward endpoint (`submitMinigame`, simulated in-process, swappable for `@fortis/bishop-meta-client`). `view/minigame/registry.js` maps id→component; each minigame implements `{ input, onComplete(result) }`. Result → server → reward popup (grant on claim). |
| Controller | `src/controller` | React `GameProvider` (`GameContext.tsx`) — creates the live store, mounts the fixed-step rAF loop (`game-loop.ts`), seeds the PRNG from the persisted run seed, owns throttled persistence + AFK. Exposes the seam the view reads: `useGame` (full) / `useMetaGame` (no battle/fx/energy/now) / `useHudGame` (no battle/fx, keeps energy/now) / `useActions` / `useGameStore`. |
| Model (view barrels) | `src/model` | Thin re-export barrels of `src/game` selectors for the view — single source is `src/game` (no logic). |
| View | `src/view` | The ported MergeCombat React + Canvas-FX view (read-only). Reads content/presentation via `src/data/*` barrels + the `assets.js` resolver (art from `virtual:asset-registry`); state/actions via the controller. |
| Platform | `src/platform` | Host abstraction (browser / Capacitor): `haptics.ts` (browser Vibration now; Capacitor on device), audio, device tier. |
| Preview | `@fortis/bishop-device-preview` | Dev-only device-frame preview (phone bezel + device picker + safe-area overlay). Published npm package (devDep); `mountDevicePreview()` called from `main.tsx` behind an `import.meta.env.DEV` guard. Not part of the sim layers. |
| Marksman | `@fortis/bishop-marksman` | Dev-only markup/feedback overlay (`mountMarksman`, `main.tsx`) + capture endpoint (`/endpoint`, wired in `vite.config.ts`; writes captures to `.cache/markdown/`). Published npm package (devDep). `src/dev/marksman-out-of-frame.ts` relocates its FAB out of the device-preview bezel via an outer-window proxy button (device-preview host only). Not part of the sim layers. |
| Config editor | `src/config-editor` | Dev-only Vite endpoint backing `config-editor.html` — reads the registries + writes edits back through the real validator. |
| FTUE | `src/view/ftue` + `ftue` singleton | First-time-user-experience as a DETACHABLE override+flag layer. Sim-side overrides in the `ftue` config singleton (`C.FTUE`: zone-1 enemy counts, first-order potion, predetermined `summonAtLevel`-5 pull) read through guarded hooks in `buildWave`/`initState` (opens with `startingOrderSlots`)/`RESOLVE_WIN`/`TAP_LIMIT` (first FTUE limit = guaranteed crit-kill)/`RESOLVE_COMBAT` lose (re-arms the gear-up guide on the first 2 losses via `armGearGuide`)/`SUMMON`/`TAP_GENERATOR` (arms `ftueForged`)/`FULFILL_ORDER` (arms `ftueNormalOrder`, ramps order slots, and on the good-gear chest arms the gear guide + `ftueGearChest`)/`FILL_ORDER_GAP` (arms `ftueGearGiven`)/`LEVEL_UP_SQUAD`+`EQUIP_BEST_SQUAD` (squad power-up buttons; arm `ftueSquadLeveled`/`ftueSquadGeared`) + the `GameContext` battle tick (honours `flags.ftuePaused` for the `limit` freeze + Alchemist-explain beats); the coachmark overlay is `src/view/ftue` (its `beats.js` teaches actions via spotlight-target + auto-dismissing `done()`; it NEVER force-navigates — it rings the nav button). `enabledByDefault:false` (or clearing `flags.ftueActive`) makes the whole layer inert with zero gameplay impact. |
| Debug | `_debug.json` + `src/model/debug.js` + `src/game/store/reducer-debug.ts` | Dev-only debug features behind ONE schema-validated registry (the `debug` singleton). `debugFeatureOn(key)` = `import.meta.env.DEV && enabledByDefault && <feature>.defaultOn` → a prod build is ALWAYS inert; flipping `_debug.json` `enabledByDefault` toggles ALL debug at once, each feature's `defaultOn` toggles it alone. Registered features: `testMinigame` (top-bar button), `perfProbe` (press P), `giveCurrency` (press S → +`currencyGrant` of every upgrade currency — coins, heroXp, gearXp, all crystals — via `DEBUG_GRANT_CURRENCY`; hotkeys in `src/view/DebugHotkeys.jsx`). **To ADD a debug feature: register it in `_debug.json` `features` + gate its code on `debugFeatureOn('<key>')` — nothing else.** (Bishop framework devtools — device-preview, Marksman — are separate `import.meta.env.DEV` infra in `main.tsx`, not in this registry.) |
| _<your module>_ | `src/game/<module>` | _<purpose>_ |

**Skeleton modules this port does NOT use** (present in the framework skeleton; restore if you add
them): `src/core/math`, `src/core/bootstrap` (composition root), `src/app` (DI tokens / `GameApp`
facade), `src/input`, `src/preferences`, `src/testing`. This port wires through the **React controller**
(`src/controller/GameContext.tsx`) as its composition seam and takes input via React events — so the
DI/composition-root/app-facade scaffolding is absent by design. It DOES implement the framework's
**fixed-step run loop** (ARCHITECTURE.md "The run loop"), but as a controller-mounted module
(`src/controller/game-loop.ts`) driving the live `src/game/store/game-store.ts`, rather than the skeleton's
`src/app` run loop.

**Governance:** `.claude/` holds the advisory `arch-*` architecture-enforcement agents + the
`arch-review` / `arch-fix` orchestrator workflows (see `.claude/README.md`). Run them on feature
changes to keep these rules honest. `.claude/agents/` also holds **expert roles** — <!--EXPERTS:GOVERNANCE:START-->execution (`engineer`, `ui`, `game-tuning`, `tech-artist`), creative (`artist`, `merge-icon-author`), and read-only advisory (`product-owner`, `game-designer`)<!--EXPERTS:GOVERNANCE:END--> — that `run-changeset` routes each change to (falling back to
`general-purpose`); see the Expert roles section of `.claude/README.md`. These experts are
**customisable per project**: add one with the `/add-expert` skill or turn one off with
`/disable-expert` — both edit `.claude/experts/registry.json` (the source of truth) and regenerate
every wiring spot; see "Managing experts" in `.claude/README.md`. `run-changeset` is the sole
changeset runner (the `run-changeset.mjs` workflow): it fans out one worktree agent per change onto an
`integration/<slug>` branch, then gates the integrated result with `arch-review` (architecture), a
consolidated **`qa`** pass (`tsc`/build/`src/testing` harness — functional), and a completeness check
before the human-confirmed `main` ff-merge. There is no team mode / cross-worktree ordering.

**System execution order** — the sim advances through `src/game/store/reducer.ts` (action-driven, run by
the live `game-store.ts`) driven by ONE clock: the fixed-step accumulator on `requestAnimationFrame`
(`src/controller/game-loop.ts`, mounted by `GameContext.tsx`). Each frame it advances the sim in whole
`dt = C.BATTLE.tickMs` steps (regen + battle tick) and ticks the five battle-status resolver deadlines —
replacing the former `setInterval`/`setTimeout` timers. Player actions dispatch into the same store.

## Core mechanic (the core game rule)

No gameplay loop is implemented yet — Combat Clean is a blank starter. The invariants that ARE fixed
are the **data-driven contracts** (see *Data layer* below); an implementer must never regress these:

- **All content is data.** Stats, visuals, UI text, economy = schema-validated JSON. Adding content
  is adding a JSON file the runtime already understands (for id-kind) — not writing code. To scale a
  stat globally, **edit the actual data numbers** — never introduce a buried runtime multiplier.
- **One identity across three registries.** A content entry is a numeric `id` (id-kind) or string
  `key` (key-kind). The logical (`src/data/config/game`), visual (`src/data/visual-config`), and UI
  (`src/data/config/ui`) registries attach to the SAME id/key and nothing else crosses. No
  presentation (name/colour/icon) in logical config; no gameplay logic in the UI/visual registries;
  data is pure (no logic in data).
- **The account is the six-section blob.** Every account change is a transaction emitting an
  `AccountPatch` applied by the one pure `applyPatch` (see `src/account/README.md`). Balances live in
  the id-keyed `resources` wallet — never a per-currency field.

When you add the real loop, write its HARD INVARIANTS here (resource costs, what consumes what, sim
ordering) and reference the owning module's `README.md`.

## Asset style

> The `icon-gen` and `artist` agents read this section (and the owning asset module's `README.md`)
> to know your game's look before generating anything. Until you write it, `icon-gen` falls back to
> its documented white-silhouette + SDF-outline default and `artist` has no slice contract to honour.
> Fill in whichever apply once you start adding art; delete this note when you do.

- **Icon style:** _<fill colour / outline treatment / background / flat-vs-shaded — e.g. "solid white
  silhouette, 5px anti-aliased black outline, transparent background, no interior detail">_.
- **Asset-slicing contract** (for sprite sheets `artist` produces and `tech-artist`'s slicer
  consumes): _<colour key, gutter size, frame shape, per-subject anchor, and the on-screen scale
  convention — so sheets are sliceable by inference, never by hardcoded frame sizes>_.
- **Where art lives:** _<e.g. `public/<entities>/` for sheets, `assets/icons/` for UI icons>_.

## Conventions

- Files: kebab-case (`movement-system.ts`); types/classes PascalCase; UTF-8 (no BOM).
- Every gameplay number → JSON in `src/data`, typed in `src/data/types.ts`.
- **Number display (HARD RULE):** every player-facing **quantity** number (currencies, power,
  HP/ATK/DEF, damage, counts, costs) is formatted through the single shared `fmtK` in
  `src/view/fmt.js` — **under 1,000** shows the integer as-is; **1,000+** shows `x.xxk`; **1,000,000+**
  shows `x.xxm` (always 2 decimals, floored so a balance is never overstated). Never hand-roll k/m
  abbreviation anywhere else — import `fmtK`. Non-quantity text (timers `5.2s`, percentages, ratios
  like `100/100`) is exempt.
- World space is `(x, y)` — define your world axes here.
- Editor-only / dev-only code must not be reachable from `index.html` (so it stays out of the
  production bundle); guard with `import.meta.env.DEV`.
- **UI styling:** `src/ui` uses **Tailwind CSS v4** utility classes (`className`) for **static**
  style values. Any **data-driven or dynamic** value (sourced from the data store, props, state, or
  colour utils) stays an **inline `style`** — the "all tuning is data" rule forbids baking tunables
  into class strings. An element may carry both a `className` (static) and a `style` (dynamic).
- **Mockups & docs location (HARD RULE):** all UI mockups / prototypes — self-contained iteration HTML —
  live in `docs/mockups/`. Any other doc (design / planning / review) lives in `docs/`. Every future
  mockup goes in `docs/mockups/`, every doc in `docs/`; NEVER create a root `mockups/` folder, and never
  place a mockup or doc anywhere else.
- **Device frame:** the canvas + `#ui-root` live inside `#game-frame` and are sized to *its* box,
  never `window` — full-screen on every host, including desktop. Use a `ResizeObserver` on the
  canvas. For a desktop phone-bezel preview with a device picker, use the dev-only
  `@fortis/bishop-device-preview` package (`import.meta.env.DEV`-gated in `main.tsx`), not CSS.
- **Commit messages** use `[xxx][yyy] message` where `xxx` is a broad category
  (`fix`, `feat`, `doc`, `art`, `misc`) and `[yyy]` is an optional subcategory (`ui`, `gameplay`,
  `rendering`, `infra`, `build`). E.g. `[fix][rendering] correct draw-size formula`.
- **Game log messages** use `[xxx][module] message` where `xxx` is the log category
  (`game`, `ui`, `view`, `input`, `ai`, `net`, …) and `[module]` is the source module.

## Prompt routing — how a request becomes a change

Prompts are **auto-routed** so no one has to remember a command. A `UserPromptSubmit` hook
(`.claude/hooks/route-prompt.mjs`) runs on every prompt and injects the routing policy from
`.claude/router/policy.md` (unless raw-mode is set):

- **Questions / infra / docs / `.claude/**` / git-meta, and replies mid-task** → handled
  directly (raw).
- **Game-change requests** (`src/**`, `src/data/*.json` tuning, `public/**` art) → the `change`
  skill authors a changeset and runs `run-changeset.mjs`, **auto-merging to `main` when green**
  (all sub-steps delivered, `qa` PASS, arch clean) — otherwise it presents findings and asks.

**Raw-mode** (bypass routing, talk to Claude directly) has three scopes, checked in order:
global `~/.claude/router-global-raw` → repo `.claude/.router-mode` → per-prompt `raw:` / `!!`
sigil. Toggle with the `/router` skill (`/router raw|auto|status`; `/router power` for global).
Explicit `/run-changeset` is unchanged — it stays human-gated. The hook + `change` / `router`
skills are generic (portable to any repo); only `.claude/router/policy.md` is project-specific
(genericized here from `Combat Clean`'s fixed module layout — edit it if you add/rename modules).

## Changes — architecture enforcement

After making any code changes, run the `arch-review` workflow before reporting the task complete:

```js
Workflow({ scriptPath: ".claude/workflows/arch-review.mjs" })
```

This runs the architecture-enforcement agents in parallel over the current `git diff` (filtered to
changed file areas) and aggregates their findings. Address any concrete violations
(`file:line — issue — minimal fix`) before responding. If clean, say so in one line. Use
`Workflow({ scriptPath: ".claude/workflows/arch-fix.mjs" })` to additionally apply the minimal
fixes. Run from the repo root.

**Exception — changes delivered via `run-changeset`/`playtest`:** skip this post-hoc call. The
`run-changeset.mjs` workflow already runs `arch-review` over the integration branch (Phase: Review)
before the human ff-merge gate, and `git merge --ff-only` guarantees the commits landing on `main`
are byte-identical to what was reviewed there. Re-running it after the merge would review the exact
same diff a second time for no new signal.

## Docs-track-code rule (HARD RULE)

**Any change to a module's signal flow or a non-obvious invariant MUST update that module's
`README.md` in the same change.** Any structural change (new/removed/renamed module, new
convention, new command, new signal) **MUST** also update this file — especially the **Module
index** and the **System execution order**. A code change that leaves its module `README.md` or
this index stale is incomplete. Enforced by the `arch-module-docs` agent.

## Per-module README template

Each module folder carries a minimal `README.md`. Only include a section if it has content:

```
# <module> — <one-line purpose>
**Signals** — emitted ↑ / consumed ↓  (omit if none)
**Invariants** — non-obvious constraints a future editor must not break (omit if none)
```

Public API and dependency lists are omitted — TypeScript exports and the Module index above are the
source of truth for those.
