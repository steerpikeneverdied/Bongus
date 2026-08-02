// Headless smoke: build the baked bundle the way vite's compose does (scan logical + fold singletons +
// fold UI), init content C, then exercise the NEW view-data barrels (re-combination) AND the sim
// (battle + reducer) — so barrel field-mismatches and sim regressions surface without a browser.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { scanConfigDir } from '@fortis/bishop-config-registry/node';
import { CATEGORIES } from '../src/data/config/manifest.ts';

const GAME = 'src/data/config/game';
const UI = 'src/data/config/ui';
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

const merged = scanConfigDir(GAME, CATEGORIES); // category arrays (skips singletons)

// fold singletons (_<name>.json) — compose's job
for (const c of CATEGORIES) {
  if (c.kind !== 'singleton') continue;
  try { merged[c.name] = readJson(join(GAME, `_${c.name}.json`)); } catch { /* absent */ }
}
// fold UI registry: ui[cat][id|key] = entry
const ui = {};
for (const c of CATEGORIES) {
  const dir = join(UI, c.name);
  let files = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { continue; }
  ui[c.name] = {};
  for (const f of files) { const e = readJson(join(dir, f)); ui[c.name][String(e.id ?? e.key)] = e; }
}
merged.ui = ui;
const glob = readJson(join(GAME, '_global.json'));
merged.refs = glob.refs ?? {};
merged.schemaVersion = glob.schemaVersion ?? 1;

const { initContent } = await import('../src/game/content.ts');
initContent(merged);

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  ✗', msg); } };

// ── barrels (the new re-combination layer) ──
const heroes = await import('../src/data/heroes.js');
const gear = await import('../src/data/gear.js');
const rar = await import('../src/data/rarities.js');
const en = await import('../src/data/enemies.js');
const zn = await import('../src/data/zones.js');
const gen = await import('../src/data/generators.js');
const ban = await import('../src/data/banners.js');
const cfg = await import('../src/data/config.js');

const knight = heroes.HEROES.knight;
ok(knight && knight.name === 'Knight', `HEROES.knight.name = ${knight?.name}`);
ok(knight && knight.asset === 'hero.knight', `HEROES.knight.asset = ${knight?.asset}`);
ok(knight && typeof knight.baseAtk === 'number', 'HEROES.knight carries logical stats');
ok(rar.HERO_RARITY_ORDER.length >= 5, `HERO_RARITY_ORDER len ${rar.HERO_RARITY_ORDER.length}`);
const common = rar.HERO_RARITIES.common;
ok(common && common.name === 'COMMON' && common.color, `HERO_RARITIES.common name+color ${common?.name}/${common?.color}`);
ok(Object.values(gear.GEAR_RARITY).every((g) => g.color), 'GEAR_RARITY entries carry colour');
ok(Object.values(gear.GEAR_SLOT_META).every((s) => s.name && s.asset), 'GEAR_SLOT_META name+asset');
ok(Object.values(gear.GEAR_PIECES).every((p) => p.name && typeof p.asset === 'string'), 'GEAR_PIECES name+asset');
ok(zn.ZONES.length >= 1 && zn.ZONES[0].name, `ZONES[0].name = ${zn.ZONES[0]?.name}`);
ok(Object.values(gen.GENERATORS).every((g) => g.asset?.startsWith('gen.')), 'GENERATORS asset keys');
ok(ban.BANNER_ORDER.length >= 1, `BANNER_ORDER len ${ban.BANNER_ORDER.length}`);
ok(en.LEVEL_SCALING && typeof en.LEVEL_SCALING.hpBase === 'number', 'LEVEL_SCALING folded');
ok(cfg.VFX_CONFIG && cfg.TIER_PRESENTATION && cfg.BOARD && cfg.HAPTICS, 'config singletons present');
ok(typeof cfg.SELECTED_SLOTS === 'number', `SELECTED_SLOTS = ${cfg.SELECTED_SLOTS}`);

// ── sim intact (reducer init + a few ticks) ──
const { reducer, initState } = await import('../src/game/store/reducer.ts');
const { A } = await import('../src/game/store/actions.ts');
const simRandom = await import('../src/game/sim-random.ts');
const { seedSim } = simRandom; // namespace import too, so we can probe the live rng (a live binding) after seeding
seedSim(12345);
let s = initState(0, null);
ok(s && s.board && Object.keys(s.heroes).length >= 1, 'initState: board + starter hero');
s = reducer(s, { type: A.CHALLENGE_NEXT });
s = reducer(s, { type: A.START_COMBAT });
let ticks = 0;
while (s.battle.status === 'fighting' && ticks < 400) { s = reducer(s, { type: A.BATTLE_TICK, dt: cfg.BATTLE?.tickMs ?? 200 }); ticks++; }
ok(ticks > 0 && s.battle.status !== 'fighting', `battle resolved in ${ticks} ticks → ${s.battle.status}`);

