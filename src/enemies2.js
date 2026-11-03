// Enemies of levels 2-4: magma salamanders, wyvern riders, royal drake guards, and the bosses Magmaw,
// Tempest and the Dragon King.
import { GRAV, boxOf, overlaps } from './actors.js';
import { Enemy, CHARS, softBossFlash } from './enemies.js';
import { LavaGlob } from './projectiles.js';
import { audio } from './audio-proxy.js';
import { W, DEPTH, FLOOR_TOP, INK } from './config.js';
import { clamp, TAU } from './rig.js';
import { TINT_VARIANTS } from './secrets.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];

// ==================================================================================================== SALAMANDER
export class Salamander extends Enemy {
  constructor(game, x, y, opt = {}) {
    super(game, x, y, { name: opt.name || pick(['SIZZLE', 'CINDER', 'SCORCH', 'EMBERS']) });
    this.art = 'salamander';
    this.hp = this.maxHp = 34;
    const hb = CHARS.salamander?.HURTBOX || { w: 60, h: 62 };
    this.w = hb.w / 2; this.h = hb.h; this.shadowR = 46; this.balloonH = 90;
    this.score = 600;
    this.set('approach');
  }
  onHurtSfx() { audio.sfx('kobold_hurt', { pitch: 0.7 }); }
  update() {
    const g = this.game, p = this.player;
    this.tick();
    if (this.cool > 0) this.cool--;
    switch (this.state) {
      case 'approach': case 'wait': case 'taunt': this.think(p); break;
      case 'spitWind': if (this.st >= 24) { this.set('spit'); } break;
      case 'spit':
        if (this.st === 5) {
          const M = CHARS.salamander?.MOUTH || [52, -40];
          g.actors.push(new LavaGlob(g, this.x + this.facing * M[0], this.y, -M[1], this.facing, p.x));
          audio.sfx('fire_small', { pitch: 0.7 });
        }
        if (this.st >= 16) { this.releaseToken(); this.cool = rnd(110, 170); this.set('wait'); }
        break;
      case 'lungeWind': if (this.st >= 18) { this.set('lunge'); this.hitDone = false; audio.sfx('swing_light', { pitch: 1.4 }); } break;
      case 'lunge':
        this.vx = this.st >= 4 && this.st <= 12 ? this.facing * 6.5 : this.vx * 0.7;
        if (!this.hitDone && this.st >= 5 && this.st <= 12) {
          const b = boxOf(this, { x0: 20, x1: 76, z0: 0, z1: 70, dy: 16 });
          if (this.hitHeroes(b, { dmg: 8, kind: 'light', push: 3, stun: 18, stop: 4, sfx: 'hit_light' })) this.hitDone = true;
        }
        if (this.st >= 20) { this.releaseToken(); this.cool = rnd(80, 130); this.set('wait'); }
        break;
      case 'hurt': this.vx *= 0.8; if (this.st >= this.stun) this.set('wait'); break;
      case 'fly': this.flyUpdate(); break;
      case 'down': this.downUpdate(); break;
      case 'getup': if (this.st >= 26) { this.set('wait'); this.cool = Math.max(this.cool, 30); } break;
      case 'dying': this.dyingUpdate(); break;
    }
    if (this.state === 'approach' || this.state === 'wait') this.separate();
    this.integrate();
  }
  think(p) {
    if (!p.alive || p.down) { this.moveTo(this.standX(p, 200), p.y, 1.4); this.set(this.vx || this.vy ? 'approach' : 'taunt'); this.ph = (this.ph + 0.05) % 1; return; }
    const dist = Math.abs(p.x - this.x), dy = Math.abs(p.y - this.y);
    if (this.cool <= 0 && this.entered && dist > 150 && dist < 300 && this.takeToken()) { this.face(p); this.windup('spitWind'); return; }
    if (this.cool <= 0 && this.entered && dist < 95 && dy < 10 && this.takeToken()) { this.face(p); this.windup('lungeWind'); return; }
    const want = this.cool > 30 ? 200 : 80;
    if (this.moveTo(this.standX(p, want), clamp(p.y + this.yOff, 4, DEPTH - 4), 2.3, 1.5)) { this.set('wait'); this.face(p); }
    else { this.set('approach'); this.ph = (this.ph + Math.hypot(this.vx, this.vy) / (CHARS.salamander?.CRAWL_STRIDE || 40)) % 1; this.face(p); }
  }
  get postBox() { const hb = CHARS.salamander?.HURTBOX; return hb ? { x: this.x + this.facing * hb.x, y: this.y, z: this.z, w: hb.w / 2, h: hb.h, depthR: this.depthR || 0 } : null; }
  pose() {
    const g = this.game;
    switch (this.state) {
      case 'approach': return this.anim('crawl', this.ph);
      case 'wait': return this.anim('idle', g.time + this.ph * 3);
      case 'taunt': return this.anim('taunt', g.time);
      case 'spitWind': return this.anim('spitWind', Math.min(1, this.st / 24));
      case 'spit': return this.anim('spit', Math.min(1, this.st / 16));
      case 'lungeWind': return this.anim('lungeWind', Math.min(1, this.st / 18));
      case 'lunge': return this.anim('lunge', Math.min(1, this.st / 20));
      case 'hurt': return this.anim((this.hitN || 0) % 2 ? 'hurt2' : 'hurt', Math.min(1, this.st / this.stun));
      case 'fly': return this.anim('fly');
      case 'down': case 'dying': return this.anim('down');
      case 'getup': return this.anim('getup', Math.min(1, this.st / 26));
      default: return this.anim('idle', g.time);
    }
  }
}

