// The secret FORMS' own mechanics and auras (src/heroes.js HEROES.archmage / legend / pirate; hero.form).  src/player.js
// calls in at a few points -- a swing's active frames (swingStart / swingEnd), a dodge starting, SHOOT held, the charged
// spell, the super, each tick and the drawing -- and everything else here is plain actors:
//   ARCHMAGE ANASTASIA: StarBolt (atk1-3: a star bolt ahead, piercing one foe), CrystalBurst (atk4: a crystal burst that
//     bursts on its first foe), the GRAND BEAM (projectiles.js Beam, S.grand), GRAND CRYSTAL NOVA (two rings of shards),
//     STARFALL+ (a fourth round of stars -- not on a boss -- and more stars in the sky); a golden-white aura.
//   LEGEND SHADOW: slash waves the width of the screen in his lane on every melee swing (each foe once a swing, 0.8x;
//     a boss half that), RAPID SHURIKENS (SHOOT held: one every 8 frames), the DUMMY a dodge leaves (foes near go for it,
//     then it explodes); midnight-and-gold speed trails and a glowing scarf.
//   PIRATE QUEEN SCARLET: the flintlock (atk4: a spark cone ahead), the GOLDEN HOOK (reels in up to three), CANNON VOLLEY
//     (her charged spell: cannonballs arcing in from off screen onto the foes), BROADSIDE (her super: a ship across the
//     background firing on every foe on screen, her cyclone's damage), the parrot (pecks the nearest foe every 2 s), a
//     smoke puff where a roll starts (stuns the foes round it); gold glints, sea spray and a shimmering cutlass.
// Kept fair: a boss takes a share of the wide hits, every charged spell keeps its meter budget (SPELL_METER), and the
// meter fed by the extra hits is budgeted per swing.
import { Actor, boxOf } from './actors.js';
import { HeroShot, Shuriken, GrappleHook, Shard, Star, novaBurst } from './projectiles.js';
import { audio } from './audio-proxy.js';
import { W, FLOOR_TOP, INK, DEPTH } from './config.js';
import { TAU, clamp } from './rig.js';
import { drawGalleon } from './galleon.js';
import { spriteArt } from './sprite3d.js';

// the forms' painted props (painter 3, item 9): the Pirate Queen's parrot and Legend Shadow's dummy -- each drawn from its pack
// while that is decoded (src/artsets.js levelArt: in the set only while the form plays), else by the canvas code below
const PROP = {};
for (const n of ['pq_parrot', 'legend_dummy']) spriteArt(n, { fallback: null, only: 'painted' }).then((a) => { if (a && a.ATLAS_SCALE) PROP[n] = a; }).catch(() => {});
/** the prop's art when its clip can be drawn now (its pack decoded), else null */
const propArt = (n, clip) => { const A = PROP[n]; return A && A.hasNow?.(clip) ? A : null; };

const rnd = (a, b) => a + Math.random() * (b - a);
const foesOn = (g) => g.actors.filter((t) => t.team === 'foe' && t.hittable && t.x > g.camX - 30 && t.x < g.camX + W + 30);
/** a set that shares a meter budget across the hits it's attached to (Player.landed: hd.spell) */
const budget = (n) => { const s = new Set(); s.meterLeft = n; return s; };
/** two-tone cel shading, as the painted art has: the shape in `dark`, then again in `base` nudged toward the light (up
 * and left) -- a shadow crescent left on the far side; inked after by the caller */
function cel2(ctx, shape, base, dark, dx = 5, dy = 4) {
  ctx.save(); ctx.beginPath(); shape(); ctx.clip();
  ctx.fillStyle = dark; ctx.beginPath(); shape(); ctx.fill();
  ctx.translate(-dx, -dy); ctx.fillStyle = base; ctx.beginPath(); shape(); ctx.fill();
  ctx.restore();
}
const SWING_METER = 14;            // the most meter one swing's extra hits (blasts, waves) can feed
const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');

/** hit t for p with hd (a crit window applies), meter through hd.spell */
function hitFoe(p, t, hd, key) {
  const H = p.critHd ? p.critHd(t, hd, key) : hd;
  if (t.takeHit(p, H) && t.team === 'foe') { p.landed(t, { ...H, box: null }); return true; }
  return false;
}

// ================================================================================================ ARCHMAGE ANASTASIA
/** a star bolt from her staff: fast, piercing `pierce` foes after the first; golden-white with a sparkling tail */
export class StarBolt extends HeroShot {
  constructor(game, owner, x, y, z, dir, B, spell) {
    super(game, owner, x, y, z); this.formFx = true;
    this.vx = dir * 13; this.vy = 0; this.facing = dir; this.B = B; this.left = 1 + (B.pierce || 0); this.life = 26; this.spell = spell;   // (~340 px)
    this.w = 10;
  }
  update() {
    this.tick();
    const g = this.game;
    this.x += this.vx;
    if (this.st % 2 === 0) g.fx.rise(this.x - this.vx, this.y, this.z, this.st % 4 ? '#fff3c4' : '#ffd86a');
    if (this.swatShots(14, 18)) { this.pop(); return; }
    const t = this.touching(18, 14, this.skip);
    if (t) {
      this.mark(t);
      hitFoe(this.owner, t, { dmg: t.boss ? Math.round(this.B.dmg * 0.4) : this.B.dmg, kind: 'light', push: 2, stun: 16, stop: 2, hit: 'hit_light', spark: 'gold', ember: 3, spell: this.spell, chip: true }, this);
      g.fx.add({ type: 'star', x: this.x, y: this.y, z: this.z + 4, vz: 1.4, life: 22, r: 8, col: '#ffe066' });
      if (--this.left <= 0) { this.pop(); return; }
    }
    if (--this.life <= 0 || this.offscreen()) this.gone = true;
  }
  pop() { this.gone = true; this.game.fx.spark(this.x, this.y, this.z, false, 'gold'); }
  draw(ctx) {
    const sx = this.sx, sy = this.sy, t = this.game.time;
    ctx.save(); ctx.translate(sx, sy);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,230,150,0.55)'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-this.facing * 46, 0); ctx.stroke();
    ctx.fillStyle = 'rgba(255,240,190,0.4)'; ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.rotate(t * 12);
    star(ctx, 0, 0, 12, 5, '#fffbe8', '#9a6a10');
    ctx.restore();
  }
}
/** the finisher's big crystal burst: flies ahead, bursts on the first foe (or at its range) hitting all round it */
export class CrystalBurst extends HeroShot {
  constructor(game, owner, x, y, z, dir, B, spell) {
    super(game, owner, x, y, z); this.formFx = true;
    this.vx = dir * 10; this.facing = dir; this.B = B; this.life = 34; this.spell = spell; this.w = 16;
  }
  update() {
    this.tick();
    const g = this.game;
    this.x += this.vx;
    if (this.st % 2 === 0) { g.fx.rise(this.x - this.vx, this.y, this.z, '#bff0ff'); g.fx.rise(this.x - this.vx, this.y, this.z + 8, '#ffd86a'); }
    this.swatShots(20, 24);
    if (this.touching(22, 20) || --this.life <= 0 || this.offscreen()) this.burst();
  }
  burst() {
    const g = this.game, p = this.owner, set = new Set();
    this.gone = true;
    g.fx.ring(this.x, this.y, { rx: 96, ry: 36, shock: true, gold: true, life: 20 });
    g.fx.ring(this.x, this.y, { rx: 60, ry: 22, shock: true, blue: true, life: 16 });
    g.fx.flare(this.x, this.y, this.z, 90, 12, '#ffe9a0');
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.fx.add({ type: 'star', x: this.x + Math.cos(a) * 20, y: this.y + Math.sin(a) * 8, z: this.z, vx: Math.cos(a) * 3.5, vz: 1 + Math.random() * 2, life: 26, r: 8, col: i % 2 ? '#ffe066' : '#bff0ff' }); }
    audio.sfx('hit_finisher', { pitch: 1.2, vol: 0.8 });
    g.shake = Math.max(g.shake, 5);
    for (const t of foesOn(g)) {
      if (set.has(t)) continue;
      const ex = (t.x - this.x) / 100, ey = (t.y - this.y) / 40;
      if (ex * ex + ey * ey > 1 || t.z > 170) continue;
      set.add(t);
      hitFoe(p, t, { dmg: t.boss ? Math.round(this.B.dmg * 0.5) : this.B.dmg, kind: 'knock', push: 5.5, lift: 5.5, stop: 5, hit: 'hit_heavy', spark: 'gold', word: 'heavy', ember: 4, thrown: false, spell: this.spell }, this);
    }
  }
  draw(ctx) {
    const sx = this.sx, sy = this.sy, t = this.game.time;
    ctx.save(); ctx.translate(sx, sy);
    ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createRadialGradient(0, 0, 2, 0, 0, 34); gr.addColorStop(0, 'rgba(255,250,220,0.95)'); gr.addColorStop(0.5, 'rgba(160,220,255,0.5)'); gr.addColorStop(1, 'rgba(255,210,110,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 34, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.rotate(t * 4);
    for (let i = 0; i < 4; i++) {
      ctx.rotate(TAU / 4);
      ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(6, -4); ctx.lineTo(0, 2); ctx.lineTo(-6, -4); ctx.closePath();
      ctx.fillStyle = i % 2 ? '#bff0ff' : '#fff3c4'; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.stroke();
    }
    ctx.restore();
  }
}
/** a five-pointed star path, filled and inked */
function star(ctx, x, y, ro, ri, fill, line) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? ri : ro, a = -Math.PI / 2 + (i * Math.PI) / 5; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = line; ctx.stroke();
}
/** GRAND CRYSTAL NOVA's second ring: twelve more shards a beat after the first (no meter of its own -- the spell's
 * budget was the first ring's) */
