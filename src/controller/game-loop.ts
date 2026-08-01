// === game-loop — the single fixed-step accumulator on requestAnimationFrame (the sim's ONLY clock) ===
//
// Replaces the controller's two setInterval sim timers (REGEN + BATTLE) and the five one-shot setTimeout
// battle-status resolvers with ONE rAF loop, per ARCHITECTURE.md ("a fixed-step accumulator drives the
// sim; render once per rAF; never setInterval/setTimeout for sim timing"). It dispatches through the live
// store (the same reducer as player actions). Determinism: the sim advances in whole `dt = tickMs` steps,
// so the seeded rng draw sequence is identical to the old setInterval cadence.
//
// rAF is paused by the browser while the tab is HIDDEN, so this loop does not run in the background — the
// controller's visibilitychange handler credits the offline gap via RESUME_AFK on return (for ALL modes,
// including headless — the old setInterval kept headless combat ticking in a hidden tab; that reliance on
// background-throttled timers is deliberately dropped for the correct rAF model + offline accrual).
import { C } from '../game/content.ts';
import { A } from '../game/store/actions.ts';
import { isMarksmanPaused } from './dev-pause.ts';
import type { GameStore } from '../game/store/game-store.ts';

export interface LoopDeps {
  /** Wall-clock source (Date.now). Injected so the sim layer stays clock-free; only the loop reads time. */
  now: () => number;
}
// Note: headless mode needs no special-casing here. rAF runs only while the tab is VISIBLE, so
// headless-while-visible ticks like any other fighting state, and NOTHING ticks while hidden (the offline
// gap is credited by the controller's RESUME_AFK on return) — the old "headless keeps ticking in a hidden
// tab via setInterval" behaviour is deliberately dropped for the correct rAF + offline-accrual model.

// The five battle-status resolvers, verbatim from the old per-status setTimeout effect (durations in data).
type Resolver = { ms: () => number; action: () => any };

export function startGameLoop(store: GameStore, deps: LoopDeps): () => void {
  const { now } = deps;
  const dt = C.BATTLE.tickMs;                 // fixed sim step (ms)
  const maxCatchup = C.BATTLE.maxCatchupMs;   // per-frame elapsed clamp (anti spiral-of-death)
  const regenMs = C.RUNTIME.regenTickMs;

  const RESOLVERS: Record<string, Resolver> = {
    clearing: { ms: () => C.BATTLE.clearPauseMs, action: () => ({ type: A.SHOW_COMPLETE }) },
    lost: { ms: () => C.BATTLE.loseBannerMs, action: () => ({ type: A.RESOLVE_LOSS }) },
    won: { ms: () => C.BATTLE.completeBannerMs, action: () => ({ type: A.RESOLVE_WIN }) },
    chest: { ms: () => C.BATTLE.chestFallbackMs, action: () => ({ type: A.RESOLVE_CHEST }) },
    intro: { ms: () => C.BATTLE.introFallbackMs, action: () => ({ type: A.START_COMBAT }) },
  };

  let raf = 0;
  let last = now();
  let battleAcc = 0;   // sim-ms owed to the battle step (only accrues while actively fighting)
  let regenAcc = 0;    // real-ms since the last energy-regen sample
  let armedStatus: string | null = null; // the battle.status the resolver deadline is counting down for
  let resolverLeft = 0;                   // ms remaining before the armed resolver fires

  const frame = () => {
    const t = now();
    let elapsed = t - last;
    last = t;
    if (elapsed < 0) elapsed = 0;
    if (elapsed > maxCatchup) elapsed = maxCatchup; // clamp a jank/GC stall so it can't fast-forward the fight

    const s = store.getState();
    // Hard pause (AFK-collect popup or the dev Marksman markup tool) freezes EVERYTHING, as before.
    const hardPaused = s.afkOpen || isMarksmanPaused();

    // ── energy regen (~every regenMs of real time) — gated only by hard pause, like the old REGEN timer.
    // energy.regen is now-delta based, so this interval is only a sampling rate (exact cadence is not load-bearing).
    if (!hardPaused) {
      regenAcc += elapsed;
      if (regenAcc >= regenMs) { regenAcc = 0; store.dispatch({ type: A.REGEN_TICK, now: now() }); }
    }

    // ── battle fixed-step. Guards mirror the old BATTLE setInterval: hard pause + a pausing FTUE beat
    // freeze it. Only accrue while actually fighting, so a long intro/banner never builds a catch-up burst.
    const ftuePaused = !!(s.flags && s.flags.ftuePaused);
    if (!hardPaused && !ftuePaused && s.battle.status === 'fighting') {
      battleAcc += elapsed;
      while (battleAcc >= dt) { store.dispatch({ type: A.BATTLE_TICK, dt }); battleAcc -= dt; }
    } else {
      battleAcc = 0;
    }

    // ── battle-status resolvers (replace the five one-shot setTimeouts). Elapsed-based; re-armed when the
    // status changes; fire regardless of pause (the old setTimeouts were independent of the sim pause).
    const status = store.getState().battle.status; // re-read: a tick above may have changed it
    const resolver = RESOLVERS[status];
    if (resolver) {
      if (armedStatus !== status) { armedStatus = status; resolverLeft = resolver.ms(); }
      resolverLeft -= elapsed;
      if (resolverLeft <= 0) { armedStatus = null; store.dispatch(resolver.action()); }
    } else {
      armedStatus = null;
    }

    raf = requestAnimationFrame(frame);
  };

  // Reset the frame clock when the tab becomes visible again so the first post-hidden frame doesn't see the
  // whole background gap as `elapsed` (the offline gap is credited by the controller's RESUME_AFK, not here).
  const onVisible = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') { last = now(); } };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);

  raf = requestAnimationFrame(frame);
  return () => {
    if (raf) cancelAnimationFrame(raf);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
  };
}
