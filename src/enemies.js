// Enemy behaviour: Scale-Snout kobolds, cursed whelps, the Drake Brute and the boss, Grimscale.
// Art modules live in src/chars/*.js and are loaded by main.js into CHARS (with stand-ins if one fails to load).
import { Actor, GRAV, boxOf, overlaps, Fireball } from './actors.js';
import { Bomb, ShamanFire, Spark } from './projectiles.js';
import { audio } from './audio-proxy.js';
import { drawWithFlash, drawTinted } from './render.js';
import { W, DEPTH, FLOOR_TOP } from './config.js';
import { clamp } from './rig.js';

import { CHARS } from './chars.js';
export { CHARS };
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];

export const NAMES = {
  green: ['SNIK', 'GREEB', 'ZAK', 'NIBBS', 'SKAB', 'TIK', 'GORP', 'FIZZ'],
  blue: ['SKREE', 'ZIP', 'SLINK', 'DART'],
  red: ['SARGE FLINT'],
  miner: ['PICKS', 'GRUBB', 'DIGBY', 'SOOT'],
  bomber: ['FUSE', 'KABOOMSKI', 'SPARKY'],
  shaman: ['HEX', 'OOGLE', 'SMOKEY'],
  brute: ['BIG GRONK', 'LUMPJAW', 'BOULDER'],
};

export class Enemy extends Actor {
  constructor(game, x, y, opt = {}) {
    super(game, x, y);
    this.team = 'foe';
    this.name = opt.name || 'ENEMY';
    this.cool = rnd(40, 90);
    this.ph = Math.random();
    this.token = false;
    this.entered = false;
    this.scale = opt.scale || 1;
    this.yOff = rnd(-12, 12);
    this.score = 500;
    this.mem = {};
  }
  /** the hero this enemy is after (nearest, kept for a while so it doesn't flip-flop) */
  get player() { return this.game.targetFor(this); }
  get busy() { return false; }

  // ---------------------------------------------------------------- attack tokens (limits simultaneous attackers)
  takeToken(max) {
    if (this.token) return true;
    if (this.game.frame < (this.game.holdUntil || 0)) { this.cool = rnd(10, 90); return false; }   // let the dialogue play out
    if (this.game.tokens >= (max ?? this.game.maxTokens)) return false;
    this.game.tokens++; this.token = true; return true;
  }
  releaseToken() { if (this.token) { this.token = false; this.game.tokens = Math.max(0, this.game.tokens - 1); } }

  face(p) { if (Math.abs(p.x - this.x) > 4) this.facing = p.x > this.x ? 1 : -1; }
  /** hit every hero inside the box (co-op: a swing doesn't pass through the other one) */
  hitHeroes(box, hd) {
    let any = false;
    for (const pl of this.game.players) if (pl.hittable && overlaps(box, pl)) { pl.takeHit(this, hd); any = true; }
    return any;
  }
  windup(state) { this.reset(state); this.vx = this.vy = 0; this.game.fx.alert(this); }
  /** Where to stand: beside the player, kept on screen; swap sides if the player hugs an edge. */
  standX(p, range) {
    const g = this.game;
    let side = this.x < p.x ? -1 : 1;
    const lo = g.camX + 50, hi = g.camX + W - 50;
    if (p.x + side * range < lo || p.x + side * range > hi) side = -side;
    return clamp(p.x + side * range, lo, hi);
  }

  /** Walk toward (tx, ty) at speed sp; returns true when there. */
  moveTo(tx, ty, sp, spy = sp * 0.7) {
    const dx = tx - this.x, dy = ty - this.y;
    this.vx = Math.abs(dx) > 4 ? Math.sign(dx) * Math.min(sp, Math.abs(dx)) : 0;
    this.vy = Math.abs(dy) > 3 ? Math.sign(dy) * Math.min(spy, Math.abs(dy)) : 0;
    return this.vx === 0 && this.vy === 0;
  }

  // keep enemies from stacking on the same spot
  separate() {
    for (const o of this.game.actors) {
      if (o === this || o.team !== 'foe' || !o.alive || o.flying) continue;
      const dx = this.x - o.x, dy = this.y - o.y;
      if (Math.abs(dx) < 34 && Math.abs(dy) < 12) {
        this.y += dy >= 0 ? 0.7 : -0.7;
        this.x += dx >= 0 ? 0.4 : -0.4;
      }
    }
  }

  takeHit(att, hd) {
    if (!this.hittable) return false;
    const g = this.game;
    this.hp -= hd.dmg;
    this.flash = 6;
    const from = att.x > this.x ? 1 : -1;
    this.facing = from;
    this.releaseToken();
    if (!hd.quiet) this.onHurtSfx();    // (quiet: a beam's tick -- its foes cry out at its last, not on every tick)
    this.hitN = (this.hitN || 0) + 1;   // alternates the high/low hurt pose per hit
    if (this.hp <= 0 || hd.kind === 'knock') this.knock(-from, hd.lift || 5, hd.push || 4, hd.thrown);
    else if (hd.chip && this.boss && (this.state === 'hurt' || g.frame - (this._chipStag ?? -999) < 60)) { /* (a boss: no chip-lock) */ }
    else { if (hd.chip && this.boss) this._chipStag = g.frame; this.hurt(hd, from); }
    g.engage(this);
    return true;
  }
  onHurtSfx() {}
  /** stunned silly for n frames (snow dump, gong) */
  daze(n) {
    if (!this.alive || this.down || this.boss || this.flying || !['approach', 'wait', 'taunt', 'windup', 'idle', 'walk', 'stab', 'lunge', 'hurt', 'stagger', 'guard'].includes(this.state)) return;
    this.releaseToken(); this.reset('hurt'); this.stun = n; this.vx = this.vy = 0; this.dizzyUntil = this.game.frame + n;
  }
  hurt(hd, from) { this.reset('hurt'); this.stun = hd.stun || 16; this.vx = -from * (hd.push || 2); this.vy = 0; }
  knock(dir, lift, push, thrown) {
    this.releaseToken();
    this.set('fly');
    this.vz = lift; this.vx = dir * push; this.vy = 0;
    this.z = Math.max(this.z, 1);
    this.bounced = false; this.thrown = !!thrown; this.bowled = new Set();
  }

  // shared knockdown physics
  flyUpdate() {
    const g = this.game;
    this.vz -= GRAV;
    if (this.thrown && Math.abs(this.vx) > 2.5) {
      for (const t of g.actors) {
        if (t === this || t.team !== 'foe' || !t.hittable || this.bowled.has(t)) continue;
        if (Math.abs(t.x - this.x) < t.w + this.w && Math.abs(t.y - this.y) < 22 && this.z < t.z + t.h) {
          this.bowled.add(t);
          t.takeHit(this, { dmg: 6, kind: 'knock', push: 4.5, lift: 4.5 });
          g.fx.spark(t.x, t.y, t.z + t.h * 0.5, true);
          g.fx.word(t.x, t.y, t.h, true, 'BONK!');
          audio.sfx('hit_heavy', { pitch: 0.9 });
          g.score += 100;
        }
      }
    }
    if (this.z <= 0 && this.vz < 0) {
      this.z = 0;
      if (this.bounced) { this.set('down'); this.vx = 0; }
      else {
        this.bounced = true; this.vz = 2.8; this.vx *= 0.45; this.bounceAt = g.frame;   // (the first floor contact: a painted 'bounce' squash plays from here)
        audio.sfx('knockdown', { pitch: this.heavy ? 0.7 : 1 });
        g.fx.dust(this.x, this.y, this.heavy ? 8 : 5, this.heavy ? 40 : 26);
        if (this.heavy) g.shake = Math.max(g.shake, 6);
      }
    }
  }
  downUpdate(time = 36) {
    if (this.st >= (this.hp <= 0 ? 24 : time)) {
      if (this.hp <= 0) this.die(); else this.set('getup');
    }
  }
  die() {
    this.set('dying'); this.alive = false;
    this.releaseToken();
  }
  dyingUpdate() {
    if (this.st >= 34) {
      this.gone = true;
      this.game.fx.poof(this.x, this.y, 0, this.heavy);
      audio.sfx('poof');
      this.game.score += this.score;
      this.game.onFoeGone(this);
    }
  }

