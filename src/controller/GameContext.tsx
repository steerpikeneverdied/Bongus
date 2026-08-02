// === GameProvider — reducer + owned timers + status resolvers + persistence + actions ===
// Ported near-verbatim from MergeCombat controller/GameContext.jsx. State + dispatch via useReducer;
// the seeded sim rng (seedSim) + content C are set at boot. Persistence routes through the six-section
// account (src/game/store/persistence). The view reads {state, actions} via useGame() — its seam.
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useSyncExternalStore, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { initState } from '../game/store/reducer.ts';
import { createGameStore, type GameStore } from '../game/store/game-store.ts';
import { A } from '../game/store/actions.ts';
import { C } from '../game/content.ts';
import { seedSim } from '../game/sim-random.ts';
import { loadSaved, save, clearSaved } from '../game/store/persistence.ts';
import { submitMinigame as metaSubmitMinigame } from '../game/minigame/meta.ts';
import { startGameLoop } from './game-loop.ts'; // the fixed-step rAF accumulator (replaces the setInterval/setTimeout sim timers)
import { excludedView, META_EXCLUDE, HUD_EXCLUDE } from './excluded-view.ts'; // memoized per-frequency state views

const StateContext = createContext<any>(null);
const ActionsContext = createContext<any>(null);
const StoreContext = createContext<GameStore | null>(null); // the live world store (for the bus + future selectors)
// Meta view (useMetaGame) — Board/Orders/NavBar/screens: skips the 5Hz battle tick AND the 1Hz regen tick.
// Hud view (useHudGame) — the currency bar (Header): keeps energy/now (1Hz regen) but skips the 5Hz battle.
// Exclude sets + the memoized `excludedView` live in excluded-view.ts (React-free → headlessly testable).
const MetaStateContext = createContext<any>(null);
const HudStateContext = createContext<any>(null);

// A "full screen" takes over the play area (combat panel + FxLayer hidden) and runs the engine HEADLESS
// — the sim keeps ticking, so returning to a combat screen resumes the exact, still-advancing gameplay.
// (The AFK collect popup is deliberately NOT one — it freezes the sim while you claim offline rewards.)
const FULL_SCREENS = ['map', 'gacha'];
export const isFullScreen = (s: any): boolean => !!s.menuHeroId || !!s.minigame || FULL_SCREENS.includes(s.screen);
// Engine runs headless during any full screen, or the manual background toggle.
export const engineHeadless = (s: any): boolean => !!s.headless || isFullScreen(s);
// The fx overlay (FxLayer) hosts BOTH combat VFX and cross-screen REVEALS (gacha pull, chest, currency),
// so it must stay mounted on combat screens AND the map/gacha full screens — only the hero menu,
// minigame, AFK popup, and manual background hide it. When it's absent, fx are drained here instead.
export const fxVisible = (s: any): boolean => !s.headless && !s.menuHeroId && !s.afkOpen && !s.minigame;

// Boundary-only PRNG seed generator: entropy is produced HERE (the composition seam), never inside the
// sim — so the reducer stays wall-clock/entropy free and a run is reproducible from its persisted seed.
const makeSeed = (): number => (((Date.now() >>> 0) ^ Math.floor(Math.random() * 0x100000000)) >>> 0);

