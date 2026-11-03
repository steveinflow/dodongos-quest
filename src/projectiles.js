// Projectiles: the heroes' fireball / shurikens / crystal beam / falling stars, and the enemies' shots
// (lava globs, bombs, ball lightning, shaman fire).  Enemy shots hurt players; hero shots hurt foes and can swat enemy shots.
import { Actor, GRAV } from './actors.js';
import { FLOOR_TOP, W, INK } from './config.js';
import { TAU } from './rig.js';
import { CHARS } from './chars.js';
import { audio } from './audio-proxy.js';

const foesOf = (g) => g.actors.filter((t) => t.team === 'foe' && t.hittable);
const enemyShots = (g) => g.actors.filter((t) => t.team === 'shot' && t.alive);

export class HeroShot extends Actor {   // (exported: the secret forms' shots, src/forms.js)
  constructor(game, owner, x, y, z) {
    super(game, x, y);
    this.owner = owner; this.z = z;
    this.team = 'heroShot'; this.solid = false;
    this.w = 12; this.h = 22; this.hz0 = -11;
    this.life = 160;
  }
  get hittable() { return false; }
  offscreen() { const g = this.game; return this.x < g.camX - 80 || this.x > g.camX + W + 80; }
  /** first foe whose body overlaps this shot (depth tolerance dy), skipping any in `skip` (a volley's hit targets) */
  touching(dy = 18, r = 14, skip = null) {
    for (const t0 of foesOf(this.game)) {
      if (skip && skip.has(t0)) continue;
      const t = t0.postBox ? { ...t0.postBox, flying: t0.flying } : t0;
      if (Math.abs(t.y - this.y) > dy + (t.depthR || 0)) continue;
      if (Math.abs(t.x - this.x) > t.w + r) continue;
      // anything up in the air (hovering bosses, wyverns, whelps) is hit at any height: kids can't aim up
      if (t.flying || t.z > 30) return t0;
      const z0 = t.z + (t.hz0 || 0), z1 = Math.max(z0 + t.h, t.z + 100);
      if (this.z < z0 - r - 18 || this.z > z1 + r + 18) continue;
      return t0;
    }
    return null;
  }
  swatShots(dy = 18, r = 20) {
    for (const s of enemyShots(this.game)) {
      if (Math.abs(s.y - this.y) < dy && Math.abs(s.x - this.x) < r && Math.abs(s.z - this.z) < 30) { s.takeHit(this); return true; }
    }
    return false;
  }
  hit(t, hd) {
    // (a charged spell's hits carry its volley: their meter shares one budget -- Player.landed, SPELL_METER)
    // (a CRITICAL COUNTER: the owner's PERFECT DODGE window -- Player.critHd; a volley counts as one attack)
    const H = this.owner.critHd && !this.S?.noCrit ? this.owner.critHd(t, hd, this.volley || this) : hd;   // (noCrit: Legend's rapid shurikens)
    // (shot: a shot's hit, not a swing -- Mystic Mountain's LIGHT counts Dodongo's fire and Anastasia's magic: src/mmworld.js)
    if (t.takeHit(this.owner, { ...H, shot: true, charged: !!this.S?.charged }) && t.team === 'foe') this.owner.landed(t, { ...H, box: null, spell: this.S?.charged ? this.volley : undefined });
  }
  /** the targets this shot may not hit: its volley's (a spell's one hit per foe) and its own (a piercing shot) */
  get skip() {
    const v = this.volley, m = this.mine || (this.mine = new Set());
    return { has: (t) => m.has(t) || !!(v && v.has(t)) };
  }
  /** t was hit by this shot (and, in a volley, by its spell) */
  mark(t) { (this.mine || (this.mine = new Set())).add(t); this.volley?.add(t); }
  /** a hit's damage: a charged spell hits a boss or a heavy for double (it's one hit per foe -- the big spell must still
   * be worth it on the big ones), a boss no more than S.bossCap (what the spells did to bosses before they grew: no
   * instant kills) */
  dmgOn(t) {
    if (this.S.charged && (t.boss || t.heavy)) return t.boss && this.S.bossCap ? Math.min(this.S.dmg * 2, this.S.bossCap) : this.S.dmg * 2;
    return t.boss && this.S.bossDmg ? this.S.bossDmg : this.S.dmg;
  }
}

