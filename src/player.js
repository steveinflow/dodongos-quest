// A playable hero (Dodongo, Anastasia or Shadow): movement, the four-hit combo, jump attack, dash attack,
// projectile (cooldown), ultimate (super meter), carrying/throwing objects, knockdowns, lives, portal warp-ins.
import { Actor, GRAV, boxOf, overlaps } from './actors.js';
import { HEROES, COMBO } from './heroes.js';
import { CHARS } from './chars.js';
import { audio } from './audio-proxy.js';
import { drawWithFlash, setSilhouette } from './render.js';
import { W, FLOOR_TOP, PLAYER_COLS } from './config.js';
import { clamp, mix } from './rig.js';
import { HeroFireball, Shuriken, Beam, Star, GrappleHook, Shard, novaBurst } from './projectiles.js';
import { packHas } from './sprite3d.js';
import { FlameStream } from './flamestream.js';
import * as FORM from './forms.js';   // (the secret forms' mechanics and auras: hero.form)
import * as SIFX from './sifx.js';    // (Skull Island's material hit bursts: Book 2 only, landed())
import { cacheCanvas } from './canvasmem.js';

// the co-op floor ring (Player.drawShadow): stroked ONCE per player colour into a small canvas at the screen's scale, then
// drawn as an image every frame -- a path stroke a frame per hero cost ~0.25 ms each on a software-drawn canvas (WebKit).
// Four tiny canvases (~43 KB each at 2x), made on first use and remade only when the screen's scale changes.
const RING_RX = 36, RING_RY = RING_RX * 0.32, RING_PAD = 6, RINGS = new Map();
function ringImage(col, ds) {
  const R = RINGS.get(col);
  if (R && R.ds === ds) return R.c;
  const w = Math.ceil((RING_RX + RING_PAD) * 2 * ds), h = Math.ceil((RING_RY + RING_PAD) * 2 * ds), r = cacheCanvas(w, h);
  if (R?.c) { R.c.width = R.c.height = 1; }      // (the old scale's: let go)
  if (!r) { RINGS.set(col, { ds, c: null }); return null; }   // (no canvas to be had -- the iOS memory cap: stroked live instead)
  const g = r.g; g.scale(ds, ds); g.beginPath(); g.ellipse(RING_RX + RING_PAD, RING_RY + RING_PAD, RING_RX, RING_RY, 0, 0, Math.PI * 2);
  g.lineWidth = 5.5; g.strokeStyle = 'rgba(20,12,30,0.5)'; g.stroke();
  g.lineWidth = 3; g.strokeStyle = col; g.stroke();
  RINGS.set(col, { ds, c: r.c });
  return r.c;
}

// Twins (two players on one hero): a thin outline in each one's own colour round the sprite (Player.drawTwinRim) -- in a
// crowd the floor ring hides behind other sprites; the outline rides on the drawing itself.  Cheap on the iPad:
//   * the drawing's identity is read through RIM_REC, a stand-in context that draws nothing (it notes the sprite's
//     drawImage calls): the outline is remade only when the drawing changes (~8-15 a second), not every frame -- but
//     then always, the same frame: an outline never waits, so it never blinks off, nor shows a stale shape (a cap of
//     one remake a frame hid a four-twin brawl's outlines half the time: a flicker);
//   * remade at half a game px a texel: the drawing (its source-over pages only -- not Ana's additive glow) into a shared
//     scratch, filled with the colour (source-in), dilated by 6 whole-texel offset copies into a second shared scratch,
//     the drawing cut back out (destination-out), then smoothed up 2x into the twin's own buffer;
//   * drawn each frame as ONE unfiltered drawImage of that buffer, just behind the sprite (a filtered, scaled draw costs
//     ~4x as much on a software canvas; at a texel a game px -- 2 device px at DPR 2 -- the steps don't show).
// Memory: 2 scratches (160 x 165) + a buffer per twin (192 x 232), through cacheCanvas (counted; the iOS cap): 0.92 MB at
// four twins.  Not drawn for a code-rig moment (a pack still loading) or a GPU page (the WebGL layer: RIM_REC's alpha 0
// skips it) -- the ring and the tag still say who's who.  ?twinrim=0: off.
const RIM_ON = typeof location === 'undefined' || new URLSearchParams(location.search).get('twinrim') !== '0';
const RIM_S = 0.5, RIM_FX = 160, RIM_FY = 260, RIM_W = 320, RIM_H = 330;   // texels / game px; the box round the feet (game px)
const RIM_PW = 192, RIM_PH = 232;   // a twin's own buffer (texels): the outline at up to 1 texel a game px (2x the scratch)
// (whole texels, no resampling; six offsets on a hexagon: the outline 1.8-2.1 texels wide in every direction)
const RIM_OFF = [[2, 0], [-2, 0], [1, 2], [-1, 2], [1, -2], [-1, -2]];
const RIM_M = 3;                    // (texels round the drawing's bounds: the outline and a texel of filtering)
let RIM_SCR, RIM_DIL;   // the shared scratches: the drawing's silhouette, its outline (undefined: not tried yet; null: refused)
const RIM_BUFS = [];    // each slot's own buffer (pooled: one a slot for the session, whoever plays it)
const RIM_IDS = new WeakMap(); let rimIds = 0;
const rimId = (img) => { let i = RIM_IDS.get(img); if (!i) RIM_IDS.set(img, i = ++rimIds); return i; };
const RIM_REC = (() => {
  const T = {
    m: [1, 0, 0, 1, 0, 0], st: [], list: [], rig: false, globalAlpha: 0, globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: true, imageSmoothingQuality: 'low', shadowColor: 'rgba(0,0,0,0)', shadowBlur: 0, shadowOffsetX: 0,
    shadowOffsetY: 0, filter: 'none', canvas: { width: 1, height: 1 },
    reset() { this.m = [1, 0, 0, 1, 0, 0]; this.st.length = 0; this.list.length = 0; this.rig = false; this.globalAlpha = 0; this.globalCompositeOperation = 'source-over'; },
    getTransform() { return new DOMMatrix(this.m); },
    setTransform(a, b, c, d, e, f) { this.m = typeof a === 'object' ? [a.a, a.b, a.c, a.d, a.e, a.f] : [a, b, c, d, e, f]; },
    resetTransform() { this.m = [1, 0, 0, 1, 0, 0]; },
    transform(a, b, c, d, e, f) { const [A, B, C, D, E, F] = this.m; this.m = [A * a + C * b, B * a + D * b, A * c + C * d, B * c + D * d, A * e + C * f + E, B * e + D * f + F]; },
    translate(x, y) { this.transform(1, 0, 0, 1, x, y); },
    scale(x, y) { this.transform(x, 0, 0, y, 0, 0); },
    rotate(r) { const c = Math.cos(r), s = Math.sin(r); this.transform(c, s, -s, c, 0, 0); },
    save() { this.st.push([this.m, this.globalAlpha, this.globalCompositeOperation]); },
    restore() { const s = this.st.pop(); if (s) [this.m, this.globalAlpha, this.globalCompositeOperation] = s; },
    drawImage(img, ...a) { if (this.globalCompositeOperation === 'source-over') this.list.push([img, a, this.m]); },
  };
  // (anything else -- a path, a gradient -- is a code rig drawing: not outlined)
  const DUMMY = { addColorStop() {}, width: 0 };
  return new Proxy(T, { get(t, k) { if (k in t) return t[k]; return () => { t.rig = true; return DUMMY; }; } });
})();

const COMBO_GAP = 26;           // frames after an attack in which the next combo hit can start
export const METER_MAX = 300;   // three bars of super
export const METER_GAIN = 2.5;  // hits fill the meter at 2.5x their ember (the iPad round: melee 2.5x, shots ~2x as often)
export const METER_REGEN = 5 / 60;   // the meter creeps up by itself in play: 5 a second, a bar (100) every 20 s
// DODGE: a dash-roll -- dur frames, ~dist px (a steady slide to `slide`, easing out by `stop`: the painted 'dodge' clip's
// roll, back on the feet, landing and standing up), invulnerable from inv0 to inv1 (the roll), then cd frames before the next
export const DODGE = { dur: 22, dist: 120, slide: 14, stop: 18, inv0: 3, inv1: 14, cd: 20 };
// the STOP and the TURN (the anim audit #4): a run let go coasts to a stop on its own drawings -- or painter 3's 'skid' (skidF frames,
// over skidV px/f) -- and a walk let go plays on to its next foot contact (ph 0 / 0.5) before the idle (it cut dead from the run's full
// lean, and popped mid-stride); a reversed run turns on painter 3's 'runTurn' (turnF frames) where the atlas has one, else as before
const STOP = { runDecay: 0.74, skidDecay: 0.8, walkDecay: 0.6, maxF: 14, skidF: 10, skidV: 3, turnF: 6 };
/** the idle loop's calm start for an art: { f0, room } -- frames into its cycle where the longest run of drawings clear of the pack's
 *  blink drawings (clipInfo('idle').blink: closed lids, Dodongo's squint; a drawing either side kept clear too, a lid half down) begins,
 *  and that run's length.  An art that doesn't expose clipInfo (the hero modules pass on ANIM / draw, not it): the loop's start, f0 0 --
 *  every painted hero / form idle's first lid is drawing 7 or later, 60+ frames in (Ana / Shadow / their forms 12 of 20, Dodongo 7 of
 *  12, Scarlet / the Pirate Queen 9-10 of 30).  Cached per art object */
const CALM = new WeakMap();
function calmIdle(art) {
  if (!art || typeof art !== 'object') return null;
  if (CALM.has(art)) return CALM.get(art);
  let R = { f0: 0, room: 80 };   // (slot offsets 14 f apart: slot 3 at 42, its first 12 frames clear of the earliest lid-adjacent drawing -- Dodongo's 6, at 60)
  const I = art.clipInfo?.('idle');
  if (I && I.arg === 't' && I.blink && I.blink.length && I.cycle > 0 && I.n > 0) {
    const n = I.n, bad = new Set();
    for (const b of I.blink) for (const d of [-1, 0, 1]) bad.add((((b + d) % n) + n) % n);
    let best = -1, len = 0;
    for (let s = 0; s < n; s++) {
      if (bad.has(s) || !bad.has((s + n - 1) % n)) continue;   // (a run's first drawing: clear, after a lid)
      let L = 0; while (L < n && !bad.has((s + L) % n)) L++;
      if (L > len) { len = L; best = s; }
    }
    R = best >= 0 ? { f0: best * I.cycle / n, room: len * I.cycle / n } : null;   // (no calm run at all: the old clock)
  }
  CALM.set(art, R);
  return R;
}
// (painter 3's re-timed back-hop, critic pass 2: px a frame by st -- still through the load and the push, the distance in the air (f4-11),
//  easing out over the touch, the skid and the rise; 22 f, 120 px = DODGE.dist.  Only with the 'dodgeBack' clip: the roll keeps DODGE's slide)
const DODGE_BACK_V = [0, 0.5, 1.5, 5, 11, 13, 14, 14, 14, 14, 13, 11.5, 3, 2, 1.5, 1, 0.5, 0.3, 0.2, 0, 0, 0];   // (critic 3A: the touch-down at ~3 px/f -- it slipped ~7 px on the planted landing; 120 px)
// the PERFECT DODGE: a foe's hit or shot that would have landed in the roll's first `win` frames (from inv0: the dodge
// started at most ~10 frames before it) -- the world (foes, their shots, hazards) slows to k for n frames, the hero at
// full speed, and the dodger's next hit to land in it is a CRITICAL COUNTER: crit x damage (critBoss x on a boss), a knockdown
// (from..win: the roll's frames a hit counts as PERFECT -- a dodge up to ~12 frames before it; was inv0 3..10, too tight)
export const PERFECT = { from: 1, win: 12, k: 0.35, n: 75, crit: 2, critBoss: 1.5 };
// the charged shot: held this many frames from the press the hero starts charging; full at `full`
export const CHARGE = { start: 12, full: 45 };
// moving while charging (a spell, a melee blow, Legend Shadow's rapid fire): this x the hero's walk, any way the stick
// points -- no run, no jump; facing follows the stick (the release goes that way)
export const CHARGE_MOVE = 0.6;
// a breathed fireball (Dodongo, Dragon Dodongo) starts this far ahead of the mouth, its flash too: never on his face
const MUZZLE_AHEAD = 30;
const MM_DRAGON_K = 1.5;          // (Mystic Mountain's summit dragon: hitting and hit this much bigger -- Player constructor)
const MM_DRAGON_V = 0.9 / 0.85;   // (... and DRAWN this much bigger than the dragon hero: 0.9 of the duel's size as before -- src/chars/dragon_hero.js SCALE 0.85, the model audit #11)
// where each hero's charge gathers in the painted drawings (src/sprite3d.js landmarks): [the spell's, the melee blow's] --
// the spell's is SHOOT_ORIGIN's own landmark (tools/sprite3d chars/*.py), the blow's the weapon hand (Ana: her crystal)
export const CHARGE_LM = { dodongo: ['mouth', 'mid'], ana: ['ctip', 'crystal'], shadow: ['hand', 'mid'], scarlet: ['hookhand', 'mid'], dragon: ['mouth', 'mouth'] };
// (a spell breathed: the orb gathers just ahead of the mouth -- on it, it hid his face)
const CHARGE_AHEAD = { dodongo: true, dragon: true };
// the holds counted through busy states (latchHolds): [key, button, its tap buffer]
const HOLDS = [['A', 'attack', 'bufA'], ['P', 'shoot', 'bufP']];
// a hold is pinned at 0 here -- hitstun, a knockdown, a super, the scripted states (and a cut-in): its count restarts after
const HOLD_PIN = new Set(['hurt', 'fly', 'down', 'special', 'portal', 'cutscene', 'victory']);
/** (RC) the get-up's drawings in the order they play, where the painted clip's own order reads up-down-up: Dodongo, Anastasia,
 *  the Archmage, Scarlet and the Pirate Queen share painter 2's six-drawing get-up whose #3 is an upright step (legs straight,
 *  the prop hanging) and #4 a low crouch -- seated, then standing in one frame, then a 2-frame crouch before idle (the RC
 *  critics; Shadow's and Legend's go roll, crouch, rise, stand).  Played without #3 -- seated, crouch, stand -- the rise is one
 *  way: hips / mouth landmarks climb every step.  Only where the clip is that six-drawing one (n); else as painted. */
