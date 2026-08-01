// === DebugHotkeys — dev-only keyboard debug commands (view) ===
// Mounted from Game.jsx behind `import.meta.env.DEV`; each hotkey ALSO gates on its own
// `debugFeatureOn(key)`, so the whole set is toggled by the debug master flag / per-feature flags in
// `_debug.json`. Renders nothing. To add a hotkey: register the feature in `_debug.json` `features` and
// add a gated branch here.
import { useEffect } from 'react';
import { useActions } from '../controller/GameContext';
import { debugFeatureOn } from '../model/debug.js';

export default function DebugHotkeys() {
  const actions = useActions();
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
      if ((e.key === 's' || e.key === 'S') && debugFeatureOn('giveCurrency')) actions.debugGrantCurrency();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions]);
  return null;
}
