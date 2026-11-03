// SKULL ISLAND's foes, part two (docs/SKULL_ISLAND.md, src/silevels.js): the Kraken's small fry.
//   crab  the STORM CRAB: a cross little teal crab with orange pincers.  It scuttles up from the sides, cocks a pincer (a telegraphed
//         wind-up) and pinches.  Beaten, it lands on its back with its legs wiggling, then scuttles off.
//   collarimp  the COLLAR IMP: one of Malachar's purple imps (a tiny spiked collar like the Kraken's).  It hovers near a hero, giggles, then
//         dives in a swoop.  Knocked out of the air it tumbles and flaps away squeaking.  Imps ride the tentacles: a slam may carry one up.
// Spawn: { k: 'crab' } | { k: 'collarimp' }.  (src/sifoes.js is the sailors and the lasso / net.)
import { Enemy } from './enemies.js';
import { boxOf, GRAV } from './actors.js';
import { audio } from './audio-proxy.js';
import { W, DEPTH } from './config.js';
import { clamp } from './rig.js';
import { strikeZone, windSound } from './sitele.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const lo = (g) => (g.lane ? g.lane[0] : 6), hi = (g) => (g.lane ? g.lane[1] : DEPTH - 6);

// ================================================================================================== STORM CRAB
const CRAB = { hp: 26, sp: 2.3, wind: 36, dmg: 6, cool: [60, 110], range: [48, 62] };
const CRAB_NAMES = ['SNIPPY', 'PINCHY', 'CLICKER', 'NIPPER', 'BARNEY'];
let crabN = 0;
export class StormCrab extends Enemy {
  drawShadow(ctx) { super.drawShadow(ctx); if (this.state === 'windup') strikeZone(ctx, this, 10, 116, this.st / this.K.wind, { halfH: 12 }); }   // (its snip lands here: src/sitele.js)
  constructor(game, x, y, opt = {}) {
    super(game, x, y, { name: opt.name || CRAB_NAMES[crabN++ % CRAB_NAMES.length] });
    this.art = 'crab'; this.K = CRAB; this.hp = this.maxHp = CRAB.hp;
    this.w = 24; this.h = 52; this.shadowR = 30; this.balloonH = 90; this.score = 400;
    this.range = rnd(...CRAB.range); this.scale = 1.15;
    this.set('approach');
  }
  onHurtSfx() { audio.sfx('hit_shell'); }
  update() {
    const g = this.game, p = this.player, K = this.K;
    this.tick();
    if (this.cool > 0) this.cool--;
    switch (this.state) {
      case 'approach': case 'wait': case 'taunt': this.think(p); break;
      case 'windup':
        this.vx = this.vy = 0;
        if (this.st === 1) windSound(this, 'snip');
        if (this.st >= K.wind) { this.set('snip'); this.hitDone = false; audio.sfx('swing_light', { pitch: 1.5 }); }
        break;
      case 'snip':
        if (!this.hitDone && this.st >= 5 && this.st <= 11) {
          const b = boxOf(this, { x0: 10, x1: 112, z0: 0, z1: 80, dy: 18 });   // (r4's claw thrusts long, jaws open: ~106 px at the hit drawing)
          if (this.hitHeroes(b, { dmg: K.dmg, kind: 'light', push: 3, stun: 18, stop: 4, sfx: 'hit_light' })) this.hitDone = true;
        }
        if (this.st === 7) audio.sfx('block', { pitch: 1.9, vol: 0.5 });
        if (this.st >= 22) { this.releaseToken(); this.cool = rnd(...K.cool); this.set('wait'); }
        break;
      case 'hurt': this.vx *= 0.8; if (this.st >= this.stun) this.set('wait'); break;
      case 'fly': this.flyUpdate(); break;
      case 'down': this.downUpdate(70); break;   // (on its back, legs wiggling, a good while)
      case 'getup': if (this.st >= 24) { this.set('wait'); this.cool = Math.max(this.cool, 30); } break;
      case 'dying': this.dyingUpdate(); break;
    }
    if (this.state === 'approach' || this.state === 'wait') this.separate();
    this.integrate();
    void g;
  }
  think(p) {
    const K = this.K;
    if (!p.alive || p.down || p.state === 'victory') { this.moveTo(p.x + (this.x < p.x ? -1 : 1) * 160, clamp(p.y + this.yOff * 3, lo(this.game), hi(this.game)), K.sp * 0.7); this.set(this.vx || this.vy ? 'approach' : 'taunt'); this.face(p); return; }
    const tx = this.standX(p, this.range), ty = clamp(p.y + (this.cool > 20 ? this.yOff : 0), lo(this.game), hi(this.game));
    if (this.cool <= 0 && Math.abs(this.x - tx) < 12 && Math.abs(this.y - p.y) < 10 && this.entered && this.takeToken()) { this.face(p); this.windup('windup'); return; }
    const sp = this.cool > 30 && Math.abs(this.x - p.x) < 130 ? K.sp * 0.5 : K.sp;
    if (this.moveTo(tx, ty, sp)) { this.set('wait'); this.face(p); }
    else { this.set('approach'); this.ph = (this.ph + 0.045 * sp / 2) % 1; if (Math.abs(this.x - p.x) < 150) this.face(p); else if (Math.abs(this.vx) > 0.2) this.facing = Math.sign(this.vx); }
  }
  pose() {
    const g = this.game;
    switch (this.state) {
      case 'approach': return this.anim('walk', this.ph);
      case 'wait': return this.anim('idle', g.time + this.ph * 3);
      case 'taunt': return this.anim('taunt', g.time + this.ph * 3);
      case 'windup': return this.anim('windup', Math.min(1, this.st / this.K.wind));
      case 'snip': return this.anim('snip', Math.min(1, this.st / 22));
      case 'hurt': return this.anim('hurt', Math.min(1, this.st / this.stun));
      case 'fly': return this.bounced ? this.anim('down', g.time) : this.anim('fly');   // (after its first bounce: the on-its-back drawing, not a hard cut at the landing)
      case 'down': case 'dying': return this.anim('down', g.time);
      case 'getup': return this.anim('getup', Math.min(1, this.st / 24));
      default: return this.anim('idle', g.time);
    }
  }
}

