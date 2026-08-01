// Barrel: the view reads model selectors through this — single source is src/game/map/map.ts (Phase-4 sim).
export * from '../game/map/map.ts';
// RECOMMENDED power per node (level) + per-area (zone) range — derived from the enemy wave (combat).
export { zoneRecommendedRange, recommendedPowerForLevel, enemyPower } from '../game/combat/recommended-power.ts';
