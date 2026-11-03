// Skull Island's bonus: THE STORM SEA RIDE (docs/SKULL_ISLAND.md "Phase 4", the book's chapters 3 and 4): after the Kraken, an optional ride through Malachar's storm.  The
// Scarlet Dawn sails on by itself with the friendly KRAKEN swimming alongside; every player has a cannon and a SIGHT to steer: shoot the purple STORM-BATS and the
// LIGHTNING ORBS before they reach the ship while the kraken smashes the big waves.  Popping things fills the KRAKEN SMASH bar; a full bar and anyone's SPECIAL
// (or, after a while, the kraken's own impatience) is a great slam that clears the sea.  About 90 s, and it can't be failed: a bat that gets through only bonks
// the ship, an orb that gets through is a flash and a shake -- the storm just breaks a little slower.  On the sky-duel engine's skeleton (src/skyduel.js SkyDuel:
// the app's duel hooks -- the pause menu, the touch pads, the controller handling; src/dawn.js is the model), with its own scene: src/stages/sistorm.js (sky and
// sea), src/galleon.js (the ship, `dawn: true`), the kraken's head from src/stages/sikraken.js.  Test hooks: window.STORM_BOT(ride) -> one input per crew member
// ({ x, y (-1..1), fire, special }); DQ.duel is the ride.
//   Controls: stick / arrows move your SIGHT; ATTACK fires (hold it to keep firing); SPECIAL = KRAKEN SMASH when the bar is full.
//   Co-op: up to four sights, one cannon each (P1 gold, P2 blue, P3 green, P4 pink); with fewer players Scarlet and the other friends man the rest of the guns
//   and fire by themselves (a little slower).
import { SkyDuel } from './skyduel.js';
import { useArt } from './sprite3d.js';
import { CHARS, loadSIChars } from './chars.js';
import { audio } from './audio-proxy.js';
import * as SIFX from './sifx.js';   // (the rain sheet: the FX agent's src/sifx.js)
import * as HUD from './hud.js';
import { W, H, INK, PLAYER_COLS } from './config.js';
import { clamp, TAU } from './rig.js';
import { swell, SEA_Y, WL, drawDawnShip, drawBigWave } from './stages/sistorm.js';
import { drawKraken, drawKrakenArm } from './stages/sikraken.js';

export const RIDE_T = 90 * 60;             // the ride: ninety seconds of storm
const SHIP_X = 250, SHIP_S = 0.64;          // the Scarlet Dawn's place and size (the galleon is ~400 px long at 1)
const KRAKEN_X = 600;                       // the kraken's place, off the bow
const KEY_SANS = '"Segoe UI", system-ui, -apple-system, Roboto, sans-serif', KEYC = '"Comic Neue", "Comic Sans MS", sans-serif';   // (the select screen's keycap faces: src/hud.js)
const SIGHT_SPEED = 8.2, FIRE_CD = 17, AUTO_CD = 132, SNAP = 80, BALL_R = 56;   // the sight's speed, a cannon's cooldown (held ATTACK), a helper's, a burst's radius
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;   // (no full-screen flash, no shake at all)
const FLASH_GAP = 96, FLASH_A = 0.2;     // (at most one flash every 1.6 s, ramped in over 3 frames, never more than 20 % of a wash)
const FONT = 'Bangers, Impact, sans-serif', TITLE = '"Luckiest Guy", Bangers, sans-serif';
const PORTS = [-96, -50, -4, 42];           // the four cannons: local x on the hull, ship-scale units
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const rngf = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };

export class StormRide extends SkyDuel {
  /** opts: as SkyDuel's (heroes, forms, ctrls, players) + stage (src/stages/sistorm.js) */
  constructor(app, opts = {}) {
    super(app, { ...opts, phase: 0 });
    this.storm = true; this.dawn = false;
    // the crew: each player's cannon (their hero, their controller), then Scarlet and the friends manning the free guns (they fire by themselves)
    const heroes = (opts.heroes && opts.heroes.length ? opts.heroes : ['dodongo']).slice(0, 4), ctrls = opts.ctrls || [];
    this.crew = heroes.map((h, i) => ({ hero: h, slot: i, ctrl: ctrls[i] || 'any', port: i, human: true, x: 470 + i * 110, y: 190 + (i % 2) * 90, vx: 0, vy: 0, cd: 10 + i * 6, meterFlash: 0, recoil: 0, fireT: 0 }));
    const helpers = ['scarlet', 'ana', 'shadow', 'dodongo'].filter((h) => !heroes.includes(h));
    while (this.crew.length < (heroes.length === 3 ? 4 : 3) && helpers.length) {   // (1P and 2P: three guns; 3P: Scarlet mans the fourth)
      const h = helpers.shift(); this.crew.push({ hero: h, slot: this.crew.length, ctrl: null, port: this.crew.length, human: false, x: 600, y: 240, vx: 0, vy: 0, cd: 60 + this.crew.length * 20, recoil: 0, fireT: 0 });
    }
    this.members = this.crew.filter((c) => c.human);
    this.onWon = () => { try { this.stage?.release?.(); } catch (e) { console.warn(e); } app.stormDone?.(); };   // (the cloud sheets back to iOS: main.js clears its duel before this runs)
  }
  async load() {
    const set = new Set([...this.crew.map((c) => c.hero + ':scene'), 'kraken_head', 'kraken_arm', 'storm_bat@boss']);   // (storm_bat: painter 1's painted storm bats, AA QA A5; @boss: its 2x tier at DPR 2, stepping down with the boss rung)   // (kraken_head: its collarless gold-eyed 'freedBare' for the friendly kraken, when the pack has it)
    try { await loadSIChars(); } catch (e) { console.warn('storm ride chars', e); }   // (the head's module: a direct ?storm start never loaded the quest's)
    try { await useArt(set); } catch (e) { console.warn('storm ride art', e); }
    audio.music('sistorm');
  }

  // ---------------------------------------------------------------------------------------------- the ride
  /** (SkyDuel's constructor calls this) */
  beginPhase() {
    this.phase = 0;
    this.R = rngf(4242);
    this.bats = []; this.orbs = []; this.waves = []; this.balls = []; this.fx = []; this.puffs = [];
    this.rideT = 0; this.popped = 0; this.orbsPopped = 0; this.smashes = 0; this.leaked = 0; this.flash = 0; this.flashMax = 0; this.flashUp = 0; this.flashAtT = -999; this.zaps = 0; this.leakPen = 0; this.firstOrb = false; this.firstWave = false; this.bolt = null; this.shake = 0; this.hint = 0; this.lines = 0; this.sayQ = []; this.readyT = 0;
    this.clearK = 0; this.meter = 0; this.meterFullT = 0;
    this.kr = { arm: 0, armX: 0, slam: 0, super: 0, bob: 0, cheer: 0 };   // (arm: the slam's 0..1, armX where; super: the great slam's 0..1)
    this.state = 'intro'; this.stateT = 0;
    this.banner = 'THE STORM SEA!';
    this.mem = this.mem || { riders: [{}, {}], dragon: {}, king: {} };
    this.crewMem = {};
    this.stage.setStorm?.(0); this.stage.setIsland?.(0.12);
  }
  restartPhase() { /* (it can't be lost) */ }
  /** how far the storm has broken, 0..1: the clock's share, and what the crew has popped (a leak sets it back a little) */
  get progress() { return clamp(this.rideT / RIDE_T, 0, 1); }

  // ---------------------------------------------------------------------------------------------- input
  /** one input per crew member: { x, y (-1..1), fire (held), special (pressed) }; a test sets window.STORM_BOT */
  crewInput(c) {
    if (typeof window !== 'undefined' && window.STORM_BOT) { const all = window.STORM_BOT(this); return all?.[c.slot] || { x: 0, y: 0, fire: false, special: false }; }
    if (!c.human) return { x: 0, y: 0, fire: false, special: false };
    const k = this.app.ctrl(c.ctrl), h = k.held, p = k.pressed;
    let x = (h.right ? 1 : 0) - (h.left ? 1 : 0), y = (h.down ? 1 : 0) - (h.up ? 1 : 0);
    const sticks = c.ctrl === 'any' ? [k.stick, ...this.app.ctrls().map((q) => q.stick)] : [k.stick];
    let best = null;
    for (const s of sticks) if (s && Math.hypot(s.x, s.y) > 0.25 && (!best || Math.hypot(s.x, s.y) > Math.hypot(best.x, best.y))) best = s;
    if (best) { x = clamp(best.x, -1, 1); y = clamp(best.y, -1, 1); }
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    return { x, y, fire: !!(h.attack || h.shoot), special: !!(p.special || p.jump || p.dodge) };   // (the touch DODGE / JUMP pads are not dead here: they are the KRAKEN SMASH too)
  }