// ── determinism (locked: seeded PRNG → same seed = same run) ──
const sig = (st) => JSON.stringify({
  coins: st.coins, heroXp: st.heroXp, gearXp: st.gearXp, level: st.battle.level,
  heroes: Object.keys(st.heroes).length, board: st.board.map((c) => (c ? `${c.chain}${c.level}` : '_')).join(''),
  status: st.battle.status,
});
const runSeq = (seed) => {
  seedSim(seed);
  let st = initState(0, null);
  st = reducer(st, { type: A.TAP_GENERATOR, index: 0, now: 1000 });
  st = reducer(st, { type: A.TAP_GENERATOR, index: 1, now: 2000 });
  st = reducer(st, { type: A.CHALLENGE_NEXT });
  st = reducer(st, { type: A.START_COMBAT });
  let t = 0;
  while (st.battle.status === 'fighting' && t < 600) { st = reducer(st, { type: A.BATTLE_TICK, dt: cfg.BATTLE?.tickMs ?? 200 }); t++; }
  // Signature captures the full rng-sensitive trajectory, not just a coarse end-state (which collides
  // across seeds on a short deterministic fight): ticks-to-resolve (crit variance changes TTK), the
  // surviving-hero HP sum, and a probe of the live stream position (distinct seeds → distinct streams).
  const hp = (st.battle.heroes || []).reduce((a, h) => a + (h.hp || 0), 0);
  const probe = Array.from({ length: 6 }, () => simRandom.rng()).join(',');
  return `${sig(st)}|t=${t}|hp=${hp}|p=${probe}`;
};
const a = runSeq(999), b = runSeq(999), c = runSeq(1000);
ok(a === b, `determinism: same seed → same run (${a === b})`);
ok(a !== c, 'different seed → different run (PRNG actually varies)');

// ── store fx buffer: DROP while no FxLayer subscriber (guards the unbounded-buffer/burst regression);
//    BUFFER + deliver once a listener (FxLayer) subscribes. ──
const { createGameStore } = await import('../src/game/store/game-store.ts');
{
  seedSim(7);
  const store = createGameStore(initState(0, null));
  store.dispatch({ type: A.START_COMBAT }); // intro → fighting
  store.dispatch({ type: A.BATTLE_TICK, dt: cfg.BATTLE?.tickMs ?? 200 }); // produces fx, but nothing is subscribed
  ok(store.takePendingFx().length === 0 && store.getFxEpoch() === 0, 'fx DROPPED while no FxLayer subscriber (no unbounded buffer)');
  const off = store.subscribeFx(() => {});
  store.dispatch({ type: A.BATTLE_TICK, dt: cfg.BATTLE?.tickMs ?? 200 }); // subscribed → buffered
  ok(store.getFxEpoch() === 1 && store.takePendingFx().length > 0, 'fx BUFFERED + delivered to a subscribed FxLayer');
  off();
}

// ── excludedView: meta/hud identity is STABLE across a battle+nextId-only tick (guards the context-split
//    regression where a per-tick counter like nextId defeats the split). ──
const { excludedView, META_EXCLUDE, HUD_EXCLUDE } = await import('../src/controller/excluded-view.ts');
{
  const bse = { screen: 'merge', coins: 5, battle: { hp: 1 }, fx: [], energy: 2, now: 10, nextId: 1 };
  const tk = { ...bse, battle: { hp: 0 }, nextId: 2 }; // a BATTLE_TICK: only battle + nextId change
  const metaPrev = excludedView(bse, null, META_EXCLUDE);
  ok(excludedView(tk, metaPrev, META_EXCLUDE) === metaPrev, 'META view ref STABLE across a battle/nextId tick');
  const hudPrev = excludedView(bse, null, HUD_EXCLUDE);
  ok(excludedView(tk, hudPrev, HUD_EXCLUDE) === hudPrev, 'HUD view ref STABLE across a battle/nextId tick');
  ok(excludedView({ ...bse, coins: 9 }, metaPrev, META_EXCLUDE) !== metaPrev, 'META view ref CHANGES when a rendered slice (coins) changes');
}

console.log(`\n[smoke] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
