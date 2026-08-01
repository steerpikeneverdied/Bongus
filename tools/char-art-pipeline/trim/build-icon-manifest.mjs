#!/usr/bin/env node
// build-icon-manifest.mjs — the Icons section's SSOT VIEW over src/data/assets.js.
//
// The trim tool's "Icons" section is NOT a second registry — it is a deduped view over the ONE
// asset registry (src/data/assets.js). This script imports that registry, selects the icon-class
// entries (ui.* / status.* / node.* / fx.* / banner.* / gear.* / icon.*), assigns each a display
// CATEGORY, then DEDUPES by glyph: a glyph used across ≥2 categories collapses into the shared
// `general` bucket (operator rule: "listed by category, or 'general' if they exist in several
// categories"). Merge chains, heroes, enemies, gear pieces and zones are excluded — they own their
// own trim sections.
//
// Output: ./icon-manifest.json — one entry per (deduped) icon:
//   { slug, emoji, label, category, assetKeys:[...], exportArtKey }
// Consumed by seed-icons.py (renders the emoji seeds) and the export routing (retargets each
// assetKey's `art` to exportArtKey on export). Re-run whenever assets.js icon entries change.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS_PATH = join(HERE, '..', '..', '..', 'src', 'data', 'assets.js');
const OUT_PATH = join(HERE, 'icon-manifest.json');
const ROSTERS_DIR = join(HERE, '..', '..', 'icon-pipeline', 'rosters');   // gen.sh reads rosters/icons-<cat>.tsv
const SPEC_PATH = join(HERE, '..', '..', 'icon-pipeline', 'icon-spec.json');   // operator's resolved final icon set

const { ASSETS } = await import(pathToFileURL(ASSETS_PATH).href);

// SPEC-DRIVEN mode: once the operator has resolved the final icon set (icon-spec.json — splits applied,
// shared icons merged, renamed by purpose), the manifest is built from it, not glyph-dedup. Same output
// shape, so seeds / rosters / export all flow unchanged. Falls back to glyph-dedup when no spec exists.
if (existsSync(SPEC_PATH)) buildFromSpec();

function buildFromSpec() {
  const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8'));
  const EXCLUDE = ['blade.', 'range.', 'magic.', 'special.', 'hero.', 'enemy.', 'piece.', 'zone.', 'gen.'];
  const isIconKey = (k) => k !== 'missing' && !EXCLUDE.some((p) => k.startsWith(p));
  const allIconKeys = new Set(Object.keys(ASSETS).filter((k) => isIconKey(k) && ASSETS[k] && ASSETS[k].emoji));
  const seen = new Map();
  const manifest = spec.icons.map((it) => {
    const emoji = (ASSETS[it.assetKeys[0]] && ASSETS[it.assetKeys[0]].emoji) || '⬜';
    for (const k of it.assetKeys) seen.set(k, (seen.get(k) || 0) + 1);
    return { slug: it.name, emoji, label: it.name, category: it.category, subject: it.prompt || it.name,
      assetKeys: it.assetKeys, exportArtKey: `icons/${it.name}`, ...(it.dynamic ? { dynamic: true } : {}), ...(it.keep ? { keep: true } : {}) };
  });
  writeFileSync(OUT_PATH, JSON.stringify(manifest, null, 2) + '\n');
  // rosters per category (skip `keep` icons — their art is left as-is, not regenerated)
  mkdirSync(ROSTERS_DIR, { recursive: true });
  for (const f of readdirSync(ROSTERS_DIR)) if (f.startsWith('icons-') && f.endsWith('.tsv')) rmSync(join(ROSTERS_DIR, f));
  const byCat = {};
  for (const m of manifest) { if (m.keep) continue; (byCat[m.category] ||= []).push(m); }
  for (const [cat, list] of Object.entries(byCat)) writeFileSync(join(ROSTERS_DIR, `icons-${cat}.tsv`), list.map((m) => `${m.slug}\t${m.subject}`).join('\n') + '\n');
  // coverage validation — every icon-class assetKey must be covered exactly once
  const dupes = [...seen].filter(([, n]) => n > 1).map(([k]) => k);
  const unknown = [...seen.keys()].filter((k) => !allIconKeys.has(k));
  const missing = [...allIconKeys].filter((k) => !seen.has(k));
  console.log(`icon-manifest.json (SPEC-DRIVEN) → ${manifest.length} icons across ${new Set(manifest.map((m) => m.category)).size} categories`);
  if (dupes.length) console.log('  ⚠ assetKey mapped by >1 icon: ' + dupes.join(', '));
  if (unknown.length) console.log('  ⚠ spec assetKey not in assets.js: ' + unknown.join(', '));
  if (missing.length) console.log('  ⚠ assets.js icon key NOT covered by spec: ' + missing.join(', '));
  if (!dupes.length && !unknown.length && !missing.length) console.log('  ✓ every icon-class assetKey covered exactly once');
  process.exit(0);
}

