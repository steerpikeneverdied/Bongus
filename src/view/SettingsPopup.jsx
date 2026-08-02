// === SettingsPopup — the cog-triggered settings modal (regular + debug sections) ===
// Combat keeps running behind it (non-pausing) so debug render toggles A/B live. The DEBUG section is the
// SINGLE home for all debug functionality: a grid rendered from the _debug.json feature registry, each
// entry a TOGGLE (checkbox → a runtime flag) or a BUTTON (one-shot action), wired by feature.key below.
import { useReducer } from 'react';
import { useActions } from '../controller/GameContext';
import { debugEnabled, debugFeatures } from '../model/debug.js';
import { noShadows, noParticles, setNoShadows, setNoParticles } from './fx/fx-debug.js';
import { copyPerfLog } from './fx/perf-probe.js';

const PROFILE = import.meta.env.VITE_PERF === true; // profiling build → debug section available on device too

export default function SettingsPopup({ onClose }) {
  const actions = useActions();
  const [, force] = useReducer((x) => x + 1, 0); // re-render to reflect a toggle after it flips
  const showDebug = debugEnabled() || PROFILE;

  // Per-feature wiring, keyed by _debug.json feature.key.
  const TOGGLES = {
    noShadows: { get: noShadows, set: setNoShadows },
    noParticles: { get: noParticles, set: setNoParticles },
  };
  const BUTTONS = {
    testMinigame: () => actions.startRandomMinigame(),
    giveCurrency: () => actions.debugGrantCurrency(),
    perfProbe: () => copyPerfLog(),
  };

  const onReset = () => { if (window.confirm('Reset ALL progress? This cannot be undone.')) { actions.resetGame(); onClose(); } };

  return (
    <div className="settings-scrim" onClick={onClose} role="dialog" aria-label="Settings">
      <div className="settings-card" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <span>Settings</span>
          <button type="button" className="settings-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="settings-sect">
          <div className="settings-sect-h">General</div>
          <button type="button" className="settings-btn danger" onClick={onReset}>Reset progress</button>
        </div>

        {showDebug && (
          <div className="settings-sect">
            <div className="settings-sect-h">Debug</div>
            <div className="settings-grid">
              {debugFeatures().map((f) => {
                const t = TOGGLES[f.key];
                if (t) return (
                  <label key={f.key} className="settings-toggle" title={f.description}>
                    <input type="checkbox" checked={t.get()} onChange={(e) => { t.set(e.target.checked); force(); }} />
                    <span>{f.label}</span>
                  </label>
                );
                const b = BUTTONS[f.key];
                if (b) return (
                  <button key={f.key} type="button" className="settings-btn" title={f.description} onClick={b}>{f.label}</button>
                );
                return null; // a feature with no wiring here (shouldn't happen) — silently skipped
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
