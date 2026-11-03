// SKULL ISLAND stage 3c, "THE CELL OF SLOTH" (docs/SKULL_ISLAND.md, src/silevels.js): the book's lesson is NEVER GIVE UP -- and never give up on a friend.
//   YAWN FOG   (src/siworld.js stepCell): standing still makes a hero SLEEPY -- slower, then a short nap (mash to wake); moving and fighting keep them awake.
//   SlothSlime a grey-green jelly that crawls, squashes and LEAPS at you (a ring on the floor first); where it lands you get GOO: slow, until you roll or fight it off.  Hit hard: SPLAT, a puddle.
//   SlothBeast the boss, a giant slime that rises out of the pit's drain.  It SLAMS (a red ring), SPITS little slimes, YAWNS (a wave of sleepiness: roll through it) and GULPS:
//                a green ring under a hero -- caught in it, the hero is SWALLOWED (you can see them inside).  They mash to wriggle; their FRIENDS rescue them: BEND the iron bars
//                (Dodongo's club: one whack; anyone else: three), FLASH its eyes with light (a fire shot, a spell, a charged hit, a super), or throw the ROPE (pick up a coil and throw it,
//                or Shadow's / Scarlet's grappling hook).  Each fills the rescue meter; full, it spits them out -- and it is GROGGY a while: now it can be hurt.  A lone hero's mashing
//                is enough.  A swallow ALWAYS ends: never a loss.  "Pirates... NEVER... give UP!" -- "You didn't give up on me." -- "Never. That's what a crew does."
//                Hurt enough, it SPLATS into puddles.
// Nobody is hurt for real: a slime only bumps and gooes, the Beast only bumps, and a swallowed hero takes no damage.
import { Enemy, CHARS } from './enemies.js';
import { SIBoss, clipDrawings } from './sibosses.js';
import { Actor, boxOf } from './actors.js';
import { isLight } from './mmworld.js';
import { baseOf } from './heroes.js';
import { audio } from './audio-proxy.js';
import { W, DEPTH, FLOOR_TOP, INK } from './config.js';
import { clamp, TAU } from './rig.js';
import { windSound, rimGlow } from './sitele.js';
import * as SIFX from './sifx.js';   // (Book 2's material particles: the FX agent's src/sifx.js)

const rnd = (a, b) => a + Math.random() * (b - a);
/** flash safety: a telegraph's last-moment urgency is a smooth ~1.9 Hz pulse (0.55..1), never an on/off blink */
const pulse = (n) => 0.775 + 0.225 * Math.cos(n * 0.2);
const pick = (a) => a[(Math.random() * a.length) | 0];
const lo = (g) => (g.lane ? g.lane[0] : 6), hi = (g) => (g.lane ? g.lane[1] : DEPTH - 6);
const live = (g) => g.players.filter((p) => !p.out && p.alive);
const inEll = (p, cx, cy, rx) => { const ex = (p.x - cx) / rx, ey = (p.y - cy) / (rx * 0.36); return ex * ex + ey * ey <= 1; };

// ------------------------------------------------------------------------------------------------ the sloth slimes
const SLIME = { hp: 30, sp: 0.95, wind: 36,   // (QA2: 28 f -- 36 for 6-year-olds)
  leapT: 34, dmg: 4, cool: [90, 150], R: 48 };
