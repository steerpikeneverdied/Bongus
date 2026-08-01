// === FTUE coachmark beats (view-side) ===
// The guided-opening sequence, driven purely by OBSERVABLE state + persisted ftueSeen_* flags.
// Each beat: `show(state)` (when it's relevant) and, for ACTION beats, `done(state)` (when complete →
// the driver records it seen + the card AUTO-DISMISSES). Info beats (no `done`) advance on a GOT IT tap.
//
// DESIGN RULE (why this file was reworked): a beat that teaches an ACTION must (a) SPOTLIGHT the real
// thing to tap (a `target` selector) and (b) carry a `done(state)` so it AUTO-DISMISSES the instant the
// action lands — never a GOT IT on something the player already did. Reserve info/GOT IT for pure
// "read this" spectacle beats with no action (coldOpen, gotGear, alchemistExplain). The FTUE NEVER
// force-navigates — it rings the nav button and the PLAYER taps it.
//
// IMPORTANT — every `done` must be MONOTONIC: false until the action is done, then true (and stay true
// long enough to be recorded). The driver records completion INDEPENDENT of `show` (a beat's show can
// flip false the same tick its done becomes true), so `show`/`done` need not be mutually consistent.
//
// Copy is presentation and lives here. Removing the FTUE = delete this folder + the one <FtueLayer/>
// mount; the sim-side overrides fall through on their own (see src/data/config/schemas/ftue.ts).
import { isLimitReady } from '../../model/battle.js';
import { canFulfill, orderReward } from '../../model/orders.js';
import { canEquipBetter, heroClassOf } from '../../model/gear.js';
import { canLevelHero } from '../../model/progression.js';
import { SELECTED_SLOTS } from '../../data/config.js';
import { iconAsset } from '../assets.js';
const potionGlyph = iconAsset('potion').emoji;   // registry-sourced (no inline emoji literal in copy)

const flag = (s, k) => !!(s.flags && s.flags[k]);
const seen = (s, id) => flag(s, 'ftueSeen_' + id);
const potionOrder = (s) => (s.orders || []).find((o) => o && o.reward === 'potion' && Array.isArray(o.items) && o.items.length && !o.fulfilling && !o.pending);
const potionDeliverable = (s) => { const o = potionOrder(s); return !!o && canFulfill(s.board, o); };
const unlockedTierUp = (s) => (s.board || []).some((c) => c && c.kind === 'item' && !c.special && !c.locked && c.level >= 1);
const anyReady = (s) => (s.battle.heroes || []).some((h) => isLimitReady(h));
// A READY *normal* order = deliverable, not the forced opening potion/gear order, not pending/fulfilling.
// Gives the normalOrder beat a live `.order.ready` tile to spotlight; its auto-dismiss is the ftueNormalOrder flag.
const readyNormalOrder = (s) => (s.orders || []).some((o) => o && !o.pending && !o.fulfilling && !o.forceSlot && orderReward(o) !== 'potion' && canFulfill(s.board, o));

// ── Gear-up guide (Best Gear Squad → Level Up Squad) — armed by the good-gear chest AND by the first
// two losses (see armGearGuide in reducer-helpers). Gated on `armed`; each step also checks that the
// squad can actually improve so we never spotlight a disabled button. Reads the squad from state.order.
const armed = (s) => flag(s, 'ftueGearArmed');
const squad = (s) => (s.order || []).slice(0, SELECTED_SLOTS);
const squadCanGear = (s) => squad(s).some((cid) => s.heroes[cid] && canEquipBetter(s.gear, cid, heroClassOf(s.heroes[cid].hero)));
const squadCanLevel = (s) => squad(s).some((cid) => s.heroes[cid] && canLevelHero(s.heroes[cid], s.heroXp));
const gearNeeded = (s) => !flag(s, 'ftueSquadGeared') && squadCanGear(s);
const levelNeeded = (s) => !flag(s, 'ftueSquadLeveled') && squadCanLevel(s);

