// The finale's SKY DUEL (docs/FINALE.md): Dragon Dodongo against the Dread King, high over the volcano in the storm.
// A screen-locked flight duel (the sky scrolls by underneath), deliberately EASY: a first-time kid should win in one or
// two tries (tools: the duel bot in the finale test scripts).
//
//   Dragon Dodongo (the Dodongo player, else P1): 8-way flight inside the left of the screen.  FIRE (attack, or shoot):
//   tap = fireballs, hold = a short flame stream.  ROLL (jump): a dodge roll, invulnerable.  SUPER (special) with a full
//   meter: a flame wave across the screen.  Six hearts; cursed whelps drop health orbs.
//   Riders: in co-op the other player rides and fires their hero's own ranged move with FIRE (Anastasia's beam, Shadow's
//   shurikens, Scarlet's hook, Dodongo's fireball); otherwise the party's other heroes (or Anastasia) ride along with a
//   light auto-shot.  Every player has a SUPER: the rider and the wingmen (P3 / P4) a meter each and their own hero's
//   super's duel version (src/duelsupers.js).
//   The Dread King: phase 1 = fireball spreads + cursed whelps; phase 2 = + tail lashes: he swoops in over the hero's
//   lane, the stretch his tail will sweep flashing first, and lashes it down and out (the atlas' tailTip drives the
//   stripe, the swipe arc and the hit); phase 3 = + a charge across the screen, and when he's beaten, the BREATH CLASH (hold / mash FIRE: it can't be
//   lost).  Each phase is a save point (main.js startDuel); losing every heart restarts the phase -- no game over.
// Art: CHARS.dodongo_dragon / dragonking_dread (atlases or their placeholder rigs), CHARS.whelp (cursed), the riders' sit.
// Clip names quoted here count as gameplay for the atlas packs (tools/sprite3d/packsets.mjs):
//   'flyLoop' 'fireTap' 'flame' 'roll' 'hurt' 'super' -- 'fly' 'castWind' 'cast' 'tailWind' 'tail' 'chargeWind' 'charge'
//   'beam' 'fall' -- 'hover'.  (The riders sit from their scene packs: duelArt.)
// Test hooks: window.DUEL_BOT(duel) -> { x, y, fire, firePress, roll, superP, p2 } drives the dragon (tools); DQ.duel.
import { W, H, INK, PLAYER_COLS } from './config.js';
import { CHARS } from './chars.js';
import { useArt } from './sprite3d.js';
import { duelArt } from './artsets.js';
import { createStage } from './stages/sky.js';
import { audio } from './audio-proxy.js';
import * as HUD from './hud.js';
import { clamp, TAU } from './rig.js';
import { fireSuper, stepSupers, endSupers, superOn, drawSupersBack, drawSupersFront, drawMeter, memberAt } from './duelsupers.js';

// ------------------------------------------------------------------------------------------------ tuning (EASY)
export const TUNE = {
  hearts: 6, iframes: 100, speed: 4.6, accel: 0.24, box: { x0: 70, x1: 620, y0: 105, y1: 470 },
  fireCd: 9, fireDmg: 2, fireSpeed: 11, holdToFlame: 16, flameRange: 320, flameDps: 8,
  rollDur: 24, rollIF: 22, rollSpeed: 8.5, rollCd: 30,
  meterMax: 100, meterHit: 3.2, meterFlame: 0.12, meterWhelp: 16, meterRider: 1.2, superDmg: 26,   // (meter gains 2x: the iPad round)
  meterRegen: 100 / (25 * 60),   // (the meter creeps up by itself while fighting: a full bar every 25 s)
  // P3 / P4's freed whelp WINGMEN (the dragon has two rider seats): steered with the stick, FIRE = small fireballs at a
  // rider's strength; they can't be hurt (a hit just blinks them)
  wingSpeed: 4.4, wingCd: 16, wingBlink: 50,
  phaseHp: [460, 520, 420],
  castEvery: [200, 250, 340], spreadN: [5, 5, 4], spreadArc: 0.95, fbSpeed: 2.7,
  whelpEvery: [380, 520, 600], whelpWave: [2, 2, 2], whelpHp: 2, orbChance: 0.55,
  mercy: 0.15,              // each lost try takes this share off the phase's health (down to 60 %)
  tailEvery: 330, laneWarn: 85, tailDur: 30,
  chargeEvery: 460, chargeWarn: 80, chargeSpeed: 12,
  clashStart: 0.5, clashKing: 0.0022, clashHold: 0.0032, clashMash: 0.014, clashRider: 0.0005, clashFloor: 0.12,
  riderCd: { ana: 12, shadow: 12, scarlet: 12, dodongo: 12 }, riderAuto: 95, riderDmg: 1,   // (a player's rider: rapid fire)
  // Anastasia's beam: a tick every beamEvery frames while it's on (beamLife after her last press), beamTick x riderDmg each
  // -- 8 a second held on him, between Scarlet's hook and Shadow's fan (it was 0.06 a frame: 3.6, and no spark)
  beamTick: 0.8, beamEvery: 6, beamLife: 30,
  memberSuper: 0.6,          // a rider's / wingman's super: the flyer's superDmg x this on the King, in all (src/duelsupers.js)
};
// (each player's meter fills about as fast as the flyer's: his meterHit per fireball is per 2 damage at 6.7 a second --
//  a member gets the same per damage point, scaled by how much less it deals: SkyDuel.feed)
const FLYER_DPS = TUNE.fireDmg * 60 / TUNE.fireCd;
function memberDps(m) {
  if (m.wing) return TUNE.riderDmg * 60 / TUNE.wingCd;
  if (m.hero === 'ana') return TUNE.beamTick * TUNE.riderDmg * 60 / TUNE.beamEvery;
  return TUNE.riderDmg * ({ shadow: 2.4, scarlet: 1.6 }[m.hero] || 1) * 60 / (TUNE.riderCd[m.hero] || 12);
}
const LANES = [150, 285, 420], LANE_H = 120;
const DRAGON_S = 0.85, KING_S = 0.72, WHELP_S = 0.9, RIDER_S = 0.4, WING_S = 0.8;
const RIDER_RIM = '#ffe2b0';      // a thin warm rim round the riders: Shadow's dark kit vanished on the night sky
const KING_HOME = [770, 300];
// the King's hit circle for the dragon's shots, off his middle (kingMid: per drawing, so it follows the painted poses)
const KING_HIT = { dx: -20, dy: -10, r: 78 };
const TAIL_HIT = 46;              // the tail tip's reach round the hero's middle (his 30 + the spade)
const HUD_BOTTOM = 66, CROWN_MARGIN = 24;   // (drawHud: the boss bar and the SUPER meter end at y 66)
const CHARGE_CROWN_MIN = 24;      // the charge's crown top limit: it may pass over the HUD for a moment, not off-screen
const PHASE_BANNER = ['SKY DUEL! Shoot the Dread King!', 'Watch out for his TAIL!', "He's CHARGING! Fly out of the way!"];

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
/** the distance from (px, py) to the segment a-b */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const u = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
  return Math.hypot(px - (ax + dx * u), py - (ay + dy * u));
}
const VEL0 = { x: 0, y: 0, z: 0 };

export class SkyDuel {
  /** opts: { phase: 0..2 (the save point), heroes: the run's heroes (as they're drawn: the base heroes), forms: the
   * same with their forms (the supers' own versions), ctrls: their controllers, players } */
  constructor(app, opts = {}) {
    this.app = app;
    this.heroes = (opts.heroes && opts.heroes.length ? opts.heroes : ['dodongo']).slice(0, 4);
    const forms = this.heroes.map((h, i) => (opts.forms && opts.forms[i]) || h);
    this.ctrls = (opts.ctrls && opts.ctrls.length ? opts.ctrls : ['any']).slice(0, this.heroes.length);
    // who flies: the Dodongo player (else P1); the other player rides and shoots; the party's other heroes ride along
    const di = this.heroes.indexOf('dodongo');
    this.flyer = di >= 0 ? di : 0;
    this.flyCtrl = this.ctrls[this.flyer] || 'any';
    this.riders = []; this.wingmen = [];
    const WING_Y = [170, 400, 285];         // (the wingmen's stations: above him, below him, then level with him)
    this.heroes.forEach((h, i) => {
      if (i === this.flyer && h === 'dodongo') return;
      // (P3 / P4 -- past the two seats -- fly a freed whelp each alongside him; so does a second Dodongo, whatever his seat:
      //  two players on Dodongo -- he is the dragon, the other never rides on himself)
      if (i >= 2 || h === 'dodongo') { this.wingmen.push({ wing: true, slot: i, hero: h, form: forms[i], ctrl: this.ctrls[i] || null, x: 150, y: WING_Y[Math.min(2, this.wingmen.length)], vx: 0, vy: 0, cd: 30, blink: 0, fire: 0, t: i * 37, mem: {} }); return; }
      this.riders.push({ hero: h, form: forms[i], slot: i, ctrl: i !== this.flyer && this.heroes.length > 1 ? this.ctrls[i] : null, cd: 40 + 30 * this.riders.length, anim: 0 });
    });
    if (!this.riders.length) this.riders.push({ hero: 'ana', ctrl: null, cd: 60, anim: 0 });   // (1P Dodongo: Anastasia rides along)
    this.riders = this.riders.slice(0, 2);
    this.stage = opts.stage || createStage(); this.stage.setScale(app.scale || 1);   // (opts.stage: another sky -- Mystic Mountain's dawn valley, src/dawn.js)
    this.startPhase = opts.phase || 0;
    // the players' own SUPER meters: a rider a player steers, and every wingman (src/duelsupers.js); the 1P companion
    // riding along has none
    this.tune = TUNE; this.supers = [];
    this.members = [...this.riders.filter((r) => r.ctrl), ...this.wingmen];
    for (const m of this.members) { m.meter = this.startPhase === 0 ? 0 : 40; m.mk = FLYER_DPS / memberDps(m); }
    this.t = 0; this.camX = 0; this.won = false; this.busy = false;
    this.mem = { dragon: {}, king: {}, riders: [{}, {}] };
    this.tries = [0, 0, 0];
    this.hurtT = 0;
    this.hintT = 0;
    this.beginPhase(this.startPhase, true);
  }
  async load() { await useArt(duelArt(this.riders.map((r) => r.hero))); audio.music('skyduel'); }
  get DD() { return CHARS.dodongo_dragon; }
  get DK() { return CHARS.dragonking_dread; }