const GETUP_SEQ = { n: 6, order: [0, 1, 2, 4, 5], arts: new Set(['dodongo', 'ana', 'ana_archmage', 'scarlet', 'scarlet_pirate']) };
// the most meter one charged spell can feed, however many foes it hits (half a bar: supers mustn't come free)
export const SPELL_METER = 50;
// THE RULE: a charged spell does at least 1.6x its tap shot's full damage to one target (tools: charge_probe).  Anastasia's
// CRYSTAL NOVA: her beam lands 5 + 5 + 10 = 20 on one foe, so each shard 32 (1.6 x 20, at any range to novaRange), on
// through the crowd, and an instant burst round her staff on release (burstDmg, burstR, a knockdown: 50 on a foe close
// by); a boss still takes novaBoss (16 x 2, as before: no instant kills); meter as the beam's mean tick (SPELL_METER a spell)
export const CHARGED = { novaDmg: 32, novaEmber: 7, novaBoss: 32, novaRange: 380, burstDmg: 18, burstR: 110 };
// the CHARGED STRIKE (hold ATTACK): ATTACK still held when atk1's recovery ends -- or CHARGE.start frames after the press,
// once the swing has landed -- the hero charges a melee blow (full at CHARGE.full, as the shot).  The blow: dmgK x the
// hero's atk4 (bossK x on a boss), a knockdown, the meter fed at most SPELL_METER, `rec` frames' recovery
export const MELEE = { dmgK: 2, bossK: 1.5, rec: 14 };
// each hero's strike, from the clips they have: hit = the frame the blow lands; area = the ellipse it hits round the
// hero (at: 'slam' -- centred on Anastasia's staff point); lane = a dash forward this far (Shadow, his runAtk), over dash
// frames; spin = Scarlet turns about (facing flips) through the swing
export const STRIKE = {
  dodongo: { name: 'DRAGON SLAM', hit: 5, area: { rx: 160, ry: 58 }, col2: '#ffd23a' },
  ana: { name: 'STAR SMASH', hit: 5, area: { rx: 150, ry: 56, at: 'slam' }, col2: '#ffe066' },
  shadow: { name: 'SHADOW RUSH', hit: 10, lane: 220, dash: 10, col2: '#2a1838' },
  scarlet: { name: 'CRIMSON SPIN', hit: 6, area: { rx: 150, ry: 56 }, spin: true, col2: '#ffd0a0' },
};
// Dodongo's dragon super: transform until tf, the flight across until back, the glide home for ret, the landing to dur
export const DRAGON = { dur: 70, tf: 14, back: 46, ret: 12, scale: 1.2 };
// (foe states that swing / lunge / throw: a dodge through one of them is a WHOOSH)
const ATTACK_STATES = new Set(['windup', 'stab', 'lunge', 'punch', 'punchWind', 'charge', 'chargeWind', 'swoop', 'swoopWind', 'dive', 'diveWind', 'mine', 'mineWind', 'throw', 'throwWind', 'cast', 'castWind', 'spit', 'spitWind', 'slam', 'tail', 'tailWind']);

export class Player extends Actor {
  constructor(game, heroId, slot = 0, ctrlId = 'kb') {
    super(game, 0, 80);
    this.hero = HEROES[heroId];
    this.heroId = heroId;
    this.slot = slot;            // 0 = P1, 1 = P2
    this.ctrlId = ctrlId;
    this.team = 'hero';
    this.w = this.hero.hurtW; this.h = this.hero.hurtH;
    this.hp = this.maxHp = this.hero.hp;
    this.lives = 3;
    this.meter = 100;
    this.cool = 0;               // projectile cooldown (frames)
    this.landT = 7;              // the landing's length (a jump sets its own): a 'land' with no jump before it -- a scripted leap -- never sticks (QA3 T1)
    this.ph = 0;
    this.bufA = this.bufJ = this.bufS = this.bufP = this.bufD = 0;
    this.hold = { A: { t: -1, busy: false }, P: { t: -1, busy: false } };   // (latchHolds)
    this.dodgeCd = 0; this.ghosts = []; this.charge = null; this.hum = null; this.dragon = null;
    this.combo = 0; this.nextCombo = 0; this.lastAtkEnd = -99;
    this.hitCount = 0; this.hitWindow = 0;
    this.ctl = true;
    this.shadowR = 30;
    this.balloonH = this.hero.balloonH;
    // (Mystic Mountain's summit: the hero who became DRAGON DODONGO is a BIG dragon -- drawn, hit and hitting MM_DRAGON_K x:
    //  the same pack, drawn bigger.  Kept by this Player through the ending; a CHANGE HERO back to him is big again)
    const MD = game.app?.run?.mmDragon;
    this.bigK = heroId === 'dragon' && MD && MD.slot === slot ? MM_DRAGON_K : 1;
    this.bigV = this.bigK !== 1 ? MM_DRAGON_V : 1;   // (his drawing's factor: the boxes keep bigK)
    if (this.bigK !== 1) { this.w = Math.round(this.w * this.bigK); this.h = Math.round(this.h * this.bigK); this.balloonH = Math.round((this.balloonH || 180) * this.bigV); }
    this.mem = { frame: 0 };
    this.carry = null;
    this.out = false;            // no lives left (waiting for a continue)
    this.score = 0;
  }

  get art() { return CHARS[this.hero.art]; }
  /** a co-op hero whose pad was unplugged: not counted for the foes' scaling and targeting; a free pad's START takes
   * them back (main.js tryDropIn) */
  get unplugged() {
    const id = this.ctrlId;
    if (!id || !id.startsWith('pad')) return false;
    const c = this.game.app?.input?.get?.(id);
    return !c || c.active === false;
  }
  /** a level (re)loaded -- the world's actors gone: the forms' companions are made again (src/forms.js tick) */
  actorsReset() { this.parrot = null; this.ship = null; }
  get ctrl() { return this.game.ctrl(this.ctrlId); }
  get canPickup() { return ['idle', 'walk', 'run', 'land'].includes(this.state); }
  get hittable() {
    return this.alive && !this.out && this.inv <= 0 && !this.down &&
      !['special', 'victory', 'cutscene', 'portal'].includes(this.state) &&
      !(this.state === 'dodge' && this.st > PERFECT.win && this.st <= DODGE.inv1);   // (inv0..win: takeHit dodges them)
  }
  get busy() { return !['idle', 'walk', 'run'].includes(this.state); }

  /** Called every tick before hitstop: remember presses (they only expire while time runs). */
  latch(frozen) {
    if (!this.ctl || this.out) { this.bufA = this.bufJ = this.bufS = this.bufP = this.bufD = 0; this.hold.A.t = this.hold.P.t = -1; return; }
    const pr = this.ctrl.pressed;
    const dec = (v) => (v > 0 && !frozen ? v - 1 : v);
    this.bufA = pr.attack ? 10 : dec(this.bufA);
    this.bufJ = pr.jump ? 6 : dec(this.bufJ);
    this.bufS = pr.special ? 8 : dec(this.bufS);
    this.bufP = pr.shoot ? 8 : dec(this.bufP);
    this.bufD = pr.dodge ? 10 : dec(this.bufD);
    this.latchHolds(pr);
  }
  /** the holds: frames since ATTACK / SHOOT went down, while it stays down -- counted through busy states (a swing and its
   * recovery, landing, the getup, a shot's recovery, a dodge, a pickup) and hit-pauses, so a hold pressed mid-busy is its
   * charge the moment he can act (heldCharge: the count from the press, full at CHARGE.full).  Pinned at 0 through
   * hitstun, a knockdown, a super or a cut-in (HOLD_PIN: a hold still down after counts again from there -- the getup).
   * busy: pressed when he couldn't act on it -- its tap waits for the let-go (then it's the tap buffer, as ever) or turns
   * into the charge at CHARGE.start */
  latchHolds(pr) {
    const held = this.ctrl.held, pin = HOLD_PIN.has(this.state) || !!this.game.cutin;
    for (const [k, b, buf] of HOLDS) {
      const Hd = this.hold[k];
      if (!held[b]) {
        if (Hd.t >= 0 && Hd.busy && Hd.t < CHARGE.start && this.canAct(b)) this[buf] = Math.max(this[buf], 6);   // (a tap, let go once he's free)
        Hd.t = -1; Hd.busy = false;
      } else if (pr[b]) { Hd.t = 0; Hd.busy = !pin && !this.canAct(b); }
      else if (Hd.t >= 0) { if (pin) { Hd.t = 0; Hd.busy = false; } else Hd.t++; }
    }
  }
  /** would a press of `b` ('attack' / 'shoot') act right now: he's free, landing's done, a swing's chain window is open */
  canAct(b) {
    const s = this.state;
    if (s === 'idle' || s === 'walk' || s === 'run') return true;
    if (s === 'land') return this.st >= 3;
    if (s === 'atk') { const A = this.hero.atk[this.atk]; return !!A && this.st >= A.next && (b === 'shoot' || (this.atkHit && this.combo < 3)); }
    if (s === 'air') return b === 'attack' && this.airAtkT < 0 && !this.carry;
    return false;
  }
  /** a press made mid-busy still down and under CHARGE.start: not a tap yet, not a charge yet */
  holdPending(k) { const Hd = this.hold[k]; return Hd.t >= 0 && Hd.busy && Hd.t < CHARGE.start && !this.carry; }
  holdReady() { return this.hold.A.t >= CHARGE.start || this.hold.P.t >= CHARGE.start; }
  /** a hold that has reached CHARGE.start: straight into its charge -- the melee charge, the spell's, or Legend Shadow's
   * rapid fire -- its count from the press (at CHARGE.full already: full at once) */
  heldCharge() {
    if (this.carry || !this.ctl) return false;
    const HA = this.hold.A, HP = this.hold.P;
    if (HA.t >= CHARGE.start) { this.bufA = 0; HA.busy = false; this.startMeleeCharge(HA.t); return true; }
    if (HP.t >= CHARGE.start && this.cool <= 0) {
      this.bufP = 0; HP.busy = false;
      if (this.hero.shoot.auto) { this.vx = this.vy = 0; this.reset('auto'); return true; }
      this.startCharge(HP.t); return true;
    }
    return false;
  }

  update() {
    const g = this.game;
    if (this.out) return;
    this.tick();
    this.mem.frame = g.frame;
    if (this.hero.form) FORM.tick(this);
    if (this.cool > 0 && --this.cool === 0 && this.ctl) { audio.sfx('cooldown_ready', { vol: 0.5 }); }
    if (this.hitWindow > 0 && --this.hitWindow === 0) this.hitCount = 0;
    if (this.dodgeCd > 0) this.dodgeCd--;
    if (this.armorT > 0) this.armorT--;
    // (METER_REGEN: with control, up and about -- not knocked down, in a super, a cut-in or a level's cutscene; a pause,
    //  the warp picker and the story don't run this at all)
    if (this.ctl && this.alive && this.hp > 0 && !g.cutin && !g.cut && !['special', 'fly', 'down', 'getup', 'portal', 'victory', 'cutscene'].includes(this.state)) this.addMeter(METER_REGEN);
    if (this.hum && this.state !== 'charge') this.stopCharge();      // (a hit, a cutscene ... ends the charge and its hum)
    if (this.shot?.held && this.state !== 'shoot') { this.shot.held.stop?.(0.15); this.shot.held = null; }   // (... and a beam's)
    const c = this.ctrl;
    const ctl = this.ctl;
    const dx = ctl ? (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0) : (this.autoDx || 0);
    const dy = ctl ? (c.held.down ? 1 : 0) - (c.held.up ? 1 : 0) : (this.autoDy || 0);

    switch (this.state) {
      case 'idle': case 'walk': case 'run': this.groundFree(dx, dy, c); break;
      case 'land':
        this.vx *= 0.6; this.vy *= 0.6;
        if (this.bufS && this.trySpecial()) break;
        if (this.bufD && this.tryDodge()) break;
        if (this.st >= this.landT) this.set('idle');
        else if (this.st >= 3 && (this.bufA || this.bufJ || this.bufP || this.holdReady())) this.groundFree(dx, dy, c);
        break;
      case 'squat':
        this.vx = this.vy = 0;
        if (this.st >= 4) {
          this.set('air');
          this.z = 0.1; this.vz = this.hero.jumpV;
          const [wx] = this.hero.walk, [rx] = this.hero.run;
          this.vx = this.jumpDir * (this.jumpRun ? rx * 0.92 : wx * 1.15);
          this.vy = dy * 1.2;
          this.airAtkT = -1; this.hitSet = new Set();
          audio.sfx('jump');
        }
        break;
      case 'air': this.air(); break;
      case 'atk': this.attacking(dx); break;
      case 'runAtk': this.runAttack(); break;
      case 'shoot': this.shooting(); break;
      case 'auto': FORM.autoFire(this); break;   // (Legend Shadow's RAPID SHURIKENS: SHOOT held)
      case 'charge': this.charging(); break;
      case 'cstrike': this.striking(); break;
      case 'dodge': this.dodging(); break;
      case 'special': this.special(); break;
      case 'lift': this.vx = this.vy = 0; if (this.st >= 10) this.set('idle'); break;
      case 'throw': this.throwing(); break;
      case 'hurt':
        this.vx *= 0.82;
        if (this.bufS && this.trySpecial()) break;
        if (this.st >= this.stun) this.set('idle');
        break;
      case 'fly':
        this.vz -= GRAV;
        if (this.z <= 0 && this.vz < 0) {
          this.z = 0;
          if (this.bounced) { this.set('down'); this.vx = 0; }
          else { this.bounced = true; this.bounceSt = this.st; this.vz = 2.6; this.vx *= 0.5; audio.sfx('knockdown'); g.fx.dust(this.x, this.y, 5, 26); g.shake = Math.max(g.shake, 4); }
        }
        break;
      case 'down':
        this.vx = 0;
        if (this.st >= (this.hp <= 0 ? 50 : 34)) {
          if (this.hp <= 0) g.playerDied(this);
          else this.set('getup');
        }
        break;
      case 'getup':
        if (this.st >= 28) { this.set('idle'); this.inv = Math.max(this.inv, 60); }
        break;
      case 'portal':
        this.vx = this.vy = 0;
        if (this.st >= 40) { this.set('idle'); this.inv = Math.max(this.inv, 90); }
        break;
      case 'victory': case 'cutscene': this.vx = this.vy = 0; break;
    }
    if (this.carry && !['idle', 'walk', 'run', 'lift', 'throw', 'land', 'squat', 'air', 'cutscene', 'victory'].includes(this.state)) this.dropCarry();

    // integrate
    this.x += this.vx; this.y += this.vy;
    if (this.state === 'air' || this.state === 'fly') this.z = Math.max(0, this.z + this.vz);
    this.clampDepth();
    this.x = clamp(this.x, g.camX + 28, g.camX + W - 28);
  }

  groundFree(dx, dy, c) {
    const g = this.game, H = this.hero;
    if (this.bufS && this.trySpecial()) return;
    if (this.bufD && this.tryDodge()) return;
    if (this.heldCharge()) return;               // (a hold made while he was busy: its charge now)
    if (this.bufJ && H.dragon) {                 // (Dragon Dodongo hovers: no jump -- a flap of his wings and a puff of dust instead)
      this.bufJ = 0;
      if (!this._flapAt || g.frame - this._flapAt > 12) { this._flapAt = g.frame; g.fx.dust(this.x, this.y, 5, 30); g.fx.dust(this.x - this.facing * 30, this.y, 3, 16, -this.facing); audio.sfx('dodge', { pitch: 1.5, vol: 0.45 }); }
    }
    if (this.bufJ) {
      this.bufJ = 0; this.jumpDir = dx; this.jumpRun = this.state === 'run';
      this.set('squat'); return;
    }
    if (this.bufA && !this.holdPending('A')) {
      this.bufA = 0;
      if (this.carry) { this.startThrow(); return; }
      const obj = this.state !== 'run' && !H.dragon && g.liftableNear(this);   // (a dragon's claws don't carry kegs)
      if (obj) { this.pickUp(obj); return; }
      if (this.state === 'run') this.startRunAtk(); else this.startCombo(dx);
      return;
    }
    if (this.bufP && !this.carry && !this.holdPending('P')) { this.bufP = 0; if (this.tryShoot()) return; }
    const v0x = this.vx, wasWalk = this.state === 'walk';
    if (this.turnT > 0) this.turnT--;
    if (this.coast && (this.state !== 'idle' || g.frame - this.coast.last > 1)) this.coast = null;   // (a stop interrupted -- an attack, a hit -- is over)
    if (this.state === 'run') {
      if (dx !== this.facing) {
        if (dx && dx === -this.facing && this.hasClip('runTurn')) { this.facing = dx; this.turnT = STOP.turnF; }   // (painter 3's run turn: the run goes on the other way)
        else {
          if (!dx && !dy && !this.carry) this.coast = { v: v0x, from: 'run', t: 0, last: g.frame, skid: Math.abs(v0x) > STOP.skidV && this.hasClip('skid'), skidF: Math.max(STOP.skidF, Math.round(Math.log(0.7 / Math.max(0.7, Math.abs(v0x))) / Math.log(STOP.skidDecay))) };   // (let go: it coasts to a stop; a skid until ~0.7 px/f -- 10 f, Legend's ~12)
          this.set(dx || dy ? 'walk' : 'idle');
        }
      }
    } else if (dx !== 0 && !this.carry && (c.runTap === dx || c.held.run)) {
      this.facing = dx; this.set('run');
      g.fx.dust(this.x - dx * 14, this.y, 3, 8, -dx);
    }
    if (dx) this.facing = dx;
    const run = this.state === 'run';
    const [wx, wy] = H.walk, [rx, ry] = H.run;
    const slow = (this.carry ? 0.8 : 1) * (this.slowK || 1);   // (slowK: Skull Island's water, gloom and goo -- src/siworld.js stepSwamp; undefined elsewhere)
    this.vx = dx * (run ? rx : wx) * slow;
    this.vy = dy * (run ? ry : wy) * slow;
    if (run && this.turnT > 0) this.vx *= 1 - this.turnT / STOP.turnF;   // (the turn: from a standstill up to speed the other way)
    if (!run) {
      if (wasWalk && !dx && !dy && !this.coast && !this.carry) this.coast = { v: v0x, from: 'walk', t: 0, last: g.frame };   // (a walk let go: on to its next foot contact)
      this.set(dx || dy ? 'walk' : 'idle');
    }
    if (!dx && !dy && this.coast && this.state === 'idle') this.coasting();
    if (dx || dy) {
      this.coast = null;
      const prev = this.ph;
      // an art module that knows its stride (px of ground per cycle) gets planted feet at any speed
      const A = this.art, stride = run ? A?.RUN_STRIDE : this.carry ? (A?.CARRY_STRIDE || A?.WALK_STRIDE) : A?.WALK_STRIDE;
      this.ph = (this.ph + (stride ? Math.hypot(this.vx, this.vy * 0.5) / stride : (run ? 0.046 : 0.044) * (run ? rx / 5.6 : wx / 2.7))) % 1;
      if (run && ((prev < 0.25 && this.ph >= 0.25) || (prev < 0.75 && this.ph >= 0.75))) {
        audio.sfx('run_step', { vol: 0.5 });
        if (Math.random() < 0.5) g.fx.dust(this.x - this.facing * 10, this.y, 1, 4, -this.facing);
      }
    }
  }

