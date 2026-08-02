// === fx-debug — dev/profile-only RENDER toggles for A/B-ing on-device render cost (view layer) ===
// Two runtime flags, driven by the Settings ▸ Debug grid (SettingsPopup) and applied here:
//   • noShadows   — adds a root class the CSS keys off to kill ALL drop-shadow / box-shadow / text-shadow /
//     blur / backdrop-filter (the mobile-WebView compositing killers). A running WAAPI filter animation
//     overrides even `!important`, so the one JS-animated drop-shadow (HpBar's whole-bar flash) also reads
//     `noShadows()` and omits its shadow.
//   • noParticles — turns the fx-engine's particle spawns off (+ clears the live ones) via fx.setParticlesEnabled.
// Persisted to localStorage so an on-device A/B survives an app relaunch. NOT game state — pure view.
import { fx } from './fx-engine.js';

const KEY_SHADOWS = 'cc.debug.noShadows';
const KEY_PARTICLES = 'cc.debug.noParticles';
const readFlag = (k) => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };
const writeFlag = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* private mode */ } };

let _noShadows = readFlag(KEY_SHADOWS);
let _noParticles = readFlag(KEY_PARTICLES);

const applyShadows = () => { try { document.documentElement.classList.toggle('fx-no-shadows', _noShadows); } catch { /* no DOM yet */ } };

export const noShadows = () => _noShadows;
export const noParticles = () => _noParticles;
export function setNoShadows(on) { _noShadows = !!on; writeFlag(KEY_SHADOWS, _noShadows); applyShadows(); }
export function setNoParticles(on) { _noParticles = !!on; writeFlag(KEY_PARTICLES, _noParticles); fx.setParticlesEnabled(!_noParticles); }

// Apply persisted state at import (pulled in at boot via Game.jsx) so an A/B survives a reload/relaunch.
applyShadows();
fx.setParticlesEnabled(!_noParticles);
