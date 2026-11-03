// The secret stages' mini-bosses (docs/SECRETS.md): the frost brute chief (the Frozen Hollow) and the wyvern alpha (the
// Eyrie) -- built on the brute and the wyvern, bigger, tougher, with a boss's intro / defeat hooks (World.startBoss,
// World.onBossDefeated).  Crystal Magmaw is Magmaw itself (src/enemies2.js: def.crystal).  Their painted looks: the
// frost chief brute_frost (a std-kit brute drawn 1.1x, striding and charging 1.1x: no foot slide), the alpha
// wyvern_alpha (the wyvern layer, no rider, drawn 1.4x) -- the alpha from the base wyvern's atlas with a storm wash
// until its own lands (src/chars/wyvern3d.js ALPHA_ART).
import { Brute, CHARS } from './enemies.js';
import { Wyvern } from './enemies2.js';
import { audio } from './audio-proxy.js';
import { TINT_VARIANTS } from './secrets.js';

const rnd = (a, b) => a + Math.random() * (b - a);

/** the frost brute chief: a big brute (1.1x, 380 hp before co-op scaling) who calls two frost kobolds at half health */
export class BruteChief extends Brute {
  constructor(game, x, y, opt = {}) {
    super(game, x, y, { name: opt.name || 'THE FROST CHIEF' });
    this.variant = 'std'; this.look = opt.look || 'frost';    // (the frost brute's atlas; its code rig in frost where it's missing)
    if (opt.wash) this.wash = opt.wash;
    this.callV = opt.callV || 'frost';
    this.hp = this.maxHp = opt.hp || 380;
    this.scale = this.spK = 1.1; this.w = 48; this.h = 216; this.shadowR = 55; this.balloonH = 265;
    this.entered = true; this.facing = -1; this.score = 8000; this.collared = false;
    this.set('intro');
  }
  get boss() { return true; }
  get freedNow() { return this.state === 'freed'; }
  bossIntro() { this.set('roar'); audio.sfx('roar', { pitch: 0.8 }); }
  bossFight() { this.set('wait'); this.cool = 50; }
  get hittable() { return this.state !== 'intro' && super.hittable; }
  takeHit(att, hd) {
    const r = super.takeHit(att, hd);
    if (r && !this.called && this.alive && this.hp > 0 && this.hp < this.maxHp * 0.5) {   // half health: he calls for help
      this.called = true;
      const g = this.game, away = g.players[0] && g.players[0].x < g.camX + 480 ? 'R' : 'L';
      g.fx.balloon(this, 'GET THEM, LADS!', 100, { villain: true });
      g.spawn({ k: 'kobold', v: this.callV, side: away, y: 40 });
      g.spawn({ k: 'kobold', v: this.callV, side: away, y: 120, delay: 30 });
    }
    return r;
  }
  update() {
    if (this.state === 'intro') { this.tick(); this.vx = this.vy = 0; return; }
    if (this.state === 'calming' || this.state === 'freed') { this.freeUpdate(); return; }
    if (this.cool > 20 && this.state === 'wait') this.cool -= 0.4;   // (a little quicker than a plain brute)
    super.update();
  }
  /** (RC: nobody dies -- beaten, he no longer blinks out face-down.  After the knockdown's settle (the brute's own down timing)
   *  he gets up on the get-up drawings and timing ('calming'), then stands easy on the idle drawing, FREED!: the word, hearts and
   *  sparkles and the freed sound, as the other bosses -- the score and the foe count as the blink-out gave them) */
  die() {
    this.alive = false; this.releaseToken(); this.vx = this.vy = 0;
    this.set('calming');
    const P = this.game.players.filter((q) => !q.out); if (P.length) { const n = P.reduce((m, q) => (Math.abs(q.x - this.x) < Math.abs(m.x - this.x) ? q : m)); this.facing = n.x > this.x ? 1 : -1; }   // (he rises facing the nearest hero -- RC2: turned at FREED! it flipped)
    if (!this.reported) { this.reported = true; this.game.onBossDefeated(this); }
  }
  /** (RC2) beaten, the prone settle is short: up at the end of the down clip's rebound (CALM.down), not the brute's 24 frames */
  downUpdate(time) {
    if (this.hp <= 0) { if (this.st >= CALM.down) this.die(); return; }
    super.downUpdate(time);
  }
  freeUpdate() {
    const g = this.game;
    this.tick(); this.vx = this.vy = 0;
    if (this.state === 'calming' && this.st >= CALM.end) {
      this.set('freed');
      g.fx.hearts(this.x, this.y, 150, 12);
      g.fx.spark(this.x, this.y, 170, true, 'cool');
      g.fx.label(this.x, this.y, 250, 'FREED!', '#9dff8a', 48, 90);
      audio.sfx('freed');   // (the stage's own clear jingle is already playing: game.js secretBossDown)
      g.score += this.score; g.onFoeGone(this);
    }
    if (this.state === 'freed' && this.st % 40 === 20 && this.st < 200) g.fx.hearts(this.x, this.y, 170, 2);   // (a few hearts drifting up a while)
  }
  /** (RC2) the rise, his get-up drawings one way up: prone a beat (#0, the KA-BOOM freeze lands on it), then crouch (#2), rising
   *  (#3), standing (#4 -- the idle drawing's pose); #1, an upright kneel taller than #2, is left out (prone -> kneel -> crouch read as
   *  a pop up and a sag back).  No pack resident: the clip by time, as the rig has it */
  pose() {
    if (this.state === 'calming') {
      const P = this.anim('getup', 0);
      if (!(P && P.s3d >= 0.5 && P.clip === 'getup')) return this.anim('getup', Math.min(1, this.st / CALM.end));
      let i = 0, t = CALM.prone;
      if (this.st >= t) for (const [d, n] of CALM.steps) { i = d; t += n; if (this.st < t) break; }
      return { ...P, f_getup: i };
    }
    if (this.state === 'freed') return this.anim('idle', this.game.time + this.ph * 3);
    return super.pose();
  }
  /** (RC2) the push up off the floor eased: a squash on the first rising drawing (wide and low, settling to 1 over 8 frames, at the feet) */
  draw(ctx) {
    const u = this.state === 'calming' ? (this.st - CALM.prone) / 8 : -1;
    if (!(u >= 0 && u < 1)) { super.draw(ctx); return; }
    const kx = 1.08 - 0.08 * u, ky = 0.88 + 0.12 * u, x = this.sx, y = this.sy;
    ctx.save(); ctx.translate(x, y); ctx.scale(kx, ky); ctx.translate(-x, -y);
    try { super.draw(ctx); } finally { ctx.restore(); }
  }
}
/** (RC2) the Frost Chief's beaten beat: frames prone in the down clip before he starts up (its land and rebound: 12), prone again at
 *  the rise's start (6 -- plus the defeat's 20-frame freeze), then his get-up drawings [index, frames]; FREED! at the end */
