// Interactables: waystone save points, caged baby dragons (freed -> they help!), things to pick up and throw,
// and each level's toys and traps.
import { addChest } from './secrets.js';
import { Actor, GRAV, boxOf, overlaps } from './actors.js';
import { FLOOR_TOP, DEPTH, W, H, INK } from './config.js';
import { CHARS } from './chars.js';
import { audio } from './audio-proxy.js';
import { TAU, clamp, cel, flat, ellipse, circle } from './rig.js';
import { drawWithFlash } from './render.js';
import { drawSiWaystone } from './siprops.js';   // (Book 2's painted waystone: L.si only)

const foes = (g) => g.actors.filter((t) => t.team === 'foe' && t.hittable);
const rnd = (a, b) => a + Math.random() * (b - a);

class Thing extends Actor {
  constructor(game, def) {
    super(game, def.x, def.y ?? 70);
    this.def = def; this.kind = def.kind;
    this.team = 'thing'; this.solid = false;
    this.w = 24; this.h = 60; this.shadowR = 26;
  }
  get hittable() { return false; }
  takeHit() { return false; }
  update() { this.tick(); }
  near(p, dx = 50, dy = 26) { return !p.out && Math.abs(p.x - this.x) < dx && Math.abs(p.y - this.y) < dy; }
  onScreen() { const g = this.game; return this.x > g.camX - 120 && this.x < g.camX + W + 120; }
}

