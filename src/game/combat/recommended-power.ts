// === recommended-power — per-node (level) recommended squad power, derived from the enemy wave ===
// The RECOMMENDED power for a node = the total power of that level's enemy wave, measured with the
// SAME metric as heroPower (atk·powerAtkWeight + hp/powerHpDivisor, both from C.HERO_COMBAT) so it is
// directly comparable to SQUAD POWER (the sum of the deployed squad's heroPower). Computed by REUSING
// buildWave (no parallel scaling formula) with a fixed per-level seed, so the estimate is
// deterministic. Memoized — values depend only on content (C), never on run state.
import { C } from '../content.ts';
import { makeRng } from '../rng.ts';
import type { Enemy } from '../types.ts';
import { buildWave } from './battle.ts';
import { zoneStartLevel, zoneBossLevel } from '../map/map.ts';

/** Enemy power in the same units as heroPower (so RECOMMENDED is comparable to SQUAD POWER). */
export const enemyPower = (hp: number, atk: number): number =>
  atk * C.HERO_COMBAT.powerAtkWeight + Math.round(hp / C.HERO_COMBAT.powerHpDivisor);

const _levelCache = new Map<number, number>();
/** RECOMMENDED squad power for one node (combat level): the summed power of that level's enemy wave. */
export const recommendedPowerForLevel = (level: number): number => {
  const lv = Math.max(1, Math.floor(level) || 1);
  const hit = _levelCache.get(lv);
  if (hit != null) return hit;
  // Reuse the real wave builder with a fixed per-level seed → a deterministic representative wave.
  // ftueActive=false: the recommendation reflects the standard formula, not the zone-1 tutorial overrides.
  const wave: Enemy[] = buildWave(lv, makeRng(lv), () => 0, false);
  let p = 0;
  for (const e of wave) p += enemyPower(e.maxHp, e.atk);
  const out = Math.round(p);
  _levelCache.set(lv, out);
  return out;
};

const _zoneCache = new Map<number, { min: number; max: number }>();
/** RECOMMENDED power RANGE for an area (zone) — min/max across its constituent nodes' powers. */
export const zoneRecommendedRange = (zoneIndex: number): { min: number; max: number } => {
  const hit = _zoneCache.get(zoneIndex);
  if (hit) return hit;
  const a = zoneStartLevel(zoneIndex), b = zoneBossLevel(zoneIndex);
  let min = Infinity, max = 0;
  for (let lv = a; lv <= b; lv++) {
    const p = recommendedPowerForLevel(lv);
    if (p < min) min = p;
    if (p > max) max = p;
  }
  const out = { min: min === Infinity ? 0 : min, max };
  _zoneCache.set(zoneIndex, out);
  return out;
};