export function GameProvider({ children }: { children: ReactNode }) {
  // The live world store owns the authoritative state + the sim clock (created ONCE per mount). The RAF
  // loop + player actions dispatch through it; React reads it via useSyncExternalStore. Replaces useReducer.
  const storeRef = useRef<GameStore | null>(null);
  if (!storeRef.current) {
    // Seed at the composition boundary (NOT in the sim): a saved run replays from its persisted seed; a
    // fresh run gets a new boundary-generated seed. seedSim() must run BEFORE initState (which draws rng).
    let saved: any = null; try { saved = loadSaved(); } catch { saved = null; }
    const seed = (saved && saved.seed != null) ? (saved.seed >>> 0) : makeSeed();
    seedSim(seed);
    let init: any; try { init = initState(Date.now(), saved, seed); } catch { init = initState(Date.now(), null, seed); }
    storeRef.current = createGameStore(init);
  }
  const store = storeRef.current!; // guaranteed set by the guard above
  const dispatch = store.dispatch; // stable; every effect/action below dispatches through the store unchanged
  const state = useSyncExternalStore(store.subscribe, store.getState);

  const stateRef = useRef(state);
  stateRef.current = state;

  // Stable "meta" view (excl battle/fx/energy/now) — meta consumers (screens) skip BOTH the 200ms battle
  // tick and the 1s regen tick, re-rendering only on real edits (gear/heroes/coins/screen/board/orders/…).
  const metaRef = useRef<any>(null);
  metaRef.current = excludedView(state, metaRef.current, META_EXCLUDE);
  const metaState = metaRef.current;
  // Stable "hud" view (excl only battle/fx) — the currency bar keeps energy/now (updates on the 1s regen
  // tick) but is spared the 5Hz battle re-render.
  const hudRef = useRef<any>(null);
  hudRef.current = excludedView(state, hudRef.current, HUD_EXCLUDE);
  const hudState = hudRef.current;

  // ONE fixed-step accumulator on requestAnimationFrame drives the whole sim — energy regen, the battle
  // tick, and the five battle-status resolvers — replacing the former two setInterval timers + five
  // setTimeout resolvers. It dispatches through the SAME store/reducer as player actions, in fixed
  // dt = tickMs steps (deterministic). See src/controller/game-loop.ts. `store` is stable → runs once.
  useEffect(() => startGameLoop(store, { now: Date.now }), [store]);

  // (fx no longer accumulates in state — the store drains each dispatch's fx onto world.bus, and FxLayer
  // subscribes only while mounted, so an unmounted combat view simply drops the events. No queue to clear.)

  // (The five battle-status resolvers formerly scheduled here as one-shot setTimeouts now live on the rAF
  // accumulator in game-loop.ts — one clock for all sim timing.)

  // AREA COMPLETE with a BOARD AWARD (a generator unlock): route to the merge tab so the generator can
  // dramatically fly onto the board (the combat panel keeps showing the earnings synopsis on top). No
  // route/cinematic for a plain clear. The generatorUnlock cinematic (FxLayer) waits for the board to mount.
  useEffect(() => {
    if (state.battle.status === 'areaComplete' && state.pendingArea && state.pendingArea.unlocked && state.pendingArea.unlocked.length && state.screen !== 'merge') {
      dispatch({ type: A.SET_SCREEN, screen: 'merge' });
    }
  }, [state.battle.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist (throttled) with a guaranteed TRAILING save + an unmount flush, so the LATEST state is never
  // dropped. The old leading-edge-only throttle lost the last <persistThrottleMs of updates (e.g. a hero
  // level-up) when a reload / Vite-HMR remount landed before the next state change triggered a save.
  const lastSaveRef = useRef(0);
  const trailingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const due = C.RUNTIME.persistThrottleMs - (Date.now() - lastSaveRef.current);
    if (due <= 0) { lastSaveRef.current = Date.now(); save(state); }
    else { // within the throttle window — schedule a trailing save of the LATEST state (stateRef)
      if (trailingRef.current) clearTimeout(trailingRef.current);
      trailingRef.current = setTimeout(() => { lastSaveRef.current = Date.now(); trailingRef.current = null; save(stateRef.current); }, due);
    }
  }, [state]);
  // Flush the latest state on teardown (HMR remount / unmount) — pagehide does NOT fire on an HMR swap.
  useEffect(() => () => { if (trailingRef.current) clearTimeout(trailingRef.current); save(stateRef.current); }, []);

  useEffect(() => {
    const flush = () => save(stateRef.current);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
      // The rAF sim loop is paused by the browser while hidden — for EVERY mode now (headless included),
      // so credit the offline gap via RESUME_AFK on return in all modes (game-loop.ts drops the old
      // setInterval reliance that let headless combat tick in a background tab).
      else dispatch({ type: A.RESUME_AFK, now: Date.now() });
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => { document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('pagehide', flush); };
  }, []);

  const actions = useMemo(() => ({
    setScreen: (screen: string) => dispatch({ type: A.SET_SCREEN, screen }),
    setHeroMenu: (heroId: string | null) => dispatch({ type: A.SET_HERO_MENU, heroId }),
    setAfkOpen: (open: boolean) => dispatch({ type: A.SET_AFK_OPEN, open }),
    setHeadless: (on: boolean) => dispatch({ type: A.SET_HEADLESS, on }),
    startMinigame: (id: string, input: unknown = null) => dispatch({ type: A.SET_MINIGAME, minigame: { id, input } }),
    // Dev/test: instantly launch a RANDOM pooled minigame with the standard context (no transition).
    startRandomMinigame: () => dispatch({ type: A.START_RANDOM_MINIGAME }),
    exitMinigame: () => dispatch({ type: A.SET_MINIGAME, minigame: null }),
    // A finished minigame submits its result to the (simulated) server, which resolves the reward; the
    // controller owns this async round-trip and dispatches the outcome (grant + reward popup).
    submitMinigame: async (id: string, result: unknown) => {
      const outcome = await metaSubmitMinigame({ minigameId: id, result: (result || {}) as any });
      dispatch({ type: A.FINISH_MINIGAME, reward: outcome.reward, source: 'minigame' });
    },
    closeReward: () => dispatch({ type: A.CLOSE_REWARD }),
    // The screen-crumble transition overlay finished (it already launched the minigame at the cinematic apex).
    clearTransition: () => dispatch({ type: A.CLEAR_TRANSITION }),
    // Set a persisted feature/FTUE flag (e.g. the FTUE calls setFlag('specialOrders', true) to unlock special orders).
    setFlag: (flag: string, value = true) => dispatch({ type: A.SET_FLAG, flag, value }),
    setBattleLevel: (level: number) => dispatch({ type: A.SET_BATTLE_LEVEL, level }),
    // Start a zone from its first room: (re)spawn that level on the zone-intro cinematic, then show the
    // merge screen (combat panel on top plays the intro; board below).
    startZone: (level: number) => { dispatch({ type: A.SET_BATTLE_LEVEL, level, intro: true }); dispatch({ type: A.SET_SCREEN, screen: 'merge' }); },
    collectAfk: () => dispatch({ type: A.COLLECT_AFK }),
    tapGenerator: (index: number) => dispatch({ type: A.TAP_GENERATOR, index, now: Date.now() }),
    moveOrMerge: (from: number, to: number) => dispatch({ type: A.MOVE_OR_MERGE, from, to }),
    fulfillOrder: (orderId: number, orderPt?: any) => dispatch({ type: A.FULFILL_ORDER, orderId, orderPt }),
    fillOrderGap: (orderId: number) => dispatch({ type: A.FILL_ORDER_GAP, orderId }),
    emptyOrder: (orderId: number) => dispatch({ type: A.EMPTY_ORDER, orderId }),
    rerollOrder: (orderId: number) => dispatch({ type: A.REROLL_ORDER, orderId }),
    tapLimit: (heroId: string) => dispatch({ type: A.TAP_LIMIT, heroId }),
    setFocusTarget: (uid: number) => dispatch({ type: A.SET_FOCUS_TARGET, uid }),
    challengeNext: () => dispatch({ type: A.CHALLENGE_NEXT }),
    acceptAreaComplete: () => dispatch({ type: A.ACCEPT_AREA_COMPLETE }),
    startCombat: () => dispatch({ type: A.START_COMBAT }),
    pauseChest: () => dispatch({ type: A.PAUSE_CHEST }),
    resolveChest: () => dispatch({ type: A.RESOLVE_CHEST }),
    summon: (bannerId: string, count = 1) => dispatch({ type: A.SUMMON, bannerId, count }),
    ascendHero: (cid: string) => dispatch({ type: A.ASCEND_HERO, id: cid }),
    levelUpHero: (id: string) => dispatch({ type: A.LEVEL_UP_HERO, id }),
    levelUpHeroMax: (id: string) => dispatch({ type: A.LEVEL_UP_HERO_MAX, id }),
    equipItem: (heroId: string, gearId: string) => dispatch({ type: A.EQUIP_ITEM, heroId, gearId }),
    levelAllOne: (id: string) => dispatch({ type: A.LEVEL_ALL_ONE, id }),
    levelAllMax: (id: string) => dispatch({ type: A.LEVEL_ALL_MAX, id }),
    swapHeroes: (a: string, b: string) => dispatch({ type: A.SWAP_HEROES, a, b }),
    autoEquip: () => dispatch({ type: A.AUTO_EQUIP }),
    autoLevel: () => dispatch({ type: A.AUTO_LEVEL }),
    autoHero: (id: string) => dispatch({ type: A.AUTO_HERO, id }),
    levelGear: (id: string) => dispatch({ type: A.LEVEL_GEAR, id }),
    fuseGear: (id: string) => dispatch({ type: A.FUSE_GEAR, id }),
    equipBest: (id: string) => dispatch({ type: A.EQUIP_BEST, id }),
    levelUpSquad: () => dispatch({ type: A.LEVEL_UP_SQUAD }),
    equipBestSquad: () => dispatch({ type: A.EQUIP_BEST_SQUAD }),
    upgradeHero: (id: string) => dispatch({ type: A.UPGRADE_HERO, id }),
    debugGrantCurrency: () => dispatch({ type: A.DEBUG_GRANT_CURRENCY }),
    resetGame: () => { clearSaved(); const seed = makeSeed(); seedSim(seed); dispatch({ type: A.RESET_GAME, now: Date.now(), seed }); },
  }), []);

  return (
    <StoreContext.Provider value={store}>
      <ActionsContext.Provider value={actions}>
        <MetaStateContext.Provider value={metaState}>
          <HudStateContext.Provider value={hudState}>
            <StateContext.Provider value={state}>{children}</StateContext.Provider>
          </HudStateContext.Provider>
        </MetaStateContext.Provider>
      </ActionsContext.Provider>
    </StoreContext.Provider>
  );
}