// ── Which registry keys are "icons" (everything else owns its own trim section) ──
const EXCLUDE_PREFIXES = ['blade.', 'range.', 'magic.', 'special.', 'hero.', 'enemy.', 'piece.', 'zone.', 'gen.'];
const isIcon = (key) => key !== 'missing' && !EXCLUDE_PREFIXES.some((p) => key.startsWith(p));

// ── Display category per key (buckets that become the Icons subtabs) ──
function categoryOf(key) {
  if (key.startsWith('ui.nav.')) return 'nav';
  if (key.startsWith('ui.chest')) return 'chest';
  if (['ui.coin', 'ui.gem', 'ui.energy', 'ui.heroXp', 'ui.gearXp', 'ui.crystal'].includes(key)) return 'currency';
  if (key.startsWith('ui.')) return 'ui';
  if (key.startsWith('status.')) return 'status';
  if (key.startsWith('node.')) return 'node';
  if (key.startsWith('fx.')) return 'fx';
  if (key.startsWith('banner.')) return 'banner';
  if (key.startsWith('gear.')) return 'slot';
  if (key.startsWith('icon.ability.')) return 'ability';
  if (key.startsWith('icon.stat.')) return 'stat';
  if (key.startsWith('icon.minigame.')) return 'minigame';
  if (key.startsWith('icon.rarity.')) return 'gacha';
  if (key.startsWith('icon.dev.') || key === 'icon.headless') return 'dev';
  if (key === 'icon.potion') return 'ui';
  if (['icon.generator', 'icon.generatorBadge', 'icon.cobweb', 'icon.bestMerge'].includes(key)) return 'board';
  if (['icon.afk', 'icon.skull'].includes(key)) return 'afk';
  if (key === 'icon.boss') return 'combat';
  if (key.startsWith('icon.')) return 'chrome';
  return 'ui';
}

// ── Glyph → readable slug (kebab). Falls back to the key leaf when unmapped. ──
const GLYPH_NAMES = {
  '⚡': 'bolt', '🪙': 'coin', '💎': 'gem', '📘': 'book', '🔧': 'wrench', '📜': 'scroll',
  '🎲': 'dice', '🎁': 'gift', '🧰': 'toolbox', '📦': 'box', '💰': 'moneybag', '⭐': 'star',
  '💪': 'muscle', '🛡': 'shield', '⏳': 'hourglass', '❓': 'question', '🧩': 'puzzle', '🎰': 'slot-machine',
  '🦸': 'hero', '🗺': 'map', '🐌': 'snail', '➕': 'plus', '🌫': 'fog', '🐸': 'frog', '🪐': 'planet',
  '🧙': 'wizard', '🔮': 'orb', '👹': 'ogre', '⛺': 'tent', '🐲': 'dragon', '💍': 'ring',
  '⚔': 'sword', '🗡': 'dagger', '🏹': 'bow', '🎯': 'target',
  '👊': 'fist', '💥': 'boom', '❤': 'heart', '✊': 'raised-fist', '👤': 'person', '✕': 'close',
  '✓': 'check', '🔒': 'lock', '⬆': 'up', '⏫': 'up-double', '✦': 'ascend', '♻': 'recycle',
  '➖': 'minus', '⚠': 'warning', '⚙': 'cog', '🕸': 'web', '✨': 'sparkle', '💤': 'zzz', '☠': 'skull',
  '★': 'star-solid', '◆': 'diamond', '💣': 'bomb', '⛁': 'coin-stack', '☾': 'moon', '🎮': 'gamepad', '📋': 'clipboard',
};

