// The Queen's Hollow (docs/SECRETS.md): the CURSE WRAITH -- the last of the green fire coiled round the sleeping Queen,
// an FX boss drawn in code: a wobbly green flame with big friendly eyes (silly, never scary) -- its wisps and fireballs,
// and the sleeping Queen herself (a code-drawn stand-in until her painted scene pack lands).
//   phase 1 (hp 100-66%): flame swipes along the floor in front of it (a long, clear wind-up)
//   phase 2 (66-33%):     swipes and sprays of three green fireballs
//   phase 3 (33-0%):      it splits into three wisps that bob and dash; the last wisp out ends it
// HP 520 before co-op scaling (World.begin: x1.4 / 1.75 / 2.1 for 2-4 players); the wisps share what's left.
import { Actor } from './actors.js';
import { Enemy, CHARS } from './enemies.js';
import { EnemyShot } from './projectiles.js';
import { audio } from './audio-proxy.js';
import { drawWithFlash } from './render.js';
import { W, DEPTH, FLOOR_TOP, INK } from './config.js';
import { clamp, TAU } from './rig.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const GREEN = ['#c8ffd8', '#7dff9e', '#35d86a', '#1f9a4c'];

/** a wobbly flame with eyes and big wobbly eyebrows (the heroes call it "a CANDLE with EYEBROWS"): body radius r, wobble
 * phase t; eyes look at (lx, ly) (relative); mood: 'ok' | 'ouch' | 'wind' | 'sleep' (eyes shut, brows droopy -- the
 * cutscenes' curseflame, docs/SECRETS_SCRIPT.md) */