  // ---------------------------------------------------------------------------------------------- phases
  beginPhase(n, first = false) {
    this.phase = n;
    this.R = rng(1234 + n * 77 + this.tries[n] * 13);
    this.player = { x: 220, y: 280, vx: 0, vy: 0, hearts: TUNE.hearts, inv: 0, roll: null, rollCd: 0, fireCd: 0, holdT: 0, flaming: false,
      anim: 'flyLoop', animT: 0, meter: this.player ? this.player.meter : (n === 0 ? 0 : 40), superCd: 0 };
    const hp = Math.round(TUNE.phaseHp[n] * Math.max(0.6, 1 - TUNE.mercy * this.tries[n]));   // (easier each retry)
    this.king = { x: KING_HOME[0] + 260, y: KING_HOME[1], hp, maxHp: hp, act: null, t: 0, hurt: 0, flash: 0,
      next: { cast: 120, whelp: 160, tail: 260, charge: 300 }, anim: 'fly', animK: 0 };
    this.shots = []; this.kshots = []; this.whelps = []; this.orbs = []; this.fx = []; this.wave = null; this.warn = null;
    this.clash = null; this.fall = null;
    endSupers(this); this.riders.forEach((r) => this.endBeam(r));
    this.stage.setStorm(n + 1);
    // the opening: the throne room's roof falls away as he rises (first phase, first try); every phase: its banner
    this.state = n === 0 && first ? 'intro' : 'banner';
    this.stateT = 0;
    this.banner = PHASE_BANNER[n];
    this.app.saveDuel?.(n);
    if (this.state === 'intro') this.player.y = 600;
  }
  restartPhase() {
    this.tries[this.phase]++; const m = this.player.meter; this.beginPhase(this.phase); this.player.meter = Math.max(m, 50);
    for (const q of this.members) q.meter = Math.max(q.meter, 50);   // (the players' meters too: a retry starts half full)
  }

  // ---------------------------------------------------------------------------------------------- input
  /** the dragon's controls: { x, y (-1..1), fire (held), firePress, roll, superP } */
  input() {
    if (typeof window !== 'undefined' && window.DUEL_BOT) return window.DUEL_BOT(this);
    const c = this.app.ctrl(this.flyCtrl), h = c.held, p = c.pressed;
    let x = (h.right ? 1 : 0) - (h.left ? 1 : 0), y = (h.down ? 1 : 0) - (h.up ? 1 : 0);
    // analog: the stick that is pushed furthest (for 'any', any controller's)
    const sticks = this.flyCtrl === 'any' ? [c.stick, ...this.app.ctrls().map((q) => q.stick)] : [c.stick];
    let best = null;
    for (const s of sticks) if (s && Math.hypot(s.x, s.y) > 0.25 && (!best || Math.hypot(s.x, s.y) > Math.hypot(best.x, best.y))) best = s;
    if (best) { x = clamp(best.x, -1, 1); y = clamp(best.y, -1, 1); }
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    return { x, y, fire: !!(h.attack || h.shoot), firePress: !!(p.attack || p.shoot), roll: !!(p.jump || p.dodge), superP: !!p.special };   // (DODGE rolls too)
  }
  /** a co-op rider's FIRE press */
  riderPressed(r) {
    if (typeof window !== 'undefined' && window.DUEL_BOT) return !!(this._botP2);
    if (!r.ctrl) return false;
    const p = this.app.ctrl(r.ctrl).pressed;
    return !!(p.attack || p.shoot);
  }
  /** a rider's / wingman's SUPER press (special: the touch SUPER button for a touch player; a test's DUEL_BOT sets
   * this._botRS) */
  superPressed(m) {
    if (typeof window !== 'undefined' && window.DUEL_BOT) return !!this._botRS;
    if (!m.ctrl) return false;
    return !!this.app.ctrl(m.ctrl).pressed.special;
  }

  // ---------------------------------------------------------------------------------------------- the tick
  update() {
    this.t++; this.stateT++;
    this.camX += this.state === 'intro' ? 0.6 : 1.7;
    const P = this.player, K = this.king;
    if (this.hintT < 600 && this.phase === 0) this.hintT++;
    this.fx = this.fx.filter((e) => ++e.t < e.life);
    if (this.state === 'intro') {
      // (the roof falls away for 100 frames while he rises out of the volcano; a press skips it)
      P.y = Math.max(280, 600 - this.stateT * 4.2); this.animate(P, 'flyLoop');
      K.x += (KING_HOME[0] - K.x) * 0.03;
      if (this.stateT === 20) audio.sfx('roar', { vol: 0.8 });
      const i = this.input();
      if (this.stateT > 120 || (this.stateT > 30 && (i.firePress || i.roll))) { this.state = 'banner'; this.stateT = 0; }
      return;
    }
    if (this.state !== 'intro') this.stepWingmen(this.state === 'fight');
    if (this.state === 'banner') {
      this.stepPlayer(true); this.stepKing(false);
      if (this.stateT > 100) { this.state = 'fight'; this.stateT = 0; }
      return;
    }
    if (this.state === 'lost') {
      if (this.stateT === 1) { endSupers(this); this.riders.forEach((r) => this.endBeam(r)); }
      this.animate(P, 'hurt'); P.y += 1.5;
      if (this.stateT > 120) this.restartPhase();
      return;
    }
    if (this.state === 'phaseEnd') {
      this.stepPlayer(true); this.stepKing(false); this.stepShots(); stepSupers(this);   // (a super under way plays out: it can't hit him now)
      if (this.stateT > 110) this.beginPhase(this.phase + 1);
      return;
    }
    if (this.state === 'clash') { this.stepClash(); return; }
    if (this.state === 'win') { this.stepWin(); return; }
    // fight
    this.stepPlayer(false);
    this.stepRiders();
    this.stepMembers();
    this.stepKing(true);
    this.stepWhelps();
    this.stepShots();
    stepSupers(this);
    this.stepOrbs();
    if (P.hearts <= 0) { this.state = 'lost'; this.stateT = 0; P.flaming = false; this.banner = "OOF! Let's try that again!"; audio.sfx('poof'); return; }
    if (K.hp <= 0) {
      this.kshots = []; this.warn = null; for (const w of this.whelps) this.killWhelp(w, false);
      if (this.phase < 2) { this.state = 'phaseEnd'; this.stateT = 0; this.banner = this.phase === 0 ? "He's getting MAD!" : 'Almost there!'; K.act = null; audio.sfx('roar'); }
      else this.startClash();
    }
  }

  animate(e, name) { if (e.anim !== name) { e.anim = name; e.animT = 0; } else e.animT++; }

  stepPlayer(calm) {
    const P = this.player, i = calm ? { x: 0, y: 0, fire: false, firePress: false, roll: false, superP: false } : this.input();
    const B = TUNE.box;
    if (P.inv > 0) P.inv--;
    if (P.rollCd > 0) P.rollCd--;
    if (P.fireCd > 0) P.fireCd--;
    if (P.roll) {
      P.roll.t++;
      P.x += P.roll.dx * TUNE.rollSpeed; P.y += P.roll.dy * TUNE.rollSpeed;
      if (P.roll.t >= TUNE.rollDur) P.roll = null;
    } else {
      const tx = i.x * TUNE.speed, ty = i.y * TUNE.speed;
      P.vx += (tx - P.vx) * TUNE.accel; P.vy += (ty - P.vy) * TUNE.accel;
      P.x += P.vx; P.y += P.vy;
      if (calm) { P.x += (220 - P.x) * 0.04; P.y += (280 - P.y) * 0.03; }
      if (i.roll && P.rollCd <= 0) {
        let dx = i.x, dy = i.y; if (!dx && !dy) dx = 1;
        const m = Math.hypot(dx, dy); P.roll = { t: 0, dx: dx / m, dy: dy / m }; P.rollCd = TUNE.rollCd + TUNE.rollDur;
        audio.sfx('wind_gust', { vol: 0.5, pitch: 1.4 });
      }
    }
    P.x = clamp(P.x, B.x0, B.x1); P.y = clamp(P.y, B.y0, B.y1);
    // fire: tap = fireballs, hold = the flame stream
    P.holdT = i.fire ? P.holdT + 1 : 0;
    P.flaming = !P.roll && P.holdT >= TUNE.holdToFlame;
    if (!P.roll && i.firePress && P.fireCd <= 0) this.fireball();
    else if (!P.roll && i.fire && !P.flaming && P.fireCd <= 0 && P.holdT > 4) this.fireball();
    if (P.flaming) { this.flameTick(); if (P.holdT % 24 === 0) this.fireball(true); }
    if (P.flaming && (this.t % 18 === 0)) audio.sfx('fire_breath', { vol: 0.35 });
    if (i.superP && P.meter >= TUNE.meterMax && !this.wave) this.superWave();
    else if (i.superP && !this.wave && P.meter < TUNE.meterMax && (this.t - (this._nrAt ?? -99)) > 40) {   // (an empty meter: said so)
      this._nrAt = this.t; this.fx.push({ k: 'text', x: P.x + 40, y: P.y - 80, t: 0, life: 44, text: 'SUPER NOT READY', col: '#ffb0a0', size: 20 }); audio.sfx('menu_back', { vol: 0.6 });
    }
    if (P.superCd > 0) P.superCd--;
    if (!calm && this.state === 'fight' && !this.wave && P.meter < TUNE.meterMax) P.meter = Math.min(TUNE.meterMax, P.meter + TUNE.meterRegen);
    // pose
    if (P.roll) this.animate(P, 'roll');
    else if (P.superCd > 30) this.animate(P, 'super');
    else if (this.hurtT > 0) this.animate(P, 'hurt');
    else if (P.flaming) this.animate(P, 'flame');
    else if (P.fireCd > 0) this.animate(P, 'fireTap');
    else this.animate(P, 'flyLoop');
    if (this.hurtT > 0) this.hurtT--;
  }
  mouth() {
    const P = this.player, DD = this.DD;
    const pose = this.dragonPose();
    const m = DD?.mouthOf ? DD.mouthOf(pose) : [60, -60, 0];
    return [P.x + m[0] * DRAGON_S, P.y + (m[1] - (DD?.BODY_Y ?? -46)) * DRAGON_S, m[2] || 0];
  }
  fireball(quiet = false) {
    const P = this.player, [mx, my] = this.mouth();
    this.shots.push({ k: 'fb', x: mx, y: my, vx: TUNE.fireSpeed, vy: P.vy * 0.15, r: 13, dmg: TUNE.fireDmg, life: 110 });
    P.fireCd = TUNE.fireCd;
    if (!quiet) audio.sfx('fireball_breath', { vol: 0.45, pitch: 1.1 + this.R() * 0.15 });
  }
  flameTick() {
    const [mx, my] = this.mouth(), L = TUNE.flameRange, dmg = TUNE.flameDps / 60;
    const inStream = (x, y, r) => x + r > mx && x - r < mx + L && Math.abs(y - my) < 26 + (x - mx) * 0.12 + r;
    const K = this.king;
    const [kx, ky] = this.kingMid();
    if (this.kingTarget() && inStream(kx, ky, 80)) { this.hitKing(dmg, this.t % 10 === 0, mx + Math.min(L, kx - 70 - mx), my); this.player.meter = Math.min(TUNE.meterMax, this.player.meter + TUNE.meterFlame); }   // (a spark where it licks him, now and then)
    for (const w of this.whelps) if (!w.dead && inStream(w.x, w.y, 24)) { w.hp -= dmg * 0.6; w.hurt = 6; if (w.hp <= 0) this.killWhelp(w, true); }
    for (const s of this.kshots) if (inStream(s.x, s.y, s.r)) { s.dead = true; this.spark(s.x, s.y, '120,255,140'); }
  }
  superWave() {
    const P = this.player;
    P.meter = 0; P.superCd = 60;
    this.wave = { x: P.x + 40, t: 0, hitKing: false };
    audio.sfx('special'); this.app.rumble?.({ ctrlId: this.flyCtrl }, 'special');
  }
  hurtPlayer() {
    const P = this.player;
    if (P.inv > 0 || (P.roll && P.roll.t < TUNE.rollIF) || this.state !== 'fight') return;
    P.hearts--; P.inv = TUNE.iframes; this.hurtT = 20; P.vx = -5;
    audio.sfx('player_hurt'); this.app.rumble?.({ ctrlId: this.flyCtrl }, 'hurt');
    this.fx.push({ k: 'ring', x: P.x, y: P.y, t: 0, life: 24 });
  }
  dragonPose() {
    const P = this.player, A = this.DD?.ANIM || {}, t = this.t / 60;
    const k = (n) => clamp(P.animT / n, 0, 1);
    switch (P.anim) {
      case 'fireTap': return A.fireTap ? A.fireTap(k(18)) : {};
      case 'flame': return A.flame ? A.flame(t) : {};
      case 'roll': return A.roll ? A.roll(P.roll ? P.roll.t / TUNE.rollDur : 1) : {};
      case 'hurt': return A.hurt ? A.hurt(k(20)) : {};
      case 'super': return A.super ? A.super(k(60)) : {};
      default: return A.flyLoop ? A.flyLoop(t) : {};
    }
  }

