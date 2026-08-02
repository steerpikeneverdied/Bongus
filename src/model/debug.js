// === debug — runtime gate for ALL debug features (view/model reader) ===
// The ONE choke-point every debug feature checks. A feature is active only in a DEV build, with the
// master switch on, and its own registry entry on — so a prod build (import.meta.env.DEV false) is
// ALWAYS inert. Config lives in the schema-validated `debug` singleton (src/data/config/game/_debug.json).
// To add a debug feature: register it in `_debug.json` `features` and gate its code on
// `debugFeatureOn('<key>')`. Nothing else.
import { C } from '../game/content.ts';

// Master: DEV build AND the master switch on. false → every debug feature is inert.
export const debugEnabled = () => !!(import.meta.env.DEV && C.DEBUG && C.DEBUG.enabledByDefault);

// A single feature is active iff debug is enabled AND its registry entry's defaultOn is set.
export const debugFeatureOn = (key) => {
  if (!debugEnabled()) return false;
  const f = (C.DEBUG.features || []).find((x) => x.key === key);
  return !!(f && f.defaultOn);
};

// The debug-feature registry, for the Settings ▸ Debug grid to render (toggles/buttons). Read-model access
// so the view never imports game/content directly.
export const debugFeatures = () => ((C.DEBUG && C.DEBUG.features) || []).filter((f) => f.defaultOn);