export function drawFlameFace(ctx, r, t, lx, ly, mood, blink) {
  // the body: a teardrop of soft green, tongues flickering off the top
  const tongue = (k, a, len) => {
    ctx.beginPath();
    const bx = Math.sin(t * 3 + k) * r * 0.12;
    ctx.moveTo(-r * 0.55 * a, -r * 0.2);
    ctx.quadraticCurveTo(bx - r * 0.3 * a, -r - len * 0.6, bx, -r - len);
    ctx.quadraticCurveTo(bx + r * 0.3 * a, -r - len * 0.6, r * 0.55 * a, -r * 0.2);
    ctx.closePath();
  };
  ctx.save();
  const gl = ctx.createRadialGradient(0, -r * 0.2, r * 0.2, 0, -r * 0.2, r * 2.1);
  gl.addColorStop(0, 'rgba(140,255,170,0.45)'); gl.addColorStop(1, 'rgba(60,220,110,0)');
  ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, -r * 0.2, r * 2.1, 0, TAU); ctx.fill();
  for (let k = 0; k < 3; k++) { tongue(k * 2.1, 1 - k * 0.22, r * (0.7 + 0.35 * Math.sin(t * 5 + k * 1.7))); ctx.fillStyle = GREEN[k + 1]; ctx.globalAlpha = 0.9; ctx.fill(); }
  ctx.globalAlpha = 1;
  const body = () => {   // (a wobbly round body)
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * TAU, rr = r * (1 + 0.06 * Math.sin(a * 3 + t * 4) + 0.04 * Math.sin(a * 5 - t * 6));
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.92);
    }
    ctx.closePath();
  };
  const g = ctx.createRadialGradient(-r * 0.15, -r * 0.25, r * 0.1, 0, 0, r * 1.05);
  g.addColorStop(0, GREEN[0]); g.addColorStop(0.55, GREEN[1]); g.addColorStop(1, GREEN[2]);
  ctx.fillStyle = g; ctx.beginPath(); body(); ctx.fill();
  // (two-tone, as the painted art: a soft shadow on the far side -- and an ink line round it; still a cute candle)
  ctx.save(); ctx.beginPath(); body(); ctx.clip();
  ctx.fillStyle = 'rgba(20,110,60,0.38)'; ctx.beginPath(); ctx.ellipse(r * 0.55, r * 0.45, r * 0.95, r * 0.75, -0.4, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-r * 0.42, -r * 0.5, r * 0.22, r * 0.14, -0.6, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.beginPath(); body();
  ctx.lineWidth = Math.max(2, r * 0.045); ctx.strokeStyle = INK; ctx.stroke();
  // the eyes: big, round, friendly
  const ex = r * 0.34, ey = -r * 0.12, er = r * 0.26;
  for (const s of [-1, 1]) {
    ctx.save(); ctx.translate(s * ex, ey);
    if (mood === 'sleep') {   // (asleep: a soft shut curve)
      ctx.strokeStyle = INK; ctx.lineWidth = r * 0.06; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, -er * 0.1, er * 0.7, 0.25, Math.PI - 0.25); ctx.stroke();
    } else if (mood === 'ouch') {   // >_<
      ctx.strokeStyle = INK; ctx.lineWidth = r * 0.07; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-er * 0.6, -er * 0.5 * s * -1); ctx.lineTo(er * 0.6 * s, 0); ctx.lineTo(-er * 0.6, er * 0.5 * s * -1); ctx.stroke();
    } else if (blink) {
      ctx.strokeStyle = INK; ctx.lineWidth = r * 0.06; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, -er * 0.1, er * 0.7, 0.2, Math.PI - 0.2); ctx.stroke();
    } else {
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0, 0, er, er * (mood === 'wind' ? 0.8 : 1.1), 0, 0, TAU); ctx.fill();
      ctx.lineWidth = r * 0.04; ctx.strokeStyle = INK; ctx.stroke();
      const px = clamp(lx, -1, 1) * er * 0.35, py = clamp(ly, -1, 1) * er * 0.3;
      ctx.fillStyle = '#183a24'; ctx.beginPath(); ctx.arc(px, py + er * 0.1, er * 0.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(px - er * 0.18, py - er * 0.1, er * 0.17, 0, TAU); ctx.fill();
    }
    // the eyebrows: thick, wobbly, very expressive -- up and worried in a wind-up or an ouch, droopy asleep
    const lift = mood === 'wind' ? -0.22 : mood === 'ouch' ? -0.12 : mood === 'sleep' ? 0.1 : 0;
    const tilt = (mood === 'wind' || mood === 'ouch' ? 0.35 : mood === 'sleep' ? -0.25 : 0.12) * s;
    const wob = Math.sin(t * 6 + s) * r * 0.03;
    ctx.save(); ctx.translate(0, -er * (1.45 - lift * 2) + wob); ctx.rotate(tilt);
    ctx.strokeStyle = '#1d4a2c'; ctx.lineWidth = r * 0.11; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-er * 0.85, er * 0.12); ctx.quadraticCurveTo(0, -er * 0.38, er * 0.85, er * 0.06); ctx.stroke();
    ctx.restore();
    ctx.restore();
  }
  // a small round mouth (an "oo!" when it's busy, a little grin otherwise)
  ctx.fillStyle = '#1d4a2c';
  if (mood === 'sleep') { ctx.beginPath(); ctx.ellipse(0, r * 0.3, r * 0.07, r * (0.06 + 0.03 * Math.sin(t * 1.6)), 0, 0, TAU); ctx.fill(); }   // (a little snore)
  else if (mood === 'wind' || mood === 'ouch') { ctx.beginPath(); ctx.ellipse(0, r * 0.32, r * 0.11, r * 0.14, 0, 0, TAU); ctx.fill(); }
  else { ctx.lineWidth = r * 0.05; ctx.strokeStyle = '#1d4a2c'; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, r * 0.18, r * 0.16, 0.35, Math.PI - 0.35); ctx.stroke(); }
  ctx.restore();
}

