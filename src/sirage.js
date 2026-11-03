// SKULL ISLAND stage 3a, "THE CAVE OF RAGE" (docs/SKULL_ISLAND.md, src/silevels.js): the book's lesson is STAY CALM.
//   RageBeast  a fire wolf with lava-crack fur.  Its RAGE is its health bar: it starts hot-ish (45%), and
//                a calm POKE (one clean hit, then step back) shrinks it a lot  | a second hit in the same breath a little
//                a FLURRY (the third hit in ~0.8 s: button-mashing) makes it GROW and glow  |  a charged strike / charged shot /
//                a super / a team attack is a big calm  |  a PERFECT DODGE of its lunge calms it  |  a pause (not being hit) cools it
//                it gets angrier when it bites a hero.  At 0% it pops into a PUPPY that wanders off happy (pat it for a bonus).
//                Its size, flames, crack-glow and eye colour show the mood; a tag over its head says CALM! / GRR! / RAGE! with a meter.
//   RageAlpha  the boss on the rope bridge: the same rules, bigger; it charges (a red lane), stomps (a ring: jump it) and ROARS (calls
//                two beasts).  Calmed to the end it shrinks to a PUPPY -- pat it, and the way to the pedestal is open.
//   FirePuppy  what a calmed beast becomes: pat it (ATTACK next to it) for hearts.
//   LavaSpout  a lava geyser: an orange ring on the floor, then it erupts (a stage's own hazard, src/siworld.js stepTentacles kind 'spout').
//   CalmCloud  Dodongo's super here: CALM LITTLE CLOUD (the dragon would break the bridge!): a small rain cloud over him, a soothing
//                pulse that calms every beast on the screen a lot -- and rains hearts and a little health on the heroes.
// Nobody is hurt for real: a poked beast only shrinks, a hero only gets a bump.
import { Enemy, CHARS } from './enemies.js';
import { SIBoss } from './sibosses.js';
import { earnKrakenPal } from './sisecrets.js';
import { Actor, boxOf } from './actors.js';
import { audio } from './audio-proxy.js';
import { W, DEPTH, FLOOR_TOP, INK } from './config.js';
import { clamp, TAU } from './rig.js';
import { strikeZone, windSound, rimGlow } from './sitele.js';
import * as SIFX from './sifx.js';   // (Book 2's material particles: the FX agent's src/sifx.js)

const rnd = (a, b) => a + Math.random() * (b - a);
/** flash safety: a telegraph's last-moment urgency is a smooth ~1.9 Hz pulse (0.55..1), never an on/off blink */
const pulse = (n) => 0.775 + 0.225 * Math.cos(n * 0.2);
const pick = (a) => a[(Math.random() * a.length) | 0];
const lo = (g) => (g.lane ? g.lane[0] : 6), hi = (g) => (g.lane ? g.lane[1] : DEPTH - 6);
const live = (g) => g.players.filter((p) => !p.out && p.alive);

// ------------------------------------------------------------------------------------------------ the calm rules (shared)
const FLURRY_WIN = 45;   // frames (0.75 s): a hero's hits this close together are one flurry; a pause longer than this and the next hit is a calm poke
/** one hit on a raging thing: the change to its rage in PERCENT of full (negative: calmer), by who hit it and how.  cfg: { poke, pair, flurry, big, coop }
 * The flurry log is SHARED (every hero's hits on this one): a flurry is the 3rd hit inside 0.75 s alone, 3+2(n-1) hits with n heroes (QA2 B1:
 * a per-hero log let a mashing party poke it to nothing in 3 s).  Each hero's first hit in the breath is a calm poke; cfg.coop scales the
 * pokes and the big calms by 1/n (the Alpha: rage is % of its full, so co-op hp scaling did nothing). */