const CALM = { down: 12, prone: 6, steps: [[2, 10], [3, 9], [4, 9]], end: 34 };

/** the wyvern alpha: a big storm wyvern with no rider (1.4x, 320 hp), diving more often; calls two storm whelps at half
 * health; beaten, it's freed like any wyvern (a cursed dragon) */
export class WyvernAlpha extends Wyvern {
  constructor(game, x, y, opt = {}) {
    super(game, x, y, { name: opt.name || 'THE WYVERN ALPHA' });
    this.rider = false; this.variant = 'alpha';
    if (opt.wash || !CHARS.wyvern?.ALPHA_ART) this.wash = opt.wash || TINT_VARIANTS.storm.wash;   // (its own atlas not in yet)
    this.hp = this.maxHp = opt.hp || 320;
    this.scale = 1.4; this.w = 48; this.h = 78; this.shadowR = 48; this.balloonH = 170;
    this.entered = true; this.facing = -1; this.score = 8000;
    this.set('intro');
  }
  get boss() { return true; }
  get freedNow() { return this.state === 'freed'; }
  bossIntro() { audio.sfx('roar', { pitch: 1.3 }); }
  bossFight() { this.set('hover'); this.cool = 60; }
  get hittable() { return this.state !== 'intro' && super.hittable; }
  takeHit(att, hd) {
    const r = super.takeHit(att, hd);
    if (r && !this.called && this.alive && this.hp > 0 && this.hp < this.maxHp * 0.5) {
      this.called = true;
      const g = this.game;
      g.fx.balloon(this, 'SKREEE!', 80, { villain: true });
      g.spawn({ k: 'whelp', v: 'storm', side: 'R', y: 50 });
      g.spawn({ k: 'whelp', v: 'storm', side: 'L', y: 110, delay: 40 });
    }
    return r;
  }
  update() {
    if (this.state === 'intro') { this.tick(); this.vx = this.vy = 0; this.z += (96 - this.z) * 0.08; return; }
    if (this.state === 'hover' && this.cool > 30) this.cool -= 0.6;   // (it dives about twice as often)
    super.update();
  }
  free() {
    super.free();
    if (!this.reported) { this.reported = true; this.game.onBossDefeated(this); }
  }
  // (rnd kept for later tuning)
  static jitter() { return rnd(0, 1); }
}