// ================================================================================================== COLLAR IMP
const IMP = { hp: 22, hover: 74, wind: 36, dur: 40, speed: 6.6, steep: 1.6, dmg: 7, score: 600 };
const IMP_NAMES = ['ZIP', 'PIP', 'SNIT', 'GRIN', 'FIZZ'];
let impN = 0;
export class CollarImp extends Enemy {
  drawShadow(ctx) { super.drawShadow(ctx); if (this.state === 'diveWind') strikeZone(ctx, this, 0, 270, this.st / this.K.wind, { halfH: 16, col: '220,80,255', rim: '#f2d0ff' }); }   // (its dive's path on the deck: src/sitele.js)
  constructor(game, x, y, opt = {}) {
    super(game, x, y, { name: opt.name || IMP_NAMES[impN++ % IMP_NAMES.length] });
    this.art = 'collarimp'; this.K = IMP; this.hp = this.maxHp = IMP.hp;
    this.w = 24; this.h = 44; this.hz0 = 6; this.depthR = 6; this.scale = 1.1;
    this.z = IMP.hover; this.flying = true; this.shadowR = 22; this.balloonH = 120; this.score = IMP.score;
    this.dist = rnd(150, 210);
    this.set('hover');
  }
  get hittable() { return this.alive && this.inv <= 0 && ['hover', 'diveWind', 'dive', 'hurt', 'rise'].includes(this.state); }
  onHurtSfx() { audio.sfx('whelp_chirp', { pitch: 1.5 }); }
  update() {
    const g = this.game, p = this.player, K = this.K;
    this.tick();
    if (this.cool > 0) this.cool--;
    const bob = Math.sin(g.time * 3.4 + this.ph * 6) * 7;
    switch (this.state) {
      case 'hover': {
        const side = this.x < p.x ? -1 : 1;
        const tx = clamp(p.x + side * this.dist, g.camX + 70, g.camX + W - 70), ty = clamp(p.y + this.yOff, lo(g), hi(g));
        this.vx = clamp((tx - this.x) * 0.04, -2.4, 2.4); this.vy = clamp((ty - this.y) * 0.05, -1.4, 1.4);
        this.z += (K.hover + bob - this.z) * 0.1;
        this.face(p);
        if (this.cool <= 0 && this.entered && Math.abs(tx - this.x) < 60 && Math.abs(this.y - p.y) < 16 && p.alive && !p.down && this.takeToken()) {
          this.vx = this.vy = 0; this.windup('diveWind'); audio.sfx('whelp_chirp', { pitch: 1.9 });
        }
        break;
      }
      case 'diveWind':
        if (this.st === 1) windSound(this, 'dive');
        this.z += (K.hover + 30 - this.z) * 0.12;
        if (this.st >= K.wind) { this.set('dive'); this.hitDone = false; this.z0 = this.z; audio.sfx('swing_heavy', { pitch: 1.4 }); }
        break;
      case 'dive': {
        const u = Math.min(1, this.st / K.dur);
        this.vx = this.facing * K.speed; this.vy = clamp((p.y - this.y) * 0.05, -1, 1);
        this.z = 26 + (this.z0 - 26) * Math.pow(Math.abs(u * 2 - 1), K.steep);
        if (!this.hitDone && p.hittable && Math.abs(p.x - this.x) < 34 && Math.abs(p.y - this.y) < 18 && this.z < p.z + 120) {
          this.hitDone = true;
          p.takeHit(this, { dmg: K.dmg, kind: 'light', push: 4, stun: 20, stop: 5, sfx: 'hit_light', spark: 'purple' });
        }
        if (this.st >= K.dur) { this.releaseToken(); this.cool = rnd(110, 170); this.set('hover'); this.vx = 0; }
        break;
      }
      case 'hurt': this.vx *= 0.85; this.vy = 0; if (this.st >= this.stun) this.set('hover'); break;
      case 'fly':
        this.vz -= GRAV * 0.8; this.z = Math.max(0, this.z + this.vz);
        if (this.z <= 0) { this.z = 0; this.vx = 0; this.set('down'); audio.sfx('knockdown', { pitch: 1.4 }); g.fx.dust(this.x, this.y, 4, 18); }
        break;
      case 'down':
        this.vx = this.vy = 0;
        if (this.st >= (this.hp <= 0 ? 26 : 50)) { if (this.hp <= 0) this.flee(); else this.set('rise'); }
        break;
      case 'rise': this.z += (K.hover - this.z) * 0.08; if (this.st >= 30) { this.set('hover'); this.cool = 50; } break;
      case 'flee':
        this.vx = this.facing * 3.2; this.vy = 0; this.z += 2.4;
        if (this.st >= 140 || this.z > 520) this.gone = true;
        break;
    }
    this.x += this.vx; if (this.state !== 'fly') this.y += this.vy;
    this.clampDepth();
    if (!this.entered && this.x > g.camX + 30 && this.x < g.camX + W - 30) this.entered = true;
    if (this.entered && this.state !== 'flee') this.x = clamp(this.x, g.camX + 22, g.camX + W - 22);
  }
  knock(dir, lift, push) { this.releaseToken(); this.set('fly'); this.vz = Math.min(lift, 4); this.vx = dir * push * 0.8; }
  /** beaten: off it flaps, home -- kid-friendly, nobody's hurt */
  flee() {
    const g = this.game;
    this.alive = false; this.set('flee');
    this.facing = this.x < g.camX + W / 2 ? -1 : 1;
    g.fx.label(clamp(this.x, g.camX + 80, g.camX + W - 80), this.y, 90, pick(['EEP!', 'SQUEAK!', 'WAAH!']), '#f2d8ff', 24, 50);
    audio.sfx('whelp_chirp', { pitch: 2.1 });
    g.score += this.score; g.onFoeGone(this);
  }
  pose() {
    const g = this.game;
    switch (this.state) {
      case 'hover': case 'rise': return this.anim('hover', g.time + this.ph * 2);
      case 'flee': return this.anim('flee', g.time + this.ph * 2);
      case 'diveWind': return this.anim('diveWind', Math.min(1, this.st / this.K.wind));
      case 'dive': return this.anim('swoop', Math.min(1, this.st / this.K.dur));
      case 'hurt': return this.anim('hurt', Math.min(1, this.st / this.stun));
      case 'fly': return this.anim('fly_knock', Math.min(1, this.st / 24));
      case 'down': if (this.paintedClip('bounce')) return this.st < 5 ? this.anim('bounce') : this.anim('down', Math.min(1, this.st / 20));   // (painter 2: the squash at the floor, the rebound, settled)
        return this.anim('down', (this.st % 24) / 24);
      default: return this.anim('hover', g.time);
    }
  }
}