// ------------------------------------------------------------------------------------------------ Dodongo
export class HeroFireball extends HeroShot {
  /** vy: depth speed (DRAGON BURST's fan); volley: the Set a charged spell's fireballs share (each foe hit once) */
  constructor(game, owner, x, y, z, dir, S, vy = 0, volley = null) {
    super(game, owner, x, y, z);
    this.vx = dir * S.speed; this.vy = vy; this.facing = dir; this.S = S; this.volley = volley;
  }
  update() {
    this.tick();
    const g = this.game;
    this.x += this.vx; this.y += this.vy;
    if (this.vy && (this.y < 2 || this.y > 148)) { this.y = Math.max(2, Math.min(148, this.y)); this.vy = 0; }
    if (this.st % 2 === 0) g.fx.flames(this.x - this.vx * 1.5, this.y, this.z - 4, this.S.charged ? 2 : 1, { scale: this.S.charged ? 0.85 : 0.7 });
    if (this.swatShots()) { this.explode(); return; }
    const t = this.touching(20, 16, this.skip);
    if (t) {
      // (ember: the meter a hit feeds -- heroes.js shoot.ember, tools/tune_proj.mjs)
      this.mark(t);
      // (a charged burst's knock isn't 'thrown': no bowling -- the spell hits each foe once)
      this.hit(t, { dmg: this.dmgOn(t), kind: 'knock', push: 5, lift: 5, stop: 6, hit: 'fireball_hit', word: this.S.charged ? undefined : 'heavy', ember: this.S.ember ?? 9, thrown: !this.S.charged });
      // splash
      for (const o of foesOf(g)) {
        if (o === t || this.volley?.has(o) || Math.abs(o.x - this.x) > 70 || Math.abs(o.y - this.y) > 30) continue;
        this.mark(o);
        this.hit(o, { dmg: this.S.splash, kind: 'light', push: 3, stun: 16, stop: 2, hit: 'fireball_hit', ember: this.S.splashEmber ?? 4 });
      }
      this.explode(); return;
    }
    if (--this.life <= 0 || this.offscreen()) this.gone = true;
  }
  explode() {
    const g = this.game;
    this.gone = true;
    g.fx.flames(this.x, this.y, this.z, 10, { scale: 1.1 });
    g.fx.glow(this.x, this.y, this.z, 60, 14);
    audio.sfx('fireball_hit');
  }
  draw(ctx) {
    const sx = this.sx, sy = this.sy, t = this.game.time;
    ctx.save(); ctx.translate(sx, sy); ctx.scale(this.facing, 1);
    if (this.S.charged) { ctx.rotate(Math.atan2(this.vy, Math.abs(this.vx)) * 0.6); ctx.scale(1.25, 1.25); }
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,150,40,0.28)'; ctx.beginPath(); ctx.arc(0, 0, 26 + Math.sin(t * 30) * 2, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = prev;
    ctx.beginPath();
    ctx.moveTo(18, 0); ctx.bezierCurveTo(16, -14, -8, -16, -32, -5 + Math.sin(t * 25) * 3);
    ctx.bezierCurveTo(-12, 0, -12, 2, -32, 7 + Math.cos(t * 23) * 3); ctx.bezierCurveTo(-8, 16, 16, 14, 18, 0);
    ctx.fillStyle = '#e8401f'; ctx.fill(); ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = '#ffa526'; ctx.beginPath(); ctx.ellipse(4, 0, 11, 8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff2a0'; ctx.beginPath(); ctx.ellipse(7, -1, 5.5, 4, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

// ------------------------------------------------------------------------------------------------ Shadow
export class Shuriken extends HeroShot {
  /** volley: the Set the shurikens of one throw share -- a target one of them has hit lets the others pass; vx: a
   *  storm's own direction (else dir x speed) */
  constructor(game, owner, x, y, z, dir, vy, S, volley = null, vx = null) {
    super(game, owner, x, y, z);
    this.vx = vx ?? dir * S.speed; this.vy = vy; this.facing = dir; this.S = S;
    this.w = 8; this.life = S.charged ? 46 : 90; this.volley = volley;
  }
  update() {
    this.tick();
    const g = this.game;
    this.x += this.vx; this.y += this.vy;
    if (this.y < 2 || this.y > 148) {
      this.vy = 0; this.y = Math.max(2, Math.min(148, this.y));
      if (Math.abs(this.vx) < 2) { this.ping(); return; }   // (a storm's straight up / down ones end at the lane's edge)
    }
    if (this.swatShots(14, 16)) { this.ping(); return; }
    const t = this.touching(14, 10, this.skip);
    if (t) {
      this.mark(t);
      this.hit(t, { dmg: this.dmgOn(t), kind: 'light', push: 1.5, stun: 12, stop: 2, hit: 'shuriken_hit', spark: 'cool', ember: this.S.ember ?? 9, chip: !!this.S.chip });
      if (!this.S.charged) { this.ping(); return; }          // (a SHURIKEN STORM's fly on through the crowd)
      g.fx.spark(this.x, this.y, this.z, false, 'cool');
    }
    if (this.S.charged && this.st % 2 === 0) g.fx.rise(this.x - this.vx, this.y, this.z, '#c04ad8');
    if (--this.life <= 0 || this.offscreen()) this.gone = true;
  }
  ping() { this.gone = true; this.game.fx.spark(this.x, this.y, this.z, false, 'cool'); }
  draw(ctx) {
    const sx = this.sx, sy = this.sy, t = this.game.time;
    ctx.save(); ctx.translate(sx, sy);
    const art = CHARS.shadow;
    if (this.S.charged) {                                     // (a storm's: bigger, in a purple glow)
      const prev = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(192,74,216,0.35)'; ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = prev; ctx.scale(1.6, 1.6);
    }
    if (art?.drawShuriken) { ctx.scale(this.facing, 1); art.drawShuriken(ctx, t * 3); }
    else {
      ctx.rotate(t * 30);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const r = i % 2 ? 3 : 10; const a = (i / 8) * TAU; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fillStyle = '#b8c0cc'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, 0, 2, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------------------------------------------ Scarlet
/** Scarlet's grappling hook: flies out on its rope, snags the first bad guy and reels him in to her cutlass.
 *  Bosses and heavies are too big to drag: they just take the hit and the hook comes back. */
export class GrappleHook extends HeroShot {
  /** opts (CHAIN WHIRL): { vx, vy, volley } -- a hook up or down the lane, the Set the spell's hooks share */
  constructor(game, owner, x, y, z, dir, S, opts = {}) {
    super(game, owner, x, y, z);
    this.vx = opts.vx ?? dir * S.speed; this.vy = opts.vy || 0; this.facing = dir; this.S = S; this.volley = opts.volley || null;
    this.w = 10; this.x0 = x; this.y0 = y; this.mode = 'out'; this.grab = null; this.reelT = 0;
  }
  update() {
    this.tick();
    const g = this.game, o = this.owner;
    if (!o.alive || o.out || ['hurt', 'fly', 'down'].includes(o.state)) { this.gone = true; return; }
    const home = this.ropeOrigin();
    if (this.mode === 'out') {
      this.x += this.vx; this.y += this.vy;
      if (this.vy && (this.y < 2 || this.y > 148)) { this.y = Math.max(2, Math.min(148, this.y)); this.mode = 'back'; return; }
      if (this.swatShots(16, 18)) { this.mode = 'back'; return; }
      const t = this.touching(18, 12, this.skip);
      if (t) {
        this.mark(t);
        const big = t.boss || t.heavy || t.state === 'guard';
        this.hit(t, { dmg: this.dmgOn(t), kind: 'light', push: 0, stun: big ? 16 : 46, stop: 3, hit: 'hit_light', spark: 'warm', ember: this.S.ember ?? 11, rope: true });   // (rope: the Sloth Beast's rescue, src/sicell.js)
        audio.sfx('shuriken_hit', { pitch: 0.7, vol: 0.8 });
        if (!big && t.alive) { this.grab = t; this.mode = 'reel'; g.fx.word(t.x, t.y, (t.z || 0) + 120, false, 'YOINK!'); }
        else this.mode = 'back';
        return;
      }
      if (Math.hypot(this.x - this.x0, (this.y - this.y0) * 2.4) > this.S.range || this.offscreen()) this.mode = 'back';
    } else if (this.mode === 'reel') {
      const t = this.grab;
      if (!t || !t.alive || t.gone) { this.mode = 'back'; return; }
      // (yanked to her side the hook went out: ahead / behind, or up / down the lane in front of her)
      const side = Math.abs(this.vx) > 0.5 ? Math.sign(this.vx) : o.facing, tx = o.x + side * (this.vy ? 60 : 74);
      const ty = o.y + (this.vy ? Math.sign(this.vy) * 16 : 0);
      t.x += (tx - t.x) * 0.24; t.y += (ty - t.y) * 0.2; t.vx = 0;
      this.x = t.x - o.facing * 10; this.y = t.y; this.z = home.z;
      if (++this.reelT > 26 || Math.abs(t.x - tx) < 8) { this.grab = null; this.gone = true; }
    } else {
      this.x += (home.x - this.x) * 0.35; this.y += (home.y - this.y) * 0.35;
      if (Math.abs(home.x - this.x) < 14) this.gone = true;
    }
  }
  /** where the rope leaves her: the rope fist on the 3D drawings (it moves through the throw and the yank), else the fixed shoot origin */
  ropeOrigin() {
    const p = this.owner, L = p.art?.point3d?.(p.pose(), 'hookhand');
    return L ? { x: p.x + p.facing * L[0], y: p.y, z: p.z - L[1] } : p.shootOrigin();
  }
  draw(ctx) {
    const g = this.game, o = this.ropeOrigin();
    const hx = this.sx, hy = this.sy, ox = o.x - g.camX, oy = FLOOR_TOP + o.y - o.z;
    // rope with a little sag
    const mx = (hx + ox) / 2, my = (hy + oy) / 2 + Math.min(18, Math.abs(hx - ox) * 0.06);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.quadraticCurveTo(mx, my, hx, hy);
    ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.lineWidth = 2.6; ctx.strokeStyle = '#b98b52'; ctx.stroke();
    // the grapnel: a shank and three curved prongs (a CHAIN WHIRL's: in a red glow)
    ctx.translate(hx, hy);
    if (this.S.charged) { const prev = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(232,51,63,0.4)'; ctx.beginPath(); ctx.arc(0, 0, 24, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = prev; }
    ctx.scale(this.facing, 1); ctx.rotate(this.mode === 'out' ? this.st * 0.5 : 0);
    ctx.lineWidth = 6; ctx.strokeStyle = INK;
    const prongs = () => { ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(6, 0); for (const s of [-1, 0, 1]) { ctx.moveTo(6, 0); ctx.quadraticCurveTo(12, s * 9, 6, s * 13 + (s ? 0 : -1)); } };
    prongs(); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = '#9aa3ad'; prongs(); ctx.stroke();
    ctx.restore();
  }
}

// ------------------------------------------------------------------------------------------------ Anastasia
export class Beam extends HeroShot {
  constructor(game, owner, S) {
    super(game, owner, owner.x, owner.y, 0);
    this.S = S; this.life = 999; this.tickN = 0;
  }
  get x0() { return this.owner.shootOrigin().x; }
  update() {
    this.tick();
    const g = this.game, o = this.owner.shootOrigin(), dir = this.owner.facing;
    this.x = o.x; this.y = o.y; this.z = o.z; this.facing = dir;
    const end = dir > 0 ? g.camX + W + 40 : g.camX - 40;
    // swat enemy shots in the beam
    for (const s of enemyShots(g)) {
      if (Math.abs(s.y - this.y) < this.S.width && (s.x - o.x) * dir > 0 && (s.x - end) * dir < 0) s.takeHit(this);
    }
    if (this.st % this.S.tick === 1) {
      this.tickN++;
      const last = this.st > (this.S.end - this.S.release) * this.S.dur - this.S.tick;
      let ting = 'crystal_ting';               // (the last tick: one ting for the beam, however many it knocks down)
      for (const t of foesOf(g)) {
        if (Math.abs(t.y - this.y) > this.S.width + (t.depthR || 0)) continue;
        if ((t.x - o.x) * dir < -t.w || (t.x - end) * dir > 0) continue;
        const d = t.boss && this.S.bossDmg ? this.S.bossDmg : this.S.dmg;   // (the Archmage's GRAND BEAM: a boss takes the base beam's)
        this.hit(t, last
          ? { dmg: d * 2, kind: 'knock', push: 6, lift: 5, stop: 4, hit: ting, spark: 'cool', word: 'heavy', ember: this.S.lastEmber ?? 9, thrown: true }
          : { dmg: d, kind: 'light', push: 2.2, stun: 16, stop: 2, hit: false, quiet: true, spark: 'cool', ember: this.S.ember ?? 6, unblockable: true });   // (the ticks: silent under the beam's own shimmer -- no hit sound, no cry; the last: a ting)
        if (last) ting = false;
      }
    }
    if (this.st % 3 === 0) g.fx.spark(o.x + dir * (20 + Math.random() * 30), this.y, this.z + (Math.random() - 0.5) * 16, false, 'cool');
  }
  draw(ctx) {
    const g = this.game, o = this.owner.shootOrigin(), dir = this.owner.facing;
    const sx = o.x - g.camX, sy = FLOOR_TOP + o.y - o.z;
    const len = dir > 0 ? W + 40 - sx : sx + 40;
    const t = g.time, k = Math.min(1, this.st / 6), grand = !!this.S.grand;
    const w = (16 + Math.sin(t * 40) * 3) * k * ((this.S.width || 28) / 28);   // (the Archmage's GRAND BEAM: wider, gold-rimmed)
    ctx.save(); ctx.translate(sx, sy); ctx.scale(dir, 1);
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = grand ? 'rgba(255,214,110,0.28)' : 'rgba(80,170,255,0.25)'; ctx.fillRect(0, -w * 1.8, len, w * 3.6);
    ctx.fillStyle = 'rgba(120,210,255,0.55)'; ctx.fillRect(0, -w, len, w * 2);
    ctx.globalCompositeOperation = prev;
    ctx.fillStyle = '#e8fbff'; ctx.fillRect(0, -w * 0.42, len, w * 0.84);
    ctx.strokeStyle = 'rgba(33,20,28,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -w); ctx.lineTo(len, -w); ctx.moveTo(0, w); ctx.lineTo(len, w); ctx.stroke();
    // a flare at the crystal
    ctx.globalCompositeOperation = 'lighter';
    // (kept small so it doesn't swallow her hands and the crystal)
    ctx.fillStyle = 'rgba(160,230,255,0.7)'; ctx.beginPath(); ctx.arc(4, 0, w * 0.95, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = prev;
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(4, 0, w * 0.45, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

/** CRYSTAL NOVA's burst (and GRAND CRYSTAL NOVA's): the instant blast round the planted staff on release -- each foe in the
 *  ellipse (rx, ry) takes dmg, staggered (not knocked down: a downed foe can't be hit, and the shards knock it down a
 *  moment later -- burst + shard on one close by), with a pop.  A boss isn't hit (a charged spell's damage on a boss stays
 *  where it was: its shards' bossCap).  Its hits feed the spell's one meter budget (vol) but don't use up the spell's
 *  one-hit-per-foe set: the shards still land on them */
export function novaBurst(g, p, cx, y, rx, ry, dmg, vol, col = 'cool') {
  for (const t of foesOf(g)) {
    if (t.boss || t.z > 150) continue;
    const ex = (t.x - cx) / rx, ey = (t.y - y) / ry;
    if (ex * ex + ey * ey > 1) continue;
    const hd = { dmg, kind: 'light', push: 2.5, stun: 30, stop: 4, hit: 'hit_heavy', spark: col, word: 'heavy', ember: 6, shine: true };   // (shine: LIGHT -- src/mmworld.js)
    if (t.takeHit(p, hd) && t.team === 'foe') p.landed(t, { ...hd, box: null, spell: vol });
  }
}

/** A crystal shard of Anastasia's CRYSTAL NOVA (her charged spell): eight burst out all round from her planted staff
 *  along the floor, through the crowd (one hit per foe for the whole spell: the volley), a pop on each hit and a star
 *  spark at its range.  S.big: the shards drawn bigger and brighter, with a sparkle trail (the nova; the grand one more) */
export class Shard extends HeroShot {
  constructor(game, owner, x, y, z, ang, S, volley) {
    super(game, owner, x, y, z);
    this.S = S; this.volley = volley;
    this.vx = Math.cos(ang) * 9; this.vy = Math.sin(ang) * 4.2;
    this.facing = this.vx >= 0 ? 1 : -1; this.x0 = x; this.y0 = y; this.w = 10; this.range = 300;
  }
  update() {
    this.tick();
    const g = this.game;
    this.x += this.vx; this.y += this.vy;
    if (this.y < 2 || this.y > 148) { if (this.S.grand) this.gone = true; else this.pop(); return; }   // (the grand nova's 24: no burst row along the lane's edge)
    if (this.swatShots(14, 16)) { this.pop(); return; }
    const big = this.S.big || 0, t = this.touching(16 + 8 * big, 14 + 6 * big, this.skip);   // (a bigger shard: a bigger reach)
    if (t) {                                                  // (on through the crowd: a pop at each foe)
      this.mark(t);
      // (S.light: GRAND CRYSTAL NOVA's first ring only staggers -- its second ring, a beat later, knocks them down)
      this.hit(t, this.S.light ? { dmg: this.dmgOn(t), kind: 'light', push: 2, stun: 30, stop: 3, hit: 'hit_heavy', spark: 'cool', ember: this.S.ember }
        : { dmg: this.dmgOn(t), kind: 'knock', push: 4.5, lift: 4.5, stop: 4, hit: 'hit_heavy', spark: 'cool', ember: this.S.ember });
      g.fx.add({ type: 'star', x: this.x, y: this.y, z: this.z + 6, vz: 1.2, life: 22, r: 8, col: '#ffd23a' });
      if (this.S.big) {                                       // (the impact pop: a small ring and a few ice and gold stars -- no white flash)
        g.fx.ring(t.x, t.y, { rx: 40, ry: 14, shock: true, blue: true, life: 10 });
        for (let i = 0; i < 3; i++) g.fx.add({ type: 'star', x: t.x + (Math.random() - 0.5) * 30, y: t.y + 1, z: this.z + 10 + Math.random() * 30, vx: (Math.random() - 0.5) * 3, vz: 1 + Math.random(), life: 16, r: 5, col: i % 2 ? '#5ad0ff' : '#ffd23a' });
      }
    }
    if (this.st % 2 === 0) g.fx.rise(this.x - this.vx, this.y, this.z, this.st % 4 ? '#5ad0ff' : '#ffd23a');
    if (this.S.big && this.st % 4 === 1) g.fx.add({ type: 'star', x: this.x - this.vx * 1.5, y: this.y, z: this.z + (Math.random() - 0.5) * 14, vz: 0.4, life: 12, r: 2.5 + Math.random() * 1.5, col: this.st % 8 === 1 ? '#5ad0ff' : '#ffd23a' });   // (the sparkle trail)
    if (Math.hypot(this.x - this.x0, (this.y - this.y0) * 2) > this.range || this.offscreen()) { if (this.S.grand) { this.gone = true; this.game.fx.spark(this.x, this.y, this.z, false, 'gold'); } else this.pop(); }
  }
  pop() {
    const g = this.game;
    this.gone = true;
    g.fx.spark(this.x, this.y, this.z, true, 'cool');
    g.fx.add({ type: 'star', x: this.x, y: this.y, z: this.z + 6, vz: 1.2, life: 26, r: 9, col: '#ffd23a' });
    audio.sfx('hit_light', { pitch: 1.6, vol: 0.45 });
  }
  draw(ctx) {
    const sx = this.sx, sy = this.sy, a = Math.atan2(this.vy, this.vx), big = this.S.big || 0;
    ctx.save(); ctx.translate(sx, sy);
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(110,200,255,0.35)'; ctx.beginPath(); ctx.arc(0, 0, 20 + 10 * big, 0, TAU); ctx.fill();
    if (big) { ctx.fillStyle = 'rgba(255,214,90,0.3)'; ctx.beginPath(); ctx.arc(0, 0, 14 + 6 * big, 0, TAU); ctx.fill(); }   // (a gold heart to the glow)
    ctx.globalCompositeOperation = prev;
    if (big) ctx.scale(1 + 0.5 * big, 1 + 0.5 * big);
    ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(2, -8); ctx.lineTo(-14, 0); ctx.lineTo(2, 8); ctx.closePath();
    ctx.fillStyle = big ? '#6fcfff' : '#bff0ff'; ctx.fill(); ctx.lineWidth = big ? 2.2 : 2.6; ctx.strokeStyle = INK; ctx.stroke();   // (the nova's: a deeper ice blue, readable on snow)
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(3, -4); ctx.lineTo(-6, 0); ctx.lineTo(3, 4); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-24, 0); ctx.stroke();
    ctx.restore();
  }
}

/** A shooting star from Ana's STARFALL: dives from the sky onto its target. */
export class Star extends HeroShot {
  constructor(game, owner, target, final) {
    super(game, owner, target.x + (Math.random() - 0.5) * 140, target.y, 420);
    this.target = target; this.final = final; this.show = !!owner.teamFx;   // (a team attack's star: the show only)
    this.t0 = { x: this.x, z: 420 };
    this.dur = 16;
  }
  update() {
    this.tick();
    const g = this.game, T = this.target;
    const u = Math.min(1, this.st / this.dur);
    const tz = (T.z || 0) + (T.h ? T.h * 0.5 + (T.hz0 || 0) : 0);
    this.x = this.t0.x + (T.x - this.t0.x) * u; this.y = T.y; this.z = this.t0.z + (tz - this.t0.z) * u;
    if (u >= 1) {
      this.gone = true;
      g.fx.spark(this.x, this.y, this.z, true, 'cool');
      g.fx.glow(this.x, this.y, this.z, 50, 12, false, 'blue');
      audio.sfx('hit_light', { pitch: 1.4, vol: 0.7 });
      if (!T.ghost && T.hittable && !this.show && !this.owner.teamFx) {   // (a team attack's stars: the show only, game.js teamHit)
        const hd = this.final
          ? { dmg: 14, kind: 'knock', push: 5, lift: 6, stop: 3, hit: 'hit_heavy', spark: 'cool', special: true, ember: 0, thrown: true }
          : { dmg: 13, kind: 'light', push: 1, stun: 30, stop: 2, hit: 'hit_light', spark: 'cool', special: true, ember: 0 };
        this.hit(T, hd);
      }
      // (the first of the last round's stars to land: the starfall's big hit -- impact frames, a ring, the shake)
      const U = this.owner.ult;
      if (this.final && !T.ghost && U && !U.starHit) { U.starHit = true; this.owner.superHit?.(T.x, T.y, g.onScreenFoes().length, !this.show); }
    }
  }
  draw(ctx) {
    const sx = this.sx, sy = this.sy;
    const dx = this.t0.x - this.x, dz = this.t0.z - this.z;
    ctx.save();
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    const L = Math.min(1, 90 / Math.max(1, Math.hypot(dx, dz)));
    ctx.strokeStyle = 'rgba(130,210,255,0.7)'; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + dx * L, sy - dz * L); ctx.stroke();
    ctx.globalCompositeOperation = prev;
    ctx.translate(sx, sy); ctx.rotate(this.st * 0.4);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 5 : 13; const a = (i / 10) * TAU - Math.PI / 2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fillStyle = '#e8fbff'; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = '#1d3b6a'; ctx.stroke();
    ctx.restore();
  }
}

// ------------------------------------------------------------------------------------------------ enemy shots
export class EnemyShot extends Actor {   // (exported: the Curse Wraith's fireballs, src/wraith.js)
  constructor(game, x, y, z, dir) {
    super(game, x, y);
    this.z = z; this.facing = dir; this.team = 'shot'; this.solid = false;
    this.w = 12; this.h = 22; this.hz0 = -11; this.life = 200; this.shadowR = 12;
  }
  get hittable() { return this.alive; }
  takeHit() { this.alive = false; this.gone = true; this.game.fx.spark(this.x, this.y, this.z, false); audio.sfx('block', { pitch: 1.3, vol: 0.6 }); return true; }
  hitPlayers(hd, dy = 16, r = 10) {
    for (const p of this.game.players) {
      if (!p.hittable || Math.abs(p.y - this.y) > dy || Math.abs(p.x - this.x) > p.w + r) continue;
      if (this.z > p.z + p.h || this.z < p.z - r) continue;
      if (!p.takeHit(this, hd)) continue;              // (rolled through by a dodge: the shot flies on)
      return p;
    }
    return null;
  }
  offscreen() { const g = this.game; return this.x < g.camX - 120 || this.x > g.camX + W + 120; }
}

/** a lobbed lava glob (salamander) */
export class LavaGlob extends EnemyShot {
  constructor(game, x, y, z, dir, tx) {
    super(game, x, y, z, dir);
    const dist = Math.max(60, Math.abs(tx - x));
    const T = Math.max(26, Math.min(48, dist / 5));
    this.vx = (tx - x) / T; this.vz = (GRAV * T) / 2 - z / T;
  }
  update() {
    this.tick();
    this.x += this.vx; this.z += this.vz; this.vz -= GRAV;
    if (this.hitPlayers({ dmg: 9, kind: 'light', push: 3, stun: 16, stop: 3, sfx: 'hit_light', spark: 'warm' })) { this.splat(); return; }
    if (this.z <= 0) { this.splat(); return; }
    if (--this.life <= 0) this.gone = true;
  }
  splat() {
    const g = this.game;
    this.gone = true;
    g.fx.flames(this.x, this.y, 0, 6, { scale: 0.8 });
    audio.sfx('lava_burst', { vol: 0.6 });
    g.addHazard?.({ kind: 'fire', x: this.x, y: this.y, r: 26, life: 70, dmg: 5 });
  }
  draw(ctx) {
    const art = CHARS.salamander;
    ctx.save(); ctx.translate(this.sx, this.sy);
    // (oriented along its flight, the drip trail behind it: spat leftwards it is mirrored -- unmirrored, the trail led)
    if (art?.drawGlob) { const d = this.vx < 0 ? -1 : 1; ctx.scale(d, 1); art.drawGlob(ctx, this.game.time, Math.abs(this.vx), -this.vz); }
    else { ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.stroke(); }
    ctx.restore();
  }
}

/** a bomb thrown by a bomber kobold: arcs, sits fizzing, then explodes (can be knocked away) */
export class Bomb extends EnemyShot {
  constructor(game, x, y, z, dir, tx, ty) {
    super(game, x, y, z, dir);
    const T = 34;
    this.vx = (tx - x) / T; this.vy = (ty - y) / T; this.vz = (GRAV * T) / 2 - z / T;
    this.fuse = 110; this.fuse0 = 110; this.landed = false;
  }
  takeHit(att) {
    // whack it back the way it came
    this.vx = (att.facing || 1) * 6; this.vz = 4; this.landed = false; this.batted = true;
    audio.sfx('block', { pitch: 1.5, vol: 0.6 });
    return true;
  }
  update() {
    this.tick();
    const g = this.game;
    if (!this.landed) {
      this.x += this.vx; this.y += this.vy; this.z += this.vz; this.vz -= GRAV;
      if (this.z <= 0) { this.z = 0; this.landed = true; this.vx *= 0.3; audio.sfx('land', { pitch: 1.6, vol: 0.5 }); }
    } else { this.x += this.vx; this.vx *= 0.85; }
    this.clampDepth();
    if (this.fuse % 20 === 0) audio.sfx('bomb_fuse', { vol: 0.35 });
    if (--this.fuse <= 0) this.blast();
  }
  blast() {
    const g = this.game;
    this.gone = true;
    g.fx.explosion(this.x, this.y);
    g.shake = Math.max(g.shake, 8);
    audio.sfx('bomb_blast');
    const hd = { dmg: 14, kind: 'knock', push: 6, lift: 6, stop: 5, sfx: 'hit_heavy', spark: 'warm' };
    for (const p of g.players) if (p.hittable && Math.hypot((p.x - this.x) / 90, (p.y - this.y) / 34) < 1) p.takeHit(this, hd);
    for (const t of g.actors) if (t.team === 'foe' && t.hittable && Math.hypot((t.x - this.x) / 90, (t.y - this.y) / 34) < 1) t.takeHit(this, { ...hd, dmg: this.batted ? 20 : 10 });
  }
  draw(ctx) {
    const art = CHARS.kobold;
    ctx.save(); ctx.translate(this.sx, this.sy);
    if (art?.drawBomb) art.drawBomb(ctx, this.game.time, this.fuse / this.fuse0);
    else { ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(0, -8, 9, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
}

/** ball lightning (storm whelp) — straight shot */
export class Spark extends EnemyShot {
  constructor(game, x, y, z, dir) { super(game, x, y, z, dir); this.vx = dir * 4.8; }
  update() {
    this.tick();
    this.x += this.vx; this.z += Math.sin(this.st * 0.3) * 0.6;
    if (this.hitPlayers({ dmg: 9, kind: 'light', push: 3, stun: 20, stop: 4, sfx: 'hit_light', spark: 'cool' })) { this.gone = true; this.game.fx.spark(this.x, this.y, this.z, true, 'cool'); return; }
    if (--this.life <= 0 || this.offscreen()) this.gone = true;
  }
  draw(ctx) {
    const art = CHARS.whelp;
    ctx.save(); ctx.translate(this.sx, this.sy);
    if (art?.drawSpark) art.drawSpark(ctx, this.game.time);
    else { ctx.fillStyle = '#bfe8ff'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
}

/** green fireball from a kobold shaman: slow, gently homing */
export class ShamanFire extends EnemyShot {
  constructor(game, x, y, z, dir, target) { super(game, x, y, z, dir); this.vx = dir * 3.4; this.target = target; this.life = 220; }
  update() {
    this.tick();
    const T = this.target;
    if (T && !T.out) { this.vy += Math.sign(T.y - this.y) * 0.04; this.vy = Math.max(-1.2, Math.min(1.2, this.vy)); }
    this.x += this.vx; this.y += this.vy; this.clampDepth();
    if (this.st % 3 === 0) this.game.fx.flames(this.x - this.vx * 2, this.y, this.z - 4, 1, { green: true, scale: 0.6 });
    if (this.hitPlayers({ dmg: 10, kind: 'light', push: 3, stun: 18, stop: 4, sfx: 'hit_light', spark: 'green' })) { this.gone = true; this.game.fx.flames(this.x, this.y, this.z, 8, { green: true }); return; }
    if (--this.life <= 0 || this.offscreen()) this.gone = true;
  }
  draw(ctx) {
    const t = this.game.time;
    ctx.save(); ctx.translate(this.sx, this.sy); ctx.scale(this.facing, 1);
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(80,255,120,0.25)'; ctx.beginPath(); ctx.arc(0, 0, 24 + Math.sin(t * 30) * 2, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = prev;
    ctx.beginPath();
    ctx.moveTo(16, 0); ctx.bezierCurveTo(14, -12, -6, -14, -26, -4 + Math.sin(t * 25) * 3);
    ctx.bezierCurveTo(-10, 0, -10, 2, -26, 6 + Math.cos(t * 23) * 3); ctx.bezierCurveTo(-6, 14, 14, 12, 16, 0);
    ctx.fillStyle = '#2fbf4f'; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = '#9dff7a'; ctx.beginPath(); ctx.ellipse(4, 0, 9, 7, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
}
