// === debug — the debug-feature registry (singleton) ===
//
// One master switch + one schema-validated entry per debug feature. The runtime (src/model/debug.js)
// gates EVERY debug feature on `debugFeatureOn(key)` = `import.meta.env.DEV && enabledByDefault &&
// <feature>.defaultOn`. So a prod build (import.meta.env.DEV false) is ALWAYS inert, and flipping
// `enabledByDefault` toggles ALL debug at once. To add a debug feature: register it here (in the
// `_debug.json` `features` list) and gate its code on `debugFeatureOn('<key>')` — nothing else.
import { z } from 'zod';

export const zDebugConfig = z.object({
  enabledByDefault: z.boolean().describe('Master switch — ANDed with import.meta.env.DEV. false → ALL debug features inert.'),
  currencyGrant: z.number().int().min(0).describe('Amount of EACH upgrade currency (coins, heroXp, gearXp, every crystal rarity) granted by the Settings ▸ Debug "Give currency" button.'),
  features: z.array(z.object({
    key: z.string().describe('Stable key the runtime gates on (debugFeatureOn) + the Settings grid dispatches on.'),
    label: z.string().describe('Short human label shown in the Settings debug grid.'),
    description: z.string().describe('What the feature does.'),
    kind: z.enum(['toggle', 'button']).describe('Settings-grid control: `toggle` = a persistent checkbox (a runtime flag); `button` = a one-shot action.'),
    defaultOn: z.boolean().describe('Whether this feature is active/shown while debug is enabled.'),
  }).strict()).describe('Every debug feature, each schema-validated + rendered in the Settings ▸ Debug grid. Add one here + wire its key in SettingsPopup.'),
}).strict();
