// SKULL ISLAND's secrets (docs/SECRETS.md "Skull Island's secrets", docs/SKULL_ISLAND.md phase 4): the progress kept in the quest's own meta, the hidden DOUBLOON CHESTS, the
// friendly KRAKEN PAL, and the Treasure Room's rematch with Blunderbeard.
//
//   ISLAND TREASURE   One hidden doubloon chest in each of the five stages before the palace (silevels.js `doubloon: { x, y }`): the Blue Gull, the Kraken, the Cave, the Swamp
//                     and the Cell.  A glint (and a chirp) shows where; three whacks open it ("DOUBLOON!").  Each is counted once (meta.doubloons = [level ids]).  All five
//                     open THE TREASURE ROOM: a gold chest on the island map's lower-left cove (and BONUS: THE TREASURE ROOM in the level select), a rematch with Captain
//                     Blunderbeard on the Gull's wreck (src/sibosses.js BlunderbeardRematch; the level `sitreasure` in src/silevels.js SI_SECRET_LEVELS).
//   KRAKEN PAL        FULL CALM in the Cave: no fire wolf ever reached RAAAR (rage 0.65) and the Alpha never went past 0.95 -- then, when the Alpha curls up as a puppy, the
//                     friendly kraken "heard how calm you were": meta.krakenPal.  In the Skull Palace's BEAM CLASH it rises beyond the windows and lends the heroes' beam
//                     a great push, once per fight (src/sipalace.js krakenHelp).  The pal stays earned (a new run, a replayed palace: it comes again).
import { Actor } from './actors.js';
import { audio } from './audio-proxy.js';
import { loadMeta, writeMeta } from './save.js';
import { clamp, TAU } from './rig.js';
import { INK, DEPTH } from './config.js';
import * as SIFX from './sifx.js';   // (Book 2's material particles: the FX agent's src/sifx.js)

/** the five stages with a doubloon chest, in the order of the island (the treasure room opens when every one is found) */
export const DOUBLOON_LEVELS = ['sibluegull', 'sikraken', 'sicave', 'siswamp', 'sicell'];
export const DOUBLOON_NAMES = { sibluegull: 'THE BLUE GULL', sikraken: 'THE KRAKEN', sicave: 'THE CAVE OF RAGE', siswamp: 'THE SWAMP OF DESPAIR', sicell: 'THE CELL OF SLOTH' };

/** the doubloons found (the quest's own meta; any junk in it is ignored) */
export function siDoubloons(meta = loadMeta()) { return Array.isArray(meta.doubloons) ? [...new Set(meta.doubloons.filter((d) => DOUBLOON_LEVELS.includes(d)))] : []; }
export function addDoubloon(id) {
  const meta = loadMeta(), d = siDoubloons(meta);
  if (!DOUBLOON_LEVELS.includes(id) || d.includes(id)) return d;
  meta.doubloons = [...d, id]; writeMeta(meta);
  return meta.doubloons;
}
/** every doubloon is found: the Treasure Room is open */
export const treasureOpen = (meta = loadMeta()) => siDoubloons(meta).length >= DOUBLOON_LEVELS.length;
/** the kraken pal is earned (the Cave's full calm) */
export const krakenPal = (meta = loadMeta()) => meta.krakenPal === true;
export function earnKrakenPal() { const meta = loadMeta(); if (meta.krakenPal === true) return false; meta.krakenPal = true; writeMeta(meta); return true; }
const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
/** ?krakenpal=1 / ?doubloons=all: a test URL's progress (nothing is written) */
export const testPal = () => Q.get('krakenpal') === '1';
export const testDoubloons = () => Q.get('doubloons') === 'all';