  integrate() {
    const g = this.game;
    this.x += this.vx; this.y += this.vy;
    if (this.state === 'fly') this.z = Math.max(0, this.z + this.vz);
    this.clampDepth();
    if (!this.entered && this.x > g.camX + 30 && this.x < g.camX + W - 30) this.entered = true;
    if (this.entered) this.x = clamp(this.x, g.camX + 22, g.camX + W - 22);
  }

  /** the art's own painted clip k (not the code rig's stand-in) -- painter 2's knockdown clips are gated on 'bounce' */
  paintedClip(k) { const f = CHARS[this.art]?.ANIM?.[k], p = typeof f === 'function' ? f(0) : f; return !!(p && p.s3d >= 0.5); }
  anim(key, arg) {
    const A = CHARS[this.art]?.ANIM || {};
    let f = A[key];
    if (f === undefined) f = A.idle;
    if (f === undefined) return {};
    return typeof f === 'function' ? f(arg ?? this.game.time) : f;
  }

  drawOpts() { this.mem.frame = this.game.frame; return { facing: this.facing, t: this.game.time, scale: this.scale, mem: this.mem, vel: { x: this.vx || 0, y: this.vy || 0, z: this.z > 0 ? (this.vz || 0) : 0 }, talk: !!this.talking }; }
  draw(ctx) {
    if (this.state === 'dying' && (this.st >> 2) % 2) return;
    const mod = CHARS[this.art];
    if (!mod) return;
    const pose = this.pose();
    const sh = this.flash > 3 ? (this.flash % 2 ? 2 : -2) : 0;
    const o = this.drawOpts();
    // (a secret stage's recoloured variant: a colour wash until its painted atlas exists -- src/secrets.js)
    if (this.wash) drawTinted(ctx, this.sx + sh, this.sy, this.flashAlpha, (c) => mod.draw(c, pose, o), this.wash);
    else drawWithFlash(ctx, this.sx + sh, this.sy, this.flashAlpha, (c) => mod.draw(c, pose, o));
    if (this.dizzyUntil > this.game.frame) {
      // little stars circling the head
      // (a subclass may centre them on its drawing's head: starsAt() -> [screen x, screen y, size k] or null)
      const c = this.starsAt ? this.starsAt() : null, k = (c && c[2]) || 1;
      const t = this.game.time, hx = c ? c[0] : this.sx, hy = c ? c[1] : this.sy - this.h - (this.hz0 || 0) + 6;
      ctx.fillStyle = '#ffe066'; ctx.strokeStyle = '#21141c'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { const a = t * 6 + i * 2.1; const x = hx + Math.cos(a) * 22 * k, y = hy + Math.sin(a) * 6 * k;
        ctx.beginPath(); for (let j = 0; j < 10; j++) { const r = (j % 2 ? 2.2 : 5.5) * k; const b = j / 10 * Math.PI * 2; ctx.lineTo(x + Math.cos(b) * r, y + Math.sin(b) * r); } ctx.closePath(); ctx.fill(); ctx.stroke(); }
    }
  }
}