// The live world store (stable). FxLayer reads its buffered fx (subscribeFx/getFxEpoch/takePendingFx);
// `bus` is the signal hub for future cross-module events. Stable across renders — reading it never re-renders.
export const useGameStore = (): GameStore => {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useGameStore must be used within <GameProvider>');
  return store;
};

export const useGame = () => {
  const state = useContext(StateContext);
  const actions = useContext(ActionsContext);
  if (state == null || actions == null) throw new Error('useGame must be used within <GameProvider>');
  return { state, actions };
};
// Like useGame, but reads the META view (state without battle/fx). Components that don't render combat
// (Game shell, Heroes/Gear screens) use this so a BATTLE_TICK doesn't re-render them. The returned
// `state` has NO `battle`/`fx` — never read those through this hook.
export const useMetaGame = () => {
  const state = useContext(MetaStateContext);
  const actions = useContext(ActionsContext);
  if (state == null || actions == null) throw new Error('useMetaGame must be used within <GameProvider>');
  return { state, actions };
};
// Like useGame, but reads the HUD view (state without battle/fx — KEEPS energy/now). The currency bar
// (Header) uses this so a BATTLE_TICK doesn't re-render it, while energy/now still update on the regen tick.
// The returned `state` has NO `battle`/`fx` — never read those through this hook.
export const useHudGame = () => {
  const state = useContext(HudStateContext);
  const actions = useContext(ActionsContext);
  if (state == null || actions == null) throw new Error('useHudGame must be used within <GameProvider>');
  return { state, actions };
};
export const useActions = () => {
  const actions = useContext(ActionsContext);
  if (actions == null) throw new Error('useActions must be used within <GameProvider>');
  return actions;
};