// ==================================================================================================== WYVERN RIDER
export class Wyvern extends Enemy {
  constructor(game, x, y, opt = {}) {
    super(game, x, y, { name: opt.name || 'WYVERN RIDER' });
    this.art = 'wyvern';
    this.hp = this.maxHp = 44;
    this.w = 34; this.h = 56; this.hz0 = -6; this.depthR = 6;
    this.z = 86; this.flying = true; this.cursed = true; this.rider = true; this.collared = true;
    this.shadowR = 34; this.balloonH = 120; this.score = 1000;
    this.set('hover');
  }
  get hittable() { return this.alive && this.inv <= 0 && ['hover', 'diveWind', 'dive', 'swoopUp', 'hurt'].includes(this.state); }
  onHurtSfx() { audio.sfx('whelp_chirp', { pitch: 0.7 }); }
  update() {
    const g = this.game, p = this.player;
    this.tick();
    if (this.cool > 0) this.cool--;
    const bob = Math.sin(g.time * 2.4 + this.ph * 6) * 7;
    switch (this.state) {
      case 'hover': {
        const side = this.x < p.x ? -1 : 1;
        const tx = clamp(p.x + side * 260, g.camX + 80, g.camX + W - 80);
        this.vx = clamp((tx - this.x) * 0.04, -2.4, 2.4); this.vy = clamp((p.y + this.yOff - this.y) * 0.05, -1.4, 1.4);
        this.z += (86 + bob - this.z) * 0.08;
        this.face(p);
        if (this.cool <= 0 && this.entered && Math.abs(tx - this.x) < 60 && Math.abs(p.y - this.y) < 20 && !p.down && this.takeToken()) { this.vx = this.vy = 0; this.windup('diveWind'); }
        break;
      }
      case 'diveWind': this.z += (120 - this.z) * 0.1; if (this.st >= 26) { this.set('dive'); this.hitDone = false; audio.sfx('swing_heavy', { pitch: 1.1 }); } break;
      case 'dive': {
        this.vx = this.facing * 8; this.vy = clamp((p.y - this.y) * 0.05, -1, 1);
        this.z = Math.max(26, this.z - 4.2);
        if (!this.hitDone) for (const pl of g.players) {
          if (pl.hittable && Math.abs(pl.x - (this.x + this.facing * 70)) < 58 && Math.abs(pl.y - this.y) < 20 && this.z < pl.z + 120) {
            this.hitDone = true; pl.takeHit(this, { dmg: 11, kind: 'knock', push: 5, lift: 5, stop: 5, sfx: 'hit_heavy' });
          }
        }
        const edge = this.facing > 0 ? this.x > g.camX + W - 60 : this.x < g.camX + 60;
        if (this.st >= 50 || edge) this.set('swoopUp');
        break;
      }
      case 'swoopUp': this.vx *= 0.92; this.z += (86 - this.z) * 0.12; if (this.st >= 20) { this.releaseToken(); this.cool = rnd(120, 180); this.set('hover'); } break;
      case 'hurt': this.vx *= 0.85; this.vy = 0; if (this.st >= this.stun) this.set('hover'); break;
      case 'fly':
        this.vz -= GRAV * 0.8; this.z = Math.max(0, this.z + this.vz);
        this.dropRider();
        if (this.z <= 0) { this.z = 0; this.vx = 0; this.set('down'); audio.sfx('knockdown', { pitch: 1.2 }); g.fx.dust(this.x, this.y, 4, 24); }
        break;
      case 'down':
        this.vx = this.vy = 0;
        if (this.st >= (this.hp <= 0 ? 30 : 60)) { if (this.hp <= 0) this.free(); else { this.set('rise'); } }
        break;
      case 'rise': this.z += (86 - this.z) * 0.08; if (this.st >= 30) { this.set('hover'); this.cool = 60; } break;
      case 'freed':
        this.vx = this.facing * 3; this.z += 2.4;
        if (this.st % 10 === 0) g.fx.hearts(this.x, this.y, this.z, 1);
        if (this.st >= 150) this.gone = true;
        break;
    }
    if (this.state !== 'fly') { this.x += this.vx; this.y += this.vy; } else this.x += this.vx;
    this.clampDepth();
    if (!this.entered && this.x > g.camX + 40 && this.x < g.camX + W - 40) this.entered = true;
    if (this.entered && this.state !== 'freed') this.x = clamp(this.x, g.camX + 30, g.camX + W - 30);
  }
  knock(dir, lift, push) { this.releaseToken(); this.set('fly'); this.vz = Math.min(lift, 4); this.vx = dir * push * 0.8; this.dropRider(); }
  /** the kobold knocked out of the saddle the moment the wyvern is (its fall has no rider drawing -- RiderFall tumbles
   * him on his own; dropped on the next update, the frame between drew the fall with him still aboard) */
  dropRider() {
    if (!this.rider) return;
    const g = this.game, sp = CHARS.wyvern?.SEAT_POS || [3, -37];
    this.rider = false;
    g.actors.push(new RiderFall(g, this.x + this.facing * sp[0], this.y, this.z - sp[1], this.facing, -this.vx * 0.4));
    g.fx.label(this.x, this.y, this.z + 80, 'WHOOPS!', '#9dff8a', 22, 40);
  }
  free() {
    const g = this.game;
    this.alive = false; this.cursed = false; this.rider = false;
    this.set('freed'); this.facing = this.player.x > this.x ? -1 : 1;
    g.fx.hearts(this.x, this.y, 30, 8); g.fx.spark(this.x, this.y, 30, true, 'green');
    g.fx.label(clamp(this.x, g.camX + 90, g.camX + W - 90), this.y, 110, 'FREED!', '#9dff8a', 34, 70);
    audio.sfx('freed'); g.score += this.score; g.onFoeGone(this); g.onWhelpFreed(this);
  }
  pose() {
    const g = this.game;
    switch (this.state) {
      case 'diveWind': return this.anim('diveWind', Math.min(1, this.st / 26));
      case 'dive': return this.anim('dive', g.time);
      case 'swoopUp': return this.anim('swoopUp', Math.min(1, this.st / 20));
      case 'hurt': return this.anim('hurt', Math.min(1, this.st / this.stun));
      case 'fly': return this.anim('fall', Math.min(1, this.st / 30));
      case 'down': return this.anim('down');
      case 'freed': return this.anim('freed', g.time);
      default: return this.anim('fly', g.time + this.ph * 2);
    }
  }
  drawOpts() { return { ...super.drawOpts(), cursed: this.cursed, rider: this.rider, variant: this.variant }; }
}

/** a wyvern's kobold rider knocked out of the saddle: tumbles to the floor and runs off in a puff */
class RiderFall {
  constructor(game, x, y, z, facing, vx) {
    this.game = game; this.x = x; this.y = y; this.z = z; this.facing = facing; this.vx = vx; this.vz = 3;
    this.t = 0; this.team = 'fx'; this.alive = false; this.w = 0; this.h = 0;
  }
  get sx() { return this.x - this.game.camX; }
  get sy() { return FLOOR_TOP + this.y - this.z; }
  update() {
    this.t++;
    this.vz -= GRAV; this.z = Math.max(0, this.z + this.vz); this.x += this.vx;
    if (this.z <= 0 && !this.landed) { this.landed = this.t; audio.sfx('knockdown', { pitch: 1.5, vol: 0.6 }); }
    if (this.landed && this.t - this.landed > 24) { this.gone = true; this.game.fx.poof(this.x, this.y, 10, false); }
  }
  drawShadow() {}
  draw(ctx) {
    const art = CHARS.wyvern;
    if (!art?.ANIM?.riderFall) return;
    ctx.save(); ctx.translate(this.sx, this.sy);
    art.draw(ctx, art.ANIM.riderFall(Math.min(1, this.t / 40)), { facing: this.facing, t: this.game.time });
    ctx.restore();
  }
}