  // ---------------------------------------------------------------------------------------------- the tick
  update() {
    this.t++; this.stateT++;
    if (!this._batsWarm && this.state === 'intro' && this.stateT > 2) this._batsWarm = this.warmBats();   // (the painted bats' atlas decoded before the first one flies in)
    if (this.hint < 900) this.hint++;
    const T = this.t / 60;
    // the sky's lightning: a flash every few seconds while the storm lasts (never into the dawn), a fork now and then; every flash goes through triggerFlash
    if (this.flashUp > 0) { this.flash = Math.min(this.flashMax, this.flash + this.flashMax / 3); this.flashUp--; } else this.flash = Math.max(0, this.flash - 0.05);
    if (this.t % 190 === 100 + ((this.t / 190 | 0) * 37 % 60) && this.progress < 0.6 && this.state === 'ride') this.triggerFlash(1, 120 + this.R() * 700, true);
    this.shake = Math.max(0, this.shake - 0.6);
    this.fx = this.fx.filter((e) => ++e.t < e.life);
    if (this.sayQ && this.sayQ.length && !this.fx.some((e) => e.tag)) this.say(this.sayQ.shift());
    this.puffs = this.puffs.filter((e) => ++e.t < e.life);
    if (this.state === 'intro') { if (this.stateT > 100) { this.state = 'ride'; this.stateT = 0; this.say('Malachar\'s storm!\nMan the cannons!'); } this.stepCrew(false); this.stepKraken(); this.sync(); return; }
    if (this.state === 'home') { if (this.stateT === 1 && !this.zaps) { this.app.run.score = (this.app.run.score || 0) + 2000; } this.stepKraken(); this.stepBalls(); this.stepCrew(false); this.sync(); if (this.stateT > 230) this.won = true; return; }
    this.rideT++;
    this.stepSpawn();
    this.stepCrew(true);
    this.stepBalls();
    this.stepFoes();
    this.stepWaves();
    this.stepKraken();
    if (this.meter < 100 && this.t - (this.noSmashAt || -999) > 90 && this.crew.some((c) => c.human && this.crewInput(c).special)) { this.noSmashAt = this.t; audio.sfx('block', { vol: 0.3, pitch: 1.5 }); this.fx.push({ k: 'text', x: 130, y: 96, t: 0, life: 50, text: 'Not full yet!', col: '#c8f0d8', size: 20 }); }
    // the kraken smash: a full bar and a press (any player), or its own patience
    if (this.meter >= 100) {
      this.meterFullT++;
      const press = this.crew.some((c) => c.human && this.crewInput(c).special), crowd = this.bats.filter((b) => !b.dead && !b.fled && b.x < W).length + this.orbs.filter((o) => !o.dead).length;
      if (press || (this.meterFullT > 60 * 5 && crowd >= 3) || this.meterFullT > 60 * 12) { if (!press) this.say('The kraken is\nimpatient!'); this.superSmash(); }
    }
    // the storm breaks with time and with every pop; a leak sets it back a little
    this.leakPen = Math.max(0, this.leakPen - 0.00008);   // (a leak sets the dawn back; it comes back slowly)
    this.clearK = clamp(this.clearK + (Math.max(0, this.progress * 0.9 - this.leakPen) - this.clearK) * 0.01, 0, 1);
    const lines = [[0.05, 'Pop the BATS!\nAim at them!', 'bat'], [0.4, 'Great shooting, crew!', 'g'], [0.62, "We're through the\nworst of it!", 'm'], [0.88, 'The storm is breaking!\nSkull Island ahead!', 'e']];
    this._said = this._said || {};
    for (const [at, txt, id] of lines) if (this.progress >= at && !this._said[id]) { this._said[id] = 1; this.say(txt); }
    if (this.orbSayAt && this.rideT === this.orbSayAt) this.say('A LIGHTNING ORB!\nPop it before it ZAPs us!');
    if (this.rideT >= RIDE_T) {
      this.state = 'home'; this.stateT = 0; this.banner = 'THE STORM BROKE!'; audio.jingle('freed_big');
      this.fx = this.fx.filter((e) => e.k !== 'text'); this.sayQ = [];   // (no words, no Scarlet line left over the banner)
      for (const b of this.balls) this.fx.push({ k: 'spark', x: b.x1, y: b.y1, t: 0, life: 14 }); this.balls = [];
      let gone = 0; for (const f of [...this.bats, ...this.orbs]) if (!f.dead && f.x < W + 20) { gone++; this.fx.push({ k: 'spark', x: f.x, y: f.y, t: 0, life: 22, big: !!f.hp }); }   // (the dawn melts what is left of the storm: nothing hangs in the sky behind the banner)
      this.bats = []; this.orbs = []; this.waves = this.waves.filter((w) => w.x > W);
      if (gone) audio.sfx('poof', { vol: 0.35, pitch: 1.3 });
      if (!this.leaked) this.app.run.score = (this.app.run.score || 0) + 1000;   // (no BONK and no ZAP at all)
      this.sync();
    }
    this.sync();
  }
  /** a lightning flash: at most one per FLASH_GAP frames (the scheduled sky, a ZZAP and the great slam share the gap), ramped in over 3 frames; a reduced-motion player gets the bolt's line only */
  triggerFlash(k, boltX = null, thunder = false) {
    if (boltX !== null) this.bolt = boltX;
    if (this.t - this.flashAtT < FLASH_GAP) return false;
    this.flashAtT = this.t; this.flashMax = REDUCED ? 0 : k; this.flashUp = 3;
    if (thunder) audio.sfx('lightning', { vol: 0.28, pitch: 0.8 });
    return true;
  }
  /** hand the stage what it draws */
  sync() {
    const st = this.stage, k = this.state === 'home' ? clamp(this.clearK + (1 - this.clearK) * clamp(this.stateT / 45, 0, 1), 0, 1) : clamp(this.clearK, 0, 1);   // (the dawn eases to full over ~0.75 s at the banner: no one-frame jump)
    const boltOn = this.flashAtT >= 0 && this.t - this.flashAtT < 14 && this.bolt !== null; st.setStorm?.(k); st.setFlash?.(boltOn ? 0.9 * (1 - (this.t - this.flashAtT) / 14) : 0); st.setGlow?.(this.flash || 0); st.setBolt?.(boltOn ? this.bolt : null);   // (setGlow: the clouds' belly light follows the ride's ramped, reduced-motion-safe flash, not the raw bolt; setBolt: the fork at the ride's own bolt x, not the offer card's last)
    st.setIsland?.(0.12 + 0.88 * this.progress);   // (the stage draws the bolt's line only: the wash is the ride's)
  }
  /** a line of Scarlet's over the ship */
  say(text) {
    // one line at a time: a second one waits (the first is cut short, never under a few seconds), at most two wait
    const cur = this.fx.find((e) => e.tag);
    if (cur) { this.sayQ = this.sayQ || []; this.sayQ.push(text); if (this.sayQ.length > 2) this.sayQ.shift(); cur.life = Math.min(cur.life, Math.max(cur.t + 50, 100)); return; }
    this.fx.push({ k: 'text', x: SHIP_X + 70, y: WL - 205, t: 0, life: 190, text, tag: 'SCARLET', col: '#fff6e0', size: 22 }); this.lines++;
  }

  // ---------------------------------------------------------------------------------------------- the foes
  stepSpawn() {
    const t = this.rideT, R = this.R, last = RIDE_T - 200;
    if (t > last) return;
    const ramp = this.progress;
    // storm-bats: a trickle that thickens, with a swarm now and then
    const gap = Math.round(104 - 44 * ramp);
    if (t > 60 && t % gap === 0) this.addBat(110 + R() * 230);
    if (t === RIDE_T - 700) { for (let i = 0; i < 9; i++) this.bats.push({ ...this.mkBat(112 + (i % 4) * 72, i * 0.7), x: W + 40 + i * 86, swarm: true }); this.addOrb(); this.say('One LAST swarm!'); audio.sfx('bat_swarm'); }   // (the finale)
    for (const at of [1500, 2900, 4100]) if (t === at) { const y0 = 120 + R() * 110; for (let i = 0; i < 6; i++) this.bats.push({ ...this.mkBat(y0 + (i % 3) * 66, 0), x: W + 40 + i * 94, swarm: true }); this.say('A BAT SWARM!'); audio.sfx('bat_swarm'); }   // (AA item 7: a sound as they come)
    // lightning orbs: slow and tough, from a third of the way in... (the first one early, to teach)
    if ((t === 420) || (t > 1200 && t % Math.round(300 - 90 * ramp) === 0)) this.addOrb();
    // the big waves: the kraken's work
    if (t > 800 && t % 620 === 0) { this.waves.push({ x: W + 160, w: 230, h: 96, vx: -2.3, t: 0, dead: false, smashed: false }); audio.sfx('wave_rise'); }   // (the wave's rumble as it rises off-screen right)
  }
  mkBat(y, ph) { const R = this.R; return { x: W + 40, y, y0: y, vx: -(2.1 + R() * 1.1), ph: ph ?? R() * TAU, t: 0, hp: 1, dead: 0, flap: R() * 6, mad: 0 }; }
  addBat(y) { this.bats.push(this.mkBat(y)); }
  addOrb() { const R = this.R; if (!this.firstOrb) { this.firstOrb = true; this.orbSayAt = this.rideT + 70; } this.orbs.push({ x: W + 40, y: 70 + R() * 90, t: 0, hp: 3, dead: 0, hit: 0, ph: R() * TAU }); audio.sfx('orb_spawn'); }   // (its crackle as it comes)
  stepFoes() {
    for (const b of this.bats) {
      b.t++;
      if (b.dead) { b.dead++; b.x += b.vx * 0.5; b.y += b.dead * 0.9; continue; }
      if (b.fled) { b.x += b.vx; b.y -= 3; if (b.y < -50) b.dead = 99; continue; }
      b.x += b.vx; b.y = b.y0 + Math.sin(b.t * 0.075 + b.ph) * 32;
      if (b.x < SHIP_X + 150) { b.fled = true; b.fledAt = b.t; b.vx = -2.6; this.bonk(b.x, b.y); }   // (it reached the ship: a bonk against the sails, then it flaps off)
    }
    this.bats = this.bats.filter((b) => b.dead < 60 && b.x > -80);
    for (const o of this.orbs) {
      o.t++; if (o.hit > 0) o.hit--;
      if (o.dead) { o.dead++; continue; }
      const tx = SHIP_X + 20, ty = WL - 150, d = Math.hypot(tx - o.x, ty - o.y) || 1, sp = 1.25 + 0.4 * this.progress + 0.25;
      o.x += (tx - o.x) / d * sp; o.y += (ty - o.y) / d * sp + Math.sin(o.t * 0.1 + o.ph) * 0.35;
      if (d < 46) { o.dead = 1; this.zap(o); }
    }
    this.orbs = this.orbs.filter((o) => o.dead < 30);
  }
  bonk(x, y) {
    this.leaked++; this.leakPen = Math.min(0.3, this.leakPen + 0.012); this.shake = Math.max(this.shake, REDUCED ? 0 : 5); this.clearK = Math.max(0, this.clearK - 0.012);
    audio.sfx('block', { vol: 0.4, pitch: 1.3 });
    this.fx.push({ k: 'text', x: clamp(x, 120, W - 120), y: y - 20, t: 0, life: 36, text: 'BONK!', pop: 1, col: '#ffd0f0', size: 22 }); { const e = this.fx[this.fx.length - 1]; e.y = Math.max(e.y, 136); }
  }
  zap(o) {
    this.leaked++; this.zaps++; this.leakPen = Math.min(0.3, this.leakPen + 0.07); this.shake = REDUCED ? 0 : 11; this.triggerFlash(0.6, o.x); this.clearK = Math.max(0, this.clearK - 0.03);
    audio.sfx('lightning', { vol: 0.6 });
    this.fx.push({ k: 'text', x: SHIP_X + 80, y: WL - 150, t: 0, life: 44, text: 'ZZAP!', col: '#f0c8ff', size: 30 });
    this.fx.push({ k: 'bolt', x: o.x, y: o.y, t: 0, life: 14 });
  }

