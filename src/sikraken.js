// SKULL ISLAND stage 2, "THE KRAKEN" (docs/SKULL_ISLAND.md, src/silevels.js): the sea monster -- and its tentacles.
//   Tentacle     the stage's arenas' arms (and the Swamp's roots, src/siswamp.js Root): it bursts through the deck, three ways:  SLAM (a red
//                ring, then it bursts up there: step out) | SWEEP (a pink lane with chevrons: JUMP it or roll through) | GRAB (a magenta ring
//                at a hero's feet: MASH, or a friend bonks it -- src/siworld.js, hold kind 'tentacle').
//   EyeTentacle  the boss fight's arms (the user's reworked fight, 2026-10-22: "tentacles with eyes on them should pop up from the
//                ground, defeating all the tentacles causes the kraken to be stunned and take damage.  Three rounds of this takes him
//                down"): each has its own HP, eyes, and slaps / sweeps / grabs.  Art: CHARS.kraken_tentacle (src/chars/kraken_tentacle.js,
//                the painted builder's pack when it lands).
//   Kraken       the boss: a giant purple head behind the rail (the STAGE draws it from this.K: src/stages/sikraken.js drawKraken) in
//                Malachar's spiked collar.  THREE ROUNDS of eyed tentacles; all of a round beaten = STUNNED (the head slumps onto the rail,
//                eyes swirling: hit its HEAD, the bar drains to the next third and snaps there when the stun ends); three rounds = it
//                collapses, and the story (si_kraken_end: the book's panels -- Shadow breaks the collar, gold eyes, the dangling captain,
//                Scarlet's crew) plays after the clear.  Nobody is hurt: the kraken was Malachar's prisoner.
//   StormLantern a ship's lantern to pick up and throw (the old fight's light; kept for src/siworld.js -- not spawned any more).
import { SIBoss } from './sibosses.js';
import { Actor } from './actors.js';
import { audio } from './audio-proxy.js';
import { W, DEPTH, FLOOR_TOP, INK } from './config.js';
import { clamp, TAU } from './rig.js';
import { baseOf } from './heroes.js';
import { isLight } from './mmworld.js';
import { CHARS } from './chars.js';
import * as SIFX from './sifx.js';
import { holdWord, xrayHero } from './sitele.js';   // (Book 2's material particles: the FX agent's src/sifx.js)

const rnd = (a, b) => a + Math.random() * (b - a);
/** flash safety: a telegraph's last-moment urgency is a smooth ~1.9 Hz pulse (0.55..1), never an on/off blink */
const pulse = (n) => 0.775 + 0.225 * Math.cos(n * 0.2);
const pick = (a) => a[(Math.random() * a.length) | 0];
const live = (g) => g.players.filter((p) => !p.out && p.alive);
const has = (g, id) => live(g).some((p) => baseOf(p.heroId) === id);
const KP = { skin: '#8a3c9e', skinD: '#5c2476', skinH: '#b862c8', belly: '#e8b6dc' };

// ------------------------------------------------------------------------------------------------ a tube: the tentacle's body
/** pts: screen points base..tip; w0 -> w1: widths.  Three passes (ink, dark, skin) and the pale suckers down the inner side */
function tube(ctx, pts, w0, w1, suckers = true, flash = 0, pal = KP) {
  const n = pts.length - 1;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [col, wk, ox] of [[INK, 1.0, 0], [pal.skinD, 0.86, 0], [pal.skin, 0.56, -3]]) {
    for (let i = 0; i < n; i++) {
      const f = i / n, w = (w0 + (w1 - w0) * f) * wk + (col === INK ? 6 : 0);
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[i][0] + ox, pts[i][1]); ctx.lineTo(pts[i + 1][0] + ox, pts[i + 1][1]); ctx.stroke();
    }
  }
  if (pal.bark) {   // (a root: bark rings across it and a few moss spots, no suckers)
    ctx.strokeStyle = 'rgba(24,12,8,0.5)'; ctx.lineWidth = 2.2;
    for (let i = 1; i < n; i++) { const w = (w0 + (w1 - w0) * (i / n)) * 0.5, dx = pts[i + 1][0] - pts[i - 1][0], dy = pts[i + 1][1] - pts[i - 1][1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L; ctx.beginPath(); ctx.moveTo(pts[i][0] + nx * w * 0.8, pts[i][1] + ny * w * 0.8); ctx.lineTo(pts[i][0] - nx * w * 0.5, pts[i][1] - ny * w * 0.5); ctx.stroke(); }
    ctx.fillStyle = 'rgba(110,150,70,0.6)'; for (let i = 2; i < n; i += 4) { const w = (w0 + (w1 - w0) * (i / n)) * 0.3; ctx.beginPath(); ctx.ellipse(pts[i][0] - 2, pts[i][1] - w * 0.4, w * 0.7, w * 0.35, 0, 0, TAU); ctx.fill(); }
  }
  if (suckers && pal.suckers !== false) {
    ctx.fillStyle = pal.belly; ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
    for (let i = 1; i < n; i += 1) { const f = i / n, r = (w0 + (w1 - w0) * f) * 0.22 + 1.6; ctx.beginPath(); ctx.arc(pts[i][0] + 5 + (1 - f) * 6, pts[i][1], r, 0, TAU); ctx.fill(); ctx.stroke(); }
  }
  if (flash > 0) { ctx.globalAlpha = Math.min(0.7, flash); ctx.strokeStyle = '#fff'; for (let i = 0; i < n; i++) { ctx.lineWidth = (w0 + (w1 - w0) * (i / n)) * 0.7; ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); ctx.stroke(); } ctx.globalAlpha = 1; }
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ the tentacles
const SLAM = { tele: 62, rise: 10, up: 72, sink: 18, R: 76, dmg: 10 };
const GRAB = { tele: 58, rise: 12, hold: 250, sink: 20, R: 54 };
const SWEEP = { tele: 72, speed: 9.2, halfH: 26, dmg: 9 };
export class Tentacle extends Actor {
  /** kind 'slam' | 'grab' at (x, y); 'sweep': y = the lane, dir = +1 sweeps to the right (from the left edge) */
  constructor(game, kind, x, y, owner, dir = 1) {
    super(game, x, y);
    this.team = 'hazard'; this.kind = kind; this.owner = owner; this.solid = false; this.w = 40; this.h = 250; this.hz0 = 0;
    this.phase = 'tele'; this.age = 0; this.hp = kind === 'grab' ? 40 : 30; this.dir = dir; this.shadowR = 0; this.sortY = y + 30;
    this.held = null; this.hit = new Set(); this.lift = 0; this.heavy = true;   // (heavy: rooted in the deck -- Scarlet's hook hits it, never drags it)
    if (kind === 'sweep') { this.tipX = dir > 0 ? game.camX - 60 : game.camX + W + 60; this.baseX = this.tipX; }
    this.pal = (new.target && new.target.PAL) || KP;   // (src/siswamp.js Root: the same arms in bark)
    game.mm?.tentaHint?.(this.hintKey());   // (the first time each kind shows: what its warning means)
  }
  /** the key of the warning's first-time hint (src/siworld.js tentaHint): its kind -- a subclass (the swamp's roots) says its own */
  hintKey() { return this.kind; }
  get hittable() { return this.alive && (this.phase === 'up' || this.phase === 'hold') && this.kind !== 'sweep'; }
  get active() { return this.phase !== 'gone'; }
  /** the height of the tip over the deck (0..~230) */
  get tipH() {
    if (this.kind === 'sweep') return 18;
    const T = this.kind === 'slam' ? SLAM : GRAB;
    if (this.phase === 'rise') return 250 * Math.min(1, this.age / T.rise);
    if (this.phase === 'up' || this.phase === 'hold') return 250 - 14 * Math.sin(this.age * 0.12);
    if (this.phase === 'sink') return 250 * (1 - Math.min(1, this.age / T.sink));
    return 0;
  }
  takeHit(att, hd) {
    if (!this.hittable) return false;
    const g = this.game;
    this.hp -= Math.max(14, hd.dmg || 1); this.flash = 6;   // (any hit is a good hit: three set a held friend free)
    audio.sfx('hit_wet', { vol: 0.8 });
    g.fx.spark(this.x, this.y, 120, false);
    if (this.hp <= 0 || hd.kind === 'knock') { this.retreat(true); }
    else g.fx.word(this.x, this.y, 210, false, 'BOP!');
    return true;
  }
  retreat(hit) {
    const g = this.game;
    if (this.phase === 'sink' || this.phase === 'gone') return;
    if (this.held) { this.releaseHeld('FREE!'); }
    this.phase = 'sink'; this.age = 0;
    if (hit) { g.fx.word(this.x, this.y, 230, true, 'OUCH!'); g.score += 150; }
  }
  releaseHeld(word) {
    const g = this.game, p = this.held;
    this.held = null;
    if (!p) return;
    g.mm?.release?.(p);
    p.z = 0;
    if (word) holdWord(g, p, word);
  }
  update() {
    const g = this.game;
    this.tick(); this.age++;
    if (g.cut || g.cutin) { this.age--; this.st--; return; }
    const K = this.kind;
    if (K === 'sweep') return this.updateSweep();
    const T = K === 'slam' ? SLAM : GRAB;
    if (this.phase === 'tele') {
      if (this.age % 8 === 0) SIFX.tease(this.x, this.y, this.burstMat || 'wood');
      if (K === 'grab' && this.target && this.age < T.tele - 28 && this.target.alive && !this.target.out) { this.x += clamp(this.target.x - this.x, -3.2, 3.2); this.y += clamp(this.target.y - this.y, -2.2, 2.2); }   // (the ring creeps after its hero: then locks)
      if (this.age >= T.tele) { this.phase = 'rise'; this.age = 0; this.burst(); }
    } else if (this.phase === 'rise') {
      if (this.age >= T.rise) { this.phase = this.held ? 'hold' : 'up'; this.age = 0; }
    } else if (this.phase === 'up') {
      if (this.age >= (K === 'slam' ? T.up : 60)) this.retreat(false);
    } else if (this.phase === 'hold') {
      const p = this.held;
      if (!p || !g.mm?.holds?.has(p)) { this.held = null; this.retreat(false); }
      else {
        const AH = !this.pal.bark && CHARS.kraken_arm?.ready?.() ? CHARS.kraken_arm.HOLD : null;   // (the painted arm: held in its curl)
        p.x += (this.x + (AH ? (this.facing || 1) * AH[0] : 0) - p.x) * 0.2; p.y += (this.y - p.y) * 0.2;
        this.lift += ((AH ? Math.max(40, -AH[1] - 40) : 74) - this.lift) * 0.12; p.z = this.lift + Math.sin(this.age * 0.2) * 5;
        if (this.age > GRAB.hold) {   // (it lets go: a little drop, never a hurt)
          this.releaseHeld('WHEEE!');
          p.takeHit?.({ x: this.x, team: 'hazard', facing: this.facing || 1 }, { dmg: 5, kind: 'light', push: 2, stun: 20, stop: 3, sfx: 'hit_light' });
          this.retreat(false);
        }
      }
    } else if (this.phase === 'sink') {
      if (this.age >= T.sink) { this.phase = 'gone'; this.gone = true; this.alive = false; }
    }
  }
  /** the burst: slam -- everyone in the ring is thrown; grab -- the first hero in the ring is held */
  burst() {
    const g = this.game, K = this.kind;
    audio.sfx('plank_burst'); g.shake = Math.max(g.shake, 8);
    const muddy = this.burstMat === 'mud';   // (a bog root: no white dust, fewer, darker, lower chips -- they piled on the root and the hero, QA1 A1)
    if (!muddy) g.fx.dust(this.x, this.y, 8, 54);
    g.fx.debris(this.x, this.y, muddy ? 12 : 20, muddy ? ['#3a3530', '#24201c', '#56504a'] : ['#7a5030', '#4a3018', '#c9a070'], muddy ? 6 : 14);
    SIFX.burst(this.x, this.y, 4, this.burstMat || 'wood', { k: muddy ? 1.1 : 1.6 }); SIFX.splash(this.x, this.y, this.burstMat === 'mud' ? 'mud' : 'sea');
    const R = K === 'slam' ? SLAM.R : GRAB.R;
    for (const p of g.players) {
      if (!p.hittable || p.out || p.z > 36) continue;
      const ex = (p.x - this.x) / R, ey = (p.y - this.y) / (R * 0.34);
      if (ex * ex + ey * ey > 1) continue;
      if (K === 'slam') { p.takeHit({ x: this.x + (p.x < this.x ? 40 : -40), team: 'hazard', facing: p.x < this.x ? -1 : 1 }, { dmg: SLAM.dmg, kind: 'knock', push: 5, lift: 6.5, stop: 6, sfx: 'hit_heavy', spark: 'warm' }); g.fx.word(p.x, p.y, 150, true, 'SLAM!'); }
      else if (!this.held && g.mm?.hold?.(p, { by: this, kind: 'tentacle' })) { this.held = p; this.phase = 'hold'; holdWord(g, p, 'GOT YOU!'); audio.sfx('tentacle_grab'); }
    }
    if (K === 'grab' && !this.held) g.fx.word(this.x, this.y, 180, true, 'MISSED!');
    // (a slam may carry a purple imp up with it: it hops off and flutters)
    if (K === 'slam' && this.imp && g.actors.filter((a) => a.team === 'foe' && a.art === 'collarimp' && a.alive).length < 3) { const e = g.spawn({ k: 'collarimp', side: this.x > g.camX + W / 2 ? 'R' : 'L', y: this.y }); if (e) { e.x = this.x; e.y = this.y; e.z = 210; e.entered = true; e.cool = 40; } }
  }
  updateSweep() {
    const g = this.game, S = SWEEP;
    if (this.phase === 'tele') { if (this.age >= S.tele) { this.phase = 'go'; this.age = 0; audio.sfx('tentacle_swish'); } return; }
    if (this.phase === 'go') {
      this.tipX += this.dir * S.speed; this.x = this.tipX;
      if (this.age % 14 === 1) audio.sfx('boulder_roll', { pitch: 1.2, vol: 0.18 });
      for (const p of g.players) {
        if (!p.hittable || p.out || this.hit.has(p) || Math.abs(p.y - this.y) > S.halfH || p.z > 44 || Math.abs(p.x - this.tipX) > 46) continue;
        this.hit.add(p);
        p.takeHit({ x: this.tipX, team: 'hazard', facing: this.dir }, { dmg: S.dmg, kind: 'knock', push: 5.5, lift: 5, stop: 5, sfx: 'hit_heavy', spark: 'warm' });
        g.fx.word(p.x, p.y, 150, true, 'SWEEP!');
      }
      for (const t of g.actors) {   // (it bowls over the kraken's own small fry too: the lane clears them)
        if (t.team !== 'foe' || t.boss || !t.hittable || t.eye || this.hit.has(t) || Math.abs(t.y - this.y) > S.halfH || t.z > 44 || Math.abs(t.x - this.tipX) > 46) continue;
        this.hit.add(t); t.takeHit(this.owner || this, { dmg: 8, kind: 'knock', push: 5, lift: 5 }); g.fx.word(t.x, t.y, t.h, true, 'BONK!');
      }
      if ((this.dir > 0 && this.tipX > g.camX + W + 160) || (this.dir < 0 && this.tipX < g.camX - 160) || this.age > 260) { this.phase = 'gone'; this.gone = true; this.alive = false; }
    }
  }