// ==================================================================================================== ROYAL GUARD
export class Guard extends Enemy {
  constructor(game, x, y, opt = {}) {
    super(game, x, y, { name: opt.name || pick(['SIR BRIMSTONE', 'SIR ASHFANG', 'DAME CINDRA', 'SIR SMOLDER']) });
    this.art = 'guard';
    this.hp = this.maxHp = 70;
    const hb = CHARS.guard?.HURTBOX || { w: 80, h: 196 };
    this.w = hb.w / 2; this.h = hb.h; this.heavy = true;
    this.shadowR = 50; this.balloonH = 230; this.score = 2000;
    this.blocks = 0; this.blockWindow = 0;
    this.set('approach');
  }
  get guarding() { return ['approach', 'wait', 'guard', 'block', 'bashWind', 'thrustWind'].includes(this.state); }
  get postBox() { const hb = CHARS.guard?.HURTBOX; return hb && this.state !== 'down' && this.state !== 'fly' ? { x: this.x + this.facing * hb.x, y: this.y, z: this.z, w: hb.w / 2, h: hb.h, depthR: this.depthR || 0 } : null; }
  onHurtSfx() { audio.sfx('brute_hurt', { pitch: 1.1 }); }
  takeHit(att, hd) {
    if (!this.hittable) return false;
    const g = this.game;
    const front = (att.x - this.x) * this.facing > -10;
    if (this.guarding && front && !hd.special && !hd.unblockable) {
      // the tower shield takes it
      this.blocks += hd.kind === 'knock' ? 2 : 1; this.blockWindow = 120;
      this.reset('block'); this.vx = -this.facing * 1.5;
      g.fx.spark(this.x + this.facing * 30, this.y, 90, false, 'cool');
      audio.sfx('shield_block');
      if (!this._wordAt || g.frame - this._wordAt > 30) { this._wordAt = g.frame; g.fx.word(this.x, this.y, 150, false, 'BLOCK!'); }
      if (this.blocks >= 3) { this.blocks = 0; this.releaseToken(); this.reset('guardBreak'); g.fx.word(this.x, this.y, 170, true, 'SHIELD BREAK!'); audio.sfx('hit_heavy', { pitch: 0.7 }); }
      g.engage(this);
      return true;
    }
    return super.takeHit(att, hd);
  }
  update() {
    const g = this.game, p = this.player;
    this.tick();
    if (this.cool > 0) this.cool--;
    if (this.blockWindow > 0 && --this.blockWindow === 0) this.blocks = 0;
    switch (this.state) {
      case 'approach': case 'wait': {
        if (!p.alive || p.down) { this.moveTo(this.standX(p, 200), p.y, 1); this.set(this.vx || this.vy ? 'approach' : 'wait'); break; }
        const dist = Math.abs(p.x - this.x), dy = Math.abs(p.y - this.y);
        if (this.cool <= 0 && this.entered && dy < 18 && this.takeToken()) {
          this.face(p);
          if (dist < 95) { this.windup('bashWind'); break; }
          if (dist < 170) { this.windup('thrustWind'); break; }
          this.releaseToken();
        }
        if (this.moveTo(this.standX(p, 130), p.y + (this.cool > 30 ? this.yOff : 0), 1.05)) { this.set('wait'); this.face(p); }
        else { this.set('approach'); this.ph = (this.ph + 0.02) % 1; this.face(p); }
        this.separate();
        break;
      }
      case 'block': this.vx *= 0.8; if (this.st >= 12) this.set('wait'); break;
      case 'bashWind': if (this.st >= 20) { this.set('bash'); this.hitDone = false; audio.sfx('shield_bash'); } break;
      case 'bash':
        this.vx = this.st < 8 ? this.facing * 3 : 0;
        if (!this.hitDone && this.st >= 6 && this.st <= 11) this.tryHit({ x0: 10, x1: 130, z0: 20, z1: 170, dy: 18 }, { dmg: 10, kind: 'knock', push: 6, lift: 5, stop: 6, sfx: 'shield_bash' });
        if (this.st >= 22) this.endAttack(90, 140);
        break;
      case 'thrustWind': if (this.st >= 26) { this.set('thrust'); this.hitDone = false; audio.sfx('swing_heavy', { pitch: 1.1 }); } break;
      case 'thrust':
        if (!this.hitDone && this.st >= 7 && this.st <= 13) this.tryHit({ x0: 40, x1: 196, z0: 40, z1: 150, dy: 16 }, { dmg: 12, kind: 'light', push: 4, stun: 22, stop: 5, sfx: 'hit_heavy' });
        if (this.st >= 24) this.endAttack(90, 140);
        break;
      case 'guardBreak': this.vx *= 0.85; if (this.st >= 40) { this.set('wait'); this.cool = 30; } break;
      case 'hurt': this.vx *= 0.8; if (this.st >= this.stun) this.set('wait'); break;
      case 'fly': this.flyUpdate(); break;
      case 'down': this.downUpdate(44); break;
      case 'getup': if (this.st >= 32) { this.set('wait'); this.cool = 40; this.inv = 20; } break;
      case 'dying': this.dyingUpdate(); break;
    }
    this.integrate();
  }
  tryHit(box, hd) { if (this.hitHeroes(boxOf(this, box), hd)) this.hitDone = true; }
  endAttack(c0, c1) { this.releaseToken(); this.cool = rnd(c0, c1); this.set('wait'); }
  pose() {
    const g = this.game;
    switch (this.state) {
      case 'approach': return this.anim('walk', this.ph);
      case 'wait': return this.anim('guard', g.time + this.ph * 3);
      case 'block': return this.anim('block', Math.min(1, this.st / 12));
      case 'bashWind': return this.anim('bashWind', Math.min(1, this.st / 20));
      case 'bash': return this.anim('bash', Math.min(1, this.st / 22));
      case 'thrustWind': return this.anim('thrustWind', Math.min(1, this.st / 26));
      case 'thrust': return this.anim('thrust', Math.min(1, this.st / 24));
      case 'guardBreak': return this.anim('guardBreak', Math.min(1, this.st / 40));
      case 'hurt': return this.anim((this.hitN || 0) % 2 ? 'hurt2' : 'hurt', Math.min(1, this.st / this.stun));
      case 'fly': return this.anim('fly');
      case 'down': case 'dying': return this.anim('down');
      case 'getup': return this.anim('getup', Math.min(1, this.st / 32));
      default: return this.anim('idle', g.time);
    }
  }
}

// ==================================================================================================== bosses
class Boss extends Enemy {
  get flashAlpha() { return softBossFlash(this); }   // (Magmaw / Tempest / the Dragon King: the soft boss flash -- src/enemies.js)
  constructor(game, x, y, name) {
    super(game, x, y, { name });
    this.entered = true; this.heavy = true; this.collared = true;
    this.phase = 1; this.poise = 3; this.cool = 60; this.facing = -1;
    this.score = 15000;
  }
  get boss() { return true; }
  get freedNow() { return this.state === 'freed'; }
  get inFight() { return this.game.fighting && !this.game.cut; }
  /** bosses never go flying: a big hit makes them stagger */
  knock() { if (this.alive && this.inFight) { this.releaseToken(); this.reset('stagger'); } }
  get speedMul() { return this.phase === 2 ? 0.75 : 1; }
  defeat() {
    const g = this.game;
    this.releaseToken();
    this.vx = this.vy = 0;
    this.reset('defeated');
    this.alive = false;
    g.onBossDefeated(this);
  }
  defeatedUpdate(len = 100, crackK = 0.5, shatterK = 1) {
    const g = this.game;
    if (this.st === Math.round(len * crackK)) { g.fx.spark(this.x, this.y, this.collarZ || 180, true, 'green'); audio.sfx('collar_crack'); }
    if (this.st > len && this.state === 'defeated') { this.set('freed'); return; }
    if (this.st === Math.round(len * shatterK)) {
      g.fx.spark(this.x, this.y, this.collarZ || 180, true, 'green');
      g.fx.hearts(this.x, this.y, (this.collarZ || 180) - 30, 12);
      g.fx.debris(this.x, this.y, this.collarZ || 180, ['#2a2c33', '#45d36a', '#3a3d46'], 10);
      g.fx.label(this.x, this.y, (this.collarZ || 180) + 80, 'FREED!', '#9dff8a', 48, 90);
      audio.jingle('freed_big'); g.flashScreen = 0.5; g.flashAt = { x: this.x, y: this.y, z: this.collarZ || 180 };
      if (shatterK >= 1) this.set('freed');
    }
  }
  /** shared: big hits chip poise; at 0 the boss staggers (vulnerable) */
  bossTakeHit(att, hd, armored) {
    const g = this.game;
    this.hp -= hd.dmg * (this.state === 'stagger' || this.state === 'grounded' ? 1.4 : 1); this.flash = 6;
    g.engage(this); if (!hd.quiet) this.onHurtSfx();
    if (this.hp <= 0) { this.hp = 0; this.defeat(); return true; }
    if (this.phase === 1 && this.hp < this.maxHp * 0.5) { this.phase = 2; this.releaseToken(); this.onPhase2(); return true; }
    if (hd.kind === 'knock' && !armored && --this.poise <= 0) { this.poise = 3; this.releaseToken(); this.reset('stagger'); this.vx = 0; }
    return true;
  }
  onPhase2() {}
  hurtPlayers(test, hd) {
    for (const p of this.game.players) if (p.hittable && test(p)) { if (!this.hitSetB || !this.hitSetB.has(p)) { this.hitSetB?.add(p); p.takeHit(this, hd); } }
  }
  drawOpts() { return { ...super.drawOpts(), cursed: this.state !== 'freed' }; }
}

