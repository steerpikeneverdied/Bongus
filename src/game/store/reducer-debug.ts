// === reducer slice: debug — dev-only grants/cheats ===
// The DISPATCH SITE gates on `debugFeatureOn(...)` (src/model/debug.js); these handlers are pure state
// transforms. Amounts come from the schema-validated `debug` singleton (C.DEBUG). Registered in reducer.ts.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { C } from '../content.ts';
import { A } from './actions.ts';

type S = any;

export const debugHandlers: Record<string, (state: S) => S> = {
  // Grant `currencyGrant` of EVERY upgrade currency: coins, heroXp, gearXp, and each crystal rarity.
  [A.DEBUG_GRANT_CURRENCY]: (state) => {
    const amt = (C.DEBUG && C.DEBUG.currencyGrant) || 0;
    const crystals: any = { ...state.crystals };
    for (const k of Object.keys(crystals)) crystals[k] = (crystals[k] || 0) + amt;
    return { ...state, coins: state.coins + amt, heroXp: state.heroXp + amt, gearXp: state.gearXp + amt, crystals };
  },
};
