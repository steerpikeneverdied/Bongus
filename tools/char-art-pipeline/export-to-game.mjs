#!/usr/bin/env node
/**
 * export-to-game.mjs — wire the trim tool's 256×256 exports into the combatclean game.
 *
 * Category-aware. For every trim/assets/<cat>/<slug>_256.png (cat = heroes | enemies):
 *   1. copy it to assets/combatclean/<cat>/<slug>.png                 (the in-game art)
 *   2. ensure assets.json  "<prefix>.<slug>": { type:"image", file:"<cat>/<slug>.png", anchor? }
 *   3. LOGICAL entry: existing (displayName === slug) → refresh art only; new → create via the
 *      sanctioned scaffold CLI (auto-allocates the id in the category lane) with a VALID PLACEHOLDER
 *      stat block (tagged origin=char-art-export) for the operator to tune.
 *   4. UI entry src/data/config/ui/<cat>/<id>.json (name + iconAssetId + emoji [+ abilityNames]).
 *      Heroes also get the tile `portrait` framing. Enemies have no tile → no portrait.
 *   5. gate: game-config:validate + assets:validate  (+ build unless --no-build)
 *
 * Registration points (reg) → the asset `anchor` (combat positions BOTH heroes and enemies by it).
 * Never edits existing logical entries; new stats are placeholders. Usage:
 *   node export-to-game.mjs [--no-build] [--dry-run] [--only <slug>] [--cat heroes|enemies]
 */