  /** let go of a run or a walk (the anim audit #4): no dead stop, no pose pop -- the run slides to a stop on its own drawings (or
   *  painter 3's skid), the walk plays on to its next foot contact (ph 0 / 0.5); then the idle */
  coasting() {
    const C = this.coast, A = this.art, g = this.game;
    C.t++; C.last = g.frame;
    C.v *= C.from === 'run' ? (C.skid ? STOP.skidDecay : STOP.runDecay) : STOP.walkDecay;
    this.vx = Math.abs(C.v) < 0.15 ? 0 : C.v; this.vy = 0;
    if (C.skid) {   // (the heel planted: dust at it)
      if (C.t >= 2 && C.t <= 5 && C.t % 2 === 0) g.fx.dust(this.x + this.facing * 14, this.y, 1, 6, -this.facing);
      if (C.t >= (C.skidF || STOP.skidF)) { this.coast = null; this.vx = 0; }
      return;
    }
    const stride = C.from === 'run' ? A?.RUN_STRIDE : A?.WALK_STRIDE;
    const rate = Math.max(stride ? Math.abs(this.vx) / stride : 0, C.from === 'run' ? 0.05 : 0.06), target = this.ph < 0.5 ? 0.5 : 1;   // (at least a little a frame: on the contact within a few frames)
    if (this.ph + rate >= target || C.t >= STOP.maxF) { this.ph = target % 1; this.coast = null; this.vx = 0; }   // (on the contact: the idle)
    else this.ph += rate;
  }
  /** this hero's atlas has the clip as a painted drawing set (fn: a function of its argument -- today's rise / fall / land / squat are
   *  single drawings) -- painter 3's new clips are hooked by this, so an atlas without them keeps today's drawing */
  hasClip(k, fn = false) {
    if (this.art?.hasNow && !this.art.hasNow(k)) return false;   // (painter 3's clips: their move pack decoded -- src/sprite3d.js hasNow; aba812)
    const f = this.art?.ANIM?.[k]; if (f === undefined || (fn && typeof f !== 'function')) return false;
    const p = typeof f === 'function' ? f(0) : f; return !!(p && p.s3d >= 0.5);
  }

  // ---------------------------------------------------------------- combo
  startCombo(dx) {
    if (dx) this.facing = dx;
    const idx = this.game.frame - this.lastAtkEnd < COMBO_GAP ? this.nextCombo : 0;
    this.beginAtk(idx);
  }
  beginAtk(idx) {
    this.combo = idx; this.atk = COMBO[idx];
    this.hitSet = new Set(); this.atkHit = false;
    this.swings = (this.swings || 0) + 1;
    this.vx = this.vy = 0;
    this.reset('atk');
  }
  attacking(dx) {
    const A = this.hero.atk[this.atk];
    const g = this.game;
    this.vy = 0;
    this.vx = (A.step && this.st >= A.a0 - 3 && this.st <= A.a1) ? this.facing * A.step * 2 : this.vx * 0.5;
    if (this.st === A.a0) {
      audio.sfx(A.sfx);
      if (A.puff && !this.art?.atkFx) { const o = this.shootOrigin(); g.fx.flames(o.x + this.facing * 24, o.y, o.z, 1 + A.puff, { vx: this.facing * 2.6, scale: 0.55 + 0.15 * A.puff }); }   // (Dragon Dodongo's bites: a puff of fire)
      if (A.burst) { const c = this.art?.ATK3_CRYSTAL || [90, -86]; g.fx.spark(this.x + this.facing * c[0], this.y, this.z - c[1], false, 'cool'); }
      if (A.shock) {
        // Ana's finisher: the staff slam sends a crystal shockwave out from where the crystal hits the floor
        const sp = this.art?.SLAM_POINT || [70, 0], cx = this.x + this.facing * sp[0] * 0.6;
        g.fx.ring(cx, this.y, { rx: 132, ry: 46, shock: true, life: 22, blue: true });
        g.fx.spark(this.x + this.facing * sp[0], this.y, 6, true, 'cool');
        this.areaHit(cx, this.y, 132, 46, { ...A, dmg: 8 }, 170, new Set([...this.hitSet]));
      }
    }
    if (this.st === A.a0 && this.hero.form) FORM.swingStart(this, A);   // (the Archmage's blast, the Pirate's flintlock)
    if (this.st >= A.a0 && this.st <= A.a1) this.strike(A);
    this.art?.atkFx?.(this, A, this.atk);   // (an art's own swing FX, each frame of the swing: Dragon Dodongo's -- src/chars/dragon_hero.js)
    if (this.st === A.a1 && this.hero.form) FORM.swingEnd(this, A);     // (Legend Shadow's slash wave)
    if (this.bufS && this.trySpecial()) return;
    if (this.bufD && this.atkHit && this.st > A.a1 && this.tryDodge()) return;   // (a dodge cancels a landed hit's recovery)
    // a hold -- ATTACK since this swing's press, or ATTACK / SHOOT pressed mid-swing (latchHolds): once the swing has
    // landed and its chain window is open, a hold at CHARGE.start is its charge (a tap -- let go before then -- is the
    // combo / the shot exactly as it was; a mid-swing press still down when the window opens waits for the let-go)
    if (this.st > A.a1 && this.st >= A.next && this.heldCharge()) return;
    if (this.bufP && this.st >= A.next && !this.holdPending('P') && this.tryShoot()) return;
    if (this.atkHit && this.bufA && this.st >= A.next && this.combo < 3 && !this.holdPending('A')) {
      this.bufA = 0;
      if (dx && dx !== this.facing) { this.facing = dx; this.beginAtk(0); } else this.beginAtk(this.combo + 1);
      return;
    }
    if (this.st >= A.dur) {
      this.lastAtkEnd = g.frame;
      this.nextCombo = this.atkHit && this.combo < 3 ? this.combo + 1 : 0;
      this.set('idle');
    }
  }

  startRunAtk() {
    const A = this.hero.atk.runAtk;
    this.hitSet = new Set(); this.atkHit = false;
    this.vx = this.facing * A.dash; this.vy = 0;
    this.set('runAtk');
    audio.sfx(A.sfx);
  }
  runAttack() {
    const A = this.hero.atk.runAtk;
    this.vx *= 0.94;
    if (this.st >= A.a0 && this.st <= A.a1) {
      this.strike(A);
      if (this.st % 4 === 0) this.game.fx.dust(this.x - this.facing * 12, this.y, 1, 4, -this.facing);
    }
    if (this.st >= A.dur) { this.vx = 0; this.set('idle'); }
  }

  air() {
    const g = this.game;
    const A = this.hero.atk.airAtk;
    this.vz -= GRAV;
    if (this.bufA && this.airAtkT < 0 && !this.carry) {
      this.bufA = 0; this.airAtkT = 0; audio.sfx(A.sfx);
      if (A.dive) { this.vx = this.facing * 6.5; this.vz = Math.min(this.vz, -2); }   // Shadow's diving kick
    }
    if (this.airAtkT >= 0) {
      this.airAtkT++;
      if (A.dive && this.airAtkT > 4) this.vz = Math.min(this.vz, -6);
      if (this.airAtkT >= 4) this.strike(A);
    }
    if (this.z <= 0 && this.vz < 0) {
      this.z = 0; this.vz = 0;
      const smash = this.airAtkT >= 0;
      this.landT = smash ? 12 : 7;
      this.vx *= 0.3; this.vy = 0;
      this.set('land');
      audio.sfx('land', { vol: smash ? 1 : 0.7 });
      g.fx.dust(this.x, this.y, smash ? 6 : 3, smash ? 26 : 14);
      if (smash) g.shake = Math.max(g.shake, 3);
    }
  }

  /** Hit everything overlapping attack A this frame (each target once per swing). */
  strike(A) {
    const g = this.game, k = this.bigK || 1;
    const box = boxOf(this, k === 1 ? A.box : { ...A.box, x0: A.box.x0 * k, x1: A.box.x1 * k, z0: A.box.z0 * k, z1: A.box.z1 * k });
    // flyers get a taller, deeper box so jump attacks connect without pixel-perfect timing
    const tall = { ...box, z0: box.z0 - 30, z1: box.z1 + 60, dy: box.dy + 10 };
    let any = false;
    for (const t of g.actors) {
      if (t === this || t.team === 'item' || t.team === 'hero' || t.team === 'heroShot' || this.hitSet.has(t) || !t.hittable) continue;
      if (!overlaps(t.flying ? tall : box, t)) continue;
      this.hitSet.add(t);
      const H = this.critHd(t, A, this.hitSet);
      if (t.takeHit(this, H)) {
        any = true;
        if (t.team === 'foe') this.landed(t, H);
      }
    }
    if (any) this.atkHit = true;
    return any;
  }
  areaHit(cx, cy, rx, ry, A, zMax = 170, set = this.hitSet) {
    const g = this.game;
    for (const t of g.actors) {
      if (t.team === 'item' || t.team === 'hero' || t.team === 'heroShot' || set.has(t) || !t.hittable) continue;
      const ex = (t.x - cx) / rx, ey = (t.y - cy) / ry;
      if (ex * ex + ey * ey > 1 || t.z > zMax) continue;
      set.add(t);
      const H = this.critHd(t, A, set);
      if (t.takeHit(this, H) && t.team === 'foe') this.landed(t, H);
    }
  }
  /** a PERFECT DODGE (once a roll): PERFECT! and the slow time (World.startPerfect) */
  perfectDodge(att) {
    const g = this.game, D = this.dodgeDir;
    if (!D || D.perfect || this.st > PERFECT.win || g.cutin) return;
    D.perfect = true; D.won = true;          // (no WHOOSH on top of it)
    att?.onPerfectDodged?.(this);            // (Skull Island's Cave of Rage: a wolf whose charge was dodged just right calms down)
    g.startPerfect(this);
    this.perfects = (this.perfects || 0) + 1;
    g.fx.label(this.x, this.y, 176, 'PERFECT!', '#bff0ff', 38, 54);
    g.fx.ring(this.x, this.y, { rx: 90, ry: 32, shock: true, col: '#bff0ff', life: 16 });
    audio.sfx('perfect');
    g.rumble(this, 'light');
  }
  /** a hit landing while this hero's PERFECT DODGE window is on: the CRITICAL COUNTER (the first attack to land in it --
   * a swing, a charged strike or a shot / volley, `key` -- and every foe that attack hits) */
  critHd(t, hd, key) {
    const g = this.game, P = g.perfect;
    if (!P || P.by !== this || hd.special || t.team !== 'foe' || (P.key !== undefined && P.key !== key)) return hd;
    const first = P.key === undefined;
    P.key = key;
    if (first) {
      g.fx.label(t.x, t.y, 200, 'CRITICAL!', '#ffe066', 48, 64);
      g.impactFrames(this.hero.accent, '#bff0ff');
      g.rumble(this, 'heavy');
      g.shake = Math.max(g.shake, 14);
      audio.sfx('hit_finisher', { pitch: 0.8 });
      this.crits = (this.crits || 0) + 1;
    }
    return { ...hd, dmg: Math.round((hd.dmg || 0) * (t.boss ? PERFECT.critBoss : PERFECT.crit)), kind: 'knock', push: Math.max(hd.push || 0, 7), lift: Math.max(hd.lift || 0, 7),
      stop: Math.max(hd.stop || 0, 9), word: 'heavy', crit: true };
  }

  landed(t, A) {
    const g = this.game;
    g.hitstop = Math.max(g.hitstop, A.stop || 4);
    if (A.shake) g.shake = Math.max(g.shake, A.shake);
    const tb = t.sparkBox || t;   // (a target whose hittable part is not its middle -- the stone troll's nose -- says where)
    const hz = clamp(this.z + (A.box ? (A.box.z0 + A.box.z1) / 2 : 70), tb.z + tb.h * 0.25 + (tb.hz0 || 0), tb.z + tb.h * 0.85 + (tb.hz0 || 0));
    g.fx.spark(tb.x - this.facing * tb.w * 0.5, t.y + 1, hz, A.kind === 'knock', this.hero.form === 'archmage' ? 'gold' : A.spark || 'warm');
    if (g.L?.si) SIFX.impact(g, t, tb.x - this.facing * tb.w * 0.5, t.y + 1, hz, A, this.facing);   // (Skull Island: the target's material -- splinters, spray, goo, bark, embers; src/sifx.js)
    this.art?.hitFx?.(this, t, A, tb.x - this.facing * tb.w * 0.5, t.y + 1, hz);   // (the art's contact FX: the dragon's chomp)
    if (this.hero.form === 'archmage') g.fx.add({ type: 'star', x: tb.x, y: t.y + 1, z: hz + 10, vx: (Math.random() - 0.5) * 3, vz: 1.4, life: 22, r: 7, col: '#ffe066' });
    const clink = t.collared ? ['CLINK!', 'CLANG!', 'CRACK!'][(Math.random() * 3) | 0] : undefined;
    if (!A.special && (!t._wordAt || g.frame - t._wordAt > 22) && (A.word === 'heavy' || (A.word === 'light' && Math.random() < 0.5))) {
      t._wordAt = g.frame;
      g.fx.word(tb.x, t.y + 2, hz + 10, A.word === 'heavy', clink);
    }
    if (A.hit !== false) audio.sfx(A.hit || 'hit_light', { pitch: 0.95 + Math.random() * 0.1 });   // (false: silent -- the beam's ticks)
    g.rumble(this, A.kind === 'knock' ? 'heavy' : 'light');
    // (?? : a super's own hits, ember 0, refund nothing; a charged spell's hits share its SPELL_METER budget)
    let gain = (A.ember ?? 8) * METER_GAIN;
    if (A.spell) { gain = Math.min(gain, Math.max(0, A.spell.meterLeft ?? SPELL_METER)); A.spell.meterLeft = (A.spell.meterLeft ?? SPELL_METER) - gain; }
    this.addMeter(gain);
    if (A.special && this.ult?.dealt) this.ult.dealt.set(t, (this.ult.dealt.get(t) || 0) + (A.dmg || 0));
    this.addScore(A.kind === 'knock' ? 50 : 20);
    g.engage(t);
  }
  addMeter(n) { this.meter = Math.min(METER_MAX, this.meter + n); }
  addScore(n) { this.score += n; this.game.score += n; }

