#!/usr/bin/env node
// build-icon-rename.mjs — produces the icon RENAME/SPEC workflow artifacts from icon-manifest.json:
//   1. prompts/<purpose>.md — one placeholder prompt file per icon, NAMED BY IN-GAME PURPOSE (not the
//      emoji), describing every place the icon is used. Awaiting the real "what it should be" text.
//   2. icon-rename.html — a form listing every emoji + its uses with a text field per icon, an
//      Export JSON button (download), Import JSON (prefill), and localStorage autosave.
//
// Flow: operator fills icon-rename.html → Export JSON → hands it back → we bake the JSON into the page
// and rename every icon (slug/keys/files) in code AND in the trim tool. Re-run after manifest changes.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(HERE, '..', 'char-art-pipeline', 'trim', 'icon-manifest.json');
const PROMPTS_DIR = join(HERE, 'prompts');
const HTML_OUT = join(HERE, 'icon-rename.html');

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

// Operator's decisions so far (icon-rename.json) — baked into the page + written into the prompt files.
// Merge new feedback into that file as it arrives; re-run this script to refresh both artifacts.
let ANSWERS = {};
try {
  const j = JSON.parse(readFileSync(join(HERE, 'icon-rename.json'), 'utf8'));
  for (const x of (j.icons || [])) ANSWERS[x.slug] = { desired: x.desired || '', split: !!x.splitIntoSeparate };
} catch { /* no answers yet */ }

// ── in-game PURPOSE name per icon (placeholder; the operator finalises via the form) ──
const PURPOSE = {
  bolt: 'energy', bow: 'ranged-attack', gem: 'gems', gift: 'reward', puzzle: 'merge',
  shield: 'defense', 'slot-machine': 'gacha', sparkle: 'skill', sword: 'attack', wrench: 'gear-xp',
  book: 'hero-xp', coin: 'coins', dice: 'reroll', hourglass: 'timer', muscle: 'gear-power',
  question: 'locked-unknown', scroll: 'order', star: 'star', box: 'common-chest', moneybag: 'epic-chest',
  toolbox: 'chest', hero: 'nav-heroes', map: 'nav-map', fog: 'status-stealth', plus: 'status-regen',
  snail: 'status-slow', frog: 'banner-exclusive', planet: 'banner-mythic', wizard: 'banner-mega',
  orb: 'vfx-magic', ogre: 'node-elite', tent: 'node-rest', dragon: 'node-boss', ring: 'slot-accessory',
  boom: 'ability-ultimate', fist: 'ability-basic', heart: 'stat-health', dagger: 'stat-attack',
  'raised-fist': 'power', person: 'gear-owner', close: 'close', check: 'confirm', lock: 'locked',
  target: 'focus-target', zzz: 'afk',
  up: 'level-up', 'up-double': 'level-up-max', ascend: 'ascend', recycle: 'reequip', minus: 'empty-slot',
  warning: 'warning', cog: 'generator', web: 'locked-tile', skull: 'defeated', 'star-solid': 'rarity-high',
  diamond: 'rarity-low', bomb: 'minigame-bomb', 'coin-stack': 'minigame-coins', moon: 'dev-background-mode',
  gamepad: 'dev-test-minigame', clipboard: 'dev-copy-perf', potion: 'limit-potion', sacrifice: 'sacrifice-copy',
};