class NovaEcho extends Actor {
  constructor(game, owner, cx, y, C) { super(game, cx, y); this.owner = owner; this.C = C; this.team = 'fx'; this.solid = false; this.formFx = true; }
  get hittable() { return false; }
  takeHit() { return false; }
  drawShadow() {}
  draw() {}
  update() {
    this.tick();
    if (this.st < 18) return;
    const g = this.game, vol = budget(0);
    for (const t of g.actors) if (t.team === 'foe' && t.boss) vol.add(t);   // (a boss: the first ring only -- gameplay critic r1)
    g.fx.ring(this.x, this.y, { rx: 230, ry: 82, shock: true, gold: true, life: 24 });
    g.fx.ring(this.x, this.y, { rx: 150, ry: 54, shock: true, blue: true, life: 20 });
    audio.sfx('charge_release', { pitch: 1.2, vol: 0.8 });
    for (let i = 0; i < 12; i++) { const s = new Shard(g, this.owner, this.x, this.y, 34, ((i + 0.5) / 12) * TAU, this.C, vol); s.range = 460; g.actors.push(s); }
    this.gone = true;
  }
}

// ================================================================================================ LEGEND SHADOW
/** the slash wave a Legend Shadow swing sends across the screen in his lane: a bright crescent streaking each way */
class SlashWave extends Actor {
  constructor(game, x, y, z, dir, col) { super(game, x, y); this.z = z; this.dir = dir; this.col = col; this.team = 'fx'; this.solid = false; this.life = 14; }
  get hittable() { return false; }
  takeHit() { return false; }
  drawShadow() {}
  update() { this.tick(); if (this.st >= this.life) this.gone = true; }
  draw(ctx) {
    const g = this.game, u = this.st / this.life, y = FLOOR_TOP + this.y - this.z;
    ctx.save(); ctx.lineJoin = 'round';
    for (const d of [this.dir, -this.dir]) {
      const x0 = this.x - g.camX + d * 24, edge = d > 0 ? W + 60 : -60, x1 = x0 + (edge - x0) * Math.min(1, u * 1.7);
      const a = (1 - u) * (d === this.dir ? 1 : 0.6), L = x1 - x0;
      if (Math.abs(L) < 4) continue;
      const crescent = (th, col) => {          // (thick in the middle, tapered at both ends, bowed up)
        ctx.beginPath();
        for (let i = 0; i <= 12; i++) { const k = i / 12; ctx.lineTo(x0 + L * k, y - Math.sin(k * Math.PI) * (10 + th * 0.5)); }
        for (let i = 12; i >= 0; i--) { const k = i / 12; ctx.lineTo(x0 + L * k, y - Math.sin(k * Math.PI) * (10 + th * 0.5) + Math.sin(k * Math.PI) * th); }
        ctx.closePath(); ctx.fillStyle = col; ctx.fill();
      };
      ctx.globalAlpha = a;
      crescent(16, 'rgba(42,47,107,0.55)');
      crescent(11, '#e8b830');
      crescent(5, '#fffbea');
    }
    ctx.restore();
  }
}
/** the training DUMMY a Legend Shadow dodge leaves where he stood: straw, a burlap head, his glowing scarf.  Foes close
 * by go for it; after `life` frames it EXPLODES (a puff, confetti straw, a ring). */