// ==================================================================================================== KOBOLD
const KOB = {
  green: { hp: 40, sp: 1.75, wind: 20, cool: [70, 120], dmg: 8 },
  blue: { hp: 34, sp: 2.5, wind: 18, cool: [50, 90], dmg: 8 },
  red: { hp: 80, sp: 1.9, wind: 16, cool: [50, 90], dmg: 10, scale: 1.08 },
  miner: { hp: 46, sp: 1.6, wind: 22, cool: [70, 120], dmg: 10 },
  bomber: { hp: 36, sp: 1.8, wind: 20, cool: [150, 220], dmg: 0, range: [230, 300] },
  shaman: { hp: 50, sp: 1.4, wind: 30, cool: [160, 220], dmg: 0, range: [260, 330] },
};
export class Kobold extends Enemy {
  constructor(game, x, y, opt = {}) {
    const v = opt.variant || 'green';
    super(game, x, y, { name: opt.name || pick(NAMES[v]), scale: KOB[v].scale });
    this.art = 'kobold'; this.variant = v; this.S = KOB[v];
    this.look = opt.look || null;   // (a secret stage's own look: its atlas variant -- frost, jade; src/secrets.js)
    this.hp = this.maxHp = this.S.hp;
    this.w = 24; this.h = 122;
    this.range = rnd(74, 84);
    this.score = v === 'red' ? 1500 : v === 'shaman' ? 1200 : 500;
    this.balloonH = v === 'shaman' ? 190 : 165;
    if (this.S.range) this.range = rnd(...this.S.range);
    this.summons = v === 'shaman' ? 2 : 0;
    this.set('approach');
  }
  onHurtSfx() { audio.sfx('kobold_hurt', { pitch: this.variant === 'blue' ? 1.15 : this.variant === 'red' ? 0.85 : 1 }); }
  /** (RC) a wind-up's bark -- never on top of another balloon: two kobolds winding up together both shouted "For the King!", one
   *  balloon stacked over the other (crowds/dqs1_1P); and one line not again from anyone within 1.5 s */
  bark(text) {
    const g = this.game;
    if (g.fx.list.some((b) => b.type === 'balloon' && b.actor && b.actor !== this && !b.actor.gone && Math.abs(b.actor.x - this.x) < 320)) return;
    if (g._bark && g._bark.text === text && g.frame - g._bark.at < 90) return;
    g._bark = { text, at: g.frame };
    g.fx.balloon(this, text, 70, { villain: true });
  }
  update() {
    const g = this.game, p = this.player;
    this.tick();
    if (this.cool > 0) this.cool--;
    switch (this.state) {
      case 'approach': case 'wait': case 'taunt': this.think(p); break;
      case 'windup':
        this.vx = this.vy = 0;
        if (this.st === 1 && Math.random() < 0.15) this.bark(pick(this.barks || ['Hssss!', 'Get him!', 'For the King!']));   // (barks: a kind's own -- src/mmfoes.js MMImp)
        if (this.st >= this.S.wind) {
          const v = this.variant;
          const next = v === 'miner' ? 'mine' : v === 'bomber' ? 'throw' : v === 'shaman' ? (this.summoning ? 'summon' : 'cast') : this.lunging ? 'lunge' : 'stab';
          this.set(next); this.hitDone = false;
          audio.sfx(v === 'shaman' ? 'charge' : 'swing_light', { pitch: v === 'miner' ? 0.9 : 1.2 });
        }
        break;
      case 'mine':
        // overhead pickaxe: strikes at k .35 of 24 frames
        if (!this.hitDone && this.st >= 7 && this.st <= 12) {
          const b = boxOf(this, { x0: 10, x1: 86, z0: 0, z1: 150, dy: 16 });
          if (this.hitHeroes(b, { dmg: this.S.dmg, kind: 'light', push: 3.5, stun: 22, stop: 5, sfx: 'hit_heavy' })) this.hitDone = true;
        }
        if (this.st === 9) { g.fx.dust(this.x + this.facing * 70, this.y, 2, 10); }
        if (this.st >= 24) { this.releaseToken(); this.cool = rnd(...this.S.cool); this.set('wait'); }
        break;
      case 'throw':
        if (this.st === 6) {
          const art = CHARS.kobold, h = art?.BOMB_HAND || [20, -120];
          g.actors.push(new Bomb(g, this.x + this.facing * h[0], this.y, -h[1], this.facing, clamp(p.x + rnd(-20, 20), g.camX + 40, g.camX + W - 40), clamp(p.y + rnd(-10, 10), 4, DEPTH - 4)));
          audio.sfx('throw');
        }
        if (this.st >= 16) { this.releaseToken(); this.cool = rnd(...this.S.cool); this.set('wait'); }
        break;
      case 'cast':
        if (this.st === 5) {
          const art = CHARS.kobold, c = art?.CAST_POINT || [40, -150];
          g.actors.push(new ShamanFire(g, this.x + this.facing * c[0], this.y, -c[1] - 30, this.facing, p));
          audio.sfx('fire_small', { pitch: 0.8 });
        }
        if (this.st >= 18) { this.releaseToken(); this.cool = rnd(...this.S.cool); this.set('wait'); }
        break;
      case 'summon':
        if (this.st === 24) {
          this.summons--;
          for (const side of ['L', 'R']) g.spawn({ k: 'kobold', side, y: clamp(p.y + rnd(-40, 40), 10, DEPTH - 10), v: 'green' });
          g.fx.ring(this.x, this.y, { rx: 120, ry: 40, shock: true, green: true, life: 24 });
          audio.sfx('roar', { pitch: 1.6, vol: 0.6 });
        }
        if (this.st >= 40) { this.releaseToken(); this.cool = rnd(...this.S.cool); this.summoning = false; this.set('wait'); }
        break;
      case 'stab': case 'lunge': {
        const L = this.state === 'lunge';
        const dur = L ? 30 : 22;
        // the art: stab tip ~128 px out from k 0.15-0.5; lunge slides ~50 px over k 0.2-0.45, tip ~144 px from k 0.4-0.72
        this.vx = L && this.st >= 6 && this.st < 14 ? this.facing * 6.3 : 0;
        if (!this.hitDone && (L ? this.st >= 12 && this.st <= 22 : this.st >= 3 && this.st <= 11)) {
          const b = boxOf(this, { x0: 30, x1: L ? 144 : 128, z0: 44, z1: 112, dy: 15 });
          if (this.hitHeroes(b, { dmg: this.S.dmg + (L ? 2 : 0), kind: 'light', push: 3, stun: 18, stop: 4, sfx: 'hit_light' })) this.hitDone = true;
        }
        if (this.st >= dur) { this.releaseToken(); this.cool = rnd(...this.S.cool); this.set('wait'); }
        break;
      }
      case 'hurt': this.vx *= 0.8; if (this.st >= this.stun) this.set('wait'); break;
      case 'fly': this.flyUpdate(); break;
      case 'down': this.downUpdate(); break;
      case 'getup': if (this.st >= 26) { this.set('wait'); this.cool = Math.max(this.cool, 30); } break;
      case 'dying': this.dyingUpdate(); break;
      case 'flee': this.vx = this.facing * 4; this.vy = 0; this.ph = (this.ph + 0.08) % 1; if (this.st > 120) this.gone = true; break;
    }
    if (this.state === 'approach' || this.state === 'wait') this.separate();
    this.integrate();
  }
  think(p) {
    const g = this.game;
    const side = this.x < p.x ? -1 : 1;
    if (!p.alive || p.down || p.state === 'victory') {
      // keep a respectful distance and taunt
      this.moveTo(p.x + side * 170, clamp(p.y + this.yOff * 3, 4, DEPTH - 4), this.S.sp * 0.7);
      if (this.vx === 0 && this.vy === 0) { if (this.state !== 'taunt') this.set('taunt'); this.face(p); }
      else { this.set('approach'); this.ph = (this.ph + 0.035) % 1; this.facing = this.vx ? Math.sign(this.vx) : this.facing; }
      return;
    }
    const tx = this.standX(p, this.range);
    const ty = clamp(p.y + (this.cool > 20 ? this.yOff : 0), 4, DEPTH - 4);
    const near = Math.abs(this.x - tx) < 10 && Math.abs(this.y - p.y) < 8;
    const ranged = this.variant === 'bomber' || this.variant === 'shaman';
    const inRange = ranged ? Math.abs(this.x - tx) < 40 : near;
    if (this.cool <= 0 && inRange && this.entered && this.takeToken()) {
      this.face(p); this.lunging = false;
      const foes = g.actors.filter((a) => a.team === 'foe' && a.alive).length;
      this.summoning = this.variant === 'shaman' && this.summons > 0 && foes < 5 && Math.random() < 0.4;
      this.windup('windup'); return;
    }
    if (ranged) {
      // keep the distance; drift in depth toward the target
      if (this.moveTo(tx, clamp(p.y + this.yOff * 2, 4, DEPTH - 4), this.S.sp)) { this.set('wait'); this.face(p); }
      else { this.set('approach'); this.face(p); this.ph = (this.ph + (this.vx * this.facing < -0.1 ? -0.03 : 0.03) + 1) % 1; }   // (backing away, facing the hero: the walk played backwards -- the anim audit)
      return;
    }
    // a lunge from a little further out
    if (this.cool <= 0 && Math.abs(this.x - p.x) > 120 && Math.abs(this.x - p.x) < 165 && Math.abs(this.y - p.y) < 8 &&
        Math.random() < (this.variant === 'red' ? 0.05 : 0.015) && this.entered && this.takeToken()) {
      this.face(p); this.lunging = true; this.windup('windup'); return;
    }
    const sp = this.cool > 40 && Math.abs(this.x - p.x) < 140 ? this.S.sp * 0.55 : this.S.sp;
    if (this.moveTo(tx, ty, sp)) { this.set('wait'); this.face(p); }
    else {
      this.set('approach');
      if (Math.abs(this.vx) > 0.2) this.facing = Math.sign(this.vx);
      if (Math.abs(this.x - p.x) < 160) this.face(p);
      { const r = 0.03 * sp / 1.75; this.ph = (this.ph + (this.vx * this.facing < -0.1 ? -r : r) + 1) % 1; }   // (backing away, facing the hero: the walk played backwards -- the anim audit)
    }
  }
  pose() {
    const g = this.game;
    switch (this.state) {
      case 'approach': return this.anim('walk', this.ph);
      case 'wait': return this.anim('idle', g.time + this.ph * 3);
      case 'taunt': return this.anim('taunt', g.time + this.ph * 3);
      case 'windup': {
        const v = this.variant, k = Math.min(1, this.st / this.S.wind);
        return this.anim(v === 'miner' ? 'mineWind' : v === 'bomber' ? 'throwWind' : v === 'shaman' ? 'castWind' : 'windup', k);
      }
      case 'mine': return this.anim('mineHit', Math.min(1, this.st / 24));
      case 'throw': return this.anim('throw', Math.min(1, this.st / 16));
      case 'cast': return this.anim('cast', Math.min(1, this.st / 18));
      case 'summon': return this.anim('summon', Math.min(1, this.st / 40));
      case 'stab': return this.anim('stab', Math.min(1, this.st / 22));
      case 'lunge': return this.anim('lunge', Math.min(1, this.st / 30));
      case 'hurt': return this.anim('hurt', Math.min(1, this.st / this.stun));
      case 'fly': return this.bounced && this.paintedClip('bounce') ? this.anim('bounce') : this.anim('fly');   // (painter 2: the squash at the first floor contact, held through the little rebound hop -- RC: after 5 frames the upright launch drawing came back for the rest of the hop, a 1-2 frame pop before the prone one)
      case 'down': return this.paintedClip('bounce') ? this.anim('down', Math.min(1, this.st / 20)) : this.anim('down');   // (land squash, rebound, settled)
      case 'dying': return this.paintedClip('bounce') ? this.anim('down', 1) : this.anim('down');   // (the settled drawing, held while it blinks out)
      case 'getup': return this.anim('getup', Math.min(1, this.st / 26));
      case 'flee': return this.anim('flee', this.ph);
      default: return this.anim('idle', g.time);
    }
  }
  drawOpts() { return { ...super.drawOpts(), variant: this.look || this.variant }; }
}

