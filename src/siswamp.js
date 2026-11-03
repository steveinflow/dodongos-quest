// SKULL ISLAND stage 3b, "THE SWAMP OF DESPAIR" (docs/SKULL_ISLAND.md, src/silevels.js): the book's lesson is that FRIENDS and FIRE beat the gloom.
//   SwampTree  a black, gnarled tree with a bark face that walks on its roots and swipes with a branch (a telegraphed ring on the floor).  Normal hits only
//                RATTLE it (a stagger, no damage); FIRE -- Dodongo's fireballs, Anastasia's magic, a charged strike, a super, a team-up, or any hero holding a lit TORCH --
//                sets its crown alight and it runs off yelping.  Saplings are small ones that are faster and swipe softly (the Elder grows them).
//   Root       a root that bursts out of the mud: the Tentacle's three attacks (src/sikraken.js), in bark -- a RED ring = SLAM, a PINK lane = SWEEP, a PURPLE ring = GRAB (mash free).
//   GloomMist  a small, sad rain cloud that drifts over the heroes: whoever it rains on gets droopy (slower) until a FRIEND stands beside them ("I believe in you!").
//   Torch      a standing torch: walk into it and your hits are FIRE for a while (so a party with no Dodongo / Anastasia can scare the trees, too).
//   ElderTree  the boss: a huge tree whose branches fill the screen.  It cannot be hurt -- the way is the book's FIRE RING: a glowing circle appears on the floor; a hero who
//                stands in it and HOLDS the spell button (SHOOT) fills the ring while their friends GUARD them from the roots, the branch lanes and the saplings (a hit on
//                the caster drains it); when it is full an orange-gold FIRE RING blasts out and every tree runs.  Two rings and the Elder sinks back into the bog.
//                Dodongo, singed: "...Remind me never to make you mad."
// Nobody is hurt for real: a root only throws a hero, a branch only bumps, the fire ring hurts no friend.
import { Enemy } from './enemies.js';
import { SIBoss, clipDrawings } from './sibosses.js';
import { Tentacle } from './sikraken.js';
import { Actor, boxOf } from './actors.js';
import { isLight } from './mmworld.js';
import { audio } from './audio-proxy.js';
import { W, DEPTH, FLOOR_TOP, INK } from './config.js';
import { clamp, TAU } from './rig.js';
import { baseOf } from './heroes.js';
import { windSound } from './sitele.js';
import { CHARS } from './chars.js';   // (the painted bark roots: CHARS.swamp_root.drawRoot -- src/chars/swamp_root3d.js)

const rnd = (a, b) => a + Math.random() * (b - a);
/** flash safety: a telegraph's last-moment urgency is a smooth ~1.9 Hz pulse (0.55..1), never an on/off blink */
const pulse = (n) => 0.775 + 0.225 * Math.cos(n * 0.2);
const pick = (a) => a[(Math.random() * a.length) | 0];
const lo = (g) => (g.lane ? g.lane[0] : 6), hi = (g) => (g.lane ? g.lane[1] : DEPTH - 6);
const live = (g) => g.players.filter((p) => !p.out && p.alive);

/** a hit that is FIRE to a tree: fire / magic shots, charged strikes and spells, a super, a team-up (src/mmworld.js isLight) -- or any hit by a hero holding a lit torch */
export const isFire = (att, hd) => !!(att && att.team === 'hero' && att.torchT > 0) || isLight(att, hd) || (hd && hd.hit === 'fireball_hit');