export class Dummy extends Actor {
  constructor(game, owner, x, y, D) {
    super(game, x, y);
    this.owner = owner; this.D = D; this.team = 'decoy'; this.solid = false; this.w = 22; this.h = 120; this.shadowR = 26; this.formFx = true;
    this.facing = owner.facing; this.out = false; this.ctl = false; this.hp = this.maxHp = 999; this.hits = 0;
  }
  get hittable() { return this.alive && !this.out; }
  get down() { return false; }
  /** a foe's blow lands on straw: a puff, no harm; a hero's passes through */
  takeHit(att) {
    if (!this.alive || this.out || !att || att.team === 'hero') return false;
    this.flash = 6; this.hits++; this.wob = 12;
    this.game.fx.debris(this.x, this.y, 70, ['#e8c66a', '#c9a24a', '#fff0b0'], 4);
    audio.sfx('hit_light', { pitch: 1.4, vol: 0.5 });
    return true;
  }
  update() {
    this.tick();
    if (this.wob > 0) this.wob--;
    const g = this.game, D = this.D;
    if (this.st === 1 || this.st % 10 === 0) {         // (foes close by go for it while it stands)
      for (const t of g.actors) if (t.team === 'foe' && t.alive && !t.boss && Math.abs(t.x - this.x) < D.r && Math.abs(t.y - this.y) < D.r * 0.4) { t._tgt = this; t._tgtUntil = g.frame + (D.life - this.st) + 2; }
    }
    if (this.st >= D.life) this.explode();
  }
  explode() {
    const g = this.game, B = this.D.boom, p = this.owner;
    this.out = true; this.alive = false; this.gone = true;
    for (const t of g.actors) if (t._tgt === this) t._tgt = null;
    g.fx.poof(this.x, this.y, 40, true);
    g.fx.explosion(this.x, this.y);
    g.fx.ring(this.x, this.y, { rx: B.rx, ry: B.ry, shock: true, gold: true, life: 22 });
    g.fx.debris(this.x, this.y, 60, ['#e8c66a', '#c9a24a', '#fff0b0', '#ffcf4a', '#2a2050'], 16);
    for (let i = 0; i < 10; i++) g.fx.add({ type: 'star', x: this.x + rnd(-30, 30), y: this.y, z: 40 + rnd(0, 60), vx: rnd(-4, 4), vz: rnd(1, 3), life: 30, r: 5, col: i % 2 ? '#ffcf4a' : '#e8c66a' });
    g.fx.word(this.x, this.y, 150, true, 'KA-POOF!');
    audio.sfx('explosion', { pitch: 1.2 });
    g.shake = Math.max(g.shake, 8);
    const set = budget(SWING_METER);
    for (const t of g.actors) {
      if (t.team !== 'foe' || !t.hittable || set.has(t)) continue;
      const ex = (t.x - this.x) / B.rx, ey = (t.y - this.y) / B.ry;
      if (ex * ex + ey * ey > 1 || t.z > 160) continue;
      set.add(t);
      hitFoe(p, t, { dmg: t.boss ? Math.round(B.dmg * 0.5) : B.dmg, kind: 'knock', push: 7, lift: 7, stop: 6, hit: 'hit_finisher', word: 'heavy', ember: 6, thrown: true, spell: set }, set);
    }
  }
  drawShadow(ctx) { super.drawShadow?.(ctx); }
  draw(ctx) {
    // (painted: the pack's idle sway / hit wobble, feet at the post's base; the countdown blink and the hit flash over it)
    const A = propArt('legend_dummy', this.wob > 0 ? 'hit' : 'idle');
    if (A) {
      const g = this.game, x = this.sx, y = this.sy, tick = this.D.life - this.st < 20 && (this.st >> 1) % 2;
      const pose = this.wob > 0 ? A.ANIM.hit(1 - this.wob / 12) : A.ANIM.idle(g.time);
      ctx.save(); ctx.translate(x, y); A.draw(ctx, pose, { facing: 1, t: g.time, scale: 1 }); ctx.restore();
      if (tick || this.flash > 0) { ctx.save(); ctx.globalAlpha = this.flash > 0 ? 0.5 : 0.35; ctx.fillStyle = tick && !this.flash ? '#fff6d0' : '#fff'; ctx.beginPath(); ctx.ellipse(x, y - 80, 30, 60, 0, 0, TAU); ctx.fill(); ctx.restore(); }
      return;
    }
    this.drawCanvas(ctx);
  }
  /** the canvas dummy (its pack not decoded) */
  drawCanvas(ctx) {
    const g = this.game, x = this.sx, y = this.sy, t = g.time, f = this.facing;
    const w = this.wob ? Math.sin(this.wob * 1.4) * 0.12 : Math.sin(t * 2) * 0.03, tick = this.D.life - this.st < 20 && (this.st >> 1) % 2;
    ctx.save(); ctx.translate(x, y); ctx.rotate(w); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.lineWidth = 3; ctx.strokeStyle = INK;
    ctx.fillStyle = '#7a5230'; ctx.fillRect(-4, -70, 8, 70); ctx.strokeRect(-4, -70, 8, 70);            // the post
    ctx.fillStyle = '#7a5230'; ctx.fillRect(-34, -84, 68, 7); ctx.strokeRect(-34, -84, 68, 7);         // the cross-bar
    const bodyS = () => ctx.ellipse(0, -76, 26, 34, 0, 0, TAU);
    cel2(ctx, bodyS, tick ? '#fff6d0' : '#e2bc62', tick ? '#f0dca0' : '#b8913e', 7, 4);
    ctx.beginPath(); bodyS(); ctx.stroke();                                                               // the straw body
    ctx.strokeStyle = '#a07a2a'; ctx.lineWidth = 1.6;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 8, -104); ctx.lineTo(i * 9, -48); ctx.stroke(); }
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    const headS = () => ctx.arc(0, -124, 17, 0, TAU);
    cel2(ctx, headS, '#c9a76a', '#9c7c44', 5, 3);
    ctx.beginPath(); headS(); ctx.stroke();                                                               // the burlap head
    for (const ex of [-7, 7]) {                        // (two button eyes, sewn on)
      ctx.fillStyle = '#3a2a4a'; ctx.beginPath(); ctx.arc(ex, -126, 4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#c9a76a'; for (const [bx, by] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) { ctx.beginPath(); ctx.arc(ex + bx, -126 + by, 0.8, 0, TAU); ctx.fill(); }
    }
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(0, -116, 5, 0.2, Math.PI - 0.2); ctx.stroke();
    // his scarf, glowing gold at the edges and flapping
    const fl = Math.sin(t * 9) * 6;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,207,74,0.45)'; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(-14, -106); ctx.quadraticCurveTo(-f * 30, -110 + fl, -f * 52, -100 + fl); ctx.stroke(); ctx.restore();
    ctx.fillStyle = '#5a1a3a'; ctx.beginPath(); ctx.moveTo(-16, -108); ctx.lineTo(16, -108); ctx.lineTo(14, -100); ctx.lineTo(-14, -100); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-f * 12, -104); ctx.quadraticCurveTo(-f * 30, -108 + fl, -f * 50, -98 + fl); ctx.lineTo(-f * 46, -92 + fl); ctx.quadraticCurveTo(-f * 28, -100 + fl, -f * 10, -98); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    if (this.flash > 0) { ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x, y - 80, 30, 60, 0, 0, TAU); ctx.fill(); ctx.restore(); }
  }
}

// ================================================================================================ PIRATE QUEEN SCARLET
/** the GOLDEN HOOK: out to 1.5x the range, snagging up to `reel` foes on the way (a boss or a heavy is only hit), then
 * reels them all in to her side */