// ==================================================================================================== WHELP
const HOVER_Z = 62;
export class Whelp extends Enemy {
  constructor(game, x, y, opt = {}) {
    super(game, x, y, { name: opt.name || (opt.variant === 'storm' ? 'STORM WHELP' : 'BABY DRAGON') });
    this.art = 'whelp'; this.variant = opt.variant; this.collared = true;
    this.hp = this.maxHp = 30;
    this.w = 28; this.h = 42; this.hz0 = 5; this.depthR = 4;
    this.z = HOVER_Z; this.flying = true; this.cursed = true;
    this.dist = rnd(190, 240);
    this.score = 800;
    this.shadowR = 26;
    this.balloonH = 120;
    this.set('hover');
  }
  get hittable() { return this.alive && this.inv <= 0 && ['hover', 'spitWind', 'spit', 'swoopWind', 'swoop', 'hurt'].includes(this.state); }
  onHurtSfx() { audio.sfx('whelp_chirp', { pitch: 0.8 }); }
  update() {
    const g = this.game, p = this.player;
    this.tick();
    if (this.cool > 0) this.cool--;
    const bob = Math.sin(g.time * 3 + this.ph * 6) * 6;
    switch (this.state) {
      case 'hover': {
        const side = this.x < p.x ? -1 : 1;
        const tx = clamp(p.x + side * this.dist, g.camX + 70, g.camX + W - 70);
        const ty = clamp(p.y + this.yOff, 4, DEPTH - 4);
        const dx = tx - this.x, dy = ty - this.y;
        this.vx = clamp(dx * 0.04, -2.2, 2.2); this.vy = clamp(dy * 0.05, -1.4, 1.4);
        this.z += (HOVER_Z + bob - this.z) * 0.1;
        this.face(p);
        if (this.cool <= 0 && this.entered && Math.abs(dx) < 50 && Math.abs(this.y - p.y) < 14 && p.alive && !p.down && this.takeToken()) {
          this.vx = this.vy = 0;
          if (Math.random() < 0.55) { this.windup('spitWind'); audio.sfx('whelp_chirp'); }
          else this.windup('swoopWind');
        }
        break;
      }
      case 'spitWind':
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.st >= 24) {
          this.set('spit');
          const M = CHARS.whelp?.MOUTH || [52, -9];
          const Shot = this.variant === 'storm' ? Spark : Fireball;
          g.actors.push(new Shot(g, this.x + this.facing * M[0], this.y, this.z - M[1] - 2, this.facing, this));
          audio.sfx('fire_small');
        }
        break;
      case 'spit':
        if (this.st >= 20) { this.releaseToken(); this.cool = rnd(110, 170); this.set('hover'); }
        break;
      case 'swoopWind':
        this.z += (HOVER_Z + 26 - this.z) * 0.12;
        if (this.st >= 26) { this.set('swoop'); this.hitDone = false; this.sx0 = this.x; audio.sfx('swing_heavy', { pitch: 1.3 }); }
        break;
      case 'swoop': {
        this.vx = this.facing * 7.4; this.vy = clamp((p.y - this.y) * 0.04, -0.8, 0.8);
        const u = Math.min(1, this.st / 44);
        this.z = 30 + (HOVER_Z + 26 - 30) * Math.pow(Math.abs(u * 2 - 1), 1.6);
        if (!this.hitDone && p.hittable && Math.abs(p.x - this.x) < 30 && Math.abs(p.y - this.y) < 16 && this.z < p.z + 110) {
          this.hitDone = true;
          p.takeHit(this, { dmg: 9, kind: 'light', push: 4, stun: 20, stop: 5, sfx: 'hit_light' });
        }
        if (this.st >= 44) { this.releaseToken(); this.cool = rnd(120, 180); this.set('hover'); this.vx = 0; }
        break;
      }
      case 'hurt': this.vx *= 0.85; this.vy = 0; if (this.st >= this.stun) this.set('hover'); break;
      case 'fly':
        // knocked out of the sky
        this.vz -= GRAV * 0.8; this.z = Math.max(0, this.z + this.vz);
        if (this.z <= 0) { this.z = 0; this.vx = 0; this.set('down'); audio.sfx('knockdown', { pitch: 1.3 }); g.fx.dust(this.x, this.y, 4, 20); }
        break;
      case 'down':
        this.vx = this.vy = 0;
        if (this.st >= (this.hp <= 0 ? 30 : 60)) {
          if (this.hp <= 0) this.free(); else { this.set('rise'); }
        }
        break;
      case 'rise':
        this.z += (HOVER_Z - this.z) * 0.08;
        if (this.st >= 30) { this.set('hover'); this.cool = 60; }
        break;
      case 'freed': {
        // a happy loop over Dodongo's head, then away home to the mountains
        const pl = this.player;
        if (this.st < 90) {
          const a = this.st * 0.075;
          const tx = pl.x + Math.cos(a) * 70;
          this.vx = (tx - this.x) * 0.09; this.vy = (pl.y - this.y) * 0.05;
          this.z += (135 + Math.sin(a) * 28 - this.z) * 0.1;
          if (Math.abs(this.vx) > 0.3) this.facing = Math.sign(this.vx);
        } else { this.vx = this.facing * 3; this.vy = 0; this.z += 2.6; }
        if (this.st % 10 === 0) g.fx.hearts(this.x, this.y, this.z, 1);
        if (this.st >= 230 || this.z > 560) this.gone = true;
        break;
      }
    }
    if (this.state !== 'fly') this.x += this.vx, this.y += this.vy;
    else { this.x += this.vx; }
    this.clampDepth();
    if (!this.entered && this.x > g.camX + 30 && this.x < g.camX + W - 30) this.entered = true;
    if (this.entered && this.state !== 'freed') this.x = clamp(this.x, g.camX + 22, g.camX + W - 22);
  }
  knock(dir, lift, push) {
    this.releaseToken();
    this.set('fly'); this.vz = Math.min(lift, 4); this.vx = dir * push * 0.8;
  }
  free() {
    const g = this.game;
    this.alive = false; this.cursed = false;
    this.set('freed');
    this.facing = this.player.x > this.x ? -1 : 1;
    g.fx.hearts(this.x, this.y, 30, 8);
    g.fx.spark(this.x, this.y, 30, true, 'green');
    g.fx.label(clamp(this.x, g.camX + 90, g.camX + W - 90), this.y, 110, 'FREED!', '#9dff8a', 34, 70);
    audio.sfx('freed');
    g.score += this.score;
    g.onFoeGone(this);
    g.onWhelpFreed(this);
  }
  pose() {
    const g = this.game;
    switch (this.state) {
      case 'hover': case 'rise': return this.anim('hover', g.time + this.ph * 2);
      case 'spitWind': return this.anim('spitWind', Math.min(1, this.st / 24));
      case 'spit': return this.anim('spit', Math.min(1, this.st / 20));
      case 'swoopWind': return this.anim('swoopWind', Math.min(1, this.st / 26));
      case 'swoop': return this.anim('swoop', g.time);
      case 'hurt': return this.anim('hurt', Math.min(1, this.st / this.stun));
      case 'fly': return this.anim('fall', Math.min(1, this.st / 30));
      case 'down': return this.anim('down');
      case 'freed': return this.anim('freed', g.time);
      default: return this.anim('hover', g.time);
    }
  }
  drawOpts() { return { ...super.drawOpts(), cursed: this.cursed, variant: this.variant }; }
}