  // ---------------------------------------------------------------------------------------------- the waves and the kraken
  stepWaves() {
    for (const w of this.waves) {
      w.t++;
      if (w.fall) { w.fall++; w.x += w.vx * 0.4; if (w.fall > 22) w.dead = true; continue; }
      w.x += w.vx;
      if (!w.curl && w.t > 96) { w.curl = true; this.burstSpray(w.x - 30, WL - 74, 10); }
      if (!w.smashed && w.x < KRAKEN_X + 120 && this.kr.arm <= 0.001 && !this.kr.super) { w.smashed = true; this.kr.arm = 0.001; this.kr.armX = w.x - 20; this.kr.waveRef = w; }
      if (w.x < SHIP_X + 190 && !w.smashed) { w.smashed = true; this.shake = Math.max(this.shake, REDUCED ? 0 : 10); this.fx.push({ k: 'text', x: SHIP_X + 150, y: WL - 70, t: 0, life: 40, text: 'SPLASH!', col: '#cff0ff', size: 26 }); w.fall = 1; }
    }
    this.waves = this.waves.filter((w) => !w.dead && w.x > -300);
  }
  stepKraken() {
    const K = this.kr;
    K.bob = Math.sin(this.t / 60 * 1.3) * 5;
    if (K.cheer > 0) K.cheer--;
    if (K.arm > 0) {   // the slam: up in 9 frames, down in 7, a burst of spray at the bottom
      const was = K.arm; K.arm = Math.min(2, K.arm + 0.085);
      if (was < 1 && K.arm >= 1) {
        const w = K.waveRef; if (w && !w.fall) w.fall = 1;
        if (!this.firstWave) { this.firstWave = true; this.say('The kraken smashes the BIG waves!'); }
        this.smashes++; this.burstSpray(K.armX, WL + 8, 46); this.fx.push({ k: 'ring', x: K.armX, y: WL + 18, t: 0, life: 20 }); this.shake = Math.max(this.shake, REDUCED ? 0 : 5);
        audio.sfx('explosion', { vol: 0.4, pitch: 0.8 });
        this.fx.push({ k: 'text', x: K.armX, y: WL - 90, t: 0, life: 40, text: 'WHAM!', col: '#cfffd8', size: 32 });   // (the kraken's own wave smash: WHAM! -- SMASH is the players' KRAKEN SMASH)
        K.cheer = 30;
      }
      if (K.arm >= 2) K.arm = 0;
    }
    if (K.super > 0) { K.super += 0.02; if (K.super >= 1.6) K.super = 0; }
  }
  burstSpray(x, y, n) { for (let i = 0; i < n; i++) this.puffs.push({ x, y, vx: (this.R() - 0.5) * 7, vy: -2 - this.R() * 6, t: 0, life: 34, r: 4 + this.R() * 7 }); }
  /** the kraken's great slam: every bat and orb on the screen goes, a rainbow of spray */
  superSmash() {
    this.meter = 0; this.meterFullT = 0; this.kr.super = 0.01; this.kr.cheer = 60; this.smashes++;
    for (const b of this.bats) if (!b.dead && b.x < W + 10) this.popBat(b, true);
    for (const o of this.orbs) if (!o.dead) this.popOrb(o, true);
    for (const w of this.waves) { if (!w.fall) w.fall = 1; this.burstSpray(w.x, WL, 12); }
    this.triggerFlash(0.5); this.shake = REDUCED ? 0 : 11; this.burstSpray(KRAKEN_X, WL, 40);
    this.fx.push({ k: 'text', x: W / 2, y: 190, t: 0, life: 70, text: 'KRAKEN SMASH!', col: '#bfffd0', size: 40 });
    this.fx.push({ k: 'ring', x: KRAKEN_X, y: WL - 40, t: 0, life: 30 });
    audio.sfx('kraken_smash'); audio.sfx('roar', { vol: 0.4, pitch: 1.4 });
    this.clearK = Math.min(1, this.clearK + 0.04);
  }
  popBat(b, free = false) {
    if (b.dead) return;
    b.dead = 1; this.popped++; this.app.run.score = (this.app.run.score || 0) + 100;
    if (!free) this.meter = Math.min(100, this.meter + 9);
    this.clearK = Math.min(1, this.clearK + 0.004);
    this.fx.push({ k: 'spark', x: b.x, y: b.y, t: 0, life: 18 });
    audio.sfx('bat_pop', { pitch: 1 + (this.popped % 7) * 0.04 });
  }
  popOrb(o, free = false) {
    if (o.dead) return;
    o.dead = 1; this.orbsPopped++; this.app.run.score = (this.app.run.score || 0) + 250;
    if (!free) this.meter = Math.min(100, this.meter + 18);
    this.clearK = Math.min(1, this.clearK + 0.012);
    this.fx.push({ k: 'spark', x: o.x, y: o.y, t: 0, life: 24, big: true });
    this.fx.push({ k: 'text', x: o.x, y: Math.max(o.y - 30, 140), t: 0, life: 36, text: 'POP!', pop: 1, col: '#f0d0ff', size: 26 });
    audio.sfx('crystal_pop', { vol: 0.5 });
  }

  // ---------------------------------------------------------------------------------------------- the crew and the cannon balls
  portXY(c, t) {
    const bob = swell(SHIP_X, t) * 0.5 + 9, roll = Math.sin(t * 1.3) * 0.022;
    const lx = PORTS[c.port % 4], ly = -18;
    const x = SHIP_X + (lx * Math.cos(roll) - ly * Math.sin(roll)) * SHIP_S, y = WL + bob + (lx * Math.sin(roll) + ly * Math.cos(roll)) * SHIP_S;
    return [x + 18, y];
  }
  nearestFoe(c, range) {
    let best = null, bd = range * range;
    for (const b of this.bats) if (!b.dead && !b.fled && b.x < W) { const d = (b.x - c.x) ** 2 + (b.y - c.y) ** 2; if (d < bd) { bd = d; best = { x: b.x, y: b.y, ref: b }; } }
    for (const o of this.orbs) if (!o.dead) { const d = (o.x - c.x) ** 2 + (o.y - c.y) ** 2; if (d < bd) { bd = d; best = { x: o.x, y: o.y, ref: o }; } }
    return best;
  }
  stepCrew(live) {
    const T = this.t / 60;
    for (const c of this.crew) {
      if (c.cd > 0) c.cd--; if (c.recoil > 0) c.recoil--;
      const inp = this.crewInput(c);
      if (c.human) {
        // the sight: eased toward the stick's push; held fire keeps shooting
        c.vx += (inp.x * SIGHT_SPEED - c.vx) * 0.35; c.vy += (inp.y * SIGHT_SPEED - c.vy) * 0.35;
        c.x = clamp(c.x + c.vx, 150, W - 30); c.y = clamp(c.y + c.vy, 84, H - 76);
        if (live && inp.fire && c.cd <= 0) this.fire(c, c.x, c.y, FIRE_CD);
      } else if (live && c.cd <= 0) {   // a helper: the nearest bat or orb, now and then
        const f = this.nearestFoe({ x: 520, y: 240 }, 560);
        if (f) { c.x = f.x; c.y = f.y; this.fire(c, f.x + (this.R() - 0.5) * 80, f.y + (this.R() - 0.5) * 80, AUTO_CD + (this.R() * 60 | 0)); }   // (a helper: a sloppy aim and a slow gun -- it helps, it does not play the game)
        else c.cd = 24;
      }
    }
    // the cannon balls
    void T;
  }
  /** where a bat / orb will be `n` frames from now (the ball's flight time): the bat flies left on its wave, the orb drifts to the ship */
  predict(f, n) {
    if (f.vx !== undefined) return { x: f.x + f.vx * n, y: f.y0 + Math.sin((f.t + n) * 0.075 + f.ph) * 32 };
    const tx = SHIP_X + 20, ty = WL - 150, d = Math.hypot(tx - f.x, ty - f.y) || 1, sp = 1.25 + 0.4 * this.progress + 0.25;
    return { x: f.x + (tx - f.x) / d * sp * n, y: f.y + (ty - f.y) / d * sp * n + Math.sin((f.t + n) * 0.1 + f.ph) * 0.35 * n };
  }
  fire(c, tx, ty, cd) {
    c.cd = cd; c.recoil = 10; c.fireT = this.t;
    // the aim is forgiving: a foe within reach of the sight is what the ball goes to -- aimed where it WILL be when the ball lands
    let hit = null, bd = SNAP * SNAP;
    for (const b of this.bats) if (!b.dead && !b.fled) { const d = (b.x - tx) ** 2 + (b.y - ty) ** 2; if (d < bd) { bd = d; hit = b; } }
    for (const o of this.orbs) if (!o.dead) { const d = (o.x - tx) ** 2 + (o.y - ty) ** 2; if (d < bd) { bd = d; hit = o; } }
    const [x0, y0] = this.portXY(c, this.t / 60);
    let a = { x: tx, y: ty }, dur = clamp(Math.round(Math.hypot(tx - x0, ty - y0) / 15), 14, 34);
    if (hit) { for (let i = 0; i < 3; i++) { a = this.predict(hit, dur); dur = clamp(Math.round(Math.hypot(a.x - x0, a.y - y0) / 15), 14, 34); } a = this.predict(hit, dur); }
    this.balls.push({ x0, y0, x1: a.x, y1: a.y, t: 0, dur, by: c, slot: c.slot });
    this.puffs.push({ x: x0 + 22, y: y0 - 12, vx: 1.4, vy: -0.7, t: 0, life: 26, r: 8, smoke: true });
    audio.sfx('cannon', { vol: 0.8, pitch: 0.95 + c.slot * 0.05 });
  }
  stepBalls() {
    for (const b of this.balls) {
      b.t++;
      if (b.t >= b.dur) {
        b.dead = true;
        const x = b.x1, y = b.y1;
        this.fx.push({ k: 'burst', x, y, t: 0, life: 14, col: b.by && b.by.human ? PLAYER_COLS[b.slot % 4] : '#d8d8e8' });
        let hit = 0;
        for (const f of this.bats) if (!f.dead && !f.fled && (f.x - x) ** 2 + (f.y - y) ** 2 < (BALL_R + 20) ** 2) { this.popBat(f); hit++; }
        for (const o of this.orbs) if (!o.dead && (o.x - x) ** 2 + (o.y - y) ** 2 < (BALL_R + 28) ** 2) { if (--o.hp <= 0) this.popOrb(o); else { o.hit = 16; this.fx.push({ k: 'text', x: o.x, y: Math.max(o.y - 34, 136), t: 0, life: 26, text: 'CRACK!', pop: 1, col: '#ffe0ff', size: 20 }); audio.sfx('orb_crack'); } hit++; }
        if (!hit) audio.sfx('ball_burst', { vol: 0.6 });
      }
    }
    this.balls = this.balls.filter((b) => !b.dead);
  }