// ------------------------------------------------------------------------------------------------ the swamp trees
const TREE = { hp: 60, sp: 1.15, wind: 38, dmg: 8, cool: [100, 160], range: [78, 92], scale: 1 };
const SAP = { hp: 24, sp: 2.1, wind: 36, dmg: 5, cool: [70, 120], range: [52, 62], scale: 0.62 };
const TREE_NAMES = ['GROUCH', 'OLD GNARL', 'BRAMBLE', 'MOSSY', 'KNOTTY'], SAP_NAMES = ['TWIG', 'SPROUT', 'SPRIG', 'BUDDY'];
let treeN = 0, sapN = 0;
export class SwampTree extends Enemy {
  constructor(game, x, y, opt = {}) {
    const small = !!opt.small;
    super(game, x, y, { name: opt.name || (small ? SAP_NAMES[sapN++ % SAP_NAMES.length] : TREE_NAMES[treeN++ % TREE_NAMES.length]) });
    this.art = 'swamptree'; this.small = small; this.K = small ? SAP : TREE; this.hp = this.maxHp = this.K.hp; this.scale = this.K.scale;
    this.w = small ? 18 : 32; this.h = small ? 100 : 160; this.shadowR = small ? 26 : 46; this.balloonH = small ? 96 : 190; this.score = small ? 300 : 800; this.heavy = !small;
    this.range = rnd(...this.K.range); this.rattles = 0;
    this.set('approach');
  }
  get hittable() { return this.alive && this.inv <= 0 && !['grow', 'flee'].includes(this.state); }
  onHurtSfx() { audio.sfx('tree_rattle', { vol: 0.8 }); }
  takeHit(att, hd) {
    if (!this.hittable) return false;
    const g = this.game, from = att.x > this.x ? 1 : -1;
    this.flash = 6; this.facing = from; this.releaseToken(); g.engage?.(this);
    if (isFire(att, hd)) { this.ignite(); return true; }
    // a normal hit only rattles it: its leaves fly, it staggers -- never a scratch
    if (!hd.quiet) this.onHurtSfx();
    this.rattles++;
    if (this.rattles === 3) g.torchCall = g.frame + 900;   // (the torches call out: FIRE!)
    if (hd.kind === 'knock') this.vx = -from * 3; else this.vx = -from * 1.2;
    this.reset('hurt'); this.stun = Math.min(16, hd.stun || 14); this.vy = 0;
    if (this.rattles === 1 || this.rattles % 6 === 0) g.fx.word(this.x, this.y, this.h * this.scale + 10, false, pick(['BONK!', 'THUD!', 'CREAK!']));
    { const ids = g.players.filter((q) => !q.out).map((q) => baseOf(q.heroId)), fire = [ids.includes('dodongo') ? "Dodongo's fireballs" : null, ids.includes('ana') ? "Anastasia's magic" : null, 'charged hits', 'supers'].filter(Boolean);   // (only the fire this party has)
      g.mm?.hint?.('sifire', `A swamp tree only gets RATTLED by normal hits. || FIRE makes it RUN! || Use ${fire.slice(0, -1).join(', ')} or ${fire[fire.length - 1]}! || Or grab a burning TORCH: your hits are FIRE!`, 420); }   // (each beat 10 words at most: QAF N5)
    return true;
  }
  /** fire: the crown catches, it runs off yelping (counts as beaten; nobody is hurt) */
  ignite() {
    const g = this.game;
    if (!this.alive) return;
    this.releaseToken(); this.alive = false; this.set('flee');
    this.facing = this.x < g.camX + W / 2 ? -1 : 1;
    g.fx.label(clamp(this.x, g.camX + 80, g.camX + W - 80), this.y, this.h * this.scale + 20, pick(['AAH! HOT!', 'FIRE! FIRE!', 'MY LEAVES!', 'YIPE!']), '#ffb02e', this.small ? 24 : 30, 60);
    g.fx.flames?.(this.x, this.y, 100 * this.scale, 5, { scale: 1 }); audio.sfx('tree_flee');
    g.score += this.score; g.onFoeGone(this);
  }
  update() {
    const g = this.game, p = this.player, K = this.K;
    this.tick();
    if (this.cool > 0) this.cool--;
    switch (this.state) {
      case 'approach': case 'wait': case 'taunt': this.think(p); break;
      case 'windup':
        this.vx = this.vy = 0;
        if (this.st === 1) windSound(this, this.small ? 'snip' : 'swing');
        if (this.st >= K.wind) { this.set('swipe'); this.hitDone = false; audio.sfx('swing_heavy', { pitch: 0.55, vol: 0.7 }); }
        break;
      case 'swipe':
        this.vx = this.vy = 0;
        if (!this.hitDone && this.st >= 7 && this.st <= 13) {
          const b = boxOf(this, { x0: 8, x1: 108 * this.scale, z0: 0, z1: 130 * this.scale, dy: 24 });
          if (this.hitHeroes(b, { dmg: K.dmg, kind: 'light', push: 3.5, stun: 18, stop: 4, sfx: 'hit_light' })) this.hitDone = true;
        }
        if (this.st === 9) { g.fx.dust(this.x + this.facing * 70 * this.scale, this.y, 4, 24 * this.scale); }
        if (this.st >= 30) { this.releaseToken(); this.cool = rnd(...K.cool); this.set('wait'); }
        break;
      case 'hurt': this.vx *= 0.8; if (this.st >= this.stun) this.set('wait'); break;
      case 'grow': this.vx = this.vy = 0; if (this.st >= 34) { this.set('wait'); this.cool = 30; } break;
      case 'flee':
        this.vx = this.facing * 2.3 * this.scale; this.vy = 0; this.ph = (this.ph + Math.abs(this.vx) / (41 * this.scale)) % 1;   // (the pack's roots plant at ~2.28 px/frame at scale 1)
        if (this.st % 4 === 0) g.fx.flames?.(this.x + (Math.random() - 0.5) * 30, this.y, (90 + Math.random() * 60) * this.scale, 1, { scale: 0.8 });
        if (this.st >= 160 || this.x < g.camX - 140 || this.x > g.camX + W + 140) this.gone = true;
        break;
    }
    if (this.state === 'approach' || this.state === 'wait') this.separate();
    if (this.state === 'flee') { this.x += this.vx; this.clampDepth?.(); } else this.integrate();
  }
  think(p) {
    const K = this.K, g = this.game;
    if (!p.alive || p.down || p.state === 'victory') { this.moveTo(p.x + (this.x < p.x ? -1 : 1) * 170, clamp(p.y + this.yOff * 3, lo(g), hi(g)), K.sp * 0.7); this.set(this.vx || this.vy ? 'approach' : 'taunt'); this.face(p); return; }
    const tx = this.standX(p, this.range), ty = clamp(p.y + (this.cool > 20 ? this.yOff : 0), lo(g), hi(g));
    if (this.cool <= 0 && Math.abs(this.x - tx) < 14 && Math.abs(this.y - p.y) < 12 && this.entered && this.takeToken()) { this.face(p); this.windup('windup'); return; }
    const sp = this.cool > 30 && Math.abs(this.x - p.x) < 150 ? K.sp * 0.5 : K.sp;
    if (this.moveTo(tx, ty, sp)) { this.set('wait'); this.face(p); }
    else { this.set('approach'); this.ph = (this.ph + Math.hypot(this.vx, this.vy * 0.5) / (40 * this.scale)) % 1; if (Math.abs(this.x - p.x) < 160) this.face(p); else if (Math.abs(this.vx) > 0.2) this.facing = Math.sign(this.vx); }
  }
  drawOpts() { return { ...super.drawOpts(), small: this.small }; }
  draw(ctx) {
    super.draw(ctx);
    if (this.rattles >= 3 && this.alive && this.state !== 'flee' && this.state !== 'grow') {   // a flame in a thought bubble: what it is afraid of
      const g = this.game, bx = this.sx, by = this.sy - (this.h + 26) * this.scale + Math.sin(g.time * 4) * 2;
      ctx.save(); ctx.translate(bx, by); ctx.lineJoin = 'round';
      ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 17, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-5, 15); ctx.lineTo(0, 24); ctx.lineTo(5, 15); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fillRect(-5, 14, 10, 3);
      ctx.fillStyle = '#ff7a1e'; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-7, 9); ctx.quadraticCurveTo(-10, -2, 0, -12); ctx.quadraticCurveTo(2, -4, 6, -6); ctx.quadraticCurveTo(10, 3, 7, 9); ctx.quadraticCurveTo(0, 13, -7, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.moveTo(-3, 8); ctx.quadraticCurveTo(-4, 2, 0, -3); ctx.quadraticCurveTo(4, 2, 3, 8); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  /** the swipe's ring on the floor, in front of it (the cave's and the kraken's telegraph language: a ring that fills, a dashed rim) */
  drawShadow(ctx) {
    if (this.state !== 'windup') return;
    const K = this.K, k = Math.min(1, this.st / K.wind), blink = this.st > K.wind - 12 ? pulse(this.st - K.wind + 12) : 1;
    const sx = this.sx + this.facing * 70 * this.scale, sy = FLOOR_TOP + this.y, rx = 96 * this.scale, ry = 30 * this.scale + 6;
    ctx.save();
    ctx.globalAlpha = 0.28 + 0.3 * k; ctx.fillStyle = 'rgb(255,80,50)'; ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = blink; ctx.strokeStyle = INK; ctx.lineWidth = 8; ctx.beginPath(); ctx.ellipse(sx, sy, rx * (1.12 - 0.12 * k), ry * (1.12 - 0.12 * k), 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#ffe03a'; ctx.lineWidth = 3.4; ctx.setLineDash([11, 7]); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
  }
  pose() {
    const g = this.game;
    switch (this.state) {
      case 'approach': return this.anim('walk', this.ph);
      case 'wait': return this.anim('idle', g.time + this.ph * 3);
      case 'taunt': return this.anim('taunt', g.time + this.ph * 3);
      case 'windup': return this.anim('windup', Math.min(1, this.st / this.K.wind));
      case 'swipe': return this.anim('swipe', Math.min(1, this.st / 30));
      case 'hurt': return this.anim('hurt', Math.min(1, this.st / this.stun));
      case 'grow': return this.anim('grow', Math.min(1, this.st / 34));
      case 'flee': return this.anim('flee', this.ph);
      default: return this.anim('idle', g.time);
    }
  }
}

// ------------------------------------------------------------------------------------------------ roots
const ROOTP = { skin: '#6a4c36', skinD: '#34241a', skinH: '#8a6a4c', belly: '#7a9a58', bark: true, suckers: false };
/** a root bursting out of the mud (the Tentacle's slam / sweep / grab, in bark): src/siworld.js stepTentacles `tent: { root: true }`, and the Elder's attacks */
export class Root extends Tentacle {
  get burstMat() { return 'mud'; }   // (src/sifx.js: a root bursts out of the bog's mud)
  hintKey() { return 'root_' + this.kind; }
  holdText(key, solo) { return `A ROOT has you! MASH ${key}!${solo ? '' : ' || Or a friend bonks the root!'}`; }
  /** QA1 A1: painter 2's painted bark root (src/chars/swamp_root3d.js: up / hold / the sweep's tiled body) -- the code tube where the pack is not resident */
  draw(ctx) { if (CHARS.swamp_root?.drawRoot?.(ctx, this)) return; super.draw(ctx); }
}
Root.PAL = ROOTP;

// ------------------------------------------------------------------------------------------------ the gloom
/** a small sad rain cloud drifting over the swamp: its rain makes a hero GLOOMY (slower, droopy) until a friend stands beside them (src/siworld.js stepSwamp) */
export class GloomMist extends Actor {
  constructor(game, x, y, dir) {
    super(game, x, y);
    this.team = 'hazard'; this.solid = false; this.w = 0; this.h = 0; this.shadowR = 0; this.sortY = 900; this.dir = dir; this.age = 0; this.life = 1500; this.R = 62;
    game.mm?.gloomHint?.();
  }
  get hittable() { return false; }
  update() {
    const g = this.game;
    this.tick();
    if (g.cut || g.cutin) return;
    this.age++;
    const ps = live(g), t = ps.length ? ps.reduce((m, p) => (Math.abs(p.x - this.x) < Math.abs(m.x - this.x) ? p : m), ps[0]) : null;
    this.x += this.dir * 0.5; if (t) this.y += clamp(t.y - this.y, -0.35, 0.35);
    if (this.age >= this.life || this.x < g.camX - 200 || this.x > g.camX + W + 200) { this.gone = true; return; }
    for (const p of ps) {
      if (p.z > 30 || Math.abs(p.x - this.x) > this.R || Math.abs(p.y - this.y) > this.R * 0.34 + 8) continue;
      g.mm?.gloomify?.(p);
    }
  }
  drawShadow(ctx) {
    const sx = this.x - this.game.camX, sy = FLOOR_TOP + this.y, a = 0.18 + 0.05 * Math.sin(this.age * 0.08);
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#10181c'; ctx.beginPath(); ctx.ellipse(sx, sy, this.R, this.R * 0.34 + 4, 0, 0, TAU); ctx.fill(); ctx.restore();
    // (a few raindrop rings on the floor)
    ctx.save(); ctx.strokeStyle = 'rgba(160,190,200,0.5)'; ctx.lineWidth = 1.4;
    for (let i = 0; i < 4; i++) { const u = ((this.age * 0.03 + i * 0.25) % 1), px = sx + Math.sin(i * 2.3) * this.R * 0.6; ctx.globalAlpha = 1 - u; ctx.beginPath(); ctx.ellipse(px, sy + Math.cos(i * 3.1) * 8, 10 * u + 2, 4 * u + 1, 0, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }
  draw(ctx) {
    const g = this.game, sx = this.x - g.camX, sy = FLOOR_TOP + this.y - 150 + Math.sin(this.age * 0.06) * 4, k = Math.min(1, this.age / 30) * (this.age > this.life - 40 ? (this.life - this.age) / 40 : 1);
    if (k <= 0.01) return;
    ctx.save(); ctx.globalAlpha = k; ctx.translate(sx, sy);
    for (let i = 0; i < 16; i++) { const u = ((this.age * 0.022 + i * 0.061) % 1), x = Math.sin(i * 7.7) * this.R * 0.8; ctx.strokeStyle = 'rgba(150,185,200,0.85)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x, 20 + u * 146); ctx.lineTo(x - 1.5, 29 + u * 146); ctx.stroke(); }
    ctx.fillStyle = '#6c7e82'; ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    const puffs = [[-44, 8, 20], [-20, -8, 28], [12, -10, 30], [42, -2, 24], [60, 10, 18], [6, 12, 30]];
    ctx.beginPath(); for (const [x, y, r] of puffs) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); } ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#6c7e82'; ctx.beginPath(); for (const [x, y, r] of puffs) { ctx.moveTo(x + r - 1, y); ctx.arc(x, y, r - 1, 0, TAU); } ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.beginPath(); ctx.ellipse(-12, -14, 22, 8, -0.2, 0, TAU); ctx.fill();
    // a sad face: droopy eyes, a frown, a tear
    ctx.fillStyle = INK; for (const ex of [-4, 22]) { ctx.beginPath(); ctx.ellipse(ex, 6, 3.6, 5.4, 0, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-9, -3); ctx.lineTo(1, 0); ctx.moveTo(27, 0); ctx.lineTo(17, -3); ctx.stroke();
    ctx.beginPath(); ctx.arc(9, 24, 8, Math.PI + 0.3, TAU - 0.3); ctx.stroke();
    ctx.fillStyle = '#9fd4ff'; ctx.beginPath(); ctx.ellipse(-8, 15 + (this.age % 30) * 0.3, 2.2, 3.4, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

// ------------------------------------------------------------------------------------------------ the torches
/** a standing torch: walk into it and the hero's hits are FIRE for 16 s (Player.torchT; the flame at the hand is src/siworld.js stepSwamp's) */
export class Torch extends Actor {
  constructor(game, x, y) {
    super(game, x, y);
    this.team = 'fx'; this.solid = false; this.w = 14; this.h = 90; this.shadowR = 14; this.sortY = y; this.age = Math.random() * 100;
  }
  get hittable() { return false; }
  update() {
    const g = this.game;
    this.tick(); this.age++;
    if (g.cut) return;
    for (const p of live(g)) {
      if (p.z > 40 || Math.abs(p.x - this.x) > 44 || Math.abs(p.y - this.y) > 26) continue;
      if (!(p.torchT > 600)) {
        const first = !(p.torchT > 0);
        p.torchT = 1000;
        if (first) { g.fx.label(p.x, p.y, 170, 'TORCH LIT!', '#ffb02e', 28, 60); g.fx.flames?.(p.x, p.y, 70, 6, { scale: 0.9 }); audio.sfx('fireball_hit', { vol: 0.5, pitch: 1.3 }); g.mm?.torchHint?.(); }
      }
    }
    if (this.age % 5 === 0) g.fx.flames?.(this.x, this.y, 94, 1, { scale: 0.55 });
  }
  /** after a tree has been rattled three times: a bouncing FIRE! sign with an arrow over every torch on screen, until a hero is lit */
  drawOverMM(ctx) {
    const g = this.game;
    if (!(g.torchCall > g.frame) || g.cut || this.sx < 30 || this.sx > W - 30) return;
    const ps = live(g); if (!ps.length || ps.every((p) => p.torchT > 0)) return;
    const by = this.sy - 150 - Math.abs(Math.sin(g.time * 5)) * 9;
    ctx.save(); ctx.font = 'bold 28px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = 7; ctx.strokeStyle = INK;
    ctx.strokeText('TORCH = FIRE!', this.sx, by); ctx.fillStyle = '#ffb02e'; ctx.fillText('TORCH = FIRE!', this.sx, by);
    ctx.fillStyle = '#ffb02e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(this.sx - 11, by + 8); ctx.lineTo(this.sx + 11, by + 8); ctx.lineTo(this.sx, by + 24); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  draw(ctx) {
    const t = this.game.time + this.age * 0.01, sx = this.sx, sy = this.sy;
    ctx.save(); ctx.translate(sx, sy);
    { const gl = ctx.createRadialGradient(0, -96, 3, 0, -96, 78); gl.addColorStop(0, 'rgba(255,196,96,0.55)'); gl.addColorStop(0.5, 'rgba(255,150,50,0.2)'); gl.addColorStop(1, 'rgba(255,120,30,0)'); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.85 + 0.15 * Math.sin(t * 9); ctx.fillStyle = gl; ctx.fillRect(-84, -180, 168, 170); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    // the post
    ctx.fillStyle = '#4a3828'; ctx.strokeStyle = INK; ctx.lineWidth = 3.4; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-4, -76); ctx.lineTo(4, -76); ctx.lineTo(6, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(-5, -74, 3, 72);
    // the bowl and the flame
    ctx.fillStyle = '#3a3a44'; ctx.beginPath(); ctx.moveTo(-14, -82); ctx.lineTo(14, -82); ctx.lineTo(9, -70); ctx.lineTo(-9, -70); ctx.closePath(); ctx.fill(); ctx.stroke();
    const sw = Math.sin(t * 11) * 2.4, h = 34 + 6 * Math.sin(t * 13);
    ctx.beginPath(); ctx.moveTo(-10, -82); ctx.quadraticCurveTo(-13, -82 - h * 0.5, sw, -82 - h); ctx.quadraticCurveTo(13, -82 - h * 0.5, 10, -82); ctx.closePath(); ctx.fillStyle = '#ff7a1e'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-5, -82); ctx.quadraticCurveTo(-6, -82 - h * 0.35, sw * 0.6, -82 - h * 0.65); ctx.quadraticCurveTo(6, -82 - h * 0.35, 5, -82); ctx.closePath(); ctx.fillStyle = '#ffd84a'; ctx.fill();
    ctx.restore();
  }
}

// ------------------------------------------------------------------------------------------------ the fire ring's blast
/** the FIRE RING bursting out of the circle: an expanding orange-gold wave across the whole floor, tongues of flame along it (no friend is hurt) */
export class FireRingBlast extends Actor {
  constructor(game, x, y) {
    super(game, x, y);
    this.team = 'fx'; this.solid = false; this.shadowR = 0; this.sortY = 900; this.age = 0; this.life = 62; this.w = 0; this.h = 0;
  }
  get hittable() { return false; }
  update() { this.tick(); this.age++; if (this.age >= this.life) { this.gone = true; this.alive = false; } }
  drawShadow(ctx) {
    const g = this.game, u = this.age / this.life, e = 1 - (1 - u) * (1 - u), sx = this.x - g.camX, sy = FLOOR_TOP + this.y, rx = 60 + e * 820, ry = rx * 0.34, a = 1 - u * u;
    ctx.save();
    ctx.globalAlpha = 0.5 * a; const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, rx); gr.addColorStop(0, 'rgba(255,230,140,0.9)'); gr.addColorStop(0.7, 'rgba(255,150,40,0.5)'); gr.addColorStop(1, 'rgba(255,100,20,0)');
    ctx.translate(sx, sy); ctx.scale(1, 0.34); ctx.translate(-sx, -sy); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, sy, rx, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = INK; ctx.lineWidth = 16; ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#ffb02e'; ctx.lineWidth = 10; ctx.stroke(); ctx.strokeStyle = '#fff2a8'; ctx.lineWidth = 4; ctx.stroke(); ctx.restore();
  }
  draw(ctx) {
    const g = this.game, u = this.age / this.life, e = 1 - (1 - u) * (1 - u), sx = this.x - g.camX, sy = FLOOR_TOP + this.y, rx = 60 + e * 820, ry = rx * 0.34, a = 1 - u * u;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 46; i++) {
      const an = i * TAU / 46 + this.age * 0.02, fx = sx + Math.cos(an) * rx, fy = sy + Math.sin(an) * ry;
      if (fx < -40 || fx > W + 40) continue;
      const h = (30 + 24 * Math.abs(Math.sin(i * 1.7 + this.age * 0.4))) * (0.5 + 0.5 * a), wd = 12 + 4 * Math.sin(i + this.age * 0.5);
      ctx.globalAlpha = 0.85 * a; ctx.fillStyle = i % 2 ? '#ff8a1e' : '#ffc23a';
      ctx.beginPath(); ctx.moveTo(fx - wd, fy); ctx.quadraticCurveTo(fx - wd * 0.6, fy - h * 0.6, fx + Math.sin(this.age * 0.6 + i) * 4, fy - h); ctx.quadraticCurveTo(fx + wd * 0.6, fy - h * 0.6, fx + wd, fy); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------------------------------------------ THE ELDER TREE
let SHAFT = null;
/** the fire ring's light column, once: a 32 x 64 god-ray feathered on every side -- a cos^2 profile across (no straight edge), rising from
 *  nothing at the top to full at 85 % and easing off into the ring at the bottom (the fillRect it replaces read as a glitch: final reshoot) */
function shaftTex() {
  if (SHAFT || typeof document === 'undefined') return SHAFT;
  const c = document.createElement('canvas'); c.width = 32; c.height = 64;
  const x = c.getContext('2d'), im = x.createImageData(32, 64);
  for (let j = 0; j < 64; j++) {
    const v = (j + 0.5) / 64, up = v < 0.85 ? Math.pow(v / 0.85, 1.6) : 1 - 0.75 * (v - 0.85) / 0.15;
    for (let i = 0; i < 32; i++) {
      const u = (i + 0.5) / 32, h = Math.cos((u - 0.5) * Math.PI) ** 2, o = (j * 32 + i) * 4;
      im.data[o] = 255; im.data[o + 1] = 218 + 14 * (1 - v) | 0; im.data[o + 2] = 120 + 20 * (1 - v) | 0; im.data[o + 3] = Math.round(255 * h * up);
    }
  }
  x.putImageData(im, 0, 0);
  return (SHAFT = c);
}
const ELDER = { rounds: 3, cast: 400, solo: 300, R: 88, guardHit: 0.07, ringGap: 220, holdK: 0.5, pityAt: 480, pityAgain: 240, standK: 1 };   // (QA2: 3 rounds; any held button = half speed; the pity ring)
const SINK0 = 30, SINKF = 80, SINKD = 450;   // (defeated: the slump settles by ~24 f, then down into the bog 450 px -- its crown included)
export class ElderTree extends SIBoss {
  constructor(game, x, y, opt = {}) {
    super(game, x, y, opt, 'THE ELDER TREE', 'Oldest Tree of the Swamp of Despair', 100);
    this.art = 'elder'; this.scale = 1; this.w = 90; this.h = 330; this.shadowR = 130; this.balloonH = 380; this.talkGap = 340; this.ownFinish = true; this.hideFoeBars = true; this.sortY = -60;
    this.maxHp = this.hp = 100; this.round = 0; this.ring = null; this.ringCool = 200; this.cool = 150; this.q = []; this.seen = new Map(); this.lastThud = -99; this.facing = -1;
  }
  get open() { return !['intro', 'rise', 'defeated'].includes(this.state); }
  get hittable() { return this.alive && this.game.fighting && !this.game.cut && this.open && this.state !== 'flee' && this.state !== 'burn'; }
  /** it cannot be hurt: normal hits only thud on the bark (fire flinches it a little) */
  takeHit(att, hd) {
    if (!this.hittable) return false;
    const g = this.game;
    this.flash = 4;
    if (live(g).length < 2) g.siStopCap = { f: g.frame, v: 2 };   // (a solo thud on the bark holds 2 f: 4 froze 25% of the fight -- QAF N9, src/game.js)
    if (g.frame - this.lastThud > 16) { this.lastThud = g.frame; this.ouch = 8; g.fx.spark?.(att.x > this.x ? this.x + 50 : this.x - 50, this.y, 110, false); if (!hd.quiet) audio.sfx('tree_rattle', { pitch: 0.6 }); if (g.frame - (this.wordAt ?? -99) > 90) { this.wordAt = g.frame; g.fx.word(this.x, this.y, 150, false, pick(['THUD!', 'BONK!'])); } }
    return true;
  }
  bossIntro() { this.set('rise'); audio.sfx('roar', { pitch: 0.5 }); this.game.shake = Math.max(this.game.shake, 10); }
  bossFight() {
    const g = this.game, m = g.mm;
    this.set('idle'); this.cool = 130; this.ringCool = 160;
    m?.hint?.('sielder', "The Elder Tree cannot be hurt! || Wait for the glowing CIRCLE: the FIRE RING!", 360, true);
  }
  keyHint(n) { return n % 2 ? ['sielderA', `Stand in the glowing circle and HOLD ${this.game.mm?.keyName?.('shoot') || 'SHOOT'}! || Friends: GUARD the one in the circle!`] : ['sielderB', 'Hits on the one in the circle spoil the ring! || Bonk the roots, dodge the branch lanes, scare the saplings!']; }
  later(frames, fn) { this.q.push({ at: this.game.frame + frames, fn }); }
  lead() { const ps = live(this.game); return ps.length ? ps[(Math.random() * ps.length) | 0] : null; }
  update() {
    const g = this.game;
    this.tick();
    if (this.ouch > 0) this.ouch--;
    if (this.cool > 0) this.cool--;
    for (let i = this.q.length - 1; i >= 0; i--) if (g.frame >= this.q[i].at && !g.cut) { const f = this.q[i].fn; this.q.splice(i, 1); try { f(); } catch (e) { console.error('elder queue', e); } }
    if (this.state === 'defeated' && this.st === SINK0 && this.sinks()) globalThis.SIFX?.splash?.(this.x, this.y, 'mud', true);   // (the bog takes it back: drawSink)
    if (g.cut) { if (this.hum) { this.hum.stop?.(0.2); this.hum = null; } return; }
    const solo = live(g).length < 2;
    switch (this.state) {
      case 'intro': break;
      case 'rise': if (this.st >= 70) this.set('idle'); break;
      case 'idle':
        if (!g.fighting) break;
        if (this.cool <= 0) this.pickAttack(solo);
        break;
      case 'swipeWind': if (this.st === 1) windSound(this, 'growl'); if (this.st >= 74) { this.set('swipe'); audio.sfx('swing_heavy', { pitch: 0.4, vol: 0.9 }); } break;
      case 'swipe': if (this.st >= 30) { this.set('idle'); this.cool = this.ring ? rnd(110, 150) : rnd(150, 210); if (solo) this.cool += 50; } break;
      case 'slamWind': if (this.st === 1) windSound(this, 'growl'); if (this.st >= 60) { this.set('slam'); audio.sfx('explosion', { pitch: 0.5, vol: 0.8 }); g.shake = Math.max(g.shake, 8); } break;
      case 'slam': if (this.st >= 38) { this.set('idle'); this.cool = this.ring ? rnd(120, 160) : rnd(160, 220); if (solo) this.cool += 50; } break;
      case 'roar': if (this.st >= 58) { this.set('idle'); this.cool = rnd(150, 210); } break;
      case 'scared': if (this.st >= 130) { this.set('idle'); this.cool = 90; } break;
      case 'burn': if (this.st >= 50) { this.set('flee'); const g2 = this.game, sd = this.x - g2.camX > W / 2 ? -1 : 1; this.fleeDir = -sd; g2.fx.label(clamp(this.x + sd * 250, g2.camX + 150, g2.camX + W - 150), this.y, 284, 'I GIVE UP! OWWW!', '#ffd0a0', 40, 70); } break;   // (beside its face too, as OW! MY LEAVES! -- QAF3)
      case 'flee': { const nx = this.x + (this.fleeDir || 0) * 1.2; if (this.fleeDir && this.own('flee') && nx > g.camX + 120 && nx < g.camX + W - 120) this.x = nx; }   // (painter 2's root-walk: it scrambles away, 1.2 px/f)
        if (this.st >= 50) this.defeat(); break;   // (~1.7 s from the last fire-ring blast to the clear: QA2 -- 3 s of empty swamp)
      default: break;
    }
    if (['idle', 'swipeWind', 'swipe', 'slamWind', 'slam', 'roar'].includes(this.state) && g.fighting) this.stepRing(solo);
    else if (this.hum) { this.hum.stop?.(0.2); this.hum = null; }   // (the ring's held hum never outlives the fight)
  }
  pickAttack(solo) {
    const g = this.game, saps = g.actors.filter((a) => a instanceof SwampTree && a.alive).length, mist = g.actors.filter((a) => a instanceof GloomMist && !a.gone).length, roll = Math.random();
    const t = this.lead(); if (!t) return;
    if (roll < 0.38) {   // a branch sweeps along a lane (a pink lane first: jump it)
      this.set('swipeWind'); const y = clamp(t.y + rnd(-16, 16), 16, DEPTH - 16);
      const r = new Root(g, 'sweep', 0, y, this, -1); g.actors.push(r);
      if (!solo && Math.random() < 0.5) this.later(26, () => g.actors.push(new Root(g, 'sweep', 0, clamp(y + (y < 75 ? 52 : -52), 16, DEPTH - 16), this, -1)));
    } else if (roll < 0.7) {   // roots slam up in a row (red rings first)
      this.set('slamWind'); const n = this.ring ? 2 : solo ? 3 : 4, cx = clamp(t.x, g.camX + 220, g.camX + W - 220);
      for (let i = 0; i < n; i++) this.later(i * 10, () => g.actors.push(new Root(g, 'slam', clamp(cx + (i - (n - 1) / 2) * 150, g.camX + 70, g.camX + W - 70), clamp(t.y + (i % 2 ? 22 : -22), 16, DEPTH - 16), this)));
    } else if (roll < 0.86 && saps < (solo ? 1 : 3)) {   // saplings sprout
      this.set('roar'); audio.sfx('roar', { pitch: 0.7, vol: 0.6 });
      this.later(16, () => { for (let i = 0; i < (solo ? 1 : 2); i++) { const e = g.spawn({ k: 'sapling', side: Math.random() < 0.5 ? 'L' : 'R', y: rnd(30, 120) }); if (e) { let sx = clamp(g.camX + rnd(150, W - 150), g.camX + 90, g.camX + W - 90); for (let tries = 0; tries < 8 && this.ring && Math.abs(sx - this.ring.x) < 170; tries++) sx = clamp(g.camX + rnd(150, W - 150), g.camX + 90, g.camX + W - 90); e.x = sx; e.entered = true; e.set('grow'); g.fx.dust(e.x, e.y, 6, 30); } } });
    } else if (mist < 1 && !solo) {   // a gloom cloud
      this.set('roar'); this.later(16, () => { const side = Math.random() < 0.5 ? -1 : 1; g.actors.push(new GloomMist(g, side < 0 ? g.camX + W + 60 : g.camX - 60, rnd(40, 110), -side)); });
    } else if (!solo && this.ring && this.round >= 1 && !g.mm?.holds?.size && Math.random() < 0.6) {   // a root grabs the one in the circle
      const caster = live(g).find((p) => this.inRing(p) && (p.state === 'charge' || p.state === 'auto'));
      if (caster) { this.set('slamWind'); const r = new Root(g, 'grab', caster.x, caster.y, this); r.target = caster; g.actors.push(r); } else { this.set('swipeWind'); g.actors.push(new Root(g, 'sweep', 0, clamp(t.y, 16, DEPTH - 16), this, -1)); }
    } else { this.set('swipeWind'); g.actors.push(new Root(g, 'sweep', 0, clamp(t.y, 16, DEPTH - 16), this, -1)); }
    this.cool = 40;
  }
  // ---------------------------------------------------------------- the fire ring
  inRing(p) { const R = this.ring; if (!R) return false; const ex = (p.x - R.x) / ELDER.R, ey = (p.y - R.y) / (ELDER.R * 0.36); return ex * ex + ey * ey <= 1; }
  startRing() {
    const g = this.game, x = clamp(g.camX + rnd(250, 420), g.camX + 220, g.camX + W - 360), y = rnd(40, 85);
    this.ring = { x, y, fill: 0, t: 0, everCast: false, nagAt: 0, x0: x, dir: 1, hopped: false, hopT: 0 };
    if (this.round === 1) g.fx.label(x, y, 150, 'IT MOVES!', '#ffe27a', 30, 80);   // (round 2's twist: the ring slides -- QA2 M7)
    this.seen = new Map(); audio.sfx('ring_appear');   // (no FIRE RING! word here: the ring's own label, HOLD HERE!, sits right over it -- they stacked)
    g.mm?.clearHint?.('sielder');   // (its 'wait for the circle' beats are stale now: QA2 R1)
    if (this.round > 0) g.mm?.hint?.('sifirering', `The CIRCLE is back! Stand in it, HOLD ${g.mm.keyName('shoot')}!`, 300, true);   // (the full tip on the first ring only: QAF N10)
    else g.mm?.hint?.('sifirering', live(g).length > 1 ? `A glowing CIRCLE! Stand in it and HOLD ${g.mm.keyName('shoot')}! || Friends: GUARD the one in the circle! || ROLL out of a lane: the circle KEEPS its fire!` : `A glowing CIRCLE! Stand in it and HOLD ${g.mm.keyName('shoot')}! || ROLL out of a lane: the circle KEEPS its fire!`, 460, true, { front: true });   // (front: it jumps the queue -- QA2 R1)
  }
  stepRing(solo) {
    const g = this.game;
    if (g.fighting && !this.ring) { if (this.ringCool > 0) { this.ringCool--; return; } this.startRing(); return; }
    const R = this.ring; if (!R) return;
    R.t++;
    if (R.hopT > 0) R.hopT--;
    // (QA2 M7: round 2 -- the ring slides slowly to and fro (a charging hero can walk with it); round 3 -- at half full it JUMPS to a new spot)
    if (this.round === 1 && !R.pity) { R.x += R.dir * 0.45; if (Math.abs(R.x - R.x0) > 150 || R.x < g.camX + 130 || R.x > g.camX + W - 130) { R.dir = -R.dir; R.x = clamp(R.x, g.camX + 130, g.camX + W - 130); } }
    if (this.round === 2 && !R.hopped && R.fill >= 0.5) {
      R.hopped = true; R.hopT = 150; g.fx.poof?.(R.x, R.y, 10, false);
      const away = R.x < g.camX + W / 2 ? 1 : -1; R.x = clamp(R.x + away * rnd(240, 320), g.camX + 140, g.camX + W - 140); R.y = rnd(40, 85); R.x0 = R.x;
      audio.sfx('ring_appear'); g.fx.label(R.x, R.y, 150, 'IT JUMPED!', '#ffe27a', 32, 80);
    }
    const ps = live(g), casters = ps.filter((p) => this.inRing(p) && ((p.state === 'charge' && p.charge && !p.charge.melee) || (p.state === 'auto' && p.ctrl && p.ctrl.held && p.ctrl.held.shoot)));   // (Legend Shadow's held SHOOT is rapid fire, state 'auto': it fills the ring as a charge does)
    const base = 1 / (solo ? ELDER.solo : ELDER.cast);
    // (QA2 B3: a kid who never holds SHOOT -- ANY button held in the circle (a held ATTACK, a melee charge) fills it at half speed; and a ring
    //  nobody has cast in for 8 s -- 4 s once it has helped -- creeps to the nearest hero and fills while anyone simply stands in it)
    const held = (p) => { const h = p.ctrl?.held; return (p.state === 'charge' && p.charge?.melee) || !!(h && (h.attack || h.shoot || h.special || h.jump || h.dodge)); };
    const holders = casters.length ? [] : ps.filter((p) => this.inRing(p) && held(p));
    R.pity = R.pity ? R.fill < 1 : R.t - (R.fillT ?? 0) > (this.helped ? ELDER.pityAgain : ELDER.pityAt);   // (no real progress for 8 s, cast in before or not: the pity -- a cast-then-wander party soft-locked)
    if (R.pity && !casters.length && !holders.length) {
      let near = null, bd = 1e9; for (const p of ps) { const d = Math.abs(p.x - R.x) + Math.abs(p.y - R.y) * 2; if (d < bd) { bd = d; near = p; } }
      if (near && !this.inRing(near)) { R.x = clamp(R.x + clamp(near.x - R.x, -2.6, 2.6), g.camX + 110, g.camX + W - 110); R.y = clamp(R.y + clamp(near.y - R.y, -1, 1), 30, hi(g) - 6); }
      this.helped = true;
    }
    const standers = R.pity && !casters.length && !holders.length ? ps.filter((p) => this.inRing(p)) : [];
    const filling = casters.length || holders.length || standers.length;
    if (filling && !this.hum) this.hum = audio.sfx('ring_charge', { hold: true }); else if (!filling && this.hum) { this.hum.stop?.(0.2); this.hum = null; }   // (started on the step into casting, once)   // (the ring's hum while someone casts: it rises over ~6 s)
    if (casters.length) { R.fill = Math.min(1, R.fill + base * (1 + 0.5 * (casters.length - 1))); R.everCast = true; R.fillT = R.t; R.caster = casters[0]; if (g.frame % 6 === 0) g.fx.rise?.(R.x + rnd(-60, 60), R.y + rnd(-10, 10), 10 + Math.random() * 40, '#ffb02e'); }
    else if (holders.length || standers.length) { const n = holders.length || standers.length; if (holders.length) R.fillT = R.t; R.fill = Math.min(1, R.fill + base * (holders.length ? ELDER.holdK : ELDER.standK) * (1 + 0.5 * (n - 1))); R.caster = (holders[0] || standers[0]); if (g.frame % 8 === 0) g.fx.rise?.(R.x + rnd(-60, 60), R.y + rnd(-10, 10), 10 + Math.random() * 40, '#ffb02e'); }
    else R.fill = Math.max(0, R.fill - 1 / 1600);
    for (const p of ps) {   // a hit on the caster spoils the ring: the friends must GUARD
      const h = p.armorHits || 0, was = this.seen.get(p) ?? h;
      if (h > was && casters.includes(p)) { R.fill = Math.max(0, R.fill - ELDER.guardHit * (h - was)); if (g.frame - (R.oucAt ?? -99) > 50) { R.oucAt = g.frame; g.fx.label(p.x, p.y, 200, 'GUARD!', '#ffb02e', 28, 50); } }
      this.seen.set(p, h);
    }
    this.hp = this.maxHp * Math.max(0, 1 - (this.round + R.fill) / ELDER.rounds);
    if (!R.everCast && !R.pity && !R.nagged && R.t > 520) { R.nagged = true; this.nagRing(); }   // (once a ring, never while it creeps to the hero: QAF N10)
    if (R.fill >= 1) this.blast(R);
  }
  nagRing() { const g = this.game; g.mm?.hint?.('sifirering_again', `Walk into the glowing circle, HOLD ${g.mm.keyName('shoot')}!${live(g).length > 1 ? ' || A friend GUARDS you!' : ''}`, 360, true); }
  blast(R) {
    const g = this.game;
    this.round++; this.ring = null; this.ringCool = ELDER.ringGap; this.q.length = 0;
    g.actors.push(new FireRingBlast(g, R.x, R.y));
    audio.sfx('ring_blast'); this.hum?.stop?.(0.2); this.hum = null; g.shake = Math.max(g.shake, 14); g.flashScreen = Math.max(g.flashScreen || 0, 0.35); g.flashAt = { x: R.x, y: R.y, z: 60 };
    for (const p of live(g)) { if (p.state === 'charge') { p.stopCharge?.(); p.set('idle'); } p.inv = Math.max(p.inv, 36); }
    for (const a of [...g.actors]) {
      if (a instanceof SwampTree && a.alive) a.ignite();
      else if (a instanceof Tentacle && a.alive) a.retreat?.(false);
      else if (a instanceof GloomMist) a.gone = true;
    }
    if (g.mm?.holds) for (const [p] of [...g.mm.holds]) g.mm.release(p);
    g.fx.word(R.x, R.y, 200, true, 'FIRE RING!');
    if (this.round >= ELDER.rounds) {
      this.set('burn'); this.hp = 0; SIFX.bossBeat?.(g, this);   // (the final blow: slow-mo + a camera nudge + its material burst, src/sifx.js)
      g.mm?.clearHint?.('sifirering', 'sielder', 'sifirering_again');
    } else { this.set('scared'); this.cool = 200; const sd = this.x - g.camX > W / 2 ? -1 : 1; g.fx.label(clamp(this.x + sd * 250, g.camX + 150, g.camX + W - 150), this.y, 300, 'OW! MY LEAVES!', '#ffd0a0', 36, 70); }   // (beside its face, toward the middle: over it, the word sat on its eyes and mouth at 4P -- QAF3)
  }
  /** the Elder sinks away: the fight is over */
  defeat() { if (!this.alive) return; this.ring = null; super.defeat(); }
  /** painter 2's own clip k: painted and named k (src/chars/elder3d.js drew flee as the burn drawing, sinking, while the pack had none) */
  own(k) { const f = CHARS[this.art]?.ANIM?.[k], p = typeof f === 'function' ? f(0) : f; return !!(p && p.s3d >= 0.5 && p.clip === k); }
  /** defeated and drawn: the slump, then the sink (the own flee and defeat clips) */
  sinks() { return this.state === 'defeated' && this.own('defeat') && this.own('flee'); }
  /** 0..1 down into the bog: from SINK0 over SINKF frames, smoothstep */
  sinkK() { const u = clamp((this.st - SINK0) / SINKF, 0, 1); return u * u * (3 - 2 * u); }
  // ---------------------------------------------------------------- drawing
  /** the glowing circle on the floor: a gold rim, runes, and the fill sweeping round it like a clock */
  drawFloor(ctx) {
    const g = this.game, R = this.ring;
    if (!R) return;
    const grow = Math.min(1, R.t / 36), rad = ELDER.R * (0.4 + 0.6 * grow), sx = R.x - g.camX, sy = FLOOR_TOP + R.y, f = R.fill, pul = 0.5 + 0.5 * Math.sin(g.time * 5);
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.45 * grow;   // (never a faint hairline, even as it opens: the FX critic)
    const gr = ctx.createRadialGradient(sx, sy, 6, sx, sy, rad * 1.25); gr.addColorStop(0, `rgba(255,214,120,${0.35 + 0.35 * f})`); gr.addColorStop(1, 'rgba(255,150,40,0)');
    ctx.save(); ctx.translate(sx, sy); ctx.scale(1, 0.36); ctx.translate(-sx, -sy); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, sy, rad * 1.25, 0, TAU); ctx.fill(); ctx.restore();
    // the fill: a pie of orange-gold, clockwise from the top
    if (f > 0.005) { ctx.save(); ctx.translate(sx, sy); ctx.scale(1, 0.36); ctx.fillStyle = `rgba(255,${150 + 60 * f | 0},40,${0.55 + 0.2 * pul})`; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, rad * 0.96, -Math.PI / 2, -Math.PI / 2 + f * TAU); ctx.closePath(); ctx.fill(); ctx.restore(); }
    ctx.save(); ctx.translate(sx, sy); ctx.scale(1, 0.36); ctx.fillStyle = `rgba(255,226,130,${0.3 + 0.12 * pul})`; ctx.beginPath(); ctx.arc(0, 0, rad * 0.96, 0, TAU); ctx.fill(); ctx.restore();   // (a solid pulsing gold disc: the place to stand)
    { const T = shaftTex(); if (T) { const w = rad * 1.24 * 1.6, top = sy - 200, bot = sy + rad * 0.36 * 0.55, a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * (0.34 + 0.1 * pul); ctx.drawImage(T, sx - w / 2, top, w, bot - top); ctx.globalAlpha = a0; } }   // (a light column rising from it: a soft god-ray, no edge anywhere -- a flat-edged rect read as a rendering glitch, final reshoot)
    ctx.strokeStyle = INK; ctx.lineWidth = 11; ctx.beginPath(); ctx.ellipse(sx, sy, rad, rad * 0.36, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = `rgb(255,${190 + 40 * pul | 0},70)`; ctx.lineWidth = 8; ctx.stroke();
    ctx.setLineDash([6, 12]); ctx.strokeStyle = '#fff2a8'; ctx.lineWidth = 2.4; ctx.lineDashOffset = -g.time * 24; ctx.beginPath(); ctx.ellipse(sx, sy, rad * 0.78, rad * 0.78 * 0.36, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,240,170,0.9)'; for (let i = 0; i < 8; i++) { const an = i * TAU / 8 + g.time * 0.4, rx = sx + Math.cos(an) * rad * 0.9, ry = sy + Math.sin(an) * rad * 0.9 * 0.36; ctx.beginPath(); ctx.moveTo(rx, ry - 4); ctx.lineTo(rx + 3.4, ry); ctx.lineTo(rx, ry + 4); ctx.lineTo(rx - 3.4, ry); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  /** the fire ring's meter over the circle (a bar and the words), over everyone */
  drawOverMM(ctx) {
    const g = this.game, R = this.ring;
    if (!R || g.cut) return;
    // (QA2 round 2: the label right above the ring -- its own pie is the meter -- and the arrow over it with the SHOOT key's glyph, 28 px)
    const sx = R.x - g.camX, top = FLOOR_TOP + R.y - ELDER.R * 0.36, f = R.fill;
    ctx.save(); ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    ctx.font = 'bold 26px Bangers, Impact, sans-serif'; ctx.lineWidth = 6; ctx.strokeStyle = INK;
    const txt = R.hopT > 0 ? 'FOLLOW IT!' : f > 0.02 ? 'FIRE RING!' : R.pity ? 'STAND HERE!' : 'HOLD HERE!';
    ctx.strokeText(txt, sx, top - 8); ctx.fillStyle = f < 0.02 ? '#ffe27a' : '#ffb02e'; ctx.fillText(txt, sx, top - 8);   // (no colour blink: flash safety -- the arrow over it bounces)
    if (f > 0.02) { const w = 96; ctx.fillStyle = INK; ctx.fillRect(sx - w / 2 - 2, top - 2, w + 4, 9); ctx.fillStyle = '#3a2a1e'; ctx.fillRect(sx - w / 2, top, w, 5); ctx.fillStyle = '#ffb02e'; ctx.fillRect(sx - w / 2, top, w * f, 5); }   // (a slim bar under the word once it fills)
    if (!R.everCast || f < 0.02) {
      const cy = top - 96 - Math.abs(Math.sin(g.time * 5)) * 8, key = R.pity ? '' : (g.mm?.keyName?.('shoot') || 'SHOOT');
      ctx.fillStyle = '#ffd24a'; ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(sx - 32, cy); ctx.lineTo(sx + 32, cy); ctx.lineTo(sx + 32, cy + 30); ctx.lineTo(sx + 46, cy + 30); ctx.lineTo(sx, cy + 62); ctx.lineTo(sx - 46, cy + 30); ctx.lineTo(sx - 32, cy + 30); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (key) { ctx.font = 'bold 28px Bangers, Impact, sans-serif'; ctx.lineWidth = 5; ctx.strokeStyle = '#fff8d8'; ctx.strokeText(key, sx, cy + 26); ctx.fillStyle = INK; ctx.fillText(key, sx, cy + 26); }
    }
    ctx.restore();
  }
  drawOpts() { return { ...super.drawOpts() }; }
  /** defeated: the slump, sinking into the bog -- clipped at the mud line (a tree going into the ground, not sliding down the screen), a
   *  dark ring of mud at its foot that pulses while it goes and fades after */
  drawSink(ctx) {
    const g = this.game, k = this.sinkK(), sx = this.sx, sy = this.sy;
    this.mem.frame = g.frame;
    if (k < 1) {
      ctx.save(); ctx.beginPath(); ctx.rect(sx - 600, -100, 1200, sy + 106); ctx.clip(); ctx.translate(0, k * SINKD);
      try { super.draw(ctx); } finally { ctx.restore(); }
    }
    const a = this.st < SINK0 ? 0 : k < 1 ? Math.min(1, (this.st - SINK0) / 8) : Math.max(0, 1 - (this.st - SINK0 - SINKF) / 30);
    if (a <= 0) return;
    const rx = 128 * (1 - 0.45 * k) * (1 + 0.04 * Math.sin(g.time * 7)), ry = rx * 0.27;
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(47,42,37,0.85)'; ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(94,86,76,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(126,116,100,0.8)';
    for (let i = 0; i < 4; i++) { const u = (this.st * 0.035 + i * 0.25) % 1, bx = sx + ((i * 53) % 150 - 75) * (rx / 128), by = sy - ry * 0.25 + ((i * 29) % 3 - 1) * ry * 0.4; ctx.globalAlpha = a * (1 - u); ctx.beginPath(); ctx.arc(bx, by, 3 + 6 * u, 0, TAU); ctx.fill(); }   // (bubbles swelling and fading: pulses, not blinks)
    ctx.restore();
  }
  /** its shadow goes down with it */
  drawShadow(ctx) {
    if (!this.sinks()) { super.drawShadow(ctx); return; }
    const k = this.sinkK(); if (k >= 1) return;
    const r0 = this.shadowR; this.shadowR = r0 * (1 - k);
    try { super.drawShadow(ctx); } finally { this.shadowR = r0; }
  }
  pose() {
    const g = this.game, st = this.state;
    { const fp = this.flinchPose(); if (fp) return fp; }   // (the anim audit #6: painter 2's hurt, once it lands -- the recoil till then, SIBoss.draw)
    switch (st) {
      case 'intro': return this.anim('sleep', g.time);
      case 'rise': return this.anim('rise', Math.min(1, this.st / 70));
      case 'swipeWind': return this.own('swipeWind') ? this.anim('swipeWind', Math.min(1, this.st / 74)) : this.anim('windup', Math.min(1, this.st / 40));   // (painter 2: the whole 74 f -- a dip, the overshoot, a tremble over the hold)
      case 'swipe': return this.anim('swipe', Math.min(1, this.st / 30));
      case 'slamWind': return this.own('slamWind') ? this.anim('slamWind', Math.min(1, this.st / 60)) : this.anim('windup', Math.min(1, this.st / 40));   // (the whole 60 f)
      case 'slam': return this.anim('slam', Math.min(1, this.st / 38));
      case 'roar': return this.anim('roar', Math.min(1, this.st / 58));
      case 'scared': return this.anim('scared', g.time);
      case 'burn': return this.anim('burn', g.time);
      case 'flee': return this.own('flee') ? this.anim('flee', (this.st / 37.5) % 1) : this.anim('flee', Math.min(1, this.st / 80));   // (the 36 f root-walk loop at 37.5 f: the 50 f flee is 8 whole drawings -- no 1-frame runt before the slump)
      case 'defeated': return this.anim('defeat', Math.min(1, this.st / 60));   // (drawn only with the own clips: drawSink)
      default: return this.anim('idle', g.time);
    }
  }
  draw(ctx) {
    if (this.state === 'defeated') { if (this.sinks()) this.drawSink(ctx); return; }
    this.mem.frame = this.game.frame;
    // (a stop-gap, the anim audit #8: its idle is 2 drawings held 90 f each -- the canopy sways a little, a skew anchored at the roots;
    //  off by itself once painter 2's 8-drawing idle lands)
    if (this.state === 'idle' && clipDrawings(this.art, 'idle') <= 2) {
      const g = this.game, sx = this.sx, sy = this.sy, sk = 0.012 * Math.sin(g.time * 1.15) + 0.004 * Math.sin(g.time * 2.9);
      ctx.save(); ctx.translate(sx, sy); ctx.transform(1, 0, -sk, 1, 0, 0); ctx.translate(-sx, -sy);
      try { super.draw(ctx); } finally { ctx.restore(); }
      return;
    }
    super.draw(ctx);
  }
}
