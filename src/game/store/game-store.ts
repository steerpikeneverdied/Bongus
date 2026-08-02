// === game-store — the live, subscribable world store (the sim clock's home; runs the existing reducer) ===
//
// Lifts the reducer OUT of React (it used to live in GameContext's useReducer). The authoritative run
// state lives here; the RAF loop (controller) and player actions BOTH dispatch through the SAME reducer,
// and React reads via useSyncExternalStore(subscribe, getState). One state path relocated out of React's
// render cycle — NOT a parallel mechanism. `bus` (createGameSignals) is the cross-module signal hub for
// future non-view events.
//
// VFX delivery: the reducer stays pure — it still emits pure-data `fx` events on the state it returns. The
// store facade lifts each dispatch's `fx` batch into a separate `pendingFx` buffer (kept OUT of the
// subscribed snapshot, so per-tick fx never re-renders state consumers) and bumps `fxEpoch`. FxLayer
// subscribes via useSyncExternalStore(subscribeFx, getFxEpoch) and drains `takePendingFx()` in a
// POST-COMMIT effect — so VFX handlers query freshly-committed DOM (e.g. a just-merged icon's cell before
// its limit-charge mote fires). This preserves the pre-store fx timing while removing the old CLEAR_FX
// second re-render.
import { reducer } from './reducer.ts';
import { createGameSignals } from '../signals.ts';
import type { GameSignals, FxEvent } from '../types.ts';

const EMPTY_FX: FxEvent[] = [];

export interface GameStore {
  /** Current authoritative state. Reference is stable between changes (safe for useSyncExternalStore). */
  getState(): any;
  /** Run `action` through the existing reducer; if the state reference changes, notify subscribers. */
  dispatch(action: any): void;
  /** Subscribe to state changes; returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Subscribe to VFX-event arrivals (getFxEpoch changes); returns an unsubscribe. */
  subscribeFx(listener: () => void): () => void;
  /** Monotonic counter bumped whenever a new fx batch is buffered — the useSyncExternalStore snapshot. */
  getFxEpoch(): number;
  /** Take + clear the buffered VFX events (drained post-commit by FxLayer). */
  takePendingFx(): FxEvent[];
  /** The cross-module signal hub (world.bus) for future non-view cross-module events. */
  readonly bus: GameSignals;
}

export function createGameStore(initial: any): GameStore {
  let state = initial;
  const listeners = new Set<() => void>();
  const fxListeners = new Set<() => void>();
  const bus = createGameSignals();

  let pendingFx: FxEvent[] = EMPTY_FX; // VFX events awaiting FxLayer's post-commit drain (NOT in `state`)
  let fxEpoch = 0;

  const getState = () => state;
  const subscribe = (listener: () => void): (() => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  const subscribeFx = (listener: () => void): (() => void) => {
    fxListeners.add(listener);
    return () => { fxListeners.delete(listener); if (fxListeners.size === 0) pendingFx = EMPTY_FX; }; // FxLayer gone → drop any residual
  };
  const getFxEpoch = () => fxEpoch;
  const takePendingFx = (): FxEvent[] => { const b = pendingFx; pendingFx = EMPTY_FX; return b; };

  const dispatch = (action: any): void => {
    const next = reducer(state, action);
    // The reducer returns the SAME reference for a no-op action (e.g. BATTLE_TICK while not fighting).
    // Skip the notify then — this preserves useReducer's bail-out (no wasted re-render).
    if (next === state) return;
    // Lift the reducer's pure-data VFX events off the subscribed snapshot (keeps per-tick fx out of React
    // state — the removal of the old CLEAR_FX second re-render). `next` is a fresh object (next !== state),
    // so mutating next.fx here is safe. Buffer for FxLayer's post-commit drain ONLY while it is subscribed
    // (mounted); when it's unmounted (full screen / headless / hero-menu / AFK popup) there is NO consumer,
    // so DROP the events — they are view-only and must never accumulate + replay as a burst on remount.
    if (next.fx && next.fx.length) {
      const events = fxListeners.size > 0 ? (next.fx as FxEvent[]) : null;
      next.fx = [];
      state = next;
      if (events) {
        pendingFx = pendingFx.length ? pendingFx.concat(events) : events; // accumulate until FxLayer drains this frame
        fxEpoch = (fxEpoch + 1) | 0;
      }
      for (const l of listeners) l();
      if (events) for (const l of fxListeners) l();
    } else {
      state = next;
      for (const l of listeners) l();
    }
  };

  return { getState, dispatch, subscribe, subscribeFx, getFxEpoch, takePendingFx, bus };
}