  // ---------------------------------------------------------------------------------------------- drawing
  draw(ctx) {
    const t = this.t / 60, st = this.stage;
    const sh = this.shake > 0 && !REDUCED ? [Math.sin(this.t * 2.7) * this.shake * 0.6, Math.cos(this.t * 3.1) * this.shake * 0.4] : [0, 0];
    ctx.save(); ctx.translate(sh[0], sh[1]);
    st.drawBack(ctx, 0, t);
    this.drawKraken(ctx, t);
    for (const w of this.waves) this.drawWave(ctx, w, t);
    this.drawSmashArm(ctx, t);
    this.drawShip(ctx, t);
    for (const b of this.bats) this.drawBat(ctx, b, t);
    for (const o of this.orbs) this.drawOrb(ctx, o, t);
    this.drawBalls(ctx, t);
    st.drawFront(ctx, 0, t);
    SIFX.rainSheet(ctx, t, 1 - (this.state === 'home' ? clamp(this.clearK + (1 - this.clearK) * clamp(this.stateT / 45, 0, 1), 0, 1) : clamp(this.clearK, 0, 1)));   // (the storm's rain eases off as the dawn breaks through)
    for (const p of this.puffs) this.drawPuff(ctx, p);
    for (const e of this.fx) this.drawFx(ctx, e);
    if (this.state !== 'home') this.drawSights(ctx, t);
    this.readyBox = null;
    if (this.meter >= 100 && this.state === 'ride') this.drawReady(ctx, t);
    ctx.restore();
    if (this.flash > 0.02) { ctx.fillStyle = `rgba(235,220,255,${FLASH_A * this.flash})`; ctx.fillRect(0, 0, W, H); }   // (a soft wash, drawn outside the shake)
    this.drawHud(ctx, t);
  }
  drawShip(ctx, t) {
    const bob = swell(SHIP_X, t) * 0.5, roll = Math.sin(t * 1.3) * 0.022 + (this.shake > 0 && !REDUCED ? Math.sin(this.t * 1.9) * this.shake * 0.004 : 0);
    ctx.save(); ctx.translate(SHIP_X, WL + 9 + bob); ctx.rotate(roll); ctx.scale(SHIP_S, SHIP_S);
    drawDawnShip(ctx, t);   // (the Scarlet Dawn painted: src/galleon.js's geometry, so the crew and the cannons stand where they did; galleon.js itself is Books 1/3's, untouched)
    // the crew on deck behind the rail: their scene art, small, each at their cannon
    for (const c of this.crew) {
      const art = CHARS[c.hero]; if (!art?.draw) continue;
      const lx = PORTS[c.port % 4] + 4, A = art.ANIM || {};
      const f = typeof A.idle === 'function' ? A.idle(t + c.slot) : (A.idle || {});
      ctx.save(); ctx.translate(lx, -40 - c.recoil * 0.3); ctx.scale(1 / SHIP_S * 0.34, 1 / SHIP_S * 0.34);
      try { art.draw(ctx, f, { facing: 1, t: t + c.slot, scale: 1, mem: (this.crewMem[c.slot] ||= {}), vel: { x: 0, y: 0, z: 0 } }); } catch (e) { if (!(this.errLog ||= {})['crew']) { this.errLog['crew'] = 1; console.error('stormride crew art', e); } }   // (the pack still loading: drawn next frame)
      ctx.restore();
    }
    // the cannons: a barrel poking from each port, kicking back when it fires
    for (const c of this.crew) {
      const lx = PORTS[c.port % 4], rc = c.recoil * 0.9, col = c.human ? PLAYER_COLS[c.slot % 4] : '#d8d8e8';   // (a helper's gun is silver: only the players have a colour)
      ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 3.4;
      ctx.fillStyle = '#b98a2e'; ctx.beginPath(); ctx.moveTo(lx + 2 - rc, -41); ctx.lineTo(lx + 40 - rc, -43); ctx.lineTo(lx + 40 - rc, -27); ctx.lineTo(lx + 2 - rc, -26); ctx.closePath(); ctx.fill(); ctx.stroke();   // (a brass barrel over the rail)
      ctx.fillStyle = '#e6c25a'; ctx.beginPath(); ctx.rect(lx + 4 - rc, -40, 34, 4); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.rect(lx + 28 - rc, -45, 7, 21); ctx.fill(); ctx.lineWidth = 2.4; ctx.stroke();   // (the player's colour band at the muzzle)
      ctx.fillStyle = '#16121a'; ctx.beginPath(); ctx.ellipse(lx + 41 - rc, -35, 3.4, 8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#5a3a24'; ctx.beginPath(); ctx.arc(lx + 6, -24, 8, 0, TAU); ctx.fill(); ctx.stroke();   // (the carriage wheel)
    }
    ctx.restore();
  }
  drawKraken(ctx, t) {
    const K = this.kr, rise = this.state === 'intro' ? clamp(this.stateT / 80, 0, 1) : 1;
    const S = 0.56 * (1 + (K.super > 0 ? 0.25 * Math.sin(Math.min(1, K.super) * Math.PI) : 0)), kx = KRAKEN_X, wy = WL + 14 + swell(kx, t) * 0.4;   // (the head's neck line is under the front waves: the mantle comes out of the sea)
    const H = CHARS.kraken_head, fb = H?.ATLAS_SCALE && H.ANIM?.freedBare ? H.ANIM.freedBare(t) : null, painted = !!(fb && fb.s3d >= 0.5);
    const ready = this.meter >= 100 && this.state === 'ride';
    ctx.save();
    if (painted && ready) {   // (ready: a gold halo round the painted head, behind it -- over it, 'lighter' washed the painted face out)
      const k = 0.5 + 0.5 * Math.sin(t * 9), hy = wy - 80 * S / 0.56, g = ctx.createRadialGradient(kx, hy, 40, kx, hy, 185);   // (round the sunk head)
      g.addColorStop(0, `rgba(255,226,120,${0.45 * k + 0.25})`); g.addColorStop(1, 'rgba(255,210,80,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(kx, hy, 185, 0, TAU); ctx.fill();
    }
    const ARM = CHARS.kraken_arm, arms = !!ARM?.ready?.();
    if (arms) this.drawKrakenArms(ctx, t, wy, rise, S / 0.56); else this.armRoots = [];   // (its painted arms waving up out of the sea round it, behind the head)
    const sink = painted ? 15 * S / 0.56 : 0, ay = wy + 80 * S + (1 - rise) * 230 - K.bob * 0.6 - (K.cheer > 0 ? 8 : 0) + sink, cutY = wy - 18 * S / 0.56 - (K.cheer > 0 ? 8 : 0);   // (the sea's line: the head bobs and cheers against it, rises through it)
    if (painted) { ctx.save(); ctx.beginPath(); ctx.rect(kx - 260, -400, 520, cutY + 400); ctx.clip(); }   // (the sea's line through its eyes: the dome and the eyes peek out, the beak is under -- never an owl)
    ctx.save(); ctx.translate(kx, ay); ctx.scale(S, S); ctx.translate(0, -320);   // (drawKraken translates to its own neck line, y 320, and scales by 0.8: undo the 320, and sink the neck under the front waves)
    if (painted) { ctx.translate(0, 320 - 80); try { H.draw(ctx, fb, { facing: 1, scale: 1.05, t }); } catch (e) { if (!(this.errLog ||= {})['head']) { this.errLog['head'] = 1; console.error('stormride painted kraken head', e); } } }   // (its anchor: wy + sink -- the painted friendly kraken: gold eyes, no collar, the book's)
    else { try { drawKraken(ctx, { x: 0, rise: 1, gold: 1, broken: 1, crack: 2, thrash: K.super > 0 || K.cheer > 0 ? 0.6 : 0.1, eyeL: 1, eyeR: 1, mouth: K.cheer > 0 || K.super > 0 ? 1 : 0, maroon: true }, 0, t); } catch (e) { if (!(this.errLog ||= {})['krakenCode']) { this.errLog['krakenCode'] = 1; console.error('stormride code kraken', e); } } }
    ctx.restore();
    if (painted) { ctx.restore(); this.drawKrakenFoam(ctx, kx, cutY, S / 0.56, t); } ctx.save();   // (the clip off; the foam where the sea meets it; a save for the restore below)   // (maroon: the book's kraken, as the painted one -- the stage's palette flag)
    ctx.restore();
    if (!painted && ready) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const k = 0.5 + 0.5 * Math.sin(t * 9), g = ctx.createRadialGradient(kx, wy - 50, 10, kx, wy - 50, 150); g.addColorStop(0, `rgba(255,236,140,${0.55 * k + 0.2})`); g.addColorStop(1, 'rgba(255,210,80,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(kx, wy - 50, 150, 0, TAU); ctx.fill(); ctx.restore(); }   // (ready: the kraken glows gold)
    ctx.restore();
    // its friendly face: a name flag? (no: the gold eyes say it)
    // the great slam: a ring of white water round it
    if (K.super > 0) {
      const u = clamp(K.super / 1.2, 0, 1); ctx.save(); if (painted) { ctx.beginPath(); ctx.rect(kx - 800, cutY + 2, 1600, 400); ctx.clip(); } ctx.strokeStyle = `rgba(220,255,235,${1 - u})`; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(kx, WL + 22, 60 + u * 520, 14 + u * 90, 0, 0, TAU); ctx.stroke(); ctx.restore();   // (the clip: only its near half, never across the face)
    }
  }
  /** the friendly kraken's arms (painter 1's eyeless kraken_arm pack, src/chars/kraken_arm3d.js): three waving up out of the sea round
   *  its head -- its octopus read -- their bases under the front waves.  During the KRAKEN SMASH the right one rears up and curls down
   *  (popUp, then grab).  k: the kraken's scale over its usual */
  drawKrakenArms(ctx, t, wy, rise, k) {
    const K = this.kr, kx = KRAKEN_X, by = wy + 46 + (1 - rise) * 260; this.armRoots = [];
    const sup = K.super > 0 ? clamp(K.super / 1.2, 0, 1) : -1;
    for (const [dx, f, sc, ph, swing] of [[-104, -1, 0.6, 0, false], [102, 1, 0.68, 1.7, true], [196, 1, 0.48, 3.3, false]]) {
      const x = kx + dx * k, mem = (this.armMem ||= {})[dx] ||= {};
      if (swing && sup >= 0) {   // (the KRAKEN SMASH: up high, then the curl comes down over the sea)
        const up = clamp(sup / 0.35, 0, 1), down = clamp((sup - 0.35) / 0.4, 0, 1);
        CHARS.kraken_arm.drawArm(ctx, x, by, down > 0 ? 'grab' : 'rise', down > 0 ? down : up, t, { facing: f, scale: sc * k * (1 + 0.45 * Math.sin(Math.min(1, sup / 0.6) * Math.PI * 0.5)), mem });
      } else CHARS.kraken_arm.drawArm(ctx, x, by, 'up', 0, t * 0.9 + ph, { facing: f, scale: sc * k, mem });   // (idle: swaying, each in its own time)
      if (rise > 0.6) this.armRoots.push([x + f * 6 * sc * k, sc * k]);
    }
  }
  /** the sea meeting the kraken's head at its eyes: a broken foam collar across it, curling round its sides, rocking with the swell;
   *  a small ring of it where each arm enters the sea */
  drawKrakenFoam(ctx, kx, y, k, t) {
    const hw = 74 * k;
    ctx.save(); ctx.lineCap = 'round';
    for (const [rx, sc] of this.armRoots || []) {   // (the arms' roots)
      const w = 30 * sc + 6, ry = y + 6;
      ctx.fillStyle = 'rgba(16,40,52,0.3)'; ctx.beginPath(); ctx.ellipse(rx, ry + 3, w + 4, 4, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(240,250,255,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(rx, ry, w, 4.5, 0, Math.PI * 0.05, Math.PI * 0.95); ctx.stroke();
      ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(rx - w - 2, ry - 2, 5 + Math.sin(t * 3 + rx) * 1.2, Math.PI * 1.45, Math.PI * 1.95); ctx.stroke(); ctx.beginPath(); ctx.arc(rx + w + 2, ry - 2, 5 + Math.cos(t * 3 + rx) * 1.2, Math.PI * 1.05, Math.PI * 1.55); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(16,40,52,0.35)'; ctx.beginPath(); ctx.ellipse(kx, y + 5, hw + 10, 7, 0, 0, TAU); ctx.fill();   // (its shadow in the water just under the line)
    for (const [lw, col] of [[7, 'rgba(206,236,246,0.55)'], [3.6, 'rgba(244,252,255,0.95)']]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
      for (let i = 0; i <= 14; i++) { const u = i / 14, x = kx - hw - 8 + u * (hw * 2 + 16), yy = y + Math.sin(u * 9 + t * 3.2) * 1.6 + Math.sin(u * 23 - t * 4.1) * 0.8 - Math.sin(u * Math.PI) * 2.5; if (i % 5 === 4) { ctx.moveTo(x + 4, yy); continue; } if (i % 5 === 0 || i === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(240,250,255,0.92)'; ctx.beginPath(); ctx.ellipse(kx, y - 1.5, 15 * k, 4.2, 0, 0, TAU); ctx.fill();   // (a lump of foam in the middle, where its beak would break the water)
    ctx.strokeStyle = 'rgba(240,250,255,0.85)'; ctx.lineWidth = 3;   // (curls of foam where the water wraps its sides)
    for (const sd of [-1, 1]) { const x = kx + sd * (hw + 4), ph = t * 3 + sd; ctx.beginPath(); ctx.arc(x, y - 2, 7 + Math.sin(ph) * 1.5, sd > 0 ? Math.PI * 1.05 : Math.PI * 1.45, sd > 0 ? Math.PI * 1.55 : Math.PI * 1.95); ctx.stroke(); }
    ctx.fillStyle = 'rgba(244,252,255,0.8)'; for (let i = 0; i < 6; i++) { const u = (i + 0.5) / 6, x = kx - hw + u * hw * 2 + Math.sin(t * 2 + i * 1.7) * 4, yy = y + 4 + (i % 2) * 2; ctx.beginPath(); ctx.ellipse(x, yy, 3.4, 1.2, 0, 0, TAU); ctx.fill(); }   // (flecks drifting on the line)
    ctx.restore();
  }
  /** the arm that smashes the wave: up out of the sea beside it, then down on it (drawn in front of the wave) -- painted (popUp, then
   *  the grab's curl coming down on it) when the pack is in, else the stage's vector arm */
  drawSmashArm(ctx, t) {
    const K = this.kr;
    if (K.arm <= 0) return;
    if (CHARS.kraken_arm?.ready?.()) { CHARS.kraken_arm.drawArm(ctx, K.armX + 40, WL + 40, K.arm < 1 ? 'rise' : 'grab', K.arm < 1 ? K.arm : K.arm - 1, t, { facing: -1, scale: 1.2, mem: (this.smashMem ||= {}) }); return; }
    const u = K.arm < 1 ? K.arm : 2 - K.arm, e = u * u * (3 - 2 * u);
    ctx.save(); ctx.translate(K.armX + 46, WL + 30); ctx.scale(0.95, 0.95);
    try { drawKrakenArm(ctx, 0, 0, 380, -1, t * 2, 0.4, 0.15 + 0.85 * e, 1.25, 0.55 * (1 - e), true); } catch (err) { if (!(this.errLog ||= {}).armCode) { this.errLog.armCode = 1; console.error('stormride code arm', err); } }   // (true: maroon, the stage's palette flag)
    ctx.restore();
  }
  /** a big wave, painted (src/stages/sistorm.js drawBigWave): rising as it comes in, the swell breaking into the curl, slumping into
   *  the sea when it falls; the vector hump below only if the painted one throws */
  drawWave(ctx, w, t) {
    { const u = clamp((w.t - 8) / 90, 0, 1), rise = 0.42 + 0.58 * u * u * (3 - 2 * u), fall = w.fall ? clamp(w.fall / 22, 0, 1) : 0;
      try { drawBigWave(ctx, w.x, WL + 14 + Math.sin(t * 2 + w.x * 0.01) * 2, w.w, w.h, { rise: fall ? 1 : rise, curl: !!w.curl || !!fall, dawn: clamp((this.clearK - 0.3) / 0.4, 0, 1), collapse: fall }); return; }
      catch (e) { if (!(this.errLog ||= {}).wave) { this.errLog.wave = 1; console.error('stormride big wave', e); } } }
    if (w.fall) return;
    const x = w.x, y = WL + 14, ww = w.w, hh = w.h;
    ctx.save(); ctx.translate(x, y);
    const g = ctx.createLinearGradient(0, -hh, 0, 12); g.addColorStop(0, this.clearK > 0.5 ? '#6ac0e0' : '#2a5a8a'); g.addColorStop(1, this.clearK > 0.5 ? '#2a88b8' : '#122e52');
    ctx.fillStyle = g; ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-ww / 2, 12); ctx.quadraticCurveTo(-ww * 0.38, -hh * 0.35, -ww * 0.12, -hh * 0.92); ctx.quadraticCurveTo(ww * 0.14, -hh * 1.12, ww * 0.26, -hh * 0.62);   // (a rolling wall with a curling crest toward the ship)
    ctx.quadraticCurveTo(ww * 0.3, -hh * 0.3, ww / 2, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(235,248,255,0.9)'; for (let i = 0; i < 7; i++) { const a = (i / 6) * 1.2 - 0.1; ctx.beginPath(); ctx.arc(-ww * 0.12 + Math.cos(a * 2.4) * ww * 0.3 * (a + 0.4), -hh * (0.95 - a * 0.25) + Math.sin(t * 5 + i) * 3, 7 + (i % 3) * 3, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  /** the painted bats' atlas decoded during the intro (a first draw of each pose to a scratch canvas at the frame's scale): no
   *  first-use hitch when the first bat flies in */
  warmBats() {
    const P = CHARS.storm_bat, A = P?.ATLAS_SCALE && P.ANIM ? P.ANIM : null;
    if (!A || !A.fly) return false;
    try {
      const c = document.createElement('canvas'); c.width = c.height = 2; const g = c.getContext('2d'), sc = this.app?.scale || 1;
      if (g) { g.setTransform(sc, 0, 0, sc, 0, 0); for (const ph of [0, 0.17, 0.33, 0.5, 0.67, 0.83]) { const pose = A.fly(ph); if (pose) P.draw(g, pose, { facing: -1, scale: 1.15, t: ph, mem: {} }); } if (A.hurt) for (const u of [0, 0.5, 1]) { const pose = A.hurt(u); if (pose) P.draw(g, pose, { facing: -1, scale: 1.15, t: 0, mem: {} }); } }
      c.width = c.height = 1;
    } catch (e) { console.warn('storm bats warm-up', e); }
    return true;
  }
  drawBat(ctx, b, t) {
    if (b.x < -60 || b.x > W + 80) return;
    { const P = CHARS.storm_bat, A = P?.ATLAS_SCALE && P.ANIM ? P.ANIM : null;   // (the painted storm bat, painter 1's pack, when it is in: else the code bat below)
      if (A && A.fly) {
        const pose = b.dead && A.hurt ? A.hurt(clamp(b.dead / 24, 0, 1)) : A.fly(b.t / 60 + (b.flap || 0));
        if (pose && pose.s3d >= 0.5) {
          const s = 1.15; ctx.save(); ctx.translate(b.x, b.y + 35 * s);   // (painter 1's r3, head-on: a ~108 px wingspan at 0.88, like the code bat's; its anchor is the ground point under it, the body ~35 px above: the body sits on (b.x, b.y), where the hit and the burst are)
          if (b.dead) ctx.globalAlpha = clamp(1 - b.dead / 60, 0, 1); else if (b.fled) ctx.globalAlpha = clamp(1 - (b.t - (b.fledAt || b.t)) / 40, 0, 1);
          let ok = true; try { P.draw(ctx, pose, { facing: -1, scale: s, t: b.t / 60, mem: (b.mem ||= {}) }); } catch (e) { ok = false; if (!(this.errLog ||= {})['bat']) { this.errLog['bat'] = 1; console.error('stormride painted bat', e); } }
          ctx.restore(); if (ok) return;
        }
      } }
    const fl = Math.sin((b.t + b.flap) * 0.34), dead = b.dead;
    ctx.save(); ctx.translate(b.x, b.y); if (dead) { ctx.rotate(dead * 0.22); ctx.globalAlpha = clamp(1 - dead / 60, 0, 1); } else if (b.fled) ctx.globalAlpha = clamp(1 - (b.t - (b.fledAt || b.t)) / 40, 0, 1);
    ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 3.4;
    // wings: two scalloped sails of purple, flapping
    for (const s of [-1, 1]) {
      ctx.save(); ctx.scale(s, 1); ctx.rotate(-0.35 * fl);
      ctx.fillStyle = '#6a2a96'; ctx.beginPath(); ctx.moveTo(8, -2); ctx.quadraticCurveTo(26, -30 - 8 * fl, 54, -16 - 10 * fl); ctx.quadraticCurveTo(48, -6, 44, 2); ctx.quadraticCurveTo(38, -4, 32, 6); ctx.quadraticCurveTo(26, 0, 18, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(210,120,255,0.55)'; ctx.beginPath(); ctx.moveTo(14, -2); ctx.quadraticCurveTo(28, -18 - 4 * fl, 46, -12 - 6 * fl); ctx.lineTo(30, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // the body, ears, a grumpy-cute face with fangs and bright eyes
    ctx.fillStyle = '#4a1a72'; ctx.beginPath(); ctx.ellipse(0, 2, 17, 19, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-12, -12); ctx.lineTo(-15, -28); ctx.lineTo(-3, -17); ctx.closePath(); ctx.moveTo(12, -12); ctx.lineTo(15, -28); ctx.lineTo(3, -17); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; for (const ex of [-7, 7]) { ctx.beginPath(); ctx.arc(ex, -1, 6.2, 0, TAU); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = dead ? '#444' : '#ff4ad8'; for (const ex of [-6, 8]) { ctx.beginPath(); ctx.arc(ex, 0, 3, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#f4eeff'; ctx.beginPath(); ctx.moveTo(-6, 9); ctx.lineTo(-3, 15); ctx.lineTo(0, 9); ctx.moveTo(0, 9); ctx.lineTo(3, 15); ctx.lineTo(6, 9); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-9, -8); ctx.lineTo(-3, -5); ctx.moveTo(9, -8); ctx.lineTo(3, -5); ctx.stroke();   // (the angry brows)
    ctx.restore();
  }
  drawOrb(ctx, o, t) {
    const R = 28 + 3 * Math.sin(o.t * 0.2 + o.ph) + (o.hp < 2 ? -4 : 0), dead = o.dead;
    ctx.save(); ctx.translate(o.x, o.y);
    if (dead) ctx.globalAlpha = clamp(1 - dead / 30, 0, 1);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, R * 2.2); g.addColorStop(0, 'rgba(255,240,255,0.95)'); g.addColorStop(0.3, 'rgba(210,110,255,0.7)'); g.addColorStop(1, 'rgba(120,40,200,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 2.2, 0, TAU); ctx.fill();
    // arcs of lightning round it
    ctx.strokeStyle = o.hit > 0 ? '#ffffff' : '#f0c8ff'; ctx.lineWidth = 2.6;
    for (let k = 0; k < 4; k++) {
      const a0 = o.t * 0.09 + k * TAU / 4; ctx.beginPath(); ctx.moveTo(Math.cos(a0) * R * 0.5, Math.sin(a0) * R * 0.5);
      for (let i = 1; i <= 4; i++) { const r = R * (0.5 + i * 0.28), a = a0 + (((o.t * 7 + i * 13 + k * 29) % 11) - 5) * 0.045; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = o.hit > 0 ? '#fff' : '#3a1068'; ctx.strokeStyle = INK; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.arc(0, 0, R * 0.62, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8a8ff'; ctx.beginPath(); ctx.arc(-R * 0.18, -R * 0.2, R * 0.2, 0, TAU); ctx.fill();   // a spark of light on it
    ctx.fillStyle = '#ffe9ff'; for (const ex of [-0.22, 0.22]) { ctx.beginPath(); ctx.arc(ex * R, R * 0.06, R * 0.11, 0, TAU); ctx.fill(); }   // (cross little eyes)
    ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(-R * 0.34, -R * 0.1); ctx.lineTo(-R * 0.1, R * 0.0); ctx.moveTo(R * 0.34, -R * 0.1); ctx.lineTo(R * 0.1, 0); ctx.stroke();
    if (o.hp < 2) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-6, -R * 0.55); ctx.lineTo(2, -R * 0.2); ctx.lineTo(-4, R * 0.1); ctx.stroke(); }   // (cracked)
    ctx.restore();
  }
  drawBalls(ctx, t) {
    for (const b of this.balls) {
      const u = b.t / b.dur, x = b.x0 + (b.x1 - b.x0) * u, y = b.y0 + (b.y1 - b.y0) * u - Math.sin(u * Math.PI) * 46;
      ctx.save(); ctx.fillStyle = b.by && b.by.human ? PLAYER_COLS[b.slot % 4] : '#d8d8e8'; ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(x, y, 7.5, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(x - 2.4, y - 2.4, 2.4, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#ffd890'; for (let k = 1; k <= 3; k++) { const uu = Math.max(0, u - k * 0.05); ctx.beginPath(); ctx.arc(b.x0 + (b.x1 - b.x0) * uu, b.y0 + (b.y1 - b.y0) * uu - Math.sin(uu * Math.PI) * 46, 4 - k, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
  }
  drawPuff(ctx, p) {
    const u = p.t / p.life; p.x += p.vx; p.y += p.vy; if (!p.smoke) p.vy += 0.3;
    ctx.save();
    if (p.smoke) { const r = p.r * (1.2 + 1.6 * u), g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, r); g.addColorStop(0, `rgba(236,228,244,${0.55 * (1 - u)})`); g.addColorStop(1, 'rgba(210,200,226,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill(); }   // (a soft puff at the muzzle, no hard disc)
    else { ctx.globalAlpha = (1 - u) * 0.8; ctx.fillStyle = '#e8f6ff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 - u * 0.4), 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  drawFx(ctx, e) {
    const u = e.t / e.life;
    ctx.save();
    if (e.k === 'text') { ctx.globalAlpha = u < 0.75 ? 1 : (1 - u) * 4; const rb = e.pop && this.readyBox, ey = rb && e.x + 50 > rb.x0 && e.x - 50 < rb.x1 ? Math.max(e.y, rb.y1 + 48) : e.y, lines = String(e.text).split('\n'), y0 = ey - u * (e.tag ? 6 : 22); if (e.tag) HUD.outlined(ctx, e.tag + ':', e.x, y0 - e.size * 1.1, 17, '#ff8a8a', FONT, 0.24, 'center'); lines.forEach((l, i) => HUD.outlined(ctx, l, e.x, y0 + i * e.size * 1.05, e.size, e.col, FONT, 0.22, 'center')); }
    else if (e.k === 'spark') { ctx.globalCompositeOperation = 'lighter'; const r = (e.big ? 56 : 34) * (0.4 + u); const g = ctx.createRadialGradient(e.x, e.y, 1, e.x, e.y, r); g.addColorStop(0, `rgba(255,240,255,${1 - u})`); g.addColorStop(0.4, `rgba(220,130,255,${0.7 * (1 - u)})`); g.addColorStop(1, 'rgba(160,60,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.fill(); }
    else if (e.k === 'burst') { ctx.globalCompositeOperation = 'lighter'; const r = 16 + 40 * u, g = ctx.createRadialGradient(e.x, e.y, 1, e.x, e.y, r); g.addColorStop(0, `rgba(255,240,190,${0.85 * (1 - u)})`); g.addColorStop(0.5, `${hexA(e.col, 0.45 * (1 - u))}`); g.addColorStop(1, 'rgba(255,200,80,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.fill(); }
    else if (e.k === 'ring') { ctx.strokeStyle = `rgba(210,255,225,${1 - u})`; ctx.lineWidth = 8 * (1 - u) + 1; ctx.beginPath(); ctx.ellipse(e.x, e.y, 40 + 520 * u, 18 + 120 * u, 0, 0, TAU); ctx.stroke(); }
    else if (e.k === 'bolt') { ctx.strokeStyle = `rgba(245,225,255,${1 - u})`; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.beginPath(); let x = e.x, y = 0; ctx.moveTo(x, y); for (let i = 1; i <= 7; i++) { x += ((i * 53 + (e.x | 0)) % 41 - 20); y = i * (e.y + 60) / 7; ctx.lineTo(x, y); } ctx.stroke(); }
    ctx.restore();
  }
  /** the SMASH key as each player sees it: SUPER on touch; one pad's glyph alone; every player's own with more (anyone's works) */
  smashKeys() {
    if (this.app.lastCtrl === 'touch') return 'SUPER';
    const humans = this.crew.filter((c) => c.human), g = (c) => this.app.glyphText?.('special', c?.ctrl || 'any') || 'SPECIAL';
    return humans.length > 1 ? humans.map((c) => `P${c.slot + 1} [${g(c)}]`).join('  ') : `[${g(humans[0] || this.crew[0])}]`;
  }
  /** a key as the select screen draws it (src/hud.js siKeycap's look): a keyboard key on its own keycap -- a punctuation key big on its
   *  cap -- a pad's button as its glyph; (x, cy): its left edge and centre line, h its cap height; returns its width (draw false: measure) */
  keyGlyph(ctx, act, ctrl, x, cy, h, draw = true, dark = false) {
    const app = this.app, cid = !ctrl || ctrl === 'any' ? app.lastCtrl : ctrl;
    let gd = null; try { gd = app.input?.glyph?.(act, cid); } catch { gd = null; }
    if (gd && gd.kind !== 'keyboard' && app.input?.drawGlyph) {   // (a pad's button: its own glyph, as on the select)
      let w = h + 2;
      try { if (draw) { if (dark) { ctx.save(); ctx.fillStyle = '#f6f0e3'; ctx.beginPath(); ctx.arc(x + (h + 2) / 2, cy, (h + 2) / 2 + 2, 0, TAU); ctx.fill(); ctx.restore(); } w = app.input.drawGlyph(ctx, act, cid, x + (h + 2) / 2, cy, h + 2) || w; } else { const sc = this._gsc || (this._gsc = document.createElement('canvas').getContext('2d')); w = app.input.drawGlyph(sc, act, cid, -999, -999, h + 2) || w; } } catch { /* the plain size */ }
      return w;
    }
    const lab = HUD.siKeyLabel ? HUD.siKeyLabel(app, act, cid) : null;
    if (lab && HUD.siKeyW && HUD.siKeycap) {   // (a keyboard key: the select screen's own keycap, src/hud.js -- QAF3)
      const kw = HUD.siKeyW(ctx, lab, h, 17);
      if (draw) HUD.siKeycap(ctx, lab, x + kw / 2, cy, kw, h, 17);
      return kw;
    }
    const txt = String(app.glyphText?.(act, cid) || act.toUpperCase()), punct = /^[^A-Za-z0-9\s]$/.test(txt), px = 17, lw = Math.max(1.4, h * 0.07), bevel = Math.round(h * 0.14), r = h * 0.22, fh = h - lw * 3 - bevel;
    ctx.save(); ctx.font = punct ? `bold ${Math.round(h * 0.95)}px ${KEYC}` : `700 ${px}px ${KEY_SANS}`;
    const w = punct ? h : Math.max(h, Math.ceil(ctx.measureText(txt).width) + 14);
    if (draw) {
      const rr = (x0, y0, ww, hh, rad) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x0, y0, ww, hh, rad); else ctx.rect(x0, y0, ww, hh); };
      rr(x + lw / 2, cy - h / 2 + lw / 2, w - lw, h - lw, r); ctx.fillStyle = '#a59b86'; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke();   // (its rim)
      rr(x + lw * 1.5, cy - h / 2 + lw * 1.5, w - lw * 3, fh, r * 0.8); ctx.fillStyle = '#f6f0e3'; ctx.fill();   // (its face, over the bevel)
      ctx.fillStyle = INK; ctx.textAlign = 'center';
      const ft = cy - h / 2 + lw * 1.5, mx = x + w / 2, mk = Math.max(2.2, h * 0.11);   // (the face's top; a mark's stroke)
      if (punct && '.,\';/:'.includes(txt)) {   // (a punctuation key drawn as its mark, big and where it sits on a key: a dot low, a tick high -- critic A 4a)
        ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.lineWidth = mk;
        const dot = (yy) => { ctx.beginPath(); ctx.arc(mx, ft + fh * yy, mk * 0.95, 0, TAU); ctx.fill(); };
        const tail = (yy) => { ctx.beginPath(); ctx.moveTo(mx + mk * 0.5, ft + fh * yy); ctx.quadraticCurveTo(mx + mk * 0.4, ft + fh * (yy + 0.2), mx - mk * 0.9, ft + fh * (yy + 0.3)); ctx.stroke(); };
        if (txt === '.') dot(0.7);
        else if (txt === ',') { dot(0.6); tail(0.6); }
        else if (txt === ':') { dot(0.32); dot(0.72); }
        else if (txt === ';') { dot(0.3); dot(0.62); tail(0.62); }
        else if (txt === "'") { ctx.beginPath(); ctx.moveTo(mx + 0.6, ft + fh * 0.14); ctx.lineTo(mx - 0.6, ft + fh * 0.5); ctx.stroke(); }
        else { ctx.beginPath(); ctx.moveTo(mx + fh * 0.2, ft + fh * 0.14); ctx.lineTo(mx - fh * 0.2, ft + fh * 0.86); ctx.stroke(); }
      } else {
        if (punct) ctx.font = `bold ${Math.round(h * 1.15)}px ${KEYC}`;   // (any other mark: large, centred by its own ink)
        ctx.textBaseline = 'alphabetic'; const m = ctx.measureText(txt), a = m.actualBoundingBoxAscent, d = m.actualBoundingBoxDescent;
        ctx.fillText(txt, mx, ft + fh / 2 + (Number.isFinite(a) && Number.isFinite(d) ? (a - d) / 2 : px * 0.35));
      }
    }
    ctx.restore();
    return w;
  }
  /** a line of words and keys centred at (cx, base): parts are strings, { act, ctrl } keys, or { gap } spaces; o: { px, font, col, plain
   *  (INK on a light plate) }; returns its width (draw false: measure only) */
  keyLine(ctx, parts, cx, base, o, draw = true) {
    const cap = Math.round(o.px * 1.15) + 1, sp = 5;
    ctx.save(); ctx.font = o.plain ? `bold ${o.px}px ${o.font}` : `${o.px}px ${o.font}`;
    const memo = this._kw || (this._kw = new Map()); if (memo.size > 300) memo.clear();   // (each word's and key's width, remembered: measured once, not every frame -- critic B)
    const ws = parts.map((q) => {
      if (q.gap) return q.gap;
      const k = typeof q === 'string' ? `${o.plain ? 'b' : ''}${o.px}|${o.font}|${q}` : `${cap}|${q.act}|${q.ctrl}|${this.app.lastCtrl}|${this.app.glyphText?.(q.act, q.ctrl)}`;
      let v = memo.get(k); if (v === undefined) { v = typeof q === 'string' ? ctx.measureText(q).width : this.keyGlyph(ctx, q.act, q.ctrl, 0, 0, cap, false); memo.set(k, v); }
      return v;
    });
    const tw = ws.reduce((a, b) => a + b, 0) + sp * Math.max(0, parts.length - 1);
    if (draw) {
      let x = cx - tw / 2;
      parts.forEach((q, i) => {
        if (typeof q === 'string') { if (o.plain) { ctx.font = `bold ${o.px}px ${o.font}`; ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(q, x, base); } else HUD.outlined(ctx, q, x, base, o.px, o.col, o.font, 0.24, 'left'); }
        else if (!q.gap) this.keyGlyph(ctx, q.act, q.ctrl, x, base - o.px * 0.36, cap, true, !!o.dark);
        x += ws[i] + sp;
      });
    }
    ctx.restore();
    return tw;
  }
  /** the KRAKEN SMASH keys as parts: SUPER on touch; one key alone; every player's own with more (anyone's works) */
  smashParts() {
    if (this.app.lastCtrl === 'touch') return ['SUPER'];
    const humans = this.crew.filter((c) => c.human);
    return humans.length > 1 ? humans.flatMap((c, i) => [...(i ? [{ gap: 6 }] : []), `P${c.slot + 1}`, { act: 'special', ctrl: c.ctrl || 'any' }]) : [{ act: 'special', ctrl: (humans[0] || this.crew[0])?.ctrl || 'any' }];
  }
  /** the full KRAKEN SMASH bar: a big pulsing word on a dark plate under the meter, top left (off the kraken: QAF), so nobody misses it --
   *  its keys drawn as the select screen draws them (QAF3: "P2 [']" read as a typo) */
  drawReady(ctx, t) {
    const k = 0.5 + 0.5 * Math.sin(t * 6), line = ['press', ...this.smashParts()], LO = { px: 22, font: FONT, col: '#fff6e0', dark: true };
    ctx.save(); const pw = this.keyLine(ctx, line, 0, 0, LO, false); ctx.font = `30px ${TITLE}`;
    const tw = Math.max(300, pw + 40, ctx.measureText('KRAKEN SMASH READY!').width * 1.03 + 40);   // (wide enough for its title at the pulse's peak)
    this.readyBox = { x0: 56, x1: 56 + tw, y1: 188 };
    ctx.translate(56 + tw / 2, 146);   // (its left edge inside a TV's action-safe area)
    ctx.fillStyle = 'rgba(14,8,30,0.74)'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-tw / 2, -30, tw, 72, 14) : ctx.rect(-tw / 2, -30, tw, 72); ctx.fill(); ctx.stroke();
    ctx.scale(1 + 0.03 * k, 1 + 0.03 * k);
    HUD.outlined(ctx, 'KRAKEN SMASH READY!', 0, 2, 30, k > 0.5 ? '#d8ffe0' : '#a8f4c0', TITLE, 0.15, 'center');
    this.keyLine(ctx, line, 0, 33, LO, true);
    ctx.restore();
  }
  drawSights(ctx, t) {
    for (const c of this.crew) {
      if (!c.human) continue;
      const col = PLAYER_COLS[c.slot % 4], ready = c.cd <= 0, r = 24 + (ready ? 0 : 4);
      ctx.save(); ctx.translate(c.x, c.y);
      ctx.strokeStyle = INK; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 4.2; ctx.globalAlpha = ready ? 1 : 0.82; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
      for (const a of [0, 1, 2, 3]) { const an = a * TAU / 4 + t * 0.6; ctx.beginPath(); ctx.moveTo(Math.cos(an) * (r - 5), Math.sin(an) * (r - 5)); ctx.lineTo(Math.cos(an) * (r + 9), Math.sin(an) * (r + 9)); ctx.lineWidth = 3.4; ctx.stroke(); }
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1; HUD.outlined(ctx, `P${c.slot + 1}`, 0, r + 24, 17, col, FONT, 0.24, 'center');
      ctx.restore();
    }
  }
  drawHud(ctx, t) {
    const band = ctx.createLinearGradient(0, 0, 0, 112); band.addColorStop(0, 'rgba(16,6,32,0.55)'); band.addColorStop(1, 'rgba(16,6,32,0)');
    ctx.fillStyle = band; ctx.fillRect(0, 0, W, 112);
    // the way through: the ship on a ribbon toward the island (inside a TV's action-safe area; left of the island's castle as it grows)
    const k = this.progress, x0 = 230, x1 = 590;
    HUD.outlined(ctx, 'THROUGH THE STORM', (x0 + x1) / 2, 46, 24, '#f4e8ff', FONT, 0.24, 'center');
    ctx.fillStyle = 'rgba(20,10,40,0.65)'; ctx.fillRect(x0, 52, x1 - x0, 10);
    const gr = ctx.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, '#9a50e0'); gr.addColorStop(1, '#ffc070'); ctx.fillStyle = gr; ctx.fillRect(x0, 52, (x1 - x0) * k, 10);
    ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.strokeRect(x0, 52, x1 - x0, 10);
    ctx.fillStyle = '#e8402a'; ctx.beginPath(); ctx.moveTo(x0 + (x1 - x0) * k - 8, 59); ctx.lineTo(x0 + (x1 - x0) * k + 8, 59); ctx.lineTo(x0 + (x1 - x0) * k, 42); ctx.closePath(); ctx.fill(); ctx.stroke();   // (the red sail)
    ctx.fillStyle = '#3a2a30'; ctx.beginPath(); ctx.moveTo(x1 + 6, 62); ctx.lineTo(x1 + 18, 44); ctx.lineTo(x1 + 30, 62); ctx.closePath(); ctx.fill(); ctx.stroke();   // (the island)
    // the pops, and the kraken's bar
    HUD.outlined(ctx, `BATS x ${this.popped}`, 50, 62, 26, '#ffd8ff', FONT, 0.24, 'left');
    const full = this.meter >= 100 && this.state === 'ride';
    ctx.fillStyle = 'rgba(16,26,24,0.7)'; ctx.fillRect(50, 72, 200, 14);
    ctx.fillStyle = full ? (Math.sin(t * 6) > 0 ? '#fff1a6' : '#ffd25a') : '#58c07a'; ctx.fillRect(52, 74, 196 * clamp(this.meter / 100, 0, 1), 10);   // (a gentle ~1 Hz shimmer when full)
    ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.strokeRect(50, 72, 200, 14);
    const sg = this.smashKeys();
    HUD.outlined(ctx, full ? 'KRAKEN SMASH!' : 'KRAKEN SMASH', 260, 88, full ? 24 : 22, full ? '#ffe9a0' : '#c8f0d8', FONT, 0.24, 'left');
    // the prompt and the banners
    if (this.state === 'intro' || this.state === 'home') {
      const a = clamp(this.stateT / 12, 0, 1) * (this.state === 'intro' ? clamp((100 - this.stateT) / 20, 0, 1) : 1);
      ctx.save(); ctx.globalAlpha = a;
      const bx = this.state === 'home' ? W / 2 - 40 : W / 2;
      HUD.outlined(ctx, this.banner, bx, 150, 44, '#ffe066', TITLE, 0.15, 'center');
      if (this.state === 'home') { HUD.outlined(ctx, `${this.popped} bat${this.popped === 1 ? '' : 's'} and ${this.orbsPopped} orb${this.orbsPopped === 1 ? '' : 's'} popped!`, bx, 196, 26, '#fff6e0', FONT, 0.24, 'center'); if (!this.leaked) HUD.outlined(ctx, 'No BONKS, no ZAPS! A perfect sea!', bx, 232, 24, '#ffe066', FONT, 0.24, 'center'); else if (!this.zaps) HUD.outlined(ctx, 'No ZAPS! Great shooting!', bx, 232, 24, '#ffe066', FONT, 0.24, 'center'); HUD.outlined(ctx, `BONKS ${this.leaked - this.zaps}    ZAPS ${this.zaps}`, bx, 266, 20, '#f4e8ff', FONT, 0.24, 'center'); }
      ctx.restore();
    }
    if (this.state === 'ride' && this.hint < 700) {   // (the controls, in the ride's first seconds)
      const id = this.crew[0]?.ctrl || 'any', touch = this.app.lastCtrl === 'touch' && (id === 'any' || id === 'touch');
      const humans = this.crew.filter((c) => c.human), many = humans.length > 1;
      const groups = touch ? [['Steer your SIGHT with the stick!'], ['FIRE pops bats'], ['SUPER when the bar is full']]   // (its keys drawn as the select screen draws them: QAF3)
        : many ? [['Move your sight!'], ['FIRE (hold it!):', ...humans.flatMap((c, i) => [...(i ? [{ gap: 6 }] : []), `P${c.slot + 1}`, { act: 'attack', ctrl: c.ctrl }])], ['KRAKEN SMASH:', ...this.smashParts()]]
        : [['Move your sight!'], [{ act: 'attack', ctrl: id }, 'fires (hold it!)'], [{ act: 'special', ctrl: id }, 'KRAKEN SMASH']];
      ctx.save(); ctx.globalAlpha = clamp((700 - this.hint) / 40, 0, 1);
      const LO = { px: 18, font: '"Comic Neue", "Comic Sans MS", sans-serif', plain: true }, join = (gs) => gs.flatMap((g2, i) => [...(i ? [{ gap: 14 }] : []), ...g2]);
      const sig = [touch, this.app.lastCtrl, id, ...humans.map((c) => `${c.slot}:${c.ctrl}:${this.app.glyphText?.('attack', c.ctrl)}:${this.app.glyphText?.('special', c.ctrl)}`)].join('|');
      if (!this._hintL || this._hintL.sig !== sig) {   // (laid out once per set of controls -- critic B)
      let lines = [join(groups)];
      if (this.keyLine(ctx, lines[0], 0, 0, LO, false) > 830) {   // (too wide for one line inside the safe area: two lines, split between whole groups, the halves as even as can be)
        let best = null;
        for (let i = 1; i < groups.length; i++) { const a = join(groups.slice(0, i)), b = join(groups.slice(i)), w2 = Math.max(this.keyLine(ctx, a, 0, 0, LO, false), this.keyLine(ctx, b, 0, 0, LO, false)); if (!best || w2 < best[0]) best = [w2, a, b]; }
        if (best) lines = [best[1], best[2]];
      }
      this._hintL = { sig, lines, tw: Math.min(862, Math.max(...lines.map((l) => this.keyLine(ctx, l, 0, 0, LO, false))) + 30) };
      }
      const { lines, tw } = this._hintL, bh = 10 + 30 * lines.length, by = 511 - bh;
      ctx.fillStyle = '#ffe58a'; ctx.fillRect(W / 2 - tw / 2, by, tw, bh); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeRect(W / 2 - tw / 2, by, tw, bh);
      lines.forEach((l, i) => this.keyLine(ctx, l, W / 2, by + 5 + 15 + 30 * i + 6.5, LO, true));
      ctx.restore();
    }
  }
}