/** a green fireball the Wraith sprays (phase 2): flies at a hero, hits once */
class WraithBall extends EnemyShot {
  constructor(game, x, y, z, vx, vy) { super(game, x, y, z, vx > 0 ? 1 : -1); this.vx = vx; this.vy = vy; this.life = 150; this.w = 14; }
  update() {
    this.tick();
    this.x += this.vx; this.y = clamp(this.y + this.vy, 2, DEPTH - 2); this.z += Math.sin(this.st * 0.25) * 0.8;
    if (this.st % 3 === 0) this.game.fx.flames(this.x, this.y, this.z, 1, { green: true, scale: 0.6 });
    if (this.hitPlayers({ dmg: 9, kind: 'light', push: 3, stun: 18, stop: 4, sfx: 'hit_light', spark: 'green' }, 18, 12)) { this.gone = true; this.game.fx.spark(this.x, this.y, this.z, true, 'green'); return; }
    if (--this.life <= 0 || this.offscreen()) this.gone = true;
  }
  draw(ctx) {
    const x = this.sx, y = this.sy - this.z;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 2, x, y, 22); g.addColorStop(0, 'rgba(230,255,220,1)'); g.addColorStop(0.4, 'rgba(110,255,130,0.9)'); g.addColorStop(1, 'rgba(40,200,70,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 22, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

/** one of the three wisps the Wraith splits into (phase 3): bobs about, winds up (it blinks white), dashes at a hero */
class Wisp extends Enemy {
  constructor(game, x, y, hp, boss, k) {
    super(game, x, y, { name: 'WISP' });
    this.hp = this.maxHp = hp; this.boss0 = boss; this.k = k;
    this.w = 30; this.h = 90; this.shadowR = 30; this.entered = true; this.cool = 60 + k * 40; this.score = 1500;
    this.set('bob');
  }
  get hittable() { return this.alive && this.inv <= 0 && this.state !== 'pop'; }
  takeHit(att, hd) {
    if (!this.hittable) return false;
    this.hp -= hd.dmg; this.flash = 6; this.ouch = 12; this.game.engage(this.boss0);
    audio.sfx('hit_light', { pitch: 1.6 });
    if (this.hp <= 0) { this.hp = 0; this.alive = false; this.set('pop'); audio.sfx('poof', { pitch: 1.4 }); this.game.fx.hearts?.(this.x, this.y, 60, 4); this.game.fx.spark(this.x, this.y, 60, true, 'green'); }
    else if (hd.kind === 'knock') { this.vx = (att.x > this.x ? -1 : 1) * 5; }
    return true;
  }
  update() {
    const g = this.game, p = this.player;
    this.tick();
    if (this.cool > 0) this.cool--;
    if (this.ouch > 0) this.ouch--;
    switch (this.state) {
      case 'bob': {
        const a = g.time * 1.3 + this.k * 2.1;
        const tx = clamp(p.x + Math.cos(a) * 200, g.camX + 80, g.camX + W - 80), ty = clamp(p.y + Math.sin(a) * 40, 10, DEPTH - 10);
        this.vx += ((tx - this.x) * 0.02 - this.vx) * 0.1; this.vy += ((ty - this.y) * 0.03 - this.vy) * 0.1;
        if (this.cool <= 0 && Math.abs(p.y - this.y) < 40 && !p.down) { this.set('wind'); this.vx = this.vy = 0; this.face(p); }
        break;
      }
      case 'wind': if (this.st >= 34) { this.set('dash'); this.hitDone = false; this.vx = this.facing * 8; audio.sfx('dodge', { pitch: 1.5 }); } break;
      case 'dash':
        if (!this.hitDone) for (const q of g.players) if (q.hittable && Math.abs(q.x - this.x) < 40 && Math.abs(q.y - this.y) < 20) { this.hitDone = true; q.takeHit(this, { dmg: 8, kind: 'light', push: 4, stun: 18, stop: 4, sfx: 'hit_light', spark: 'green' }); }
        if (this.st >= 30) { this.set('bob'); this.cool = rnd(90, 140); }
        break;
      case 'pop': if (this.st >= 20) this.gone = true; break;
    }
    this.x += this.vx; this.y = clamp(this.y + this.vy, 2, DEPTH - 2);
    this.vx *= this.state === 'dash' ? 1 : 0.96;
    this.x = clamp(this.x, g.camX + 30, g.camX + W - 30);
  }
  draw(ctx) {
    const t = this.game.time, bob = Math.sin(t * 3 + this.k) * 8, p = this.player;
    const s = this.state === 'pop' ? Math.max(0, 1 - this.st / 20) : 1;
    if (s <= 0) return;
    const white = this.state === 'wind' && (this.st >> 2) % 2 === 0;
    drawWithFlash(ctx, this.sx, this.sy - 56 + bob, white ? 0.7 : this.flashAlpha, (c) => {
      c.scale(s, s);
      drawFlameFace(c, 30, t + this.k, p ? Math.sign(p.x - this.x) : 0, 0, this.ouch > 0 ? 'ouch' : this.state === 'wind' ? 'wind' : 'ok', false);
    });
  }
}

/** the Curse Wraith */
export class CurseWraith extends Enemy {
  constructor(game, x, y, opt = {}) {
    super(game, x, y, { name: 'THE CURSE WRAITH' });
    this.hp = this.maxHp = opt.hp || 520;
    this.w = 70; this.h = 210; this.heavy = true; this.shadowR = 80; this.balloonH = 270;
    this.entered = true; this.facing = -1; this.score = 20000; this.phase = 1; this.cool = 80;
    this.home = { x, y }; this.wisps = []; this.blinkAt = 120; this.size = 1;
    this.set('intro');
  }
  get boss() { return true; }
  get freedNow() { return false; }
  get hittable() { return this.alive && this.inv <= 0 && this.game.fighting && !this.game.cut && !['intro', 'rise', 'split', 'defeated'].includes(this.state); }
  /** (RC2) its face's screen box -- the flame body round its eyes and mouth, as draw() puts it (the wind-ups' swell in): the hit
   *  words keep off it (src/game.js -> fx keep13); THWACK! / BONK! sat on its worried face all fight */
  faceBox() {
    if (this.state === 'split' || this.size <= 0.05) return null;
    const r = 78 * this.size * (/Wind$/.test(this.state) ? 1.15 : 1), cx = this.sx, cy = this.sy - 90 + Math.sin(this.game.time * 2) * 10;
    return [cx - r * 0.85, cy - r * 0.8, cx + r * 0.85, cy + r * 0.6];
  }
  bossIntro() { this.set('rise'); audio.sfx('charge_hum', { pitch: 0.6, vol: 0.6 }); }
  bossFight() { this.set('drift'); this.cool = 50; }
  takeHit(att, hd) {
    if (!this.hittable) return false;
    const g = this.game;
    this.hp -= hd.dmg * (this.state === 'dizzy' ? 1.3 : 1); this.flash = 6; this.ouch = 14;
    g.engage(this);
    audio.sfx('hit_light', { pitch: 1.3 });
    if (this.phase === 1 && this.hp < this.maxHp * 0.66) { this.phase = 2; this.set('shake'); this.inv = 30; g.fx.balloon(this, 'Hee hee! Too slow!', 100, { villain: true }); }
    if (this.hp < this.maxHp * 0.33 || this.hp <= 0) this.splitUp();
    return true;
  }
  /** phase 3: three wisps share what's left of its health */
  splitUp() {
    if (this.state === 'split') return;
    const g = this.game, hp = Math.max(30, this.hp);
    this.phase = 3; this.set('split'); this.releaseToken();
    g.fx.balloon(this, 'Catch us if you can!', 110, { villain: true });
    audio.sfx('poof', { pitch: 0.8 }); g.shake = Math.max(g.shake, 8);
    for (let k = 0; k < 3; k++) {
      const wsp = new Wisp(g, this.x + (k - 1) * 90, clamp(this.y + (k - 1) * 30, 10, DEPTH - 10), Math.ceil(hp / 3), this, k);
      this.wisps.push(wsp); g.actors.push(wsp);
    }
  }
  defeat() {
    const g = this.game;
    this.releaseToken();
    this.set('defeated'); this.alive = false; this.hp = 0;
    g.fx.label(this.x, this.y, 220, 'POOF!', '#9dff8a', 46, 90);
    g.onBossDefeated(this);
  }
  update() {
    const g = this.game, p = this.player;
    this.tick();
    if (this.cool > 0) this.cool--;
    if (this.ouch > 0) this.ouch--;
    if (--this.blinkAt <= -8) this.blinkAt = rnd(120, 220);
    const bobY = (tx, ty, k) => { this.vx += ((tx - this.x) * k - this.vx) * 0.08; this.vy += ((ty - this.y) * k - this.vy) * 0.08; };
    switch (this.state) {
      case 'intro': this.vx = this.vy = 0; this.size = 0.7; break;
      case 'rise': this.size = Math.min(1, 0.7 + this.st / 60); this.vx = this.vy = 0; break;
      case 'drift': {
        const side = this.x < p.x ? -1 : 1;
        const tx = clamp(p.x + side * 210, g.camX + 120, g.camX + W - 120), ty = clamp(p.y, 20, DEPTH - 20);
        bobY(tx, ty, 0.03); this.face(p);
        if (this.cool <= 0 && g.fighting && !g.cut && !p.down) {
          this.next = this.phase >= 2 && !(this.next === 'spitWind') ? 'spitWind' : 'swipeWind';
          this.set(this.next); this.vx = this.vy = 0; this.face(p);
          g.fx.alert(this);   // (RC: the shared "!" every boss's wind-up shows -- Enemy.windup; it had none, and its worried face alone read as drifting)
          audio.sfx(this.next === 'swipeWind' ? 'charge' : 'charge_hum', { vol: 0.5, pitch: 1.4 });
        }
        break;
      }
      case 'swipeWind': this.vx = this.vy = 0; if (this.st >= 42) { this.set('swipe'); this.hitSet = new Set(); audio.sfx('fire_breath', { vol: 0.8 }); } break;
      case 'swipe': {   // a sweep of green flame along the floor in front of it
        const reach = 60 + this.st * 14;
        for (let i = 0; i < 2; i++) g.fx.flames(this.x + this.facing * rnd(40, reach), this.y + rnd(-20, 20), 0, 1, { green: true, vz: 2, scale: 1.1 });
        for (const q of g.players) {
          const dx = (q.x - this.x) * this.facing;
          if (q.hittable && !this.hitSet.has(q) && dx > 0 && dx < reach && Math.abs(q.y - this.y) < 42 && q.z < 90) { this.hitSet.add(q); q.takeHit(this, { dmg: 12, kind: 'knock', push: 6, lift: 5, stop: 6, sfx: 'hit_heavy', spark: 'green' }); }
        }
        if (this.st >= 16) { this.set('tired'); }
        break;
      }
      case 'tired': this.vx *= 0.8; this.vy *= 0.8; if (this.st >= 50) { this.set('drift'); this.cool = rnd(70, 110); } break;   // (a clear opening after each attack)
      case 'spitWind': this.vx = this.vy = 0;
        if (this.st % 4 === 0) g.fx.glow(this.x + this.facing * 50, this.y, 90, 34 + this.st, 10, true);   // (RC: green fire gathering at its mouth, growing, as Grimscale's breath wind-up)
        if (this.st >= 32) {
        const tgt = p, n = 3;
        for (let k = 0; k < n; k++) {
          const dx = tgt.x - this.x, dy = tgt.y - this.y, d = Math.hypot(dx, dy) || 1, sp = 4.2;
          const spread = (k - (n - 1) / 2) * 0.12;
          g.actors.push(new WraithBall(g, this.x + this.facing * 50, this.y, 90, (dx / d) * sp, (dy / d) * sp * 0.5 + spread * 3));
        }
        audio.sfx('fireball_breath', { vol: 0.6, pitch: 1.3 });
        this.set('tired');
      } break;
      case 'shake': this.vx = this.vy = 0; if (this.st >= 40) { this.set('drift'); this.cool = 40; } break;
      case 'split': {
        this.vx = this.vy = 0;
        const left = this.wisps.filter((q) => q.alive);
        this.hp = left.reduce((s, q) => s + q.hp, 0);   // (the boss bar: what the wisps have left)
        if (!left.length && this.st > 20) this.defeat();
        break;
      }
      case 'defeated': this.size = Math.max(0, 1 - this.st / 90); if (this.st % 4 === 0) g.fx.add({ type: 'star', x: this.x + rnd(-60, 60), y: this.y, z: rnd(40, 200), vz: rnd(0.5, 1.5), life: 40, r: rnd(3, 6), col: '#c8ffd8' }); if (this.st >= 100) this.gone = true; break;
    }
    this.x += this.vx; this.y = clamp(this.y + this.vy, 4, DEPTH - 4);
    // (kept on screen once the fight is on -- before it, it waits over the Queen, off screen till the boss arena)
    if (this.state !== 'intro') this.x = clamp(this.x, g.camX + 60, g.camX + W - 60);
  }
  draw(ctx) {
    if (this.state === 'split') return;
    const t = this.game.time, p = this.player, bob = Math.sin(t * 2) * 10, s = this.size;
    if (s <= 0.01) return;
    // (RC: the wind-ups read as a pose, not only a face: the swipe's rears back and swells over its 42 frames (leaning away up to
    //  0.3 rad, 1.18x), a shiver in its last 10; the spit's puffs up tall and leans back (1.2x high), its cheeks full -- the "!"
    //  over it from the first frame, at the same lead as the other bosses' wind-ups)
    const W1 = this.state === 'swipeWind' ? Math.min(1, this.st / 42) : 0, W2 = this.state === 'spitWind' ? Math.min(1, this.st / 32) : 0;
    const e1 = 1 - (1 - W1) * (1 - W1), e2 = 1 - (1 - W2) * (1 - W2), shiver = W1 > 0.76 ? Math.sin(this.st * 2.6) * 0.035 : 0;
    const lean = this.state === 'swipeWind' ? (-0.3 * e1 + shiver) * this.facing : this.state === 'spitWind' ? -0.16 * e2 * this.facing : this.state === 'swipe' ? 0.18 * this.facing : 0;
    const sx2 = this.state === 'swipeWind' ? 1 + 0.18 * e1 : this.state === 'spitWind' ? 1 + 0.08 * e2 : 1, sy2 = this.state === 'swipeWind' ? 1 + 0.14 * e1 : this.state === 'spitWind' ? 1 + 0.2 * e2 : 1;
    const mood = this.ouch > 0 ? 'ouch' : /Wind$/.test(this.state) ? 'wind' : 'ok';
    drawWithFlash(ctx, this.sx, this.sy - 90 + bob, this.flashAlpha, (c) => {
      c.rotate(lean); c.scale(s * sx2, s * sy2);
      drawFlameFace(c, 78, t, p ? (p.x - this.x) / 200 : 0, p ? (p.y - this.y) / 60 : 0, mood, this.blinkAt < 0);
    });
  }
}

const QUEEN_SCALE = 0.72;   // (her painted pack, asleep on the bed: about the King's size)
/** the sleeping Queen on her bed in the Hollow (a code-drawn stand-in until her painted scene pack): pearl and rose-gold,
 * curled up asleep, green flames licking round her while the curse holds (World.curse 1..0) */
export class QueenSleeper extends Actor {
  constructor(game, x, y) { super(game, x, y); this.team = 'thing'; this.solid = false; this.w = 120; this.h = 120; this.shadowR = 0; this.depthR = 0; }
  get hittable() { return false; }
  takeHit() { return false; }
  drawShadow() {}
  update() { this.tick(); }
  draw(ctx) {
    const g = this.game, t = g.time, curse = g.curse ?? 1, x = this.sx, y = this.sy;
    const Q = CHARS.dragonqueen;
    if (Q?.ATLAS_SCALE && Q.ANIM?.sleep) {              // her painted pack: asleep on her bed (facing the way in, left)
      const pose = Q.ANIM.sleep(t);
      if (pose && pose.s3d >= 0.5) { ctx.save(); ctx.translate(x, y); Q.draw(ctx, pose, { facing: -1, scale: QUEEN_SCALE, t }); ctx.restore(); this.drawCurse(ctx, x, y, t, curse, 150); return; }
    }
    ctx.save(); ctx.translate(x, y);
    const breathe = 1 + 0.02 * Math.sin(t * 1.4);
    ctx.scale(breathe, 1);
    // the curled body and tail, the folded wing, the head resting on her forepaws
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(33,20,28,0.85)';
    const body = ctx.createLinearGradient(0, -90, 0, 0); body.addColorStop(0, '#fff3ee'); body.addColorStop(1, '#e8c6c8');
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, -36, 92, 38, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(80, -20); ctx.quadraticCurveTo(140, -10, 120, -44); ctx.quadraticCurveTo(110, -60, 96, -50); ctx.lineWidth = 10; ctx.strokeStyle = '#f2d8d6'; ctx.stroke(); ctx.lineWidth = 3;
    ctx.fillStyle = '#e9b8c6'; ctx.beginPath(); ctx.moveTo(-10, -64); ctx.quadraticCurveTo(40, -120, 70, -60); ctx.quadraticCurveTo(30, -76, -10, -64); ctx.fill(); ctx.strokeStyle = 'rgba(33,20,28,0.85)'; ctx.stroke();
    ctx.fillStyle = '#fff6f2'; ctx.beginPath(); ctx.ellipse(-78, -42, 36, 26, -0.15, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#21141c'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(-84, -46, 7, 0.3, Math.PI - 0.3); ctx.stroke();   // (a closed, sleeping eye)
    ctx.fillStyle = '#e8b04a'; ctx.beginPath(); ctx.moveTo(-94, -64); ctx.lineTo(-88, -84); ctx.lineTo(-80, -70); ctx.lineTo(-72, -86); ctx.lineTo(-66, -66); ctx.closePath(); ctx.fill(); ctx.lineWidth = 2; ctx.stroke();   // (a slim crown)
    ctx.restore();
    this.drawCurse(ctx, x, y, t, curse, 80);
  }
  /** Zzz while she sleeps (zTop: how high her head is), and the curse's green flame tongues round her while it holds */
  drawCurse(ctx, x, y, t, curse, zTop) {
    ctx.save(); ctx.font = 'bold 18px "Luckiest Guy", Bangers, sans-serif'; ctx.fillStyle = 'rgba(255,240,250,0.85)';
    for (let i = 0; i < 3; i++) { const k = ((t * 0.5 + i / 3) % 1); ctx.globalAlpha = Math.sin(k * Math.PI); ctx.fillText('z', x - 110 - k * 30, y - zTop - k * 60 - i * 4); }
    ctx.restore();
    if (curse > 0.02) {
      ctx.save(); ctx.globalAlpha = curse; ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + t * 0.6, fx = x + Math.cos(a) * 120, fy = y - 30 + Math.sin(a) * 30, h = 26 + 14 * Math.sin(t * 5 + i);
        const gr = ctx.createRadialGradient(fx, fy - h * 0.5, 2, fx, fy - h * 0.5, h); gr.addColorStop(0, 'rgba(180,255,190,0.9)'); gr.addColorStop(1, 'rgba(40,200,80,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(fx, fy - h * 0.5, h, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }
}