// ==================================================================================================== BRUTE
export class Brute extends Enemy {
  constructor(game, x, y, opt = {}) {
    super(game, x, y, { name: opt.name || pick(NAMES.brute) });
    this.art = 'brute'; this.variant = opt.variant; this.look = opt.look || null;
    this.spK = 1;   // (drawn bigger -- the frost chief -- he strides and charges that much faster: the feet don't slide)
    this.hp = this.maxHp = 120;
    this.w = 44; this.h = 196; this.heavy = true;
    this.shadowR = 50; this.balloonH = 240;
    this.score = 2000;
    this.staggers = 0;
    this.set('approach');
  }
  drawOpts() { return { ...super.drawOpts(), variant: this.look || this.variant }; }
  get armored() { return ['punchWind', 'punch', 'chargeWind', 'charge', 'roar'].includes(this.state); }
  onHurtSfx() { audio.sfx('brute_hurt'); }
  takeHit(att, hd) {
    if (!this.hittable) return false;
    if (hd.kind !== 'knock' && (this.armored || this.staggers >= 3)) {
      // tough guy: shrugs off light hits mid-attack
      this.hp -= hd.dmg; this.flash = 6;
      this.game.engage(this);
      if (this.hp <= 0) this.knock(att.x > this.x ? -1 : 1, 5, 4, true);
      audio.sfx('block', { pitch: 0.7, vol: 0.6 });
      if (!this.armored) this.staggers = 0;
      return true;
    }
    if (hd.kind !== 'knock' && this.hp - hd.dmg > 0 && hd.chip && (this.state === 'stagger' || this.game.frame - (this._chipStag ?? -999) < 60)) {
      this.hp -= hd.dmg; this.flash = 6; if (!hd.quiet) this.onHurtSfx(); this.game.engage(this);   // (a chip hit: no stagger-lock)
      return true;
    }
    if (hd.kind !== 'knock' && this.hp - hd.dmg > 0) {
      if (hd.chip) this._chipStag = this.game.frame;
      this.hp -= hd.dmg; this.flash = 6;
      this.facing = att.x > this.x ? 1 : -1;
      this.releaseToken();
      this.staggers++;
      this.reset('stagger'); this.vx = -this.facing * 1.2;
      if (!hd.quiet) this.onHurtSfx();
      this.game.engage(this);
      return true;
    }
    this.staggers = 0;
    return super.takeHit(att, { ...hd, lift: (hd.lift || 5) * 0.75, push: (hd.push || 4) * 0.7 });
  }
  update() {
    const g = this.game, p = this.player;
    this.tick();
    if (this.cool > 0) this.cool--;
    switch (this.state) {
      case 'approach': case 'wait': {
        const side = this.x < p.x ? -1 : 1;
        const dist = Math.abs(p.x - this.x), dy = Math.abs(p.y - this.y);
        if (!p.alive || p.down) { this.moveTo(p.x + side * 200, p.y, this.spK); this.ph = (this.ph + 0.02) % 1; this.set(this.vx || this.vy ? 'approach' : 'wait'); break; }
        if (this.cool <= 0 && dist < 125 * this.spK && dy < 16 && this.entered && this.takeToken()) { this.face(p); this.windup('punchWind'); break; }
        if (this.cool <= 0 && dist > 230 && dist < 600 && dy < 12 && Math.random() < 0.03 && this.takeToken()) {
          this.face(p); this.windup('chargeWind'); audio.sfx('charge'); break;
        }
        if (this.moveTo(this.standX(p, 108 * this.spK), p.y + (this.cool > 30 ? this.yOff : 0), 1.15 * this.spK)) { this.set('wait'); this.face(p); }
        else { this.set('approach'); this.ph = (this.ph + 0.022) % 1; this.face(p); }
        this.separate();
        break;
      }
      case 'punchWind':
        if (this.st >= 30) { this.set('punch'); this.hitDone = false; audio.sfx('swing_heavy', { pitch: 0.7 }); }
        break;
      case 'punch':
        this.vx = this.st < 8 ? this.facing * 2.2 * this.spK : 0;
        if (!this.hitDone && this.st >= 6 && this.st <= 15) {
          const k = this.spK, b = boxOf(this, { x0: 30 * k, x1: 135 * k, z0: 40 * k, z1: 150 * k, dy: 18 });
          if (p.hittable && overlaps(b, p)) {
            this.hitDone = true;
            p.takeHit(this, { dmg: 14, kind: 'knock', push: 6, lift: 6.5, stop: 8, sfx: 'hit_heavy' });
            if (this.variant === 'magma') g.addHazard?.({ kind: 'fire', x: p.x, y: p.y, r: 30, life: 80, dmg: 5 });
          }
        }
        if (this.st >= 30) { this.releaseToken(); this.cool = rnd(120, 170); this.set('wait'); }
        break;
      case 'chargeWind':
        this.vx = this.vy = 0;
        if (this.st % 10 === 0) g.fx.dust(this.x - this.facing * 20, this.y, 1, 6, -this.facing);
        if (this.st >= 42) { this.set('charge'); this.hitDone = false; }
        break;
      case 'charge': {
        this.vx = this.facing * 8.2 * this.spK; this.vy = 0;
        this.ph = (this.ph + 0.07) % 1;
        if (this.st % 4 === 0) { g.fx.dust(this.x - this.facing * 20, this.y, 1, 6, -this.facing); audio.sfx('run_step', { pitch: 0.6, vol: 0.7 }); }
        if (!this.hitDone) {
          const k = this.spK, b = boxOf(this, { x0: 30 * k, x1: 135 * k, z0: 30 * k, z1: 170 * k, dy: 20 });
          if (p.hittable && overlaps(b, p)) {
            this.hitDone = true;
            p.takeHit(this, { dmg: 18, kind: 'knock', push: 8, lift: 7, stop: 8, sfx: 'hit_heavy' });
          }
        }
        const edge = this.facing > 0 ? this.x >= g.camX + W - 40 : this.x <= g.camX + 40;
        if (edge || this.st > 110) { this.vx = 0; this.set('chargeEnd'); g.shake = Math.max(g.shake, 5); g.fx.dust(this.x, this.y, 6, 30); audio.sfx('knockdown', { pitch: 0.7 }); }
        break;
      }
      case 'chargeEnd': this.vx = 0; if (this.st >= 30) { this.releaseToken(); this.cool = rnd(80, 120); this.set('wait'); } break;
      case 'stagger': this.vx *= 0.8; if (this.st >= 14) this.set('wait'); break;
      case 'hurt': this.vx *= 0.8; if (this.st >= this.stun) this.set('wait'); break;
      case 'fly': this.flyUpdate(); break;
      case 'down': this.downUpdate(44); break;
      case 'getup': if (this.st >= 32) { this.set('wait'); this.cool = 40; this.inv = 20; } break;
      case 'roar': this.vx = this.vy = 0; if (this.st >= 70) this.set('wait'); break;
      case 'dying': this.dyingUpdate(); break;
    }
    this.integrate();
  }
  pose() {
    const g = this.game;
    switch (this.state) {
      case 'approach': return this.anim('walk', this.ph);
      case 'wait': return this.anim('idle', g.time + this.ph * 3);
      case 'punchWind': return this.anim('punchWind', Math.min(1, this.st / 30));
      case 'punch': return this.anim('punch', Math.min(1, this.st / 30));
      case 'chargeWind': return this.anim('chargeWind', Math.min(1, this.st / 42));
      case 'charge': return this.anim('charge', this.ph);
      case 'chargeEnd': return this.anim('stagger', Math.min(1, this.st / 30));
      case 'stagger': return this.anim('stagger', Math.min(1, this.st / 14));
      case 'hurt': return this.anim('hurt', Math.min(1, this.st / this.stun));
      case 'fly': return this.bounced && this.paintedClip('bounce') ? this.anim('bounce') : this.anim('fly');   // (painter 2: the squash at the first floor contact, held through the little rebound hop -- RC: after 5 frames the upright launch drawing came back for the rest of the hop, a 1-2 frame pop before the prone one)
      case 'down': return this.paintedClip('bounce') ? this.anim('down', Math.min(1, this.st / 20)) : this.anim('down');   // (land squash, rebound, settled)
      case 'dying': return this.paintedClip('bounce') ? this.anim('down', 1) : this.anim('down');   // (the settled drawing, held while it blinks out)
      case 'getup': return this.anim('getup', Math.min(1, this.st / 32));
      case 'roar': return this.anim('roar', g.time);
      default: return this.anim('idle', g.time);
    }
  }
}