// ── per-assetKey usage description (specific overrides + prefix rules for the rest) ──
const cap = (s) => s.replace(/[-.]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (c) => c.toUpperCase());
const USE = {
  'ui.coin': 'Coin currency — top bar, gacha summon cost, gear fuse cost, reward rows, AFK loot, spend bursts',
  'ui.gem': 'Gem premium currency',
  'ui.energy': 'Energy — top bar (with refill countdown)',
  'ui.heroXp': 'Hero XP — top bar, hero level-up cost, Heroes-screen pool',
  'ui.gearXp': 'Gear XP — top bar, gear level-up/fuse cost, Gear-screen header + pool, Heroes-screen pool',
  'ui.crystal': 'Ascension crystal — Map ascension material',
  'ui.order': 'Order token',
  'ui.reroll': 'Reroll die — orders rail',
  'ui.reward': 'Generic reward icon',
  'ui.chest': 'Chest — order reward / generic chest',
  'ui.star': 'Star',
  'ui.power': 'Power pill — gear tile',
  'ui.pity': 'Gacha pity indicator',
  'ui.timer': 'Timer — banner countdown, AFK away-time',
  'ui.locked': 'Locked — gacha collection locked hero',
  'ui.fuseFodder': 'Fuse fodder — gear fuse cost',
  'ui.summonMachine': 'Summon machine — gacha header',
  'icon.power': 'Power indicator — Autobattler hero chip + hero-menu power line',
  'icon.attack': 'Attack/power prefix — Heroes-screen power, hero-menu gear power, map-tile power, minigame boss banner',
  'icon.focus': 'Focus-target reticle — Autobattler',
  'icon.owner': 'Gear owner avatar badge — hero menu',
  'icon.close': 'Close / exit button — hero menu, minigame',
  'icon.check': 'Confirm / collected checkmark — map cleared, hero-menu equipped, AFK collected',
  'icon.lock': 'Locked state — map tiles + level requirement',
  'icon.levelUp': 'Level-up button — Heroes screen',
  'icon.levelUpMax': 'Level-up-max button — Heroes screen',
  'icon.ascend': 'Ascend button — Heroes screen / hero menu',
  'icon.reequip': 'Reequip button — Heroes screen',
  'icon.equipBest': 'Equip-best button — hero menu + Heroes screen',
  'icon.empty': 'Empty slot — hero-menu compare',
  'icon.warn': 'Warning — boss-special banner, equip-conflict notice',
  'icon.potion': 'Limit-potion order — orders rail + FTUE',
  'icon.generator': 'Merge generator badge — board',
  'icon.generatorBadge': 'Generator lightning badge — board cell',
  'icon.cobweb': 'Locked merge-tile cobweb — board',
  'icon.bestMerge': 'Best-merge toast',
  'icon.boss': 'Boss banner — intro cinematic + minigame',
  'icon.afk': 'AFK alert tile',
  'icon.skull': 'Defeated / skull — AFK popup + intro skull-meter',
  'icon.rarity.star': 'Gacha reveal rarity mark (high tiers)',
  'icon.rarity.diamond': 'Gacha reveal rarity mark (low tiers) + minigame gems',
  'icon.minigame.bomb': 'Minigame HUD — bomb hazard',
  'icon.minigame.squad': 'Minigame HUD — squad count',
  'icon.minigame.coins': 'Minigame HUD — coins',
  'icon.headless': 'Background-mode toggle (dev)',
  'icon.dev.minigame': 'Test-minigame button (dev)',
  'icon.dev.perf': 'Copy-perf toast (dev)',
  'icon.ability.basic': 'Hero ability tab — basic attack',
  'icon.ability.skill': 'Hero ability tab — skill (+ hero-menu emblem)',
  'icon.ability.limit': 'Hero ability tab — ultimate',
  'icon.stat.hp': 'Hero stat row — health',
  'icon.stat.atk': 'Hero stat row — attack',
  'icon.stat.def': 'Hero stat row — defense',
  'icon.sacrifice': 'Ascension "sacrifices 1 copy" hint — Heroes screen',
};
function describe(key) {
  if (USE[key]) return USE[key];
  if (key.startsWith('ui.nav.')) return `Bottom-nav tab: ${cap(key.slice(7))}`;
  if (key.startsWith('ui.chest.')) return `Chest tier: ${cap(key.slice(9))}`;
  if (key.startsWith('status.')) return `Combat status badge: ${cap(key.slice(7))}`;
  if (key.startsWith('node.')) return `Map node type: ${cap(key.slice(5))}`;
  if (key.startsWith('fx.')) return `Weapon VFX glyph: ${cap(key.slice(3))}`;
  if (key.startsWith('banner.')) return `Gacha banner face: ${cap(key.slice(7))}`;
  if (key.startsWith('gear.')) return `Gear slot: ${cap(key.slice(5))}`;
  return cap(key);
}

// ── build rows ──
const usedPurpose = new Map();
const rows = manifest.map((m) => {
  let purpose = PURPOSE[m.slug] || m.slug;
  const n = (usedPurpose.get(purpose) || 0) + 1; usedPurpose.set(purpose, n);
  if (n > 1) purpose = `${purpose}-${n}`;   // guard collisions
  return { slug: m.slug, emoji: m.emoji, category: m.category, purpose, assetKeys: m.assetKeys, uses: m.assetKeys.map(describe) };
});

// ── 1. placeholder prompt files (named by purpose) ──
if (existsSync(PROMPTS_DIR)) rmSync(PROMPTS_DIR, { recursive: true, force: true });
mkdirSync(PROMPTS_DIR, { recursive: true });
for (const r of rows) {
  const ans = ANSWERS[r.slug];
  const spec = (ans && (ans.desired || ans.split))
    ? `${ans.split ? '**SPLIT into separate icons** (one per use above).\n\n' : ''}${ans.desired || '_(marked for split; no description yet)_'}\n`
    : `_(placeholder — fill in via icon-rename.html, export the JSON, then it's baked here + used as the gen prompt)_\n`;
  const body = `# ${cap(r.purpose)} icon\n\n` +
    `Current placeholder glyph: ${r.emoji}   (tool slug: \`${r.slug}\`, category: \`${r.category}\`)\n` +
    `Registry keys: ${r.assetKeys.map((k) => '`' + k + '`').join(', ')}\n\n` +
    `## Where it's used in game\n${r.uses.map((u) => `- ${u}`).join('\n')}\n\n` +
    `## What this icon should actually be\n${spec}`;
  writeFileSync(join(PROMPTS_DIR, `${r.purpose}.md`), body);
}