import { readFileSync, writeFileSync, readdirSync, copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const PIPELINE = dirname(fileURLToPath(import.meta.url));           // tools/char-art-pipeline
const GAME = resolve(PIPELINE, '..', '..');                        // combatclean repo root
const ASSETS_JSON = join(GAME, 'assets', 'combatclean', 'assets.json');
const ASSETS_JS = join(GAME, 'src', 'data', 'assets.js');          // the icon registry (art field kept honest)
const META_JSON = join(PIPELINE, 'trim', 'assets', 'trim_meta.json');

const args = process.argv.slice(2);
const NO_BUILD = args.includes('--no-build');
const DRY = args.includes('--dry-run');
const ICONS = args.includes('--icons');                            // Icons section export path
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const ONLY_CAT = args.includes('--cat') ? args[args.indexOf('--cat') + 1] : null;

const log = (...a) => console.log(...a);
const title = (s) => s.split('-').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
function weaponChainFor(slug) {
  const s = slug.toLowerCase();
  if (/(archer|ranger|hunter|gunslinger|sniper|marksman|bow|arblast|crossbow|pirate)/.test(s)) return 'bow';
  if (/(mage|wizard|sorcer|warlock|witch|necro|druid|cleric|priest|shaman|summoner|geomancer|spell|alchemist|inquisitor)/.test(s)) return 'magic';
  return 'blade';
}
const WEAPON_EMOJI = { bow: '🏹', magic: '🔮', blade: '⚔️' };

// ── per-category contract ──────────────────────────────────────────────────
const CATS = {
  heroes: {
    prefix: 'hero', dir: 'heroes', abilities: true, portrait: true, combat: true,
    gameArt: join(GAME, 'assets', 'combatclean', 'heroes'),
    logicalDir: join(GAME, 'src', 'data', 'config', 'game', 'heroes'),
    uiDir: join(GAME, 'src', 'data', 'config', 'ui', 'heroes'),
    newFor(slug) {
      const chain = weaponChainFor(slug);
      return { emoji: WEAPON_EMOJI[chain] || '⚔️', sets: [
        'rarityKey=rare', `weaponChainKey=${chain}`, 'baseAtk=16', 'baseHp=160',
        'normal=' + JSON.stringify({ chargeMs: 6000, effect: { type: 'burst', mult: 2 } }),
        'limit=' + JSON.stringify({ orders: 5, effect: { type: 'burst', mult: 5 } }),
        'tags=' + JSON.stringify({ origin: 'char-art-export', tuning: 'placeholder' }) ] };
    },
  },
  enemies: {
    prefix: 'enemy', dir: 'enemies', abilities: false, portrait: false, combat: true,
    gameArt: join(GAME, 'assets', 'combatclean', 'enemies'),
    logicalDir: join(GAME, 'src', 'data', 'config', 'game', 'enemies'),
    uiDir: join(GAME, 'src', 'data', 'config', 'ui', 'enemies'),
    newFor(_slug) {
      return { emoji: '👾', sets: [
        'hpMul=1', 'atkMul=1',
        'tags=' + JSON.stringify({ origin: 'char-art-export', tuning: 'placeholder' }) ] };
    },
  },
};

let META = { images: {} };
try { META = JSON.parse(readFileSync(META_JSON, 'utf8')); } catch {}
function metaRec(cat, slug) { return (META.images || {})[`${cat}/${slug}.png`]; }
function anchorFor(cat, slug) {
  const rec = metaRec(cat, slug);
  if (rec && Array.isArray(rec.reg) && rec.reg.length === 2) {
    const c = (v) => Math.max(0, Math.min(1, Number(v)));
    return { x: c(rec.reg[0]), y: c(rec.reg[1]) };
  }
  return null;
}
function portraitFor(cat, slug) {
  const rec = metaRec(cat, slug); const pr = rec && rec.portrait;
  if (pr && (pr.scale != null || pr.x != null || pr.y != null)) {
    const p = {}; ['scale', 'x', 'y'].forEach(k => { if (pr[k] != null) p[k] = Number(pr[k]); });
    return Object.keys(p).length ? p : null;
  }
  return null;
}
function combatFor(cat, slug) {   // in-combat / on-tile framing: SCALE (+ merge ROTATION). Position lives in the asset anchor = reg point.
  const rec = metaRec(cat, slug); const c = rec && rec.combat;
  if (c && (c.scale != null || c.rot != null)) {
    const o = {}; if (c.scale != null) o.scale = Number(c.scale); if (c.rot != null) o.rot = Number(c.rot);
    return Object.keys(o).length ? o : null;
  }
  return null;
}

function uiObject(cfg, id, slug, emoji, portrait, combat) {
  const o = { id, name: title(slug), iconAssetId: `${cfg.prefix}.${slug}`, emoji };
  if (cfg.abilities) o.abilityNames = { basic: 'Attack', normal: 'Skill', limit: 'Ultimate' };
  if (cfg.portrait && portrait) o.portrait = portrait;
  if (cfg.combat && combat) o.combat = combat;
  return o;
}

// every enemy-area category (+ the generic 'enemies') maps to the flat enemy config; 'heroes' → hero config
const ENEMY_CATS = new Set(['enemies', 'mossbog', 'gloomwood', 'boneyard', 'emberfall', 'frostvault', 'dragons-ascent']);
const cfgFor = (cat) => cat === 'heroes' ? CATS.heroes : (ENEMY_CATS.has(cat) ? CATS.enemies : null);

// ── Icons section export (--icons): the Icons trim categories aren't config entities — they're pure
// asset-registry art. For each die-cut icon (_256.png) copy it to assets/combatclean/icons/<slug>.png,
// point EVERY registry key that shares that icon (manifest assetKeys) at it in assets.json, and keep
// the assets.js `art:` field honest. Runs instead of the hero/enemy path, then gates + exits. ──
const iconExportSize = (cat) => (cat === 'chest' ? 256 : 128);   // in-game icon asset size per category: chests are displayed large → 256; everything else → 128.
if (ICONS) runIconsExport();

function setArt(src, key, artVal) {   // set/replace the single-line assets.js entry's `art:` field
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp("('" + esc + "':\\s*\\{)([^\\n}]*)(\\})");
  const m = src.match(re);
  if (!m) return src;                                  // key absent (shouldn't happen) — leave untouched
  let body = m[2];
  if (/\bart:\s*'[^']*'/.test(body)) body = body.replace(/\bart:\s*'[^']*'/, "art: '" + artVal + "'");
  else body = body.replace(/\s*$/, '') + ", art: '" + artVal + "' ";
  return src.slice(0, m.index) + m[1] + body + m[3] + src.slice(m.index + m[0].length);
}

function resizePng(src, dest, size) {   // downscale the die-cut to a square `size` PNG (alpha preserved).
  // Uses macOS `sips` — NOT python/PIL: the trim tool runs export via a LOGIN shell whose python3
  // (system /usr/bin/python3) lacks PIL, which silently failed every icon export. sips is always present.
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  execFileSync('sips', ['-z', String(size), String(size), dest], { stdio: 'ignore' });
}

function runIconsExport() {
  const ICON_MANIFEST = join(PIPELINE, 'trim', 'icon-manifest.json');
  const ICONS_ART = join(GAME, 'assets', 'combatclean', 'icons');
  const TRIM_ASSETS = join(PIPELINE, 'trim', 'assets');
  let manifest;
  try { manifest = JSON.parse(readFileSync(ICON_MANIFEST, 'utf8')); }
  catch { log('RESULT ' + JSON.stringify({ ok: false, errors: [{ error: 'no icon-manifest.json — run build-icon-manifest.mjs' }] })); process.exit(1); }

  const catFilter = ONLY_CAT && ONLY_CAT.startsWith('icons-') ? ONLY_CAT.slice('icons-'.length) : null;
  const entries = manifest.filter((m) => (!catFilter || m.category === catFilter) && (!ONLY || m.slug === ONLY));
  const ready = [], notReady = [];
  for (const m of entries) {
    const src = join(TRIM_ASSETS, 'icons-' + m.category, m.slug + '_256.png');
    if (existsSync(src)) ready.push({ ...m, src }); else notReady.push(m.slug);
  }

  if (DRY) {
    log('[dry-run] EXPORT icons: ' + (ready.map((r) => r.slug).join(', ') || '(none ready)'));
    log('[dry-run] not die-cut yet: ' + (notReady.join(', ') || '(none)'));
    log('[dry-run] assetKeys retargeted: ' + (ready.flatMap((r) => r.assetKeys).join(', ') || '(none)'));
    log('RESULT ' + JSON.stringify({ ok: true, dryRun: true, ready: ready.map((r) => r.slug), notReady }));
    process.exit(0);
  }
  if (!ready.length) {
    log('RESULT ' + JSON.stringify({ ok: true, exported: [], errors: [], note: 'no *_256.png ready under icons-* (die-cut first)' }));
    process.exit(0);
  }

  mkdirSync(ICONS_ART, { recursive: true });
  const assets = JSON.parse(readFileSync(ASSETS_JSON, 'utf8')); assets.assets ||= {};
  let assetsJs = readFileSync(ASSETS_JS, 'utf8');
  const exported = [], errors = []; const retargeted = [];
  for (const r of ready) {
    try {
      resizePng(r.src, join(ICONS_ART, r.slug + '.png'), iconExportSize(r.category));   // chest → 256, everything else → 128
      const anchor = anchorFor('icons-' + r.category, r.slug);   // reg point from trim_meta, if authored
      for (const key of r.assetKeys) {
        assets.assets[key] = { type: 'image', file: 'icons/' + r.slug + '.png', ...(anchor ? { anchor } : {}) };
        assetsJs = setArt(assetsJs, key, 'icons/' + r.slug);
        retargeted.push(key);
      }
      exported.push(r.slug);
      log(`exported   ${r.slug} → icons/${r.slug}.png  (${r.assetKeys.length} key${r.assetKeys.length > 1 ? 's' : ''})`);
    } catch (e) {
      errors.push({ slug: r.slug, error: String(e.message || e) });
      log(`ERROR      ${r.slug}: ${e.message || e}`);
    }
  }
  writeFileSync(ASSETS_JSON, JSON.stringify(assets, null, '\t') + '\n');
  writeFileSync(ASSETS_JS, assetsJs);
  log(`\nassets.json + assets.js updated (${exported.length} icons, ${retargeted.length} keys)`);

  log('\n=== assets:validate ==='); const v = run('node', ['config/scaffold.mjs', 'assets', 'validate']); log(v.out.trim());
  let build = { ok: null, out: '(skipped)' };
  if (!NO_BUILD) { log('=== npm run build (compose gate) ==='); build = run('npm', ['run', 'build']); log(build.out.trim().split('\n').slice(-8).join('\n')); }
  const ok = v.ok && (build.ok !== false) && !errors.length;
  log('\nRESULT ' + JSON.stringify({ ok, exported, retargeted, notReady, errors, validate: { assets: v.ok }, build: build.ok }));
  process.exit(ok ? 0 : 1);
}

// ── discover work per category (any trim/assets subdir that maps to a config) ──
const ASSETS_ROOT = join(PIPELINE, 'trim', 'assets');
const catNames = readdirSync(ASSETS_ROOT).filter(c => {
  try { return statSync(join(ASSETS_ROOT, c)).isDirectory() && cfgFor(c) && (!ONLY_CAT || c === ONLY_CAT); }
  catch { return false; }
});
const work = {};   // cat -> [slugs]
for (const cat of catNames) {
  const src = join(ASSETS_ROOT, cat);
  if (!existsSync(src)) continue;
  let slugs = readdirSync(src).filter(f => f.endsWith('_256.png')).map(f => f.slice(0, -('_256.png'.length)));
  if (ONLY) slugs = slugs.filter(s => s === ONLY);
  slugs.sort();
  if (slugs.length) work[cat] = slugs;
}
if (!Object.keys(work).length) {
  log('RESULT ' + JSON.stringify({ ok: true, refreshed: [], created: [], errors: [], note: 'no *_256.png found' }));
  process.exit(0);
}

// existing logical displayName -> id, per category
const existing = {};
for (const cat of Object.keys(work)) {
  existing[cat] = {};
  for (const f of readdirSync(cfgFor(cat).logicalDir).filter(f => f.endsWith('.json') && !f.startsWith('_'))) {
    try { const d = JSON.parse(readFileSync(join(cfgFor(cat).logicalDir, f), 'utf8')); if (d.displayName) existing[cat][d.displayName] = d.id; } catch {}
  }
}

if (DRY) {
  const out = { ok: true, dryRun: true, refreshed: [], created: [], errors: [] };
  for (const cat of Object.keys(work)) for (const slug of work[cat])
    (existing[cat][slug] != null ? out.refreshed : out.created).push(`${cat}/${slug}`);
  log('[dry-run] REFRESH: ' + (out.refreshed.join(', ') || '(none)'));
  log('[dry-run] CREATE:  ' + (out.created.join(', ') || '(none)'));
  log('RESULT ' + JSON.stringify(out));
  process.exit(0);
}

const assets = JSON.parse(readFileSync(ASSETS_JSON, 'utf8'));
assets.assets ||= {};
const refreshed = [], created = [], errors = []; let anchored = 0, portraited = 0, combated = 0;

for (const cat of Object.keys(work)) {
  const cfg = cfgFor(cat);
  mkdirSync(cfg.uiDir, { recursive: true });
  for (const slug of work[cat]) {
    try {
      copyFileSync(join(PIPELINE, 'trim', 'assets', cat, `${slug}_256.png`), join(cfg.gameArt, `${slug}.png`));
      const anchor = anchorFor(cat, slug); if (anchor) anchored++;
      const portrait = cfg.portrait ? portraitFor(cat, slug) : null;
      const combat = cfg.combat ? combatFor(cat, slug) : null;
      assets.assets[`${cfg.prefix}.${slug}`] = { type: 'image', file: `${cfg.dir}/${slug}.png`, ...(anchor ? { anchor } : {}) };

      let id = existing[cat][slug];
      if (id != null) {
        refreshed.push(`${cat}/${slug}`);
        log(`refreshed  ${cat}/${slug} (id ${id}) — art + asset`);
      } else {
        const { emoji, sets } = cfg.newFor(slug);
        const setArgs = []; for (const s of sets) { setArgs.push('--set', s); }
        execFileSync('node', ['config/scaffold.mjs', 'config', 'create', cat, '--name', slug, ...setArgs],
          { cwd: GAME, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        const nf = readdirSync(cfg.logicalDir).find(f => f.endsWith(`-${slug}.json`));
        id = nf ? JSON.parse(readFileSync(join(cfg.logicalDir, nf), 'utf8')).id : null;
        if (id == null) throw new Error('scaffold did not produce a logical entry');
        writeFileSync(join(cfg.uiDir, `${id}.json`), JSON.stringify(uiObject(cfg, id, slug, emoji, portrait, combat), null, '\t') + '\n');
        created.push(`${cat}/${slug}`);
        log(`created    ${cat}/${slug} (id ${id}) — logical + ui + asset [placeholder stats]`);
      }

      // ensure a UI entry exists for pre-existing entries; patch portrait (heroes) / combat (enemies) if set
      const uiPath = join(cfg.uiDir, `${id}.json`);
      if (!existsSync(uiPath)) {
        const { emoji } = cfg.newFor(slug);
        writeFileSync(uiPath, JSON.stringify(uiObject(cfg, id, slug, emoji, portrait, combat), null, '\t') + '\n');
      } else {
        let ui = {}; try { ui = JSON.parse(readFileSync(uiPath, 'utf8')); } catch {}
        if (ui.id == null) ui.id = id; if (ui.name == null) ui.name = title(slug);
        ui.iconAssetId = `${cfg.prefix}.${slug}`; // self-heal the asset ref (always deterministic from the slug)
        if (cfg.portrait && portrait) ui.portrait = portrait;
        if (cfg.combat && combat) ui.combat = combat;
        writeFileSync(uiPath, JSON.stringify(ui, null, '\t') + '\n');
      }
      if (cfg.portrait && portrait) portraited++;
      if (cfg.combat && combat) combated++;
    } catch (e) {
      const msg = (e.stderr || e.message || String(e)).toString().trim().split('\n').slice(-3).join(' ');
      errors.push({ slug: `${cat}/${slug}`, error: msg });
      log(`ERROR      ${cat}/${slug}: ${msg}`);
    }
  }
}

writeFileSync(ASSETS_JSON, JSON.stringify(assets, null, '\t') + '\n');
log(`\nassets.json updated (${refreshed.length} refreshed, ${created.length} created)`);

// ---- gates ----
function run(cmd, argv) {
  try { return { ok: true, out: execFileSync(cmd, argv, { cwd: GAME, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { ok: false, out: (e.stdout || '') + (e.stderr || '') }; }
}
log('\n=== game-config:validate ==='); const v1 = run('node', ['config/scaffold.mjs', 'config', 'validate']); log(v1.out.trim());
log('=== assets:validate ===');       const v2 = run('node', ['config/scaffold.mjs', 'assets', 'validate']); log(v2.out.trim());
let build = { ok: null, out: '(skipped)' };
if (!NO_BUILD) { log('=== npm run build (compose gate) ==='); build = run('npm', ['run', 'build']); log(build.out.trim().split('\n').slice(-8).join('\n')); }

const ok = v1.ok && v2.ok && (build.ok !== false);
log('\nRESULT ' + JSON.stringify({
  ok, refreshed, created, anchored, portraited, combated,
  errors, validate: { config: v1.ok, assets: v2.ok }, build: build.ok,
}));
process.exit(ok ? 0 : 1);