// ==================================================================================================== BOSS: GRIMSCALE
/** flash safety (AA item 6, the three books' rule -- Book 2's siSoftFlash, Book 1's mmSoftFlash): a boss's hit flash is a soft white tint,
 * ramped in over 3 frames, at most 0.2, at most once per 96 frames, none with reduced motion; the flinch, the knockback, the spark and
 * the hit word carry every other hit.  Book 3's bosses only (Grimscale here, src/enemies2.js Boss) -- the Actor default is unchanged */
const SOFT_REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export function softBossFlash(a) {
  const f = a.game?.frame ?? 0;
  if (a.flash >= 4 && f - (a._flashF ?? -1e9) >= 96) a._flashF = f;
  const d = f - (a._flashF ?? -1e9);
  if (SOFT_REDUCED || d >= 9) return 0;
  return 0.2 * (d < 3 ? (d + 1) / 3 : 1 - (d - 3) / 6);
}
export class Grimscale extends Enemy {
  get flashAlpha() { return softBossFlash(this); }   // (0.45 every hit, as close as 3-7 f apart under a mashing party: the soft rule)
  constructor(game, x, y) {
    super(game, x, y, { name: 'GRIMSCALE' });
    this.art = 'grimscale';
    this.hp = this.maxHp = 300;
    this.w = 45; this.h = 240; this.heavy = true;
    this.shadowR = 64; this.balloonH = 290;
    this.poise = 3;
    this.phase = 1;
    this.cool = 60;
    this.facing = -1; this.entered = true;
    this.score = 10000; this.collared = true;
    this.set('intro');
  }
  get boss() { return true; }
  bossIntro() { this.set('roar'); }
  bossFight() { this.set('idle'); }
  get freedNow() { return this.state === 'freed'; }
  get armored() { return /Wind$|^sweep$|^tail$|^breath$|^leap|^slam$|^roar$/.test(this.state); }
  get hittable() { return this.alive && this.inv <= 0 && this.game.fighting && !this.game.cut && !['intro', 'fly', 'down', 'getup', 'defeated', 'freed', 'leapAir', 'roar'].includes(this.state); }
  get speedMul() { return this.phase === 2 ? 0.75 : 1; }
  onHurtSfx() { audio.sfx('brute_hurt', { pitch: 0.75 }); }

  takeHit(att, hd) {
    if (!this.hittable) return false;
    const g = this.game;
    this.hp -= hd.dmg; this.flash = 6;
    g.engage(this);
    if (!hd.quiet) this.onHurtSfx();
    if (this.hp <= 0) { this.hp = 0; this.defeat(); return true; }
    if (this.phase === 1 && this.hp < this.maxHp * 0.5) {
      this.phase = 2; this.releaseToken(); this.set('roar'); this.inv = 30; return true;
    }
    if (hd.kind === 'knock') {
      if (--this.poise <= 0 || hd.special) {
        this.poise = 3; this.releaseToken();
        this.knock(att.x > this.x ? -1 : 1, 4.5, 3.5, false);
        return true;
      }
    }
    // (a chip hit -- the secret forms' small rapid ones: src/forms.js -- doesn't restart his stagger, nor start one within a second)
    const chipLock = hd.chip && (this.state === 'stagger' || this.game.frame - (this._chipStag ?? -999) < 60);
    if (!this.armored && !chipLock) {
      if (hd.chip) this._chipStag = this.game.frame; this.facing = att.x > this.x ? 1 : -1; this.releaseToken();
      // (RC2: a re-hit -- staggered, or recovering just after -- does not start the stagger clip over.  Its drawings are a rear-up
      //  (#0-#1, the mouth ~250 px up and back) and a slump forward (#2-#4, ~100 px lower and ~130 px ahead): restarted on every
      //  re-hit it went rear, slump, REAR, slump -- the head jumping ~100 px out and back on each hit of a combo.  Still in the
      //  rear-up, it restarts it (a 20 px nod, #0 -> #1); in the slump it stays on its drawing and flinches in code (GRIM_FLINCH))
      const chain = this.state === 'stagger' || this.recoverT > 0;
      this.reset('stagger'); this.vx = -this.facing * 1.4;
      if (!chain || (this.sd ?? 0) < GRIM_REAR) this.sd = 0;
      if (chain) this.flinchT = GRIM_FLINCH;
    }
    return true;
  }

  defeat() {
    const g = this.game;
    this.releaseToken();
    this.vx = this.vy = this.vz = 0; this.z = 0;
    this.set('defeated');
    this.alive = false;
    g.onBossDefeated(this);
  }