// ── 2. the rename/spec HTML form ──
const DATA = JSON.stringify(rows);
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Icon rename / spec — bishop-idle-merge</title>
<style>
  :root { --bg:#15171b; --panel:#1c1f24; --line:#2a2d33; --accent:#4db6ff; --dim:#8a9099; --text:#e7e9ec; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:14px/1.5 -apple-system,system-ui,sans-serif; }
  header { position:sticky; top:0; z-index:10; background:#101216; border-bottom:1px solid var(--line); padding:12px 18px; display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
  header h1 { font-size:16px; margin:0; margin-right:auto; }
  button, label.btn { background:#2f5137; border:1px solid #3c6b48; color:#bff0cf; padding:7px 14px; border-radius:7px; cursor:pointer; font-size:13px; font-weight:600; }
  button.sec, label.btn.sec { background:#26303a; border-color:#33414f; color:#cfe3f5; }
  button:hover { filter:brightness(1.12); }
  .count { color:var(--dim); font-size:12px; }
  main { padding:18px; max-width:1100px; margin:0 auto; }
  .cat { margin:22px 0 8px; color:var(--accent); font-size:12px; letter-spacing:.08em; text-transform:uppercase; border-bottom:1px solid var(--line); padding-bottom:5px; }
  .row { display:grid; grid-template-columns:64px 1fr 1.1fr; gap:14px; align-items:start; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 14px; margin-bottom:10px; }
  .ico { text-align:center; }
  .ico .glyph { font-size:34px; line-height:1; }
  .ico img { width:44px; height:44px; object-fit:contain; display:block; margin:4px auto 0; image-rendering:auto; background:#0c0e11; border-radius:6px; }
  .meta .purpose { font-weight:700; font-size:15px; }
  .meta .slug { color:var(--dim); font-size:12px; margin-left:6px; }
  .meta .uses { margin:6px 0 0; padding:0; list-style:none; }
  .meta .uses li { color:#c3c8ce; font-size:12.5px; padding:1px 0 1px 12px; position:relative; }
  .meta .uses li::before { content:'•'; position:absolute; left:0; color:var(--dim); }
  .field label { display:block; color:var(--dim); font-size:11px; margin-bottom:4px; text-transform:uppercase; letter-spacing:.05em; }
  .field textarea { width:100%; min-height:70px; resize:vertical; background:#0f1114; border:1px solid var(--line); border-radius:7px; color:var(--text); padding:8px 10px; font:13px/1.45 inherit; }
  .field textarea:focus { outline:none; border-color:var(--accent); }
  .field textarea.filled { border-color:#3c6b48; }
  .field .split { display:flex; align-items:center; gap:7px; margin-top:8px; color:#e8c069; font-size:12.5px; cursor:pointer; user-select:none; }
  .field .split input { width:16px; height:16px; accent-color:#e8a11f; cursor:pointer; }
  .row.split-on { border-color:#b5892f; box-shadow:inset 0 0 0 1px #7a5c1e; }
  .row.split-on .ico { position:relative; }
  .row.split-on .ico::after { content:'SPLIT'; position:absolute; top:-6px; left:50%; transform:translateX(-50%); font-size:9px; font-weight:700; color:#08131f; background:#e8a11f; padding:1px 4px; border-radius:3px; }
  footer { color:var(--dim); font-size:12px; padding:0 18px 40px; max-width:1100px; margin:0 auto; }
</style></head><body>
<header>
  <h1>Icon rename / spec <span class="count" id="progress"></span></h1>
  <button id="exportBtn">⬇ Export JSON</button>
  <label class="btn sec">⬆ Import JSON<input id="importInput" type="file" accept="application/json" hidden></label>
  <button class="sec" id="clearBtn">Clear</button>
</header>
<main id="list"></main>
<footer>Type what each icon <b>should actually be</b> in the box on the right (name and/or art description). Entries autosave in this browser. When done, <b>Export JSON</b> and send it back — it gets baked into this page and drives renaming every icon in code + the trim tool. Left column shows the current placeholder glyph + seed. One row per unique glyph; a glyph shared across several places lists all its uses (decide if it should split).</footer>
<script>
const ICONS = ${DATA};
const BAKED = ${JSON.stringify(ANSWERS)};   // operator decisions already recorded (icon-rename.json)
const LS_KEY = 'bishop-icon-rename-v1';
const saved = (() => { let ls={}; try { ls = JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch {} return { ...BAKED, ...ls }; })();  // your in-browser edits override the baked answers
const list = document.getElementById('list');
const bySlug = {};
let curCat = null;
for (const it of ICONS) {
  bySlug[it.slug] = it;
  if (it.category !== curCat) { curCat = it.category; const h = document.createElement('div'); h.className='cat'; h.textContent = curCat; list.appendChild(h); }
  const row = document.createElement('div'); row.className='row';
  const seed = '../char-art-pipeline/trim/assets/icons-' + it.category + '/' + it.slug + '.png';
  row.innerHTML =
    '<div class="ico"><div class="glyph">' + it.emoji + '</div><img src="' + seed + '" alt="" onerror="this.style.display=\\'none\\'"></div>' +
    '<div class="meta"><div><span class="purpose">' + it.purpose + '</span><span class="slug">' + it.slug + ' · ' + it.assetKeys.length + ' use(s)</span></div>' +
    '<ul class="uses">' + it.uses.map(u => '<li>' + u.replace(/</g,'&lt;') + '</li>').join('') + '</ul></div>' +
    '<div class="field"><label>What should this icon be?</label><textarea data-slug="' + it.slug + '" placeholder="e.g. a stack of gold coins / rename to \\'coins\\'"></textarea>' +
    '<label class="split"><input type="checkbox" data-split="' + it.slug + '"> Needs to be broken out into separate icons</label></div>';
  list.appendChild(row);
}
const areas = [...document.querySelectorAll('textarea')];
const checks = [...document.querySelectorAll('input[type=checkbox][data-split]')];
const norm = (v) => typeof v === 'string' ? { desired:v, split:false } : (v || { desired:'', split:false });  // back-compat with old string entries
areas.forEach(a => { const v = norm(saved[a.dataset.slug]); if (v.desired) { a.value = v.desired; a.classList.add('filled'); } a.addEventListener('input', persist); });
checks.forEach(c => { const v = norm(saved[c.dataset.split]); if (v.split) { c.checked = true; c.closest('.row').classList.add('split-on'); } c.addEventListener('change', persist); });
function stateFor(slug){ const a=document.querySelector('textarea[data-slug="'+slug+'"]'); const c=document.querySelector('input[data-split="'+slug+'"]'); return { desired:(a?a.value.trim():''), split:!!(c&&c.checked) }; }
function persist(){ const s={}; for (const it of ICONS){ const st=stateFor(it.slug); if(st.desired||st.split) s[it.slug]=st; } areas.forEach(a=>a.classList.toggle('filled', !!a.value.trim())); checks.forEach(c=>c.closest('.row').classList.toggle('split-on', c.checked)); localStorage.setItem(LS_KEY, JSON.stringify(s)); progress(); }
function progress(){ const done=ICONS.filter(it=>{const st=stateFor(it.slug); return st.desired||st.split;}).length; const sp=checks.filter(c=>c.checked).length; document.getElementById('progress').textContent = done + ' / ' + ICONS.length + ' specified' + (sp? ' · ' + sp + ' to split' : ''); }
document.getElementById('exportBtn').onclick = () => {
  const icons = ICONS.map(it => { const st=stateFor(it.slug); return { slug: it.slug, emoji: it.emoji, purpose: it.purpose, category: it.category, assetKeys: it.assetKeys, desired: st.desired, splitIntoSeparate: st.split }; });
  const blob = new Blob([JSON.stringify({ version:1, icons }, null, 2)], { type:'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'icon-rename.json'; a.click(); URL.revokeObjectURL(a.href);
};
document.getElementById('importInput').onchange = (e) => {
  const f = e.target.files[0]; if(!f) return; const r = new FileReader();
  r.onload = () => { try { const j = JSON.parse(r.result); const map = {}; (j.icons||[]).forEach(x => { map[x.slug]={ desired:x.desired||'', split:!!(x.splitIntoSeparate||x.split) }; }); areas.forEach(a => { const v=map[a.dataset.slug]; if(v){ a.value=v.desired; } }); checks.forEach(c => { const v=map[c.dataset.split]; if(v){ c.checked=v.split; } }); persist(); } catch { alert('Not valid icon-rename JSON'); } };
  r.readAsText(f);
};
document.getElementById('clearBtn').onclick = () => { if(confirm('Clear all entries?')){ areas.forEach(a=>{a.value='';a.classList.remove('filled');}); checks.forEach(c=>{c.checked=false;c.closest('.row').classList.remove('split-on');}); localStorage.removeItem(LS_KEY); progress(); } };
progress();
</script></body></html>
`;
writeFileSync(HTML_OUT, html);

console.log(`prompts/ → ${rows.length} placeholder files (named by purpose)`);
console.log(`icon-rename.html → ${rows.length} icons across ${new Set(rows.map(r => r.category)).size} categories`);