const comboBonus = (p) => { const A = p.hero?.atk; if (!A) return 0; const f = (A.atk1?.dur || 18) + (A.atk2?.dur || 20) + (A.atk3?.dur || 22); return Math.round(clamp((52 - f) / 6, 0, 3)); };
function calmDelta(self, att, hd, cfg) {
  const g = self.game, n = Math.max(1, live(g).length), k = cfg.coop ? 1 / n : 1;
  const big = !!(hd.cstrike || hd.charged || hd.spell || hd.special || hd.team);
  if (big) return { d: -cfg.big * k, kind: 'big' };
  const a = att && att.team === 'hero' ? att : null;
  // (a beam -- or any shot held on it -- is ONE touch however many ticks it lands: only a new beam after a pause of half a second counts again)
  // (discrete shots: one that is ignored does not extend the pause, so a shot every half second or so each counts; a beam's quiet ticks keep it one touch)
  if (hd.shot) {   // (a shot from a distance is always a calm poke -- never a flurry, never the neutral 'pair')
    const S = self.seenShot || (self.seenShot = new Map()), seen = S.get(a) ?? -1e9;
    if (g.frame - seen < 40) { if (hd.quiet) S.set(a, g.frame); return { d: 0, kind: 'tick' }; }
    S.set(a, g.frame); return { d: -cfg.poke * k, kind: 'poke' };
  }
  // (QA2 round 2: a fast hitter's threshold from the hero's own combo speed -- atk1-3's frames: Shadow 39 -> +2, Scarlet 47 -> +1, Dodongo /
  //  Anastasia 54-60 -> 0: a quick combo is not mashing)
  const fast = a ? comboBonus(a) : 0;
  const L = Array.isArray(self.log) ? self.log : (self.log = []);
  while (L.length && g.frame - L[0].f > FLURRY_WIN) L.shift();
  const paired = L.some((h) => h.a === a && h.k === 'poke'), e = { f: g.frame, a, k: 'poke' };
  L.push(e);
  if (L.length >= 3 + 2 * (n - 1) + fast) { e.k = 'flurry'; return { d: cfg.flurry, kind: 'flurry' }; }   // (the whole party's hits this close: a flurry -- GROWS and glows)
  if (!paired) return { d: -cfg.poke * k, kind: 'poke' };   // (no poke of this hero's in the breath: a calm poke -- a steady ~0.6 s tap pokes every other hit)
  e.k = 'pair'; return { d: cfg.pair, kind: 'pair' };   // (a second hit in a poke's breath: neutral -- a two-hit tap is fine)
}
/** the mood glow behind a PAINTED wolf (the pack is one look: the rig's flame mane, crack glow and eye colour are not in it): cool blue when calm, amber, then a hot pulsing red */
function moodAura(ctx, g, sx, sy, sz, r) {
  const a = r < 0.3 ? 0.2 : r < 0.65 ? 0.22 : 0.34 + 0.12 * Math.sin(g.time * 14), col = r < 0.3 ? '120,200,255' : r < 0.65 ? '255,176,46' : '255,70,40', R = 76 * sz, cy = sy - 40 * sz;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const gr = ctx.createRadialGradient(sx, cy, 4, sx, cy, R); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`);
  ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(sx, cy, R, R * 0.72, 0, 0, TAU); ctx.fill(); ctx.restore();
}
const MOOD = (r) => (r < 0.3 ? ['CALM!', '#9fe7ff'] : r < 0.65 ? ['GRR!', '#ffb02e'] : ['RAGE!', '#ff5a3a']);
/** the mood tag over a head: a word and a small meter */
function moodTag(ctx, g, sx, sy, r, wide = 46) {
  const [txt, col] = MOOD(r), pu = r >= 0.65 ? 0.5 + 0.5 * Math.sin(g.frame * 0.12) : 0;   // (RAGE!: a soft white glow that comes and goes -- never an on/off blink, QA3)
  ctx.save(); ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  ctx.font = 'bold 24px Bangers, Impact, sans-serif';
  { const hw = Math.max(wide / 2 + 2, ctx.measureText(txt).width / 2 + 3) + 2, m = ctx.getTransform(), k0 = (ctx.canvas?.width || 960) / 960, zs = Math.abs(m.a) / k0 || 1, ox = m.e / k0, oy = m.f / k0;   // (the whole tag -- its word and its meter -- inside the TV safe area, x 48..912, y 27..513, in SCREEN px: a super's punch-in pushed an edge tag 74 px out, the tech gate; the actor stays put)
    sy = Math.min(Math.max(sy, 60), 508); sx = (Math.min(Math.max(ox + zs * sx, 48 + hw * zs), 912 - hw * zs) - ox) / zs; sy = (Math.min(Math.max(oy + zs * sy, 27 + 32 * zs), 513 - 4 * zs) - oy) / zs; }
  ctx.lineWidth = 5.5; ctx.strokeStyle = INK; ctx.strokeText(txt, sx, sy - 12); ctx.fillStyle = col; ctx.fillText(txt, sx, sy - 12);
  if (pu > 0) { ctx.globalAlpha = 0.55 * pu; ctx.fillStyle = '#fff'; ctx.fillText(txt, sx, sy - 12); ctx.globalAlpha = 1; }
  ctx.fillStyle = INK; ctx.fillRect(sx - wide / 2 - 2, sy - 8, wide + 4, 10);
  const gr = ctx.createLinearGradient(sx - wide / 2, 0, sx + wide / 2, 0); gr.addColorStop(0, '#6ad0ff'); gr.addColorStop(0.45, '#ffb02e'); gr.addColorStop(1, '#ff3a2a');
  ctx.fillStyle = '#2a2230'; ctx.fillRect(sx - wide / 2, sy - 6, wide, 6); ctx.fillStyle = gr; ctx.fillRect(sx - wide / 2, sy - 6, wide * clamp(r, 0, 1), 6);
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ the beast
/** the rage beast's wind-up: shorter as it rages, never under 30 f (half a second: AA item 7) */
const beastWind = (r) => Math.max(36, Math.round(BEAST.wind - r * 6));   // (QA2: 36 f at the least for 6-year-olds)
const BEAST = { poke: 17, pair: 0, flurry: 13, big: 46, cool: [60, 100], wind: 40, start: 0.45 };
const BEAST_NAMES = ['EMBER', 'SPARKY', 'CINDER', 'BLAZE', 'ASH', 'FLARE'];
let beastN = 0;
export class RageBeast extends Enemy {
  drawShadow(ctx) { super.drawShadow(ctx); if (this.state === 'windup') strikeZone(ctx, this, 14, 96 * (this.sz || 1) + (6 + this.r * 3.5) * 10, this.st / beastWind(this.r), { halfH: 14 }); }   // (its bite + its slide land here: src/sitele.js)
  constructor(game, x, y, opt = {}) {
    super(game, x, y, { name: opt.name || BEAST_NAMES[beastN++ % BEAST_NAMES.length] });
    this.art = 'ragewolf'; this.maxHp = this.hp = 100; this.inited = false;
    this.w = 30; this.h = 64; this.shadowR = 40; this.balloonH = 110; this.score = 600; this.coopHold = true;
    this.set('approach'); this.lastHit = -999; this.lastBite = -999;
  }
  get r() { return clamp(this.hp / this.maxHp, 0, 1.4); }   // (the rage, 0..1+)
  get sz() { return 0.62 + 0.95 * this.r; }
  get hittable() { return this.alive && this.inv <= 0 && !['pop', 'dying'].includes(this.state); }
  addRage(pct, label) {
    const g = this.game, was = this.r;
    this.hp = clamp(this.hp + pct / 100 * this.maxHp, 0, this.maxHp * 1.4);
    if (label && Math.abs(pct) >= 4 && this.label(label, pct < 0 ? '#9fe7ff' : '#ff8a5a')) audio.sfx(pct < 0 ? 'rage_calm' : 'rage_grow', pct < 0 ? undefined : { vol: 0.7 });   // (with its word: the label's 0.6 s gate is the rate limit)
    if (was < 0.65 && this.r >= 0.65) { this.label('RAAAR!', '#ff6a3a'); audio.sfx('roar', { pitch: 1.5, vol: 0.5 }); }
    if (this.r >= 0.65 && g.L?.id === 'sicave') g.siFury = true;   // (the Cave's FULL CALM: no wolf ever got to RAAAR -- src/sisecrets.js, the kraken pal)
    if (this.r <= 0.1 && this.alive && !['pop'].includes(this.state) && (pct < 0 || this.r <= 0.001)) this.pop();   // (a calm poke at CALM pops it: QA2 B2 -- one stray bite between pokes kept a nearly-calm wolf alive)
  }
  /** a word over it, at most one every 0.6 s (they stacked into a mess) */
  label(text, col = '#ffe066') { const g = this.game; if (g.frame - (this.labelAt ?? -99) < 36) return false; this.labelAt = g.frame; g.fx.label(this.x, this.y, this.h + 72, text, col, 24, 40); return true; }   // (+72: over the hit words' height -- WHAM! and CALM! collided)
  calmBy(pct) { this.addRage(-pct, 'CALM!'); }
  onPerfectDodged() { this.addRage(-28, 'CALM!'); }
  onHurtSfx() { audio.sfx('kobold_hurt', { pitch: 0.8 + this.r * 0.2 }); }
  takeHit(att, hd) {
    if (!this.hittable) return false;
    const g = this.game, { d, kind } = calmDelta(this, att, hd, BEAST), from = att.x > this.x ? 1 : -1;
    this.facing = from; this.flash = 6; this.lastHit = g.frame; this.releaseToken();
    if (!hd.quiet) this.onHurtSfx();
    g.engage?.(this);
    if (kind === 'flurry') { this.addRage(d, 'GRRR!'); g.fx.spark(this.x, this.y, 50, false, 'warm'); if (!this.told) { this.told = true; g.mm?.hint?.('sicalm2', `STOP mashing! Let go of ${g.mm.keyName('attack')} for a moment. || Poke once, then step back.`, 300, true); } }
    else if (kind === 'pair') this.addRage(d);
    else if (d < 0) { this.addRage(d, kind === 'big' ? 'CALMED!' : 'CALM!'); }
    if (this.state === 'pop' || !this.alive) return true;
    if (kind === 'big') { if (this.r > 0.02) this.knock(-from, 4, 3.5); }   // (a calm, strong hit sends it tumbling; a combo's finisher only staggers it -- it must stay in reach of the NEXT poke or flurry)
    else if (kind !== 'tick') this.hurt(hd, from);
    return true;
  }
  hurt(hd, from) { this.reset('hurt'); this.stun = Math.min(14, hd.stun || 12); this.vx = -from * 1.5; this.vy = 0; }
  update() {
    const g = this.game, p = this.player, r = this.r;
    this.tick();
    if (!this.inited) { this.inited = true; this.hp = this.maxHp * BEAST.start; }   // (World.spawn's co-op scaling sets hp = maxHp first: start at the beast's own mood)
    this.scale = this.sz; this.w = 28 * this.sz; this.h = 62 * this.sz; this.balloonH = 100 * this.sz + 20;
    if (this.cool > 0) this.cool--;
    // a pause cools it: not hit for a while (never below a grumble)
    if ((g.frame - this.lastHit > 80 || this.state === 'hurt') && this.state !== 'pop' && this.r > 0.22) this.hp -= this.maxHp * 0.0007;   // (stun-locked counts as a pause: QA2 B2)
    // (a pity, QA2 B2 -- the palace's rule: a wolf kept raging, or stun-locked by a masher, for 20 s in all gets tired out: a puppy)
    if (this.alive && this.state !== 'pop' && (this.r >= 0.65 || this.state === 'hurt')) this.angryT = (this.angryT || 0) + 1;
    if (this.angryT > 1200 && this.alive && this.state !== 'pop') { this.angryT = 0; this.label('SO TIRED...', '#9fe7ff'); this.addRage(-150); return; }
    this.hotT = this.r >= 0.9 && this.alive ? (this.hotT || 0) + 1 : 0;
    if (this.hotT > 600) { this.hotT = 0; this.hp = this.maxHp * 0.55; this.label('PHEW... TIRED!', '#9fe7ff'); this.releaseToken(); this.set('wait'); this.cool = 100; }   // (RAGE for 10 s: it runs out of steam)
    const sp = 1.45 + r * 1.7;
    switch (this.state) {
      case 'approach': case 'wait': case 'taunt': this.think(p, sp); break;
      case 'windup':
        this.vx = this.vy = 0;
        if (this.st === 1) windSound(this, 'growl');
        if (this.st >= beastWind(r)) { this.set('lunge'); this.hitDone = false; audio.sfx('swing_light', { pitch: 0.6 }); }
        break;
      case 'lunge':
        this.vx = this.st >= 4 && this.st < 14 ? this.facing * (6 + r * 3.5) : this.vx * 0.8;
        if (!this.hitDone && this.st >= 5 && this.st <= 16) {
          const b = boxOf(this, { x0: 14, x1: 96 * this.sz, z0: 0, z1: 80 * this.sz, dy: 20 });
          const dmg = Math.round(4 + r * 7);
          if (this.hitHeroes(b, { dmg, kind: 'light', push: 3 + r * 2, stun: 18, stop: 4, sfx: 'hit_light', spark: 'warm' })) { this.hitDone = true; this.lastBite = g.frame; this.addRage(4); }
        }
        if (this.st >= 30) { this.releaseToken(); this.cool = rnd(...BEAST.cool) * (1.25 - r * 0.5); this.set('wait'); }
        break;
      case 'hurt': this.vx *= 0.8; if (this.st >= this.stun) this.set('wait'); break;
      case 'fly': this.flyUpdate(); break;
      case 'down': this.downUpdate(); break;
      case 'getup': if (this.st >= 24) { this.set('wait'); this.cool = Math.max(this.cool, 30); } break;
      case 'pop': this.vx = this.vy = 0; if (this.st === 26) this.becomePuppy(); break;
    }
    if (this.state === 'approach' || this.state === 'wait') this.separate();
    this.integrate();
  }
  think(p, sp) {
    const g = this.game, r = this.r;
    if (!p.alive || p.down || p.state === 'victory') { this.moveTo(p.x + (this.x < p.x ? -1 : 1) * 170, clamp(p.y + this.yOff * 3, lo(g), hi(g)), sp * 0.6); this.set(this.vx || this.vy ? 'approach' : 'taunt'); this.face(p); return; }
    const range = 74 * this.sz + 20, tx = this.standX(p, range), ty = clamp(p.y + (this.cool > 20 ? this.yOff : 0), lo(g), hi(g));
    if (this.cool <= 0 && Math.abs(this.x - tx) < 16 && Math.abs(this.y - p.y) < 12 && this.entered && this.takeToken()) { this.face(p); this.windup('windup'); return; }
    const s2 = this.cool > 30 && Math.abs(this.x - p.x) < 150 ? sp * 0.5 : sp;
    if (this.moveTo(tx, ty, s2)) { this.set('wait'); this.face(p); }
    else { this.set('approach'); this.ph = (this.ph + Math.hypot(this.vx, this.vy * 0.5) / (64 * 0.72 * this.sz / 1.5)) % 1; if (Math.abs(this.x - p.x) < 150) this.face(p); else if (Math.abs(this.vx) > 0.2) this.facing = Math.sign(this.vx); }   // (stride-locked: the paws planted -- it skated, the anim audit #10)
    void r;
  }
  /** calmed to nothing: it shrinks with a pop and a puppy is left (it wanders off, happy) */
  pop() {
    const g = this.game;
    this.alive = false; this.set('pop'); this.releaseToken(); this.vx = this.vy = 0;
    g.fx.word(this.x, this.y, this.h + 30, true, 'POP!'); g.fx.spark(this.x, this.y, 50, true, 'gold'); audio.sfx('puppy_pop');
    g.score += this.score; g.onFoeGone(this);
  }
  becomePuppy() {
    const g = this.game;
    this.gone = true;
    g.fx.poof(this.x, this.y, 20, false); g.fx.hearts?.(this.x, this.y); SIFX.burst(this.x, this.y, 40, 'ember', { k: 1.5 });
    g.actors.push(new FirePuppy(g, this.x, this.y, false));
  }
  drawOpts() { return { ...super.drawOpts(), rage: this.r * 1.3, scale: this.sz }; }
  pose() {
    const g = this.game;
    switch (this.state) {
      case 'approach': return this.anim('run', this.ph);
      case 'wait': case 'taunt': return this.anim(this.r > 0.6 ? 'growl' : 'idle', g.time + this.ph * 3);
      case 'windup': return this.anim('windup', Math.min(1, this.st / beastWind(this.r)));
      case 'lunge': return this.anim('lunge', Math.min(1, this.st / 30));
      case 'hurt': return this.anim('hurt', Math.min(1, this.st / this.stun));
      case 'fly': return this.anim('fly');
      case 'down': return this.anim('down', g.time);
      case 'getup': return this.anim('getup', Math.min(1, this.st / 24));
      case 'pop': return this.anim('pop', Math.min(1, this.st / 26));
      default: return this.anim('idle', g.time);
    }
  }
  draw(ctx) {
    if (this.state === 'dying') return;
    this.mem.frame = this.game.frame;
    if (this.alive && (this.pose().s3d || 0) >= 0.5) moodAura(ctx, this.game, this.sx, this.sy, this.sz, this.r);
    if (this.alive && this.state === 'windup') rimGlow(ctx, this, '#fff2b0', 0.35 + 0.5 * Math.min(1, this.st / beastWind(this.r)));   // (the lunge's wind-up: a hot rim)
    if (this.alive) SIFX.flameManeBack?.(ctx, this);   // (the flame mane, behind the body: src/sifx.js)
    super.draw(ctx);
    SIFX.flameMane(ctx, this);   // (its flame mane: src/sifx.js, the FX agent's)
    if (this.alive && this.entered && this.game.frame - (this.labelAt ?? -99) > 40) moodTag(ctx, this.game, this.sx, this.sy - 62 * this.sz - 26, this.r);   // (not under a word of its own)
  }
}

// ------------------------------------------------------------------------------------------------ the puppy
const PUP_NAMES = ['PEBBLES', 'TOASTY', 'BISCUIT', 'MARSHMALLOW', 'PIP', 'COCOA'];
let pupN = 0;
/** a calmed wolf: it trots about, tail wagging; pat it (ATTACK beside it) for hearts and a few points; it trots off after a while (the boss's waits to be patted) */
export class FirePuppy extends Actor {
  constructor(game, x, y, boss) {
    super(game, x, y);
    this.team = 'puppy'; this.art = 'ragewolf'; this.solid = false; this.boss = false; this.isBossPup = !!boss; this.w = 14; this.h = 40; this.shadowR = 22;
    this.name = PUP_NAMES[pupN++ % PUP_NAMES.length]; this.mem = {}; this.scale = boss ? 1.9 : 1.25; this.ph = Math.random(); this.state = 'trot'; this.tx = x; this.pats = 0; this.happyT = 0; this.life = 60 * 5; this.facing = Math.random() < 0.5 ? 1 : -1;
  }
  get hittable() { return false; }
  get patted() { return this.pats > 0; }
  update() {
    const g = this.game;
    this.tick();
    if (!this.isBossPup && --this.life <= 0) { this.state = 'leave'; }
    if (this.happyT > 0) this.happyT--;
    // the pat: a hero's ATTACK beside it
    for (const p of g.players) {
      if (p.out || !p.alive || p.state !== 'atk' || p.st > 3 || Math.abs(p.x - this.x) > 70 || Math.abs(p.y - this.y) > 28 || this.lastPat === p.st + '' + g.frame) continue;
      if (g.frame - (this.patAt ?? -99) < 20) continue;
      this.patBy(p);
      break;
    }
    // (QAF N6) the boss's puppy nobody pats for 10 s trots up to the nearest hero and nuzzles them: that counts -- the fight always ends
    if (this.isBossPup && !this.patted && !this.holdStill && !g.cut) {
      this.waitT = (this.waitT || 0) + 1;
      const q = this.waitT > 600 ? g.players.filter((p) => !p.out && p.alive).sort((a, b) => Math.abs(a.x - this.x) - Math.abs(b.x - this.x))[0] : null;
      if (q) {
        const dx = q.x - this.x, dy = q.y - this.y;
        if (Math.abs(dx) < 54 && Math.abs(dy) < 20) { this.patBy(q); g.fx.label(q.x, q.y, 150, 'NUZZLE!', '#ffd0e0', 26, 50); }
        else { this.x += clamp(dx - Math.sign(dx) * 40, -2.4, 2.4); this.y += clamp(dy, -1.2, 1.2); this.facing = Math.sign(dx) || this.facing; this.ph = (this.ph + 0.08) % 1; this.moving = true; return; }
      }
    }
    if (this.state === 'leave') {
      this.facing = this.x < g.camX + W / 2 ? -1 : 1; this.x += this.facing * 2.4; this.ph = (this.ph + 0.06) % 1;
      if (this.x < g.camX - 60 || this.x > g.camX + W + 60) this.gone = true;
      return;
    }
    // trotting about near where it is
    if (Math.abs(this.x - this.tx) < 6 || this.st % 140 === 0) { this.tx = clamp(this.x + rnd(-110, 110), g.camX + 60, g.camX + W - 60); this.ty = clamp(this.y + rnd(-30, 30), lo(g), hi(g)); }
    if (this.happyT <= 0 && !(this.isBossPup && this.holdStill)) {
      const dx = this.tx - this.x, dy = (this.ty ?? this.y) - this.y;
      if (Math.abs(dx) > 4) { this.x += Math.sign(dx) * 1.1; this.facing = Math.sign(dx); this.ph = (this.ph + 0.05) % 1; this.moving = true; } else this.moving = false;
      this.y += clamp(dy, -0.6, 0.6);
    } else this.moving = false;
  }
  /** a pat by hero p: hearts, a yip, the boss's onPat */
  patBy(p) {
    const g = this.game;
    this.patAt = g.frame; this.pats++; this.happyT = 50; this.facing = p.x > this.x ? 1 : -1;
    g.fx.label(this.x, this.y, 80, pick(['YIP!', 'WOOF!', 'PAT PAT!']), '#ffd0e0', 24, 40); g.fx.spark(this.x, this.y, 60, false, 'gold');
    for (let i = 0; i < 3; i++) g.fx.add({ type: 'star', x: this.x + rnd(-14, 14), y: this.y, z: 70 + i * 10, vz: 1.6, life: 34, r: 4, col: '#ff7aa8' });
    audio.sfx('puppy_yip');
    if (this.pats === 1) { g.score += 300; p.hp = Math.min(p.maxHp, p.hp + 6); }
    this.onPat?.(p);
  }
  draw(ctx) {
    const g = this.game, mod = CHARS.firepuppy || CHARS.ragewolf;   // (its own painted pack, else the rage wolf's rig)
    if (!mod) return;
    const pose = this.happyT > 0 ? mod.ANIM.wag(g.time) : this.moving || this.state === 'leave' ? mod.ANIM.hop(this.ph) : mod.ANIM.sit(g.time + this.ph * 3);
    this.mem.frame = g.frame;
    ctx.save(); ctx.translate(this.sx, this.sy);
    if (this.isBossPup && !this.patted) {   // a soft golden glow under the one to PAT
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + 0.15 * Math.sin(g.time * 6); ctx.fillStyle = '#ffd890'; ctx.beginPath(); ctx.ellipse(0, -30, 70, 52, 0, 0, TAU); ctx.fill(); ctx.restore();
    }
    mod.draw(ctx, pose, { facing: this.facing, t: g.time, scale: this.scale, puppy: true, rage: 0, pale: !this.isBossPup, mem: this.mem, vel: { x: 0, y: 0, z: 0 } });
    ctx.restore();
  }
  /** the call: a steady bouncing PAT ME sign with an arrow, over everyone (SIWorld.drawOver -> mmworld's drawOverMM) */
  drawOverMM(ctx) {
    const g = this.game;
    if (this.isBossPup && !this.patted && !this.gone) {
      const pp = CHARS.firepuppy?.ANIM?.sit?.(0), lift = pp && pp.s3d >= 0.5 ? 142 : 112;   // (the painted pup's head stands taller: the arrow clears it)
      const by = this.sy - lift - Math.abs(Math.sin(g.time * 5)) * 10;
      ctx.save(); ctx.font = 'bold 30px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.strokeText('PAT ME!', this.sx, by); ctx.fillStyle = '#ffd0e0'; ctx.fillText('PAT ME!', this.sx, by);
      ctx.fillStyle = '#ffd0e0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(this.sx - 11, by + 8); ctx.lineTo(this.sx + 11, by + 8); ctx.lineTo(this.sx, by + 24); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
  }
}

// ------------------------------------------------------------------------------------------------ a lava geyser
const SPOUT = { tele: 62, erupt: 14, up: 44, fade: 16, R: 68, dmg: 9 };
export class LavaSpout extends Actor {
  constructor(game, x, y) {
    super(game, x, y);
    this.team = 'hazard'; this.solid = false; this.w = 30; this.h = 200; this.age = 0; this.phase = 'tele'; this.shadowR = 0; this.sortY = y + 20;
    game.mm?.tentaHint?.('spout');
  }
  get hittable() { return false; }
  update() {
    const g = this.game;
    this.tick();
    if (g.cut || g.cutin) { this.st--; return; }
    this.age++;
    const S = SPOUT;
    if (this.phase === 'tele' && this.age % 6 === 0) SIFX.tease(this.x, this.y, 'ember');
    if (this.phase === 'tele' && this.age >= S.tele) { this.phase = 'erupt'; this.age = 0; this.burst(); }
    else if (this.phase === 'erupt' && this.age >= S.erupt) { this.phase = 'up'; this.age = 0; }
    else if (this.phase === 'up' && this.age >= S.up) { this.phase = 'fade'; this.age = 0; }
    else if (this.phase === 'fade' && this.age >= S.fade) { this.gone = true; this.alive = false; }
  }
  burst() {
    const g = this.game, S = SPOUT;
    audio.sfx('explosion', { pitch: 0.8, vol: 0.6 }); g.shake = Math.max(g.shake, 6); g.fx.dust(this.x, this.y, 6, 44); g.fx.spark(this.x, this.y, 30, true, 'warm');
    SIFX.burst(this.x, this.y, 6, 'ember', { k: 2 });
    for (const p of g.players) {
      if (!p.hittable || p.out || p.z > 36) continue;
      const ex = (p.x - this.x) / S.R, ey = (p.y - this.y) / (S.R * 0.34);
      if (ex * ex + ey * ey > 1) continue;
      p.takeHit({ x: this.x + (p.x < this.x ? 30 : -30), team: 'hazard', facing: p.x < this.x ? -1 : 1 }, { dmg: S.dmg, kind: 'knock', push: 4.5, lift: 6, stop: 6, sfx: 'hit_heavy', spark: 'warm' });
      g.fx.word(p.x, p.y, 150, true, 'HOT!');
    }
  }
  drawShadow(ctx) {
    const g = this.game, S = SPOUT, sx = this.sx, sy = FLOOR_TOP + this.y;
    ctx.save();
    if (this.phase === 'tele') {
      const k = Math.min(1, this.age / S.tele), blink = this.age > S.tele - 22 ? pulse(this.age - S.tele + 22) : 1;
      ctx.globalAlpha = 0.3 + 0.32 * k; ctx.fillStyle = 'rgb(255,110,30)'; ctx.beginPath(); ctx.ellipse(sx, sy, S.R, S.R * 0.34, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = blink; ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.beginPath(); ctx.ellipse(sx, sy, S.R * (1.14 - 0.14 * k), S.R * 0.34 * (1.14 - 0.14 * k), 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#ffe03a'; ctx.lineWidth = 4; ctx.setLineDash([12, 8]); ctx.stroke(); ctx.setLineDash([]);
    } else {
      const a = this.phase === 'fade' ? 1 - this.age / S.fade : 1;
      ctx.globalAlpha = 0.7 * a; const gr = ctx.createRadialGradient(sx, sy, 4, sx, sy, S.R * 0.9); gr.addColorStop(0, 'rgba(255,230,120,0.95)'); gr.addColorStop(1, 'rgba(255,90,20,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(sx, sy, S.R * 0.9, S.R * 0.3, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
    void g;
  }
  draw(ctx) {
    const g = this.game, S = SPOUT, sx = this.sx, sy = FLOOR_TOP + this.y;
    if (this.phase === 'tele') {
      ctx.save(); ctx.font = 'bold 46px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
      const yy = sy - 52 + Math.sin(g.time * 14) * 3; ctx.strokeText('!', sx, yy); ctx.fillStyle = '#ffd25a'; ctx.fillText('!', sx, yy); ctx.restore();
      return;
    }
    const k = this.phase === 'erupt' ? this.age / S.erupt : this.phase === 'fade' ? 1 - this.age / S.fade : 1, H = 220 * k, w = 34 + 8 * Math.sin(this.age * 0.5);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createLinearGradient(0, sy, 0, sy - H); gr.addColorStop(0, 'rgba(255,200,80,0.95)'); gr.addColorStop(0.5, 'rgba(255,110,30,0.85)'); gr.addColorStop(1, 'rgba(255,60,20,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(sx - w, sy); ctx.quadraticCurveTo(sx - w * 0.6, sy - H * 0.6, sx - w * 0.3 + Math.sin(g.time * 9) * 6, sy - H); ctx.quadraticCurveTo(sx + w * 0.6, sy - H * 0.55, sx + w, sy); ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#fff4b0'; ctx.beginPath(); ctx.moveTo(sx - w * 0.4, sy); ctx.quadraticCurveTo(sx, sy - H * 0.8, sx + w * 0.4, sy); ctx.closePath(); ctx.globalAlpha = 0.8; ctx.fill();
    ctx.restore();
  }
}

// ------------------------------------------------------------------------------------------------ the Rage Alpha
const ALPHA = { poke: 10, pair: 0, flurry: 8, big: 30, start: 0.7, coop: true, roundRage: [0.7, 0.6, 0.5], minCoopT: 1260, pityT: 1500, pityAt: 0.75, roundMax: 1200, lastAfter: 2400, maxT: 3300, cloudCap: 25 };   // (QA2 B1: rounds, a co-op minimum, the RAGE pity)
export class RageAlpha extends SIBoss {
  constructor(game, x, y, opt = {}) {
    super(game, x, y, opt, 'THE RAGE ALPHA', 'King of the Fire Wolves', 150);
    this.art = 'ragewolf'; this.maxHp = this.hp = 150; this.inited = false; this.w = 80; this.h = 150; this.shadowR = 80; this.balloonH = 200; this.ownFinish = true;
    this.cool = 100; this.lastHit = -999; this.puppy = null; this.shakeT = 0; this.facing = -1;
  }
  get r() { return clamp(this.hp / this.maxHp, 0, 1.4); }
  get sz() { return 1.35 + 1.15 * this.r; }
  get open() { return ['stalk', 'chargeWind', 'charge', 'stompWind', 'stomp', 'roar', 'winded'].includes(this.state); }
  get siDone() { return !this.alive || ['shrink', 'pup', 'happy', 'defeated'].includes(this.state); }   // (calmed: src/siworld.js clears its tips -- QAF M-B)
  get hittable() { return this.alive && this.inv <= 0 && this.game.fighting && !this.game.cut && this.open; }
  addRage(pct, label) {
    const g = this.game;
    this.hp = clamp(this.hp + pct / 100 * this.maxHp, 0, this.maxHp * (live(g).length > 1 ? 1.2 : 1.4));   // (co-op: 1.2 at most -- a mashing party grew it to ~3x: QAF N8)
    if (label && Math.abs(pct) >= 3) g.fx.label(this.x, this.y, this.h * this.sz * 0.8 + 50, label, pct < 0 ? '#9fe7ff' : '#ff8a5a', 28, 44);
    if (this.r >= 0.95 && g.L?.id === 'sicave') g.siFury = true;   // (the Alpha starts at 0.7: past 0.95 it was really angry -- no kraken pal)
    if (this.r <= 0.1 && ['stalk', 'chargeWind', 'charge', 'stompWind', 'stomp', 'roar', 'winded'].includes(this.state)) this.roundCalmed();
  }
  /** a calm round won: calm rounds (QA2 B1) -- 2 alone or with a friend, 3 with 3-4, never calm in under ~21 s of a co-op fight; past 50 s it is the last */
  roundCalmed() {
    const g = this.game, ft = this.fightT || 0;
    if (ft < ALPHA.lastAfter && (this.round < this.rounds || (live(g).length > 1 && ft < ALPHA.minCoopT && this.round < this.rounds + 2))) this.nextRound();
    else this.beginShrink();
  }
  /** calmed, but not all the way yet: it shakes itself, growls, and comes back a little calmer than before */
  nextRound() {
    const g = this.game;
    this.round++; this.roundT = 0; this.hp = this.maxHp * (ALPHA.roundRage[this.round - 1] ?? 0.4); this.log = []; this.releaseToken(); this.vx = this.vy = 0;
    this.set('regroup'); g.fx.label(this.x, this.y, this.h * this.sz * 0.8 + 50, 'CALMER! AGAIN!', '#9fe7ff', 30, 70);
    audio.sfx('rage_calm'); g.fx.spark(this.x, this.y, 90, true, 'gold');
  }
  calmBy(pct) { this.addRage(-Math.min(ALPHA.cloudCap, pct * 0.7), 'CALM!'); }   // (the CALM CLOUD: at most a quarter, QA2 B1)
  onPerfectDodged() { this.addRage(-18, 'CALM!'); }
  bossIntro() { this.set('intro'); audio.sfx('roar', { pitch: 0.6 }); this.game.shake = Math.max(this.game.shake, 8); }
  bossFight() {
    const g = this.game, m = g.mm;
    this.set('stalk'); this.cool = 110; this.round = 1; this.rounds = live(g).length >= 3 ? 3 : 2; this.fightT = 0; this.rageT = 0;
    m?.hint?.('sialpha', "The Alpha is FURIOUS! Do NOT mash. || HOLD ATTACK, then let go: a calm strong strike! || RED lane = a charge: step aside! || A RING = a stomp: JUMP!", 330, true);
    if (live(g).some((p) => p.heroId === 'dodongo')) m?.hint?.('sicloud', "Dodongo's SUPER here: the CALM LITTLE CLOUD! || It calms every wolf on the screen!", 300);
  }
  keyHint(n) { return n % 2 ? ['sialphaA', 'Poke it ONCE, then step back. || Mashing makes it GROW! Hold ATTACK instead.'] : ['sialphaB', 'A PERFECT DODGE of its charge calms it down, too!']; }
  takeHit(att, hd) {
    if (!this.hittable) return false;
    const g = this.game, { d, kind } = calmDelta(this, att, hd, ALPHA), from = att.x > this.x ? 1 : -1;
    this.flash = 6; this.lastHit = g.frame; this.hurtAt = g.frame; this.ouch = 8; this.flinchArt = false;   // (the anim audit #6: the recoil only -- painter 2's Alpha hurt and its mapping are to come)
    if (!hd.quiet) audio.sfx('brute_hurt', { pitch: 0.7 + this.r * 0.1, vol: 0.7 });
    if (kind === 'flurry') { this.addRage(d, 'GRRRR!'); g.fx.spark(this.x, this.y, 80, false, 'warm'); if (!this.told) { this.told = true; g.mm?.hint?.('sialpha2', `It is GROWING! Let go of ${g.mm.keyName('attack')}. || HOLD it, then let go: a calm strike!`, 300, true); } }
    else if (kind === 'pair') this.addRage(d);
    else if (d < 0) this.addRage(d, kind === 'big' ? 'CALMED!' : 'CALM!');
    if (kind === 'big' && this.state !== 'shrink' && this.alive && this.state !== 'pup') { this.set('winded'); this.vx = 0; this.releaseToken(); g.fx.word(this.x, this.y, 200, true, 'WHOOOF...'); }
    void from;
    return true;
  }
  beginShrink() {
    const g = this.game;
    this.set('shrink'); this.releaseToken(); this.vx = this.vy = 0; this.shrinkT = 0;
    SIFX.bossBeat?.(g, this);   // (the final blow: slow-mo + a camera nudge + its material burst, src/sifx.js)
    for (const a of g.actors) if (a.team === 'foe' && a !== this && a.alive && a.pop) a.pop();   // (every beast calms with it)
    g.fx.word(this.x, this.y, 240, true, 'CALM...'); audio.sfx('rage_calm');
    if (g.L?.id === 'sicave' && !g.siFury) {   // (FULL CALM: the friendly kraken heard it -- it will come to the Skull Palace, once per fight)
      const fresh = earnKrakenPal();
      g.fx.label(this.x, this.y, 330, 'FULL CALM!', '#9fe7ff', 44, 110);
      this.palMsg = fresh ? 'FULL CALM! The friendly KRAKEN heard you! || It will help you at the SKULL PALACE!' : 'FULL CALM again! || The KRAKEN is still your pal!';   // (said at the pat: the puppy's own hint comes first, and must not be cut)
    }
  }
  onPuppyPat() {
    const g = this.game;
    if (this.state === 'happy') return;
    this.set('happy'); this.happyT = 0;
    g.fx.label(this.x, this.y, 140, 'GOOD PUPPY!', '#ffd0e0', 36, 80); audio.sfx('puppy_pop'); g.shake = Math.max(g.shake, 4);
    if (this.palMsg) { g.mm?.hint?.('sikrakenpal', this.palMsg, 420, true); this.palMsg = null; }
  }
  update() {
    const g = this.game, p = this.player;
    this.tick();
    if (!this.inited) { this.inited = true; this.hp = this.maxHp * ALPHA.start; }
    if (this.ouch > 0) this.ouch--;
    if (this.cool > 0) this.cool--;
    const r = this.r;
    this.w = 40 * this.sz; this.h = 62 * this.sz * 1.1;
    if (g.frame - this.lastHit > 100 && this.r > 0.3 && ['stalk', 'winded'].includes(this.state) && g.fighting) this.hp -= this.maxHp * 0.0004;   // (a pause cools it)
    if (g.fighting && !g.cut && this.alive && this.round) {
      this.fightT = (this.fightT || 0) + 1;
      // (a pity, QA2 B1 -- the palace's rule: angry (GRR!/RAGE!) for 25 s in all, it runs out of steam and tires all the way down to its puppy)
      if (this.r >= ALPHA.pityAt && this.open) this.rageT = (this.rageT || 0) + 1;
      if (this.open) this.roundT = (this.roundT || 0) + 1;
      if (this.roundT > ALPHA.roundMax && this.open && this.r > 0.1) { this.roundT = 0; this.hp = this.maxHp * 0.05; this.roundCalmed(); return; }   // (a round that drags: 20 s, it tires)
      if (live(g).length > 1 && this.rageT > 900 && this.fightT <= ALPHA.maxT && this.open && !(this.round >= 2 && this.fightT >= ALPHA.minCoopT)) {   // (QAF re-check R2: co-op, the pity tires it into the next calm round -- the end only after round 2 and 21 s)
        this.rageT = 0; this.nextRound(); this.hp = this.maxHp * 0.6; this.tired = true;   // (tired: slower to attack, softer hits -- a mashing party's KOs stay 0)
        let sn = 0; for (const q of live(g)) if (q.hp < 60) { const x = clamp(q.x + (this.x > q.x ? 56 : -56), g.camX + 80, g.camX + W - 80); g.spawnPickup('drumstick', x, q.y); if (!sn++) g.fx.label(x, q.y, 90, 'SNACK!', '#ffe9a0', 26, 50); }   // (a breather: a snack by each low hero)
        return;
      }
      if ((this.rageT > (live(g).length > 1 ? 900 : ALPHA.pityT) || this.fightT > ALPHA.maxT) && this.open) { this.rageT = 0; this.hp = this.maxHp * 0.05; this.round = this.rounds + 9; this.beginShrink(); return; }
    }
    if (this.shakeT > 0) { this.shakeT--; g.stage?.setShake?.(this.shakeT / 30); }
    const sp = 1.1 + r * 0.9;
    switch (this.state) {
      case 'intro': this.vx = this.vy = 0; break;
      case 'stalk': {
        if (!g.fighting || g.cut) break;
        const range = 110 * this.sz / 1.8, tx = this.standX(p, range), ty = clamp(p.y, lo(g), hi(g));
        if (this.moveTo(tx, ty, sp)) { this.face(p); } else { this.ph = (this.ph + Math.hypot(this.vx, this.vy * 0.5) / (64 * 0.72 * this.sz / 1.5)) % 1; if (Math.abs(this.vx) > 0.2) this.facing = Math.sign(this.vx); }   // (stride-locked, as the beasts')
        if (this.cool <= 0 && (!this.tired || this.st > 170) && (Math.abs(this.x - tx) < 40 || this.st > 200)) this.pickAttack(p);   // (tired by the co-op pity: 3 s between attacks at least)
        break;
      }
      case 'winded': this.vx = this.vy = 0; if (this.st >= 70) { this.set('stalk'); this.cool = 60; } break;
      case 'regroup':   // (between calm rounds: a shake and a growl, a second to breathe -- not hittable)
        this.vx = this.vy = 0;
        if (this.st === 16) { audio.sfx('roar', { pitch: 0.8, vol: 0.7 }); g.shake = Math.max(g.shake, 6); }
        if (this.st >= 66) { this.set('stalk'); this.cool = 50; }
        break;
      case 'chargeWind':
        this.vx = this.vy = 0; this.face(p);
        if (this.st < Math.max(36, Math.round(48 - r * 10)) - 24) this.aimY = clamp(p.y, lo(g), hi(g));   // (the lane locks 24 f before the charge)
        this.y += clamp((this.aimY - this.y), -2.5, 2.5);
        if (this.st >= Math.max(36, Math.round(48 - r * 10))) { this.set('charge'); this.hitDone = false; audio.sfx('swing_heavy', { pitch: 0.5 }); }
        break;
      case 'charge': {
        this.vx = this.facing * (8.5 + r * 3); this.vy = 0;
        if (!this.hitDone || this.st % 6 === 0) for (const q of g.players) {
          if (!q.hittable || q.out || this.hitSet?.has(q) || Math.abs(q.y - this.y) > 26 || q.z > 50 || Math.abs(q.x - this.x) > 36 * this.sz / 1.5 + 18) continue;
          (this.hitSet || (this.hitSet = new Set())).add(q);
          q.takeHit(this, { dmg: Math.round((8 + r * 6) * (this.tired ? 0.375 : live(g).length > 1 ? 0.75 : 1)), kind: 'knock', push: 5.5, lift: 5.5, stop: 6, sfx: 'hit_heavy', spark: 'warm' }); this.hitDone = true; this.addRage(4);
        }
        const edge = this.facing > 0 ? this.x > g.camX + W - 90 : this.x < g.camX + 90;
        if (this.st >= 34 || edge) { this.vx = 0; this.hitSet = null; this.set('winded'); this.st = 30; g.fx.dust(this.x, this.y, 8, 50); g.shake = Math.max(g.shake, 6); }   // (it skids, winded: a free breather to poke it)
        break;
      }
      case 'stompWind': this.vx = this.vy = 0; this.face(p); if (this.st === 1) windSound(this, 'growl'); if (this.st >= Math.max(36, Math.round(44 - r * 8))) { this.set('stomp'); this.hitDone = false; } break;
      case 'stomp':
        this.vx = this.vy = 0;
        if (this.st === 8) {
          audio.sfx('explosion', { pitch: 0.6, vol: 0.8 }); g.shake = Math.max(g.shake, 12); this.shakeT = 30;
          g.fx.ring(this.x, this.y, { rx: 190, ry: 64, shock: true, col: '#ff8a3a', life: 24 }); g.fx.dust(this.x, this.y, 10, 80);
          for (const q of g.players) { if (!q.hittable || q.out || q.z > 30) continue; const ex = (q.x - this.x) / 190, ey = (q.y - this.y) / 64; if (ex * ex + ey * ey > 1) continue; q.takeHit(this, { dmg: Math.round((6 + r * 5) * (this.tired ? 0.375 : live(g).length > 1 ? 0.75 : 1)), kind: 'knock', push: 5, lift: 6.5, stop: 6, sfx: 'hit_heavy', spark: 'warm' }); this.addRage(3); }
        }
        if (this.st >= 36) { this.set('stalk'); this.cool = rnd(80, 130) * (1.2 - r * 0.4); }
        break;
      case 'roar':
        this.vx = this.vy = 0;
        if (this.st === 14) { audio.sfx('roar', { pitch: 0.7 }); g.shake = Math.max(g.shake, 6); for (const spec of [{ k: 'ragebeast', side: 'L', y: rnd(30, 120) }, { k: 'ragebeast', side: 'R', y: rnd(30, 120), delay: 40 }]) g.pending.push({ spec, at: g.frame + (spec.delay || 0) }); }
        if (this.st >= 56) { this.set('stalk'); this.cool = rnd(120, 180); }
        break;
      case 'shrink': {
        this.shrinkT++;
        if (this.shrinkT === 50) {   // the puppy
          this.puppy = new FirePuppy(g, this.x, this.y, true); this.puppy.onPat = () => this.onPuppyPat(); g.actors.push(this.puppy);
          g.fx.poof(this.x, this.y, 30, true); g.fx.spark(this.x, this.y, 60, true, 'gold'); SIFX.burst(this.x, this.y, 40, 'ember', { k: 1.5 });
          g.mm?.hint?.('sipat', `A PUPPY! Walk up and PAT it: press ${g.mm?.keyName?.('attack') || 'ATTACK'}!`, 400, true);
        }
        if (this.shrinkT >= 52) this.set('pup');
        break;
      }
      case 'pup': if (this.puppy) this.puppy.holdStill = false; break;
      case 'happy': {
        this.happyT = (this.happyT || 0) + 1;
        // (the end waits while the kraken pal's message is up: a child needs the seconds to read it; at most ~8 s)
        if (!this.endCalled && this.happyT >= 70 && !(g.hint && g.hint.key === 'sikrakenpal' && this.happyT < 520)) { this.endCalled = true; this.defeat(); }
        break;
      }
      default: break;
    }
    if (!['intro', 'shrink', 'pup', 'happy'].includes(this.state)) { this.x += this.vx; this.y = clamp(this.y + this.vy, lo(g), hi(g)); this.x = clamp(this.x, g.camX + 40, g.camX + W - 40); }
  }
  pickAttack(p) {
    const g = this.game, foes = g.actors.filter((a) => a.team === 'foe' && a.alive && !a.boss).length;
    const roll = Math.random();
    this.face(p); this.releaseToken();
    if (roll < 0.42) { this.set('chargeWind'); this.aimY = p.y; this.hitSet = null; g.fx.alert?.(this); audio.sfx('roar', { pitch: 1.1, vol: 0.5 }); }
    else if (roll < 0.74 || foes >= 2) { this.set('stompWind'); g.fx.alert?.(this); }
    else this.set('roar');
    this.cool = 40;
  }
  defeat() { if (!this.alive) return; if (this.puppy) this.puppy.holdStill = true; super.defeat(); }
  /** the telegraphs on the floor: a red lane for the charge (his y, across the screen), a ring for the stomp */
  drawFloor(ctx) {
    const g = this.game, st = this.state;
    if (st === 'chargeWind') {
      const y = FLOOR_TOP + this.y, k = Math.min(1, this.st / 44), a = 0.18 + 0.2 * k + 0.1 * Math.sin(this.st * 0.6);
      ctx.save(); ctx.fillStyle = `rgba(255,50,30,${a})`; ctx.fillRect(0, y - 26, W, 52); ctx.fillStyle = 'rgba(255,214,120,0.8)'; ctx.fillRect(0, y - 28, W, 3); ctx.fillRect(0, y + 25, W, 3);
      ctx.strokeStyle = 'rgba(255,244,190,0.9)'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; const d = this.facing;
      for (let i = 0; i < 13; i++) { const x = (((i * 80 + this.st * 7 * d) % (W + 80)) + W + 80) % (W + 80) - 40; ctx.beginPath(); ctx.moveTo(x - 9 * d, y - 13); ctx.lineTo(x + 8 * d, y); ctx.lineTo(x - 9 * d, y + 13); ctx.stroke(); }
      ctx.restore();
    } else if (st === 'stompWind') {
      const sx = this.sx, sy = FLOOR_TOP + this.y, k = Math.min(1, this.st / 40);
      ctx.save(); ctx.globalAlpha = 0.28 + 0.3 * k; ctx.fillStyle = 'rgb(255,120,30)'; ctx.beginPath(); ctx.ellipse(sx, sy, 190, 64, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.beginPath(); ctx.ellipse(sx, sy, 190 * (1.1 - 0.1 * k), 64 * (1.1 - 0.1 * k), 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#ffe03a'; ctx.lineWidth = 4; ctx.setLineDash([12, 8]); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
      void g;
    }
  }
  drawOpts() { const t = this.state === 'shrink' ? Math.max(0.2, 1 - this.shrinkT / 50) : 1; return { ...super.drawOpts(), rage: this.r * 1.3, alpha: true, scale: this.sz * t }; }
  /** painter 2's own clip k: painted and named k (not a stand-in) */
  own(k) { const f = CHARS[this.art]?.ANIM?.[k], p = typeof f === 'function' ? f(0) : f; return !!(p && p.s3d >= 0.5 && p.clip === k); }
  pose() {
    const g = this.game;
    switch (this.state) {
      case 'intro': return this.anim('growl', g.time);
      case 'stalk': return this.vx || this.vy ? this.anim('run', this.ph) : this.anim('growl', g.time);
      case 'winded': return this.own('winded') ? this.anim('winded', this.st / 60) : this.anim('hurt', 0.8 + 0.2 * Math.sin(this.st * 0.3));   // (painter 2: a 30 f pant loop from the state's start)
      case 'chargeWind': return this.anim('windup', Math.min(1, this.st / 44));
      case 'charge': return this.anim('lunge', 0.35);
      case 'stompWind': return this.own('stompWind') ? this.anim('stompWind', Math.min(1, this.st / Math.max(36, Math.round(44 - this.r * 8)))) : this.anim('windup', Math.min(1, this.st / 40));   // (over the state's own length: it rears, the peak trembles to the end)
      case 'stomp': return this.own('stomp') ? this.anim('stomp', Math.min(1, this.st / 30)) : this.anim('lunge', 0.2 + 0.4 * Math.min(1, this.st / 30));   // (the forepaw slam on at f6-10: the shockwave at st 8)
      case 'roar': return this.own('roar') ? this.anim('roar', Math.min(1, this.st / 52)) : this.anim('growl', g.time * 2);   // (the inhale, the peak at f14 on the roar sfx, the head-shake, lowering out)
      case 'regroup': return this.anim(this.st < 30 ? 'hurt' : 'growl', this.st < 30 ? 0.8 : g.time * 2);
      case 'shrink': return this.own('shrink') ? this.anim('shrink', Math.min(1, this.shrinkT / 50)) : this.anim('pop', Math.min(1, this.shrinkT / 50));   // (r2: one size, the pose morphing toward the pup -- drawOpts' scale ramp does the shrinking)
      default: return this.anim('idle', g.time);
    }
  }
  draw(ctx) {
    if (['pup', 'happy', 'defeated'].includes(this.state) || (this.state === 'shrink' && this.shrinkT >= 50)) return;   // (the puppy has taken its place)
    this.mem.frame = this.game.frame;
    if (this.alive && (this.pose().s3d || 0) >= 0.5) moodAura(ctx, this.game, this.sx, this.sy, this.sz * (this.state === 'shrink' ? Math.max(0.2, 1 - this.shrinkT / 50) : 1), this.r);
    if (this.alive && (this.state === 'chargeWind' || this.state === 'stompWind')) rimGlow(ctx, this, '#fff2b0', 0.35 + 0.5 * Math.min(1, this.st / 30));   // (a charge / stomp winding up: a hot rim)
    if (this.alive) SIFX.flameManeBack?.(ctx, this);   // (the flame mane, behind the body: src/sifx.js)
    super.draw(ctx);
    SIFX.flameMane(ctx, this);   // (its flame mane: src/sifx.js)
    if (this.alive && !['intro', 'shrink'].includes(this.state)) moodTag(ctx, this.game, this.sx, this.sy - 62 * this.sz * 1.1 - 22, this.r, 64);
  }
}

// ------------------------------------------------------------------------------------------------ CALM LITTLE CLOUD
/** Dodongo's super in the Cave of Rage: a small cute rain cloud over him; its soothing pulse calms every wolf on the screen (a lot), rains
 * little hearts and a bit of health on the heroes.  (No dragon here: "If you turn into a dragon, the bridge will break!") */
export class CalmCloud extends Actor {
  constructor(game, owner) {
    super(game, owner.x, owner.y);
    this.team = 'fx'; this.solid = false; this.owner = owner; this.age = 0; this.life = 110; this.pulsed = false; this.shadowR = 0; this.sortY = 900;
    this.drops = Array.from({ length: 26 }, () => ({ x: rnd(-90, 90), y: rnd(0, 180), s: rnd(0.8, 1.4) }));
  }
  get hittable() { return false; }
  update() {
    const g = this.game;
    this.tick(); this.age++;
    if (g.cutin) { this.age--; return; }
    this.x += (this.owner.x - this.x) * 0.1; this.y += (this.owner.y - this.y) * 0.1;
    if (this.age === 20 && !this.pulsed) {
      this.pulsed = true;
      audio.sfx('calm_cloud'); g.fx.ring(this.x, this.y, { rx: 260, ry: 88, shock: true, col: '#9fe7ff', life: 30 });
      for (const a of g.actors) if (a.team === 'foe' && a.alive && a.calmBy && a.x > g.camX - 40 && a.x < g.camX + W + 40) a.calmBy(62);
      for (const p of g.players) if (!p.out && p.alive) { p.hp = Math.min(p.maxHp, p.hp + 12); g.fx.label(p.x, p.y, 170, 'AAAH...', '#bff0ff', 22, 40); }
    }
    if (this.age >= this.life) { this.gone = true; this.alive = false; }
  }
  draw(ctx) {
    const g = this.game, sx = this.x - g.camX, sy = FLOOR_TOP + this.y - 190 + Math.sin(this.age * 0.1) * 4, k = Math.min(1, this.age / 14) * (this.age > this.life - 14 ? (this.life - this.age) / 14 : 1);
    if (k <= 0.01) return;
    ctx.save(); ctx.globalAlpha = k; ctx.translate(sx, sy); ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);
    for (const d of this.drops) { const y = ((d.y + this.age * 4 * d.s) % 180); ctx.strokeStyle = 'rgba(150,210,255,0.9)'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(d.x * 0.8, 22 + y); ctx.lineTo(d.x * 0.8 - 1.5, 30 + y); ctx.stroke(); }
    ctx.fillStyle = '#cfe4f8'; ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    ctx.beginPath(); for (const [x, y, r] of [[-52, 8, 22], [-24, -8, 30], [10, -12, 32], [42, -2, 26], [66, 10, 20], [8, 12, 34]]) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#cfe4f8'; ctx.beginPath(); for (const [x, y, r] of [[-52, 8, 21], [-24, -8, 29], [10, -12, 31], [42, -2, 25], [66, 10, 19], [8, 12, 33]]) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); } ctx.fill();
    ctx.fillStyle = INK; for (const ex of [-4, 22]) { ctx.beginPath(); ctx.ellipse(ex, 4, 4, 6, 0, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(9, 14, 8, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,150,170,0.6)'; for (const ex of [-12, 30]) { ctx.beginPath(); ctx.ellipse(ex, 14, 6, 4, 0, 0, TAU); ctx.fill(); }
    ctx.restore();
    // hearts drifting up over the heroes during the pulse
    if (this.age > 20 && this.age < 80) for (const p of g.players) { if (p.out) continue; const t = (this.age - 20) / 60; ctx.save(); ctx.globalAlpha = 1 - t; ctx.fillStyle = '#ff7aa8'; ctx.strokeStyle = INK; ctx.lineWidth = 2; const hx = p.sx + Math.sin(this.age * 0.3 + p.slot) * 8, hy = p.sy - 90 - t * 50; ctx.beginPath(); ctx.moveTo(hx, hy + 5); ctx.bezierCurveTo(hx - 12, hy - 6, hx - 4, hy - 14, hx, hy - 6); ctx.bezierCurveTo(hx + 4, hy - 14, hx + 12, hy - 6, hx, hy + 5); ctx.fill(); ctx.stroke(); ctx.restore(); }
  }
  drawShadow() {}
}