  update() {
    const g = this.game, p = this.player;
    this.tick();
    if (this.cool > 0) this.cool--;
    if (this.recoverT > 0 && this.state !== 'idle' && this.state !== 'walk') this.recoverT = 0;   // (an attack, a knockdown: the recovery is over)
    if (this.flinchT > 0) this.flinchT--;
    const M = this.speedMul;
    switch (this.state) {
      case 'intro': this.vx = this.vy = 0; break;
      case 'roar':
        this.vx = this.vy = 0;
        if (this.st === 8) { audio.sfx('roar'); g.shake = Math.max(g.shake, 10); }
        if (this.st === 20 && this.phase === 2 && !this.summoned) {
          this.summoned = true;
          g.fx.balloon(this, 'GUARDS! Help me!', 110, { villain: true });
          const away = this.player.x < g.camX + W / 2 ? 'R' : 'L';
          g.spawn({ k: 'kobold', side: away, y: 30, v: 'blue' });
          g.spawn({ k: 'kobold', side: away, y: 120, v: 'green' });
          // a snack falls from the rafters for the second half of the fight
          { const pp = this.player; g.spawnPickup('drumstick', clamp(pp.x + (pp.x < this.x ? -90 : 90), g.camX + 80, g.camX + W - 80), clamp(pp.y + 20, 10, DEPTH - 10)); }
        }
        if (this.st >= 80) { this.set(g.cut ? 'intro' : 'idle'); this.cool = 30; }
        break;
      case 'idle': case 'walk':
        this.think(p);
        // (RC: just out of a stagger he holds its last drawing a moment, in place -- hit again under a combo the stagger restarts from
        //  it; it used to fall through to the idle / walk drawing for ~4 frames between hits, his head jumping ~100 px and back.
        //  An attack wind-up still starts on time: think() gives it its own pose)
        if (this.recoverT > 0) { this.sd = Math.min(GRIM_STAG, Math.max(this.sd ?? GRIM_REAR, GRIM_REAR) + (GRIM_STAG - GRIM_REAR) / GRIM_RECOVER); this.recoverT--; if (this.state === 'walk') { this.vx = this.vy = 0; this.state = 'idle'; } }   // (RC2: the slump plays out here)
        break;
      case 'sweepWind':
        this.vx = this.vy = 0;
        if (this.st >= 36) { this.set('sweep'); this.hitDone = false; audio.sfx('swing_heavy', { pitch: 0.6 }); }
        break;
      case 'sweep':
        this.vx = this.st < 10 ? this.facing * 2 : 0;
        if (!this.hitDone && this.st >= 6 && this.st <= 14) this.tryHit({ x0: 10, x1: 200, z0: 0, z1: 170, dy: 18 }, { dmg: 13, kind: 'knock', push: 7, lift: 7, stop: 8, sfx: 'hit_heavy' });
        if (this.st >= 34) this.endAttack(100, 150);
        break;
      case 'tailWind':
        this.vx = this.vy = 0;
        if (this.st >= 22) { this.set('tail'); this.hitDone = false; audio.sfx('swing_heavy', { pitch: 0.8 }); }
        break;
      case 'tail':
        if (!this.hitDone && this.st >= 4 && this.st <= 12) this.tryHit({ x0: -170, x1: 176, z0: 0, z1: 60, dy: 28 }, { dmg: 12, kind: 'knock', push: 6, lift: 5, stop: 6, sfx: 'hit_heavy' });
        if (this.st >= 28) this.endAttack(50, 90);
        break;
      case 'breathWind':
        this.vx = 0;
        this.vy = clamp((p.y - this.y) * 0.05, -0.8, 0.8);
        if (this.st === 1) audio.sfx('charge', { pitch: 0.6 });
        if (this.st % 4 === 0) g.fx.glow(this.x + this.facing * 60, this.y, 200, 40, 10, true);
        if (this.st >= 40 * M) { this.set('breath'); this.burned = new Map(); audio.sfx('fire_breath'); }
        break;
      case 'breath': this.breathe(p); break;
      case 'leapCrouch':
        this.vx = this.vy = 0;
        if (this.st >= 22 * M) {
          this.set('leapAir');
          this.lx0 = this.x; this.ly0 = this.y;
          this.lx1 = clamp(p.x, g.camX + 80, g.camX + W - 80); this.ly1 = p.y;
          audio.sfx('jump', { pitch: 0.5 });
          g.fx.dust(this.x, this.y, 8, 40);
        }
        break;
      case 'leapAir': {
        const u = Math.min(1, this.st / 48);
        this.x = this.lx0 + (this.lx1 - this.lx0) * u; this.y = this.ly0 + (this.ly1 - this.ly0) * u;
        this.z = 210 * 4 * u * (1 - u);
        if (u >= 1) { this.z = 0; this.set('slam'); this.slamHit = false; this.shockHit = false; this.slamT = 0; this.landSlam(p); }
        break;
      }
      case 'slam': {
        // the shockwave rolls outward along the floor: jump over it
        const r = 110 + this.st * 11;
        if (!this.shockHit && this.st >= 3 && this.st <= 22 && p.hittable && p.z < 10) {
          const ex = (p.x - this.x) / r, ey = (p.y - this.y) / (r * 0.38);
          const d = Math.sqrt(ex * ex + ey * ey);
          if (d > 0.82 && d < 1.12) { this.shockHit = true; p.takeHit(this, { dmg: 10, kind: 'knock', push: 5, lift: 5, stop: 5, sfx: 'hit_heavy', spark: 'green' }); }
        }
        if (this.st >= 40) this.endAttack(60, 100);
        break;
      }
      case 'stagger': this.vx *= 0.8; if ((this.sd ?? 0) < GRIM_REAR) this.sd = Math.min(GRIM_REAR - 1, (this.sd ?? 0) + 1); if (this.st >= 16) { this.set('idle'); this.recoverT = GRIM_RECOVER; } break;   // (RC2: the rear-up held through the stagger; a slumped one stays slumped)
      case 'fly':
        this.vz -= GRAV; this.z = Math.max(0, this.z + this.vz);
        if (this.z <= 0 && this.vz < 0) { this.z = 0; this.vx = 0; this.set('down'); g.shake = Math.max(g.shake, 10); audio.sfx('knockdown', { pitch: 0.6 }); g.fx.dust(this.x, this.y, 10, 60); }
        break;
      case 'down': if (this.st >= 50) this.set('getup'); break;
      case 'getup': if (this.st >= 36) { this.set('idle'); this.inv = 30; this.cool = 20; } break;
      case 'defeated':
        const C = CHARS.grimscale?.COLLAR || [10, -190];   // where the collar is on the cracking drawing
        if (this.st === 50) { g.fx.spark(this.x + this.facing * C[0], this.y, -C[1], true, 'green'); audio.sfx('collar_crack'); }
        if (this.st === 100) {
          g.fx.spark(this.x + this.facing * C[0], this.y, -C[1], true, 'green');
          g.fx.hearts(this.x, this.y, 150, 12);
          g.fx.debris(this.x + this.facing * 10, this.y, 190, ['#2a2c33', '#45d36a', '#3a3d46'], 10);
          g.fx.label(this.x, this.y, 230, 'FREED!', '#9dff8a', 48, 80);
          audio.sfx('freed'); g.flashScreen = 0.5; g.flashAt = { x: this.x, y: this.y, z: 180 };
          this.set('freed');
        }
        break;
      case 'freed': break;
    }
    if (this.state !== 'leapAir') { this.x += this.vx; this.y += this.vy; }
    this.clampDepth();
    if (this.state !== 'intro') this.x = clamp(this.x, g.camX + 50, g.camX + W - 50);
  }

  think(p) {
    const g = this.game;
    const dx = p.x - this.x, dist = Math.abs(dx), dy = Math.abs(p.y - this.y);
    const behind = dx * this.facing < 0;
    if (!p.alive || p.down) {
      this.vx = this.vy = 0; this.set('idle');
      return;
    }
    if (behind && dist < 130 && dy < 26 && this.cool < 30 && this.takeToken(3)) { this.windup('tailWind'); return; }
    this.face(p);
    if (this.cool <= 0) {
      if (dist < 165 && dy < 22 && this.takeToken(3)) { this.windup('sweepWind'); return; }
      if (dist > 250 && Math.random() < 0.02 && this.takeToken(3)) { this.windup('breathWind'); return; }
      if (Math.random() < (this.phase === 2 ? 0.012 : 0.007) && this.takeToken(3)) { this.windup('leapCrouch'); return; }
    }
    const tx = p.x - Math.sign(dx || 1) * 130;
    if (this.moveTo(tx, p.y, 1.25 / M_(this), 0.9)) this.set('idle');
    // stride-matched walk cycle (69 px per cycle) so the feet stay planted at either phase's speed
    else { this.set('walk'); this.ph = (this.ph + Math.hypot(this.vx, this.vy) / (CHARS.grimscale?.WALK_STRIDE || 69.4)) % 1; }
  }