export class GoldenHook extends GrappleHook {
  constructor(game, owner, x, y, z, dir, S, opts = {}) { super(game, owner, x, y, z, dir, S, opts); this.grabs = []; this.spellSet = budget(35); }
  update() {
    const g = this.game, o = this.owner;
    if (this.mode !== 'out' && this.mode !== 'reelAll') { super.update(); return; }
    this.tick();
    if (!o.alive || o.out || ['hurt', 'fly', 'down'].includes(o.state)) { this.gone = true; return; }
    if (this.mode === 'out') {
      this.x += this.vx; this.y += this.vy;
      if (this.st % 2 === 0) g.fx.rise(this.x, this.y, this.z, '#ffd86a');
      this.swatShots(16, 18);
      for (let t = this.touching(18, 12, this.skip); t; t = this.touching(18, 12, this.skip)) {
        this.mark(t);
        const big = t.boss || t.heavy || t.state === 'guard';
        hitFoe(this.owner, t, { dmg: this.dmgOn(t), kind: 'light', push: 0, stun: big ? 16 : 46, stop: 2, hit: 'hit_light', spark: 'gold', ember: this.S.ember ?? 11, spell: this.spellSet }, this);
        if (!big && t.alive) { this.grabs.push(t); g.fx.word(t.x, t.y, (t.z || 0) + 120, false, 'YOINK!'); }
        audio.sfx('shuriken_hit', { pitch: 0.75 + this.grabs.length * 0.1, vol: 0.8 });
        if (this.grabs.length >= (this.S.reel || 3)) break;
      }
      const far = Math.hypot(this.x - this.x0, (this.y - this.y0) * 2.4) > this.S.range || this.offscreen();
      if (this.grabs.length >= (this.S.reel || 3) || far) { this.mode = this.grabs.length ? 'reelAll' : 'back'; this.reelT = 0; }
    } else {
      const side = Math.sign(this.vx) || o.facing;
      this.grabs = this.grabs.filter((t) => t.alive && !t.gone);
      this.grabs.forEach((t, i) => {
        const tx = o.x + side * (74 + i * 46), ty = o.y + (i - 1) * 14;
        t.x += (tx - t.x) * 0.24; t.y += (ty - t.y) * 0.2; t.vx = 0;
      });
      const lead = this.grabs[this.grabs.length - 1];
      if (lead) { this.x = lead.x - o.facing * 10; this.y = lead.y; }
      if (++this.reelT > 28 || !this.grabs.length) { this.grabs = []; this.gone = true; }
    }
  }
  draw(ctx) {
    super.draw(ctx);
    const sx = this.sx, sy = this.sy;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,214,100,0.45)'; ctx.beginPath(); ctx.arc(sx, sy, 16 + Math.sin(this.game.time * 20) * 2, 0, TAU); ctx.fill();
    ctx.restore();
  }
}
/** one cannonball of CANNON VOLLEY: in from off screen behind her on a high arc, onto (tx, ty); a splash where it lands */
class CannonBall extends HeroShot {
  constructor(game, owner, tx, ty, delay, vol, dmg) {
    const g = game, from = owner.facing > 0 ? g.camX - 60 : g.camX + W + 60;
    super(game, owner, from, ty, 150);
    this.x0 = from; this.tx = tx; this.ty = ty; this.delay = delay; this.dur = 38; this.vol = vol; this.dmg = dmg; this.facing = Math.sign(tx - from) || 1; this.formFx = true;
  }
  update() {
    this.tick();
    if (this.st < this.delay) { this.z = 9999; return; }
    const g = this.game, u = Math.min(1, (this.st - this.delay) / this.dur);
    if (this.st === this.delay) audio.sfx('ballista', { pitch: 0.8, vol: 0.6 });
    this.x = this.x0 + (this.tx - this.x0) * u; this.y = this.ty; this.z = 150 * (1 - u) + 90 * Math.sin(Math.PI * u);   // (under the HUD band)
    if (this.st % 3 === 0) g.fx.add({ type: 'smoke', x: this.x, y: this.y, z: this.z, vx: 0, vz: 0.4, r: 7, life: 14, col: '#8a8696', col2: '#6e6a7a' });
    if (u >= 1) {   // (a hero moved under it: it lands a little further on)
      for (const q of g.players) if (!q.out && Math.abs(q.x - this.x) < 110 && Math.abs(q.y - this.y) < 40) this.x += (this.x >= q.x ? 1 : -1) * (110 - Math.abs(q.x - this.x));
      this.land();
    }
  }
  land() {
    const g = this.game, p = this.owner;
    this.gone = true;
    g.fx.explosion(this.x, this.y);
    g.fx.ring(this.x, this.y, { rx: 80, ry: 30, shock: true, life: 18 });
    g.fx.debris(this.x, this.y, 10, ['#5a4a3a', '#8a7050', '#2a2228'], 8);
    audio.sfx('explosion', { vol: 0.7, pitch: 0.9 + Math.random() * 0.2 });
    g.shake = Math.max(g.shake, 6);
    for (const t of g.actors) {
      if (t.team !== 'foe' || !t.hittable) continue;
      const ex = (t.x - this.x) / 80, ey = (t.y - this.y) / 32;
      if (ex * ex + ey * ey > 1 || t.z > 150) continue;
      const n = this.vol.hits.get(t) || 0;
      if (n >= 2) continue;                              // (two balls on one foe at the most)
      this.vol.hits.set(t, n + 1);
      hitFoe(p, t, { dmg: this.dmg, kind: 'knock', push: 6, lift: 6, stop: 5, hit: 'hit_heavy', word: 'heavy', ember: 6, thrown: false, spell: this.vol }, this.vol);
    }
  }
  draw(ctx) {
    if (this.st < this.delay) return;
    const sx = this.sx, sy = this.sy;
    ctx.save();
    ctx.fillStyle = 'rgba(20,14,30,0.25)'; ctx.beginPath(); ctx.ellipse(sx, FLOOR_TOP + this.y, 16, 5, 0, 0, TAU); ctx.fill();
    const gr = ctx.createRadialGradient(sx - 4, sy - 4, 1, sx, sy, 13); gr.addColorStop(0, '#8a8898'); gr.addColorStop(0.35, '#3a3842'); gr.addColorStop(1, '#16141c');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, sy, 13, 0, TAU); ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.stroke();
    ctx.restore();
  }
}
/** BROADSIDE's ship: a pirate galleon slides across the background (behind everything) and fires its guns, a flash a gun;
 * three rounds over every foe on screen (her cyclone's damage: 13, 13, 13 -- the last a knockdown) */