  // ---------------------------------------------------------------------------------------------- wingmen (P3 / P4)
  stepWingmen(fight) {
    const B = TUNE.box, bot = typeof window !== 'undefined' && window.DUEL_BOT;
    this.wingmen.forEach((m, k) => {
      m.t++; if (m.cd > 0) m.cd--; if (m.blink > 0) m.blink--; if (m.fire > 0) m.fire--;
      let x = 0, y = 0, fire = false;
      if (m.ctrl && !bot) {
        const c = this.app.ctrl(m.ctrl), h = c.held;
        x = (h.right ? 1 : 0) - (h.left ? 1 : 0); y = (h.down ? 1 : 0) - (h.up ? 1 : 0);
        if (c.stick && Math.hypot(c.stick.x, c.stick.y) > 0.25) { x = c.stick.x; y = c.stick.y; }
        fire = !!(h.attack || h.shoot || c.pressed.attack || c.pressed.shoot);
      } else {   // (no controller of its own -- a test's DUEL_BOT: it keeps station off his wing and fires at what's there)
        const tx = this.player.x - 60, ty = this.player.y + (k === 0 ? -110 : 110);
        x = clamp((tx - m.x) / 60, -1, 1); y = clamp((ty - m.y) / 60, -1, 1);
        fire = !!(this.kingTarget() || this.whelps.some((w) => !w.dead));
      }
      const n = Math.hypot(x, y); if (n > 1) { x /= n; y /= n; }
      m.vx += (x * TUNE.wingSpeed - m.vx) * 0.22; m.vy += (y * TUNE.wingSpeed - m.vy) * 0.22;
      m.x = clamp(m.x + m.vx, B.x0, B.x1); m.y = clamp(m.y + m.vy, B.y0, B.y1);
      if (!fight) return;
      if (fire && m.cd <= 0) {
        m.cd = TUNE.wingCd; m.fire = 10; m.shots = (m.shots || 0) + 1;
        this.shots.push({ k: 'fb', x: m.x + 34, y: m.y - 6, vx: 10, vy: 0, r: 8, dmg: TUNE.riderDmg, life: 90, rider: true, wing: m.slot, by: m });
        audio.sfx('fireball_breath', { vol: 0.22, pitch: 1.4 });
      }
      if (m.blink) return;                 // (can't be hurt: a green fireball or a cursed whelp just makes it blink)
      for (const q of this.kshots) if (!q.dead && dist2(q.x, q.y, m.x, m.y) < (q.r + 20) * (q.r + 20)) { q.dead = true; m.blink = TUNE.wingBlink; m.hits = (m.hits || 0) + 1; this.spark(q.x, q.y, '120,255,140'); break; }
      if (!m.blink) for (const w of this.whelps) if (!w.dead && dist2(w.x, w.y, m.x, m.y) < 44 * 44) { m.blink = TUNE.wingBlink; m.hits = (m.hits || 0) + 1; break; }
    });
  }
  drawWingmen(ctx) {
    const WH = CHARS.whelp, A = WH?.ANIM || {};
    for (const m of this.wingmen) {
      if (m.blink > 0 && (m.blink >> 2) % 2) continue;
      ctx.save(); ctx.translate(m.x, m.y + 20 * WING_S);
      { const tm = ctx.getTransform(); ctx.shadowColor = PLAYER_COLS[m.slot] || '#fff'; ctx.shadowBlur = 9 * Math.hypot(tm.a, tm.b); }   // (their player's colour)
      const pose = m.fire > 0 && A.allyBreath ? A.allyBreath(0.25 + 0.5 * (1 - m.fire / 10)) : A.allyHover ? A.allyHover(m.t / 60) : A.hover ? A.hover(m.t / 60) : {};
      WH?.draw(ctx, pose, { facing: 1, t: m.t / 60, scale: WING_S, mem: m.mem, vel: VEL0 });
      ctx.restore();
      const nearP = Math.hypot(m.x - this.player.x, m.y - this.player.y) < 160;   // (lifted clear of the dragon when close)
      this.drawTag(ctx, m.slot, m.x, m.y - (nearP ? 96 : 62));   // (whose: a P# tag over it, as over a hero)
    }
    if (this.heroes.length > 2) {             // (three / four: the dragon's player and the riders' get theirs too)
      const P = this.player;
      this.drawTag(ctx, this.flyer, P.x + 80, P.y - 74);   // (over his head, clear of the riders' tags)
      this.riders.forEach((r, i) => { if (r.ctrl && r.slot !== undefined) { const [sx, sy] = this.seat(i); this.drawTag(ctx, r.slot, sx + 24 * (i ? -1 : 1), sy - 74); } });
    }
  }
  drawTag(ctx, slot, x, y) {
    const col = PLAYER_COLS[slot] || '#fff';
    ctx.save(); ctx.font = 'bold 22px "Luckiest Guy", "Comic Neue", sans-serif'; ctx.textAlign = 'center';
    ctx.lineWidth = 5; ctx.strokeStyle = '#1a1020'; ctx.strokeText('P' + (slot + 1), x, y); ctx.fillStyle = col; ctx.fillText('P' + (slot + 1), x, y);
    ctx.beginPath(); ctx.moveTo(x - 7, y + 5); ctx.lineTo(x + 7, y + 5); ctx.lineTo(x, y + 13); ctx.closePath(); ctx.lineWidth = 3; ctx.stroke(); ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------- riders
  stepRiders() {
    this.riders.forEach((r, i) => {
      if (r.cd > 0) r.cd--;
      if (r.anim > 0) r.anim--;
      if (r.beam && ++r.beam.t > r.beam.until) this.endBeam(r, true);
      if (r.away) return;                      // (Shadow, off on his strike)
      const want = r.ctrl ? this.riderPressed(r) : r.cd <= 0 && (this.kingTarget() || this.whelps.some((w) => !w.dead));
      if (!want || r.cd > 0) return;
      r.cd = r.ctrl ? (TUNE.riderCd[r.hero] || 60) : TUNE.riderAuto;
      r.anim = 12;
      const [sx, sy] = this.seat(i);
      const auto = !r.ctrl, d = TUNE.riderDmg * (auto ? 0.6 : 1), by = r.meter !== undefined ? r : null;   // (by: whose meter its hits feed)
      if (r.hero === 'ana') this.beamOn(r, d);
      else if (r.hero === 'shadow') { for (const a of [-0.12, 0, 0.12]) this.shots.push({ k: 'shur', x: sx + 8, y: sy - 16, vx: 12 * Math.cos(a), vy: 12 * Math.sin(a), r: 9, dmg: d * 0.8, life: 80, rider: true, by }); audio.sfx('shuriken', { vol: 0.4 }); }
      else if (r.hero === 'scarlet') { this.shots.push({ k: 'hook', x: sx + 8, y: sy - 16, vx: 14, vy: 0, r: 11, dmg: d * 1.6, life: 30, rider: true, ox: sx, by }); audio.sfx('throw', { vol: 0.4 }); }
      else { this.shots.push({ k: 'fb', x: sx + 10, y: sy - 18, vx: 10, vy: 0, r: 10, dmg: d, life: 100, rider: true, by }); audio.sfx('fireball_breath', { vol: 0.3 }); }
    });
  }
  /** Anastasia's crystal beam: a press starts it -- one soft sound for the whole beam -- and a press while it's on keeps
   * it on (beamLife frames past the last); it ticks every beamEvery frames (stepShots) */
  beamOn(r, d) {
    if (r.beam) { r.beam.until = r.beam.t + TUNE.beamLife; return; }
    r.beam = { t: 0, until: TUNE.beamLife, dmg: TUNE.beamTick * d, x: 0, y: 0, hitX: null, hitT: -99 };
    r.beamSnd = audio.sfx('crystal_beam', { hold: true, vol: r.ctrl ? 0.7 : 0.5 });
  }
  /** the beam goes out: its sound fades; a beam that was on him (or a whelp) at its last tick ends with a little ting */
  endBeam(r, natural = false) {
    if (!r.beam) return;
    if (natural && r.beam.t - r.beam.hitT <= TUNE.beamEvery) audio.sfx('crystal_ting', { vol: r.ctrl ? 0.7 : 0.5 });
    r.beamSnd?.stop?.(0.3); r.beamSnd = null; r.beam = null;
  }
  /** the players' supers: a full meter and SUPER (src/duelsupers.js); the meters creep up by themselves in the fight */
  stepMembers() {
    const bot = typeof window !== 'undefined' && window.DUEL_BOT;
    for (const m of this.members) {
      const on = superOn(this, m);
      if (!on && m.meter < TUNE.meterMax) m.meter = Math.min(TUNE.meterMax, m.meter + TUNE.meterRegen);
      if (m.away || !this.superPressed(m)) continue;
      if (m.meter >= TUNE.meterMax && !on) fireSuper(this, m);
      else if (!on && !bot && (this.t - (m.nrAt ?? -99)) > 40) {   // (an empty meter: said so, by them)
        m.nrAt = this.t; const [x, y] = memberAt(this, m);
        this.fx.push({ k: 'text', x: clamp(x + 30, 110, W - 110), y: Math.max(110, y - 50), t: 0, life: 44, text: 'SUPER NOT READY', col: '#ffb0a0', size: 18 });
        audio.sfx('menu_back', { vol: 0.5 });
      }
    }
  }
  /** a player's hit: their meter (TUNE.meterHit per 2 damage for the flyer; a member as fast for what it deals) */
  feed(m, dmg) { m.meter = Math.min(TUNE.meterMax, m.meter + dmg * (TUNE.meterHit / TUNE.fireDmg) * (m.mk || 1)); }
  /** where rider i sits on screen (feet) */
  seat(i) {
    const P = this.player, DD = this.DD, pose = this.dragonPose();
    const s = DD?.seatOf ? DD.seatOf(pose, i) : (DD?.SEATS?.[i] || [-20, -90]);
    return [P.x + s[0] * DRAGON_S, P.y + (s[1] - (DD?.BODY_Y ?? -46)) * DRAGON_S];
  }

  // ---------------------------------------------------------------------------------------------- the Dread King
  kingTarget() { return this.state === 'fight' && this.king.hp > 0 && this.king.x < W + 40; }
  /** his hit circle on screen (the shots', the beam's and the supers' target) */
  kingCircle() { const [kx, ky] = this.kingMid(); return { x: kx + KING_HIT.dx, y: ky + KING_HIT.dy, r: KING_HIT.r }; }
  hitKing(dmg, spark = true, x, y, flash = 6) {
    const K = this.king;
    K.hp -= dmg; K.flash = Math.max(K.flash, flash);   // (flash: a beam's tick flickers him -- 3 frames of 6)
    if (spark) { const [kx, ky] = this.kingMid(); this.spark(x ?? kx - 40, y ?? ky, '255,200,90'); K.hurt = 12; }
  }
  stepKing(active) {
    const K = this.king, T = this.t, n = this.phase;
    K.t++; if (K.flash > 0) K.flash--; if (K.hurt > 0) K.hurt--;
    if (!K.act) {
      // drift about his home, bobbing; the next attack when its timer runs out
      const hx = KING_HOME[0] + Math.sin(K.t / 140) * 40, hy = KING_HOME[1] + Math.sin(K.t / 90) * 80;
      K.x += (hx - K.x) * 0.03; K.y += (hy - K.y) * 0.03;
      K.anim = 'fly';
      if (!active) return;
      for (const k of Object.keys(K.next)) K.next[k]--;
      if (n >= 2 && K.next.charge <= 0) { K.act = { k: 'charge', t: 0, y: clamp(this.player.y, this.chargeMinY(), 440) }; K.next.charge = TUNE.chargeEvery; this.warn = { kind: 'line', y: K.act.y, t: 0, life: TUNE.chargeWarn }; audio.sfx('charge', { vol: 0.6 }); }
      else if (n >= 1 && K.next.tail <= 0) { this.startTail(); K.next.tail = TUNE.tailEvery; }
      else if (K.next.cast <= 0) { K.act = { k: 'cast', t: 0 }; K.next.cast = TUNE.castEvery[n]; }
      if (TUNE.whelpEvery[n] && K.next.whelp <= 0) { this.spawnWhelps(TUNE.whelpWave[n]); K.next.whelp = TUNE.whelpEvery[n]; }
      return;
    }
    const A = K.act; A.t++;
    if (A.k === 'cast') {
      // castWind 40 f (the crown flares), then cast 24 f: the spread leaves at k .3
      if (A.t <= 40) { K.anim = 'castWind'; K.animK = A.t / 40; if (A.t === 1) audio.sfx('beam_charge', { vol: 0.35, pitch: 1.3 }); }
      else { K.anim = 'cast'; K.animK = (A.t - 40) / 24; if (A.t === 40 + 7) this.castSpread(); }
      if (A.t >= 64) K.act = null;
    } else if (A.k === 'tail') {
      // he swoops in to his strike spot while the stretch flashes (the spade raised behind him), then lashes the tail
      // down and out: the tip's path this frame (from the atlas' tailTip) is what hits
      K.x += (A.tx - K.x) * 0.06; K.y += (A.ty - K.y) * 0.06;
      if (A.t <= TUNE.laneWarn) { K.anim = 'tailWind'; K.animK = A.t / TUNE.laneWarn; }
      else {
        K.anim = 'tail'; K.animK = (A.t - TUNE.laneWarn) / TUNE.tailDur;
        if (A.t === TUNE.laneWarn + 1) audio.sfx('swing_heavy', { vol: 0.8, pitch: 0.7 });
        const u = A.t - TUNE.laneWarn, tip = this.tailTip();
        if (!tip) { if (u > 5 && u < 22 && Math.abs(this.player.y - LANES[A.lane]) < LANE_H / 2 - 6) this.hurtPlayer(); }   // (the rig)
        else {
          const a = A.trail.length ? A.trail[A.trail.length - 1] : tip;
          if (u > 1 && segDist(this.player.x, this.player.y, a[0], a[1], tip[0], tip[1]) < TAIL_HIT) this.hurtPlayer();
          A.trail.push(tip); if (A.trail.length > 6) A.trail.shift();
        }
        if (u >= TUNE.tailDur) { K.act = null; this.warn = null; }
      }
    } else if (A.k === 'charge') {
      // draws back while the line warns, then crosses the screen at that height and comes round again from the right
      if (A.t <= TUNE.chargeWarn) { K.anim = 'chargeWind'; K.animK = A.t / TUNE.chargeWarn; K.y += (A.y - this.chargeDy() - K.y) * 0.08; K.x += (KING_HOME[0] + 60 - K.x) * 0.05; }
      else {
        K.anim = 'charge';
        if (A.t === TUNE.chargeWarn + 1) { audio.sfx('roar', { vol: 0.7 }); this.warn = null; }
        if (!A.back) {
          K.x -= TUNE.chargeSpeed;
          const [kx, ky] = this.kingMid();
          if (dist2(kx - 40, ky, this.player.x, this.player.y) < 80 * 80) this.hurtPlayer();
          if (K.x < -260) { A.back = true; K.x = W + 260; K.y = KING_HOME[1]; }
        } else { K.anim = 'fly'; K.x += (KING_HOME[0] - K.x) * 0.06; if (Math.abs(K.x - KING_HOME[0]) < 8) { K.act = null; } }
      }
    }
    if (this.warn) { this.warn.t++; }
  }
  /** the tail tip on screen for his current pose (the atlas' tailTip landmark), or null without one */
  tailTip() {
    const DK = this.DK, q = DK?.tailTipOf ? DK.tailTipOf(this.kingPose()) : null;
    if (!q) return null;
    const K = this.king, by = DK.BODY_Y ?? -190;
    return [K.x - q[0] * KING_S, K.y + (q[1] - by) * KING_S];
  }
  /** where the tail sweep reaches, off his anchor (screen px, facing left): the tailTip over the tail clip's drawings
   * where it is down below his hips (the lash itself, not the curl it starts from), { x0, x1, y0, y1 } -- read from
   * the atlas once; null without a tailTip (the placeholder rig: the old lane sweep) */
  tailReach() {
    if (this._tailReach !== undefined) return this._tailReach;
    const DK = this.DK, by = DK?.BODY_Y ?? -190, R = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    for (let i = 0; i <= 40 && DK?.tailTipOf && DK.ANIM?.tail; i++) {
      const p = DK.ANIM.tail(i / 40), q = DK.tailTipOf(p), hip = DK.point3d ? DK.point3d(p, 'hips') : null;
      if (!q || (hip && q[1] < hip[1])) continue;
      const x = -q[0] * KING_S, y = (q[1] - by) * KING_S;
      R.x0 = Math.min(R.x0, x); R.x1 = Math.max(R.x1, x); R.y0 = Math.min(R.y0, y); R.y1 = Math.max(R.y1, y);
    }
    return (this._tailReach = R.x0 < Infinity ? R : null);
  }
  /** how far his crown's top rises above his anchor over a clip's drawings (screen px; the atlas' crownUp / crown) */
  crownRise(clip) {
    const C = this._crownRise || (this._crownRise = {});
    if (C[clip] !== undefined) return C[clip];
    const DK = this.DK, f = DK?.ANIM?.[clip], by = DK?.BODY_Y ?? -190;
    let top = 0;
    for (let i = 0; i <= 40 && f && DK.point3d; i++) {
      const p = typeof f === 'function' ? f(i / 40) : f, u = DK.point3d(p, 'crownUp'), c = DK.point3d(p, 'crown');
      for (const q of [u, c]) if (q) top = Math.min(top, (q[1] - by) * KING_S);
    }
    return (C[clip] = top);
  }
  /** the tail lash: the hero's lane; he swoops to where the tip's farthest reach comes 20 px short of the hero's middle
   * (inside the tip's hit reach, his body kept as far off the dragon as the short tail allows), the sweep's band centred
   * on the lane -- but never so high that his crown leaves the screen (24 px under the HUD over the wind-up and the
   * lash): on the top lane the lash comes in lower, short of the lane, and the stripe and the hit go with it.  The
   * warning marks the stretch the tip will sweep from where he strikes */
  startTail() {
    const lane = this.pickLane(), ly = LANES[lane], P = this.player, R = this.tailReach() || { x0: -92, x1: 40, y0: 100, y1: 150 };
    const yMin = HUD_BOTTOM + CROWN_MARGIN - Math.min(this.crownRise('tailWind'), this.crownRise('tail'));
    const tx = clamp(P.x + 20 - R.x0, TUNE.box.x0 + 20 - R.x0, KING_HOME[0] + 30), ty = Math.max(yMin, ly - (R.y0 + R.y1) / 2);
    this.king.act = { k: 'tail', t: 0, lane, tx, ty, trail: [] };
    this.warn = { kind: 'lane', y: ty + (R.y0 + R.y1) / 2, x0: tx + R.x0 - TAIL_HIT, x1: tx + R.x1 + TAIL_HIT, h: R.y1 - R.y0 + 2 * TAIL_HIT, t: 0, life: TUNE.laneWarn };
    audio.sfx('charge', { vol: 0.45, pitch: 0.8 });
  }
  pickLane() {
    // the lane the dragon is in (so he has to move), never the same twice running
    let lane = LANES.reduce((b, y, i) => (Math.abs(this.player.y - y) < Math.abs(this.player.y - LANES[b]) ? i : b), 0);
    if (lane === this.lastLane && this.R() < 0.6) lane = (lane + 1 + Math.floor(this.R() * 2)) % 3;
    this.lastLane = lane;
    return lane;
  }
  castSpread() {
    const K = this.king, n = TUNE.spreadN[this.phase], arc = TUNE.spreadArc;
    const hand = this.DK?.castHandOf ? this.DK.castHandOf(this.kingPose()) : [80, -200];
    const sx = K.x - hand[0] * KING_S, sy = K.y + (hand[1] - (this.DK?.BODY_Y ?? -190)) * KING_S;
    const aim = Math.atan2(this.player.y - sy, this.player.x - sx);
    for (let i = 0; i < n; i++) {
      const a = aim + (i / (n - 1) - 0.5) * arc;
      this.kshots.push({ x: sx, y: sy, vx: Math.cos(a) * TUNE.fbSpeed, vy: Math.sin(a) * TUNE.fbSpeed, r: 13, t: 0 });
    }
    audio.sfx('fireball_breath', { vol: 0.6, pitch: 0.7 });
  }
  /** the King's middle on screen for a pose (default: his current one): the hit circles centre on it */
  kingMid(pose = this.kingPose()) {
    const K = this.king, DK = this.DK, by = DK?.BODY_Y ?? -190;
    const b = DK?.bodyOf ? DK.bodyOf(pose) : [0, by];
    return [K.x - b[0] * KING_S, K.y + (b[1] - by) * KING_S];
  }
  /** how far below his anchor the charge drawing's middle runs (so it crosses on the warning line) */
  /** the highest charge line: his crown's top (crownRise, the atlas) stays at y >= 24 through the wind-up and the
   * charge (~178 with the painted King).  A hero on the top lane is still in reach: his charge drawing and its hit
   * circle span ~80 px above the line */
  chargeMinY() {
    return Math.max(110, CHARGE_CROWN_MIN - Math.min(this.crownRise('chargeWind'), this.crownRise('charge')) + this.chargeDy());
  }
  chargeDy() {
    const DK = this.DK, by = DK?.BODY_Y ?? -190;
    if (this._chargeDy === undefined) this._chargeDy = DK?.bodyOf && DK.ANIM?.charge ? (DK.bodyOf(DK.ANIM.charge(0))[1] - by) * KING_S : 0;
    return this._chargeDy;
  }
  kingPose() {
    const K = this.king, A = this.DK?.ANIM || {}, t = this.t / 60;
    const f = A[K.anim];
    if (!f) return A.fly ? A.fly(t) : {};
    return ['fly', 'charge', 'beam'].includes(K.anim) ? f(t) : f(clamp(K.animK || 0, 0, 1));
  }

  // ---------------------------------------------------------------------------------------------- whelps, orbs, shots
  spawnWhelps(n) {
    for (let i = 0; i < n; i++) {
      const y = 110 + this.R() * 320;
      this.whelps.push({ x: W + 60 + i * 90, y, by: y, t: Math.floor(this.R() * 100), hp: TUNE.whelpHp, vx: -(1.6 + this.R() * 0.8), amp: 30 + this.R() * 40, hurt: 0, mem: {} });
    }
    audio.sfx('whelp_chirp', { vol: 0.5 });
  }
  /** a whelp down; drop: one of ours got it (by: the rider / wingman whose meter it feeds, else the flyer's) */
  killWhelp(w, drop, by = null, feed = true) {   // (feed false: a rider's / wingman's super -- its kills don't refill it)
    if (w.dead) return;
    w.dead = true; w.deadT = 0;
    this.fx.push({ k: 'poof', x: w.x, y: w.y, t: 0, life: 26 });
    if (drop) {
      if (!feed) { /* (no meter) */ } else if (by && by.meter !== undefined) by.meter = Math.min(TUNE.meterMax, by.meter + TUNE.meterWhelp);
      else this.player.meter = Math.min(TUNE.meterMax, this.player.meter + TUNE.meterWhelp);
      // (easy: an orb more often when he's low)
      const chance = this.player.hearts <= 3 ? 0.9 : TUNE.orbChance;
      if (this.R() < chance) this.orbs.push({ x: w.x, y: w.y, t: 0 });
      audio.sfx('freed', { vol: 0.5 });
    }
  }
  stepWhelps() {
    for (const w of this.whelps) {
      if (w.dead) { w.deadT++; continue; }
      w.t++; if (w.hurt > 0) w.hurt--;
      w.x += w.vx; w.y = w.by + Math.sin(w.t / 26) * w.amp;
      if (dist2(w.x, w.y, this.player.x, this.player.y) < 50 * 50) this.hurtPlayer();
      if (w.x < -80) w.dead = true;
    }
    this.whelps = this.whelps.filter((w) => !w.dead || w.deadT < 30);
  }
  stepOrbs() {
    const P = this.player;
    for (const o of this.orbs) {
      o.t++; o.x -= 1.2; o.y += Math.sin(o.t / 14) * 0.6;
      // (a little pull toward the dragon once he's close: kids grab them easily)
      if (dist2(o.x, o.y, P.x, P.y) < 120 * 120) { o.x += (P.x - o.x) * 0.06; o.y += (P.y - o.y) * 0.06; }
      if (dist2(o.x, o.y, P.x, P.y) < 46 * 46) { o.got = true; P.hearts = Math.min(TUNE.hearts, P.hearts + 1); audio.sfx('pickup_life'); this.fx.push({ k: 'text', x: o.x, y: o.y - 20, t: 0, life: 50, text: '+1' }); }
    }
    this.orbs = this.orbs.filter((o) => !o.got && o.x > -40 && o.t < 900);
  }
  stepShots() {
    const K = this.king, [kx, ky] = this.kingMid();
    for (const s of this.shots) {
      s.x += s.vx; s.y += s.vy; s.life--;
      if (s.k === 'hook' && s.life <= 0) { s.dead = true; continue; }
      if (s.life <= 0 || s.x > W + 40) { s.dead = true; continue; }
      if (this.kingTarget() && dist2(s.x, s.y, kx + KING_HIT.dx, ky + KING_HIT.dy) < (s.r + KING_HIT.r) * (s.r + KING_HIT.r)) {
        s.dead = true; this.hitKing(s.dmg, true, s.x, s.y);
        if (s.by) this.feed(s.by, s.dmg);      // (a player's rider / wingman: their own meter)
        else this.player.meter = Math.min(TUNE.meterMax, this.player.meter + (s.rider ? TUNE.meterRider : TUNE.meterHit));
        audio.sfx(s.k === 'shur' ? 'shuriken_hit' : 'fireball_hit', { vol: 0.4 });
        continue;
      }
      for (const w of this.whelps) if (!w.dead && dist2(s.x, s.y, w.x, w.y) < (s.r + 24) * (s.r + 24)) {
        s.dead = true; w.hp -= s.k === 'hook' ? 99 : 1; w.hurt = 10;
        if (w.hp <= 0) this.killWhelp(w, true, s.by); else audio.sfx('hit_light', { vol: 0.4 });
        break;
      }
      // fireballs pop the King's green fireballs (easy: you can shoot your way out)
      if (!s.dead && s.k === 'fb') for (const q of this.kshots) if (!q.dead && dist2(s.x, s.y, q.x, q.y) < (s.r + q.r) * (s.r + q.r)) { q.dead = true; s.dead = true; this.spark(q.x, q.y, '120,255,140'); break; }
    }
    // Anastasia's beam (a rider's): the line ahead of her seat, ticking -- where it meets him: a spark, a flicker, and it
    // stops there (drawShots)
    const KC = this.kingCircle();
    this.riders.forEach((r, i) => {
      if (!r.beam) return;
      const [sx, sy] = this.seat(i), B = r.beam; B.x = sx + 10; B.y = sy - 18;
      const dy = Math.abs(KC.y - B.y), on = this.kingTarget() && dy < KC.r + 6 && KC.x > B.x;
      B.hitX = on ? Math.max(B.x + 20, KC.x - Math.sqrt(Math.max(0, KC.r * KC.r - dy * dy)) + 14) : null;   // (a little into the circle: on his face, not in front of it)
      if (this.state !== 'fight' || B.t % TUNE.beamEvery !== 1) return;
      const by = r.meter !== undefined ? r : null;
      if (on) {
        B.hitT = B.t;
        this.hitKing(B.dmg, true, B.hitX + 6, B.y, 3);
        if (by) this.feed(by, B.dmg); else this.player.meter = Math.min(TUNE.meterMax, this.player.meter + TUNE.meterRider * 0.5);
      }
      for (const w of this.whelps) if (!w.dead && Math.abs(w.y - B.y) < 26 && w.x > B.x && (B.hitX === null || w.x < B.hitX + 30)) {
        B.hitT = B.t; w.hp -= B.dmg * 2; w.hurt = 6; if (w.hp <= 0) this.killWhelp(w, true, by);
      }
    });
    for (const q of this.kshots) {
      q.t++; q.x += q.vx; q.y += q.vy;
      if (q.x < -30 || q.y < -30 || q.y > H + 30) q.dead = true;
      if (!q.dead && dist2(q.x, q.y, this.player.x, this.player.y) < (q.r + 30) * (q.r + 30)) { q.dead = true; this.hurtPlayer(); }
    }
    // the super's flame wave: sweeps the screen, burns every whelp and fireball, hits the King once
    if (this.wave) {
      const Wv = this.wave; Wv.t++; Wv.x += 14;
      for (const w of this.whelps) if (!w.dead && w.x < Wv.x + 40 && w.x > Wv.x - 120) this.killWhelp(w, true);
      for (const q of this.kshots) if (q.x < Wv.x + 40) q.dead = true;
      if (!Wv.hitKing && this.kingTarget() && Wv.x > kx - 90) { Wv.hitKing = true; this.hitKing(TUNE.superDmg, true, kx - 40, ky); audio.sfx('explosion', { vol: 0.7 }); }
      if (Wv.x > W + 200) this.wave = null;
    }
    this.shots = this.shots.filter((s) => !s.dead);
    this.kshots = this.kshots.filter((q) => !q.dead);
  }
  spark(x, y, rgb) { this.fx.push({ k: 'spark', x, y, t: 0, life: 16, rgb }); }

  // ---------------------------------------------------------------------------------------------- the breath clash
  startClash() {
    this.state = 'clash'; this.stateT = 0; this.banner = 'BREATH CLASH! Mash FIRE!';
    this.clash = { m: TUNE.clashStart, presses: 0 };
    this.shots = []; this.kshots = []; this.whelps = []; this.warn = null; this.king.act = null;
    endSupers(this); this.riders.forEach((r) => this.endBeam(r));
    this.player.flaming = false; this.player.holdT = 0;     // (a stream held into the clash lingered on through the win)
    audio.sfx('roar');
  }
  stepClash() {
    const P = this.player, K = this.king, C = this.clash;
    // both fly to their marks, then the beams meet
    P.x += (230 - P.x) * 0.08; P.y += (290 - P.y) * 0.08; K.x += (KING_HOME[0] - K.x) * 0.08; K.y += (290 - K.y) * 0.08;
    K.anim = 'beam'; this.animate(P, 'flame'); K.t++;
    if (this.stateT < 70) return;
    const i = this.input();
    C.m -= TUNE.clashKing;
    if (i.fire) C.m += TUNE.clashHold;
    if (i.firePress) { C.m += TUNE.clashMash; C.presses++; }
    for (const r of this.riders) if (r.ctrl && (this.riderPressed(r) || this.superPressed(r))) C.m += TUNE.clashMash * 0.5; else C.m += TUNE.clashRider;
    C.m = Math.max(TUNE.clashFloor, C.m);
    if (this.t % 20 === 0) audio.sfx('fire_breath', { vol: 0.4 });
    if (C.m >= 1) {
      this.state = 'win'; this.stateT = 0; this.banner = 'YOU DID IT!';
      this.fall = { t: 0 }; audio.sfx('explosion'); audio.jingle('freed_big');   // (a jingle, not an sfx: it was 'unknown sfx')
      this.app.rumble?.({ ctrlId: this.flyCtrl }, 'special');
    }
  }
  stepWin() {
    const K = this.king, P = this.player;
    this.fall.t++;
    K.anim = 'fall'; K.animK = Math.min(1, this.fall.t / 120); K.y += 0.6;
    P.x += (300 - P.x) * 0.03; P.y += (270 - P.y) * 0.03; this.animate(P, 'flyLoop');
    if (this.fall.t > 170) this.won = true;
  }

  // ---------------------------------------------------------------------------------------------- drawing
  draw(ctx) {
    const t = this.t / 60, P = this.player, K = this.king;
    this.stage.drawBack(ctx, this.camX, t);
    // lane / line warnings, behind everything
    if (this.warn) {
      const Wn = this.warn, blink = (Math.floor(Wn.t / 8) % 2) === 0;
      ctx.save();
      if (Wn.kind === 'lane') {
        const x0 = Wn.x0 ?? -4, x1 = Wn.x1 ?? W + 4, h = Wn.h ?? LANE_H, r = Math.min(24, h / 2);
        const box = () => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x0, Wn.y - h / 2, x1 - x0, h, r) : ctx.rect(x0, Wn.y - h / 2, x1 - x0, h); };
        ctx.fillStyle = `rgba(110,255,130,${blink ? 0.24 : 0.11})`; box(); ctx.fill();
        ctx.strokeStyle = 'rgba(170,255,170,0.85)'; ctx.lineWidth = 3; ctx.setLineDash([18, 12]); box(); ctx.stroke(); ctx.setLineDash([]);
        const xs = Wn.x0 === undefined ? [120, 480, 840] : [clamp((x0 + x1) / 2, 30, W - 30)];
        for (const x of xs) this.warnSign(ctx, x, Wn.y, blink);
      } else {
        ctx.strokeStyle = `rgba(160,255,160,${blink ? 0.9 : 0.45})`; ctx.lineWidth = 6; ctx.setLineDash([24, 14]);
        ctx.beginPath(); ctx.moveTo(0, Wn.y); ctx.lineTo(W, Wn.y); ctx.stroke(); ctx.setLineDash([]);
        for (const x of [160, 480]) this.warnSign(ctx, x, Wn.y - 40, blink);
      }
      ctx.restore();
    }
    drawSupersBack(ctx, this);                 // (the Pirate Queen's galleon, sailing behind him)
    // the Dread King, and his tail lash's stripe and swipe arc
    this.drawKing(ctx, t);
    this.drawTail(ctx, t);
    // whelps (cursed), orbs
    const WH = CHARS.whelp;
    for (const w of this.whelps) {
      ctx.save();
      if (w.dead) ctx.globalAlpha = Math.max(0, 1 - w.deadT / 20);
      ctx.translate(w.x, w.y + 20 * WHELP_S);
      if (!w.dead) { const m = ctx.getTransform(); ctx.shadowColor = 'rgba(120,255,140,0.75)'; ctx.shadowBlur = 2 * Math.hypot(m.a, m.b); }   // (cursed: a faint green rim)
      const pose = w.hurt > 0 && WH?.ANIM?.hurt ? WH.ANIM.hurt(1 - w.hurt / 10) : WH?.ANIM?.hover ? WH.ANIM.hover(w.t / 60) : {};
      WH?.draw(ctx, pose, { facing: -1, t: w.t / 60, scale: WHELP_S, cursed: true, mem: w.mem, vel: VEL0 });
      ctx.restore();
    }
    for (const o of this.orbs) this.drawOrb(ctx, o, t);
    // the King's green fireballs
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const q of this.kshots) {
      const g = ctx.createRadialGradient(q.x, q.y, 2, q.x, q.y, q.r * 2.2);
      g.addColorStop(0, 'rgba(230,255,220,1)'); g.addColorStop(0.35, 'rgba(110,255,130,0.9)'); g.addColorStop(1, 'rgba(40,200,70,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, q.r * 2.2, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // a thin dark-purple ring on the green fireballs (they must read against the storm and its lavender lightning)
    ctx.save(); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(42,18,58,0.95)';
    for (const q of this.kshots) { ctx.beginPath(); ctx.arc(q.x, q.y, q.r * 0.8, 0, TAU); ctx.stroke(); }
    ctx.restore();
    // the dragon's fire: fireballs, the flame stream, the riders' shots, the super wave
    this.drawShots(ctx, t);
    if (P.flaming && this.state !== 'clash') { const [mx, my, ma] = this.mouth(), L = TUNE.flameRange; this.drawStream(ctx, mx, my, mx + L * Math.cos(ma), my + L * Math.sin(ma) + P.vy * 6, t, '255,140,40', '255,240,170', 22); }
    if (this.wave) this.drawWave(ctx, this.wave, t);
    drawSupersFront(ctx, this);                // (the riders' and the wingmen's supers)
    // the breath clash
    if (this.state === 'clash' && this.stateT >= 40) this.drawClash(ctx, t);
    // Dragon Dodongo and his riders
    this.drawWingmen(ctx);
    this.drawDragon(ctx, t);
    this.stage.drawFront(ctx, this.camX, t);
    if (this.state === 'intro') this.stage.drawRoof(ctx, Math.min(1, this.stateT / 100), t);
    // effects
    for (const e of this.fx) this.drawFx(ctx, e);
    // lightning flashes the whole frame a little
    const fl = this.stage.flashOf(t);
    if (fl > 0.05) { ctx.fillStyle = `rgba(222,214,255,${0.08 * fl})`; ctx.fillRect(0, 0, W, H); }
    this.drawHud(ctx, t);
  }
  /** the touch buttons' cluster (#pads) on the canvas, in game px { x0, y0, x1, y1 }, or null where it isn't showing */
  touchPads() {
    if (typeof document === 'undefined' || !document.body.classList.contains('touch')) return null;
    const el = document.getElementById('pads'), cv = this.app.canvas;
    if (!el || !cv || getComputedStyle(el).display === 'none') return null;
    const r = el.getBoundingClientRect(), c = cv.getBoundingClientRect();
    if (!r.width || !c.width) return null;
    const k = W / c.width;
    return { x0: (r.left - c.left) * k, y0: (r.top - c.top) * k, x1: (r.right - c.left) * k, y1: (r.bottom - c.top) * k };
  }
  warnSign(ctx, x, y, on) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = on ? '#ffe066' : '#b8f5a8'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(22, 18); ctx.lineTo(-22, 18); ctx.closePath(); ctx.fill(); ctx.stroke();
    HUD.outlined(ctx, '!', 0, 14, 26, INK, 'Bangers, sans-serif', 0, 'center');
    ctx.restore();
  }
  drawKing(ctx, t) {
    const K = this.king, DK = this.DK;
    if (!DK || K.x > W + 300 || K.x < -400) return;
    const A = K.act, ct = A && A.k === 'charge' && !A.back ? A.t - TUNE.chargeWarn : -1;   // (frames into the charge)
    if (ct >= 0) this.chargeLines(ctx, ct);
    const pose = this.kingPose(), o = { facing: -1, t, scale: KING_S, mem: this.mem.king, vel: VEL0 };
    ctx.save();
    ctx.translate(K.x, K.y - (DK.BODY_Y ?? -190) * KING_S);
    if (K.flash > 0) ctx.filter = 'brightness(1.6)';
    DK.draw(ctx, pose, o);
    ctx.filter = 'none';
    if (ct >= 0 && ct < 10) {                                  // the charge: a white flash as he lunges
      ctx.save(); ctx.globalAlpha = 0.9 * (1 - ct / 10); ctx.filter = 'brightness(0) invert(1)';
      DK.draw(ctx, pose, o); ctx.restore();
    }
    ctx.restore();
  }
  /** speed lines trailing the charge (behind him: he crosses right to left) */
  chargeLines(ctx, ct) {
    const [mx, my] = this.kingMid(), e = Math.min(1, ct / 4);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const y = my + (i - 3) * 26 + Math.sin(i * 2.3) * 6, x0 = mx + 70 + ((i * 53) % 40), L = (110 + ((i * 71) % 90)) * e;
      ctx.strokeStyle = `rgba(232,224,255,${(0.55 - Math.abs(i - 3) * 0.08) * e})`; ctx.lineWidth = 3.4 - Math.abs(i - 3) * 0.5;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + L, y); ctx.stroke();
    }
    ctx.restore();
  }
  drawTail(ctx, t) {
    // (the tail is his own, in the drawing: on the lash, the swept stretch flashes as the tip reaches its farthest -- the
    //  tail k ~.35 -- and a swipe arc trails the tip along its path, from the atlas' tailTip)
    const K = this.king, A = K.act;
    if (!A || A.k !== 'tail' || A.t <= TUNE.laneWarn || !A.trail || A.trail.length < 2) return;
    const u = (A.t - TUNE.laneWarn) / TUNE.tailDur;
    const e = Math.max(0, 1 - Math.abs(u - 0.35) / 0.3);
    if (e <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const Wn = this.warn, f = Math.max(0, 1 - Math.abs(u - 0.35) / 0.14);
    if (Wn && f > 0) {
      const x0 = Wn.x0 ?? 0, x1 = Wn.x1 ?? W, h = Wn.h ?? LANE_H;
      const sg = ctx.createLinearGradient(0, Wn.y - h / 2, 0, Wn.y + h / 2);
      sg.addColorStop(0, 'rgba(220,255,225,0)'); sg.addColorStop(0.5, `rgba(235,255,235,${0.34 * f})`); sg.addColorStop(1, 'rgba(220,255,225,0)');
      ctx.fillStyle = sg; ctx.fillRect(x0, Wn.y - h / 2, x1 - x0, h);
    }
    // the swipe arc: a crescent along the tip's last few positions, thick at the tip
    const T = A.trail, n = T.length, top = [], bot = [];
    for (let i = n - 1; i >= 0; i--) {
      const [px, py] = T[i], [qx, qy] = T[Math.max(0, i - 1)], [rx, ry] = T[Math.min(n - 1, i + 1)];
      let dx = rx - qx, dy = ry - qy; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      const w = 20 * e * Math.pow(i / (n - 1), 1.3);
      top.push([px - dy * w * 0.4, py + dx * w * 0.4]); bot.push([px + dy * w, py - dx * w]);
    }
    const [hx, hy] = T[n - 1], [ox, oy] = T[0];
    const sw = ctx.createLinearGradient(hx, hy, ox, oy);
    sw.addColorStop(0, `rgba(255,252,240,${0.9 * e})`); sw.addColorStop(0.5, `rgba(205,190,255,${0.55 * e})`); sw.addColorStop(1, 'rgba(160,140,255,0)');
    ctx.fillStyle = sw; ctx.beginPath();
    top.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  drawDragon(ctx, t) {
    const P = this.player, DD = this.DD;
    if (!DD) return;
    const blink = P.inv > 0 && Math.floor(P.inv / 5) % 2 === 0;
    ctx.save();
    if (blink) ctx.globalAlpha = 0.45;
    const pose = this.dragonPose();
    // riders sit on him, drawn after him (the near wing's upstroke hid a back-seat rider drawn before him); they turn
    // with their seat where it tilts (a rear-back, a flinch) and hide where his back turns away (mid-roll) -- DD.seatPose
    const drawRider = (i) => {
      const r = this.riders[i]; if (!r || r.away) return;   // (away: Shadow, off on his strike -- src/duelsupers.js draws him)
      const art = CHARS[r.hero]; if (!art?.ANIM) return;
      const sp = DD.seatPose ? DD.seatPose(pose, i) : { tilt: 0, vis: 1 };
      if (sp.vis <= 0.01) return;
      const [sx, sy] = this.seat(i);
      const f = art.ANIM.sit; const rp = typeof f === 'function' ? f(t + i) : (f || (typeof art.ANIM.idle === 'function' ? art.ANIM.idle(t) : {}));
      ctx.save(); ctx.translate(sx, sy + (r.anim > 0 ? -2 : 0));
      if (sp.tilt) ctx.rotate(sp.tilt);
      ctx.globalAlpha *= sp.vis;
      const m = ctx.getTransform();                            // (shadowBlur is in device px)
      ctx.shadowColor = RIDER_RIM; ctx.shadowBlur = 1.5 * Math.hypot(m.a, m.b); ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      art.draw(ctx, rp, { facing: 1, t: t + i, scale: RIDER_S, mem: this.mem.riders[i], vel: VEL0 });
      ctx.restore();
    };
    const by = DD.BODY_Y ?? -46, o = { facing: 1, t, scale: DRAGON_S, mem: this.mem.dragon, vel: { x: P.vx, y: P.vy, z: 0 } };
    if (P.anim === 'roll' && P.roll && DD.ROLL_SMEAR) {        // the roll's smear, round the drawing that's upside down
      const k = P.roll.t / TUNE.rollDur, [k0, k1] = DD.ROLL_SMEAR;
      if (k >= k0 && k < k1) this.drawRollSmear(ctx, t, k, Math.min(1, (k1 - k) / (k1 - k0) * 2));
    }
    ctx.save(); ctx.translate(P.x, P.y - by * DRAGON_S);
    DD.draw(ctx, pose, o);
    if (P.anim === 'hurt' && P.animT < 8) {                    // the hit: a white flash
      ctx.save(); ctx.globalAlpha *= 0.85 * (1 - P.animT / 8); ctx.filter = 'brightness(0) invert(1)';
      DD.draw(ctx, pose, o); ctx.restore();
    }
    ctx.restore();
    this.dragonGlow(ctx, pose);
    drawRider(1); drawRider(0);
    ctx.restore();
  }
  /** the dragon's 2D lights at his landmarks: the super's gold charge at his chest (it gathers over the rear-back, k
   * 0-.4, and bursts out), an ember at his mouth over the fireTap's wind-up */
  dragonGlow(ctx, pose) {
    const P = this.player, DD = this.DD, by = DD.BODY_Y ?? -46;
    const at = (lm) => { const q = DD.point3d ? DD.point3d(pose, lm) : null; return q ? [P.x + q[0] * DRAGON_S, P.y + (q[1] - by) * DRAGON_S] : null; };
    let c = null, r = 0, a = 0, rgb = '';
    if (P.anim === 'super') {
      const k = P.animT / 60, g = k < 0.4 ? k / 0.4 : Math.max(0, 1 - (k - 0.4) / 0.12);
      c = at('chest') || at('body'); r = 26 + 44 * g; a = 0.85 * g; rgb = '255,214,110';
    } else if (P.anim === 'fireTap') {
      const k = P.animT / 18, g = Math.max(0, 1 - k / 0.35);
      c = at('mouth'); r = 22; a = 0.9 * g; rgb = '255,150,60';
    }
    if (!c || a <= 0.02) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createRadialGradient(c[0], c[1], 1, c[0], c[1], r);
    gr.addColorStop(0, `rgba(255,248,215,${a})`); gr.addColorStop(0.35, `rgba(${rgb},${0.75 * a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, TAU); ctx.fill();
    ctx.restore();
  }
  /** the roll's smear (DD.ROLL_SMEAR: round the upside-down drawing): two afterimages trailing along the roll, speed
   * lines behind him */
  drawRollSmear(ctx, t, k, e) {
    const P = this.player, DD = this.DD, R = P.roll, by = DD.BODY_Y ?? -46, ux = R.dx, uy = R.dy;
    for (const [back, a] of [[4, 0.16], [2, 0.3]]) {
      ctx.save(); ctx.globalAlpha *= a * e;
      ctx.translate(P.x - ux * back * TUNE.rollSpeed, P.y - uy * back * TUNE.rollSpeed - by * DRAGON_S);
      DD.draw(ctx, DD.ANIM.roll(Math.max(0, k - back / TUNE.rollDur)), { facing: 1, t, scale: DRAGON_S, mem: {}, vel: VEL0 });
      ctx.restore();
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const off = (i - 2) * 17, L = (60 + ((i * 37) % 50)) * e, x0 = P.x - ux * 46 - uy * off, y0 = P.y - uy * 46 + ux * off;
      ctx.strokeStyle = `rgba(255,236,205,${(0.6 - Math.abs(i - 2) * 0.12) * e})`; ctx.lineWidth = 3.2 - Math.abs(i - 2) * 0.7;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 - ux * L, y0 - uy * L); ctx.stroke();
    }
    ctx.restore();
  }
  drawShots(ctx, t) {
    ctx.save();
    for (const s of this.shots) {
      if (s.k === 'fb') {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, s.r * 2);
        g.addColorStop(0, 'rgba(255,250,200,1)'); g.addColorStop(0.4, 'rgba(255,160,50,0.95)'); g.addColorStop(1, 'rgba(255,90,20,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 2, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,140,40,0.5)'; ctx.beginPath(); ctx.ellipse(s.x - 14, s.y, 16, 6, 0, 0, TAU); ctx.fill();
        ctx.restore();
      } else if (s.k === 'shur') {
        const sh = CHARS.shadow;
        ctx.save(); ctx.translate(s.x, s.y);
        if (sh?.drawShuriken) sh.drawShuriken(ctx, t);
        else { ctx.fillStyle = '#c8c8d8'; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * TAU / 8, r = i % 2 ? 4 : 10; i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(r, 0); } ctx.closePath(); ctx.fill(); ctx.stroke(); }
        ctx.restore();
      } else if (s.k === 'hook') {
        ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(s.ox, s.y); ctx.lineTo(s.x, s.y); ctx.stroke();
        ctx.fillStyle = '#c8c8d8'; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x, s.y, 7, -1.2, 2.4); ctx.stroke();
      }
    }
    // Anastasia's crystal beam: to his side where it meets him (a crystal flare there), else off the screen
    this.riders.forEach((r) => {
      const B = r.beam; if (!B) return;
      const a = clamp(Math.min(B.t / 4, (B.until - B.t) / 8), 0, 1), x1 = B.hitX ?? W + 20;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (const [w, col] of [[18, `rgba(90,200,255,${0.35 * a})`], [8, `rgba(160,230,255,${0.8 * a})`], [3, `rgba(245,252,255,${a})`]]) {
        ctx.lineWidth = w; ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(B.x, B.y); ctx.lineTo(x1, B.y); ctx.stroke();
      }
      if (B.hitX !== null) {
        const rr = 15 + Math.sin(this.t * 0.9) * 3;
        const g = ctx.createRadialGradient(x1, B.y, 1, x1, B.y, rr * 1.8);
        g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.4, `rgba(150,225,255,${0.8 * a})`); g.addColorStop(1, 'rgba(90,200,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x1, B.y, rr * 1.8, 0, TAU); ctx.fill();
      }
      ctx.restore();
    });
    ctx.restore();
  }
  drawStream(ctx, x0, y0, x1, y1, t, rgb, core, w) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const [k, col, a] of [[1, rgb, 0.35], [0.55, rgb, 0.7], [0.2, core, 1]]) {
      ctx.lineWidth = w * k * 2; ctx.strokeStyle = `rgba(${col},${a})`; ctx.beginPath();
      for (let i = 0; i <= 16; i++) {
        const u = i / 16, wob = Math.sin(u * 9 - t * 18) * w * 0.35 * (0.4 + u);
        const x = x0 + dx * u + nx * wob, y = y0 + dy * u + ny * wob;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  drawWave(ctx, Wv, t) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(Wv.x - 160, 0, Wv.x + 40, 0);
    // (a band of fire, see-through: at most ~0.45 over the King -- the old wall washed him out white for half a second)
    g.addColorStop(0, 'rgba(255,90,20,0)'); g.addColorStop(0.6, 'rgba(255,140,40,0.3)'); g.addColorStop(1, 'rgba(255,200,110,0.45)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(Wv.x - 160, 0);
    for (let y = 0; y <= H; y += 30) ctx.lineTo(Wv.x + 30 + Math.sin(y * 0.05 + t * 14) * 18, y);
    ctx.lineTo(Wv.x - 160, H); ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = 'rgba(255,214,120,0.75)'; ctx.lineWidth = 3; ctx.beginPath();   // (its leading edge: a flame line)
    for (let y = 0; y <= H; y += 30) { const x = Wv.x + 30 + Math.sin(y * 0.05 + t * 14) * 18; if (y) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.stroke();
    ctx.restore();
  }
  drawClash(ctx, t) {
    const C = this.clash, [ax, ay] = this.mouth(), K = this.king, DK = this.DK;
    const km = DK?.mouthOf ? DK.mouthOf(this.kingPose()) : [80, -230];
    const bx = K.x - km[0] * KING_S, by = K.y + (km[1] - (DK?.BODY_Y ?? -190)) * KING_S;
    const mx = ax + (bx - ax) * C.m, my = ay + (by - ay) * C.m;
    this.drawStream(ctx, ax, ay, mx, my, t, '255,140,40', '255,245,190', 22);
    this.drawStream(ctx, bx, by, mx, my, t + 1, '70,255,110', '230,255,230', 22);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(mx, my, 4, mx, my, 120);
    g.addColorStop(0, 'rgba(255,255,230,0.95)'); g.addColorStop(0.3, 'rgba(255,220,140,0.5)'); g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mx, my, 120 + Math.sin(t * 25) * 8, 0, TAU); ctx.fill();
    ctx.restore();
  }
  drawOrb(ctx, o, t) {
    const y = o.y + Math.sin(t * 4 + o.x) * 3;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(o.x, y, 2, o.x, y, 34);
    g.addColorStop(0, 'rgba(255,200,210,0.9)'); g.addColorStop(1, 'rgba(255,90,120,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, y, 34, 0, TAU); ctx.fill();
    ctx.restore();
    heart(ctx, o.x, y, 13, '#ff4d6d');
  }
  drawFx(ctx, e) {
    const u = e.t / e.life;
    if (e.draw) { e.draw(ctx, e, u); return; }   // (the supers' flashes, names, slashes and bursts: src/duelsupers.js)
    if (e.k === 'spark') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(${e.rgb},${1 - u})`;   // (round sparks flying out -- the squares read as noise on him)
      for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + e.x, q = u * 30 * (0.5 + 0.5 * (((i * 37 + (e.y | 0)) % 10) / 10)); ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * q, e.y + Math.sin(a) * q, 2.8 * (1 - u) + 1, 0, TAU); ctx.fill(); }
      ctx.restore();
    } else if (e.k === 'poof') {
      ctx.save(); ctx.fillStyle = `rgba(150,140,170,${0.7 * (1 - u)})`;
      for (let i = 0; i < 6; i++) { const a = i * TAU / 6; ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * u * 34, e.y + Math.sin(a) * u * 24, 14 * (1 - u * 0.5), 0, TAU); ctx.fill(); }
      ctx.restore();
    } else if (e.k === 'ring') {
      ctx.save(); ctx.strokeStyle = `rgba(255,120,120,${1 - u})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(e.x, e.y, 30 + u * 50, 0, TAU); ctx.stroke(); ctx.restore();
    } else if (e.k === 'text') {
      HUD.outlined(ctx, e.text, e.x, e.y - u * 30, e.size || 26, e.col || '#ff8fa3', 'Bangers, sans-serif', 0.24, 'center');
    }
  }

  // ---------------------------------------------------------------------------------------------- HUD
  drawHud(ctx, t) {
    const P = this.player, K = this.king, FONT = 'Bangers, Impact, sans-serif', TITLE = '"Luckiest Guy", Bangers, sans-serif';
    const band = ctx.createLinearGradient(0, 0, 0, 90); band.addColorStop(0, 'rgba(14,8,22,0.55)'); band.addColorStop(1, 'rgba(14,8,22,0)');
    ctx.fillStyle = band; ctx.fillRect(0, 0, W, 90);
    // hearts + the super meter
    for (let i = 0; i < TUNE.hearts; i++) heart(ctx, 30 + i * 34, 30, 13, i < P.hearts ? '#ff4d6d' : 'rgba(60,40,60,0.8)');
    const full = P.meter >= TUNE.meterMax;
    ctx.fillStyle = 'rgba(20,12,24,0.8)'; ctx.fillRect(16, 52, 200, 14);
    ctx.fillStyle = full ? (Math.floor(t * 6) % 2 ? '#fff1a6' : '#ffb03a') : '#ff8a2a'; ctx.fillRect(18, 54, 196 * Math.min(1, P.meter / TUNE.meterMax), 10);
    ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.strokeRect(16, 52, 200, 14);
    const sg = this.app.lastCtrl === 'touch' ? 'SUPER' : this.app.glyphText('special', this.flyCtrl);
    const st = full ? (this.app.lastCtrl === 'touch' ? 'SUPER! tap SUPER' : `SUPER! press ${sg}`) : 'SUPER';
    ctx.save(); ctx.font = `16px ${FONT}`; const sw = ctx.measureText(st).width; ctx.restore();
    HUD.outlined(ctx, st, 224, 64, sw > 96 ? Math.max(12, 16 * 96 / sw) : 16, full ? '#fff1a6' : '#ffd9a0', FONT, 0.24, 'left');   // (kept clear of the King's bar)
    // the Dread King's bar: this phase's health, three pips for the phases
    if (this.state !== 'intro' && this.state !== 'win') {
      HUD.outlined(ctx, 'THE DREAD KING', W / 2, 28, 22, '#9dff8a', FONT, 0.24, 'center');
      const w = 300, x = W / 2 - w / 2;
      ctx.fillStyle = 'rgba(20,12,24,0.8)'; ctx.fillRect(x - 2, 36, w + 4, 18);
      if (K._shown === undefined || this._shownPhase !== this.phase) { K._shown = K.hp; this._shownPhase = this.phase; }
      K._shown += (Math.max(0, K.hp) - K._shown) * 0.1;
      ctx.fillStyle = '#ffe066'; ctx.fillRect(x, 38, w * Math.max(0, K._shown) / K.maxHp, 14);
      ctx.fillStyle = '#5ad35f'; ctx.fillRect(x, 38, w * Math.max(0, K.hp) / K.maxHp, 14);
      ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.strokeRect(x - 2, 36, w + 4, 18);
      for (let i = 0; i < 3; i++) {
        const done = i < this.phase || (this.phase === 2 && ['clash', 'win'].includes(this.state));
        ctx.fillStyle = done ? '#333' : i === this.phase ? '#5ad35f' : '#2c6a30';
        ctx.beginPath(); ctx.arc(x + w + 24 + i * 22, 45, 8, 0, TAU); ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
      }
    }
    // the riders and the wingmen: who's aboard / alongside, their FIRE -- and a player's own SUPER meter by their name
    // (full: "[button] SUPER!", flashing)
    const onTouch = (id) => id === 'touch' || (id === 'any' && this.app.lastCtrl === 'touch');   // (touch: the buttons' own words)
    const rows = [];
    const row = (name, m, col) => {
      const full = m && m.meter >= TUNE.meterMax, id = m && m.ctrl;
      const label = name + (!id ? '' : onTouch(id) ? (full ? '  TAP SUPER!' : '  TAP FIRE') : full ? `  [${this.app.glyphText('special', id)}] SUPER!` : `  [${this.app.glyphText('attack', id)}] FIRE`);
      rows.push({ label, m, c: full ? (Math.floor(t * 4) % 2 ? '#fff1a6' : '#ffd23a') : col });
    };
    this.riders.forEach((r) => {
      const nm = r.hero === 'ana' ? 'ANASTASIA' : r.hero.toUpperCase(), mine = r.meter !== undefined;
      if (mine) row(`P${r.slot + 1} ${nm}`, r, PLAYER_COLS[r.slot] || '#fff1d6');
      else row(`${nm} (RIDING ALONG)`, null, r.cd > 0 ? '#cbb8e0' : '#e8dcc8');   // (the companion: shoots by itself, no super)
    });
    this.wingmen.forEach((m) => row(`P${m.slot + 1} WINGMAN`, m, PLAYER_COLS[m.slot] || '#fff1d6'));   // (P3 / P4: their wingman whelps)
    ctx.save(); ctx.font = `16px ${FONT}`; const tw = Math.max(0, ...rows.filter((q) => q.m).map((q) => ctx.measureText(q.label).width)); ctx.restore();
    rows.forEach((q, k) => {                     // (the bars in one column, left of the widest label)
      const y = 80 + k * 24;
      HUD.outlined(ctx, q.label, W - 20, y, 16, q.c, FONT, 0.24, 'right');
      if (q.m && q.m.meter !== undefined) {
        drawMeter(ctx, q.m, W - 20 - tw - 10, y - 1, t);
        HUD.outlined(ctx, 'SUPER', W - 20 - tw - 10 - 64 - 8, y, 12, '#ffd9a0', FONT, 0.24, 'right');   // (whose bar it is: the super's)
      }
    });
    // the clash meter
    if (this.state === 'clash' && this.stateT >= 70) {
      const C = this.clash, w = 420, x = W / 2 - w / 2, y = H - 70;
      ctx.fillStyle = '#2c9a3c'; ctx.fillRect(x, y, w, 20);
      ctx.fillStyle = '#ff8a2a'; ctx.fillRect(x, y, w * C.m, 20);
      ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeRect(x, y, w, 20);
      if (Math.floor(t * 5) % 2) HUD.outlined(ctx, `MASH ${this.app.lastCtrl === 'touch' ? 'FIRE' : this.app.glyphText('attack', this.flyCtrl)}!`, W / 2, y - 12, 30, '#ffe066', TITLE, 0.15, 'center');
    }
    // banners
    if (['banner', 'phaseEnd', 'lost', 'win', 'clash'].includes(this.state) && this.stateT < 150) {
      const a = clamp(Math.min(this.stateT / 12, (150 - this.stateT) / 20), 0, 1);
      ctx.save(); ctx.globalAlpha = a;
      HUD.outlined(ctx, this.banner, W / 2, 150, this.state === 'lost' ? 34 : 38, this.state === 'lost' ? '#ffb3c0' : '#ffe066', TITLE, 0.15, 'center');
      ctx.restore();
    }
    // the controls, early in the first phase
    if (this.phase === 0 && this.state === 'fight' && this.hintT < 600) {
      const id = this.flyCtrl, touch = this.app.lastCtrl === 'touch' && (id === 'any' || id === 'touch');
      const G = (a) => (touch ? { attack: 'FIRE', jump: 'ROLL', special: 'SUPER' }[a] : this.app.glyphText(a, id));
      const txt = touch ? 'Tap FIRE for fireballs, hold it for FLAME!   ROLL dodges   SUPER when the bar is full'
        : `${G('attack')} fireball (hold: FLAME!)   ${G('jump')} roll   ${G('special')} super`;
      ctx.save(); ctx.globalAlpha = clamp((600 - this.hintT) / 40, 0, 1);
      ctx.font = 'bold 18px "Comic Neue", "Comic Sans MS", sans-serif';
      // (on a touch screen the box keeps clear of the button cluster, whatever the screen's shape: one line slid left of
      //  it, else two lines there, else raised above it)
      const P0 = touch ? this.touchPads() : null, pads = P0 && P0.y0 < H - 14 && P0.y1 > H - 84 ? P0 : null;   // (only where it reaches the hint's band)
      const lo = 16, hi = pads ? Math.min(W - 16, pads.x0 - 12) : W - 16;
      let lines = [txt], tw = ctx.measureText(txt).width + 30;
      if (tw > hi - lo && touch) { lines = txt.split(/\s{3}(?=ROLL)/); tw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 30; }
      const bh = 12 + 22 * lines.length;
      let by = H - 18 - bh, cx = clamp(W / 2, lo + tw / 2, Math.max(lo + tw / 2, hi - tw / 2));
      if (pads && cx + tw / 2 > pads.x0 - 4 && by + bh > pads.y0 - 4) { cx = W / 2; by = Math.max(70, pads.y0 - 10 - bh); }
      this._hintBox = { x: cx - tw / 2, y: by, w: tw, h: bh };   // (tests: where it went)
      ctx.fillStyle = '#ffe58a'; ctx.fillRect(cx - tw / 2, by, tw, bh); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeRect(cx - tw / 2, by, tw, bh);
      ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      lines.forEach((l, i) => ctx.fillText(l, cx, by + 17 + 22 * i));
      ctx.restore();
    }
  }
}

function heart(ctx, x, y, r, fill) {
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.moveTo(0, r * 0.9);
  ctx.bezierCurveTo(-r * 1.6, -r * 0.1, -r * 0.8, -r * 1.3, 0, -r * 0.45);
  ctx.bezierCurveTo(r * 0.8, -r * 1.3, r * 1.6, -r * 0.1, 0, r * 0.9);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(-r * 0.45, -r * 0.35, r * 0.22, r * 0.14, -0.6, 0, TAU); ctx.fill();
  ctx.restore();
}