// Ordered. The driver shows the FIRST unseen beat whose `show(state)` holds.
export const FTUE_BEATS = [
  { id: 'coldOpen', style: 'nudge', // info (GOT IT) — pure hook, no action to auto-detect
    copy: 'Your squad fights on its own.',
    sub: 'Autos alone won’t break through — charge a LIMIT to wipe the wave.',
    show: (s) => s.battle.level === 1 },

  { id: 'forge', style: 'gate', target: '.mb-gen', // ring the generator; auto-dismisses on the first forge
    copy: 'Tap a generator to forge a weapon tile.',
    sub: 'Each tap drops a tile onto the board.',
    show: (s) => seen(s, 'coldOpen'),
    done: (s) => flag(s, 'ftueForged') },

  { id: 'merge', style: 'gate', target: '.mb-board', // ring the board; auto-dismisses on the first merge
    copy: 'Drag two matching blade tiles together to merge them.',
    sub: `Two of a kind become one of the next tier — enough to complete the ${potionGlyph} order.`,
    show: (s) => seen(s, 'forge'),
    done: (s) => potionDeliverable(s) || unlockedTierUp(s) },

  { id: 'potion', style: 'gate', target: '.order.potion', // highlight the potion order tile in the rail
    copy: `Deliver the ${potionGlyph} LIMIT POTION order.`,
    sub: 'It fills your hero’s limit bar to full.',
    show: (s) => seen(s, 'merge') && !!potionOrder(s),
    done: (s) => anyReady(s) }, // the potion fills to FULL → a hero becomes limit-ready

  { id: 'limit', style: 'gate', pause: true, target: '.hero-chip.can-fire .lb-btn', // FREEZE the fight + ring the charged hero's limit; the first FTUE limit is a guaranteed crit-kill (reducer-combat)
    copy: 'Tap the glowing LIMIT to unleash it!',
    sub: 'It crits the whole wave — an instant wipe.',
    show: (s) => anyReady(s) && s.battle.status === 'fighting', // only freeze/spotlight when it's actually fireable (no intro/clearing soft-lock while paused)
    done: (s) => flag(s, 'ftueLimitFired') },

  // ── Good-gear chest → announce it, then guide equip + level via the squad buttons. Armed by the chest
  // pop (ftueGearChest) and re-armed by the first two losses. ──
  { id: 'gotGear', style: 'nudge', // info (GOT IT) — celebrate the guided epic-armour reward
    copy: 'YOU GOT SOME GEAR!',
    sub: 'Head to HEROES to equip it and level your squad.',
    show: (s) => flag(s, 'ftueGearChest') },

  { id: 'gearOpen', style: 'gate', target: '[data-nav="heroes"]', // ring the HEROES nav — the player taps (no screen yank)
    copy: 'Power up your squad.',
    sub: 'Open HEROES to gear + level your whole team.',
    show: (s) => armed(s) && s.screen !== 'heroes' && (gearNeeded(s) || levelNeeded(s)),
    done: (s) => s.screen === 'heroes' },

  { id: 'gearGearSquad', style: 'gate', target: '[data-ftue="gear-squad"]', // ring BEST GEAR (squad)
    copy: 'Tap BEST GEAR to equip your whole squad.',
    sub: 'Every hero instantly gets their strongest gear.',
    show: (s) => armed(s) && s.screen === 'heroes' && gearNeeded(s),
    done: (s) => flag(s, 'ftueSquadGeared') },

  { id: 'gearLevelSquad', style: 'gate', target: '[data-ftue="level-squad"]', // ring LEVEL UP (squad)
    copy: 'Tap LEVEL UP to level your whole squad.',
    sub: 'Spends your XP to make everyone stronger.',
    show: (s) => armed(s) && s.screen === 'heroes' && levelNeeded(s) && !gearNeeded(s),
    done: (s) => flag(s, 'ftueSquadLeveled') },

  { id: 'normalOrder', style: 'gate', target: '.order.ready', // ring a ready order; auto-dismisses when a normal one is delivered
    copy: 'Keep the orders flowing — deliver a ready one.',
    sub: 'Merge to fill orders — they’re your steady stream of gear, XP & rewards.',
    show: (s) => seen(s, 'limit') && readyNormalOrder(s),
    done: (s) => flag(s, 'ftueNormalOrder') },

  { id: 'summon', style: 'gate', mask: true, // rings/masks the SUMMON nav until the player opens it, then the free-pull button (no screen yank)
    target: (s) => s.screen === 'gacha' ? '[data-ftue="pull"]' : '[data-nav="gacha"]',
    copy: 'Things are getting tough — hire another hero!',
    sub: 'Your first pull is on us — tap SUMMON to recruit.',
    show: (s) => flag(s, 'ftueFirstPull'),
    done: (s) => flag(s, 'ftuePulled') },

  { id: 'alchemistExplain', style: 'nudge', pause: true, // info (GOT IT); freezes the sim while it explains
    copy: 'Meet the ALCHEMIST — its LIMIT BREAK hits EVERY enemy at once.',
    sub: 'Charge it up, then unleash it to clear the whole screen.',
    show: (s) => flag(s, 'ftuePulled') && s.screen === 'merge' },

  { id: 'alchemistUse', style: 'gate', mask: true, // ISOLATE the recruited Alchemist's OWN limit button (it arrives full → just tap it)
    target: (s) => flag(s, 'ftueAlchemistCid') ? `[data-battle-hero="${s.flags.ftueAlchemistCid}"] .lb-btn` : null,
    copy: 'Tap the ALCHEMIST’s glowing limit — wipe them all!',
    sub: 'Its AOE limit hits every enemy on screen at once.',
    show: (s) => seen(s, 'alchemistExplain'),
    done: (s) => flag(s, 'ftueAlchemistUsed') },

  { id: 'bossHire', style: 'gate', target: '[data-nav="gacha"]', // highlight the SUMMON nav (non-blocking — they can still challenge)
    copy: 'A BOSS looms ahead — hire another hero!',
    sub: 'Head to SUMMON and recruit reinforcements before you challenge it.',
    show: (s) => s.battle.status === 'gate',
    done: (s) => s.battle.status === 'gate' && s.screen === 'gacha' }, // dismisses when they open SUMMON at the gate
];