  drawShadow(ctx) {
    super.drawShadow(ctx);
    if (this.state !== 'leapAir' && this.state !== 'leapCrouch') return;
    const tx = (this.state === 'leapAir' ? this.lx1 : this.player.x) - this.game.camX;
    const ty = FLOOR_TOP + (this.state === 'leapAir' ? this.ly1 : this.player.y);
    const u = this.state === 'leapAir' ? Math.min(1, this.st / 48) : 0.2;
    const r = 60 + 40 * u;
    ctx.save();
    ctx.fillStyle = `rgba(30,10,20,${0.18 + 0.3 * u})`;
    ctx.beginPath(); ctx.ellipse(tx, ty, r, r * 0.36, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = `rgba(255,${120 - 80 * u | 0},60,${0.5 + 0.5 * Math.abs(Math.sin(this.st * 0.4))})`;
    ctx.beginPath(); ctx.ellipse(tx, ty, r, r * 0.36, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  tryHit(box, hd) {
    if (this.hitHeroes(boxOf(this, box), hd)) this.hitDone = true;
  }
  endAttack(c0, c1) { this.releaseToken(); this.cool = rnd(c0, c1) * this.speedMul; this.set('idle'); }

  landSlam(p) {
    const g = this.game;
    g.shake = Math.max(g.shake, 14);
    audio.sfx('stomp');
    g.fx.ring(this.x, this.y, { rx: 330, ry: 125, shock: true, green: true, life: 26 });
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      g.fx.add({ type: 'dust', x: this.x + Math.cos(a) * 60, y: this.y + Math.sin(a) * 22, z: 2, vx: Math.cos(a) * 7, vz: 0.6, r: 12, life: 26 });
    }
    g.fx.dust(this.x, this.y, 10, 70);
    // direct crush
    const ex = (p.x - this.x) / 95, ey = (p.y - this.y) / 40;
    if (p.hittable && ex * ex + ey * ey < 1 && p.z < 40) { this.shockHit = true; p.takeHit(this, { dmg: 18, kind: 'knock', push: 6, lift: 7, stop: 8, sfx: 'hit_heavy' }); }
  }

  breathe(p) {
    const g = this.game, dur = 70;
    this.vx = this.vy = 0;
    const M = CHARS.grimscale?.BREATH_MOUTH || [143, -169];
    const mx = this.x + this.facing * M[0], mz = -M[1];
    // a gout of green fire pours from the mouth down onto the floor ahead
    const reach = Math.min(1, this.st / 18);
    const x0 = this.x + this.facing * 70, x1 = this.x + this.facing * (70 + 320 * reach);
    for (let i = 0; i < 3; i++) {
      const u = Math.random();
      const fx = mx + (x1 - mx) * u, fz = mz * Math.pow(1 - u, 1.6);
      g.fx.flames(fx, this.y + rnd(-10, 10), fz, 1, { green: true, vx: this.facing * 1.5, scale: 0.9 + u });
    }
    if (this.st % 3 === 0) g.fx.flames(x0 + (x1 - x0) * Math.random(), this.y + rnd(-14, 14), 0, 1, { green: true, scale: 1.2 });
    const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
    if (p.hittable && p.x > lo && p.x < hi && Math.abs(p.y - this.y) < 26 && p.z < 46) {
      const last = this.burned.get(p) ?? -99;
      if (this.st - last >= 18) {
        this.burned.set(p, this.st);
        p.takeHit(this, { dmg: 7, kind: 'light', push: 3, stun: 14, stop: 3, sfx: 'fire_small', spark: 'green' });
      }
    }
    if (this.st >= dur) this.endAttack(80, 130);
  }

  /** (RC) the drawing, with a floor on how briefly the idle / walk drawing may show before a stagger: hit again just as he
   *  stepped out of one, the walk drawing stays DWELL frames before the stagger plays (it flashed for ~4 frames, his head jumping
   *  ~100 px and back).  Once per frame; the state machine and the hit itself are untouched. */
  pose() {
    const g = this.game, P = this.poseNow(), c = P.clip === 'stagger' ? 'S' : P.clip === 'idle' || P.clip === 'walk' ? 'W' : 'X';
    const D = this._dwell || (this._dwell = { c: null, prev: null, since: 0, f: -1, P: null, out: null });
    if (D.f === g.frame && D.out) return D.out;
    let out = P;
    if (c === 'S' && D.c === 'W' && g.frame - D.since < GRIM_DWELL && D.P) out = D.P;   // (keep the walk / idle drawing a moment)
    else { if (c !== D.c) { D.prev = D.c; D.c = c; D.since = g.frame; } if (c === 'W') D.P = P; }
    D.f = g.frame; D.out = out;
    return out;
  }
  poseNow() {
    const g = this.game, M = this.speedMul;
    switch (this.state) {
      case 'idle': if (this.recoverT > 0) return this.anim('stagger', Math.min(1, (this.sd ?? GRIM_STAG) / GRIM_STAG)); return this.anim('idle', g.time);   // (RC2: the slump while he recovers, ending on #4 -- the idle drawing's own pose)
      case 'intro': return this.anim('idle', g.time);
      case 'walk': return this.anim('walk', this.ph);
      case 'roar': return this.anim('roar', g.time);
      case 'sweepWind': return this.anim('sweepWind', Math.min(1, this.st / (32 * M)));
      case 'sweep': return this.anim('sweep', Math.min(1, this.st / 34));
      case 'tailWind': return this.anim('tailWind', Math.min(1, this.st / (20 * M)));
      case 'tail': return this.anim('tail', Math.min(1, this.st / 28));
      case 'breathWind': return this.anim('breathWind', Math.min(1, this.st / (40 * M)));
      case 'breath': return this.anim('breath', Math.min(1, this.st / 70));
      case 'leapCrouch': return this.anim('leapCrouch', Math.min(1, this.st / (22 * M)));
      case 'leapAir': return this.anim('leapAir');
      case 'slam': return this.anim('slam', Math.min(1, this.st / 40));
      case 'stagger': return this.anim('stagger', Math.min(1, (this.sd ?? 0) / GRIM_STAG));   // (RC2: the display clock sd, not st -- see takeHit)
      case 'fly': return this.anim('stagger', 0.5);
      case 'down': return this.anim('down');
      case 'getup': return this.anim('getup', Math.min(1, this.st / 36));
      case 'defeated': return this.anim('defeated', Math.min(1, this.st / 100));
      case 'freed': return this.anim('freed', g.time);
      default: return this.anim('idle', g.time);
    }
  }
  drawOpts() { return { ...super.drawOpts(), cursed: this.state !== 'freed' }; }
  /** (RC2) a re-hit's flinch: knocked back a few px, easing home over GRIM_FLINCH frames (the drawing itself stays) */
  draw(ctx) {
    const f = this.flinchT > 0 ? this.flinchT : 0;
    if (!f) { super.draw(ctx); return; }
    ctx.save(); ctx.translate(-this.facing * f, 0);
    try { super.draw(ctx); } finally { ctx.restore(); }
  }
}
function M_(b) { return b.speedMul; }
const GRIM_STAG = 16, GRIM_REAR = 6, GRIM_FLINCH = 6;   // (RC2: his stagger clip's frames, where its rear-up ends (drawings #0-#1) and the slump starts; a re-hit's flinch, px / frames)
const GRIM_RECOVER = 16;   // (RC: frames Grimscale stays in place after a stagger, its slump playing out (RC2) -- a re-hit inside them keeps the slump)
const GRIM_DWELL = 10;     // (RC: the fewest frames the idle / walk drawing shows between two staggers)

// makeEnemy lives in spawn.js (it also knows the newer enemies)