  // ---------------------------------------------------------------- drawing
  /** the warnings on the floor, under everyone (game.js draws every actor's shadow pass but the 'shot' ones') */
  drawShadow(ctx) {
    const g = this.game, t = g.time;
    if (this.kind === 'sweep') {
      if (this.phase !== 'tele') return;
      const y = FLOOR_TOP + this.y, a = 0.26 + 0.16 * Math.sin(this.age * 0.5), d = this.dir, k = this.age;
      ctx.save();
      ctx.fillStyle = `rgba(255,64,170,${a})`; ctx.fillRect(0, y - 27, W, 54);
      ctx.fillStyle = 'rgba(255,214,246,0.9)'; ctx.fillRect(0, y - 29, W, 3); ctx.fillRect(0, y + 26, W, 3);
      ctx.strokeStyle = 'rgba(255,240,252,0.95)'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const span = W + 80;
      for (let i = 0; i < 13; i++) {
        const x = ((i * 80 + k * 6 * d) % span + span) % span - 40;
        ctx.beginPath(); ctx.moveTo(x - 9 * d, y - 13); ctx.lineTo(x + 8 * d, y); ctx.lineTo(x - 9 * d, y + 13); ctx.stroke();
      }
      ctx.restore();
      return;
    }
    const T = this.kind === 'slam' ? SLAM : GRAB, R = T.R;
    const sx = this.sx, sy = FLOOR_TOP + this.y;
    if (this.phase === 'tele') {
      const k = Math.min(1, this.age / T.tele), blink = this.age > T.tele - 22 ? pulse(this.age - T.tele + 22) : 1;
      const slam = this.kind === 'slam', fill = slam ? '255,70,50' : '240,60,220', rim = slam ? '#ffe03a' : '#ffd0f8';
      ctx.save();
      ctx.globalAlpha = 0.3 + 0.32 * k; ctx.fillStyle = `rgb(${fill})`; ctx.beginPath(); ctx.ellipse(sx, sy, R, R * 0.34, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = blink; ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.beginPath(); ctx.ellipse(sx, sy, R * (1.14 - 0.14 * k), R * 0.34 * (1.14 - 0.14 * k), 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = rim; ctx.lineWidth = 4; ctx.setLineDash([12, 8]); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
      void t;
    } else if (this.phase === 'rise' || this.phase === 'up' || this.phase === 'hold' || this.phase === 'sink') {
      ctx.fillStyle = 'rgba(12,6,24,0.55)'; ctx.beginPath(); ctx.ellipse(sx, sy, R * 0.6, R * 0.2, 0, 0, TAU); ctx.fill();   // (the hole it burst through)
      ctx.strokeStyle = '#3a2418'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(sx, sy, R * 0.62, R * 0.21, 0, 0, TAU); ctx.stroke();
    }
  }
  draw(ctx) {
    const g = this.game, t = g.time;
    // (AA QA A1) the painted EYELESS arm (src/chars/kraken_arm3d.js) wherever its pack is resident -- never the swamp's roots
    // (their own bark pack); the code tube below while it isn't
    const ARM = this.pal.bark ? null : CHARS.kraken_arm;
    if (this.phase !== 'tele' && ARM?.ready?.()) {
      if (this.kind === 'sweep') { if (this.phase === 'go') ARM.drawSurf(ctx, this.tipX - g.camX, FLOOR_TOP + this.y, t, this.dir); return; }
      if (this.phase === 'gone' || this.tipH <= 2 && this.phase !== 'rise') return;
      const T = this.kind === 'slam' ? SLAM : GRAB, ph = this.phase;
      const k = ph === 'rise' ? this.age / T.rise : ph === 'sink' ? this.age / T.sink : ph === 'hold' ? this.age / 12 : 0;
      ARM.drawArm(ctx, this.sx, FLOOR_TOP + this.y, ph === 'hold' ? (this.age < 12 ? 'grab' : 'hold') : ph, k, t, { facing: this.facing || 1, mem: this.mem || (this.mem = {}) });
      return;
    }
    if (this.kind === 'sweep') {
      if (this.phase !== 'go') return;
      const sy = FLOOR_TOP + this.y, tipSx = this.tipX - g.camX, baseSx = this.dir > 0 ? -140 : W + 140;
      const pts = [], n = 16;
      for (let i = 0; i <= n; i++) { const f = i / n, x = baseSx + (tipSx - baseSx) * f; pts.push([x, sy - 8 - 28 * Math.sin(f * 3.14) * (0.5 + 0.5 * Math.sin(t * 6 + f * 5)) - 6 * (1 - f)]); }
      tube(ctx, pts, 62, 18, true, 0, this.pal);
      return;
    }
    if (this.phase === 'tele') {   // (a "!" over the ring)
      const sx = this.sx, sy = FLOOR_TOP + this.y;
      ctx.save(); ctx.globalAlpha = 1; ctx.font = 'bold 46px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
      const yy = sy - 52 + Math.sin(t * 14) * 3; ctx.strokeText('!', sx, yy); ctx.fillStyle = this.kind === 'slam' ? '#fff2a0' : '#ffd0f8'; ctx.fillText('!', sx, yy); ctx.restore();
      return;
    }
    if (this.phase === 'gone') return;
    const sx = this.sx, sy = FLOOR_TOP + this.y, H = this.tipH;
    if (H <= 2) return;
    const pts = [], n = 14, wob = this.phase === 'sink' ? 0.3 : 1;
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      pts.push([sx + Math.sin(f * 3.1 + t * 2.4) * 16 * f * wob + (this.kind === 'grab' ? 10 * f * f : 0) + 18 * f * f, sy - H * f - 4 * Math.sin(f * 3.14) * 0]);
    }
    tube(ctx, pts, 54, 24, true, this.flash > 0 ? this.flash / 6 : 0, this.pal);
    // the tip curls over a held hero
    if (this.phase === 'hold' && this.held && !CHARS.kraken_arm?.ready?.()) { ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(this.held.sx, this.held.sy - 50 - this.lift, 30, 0.4, TAU - 0.4); ctx.stroke(); ctx.strokeStyle = this.pal.skin; ctx.lineWidth = 2.6; ctx.stroke(); }
  }
}

// ------------------------------------------------------------------------------------------------ a ship's lantern to throw
/** a lantern on the deck: pick it up (the PICK UP prompt) and throw it at the kraken's eyes -- it is LIGHT.  Smashes on foes (a small bonk) */
export class StormLantern extends Actor {
  constructor(game, x, y) {
    super(game, x, y);
    this.team = 'item2'; this.solid = false; this.w = 14; this.h = 40; this.liftable = true; this.carrier = null; this.flying = false; this.thrower = null;
    this.z = 220; this.vz = 0; this.shadowR = 16; this.life = 60 * 40; this.kind = 'stormlantern';
  }
  get hittable() { return false; }
  pickUp(p) { this.carrier = p; this.liftable = false; }
  drop(p) { this.carrier = null; this.liftable = true; this.z = 0; this.x = p.x + p.facing * 20; this.y = p.y; }
  throwFrom(p, dir) {
    const cp = p.carryPoint();
    this.carrier = null; this.flying = true; this.thrower = p;
    this.x = cp.x; this.y = cp.y; this.z = cp.z; this.vx = dir * 9.5; this.vz = 4.5; this.facing = dir;
  }
  update() {
    const g = this.game;
    this.tick();
    if (this.carrier) { const cp = this.carrier.carryPoint(); this.x = cp.x; this.y = cp.y; this.z = cp.z; this.sortY = this.carrier.y + 0.1; return; }
    this.sortY = undefined;
    if (!this.flying) {   // (falls onto the deck, bounces once)
      if (this.z > 0 || this.vz) { this.z += this.vz; this.vz -= 0.55; if (this.z <= 0) { this.z = 0; this.vz = this.vz < -3 ? -this.vz * 0.3 : 0; } }
      if (--this.life <= 0) this.gone = true;
      return;
    }
    this.x += this.vx; this.z += this.vz; this.vz -= 0.18;
    // (at the kraken's eyes: any height -- kids can't aim up)
    const B = g.boss;
    if (B && B.lanternHit?.(this)) { this.gone = true; return; }
    for (const t of g.actors) {
      if (t.team !== 'foe' || t.eye || !t.hittable) continue;
      if (Math.abs(t.y - this.y) < 24 && Math.abs(t.x - this.x) < t.w + 16 && this.z < t.z + t.h + 10) { this.smash(t); return; }
    }
    if (this.z <= 0 || this.x < g.camX - 60 || this.x > g.camX + W + 60) this.smash(null);
  }
  smash(t) {
    const g = this.game, p = this.thrower;
    this.gone = true;
    g.fx.debris(this.x, this.y, Math.max(10, this.z), ['#d8b04a', '#8a6a2a', '#fff2a0'], 9); audio.sfx('break');
    if (t) { const hd = { dmg: 12, kind: 'knock', push: 5, lift: 5, stop: 5, hit: 'hit_heavy', word: 'heavy', thrown: true, ember: 8 }; if (t.takeHit(p, hd)) p?.landed?.(t, hd); }
  }
  draw(ctx) {
    if (this.gone) return;
    const g = this.game, sx = this.sx, sy = this.sy;
    if (!this.carrier && !this.flying) {   // the prompt
      const near = g.players.find((p) => !p.out && !p.carry && Math.abs(p.x - this.x) < 40 && Math.abs(p.y - this.y) < 20);
      if (near && this.z < 4) {
        ctx.save(); ctx.globalAlpha = 0.85 + 0.15 * Math.sin(g.time * 6); g.app.drawGlyph(ctx, 'attack', near.ctrlId, sx, sy - 62, 24);
        ctx.font = 'bold 12px "Comic Neue", sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeText('PICK UP', sx, sy - 40); ctx.fillStyle = '#fff'; ctx.fillText('PICK UP', sx, sy - 40); ctx.restore();
      }
    }
    ctx.save(); ctx.translate(sx, sy);
    if (this.flying) ctx.rotate(this.st * 0.22 * (this.facing || 1));
    // the glow, then the lantern: a brass frame, glass, a flame
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45 + 0.1 * Math.sin(g.time * 12); ctx.fillStyle = '#ffd88a'; ctx.beginPath(); ctx.arc(0, -18, 34, 0, TAU); ctx.fill(); ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.lineJoin = 'round';
    ctx.fillStyle = '#8a6a2a'; ctx.beginPath(); ctx.moveTo(-9, -36); ctx.lineTo(9, -36); ctx.lineTo(6, -40); ctx.lineTo(-6, -40); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -44, 6, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = 'rgba(255,238,180,0.92)'; ctx.beginPath(); ctx.moveTo(-9, -36); ctx.lineTo(9, -36); ctx.lineTo(11, -6); ctx.lineTo(-11, -6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffb02e'; ctx.beginPath(); ctx.moveTo(0, -28); ctx.quadraticCurveTo(7, -20, 0, -10); ctx.quadraticCurveTo(-7, -20, 0, -28); ctx.fill();
    ctx.fillStyle = '#8a6a2a'; ctx.fillRect(-12, -6, 24, 5); ctx.strokeRect(-12, -6, 24, 5);
    ctx.restore();
  }
}

// ------------------------------------------------------------------------------------------------ the eyed tentacles (the reworked fight)
/** KR: the reworked Kraken's numbers (docs/SKULL_ISLAND.md "The Kraken fight, reworked") */
// (the roar between rounds: its peak's st in the 'round' state -- the roar clip's rear-up drawing; painter 1's F20 sets the final one)
const ROAR_PEAK = 12;
export const KR = {
  hp: 300, rounds: [[3, 4, 4], [4, 5, 5], [4, 5, 6], [5, 5, 6]],   // (tentacles per round, by party size 1-4: co-op gets more to beat, not tougher ones)
  roundHp: [0.72, 0.9, 1],                            // (round 1's tentacles are softer: a quick first win, then they toughen)
  tentHp: 42, coopHp: [1, 1, 1.2, 1.35, 1.5], maxUp: [2, 2, 3, 4, 4], tokens: [1, 1, 2, 2, 3], popGap: 100, popGapCoop: 80, popTele: 60,
  cool: [60, 110], slapTele: 48, slapLen: 24, slapHit: 0.25, slapR: 58, sweepTele: 50, sweepLen: 32, sweepHalf: 214, laneH: 24, grabTele: 56, grabLen: 21, grabR: 52, dmg: 8,
  stun: 330, stunCoop: 300, recover: 64, downT: 50, headCap: 34, headK: 1.6,
};
const TENT = () => CHARS.kraken_tentacle;
/** the painted head pack, when it is resident (src/chars/kraken_head3d.js): the boss draws it; else the stage draws its own */
const HEADP = () => { const H = CHARS.kraken_head, p = H?.ATLAS_SCALE && H.ANIM?.idle ? H.ANIM.idle(0) : null; return p && p.s3d >= 0.5 ? H : null; };
/** a k clip's drawings slide, not step (critic B, the rise): px to move the head at k so its crown goes from drawing i's height toward
 *  drawing i+1's over i's hold -- the swap then changes only the pose.  Each clip's drawing starts and crown heights, sampled once per art */
const SLIDE = new WeakMap();
function slideRows(H, clip) {
  const f = H.ANIM?.[clip]; if (typeof f !== 'function' || !H.point) return null;
  let R = SLIDE.get(f);
  if (!R) {
    R = []; let last;
    for (let i = 0; i <= 300; i++) { const p = f(i / 300), d = p && p['f_' + clip]; if (d === undefined || d === last) continue; last = d; const c = H.point(p, 'crown'); R.push({ k: i / 300, y: c ? c[1] : null }); }
    SLIDE.set(f, R);
  }
  return R;
}
function slideY(H, clip, kk) {
  const R = slideRows(H, clip); if (!R) return 0;
  let i = 0; while (i + 1 < R.length && R[i + 1].k <= kk) i++;
  if (i + 1 >= R.length || R[i].y === null || R[i + 1].y === null) return 0;
  return (R[i + 1].y - R[i].y) * Math.max(0, Math.min(1, (kk - R[i].k) / (R[i + 1].k - R[i].k)));
}
/** the clip's first drawing starts where the head WAS (screen y of its crown, fromY) and eases into the slide over that drawing's
 *  hold -- the collapse out of the dizzy slump opened with a 19 px rise (critic B, r12).  Screen px; base = the head's anchor y */
function slideFrom(H, clip, kk, fromY, base, sc) {
  const R = slideRows(H, clip); if (!R || R.length < 2 || R[0].y === null || !(fromY > -1e4)) return 0;
  const d = Math.max(-60, Math.min(60, fromY - (base + R[0].y * sc)));
  return d * Math.max(0, 1 - kk / R[1].k);
}
// (the final review: "a giant BIRD head... an OWL" -- no arms framed it, the draped ones dimmed below the rail) eyeless painted arms
// curling up behind and beside the head from behind the rail -- high, never on the deck where the eyed targets pop up:
// [dx (head px at scale 1), facing, scale, phase]
const ARMS_BEHIND = [[-275, -1, 1.12, 0.0], [-178, -1, 1.28, 1.3], [178, 1, 1.28, 2.1], [275, 1, 1.12, 0.7]];
const HEAD_RAIL = 304, HEAD_Y = HEAD_RAIL + 36;   // (the head pack's anchor is the rail line; drawn 36 px lower so its eyes sit clear of the boss bar -- it rises OVER the rail)
/** an EYED TENTACLE: it bursts up through the deck at a telegraphed spot (cracked planks + a red ring), sways, and slaps (a ring at
 * its reach), sweeps (a lane along the deck round its base: JUMP) or grabs (a magenta ring at a hero's feet: MASH, or friends hit it).
 * Its own HP: beaten, it wilts and sinks back through the planks.  The head is the reworked Kraken's (below). */
export class EyeTentacle extends Actor {
  constructor(game, x, y, owner) {
    super(game, x, y);
    this.team = 'foe'; this.owner = owner; this.solid = false; this.art = 'kraken_tentacle'; this.name = 'TENTACLE'; this.noBar = false;
    this.w = 34; this.h = 230; this.hz0 = 0; this.depthR = 6; this.shadowR = 0; this.facing = 1; this.mem = {};
    const n = Math.max(1, Math.min(4, live(game).length));
    this.hp = this.maxHp = Math.round(KR.tentHp * KR.coopHp[n] * (KR.roundHp[(owner?.round || 1) - 1] ?? 1));
    this.phase = 'tele'; this.age = 0; this.cool = n > 1 ? rnd(10, 25) : rnd(20, 45);   // (it attacks soon after it is up: a tentacle is a threat, not a punching bag)
    this.held = null; this.freeHits = 0; this.atk = null; this.token = false; this.dieAfter = false;
    this.noAttackHint = true; this.heavy = true;   // (rooted in its hole: the grappling hook hits it but cannot yank it across the deck, src/projectiles.js)
  }
  get boss() { return false; }
  get hittable() { return this.alive && ['up', 'slapWind', 'slap', 'sweepWind', 'sweep', 'grabWind', 'grab', 'hold', 'hurt'].includes(this.phase) && !this.game.cut; }
  get wilting() { return this.phase === 'wilt'; }
  set(phase) { if (this.phase !== phase) { this.phase = phase; this.age = 0; } }
  takeToken() { const o = this.owner, n = Math.max(1, Math.min(4, live(this.game).length)); if (this.token) return true; if ((o.tokensOut || 0) >= KR.tokens[n] + (o.round >= 3 ? 1 : 0)) return false; o.tokensOut = (o.tokensOut || 0) + 1; this.token = true; return true; }
  releaseToken() { if (this.token) { this.token = false; this.owner.tokensOut = Math.max(0, (this.owner.tokensOut || 0) - 1); } }
  takeHit(att, hd) {
    if (!this.hittable) return false;
    const g = this.game;
    const d = Math.max(6, hd.dmg || 1);
    this.hp -= d; this.flash = 6; this.lastHit = g.frame;
    audio.sfx('hit_wet', { vol: 0.8 });
    g.fx.spark(this.x, this.y, 110, false);
    g.engage(this);
    if (this.held && ++this.freeHits >= 3) { this.releaseHeld('FREE!'); this.endAttack(); }   // (a friend's rescue: the attack is over, its token back)
    if (this.hp <= 0) { if (this.armored || this.lastGasp()) { this.hp = 1; this.dieAfter = true; } else { this.wilt(true); return true; } }
    if ((this.phase === 'up' || (this.phase === 'hold' && !this.held)) && g.frame - (this.flinchAt ?? -999) > 45) { this.flinchAt = g.frame; this.set('hurt'); }   // (a flinch at most once in 45 frames: a masher cannot stun-lock it)
    else if (g.frame - (this.wordAt ?? -99) > 30) { this.wordAt = g.frame; g.fx.word(this.x, this.y, 200, false, 'BOP!'); }
    return true;
  }
  /** a slap or a sweep under way (its wind-up, up to its hit): it cannot wilt yet -- beaten, it wilts right after (the grab is not armoured: a rescue still stops it) */
  get armored() { const p = this.phase, a = this.age; return p === 'slapWind' || p === 'sweepWind' || (p === 'slap' && a <= Math.round(KR.slapLen * KR.slapHit)) || (p === 'sweep' && a < 14); }
  /** beaten before it ever attacked: one LAST-GASP slap or sweep at a hero in reach (a full warning, its wind-up armoured -- then it wilts).
   *  Every tentacle shows a warning a kid can learn from, even in a 4-player crowd.  Never a grab (a rescue would not end it). */
  lastGasp() {
    if (this.attacked || !(this.phase === 'up' || this.phase === 'hurt')) return false;
    const g = this.game, o = this.owner, cand = [];
    for (const p of live(g)) {
      if (g.mm?.holds?.has(p) || p.down) continue;
      const dx = Math.abs(p.x - this.x), dy = Math.abs(p.y - this.y);
      if (dx < 250 && dy < 30) cand.push([dx > 90 ? 'slap' : 'sweep', p]);
    }
    if (!cand.length) return false;
    const [kind, p] = cand[(Math.random() * cand.length) | 0];
    const tele = Math.round((kind === 'slap' ? KR.slapTele : KR.sweepTele) * (o.saidHint?.[kind] ? 1 : 1.5));
    this.face(p); this.attacked = true;
    if (kind === 'slap') { this.atk = { kind, tele, x: this.x + this.facing * (TENT()?.SLAP_TIP?.[0] || 172), y: this.y }; this.set('slapWind'); }
    else { this.atk = { kind, tele }; this.set('sweepWind'); }
    audio.sfx('tentacle_wind'); o.attackHint?.(kind);
    return true;
  }
  wilt(hit) {
    const g = this.game;
    if (this.phase === 'wilt' || this.phase === 'gone') return;
    this.dieAfter = false;
    this.releaseHeld(this.held ? 'FREE!' : null); this.releaseToken(); this.atk = null;
    this.set('wilt');
    if (hit) { g.fx.word(this.x, this.y, 210, true, 'OUCH!'); g.score += 200; audio.sfx('tentacle_wilt'); }
    this.owner.onTentacleDown?.(this);
  }
  releaseHeld(word) {
    const g = this.game, p = this.held;
    this.held = null; this.freeHits = 0;
    if (!p) return;
    g.mm?.release?.(p); p.z = 0;
    if (word) holdWord(g, p, word);
  }
  face(p) { if (p && Math.abs(p.x - this.x) > 6) this.facing = p.x > this.x ? 1 : -1; }
  update() {
    const g = this.game;
    this.tick(); this.age++;
    if (g.cut || g.cutin) { this.age--; return; }
    if (this.dieAfter && !this.armored) { this.hp = 0; this.wilt(true); }   // (beaten during its slap / sweep: it wilts once the hit is past)
    const ps = live(g), near = ps.length ? ps.reduce((a, b) => (Math.abs(b.x - this.x) + 2 * Math.abs(b.y - this.y) < Math.abs(a.x - this.x) + 2 * Math.abs(a.y - this.y) ? b : a)) : null;
    switch (this.phase) {
      case 'tele': if (this.age % 8 === 0) SIFX.tease(this.x, this.y, 'wood'); if (this.age >= KR.popTele) { this.set('pop'); this.burst(); } break;
      case 'pop': if (this.age >= 12) this.set('up'); break;
      case 'up': {
        this.face(near);
        if (--this.cool <= 0 && g.fighting && near) this.choose(ps);
        break;
      }
      case 'hurt': this.cool--; if (this.age >= 16) this.set('up'); break;   // (its next attack keeps coming while it flinches)
      case 'slapWind': if (this.age >= (this.atk?.tele || KR.slapTele)) { this.set('slap'); audio.sfx('tentacle_swish'); } break;
      case 'slap': {
        if (this.age === Math.round(KR.slapLen * KR.slapHit)) {   // (the painted pack's slap hits the deck at its drawing 2 of 3: k 0.25)
          const A = this.atk;
          audio.sfx('tentacle_slap'); g.shake = Math.max(g.shake, 5); g.fx.dust(A.x, A.y, 6, 40);
          for (const p of g.players) { if (!p.hittable || p.out || p.z > 40) continue; const ex = (p.x - A.x) / KR.slapR, ey = (p.y - A.y) / (KR.slapR * 0.34); if (ex * ex + ey * ey > 1) continue; p.takeHit({ x: A.x - this.facing * 30, team: 'foe', facing: this.facing }, { dmg: KR.dmg, kind: 'knock', push: 5, lift: 5.5, stop: 5, sfx: 'hit_heavy', spark: 'warm' }); g.fx.word(p.x, p.y, 150, true, 'SLAP!'); }
        }
        if (this.age >= KR.slapLen) this.endAttack();
        break;
      }
      case 'sweepWind': if (this.age >= (this.atk?.tele || KR.sweepTele)) { this.set('sweep'); this.hitSet = new Set(); audio.sfx('tentacle_swish'); } break;
      case 'sweep': {
        const k = this.age / KR.sweepLen, tipX = this.x + this.facing * KR.sweepHalf * (2 * k - 1);
        for (const p of g.players) { if (!p.hittable || p.out || this.hitSet.has(p) || p.z > 44 || Math.abs(p.y - this.y) > KR.laneH || Math.abs(p.x - tipX) > 50) continue; this.hitSet.add(p); p.takeHit({ x: tipX - this.facing * 20, team: 'foe', facing: this.facing }, { dmg: KR.dmg, kind: 'knock', push: 5, lift: 5, stop: 5, sfx: 'hit_heavy' }); g.fx.word(p.x, p.y, 150, true, 'SWEEP!'); }
        if (this.age >= KR.sweepLen) this.endAttack();
        break;
      }
      case 'grabWind': {
        const A = this.atk, p = A.tgt;
        if (this.age < (A.tele || KR.grabTele) - 34 && p && p.alive && !p.out) { A.x += clamp(p.x - A.x, -2, 2); A.y += clamp(p.y - A.y, -1.5, 1.5); }   // (the ring creeps after its hero -- slower than a walk -- then locks 34 f before the grab)
        this.facing = A.x > this.x ? 1 : -1;
        if (this.age >= (A.tele || KR.grabTele)) { this.set('grab'); this.tryGrab(); }
        break;
      }
      case 'grab': if (this.age >= KR.grabLen) { if (this.held) this.set('hold'); else this.endAttack(); } break;
      case 'hold': {
        const p = this.held;
        if (!p || !g.mm?.holds?.has(p)) { this.held = null; this.endAttack(); break; }
        const H = TENT()?.HOLD || [120, -88], hx = this.x + this.facing * H[0], hz = -H[1] - 40;
        p.x += (hx - p.x) * 0.2; p.y += (this.y - p.y) * 0.2; p.z += (hz + Math.sin(this.age * 0.2) * 4 - p.z) * 0.2;
        if (this.age > 260) { this.releaseHeld('WHEEE!'); p.takeHit?.({ x: this.x, team: 'foe', facing: this.facing }, { dmg: 4, kind: 'light', push: 2, stun: 18, stop: 3, sfx: 'hit_light' }); this.endAttack(); }
        break;
      }
      case 'wilt': if (this.age >= 40) { this.set('gone'); this.alive = false; this.gone = true; } break;
      default: break;
    }
  }
  /** pick an attack for the nearest hero in reach (a token: one or two tentacles attack at a time) */
  choose(ps) {
    const g = this.game, o = this.owner, f = this.facing;
    const cand = [];
    for (const p of ps) {
      if (g.mm?.holds?.has(p) || p.down) continue;
      const dx = (p.x - this.x) * f, dy = Math.abs(p.y - this.y);
      if (dx > 90 && dx < 250 && dy < 30) cand.push(['slap', p]);
      if (Math.abs(p.x - this.x) < 200 && dy < 30) cand.push(['sweep', p]);
      if (o.round >= 2 && g.frame - (o.grabAt ?? -9999) > 480 && Math.abs(p.x - this.x) < 220 && dy < 80 && !g.actors.some((t) => t instanceof EyeTentacle && (t.held || t.phase === 'grabWind'))) cand.push(['grab', p]);   // (8 s between grabs: they were most of the attacks)
    }
    if (!cand.length || !this.takeToken()) { this.cool = rnd(30, 60); return; }
    const [kind, p] = cand[(Math.random() * cand.length) | 0];
    const tele = Math.round({ slap: KR.slapTele, sweep: KR.sweepTele, grab: KR.grabTele }[kind] * (o.saidHint?.[kind] ? 1 : 1.5));   // (the first of each kind: a longer look)
    if (kind === 'slap') { this.face(p); this.atk = { kind, tele, x: this.x + this.facing * (TENT()?.SLAP_TIP?.[0] || 172), y: this.y }; this.set('slapWind'); }
    else if (kind === 'sweep') { this.face(p); this.atk = { kind, tele }; this.set('sweepWind'); }
    else { this.atk = { kind, tele, x: p.x, y: p.y, tgt: p }; this.set('grabWind'); o.grabAt = g.frame; }
    this.attacked = true;
    audio.sfx('tentacle_wind');
    o.attackHint?.(kind);
  }
  tryGrab() {
    const g = this.game, A = this.atk;
    for (const p of g.players) {
      if (!p.hittable || p.out || p.z > 36) continue;
      const ex = (p.x - A.x) / KR.grabR, ey = (p.y - A.y) / (KR.grabR * 0.34);
      if (ex * ex + ey * ey > 1) continue;
      if (g.mm?.hold?.(p, { by: this, kind: 'tentacle' })) { this.held = p; this.freeHits = 0; holdWord(g, p, 'GOT YOU!'); audio.sfx('tentacle_grab'); return; }
    }
    g.fx.word(A.x, A.y, 150, true, 'MISSED!');
  }
  holdText(key, solo) { return `A tentacle has you! MASH ${key}!${solo ? '' : ' || Or a friend hits it 3 times!'}`; }
  endAttack() { this.atk = null; this.releaseToken(); this.set('up'); this.cool = rnd(KR.cool[0], KR.cool[1]) * (live(this.game).length > 1 ? 0.85 : 1) * (this.owner.round >= 3 ? 0.75 : 1); }
  /** the pop-up: anyone in its ring is bumped */
  burst() {
    const g = this.game, R = 64;
    audio.sfx('plank_burst'); g.shake = Math.max(g.shake, 6);
    g.fx.dust(this.x, this.y, 8, 50); g.fx.debris(this.x, this.y, 20, ['#7a5030', '#4a3018', '#c9a070'], 12);
    SIFX.burst(this.x, this.y, 4, 'wood', { k: 1.6 }); SIFX.splash(this.x, this.y, 'sea');
    for (const p of g.players) { if (!p.hittable || p.out || p.z > 36) continue; const ex = (p.x - this.x) / R, ey = (p.y - this.y) / (R * 0.34); if (ex * ex + ey * ey > 1) continue; p.takeHit({ x: this.x + (p.x < this.x ? 30 : -30), team: 'foe', facing: p.x < this.x ? -1 : 1 }, { dmg: KR.dmg, kind: 'knock', push: 5, lift: 6, stop: 6, sfx: 'hit_heavy', spark: 'warm' }); g.fx.word(p.x, p.y, 150, true, 'POP!'); }
  }
  pose() {
    const A = TENT()?.ANIM || {}, t = this.game.frame / 60, a = this.age;
    switch (this.phase) {
      case 'pop': return A.popUp(Math.min(1, a / 12));
      case 'hurt': return A.hurt(Math.min(1, a / 16));
      case 'slapWind': return A.slapWind(Math.min(1, a / 22));
      case 'slap': return A.slap(Math.min(1, a / KR.slapLen));
      case 'sweepWind': return A.sweepWind(Math.min(1, a / 22));
      case 'sweep': return A.sweep(Math.min(1, a / KR.sweepLen));
      case 'grabWind': return A.slapWind(0.8 * Math.min(1, a / 26));   // (it coils back to lunge: the grab's wind-up pose)
      case 'grab': return A.grab(Math.min(1, a / KR.grabLen));
      case 'hold': return A.hold(t);
      case 'wilt': return A.wilt(Math.min(1, a / 40));
      default: return A.idle(t);
    }
  }
  /** the warnings on the deck (under everyone) */
  drawShadow(ctx) {
    const g = this.game, sx = this.sx, sy = FLOOR_TOP + this.y;
    const ring = (x, y, R, k, fill, rim, b, mark) => {   // (mark 'x': a solid rim and a big X -- the slap; else a dashed rim: not hue-only, for colour-blind kids)
      ctx.save();
      ctx.globalAlpha = 0.3 + 0.32 * k; ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, R, R * 0.34, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = b; ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.beginPath(); ctx.ellipse(x, y, R * (1.14 - 0.14 * k), R * 0.34 * (1.14 - 0.14 * k), 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = rim; ctx.lineWidth = 4; if (mark !== 'x') ctx.setLineDash([12, 8]); ctx.stroke(); ctx.setLineDash([]);
      if (mark === 'x') { const a = R * 0.42, c = R * 0.42 * 0.34; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - a, y - c); ctx.lineTo(x + a, y + c); ctx.moveTo(x + a, y - c); ctx.lineTo(x - a, y + c); ctx.strokeStyle = INK; ctx.lineWidth = 8; ctx.stroke(); ctx.strokeStyle = '#fff2c8'; ctx.lineWidth = 4; ctx.stroke(); }
      ctx.restore();
    };
    if (this.phase === 'tele') {   // cracked planks + a red ring where it will burst up
      const k = Math.min(1, this.age / KR.popTele), b = this.age > KR.popTele - 22 ? pulse(this.age) : 1;
      ring(sx, sy, 64, k, 'rgb(255,70,50)', '#ffe03a', b);
      ctx.save(); ctx.lineCap = 'round'; ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.3, r = 10 + 34 * k, m = r * 0.55, w = (i % 2 ? 5 : -5) * k; ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a) * m + w, sy + Math.sin(a) * m * 0.34); ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r * 0.34); }
      ctx.strokeStyle = 'rgba(30,16,8,0.9)'; ctx.lineWidth = 6.5; ctx.stroke(); ctx.strokeStyle = '#f4dcb0'; ctx.lineWidth = 3.2; ctx.stroke(); ctx.restore();   // (pale split planks, ink-edged: they read on the dark deck)
      return;
    }
    if (this.phase !== 'gone') {   // the hole it came out of
      ctx.fillStyle = 'rgba(12,6,24,0.55)'; ctx.beginPath(); ctx.ellipse(sx, sy, 30, 10, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#3a2418'; ctx.lineWidth = 3; ctx.stroke();
    }
    if (this.phase !== 'tele' && this.phase !== 'gone') { ctx.save(); ctx.fillStyle = 'rgba(16,6,14,0.38)'; ctx.beginPath(); ctx.ellipse(sx, sy + 2, 36, 9, 0, 0, TAU); ctx.fill(); ctx.restore(); }   // (its contact shadow: it stands on the deck, the head's legs drape over it)
    const A = this.atk;
    if (this.phase === 'slapWind' && A) { const T = A.tele || KR.slapTele, k = Math.min(1, this.age / T), b = this.age > T - 20 ? pulse(this.age) : 1; ring(A.x - g.camX, FLOOR_TOP + A.y, KR.slapR, k, 'rgb(255,70,50)', '#ffe03a', b, 'x'); }
    if (this.phase === 'grabWind' && A) { const T = A.tele || KR.grabTele, k = Math.min(1, this.age / T), b = this.age > T - 20 ? pulse(this.age) : 1; ring(A.x - g.camX, FLOOR_TOP + A.y, KR.grabR, k, 'rgb(240,60,220)', '#ffd0f8', b); }
    if (this.phase === 'sweepWind') {   // a pink lane along the deck round its base: JUMP it
      const T = A?.tele || KR.sweepTele, k = Math.min(1, this.age / T), b = this.age > T - 20 ? pulse(this.age) : 1, x0 = sx - KR.sweepHalf, w = KR.sweepHalf * 2, d = this.facing;
      ctx.save(); ctx.globalAlpha = (0.26 + 0.3 * k) * (0.6 + 0.4 * b); ctx.fillStyle = 'rgb(255,64,170)'; ctx.fillRect(x0, sy - 26, w, 52);
      ctx.globalAlpha = b; ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.setLineDash([14, 9]); ctx.strokeRect(x0, sy - 26, w, 52); ctx.strokeStyle = '#ffd6f6'; ctx.lineWidth = 3; ctx.strokeRect(x0, sy - 26, w, 52); ctx.setLineDash([]);
      ctx.strokeStyle = '#fff0fa'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 0; i < 5; i++) { const x = x0 + ((i * 86 + this.age * 4 * d) % w + w) % w; ctx.beginPath(); ctx.moveTo(x - 9 * d, sy - 12); ctx.lineTo(x + 8 * d, sy); ctx.lineTo(x - 9 * d, sy + 12); ctx.stroke(); }
      ctx.restore();
    }
  }
  draw(ctx) {
    const g = this.game, M = TENT();
    if (!M || this.phase === 'tele' || this.phase === 'gone') {
      if (this.phase === 'tele') {   // a "!" over the ring
        const sx = this.sx, sy = FLOOR_TOP + this.y;
        ctx.save(); ctx.font = 'bold 46px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
        const yy = sy - 52 + Math.sin(g.time * 8) * 3; ctx.strokeText('!', sx, yy); ctx.fillStyle = '#fff2a0'; ctx.fillText('!', sx, yy); ctx.restore();
      }
      return;
    }
    const fl = this.flash >= 4 && g.frame - (this._flashF ?? -999) >= 96 ? ((this._flashF = g.frame), 0.3) : g.frame - (this._flashF ?? -999) < 3 ? 0.3 : 0;   // (a soft hit tint, at most once per 96 frames: flash safety)
    ctx.save(); ctx.translate(this.sx, FLOOR_TOP + this.y);
    try { M.draw(ctx, this.pose(), { facing: this.facing, scale: 1, t: g.frame / 60, flash: fl, mem: this.mem }); } catch (e) { if (!this._drawErr) { this._drawErr = 1; console.error('tentacle draw', e); } }
    ctx.restore();
    if (this.held && this.held.sortY < this.sortY) xrayHero(ctx, g, this.held, 0.5);   // (curled up in its tip, behind it: shown through)
  }
}