// --------------------------------------------------------------------------------------------------- MAGMAW
export class Magmaw extends Boss {
  constructor(game, x, y, def = {}) {
    super(game, x, y, 'MAGMAW');
    this.art = 'magmaw';
    this.pools = (def.pools || [[x - 270, 50], [x, 110], [x + 280, 45]]).map(([px, py]) => ({ x: px, y: py }));
    this.pool = 1; this.x = this.pools[1].x; this.y = this.pools[1].y;
    this.hp = this.maxHp = 340;
    this.w = 56; this.h = 230; this.depthR = 14;
    this.shadowR = 0; this.balloonH = 300; this.collarZ = 200; this.talkGap = 280;
    this.taken = 0; this.attacks = 0;
    // CRYSTAL MAGMAW (the Crystal Deep's mini-boss, docs/SECRETS.md): lighter (260 hp), in a crystal lake; his painted
    // look has the light clip set only, so he bites, dives and resurfaces -- no roar, breath or slam (a stagger is his
    // hurt, his defeat the fall) -- and calls two crystal kobolds at half health.  Washed from the lava Magmaw's atlas
    // until his own is in (src/chars/magmaw3d.js CRYSTAL_ART).
    this.crystal = !!def.crystal;
    if (this.crystal) {
      this.name = 'CRYSTAL MAGMAW'; this.hp = this.maxHp = 260;
      if (!CHARS.magmaw?.CRYSTAL_ART) this.wash = TINT_VARIANTS.crystal.wash;
    }
    this.set('submerged');
  }
  /** (the crystal look: its own poses, the clips its atlas has) */
  anim(key, arg) {
    if (!this.crystal || !CHARS.magmaw?.ANIM_CRYSTAL) return super.anim(key, arg);
    const A = CHARS.magmaw.ANIM_CRYSTAL;
    const f = A[key] !== undefined ? A[key] : A.idle;
    if (f === undefined) return {};
    return typeof f === 'function' ? f(arg ?? this.game.time) : f;
  }
  drawOpts() { return { ...super.drawOpts(), variant: this.crystal ? 'crystal' : undefined }; }
  get hittable() { return this.alive && this.inv <= 0 && this.inFight && !['submerged', 'emerge', 'dive', 'defeated', 'freed', 'roar'].includes(this.state); }
  get armored() { return this.state !== 'stagger'; }
  get sortY() { return this.y - 30; }
  /** staggered, the head lies on the floor in front of the pool: that's what you hit */
  get postBox() { return this.state === 'stagger' ? { x: this.x + this.facing * 140, y: this.y, z: 0, w: 140, h: 120, depthR: this.depthR } : null; }
  bossIntro() { this.reset('emerge'); audio.sfx('wyrm_emerge'); this.introRoar = !this.crystal; }
  bossFight() { this.set('idle'); this.cool = 40; }
  takeHit(att, hd) {
    if (!this.hittable) return false;
    this.taken += hd.dmg;
    const r = this.bossTakeHit(att, hd, true);
    if (this.alive && this.state !== 'stagger' && this.taken > 70) { this.taken = 0; this.releaseToken(); this.reset('stagger'); }
    return r;
  }
  onPhase2() {
    if (this.crystal) {   // (no roar in his clips: he dives, and two crystal kobolds come running)
      this.attacks = 0; this.reset('dive'); audio.sfx('wyrm_emerge', { pitch: 0.8 });
      this.game.spawn({ k: 'kobold', v: 'crystal', side: 'L', y: 40 }); this.game.spawn({ k: 'kobold', v: 'crystal', side: 'R', y: 110 });
      return;
    }
    this.reset('roar'); audio.sfx('roar', { pitch: 0.7 }); this.game.spawn({ k: 'salamander', side: 'L', y: 40 }); this.game.spawn({ k: 'salamander', side: 'R', y: 110 });
  }
  nearestPlayer() { return this.player; }
  update() {
    const g = this.game, p = this.player, M = this.speedMul;
    this.tick();
    if (this.cool > 0) this.cool--;
    // lava pools burn anyone standing in them
    if (g.frame % 20 === 0) for (const q of this.pools) for (const pl of g.players) {
      if (pl.hittable && pl.z < 8 && Math.hypot((pl.x - q.x) / 70, (pl.y - q.y) / 22) < 1) pl.takeHit({ x: q.x, team: 'hazard', facing: 1 }, { dmg: 6, kind: 'light', push: 4, stun: 12, stop: 2, sfx: 'hit_light', spark: 'warm' });
    }
    if (this.state !== 'submerged' && this.state !== 'dive' && Math.abs(p.x - this.x) > 20) this.facing = p.x > this.x ? 1 : -1;
    switch (this.state) {
      case 'submerged':
        if (this.travel && this.st >= 40) { this.travel = false; this.reset('emerge'); audio.sfx('wyrm_emerge'); }
        break;
      case 'emerge':
        if (this.st === 8) {
          if (this.crystal) g.fx.debris(this.x, this.y, 30, ['#5ff0e0', '#9a6ce0', '#e8fffc'], 12);   // (a splash of crystal water)
          else g.fx.flames(this.x, this.y, 10, 12, { vz: 4, scale: 1.3 });
          g.shake = Math.max(g.shake, 6);
        }
        if (this.st >= 40) { if (this.introRoar) { this.introRoar = false; this.reset('roar'); } else { this.set('idle'); this.cool = rnd(30, 60) * M; } }
        break;
      case 'roar': if (this.st === 6) { audio.sfx('roar', { pitch: 0.65 }); g.shake = Math.max(g.shake, 10); } if (this.st >= 70) this.set(g.cut ? 'roar' : 'idle'); break;
      case 'idle':
        if (this.crystal && !this.inFight) break;   // (the boss card: he waits)
        if (this.cool <= 0 && this.takeToken(3)) {
          const dist = Math.abs(p.x - this.x), dy = Math.abs(p.y - this.y);
          // (the crystal one: a bite in reach, else he dives for the pool nearest a hero)
          if (this.attacks >= 3 || (this.crystal && !(dist < 300 && dy < 34))) { this.attacks = 0; this.releaseToken(); this.reset('dive'); audio.sfx('wyrm_emerge', { pitch: 0.8 }); break; }
          this.attacks++;
          if (this.crystal) { this.windup('biteWind'); break; }
          if (dist < 200 && dy < 40) this.windup('slamWind');
          else if (dist < 300 && dy < 34) this.windup('biteWind');
          else this.windup('breathWind');
        }
        break;
      case 'biteWind': if (this.st >= Math.max(28, 24 * M)) { this.reset('bite'); this.hitSetB = new Set(); audio.sfx('swing_heavy', { pitch: 0.6 }); } break;
      case 'bite': {
        const reach = CHARS.magmaw?.BITE_REACH || 260;
        if (this.st >= 8 && this.st <= 15) this.hurtPlayers((pl) => (pl.x - this.x) * this.facing > 30 && (pl.x - this.x) * this.facing < reach && Math.abs(pl.y - this.y) < 30 && pl.z < 140,
          { dmg: 14, kind: 'knock', push: 7, lift: 6, stop: 8, sfx: 'hit_heavy' });
        if (this.st >= 30) this.endAttack(40, 70);
        break;
      }
      case 'slamWind': if (this.st >= Math.max(30, 30 * M)) { this.reset('slam'); this.hitSetB = new Set(); } break;
      case 'slam':
        if (this.st === 13) { g.shake = Math.max(g.shake, 14); audio.sfx('stomp'); g.fx.dust(this.x + this.facing * 150, this.y, 10, 120); g.fx.flames(this.x + this.facing * 150, this.y, 0, 10, { scale: 1.2 }); }
        if (this.st >= 13 && this.st <= 18) this.hurtPlayers((pl) => (pl.x - this.x) * this.facing > -20 && (pl.x - this.x) * this.facing < 310 && Math.abs(pl.y - this.y) < 40 && pl.z < 40,
          { dmg: 16, kind: 'knock', push: 6, lift: 7, stop: 8, sfx: 'hit_heavy' });
        if (this.st >= 34) { this.releaseToken(); this.reset('stagger'); this.short = true; }
        break;
      case 'breathWind':
        if (this.st % 4 === 0) g.fx.glow(this.x + this.facing * 60, this.y, 200, 50, 10);
        if (this.st >= 36 * M) { this.reset('breath'); this.burned = new Map(); audio.sfx('fire_breath'); }
        break;
      case 'breath': this.breathe(); break;
      case 'dive':
        if (this.st >= 30) {
          // swim to the pool nearest a hero (not this one)
          const opts = this.pools.map((q, i) => ({ i, d: Math.abs(q.x - p.x) + Math.abs(q.y - p.y) })).filter((o) => o.i !== this.pool).sort((a, b) => a.d - b.d);
          this.pool = opts[Math.random() < 0.75 ? 0 : opts.length - 1].i;
          this.x = this.pools[this.pool].x; this.y = this.pools[this.pool].y;
          this.travel = true; this.reset('submerged');
        }
        break;
      case 'stagger': if (this.st >= (this.short ? 70 : 150)) { this.short = false; this.set('idle'); this.cool = 30; } break;
      case 'defeated': this.defeatedUpdate(100, 0.4, 0.88); break;
      case 'freed': break;
    }
  }
  breathe() {
    const g = this.game, dur = 70;
    const k = this.st / dur;
    const sweep = -0.4 + k * 0.8;   // the head sweeps the stream across the floor
    const len = 120 + 260 * Math.min(1, k * 3);
    const BM = CHARS.magmaw?.BREATH_MOUTH || [90, -170];
    const fx0 = this.x + this.facing * BM[0], fy = clamp(this.y + sweep * 120, 4, DEPTH - 4);
    for (let i = 0; i < 3; i++) {
      const u = Math.random();
      g.fx.flames(fx0 + this.facing * len * u, this.y + (fy - this.y) * u + rnd(-8, 8), -BM[1] * Math.pow(1 - u, 1.5), 1, { vx: this.facing * 1.5, scale: 0.9 + u });
    }
    if (this.st % 3 === 0) g.fx.flames(fx0 + this.facing * len * Math.random(), fy + rnd(-12, 12), 0, 1, { scale: 1.2 });
    for (const pl of g.players) {
      if (!pl.hittable) continue;
      const ux = (pl.x - fx0) * this.facing;
      if (ux < 0 || ux > len) continue;
      const lineY = this.y + (fy - this.y) * (ux / len);
      if (Math.abs(pl.y - lineY) > 26 || pl.z > 46) continue;
      const last = this.burned.get(pl) ?? -99;
      if (this.st - last >= 16) { this.burned.set(pl, this.st); pl.takeHit(this, { dmg: 6, kind: 'light', push: 3, stun: 14, stop: 3, sfx: 'fire_small', spark: 'warm' }); }
    }
    if (this.st % 18 === 0) g.addHazard({ kind: 'fire', x: fx0 + this.facing * len * 0.7, y: fy, r: 30, life: 90, dmg: 5 });
    if (this.st >= dur) this.endAttack(50, 80);
  }
  endAttack(c0, c1) { this.releaseToken(); this.cool = rnd(c0, c1) * this.speedMul; this.set('idle'); }
  drawFloor(ctx) {
    const art = CHARS.magmaw, t = this.game.time;
    for (const q of this.pools) {
      const sx = q.x - this.game.camX, sy = FLOOR_TOP + q.y;
      if (sx < -200 || sx > W + 200) continue;
      ctx.save(); ctx.translate(sx, sy);
      if (art?.drawPool) art.drawPool(ctx, t, q === this.pools[this.pool] && this.state !== 'submerged' ? 1 : 0.4, 1, this.crystal ? 'crystal' : null);
      else { ctx.fillStyle = this.crystal ? '#5ff0e0' : '#ff7a1a'; ctx.beginPath(); ctx.ellipse(0, 0, 75, 23, 0, 0, TAU); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke(); }
      ctx.restore();
    }
  }
  drawShadow() {}
  pose() {
    const g = this.game, M = this.speedMul;
    switch (this.state) {
      case 'submerged': return this.anim('submerged');
      case 'emerge': return this.anim('emerge', Math.min(1, this.st / 40));
      case 'roar': return this.anim('roar', g.time);
      case 'biteWind': return this.anim('biteWind', Math.min(1, this.st / Math.max(28, 24 * M)));
      case 'bite': return this.anim('bite', Math.min(1, this.st / 30));
      case 'slamWind': return this.anim('slamWind', Math.min(1, this.st / Math.max(30, 30 * M)));
      case 'slam': return this.anim('slam', Math.min(1, this.st / 34));
      case 'breathWind': return this.anim('breathWind', Math.min(1, this.st / (36 * M)));
      case 'breath': return this.anim('breath', Math.min(1, this.st / 70));
      case 'dive': return this.anim('dive', Math.min(1, this.st / 30));
      case 'stagger': return this.anim('stagger', Math.min(1, this.st / 40));
      case 'defeated': return this.anim('defeated', Math.min(1, this.st / 100));
      case 'freed': return this.crystal ? this.anim('defeated', 1) : this.anim('freed', g.time);   // (the crystal one: lies where he fell)
      default: return this.anim('idle', g.time);
    }
  }
}

