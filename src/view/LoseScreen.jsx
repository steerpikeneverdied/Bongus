// LoseScreen — the redesigned defeat overlay (replaces the old .lose-banner). Rendered INSIDE .battle
// (Autobattler) so it dims ONLY the combat area — the header, board and nav stay visible. Pure
// presentation: it READS battle/squad state + the recommended-power selector and dispatches only
// navigation actions. The auto-retry is owned by the controller (RESOLVE_LOSS fires after
// BATTLE.loseBannerMs, replaying the same level in `recovering`); this countdown is the visual sync.
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../controller/GameContext';
import { heroPower } from '../model/heroes.js';
import { heroGearPower } from '../model/gear.js';
import { recommendedPowerForLevel } from '../model/map.js';
import { STRINGS } from '../data/strings.js';
import { BATTLE, VFX_CONFIG } from '../data/config.js';
import { fmtKr } from './fmt.js';

export default function LoseScreen() {
  const { state, actions } = useGame();
  const level = state.battle.level;
  const returnLevel = Math.max(1, level - 1); // a loss drops you back one level (RESOLVE_LOSS) — show where you'll actually land

  // SQUAD POWER = sum of the deployed squad's heroPower; RECOMMENDED = the lost node's wave power.
  const squad = state.battle.heroes.reduce((sum, h) => {
    const ch = state.heroes[h.id];
    return sum + (ch ? heroPower(ch.hero, ch, state.ordersCompleted, heroGearPower(state.gear, h.id)) : 0);
  }, 0);
  const recommended = recommendedPowerForLevel(level);
  const WITHIN_PCT = 0.05; // squad within ±5% of recommended reads as "close enough"
  const within = Math.abs(squad - recommended) <= recommended * WITHIN_PCT;
  const squadClass = within ? 'near' : (squad > recommended ? 'above' : 'below'); // orange / green / red — colours in CSS
  const below = squad < recommended; // recommended text pulses when you're under it

  const wordRef = useRef(null), layerRef = useRef(null);
  const total = BATTLE.loseBannerMs;
  const secsStart = Math.max(1, Math.floor(total / 1000));
  const [cd, setCd] = useState(secsStart);

  useEffect(() => {
    const timers = [];
    // ── countdown (cosmetic; the controller fires RESOLVE_LOSS at loseBannerMs) ──
    let n = secsStart; setCd(n);
    const firstTick = Math.max(300, total - (secsStart - 1) * 1000); // hold the first number a touch longer
    const step = () => { n -= 1; if (n >= 1) { setCd(n); timers.push(setTimeout(step, 1000)); } };
    timers.push(setTimeout(step, firstTick));

    // ── red drip emitter — limit-blob motion, downward, from inside the glyph bottoms ──
    const B = VFX_CONFIG.combat.loseDrips;
    const emitOne = (x) => {
      const word = wordRef.current, layer = layerRef.current;
      if (!word || !layer) return;
      const wh = word.offsetHeight, bp = B.blobPx;
      const el = document.createElement('span');
      el.className = 'lose-drip';
      el.style.left = x + 'px';
      el.style.top = (B.startY / 100 * wh) + 'px';
      el.style.width = bp + 'px'; el.style.height = bp + 'px';
      el.style.margin = (-bp / 2) + 'px 0 0 ' + (-bp / 2) + 'px';
      el.style.transition = 'none';
      el.style.transform = 'translate(0,0) scale(' + B.popScale + ')';
      layer.appendChild(el);
      const spread = (Math.random() - 0.5) * (B.arcDeg * Math.PI / 180);
      const dist = B.distMin + Math.random() * Math.max(0, B.distMax - B.distMin);
      const dx = (Math.sin(spread) * dist).toFixed(1), dy = (Math.cos(spread) * dist).toFixed(1); // dy>0 → down
      void el.offsetWidth; // commit start frame
      el.style.transition = 'transform ' + B.popMs + 'ms ease-out';
      el.style.transform = 'translate(0,0) scale(1)';
      timers.push(setTimeout(() => {
        el.style.transition = 'transform ' + B.flyMs + 'ms ease-out';
        el.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(0)';
      }, B.popMs));
      timers.push(setTimeout(() => el.remove(), B.popMs + B.flyMs + 80));
    };
    const emitTick = () => {
      const word = wordRef.current;
      if (word) {
        const wl = word.offsetWidth, lo = B.inset, span = Math.max(0, (wl - B.inset) - lo);
        for (let i = 0; i < B.countPerTick; i++) emitOne(lo + Math.random() * span);
      }
      timers.push(setTimeout(emitTick, B.emitMs));
    };
    timers.push(setTimeout(emitTick, 430));

    return () => { timers.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="lose-overlay">
      <div className="lose-scrim" aria-hidden="true" />
      <div className="lose-stripe">
        <div className="lose-word-wrap">
          <span className="lose-word" ref={wordRef}>
            {STRINGS.combat.lose.split('').map((c, i) => <span className="ll" key={i}>{c}</span>)}
          </span>
          <div className="lose-drip-layer" ref={layerRef} aria-hidden="true" />
        </div>
        <div className="lose-power">
          <span className="pw-lab">{STRINGS.combat.squadPower}</span>
          <span className={'pw-val ' + squadClass}>{fmtKr(squad)}</span>
          <span className={'pw-lab' + (below ? ' pulse' : '')}>{STRINGS.combat.recommended}</span>
          <span className={'pw-val' + (below ? ' pulse' : '')}>{fmtKr(recommended)}</span>
        </div>
        <div className="lose-restart">
          {STRINGS.combat.returnTo} <span className="node-dot"><b>{returnLevel}</b></span> in <b className="cd">{cd}</b>{STRINGS.combat.secsAbbr}
        </div>
      </div>
      <div className="lose-actions">
        <button type="button" className="lose-btn secondary" onClick={() => actions.setScreen('heroes')}>{STRINGS.combat.heroScreen}</button>
        <button type="button" className="lose-btn primary" onClick={() => actions.setScreen('gacha')}>{STRINGS.combat.getMoreHeroes}</button>
      </div>
    </div>
  );
}