  // ---------------------------------------------------------------- projectile
  tryShoot() {
    if (this.cool > 0 || this.carry) {
      if (this.cool > 0) this.game.fx.cooldownTick?.(this);
      return false;
    }
    if (!['idle', 'walk', 'run', 'land', 'atk'].includes(this.state)) return false;
    this.bufP = 0;
    this.vx = this.vy = 0;
    // holdT: frames the button has been held (CHARGE.start of them: the charge begins); let: it was let go
    this.shot = { fired: false, beam: null, holdT: 0, let: false, charged: false };
    this.reset('shoot');
    const S0 = this.hero.shoot;
    this.shot.sfx = audio.sfx(S0.sfx, S0.sfxHold ? { hold: S0.sfxHold } : undefined);
    if (S0.sfxHold) this.shot.held = this.shot.sfx;    // (a held sound -- Anastasia's beam: stopped with the shot)
    this.shotsFired = (this.shotsFired || 0) + 1;
    return true;
  }
  shootOrigin() {
    const so = this.art?.SHOOT_ORIGIN || [34, -112], k = this.bigV || 1;   // (the mouth where he's drawn)
    return { x: this.x + this.facing * so[0] * k, y: this.y, z: this.z - so[1] * k };
  }
  get shootRel() { const S = this.hero.shoot; return Math.max(1, Math.round(S.dur * S.release)); }
  shooting() {
    const g = this.game, S = this.hero.shoot;
    this.vx = this.vy = 0;
    if (!this.shot.fired && !this.shot.let) {
      // a held button holds the wind-up (its last frame before the release) until it's let go -- a tap fires as it always
      // did; still held CHARGE.start frames after the press, the hero starts charging the big spell instead
      if (this.ctl && this.ctrl.held.shoot) {
        this.shot.holdT = Math.max(this.shot.holdT + 1, this.hold.P.t);   // (from the press: a press made mid-busy counts from there)
        if (this.shot.holdT >= CHARGE.start) { if (this.hero.shoot.auto) { this.reset('auto'); return; } this.startCharge(this.shot.holdT); return; }
        if (this.st >= this.shootRel) this.st = this.shootRel - 1;
      } else this.shot.let = true;
    }
    const k = this.st / S.dur;
    if (!this.shot.fired && k >= S.release) {
      this.shot.fired = true;
      this.cool = S.cooldown;
      const o = this.shootOrigin();
      if (this.shot.charged) this.fireCharged(o);
      else if (S.kind === 'fireball') {   // (breathed: the fireball and its flash ahead of the mouth -- on it, they hid his face)
        const fx0 = o.x + this.facing * MUZZLE_AHEAD;
        g.actors.push(new HeroFireball(g, this, fx0, o.y, o.z, this.facing, S));
        g.fx.flames(fx0, o.y, o.z, 4, { vx: this.facing * 2, scale: 0.7 });
      } else if (S.kind === 'shuriken') {
        const volley = new Set();             // (one hit per target per throw: the fan is a crowd tool)
        for (let i = 0; i < S.count; i++) g.actors.push(new Shuriken(g, this, o.x, o.y, o.z, this.facing, (i - (S.count - 1) / 2) * 1.35, S, volley));
      } else if (S.kind === 'hook') {
        g.actors.push(new (S.golden ? FORM.GoldenHook : GrappleHook)(g, this, o.x, o.y, o.z, this.facing, S));   // (the Pirate's GOLDEN HOOK: reels in three)
      } else if (S.kind === 'beam') {
        this.shot.beam = new Beam(g, this, S);
        g.actors.push(this.shot.beam);
        if (S.fire) audio.sfx(S.fire);
        g.shake = Math.max(g.shake, 5);
      }
    }
    if (this.shot.fired && this.shot.charged && this.st < S.dur - 12) this.st = S.dur - 12;   // (the spell's out: a short recovery)
    if (this.shot.fired && this.bufD && this.tryDodge()) return;                             // (the shot's out: a dodge cancels the rest)
    if (this.shot.beam && k >= (S.end || 1)) { this.shot.beam.gone = true; this.shot.beam = null; this.shot.held?.stop?.(0.3); this.shot.held = null; }
    if (this.st >= S.dur) { if (this.shot.beam) { this.shot.beam.gone = true; this.shot.beam = null; } this.set('idle'); }
  }