// Gen subject (noun phrase) per slug — the roster's prompt subject. Falls back to the label. Refine
// freely in tools/icon-pipeline/rosters/*.tsv; re-running this builder only fills MISSING rows.
const SUBJECTS = {
  sword: 'two crossed steel swords', shield: 'a knight\'s heater shield', bolt: 'a lightning bolt',
  gem: 'a cut blue gemstone', gift: 'a wrapped gift box with a ribbon', wrench: 'a metal wrench',
  puzzle: 'a single jigsaw puzzle piece', 'slot-machine': 'a slot machine', sparkle: 'a four-point sparkle star',
  bow: 'a wooden longbow with a nocked arrow', coin: 'a gold coin', book: 'a closed blue spellbook',
  dice: 'a single game die', hourglass: 'an hourglass', muscle: 'a flexed muscular arm', question: 'a question mark',
  scroll: 'a rolled parchment scroll', star: 'a five-point gold star', box: 'a wooden treasure crate',
  moneybag: 'a bulging money bag', toolbox: 'a treasure chest', 'hero': 'a heroic caped silhouette',
  map: 'a folded treasure map', fog: 'a swirl of grey fog', plus: 'a green plus sign', snail: 'a snail',
  frog: 'a cartoon frog', planet: 'a ringed planet', wizard: 'a wizard hat', orb: 'a glowing magic orb',
  ogre: 'a snarling ogre face', tent: 'a campfire tent', dragon: 'a dragon head', ring: 'a jewelled ring',
  boom: 'a comic burst explosion', fist: 'a punching fist', heart: 'a red heart', 'raised-fist': 'a raised fist',
  person: 'a person bust silhouette', close: 'a bold X cross', check: 'a bold checkmark', lock: 'a padlock',
  up: 'an upward arrow', 'up-double': 'a double upward chevron arrow', ascend: 'an upward burst star',
  recycle: 'a recycle arrows loop', minus: 'a minus dash', warning: 'a warning triangle', cog: 'a gear cog',
  web: 'a spider web', dagger: 'a dagger', target: 'a bullseye target', skull: 'a skull',
  zzz: 'sleeping zzz letters', 'star-solid': 'a solid gold star', diamond: 'a solid diamond rhombus',
  bomb: 'a round lit bomb', 'coin-stack': 'a stack of gold coins', moon: 'a crescent moon',
  gamepad: 'a game controller', clipboard: 'a clipboard',
};
const subjectFor = (slug, label) => SUBJECTS[slug] || String(label || slug).toLowerCase();

// Normalize a glyph for dedup: drop VS15/VS16 presentation selectors + skin-tone modifiers, keep
// ZWJ sequences intact (so 🦸‍♀️ stays distinct from 🦸). Comparing normalized forms makes ⚔️ == ⚔.
const VARIATION = /[︎️\u{1F3FB}-\u{1F3FF}]/gu;
const norm = (g) => g.replace(VARIATION, '');

function slugFor(glyph, key) {
  const n = norm(glyph);
  if (GLYPH_NAMES[n]) return GLYPH_NAMES[n];
  // fallback: last dotted segment of the key, kebab-cased
  return key.split('.').pop().replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

// ── Build: one row per icon key, then dedup by normalized glyph ──
const rows = [];
for (const [key, a] of Object.entries(ASSETS)) {
  if (!isIcon(key) || !a || !a.emoji) continue;
  rows.push({ key, emoji: a.emoji, label: a.label || key, category: categoryOf(key), slug: slugFor(a.emoji, key) });
}

const byGlyph = new Map(); // normalized-glyph → { emoji, labels[], keys[], categories:Set, slug }
for (const r of rows) {
  const g = norm(r.emoji);
  if (!byGlyph.has(g)) byGlyph.set(g, { emoji: r.emoji, labels: [], keys: [], categories: new Set(), slug: r.slug });
  const e = byGlyph.get(g);
  e.keys.push(r.key);
  e.labels.push(r.label);
  e.categories.add(r.category);
}

const manifest = [];
for (const e of byGlyph.values()) {
  const cats = [...e.categories];
  const category = cats.length >= 2 ? 'general' : cats[0];
  manifest.push({
    slug: e.slug,
    emoji: e.emoji,
    label: e.labels[0],
    category,
    subject: subjectFor(e.slug, e.labels[0]),
    assetKeys: e.keys,
    exportArtKey: `icons/${e.slug}`,
  });
}

// Stable order: category (defined order) then slug.
const CAT_ORDER = ['general', 'currency', 'ui', 'chest', 'nav', 'status', 'node', 'fx', 'banner', 'slot',
  'ability', 'stat', 'chrome', 'board', 'combat', 'afk', 'gacha', 'minigame', 'dev'];
manifest.sort((x, y) => (CAT_ORDER.indexOf(x.category) - CAT_ORDER.indexOf(y.category)) || x.slug.localeCompare(y.slug));

writeFileSync(OUT_PATH, JSON.stringify(manifest, null, 2) + '\n');

// Rosters (one per Icons subtab category) — gen.sh reads rosters/icons-<cat>.tsv (slug<TAB>subject).
mkdirSync(ROSTERS_DIR, { recursive: true });
const byCat = {};
for (const m of manifest) (byCat[m.category] ||= []).push(m);
for (const [cat, list] of Object.entries(byCat)) {
  const body = list.map((m) => `${m.slug}\t${m.subject}`).join('\n') + '\n';
  writeFileSync(join(ROSTERS_DIR, `icons-${cat}.tsv`), body);
}

// Summary
const counts = {};
for (const m of manifest) counts[m.category] = (counts[m.category] || 0) + 1;
console.log(`icon-manifest.json → ${manifest.length} icons across ${Object.keys(counts).length} categories`);
for (const c of CAT_ORDER) if (counts[c]) console.log(`  ${c}: ${counts[c]}`);
const general = manifest.filter((m) => m.category === 'general');
if (general.length) console.log('  general (shared glyphs): ' + general.map((m) => `${m.emoji} ${m.slug}[${m.assetKeys.length}]`).join('  '));