const SLIME_NAMES = ['GLOOP', 'SPLODGE', 'BLOB', 'SLURP', 'GOOP', 'SQUISH'];
let slimeN = 0;
export class SlothSlime extends Enemy {
  constructor(game, x, y, opt = {}) {
    super(game, x, y, { name: opt.name || SLIME_NAMES[slimeN++ % SLIME_NAMES.length] });
    this.art = 'slothslime'; this.K = SLIME; this.hp = this.maxHp = SLIME.hp; this.scale = 1.1;
    this.w = 26; this.h = 54; this.shadowR = 34; this.balloonH = 92; this.score = 350; this.range = rnd(118, 150);
    this.aim = null; this.set('approach');
    game.mm?.slimeHint?.();
  }
  onHurtSfx() { audio.sfx('hit_slime'); }
  update() {
    const g = this.game, p = this.player, K = this.K;
    this.tick();
    if (this.cool > 0) this.cool--;
    switch (this.state) {
      case 'approach': case 'wait': case 'taunt': this.think(p); break;
      case 'windup':
        this.vx = this.vy = 0;
        if (this.st === 1) windSound(this, 'snip');
        if (this.st < 14 && p.alive) this.aim = { x: clamp(p.x, g.camX + 40, g.camX + W - 40), y: clamp(p.y, lo(g), hi(g)) };   // (it locks where you were a moment ago: step away)
        if (this.st >= K.wind) { this.set('leap'); this.x0 = this.x; this.y0 = this.y; this.hitDone = false; audio.sfx('swing_light', { pitch: 0.5, vol: 0.7 }); }
        break;
      case 'leap': {
        const u = Math.min(1, this.st / K.leapT), A = this.aim || { x: this.x, y: this.y };
        this.vx = this.vy = 0; this.x = this.x0 + (A.x - this.x0) * u; this.y = this.y0 + (A.y - this.y0) * u; this.z = 82 * Math.sin(Math.PI * u);
        if (u >= 1) { this.z = 0; this.land(); }
        break;
      }
      case 'land': this.vx = this.vy = 0; if (this.st >= 30) { this.releaseToken(); this.cool = rnd(...K.cool); this.set('wait'); } break;
      case 'hurt': this.vx *= 0.8; if (this.st >= this.stun) this.set('wait'); break;
      case 'fly': this.flyUpdate(); break;
      case 'down': this.downUpdate(46); break;
      case 'getup': if (this.st >= 22) { this.set('wait'); this.cool = Math.max(this.cool, 30); } break;
      case 'dying': this.dyingUpdate(); break;
    }
    if (this.state === 'approach' || this.state === 'wait') this.separate();
    if (this.state !== 'leap') this.integrate();
    else this.clampDepth?.();
    void g;
  }
  /** it lands where it aimed: anyone there gets bumped and GOOED */
  land() {
    const g = this.game, K = this.K, A = this.aim || this;
    this.set('land'); g.fx.dust?.(this.x, this.y, 5, 26); audio.sfx('slime_splat', { vol: 0.6 });
    for (const q of g.players) {
      if (!q.hittable || q.out || q.z > 40 || !inEll(q, A.x, A.y, K.R + 6)) continue;
      q.takeHit(this, { dmg: K.dmg, kind: 'light', push: 1.5, stun: 14, stop: 3, sfx: 'hit_light', spark: 'warm' });
      g.mm?.goo?.(q);
    }
  }
  think(p) {
    const K = this.K, g = this.game;
    if (!p.alive || p.down || p.state === 'victory') { this.moveTo(p.x + (this.x < p.x ? -1 : 1) * 170, clamp(p.y + this.yOff * 3, lo(g), hi(g)), K.sp * 0.7); this.set(this.vx || this.vy ? 'approach' : 'taunt'); this.face(p); return; }
    const ty = clamp(p.y + (this.cool > 20 ? this.yOff : 0), lo(g), hi(g)), dx = Math.abs(this.x - p.x);
    if (this.cool <= 0 && dx < this.range + 30 && dx > 70 && Math.abs(this.y - p.y) < 22 && this.entered && this.takeToken()) { this.face(p); this.aim = { x: p.x, y: p.y }; this.windup('windup'); return; }
    const tx = this.standX(p, this.range - 10);
    if (this.moveTo(tx, ty, K.sp)) { this.set('wait'); this.face(p); }
    else { this.set('approach'); this.ph = (this.ph + 0.024 * K.sp) % 1; if (dx < 170) this.face(p); else if (Math.abs(this.vx) > 0.2) this.facing = Math.sign(this.vx); }
  }
  die() { this.set('dying'); this.alive = false; this.releaseToken(); this.game.fx.word(this.x, this.y, 70, true, 'SPLAT!'); audio.sfx('slime_splat'); SIFX.splash(this.x, this.y, 'slime'); }
  dyingUpdate() {
    const g = this.game;
    if (this.st >= 32) { this.gone = true; g.score += this.score; g.onFoeGone(this); g.actors.push(new SlimePuddle(g, this.x, this.y, CHARS.slothslime && CHARS.slothslime.ATLAS_SCALE ? 1.8 : 1)); }   // (the pack's splat is a ~153 px blob: the puddle matches)
  }
  draw(ctx) {   // (its leap's wind-up: a yellow-green rim -- danger now)
    if (this.alive && this.state === 'windup') rimGlow(ctx, this, '#d8ff6a', 0.3 + 0.45 * Math.min(1, this.st / this.K.wind));
    super.draw(ctx);
  }
  drawShadow(ctx) {   // the landing ring (a green ring; it fills as the leap nears): step out of it
    if (!['windup', 'leap'].includes(this.state) || !this.aim) return;
    const K = this.K, k = this.state === 'leap' ? 1 : Math.min(1, this.st / K.wind), sx = this.aim.x - this.game.camX, sy = FLOOR_TOP + this.aim.y, R = K.R + 6;
    ctx.save();
    ctx.globalAlpha = 0.26 + 0.28 * k; ctx.fillStyle = 'rgb(120,220,110)'; ctx.beginPath(); ctx.ellipse(sx, sy, R, R * 0.36, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = INK; ctx.lineWidth = 7; ctx.beginPath(); ctx.ellipse(sx, sy, R * (1.12 - 0.12 * k), R * 0.36 * (1.12 - 0.12 * k), 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#d8ffb0'; ctx.lineWidth = 3; ctx.setLineDash([9, 6]); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
  }
  pose() {
    const g = this.game;
    switch (this.state) {
      case 'approach': return this.anim('crawl', this.ph);
      case 'wait': case 'taunt': return this.anim('idle', g.time + this.ph * 3);
      case 'windup': return this.anim('windup', Math.min(1, this.st / this.K.wind));
      case 'leap': return this.anim('leap', Math.min(1, this.st / this.K.leapT));
      case 'land': return this.anim('land', Math.min(1, this.st / 18));
      case 'hurt': return this.anim('hurt', Math.min(1, this.st / this.stun));
      case 'fly': return this.anim('fly');
      case 'down': return this.anim('down', g.time);
      case 'getup': return this.anim('getup', Math.min(1, this.st / 22));
      case 'dying': return this.anim('splat', Math.min(1, this.st / 30));
      default: return this.anim('idle', g.time);
    }
  }
}

/** what a splatted slime leaves: a puddle that dries up slowly (under everyone) */
export class SlimePuddle extends Actor {
  constructor(game, x, y, k = 1) {
    super(game, x, y);
    this.team = 'fx'; this.solid = false; this.shadowR = 0; this.life = 900; this.k = k; this.w = 0; this.h = 0; this.rot = Math.random() * 0.6 - 0.3; this.blobs = Array.from({ length: 4 }, () => ({ x: rnd(-22, 22) * k, y: rnd(-3, 3), r: rnd(8, 16) * k }));
  }
  get hittable() { return false; }
  update() { this.tick(); if (this.st >= this.life) this.gone = true; }
  drawShadow(ctx) {
    const sx = this.x - this.game.camX, sy = FLOOR_TOP + this.y, a = Math.min(1, (this.life - this.st) / 240) * 0.8;
    if (sx < -120 || sx > W + 120) return;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(sx, sy); ctx.rotate(this.rot);
    ctx.fillStyle = '#6a9a72'; ctx.strokeStyle = 'rgba(14,30,20,0.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, 40 * this.k, 11 * this.k, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#86b48c'; for (const b of this.blobs) { ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r, b.r * 0.34, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.ellipse(-8 * this.k, -3 * this.k, 14 * this.k, 2.2 * this.k, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  draw() {}
}

// ------------------------------------------------------------------------------------------------ the bars and the rope
/** a freestanding iron gate (the pit's bars): while a hero is swallowed, WHACK it: Dodongo's club bends it in one go (anyone else: three hits); each fills the rescue meter */
export class BarGate extends Actor {
  constructor(game, x, y) {
    super(game, x, y);
    this.team = 'prop'; this.solid = false; this.w = 50; this.h = 150; this.shadowR = 46; this.dent = 0; this.bent = false; this.bendK = 0; this.flash = 0; this.sortY = y;
  }
  get hittable() { const B = this.game.boss; return this.alive && !this.bent && !!(B && B.swallowed); }
  takeHit(att, hd) {
    const g = this.game, B = g.boss;
    if (!this.hittable) return false;
    const dod = baseOf(att.heroId) === 'dodongo' || att.heroId === 'dragon';
    this.flash = 6; this.dent = dod ? 3 : this.dent + 1;
    audio.sfx('hit_heavy', { pitch: dod ? 0.55 : 0.85 }); g.shake = Math.max(g.shake, 4); g.fx.spark?.(this.x, this.y, 80, true, 'warm');
    if (this.dent >= 3) { this.bent = true; B.addRescue(dod ? 36 : 14, 'BARS BENT!'); g.fx.word(this.x, this.y, 170, true, 'BEND!'); }
    else { B.addRescue(11, ''); g.fx.word(this.x, this.y, 150, false, pick(['CLANG!', 'DENT!'])); }
    return true;
  }
  reset() { this.dent = 0; this.bent = false; }
  update() { this.tick(); this.bendK += ((this.bent ? 1 : this.dent / 3 * 0.5) - this.bendK) * 0.18; if (this.flash > 0) this.flash--; }
  draw(ctx) {
    const g = this.game, sx = this.sx, sy = this.sy, k = this.bendK;
    ctx.save(); ctx.translate(sx, sy); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const base = this.flash > 3 ? '#e8c090' : '#80502f';
    // the foot slab and the lintel
    ctx.fillStyle = '#5a6660'; ctx.strokeStyle = INK; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.rect(-62, -10, 124, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4a5650'; ctx.beginPath(); ctx.rect(-62, -150, 124, 12); ctx.fill(); ctx.stroke();
    // the bars: they bow out in the middle as they bend
    for (let i = 0; i < 7; i++) {
      const x = -50 + i * 16.7, mid = 1 - Math.pow((i - 3) / 3, 2), bow = k * 46 * mid * (i < 3 ? -0.35 : 1);
      ctx.strokeStyle = INK; ctx.lineWidth = 8.4; ctx.beginPath(); ctx.moveTo(x, -10); ctx.quadraticCurveTo(x + bow * 1.4, -78, x, -140); ctx.stroke();
      ctx.strokeStyle = base; ctx.lineWidth = 5; ctx.stroke(); ctx.strokeStyle = 'rgba(255,210,150,0.55)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x - 1.4, -12); ctx.quadraticCurveTo(x - 1.4 + bow * 1.4, -78, x - 1.4, -138); ctx.stroke();
    }
    for (const y of [-48, -100]) { ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(-54, y); ctx.lineTo(54, y); ctx.stroke(); ctx.strokeStyle = '#6a4226'; ctx.lineWidth = 5.4; ctx.stroke(); }
    ctx.restore();
  }
  /** the call while someone is swallowed: a bouncing BEND! sign over the gate */
  drawOverMM(ctx) {
    const g = this.game, B = g.boss;
    if (!this.hittable || !B?.swallowed || !live(g).some((q) => q !== B.swallowed)) return;
    const by = this.sy - 176 - Math.abs(Math.sin(g.time * 5)) * 8;
    ctx.save(); ctx.font = 'bold 28px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = 7; ctx.strokeStyle = INK;
    ctx.strokeText('BEND THE BARS!', this.sx, by); ctx.fillStyle = '#ffb02e'; ctx.fillText('BEND THE BARS!', this.sx, by);
    ctx.fillStyle = '#ffb02e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(this.sx - 11, by + 8); ctx.lineTo(this.sx + 11, by + 8); ctx.lineTo(this.sx, by + 24); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
}

/** a coil of rope on the floor while a hero is swallowed: PICK IT UP and THROW it at the Beast (a liftable, like the Kraken's lantern) */
export class RopeCoil extends Actor {
  constructor(game, x, y) {
    super(game, x, y);
    this.team = 'item2'; this.solid = false; this.w = 14; this.h = 30; this.liftable = true; this.carrier = null; this.flying = false; this.thrower = null; this.z = 120; this.vz = 0; this.shadowR = 18; this.life = 60 * 30; this.kind = 'ropecoil';
  }
  get hittable() { return false; }
  pickUp(p) { this.carrier = p; this.liftable = false; }
  drop(p) { this.carrier = null; this.liftable = true; this.z = 0; this.x = p.x + p.facing * 20; this.y = p.y; }
  throwFrom(p, dir) {
    const cp = p.carryPoint();
    this.carrier = null; this.flying = true; this.thrower = p;
    this.x = cp.x; this.y = cp.y; this.z = cp.z; this.vx = dir * 10; this.vz = 4; this.facing = dir;
  }
  update() {
    const g = this.game;
    this.tick();
    if (this.carrier) { const cp = this.carrier.carryPoint(); this.x = cp.x; this.y = cp.y; this.z = cp.z; this.sortY = this.carrier.y + 0.1; return; }
    this.sortY = undefined;
    if (!this.flying) {
      if (this.z > 0 || this.vz) { this.z += this.vz; this.vz -= 0.55; if (this.z <= 0) { this.z = 0; this.vz = 0; } }
      if (!g.boss?.swallowed || --this.life <= 0) this.gone = true;
      return;
    }
    this.x += this.vx; this.z += this.vz; this.vz -= 0.14;
    const B = g.boss;
    if (B && B.ropeHit?.(this)) { this.gone = true; return; }
    if (this.z <= 0 || this.x < g.camX - 60 || this.x > g.camX + W + 60) { this.gone = true; g.fx.dust?.(this.x, this.y, 3, 16); }
  }
  draw(ctx) {
    if (this.gone) return;
    const g = this.game, sx = this.sx, sy = this.sy;
    if (!this.carrier && !this.flying) {
      const near = g.players.find((p) => !p.out && !p.carry && Math.abs(p.x - this.x) < 40 && Math.abs(p.y - this.y) < 20);
      if (near && this.z < 4) { ctx.save(); ctx.globalAlpha = 0.85 + 0.15 * Math.sin(g.time * 6); g.app.drawGlyph(ctx, 'attack', near.ctrlId, sx, sy - 62, 24); ctx.font = 'bold 12px "Comic Neue", sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeText('PICK UP, THROW AT THE BEAST', sx, sy - 40); ctx.fillStyle = '#fff'; ctx.fillText('PICK UP, THROW AT THE BEAST', sx, sy - 40); ctx.restore(); }
    }
    ctx.save(); ctx.translate(sx, sy);
    if (this.flying) ctx.rotate(this.st * 0.3 * (this.facing || 1));
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.3 + 0.12 * Math.sin(g.time * 8); ctx.fillStyle = '#ffd88a'; ctx.beginPath(); ctx.arc(0, -14, 30, 0, TAU); ctx.fill(); ctx.restore();
    // the coil: three turns of rope and a loose end
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const r = 15 - i * 4; ctx.strokeStyle = INK; ctx.lineWidth = 8; ctx.beginPath(); ctx.ellipse(0, -12 - i * 3, r, r * 0.62, 0, 0, TAU); ctx.stroke(); ctx.strokeStyle = '#d2b47c'; ctx.lineWidth = 4.6; ctx.stroke(); ctx.strokeStyle = 'rgba(120,80,40,0.5)'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]); }
    ctx.strokeStyle = INK; ctx.lineWidth = 6.4; ctx.beginPath(); ctx.moveTo(10, -10); ctx.quadraticCurveTo(24, -4, 26, 6); ctx.stroke(); ctx.strokeStyle = '#d2b47c'; ctx.lineWidth = 3.4; ctx.stroke();
    ctx.restore();
  }
}

// ------------------------------------------------------------------------------------------------ THE SLOTH BEAST
const BEAST = { hp: 360, rounds: 3, groggy: 480, chew: 780, chewSolo: 480, mashSolo: 4.5, R: 80, slamR: 112 };   // (alone: a shorter chew, a press worth more -- QAF M-A)
/** three stars spinning round a dazed head (the Sloth Beast groggy: the safe-to-hit cue) */
function groggyStars(ctx, x, y, frame) {
  ctx.save(); ctx.fillStyle = '#ffe066'; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  for (let i = 0; i < 3; i++) {
    const a = frame * 0.06 + i * TAU / 3, sx = x + Math.cos(a) * 46, sy = y + Math.sin(a) * 12, r = 11;
    ctx.beginPath(); for (let j = 0; j < 10; j++) { const b = -Math.PI / 2 + j * Math.PI / 5, rr = j % 2 ? r * 0.45 : r; ctx.lineTo(sx + Math.cos(b) * rr, sy + Math.sin(b) * rr); } ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}
export class SlothBeast extends SIBoss {
  constructor(game, x, y, opt = {}) {
    super(game, x, y, opt, 'THE SLOTH BEAST', 'The Sleepiest Slime Under the Cliffs', BEAST.hp);
    this.art = 'slime'; this.scale = 4.2; this.w = 120; this.h = 210; this.shadowR = 150; this.balloonH = 250; this.talkGap = 340; this.ownFinish = true; this.hideFoeBars = false; this.sortY = -60;   // (behind every hero: nobody is hidden by the Beast)
    this.rescue = 0; this.swallowed = null; this.rescues = 0; this.q = []; this.cool = 150; this.chewT = 0; this.lastMash = 0; this.aim = null; this.did = { bars: false, light: false, rope: false }; this.groggyT = 0; this.facing = -1;
  }
  get open() { return !['intro', 'rise', 'splat', 'defeated'].includes(this.state); }
  get hittable() { return this.alive && this.game.fighting && !this.game.cut && this.open; }
  get groggy() { return this.state === 'groggy'; }
  later(frames, fn) { this.q.push({ at: this.game.frame, d: frames, fn }); }
  bossIntro() { this.set('rise'); audio.sfx('roar', { pitch: 0.4 }); this.game.shake = Math.max(this.game.shake, 10); SIFX.splash(this.x, this.y, 'slime', true); }
  bossFight() {
    const g = this.game, m = g.mm;
    this.set('idle'); this.cool = 130; this.gulpAt = g.frame;   // (alone: a gulp at least every 11 s -- QAF M-A)
    for (const [gx, gy] of [[4560, 36], [5270, 36]]) g.actors.push(new BarGate(g, gx, gy));
    const solo = live(g).length < 2;   // (alone there is no friend to rescue: a swallowed hero wriggles out)
    m?.hint?.('sibeast', solo ? `Too slimy to hurt... until it gets GROGGY! || GREEN ring under you = a GULP. ROLL out! || Then hit it while it is GROGGY!` : "Too slimy to hurt... until it gets GROGGY! || GREEN ring under you = a GULP. ROLL out! || A friend got swallowed? Whack the iron BARS!", 420, true);
  }
  keyHint(n) { return n % 2 ? ['sibeastA', 'GREEN ring = a GULP: ROLL out! || RED ring = a slam: step away!'] : live(this.game).length < 2 ? ['sibeastB1', 'Swallowed? MASH to get out! || Then it is GROGGY: hit it!'] : ['sibeastB', "When it gulps a friend: whack the iron BARS, || FLASH its eyes with fire or magic, || or throw a ROPE! Then it is GROGGY: hit it!"]; }
  /** the damage a hit does: groggy, it is hurt; otherwise only a little (never the end of it) */
  dmgOf(att, hd) {
    if (this.swallowed || !this.alive) return 0;
    let d = Math.max(1, Math.round(hd.dmg * (this.groggy ? (live(this.game).length > 1 ? 0.75 : 1) : 0.18)));   // (alone, groggy takes full damage: QAF M-A)
    if (this.groggy && live(this.game).length > 1) {   // (co-op: a groggy window takes at most 45% of it, then it wakes -- QA2 R2: four mashers emptied it in one)
      d = Math.max(0, Math.min(d, Math.round(this.maxHp * 0.45 - (this.gwD || 0)))); this.gwD = (this.gwD || 0) + d;
      if (this.gwD >= this.maxHp * 0.45 - 1 && this.st < this.groggyT - 40) this.st = this.groggyT - 40;   // (full: it wakes up in a moment)
    }
    return d;
  }
  takeHit(att, hd) {
    if (!this.hittable) return false;
    const g = this.game;
    this.flash = 4;
    if (this.swallowed) {   // the rescue: a flash of light in its eyes, a hook's yank
      if (hd.rope && g.frame - (this.ropeAt ?? -99) > 36) { this.ropeAt = g.frame; this.did.rope = true; this.addRescue(36, 'YANK! THE ROPE!'); }
      else if (isLight(att, hd) && g.frame - (this.flashAt ?? -99) > 40) { this.flashAt = g.frame; this.did.light = true; this.addRescue(30, 'FLASH! IT SQUINTS!'); }
      return true;
    }
    const d = this.dmgOf(att, hd);
    this.hp = Math.max(0, this.hp - d); this.ouch = 8; this.hurtAt = g.frame;
    if (!hd.quiet) audio.sfx('hit_slime', { pitch: 0.8 });
    if (d > 0 && this.groggy && g.frame - (this.wordAt ?? -99) > 24) { this.wordAt = g.frame; g.fx.word(this.x + rnd(-40, 40), this.y, 150, false, pick(['SPLORCH!', 'BLORP!', 'SQUISH!'])); }
    if (this.hp <= 0 && this.alive) this.beginSplat();
    g.engage?.(this);
    return true;
  }
  ropeHit(coil) {
    const g = this.game;
    if (!this.swallowed || Math.abs(coil.x - this.x) > this.w + 30 || Math.abs(coil.y - this.y) > 40) return false;
    this.did.rope = true; this.addRescue(36, 'ROPE! HEAVE-HO!'); g.fx.debris?.(coil.x, coil.y, 60, ['#d2b47c', '#a8884c'], 8); audio.sfx('hit_light', { pitch: 0.8 });
    return true;
  }
  /** a rescue action (a bar bent, a flash, a rope): the meter fills */
  addRescue(n, label) {
    const g = this.game;
    if (!this.swallowed) return;
    this.rescue = Math.min(100, this.rescue + n);
    if (label) g.fx.label(this.x + rnd(-50, 50), this.y, 85, label, '#ffd24a', 30, 70);   // (low in the belly: the rescue meter owns the top)
    g.fx.spark?.(this.x + rnd(-30, 30), this.y, 100, true, 'gold'); audio.sfx('freed', { vol: 0.5, pitch: 1.2 });
  }
  update() {
    const g = this.game;
    this.tick();
    if (this.state !== this.gs) { this.gs = this.state; if (this.state === 'groggy') this.gwD = 0; }   // (a new groggy window: its co-op cap starts over -- QA2 R2)
    if (this.ouch > 0) this.ouch--;
    if (this.cool > 0) this.cool--;
    for (let i = this.q.length - 1; i >= 0; i--) { const e = this.q[i]; if (g.frame - e.at >= e.d && !g.cut) { this.q.splice(i, 1); try { e.fn(); } catch (err) { console.error('beast queue', err); } } }
    if (g.cut) return;
    const solo = live(g).length < 2;
    switch (this.state) {
      case 'intro': break;
      case 'rise': if (this.st >= 90) this.set('idle'); break;
      case 'idle': if (g.fighting && this.cool <= 0) this.pickAttack(solo); break;
      case 'slamWind': { if (this.st === 1) windSound(this, 'growl'); const t = this.slamTgt; if (this.st < 22 && t && t.alive && !t.out) this.aim = { x: t.x, y: t.y }; if (this.st >= 46) { this.set('slam'); this.slam(); } break; }
      case 'slam': if (this.st >= 40) { this.set('idle'); this.cool = rnd(110, 160) + (solo ? 40 : 0); } break;
      case 'spitWind':
        // (RC critics: the spit had the GULP ring's tip up -- the slimes' own tip, once, cutting in as it winds up: src/siworld.js slimeHint)
        if (this.st === 1 && !this.spitTip) { this.spitTip = true; g.mm?.slimeHint?.(true); }
        if (this.st >= 36) { this.set('spit'); this.spit(solo); }
        break;
      case 'spit': if (this.st >= 26) { this.set('idle'); this.cool = rnd(120, 170); } break;
      case 'yawnWind': if (this.st === 1) windSound(this, 'growl'); if (this.st >= 52) { this.set('yawn'); this.yawn(); } break;
      case 'yawn': if (this.st >= 56) { this.set('idle'); this.cool = rnd(120, 170); } break;
      case 'gulpWind': { const t = this.gulpTarget; if (this.st < 36 && t && t.alive && !t.out) this.aim = { x: t.x, y: t.y }; if (this.st >= 66) { this.set('gulp'); this.gulp(); } break; }
      case 'gulp': if (this.st >= 28) { if (this.swallowed) { this.set('chew'); this.chewT = 0; } else { this.set('burp'); } } break;
      case 'chew': this.stepChew(solo); break;
      case 'burp': if (this.st >= 34) { this.set('idle'); this.cool = 80; } break;
      case 'groggy': if (this.st >= this.groggyT) { this.set('idle'); this.cool = 100; g.fx.word(this.x, this.y, 250, true, 'WAKING UP!'); } break;
      case 'splat': if (this.st >= 64) this.defeat(); break;   // (the final splat to the clear: ~2 s with the ending cut)
      default: break;
    }
  }
  lead() { const ps = live(this.game); return ps.length ? ps[(Math.random() * ps.length) | 0] : null; }
  pickAttack(solo) {
    const g = this.game, ps = live(g), slimes = g.actors.filter((a) => a instanceof SlothSlime && a.alive).length, roll = Math.random();
    const t = ps[(Math.random() * ps.length) | 0]; if (!t) return;
    this.aim = { x: t.x, y: t.y }; this.slamTgt = t;
    if (!this.swallowed && (roll < 0.4 || (solo && g.frame - (this.gulpAt ?? g.frame) > 660))) { this.gulpAt = g.frame; this.set('gulpWind'); this.gulpTarget = t; g.fx.word(this.x, this.y, 260, true, 'GULP!'); audio.sfx('sloth_inhale'); }
    else if (roll < 0.62) { this.set('slamWind'); }
    else if (roll < 0.82 && slimes < (solo ? 2 : 4)) { this.set('spitWind'); }
    else this.set('yawnWind');
    this.cool = 40;
  }
  // ---------------------------------------------------------------- the attacks
  slam() {
    const g = this.game, A = this.aim || this;
    audio.sfx('explosion', { pitch: 0.55, vol: 0.9 }); g.shake = Math.max(g.shake, 12);
    g.fx.ring(A.x, A.y, { rx: BEAST.slamR, ry: BEAST.slamR * 0.36, shock: true, col: '#9ae890', life: 22 }); g.fx.dust?.(A.x, A.y, 8, 50);
    for (const p of live(g)) { if (!p.hittable || p.z > 30 || !inEll(p, A.x, A.y, BEAST.slamR)) continue; p.takeHit({ x: A.x + (p.x < A.x ? 30 : -30), team: 'hazard', facing: p.x < A.x ? -1 : 1 }, { dmg: 8, kind: 'knock', push: 4.5, lift: 6, stop: 6, sfx: 'hit_heavy', spark: 'warm' }); g.fx.word(p.x, p.y, 150, true, 'SPLAT!'); }
  }
  spit(solo) {
    const g = this.game;
    audio.sfx('sloth_spit');
    for (let i = 0; i < (solo ? 1 : 2); i++) {
      const e = g.spawn({ k: 'slime', side: i ? 'L' : 'R', y: clamp(this.y + rnd(-30, 50), 14, DEPTH - 14) });
      if (e) { e.x = this.x + (i ? -1 : 1) * (this.w * 0.6); e.entered = true; e.set('wait'); e.cool = 40; g.fx.dust?.(e.x, e.y, 4, 20); }
    }
  }
  /** a huge yawn: a wave of sleepiness (a hero rolling through it stays awake) */
  yawn() {
    const g = this.game;
    audio.sfx('yawn'); g.shake = Math.max(g.shake, 6);
    g.fx.ring(this.x, this.y, { rx: 330, ry: 120, shock: true, col: '#bfe8ff', life: 36 });
    g.fx.word(this.x, this.y, 250, true, 'YAAAWN...');
    for (const p of live(g)) { if (p.state === 'dodge' || !inEll(p, this.x, this.y, 330)) continue; g.mm?.drowse?.(p, 0.55); }
  }
  // ---------------------------------------------------------------- the swallow
  gulp() {
    const g = this.game, A = this.aim || this;
    audio.sfx('swing_heavy', { pitch: 0.4, vol: 0.9 }); g.shake = Math.max(g.shake, 8);
    const hits = live(g).filter((p) => p.hittable && p.state !== 'dodge' && p.z < 40 && inEll(p, A.x, A.y, BEAST.R)).sort((a, b) => Math.hypot(a.x - A.x, (a.y - A.y) * 2.4) - Math.hypot(b.x - A.x, (b.y - A.y) * 2.4));
    if (!hits.length) {   // (a dodged gulp: it is STUCK and groggy for a moment -- hit it!)
      g.fx.word(A.x, A.y, 140, true, 'MISSED!'); g.fx.word(this.x, this.y, 270, true, 'STUCK! HIT IT!');
      this.set('groggy'); this.groggyT = 190; this.hurtAt = g.frame; g.mm?.hint?.('sigroggy', 'It MISSED and is STUCK! HIT IT NOW!', 260, true); return;
    }
    this.swallow(hits[0]);
  }
  swallow(p) {
    const g = this.game, m = g.mm;
    if (!m || !m.hold(p, { by: this, kind: 'swallow' })) return;
    this.swallowed = p; this.rescue = 0; this.chewT = 0; this.lastMash = 0; this.did = { bars: false, light: false, rope: false };
    g.fx.word(p.x, p.y, 150, true, 'GULP!'); audio.sfx('sloth_gulp'); g.shake = Math.max(g.shake, 8);
    p.x = this.x; p.y = this.y + 1; p.z = 56;
    for (let i = 0; i < (live(g).length > 1 ? 2 : 0); i++) { const c = new RopeCoil(g, clamp(g.camX + rnd(260, W - 260), g.camX + 100, g.camX + W - 100), rnd(24, 120)); c.z = 140; g.actors.push(c); }
    for (const a of g.actors) if (a instanceof BarGate) a.reset();
    const friends = live(g).filter((q) => q !== p).length;
    const dod = live(g).some((q) => q !== p && baseOf(q.heroId) === 'dodongo');   // (Dodongo's one-hit bend: only when he is the one outside)
    m.hint(friends ? 'sirescue' : 'sirescue1', friends ? `A friend is SWALLOWED! Rescue them: || WHACK the iron BARS!${dod ? ' Dodongo bends them in one hit.' : ''} || FLASH its eyes with fire or magic! || Or pick up a ROPE coil! || THROW it at the Beast!` : `SWALLOWED! MASH ${m.keyName('attack', p)} to wriggle free!`, 480, true);
    this.later(48, () => { if (this.swallowed === p) this.swallowLine(p); });
  }
  swallowLine(p) {
    const g = this.game, id = baseOf(p.heroId), T = { scarlet: 'Pirates... NEVER...\nGIVE UP!', dodongo: 'Heroes... NEVER...\nGIVE UP!', ana: 'Wizards... NEVER...\nGIVE UP!', shadow: '...' };
    g.fx.label(this.x, this.y, 158, (T[id] || '...NEVER GIVE UP!').replace('\n', ' '), '#ffe066', 30, 110);   // (a word over the belly: a balloon would sit on the rescue meter)
  }
  stepChew(solo) {
    const g = this.game, p = this.swallowed;
    if (!p || p.out || !p.alive) { this.endSwallow(false); this.set('groggy'); this.groggyT = 200; return; }   // (the swallowed hero left the game: the Beast carries on)
    const H = g.mm?.holds?.get(p);
    if (!H) { this.spitOut(true); return; }   // (the hold ended some other way: the hero is out)
    if (this.chewT === 0) this.chewF = g.frame - 1;
    this.chewT += g.frame - (this.chewF ?? g.frame - 1); this.chewF = g.frame;   // (wall time: a co-op hit-pause no longer stretches the chew -- QA2 M1)
    const dm = H.mash - this.lastMash; this.lastMash = H.mash;
    if (dm > 0) this.rescue = Math.min(100, this.rescue + dm * (solo ? BEAST.mashSolo : 1.6));
    if (this.rescue < 100) this.rescue = Math.max(0, this.rescue - 0.02);   // (it wriggles back a little; never once it is full)
    p.x = this.x + Math.sin(g.time * 3) * 8; p.y = this.y + 1; p.z = 56 + 6 * Math.sin(g.time * 4); p.vx = p.vy = 0; p.inv = Math.max(p.inv, 3); p.facing = this.x < g.camX + W / 2 ? 1 : -1;   // (3: invulnerable but never on Player.hidden's blink-off frames)
    if (this.rescue >= 100) this.spitOut(true);
    else if (this.chewT > (solo ? BEAST.chewSolo : BEAST.chew)) { g.fx.word(this.x, this.y, 260, true, 'BLEH! TOO CHEWY!'); this.spitOut(false); }
  }
  /** the hero is out (rescued, or spat out after a long chew): flung clear, the Beast GROGGY for a while */
  spitOut(rescued) {
    const g = this.game, p = this.swallowed;
    this.endSwallow(rescued);
    if (!p || p.out) return;
    const dir = p.x < g.camX + W / 2 ? 1 : -1;
    p.x = clamp(this.x + dir * 150, g.camX + 60, g.camX + W - 60); p.y = clamp(this.y + 18, lo(g), hi(g)); p.z = 10;
    p.knock?.(dir, 5, 4.5); p.inv = Math.max(p.inv, 90);
    g.fx.word(p.x, p.y, 150, true, rescued ? 'FREE!' : 'PTOOEY!'); audio.sfx('sloth_spitout'); if (rescued) audio.sfx('freed', { vol: 0.5 }); g.fx.hearts?.(p.x, p.y);
    this.set('groggy'); this.groggyT = BEAST.groggy; this.hurtAt = g.frame;
    g.fx.word(this.x, this.y, 270, true, 'BLEAARGH...'); g.fx.word(this.x, this.y, 210, true, 'GROGGY! HIT IT!');
    g.mm?.clearHint?.('sirescue', 'sirescue1');
    g.mm?.hint?.('sigroggy', 'The Beast is GROGGY! HIT IT NOW!', 300, true);
  }
  endSwallow(rescued) {
    const g = this.game, p = this.swallowed;
    this.swallowed = null; this.rescues++; this.rescue = 0;
    if (p && g.mm?.holds?.has(p)) g.mm.release(p);
    for (const a of g.actors) { if (a instanceof RopeCoil) a.gone = true; if (a instanceof BarGate) a.reset(); }
    void rescued;
  }
  // ---------------------------------------------------------------- the end
  beginSplat() {
    const g = this.game;
    if (this.state === 'splat') return;
    if (this.swallowed) { const p = this.swallowed; this.endSwallow(true); if (p && !p.out) { p.x = clamp(this.x + 150, g.camX + 60, g.camX + W - 60); p.z = 0; p.inv = 120; } }
    this.set('splat'); this.hp = 0; this.releaseToken?.();
    SIFX.bossBeat?.(this.game, this);   // (the final blow: slow-mo + a camera nudge + its material burst, src/sifx.js)
    g.fx.word(this.x, this.y, 280, true, 'SPLOOOOSH!'); audio.sfx('slime_splat', { pitch: 0.6 }); audio.sfx('freed', { vol: 0.6 }); g.shake = Math.max(g.shake, 14);
    for (let i = 0; i < 7; i++) this.later(10 + i * 8, () => g.actors.push(new SlimePuddle(g, this.x + rnd(-170, 170), clamp(this.y + rnd(-26, 56), 8, DEPTH - 8), rnd(1, 1.9))));
    for (const a of g.actors) if (a instanceof SlothSlime && a.alive) a.die();
    g.mm?.clearHint?.('sibeast', 'sigroggy');
  }
  defeat() { if (!this.alive) return; super.defeat(); }
  // ---------------------------------------------------------------- drawing
  drawFloor(ctx) {
    const g = this.game, st = this.state, A = this.aim;
    if (!A) return;
    const sx = A.x - g.camX, sy = FLOOR_TOP + A.y;
    ctx.save();
    if (st === 'slamWind') {
      const k = Math.min(1, this.st / 46), R = BEAST.slamR, blink = this.st > 30 ? pulse(this.st - 30) : 1;
      ctx.globalAlpha = 0.3 + 0.3 * k; ctx.fillStyle = 'rgb(255,70,50)'; ctx.beginPath(); ctx.ellipse(sx, sy, R, R * 0.36, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = blink; ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.beginPath(); ctx.ellipse(sx, sy, R * (1.12 - 0.12 * k), R * 0.36 * (1.12 - 0.12 * k), 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#ffe03a'; ctx.lineWidth = 4; ctx.setLineDash([12, 8]); ctx.stroke(); ctx.setLineDash([]);
    } else if (st === 'gulpWind') {
      const k = Math.min(1, this.st / 66), R = BEAST.R, blink = this.st > 44 ? pulse(this.st - 44) : 1;
      ctx.globalAlpha = 0.3 + 0.32 * k; ctx.fillStyle = 'rgb(110,230,100)'; ctx.beginPath(); ctx.ellipse(sx, sy, R, R * 0.36, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = blink; ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.beginPath(); ctx.ellipse(sx, sy, R * (1.14 - 0.14 * k), R * 0.36 * (1.14 - 0.14 * k), 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#d8ffb0'; ctx.lineWidth = 4; ctx.setLineDash([10, 7]); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = blink; ctx.font = 'bold 40px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.strokeText('GULP!', sx, sy - 14); ctx.fillStyle = '#d8ffb0'; ctx.fillText('GULP!', sx, sy - 14);
    } else if (st === 'yawnWind') {
      const k = Math.min(1, this.st / 52), R = 330 * (0.3 + 0.7 * k), bx = this.sx, by = FLOOR_TOP + this.y;
      ctx.globalAlpha = 0.22 * k; ctx.fillStyle = 'rgb(160,220,255)'; ctx.beginPath(); ctx.ellipse(bx, by, R, R * 0.36, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.9; ctx.strokeStyle = INK; ctx.lineWidth = 8; ctx.beginPath(); ctx.ellipse(bx, by, 330, 330 * 0.36, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#bfe8ff'; ctx.lineWidth = 3.4; ctx.setLineDash([14, 9]); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
  }
  /** the rescue meter over the Beast (a bar, and the three ways: BARS, LIGHT, ROPE -- each lights when done), and the swallowed hero's MASH call is SIWorld's */
  drawOverMM(ctx) {
    const g = this.game;
    if (this.swallowed && !g.cut) {   // the swallowed hero is inside a jelly bubble: a translucent green skin over them, a gloss, little bubbles
      const p = this.swallowed, sx = p.sx, sy = p.sy - 56, a = 0.4 + 0.08 * Math.sin(g.time * 4);
      ctx.save(); const gr = ctx.createRadialGradient(sx - 14, sy - 22, 6, sx, sy, 78); gr.addColorStop(0, `rgba(190,255,180,${a * 0.5})`); gr.addColorStop(0.7, `rgba(120,215,120,${a})`); gr.addColorStop(1, `rgba(70,170,90,${a + 0.2})`);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(sx, sy, 56, 80, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(30,90,50,0.75)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(sx - 24, sy - 40, 9, 20, -0.4, 0, TAU); ctx.fill();
      for (let i = 0; i < 4; i++) { const u = ((g.time * 0.5 + i * 0.25) % 1); ctx.fillStyle = `rgba(230,255,225,${0.7 * (1 - u)})`; ctx.beginPath(); ctx.arc(sx + Math.sin(i * 2.3 + g.time) * 26, sy + 60 - u * 120, 3 + 2 * (i % 2), 0, TAU); ctx.fill(); }
      ctx.restore();
    }
    if (!this.swallowed || g.cut) return;
    const sx = this.sx, sy = 150, f = this.rescue / 100, w = 220, friends = live(g).some((q) => q !== this.swallowed);
    ctx.save(); ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    ctx.font = 'bold 28px Bangers, Impact, sans-serif'; ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.strokeText('RESCUE!', sx, sy - 12); ctx.fillStyle = '#ffd24a'; ctx.fillText('RESCUE!', sx, sy - 12);
    ctx.fillStyle = INK; ctx.fillRect(sx - w / 2 - 3, sy - 4, w + 6, 18); ctx.fillStyle = '#2a3a30'; ctx.fillRect(sx - w / 2, sy - 1, w, 12);
    const gr = ctx.createLinearGradient(sx - w / 2, 0, sx + w / 2, 0); gr.addColorStop(0, '#6ad060'); gr.addColorStop(1, '#ffe066'); ctx.fillStyle = gr; ctx.fillRect(sx - w / 2, sy - 1, w * f, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(sx - w / 2, sy - 1, w * f, 3.4);
    // the three ways, lit when used
    const icons = !friends ? [] : [['BARS', this.did.bars || [...g.actors].some((a) => a instanceof BarGate && a.bent)], ['LIGHT', this.did.light], ['ROPE', this.did.rope]];
    icons.forEach(([name, on], i) => {
      const ix = sx + (i - 1) * 84, iy = sy + 44;
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(ix, iy, 24, 0, TAU); ctx.fill(); ctx.fillStyle = on ? '#ffd24a' : '#3a4a44'; ctx.beginPath(); ctx.arc(ix, iy, 20, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(ix, iy); ctx.scale(1.4, 1.4); ctx.translate(-ix, -iy); ctx.strokeStyle = on ? INK : '#8aa098'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      if (i === 0) { for (const dx of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(ix + dx, iy - 8); ctx.lineTo(ix + dx, iy + 8); ctx.stroke(); } }
      else if (i === 1) { ctx.beginPath(); ctx.arc(ix, iy, 4.4, 0, TAU); ctx.stroke(); for (let a = 0; a < 8; a++) { ctx.beginPath(); ctx.moveTo(ix + Math.cos(a * TAU / 8) * 7, iy + Math.sin(a * TAU / 8) * 7); ctx.lineTo(ix + Math.cos(a * TAU / 8) * 10.4, iy + Math.sin(a * TAU / 8) * 10.4); ctx.stroke(); } }
      else { ctx.beginPath(); ctx.ellipse(ix, iy, 8, 5, 0, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.ellipse(ix, iy, 4, 2.4, 0, 0, TAU); ctx.stroke(); }
      ctx.restore();
      ctx.font = 'bold 18px Bangers, Impact, sans-serif'; ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.strokeText(name, ix, iy + 40); ctx.fillStyle = on ? '#ffe066' : '#cfe0d8'; ctx.fillText(name, ix, iy + 40);
    });
    ctx.restore();
  }
  drawOpts() { return { ...super.drawOpts(), beast: true }; }
  get calmStates() { return ['idle', 'stalk', 'wait', 'groggy']; }
  pose() {
    const g = this.game, st = this.state;
    { const fp = this.flinchPose(); if (fp) return fp; }   // (the anim audit #6: painter 2's hurt, once it lands -- the recoil till then, SIBoss.draw)
    switch (st) {
      case 'intro': return this.anim('rise', 0);
      case 'rise': return this.anim('rise', Math.min(1, this.st / 90));
      case 'slamWind': return this.anim('slamWind', Math.min(1, this.st / 46));
      case 'slam': return this.anim('slam', Math.min(1, this.st / 40));
      case 'spitWind': return this.anim('spitWind', Math.min(1, this.st / 36));
      case 'spit': return this.anim('spit', Math.min(1, this.st / 26));
      case 'yawnWind': return this.anim('yawnWind', Math.min(1, this.st / 52));
      case 'yawn': return this.anim('yawn', Math.min(1, this.st / 56));
      case 'gulpWind': return this.anim('gulpWind', Math.min(1, this.st / 66));
      case 'gulp': return this.anim('gulp', Math.min(1, this.st / 28));
      case 'chew': return this.anim('chew', g.time);
      case 'burp': return this.anim('burp', Math.min(1, this.st / 34));
      case 'groggy': return this.anim('groggy', g.time);
      case 'splat': return this.anim('defeat', Math.min(1, this.st / 80));
      default: return this.anim('idle', g.time * 0.8);
    }
  }
  draw(ctx) {
    if (this.state === 'defeated') return;
    this.mem.frame = this.game.frame;
    if (this.state === 'intro' || this.state === 'rise') {   // (it rises out of the drain: nothing below the floor line shows)
      ctx.save(); ctx.beginPath(); ctx.rect(-50, -50, W + 100, FLOOR_TOP + this.y + 14 + 50); ctx.clip(); super.draw(ctx); ctx.restore();
    } else {
      if (['gulpWind', 'yawnWind', 'slamWind', 'spitWind'].includes(this.state)) rimGlow(ctx, this, '#ffa04a', 0.3 + 0.4 * Math.min(1, this.st / 30));   // (danger now: a warm torch-light rim on its wind-ups only)
      // (stop-gaps, the anim audit #12, each off by itself once painter 2's clip lands: a slow squash-stretch breathing in its idle (2
      //  drawings today; painter 2's has 8), a swell as a wind-up gathers (2 drawings today; 4-5 to come))
      const st = this.state, WIND = { gulpWind: 66, yawnWind: 52, slamWind: 46, spitWind: 36 }, g = this.game;
      let sxk = 1, syk = 1;
      if (st === 'idle' && clipDrawings(this.art, 'idle') <= 4) { const b = Math.sin(g.time * 2.2); sxk = 1 - 0.018 * b; syk = 1 + 0.024 * b; }
      else if (WIND[st] && clipDrawings(this.art, st) < 4) { const k = Math.min(1, this.st / WIND[st]), e = k * k * (3 - 2 * k); sxk = 1 + 0.05 * e; syk = 1 + 0.035 * e; }
      if (sxk !== 1 || syk !== 1) { const sx = this.sx, sy = this.sy; ctx.save(); ctx.translate(sx, sy); ctx.scale(sxk, syk); ctx.translate(-sx, -sy); try { super.draw(ctx); } finally { ctx.restore(); } }
      else super.draw(ctx);
      if (this.state === 'groggy') groggyStars(ctx, this.sx, this.sy - 236, this.game.frame);   // (safe to hit: stars over its head)
    }
  }
}