// ------------------------------------------------------------------------------------------------ the doubloon chest
/** a hidden gold-trimmed chest: a glint from afar, three whacks and it pops open (the persistent count: addDoubloon) */
export class DoubloonChest extends Actor {
  constructor(game, def) {
    super(game, def.x, def.y ?? 70);
    this.team = 'thing'; this.solid = false; this.kind = 'doubloon'; this.def = def;
    this.w = 36; this.h = 54; this.shadowR = 40; this.hp = 3; this.open = 0; this.shake = 0; this.flash = 0; this.found = false;
    this.levelId = game.L.id;
    const done = siDoubloons().includes(this.levelId);
    if (def.hoard) { this.hp = 0; this.open = 1; this.found = true; this.hoard = true; this.shadowR = 30; }   // (the Treasure Room's loot: open and full, nothing to whack)
    else if (done) { this.hp = 0; this.open = 1; this.found = true; this.old = true; }   // (found in an earlier visit: it stands open, empty -- nothing is paid twice)
  }
  get hittable() { return this.hp > 0; }
  takeHit() {
    const g = this.game;
    if (this.hp <= 0) return false;
    this.hp--; this.flash = 6; this.shake = 6;
    audio.sfx('block', { pitch: 1.2 });
    if (this.hp <= 0) this.pop();
    return true;
  }
  pop() {
    const g = this.game, before = siDoubloons().length;
    this.found = true;
    g.fx.list = g.fx.list.filter((q) => !(q.type === 'word' && q.text === 'WHACK ME!'));   // (its call is answered: DOUBLOON! takes its place)
    const all = testDoubloons() ? DOUBLOON_LEVELS : addDoubloon(this.levelId);
    audio.sfx('doubloon_chest');
    SIFX.burst(this.x, this.y, 30, 'chest', { k: 1.5 }); SIFX.glints(this.x, this.y, 50, 6);
    g.fx.label(this.x, this.y, 118, 'DOUBLOON!', '#ffd86a', 34, 70);
    for (let i = 0; i < 7; i++) g.spawnPickup('coin', this.x + (Math.random() - 0.5) * 70, clamp(this.y + (Math.random() - 0.5) * 30, 4, DEPTH - 4));
    g.spawnPickup(Math.random() < 0.5 ? 'drumstick' : 'gem', this.x, clamp(this.y + 16, 4, DEPTH - 4));
    g.app.run.score = (g.app.run.score || 0) + 500;
    const n = all.length;
    const tip = n >= DOUBLOON_LEVELS.length
      ? 'ALL FIVE DOUBLOONS! The TREASURE ROOM is open! || Find the gold chest on the island map. || Captain Blunderbeard wants his treasure back!'
      : `A golden DOUBLOON! ${n} of ${DOUBLOON_LEVELS.length} found! || One hides in every stage: look for the glint!`;
    if (!g.mm?.hint?.('sidoubloon', tip, 420, this.levelId !== 'sicave')) this.tipLater = { text: tip, until: g.frame + 1500 };   // (in the Cave the pop's tip does not replace the calm lesson: it waits for it, update)
    if (n >= DOUBLOON_LEVELS.length && before < DOUBLOON_LEVELS.length) { g.fx.label(g.camX + 480, 60, 220, 'THE TREASURE ROOM IS OPEN!', '#ffe066', 36, 120); audio.jingle?.('freed_big'); }
  }
  update() {
    const g = this.game;
    this.tick();
    if (this.shake > 0) this.shake--; if (this.flash > 0) this.flash--;
    if (this.hp <= 0) this.open = Math.min(1, this.open + 0.06);
    if (this.tipLater && g.frame % 30 === 0 && (g.mm?.hint?.('sidoubloon', this.tipLater.text, 420) || g.frame > this.tipLater.until)) this.tipLater = null;   // (the "n of 5" tip a busy hint bar dropped: re-tried every half second, for up to 25 s)
    // the glint: the first time a hero is near, a chirp and a word over the chest (always: a tip on screen cannot swallow it), then the line once a tip is not up (retried every 45 frames until it lands)
    if (this.hp > 0 && !this.hoard && g.players.some((p) => !p.out && Math.abs(p.x - this.x) < 330 && Math.abs(p.y - this.y) < 150)) {
      if (!this.chirped) { this.chirped = true; this.callT = 0; audio.sfx('doubloon_glint', { vol: 0.8 }); }
      if (this.callT !== undefined && this.callT++ === 20) g.fx.label(this.x, this.y, 112, 'WHACK ME!', '#fff2a8', 30, 110);
      if (!this.told && this.st % 45 === 0 && g.mm?.hint?.('sidoubloonglint', 'Something GOLDEN is glinting over there... whack it!', 300)) this.told = true;
    }
    // a ranged hero attack counts too (src/projectiles.js only looks at foes): a shot that reaches it bursts on it, a beam's tick in front of its shooter hits it
    if (this.hp > 0 && !this.hoard && this.x > g.camX + 20 && this.x < g.camX + 940) {   // (on screen only: a beam would otherwise pop a chest from miles away)
      for (const s of g.actors) {
        if (s.team !== 'heroShot' || s.gone) continue;
        if (s.tickN !== undefined && s.S) {
          if (s.st % s.S.tick !== 1) continue;
          const dir = s.facing || 1, o = s.owner.shootOrigin();
          if (Math.abs(this.y - s.y) <= s.S.width + 14 && (this.x - o.x) * dir > -this.w) this.takeHit();
        } else if (Math.abs(s.x - this.x) < 38 && Math.abs(s.y - this.y) < 26 && s.z < 160 && s.z > -20) { if (s.explode) s.explode(); else s.gone = true; this.takeHit(); }
        if (this.hp <= 0) break;
      }
    }
    if (this.hp > 0 && this.st % 150 === 20 && this.onScreen2()) audio.sfx('doubloon_glint', { vol: 0.4 });
  }
  onScreen2() { const g = this.game; return this.x > g.camX - 20 && this.x < g.camX + 980; }
  draw(ctx) {
    const sh = this.shake ? Math.sin(this.shake * 2.5) * 3 : 0, o = this.open, t = this.game.time;
    ctx.save(); ctx.translate(this.sx + sh, this.sy); ctx.lineJoin = 'round';
    // the chest: dark wood, gold bands and a gold lock; the lid swings open
    ctx.fillStyle = this.flash ? '#fff' : '#80502a'; ctx.strokeStyle = INK; ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.rect(-30, -34, 60, 34); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8b43a'; for (const x of [-22, 16]) { ctx.beginPath(); ctx.rect(x, -34, 7, 34); ctx.fill(); ctx.stroke(); }
    ctx.save(); ctx.translate(-30, -34); ctx.rotate(-o * 1.25);
    ctx.fillStyle = this.flash ? '#fff' : '#925a32'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(0, -22, 30, -24); ctx.quadraticCurveTo(60, -22, 60, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8b43a'; for (const x of [8, 46]) { ctx.beginPath(); ctx.moveTo(x, -3); ctx.quadraticCurveTo(x, -19, x + 3, -22); ctx.lineTo(x + 8, -22); ctx.quadraticCurveTo(x + 8, -19, x + 8, -3); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.rect(-7, -42 + o * 6, 14, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, -36 + o * 6, 2.4, 0, TAU); ctx.fill();
    if (o > 0.3 && (this.hoard || !this.old)) {   // the gold inside, a doubloon on top (a chest found on an earlier visit stands open and EMPTY)
      ctx.save(); ctx.globalAlpha = Math.min(1, (o - 0.3) * 2); ctx.fillStyle = '#ffd23a'; for (const [x, y] of [[-16, -34], [-4, -40], [10, -36], [20, -32], [0, -32]]) { ctx.beginPath(); ctx.ellipse(x, y, 8, 4.5, 0, 0, TAU); ctx.fill(); ctx.stroke(); } ctx.restore();
    }
    ctx.restore();
    // the glint: a four-point star twinkling above it until it is found
    if (!this.found) {
      const k = 0.55 + 0.45 * Math.sin(t * 5 + this.x), r = 12 + 7 * k;
      ctx.save(); ctx.translate(this.sx + 14, this.sy - 62 - 4 * Math.sin(t * 3)); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 2.2); g.addColorStop(0, 'rgba(255,250,200,0.95)'); g.addColorStop(1, 'rgba(255,200,60,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 2.2, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#fffbe0'; ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = i * TAU / 8, rr = i % 2 ? r * 0.3 : r * 1.25; i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
  }
}