export class BroadsideShip extends Actor {
  constructor(game, owner) {
    super(game, owner.x, -400);
    this.owner = owner; this.team = 'fx'; this.solid = false; this.sortY = -9999; this.dir = owner.facing;
    this.flashes = [];
  }
  get hittable() { return false; }
  takeHit() { return false; }
  drawShadow() {}
  update() { if (this.owner.state !== 'special' || !this.game.players.includes(this.owner)) this.gone = true; }
  draw(ctx) {
    const p = this.owner, g = this.game, S = p.hero.special, u = clamp(p.st / S.dur, 0, 1);
    if (p.state !== 'special' || this.gone) return;
    const d = this.dir, x = d > 0 ? -260 + (W + 520) * u : W + 260 - (W + 520) * u, y = FLOOR_TOP - 34 + Math.sin(g.time * 2) * 4;
    ctx.save(); ctx.translate(x, y); ctx.scale(d, 1); ctx.lineJoin = 'round';
    ctx.globalAlpha = Math.min(1, Math.min(u, 1 - u) * 8);
    drawGalleon(ctx, g.time);   // (src/galleon.js: the hull, sails, flag and the sea)
    ctx.restore();
    // the guns' flashes (the rounds: src/player.js special() -> broadside())
    for (const F of this.flashes) {
      if (g.time < F.t) continue;
      const k = Math.min(1, 1 - (g.time - F.t) / 0.25);
      if (k <= 0) continue;
      const fx = x + d * (-113 + F.i * 46), fy = y - 18;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(fx, fy, 2, fx, fy, 40 * k + 10); gr.addColorStop(0, `rgba(255,250,210,${k})`); gr.addColorStop(1, 'rgba(255,170,60,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(fx, fy, 40 * k + 10, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.fillStyle = `rgba(230,225,215,${0.6 * k})`; ctx.beginPath(); ctx.arc(fx + d * 20, fy - 6, 16 * (1.4 - k), 0, TAU); ctx.fill();
    }
    this.flashes = this.flashes.filter((F) => g.time - F.t < 0.3);
  }
}
/** her parrot: flies round her, and every 2 s pecks the nearest foe within reach (small damage, a squawk); never hurt */
export class Parrot extends Actor {
  constructor(game, owner) {
    super(game, owner.x, owner.y);
    this.owner = owner; this.team = 'ally'; this.solid = false; this.z = 150; this.cool = 60; this.mode = 'fly'; this.facing = owner.facing;
  }
  get hittable() { return false; }
  takeHit() { return false; }
  drawShadow() {}
  update() {
    this.tick();
    const p = this.owner, g = this.game, P = p.hero.parrot;
    if (!P || p.gone || !g.players.includes(p) || p.out) { this.gone = true; return; }
    if (this.cool > 0) this.cool--;
    if (this.mode === 'fly') {
      const swing = ['atk', 'runAtk', 'cstrike', 'charge', 'special'].includes(p.state);
      // (above and behind her head: never over her face -- in her jump too, risen with her: her height over the ground added,
      //  and while she's in the air never lower than a clear gap over her hat (critic pass 3: over her face at f10-16 of a
      //  jump, across her waist at f18-30, eased from the ground's height))
      // (her dodges: the back-dodge's flip rises in its drawings, ~200 px over her feet at its top, and passes under it --
      //  critic 3A: over her at f8-13, perched on the hat at f14-16 -- so it climbs clear while she dodges, quickly but eased)
      const lift = Math.max(0, p.z || 0), base = swing ? 204 : 186, H = p.art?.META?.height || 176, dodge = p.state === 'dodge';
      const a = g.time * 1.6, tx = p.x - p.facing * (swing ? 64 : 52) + Math.cos(a) * 34, ty = p.y + Math.sin(a) * 8, tz = (dodge ? Math.max(base, H + 60) : base) + Math.sin(a * 2) * 10 + lift;
      this.x += (tx - this.x) * 0.12; this.y += (ty - this.y) * 0.12; this.z += (tz - this.z) * (dodge && tz > this.z ? 0.35 : 0.12);
      if (lift > 0) this.z = Math.max(this.z, lift + Math.max(base - 10, H + 16));
      this.facing = tx > this.x + 1 ? 1 : tx < this.x - 1 ? -1 : this.facing;
      if (this.cool <= 0 && p.ctl && !g.cut) {
        let best = null, bd = P.r;
        for (const t of foesOn(g)) { const d = Math.hypot(t.x - p.x, (t.y - p.y) * 2); if (d < bd && t.z < 200) { bd = d; best = t; } }
        if (best) { this.target = best; this.mode = 'dive'; this.st = 0; } else this.cool = 20;
      }
    } else if (this.mode === 'dive') {
      const t = this.target;
      if (!t || !t.alive || this.st > 40) { this.mode = 'fly'; this.cool = P.every; return; }
      const tz = (t.z || 0) + (t.h || 100) * 0.8;
      this.x += (t.x - this.x) * 0.25; this.y += (t.y - this.y) * 0.25; this.z += (tz - this.z) * 0.25;
      this.facing = t.x >= this.x ? 1 : -1;
      if (Math.abs(t.x - this.x) < 18 && Math.abs(t.y - this.y) < 14) {
        if (t.hittable) { const hd = { dmg: P.dmg, kind: 'light', push: 0.6, stun: 10, stop: 1, hit: 'hit_light', spark: 'warm', ember: 2, chip: true }; if (t.takeHit(p, hd)) p.landed(t, { ...hd, box: null }); }   // (never the crit)
        g.fx.word(t.x, t.y, tz + 40, false, 'SQUAWK!');
        audio.sfx('whelp_chirp', { pitch: 1.8, vol: 0.7 });
        this.mode = 'fly'; this.cool = P.every;
      }
    }
  }
  draw(ctx) {
    // (painted: the pack's fly loop, or its dive -- beak-first by the end -- about the body's centre, the right view mirrored)
    const dive = this.mode === 'dive', A = propArt('pq_parrot', dive ? 'dive' : 'fly');
    if (A) {
      const g = this.game, pose = dive ? A.ANIM.dive(clamp(this.st / 24, 0, 1)) : A.ANIM.fly(g.time);
      ctx.save(); ctx.translate(this.sx, this.sy); A.draw(ctx, pose, { facing: this.facing, t: g.time, scale: 1 }); ctx.restore();
      return;
    }
    this.drawCanvas(ctx);
  }
  /** the canvas parrot (its pack not decoded) */
  drawCanvas(ctx) {
    const g = this.game, x = this.sx, y = this.sy, t = g.time, flap = Math.sin(t * 18) * 0.7;
    ctx.save(); ctx.translate(x, y); ctx.scale(this.facing, 1); ctx.lineJoin = 'round'; ctx.lineWidth = 2.2; ctx.strokeStyle = INK;
    ctx.fillStyle = '#2f9a4a'; ctx.beginPath(); ctx.moveTo(-6, 4); ctx.lineTo(-24, 16); ctx.lineTo(-20, 6); ctx.closePath(); ctx.fill(); ctx.stroke();   // tail
    const bodyS = () => ctx.ellipse(0, 0, 11, 8, -0.3, 0, TAU), headS = () => ctx.arc(9, -6, 6, 0, TAU);
    cel2(ctx, bodyS, '#e8333f', '#a81e2c', 3, 3); ctx.beginPath(); bodyS(); ctx.stroke();                                              // body
    ctx.save(); ctx.rotate(-0.4 + flap); ctx.fillStyle = '#2a7ad8'; ctx.beginPath(); ctx.moveTo(-2, -2); ctx.quadraticCurveTo(-6, -22, -16, -18); ctx.quadraticCurveTo(-10, -6, -2, -2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#1a4e9a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-4, -6); ctx.lineTo(-11, -15); ctx.moveTo(-3, -10); ctx.lineTo(-8, -18); ctx.stroke(); ctx.restore();   // wing (its feathers)
    cel2(ctx, headS, '#e8333f', '#a81e2c', 2, 2); ctx.beginPath(); headS(); ctx.stroke();                                              // head
    ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.moveTo(14, -7); ctx.quadraticCurveTo(20, -6, 17, -1); ctx.lineTo(13, -3); ctx.closePath(); ctx.fill(); ctx.stroke();   // beak
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(10, -8, 2.2, 0, TAU); ctx.fill(); ctx.fillStyle = '#16121a'; ctx.beginPath(); ctx.arc(10.6, -8, 1.1, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

// ================================================================================================ the hooks (player.js)
/** a swing's active frames open (st === a0): the Archmage's blast, the Pirate's flintlock */
export function swingStart(p, A) {
  const g = p.game, f = p.facing;
  if (A.blast) {
    const o = p.shootOrigin(), set = budget(SWING_METER), B = A.blast;
    if (B.kind === 'bolt') g.actors.push(new StarBolt(g, p, o.x + f * 20, o.y, o.z, f, B, set));
    else { g.actors.push(new CrystalBurst(g, p, o.x + f * 26, o.y, o.z, f, B, set)); audio.sfx('crystal_pop', { vol: 0.8 }); }   // (was the beam's laser)
    g.fx.flare(o.x + f * 16, o.y, o.z, B.kind === 'bolt' ? 34 : 60, 8, '#ffe9a0');
  }
  if (A.flintlock) {                                   // FLINTLOCK: a spark cone ahead of her, a knockdown
    const F = A.flintlock, o = p.shootOrigin(), set = budget(SWING_METER);
    audio.sfx('explosion', { pitch: 1.6, vol: 0.6 });
    g.fx.flare(o.x + f * 20, o.y, o.z, 60, 10, '#ffe9a0');
    for (let i = 0; i < 14; i++) { const u = Math.random(); g.fx.add({ type: 'star', x: o.x + f * (20 + u * F.len), y: o.y + rnd(-24, 24) * u, z: o.z + rnd(-20, 20) * u, vx: f * rnd(2, 5), vz: rnd(-0.5, 1.5), life: 16, r: 4 + Math.random() * 3, col: i % 3 ? '#ffd86a' : '#fff3c4' }); }
    g.fx.add({ type: 'smoke', x: o.x + f * 30, y: o.y, z: o.z, vx: f * 1.2, vz: 0.6, r: 14, life: 26 });
    for (const t of g.actors) {
      if (t.team !== 'foe' || !t.hittable || p.hitSet.has(t)) continue;
      const dx = (t.x - p.x) * f, dy = Math.abs(t.y - p.y);
      if (dx < 0 || dx > F.len || dy > 18 + dx * 0.12 || t.z > 170) continue;
      hitFoe(p, t, { dmg: t.boss ? Math.round(F.dmg * 0.6) : F.dmg, kind: 'knock', push: 7, lift: 6.5, stop: 7, hit: 'hit_finisher', word: 'heavy', shake: 6, ember: 6, thrown: true, spark: 'warm', spell: set }, set);
    }
  }
}
/** a swing's active frames close (st === a1): Legend Shadow's slash wave, across the screen in his lane both ways --
 * each foe the swing didn't already hit, once (0.8x the swing, a boss 0.4x) */
export function swingEnd(p, A) {
  if (!A.wave || !p.atkHit) return;                    // (a swing at the air sends nothing: gameplay critic r1)
  const g = p.game, set = budget(6), knock = A.kind === 'knock';
  g.actors.push(new SlashWave(g, p.x, p.y, 70, p.facing, p.hero.accent));
  audio.sfx('sword_slash', { pitch: 1.3, vol: 0.5 });
  for (const t of g.actors) {
    if (t.team !== 'foe' || !t.hittable || p.hitSet.has(t) || t.x < g.camX - 20 || t.x > g.camX + W + 20 || Math.abs(t.x - p.x) > 420) continue;
    if (Math.abs(t.y - p.y) > 40 + (t.depthR || 0) || t.z > 170) continue;
    p.hitSet.add(t);
    g.fx.slash(t.x, t.y, t.z + t.h * 0.55 + (t.hz0 || 0));
    hitFoe(p, t, { dmg: Math.max(2, Math.round(A.dmg * (t.boss ? 0.4 : 0.8))), kind: knock ? 'knock' : 'light', push: knock ? A.push || 4 : 0, lift: A.lift || 4, stun: knock ? A.stun || 15 : 6, stop: 2, hit: 'sword_slash', spark: 'gold', ember: 2, thrown: false, spell: set, chip: !knock }, set);
  }
}
/** a dodge starts: Legend Shadow's DUMMY where he stood, the Pirate's smoke puff (stuns the foes round it) */
export function dodgeStart(p) {
  const g = p.game, H = p.hero;
  if (H.decoy) {
    for (const a of g.actors) if (a instanceof Dummy && a.owner === p && !a.out) { a.out = true; a.gone = true; g.fx.poof(a.x, a.y, 40, false); for (const t of g.actors) if (t._tgt === a) t._tgt = null; }
    g.actors.push(new Dummy(g, p, p.x, p.y, H.decoy));
    g.fx.poof(p.x, p.y, 30, false);
    p.decoys = (p.decoys || 0) + 1;
  }
  if (H.smoke) {
    const S = H.smoke;
    g.fx.poof(p.x, p.y, 20, true);
    for (let i = 0; i < 6; i++) g.fx.add({ type: 'smoke', x: p.x + rnd(-40, 40), y: p.y + rnd(-10, 10), z: rnd(10, 60), vx: rnd(-0.6, 0.6), vz: 0.5, r: rnd(14, 22), life: 34 });
    let n = 0;
    for (const t of g.actors) if (t.team === 'foe' && t.alive && Math.abs(t.x - p.x) < S.r && Math.abs(t.y - p.y) < S.r * 0.45) { t.daze?.(S.stun); n++; }
    if (n) g.fx.word(p.x, p.y, 130, false, 'COUGH!');
  }
}
/** SHOOT held past the tap with RAPID SHURIKENS (Legend Shadow): one shuriken every `every` frames, rooted, until let go */
export function autoFire(p) {
  const g = p.game, S = p.hero.shoot, F = S.auto;
  p.vx = p.vy = 0;
  if (p.bufD && p.tryDodge()) return;
  if (p.bufS && p.trySpecial()) return;
  if (!p.ctl || !p.ctrl.held.shoot) { p.set('idle'); p.cool = 6; return; }
  p.chargeMove();                                     // (he walks with it, as with a charge)
  if (p.st % F.every === 0) {
    const o = p.chargeWalking ? p.chargePoint(false) : p.shootOrigin(), sh = new Shuriken(g, p, o.x, o.y, o.z, p.facing, (Math.random() - 0.5) * 0.6, { ...S, dmg: F.dmg, bossDmg: F.bossDmg, speed: F.speed, ember: 3, chip: true, noCrit: true });
    g.actors.push(sh);
    audio.sfx('shuriken', { pitch: 1.2 + Math.random() * 0.2, vol: 0.55 });
    p.autoShots = (p.autoShots || 0) + 1;
  }
}
/** the charged spell of a form (true: it's this form's own) */
export function fireCharged(p, o, C, vol) {
  const g = p.game, f = p.facing, H = p.hero;
  if (H.form === 'archmage') {                         // GRAND CRYSTAL NOVA: a bigger burst, twelve bigger shards, then a second ring
    // (the base nova scaled up: ring 1 staggers, ring 2 a beat later knocks down -- 64 on one foe, 88 close by, against
    //  her GRAND BEAM's 8 + 8 + 16 = 32; a boss: ring 1 only and capped at 32, as before)
    const sp = p.art?.SLAM_POINT || [70, 0], cx = p.x + f * sp[0] * 0.5, cp = p.chargePoint(false);
    const NC = { ...C, dmg: 32, ember: 7, light: true, grand: true, big: 1.4, bossCap: 32 }, NC2 = { ...C, dmg: 32, ember: 7, grand: true, big: 1.4, bossCap: 32 };
    g.fx.flare(cp.x, cp.y, cp.z, 70, 10, '#ffd23a');   // (the staff crystal flaring)
    g.fx.ring(cx, p.y, { rx: 210, ry: 74, shock: true, blue: true, life: 24 });
    g.fx.ring(cx, p.y, { rx: 140, ry: 50, shock: true, gold: true, life: 20 });
    g.fx.rays(cx, p.y, 40, '#ffe066', 240, 16);
    novaBurst(g, p, cx, p.y, 140, 50, 24, vol, 'gold');
    for (let i = 0; i < 12; i++) { const s = new Shard(g, p, cx, p.y, 34, (i / 12) * TAU, NC, vol); s.range = 460; g.actors.push(s); }
    g.actors.push(new NovaEcho(g, p, cx, p.y, NC2));
    g.fx.label(p.x, p.y, 220, H.charged.name + '!', '#ffe066', 38, 60);
    return true;
  }
  if (H.form === 'pirate') {                           // CANNON VOLLEY: eight balls over the screen, onto the foes first
    const foes = foesOn(g).filter((t) => Math.abs(t.x - p.x) > 130).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));   // (not the foes right by her: the blasts would bury her)
    const targets = [];
    for (let i = 0; i < 8; i++) {
      const t = foes[i % Math.max(1, foes.length)];
      let q = t && i < foes.length * 2 ? { x: t.x + rnd(-20, 20), y: t.y } : null;
      for (let k = 0; !q && k < 12; k++) { const c = { x: g.camX + 90 + Math.random() * (W - 180), y: rnd(10, DEPTH - 10) }; if (Math.abs(c.x - p.x) > 180) q = c; }   // (no foe: never on her)
      targets.push(q || { x: p.x + p.facing * 260, y: p.y });
    }
    vol.hits = new Map();
    targets.forEach((q, i) => g.actors.push(new CannonBall(g, p, q.x, clamp(q.y, 10, DEPTH - 30), 4 + i * 6, vol, 15)));
    // (and the foes right by her -- the balls never land there: a point-blank blast from her flintlock and the deck gun's
    //  smoke, knocking them out into the volley; 15 on each, as a ball's)
    g.fx.explosion(p.x + f * 70, p.y); g.fx.ring(p.x + f * 50, p.y, { rx: 120, ry: 40, shock: true, col: '#ffd86a', life: 16 });
    for (const t of foesOn(g)) {
      if (Math.abs(t.x - p.x) > 150 || Math.abs(t.y - p.y) > 44 || t.z > 150) continue;
      hitFoe(p, t, { dmg: 15, kind: 'knock', push: 7, lift: 5, stop: 5, hit: 'hit_heavy', word: 'heavy', ember: 6, thrown: false, spell: vol }, vol);
    }
    g.fx.label(p.x, p.y, 220, H.charged.name + '!', '#ffd86a', 38, 60);
    audio.sfx('ballista', { vol: 0.8 });
    return true;
  }
  return false;
}
/** a form's super (true: handled) -- the Pirate's BROADSIDE */
export function special(p) {
  const H = p.hero, S = H.special;
  if (S.kind !== 'broadside') return false;
  const g = p.game, a = Math.round(S.dur * S.key), b = Math.round(S.dur * S.until);
  if (p.st === 1) { p.ship = new BroadsideShip(g, p); g.actors.push(p.ship); audio.sfx('wind_gust', { pitch: 0.8 }); }
  if (p.st === a) { p.superName(p.x, 210, '#ffd86a'); g.rumble(p, 'special'); }
  g.dim = p.st < b ? Math.min(0.32, p.st * 0.02) : Math.max(0, (g.dim || 0) - 0.05);
  const rounds = [a + 6, a + Math.round((b - a) * 0.5), b - 4];
  if (rounds.includes(p.st)) {
    const n = rounds.indexOf(p.st) + 1, foes = g.onScreenFoes();
    for (let i = 0; i < 6; i++) p.ship?.flashes.push({ i, t: g.time + i * 0.03 });
    audio.sfx('explosion', { pitch: 0.75 + n * 0.08 }); g.shake = Math.max(g.shake, 10);
    for (const t of foes) {
      const hd = { dmg: 13, kind: n >= 3 ? 'knock' : 'light', push: n >= 3 ? 6 : 1, lift: 5, stun: 30, stop: 3, hit: 'hit_heavy', special: true, ember: 0, thrown: n >= 3 };
      g.fx.explosion(t.x + rnd(-10, 10), t.y);
      if (p.teamFx) t.flash = 6;
      else if (t.takeHit(p, hd)) p.landed(t, hd);
    }
    if (n >= 3) p.superHit(p.x, p.y, foes.length);
  }
  return true;
}
/** each tick of a form hero: the Pirate's parrot (made when she arrives) */
export function tick(p) {
  const H = p.hero, g = p.game;
  if (H.parrot && (!p.parrot || p.parrot.gone) && !p.out) { p.parrot = new Parrot(g, p); g.actors.push(p.parrot); }
  if (H.form === 'legend' && (p.state === 'run' || p.state === 'runAtk' || p.state === 'dodge' || (p.state === 'walk' && g.frame % 2 === 0)) && g.frame % 3 === 0) {
    p.ghosts.push({ x: p.x, y: p.y, z: p.z, pose: p.pose(), facing: p.facing, at: g.frame, col: (g.frame / 3) % 3 ? '#2a2f6b' : '#c9a030' });
    if (p.ghosts.length > 5) p.ghosts.shift();
  }
}

// ================================================================================================ the auras
// (visual critic r1: soft glows that fade to nothing -- no hard capsules -- saturated gold, small eye glints, a scarf
//  ribbon from the neck, coin glints that are coins, nothing over the faces)
function softGlow(ctx, x, y, rx, ry, rgb, a) {
  ctx.save(); ctx.translate(x, y); ctx.scale(rx / ry, 1);
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, ry);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(0.55, `rgba(${rgb},${a * 0.45})`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, ry, 0, TAU); ctx.fill();
  ctx.restore();
}
/** behind the sprite */
export function auraBack(ctx, p) {
  const H = p.hero, g = p.game, t = g.time, x = p.sx, y = p.sy, h = p.h || 130, f = p.facing;
  if (H.form === 'archmage') {                         // a warm gold light round her, flame-tongues of light rising
    ctx.save();                                        // (painted over, not added: it must show on snow too)
    softGlow(ctx, x, y - h * 0.5, h * 0.72, h * 0.86, '255,180,50', 0.34 + 0.05 * Math.sin(t * 3));
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const u = (t * 0.9 + i / 6) % 1, a = i * 2.39, fx = x + Math.cos(a + t) * h * 0.3, fy = y - 10 - u * h * 0.95;
      const r = (1 - u) * 11 + 3;
      ctx.fillStyle = `rgba(255,${190 + (i % 2) * 30},70,${0.5 * (1 - u)})`;
      ctx.beginPath(); ctx.moveTo(fx - r * 0.6, fy); ctx.quadraticCurveTo(fx, fy - r * 2.2, fx + r * 0.6, fy); ctx.quadraticCurveTo(fx, fy + r * 0.5, fx - r * 0.6, fy); ctx.fill();
    }
    ctx.restore();
  } else if (H.form === 'legend') {                    // (his gold scarf: auraFront; here the sparks off him)
    const moving = Math.abs(p.vx) > 0.5 || p.state === 'dodge' || p.state === 'runAtk';
    ctx.save();
    if (moving) {                                      // gold sparks streaming off him while he moves
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const u = (t * 2.2 + i / 5) % 1, sx = x - f * (14 + u * 70), sy = y - h * (0.45 + (i % 3) * 0.16) + Math.sin(t * 7 + i) * 4;
        ctx.fillStyle = `rgba(255,207,74,${0.75 * (1 - u)})`; ctx.fillRect(sx, sy, 7 * (1 - u) + 3, 2.5);
      }
    }
    ctx.restore();
  } else if (H.form === 'pirate') {                    // a sea-spray swirl at her feet: two teal crescents going round
    ctx.save(); ctx.lineCap = 'round';
    for (let k = 0; k < 2; k++) {
      const a0 = t * 2.6 + k * Math.PI;
      ctx.strokeStyle = 'rgba(120,225,230,0.65)'; ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.ellipse(x, y - 4, 40, 12, 0, a0, a0 + 1.4); ctx.stroke();
      ctx.strokeStyle = 'rgba(235,255,255,0.8)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.ellipse(x, y - 6, 40, 12, 0, a0 + 0.3, a0 + 1.1); ctx.stroke();
    }
    ctx.restore();
  }
}
/** in front of the sprite */
export function auraFront(ctx, p) {
  const H = p.hero, g = p.game, t = g.time, x = p.sx, y = p.sy, h = p.h || 130, f = p.facing;
  if (H.form === 'archmage') {                         // gold motes drifting up beside her curls, small glints in her eyes
    const hx = x + f * 6, hy = y - h * 0.86;
    ctx.save();
    for (let i = 0; i < 6; i++) {                       // (always five or six in the air round her)
      const u = (t * 0.45 + i / 6) % 1, mx = x - f * (30 + Math.abs(Math.sin(t * 2 + i * 1.7)) * 28), my = y - h * 0.3 - u * h * 0.75;   // (behind her: never across her face)
      ctx.fillStyle = `rgba(255,194,58,${0.45 + 0.5 * Math.sin(u * Math.PI)})`; ctx.strokeStyle = 'rgba(120,70,0,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(mx, my, 3 + (i % 2) * 1.3, 0, TAU); ctx.fill(); ctx.stroke();
    }
    const o = p.chargePoint(false), cx = o.x - g.camX, cy = FLOOR_TOP + o.y - o.z, tw = 0.65 + 0.35 * Math.sin(t * 6);   // (a twinkle on the staff's crystal: its landmark)
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,232,150,${0.7 * tw})`;
    ctx.beginPath(); ctx.moveTo(cx, cy - 13 * tw); ctx.lineTo(cx + 2.5, cy); ctx.lineTo(cx, cy + 13 * tw); ctx.lineTo(cx - 2.5, cy); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 13 * tw, cy); ctx.lineTo(cx, cy + 2.5); ctx.lineTo(cx + 13 * tw, cy); ctx.lineTo(cx, cy - 2.5); ctx.closePath(); ctx.fill();
    ctx.restore();
  } else if (H.form === 'legend') {                    // his scarf, a glowing gold ribbon from the neck streaming back at shoulder height
    if (!['idle', 'walk', 'run', 'land', 'atk', 'runAtk', 'shoot', 'auto', 'charge', 'cstrike', 'cutscene', 'victory', 'portal'].includes(p.state)) return;   // (a roll, a fall: the neck isn't up there)
    const moving = Math.abs(p.vx) > 0.5 || p.state === 'dodge' || p.state === 'runAtk';
    const nx = x + f * 4, ny = y - h * 0.79, len = moving ? 92 : 64;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const pts = [];
    for (let k = 0; k <= 8; k++) { const u = k / 8; pts.push([nx - f * len * u, ny + u * (moving ? 4 : 18) + Math.sin(t * 9 - u * 5) * 7 * u]); }
    const draw = (w, col) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); pts.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.stroke(); };
    draw(13, 'rgba(255,207,74,0.35)'); draw(7, '#e8b830'); draw(2.6, '#fff3c4');
    ctx.fillStyle = '#e8b830'; ctx.strokeStyle = '#7a5a10'; ctx.lineWidth = 1.6;                 // (the knot at his neck)
    ctx.beginPath(); ctx.ellipse(nx, ny, 6, 5, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
  } else if (H.form === 'pirate') {                    // gold coin glints round her; a gold glint along the cutlass in a swing
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const k = (t * 0.5 + i / 4) % 1, a = i * 1.9 + t * 0.6, gx = x + Math.cos(a) * h * 0.42, gy = y - h * 0.45 + Math.sin(a * 1.3) * h * 0.35;
      const vis = Math.sin(k * Math.PI);
      if (vis < 0.2 || (Math.abs(gx - (x + f * 6)) < 22 && gy < y - h * 0.7)) continue;   // (never on her face)
      const flip = Math.abs(Math.cos(t * 6 + i));
      ctx.globalAlpha = vis;
      ctx.fillStyle = '#ffc23a'; ctx.strokeStyle = '#8a5a10'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.ellipse(gx, gy, 5 * flip + 0.8, 5, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.ellipse(gx - flip, gy - 1.5, 1.6 * flip + 0.3, 1.6, 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if ((p.state === 'atk' || p.state === 'runAtk' || p.state === 'cstrike') && p.st > 2) {   // (a gold arc along her swing)
      const A = p.hero.atk[p.atk] || p.hero.atk.atk1, k = clamp((p.st - (A.a0 || 3) + 3) / ((A.a1 || 8) - (A.a0 || 3) + 6), 0, 1);
      const cx = x + f * 16, cy = y - h * 0.5, r = h * 0.5, a0 = -1.0, a1 = a0 + 2.0 * k;   // (from her sword hand, down through the swing)
      ctx.lineCap = 'round';
      for (const [w, col] of [[14, 'rgba(255,200,70,0.35)'], [6, 'rgba(255,214,90,0.9)'], [2, '#fff8d8']]) {
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
        for (let i = 0; i <= 10; i++) { const a = a0 + (a1 - a0) * (i / 10); const px = cx + f * Math.cos(a) * r, py = cy + Math.sin(a) * r * 0.8; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