// --------------------------------------------------------------------------------------------------- TEMPEST
// how high Tempest's head / horns reach above her floor point in a wind-up's drawings (game px, scale 1; the painted
// atlas: boltWind rears the head up to ~259, swoopWind lifts the horn tips to ~243, the roar the head to ~227).  At the
// back of the floor (small y) she climbs less, so they stay 20 px under the top of the screen (painted review; the roar:
// readtech N-5); the timing and hits are unchanged.
const TEMPEST_TOP = { boltWind: 255, swoopWind: 243, roar: 227 };
export class Tempest extends Boss {
  constructor(game, x, y) {
    super(game, x, y, 'TEMPEST');
    this.art = 'tempest';
    this.hp = this.maxHp = 320;
    this.w = 70; this.h = 96; this.hz0 = -10; this.depthR = 14;
    this.z = 170; this.flying = true;
    this.shadowR = 80; this.balloonH = 140; this.collarZ = 80; this.talkGap = 300;
    this.marks = []; this.attacks = 0; this.homeX = x;
    this.set('intro');
  }
  get hittable() { return this.alive && this.inv <= 0 && this.inFight && !['intro', 'defeated', 'freed', 'roar'].includes(this.state); }
  bossIntro() { this.reset('roar'); }
  bossFight() { this.set('hover'); this.cool = 60; }
  /** the highest z that keeps her head and horns 20 px below the top of the screen in this state (Infinity: no cap) */
  zCap(state = this.state) {
    const c = TEMPEST_TOP[state];
    return c === undefined ? Infinity : Math.max(0, FLOOR_TOP + this.y - 20 - c * (this.scale || 1));
  }
  takeHit(att, hd) {
    if (!this.hittable) return false;
    return this.bossTakeHit(att, hd, this.state !== 'grounded' && this.state !== 'stagger');
  }
  onPhase2() {
    this.reset('roar');
    this.game.spawn({ k: 'whelp', side: 'L', y: 40, v: 'storm' });
    this.game.spawn({ k: 'whelp', side: 'R', y: 110, v: 'storm' });
  }
  update() {
    const g = this.game, p = this.player, M = this.speedMul;
    this.tick();
    if (this.cool > 0) this.cool--;
    this.updateMarks();
    const bob = Math.sin(g.time * 1.6) * 10;
    switch (this.state) {
      case 'intro': this.x = this.homeX; this.z += (170 + bob - this.z) * 0.05; break;
      case 'roar': {
        const zc = this.zCap();                               // (the roar rears her head up: come down to keep it on screen)
        if (this.z > zc) this.z += (zc - this.z) * 0.15;
        if (this.st === 8) { audio.sfx('roar', { pitch: 1.1 }); g.shake = Math.max(g.shake, 8); } if (this.st >= 80) this.set(g.cut ? 'roar' : 'hover'); break;
      }
      case 'hover': {
        const tx = clamp(p.x + (this.x < p.x ? -220 : 220), g.camX + 140, g.camX + W - 140);
        this.vx = clamp((tx - this.x) * 0.03, -2.6, 2.6); this.vy = clamp((p.y - this.y) * 0.03, -1, 1);
        this.z += (165 + bob - this.z) * 0.06;
        this.face(p);
        if (this.cool <= 0 && this.takeToken(3)) {
          this.vx = this.vy = 0;
          if (this.attacks >= 3) { this.attacks = 0; this.reset('descend'); break; }
          this.attacks++;
          const r = Math.random();
          if (r < 0.45) { this.windup('swoopWind'); }
          else if (r < 0.8) { this.windup('boltWind'); }
          else this.windup('gustWind');
        }
        break;
      }
      case 'swoopWind': {
        // climb to one side of the screen, then dive across
        const sideX = p.x < g.camX + W / 2 ? g.camX + W - 100 : g.camX + 100;
        const zc = Math.min(210, this.zCap());                 // (settles fast when it has to come down)
        this.x += (sideX - this.x) * 0.08; this.z += (zc - this.z) * (this.z > zc ? 0.2 : 0.08); this.y += (p.y - this.y) * 0.05;
        this.facing = sideX > g.camX + W / 2 ? -1 : 1;
        if (this.st >= 30 * M) { this.reset('swoop'); this.swTop = zc; this.hitSetB = new Set(); audio.sfx('swing_heavy', { pitch: 0.6 }); }
        break;
      }
      case 'swoop': {
        this.vx = this.facing * 9.5; this.vy = clamp((p.y - this.y) * 0.03, -0.8, 0.8);
        const u = Math.min(1, this.st / 70), dip = Math.pow(Math.abs(u * 2 - 1), 1.8);
        this.z = 36 + (Math.max(36, this.swTop ?? 210) - 36) * dip;   // (from the wind-up's height: no pop)
        const zHit = 36 + (210 - 36) * dip;                   // (the hit window keeps the full arc's timing)
        this.hurtPlayers((pl) => Math.abs(pl.x - this.x) < 70 && Math.abs(pl.y - this.y) < 26 && zHit < pl.z + 130, { dmg: 14, kind: 'knock', push: 7, lift: 6, stop: 7, sfx: 'hit_heavy' });
        const edge = this.facing > 0 ? this.x > g.camX + W - 60 : this.x < g.camX + 60;
        if (this.st >= 70 || (edge && this.st > 20)) this.endAttack(70, 110);
        break;
      }
      case 'boltWind': {
        const zc = Math.min(190, this.zCap());               // (her head rears up from ~st 15: settle before that)
        this.z += (zc - this.z) * (this.z > zc ? 0.2 : 0.05);
        if (this.st === 10) audio.sfx('charge', { pitch: 1.4 });
        if (this.st >= 40 * M) {
          for (const pl of g.players.filter((q) => !q.out)) this.marks.push({ x: pl.x, y: pl.y, t: 0 });
          for (let i = 0; i < (this.phase === 2 ? 4 : 2); i++) this.marks.push({ x: g.camX + rnd(120, W - 120), y: rnd(10, DEPTH - 10), t: -i * 12 });
          this.endAttack(80, 120);
        }
        break;
      }
      case 'gustWind': this.z += (150 - this.z) * 0.05; if (this.st >= 30 * M) { this.reset('gust'); audio.sfx('wind_gust'); g.stage.windGust?.(1); } break;
      case 'gust':
        for (const pl of g.players) if (!pl.out && pl.state !== 'special') pl.x += Math.sign(pl.x - this.x || 1) * 2.8;
        if (this.st % 3 === 0) g.fx.add({ type: 'wind', x: this.x, y: rnd(0, DEPTH), z: rnd(10, 200), vx: this.facing * rnd(10, 14), life: 60, len: rnd(40, 90) });
        if (this.st >= 50) this.endAttack(40, 80);
        break;
      case 'descend':
        // glide down to just above the floor, then the landing animation takes over
        this.z = Math.max(50, this.z - 5);
        this.x += (clamp(this.x, g.camX + 200, g.camX + W - 200) - this.x) * 0.1;
        if (this.z <= 50) { this.reset('landing'); this.z0 = this.z; }
        break;
      case 'landing':
        this.z = Math.max(0, this.z0 * (1 - this.st / 10.5));   // feet down by k .35 of 30 frames
        if (this.st === 11) { g.shake = Math.max(g.shake, 10); audio.sfx('stomp'); g.fx.dust(this.x, this.y, 10, 90); }
        if (this.st >= 30) { this.reset('grounded'); this.releaseToken(); }
        break;
      case 'grounded': this.vx = this.vy = 0; this.z = 0; if (this.st >= 200) this.reset('takeoff'); break;
      case 'takeoff': if (this.st > 10) this.z += 7; if (this.st >= 30) { this.set('hover'); this.cool = 50; } break;
      case 'stagger': this.z = Math.max(0, this.z - 6); if (this.st >= 60) this.set(this.z <= 0 ? 'grounded' : 'hover'); break;
      case 'defeated':
        if (this.z0d === undefined) this.z0d = this.z;
        this.z = Math.max(0, this.z0d * (1 - this.st / 30));   // down by k .3
        this.defeatedUpdate(100, 0.44, 0.78);
        break;
      case 'freed': this.z += (40 + bob - this.z) * 0.05; break;
    }
    this.x += this.vx; this.y = clamp(this.y + this.vy, 8, DEPTH - 8);
    if (!['swoop', 'swoopWind', 'intro'].includes(this.state)) this.x = clamp(this.x, g.camX + 80, g.camX + W - 80);
  }
  endAttack(c0, c1) { this.releaseToken(); this.cool = rnd(c0, c1) * this.speedMul; this.set('hover'); if (this.player) this.face(this.player); }   // (RC: facing the hero on the frame the swoop ends -- hover's own face() came a frame later: one drawing still facing the old way, then the flip, at every swoop exit)
  updateMarks() {
    const g = this.game;
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i];
      m.t++;
      if (m.t === 50) {
        g.fx.add({ type: 'bolt', x: m.x, y: m.y, z: 0, life: 14 });
        g.shake = Math.max(g.shake, 6); audio.sfx('lightning');
        for (const pl of g.players) if (pl.hittable && Math.hypot((pl.x - m.x) / 48, (pl.y - m.y) / 18) < 1) pl.takeHit({ x: m.x, team: 'hazard', facing: 1 }, { dmg: 14, kind: 'knock', push: 4, lift: 7, stop: 6, sfx: 'hit_heavy', spark: 'cool' });
        for (const t of g.actors) if (t.team === 'foe' && !t.boss && t.hittable && Math.hypot((t.x - m.x) / 48, (t.y - m.y) / 18) < 1) t.takeHit({ x: m.x, facing: 1 }, { dmg: 20, kind: 'knock', push: 4, lift: 6 });
      }
      if (m.t > 60) this.marks.splice(i, 1);
    }
  }
  drawFloor(ctx) {
    for (const m of this.marks) {
      if (m.t < 0) continue;
      const sx = m.x - this.game.camX, sy = FLOOR_TOP + m.y, k = Math.min(1, m.t / 50);
      ctx.save();
      ctx.fillStyle = `rgba(150,210,255,${0.12 + 0.25 * k})`; ctx.beginPath(); ctx.ellipse(sx, sy, 48, 18, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(220,240,255,${0.5 + 0.5 * Math.abs(Math.sin(m.t * 0.4))})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(sx, sy, 48 * (1.2 - 0.2 * k), 18 * (1.2 - 0.2 * k), 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }
  pose() {
    const g = this.game, M = this.speedMul;
    switch (this.state) {
      case 'roar': return this.anim('roar', g.time);
      case 'swoopWind': return this.anim('swoopWind', Math.min(1, this.st / (30 * M)));
      case 'swoop': return this.anim('swoop', g.time);
      case 'boltWind': return this.anim('boltWind', Math.min(1, this.st / (40 * M)));
      case 'gustWind': return this.anim('gustWind', Math.min(1, this.st / (30 * M)));
      case 'gust': return this.anim('gust', Math.min(1, this.st / 50));
      case 'descend': return this.anim('hover', g.time);
      case 'landing': return this.anim('landing', Math.min(1, this.st / 30));
      case 'grounded': return this.anim('grounded', g.time);
      case 'takeoff': return this.anim('takeoff', Math.min(1, this.st / 30));
      case 'stagger': return this.anim('stagger', Math.min(1, this.st / 60));
      case 'defeated': return this.anim('defeated', Math.min(1, this.st / 100));
      case 'freed': return this.anim('freed', g.time);
      default: return this.anim('hover', g.time);
    }
  }
}

// --------------------------------------------------------------------------------------------------- THE DRAGON KING
// The King's crown and face stay on-screen (a 20 px top margin) at any depth: in the air states his height z is capped
// by how high the crown sits above his feet in that state's drawings (game px, scale 1; the 3D atlas' crown landmark,
// the code rig within a few px).  At the back of the floor (small y) he hovers lower; the dive keeps its timing.
const KING_CROWN = { hover: 280, landing: 280, flyUp: 284, diveWind: 314 };   // (the rig's crown sits ~15 px higher in hover)
export class DragonKing extends Boss {
  constructor(game, x, y) {
    super(game, x, y, 'THE DRAGON KING');
    this.art = 'dragonking';
    this.hp = this.maxHp = 520;
    this.w = 70; this.h = 290; this.collared = false;
    this.shadowR = 90; this.balloonH = 360; this.talkGap = 200;
    this.throneX = x; this.summoned = 0; this.tiny = false;
    this.set('throne');
  }
  get hittable() { return this.alive && this.inv <= 0 && this.inFight && !['throne', 'throneRise', 'defeated', 'freed', 'roar', 'summon', 'flyUp', 'crownCrack'].includes(this.state); }
  get armored() { return /Wind$|^claw$|^breath$|^stomp$|^dive|^hover$/.test(this.state); }
  get freedNow() { return this.state === 'freed'; }
  get postBox() {
    const A = CHARS.dragonking; if (!A?.HURTBOX) return null;
    const air = ['flyUp', 'hover', 'diveWind', 'dive', 'landing'].includes(this.state);
    const hb = this.tiny ? A.TINY_HURTBOX : air ? A.HURTBOX_AIR : A.HURTBOX;
    return { x: this.x + this.facing * hb.x, y: this.y, z: this.z - (hb.y0 || 0), w: hb.w / 2, h: hb.h, depthR: this.depthR || 0 };
  }
  bossIntro() { this.introT = 0; }
  bossFight() { this.reset('throneRise'); }
  /** the highest z that keeps the crown 20 px below the top of the screen in this state (Infinity: no cap) */
  zCap(state = this.state) {
    const c = KING_CROWN[state];
    return c === undefined ? Infinity : Math.max(0, FLOOR_TOP + this.y - 20 - c * (this.scale || 1));
  }
  takeHit(att, hd) {
    if (!this.hittable) return false;
    const r = this.bossTakeHit(att, hd, this.armored);
    if (this.alive && this.summoned === 0 && this.hp < this.maxHp * 0.7) { this.summoned = 1; this.releaseToken(); this.reset('summon'); }
    return r;
  }
  onPhase2() { this.reset('flyUp'); this.dives = 0; audio.sfx('king_laugh'); this.game.say?.(this, 'Enough! Now you\nface me in the SKY!', 140, { villain: true }); }
  defeat() {
    const g = this.game;
    this.releaseToken(); this.vx = this.vy = 0; this.z = 0;
    this.reset('crownCrack'); this.alive = false;
    g.onBossDefeated(this);
  }
  update() {
    const g = this.game, p = this.player, M = this.speedMul;
    this.tick();
    if (this.cool > 0) this.cool--;
    this.crack = Math.min(1, Math.max(this.crack || 0, 1 - this.hp / this.maxHp));
    const notAir = !['flyUp', 'hover', 'diveWind', 'dive', 'landing'].includes(this.state);
    switch (this.state) {
      case 'throne': break;
      case 'throneRise': if (this.st === 10) audio.sfx('king_laugh'); if (this.st >= 50) { this.set('idle'); this.cool = 40; } break;
      case 'idle': case 'walk': {
        this.face(p);
        const dist = Math.abs(p.x - this.x), dy = Math.abs(p.y - this.y);
        if (this.cool <= 0 && this.takeToken(3)) {
          if (dist < 190 && dy < 30) { this.windup('clawWind'); break; }
          const r = Math.random();
          if (r < 0.45) { this.windup('breathWind'); break; }
          if (r < 0.8) { this.windup('stompWind'); break; }
          this.releaseToken();
        }
        if (this.moveTo(p.x - Math.sign(p.x - this.x || 1) * 160, p.y, 1.1 / M, 0.8)) this.set('idle');
        else { this.set('walk'); this.ph = (this.ph + Math.hypot(this.vx, this.vy) / (CHARS.dragonking?.WALK_STRIDE || 68.75)) % 1; }   // stride-matched: no skate at either phase's speed
        break;
      }
      case 'clawWind': if (this.st >= Math.max(28, 26 * M)) { this.reset('claw'); this.hitSetB = new Set(); audio.sfx('swing_heavy', { pitch: 0.55 }); } break;
      case 'claw':
        if (this.st >= 8 && this.st <= 14) this.hurtPlayers((pl) => (pl.x - this.x) * this.facing > -30 && (pl.x - this.x) * this.facing < 220 && Math.abs(pl.y - this.y) < 30 && pl.z < 180, { dmg: 15, kind: 'knock', push: 7, lift: 7, stop: 8, sfx: 'hit_heavy' });
        if (this.st >= 26) this.endAttack(60, 100);
        break;
      case 'breathWind':
        this.vy = clamp((p.y - this.y) * 0.05, -0.8, 0.8);
        if (this.st % 4 === 0) g.fx.glow(this.x + this.facing * 70, this.y, 250, 60, 10, true);
        if (this.st >= 40 * M) { this.reset('breath'); this.burned = new Map(); audio.sfx('fire_breath'); this.vy = 0; }
        break;
      case 'breath': this.breathe(); break;
      case 'stompWind': if (this.st >= 30 * M) { this.reset('stomp'); this.shockHit = new Set(); } break;
      case 'stomp':
        const sx0 = this.x + this.facing * (CHARS.dragonking?.STOMP_POINT?.[0] || 0);
        if (this.st === 12) { g.shake = Math.max(g.shake, 14); audio.sfx('stomp'); g.fx.ring(sx0, this.y, { rx: 380, ry: 140, shock: true, green: true, life: 30 }); g.fx.dust(sx0, this.y, 10, 90); }
        if (this.st >= 14 && this.st <= 34) {
          const r = 100 + (this.st - 14) * 14;
          for (const pl of g.players) {
            if (!pl.hittable || pl.z > 10 || this.shockHit.has(pl)) continue;
            const d = Math.hypot((pl.x - sx0) / r, (pl.y - this.y) / (r * 0.37));
            if (d > 0.8 && d < 1.12) { this.shockHit.add(pl); pl.takeHit(this, { dmg: 12, kind: 'knock', push: 5, lift: 5, stop: 5, sfx: 'hit_heavy', spark: 'green' }); }
          }
        }
        if (this.st >= 40) this.endAttack(60, 100);
        break;
      case 'summon':
        if (this.st === 20) {
          audio.sfx('king_laugh');
          g.spawn({ k: 'guard', side: 'L', y: 40 }); g.spawn({ k: 'kobold', side: 'R', y: 110, v: 'shaman' });
        }
        if (this.st >= 50) { this.set('idle'); this.cool = 60; }
        break;
      case 'flyUp': if (this.st >= 14) this.z += (170 - this.z) * 0.1; if (this.st >= 40) { this.set('hover'); this.cool = 40; } break;
      case 'hover': {
        const tx = clamp(p.x + (this.x < p.x ? -260 : 260), g.camX + 160, g.camX + W - 160);
        this.vx = clamp((tx - this.x) * 0.03, -2.4, 2.4); this.vy = clamp((p.y - this.y) * 0.03, -1, 1);
        this.z += (170 + Math.sin(g.time * 1.5) * 10 - this.z) * 0.06;
        this.face(p);
        if (this.cool <= 0 && this.takeToken(3)) {
          if (this.dives >= 2) { this.dives = 0; this.reset('landing'); this.vx = this.vy = 0; break; }
          this.dives++; this.windup('diveWind'); this.vx = this.vy = 0;
        }
        break;
      }
      case 'diveWind': {
        const sideX = p.x < g.camX + W / 2 ? g.camX + W - 120 : g.camX + 120;
        this.x += (sideX - this.x) * 0.08; this.z += (220 - this.z) * 0.08; this.y += (p.y - this.y) * 0.05;
        this.facing = sideX > g.camX + W / 2 ? -1 : 1;
        if (this.st >= 30) { this.reset('dive'); this.diveTop = this.z; this.hitSetB = new Set(); audio.sfx('swing_heavy', { pitch: 0.5 }); }
        break;
      }
      case 'dive': {
        this.vx = this.facing * 9; const u = Math.min(1, this.st / 70);
        // the dive's curve times its hit window as it always has; he's drawn on it from the (capped) wind-up height down
        const zHit = 40 + (220 - 40) * Math.pow(Math.abs(u * 2 - 1), 1.8);
        this.z = Math.min(zHit, this.diveTop ?? 220);
        if (this.st % 3 === 0) g.fx.flames(this.x - this.facing * 40, this.y, this.z + 60, 1, { green: true, scale: 1.1 });
        this.hurtPlayers((pl) => Math.abs(pl.x - this.x) < 80 && Math.abs(pl.y - this.y) < 28 && zHit < pl.z + 140, { dmg: 15, kind: 'knock', push: 7, lift: 6, stop: 7, sfx: 'hit_heavy' });
        const edge = this.facing > 0 ? this.x > g.camX + W - 60 : this.x < g.camX + 60;
        if (this.st >= 70 || (edge && this.st > 20)) this.endAttack(50, 80, 'hover');
        break;
      }
      case 'landing':
        this.z = Math.max(0, this.z - 7);
        if (this.z <= 0) { this.reset('stomp'); this.shockHit = new Set(); this.st = 11; }
        break;
      case 'stagger': this.z = Math.max(0, this.z - 6); if (this.st >= 70) this.set(this.phase === 2 && Math.random() < 0.5 ? 'flyUp' : 'idle'); break;
      case 'crownCrack':
        if (this.st % 10 === 0) {
          const cr = CHARS.dragonking?.crownOf?.(this.pose());   // sparks fly off the crown wherever the drawing puts it
          g.fx.spark(this.x + (cr ? this.facing * cr[0] : 0), this.y, cr ? -cr[1] : 330, false, 'green');
          audio.sfx('collar_crack', { pitch: 1 + this.st / 60 });
        }
        if (this.st >= 60) { this.reset('defeated'); audio.sfx('explosion'); g.shake = Math.max(g.shake, 10); }
        break;
      case 'defeated':
        if (this.st === 70) audio.sfx('poof', { pitch: 1.3 });
        if (this.st >= 120) { this.tiny = true; this.balloonH = 80; this.h = 60; this.w = 20; this.shadowR = 18; audio.sfx('tiny_squeak'); this.set('freed'); }
        break;
      case 'freed': break;
    }
    if (notAir && this.state !== 'defeated' && this.state !== 'crownCrack') this.z = Math.max(0, this.z - 6);
    this.x += this.vx; this.y = clamp(this.y + this.vy, 8, DEPTH - 8);
    if (KING_CROWN[this.state] !== undefined) this.z = Math.min(this.z, this.zCap());   // the crown stays on-screen
    if (!['dive', 'diveWind', 'throne', 'throneRise'].includes(this.state)) this.x = clamp(this.x, g.camX + 90, g.camX + W - 90);
  }
  breathe() {
    const g = this.game, dur = 80, k = this.st / dur;
    const mo = CHARS.dragonking?.mouthOf?.(this.pose()) || [120, -250, 0.6];
    const mx = this.x + this.facing * mo[0], mz = -mo[1] + this.z;
    const sweep = -0.6 + k * 1.2;
    const len = 380 * Math.min(1, k * 3);
    const fy = clamp(this.y + sweep * 140, 4, DEPTH - 4);
    for (let i = 0; i < 3; i++) {
      const u = Math.random();
      g.fx.flames(mx + this.facing * len * u, this.y + (fy - this.y) * u, mz * Math.pow(1 - u, 1.4), 1, { green: true, vx: this.facing * 1.5, scale: 0.9 + u * 1.1 });
    }
    for (const pl of g.players) {
      if (!pl.hittable) continue;
      const ux = (pl.x - mx) * this.facing;
      if (ux < 40 || ux > len) continue;
      const lineY = this.y + (fy - this.y) * (ux / Math.max(1, len));
      if (Math.abs(pl.y - lineY) > 28 || pl.z > 50) continue;
      const last = this.burned.get(pl) ?? -99;
      if (this.st - last >= 16) { this.burned.set(pl, this.st); pl.takeHit(this, { dmg: 7, kind: 'light', push: 3, stun: 14, stop: 3, sfx: 'fire_small', spark: 'green' }); }
    }
    if (this.st % 20 === 0) g.addHazard({ kind: 'fire', x: mx + this.facing * len * 0.7, y: fy, r: 34, life: 100, dmg: 6, green: true });
    if (this.st >= dur) this.endAttack(60, 100);
  }
  endAttack(c0, c1, next = 'idle') { this.releaseToken(); this.cool = rnd(c0, c1) * this.speedMul; this.set(next); }
  drawFloor(ctx) {
    const art = CHARS.dragonking;
    if (art?.drawThrone && (this.state === 'throne' || this.state === 'throneRise' || this.game.cut?.kind === 'boss')) {
      ctx.save(); ctx.translate(this.throneX - this.game.camX, FLOOR_TOP + this.y - 2); art.drawThrone(ctx, this.game.time); ctx.restore();
    }
  }
  pose() {
    const g = this.game, M = this.speedMul;
    if (this.tiny) return this.anim(this.talking ? 'tinyTalk' : 'tinyIdle', g.time);
    switch (this.state) {
      case 'throne': return this.anim('throne', g.time);
      case 'throneRise': return this.anim('throneRise', Math.min(1, this.st / 50));
      case 'walk': return this.anim('walk', this.ph);
      case 'clawWind': return this.anim('clawWind', Math.min(1, this.st / (26 * M)));
      case 'claw': return this.anim('claw', Math.min(1, this.st / 26));
      case 'breathWind': return this.anim('breathWind', Math.min(1, this.st / (40 * M)));
      case 'breath': return this.anim('breath', Math.min(1, this.st / 80));
      case 'stompWind': return this.anim('stompWind', Math.min(1, this.st / (30 * M)));
      case 'stomp': return this.anim('stomp', Math.min(1, this.st / 30));
      case 'summon': return this.anim('summon', Math.min(1, this.st / 50));
      case 'flyUp': return this.anim('flyUp', Math.min(1, this.st / 40));
      case 'hover': return this.anim('hover', g.time);
      case 'diveWind': return this.anim('diveWind', Math.min(1, this.st / 30));
      case 'dive': return this.anim('dive', g.time);
      case 'landing': return this.anim('hover', g.time);
      case 'stagger': return this.anim('stagger', Math.min(1, this.st / 50));
      case 'crownCrack': return this.anim('crownCrack', Math.min(1, this.st / 60));
      case 'defeated': return this.anim('defeated', Math.min(1, this.st / 120));
      default: return this.anim('idle', g.time);
    }
  }
  drawOpts() { return { ...super.drawOpts(), crack: this.crack || 0, tiny: this.tiny, cursed: true }; }
}