// ------------------------------------------------------------------------------------------------ THE KRAKEN (reworked)
const COLLAR_Y = 36;
/** THE KRAKEN: a giant purple head behind the rail (the STAGE draws it from this.K: src/stages/sikraken.js drawKraken) wearing Malachar's
 * spiked collar.  THREE ROUNDS: each round EYED TENTACLES burst up through the deck (3 / 4 / 5, more with 3-4 players); when the last of
 * a round is beaten the Kraken is STUNNED -- its head slumps onto the rail, eyes swirling -- and its HEAD can be hit: the bar drains
 * toward the next third; when the stun ends the bar snaps to that third, so three rounds always take it down.  Then it collapses and
 * the story (si_kraken_end: the book's panels -- Shadow breaks the collar) plays.  Nobody is hurt: it was Malachar's prisoner. */
export class Kraken extends SIBoss {
  constructor(game, x, y, opt = {}) {
    super(game, x, y, opt, 'THE KRAKEN', 'The Terror of the Seven Seas', KR.hp);
    this.art = 'kraken'; this.w = 170; this.h = 360; this.hz0 = 0; this.depthR = 34; this.balloonH = 360; this.shadowR = 0; this.ownFinish = true; this.usesLaunch = false;
    this.hideFoeBars = true; this.round = 0; this.toSpawn = 0; this.total = 0; this.popT = 0; this.tokensOut = 0; this.saidHint = {};
    this.K = { x, rise: 0, eyeL: 1, eyeR: 1, flashL: 0, flashR: 0, gold: 0, crack: 0, broken: 0, aim: 0, thrash: 0, shake: 0, mouth: 0, glow: 0, glowCol: '#ffd23a', stun: 0, dizzy: 0 };
    this.hurtSfx = 'brute_hurt'; this.state = 'intro'; this.y = COLLAR_Y; this.introT = -1;   // (introT -1: the head stays down in the sea until its card -- bossIntro -- so it never shows risen, then drops, around the gate story)
    game.stage?.setKraken?.(this.K);
    game.stage?.setStorm?.(0.7);
  }
  get open() { return this.state === 'stun'; }   // (its HEAD can only be hit while it is stunned)
  get collarX() { return undefined; }
  bossIntro() { this.set('intro'); this.introT = 0; audio.sfx('kraken_roar'); this.game.shake = Math.max(this.game.shake, 10); }
  bossFight() {
    const g = this.game;
    g.mm?.hint?.('sikrakenA', 'TENTACLES with EYES! Beat them ALL! || A RED ring = one pops up there: step OUT!', 360, true);
    this.beginRound(1);
  }
  tentacles() { return this.game.actors.filter((a) => a instanceof EyeTentacle && !a.gone); }
  beginRound(r) {
    const g = this.game, n = live(g).length;
    this.round = r; this.set('round'); this.toSpawn = this.total = KR.rounds[Math.max(1, Math.min(4, n)) - 1][r - 1]; this.popT = 20;
    if (r > 1) { g.mm?.line?.('krakenRound'); g.mm?.hint?.('sikrakenR' + r, `More tentacles! Beat ALL ${this.total} of them!`, 260, true); }
  }
  /** how many of this round are still to beat (up, coming, or still to pop) */
  get left() { return this.toSpawn + this.tentacles().filter((t) => !t.wilting).length; }
  spawnSpot() {
    const g = this.game, ps = live(g), ts = this.tentacles();
    let best = null, bestD = -1;
    for (let i = 0; i < 16; i++) {
      const x = g.camX + rnd(120, W - 120), y = rnd(22, Math.min(DEPTH - 22, 95));   // (not in the front lane under the hint pill)
      const d = Math.min(...ps.map((p) => Math.hypot(p.x - x, (p.y - y) * 2.2)), ...ts.map((t) => Math.hypot(t.x - x, (t.y - y) * 2.2) * 0.8), 999);
      if (d > 150) return [x, y];
      if (d > bestD) { bestD = d; best = [x, y]; }
    }
    return best;
  }
  stepRound() {
    const g = this.game, n = Math.max(1, Math.min(4, live(g).length));
    const up = this.tentacles().filter((t) => !t.wilting).length;
    if (this.toSpawn > 0 && up < KR.maxUp[n] && --this.popT <= 0) {
      const [x, y] = this.spawnSpot();
      g.actors.push(new EyeTentacle(g, x, y, this)); this.toSpawn--; this.popT = n > 1 ? KR.popGapCoop : KR.popGap;
      audio.sfx('tentacle_wind', { vol: 0.6 });
    }
    if (this.toSpawn === 0 && this.tentacles().length === 0) this.beginStun();
  }
  onTentacleDown() { const g = this.game, L = this.left; if (L > 0 && L <= 2 && g.frame - (this.leftAt ?? -999) > 120) { this.leftAt = g.frame; this.moreN = L; this.moreAt = g.frame; if (false) g.fx.label(0, 0, 0, L === 1 ? 'ONE MORE!' : 'TWO MORE!', '#ffe066', 30, 60); } }
  attackHint(kind) {
    const g = this.game, m = g.mm;
    // (QA2 M2: no longer clears the other kinds' hints -- each says its piece once, through Book 2's hint queue, its read time kept)
    if (this.saidHint[kind]) return; this.saidHint[kind] = true;
    const H = { slap: 'RED ring by a tentacle = a SLAP! Step out!', sweep: 'A PINK lane = a SWEEP: JUMP it!', grab: 'PINK ring at your feet = a GRAB! Move!' };
    m?.hint?.('sikrakenAtk_' + kind, H[kind], 240, true, { ttl: 240 });   // (fresh for 4 s: an old attack's hint never comes late)
  }
  get floorHp() { return Math.round(this.maxHp * (1 - this.round / 3)); }
  beginStun() {
    const g = this.game;
    this.set('stun'); this.stunT = 0; this.hurtAt = g.frame; this.landed = false;
    audio.sfx('kraken_stun'); g.shake = Math.max(g.shake, 5);
    g.mm?.clearHint?.('sikrakenNag_again', 'sikrakenR2', 'sikrakenR3');   // (the round's tips go with its stun: R4)
    g.mm?.hint?.('sikrakenstun' + this.round, "It's DIZZY -- hit its HEAD! (at the rail)", 160, true);   // (no DIZZY! word too: the bar's label and this say it -- four at once was a pile; Dodongo's line comes later, update)
  }
  get stunLen() { return live(this.game).length > 1 ? KR.stunCoop : KR.stun; }
  dmgOf(att, hd) {
    if (this.state !== 'stun') return null;
    let d = Math.min(Math.max(4, hd.dmg || 1) * KR.headK, KR.headCap);   // (x1.6: a kid with half a bot's uptime still drains it to the third)
    if (att && att.helper) d *= 0.6;
    d = Math.min(d, this.hp - this.floorHp);
    return d > 0 ? Math.round(d) : 0;
  }
  onDamage(att, hd, d) { if (d > 0) this.headHitAt = this.game.frame; if (d <= 0 && this.hp <= this.floorHp && this.reachedAt === undefined) this.reachedAt = this.st; if (this.hp <= this.floorHp && this.reachedAt === undefined) this.reachedAt = this.st; }
  onZero() {}
  endStun() {
    const g = this.game;
    this.hp = Math.min(this.hp, this.floorHp); this.reachedAt = undefined;   // (the bar snaps to the third: three rounds always take it down)
    g.mm?.clearHint?.('sikrakenstun' + this.round);   // (its hint goes with the stun)
    if (this.round >= 3) { this.beginDown(); return; }
    this.set('recover');
  }
  beginDown() {
    const g = this.game;
    this.set('down'); this.hp = 0; this.releaseToken();
    SIFX.bossBeat?.(g, this);   // (the final blow: slow-mo + a camera nudge + its material burst, src/sifx.js)
    // (RC2: its gold shock ring is an fx 'under' ring, drawn after this boss's floor pass -- over the draped front arms.  Taken over: drawn
    //  in drawFloor, under the head, as the stun's band; aged in update as the fx did)
    { const U = g.fx?.under || []; for (let i = U.length - 1; i >= 0; i--) if (U[i].type === 'ring' && U[i].shock && U[i].t === 0) { this._downRing = U.splice(i, 1)[0]; break; } }
    for (const t of this.tentacles()) t.wilt(false);
    for (const p of g.players) p.ctl = false;
    g.pending = [];
    g.mm?.clearHint?.('sikrakenA', 'sikrakenstun1', 'sikrakenstun2', 'sikrakenstun3');
    audio.sfx('kraken_down'); g.shake = Math.max(g.shake, 10);
    g.mm?.line?.(g.players.some((q) => !q.out && baseOf(q.heroId) === 'shadow') ? 'krakenDown' : 'krakenDownNoSha');   // (QA2: no 'Shadow!' with no Shadow in the party)
  }
  update() {
    const g = this.game, K = this.K;
    this.tick();
    this.x = this.home.x;   // (the head stays put)
    if (this._downRing && (++this._downRing.t >= this._downRing.life || this.state !== 'down')) this._downRing = null;   // (the down ring, aged once a tick as in the fx)
    // (RC2: a head hit in the stun -- a flinch, eased: up over ~3 frames, then settling; rapid 4P hits hold it, never a pop)
    { const h = g.frame - (this.headHitAt ?? -99); this._flinch = this.state === 'stun' && h < 3 ? Math.min(1, (this._flinch || 0) + 0.4) : (this._flinch || 0) * 0.78; }
    g.stage?.setKraken?.(HEADP() ? null : K);   // (the painted head: this draws it, drawFloor)
    K.x = this.x + SIFX.kickOf(this); K.flashL = K.flashR = 0; K.glow = 0; K.aim = 0; K.gold = 0; K.crack = 0; K.broken = 0;   // (kickOf: a hero's hit knocks the head back a few px, src/sifx.js -- the stage draws it, so the kick rides in K.x)
    const out = this.state === 'stun' || this.state === 'down' || this.state === 'defeated';   // (beaten, it stays slumped and dizzy into the clear and the story)
    const stunTo = out ? 1 : 0;
    K.stun += (stunTo - K.stun) * (stunTo ? 0.07 : 0.06); K.dizzy = out ? Math.min(1, K.dizzy + 0.04) : Math.max(0, K.dizzy - 0.05);   // (0.07: it sags onto the rail over ~half a second, then the thud)
    if (g.cut && g.cut.kind !== 'ending' && g.cut.kind !== 'boss') return;
    switch (this.state) {
      case 'intro': {
        if (this.introT < 0) { K.rise = 0; K.shake = 0; break; }
        this.introT += 1;
        { const u = Math.min(1, this.introT / 64); K.rise = u * u * (3 - 2 * u); } K.shake = K.rise < 1 ? 2.5 : 0; K.thrash = 0.5 * (1 - K.rise);   // (up within the card: its head and eyes on it, not only the arms -- QAF capture)
        break;
      }
      case 'round': {
        K.rise = Math.min(1, K.rise + 0.03); K.thrash = 0.25 + 0.15 * Math.sin(g.time * 2); K.shake = 0; K.mouth = 4;
        if (this.round > 1 && this.st === ROAR_PEAK && g.fighting) this.roarPeak();   // (the roar's peak: a warning beat between rounds)
        if (!g.fighting || g.cut) break;
        this.stepRound();
        this.nag();
        break;
      }
      case 'stun': {
        K.rise = 1; K.thrash = 0; K.shake = 0; K.mouth = 10;
        if (!this.landed && K.stun > 0.85) { this.landed = true; g.shake = Math.max(g.shake, 9); audio.sfx('knockdown', { pitch: 0.5, vol: 0.9 }); g.fx.dust?.(this.x, 6, 10, 60); }   // (THUD: its chin on the rail)
        if (this.st === 130 && this.round === 1) g.mm?.line?.('krakenDizzy');
        if (!g.fighting || g.cut) break;
        if (this.st >= this.stunLen || (this.reachedAt !== undefined && this.st >= this.reachedAt + 30)) this.endStun();
        break;
      }
      case 'recover': {
        K.thrash = 0.6; K.mouth = 6;
        if (this.st === 20) audio.sfx('kraken_roar', { vol: 0.7 });
        if (this.st >= KR.recover) this.beginRound(this.round + 1);
        break;
      }
      case 'down': {
        K.thrash = 0; K.mouth = 12;
        if (this.st >= KR.downT) { for (const p of g.players) p.ctl = true; this.defeat(); }
        break;
      }
      default: break;
    }
  }
  keyHint(n) { return this.state === 'round' ? (this.left > 0 ? ['sikrakenNag', `Beat ALL the tentacles! (${this.left} left)`] : null) : this.state === 'stun' ? ['sikrakenNagS', "It's DIZZY -- hit its HEAD!"] : (n % 2 ? ['sikrakenNag', 'Beat ALL the tentacles!'] : null); }
  defeat() { if (!this.alive) return; this.game.stage?.setBehindRail?.(null); for (const t of this.tentacles()) { t.releaseHeld(null); t.gone = true; t.alive = false; } super.defeat(); }
  /** the round's tally under the boss bar: ROUND n/3 and a pip per tentacle (lit = still to beat) */
  /** how far the tally reaches under the boss bar (pill top to its pips / 'ONE MORE!'): hud.js keeps balloons and words below it -- the FX agent's round-2 note */
  get meterH() { return ['round', 'stun', 'recover'].includes(this.state) ? (this.state === 'round' ? 78 : 34) : 0; }
  meterHud(ctx) {
    if (!['round', 'stun', 'recover'].includes(this.state)) return;
    const g = this.game, cx = g._bossBarCX ?? (HEADP() ? W - 168 : W / 2);   // (centred under the boss bar, in the boss block hud.js slides clear -- the FX agent's QAF ask: at W - 168 it sat on 4P heads)
    const y = (g._bossBarBottom ?? 77) + 18, L = this.state === 'round' ? this.left : 0, n = this.total || 0;
    ctx.save(); ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    ctx.font = `bold ${g.players.length > 2 ? 23 : 22}px Bangers, Impact, sans-serif`; ctx.lineWidth = 5; ctx.strokeStyle = INK;   // (3-4P: bigger, QA1 -- the FX agent's)
    const dz = this.state === 'stun' || (this.state === 'recover' && this.st < 20);
    const lab = dz ? `DIZZY! HIT ITS HEAD!  ${this.round}/3` : `ROUND ${this.round} / 3`;
    const pw = Math.max(ctx.measureText(lab).width + 28, this.state === 'round' ? n * 30 + 20 : 0), ph = this.state === 'round' ? 52 : 28;
    ctx.fillStyle = 'rgba(15,26,51,0.9)'; ctx.beginPath(); ctx.roundRect?.(cx - pw / 2, y - 19, pw, ph, 10); ctx.fill();   // (a dark plate: the tally reads over the violet head)
    ctx.strokeText(lab, cx, y); ctx.fillStyle = dz ? '#fff2a8' : '#e8c8ff'; ctx.fillText(lab, cx, y);
    if (this.state === 'round') for (let i = 0; i < n; i++) {
      const x = cx + (i - (n - 1) / 2) * 30, on = i < L;
      ctx.beginPath(); ctx.arc(x, y + 19, 11, 0, TAU); ctx.fillStyle = on ? '#e08ae8' : 'rgba(110,90,120,0.55)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
      if (on) { ctx.fillStyle = '#fff6d8'; ctx.beginPath(); ctx.arc(x + 1, y + 18, 4.6, 0, TAU); ctx.fill(); ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x + 2, y + 18, 2.2, 0, TAU); ctx.fill(); }   // (each pip is a little eye)
    }
    if (this.state === 'round' && this.moreAt !== undefined && g.frame - this.moreAt < 100 && this.moreN > 0) {   // ("TWO MORE!" under the pips: not a word over the fight)
      const t = this.moreN === 1 ? 'ONE MORE!' : 'TWO MORE!'; ctx.font = 'bold 22px Bangers, Impact, sans-serif'; ctx.lineWidth = 5; ctx.strokeText(t, cx, y + 56); ctx.fillStyle = '#ffe066'; ctx.fillText(t, cx, y + 56);
    }
    ctx.restore();
  }
  draw(ctx) {
    this.drawRoar(ctx);   // (the roar's word, between rounds: RC2)
    // dizzy stars round its crown while it is stunned (the stage writes the crown's screen point: K.sx / K.sy)
    if ((this.state === 'stun' || this.state === 'down') && this.K.sx !== undefined) {
      const t = this.game.frame / 60, hx = this.K.sx - SIFX.kickOf(this), hy = this.K.sy + 56;   // (K.sx has the kick already; World.render translates this draw by it too)   // (round its brow, clear of the boss bar's DIZZY! label)
      ctx.save(); ctx.globalAlpha = clamp(this.K.stun, 0, 1); ctx.fillStyle = '#ffe066'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) { const a = t * 2.6 + i * TAU / 5, x = hx + Math.cos(a) * 110, y = hy + Math.sin(a) * 22; star5(ctx, x, y, 12); }
      ctx.restore();
      if (this.state === 'stun' && this.landed) {   // the target: a bobbing arrow onto its head
        // (RC critics: above the crown, pointing down at the dome -- the HUD band's line put it between the eyes, a beak's spot; only the top
        //  row is over the head's middle -- the score in 1-2P (the two cards sit at the sides), the hero cards in 3-4P (every player's: the
        //  players' count): its top kept under that, the bob included)
        const top = this.game.players.length >= 3 ? 80 : 60, ay = Math.max(this.K.sy - 14, top + 34) - 8 * Math.abs(Math.sin(this.game.frame * 0.12));
        ctx.save(); ctx.fillStyle = '#ffe066'; ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(hx - 12, ay - 26); ctx.lineTo(hx + 12, ay - 26); ctx.lineTo(hx + 12, ay - 10); ctx.lineTo(hx + 22, ay - 10); ctx.lineTo(hx, ay + 10); ctx.lineTo(hx - 22, ay - 10); ctx.lineTo(hx - 12, ay - 10); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      }
    }
  }
  /** while it is dizzy: a soft gold band on the deck by the rail under its head -- stand here and hit it (the floor pass, under the head) */
  drawShadow() {}
  drawBand(ctx) {
    if (this.state !== 'stun' || !this.landed) return;
    const g = this.game, sx = this.x - g.camX, sy = FLOOR_TOP + COLLAR_Y, b = pulse(this.st);
    ctx.save(); ctx.globalAlpha = 0.34 * b; ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.ellipse(sx, sy, 150, 30, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.95 * b; ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.setLineDash([12, 9]); ctx.stroke(); ctx.strokeStyle = '#ffe9a0'; ctx.lineWidth = 3; ctx.setLineDash([12, 9]); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  }
  /** where a hero's hit sparks and its word go while it is dizzy: on its head's upper rim (they hid its swirl eyes), src/player.js */
  get sparkBox() {
    const K = this.K; if (this.state !== 'stun' || K.sy === undefined) return null;
    const top = FLOOR_TOP + this.y - K.sy;   // (the crown's height over the deck at its depth)
    return { x: this.x, z: top - 40, h: 60, w: 60, hz0: 0 };
  }
  /** the painted head's pose from the fight */
  headPose(H) {
    const A = H.ANIM, g = this.game, t = g.frame / 60, K = this.K, st = this.state, k = (n, d) => Math.max(0, Math.min(1, n / d));
    if ((st === 'intro' || st === 'round') && K.rise < 0.999) return A.rise(K.rise);   // (it rises until it is up, card or no card: no pop)
    if (st === 'intro') return A.idle(t);
    // (RC2: a hit in the stun keeps the dizzy drawing -- the hurt one's shut eyes read as empty sockets, the eyes blinking on and off
    //  under 4P's hits; the hit's feedback is the flinch, drawFloor)
    if (st === 'stun') return K.stun < 0.9 ? A.stunned(Math.max(0.34, K.stun / 0.9)) : A.dizzy(t);   // (from its 2nd drawing: the 1st's painted lids carry ghost eyes -- 'two faces' as DIZZY starts, QAF3; the swap is on drawFloor's squash)
    if (st === 'recover') return this.st < 20 ? A.dizzy(t) : A.recover(k(this.st - 20, KR.recover - 20));   // (dizzy until its tally turns at st 20, then the pack's 4-drawing recover up from the slump -- critic B: no un-slumping twice, no pop)
    if (st === 'down') return A.collapse(k(this.st, KR.downT));
    if (st === 'defeated') return A.collapse(1);
    if (st === 'round' && this.round > 1 && this.st < 40) return A.roar(k(this.st, 40));
    return A.idle(t);
  }
  /** the arms behind the head (painter 1's eyeless kraken_arm pack, src/chars/kraken_arm3d.js): rising with it, swaying while it fights,
   *  drooping while it is stunned, sinking as it goes down; drawn behind the rails (setBehindRail), their roots hidden by the bulwark */
  drawArmsBehind(ctx, sx, sc, t) {
    const ARM = CHARS.kraken_arm; if (!ARM?.ready?.() || !(this.K.rise > 0.01) || !HEADP()) return;
    const K = this.K, st = this.state, k = (n, d) => Math.max(0, Math.min(1, n / d));
    let ph = 'up', kk = 0;
    if (K.rise < 0.999) { ph = 'rise'; kk = K.rise; }
    else if (st === 'stun') ph = 'sink';
    else if (st === 'down') { ph = 'sink'; kk = k(this.st, KR.downT); }
    else if (st === 'defeated') return;
    const mem = this.armMem || (this.armMem = {});
    for (const [dx, f, s, p] of ARMS_BEHIND) {
      try { ARM.drawArm(ctx, sx + dx * sc, HEAD_RAIL + 16, ph, kk, t * 0.8 + p, { facing: f, scale: s * sc, mem: mem[dx] || (mem[dx] = {}) }); } catch (e) { if (!this._armsErr) { this._armsErr = 1; console.error('krakenArmsBehind', e); } }
    }
  }
  /** the painted head + collar (in front of the rails, under the telegraphs and everyone): the boss's floor pass, src/game.js */
  /** the roar's peak between rounds: a short shake and a RRRAAWR! beside the head, on the side away from the boss block (src/hud.js
   *  world._bossBlock: it slides aside, off the crown) -- never on its face, never under the bar */
  roarPeak() {
    const g = this.game, hx = (this.K.x ?? this.x) - g.camX, B = g._bossBlock, side = B ? ((B[0] + B[2]) / 2 < hx ? 1 : -1) : 1;
    g.shake = Math.max(g.shake, 6);   // (no flash: a shake and a word; Skull Island's reduced motion drops the shake, src/game.js)
    // (RC2: the word is the Kraken's own now -- fx.word holds every word under the HUD band's bottom, in 3-4P the boss block's pips, and
    //  RRRAAWR! landed on the heroes.  Placed once, here: beside the head, the side away from the boss block first, clear of the top row
    //  (score / hero cards), the boss block, the team banner and every hero with room over their heads -- drawRoar)
    const hw = 100, hh = 30, top = (g.players.length >= 3 ? 84 : 64) + 8, blocks = [];   // (RRRAAWR! at 40 px, popped to 1.2: ~190 x 56)
    if (B) blocks.push(B);
    for (const q of g.fx?.keep || []) if (q.tag === 'banner' && q.until >= g.frame) blocks.push(q.r);
    for (const p of g.players) if (!p.out) { const x = p.x - g.camX, y1 = FLOOR_TOP + p.y - (p.z || 0); blocks.push([x - 34, y1 - (p.h || 60) - 70, x + 34, y1]); }   // (70: its P-tag and a balloon over its head)
    const free = (x, y) => x - hw >= 48 && x + hw <= 912 && y - hh >= top && !blocks.some((r) => x - hw < r[2] && x + hw > r[0] && y - hh < r[3] && y + hh > r[1]);
    let at = null;
    for (const s of [side, -side]) { for (const dx of [270, 300, 240, 330]) { for (const y of [200, 170, 140, 230, top + hh]) if (free(hx + s * dx, y)) { at = [hx + s * dx, y]; break; } if (at) break; } if (at) break; }
    if (!at && (g.fx?.keep || []).some((q) => q.tag === 'banner' && q.until >= g.frame)) return;   // (a team banner up and no room beside it: no word -- the shake and the head's rear-up still say it)
    if (!at) at = [clamp(hx + side * 270, 48 + hw, 912 - hw), top + hh];   // (nowhere clear: high, beside the head -- over the heroes' heads)
    this._roar = { x: at[0] + g.camX, y: at[1], f: g.frame, col: '#ff9a2a', rot: -side * 0.1, hw, hh };
  }
  /** RRRAAWR! (roarPeak): the fx's heavy-word look -- a pop from 40 % to 120 % and back, a tilt, a fade over its last quarter, 34 frames.
   *  A team banner coming up over it later: it yields (gone) */
  drawRoar(ctx) {
    const R = this._roar, g = this.game; if (!R) return;
    const t = g.frame - R.f, life = 34, k = t / life, x = R.x - g.camX;
    if (t < 0 || t >= life || this.state !== 'round' || (g.fx?.keep || []).some((q) => q.tag === 'banner' && q.until >= g.frame && x - R.hw < q.r[2] && x + R.hw > q.r[0] && R.y - R.hh < q.r[3] && R.y + R.hh > q.r[1])) { this._roar = null; return; }
    const pop = k < 0.15 ? 0.4 + (k / 0.15) * 0.8 : k < 0.25 ? 1.2 - (k - 0.15) * 2 : 1;
    ctx.save(); ctx.translate(x, R.y); ctx.rotate(R.rot); ctx.scale(pop, pop); ctx.globalAlpha = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
    ctx.font = '40px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = 40 * 0.26; ctx.strokeStyle = INK; ctx.strokeText('RRRAAWR!', 0, 0);
    ctx.fillStyle = R.col; ctx.fillText('RRRAAWR!', 0, 0); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillText('RRRAAWR!', -1.2, -1.6); ctx.fillStyle = R.col; ctx.fillText('RRRAAWR!', 0, 0.4);
    ctx.restore();
  }
  drawFloor(ctx) {
    const H = HEADP(), K = this.K; if (!H || !(K.rise > 0.01)) return;
    this.drawBand(ctx);   // (the stand-here band: on the deck UNDER the head and its draped arms -- drawn in the shadow pass it lay over them)
    if (this._downRing) { try { this.game.fx.draw1(ctx, this._downRing, this.game.camX, this.game.time); } catch (e) { this._downRing = null; } }   // (the final blow's gold ring: under the head and its arms too -- RC2)
    const g = this.game, sx = K.x - g.camX, sy = HEAD_Y, sc = live(g).length >= 3 ? 0.8 : 0.86, t = g.frame / 60;   // (sc: its crown clears the boss bar -- the HUD band is deeper in 3-4P)
    let pose = this.headPose(H), pose2 = null, u = 0, sq = 0;
    if (this.state === 'recover') sq = Math.max(0, 1 - Math.abs(this.st - 20) / 6);   // (st 20: its tally turns from DIZZY! to ROUND n/3 -- the recover starts on this squash; headPose plays it: no hard swap since the pack's 4 drawings, critic B)   // (st 20: the frame its tally turns from DIZZY! to ROUND n/3 -- the swirl eyes stayed up 6 frames after it, final art pass)   // (the pack's recover is two drawings: a HARD swap from dizzy to upright on a squash -- the cross-fade showed two faces, two collars and a see-through body, QAF3)
    else if (this.state === 'stun') sq = Math.max(0, 1 - this.st / 8, 0.55 * (this._flinch || 0));   // (DIZZY's first drawing comes in on the same squash; a head hit's flinch: the same squash, smaller)
    const o = { facing: 1, scale: sc, t, mem: this.mem || (this.mem = {}) };
    const kr = (n, d) => Math.max(0, Math.min(1, n / d));
    if (this.state !== 'down') this._downFrom = undefined; else if (this._downFrom === undefined) this._downFrom = K.sy ?? null;   // (the crown's screen y on the last frame before the collapse)
    const dy = sc * ((this.state === 'intro' || this.state === 'round') && K.rise < 0.999 ? slideY(H, 'rise', K.rise) : this.state === 'recover' && this.st >= 20 ? slideY(H, 'recover', kr(this.st - 20, KR.recover - 20)) : this.state === 'down' ? slideY(H, 'collapse', kr(this.st, KR.downT)) : 0)
      + (this.state === 'down' && this._downFrom != null ? slideFrom(H, 'collapse', kr(this.st, KR.downT), this._downFrom, sy, sc) : 0);   // (the dome slides between the drawings' heights: critic B -- the collapse too, its 7-12 px steps; 'defeated' holds collapse(1), the last drawing, offset 0)
    ctx.save();
    if (K.rise < 0.999) { ctx.beginPath(); ctx.rect(-50, -60, W + 100, HEAD_RAIL + 70 * K.rise + 60); ctx.clip(); }   // (rising: it comes up from behind the rail -- nothing below the rail line till it is up)
    const dimArms = K.rise >= 0.999 && ['round', 'intro'].includes(this.state) && 'filter' in ctx;   // (QA2: its draped arms read as eyed targets -- below the rail, dimmed)
    // (the arms: BEHIND the rails, between the sea and the bulwark -- the stage's setBehindRail hook, set each frame; src/siworld.js clears
    //  it with the stage.  The rail hides their roots: they rise from the sea behind the head, never on the deck)
    g.stage?.setBehindRail?.(this.state === 'defeated' ? null : (this._armsHook || (this._armsHook = (c2, camX) => this.drawArmsBehind(c2, this.K.x - camX, live(g).length >= 3 ? 0.8 : 0.86, g.frame / 60))));   // (defeated: the hook handed back, as the Leviathan does)
    const drawHead = () => {
      if (dy) ctx.translate(0, dy);
      if (sq > 0) ctx.scale(1 + 0.06 * sq, 1 - 0.08 * sq);   // (the squash: down onto the rail line, the pack's anchor)
      H.draw(ctx, pose2 && u >= 1 ? pose2 : pose, o);   // (one drawing at a time: never two at once, never see-through)
    };
    try {
      if (dimArms) {
        const cut = HEAD_RAIL + 22;
        ctx.save(); ctx.beginPath(); ctx.rect(-50, -60, W + 100, cut + 60); ctx.clip(); ctx.translate(sx, sy); drawHead(); ctx.restore();
        ctx.save(); ctx.beginPath(); ctx.rect(-50, cut, W + 100, 400); ctx.clip(); ctx.filter = 'brightness(0.9) saturate(0.9)'; ctx.translate(sx, sy); drawHead(); ctx.restore();
      } else { ctx.translate(sx, sy); drawHead(); }
    } catch (e) { if (!this._headErr) { this._headErr = 1; console.error('kraken head draw', e); } }
    ctx.restore();
    const c = H.point?.(u > 0.5 ? pose2 : pose, 'crown'); if (c) { K.sx = sx + c[0] * sc; K.sy = sy + c[1] * sc + dy; }   // (the dizzy stars, the arrow and the hit words go by its crown)
  }

}
function star5(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
}