  // ---------------------------------------------------------------- charged spell (hold SHOOT)
  startCharge(held = CHARGE.start) {
    this.shot?.sfx?.stop?.(0.08);          // (Ana's beam hum gives way to the charge's)
    this.reset('charge');
    this.charge = { t: Math.max(CHARGE.start, held | 0), full: false };   // (the count from the press)
    this.hum = audio.sfx('charge_hum', { hold: true });
  }
  /** hold ATTACK: the atk4 wind-up held, the same hum / ping / flash / rumble as the shot's; let go at full: the strike */
  startMeleeCharge(held) {
    this.lastAtkEnd = this.game.frame; this.nextCombo = 0;
    this.reset('charge');
    this.charge = { t: Math.max(CHARGE.start, held | 0), full: false, melee: true };
    this.hum = audio.sfx('charge_hum', { hold: true });
    this.meleeCharges = (this.meleeCharges || 0) + 1;
  }
  /** where the melee charge's glow gathers without a landmark (the code rigs): in front of the chest, at the weapon */
  meleePoint() { return { x: this.x + this.facing * 30, y: this.y, z: this.z + 96 }; }
  /** where a charge gathers on screen now: the hand -- the weapon's grip, Ana's crystal, a dragon's mouth (CHARGE_LM) -- in
   * the drawing on screen, walking or held, so the orb and the glow stay in it; without the landmark (the code rigs) the
   * shot's origin / the melee point */
  chargePoint(melee, pose = null, r = 0) {
    const key = this.hero.dragon ? 'dragon' : this.hero.base || this.heroId, L = CHARGE_LM[key], A = this.art;
    if (L && A?.point3d) {
      const p = A.point3d(pose || this.pose(), L[melee ? 1 : 0], this.facing), ahead = !melee && CHARGE_AHEAD[key] ? r + 3 : 0;   // (r: the orb's radius)
      const k = this.bigV || 1;
      if (p) return { x: this.x + this.facing * (p[0] * k + ahead), y: this.y, z: this.z - p[1] * k };
    }
    return melee ? this.meleePoint() : this.shootOrigin();
  }
  /** charging (or Legend Shadow's rapid fire): he walks at CHARGE_MOVE x his walk any way the stick points (x and depth),
   * no run, no jump (swallowed); facing follows the stick -- the release goes the way he faces */
  chargeMove() {
    const c = this.ctrl, [wx, wy] = this.hero.walk;
    this.bufJ = 0;
    const dx = this.ctl ? (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0) : 0, dy = this.ctl ? (c.held.down ? 1 : 0) - (c.held.up ? 1 : 0) : 0;
    if (dx) this.facing = dx;
    this.vx = dx * wx * CHARGE_MOVE * (this.slowK || 1); this.vy = dy * wy * CHARGE_MOVE * (this.slowK || 1);
    if (dx || dy) {
      const stride = this.art?.WALK_STRIDE;
      this.ph = (this.ph + (stride ? Math.hypot(this.vx, this.vy * 0.5) / stride : 0.044 * CHARGE_MOVE * wx / 2.7)) % 1;
    }
  }
  /** walking with a charge: the walk is drawn (the painted drawings can't mix a held wind-up's arms on walking legs) */
  get chargeWalking() { return Math.abs(this.vx) + Math.abs(this.vy) > 0.05; }
  /** rooted, the wind-up held, a glow growing in the hero's colour; full at CHARGE.full; let go: the shot (or the spell),
   * or for a melee charge the CHARGED STRIKE (let go early: back to idle, no strike) */
  charging() {
    const g = this.game, C = this.charge, acc = this.hero.accent;
    this.vx = this.vy = 0;
    if (!C || !this.ctl) { this.stopCharge(); this.set('idle'); return; }   // (a scripted beat stopped the charge from outside -- Skull Island's disarm -- or a cutscene took the controls)   // (a cutscene takes the controls: no spell)
    if (this.bufD && this.tryDodge()) return;            // (a dodge drops the charge)
    this.chargeMove();                                   // (he can walk with it)
    C.t++;
    const o = this.chargePoint(!!C.melee, null, 26);
    if (C.t % 3 === 0) g.fx.rise(this.x + (Math.random() - 0.5) * 56, this.y + 1, 10 + Math.random() * 60, acc);
    if (!C.full && C.t >= CHARGE.full) {
      C.full = true;
      audio.sfx('charge_full');
      g.rumble(this, 'light');
      this.flash = 4;
      g.fx.ring(this.x, this.y, { rx: 74, ry: 28, shock: true, col: acc, life: 16 });
      g.fx.flare(o.x, o.y, o.z, 70, 12, acc);
    }
    if (C.melee && !this.ctrl.held.attack) {
      const full = C.full;
      this.vx = this.vy = 0;
      this.stopCharge();
      if (full) this.startStrike(); else this.set('idle');
      return;
    }
    if (!C.melee && !this.ctrl.held.shoot) {
      const full = C.full;
      this.vx = this.vy = 0;
      this.stopCharge();
      this.reset('shoot');
      this.st = this.shootRel - 1;                       // (the release frames as for any shot)
      this.shot = { fired: false, beam: null, holdT: CHARGE.start, let: true, charged: full };
    }
  }
  stopCharge() {
    if (this.hum) { this.hum.stop?.(0.08); this.hum = null; }
    this.charge = null;
  }
  /** the charged spell: each foe hit once (one volley Set for the spell), ~1.6x a shot's hit, meter as shots feed it */
  fireCharged(o) {
    const g = this.game, S = this.hero.shoot, f = this.facing, acc = this.hero.accent;
    // (1.6x rounded up -- 14 off a 9 was 1.56x; a boss's double stays capped where it was: bossCap)
    const C = { ...S, dmg: Math.ceil(S.dmg * 1.6), bossCap: Math.round(S.dmg * 1.6) * 2, charged: true }, vol = new Set();
    vol.meterLeft = SPELL_METER;                           // (the spell's meter budget: Player.landed)
    g.fx.flare(o.x + (S.kind === 'fireball' ? f * MUZZLE_AHEAD : 0), o.y, o.z, 170, 14, acc);   // (a breath: ahead of the mouth)
    g.fx.ring(this.x, this.y, { rx: 130, ry: 46, shock: true, col: acc, life: 22 });
    g.shake = Math.max(g.shake, 8); g.rumble(this, 'heavy');
    audio.sfx('charge_release');
    if (this.hero.dragon) { g.actors.push(new FlameStream(g, this, S, vol)); return; }   // (Dragon Dodongo: the flame stream)
    if (this.hero.form && FORM.fireCharged(this, o, C, vol)) return;                    // (GRAND CRYSTAL NOVA, CANNON VOLLEY)
    if (S.kind === 'fireball') {                         // DRAGON BURST: a fan of five ahead (across the depth) and two behind
      C.splash = Math.round(S.splash * 1.6);
      const fx0 = o.x + f * MUZZLE_AHEAD;   // (ahead of the mouth, as a tap's)
      for (const vy of [-1.9, -0.95, 0, 0.95, 1.9]) g.actors.push(new HeroFireball(g, this, fx0, o.y, o.z, f, C, vy, vol));
      for (const vy of [-1, 1]) g.actors.push(new HeroFireball(g, this, this.x - f * 24, o.y, o.z, -f, C, vy, vol));
      g.fx.flames(fx0, o.y, o.z, 10, { vx: f * 2, scale: 1 });
    } else if (S.kind === 'beam') {                      // CRYSTAL NOVA: the staff planted -- a burst round her, eight big shards out all round
      C.dmg = CHARGED.novaDmg; C.ember = CHARGED.novaEmber; C.bossCap = CHARGED.novaBoss; C.big = 1;
      const sp = this.art?.SLAM_POINT || [70, 0], cx = this.x + f * sp[0] * 0.5, cp = this.chargePoint(false);
      g.fx.flare(cp.x, cp.y, cp.z, 56, 10, '#ffd23a');   // (her staff crystal flaring, gold: short, not a white-out)
      g.fx.ring(cx, this.y, { rx: 150, ry: 52, shock: true, blue: true, life: 22 });
      g.fx.ring(cx, this.y, { rx: CHARGED.burstR, ry: CHARGED.burstR * 0.36, shock: true, gold: true, life: 18 });
      g.fx.rays(cx, this.y, 40, '#bff0ff', 170, 14);
      g.fx.label(this.x, this.y, 214, 'CRYSTAL NOVA!', '#bff0ff', 34, 56);
      novaBurst(g, this, cx, this.y, CHARGED.burstR, CHARGED.burstR * 0.36, CHARGED.burstDmg, vol);
      for (let i = 0; i < 8; i++) { const s = new Shard(g, this, cx, this.y, 34, (i / 8) * Math.PI * 2, C, vol); s.range = CHARGED.novaRange; g.actors.push(s); }
    } else if (S.kind === 'shuriken') {                  // SHURIKEN STORM: eight in a full circle (the volley rule: one hit each)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2, vx = Math.cos(a) * S.speed;
        g.actors.push(new Shuriken(g, this, o.x, o.y, o.z, vx < -0.01 ? -1 : vx > 0.01 ? 1 : f, Math.sin(a) * S.speed * 0.5, C, vol, vx));
      }
    } else if (S.kind === 'hook') {                      // CHAIN WHIRL: four hooks -- ahead, behind, up the lane and down it
      for (const [hx, hy] of [[f, 0], [-f, 0], [f * 0.8, -0.6], [f * 0.8, 0.6]]) {
        g.actors.push(new GrappleHook(g, this, o.x, o.y, o.z, Math.sign(hx), C, { vx: hx * S.speed, vy: hy * S.speed * 0.5, volley: vol }));
      }
    }
  }

  // ---------------------------------------------------------------- charged strike (hold ATTACK, let go at full)
  startStrike() {
    const g = this.game, S = STRIKE[this.heroId] || STRIKE[this.hero.base] || STRIKE.dodongo, acc = this.hero.accent;
    this.reset('cstrike');
    this.vx = this.vy = 0;
    const set = new Set(); set.meterLeft = SPELL_METER;     // (each foe once; the meter budget: Player.landed)
    this.strikeD = { S, set, x0: this.x, f: this.facing, n: 0, done: false };
    this.strikes = (this.strikes || 0) + 1;
    audio.sfx('charge_release');
    audio.sfx(S.lane ? 'sword_slash' : 'swing_heavy', { pitch: 0.85 });
    for (const q of g.fx.list) if (q.type === 'balloon' && q.actor === this) q.t = Math.max(q.t, q.life - 10);
    g.fx.label(this.x, this.y, 214, (this.game.mm?.calmSuper && this.heroId === 'dodongo' ? 'CALM SLAM' : S.name) + '!', acc, 40, 64);   // (the Cave of Rage: no dragons -- the bridge would break)
    g.fx.flare(this.x + this.facing * 30, this.y, 96, 120, 10, acc);
  }
  /** one blow's hit data on t: dmgK x atk4 (bossK x on a boss), a knockdown; the strike's meter budget */
  strikeHd(t) {
    const A4 = this.hero.atk.atk4, lane = !!this.strikeD.S.lane;
    // (the rush: a short hitstop per foe passed and no thrown bodies -- one knocked ahead would bowl the rest of the lane
    //  over before he got to them)
    return { dmg: Math.round(A4.dmg * (t.boss ? MELEE.bossK : MELEE.dmgK)), kind: 'knock', push: 8, lift: 8, stop: lane ? 3 : 10, hit: 'hit_finisher', word: 'heavy', shake: 10,
      thrown: !lane, ember: A4.ember, spell: this.strikeD.set, spark: A4.spark, cstrike: true };
  }
  /** hit everything in the ellipse (cx, cy, rx, ry) or the lane test `inLane` once; returns how many foes it struck */
  strikeHits(test) {
    const g = this.game, D = this.strikeD;
    let n = 0;
    for (const t of g.actors) {
      if (t === this || t.team === 'item' || t.team === 'hero' || t.team === 'heroShot' || D.set.has(t) || !t.hittable || t.z > 170) continue;
      if (!test(t)) continue;
      D.set.add(t);
      const hd = this.critHd(t, this.strikeHd(t), D);
      if (t.takeHit(this, hd) && t.team === 'foe') { this.landed(t, hd); n++; }
    }
    D.n += n;
    return n;
  }
  striking() {
    const g = this.game, D = this.strikeD, S = D.S, f = D.f, acc = this.hero.accent;
    if (this.hero.dragon) this.art?.atkFx?.(this, this.hero.atk.atk4, 'cstrike');   // (Dragon Dodongo's charged strike: rearUp's flame -- src/chars/dragon_hero.js)
    this.vy = 0;
    if (S.lane) {                                        // SHADOW RUSH: a dash slash through the lane ahead
      if (this.st <= S.dash) {
        const xPrev = this.x;
        this.vx = f * S.lane / S.dash;
        if (this.st % 2 === 0) this.ghosts.push({ x: this.x, y: this.y, z: this.z, pose: this.pose(), facing: this.facing, at: g.frame });
        if (this.st % 3 === 0) g.fx.dust(this.x - f * 12, this.y, 2, 8, -f);
        const x1 = this.x + this.vx;
        this.strikeHits((t) => Math.abs(t.y - this.y) < 38 && (t.x - Math.min(xPrev, x1) + 40) > 0 && (Math.max(xPrev, x1) + 40 - t.x) > 0);
        if (this.st === S.dash) this.strikeImpact();
      } else this.vx *= 0.6;
    } else {
      this.vx = 0;
      if (S.spin && this.st >= 1 && this.st <= 8 && this.st % 2 === 0) this.facing = -this.facing;   // (spun about: back to front by 8)
      if (this.st === S.hit) {
        const A = S.area, sp = this.art?.SLAM_POINT || [70, 0];
        const cx = A.at === 'slam' ? this.x + f * sp[0] * 0.6 : this.x;
        this.strikeHits((t) => { const ex = (t.x - cx) / A.rx, ey = (t.y - this.y) / A.ry; return ex * ex + ey * ey <= 1; });
        this.strikeImpact(cx);
      }
    }
    if (this.st >= S.hit + MELEE.rec) { this.vx = 0; this.facing = f; this.set('idle'); }
  }
  /** the blow lands: rings, dust, shake, impact frames, and each hero's own burst */
  strikeImpact(cx = this.x) {
    const g = this.game, D = this.strikeD, S = D.S, f = D.f, acc = this.hero.accent, y = this.y;
    D.done = true;
    g.impactFrames(acc, S.col2);
    g.shake = Math.max(g.shake, 12 + Math.min(8, D.n * 2));
    g.rumble(this, 'heavy');
    audio.sfx('knockdown', { pitch: 0.8 });
    g.fx.ring(cx, y, { rx: (S.area?.rx || 140) + 20, ry: (S.area?.ry || 52) + 8, shock: true, col: acc, life: 24 });
    g.fx.dust(cx, y, 12, 70);
    const who = this.hero.base || this.heroId;           // (a form strikes as its hero)
    if (who === 'dodongo') {                      // DRAGON SLAM: the ground cracks, flame and rock
      g.fx.ring(cx, y, { rx: 110, ry: 40, shock: true, gold: true, life: 18 });
      g.fx.flames(cx + f * 30, y, 4, 10, { scale: 0.9 });
      g.fx.debris(cx + f * 30, y, 0, ['#8a6a4a', '#5a4030', '#b08860'], 10);
    } else if (who === 'ana') {                           // STAR SMASH: a ring of stars bursts from the staff
      g.fx.ring(cx, y, { rx: 100, ry: 36, shock: true, blue: true, life: 18 });
      g.fx.rays(cx, y, 40, '#ffe066', 170, 16);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.fx.add({ type: 'star', x: cx + Math.cos(a) * 30, y: y + Math.sin(a) * 10, z: 30 + Math.random() * 40, vx: Math.cos(a) * 4, vz: 1 + Math.random() * 2, life: 30, r: 7 + Math.random() * 4, col: i % 2 ? '#ffe066' : '#bff0ff' }); }
    } else if (who === 'shadow') {                        // SHADOW RUSH: the slashes left along the lane
      for (let i = 0; i < 4; i++) g.fx.slash(D.x0 + f * (40 + i * 55), y + 1, 80 + (i % 2) * 30);
      g.fx.flare(this.x, y, 90, 150, 10, acc);
    } else {                                              // CRIMSON SPIN: cuts all round her
      g.fx.ring(cx, y, { rx: 100, ry: 38, shock: true, col: S.col2, life: 18 });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.fx.slash(cx + Math.cos(a) * 90, y + Math.sin(a) * 30, 70 + (i % 3) * 25); }
    }
  }

  // ---------------------------------------------------------------- dodge
  /** a quick dash-roll the way the stick points (x and depth); no direction: a back-step away from facing */
  tryDodge() {
    if (this.dodgeCd > 0 || this.carry || !this.ctl || this.out) return false;
    const g = this.game, c = this.ctrl;
    this.bufD = 0;
    let dx = (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0), dy = (c.held.down ? 1 : 0) - (c.held.up ? 1 : 0);
    if (c.stick && Math.hypot(c.stick.x, c.stick.y) > 0.35) { dx = c.stick.x; dy = c.stick.y; }
    const back = !dx && !dy;
    if (back) dx = -this.facing;
    const m = Math.hypot(dx, dy) || 1;
    // (he faces the way he rolls -- the drawings roll forward; a back-step turns back to face the foe once it's done)
    this.dodgeDir = { x: dx / m, y: dy / m, back, face: this.facing };
    if (Math.abs(dx) > 0.3 && !back) this.facing = dx > 0 ? 1 : -1;   // (a back-step keeps the facing: it played the roll turned away, then snapped 180 degrees back -- the anim audit #3)
    this.stopCharge();
    if (this.shot?.beam) { this.shot.beam.gone = true; this.shot.beam = null; }
    this.vx = this.vy = 0;
    this.reset('dodge');
    this.ghosts = [];
    g.fx.dust(this.x, this.y, 5, 16, -Math.sign(dx || -this.facing));
    audio.sfx('dodge');
    if (this.hero.form) FORM.dodgeStart(this);           // (Legend Shadow's DUMMY, the Pirate's smoke puff)
    return true;
  }
  dodging() {
    const D = DODGE, v0 = D.dist / (D.slide + (D.stop - D.slide - 1) / 2);   // (a steady slide, then easing out: D.dist px)
    const BX = this.art?.EXPORTS?.DODGE_BACK_V, BV = Array.isArray(BX) && BX.length ? BX : DODGE_BACK_V;   // (painter 3: a hero whose back-dodge has its own shape -- Shadow's handspring, Scarlet's tuck)
    const v = this.dodgeDir.back && this.hasClip('dodgeBack') ? BV[Math.min(this.st, BV.length - 1)] : this.st <= D.slide ? v0 : v0 * Math.max(0, 1 - (this.st - D.slide) / (D.stop - D.slide));
    this.vx = this.dodgeDir.x * v; this.vy = this.dodgeDir.y * v * 0.55;
    this.ph = (this.ph + 0.07) % 1;
    if (this.st % 3 === 1 && this.st < D.dur - 3) {    // the afterimages: a copy every 3 frames, the last three kept
      this.ghosts.push({ x: this.x, y: this.y, z: this.z, pose: this.pose(), facing: this.facing, at: this.game.frame });
      if (this.ghosts.length > 3) this.ghosts.shift();
    }
    if (this.st === 2) this.game.fx.dust(this.x, this.y, 2, 8, -Math.sign(this.dodgeDir.x || 1));
    // a dodge that beat an attack (a foe swinging close, or a shot about to land): WHOOSH!, once
    if (!this.dodgeDir.won && this.st >= D.inv0 && this.st <= D.inv1 && this.dodgeThreat()) {
      this.dodgeDir.won = true;
      const g = this.game;
      g.fx.word(this.x, this.y, 150, false, 'WHOOSH!');
      g.fx.flare(this.x, this.y, 70, 70, 10, this.hero.accent);
      audio.sfx('dodge', { pitch: 1.4 });
    }
    if (this.st >= D.dur) {
      this.vx = this.vy = 0;
      // (back on the feet facing the nearest foe close by -- never the empty air -- else the way he faced before)
      let best = null, bd = 250;
      for (const t of this.game.onScreenFoes()) { const d = Math.abs(t.x - this.x) + Math.abs(t.y - this.y); if (d < bd && Math.abs(t.y - this.y) < 60) { bd = d; best = t; } }
      this.facing = best ? (best.x >= this.x ? 1 : -1) : this.dodgeDir.back ? this.dodgeDir.face : this.facing;
      this.set('idle'); this.dodgeCd = D.cd;
    }
  }
  /** something that would have hit him if he hadn't dodged: a foe winding up / swinging within reach, an enemy shot close */
  dodgeThreat() {
    const g = this.game;
    for (const t of g.actors) {
      if (t.team === 'shot' && t.alive && Math.abs(t.x - this.x) < 60 && Math.abs(t.y - this.y) < 26) return true;
      if (t.team === 'foe' && t.alive && Math.abs(t.x - this.x) < 120 && Math.abs(t.y - this.y) < 30 && ATTACK_STATES.has(t.state)) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- ultimate
  trySpecial() {
    if (!['idle', 'walk', 'run', 'land', 'atk', 'hurt', 'runAtk', 'auto'].includes(this.state)) return false;
    this.bufS = 0;
    if (this.game.mm?.collarSuper?.(this)) return true;   // (Skull Island: alone against the Kraken's collar, Scarlet's team-up)
    if (this.game.tryTeam?.(this)) return true;   // 2 players: a TEAM ATTACK (game.js; it charges this hero's bar)
    if (this.meter >= 100) this.meter -= 100;
    else { if (!this._nrAt || this.game.frame - this._nrAt > 40) { this._nrAt = this.game.frame; this.game.fx.label(this.x, this.y, 170, 'SUPER NOT READY', '#ffb0a0', 20, 40); audio.sfx('menu_back', { vol: 0.6 }); } return false; }
    if (this.carry) this.dropCarry();
    this.vx = this.vy = 0;
    this.reset('special');
    this.hitSet = new Set();
    this.ult = { hits: new Map(), next: 0, targets: [], dealt: new Map() }; this.cyc = null; this.teamFx = false;
    this.dragon = this.dragonReady() ? this.newDragon() : null;
    if (!this.game.onUltimate(this)) audio.sfx(this.hero.special.sfx);   // (with a cut-in: its sound plays when it ends)
    return true;
  }
  /** the super's length: Dodongo's dragon flight is a little longer than his flare */
  get superDur() { return this.dragon ? DRAGON.dur : this.hero.special.dur; }

  special() {
    const S = this.hero.special, g = this.game;
    this.vx = this.vy = 0;
    // the opening beat: a short slow-mo with the camera punching in on the hero, then a snap back (a team: game.js)
    if (this.st === 1 && !this.teamFx) g.punch(this.x, this.y, 90);
    if (S.kind === 'flare') { if (this.dragon) this.dragonSuper(); else if (g.mm?.calmSuper && this.heroId === 'dodongo') g.mm.calmCloud(this); else this.flare(); }
    else if (S.kind === 'starfall') this.starfall();
    else if (S.kind === 'strike') this.shadowStrike();
    else if (S.kind === 'cyclone') this.cyclone();
    else if (S.kind === 'broadside') FORM.special(this);   // (the Pirate's BROADSIDE)
    const dur = this.superDur;
    if (this.st === dur - 2) this.superEnd();
    if (this.st >= dur) { this.game.dim = 0; this.set('idle'); this.teamFx = false; this.dragon = null; }
  }
  // (teamFx: this super is half of a TEAM ATTACK -- it only plays its show; the shared blast does the damage)

  /** a super's big hit (n foes struck): impact frames (a solo super's: a team's blast has its own), a ring in the
   * hero's colour, and a shake by how many it hit */
  superHit(x, y, n, impact = !this.teamFx) {
    const g = this.game, acc = this.hero.accent;
    if (impact) g.impactFrames(acc);
    if (!this.teamFx && impact) g.fx.ring(this.x, this.y, { rx: 210, ry: 74, shock: true, col: acc, life: 28 });   // (a team: its own rings)
    g.shake = Math.max(g.shake, Math.min(22, 8 + 2.5 * n));
    this.superHitAt = g.frame;
  }
  /** the last beat of every super: a ring and a flash in the hero's colour round him (a team's show: the team's blast
   * is its last beat) */
  superEnd() {
    const g = this.game, acc = this.hero.accent;
    if (this.teamFx) return;
    if (!(g.frame - (this.superHitAt ?? -99) < 16)) g.fx.ring(this.x, this.y, { rx: 230, ry: 82, shock: true, col: acc, life: 26 });   // (not two rings at once)
    g.fx.flare(this.x, this.y, 80, 190, 12, acc);
    g.fx.rays(this.x, this.y, 80, acc, 170, 14);
  }
  /** the super's name pops up: the hero's own speech balloon (the first-super line) makes way */
  superName(x, z, col, size = 44) {
    const g = this.game;
    if (this.teamFx) return;
    for (const q of g.fx.list) if (q.type === 'balloon' && q.actor === this) q.t = Math.max(q.t, q.life - 10);
    g.fx.label(x, this.y, z, this.hero.special.name + '!', col, size, 70);
  }

  flare() {
    const g = this.game, S = this.hero.special;
    const slam = Math.round(S.dur * S.key);
    const R = { rx: 200, ry: 78 };
    const hd = { dmg: 40, kind: 'knock', push: 7.5, lift: 7.5, stop: 10, hit: 'hit_finisher', word: 'heavy', thrown: true, special: true, ember: 0 };
    if (this.st < slam) {                                 // (the fire gathering: a thicker trail than it was)
      const k = this.st / slam;
      g.fx.flames(this.x + this.facing * 10, this.y, 70 + k * 80, this.st % 2 === 0 ? 2 : 1, { vz: 1.2, scale: 0.7 + k * 0.5 });
      if (this.st % 4 === 0) g.fx.rise(this.x + (Math.random() - 0.5) * 80, this.y + 1, 20 + Math.random() * 90, '#ffb020');
    }
    g.dim = this.st < slam ? 0.42 * (this.st / slam) : Math.max(0, 0.42 - (this.st - slam) * 0.05);
    if (this.st === 18) g.fx.glow(this.x + this.facing * 4, this.y, 190, 90, 14);
    if (this.st === slam + 16) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        g.fx.flames(this.x + Math.cos(a) * R.rx * 0.9, this.y + Math.sin(a) * R.ry * 0.9, 0, 1, { vz: 0.6, scale: 0.45 });
      }
    }
    if (this.st === slam) {
      g.fx.ring(this.x, this.y, { rx: R.rx, ry: R.ry });
      g.fx.fireDragon(this.x, this.y, this.facing);
      g.fx.flames(this.x + this.facing * 50, this.y, 0, 20, { vz: 2, scale: 1.5 });
      this.superName(this.x, 220, '#ffb020');
      g.shake = 18; g.flashScreen = 0.35; g.flashAt = { x: this.x, y: this.y, z: 70 }; g.hitstop = 4;
      g.rumble(this, 'special');
      const n = g.onScreenFoes().filter((t) => Math.hypot((t.x - this.x) / R.rx, (t.y - this.y) / R.ry) <= 1).length;
      this.superHit(this.x, this.y, n);
      if (!this.teamFx) this.areaHit(this.x, this.y, R.rx, R.ry, hd);
    }
    if (this.st > slam && this.st <= slam + 16 && !this.teamFx) {
      const box = boxOf(this, { x0: 0, x1: 80 + (this.st - slam) * 16, z0: -10, z1: 170, dy: 46 });
      for (const t of g.actors) {
        if (t.team === 'item' || t.team === 'hero' || t.team === 'heroShot' || this.hitSet.has(t) || !t.hittable || !overlaps(box, t)) continue;
        this.hitSet.add(t);
        if (t.takeHit(this, hd) && t.team === 'foe') this.landed(t, hd);
      }
    }
  }

  // ---------------------------------------------------------------- the dragon (Dodongo's super with his form's level pack)
  /** his dragon form's level pack is decoded with its flight drawings: the super can be the dragon (else his flare) */
  dragonReady() {
    if (this.heroId !== 'dodongo' || this.game.mm?.calmSuper) return false;   // (the Cave of Rage: no dragon, a calm little cloud -- src/sirage.js)
    const D = CHARS.dodongo_dragon;
    return !!(D && D.ANIM && D.draw && packHas('dodongo_dragon:level', ['flyLoop', 'flame']));
  }
  newDragon() {
    return { x0: this.x, f: this.facing, face: this.facing, x: this.x, z: 0, anim: 'transform', k: 0, show: false, boy: true,
      tf: packHas('dodongo_dragon:level', ['transform']), hit: new Set(), lastIx: null, hitAny: false, mem: {} };
  }
  /** cut-in, a gold burst and the transform; the dragon flies across the screen breathing a flame stream that hits every
   * foe it passes (40 each, as the flare); it turns, glides back, lands and changes back in a reverse burst */
  dragonSuper() {
    const g = this.game, D = this.dragon, S = this.hero.special, T = DRAGON, t = this.st, f = D.f;
    const far = f > 0 ? g.camX + W - 120 : g.camX + 120;
    const io = (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u));
    g.dim = t < T.tf ? 0.32 * t / T.tf : t < T.back + T.ret ? 0.32 : Math.max(0, 0.32 - (t - T.back - T.ret) * 0.03);
    D.ix = null;
    if (t === 1) {                                         // the gold burst round the boy
      for (const q of g.fx.list) if (q.type === 'balloon' && q.actor === this) q.t = Math.max(q.t, q.life - 10);   // (he's about to be a dragon)
      g.fx.flare(this.x, this.y, 80, 170, 16, '#ffd23a');
      g.fx.ring(this.x, this.y, { rx: 150, ry: 54, shock: true, gold: true, life: 20 });
      audio.sfx('transform');
      g.rumble(this, 'special');
    }
    const swap = D.tf ? 4 : 7;
    if (t === swap) {                                      // ...the boy is gone: the dragon (unfolding, where there's a transform)
      g.fx.rays(this.x, this.y, 80, '#ffd23a', 150, 10);
      g.fx.flare(this.x, this.y, 80, 140, 8, '#ffe9a0');
      for (let i = 0; i < 10; i++) g.fx.rise(this.x + (Math.random() - 0.5) * 120, this.y + 1, 20 + Math.random() * 100, '#ffd23a');
    }
    D.boy = t < swap || t >= T.dur - (D.tf ? 3 : 6);
    D.show = !D.boy;
    if (t < T.tf) {                                        // transform: crouched -> wings out
      D.x = D.x0; D.z = 0; D.face = f;
      D.anim = D.tf ? 'transform' : 'flyLoop'; D.k = Math.max(0, (t - swap) / (T.tf - swap));
    } else if (t < T.back) {                               // the flight across, breathing
      const u = (t - T.tf) / (T.back - T.tf);
      D.x = D.x0 + (far - D.x0) * io(u); D.z = 70 + 60 * Math.sin(Math.min(1, u * 2.5) * Math.PI / 2); D.face = f;
      D.anim = u < 0.08 ? 'flyLoop' : 'flame';
      if (t === T.tf) { this.superName(D.x0 + f * 60, 250, '#ffb020', 46); audio.sfx('fire_breath'); g.shake = Math.max(g.shake, 8); }
      if (D.anim === 'flame') this.dragonBreath(D);
    } else if (t < T.back + T.ret) {                        // the turn and the glide home
      const u = (t - T.back) / T.ret;
      D.x = far + (D.x0 - far) * io(u); D.z = 130 * (1 - u) + 20; D.face = -f; D.anim = 'flyLoop';
    } else {                                               // landing: the transform backwards, and a burst
      const u = (t - T.back - T.ret) / (T.dur - T.back - T.ret);
      D.x = D.x0; D.z = Math.max(0, 20 * (1 - u * 3)); D.face = f;
      D.anim = D.tf ? 'transform' : 'flyLoop'; D.k = Math.max(0, 1 - u * 1.3);
      if (t === T.dur - (D.tf ? 3 : 6)) {
        g.fx.rays(this.x, this.y, 80, '#ffd23a', 180, 14);
        g.fx.flare(this.x, this.y, 80, 180, 12, '#ffe9a0');
        g.fx.ring(this.x, this.y, { rx: 140, ry: 50, shock: true, gold: true, life: 18 });
        audio.sfx('transform', { pitch: 0.85 });
      }
    }
    if (D.show && t % 2 === 0) g.fx.rise(D.x + (Math.random() - 0.5) * 140, this.y + 1, D.z + 30 + Math.random() * 80, '#ffb020');
  }
  /** the flame stream: where it meets the ground (ahead of and below the mouth), and everyone it has swept over */
  dragonBreath(D) {
    const g = this.game, f = D.f, ix = D.x + f * 180;      // (the breath slants ahead of him to the ground)
    D.ix = ix;
    g.fx.flames(ix + (Math.random() - 0.5) * 40, this.y + (Math.random() - 0.5) * 30, 0, 2, { vz: 2.2, scale: 1.3 });
    const u = 0.25 + Math.random() * 0.6;                  // (and along the stream: fire in the air between mouth and ground)
    g.fx.flames(D.x + (ix - D.x) * u + f * 30, this.y, (D.z + 70) * (1 - u), 1, { vx: f * 1.5, vz: 0.5, scale: 1.1 });
    if (this.st % 3 === 0) g.fx.flames(ix, this.y, 0, 1, { vz: 3, scale: 1.8 });
    if (D.lastIx == null) {                                // (the first gout lands round the take-off spot, like the flare)
      D.lastIx = D.x0 - f * 200;
      if (!this.teamFx) g.fx.ring(D.x0, this.y, { rx: 110, ry: 40, life: 14 });
    }
    const x0 = Math.min(D.lastIx, ix) - 50, x1 = Math.max(D.lastIx, ix) + 50;
    D.lastIx = ix;
    if (this.teamFx) return;
    const hd = { dmg: 40, kind: 'knock', push: 7, lift: 7.5, stop: 6, hit: 'hit_finisher', word: 'heavy', thrown: true, special: true, ember: 0 };
    let n = 0;
    for (const t of g.onScreenFoes()) {
      if (D.hit.has(t) || t.x < x0 || t.x > x1) continue;
      D.hit.add(t);
      if (t.takeHit(this, hd)) { this.landed(t, hd); n++; }
    }
    if (n && !D.hitAny) { D.hitAny = true; this.superHit(ix, this.y, n); }
  }
  /** the dragon, drawn over the play while he's in the air (game.js render) */
  drawDragon(ctx) {
    const D = this.dragon;
    if (!D || this.state !== 'special' || !D.show) return;
    const g = this.game, A = CHARS.dodongo_dragon, S = DRAGON.scale;
    const sx = D.x - g.camX, gy = FLOOR_TOP + this.y, sy = gy - D.z;
    ctx.fillStyle = `rgba(30,20,40,${0.3 * Math.max(0.3, 1 - D.z / 260)})`;
    ctx.beginPath(); ctx.ellipse(sx, gy, 78 * Math.max(0.5, 1 - D.z / 300), 18, 0, 0, Math.PI * 2); ctx.fill();
    const f = A.ANIM[D.anim] || A.ANIM.flyLoop;
    const pose = typeof f === 'function' ? f(D.anim === 'transform' ? D.k : g.time) : f;
    // the flame stream from the mouth to where it meets the ground
    if (D.ix != null && A.mouthOf) {
      const m = A.mouthOf(pose), mx = sx + m[0] * S * D.face, my = sy + m[1] * S, ex = D.ix - g.camX, ey = gy - 6;
      const nx = -(ey - my), ny = ex - mx, nl = Math.hypot(nx, ny) || 1, ux = nx / nl, uy = ny / nl;
      // fire, not light: ragged orange and yellow cones drawn as paint (source-over, ink-edged), a thin hot centre on top
      const cone = (w0, w1, fill, rag) => {
        const n = 7, L = [], R = [];
        for (let i = 0; i <= n; i++) {
          const k = i / n, w = w0 + (w1 - w0) * k, j = rag ? (Math.sin(g.time * 40 + i * 2.3) * 0.5 + 0.5) * rag * k : 0;
          const px = mx + (ex - mx) * k, py = my + (ey - my) * k;
          L.push([px + ux * (w + j), py + uy * (w + j) * (0.5 + 0.5 * (1 - k))]); R.push([px - ux * (w + j), py - uy * (w + j) * (0.5 + 0.5 * (1 - k))]);
        }
        ctx.beginPath(); ctx.moveTo(...L[0]); for (const p of L) ctx.lineTo(...p); for (const p of R.reverse()) ctx.lineTo(...p); ctx.closePath();
        ctx.fillStyle = fill; ctx.fill();
      };
      const fl = 5 * Math.sin(g.time * 30);
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(33,20,28,0.55)';
      cone(12, 50 + fl, '#ff7a1a', 12); ctx.stroke();
      cone(7, 30 + fl, '#ffd23a', 7);
      ctx.globalCompositeOperation = 'lighter';
      cone(2.5, 9, 'rgba(255,245,210,0.55)', 0);
      ctx.restore();
    }
    drawWithFlash(ctx, sx, sy, 0, (c) => A.draw(c, pose, { facing: D.face, t: g.time, scale: S, mem: D.mem, vel: { x: 0, y: 0, z: 0 } }));
  }

  starfall() {
    // Ana: shooting stars rain onto every enemy on screen (three each; the last knocks them down)
    const g = this.game, S = this.hero.special;
    const a = Math.round(S.dur * S.key), b = Math.round(S.dur * S.until);
    g.dim = this.st < a ? 0.38 * (this.st / a) : this.st < b ? 0.38 : Math.max(0, 0.38 - (this.st - b) * 0.05);
    if (this.st % 3 === 0 && this.st < b) g.fx.glow(this.x + this.facing * 8, this.y, 200, 60, 10, false, 'blue');
    if (this.st % 2 === 0 && this.st < b) g.fx.rise(this.x + (Math.random() - 0.5) * 90, this.y + 1, 40 + Math.random() * 140, this.st % 4 ? '#5ad0ff' : '#ffd23a');
    if (this.st === a) {
      this.superName(this.x, 230, '#9fe7ff');
      g.shake = 8; g.rumble(this, 'special');
      if (!this.teamFx) g.fx.ring(this.x, this.y, { rx: 160, ry: 56, shock: true, col: this.hero.accent, life: 24 });
    }
    // (the last round lands -- 16 frames after -- before the super's last beat: it ends on the play, not on its impact frames)
    // (STARFALL+, the Archmage's: a fourth round -- a boss sits that one out: the boss cap -- and stars all over the sky)
    const rounds = S.plus ? [a, a + Math.round((b - a) * 0.25), a + Math.round((b - a) * 0.5), a + Math.round((b - a) * 0.75)]
      : [a, a + Math.round((b - a) * 0.35), a + Math.round((b - a) * 0.7)];
    if (rounds.includes(this.st)) {
      const n = rounds.indexOf(this.st) + 1;
      const foes = g.onScreenFoes();
      for (const t of foes) if (!(S.plus && n === 2 && t.boss)) g.actors.push(new Star(g, this, t, n >= rounds.length));
      const sky = !foes.length ? 4 : S.plus ? 6 : 0;
      for (let i = 0; i < sky; i++) g.actors.push(new Star(g, this, { x: g.camX + 100 + Math.random() * 760, y: Math.random() * 140, z: 0, ghost: true }, false));
    }
  }

  cyclone() {
    // Scarlet: a spinning cutlass whirlwind that tears across the screen and back, dragging bad guys into it
    const g = this.game, S = this.hero.special;
    const a = Math.round(S.dur * S.key), b = Math.round(S.dur * S.until);
    if (!this.cyc) this.cyc = { x0: this.x, far: this.facing > 0 ? g.camX + W - 80 : g.camX + 80, hits: new Map(), last: new Map(), n: 0 };
    const C = this.cyc;
    if (this.st === a) {
      this.superName(this.x, 210, '#ff8a8a');
      audio.sfx('wind_gust'); g.rumble(this, 'special'); g.shake = Math.max(g.shake, 6);
      if (!this.teamFx) g.fx.ring(this.x, this.y, { rx: 150, ry: 52, shock: true, col: this.hero.accent, life: 22 });
    }
    g.dim = this.st >= a && this.st < b ? 0.3 : Math.max(0, (g.dim || 0) - 0.05);
    if (this.st >= a && this.st < b) {
      const u = (this.st - a) / (b - a), there = u < 0.5 ? u * 2 : (1 - u) * 2;
      this.x = C.x0 + (C.far - C.x0) * (0.5 - 0.5 * Math.cos(Math.PI * there));
      this.inv = Math.max(this.inv, 2);
      if (this.st % 2 === 0) g.fx.add({ type: 'wind', x: this.x, y: this.y + (Math.random() - 0.5) * 40, z: 20 + Math.random() * 140, vx: (Math.random() - 0.5) * 8, life: 24, len: 52 });
      if (this.st % 3 === 0) g.fx.rise(this.x + (Math.random() - 0.5) * 70, this.y + 1, 30 + Math.random() * 120, this.hero.accent);
      if (this.st % 9 === 0) audio.sfx('sword_slash', { pitch: 0.9 + Math.random() * 0.3, vol: 0.7 });
      if (this.st === a + Math.round((b - a) / 2)) this.superHit(this.x, this.y, C.n);   // (the turn at the far side)
      if (!this.teamFx) for (const t of g.onScreenFoes()) {
        const dx = t.x - this.x;
        if (Math.abs(dx) < 170 && !t.boss && !t.heavy) { t.x -= dx * 0.06; t.y += (this.y - t.y) * 0.08; }   // sucked into the whirl
        if (Math.abs(dx) > 84 || Math.abs(t.y - this.y) > 60) continue;
        const n = C.hits.get(t) || 0;
        if (n >= 3 || this.st - (C.last.get(t) ?? -99) < 9) continue;
        C.hits.set(t, n + 1); C.last.set(t, this.st);
        if (!n) C.n++;
        const fin = n + 1 >= 3;
        const hd = { dmg: 13, kind: fin ? 'knock' : 'light', push: fin ? 6 : 1, lift: 6, stun: 30, stop: 3, hit: 'sword_slash', special: true, ember: 0, thrown: fin };
        g.fx.slash(t.x, t.y, t.z + t.h * 0.55 + (t.hz0 || 0));
        if (t.takeHit(this, hd)) this.landed(t, hd);
      }
    }
    if (this.st >= S.dur - 1) this.cyc = null;
  }

  shadowStrike() {
    // Shadow: vanishes, then slashes every enemy on screen three times
    const g = this.game, S = this.hero.special;
    const a = Math.round(S.dur * S.key), b = Math.round(S.dur * S.until);
    if (this.st === a) {
      g.fx.poof(this.x, this.y, 0, false);
      audio.sfx('vanish');
      this.superName(this.x, 210, '#e0a0ff');
      g.rumble(this, 'special');
    }
    g.dim = this.st >= a && this.st < b ? 0.32 : Math.max(0, (g.dim || 0) - 0.05);
    if (this.st > a && this.st < b && this.st % 3 === 0) g.fx.rise(g.camX + 80 + Math.random() * (W - 160), 20 + Math.random() * 110, 20 + Math.random() * 120, this.hero.accent);
    const rounds = [a + 4, a + Math.round((b - a) * 0.45), b - 4];
    if (rounds.includes(this.st)) {
      const n = rounds.indexOf(this.st) + 1, foes = g.onScreenFoes();
      for (const t of foes) {
        const hd = { dmg: 13, kind: n >= 3 ? 'knock' : 'light', push: n >= 3 ? 6 : 1, lift: 5, stun: 30, stop: 3, hit: 'sword_slash', special: true, ember: 0, thrown: n >= 3 };
        g.fx.slash(t.x, t.y, t.z + t.h * 0.55 + (t.hz0 || 0));
        if (n >= 3) g.fx.slash(t.x, t.y, t.z + t.h * 0.35 + (t.hz0 || 0));
        if (this.teamFx) t.flash = 6;       // (a team attack's slashes: a flinch of light; the blast does the damage)
        else if (t.takeHit(this, hd)) this.landed(t, hd);
      }
      if (n >= 3) this.superHit(this.x, this.y, foes.length);
      else if (!this.teamFx) g.fx.ring(this.x, this.y, { rx: 120, ry: 42, shock: true, col: this.hero.accent, life: 16 });
    }
    if (this.st === b) { g.fx.poof(this.x, this.y, 0, false); audio.sfx('sword_slash', { pitch: 0.8 }); }
  }

  // ---------------------------------------------------------------- carrying things
  pickUp(obj) {
    this.carry = obj;
    obj.pickUp(this);
    this.vx = this.vy = 0;
    this.set('lift');
    audio.sfx('pickup_item');
  }
  startThrow() { this.vx = this.vy = 0; this.reset('throw'); this.thrown = false; }
  throwing() {
    if (!this.thrown && this.st >= 6 && this.carry) {
      this.thrown = true;
      const obj = this.carry; this.carry = null;
      obj.throwFrom(this, this.facing);
      audio.sfx('throw');
    }
    if (this.st >= 16) this.set('idle');
  }
  dropCarry() { if (this.carry) { const o = this.carry; this.carry = null; o.drop(this); } }
  carryPoint() {
    const cp = this.art?.CARRY_POINT || [0, -150];
    return { x: this.x + this.facing * cp[0], y: this.y, z: this.z - cp[1] };
  }

  // ---------------------------------------------------------------- getting hit
  /** SUPER-ARMOUR while charging (a shot's charge or a melee one) and through a charged strike's swing: a hit still
   * hurts, but no stun, knockback or knockdown and the charge goes on -- unless it's the one that empties the bar */
  get armoured() {
    return (this.state === 'charge' && !!this.charge) || (this.state === 'cstrike' && !!this.strikeD && !this.strikeD.done);
  }
  takeHit(att, hd) {
    if (!this.hittable) return false;
    const g = this.game;
    if (this.state === 'dodge' && this.st >= Math.min(DODGE.inv0, PERFECT.from) && this.st <= DODGE.inv1) {   // rolled through it: no hit
      if (att.team !== 'hazard') this.perfectDodge(att);
      return false;
    }
    if (this.armoured && this.hp - hd.dmg > 0) {
      const from = att.team === 'shot' ? -att.facing : (att.x > this.x ? 1 : -1);
      this.hp -= hd.dmg;
      this.armorT = 10; this.armorHits = (this.armorHits || 0) + 1; this.hitsTaken = (this.hitsTaken || 0) + 1;
      g.hitstop = Math.max(g.hitstop, 3);
      g.shake = Math.max(g.shake, 3);
      g.fx.spark(this.x + from * 10, this.y + 1, this.z + 80, false, 'cool');
      g.fx.ring(this.x, this.y, { rx: 58, ry: 22, shock: true, col: this.hero.accent, life: 10 });
      audio.sfx('block', { pitch: 0.8, vol: 0.9 });
      audio.sfx(hd.sfx || 'hit_light', { pitch: 1.05, vol: 0.5 });
      g.rumble(this, 'hurt');
      return true;
    }
    this.stopCharge();                                     // (the hit that empties the bar: the charge goes with it)
    this.hp -= hd.dmg;
    this.flash = 8;
    const from = att.team === 'shot' ? -att.facing : (att.x > this.x ? 1 : -1);
    this.facing = from;
    g.hitstop = Math.max(g.hitstop, hd.stop || 4);
    g.shake = Math.max(g.shake, hd.kind === 'knock' ? 7 : 3);
    g.fx.spark(this.x + from * 10, this.y + 1, this.z + 80, hd.kind === 'knock', hd.spark || 'cool');
    audio.sfx(hd.sfx || 'hit_light', { pitch: 1.05 });
    audio.sfx('player_hurt', { vol: 0.8 });
    g.rumble(this, hd.kind === 'knock' ? 'hurtHeavy' : 'hurt');
    this.hitCount++; this.hitWindow = 70; this.hitsTaken = (this.hitsTaken || 0) + 1;
    this.bufA = this.bufJ = this.bufS = this.bufP = this.bufD = 0;
    if (this.carry) this.dropCarry();
    if (this.shot?.beam && hd.kind !== 'knock' && this.hp > 0) { audio.sfx('block', { pitch: 1.4, vol: 0.5 }); return true; }
    if (this.shot?.beam) { this.shot.beam.gone = true; this.shot.beam = null; this.cool = Math.min(this.cool, 60); }
    if (this.hp <= 0 || hd.kind === 'knock' || this.hitCount >= 3) {
      this.hp = Math.max(0, this.hp);
      this.knock(-from, hd.lift || 6, hd.push || 4);
    } else {
      this.reset('hurt'); this.stun = hd.stun || 18;
      this.hurtAlt = !this.hurtAlt;
      this.vx = -from * (hd.push || 2.5); this.vy = 0;
    }
    return true;
  }

  knock(dir, lift, push) {
    this.set('fly');
    this.vz = lift; this.vx = dir * push; this.vy = 0;
    this.z = Math.max(this.z, 1);
    this.bounced = false; this.hitCount = 0;
  }

  /** Back on the feet with full health; a burst clears space around them. */
  respawn() {
    const g = this.game;
    this.hp = this.maxHp; this.out = false; this.alive = true;
    this.set('getup');
    this.inv = 160;
    g.fx.ring(this.x, this.y, { rx: 220, ry: 80, shock: true, blue: (this.hero.base || this.heroId) === 'ana' });
    for (const t of g.actors) {
      if (t.team !== 'foe' || !t.alive || t.down || t.boss) continue;
      if (Math.abs(t.x - this.x) < 260) t.knock?.(t.x > this.x ? 1 : -1, 5, 6);
    }
  }

  /** Arrive through a crystal portal (drop-in, continue, level start). */
  warpIn(x, y) {
    const g = this.game;
    this.x = x; this.y = y; this.z = 0; this.vx = this.vy = this.vz = 0;
    this.hp = this.maxHp; this.out = false; this.alive = true;
    this.reset('portal'); this.inv = 120;
    g.fx.portal(x, y);
    audio.sfx('portal');
  }

  // ---------------------------------------------------------------- drawing
  pose() {
    const g = this.game, A = this.art?.ANIM || {};
    const get = (k, arg, fb = 'idle') => {
      let f = A[k];
      if (f === undefined) f = A[fb];
      if (f === undefined) return {};
      return typeof f === 'function' ? f(arg) : f;
    };
    const st = this.state;
    if (this.carry && ['idle', 'walk', 'run', 'land', 'cutscene'].includes(st)) {
      return st === 'walk' || st === 'run' ? get('carryWalk', this.ph, 'walk') : get('carryIdle', g.time, 'idle');
    }
    switch (st) {
      case 'idle': case 'cutscene': {
        const C = st === 'idle' && !this.cutPose && this.coast && g.frame - this.coast.last <= 1 ? this.coast : null;   // (let go and still moving: the stop -- coasting)
        if (C) return C.skid && this.hasClip('skid') ? get('skid', Math.min(1, C.t / (C.skidF || STOP.skidF))) : get(C.from, this.ph);   // (asked every frame: a re-plan can drop the move pack mid-skid -- aba812)
        if (st === 'idle' && !this.cutPose && this.cutPoseArg == null) {
          // (a fresh idle starts at the loop's calm phase and runs on its own frame count -- the shared clock let a 1-2 frame idle between
          //  swings land on a blink; each slot a little further into the calm run, so twins don't breathe in step)
          const K = calmIdle(this.art);
          if (K) { const off = Math.max(0, Math.min(17, (K.room - 24) / 4)) * (this.slot % 4); return get('idle', (K.f0 + off + this.st + 0.5) / 60); }
        }
        return get(this.cutPose || 'idle', this.cutPoseArg ?? g.time + this.slot * 1.7);
      }
      case 'walk': return get('walk', this.ph);
      case 'run': return this.turnT > 0 && this.hasClip('runTurn') ? get('runTurn', 1 - this.turnT / STOP.turnF) : get('run', this.ph);
      case 'squat': return this.hasClip('squat', true) ? get('squat', Math.min(1, this.st / 4)) : get('squat', 0);   // (painter 3's dip and push, where the atlas has it)
      case 'air':
        if (this.airAtkT >= 0) return get('airAtk', Math.min(1, this.airAtkT / 16));
        if (this.carry) return get('carryIdle', g.time);
        if (this.hasClip('rise', true) && this.hasClip('fall', true)) { const J = this.hero.jumpV; return this.vz > 0 ? get('rise', clamp(1 - this.vz / J, 0, 1)) : get('fall', clamp(-this.vz / J, 0, 1)); }   // (painter 3's rise and fall, by vz)
        return mix(get('rise', 0), get('fall', 0), clamp((this.hero.jumpV * 0.5 - this.vz) / this.hero.jumpV, 0, 1));
      case 'land': return this.hasClip('land', true) ? get('land', clamp(this.st / this.landT, 0, 1)) : mix(get('land', 0), get('idle', g.time), clamp(this.st / this.landT, 0, 1));
      case 'atk': return get(this.atk, Math.min(1, this.st / this.hero.atk[this.atk].dur));
      case 'runAtk': return get('runAtk', Math.min(1, this.st / this.hero.atk.runAtk.dur));
      case 'shoot': return get('shoot', Math.min(1, this.st / this.hero.shoot.dur), 'atk1');
      case 'auto': { if (this.chargeWalking) return get('walk', this.ph); const S = this.hero.shoot; return get('shoot', Math.min(1, (this.shootRel + (this.st % 8)) / S.dur), 'atk1'); }
      case 'charge': {
        if (this.chargeWalking) return get('walk', this.ph);   // (walking with it: the walk -- the orb / glow on the hand's landmark)
        if (this.charge?.melee) { const A4 = this.hero.atk.atk4; return get('atk4', (A4.a0 - 1) / A4.dur); }   // (atk4's wind-up, held)
        return get('shoot', (this.shootRel - 1) / this.hero.shoot.dur, 'atk1');   // (the wind-up, held)
      }
      case 'cstrike': {   // atk4 swung from the wind-up through the blow, then its follow-through; Shadow's rush: runAtk
        const D = this.strikeD, S = D?.S || STRIKE.dodongo;
        if (S.lane) { const R = this.hero.atk.runAtk, k = this.st <= S.dash ? (R.a0 + (R.a1 - R.a0) * this.st / S.dash) : R.a1 + (R.dur - R.a1) * Math.min(1, (this.st - S.dash) / MELEE.rec); return get('runAtk', Math.min(1, k / R.dur)); }
        const A4 = this.hero.atk.atk4, h = S.hit;
        const fr = this.st <= h ? A4.a0 - 1 + 2 * this.st / h : A4.a0 + 1 + (A4.dur - A4.a0 - 1) * Math.min(1, (this.st - h) / MELEE.rec);
        return get('atk4', Math.min(1, fr / A4.dur));
      }
      // (the painted 'dodge' clip where the atlas has one; until then the run, with afterimages)
      case 'dodge': {
        const k = Math.min(1, this.st / DODGE.dur);
        if (this.dodgeDir?.back) return this.hasClip('dodgeBack') ? get('dodgeBack', k) : A.dodge !== undefined ? get('dodge', 1 - k) : get('run', 1 - this.ph);   // (a back-step: painter 3's back-hop, else the roll played backwards -- the facing kept)
        return A.dodge !== undefined ? get('dodge', k) : get('run', this.ph);
      }
      case 'special': return get('special', Math.min(1, this.st / this.hero.special.dur));
      case 'lift': return get('carryIdle', g.time, 'squat');
      case 'throw': return get('throw', Math.min(1, this.st / 16), 'atk1');
      case 'hurt': return get(this.hurtAlt && A.hurt2 ? 'hurt2' : 'hurt', Math.min(1, this.st / this.stun));
      case 'fly':   // (painter 3's bounce: the impact squash from just before the floor, then the clip over 12 f from the bounce -- A the squash, B the arched hop)
        if (this.hasClip('bounce') && (this.bounced || (this.vz < 0 && this.z < 8))) return get('bounce', this.bounced ? clamp((this.st - (this.bounceSt ?? this.st)) / 12, 0, 1) : 0);
        return get('fly', 0);
      case 'down': return get('down', 0);
      case 'getup': {
        const P = get('getup', Math.min(1, this.st / 28));
        if (P && P.s3d >= 0.5 && P.clip === 'getup' && GETUP_SEQ.arts.has(this.hero.art) && (get('getup', 1).f_getup | 0) === GETUP_SEQ.n - 1) {
          const O = GETUP_SEQ.order;
          return { ...P, f_getup: O[Math.min(O.length - 1, Math.floor((this.st * O.length) / 28))] };   // (RC: the one-way rise -- GETUP_SEQ)
        }
        return P;
      }
      case 'portal': return get('portal', Math.min(1, this.st / 40), 'idle');
      case 'victory': return get('victory', g.time);
      default: return get('idle', g.time);
    }
  }

  get hidden() {
    // Shadow vanishes during his strike; blink while invulnerable
    if (this.out) return true;
    if (this.state === 'special' && this.dragon && !this.dragon.boy) return true;   // (he's the dragon: drawDragon)
    if (this.state === 'special' && this.hero.special.kind === 'strike') {
      const k = this.st / this.hero.special.dur;
      if (k > this.hero.special.key && k < this.hero.special.until) return true;
    }
    return this.inv > 0 && !['special', 'getup', 'portal', 'cutscene', 'victory'].includes(this.state) && (this.inv >> 2) % 2 === 1;
  }

  drawShadow(ctx) {
    if (!this.hidden || this.inv > 0) super.drawShadow(ctx);
    // (co-op: a ring in the player's own colour on the floor under the hero -- who is who, and which of two players on the
    //  same hero is which; flat strokes, no blur, nothing offscreen: cheap on the iPad)
    const g = this.game;
    if (this.hidden || g.cut || g.players.length < 2 || g.players.filter((q) => !q.out).length < 2) return;
    const sx = this.x - g.camX, sy = FLOOR_TOP + this.y, k = clamp(1 - this.z / 260, 0.35, 1), s = (this.bigV || 1) * (0.75 + 0.25 * k);
    const col = PLAYER_COLS[this.slot] || '#fff', m = ctx.getTransform(), img = ringImage(col, Math.round(Math.hypot(m.a, m.b) * 100) / 100);
    ctx.save(); ctx.globalAlpha = 0.55 + 0.45 * k;   // (on the floor: the player's colour exactly, as their P-tag and HUD panel)
    if (img) { const w = (RING_RX + RING_PAD) * 2 * s, h = (RING_RY + RING_PAD) * 2 * s; ctx.drawImage(img, sx - w / 2, sy - h / 2, w, h); }
    else {
      ctx.beginPath(); ctx.ellipse(sx, sy, RING_RX * s, RING_RY * s, 0, 0, Math.PI * 2);
      ctx.lineWidth = 5.5; ctx.strokeStyle = 'rgba(20,12,30,0.5)'; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke();
    }
    ctx.restore();
  }

  /** the twins' outline in this player's colour (RIM_* above): remade only when the drawing changes, drawn behind it */
  drawTwinRim(ctx, art, pose, o) {
    const R = RIM_REC;
    R.reset();
    try { art.draw(R, pose, o); } catch { return; }
    if (R.rig || !R.list.length) return;                  // (a code-rig moment, a GPU page, nothing drawn: the ring says it)
    // (a drawing made from a canvas -- a form's placeholder wash -- changes under the same key: not outlined)
    for (const [img] of R.list) if (!(img instanceof HTMLImageElement || (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap))) return;
    const K = o.scale || 1, s = RIM_S / K, col = PLAYER_COLS[this.slot] || '#fff', fx = RIM_FX * RIM_S, fy = RIM_FY * RIM_S;
    let key = col + K, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [img, a, m] of R.list) {
      key += `|${rimId(img)}:${a.join(',')}:${m.join(',')}`;
      const [dx, dy, dw, dh] = a.length >= 8 ? a.slice(4) : a.length >= 4 ? a : [a[0], a[1], img.width, img.height];
      for (const px of [dx, dx + dw]) for (const py of [dy, dy + dh]) {
        const X = m[0] * px + m[2] * py + m[4], Y = m[1] * px + m[3] * py + m[5];
        if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
      }
    }
    if (RIM_BUFS[this.slot] === undefined) RIM_BUFS[this.slot] = cacheCanvas(RIM_PW, RIM_PH);   // (null: refused -- not asked again)
    this.rimBuf = RIM_BUFS[this.slot];
    if (RIM_SCR === undefined) { RIM_SCR = cacheCanvas(RIM_W * RIM_S, RIM_H * RIM_S); RIM_DIL = RIM_SCR && cacheCanvas(RIM_W * RIM_S, RIM_H * RIM_S); }
    const B = this.rimBuf;
    if (!B || !RIM_SCR || !RIM_DIL) return;
    if (B.key !== key || B.who !== this) {               // (a new drawing: its outline now -- never a frame without one)
      const TW = RIM_SCR.c.width, TH = RIM_SCR.c.height, S = RIM_SCR.g, D = RIM_DIL.g, G = B.g;
      const X0 = clamp(Math.floor(fx + x0 * s) - RIM_M, 0, TW), X1 = clamp(Math.ceil(fx + x1 * s) + RIM_M, 0, TW);
      const Y0 = clamp(Math.floor(fy + y0 * s) - RIM_M, 0, TH), Y1 = clamp(Math.ceil(fy + y1 * s) + RIM_M, 0, TH);
      const w = X1 - X0, h = Y1 - Y0, u = Math.min(2, RIM_PW / w, RIM_PH / h);
      B.key = key; B.who = this; B.r = w > 0 && h > 0 ? [X0, Y0, w, h, u] : null;
      if (!B.r) return;
      // 1. the silhouette, half a texel a game px (only the drawing's rect is cleared, filled and read: what's left
      //    outside it from an older drawing is never used)
      S.setTransform(1, 0, 0, 1, 0, 0); S.globalCompositeOperation = 'source-over'; S.globalAlpha = 1; S.clearRect(X0, Y0, w, h);
      S.imageSmoothingEnabled = true; S.imageSmoothingQuality = 'low';
      for (const [img, a, m] of R.list) { S.setTransform(s * m[0], s * m[1], s * m[2], s * m[3], fx + s * m[4], fy + s * m[5]); S.drawImage(img, ...a); }
      S.setTransform(1, 0, 0, 1, 0, 0);
      S.globalCompositeOperation = 'source-in'; S.fillStyle = col; S.fillRect(X0, Y0, w, h); S.globalCompositeOperation = 'source-over';
      // 2. the outline: the silhouette moved by whole texels, the silhouette cut back out
      D.globalCompositeOperation = 'source-over'; D.clearRect(X0, Y0, w, h);
      for (const [ux, uy] of RIM_OFF) D.drawImage(RIM_SCR.c, X0, Y0, w, h, X0 + ux, Y0 + uy, w, h);
      D.globalCompositeOperation = 'destination-out'; D.drawImage(RIM_SCR.c, X0, Y0, w, h, X0, Y0, w, h); D.globalCompositeOperation = 'source-over';
      // 3. smoothed up 2x into the twin's own buffer: drawn each frame without filtering, a quarter of the cost of a
      //    filtered draw on a software canvas; at a texel a game px (2 device px at DPR 2) the steps don't show.  (Only
      //    what the last outline used is cleared; a 'copy' draw instead costs more on WebKit)
      const old = B.r0 || [B.c.width, B.c.height];
      G.clearRect(0, 0, Math.min(B.c.width, Math.max(old[0], w * u) + 1), Math.min(B.c.height, Math.max(old[1], h * u) + 1));
      B.r0 = [Math.ceil(w * u), Math.ceil(h * u)];
      G.imageSmoothingEnabled = true; G.imageSmoothingQuality = 'low';
      G.drawImage(RIM_DIL.c, X0, Y0, w, h, 0, 0, w * u, h * u);
    }
    if (!B.r) return;
    const [X0, Y0, w, h, u] = B.r, sm = ctx.imageSmoothingEnabled;
    this.rimAt = this.game.frame;                         // (the frame this outline was last drawn: tests)
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(B.c, 0, 0, w * u, h * u, this.sx + (X0 - fx) / s, this.sy + (Y0 - fy) / s, w / s, h / s);
    ctx.imageSmoothingEnabled = sm;
  }

  draw(ctx) {
    if (this.hidden) return;
    const art = this.art;
    if (!art) return;
    const pose = this.pose();
    const g = this.game;
    const flash = this.flash >= 7 ? 0.7 : this.flash > 0 ? 0.25 : 0;
    // on the ground there's no vertical speed, whatever vz was left over from the last fall
    const o = { facing: this.facing, t: g.time, mem: this.mem, vel: { x: this.vx || 0, y: this.vy || 0, z: this.z > 0 ? (this.vz || 0) : 0 }, talk: !!this.talking, idleT: this.state === 'idle' ? this.st / 60 : 0 };
    if (this.bigV && this.bigV !== 1) o.scale = this.bigV;   // (the summit's big dragon: drawn 0.9 of the duel's size)
    // the dodge's afterimages: the last three positions, fading (they linger a moment after the dash)
    if (this.ghosts.length) {
      this.ghosts = this.ghosts.filter((q) => g.frame - q.at < 14);
      const a0 = ctx.globalAlpha;
      setSilhouette(this.hero.accent);
      try {
        this.ghosts.forEach((q, i) => {
          if (q.col) setSilhouette(q.col);
          ctx.globalAlpha = a0 * (0.22 + 0.1 * i) * (1 - (g.frame - q.at) / 14);
          drawWithFlash(ctx, q.x - g.camX, FLOOR_TOP + q.y - q.z, 1, (c) => art.draw(c, q.pose, { ...o, facing: q.facing, mem: {} }));
        });
      } finally { setSilhouette(g.impact && !g.cutin ? '#fff8ea' : null); }
      ctx.globalAlpha = a0;
    }
    const MC = this.state === 'charge' && this.charge?.melee ? this.charge : null;
    if (MC) {                                               // the melee charge: an aura round him, behind the sprite
      const k = Math.min(1, (MC.t - CHARGE.start) / (CHARGE.full - CHARGE.start)), acc = this.hero.accent;
      const rgb = [1, 3, 5].map((i) => parseInt(acc.slice(i, i + 2), 16)).join(',');
      const x = this.sx, y = this.sy - 78, r = 46 + 34 * k + (MC.full ? 5 * Math.sin(g.time * 18) : 0);
      ctx.save();
      const gr = ctx.createRadialGradient(x, y, 4, x, y, r * 1.5);
      gr.addColorStop(0, `rgba(${rgb},${0.18 + 0.32 * k})`); gr.addColorStop(0.6, `rgba(${rgb},${0.1 + 0.18 * k})`); gr.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(x, y, r * 1.1, r * 1.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (this.hero.form) FORM.auraBack(ctx, this);
    if (RIM_ON && g.players.length > 1 && !g.cut && !g.impact && g.isTwin?.(this)) this.drawTwinRim(ctx, art, pose, o);
    drawWithFlash(ctx, this.sx, this.sy, flash, (c) => art.draw(c, pose, o));
    if (this.hero.form) FORM.auraFront(ctx, this);
    if (this.armorT > 0) {                                  // the armour flash: a hit that couldn't move him, in his colour
      const a0 = ctx.globalAlpha;
      ctx.globalAlpha = a0 * 0.6 * (this.armorT / 10);
      setSilhouette(this.hero.accent);
      try { drawWithFlash(ctx, this.sx, this.sy, 0, (c) => art.draw(c, pose, o)); } finally { setSilhouette(g.impact && !g.cutin ? '#fff8ea' : null); }
      ctx.globalAlpha = a0;
    }
    if (MC) {                                               // ... and the glow gathering at the weapon, sparks drawn in
      const k = Math.min(1, (MC.t - CHARGE.start) / (CHARGE.full - CHARGE.start)), acc = this.hero.accent, mp = this.chargePoint(true, pose);
      const x = mp.x - g.camX, y = FLOOR_TOP + mp.y - mp.z, r = 6 + 12 * k + (MC.full ? 3 * Math.sin(g.time * 18) : 0);
      const rgb = [1, 3, 5].map((i) => parseInt(acc.slice(i, i + 2), 16)).join(',');
      ctx.save();
      const gr = ctx.createRadialGradient(x, y, 1, x, y, r * 2.4);
      gr.addColorStop(0, `rgba(255,251,232,${0.55 + 0.35 * k})`); gr.addColorStop(0.4, `rgba(${rgb},${0.45 + 0.3 * k})`); gr.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 4; i++) {
        const a = g.time * 5 + i * Math.PI / 2, u = (g.time * 3 + i * 0.25) % 1, d = r + 12 + 26 * (1 - u);
        ctx.fillStyle = i % 2 ? '#fffbe8' : acc; ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 2.6, 0, Math.PI * 2); ctx.fill();
      }
      if (MC.full) { ctx.lineWidth = 3; ctx.strokeStyle = acc; ctx.beginPath(); ctx.ellipse(this.sx, this.sy, 52, 18, 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    }
    // charging: an energy orb at the hand in the hero's colour, growing to full (then pulsing, ink-ringed), sparks
    // drawn in to it
    if (this.state === 'charge' && this.charge && !this.charge.melee && g.L?.si) {   // (Book 2, QAF3: a small fireball held at the hand -- the 26 px ink-ringed disc sat over the hero's face during the Elder ring's HOLD)
      const C = this.charge, k = Math.min(1, (C.t - CHARGE.start) / (CHARGE.full - CHARGE.start)), tm = g.time;
      const pu = 0.5 + 0.5 * Math.sin(tm * (C.full ? 9 : 6)), r = (5 + 8 * k) * (0.93 + 0.1 * pu);   // (its size and glow pulse smoothly -- faster when it is full; never a blink)
      const so = this.chargePoint(false, pose, r + 6), x = so.x - g.camX, y = FLOOR_TOP + so.y - so.z, f = this.facing || 1;   // (+6: Dodongo's, at his mouth, held a little further out -- clear of his chin)
      const acc = this.hero.accent, rgb = [1, 3, 5].map((i) => parseInt(acc.slice(i, i + 2), 16)).join(',');
      ctx.save();
      const gw = r * (C.full ? 2.5 : 2.1), gr = ctx.createRadialGradient(x, y, 0, x, y, gw);
      gr.addColorStop(0, `rgba(${rgb},${(0.4 + 0.25 * k) * (0.8 + 0.2 * pu)})`); gr.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, gw, 0, Math.PI * 2); ctx.fill();
      const th = r * (1.55 + 0.22 * Math.sin(tm * 11) + 0.12 * Math.sin(tm * 17.3)), lean = -f * r * (0.35 + 0.1 * Math.sin(tm * 7));   // (the flame's tip: licking up and back, smooth)
      ctx.beginPath(); ctx.moveTo(x + lean, y - th);
      ctx.quadraticCurveTo(x + r * 0.95, y - r * 0.55, x + r, y); ctx.arc(x, y, r, 0, Math.PI); ctx.quadraticCurveTo(x - r * 0.95, y - r * 0.55, x + lean, y - th); ctx.closePath();
      const fg = ctx.createRadialGradient(x - f * r * 0.15, y + r * 0.1, 0, x, y, r * 1.5);
      fg.addColorStop(0, '#fffbe8'); fg.addColorStop(0.45, `rgb(${rgb})`); fg.addColorStop(1, `rgba(${rgb},0.85)`);
      ctx.fillStyle = fg; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(33,20,28,0.55)'; ctx.stroke();
      for (let i = 0; i < 3; i++) {   // (embers drifting up off it)
        const u = (tm * 1.6 + i / 3) % 1, ex = x + Math.sin(tm * 3 + i * 2.1) * r * 0.7 - f * u * r * 0.6, ey = y - r - u * r * 2.4;
        ctx.globalAlpha = 0.9 * (1 - u); ctx.fillStyle = i % 2 ? '#fffbe8' : acc; ctx.beginPath(); ctx.arc(ex, ey, 1.4 + 1.2 * (1 - u), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    } else if (this.state === 'charge' && this.charge && !this.charge.melee) {
      const C = this.charge, k = Math.min(1, (C.t - CHARGE.start) / (CHARGE.full - CHARGE.start));
      const r = 9 + 17 * k + (C.full ? 3 * Math.sin(g.time * 18) : 0), so = this.chargePoint(false, pose, r), x = so.x - g.camX, y = FLOOR_TOP + so.y - so.z;
      const acc = this.hero.accent, rgb = [1, 3, 5].map((i) => parseInt(acc.slice(i, i + 2), 16)).join(',');
      ctx.save();
      const gr = ctx.createRadialGradient(x, y, 1, x, y, r * 2.2);
      gr.addColorStop(0, `rgba(${rgb},${0.5 + 0.3 * k})`); gr.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = C.full ? 3 : 2; ctx.strokeStyle = '#21141c'; ctx.stroke();
      ctx.fillStyle = '#fffbe8'; ctx.beginPath(); ctx.arc(x - r * 0.15, y - r * 0.15, r * 0.5, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 4; i++) {                          // (sparks converging on the orb)
        const a = g.time * 5 + i * Math.PI / 2, d = r + 14 + 22 * ((g.time * 3 + i * 0.25) % 1 > 0.5 ? 1 - ((g.time * 3 + i * 0.25) % 1) : (g.time * 3 + i * 0.25) % 1);
        ctx.fillStyle = i % 2 ? '#fffbe8' : acc; ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 2.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    if (this.carry) this.carry.drawHeld?.(ctx);
  }
}