// ================================================================================================ waystone (save point)
class Waystone extends Thing {
  constructor(g, d) { super(g, d); this.lit = false; this.h = 120; this.shadowR = 34; }
  update() {
    this.tick();
    if (!this.lit && this.game.players.some((p) => this.near(p, 40, 160))) {   // anyone walking past it, at any depth
      this.lit = true; this.litT = 0;
      this.game.fx.hearts?.(this.x, this.y, 120, 0);
      this.game.fx.spark(this.x, this.y, 150, true, 'cool');
      this.game.checkpointAt(this);
    }
    if (this.lit) this.litT = (this.litT || 0) + 1;
    if (this.lit && this.st % 8 === 0) this.game.fx.add({ type: 'star', x: this.x + rnd(-24, 24), y: this.y, z: rnd(60, 150), vz: rnd(0.4, 1), life: 40, r: rnd(3, 6), col: '#bff0ff' });
  }
  draw(ctx) {
    const t = this.game.time, sx = this.sx, sy = this.sy;
    if (this.game.L?.si) { drawSiWaystone(ctx, this, t); return; }   // (Skull Island: a darker painted pedestal per stage, src/siprops.js)
    ctx.save(); ctx.translate(sx, sy);
    // stone plinth with runes
    cel(ctx, (c) => { c.moveTo(-30, 0); c.lineTo(-24, -34); c.lineTo(24, -34); c.lineTo(30, 0); c.closePath(); }, '#7d7a8e', '#56536a', { lw: 3 });
    cel(ctx, (c) => { c.moveTo(-22, -34); c.lineTo(-17, -70); c.lineTo(17, -70); c.lineTo(22, -34); c.closePath(); }, '#8d8aa0', '#615e76', { lw: 3 });
    ctx.strokeStyle = this.lit ? '#9fe7ff' : '#4d4a62'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-8, -46); ctx.lineTo(0, -60); ctx.lineTo(8, -46); ctx.moveTo(-10, -20); ctx.lineTo(10, -20); ctx.stroke();
    // the floating crystal
    const bob = Math.sin(t * 2.2) * 4;
    ctx.translate(0, -104 + bob);
    if (this.lit) {
      const prev = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(110,200,255,${0.25 + 0.1 * Math.sin(t * 5)})`; ctx.beginPath(); ctx.arc(0, 0, 44, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = prev;
    }
    ctx.rotate(Math.sin(t * 1.3) * 0.08);
    cel(ctx, (c) => { c.moveTo(0, -26); c.lineTo(13, -6); c.lineTo(9, 20); c.lineTo(-9, 20); c.lineTo(-13, -6); c.closePath(); },
      this.lit ? '#8fe0ff' : '#5f88a8', this.lit ? '#3d9be0' : '#3c5a74', { hi: this.lit ? '#e8fbff' : '#8fb0c8', lw: 2.8 });
    ctx.strokeStyle = this.lit ? '#e8fbff' : '#8fb0c8'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(0, 20); ctx.moveTo(-13, -6); ctx.lineTo(13, -6); ctx.stroke();
    ctx.restore();
  }
}

// ================================================================================================ cage (baby dragon inside)
class Cage extends Thing {
  constructor(g, d) { super(g, d); this.hp = 3; this.broken = 0; this.h = 90; this.w = 30; this.shadowR = 38; this.mem = {}; }
  /** freed earlier in this run (World.begin: a stage re-entered from a secret stage): open and empty */
  open() { this.hp = 0; this.broken = 1; }
  get hittable() { return this.hp > 0; }
  takeHit(att) {
    if (this.hp <= 0) return false;
    this.hp--; this.flash = 6; this.shake = 8;
    audio.sfx('block', { pitch: 0.8 });
    this.game.fx.spark(this.x, this.y, 50, false, 'green');
    if (this.hp <= 0) {
      audio.sfx('cage_break');
      this.game.fx.debris(this.x, this.y, 40, ['#2a2c33', '#45d36a', '#3a3d46'], 10);
      const ally = new AllyWhelp(this.game, this.x, this.y, att.team === 'hero' ? att : this.game.players[0]);
      this.game.actors.push(ally);
      this.game.onWhelpFreed(ally);
      this.game.onCageFreed?.(this);   // (its id into the persistent progress: src/secrets.js)
      this.game.fx.label(this.x, this.y, 140, 'FREED!', '#9dff8a', 32, 70);
    }
    return true;
  }
  update() { this.tick(); if (this.hp <= 0) this.broken = Math.min(1, this.broken + 0.08); }
  draw(ctx) {
    const art = CHARS.whelp, t = this.game.time;
    const sh = this.shake ? Math.sin(this.shake * 2.5) * 3 : 0;
    drawWithFlash(ctx, this.sx + sh, this.sy, this.flashAlpha, (c) => {
      if (art?.drawCage) art.drawCage(c, t, this.broken, 'back');
      if (this.hp > 0 && art?.ANIM?.cage) {
        const pose = typeof art.ANIM.cage === 'function' ? art.ANIM.cage(t) : art.ANIM.cage;
        art.draw(c, pose, { facing: 1, t, cursed: true, mem: this.mem, scale: 0.85 });
      }
      if (art?.drawCage) art.drawCage(c, t, this.broken, 'front');
      else {
        c.strokeStyle = INK; c.lineWidth = 3;
        for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 11, 0); c.lineTo(i * 11 * (1 + this.broken), -90); c.stroke(); }
        c.strokeRect(-36, -92, 72, 8);
      }
    });
  }
}

/** a freed baby dragon that fights beside the heroes for a little while */
class AllyWhelp extends Actor {
  constructor(g, x, y, friend) {
    super(g, x, y);
    this.team = 'ally'; this.solid = false; this.friend = friend;
    this.z = 40; this.flying = true; this.w = 20; this.h = 40; this.shadowR = 22; this.mem = {};
    this.breaths = 0; this.set('fly');
  }
  get hittable() { return false; }
  update() {
    this.tick();
    const g = this.game;
    this.mem.frame = g.frame;
    const target = foes(g).filter((t) => t.x > g.camX && t.x < g.camX + W).sort((a, b) => Math.abs(a.x - this.x) - Math.abs(b.x - this.x))[0];
    if (this.state === 'fly') {
      const goal = target ? { x: target.x - (target.x > this.x ? 110 : -110), y: target.y } : { x: (this.friend?.x ?? this.x) - 60, y: this.friend?.y ?? this.y };
      this.vx = clamp((goal.x - this.x) * 0.05, -3, 3); this.vy = clamp((goal.y - this.y) * 0.06, -1.5, 1.5);
      this.z += (64 + Math.sin(this.st * 0.1) * 6 - this.z) * 0.1;
      if (target) this.facing = target.x > this.x ? 1 : -1;
      if (target && this.st > 40 && Math.abs(goal.x - this.x) < 30 && Math.abs(goal.y - this.y) < 12 && this.breaths < 3) { this.reset('breath'); this.burned = new Set(); audio.sfx('fire_small', { pitch: 1.3 }); }
      if ((this.breaths >= 3 && this.st > 30) || this.st > 600) this.reset('leave');
    } else if (this.state === 'breath') {
      this.vx = this.vy = 0;
      const k = this.st / 60;
      if (k > 0.2 && k < 0.85) {
        const m = CHARS.whelp?.ALLY_MOUTH || [44, -14];
        if (this.st % 2 === 0) g.fx.flames(this.x + this.facing * (m[0] + 10), this.y, this.z - m[1], 1, { vx: this.facing * 4, scale: 0.8 });
        if (this.st % 10 === 0) {
          const box = boxOf(this, { x0: 20, x1: 150, z0: -this.z, z1: 140, dy: 28 });
          for (const t of foes(g)) if (overlaps(box, t)) {
            t.takeHit(this, { dmg: 4, kind: this.st > 40 ? 'knock' : 'light', push: 3, lift: 4, stun: 20, stop: 1, hit: 'fireball_hit' });
            g.fx.spark(t.x, t.y, t.z + t.h * 0.5, false);
          }
        }
      }
      if (this.st >= 60) { this.breaths++; this.reset('fly'); }
    } else if (this.state === 'leave') {
      this.vx = this.facing * 2.6; this.z += 2.4;
      if (this.st % 10 === 0) g.fx.hearts(this.x, this.y, this.z, 1);
      if (this.st > 160) this.gone = true;
    }
    this.x += this.vx; this.y = clamp(this.y + this.vy, 4, DEPTH - 4);
  }
  draw(ctx) {
    const art = CHARS.whelp; if (!art) return;
    const A = art.ANIM || {}, t = this.game.time;
    let f = this.state === 'breath' ? (A.allyBreath || A.spit) : this.state === 'leave' ? (A.freed || A.hover) : (A.allyHover || A.freed || A.hover);
    const pose = typeof f === 'function' ? f(this.state === 'breath' ? Math.min(1, this.st / 60) : t) : (f || {});
    ctx.save(); ctx.translate(this.sx, this.sy);
    art.draw(ctx, pose, { facing: this.facing, t, cursed: false, mem: this.mem, vel: { x: this.vx, y: this.vy, z: 0 } });
    ctx.restore();
  }
}

// ================================================================================================ pick up and throw
class Throwable extends Thing {
  constructor(g, d) {
    super(g, d);
    this.liftable = true; this.carrier = null; this.flying = false;
    this.r = d.kind === 'keg' ? 18 : 16; this.h = 34; this.shadowR = 20;
  }
  pickUp(p) { this.carrier = p; this.liftable = false; }
  drop(p) { this.carrier = null; this.liftable = true; this.z = 0; this.x = p.x + p.facing * 20; this.y = p.y; }
  throwFrom(p, dir) {
    const cp = p.carryPoint();
    this.carrier = null; this.flying = true; this.thrower = p;
    this.x = cp.x; this.y = cp.y; this.z = cp.z;
    this.vx = dir * 9; this.vz = 3.2; this.facing = dir;
  }
  update() {
    this.tick();
    const g = this.game;
    if (this.carrier) { const cp = this.carrier.carryPoint(); this.x = cp.x; this.y = cp.y; this.z = cp.z; this.sortY = this.carrier.y + 0.1; return; }
    this.sortY = undefined;
    if (!this.flying) return;
    this.x += this.vx; this.z += this.vz; this.vz -= GRAV * 0.8;
    for (const t of foes(g)) {
      if (Math.abs(t.y - this.y) < 24 && Math.abs(t.x - this.x) < t.w + this.r && this.z < t.z + t.h + 10) { this.smash(t); return; }
    }
    if (this.z <= 0 || this.x < g.camX - 60 || this.x > g.camX + W + 60) this.smash(null);
  }
  smash(t) {
    const g = this.game, p = this.thrower;
    this.gone = true;
    const hd = { dmg: 16, kind: 'knock', push: 6, lift: 6, stop: 6, hit: 'hit_heavy', word: 'heavy', thrown: true, ember: 12 };
    if (t && t.takeHit(p, hd)) p?.landed?.(t, hd);
    if (this.kind === 'keg') {
      g.fx.explosion(this.x, this.y); audio.sfx('explosion'); g.shake = Math.max(g.shake, 10);
      for (const o of foes(g)) if (o !== t && Math.hypot((o.x - this.x) / 100, (o.y - this.y) / 38) < 1 && o.takeHit(p, { ...hd, dmg: 14 })) p?.landed?.(o, hd);
    } else if (this.kind === 'snowball') {
      g.fx.poof(this.x, this.y, this.z, false); audio.sfx('snow_dump', { pitch: 1.4, vol: 0.7 });
    } else { g.fx.debris(this.x, this.y, this.z, ['#8a8494', '#5e5868', '#b0aab8'], 8); audio.sfx('break'); }
  }
  drawHeld(ctx) { /* the carrier draws us via the normal list */ }
  promptNear() {
    if (this.carrier || this.flying) return null;
    return this.game.players.find((p) => !p.out && !p.carry && Math.abs(p.x - this.x) < 40 && Math.abs(p.y - this.y) < 20);
  }
  drawShadow(ctx) { if (!this.carrier) super.drawShadow(ctx); }
  draw(ctx) {
    const near = this.promptNear();
    if (near) {
      const app = this.game.app;
      ctx.save(); ctx.globalAlpha = 0.85 + 0.15 * Math.sin(this.game.time * 6);
      app.drawGlyph(ctx, 'attack', near.ctrlId, this.sx, this.sy - 62, 24);
      ctx.font = 'bold 12px "Comic Neue", sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeText('PICK UP', this.sx, this.sy - 40); ctx.fillStyle = '#fff'; ctx.fillText('PICK UP', this.sx, this.sy - 40);
      ctx.restore();
    }
    ctx.save(); ctx.translate(this.sx, this.sy);
    if (this.flying) ctx.rotate(this.st * 0.25 * (this.facing || 1));
    if (this.kind === 'snowball') {
      cel(ctx, (c) => circle(c, 0, -16, 16), '#f6f8fc', '#b9c6dc', { hi: '#ffffff', lw: 2.8 });
      ctx.fillStyle = '#c8d3e6'; ctx.beginPath(); ctx.arc(-5, -10, 3, 0, TAU); ctx.arc(6, -20, 2, 0, TAU); ctx.fill();
    } else if (this.kind === 'keg') {
      cel(ctx, (c) => { c.moveTo(-14, -2); c.quadraticCurveTo(-18, -18, -14, -34); c.lineTo(14, -34); c.quadraticCurveTo(18, -18, 14, -2); c.closePath(); }, '#7a4a2a', '#52301a', { lw: 2.8 });
      ctx.fillStyle = '#3c3f48'; ctx.fillRect(-16, -28, 32, 4); ctx.fillRect(-16, -10, 32, 4);
      const g = 0.6 + 0.4 * Math.sin(this.game.time * 6);
      ctx.fillStyle = `rgba(255,${150 + 60 * g | 0},40,1)`; ctx.beginPath(); ctx.moveTo(-4, -34); ctx.lineTo(0, -46); ctx.lineTo(4, -34); ctx.closePath(); ctx.fill();
      ctx.lineWidth = 1.6; ctx.strokeStyle = INK; ctx.stroke();
    } else {
      cel(ctx, (c) => { c.moveTo(-16, 0); c.quadraticCurveTo(-20, -22, -4, -30); c.quadraticCurveTo(16, -30, 18, -12); c.quadraticCurveTo(18, 0, -16, 0); c.closePath(); }, '#8a8494', '#5e5868', { lw: 2.8 });
    }
    ctx.restore();
  }
}

/** a giant snowball / boulder: whack it and it rolls, bowling over enemies */
class Boulder extends Thing {
  // (look 'bale': the Eyrie's -- a round straw bale from the giant nests, not Stormspire's snow boulder, which up there
  //  read as an egg or a moon)
  constructor(g, d) { super(g, d); this.r = 34; this.w = 32; this.h = 68; this.shadowR = 40; this.rot = 0; this.vx = 0; this.hitSetB = new Set(); this.look = d.look || null; }
  get hittable() { return Math.abs(this.vx) < 1; }
  takeHit(att) {
    this.vx = (att.facing || (att.x < this.x ? 1 : -1)) * 6.2; this.hitSetB = new Set();
    audio.sfx('boulder_roll'); this.flash = 4;
    return true;
  }
  update() {
    this.tick();
    const g = this.game;
    if (Math.abs(this.vx) > 0.2) {
      this.x += this.vx; this.rot += this.vx / this.r;
      for (const t of foes(g)) {
        if (this.hitSetB.has(t) || Math.abs(t.y - this.y) > 26 || Math.abs(t.x - this.x) > t.w + this.r) continue;
        this.hitSetB.add(t);
        t.takeHit(this, { dmg: 18, kind: 'knock', push: 7, lift: 6, stop: 4, hit: 'hit_heavy', thrown: true });
        g.fx.word(t.x, t.y, t.h, true, 'BOWLED!');
      }
      if (this.st % 6 === 0) g.fx.dust(this.x - Math.sign(this.vx) * 20, this.y, 1, 6);
      if (this.x < g.camX + 20 || this.x > g.camX + W - 20) { this.vx = 0; g.fx.poof(this.x, this.y, 20, true); this.gone = true; audio.sfx('snow_dump'); }
    }
  }
  draw(ctx) {
    ctx.save(); ctx.translate(this.sx, this.sy - this.r); ctx.rotate(this.rot);
    if (this.look === 'bale') {
      cel(ctx, (c) => circle(c, 0, 0, this.r), '#e2b85a', '#b0823a', { hi: '#f6d98c', lw: 3.2 });
      ctx.strokeStyle = '#8a5f26'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      ctx.beginPath();   // (the rolled straw: a spiral)
      for (let a = 0; a < TAU * 2.6; a += 0.2) { const rr = 4 + a * 1.75; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.stroke();
      ctx.strokeStyle = '#7a3a2a'; ctx.lineWidth = 3;   // (two twine bands)
      for (const a of [0.9, 2.5]) { ctx.beginPath(); ctx.arc(0, 0, this.r - 2, a - 0.5, a + 0.5); ctx.stroke(); }
      ctx.strokeStyle = '#f2d27a'; ctx.lineWidth = 1.6;   // (stray straws)
      for (const a of [0.2, 1.8, 3.3, 4.6, 5.6]) { ctx.beginPath(); ctx.moveTo(Math.cos(a) * (this.r - 3), Math.sin(a) * (this.r - 3)); ctx.lineTo(Math.cos(a + 0.12) * (this.r + 7), Math.sin(a + 0.12) * (this.r + 7)); ctx.stroke(); }
      ctx.restore();
      return;
    }
    cel(ctx, (c) => circle(c, 0, 0, this.r), '#f2f5fb', '#b4c2da', { hi: '#ffffff', lw: 3.2 });
    ctx.fillStyle = '#9aa6bc';
    for (const [a, r] of [[0.3, 6], [2.2, 4], [4.1, 5]]) { ctx.beginPath(); ctx.arc(Math.cos(a) * 18, Math.sin(a) * 18, r, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
}

/** a snow-laden pine at the back edge: hit it and the snow dumps on whoever stands in front */
class Pine extends Thing {
  constructor(g, d) { super(g, d); this.depthR = 44; this.ready = 0; this.w = 26; this.h = 160; this.shadowR = 0; this.shakeT = 0; }
  get hittable() { return this.ready <= 0; }
  takeHit() {
    const g = this.game;
    this.ready = 480; this.shakeT = 30;
    audio.sfx('snow_dump');
    for (let i = 0; i < 16; i++) g.fx.add({ type: 'smoke', x: this.x + rnd(-70, 70), y: clamp(this.y + rnd(10, 80), 0, DEPTH), z: rnd(90, 170), vx: 0, vz: -rnd(2, 4), r: rnd(10, 18), life: 34 });
    for (const t of foes(g)) if (Math.abs(t.x - this.x) < 90 && t.y > this.y - 10 && t.y < this.y + 90) { t.daze?.(140); g.fx.label(t.x, t.y, t.h + 20, 'BRRR!', '#cfe8ff', 24, 40); }
    return true;
  }
  update() { this.tick(); if (this.ready > 0) this.ready--; if (this.shakeT > 0) this.shakeT--; }
  drawShadow() {}
  draw(ctx) {
    const sx = this.sx + (this.shakeT ? Math.sin(this.shakeT * 1.5) * 3 : 0), sy = this.sy;
    ctx.save(); ctx.translate(sx, sy);
    cel(ctx, (c) => { c.moveTo(-8, 0); c.lineTo(-6, -40); c.lineTo(6, -40); c.lineTo(8, 0); c.closePath(); }, '#6a4428', '#4a2e1a', { lw: 3 });
    const snow = this.ready > 0 ? 0.25 : 1;
    for (let i = 0; i < 4; i++) {
      const y = -30 - i * 34, w = 64 - i * 12;
      cel(ctx, (c) => { c.moveTo(-w, y + 6); c.lineTo(0, y - 46); c.lineTo(w, y + 6); c.closePath(); }, '#2f6a52', '#1f4a3a', { lw: 3 });
      ctx.fillStyle = '#f4f8ff'; ctx.globalAlpha = snow;
      ctx.beginPath(); ctx.moveTo(-w * 0.8, y); ctx.quadraticCurveTo(0, y - 18, w * 0.8, y); ctx.quadraticCurveTo(0, y - 6, -w * 0.8, y); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}

// ================================================================================================ mines
/** an ore cart: whack it and it rolls along the floor, scattering enemies */
class Cart extends Thing {
  constructor(g, d) { super(g, d); this.w = 34; this.h = 56; this.shadowR = 40; this.vx = 0; this.hitSetC = new Set(); }
  get hittable() { return Math.abs(this.vx) < 1; }
  takeHit(att) { this.vx = (att.facing || 1) * 7.5; this.hitSetC = new Set(); audio.sfx('minecart'); this.flash = 5; return true; }
  update() {
    this.tick();
    const g = this.game;
    if (Math.abs(this.vx) > 0.2) {
      this.x += this.vx; this.roll = (this.roll || 0) + this.vx;
      for (const t of foes(g)) {
        if (this.hitSetC.has(t) || Math.abs(t.y - this.y) > 26 || Math.abs(t.x - this.x) > t.w + 34) continue;
        this.hitSetC.add(t);
        t.takeHit(this, { dmg: 16, kind: 'knock', push: 8, lift: 6, stop: 4, hit: 'hit_heavy', thrown: true });
        g.fx.word(t.x, t.y, t.h, true, 'CLANG!');
      }
      if (this.st % 3 === 0) g.fx.spark(this.x - Math.sign(this.vx) * 20, this.y, 4, false);
      const edge = this.vx > 0 ? this.x > g.camX + W - 40 : this.x < g.camX + 40;
      if (edge) { this.vx = -this.vx * 0.2; g.shake = Math.max(g.shake, 4); audio.sfx('knockdown', { pitch: 0.8 }); }
      this.vx *= 0.995;
      if (Math.abs(this.vx) < 1.5) this.vx = 0;
    }
  }
  draw(ctx) {
    const stg = this.game.stage;
    if (stg.drawProp && this.game.propInfo?.cart) stg.drawProp(ctx, 'cart', this.sx, this.sy, { flash: this.flashAlpha, shake: 0, roll: this.roll || 0 });
    else {
      ctx.save(); ctx.translate(this.sx, this.sy);
      cel(ctx, (c) => { c.moveTo(-34, -12); c.lineTo(-30, -50); c.lineTo(30, -50); c.lineTo(34, -12); c.closePath(); }, '#6a5a4a', '#4a3a2c', { lw: 3 });
      flat(ctx, (c) => { circle(c, -18, -8, 9); circle(c, 18, -8, 9); }, '#3c3f48', 2.6);
      ctx.restore();
    }
  }
}

/** a lava vent in the floor: rumbles, then erupts (hurts everyone above it) */
class Vent extends Thing {
  constructor(g, d) { super(g, d); this.phase = Math.random() * 200 | 0; this.shadowR = 0; this.r = 40; }
  get period() { return 240; }
  update() {
    this.tick();
    const g = this.game, c = (this.st + this.phase) % this.period;
    this.warn = c >= 150 && c < 200; this.erupt = c >= 200;
    if (!this.onScreen()) return;
    if (this.warn && this.st % 6 === 0) g.fx.dust(this.x + rnd(-20, 20), this.y, 1, 6);
    if (c === 200) { audio.sfx('lava_burst'); g.shake = Math.max(g.shake, 3); }
    if (this.erupt) {
      if (this.st % 2 === 0) g.fx.flames(this.x + rnd(-14, 14), this.y, rnd(0, 120), 1, { vz: 4, scale: 1.2 });
      if (this.st % 12 === 0) {
        for (const p of g.players) if (p.hittable && p.z < 140 && Math.abs(p.x - this.x) < 36 && Math.abs(p.y - this.y) < 18) p.takeHit({ x: this.x, team: 'hazard', facing: 1 }, { dmg: 10, kind: 'knock', push: 4, lift: 7, stop: 3, sfx: 'hit_heavy', spark: 'warm' });
        for (const t of foes(g)) if (t.z < 140 && Math.abs(t.x - this.x) < 36 && Math.abs(t.y - this.y) < 18) t.takeHit(this, { dmg: 14, kind: 'knock', push: 4, lift: 7, stop: 1, hit: 'hit_heavy' });
      }
    }
  }
  drawFloor(ctx) {
    const sx = this.sx, sy = FLOOR_TOP + this.y;
    if (sx < -80 || sx > W + 80) return;
    const glow = this.erupt ? 1 : this.warn ? 0.5 + 0.5 * Math.sin(this.st * 0.6) : 0.25;
    ctx.save();
    ctx.fillStyle = '#2a1a16'; ctx.beginPath(); ctx.ellipse(sx, sy, 38, 12, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(255,${120 + 80 * glow | 0},30,${0.5 + 0.5 * glow})`;
    ctx.beginPath(); ctx.ellipse(sx, sy, 26, 7, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.ellipse(sx, sy, 38, 12, 0, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  draw() {}
}

// ================================================================================================ stormspire
/** a signal gong: ring it and every enemy on screen is dazed */
class Gong extends Thing {
  constructor(g, d) { super(g, d); this.depthR = 44; this.cool = 0; this.ring = 0; this.w = 40; this.h = 110; this.shadowR = 0; }
  get hittable() { return this.cool <= 0; }
  takeHit() {
    const g = this.game;
    this.cool = 600; this.ring = 1;
    audio.sfx('gong'); g.shake = Math.max(g.shake, 6);
    g.onGong?.(this);
    g.fx.ring(this.x, this.y, { rx: 600, ry: 200, shock: true, life: 40, gold: true });
    for (const t of foes(g)) if (t.x > g.camX && t.x < g.camX + W) { t.daze?.(150); g.fx.label(t.x, t.y, t.h + 20, 'BWONG!', '#ffd23a', 24, 40); }
    return true;
  }
  /** rung already in this run (World.gongsRung): it stays lit -- seen, not only heard */
  get rung() { const g = this.game; return !!g.gongsRung?.has(g.things.filter((t) => t.kind === 'gong').indexOf(this)); }
  update() {
    this.tick(); if (this.cool > 0) this.cool--; this.ring *= 0.97;
    // (one not rung yet glints now and then, like the hidden exits)
    if (!this.rung && this.st % 54 === 0) this.game.fx.add({ type: 'star', x: this.x + rnd(-20, 20), y: this.y + 2, z: 62 + rnd(-18, 18), vz: 0.3, life: 30, r: rnd(5, 7), col: '#ffe9a0' });
  }
  draw(ctx) {
    const stg = this.game.stage, rung = this.rung;
    if (this.game.propInfo?.gong) stg.drawProp(ctx, 'gong', this.sx, this.sy, { ring: Math.max(this.ring, rung ? 0.22 : 0), flash: 0 });
    else {
      ctx.save(); ctx.translate(this.sx + Math.sin(this.st) * this.ring * 3, this.sy);
      ctx.strokeStyle = INK; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-40, -110); ctx.lineTo(40, -110); ctx.lineTo(40, 0); ctx.stroke();
      cel(ctx, (c) => circle(c, 0, -60, 32), '#d9a640', '#9a7124', { hi: '#ffe9a0', lw: 3 });
      ctx.restore();
    }
    if (rung) {   // (a rung gong: a glowing gold ring round its disc)
      const a = 0.65 + 0.25 * Math.sin(this.game.time * 3);
      ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(this.sx, this.sy - 62, 40, 0, TAU); ctx.stroke();
      ctx.lineWidth = 1.6; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(this.sx, this.sy - 62, 42.5, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }
}

/** a mounted ballista: whack it and it fires a giant bolt along its lane */
class Ballista extends Thing {
  constructor(g, d) { super(g, d); this.depthR = 30; this.cool = 0; this.w = 40; this.h = 70; this.shadowR = 40; this.aim = 1; }
  get hittable() { return this.cool <= 0; }
  takeHit(att) {
    const g = this.game;
    this.aim = att.facing || 1; this.cool = 300;
    audio.sfx('ballista'); g.shake = Math.max(g.shake, 5);
    g.actors.push(new Bolt(g, this.x + this.aim * 50, this.y, 40, this.aim, att.team === 'hero' ? att : null));
    return true;
  }
  update() { this.tick(); if (this.cool > 0) this.cool--; }
  draw(ctx) {
    ctx.save(); ctx.translate(this.sx, this.sy); ctx.scale(this.aim, 1);
    cel(ctx, (c) => { c.moveTo(-30, 0); c.lineTo(-20, -30); c.lineTo(20, -30); c.lineTo(30, 0); c.closePath(); }, '#7a5230', '#52361e', { lw: 3 });
    cel(ctx, (c) => { c.moveTo(-40, -36); c.lineTo(46, -40); c.lineTo(46, -32); c.lineTo(-40, -28); c.closePath(); }, '#8a6038', '#5a3e22', { lw: 2.6 });
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(30, -36); ctx.quadraticCurveTo(10, -70, -10, -62); ctx.moveTo(30, -36); ctx.quadraticCurveTo(10, -2, -10, -10); ctx.stroke();
    if (this.cool <= 0) { ctx.fillStyle = '#c8ccd6'; ctx.fillRect(-20, -38, 76, 4); }
    ctx.restore();
  }
}
class Bolt extends Actor {
  constructor(g, x, y, z, dir, owner) { super(g, x, y); this.z = z; this.vx = dir * 14; this.facing = dir; this.team = 'heroShot'; this.solid = false; this.owner = owner; this.hitSetB = new Set(); this.shadowR = 16; }
  get hittable() { return false; }
  update() {
    this.tick();
    const g = this.game;
    this.x += this.vx;
    for (const t of foes(g)) {
      if (this.hitSetB.has(t) || Math.abs(t.y - this.y) > 30 || Math.abs(t.x - this.x) > t.w + 20) continue;
      this.hitSetB.add(t);
      const hd = { dmg: 20, kind: 'knock', push: 7, lift: 5, stop: 4, hit: 'hit_heavy', word: 'heavy', thrown: true };
      if (t.takeHit(this.owner || this, hd)) this.owner?.landed?.(t, hd);
    }
    if (this.x < g.camX - 100 || this.x > g.camX + W + 100) this.gone = true;
  }
  draw(ctx) {
    ctx.save(); ctx.translate(this.sx, this.sy); ctx.scale(this.facing, 1);
    ctx.fillStyle = '#8a6038'; ctx.fillRect(-60, -3, 70, 6);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(-60, -3, 70, 6);
    flat(ctx, (c) => { c.moveTo(10, -8); c.lineTo(28, 0); c.lineTo(10, 8); c.closePath(); }, '#c8ccd6', 2);
    ctx.restore();
  }
}

/** a stretch of road where the wind gusts (pushes everyone) */
class Gust extends Thing {
  constructor(g, d) { super(g, d); this.x0 = d.x; this.x1 = d.x1; this.t0 = 0; this.dir = -1; this.shadowR = 0; }
  update() {
    this.tick();
    const g = this.game, mid = g.camX + W / 2;
    if (mid < this.x0 || mid > this.x1) { this.active = false; return; }
    const c = this.st % 420;
    this.warn = c >= 260 && c < 320; this.active = c >= 320;
    if (c === 260) { this.dir = Math.random() < 0.5 ? -1 : 1; }
    if (c === 320) { audio.sfx('wind_gust'); g.stage.windGust?.(1); }
    if (this.warn || this.active) {
      if (this.st % (this.active ? 2 : 6) === 0) g.fx.add({ type: 'wind', x: g.camX + (this.dir > 0 ? -20 : W + 20), y: rnd(0, DEPTH), z: rnd(10, 220), vx: this.dir * rnd(9, 14), life: 90, len: rnd(30, 80) });
    }
    if (this.active) {
      const push = this.dir * 1.7;
      for (const p of g.players) if (!p.out && p.state !== 'special') p.x += push;
      for (const t of g.actors) if (t.team === 'foe' && t.alive && !t.boss) t.x += push * 1.3;
    }
  }
  draw() {}
  drawShadow() {}
}

// ================================================================================================ ember throne
/** a dragon-head statue on the back wall: breathes fire down its lane every few seconds (hit it to set it off) */
class Statue extends Thing {
  constructor(g, d) { super(g, d); this.depthR = 44; this.c = (Math.random() * 200) | 0; this.w = 30; this.h = 90; this.shadowR = 0; }
  get hittable() { return !this.burning; }
  takeHit() { this.c = 250; this.lit = true; return true; }
  /** the stage paints the bronze head; we only add the glow and the fire */
  get painted() { return !!this.game.hooks?.fireStatues?.some((m) => Math.abs(m.x - this.x) < 20); }
  update() {
    this.tick();
    const g = this.game;
    // during a locked fight the statues sleep unless a hero sets one off (a trap for the bad guys)
    if (g.fighting && !this.lit && this.c < 250) { this.c = 0; return; }
    this.c = (this.c + 1) % 360;
    if (this.c === 0) this.lit = false;
    this.warn = this.c >= 250 && this.c < 310; this.burning = this.c >= 310;
    if (!this.onScreen()) return;
    if (this.c === 310) audio.sfx('statue_fire');
    if (this.burning) {
      for (let i = 0; i < 2; i++) g.fx.flames(this.x + rnd(-14, 14), rnd(10, DEPTH), rnd(0, 30), 1, { green: g.warm < 0.5, scale: 1.1 });
      if (this.st % 2 === 0) g.fx.flames(this.x + rnd(-6, 6), 2, 50, 1, { green: g.warm < 0.5, scale: 1.3, vz: -1.5 });
      if (this.st % 22 === 0) {
        for (const p of g.players) if (p.hittable && p.z < 60 && Math.abs(p.x - this.x) < 34) p.takeHit({ x: this.x, team: 'hazard', facing: 1 }, { dmg: 8, kind: 'light', push: 3, stun: 16, stop: 2, sfx: 'hit_light', spark: 'green' });
        for (const t of foes(g)) if (t.z < 60 && Math.abs(t.x - this.x) < 34) t.takeHit(this, { dmg: 12, kind: 'knock', push: 4, lift: 5, stop: 1, hit: 'hit_heavy' });
      }
    }
  }
  /** its lane on the floor: a soft-edged glow with embers drifting down it (burning: brighter, on a scorch) -- a flat box
   * read as a debug hitbox */
  drawFloor(ctx) {
    if (!this.warn && !this.burning) return;
    const sx = this.sx, t = this.game.time, rgb = this.game.warm < 0.5 ? '90,255,120' : '255,170,60';
    const a = this.burning ? 0.42 + 0.08 * Math.sin(t * 20) : 0.1 + 0.16 * Math.abs(Math.sin(this.c * 0.25));
    ctx.save();
    if (this.burning) {
      const s = ctx.createLinearGradient(sx - 42, 0, sx + 42, 0);
      s.addColorStop(0, 'rgba(30,14,10,0)'); s.addColorStop(0.5, 'rgba(30,14,10,0.3)'); s.addColorStop(1, 'rgba(30,14,10,0)');
      ctx.fillStyle = s; ctx.fillRect(sx - 42, FLOOR_TOP, 84, DEPTH + 10);
    }
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(sx - 38, 0, sx + 38, 0);
    g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(0.5, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(sx - 38, FLOOR_TOP, 76, DEPTH + 10);
    for (let i = 0; i < 7; i++) {   // (embers along the lane)
      const yy = FLOOR_TOP + ((i * 37 + t * (this.burning ? 90 : 40)) % (DEPTH + 10)), xx = sx + Math.sin(i * 2.1 + t * 3) * 18;
      ctx.fillStyle = `rgba(${rgb},${Math.min(1, a * 2)})`; ctx.beginPath(); ctx.arc(xx, yy, this.burning ? 2.6 : 1.8, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  draw(ctx) {
    const sx = this.sx, sy = FLOOR_TOP - 4;
    if (this.painted) {
      // glow in the painted head's mouth (screen y 306)
      const glow = this.burning ? 0.9 : this.warn ? 0.35 + 0.35 * Math.abs(Math.sin(this.c * 0.25)) : 0;
      if (glow > 0) {
        const green = this.game.warm < 0.5;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = green ? `rgba(90,255,120,${glow * 0.5})` : `rgba(255,190,80,${glow * 0.5})`;
        ctx.beginPath(); ctx.ellipse(sx, 306, 22, 14, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
      return;
    }
    ctx.save(); ctx.translate(sx, sy);
    cel(ctx, (c) => { c.moveTo(-26, 0); c.lineTo(-22, -70); c.quadraticCurveTo(0, -96, 22, -70); c.lineTo(26, 0); c.closePath(); }, '#3a3446', '#262230', { lw: 3 });
    cel(ctx, (c) => { c.moveTo(-18, -60); c.lineTo(-30, -84); c.lineTo(-8, -72); c.moveTo(18, -60); c.lineTo(30, -84); c.lineTo(8, -72); }, '#3a3446', '#262230', { lw: 2.6 });
    const glow = this.burning ? 1 : this.warn ? 0.6 : 0.2;
    const green = this.game.warm < 0.5;
    ctx.fillStyle = green ? `rgba(90,255,120,${glow})` : `rgba(255,190,80,${glow})`;
    ctx.beginPath(); ctx.ellipse(-8, -66, 4, 3, 0, 0, TAU); ctx.ellipse(8, -66, 4, 3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#16121e'; ctx.beginPath(); ctx.ellipse(0, -44, 10, 7, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

/** a chandelier over the floor; hit its chain post and it crashes down */
class Chandelier extends Thing {
  constructor(g, d) {
    super(g, d);
    this.fallen = false; this.cz = 260; this.vz = 0; this.w = 18; this.h = 70; this.shadowR = 0;
    this.hx = d.x - 70; this.creak = 0;
  }
  get hittable() { return !this.fallen && !this.creak; }
  // the hit box is the chain post at the back wall (x - 70)
  get postBox() { return { x: this.hx, y: 4, z: 0, w: 16, h: 70, depthR: 50 }; }
  takeHit() {
    this.creak = 1;
    audio.sfx('chandelier', { vol: 0.5, pitch: 1.3 });
    return true;
  }
  update() {
    this.tick();
    const g = this.game;
    if (this.creak && !this.fallen && ++this.creak > 40) { this.fallen = true; audio.sfx('chandelier'); }
    if (this.fallen && this.cz > 0) {
      this.vz -= 0.9; this.cz = Math.max(0, this.cz + this.vz);
      if (this.cz <= 0) {
        g.shake = Math.max(g.shake, 10);
        g.fx.debris(this.x, this.y, 10, ['#d9a640', '#f0e0b0', '#7a5a22'], 16);
        g.fx.dust(this.x, this.y, 8, 60);
        for (const t of foes(g)) if (Math.hypot((t.x - this.x) / 100, (t.y - this.y) / 36) < 1) { t.takeHit(this, { dmg: 30, kind: 'knock', push: 6, lift: 7, stop: 3, hit: 'hit_finisher' }); g.fx.word(t.x, t.y, t.h, true, 'CRASH!'); }
        this.gone = true;
      }
    }
  }
  drawFloor(ctx) {
    const sx = this.sx, sy = FLOOR_TOP + this.y;
    const k = clamp(1 - this.cz / 260, 0.2, 1);
    ctx.fillStyle = `rgba(30,20,40,${0.12 + 0.3 * k})`; ctx.beginPath(); ctx.ellipse(sx, sy, 90 * k + 20, 28 * k + 6, 0, 0, TAU); ctx.fill();
    // the chain post at the back wall (the thing you hit)
    if (!this.fallen) {
      ctx.save(); ctx.translate(sx - 70, FLOOR_TOP - 4);
      cel(ctx, (c) => { c.moveTo(-6, 0); c.lineTo(-6, -60); c.lineTo(6, -60); c.lineTo(6, 0); c.closePath(); }, '#7a5a22', '#52401a', { lw: 2.6 });
      flat(ctx, (c) => circle(c, 0, -64, 7), '#d9a640', 2.4);
      ctx.restore();
    }
  }
  draw(ctx) {
    const sx = this.sx + (this.creak && !this.fallen ? Math.sin(this.creak * 1.3) * 4 : 0), top = FLOOR_TOP + this.y - this.cz - 40;
    ctx.save();
    if (!this.fallen) { ctx.strokeStyle = '#2a2230'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx, -10); ctx.lineTo(sx, top); ctx.stroke(); }
    ctx.translate(sx, top);
    cel(ctx, (c) => { c.moveTo(-60, 10); c.quadraticCurveTo(0, 40, 60, 10); c.lineTo(52, 2); c.quadraticCurveTo(0, 26, -52, 2); c.closePath(); }, '#d9a640', '#9a7124', { hi: '#ffe9a0', lw: 2.8 });
    const green = this.game.warm < 0.5;
    for (let i = -2; i <= 2; i++) {
      const x = i * 24, y = 6 + Math.abs(i) * -3;
      ctx.fillStyle = '#f0e6d0'; ctx.fillRect(x - 3, y - 14, 6, 14);
      ctx.fillStyle = green ? '#7dff6a' : '#ffb02e'; ctx.beginPath(); ctx.ellipse(x, y - 19, 3.5, 6 + Math.sin(this.st * 0.3 + i) * 1.5, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}

/** a treasure chest: three whacks and it pops open */
class Chest extends Thing {
  constructor(g, d) { super(g, d); this.hp = 3; this.open = 0; this.w = 34; this.h = 54; this.shadowR = 40; }
  get hittable() { return this.hp > 0; }
  takeHit() {
    const g = this.game;
    this.hp--; this.flash = 6; this.shake = 6;
    audio.sfx('block', { pitch: 0.9 });
    if (this.hp <= 0) {
      audio.sfx('chest_open');
      addChest(this.chestId);                           // (the persistent count, each chest once: 12 unlock PIRATE QUEEN SCARLET, src/secrets.js)
      this.game.fx.label(this.x, this.y, 110, 'TREASURE!', '#ffd86a', 28, 50);
      for (let i = 0; i < 4; i++) g.spawnPickup('coin', this.x + rnd(-30, 30), clamp(this.y + rnd(-10, 20), 4, DEPTH - 4));
      g.spawnPickup(Math.random() < 0.5 ? 'drumstick' : 'gem', this.x, clamp(this.y + 16, 4, DEPTH - 4));
    }
    return true;
  }
  update() { this.tick(); if (this.hp <= 0) this.open = Math.min(1, this.open + 0.06); }
  draw(ctx) {
    const sh = this.shake ? Math.sin(this.shake * 2.5) * 3 : 0;
    if (this.game.propInfo?.chest) { this.game.stage.drawProp(ctx, 'chest', this.sx + sh, this.sy, { open: this.open, flash: this.flashAlpha }); return; }
    ctx.save(); ctx.translate(this.sx + sh, this.sy);
    cel(ctx, (c) => { c.rect(-34, -36, 68, 36); }, '#8a5530', '#5b361d', { lw: 3 });
    ctx.save(); ctx.translate(0, -36); ctx.rotate(-this.open * 1.2);
    cel(ctx, (c) => { c.moveTo(-34, 0); c.quadraticCurveTo(-34, -20, 0, -22); c.quadraticCurveTo(34, -20, 34, 0); c.closePath(); }, '#9a6034', '#6b3f20', { lw: 3 });
    ctx.restore();
    flat(ctx, (c) => { c.rect(-6, -42, 12, 14); }, '#d9a640', 2);
    ctx.restore();
  }
}

// ================================================================================================ the hidden exits
// (docs/SECRETS.md) each leads to a secret stage (def.secret: 's1'..'s3'): visible and fair for a kid -- a crystal glint
// and a baby dragon's chirp nearby -- but never taken by accident: it opens only to deliberate hits (melee, not shots),
// and the way in needs UP held at it, never during a fight.  Used once a run (World.run.secretsVisited).
const ENTER_HOLD = 12;
class SecretExit extends Thing {
  constructor(g, d) { super(g, d); this.secret = d.secret; this.holdT = 0; this.chirped = false; this.w = 40; }
  get used() { return (this.game.app.run.secretsVisited || []).includes(this.secret); }
  get open() { return false; }
  /** the glint and the chirp while a hero is near and the way isn't used; then UP held at the way in */
  hint() {
    const g = this.game;
    if (this.used) return;
    const d = Math.min(...g.players.filter((p) => !p.out).map((p) => Math.abs(p.x - this.x)), 1e9);
    if (d < 460 && this.st % 46 === 0) g.fx.add({ type: 'star', x: this.x + rnd(-18, 18), y: this.y + 2, z: rnd(40, 120), vz: rnd(0.3, 0.8), life: 34, r: rnd(5, 8), col: this.st % 92 ? '#bff0ff' : '#ffe9a0' });
    if (d < 300 && !this.chirped) { this.chirped = true; audio.sfx('whelp_chirp', { vol: 0.55, pitch: 1.25 }); }
    if (d > 640) this.chirped = false;
  }
  /** the hero standing at the way in (and its prompt), while it's open and no fight or cutscene is on */
  atDoor(dx = 46, dy = 32) {
    const g = this.game;
    if (!this.open || this.used || g.fighting || g.cut || g.cutin || g.app.warp) return null;
    return g.players.find((p) => !p.out && p.ctl && Math.abs(p.x - this.doorX) < dx && Math.abs(p.y - this.y) < dy) || null;
  }
  get doorX() { return this.x; }
  stepDoor() {
    const p = this.atDoor();
    if (p && p.ctrl.held.up) { if (++this.holdT >= ENTER_HOLD) { this.holdT = 0; this.go(p); } } else this.holdT = 0;
    return p;
  }
  go() { this.game.enterSecret(this.secret, this); }
  update() { this.tick(); this.hint(); this.who = this.stepDoor(); }
  /** after every actor (World.render): the prompt over the hero at the way in, never behind his head */
  drawOver(ctx) { if (this.promptText) this.drawPrompt(ctx, this.promptText); }
  drawPrompt(ctx, text) {
    const p = this.who;
    if (!p) return;
    const app = this.game.app, x = p.x - this.game.camX, y = FLOOR_TOP + p.y - p.z - (p.h || 130) - 66;   // (above his head)
    ctx.save(); ctx.globalAlpha = 0.85 + 0.15 * Math.sin(this.game.time * 6);
    app.drawGlyph(ctx, 'up', p.ctrlId, x, y, 26);
    ctx.font = 'bold 14px "Comic Neue", sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3.5; ctx.strokeStyle = INK;
    ctx.strokeText(text, x, y + 30); ctx.fillStyle = '#e8fbff'; ctx.fillText(text, x, y + 30);
    if (this.holdT > 0) { ctx.fillStyle = '#9fe7ff'; ctx.fillRect(x - 24, y + 36, 48 * this.holdT / ENTER_HOLD, 4); }
    ctx.restore();
  }
}

/** Dragon Road: a cracked pillar under the Old Stone Bridge -- three good hits and it crumbles onto a dark hole */
class CrackedPillar extends SecretExit {
  constructor(g, d) { super(g, d); this.hp = 3; this.h = 150; this.shadowR = 30; this.depthR = 30; }
  get open() { return this.hp <= 0; }
  get hittable() { return this.hp > 0 && !this.used; }
  takeHit(att, hd) {
    // (only a hero's own melee blow: a swing's box, or a charged strike -- never a stray shot or a knocked-back foe)
    if (this.hp <= 0 || !att || att.team !== 'hero' || !(hd && (hd.box || hd.cstrike))) return false;
    const g = this.game;
    this.hp--; this.flash = 6; this.shake = 8;
    audio.sfx('block', { pitch: 0.6 }); g.fx.debris(this.x, this.y, 70, ['#8d8aa0', '#615e76', '#b9b6c8'], 5);
    if (this.hp <= 0) {
      audio.sfx('cage_break', { pitch: 0.7 }); g.shake = Math.max(g.shake, 8);
      g.fx.debris(this.x, this.y, 90, ['#8d8aa0', '#615e76', '#b9b6c8'], 14); g.fx.dust(this.x, this.y, 10, 50);
      g.fx.label(this.x, this.y, 170, 'A SECRET PASSAGE!', '#bff0ff', 28, 90);
    }
    return true;
  }
  draw(ctx) {
    const t = this.game.time, sh = this.shake ? Math.sin(this.shake * 2.5) * 3 : 0;
    drawWithFlash(ctx, this.sx + sh, this.sy, this.flashAlpha, (c) => {
      if (this.hp > 0) {   // the pillar: stone drums, cracks spreading with each hit
        cel(c, (q) => { q.moveTo(-26, 0); q.lineTo(-22, -150); q.lineTo(22, -150); q.lineTo(26, 0); q.closePath(); }, '#8d8aa0', '#615e76', { lw: 3 });
        c.strokeStyle = 'rgba(33,20,28,0.55)'; c.lineWidth = 2;
        for (const y of [-38, -76, -114]) { c.beginPath(); c.moveTo(-24, y); c.lineTo(24, y); c.stroke(); }
        c.strokeStyle = INK; c.lineWidth = 2.2; c.beginPath();
        const k = 3 - this.hp;
        c.moveTo(-4, -20); c.lineTo(6, -46); c.lineTo(-2, -70);
        if (k >= 1) { c.moveTo(6, -46); c.lineTo(16, -60); c.moveTo(-2, -70); c.lineTo(-12, -96); }
        if (k >= 2) { c.moveTo(-12, -96); c.lineTo(4, -122); c.moveTo(-4, -20); c.lineTo(-16, -8); c.moveTo(16, -60); c.lineTo(20, -84); }
        c.stroke();
        // the glint in the crack (the hint), brighter as it opens
        const g = 0.5 + 0.5 * Math.sin(t * 3);
        c.fillStyle = `rgba(190,240,255,${0.35 + 0.35 * g})`; c.beginPath(); c.arc(4, -50, 4 + k, 0, TAU); c.fill();
      } else {             // the hole: a dark arch with a cold glow, rubble round it
        const g = 0.5 + 0.5 * Math.sin(t * 2);
        cel(c, (q) => { q.moveTo(-34, 0); q.lineTo(-30, -70); q.quadraticCurveTo(0, -104, 30, -70); q.lineTo(34, 0); q.closePath(); }, '#16131e', '#0c0a12', { lw: 3 });
        c.fillStyle = `rgba(150,215,255,${0.18 + 0.14 * g})`; c.beginPath(); c.ellipse(0, -30, 22, 30, 0, 0, TAU); c.fill();
        for (const [x, y, r] of [[-40, -6, 10], [36, -5, 12], [-22, -2, 7], [46, -14, 7]]) cel(c, (q) => circle(q, x, y, r), '#8d8aa0', '#615e76', { lw: 2.4 });
      }
    });
    this.promptText = 'GO IN';
  }
}

/** Ember Mines: a rusty switch by a side track -- hit it and a runaway mine cart rolls up; hop in to ride */
class RustySwitch extends SecretExit {
  constructor(g, d) { super(g, d); this.flipped = false; this.h = 80; this.shadowR = 18; this.cart = null; }
  get open() { return !!this.cart && this.cart.parked; }
  get hittable() { return !this.flipped && !this.used; }
  get doorX() { return this.cart ? this.cart.x : this.x; }
  takeHit(att, hd) {
    if (this.flipped || !att || att.team !== 'hero' || !(hd && (hd.box || hd.cstrike))) return false;
    const g = this.game;
    this.flipped = true; this.flash = 6;
    audio.sfx('block', { pitch: 0.5 }); audio.sfx('minecart', { vol: 0.8 });
    g.fx.spark(this.x, this.y, 60, false, 'warm');
    this.cart = new RunawayCart(g, this);
    g.actors.push(this.cart);
    g.fx.label(this.x, this.y, 130, 'CLUNK!', '#ffd23a', 26, 50);
    return true;
  }
  go(p) { this.cart.depart(); }
  draw(ctx) {
    const t = this.game.time;
    drawWithFlash(ctx, this.sx, this.sy, this.flashAlpha, (c) => {
      cel(c, (q) => { q.rect(-8, -70, 16, 70); }, '#6a5a4a', '#4a3a2c', { lw: 2.6 });
      cel(c, (q) => { q.rect(-20, -84, 40, 18); }, '#8a6040', '#5a3a22', { lw: 2.6 });
      c.save(); c.translate(0, -76); c.rotate(this.flipped ? 0.7 : -0.7);
      c.strokeStyle = INK; c.lineWidth = 7; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -40); c.stroke();
      c.strokeStyle = '#b06a3a'; c.lineWidth = 4; c.stroke();
      cel(c, (q) => circle(q, 0, -42, 7), '#d24a2a', '#8a2a18', { lw: 2.4 });
      c.restore();
      if (!this.flipped) { const g = 0.5 + 0.5 * Math.sin(t * 3); c.fillStyle = `rgba(255,230,150,${0.3 + 0.4 * g})`; c.beginPath(); c.arc(0, -118, 5, 0, TAU); c.fill(); }   // (the glint)
    });
    this.promptText = 'HOP IN';
  }
}
/** the runaway cart: rolls in from the right along the side track, stops by the switch; aboard, it races off */
class RunawayCart extends Actor {
  constructor(g, sw) {
    super(g, g.camX + W + 90, sw.y + 6);
    this.sw = sw; this.team = 'thing'; this.solid = false; this.w = 34; this.h = 56; this.shadowR = 40;
    this.vx = -9; this.parked = false; this.leaving = false; this.roll = 0;
  }
  get hittable() { return false; }
  takeHit() { return false; }
  depart() {
    const g = this.game;
    this.parked = false; this.leaving = true; this.vx = 0.5;
    audio.sfx('minecart'); g.fx.label(this.x, this.y, 120, 'WHEEE!', '#ffe066', 30, 60);
    g.enterSecret(this.sw.secret, this.sw, { ride: this });
  }
  update() {
    this.tick();
    const g = this.game, stop = this.sw.x + 96;
    if (!this.parked && !this.leaving) {
      if (this.x > stop) { this.x = Math.max(stop, this.x + this.vx); this.vx = Math.min(-2.5, this.vx * 0.985); if (this.st % 3 === 0) g.fx.spark(this.x + 24, this.y, 4, false); }
      else { this.parked = true; this.vx = 0; audio.sfx('knockdown', { pitch: 0.8 }); g.shake = Math.max(g.shake, 3); }
    }
    if (this.leaving) { this.vx = Math.min(12, this.vx + 0.5); this.x += this.vx; if (this.st % 2 === 0) g.fx.spark(this.x - 24, this.y, 4, false); }
    this.roll += this.vx;
  }
  draw(ctx) {
    const stg = this.game.stage;
    if (stg.drawProp && this.game.propInfo?.cart) { stg.drawProp(ctx, 'cart', this.sx, this.sy, { flash: 0, shake: 0, roll: this.roll }); return; }
    ctx.save(); ctx.translate(this.sx, this.sy);
    cel(ctx, (c) => { c.moveTo(-34, -12); c.lineTo(-30, -50); c.lineTo(30, -50); c.lineTo(34, -12); c.closePath(); }, '#6a5a4a', '#4a3a2c', { lw: 3 });
    flat(ctx, (c) => { circle(c, -18, -8, 9); circle(c, 18, -8, 9); }, '#3c3f48', 2.6);
    ctx.restore();
  }
}

/** Stormspire: the three gongs rung (World.onGong) raise a cloud bridge going up into the sky */
class CloudBridge extends SecretExit {
  constructor(g, d) { super(g, d); this.shown = 0; this.revealed = false; this.h = 0; this.shadowR = 0; }
  get open() { return this.revealed && this.shown >= 1; }
  reveal(quiet) {
    if (this.revealed) return;
    this.revealed = true;
    if (quiet) { this.shown = 1; return; }
    audio.sfx('freed', { vol: 0.8 });
    this.game.fx.label(this.x, this.y, 200, 'A CLOUD BRIDGE!', '#f4f2ff', 30, 100);
  }
  hint() { if (this.revealed) super.hint(); }
  update() { super.update(); if (this.revealed && this.shown < 1) this.shown = Math.min(1, this.shown + 1 / 60); }
  draw(ctx) {
    if (!this.revealed) return;
    const t = this.game.time, a = this.shown;
    ctx.save(); ctx.globalAlpha = a;
    const x0 = this.sx, y0 = this.sy;
    for (let i = 0; i < 7; i++) {   // puffy steps climbing up and to the right, out of the screen's top
      const x = x0 + i * 42, y = y0 - 10 - i * 48 + Math.sin(t * 2 + i) * 3, r = 34 - i * 1.5;
      ctx.fillStyle = 'rgba(244,242,255,0.95)'; ctx.strokeStyle = 'rgba(120,110,170,0.9)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.5, r * 0.55, 0, 0, TAU); ctx.ellipse(x - r * 0.7, y - 6, r * 0.7, r * 0.45, 0, 0, TAU); ctx.ellipse(x + r * 0.8, y - 8, r * 0.8, r * 0.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    this.promptText = 'CLIMB';
  }
}

/** a Star Shard: where a secret stage's mini-boss fell -- a hero touches it and it's theirs (World.collectShard) */
export class ShardPickup extends Actor {
  constructor(g, x, y, n) { super(g, x, y); this.n = n; this.team = 'item'; this.solid = false; this.w = 20; this.h = 40; this.z = 90; this.shadowR = 18; this.done = false; }
  get hittable() { return false; }
  update() {
    this.tick();
    const g = this.game;
    this.z = 70 + Math.sin(this.st * 0.08) * 10 + Math.max(0, 60 - this.st) * 1.5;   // (it floats down, then bobs)
    if (this.st % 6 === 0) g.fx.add({ type: 'star', x: this.x + rnd(-20, 20), y: this.y, z: this.z + rnd(-10, 40), vz: rnd(0.2, 0.7), life: 30, r: rnd(3, 6), col: '#fff6c0' });
    if (!this.done && this.st > 40) {
      const p = g.players.find((q) => !q.out && Math.abs(q.x - this.x) < 44 && Math.abs(q.y - this.y) < 28);
      if (p) { this.done = true; this.gone = true; g.collectShard(this, p); }
    }
  }
  draw(ctx) {
    const t = this.game.time, x = this.sx, y = this.sy - this.z;
    ctx.save();
    const prev = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createRadialGradient(x, y, 2, x, y, 60); gr.addColorStop(0, 'rgba(255,250,210,0.8)'); gr.addColorStop(1, 'rgba(255,220,140,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 60, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = prev;
    ctx.translate(x, y); ctx.rotate(Math.sin(t * 1.5) * 0.25);
    ctx.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 9 : 22; const a = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath();
    ctx.fillStyle = '#fff2a8'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-4, -6, 4, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

/** the portal home from a secret stage: a hero steps in and the party goes back to the main stage (World.enterPortal) */
export class Portal extends Actor {
  constructor(g, x, y) { super(g, x, y); this.team = 'thing'; this.solid = false; this.w = 40; this.h = 110; this.shadowR = 40; this.used = false; this.delay = 0; }
  get hittable() { return false; }
  takeHit() { return false; }
  drawShadow(ctx) { if (this.st >= this.delay + 10) super.drawShadow(ctx); }
  update() {
    this.tick();
    const g = this.game;
    if (this.st < this.delay) return;              // (opening a beat after the shard)
    if (this.st === this.delay) { audio.jingle('portal'); g.fx.ring(this.x, this.y, { rx: 90, ry: 30, shock: true, blue: true, life: 20 }); }
    if (this.st % 5 === 0) g.fx.add({ type: 'star', x: this.x + rnd(-30, 30), y: this.y, z: rnd(10, 110), vz: rnd(0.5, 1.2), life: 30, r: rnd(3, 5), col: '#9fe7ff' });
    if (!this.used && this.st > this.delay + 30 && !g.app.warp) {
      const p = g.players.find((q) => !q.out && Math.abs(q.x - this.x) < 36 && Math.abs(q.y - this.y) < 24);
      if (p) { this.used = true; g.enterPortal(this); }
    }
  }
  draw(ctx) {
    const t = this.game.time, x = this.sx, y = this.sy - 60, k = Math.max(0, Math.min(1, (this.st - this.delay) / 30));
    if (k <= 0) return;
    ctx.save();
    ctx.translate(x, y); ctx.scale(k, k);
    for (let i = 0; i < 3; i++) {
      ctx.rotate(t * (1.2 + i * 0.5));
      ctx.lineWidth = 6 - i * 1.5; ctx.strokeStyle = ['#5ad0ff', '#9fe7ff', '#e8fbff'][i];
      ctx.beginPath(); ctx.ellipse(0, 0, 40 - i * 9, 60 - i * 13, 0, 0.3, TAU - 0.3); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(140,220,255,0.25)'; ctx.beginPath(); ctx.ellipse(0, 0, 34, 52, 0, 0, TAU); ctx.fill();
    ctx.restore();
    if (k >= 1) {
      ctx.save(); ctx.font = 'bold 15px "Comic Neue", sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3.5; ctx.strokeStyle = INK;
      ctx.strokeText('HOME', x, y - 74); ctx.fillStyle = '#e8fbff'; ctx.fillText('HOME', x, y - 74); ctx.restore();
    }
  }
}

// ================================================================================================ factory
export function makeThing(game, def) {
  switch (def.kind) {
    case 'pillar': return new CrackedPillar(game, def);
    case 'switch': return new RustySwitch(game, def);
    case 'cloudbridge': return new CloudBridge(game, def);
    case 'waystone': return new Waystone(game, def);
    case 'cage': return new Cage(game, def);
    case 'snowball': case 'keg': case 'rock': return new Throwable(game, def);
    case 'boulder': return new Boulder(game, def);
    case 'pine': return new Pine(game, def);
    case 'cart': return new Cart(game, def);
    case 'vent': return new Vent(game, def);
    case 'gong': return new Gong(game, def);
    case 'ballista': return new Ballista(game, def);
    case 'gust': return new Gust(game, def);
    case 'statue': return new Statue(game, def);
    case 'chandelier': return new Chandelier(game, def);
    case 'chest': return new Chest(game, def);
  }
  console.warn('unknown thing', def.kind);
  return null;
}
