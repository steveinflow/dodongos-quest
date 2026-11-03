// Mystic Mountain's foes (docs/MYSTIC_MOUNTAIN.md; the stages in src/mmlevels.js).  Kid-friendly: nobody dies -- the
// smoke wolves fade (or scatter and re-form), bats and crows flee, snowmen burst into a puff, imps poof, the armour
// knights fall apart into empty armour.  Placeholder art until the painted packs land: the code rigs in src/chars/
// (shadowwolf, cliffbat, snowman, stormcrow) and, for the variants, the kobold's and the guard's art under a colour
// wash (src/render.js drawTinted).
//   wolf     the shadow wolf: a quick biter.  A normal KO SCATTERS it (smoke flying apart) and it RE-FORMS ~2 s later at
//            half health -- unless the KO was LIGHT (src/mmworld.js isLight): then it fades for good.  (Kind to a team
//            without light -- Shadow alone: after two re-forms it gives up and fades anyway.)  v 'big': a bigger one.
//   bat      the cliff bat: hovers, swoops; knocked down, it flees.
//   crow     the storm crow: circles high, dives steeply; knocked down, it flees.
//   snowman  shuffles, throws snowballs, rolls up into one big snowball and bowls at the heroes; bursts into a puff.
//            v 'big': the Gale's big one.
//   imp      the kobold's kit in a new coat: v 'rock' (the rock imps: sturdy, stone grey), 'ice' (the ice imps: quick
//            hoppers with a frost breath), 'greenfire' (the green-fire imps: they throw Morvath's green fire).
//   knight   the living armour (the guard's art in grey steel, red eye slits, a red puppet string up to the gem):
//            v sword (with its shield: it blocks) | axe | halberd.  Knocked apart, it floats back together -- once in
//            the halls, and for as long as the ruby gem stands in the gem's fight; the gem broken, they all collapse.
import { Enemy, Kobold, CHARS } from './enemies.js';
import { EnemyShot, ShamanFire } from './projectiles.js';
import { GRAV, boxOf } from './actors.js';
import { audio } from './audio-proxy.js';
import { isLight } from './mmworld.js';
import { W, DEPTH, FLOOR_TOP } from './config.js';
import { clamp, TAU } from './rig.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const depthLo = (g) => (g.lane ? g.lane[0] : 4), depthHi = (g) => (g.lane ? g.lane[1] : DEPTH - 4);

// ==================================================================================================== SHADOW WOLF
const WOLF = { std: { hp: 36, sp: 2.5, dmg: 8, scale: 1 }, big: { hp: 62, sp: 2.2, dmg: 11, scale: 1.28 } };
export class ShadowWolf extends Enemy {
  constructor(game, x, y, opt = {}) {
    const v = WOLF[opt.variant] ? opt.variant : 'std';
    super(game, x, y, { name: opt.name || pick(['SHADE', 'GLOOM', 'MURK', 'SOOT', 'DUSK']), scale: WOLF[v].scale });
    this.art = 'shadow_wolf'; this.variant = v; this.S = WOLF[v];
    this.hp = this.maxHp = this.S.hp;
    this.w = 34 * this.scale; this.h = 74 * this.scale; this.shadowR = 46 * this.scale;
    this.range = rnd(72, 92); this.score = v === 'big' ? 1200 : 600; this.balloonH = 120;
    this.reforms = 0; this.lastLight = false;
    this.set('approach');
  }
  get hittable() { return this.alive && this.inv <= 0 && !this.down && !['scatter', 'reform', 'fade'].includes(this.state); }
  onHurtSfx() { audio.sfx('kobold_hurt', { pitch: 0.6 }); }
  /** a heavy hit sends it skidding back (smoke never falls over); a KO scatters it -- or, LIGHT, fades it */
  knock(dir, lift, push) {
    this.releaseToken();
    if (this.hp <= 0) { this.die(); return; }
    this.reset('hurt'); this.stun = 24; this.vx = dir * push * 1.2; this.vy = 0;
  }
  takeHit(att, hd) {
    if (!this.hittable) return false;
    this.lastLight = isLight(att, hd);
    if (this.lastLight) this.game.fx.spark(this.x, this.y, 50, false, 'cool');
    return super.takeHit(att, hd);
  }
  /** a KO: LIGHT (or the third time) fades it for good; anything else scatters it, to re-form */
  die() {
    const g = this.game;
    this.releaseToken();
    if (!this.lastLight && this.reforms < 2) {
      this.set('scatter'); this.vx = this.vy = 0;
      audio.sfx('poof', { pitch: 0.7, vol: 0.7 });
      g.fx.label(this.x, this.y, 110, 'SCATTERED!', '#b8a8ff', 24, 50);
      g.mm?.hint('mmwolf', 'Shadow wolves come back! || Finish them with LIGHT: magic, fire, a charged strike or a super!');
      // (the first wolf to re-form: the book's light lesson, once a run -- docs/MM_SCRIPT.md; else, the first scatter
      //  without it: "Did I get one?! I'm not LOOKING!")
      if (!g.mm?.story('mm_wolves') && !g.flags.mm_gotOne) { g.flags.mm_gotOne = true; g.mm?.line('gotOne'); }
      return;
    }
    this.alive = false; this.set('fade');
    if (this.lastLight && !g.flags.mm_hate) { g.flags.mm_hate = true; g.mm?.line('hateLight'); }   // ("Shadows hate light!" -- the first light finish)
    g.fx.rays?.(this.x, this.y, 50, '#fff2c0', 110, 14);
    g.fx.label(this.x, this.y, 120, this.lastLight ? 'POOF!' : 'FADED!', '#fff2c0', 28, 50);
    audio.sfx('poof', { pitch: 1.2 });
  }
  update() {
    const g = this.game, p = this.player;
    this.tick();
    if (this.cool > 0) this.cool--;
    switch (this.state) {
      case 'approach': case 'wait': case 'taunt': this.think(p); break;
      case 'windup': this.vx = this.vy = 0; if (this.st >= 22) { this.set('lunge'); this.hitDone = false; audio.sfx('swing_light', { pitch: 0.8 }); } break;
      case 'lunge':
        this.vx = this.st >= 4 && this.st < 14 ? this.facing * 6.6 : this.vx * 0.7;
        if (!this.hitDone && this.st >= 6 && this.st <= 15) {
          const b = boxOf(this, { x0: 10, x1: 96 * this.scale, z0: 10, z1: 86 * this.scale, dy: 16 });
          if (this.hitHeroes(b, { dmg: this.S.dmg, kind: 'light', push: 3.5, stun: 18, stop: 4, sfx: 'hit_light', spark: 'cool' })) this.hitDone = true;
        }
        if (this.st >= 30) { this.releaseToken(); this.cool = rnd(70, 120); this.set('wait'); }
        break;
      case 'hurt': this.vx *= 0.85; if (this.st >= this.stun) this.set('wait'); break;
      case 'scatter':                       // (the smoke drifts apart; the eyes linger -- then it gathers again)
        this.vx = this.vy = 0;
        if (this.st >= 110) { this.set('reform'); audio.sfx('charge_hum', { pitch: 0.6, vol: 0.5 }); }
        break;
      case 'reform':
        if (this.st >= 30) { this.reforms++; this.hp = Math.max(8, Math.round(this.maxHp * 0.5)); this.set('wait'); this.cool = 40; this.inv = 20; }
        break;
      case 'fade':
        if (this.st >= 30) { this.gone = true; g.score += this.score; g.onFoeGone(this); }
        break;
    }
    if (this.state === 'approach' || this.state === 'wait') this.separate();
    this.integrate();
    this.trail();
  }
  /** its smoke trail while it moves (comic p011): puffs from the tail tip and the paws -- none while it scatters or
   * re-forms (those frames are all smoke already) */
  trail() {
    const g = this.game, m = g.mm, sp = Math.abs(this.vx) + Math.abs(this.vy);
    if (!m || !this.alive || sp < 0.6 || ['scatter', 'reform', 'fade'].includes(this.state) || g.frame % 4) return;
    const s = this.scale, f = this.facing;
    m.puff(this, this.x - f * 62 * s, this.y, 46 * s + Math.random() * 10, (7 + Math.random() * 4) * s, Math.random() < 0.35);   // (the tail tip)
    const paw = (g.frame >> 2) % 2 ? 28 : -30;
    m.puff(this, this.x + f * paw * s, this.y + (Math.random() - 0.5) * 6, 4 + Math.random() * 6, (5 + Math.random() * 3) * s, Math.random() < 0.25);   // (a paw)
  }
  think(p) {
    if (!p.alive || p.down || p.state === 'victory') {
      this.moveTo(p.x + (this.x < p.x ? -1 : 1) * 190, clamp(p.y + this.yOff * 3, depthLo(this.game), depthHi(this.game)), this.S.sp * 0.6);
      if (!this.vx && !this.vy) { this.set('taunt'); this.face(p); } else { this.set('approach'); this.wt = (this.wt || 0) + Math.hypot(this.vx, this.vy * 0.5) / (64 * this.scale); this.facing = this.vx ? Math.sign(this.vx) : this.facing; }   // (stride-locked: the anim audit #10)
      return;
    }
    const tx = this.standX(p, this.range), ty = clamp(p.y + (this.cool > 20 ? this.yOff : 0), depthLo(this.game), depthHi(this.game));
    if (this.cool <= 0 && Math.abs(this.x - tx) < 14 && Math.abs(this.y - p.y) < 10 && this.entered && this.takeToken()) { this.face(p); this.windup('windup'); return; }
    // (prowling: a slower circle while it waits its turn)
    const sp = this.cool > 30 && Math.abs(this.x - p.x) < 170 ? this.S.sp * 0.5 : this.S.sp;
    if (this.moveTo(tx, ty, sp)) { this.set('wait'); this.face(p); }
    else { this.set('approach'); this.wt = (this.wt || 0) + Math.hypot(this.vx, this.vy * 0.5) / (64 * this.scale); if (Math.abs(this.vx) > 0.2) this.facing = Math.sign(this.vx); if (Math.abs(this.x - p.x) < 170) this.face(p); }   // (the prowl stride-locked to the ground: ~36 px of skate a cycle -- the anim audit #10)
  }
  pose() {
    const g = this.game;
    switch (this.state) {
      case 'approach': return this.anim('prowl', (this.wt || 0) + this.ph);
      case 'wait': case 'taunt': return this.anim('idle', g.time + this.ph * 3);
      case 'windup': return this.anim('lungeWind', Math.min(1, this.st / 22));
      case 'lunge': return this.anim('lunge', Math.min(1, this.st / 30));
      case 'hurt': return this.anim('hurt', Math.min(1, this.st / this.stun));
      case 'scatter': return this.anim('scatter', Math.min(1, this.st / 24));
      case 'reform': return this.anim('scatter', Math.max(0, 1 - this.st / 30));   // (the scatter, played backward)
      case 'fade': return this.anim('scatter', Math.min(1, this.st / 30));
      default: return this.anim('idle', g.time);
    }
  }
  drawOpts() { return { ...super.drawOpts(), fade: this.state === 'fade' ? Math.min(1, this.st / 30) : 0 }; }
  draw(ctx) { if (this.state === 'dying') return; this.game.mm?.drawSmoke(ctx, this); super.draw(ctx); }
}

// ==================================================================================================== FLYERS: bat, crow
/** a flyer that hovers near a hero, winds up and swoops (bat) or dives (crow); knocked out of the air it flees */
class Flyer extends Enemy {
  constructor(game, x, y, opt, K) {
    super(game, x, y, { name: opt.name || pick(K.names) });
    this.K = K; this.art = K.art;
    this.hp = this.maxHp = K.hp;
    this.w = 26; this.h = 40; this.hz0 = 4; this.depthR = 4;
    this.z = K.hover; this.flying = true; this.shadowR = 22; this.balloonH = 100; this.score = K.score;
    this.dist = rnd(150, 210);
    this.set('hover');
  }
  get hittable() { return this.alive && this.inv <= 0 && ['hover', 'diveWind', 'dive', 'hurt', 'rise'].includes(this.state); }
  onHurtSfx() { audio.sfx('whelp_chirp', { pitch: this.K.pitch }); }
  update() {
    const g = this.game, p = this.player, K = this.K;
    this.tick();
    if (this.cool > 0) this.cool--;
    const bob = Math.sin(g.time * 3.4 + this.ph * 6) * 7;
    switch (this.state) {
      case 'hover': {
        const side = this.x < p.x ? -1 : 1;
        const tx = clamp(p.x + side * this.dist, g.camX + 70, g.camX + W - 70), ty = clamp(p.y + this.yOff, depthLo(g), depthHi(g));
        this.vx = clamp((tx - this.x) * 0.04, -2.4, 2.4); this.vy = clamp((ty - this.y) * 0.05, -1.4, 1.4);
        this.z += (K.hover + bob - this.z) * 0.1;
        this.face(p);
        if (this.cool <= 0 && this.entered && Math.abs(tx - this.x) < 60 && Math.abs(this.y - p.y) < 16 && p.alive && !p.down && this.takeToken()) {
          this.vx = this.vy = 0; this.windup('diveWind'); audio.sfx('whelp_chirp', { pitch: K.pitch * 1.2 });
        }
        break;
      }
      case 'diveWind':
        this.z += (K.hover + 30 - this.z) * 0.12;
        if (this.st >= K.wind) { this.set('dive'); this.hitDone = false; this.z0 = this.z; audio.sfx('swing_heavy', { pitch: 1.4 }); }
        break;
      case 'dive': {
        const u = Math.min(1, this.st / K.dur);
        this.vx = this.facing * K.speed; this.vy = clamp((p.y - this.y) * 0.05, -1, 1);
        this.z = 26 + (this.z0 - 26) * Math.pow(Math.abs(u * 2 - 1), K.steep);
        if (!this.hitDone && p.hittable && Math.abs(p.x - this.x) < 34 && Math.abs(p.y - this.y) < 18 && this.z < p.z + 120) {
          this.hitDone = true;
          p.takeHit(this, { dmg: K.dmg, kind: 'light', push: 4, stun: 20, stop: 5, sfx: 'hit_light', spark: K.spark });
        }
        if (this.st >= K.dur) { this.releaseToken(); this.cool = rnd(110, 170); this.set('hover'); this.vx = 0; }
        break;
      }
      case 'hurt': this.vx *= 0.85; this.vy = 0; if (this.st >= this.stun) this.set('hover'); break;
      case 'fly':
        this.vz -= GRAV * 0.8; this.z = Math.max(0, this.z + this.vz);
        if (this.z <= 0) { this.z = 0; this.vx = 0; this.set('down'); audio.sfx('knockdown', { pitch: 1.4 }); g.fx.dust(this.x, this.y, 4, 18); }
        break;
      case 'down':
        this.vx = this.vy = 0;
        if (this.st >= (this.hp <= 0 ? 26 : 50)) { if (this.hp <= 0) this.flee(); else this.set('rise'); }
        break;
      case 'rise': this.z += (K.hover - this.z) * 0.08; if (this.st >= 30) { this.set('hover'); this.cool = 50; } break;
      case 'flee':
        this.vx = this.facing * 3.2; this.vy = 0; this.z += 2.4;
        if (this.st >= 140 || this.z > 520) this.gone = true;
        break;
    }
    this.x += this.vx; if (this.state !== 'fly') this.y += this.vy;
    this.clampDepth();
    if (!this.entered && this.x > g.camX + 30 && this.x < g.camX + W - 30) this.entered = true;
    if (this.entered && this.state !== 'flee') this.x = clamp(this.x, g.camX + 22, g.camX + W - 22);
  }
  knock(dir, lift, push) { this.releaseToken(); this.set('fly'); this.vz = Math.min(lift, 4); this.vx = dir * push * 0.8; }
  /** beaten: off it flaps, home -- kid-friendly, nobody's hurt */
  flee() {
    const g = this.game;
    this.alive = false; this.set('flee');
    this.facing = this.x < g.camX + W / 2 ? -1 : 1;
    g.fx.label(clamp(this.x, g.camX + 80, g.camX + W - 80), this.y, 90, this.K.flee, '#fff1d6', 24, 50);
    audio.sfx('whelp_chirp', { pitch: this.K.pitch * 1.4 });
    g.score += this.score; g.onFoeGone(this);
  }
  pose() {
    const g = this.game;
    switch (this.state) {
      case 'hover': case 'rise': case 'flee': return this.anim('fly', g.time + this.ph * 2);
      // (the wind-up: the painted dive's first drawing -- wings flung up, the rear before the dive -- held; the rig flaps fast)
      case 'diveWind': return CHARS[this.art]?.ATLAS_SCALE ? this.anim(this.K.diveClip, 0) : this.anim('fly', g.time * 1.6);
      case 'dive': return this.anim(this.K.diveClip, Math.min(1, this.st / this.K.dur));
      case 'hurt': return this.anim('hurt', Math.min(1, this.st / this.stun));
      case 'fly': return this.anim('fly_knock', Math.min(1, this.st / 24));
      case 'down': return this.anim('down', (this.st % 24) / 24);   // (a wing and jaw twitch, looped)
      default: return this.anim('fly', g.time);
    }
  }
}
const BAT = { art: 'cliff_bat', names: ['FLAPPY', 'SQUEAK', 'NIBBLES', 'DUSTY'], hp: 24, hover: 78, wind: 20, dur: 42, speed: 7, steep: 1.6, dmg: 7, score: 600, pitch: 1.7, spark: 'warm', diveClip: 'swoop', flee: 'EEP!' };
const CROW = { art: 'storm_crow', names: ['CRAG', 'SOOTWING', 'RASP', 'KRAA'], hp: 26, hover: 128, wind: 26, dur: 36, speed: 8, steep: 2.6, dmg: 9, score: 700, pitch: 0.9, spark: 'green', diveClip: 'dive', flee: 'KRAA!' };
export class CliffBat extends Flyer { constructor(game, x, y, opt = {}) { super(game, x, y, opt, BAT); } }
export class StormCrow extends Flyer {
  constructor(game, x, y, opt = {}) { super(game, x, y, opt, CROW); }
  draw(ctx) {   // (a flicker of green storm light on the dive)
    super.draw(ctx);
    if (this.state === 'dive' && (this.st >> 1) % 2) { const g = this.game; g.fx.add({ type: 'star', x: this.x, y: this.y, z: this.z + 20, vz: 0, life: 10, r: 3, col: '#9dff7a' }); }
  }
}

// ==================================================================================================== SNOWMAN
export class Snowman extends Enemy {
  constructor(game, x, y, opt = {}) {
    const big = opt.variant === 'big';
    super(game, x, y, { name: opt.name || (big ? 'BIG CHILL' : pick(['FROSTY', 'SLUSH', 'FLURRY', 'CHILLY'])), scale: big ? 1.3 : 1 });
    this.art = 'snowman'; this.big = big;
    this.hp = this.maxHp = big ? 96 : 52;
    this.w = 32 * this.scale; this.h = 118 * this.scale; this.shadowR = 40 * this.scale; this.heavy = big;
    this.score = big ? 1500 : 700; this.balloonH = 150 * this.scale;
    this.set('approach');
  }
  get hittable() { return this.alive && this.inv <= 0 && !this.down && this.state !== 'puff'; }
  onHurtSfx() { audio.sfx('hit_light', { pitch: 1.5, vol: 0.6 }); }
  /** a heavy hit slides it back (it never falls over); a KO bursts it into a puff */
  knock(dir, lift, push) {
    this.releaseToken();
    if (this.hp <= 0) { this.die(); return; }
    this.reset('hurt'); this.stun = 24; this.vx = dir * push * 0.9; this.vy = 0;
  }
  update() {
    const g = this.game, p = this.player;
    this.tick();
    if (this.cool > 0) this.cool--;
    switch (this.state) {
      case 'approach': case 'wait': {
        if (!p.alive || p.down) { this.moveTo(this.standX(p, 220), p.y, 0.9); this.set(this.vx || this.vy ? 'approach' : 'wait'); break; }
        const dist = Math.abs(p.x - this.x), dy = Math.abs(p.y - this.y);
        if (this.cool <= 0 && this.entered && this.takeToken()) {
          this.face(p);
          if (dy < 14 && dist > 160 && dist < 520 && Math.random() < 0.45) { this.windup('rollWind'); audio.sfx('charge', { pitch: 0.7, vol: 0.6 }); break; }
          if (dist > 140 && dist < 420) { this.windup('throwWind'); break; }
          this.releaseToken();
        }
        if (this.moveTo(this.standX(p, 240), clamp(p.y + this.yOff, depthLo(g), depthHi(g)), 1.1)) { this.set('wait'); this.face(p); }
        else { this.set('approach'); this.wt = (this.wt || 0) + 1 / 60; this.face(p); }
        this.separate();
        break;
      }
      case 'throwWind': if (this.st >= 24) { this.set('throw'); this.thrown = false; } break;
      case 'throw':                          // (16 frames: the snowball leaves the hand at 4)
        if (!this.thrown && this.st >= 4) {
          this.thrown = true;
          const H = CHARS.snowman?.point?.(this.anim('throw', 4 / 16), 'hand') || CHARS.snowman?.HAND || [34, -96], s = this.scale;
          g.actors.push(new Lob(g, this.x + this.facing * H[0] * s, this.y, -H[1] * s, this.facing, p.x + rnd(-16, 16), clamp(p.y + rnd(-8, 8), depthLo(g), depthHi(g)), 'snow'));
          audio.sfx('throw');
        }
        if (this.st >= 16) { this.releaseToken(); this.cool = rnd(90, 150); this.set('wait'); }
        break;
      case 'rollWind': this.vx = this.vy = 0; if (this.st >= 34) { this.set('roll'); this.hitSet = new Set(); audio.sfx('minecart', { pitch: 1.3, vol: 0.6 }); } break;
      case 'roll': {   // one big snowball, bowling along the lane
        this.vx = this.facing * (this.big ? 5.2 : 6); this.vy = 0;
        for (const q of g.players) {
          if (!q.hittable || this.hitSet.has(q) || Math.abs(q.x - this.x) > 44 * this.scale || Math.abs(q.y - this.y) > 20 || q.z > 70) continue;
          this.hitSet.add(q); q.takeHit(this, { dmg: this.big ? 12 : 10, kind: 'knock', push: 6, lift: 5, stop: 5, sfx: 'hit_heavy', spark: 'cool' });
        }
        if (this.st % 6 === 0) g.fx.dust(this.x, this.y, 2, 14);
        if (this.st >= 70 || this.x <= g.camX + 40 || this.x >= g.camX + W - 40) { this.set('dizzy'); this.vx = 0; this.dizzyUntil = g.frame + 50; }
        break;
      }
      case 'dizzy': if (this.st >= 50) { this.releaseToken(); this.cool = rnd(100, 160); this.set('wait'); } break;
      case 'hurt': this.vx *= 0.82; if (this.st >= this.stun) this.set('wait'); break;
      case 'puff':
        if (this.st === 1) { for (let i = 0; i < 14; i++) g.fx.add({ type: 'star', x: this.x + rnd(-30, 30), y: this.y, z: rnd(10, 110) * this.scale, vx: rnd(-2.5, 2.5), vz: rnd(0.5, 3), life: rnd(24, 40), r: rnd(3, 7), col: '#ffffff' }); audio.sfx('poof', { pitch: 1.3 }); }
        if (this.st >= 30) { this.gone = true; g.score += this.score; g.onFoeGone(this); }
        break;
    }
    this.integrate();
  }
  die() { this.alive = false; this.releaseToken(); this.set('puff'); this.game.fx.label(this.x, this.y, 140 * this.scale, 'POOF!', '#e8f6ff', 28, 50); }
  pose() {
    const g = this.game;
    switch (this.state) {
      case 'approach': return this.anim('move', this.wt || 0);
      case 'throwWind': return this.anim('throwWind', Math.min(1, this.st / 24));
      case 'throw': return this.anim('throw', Math.min(1, this.st / 16));
      case 'rollWind': return this.anim('throwWind', 0.3 + 0.2 * Math.sin(this.st * 0.6));
      case 'roll': return this.anim(CHARS.snowman?.ANIM?.roll && !CHARS.snowman.ATLAS_SCALE ? 'roll' : 'move', g.time * 3);   // (the rig's big snowball; the pack's fast roll)
      case 'hurt': return this.anim('hurt', Math.min(1, this.st / this.stun));
      case 'puff': return this.anim('puff', Math.min(1, this.st / 30));
      default: return this.anim('idle', g.time + this.ph * 3);
    }
  }
  drawOpts() { return { ...super.drawOpts(), big: this.big }; }
}

// ==================================================================================================== IMPS (kobold kit)
// The painted builder's own packs (tools/sprite3d/chars/imp.py): rock_imp and fire_imp carry the bomber's throwWind /
// throw (a pebble / a green fireball from the 'hand' landmark), ice_imp hops (hop) and breathes frost (breathWind /
// breath, from 'mouth').  Without its pack an imp is the kobold's art (green / bomber / blue) under a wash.
const IMP = {
  rock: { art: 'rock_imp', base: 'bomber', base0: 'green', hp: 46, range: [150, 230], names: ['PEBBLES', 'GRAVEL', 'CHIP', 'ROCKY', 'FLINT'], wash: 'rgba(150,134,112,0.62)', lob: 'pebble' },
  ice: { art: 'ice_imp', base: 'blue', base0: 'blue', hp: 30, names: ['NIP', 'FROSTBITE', 'SLEET', 'ICICLE'], wash: 'rgba(175,230,255,0.55)' },
  greenfire: { art: 'fire_imp', base: 'bomber', base0: 'bomber', hp: 40, range: [200, 280], names: ['CINDER', 'WISP', 'SCORCH', 'EMBERLY'], wash: 'rgba(110,255,120,0.42)', lob: 'green' },
};
/** a lobbed shot: a snowball (the snowmen), a pebble (the rock imps), a ball of green fire (the green-fire imps) */
const LOB = {
  snow: { dmg: 7, spark: 'cool', fill: '#f4f8ff', r: 9, burst: '#ffffff' },
  pebble: { dmg: 6, spark: 'warm', fill: '#8a8478', r: 7, burst: '#aaa394' },
  green: { dmg: 8, spark: 'green', fill: '#7dff5a', r: 9, burst: '#9dff7a', glow: true },
};
class Lob extends EnemyShot {
  constructor(game, x, y, z, dir, tx, ty, kind = 'snow') {
    super(game, x, y, z, dir);
    this.K = LOB[kind] || LOB.snow;
    const T = clamp(Math.abs(tx - x) / 6.5, 18, 52);
    this.vx = (tx - x) / T; this.vy = (ty - y) / T; this.vz = 3.2; this.w = 12; this.life = 120;
  }
  update() {
    this.tick();
    this.x += this.vx; this.y += this.vy; this.z += this.vz; this.vz -= 0.18;
    if (this.K.glow && this.st % 3 === 0) this.game.fx.flames(this.x, this.y, this.z, 1, { green: true, scale: 0.5 });
    if (this.hitPlayers({ dmg: this.K.dmg, kind: 'light', push: 3, stun: 18, stop: 4, sfx: 'hit_light', spark: this.K.spark }, 18, 12)) { this.burst(); return; }
    if (this.z <= 0) { this.burst(); return; }
    if (--this.life <= 0 || this.offscreen()) this.gone = true;
  }
  burst() { this.gone = true; for (let i = 0; i < 6; i++) this.game.fx.add({ type: 'star', x: this.x, y: this.y, z: Math.max(4, this.z), vx: rnd(-2, 2), vz: rnd(0.5, 2.5), life: 22, r: rnd(2, 4), col: this.K.burst }); }
  draw(ctx) {
    const x = this.sx, y = this.sy - 10, K = this.K;
    if (K.glow) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(x, y, 1, x, y, 18); g.addColorStop(0, 'rgba(200,255,170,0.9)'); g.addColorStop(1, 'rgba(60,255,80,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 18, 0, TAU); ctx.fill(); ctx.restore(); }
    ctx.fillStyle = K.fill; ctx.strokeStyle = '#21141c'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, K.r, 0, TAU); ctx.fill(); ctx.stroke();
  }
}
// (Morvath's imps' own barks -- never Book 3's "For the King!")
const IMP_BARKS = { rock: ['Grr-ROCK!', 'For MORVATH!', 'Hssss!'], ice: ['Brrr!', 'For MORVATH!', 'Hssss!'], greenfire: ['For MORVATH!', 'Sizzle!', 'Hssss!'] };
export class MMImp extends Kobold {
  constructor(game, x, y, opt = {}) {
    const v = IMP[opt.variant] ? opt.variant : 'rock', I = IMP[v];
    super(game, x, y, { variant: I.base, name: opt.name || pick(I.names) });
    this.imp = v; this.I = I; this.barks = IMP_BARKS[v] || IMP_BARKS.rock;
    this.painted = !!CHARS[I.art];
    if (this.painted) this.art = I.art;
    else { this.wash = I.wash; this.look = I.base0; }   // (its pack not in: the kobold, washed)
    this.hp = this.maxHp = I.hp;
    this.summons = 0;
    if (I.range) this.range = rnd(...I.range);
  }
  onHurtSfx() { audio.sfx('kobold_hurt', { pitch: this.imp === 'rock' ? 0.75 : this.imp === 'ice' ? 1.35 : 1.1 }); }
  // (the ice imps are pale on the snow ledge: a frost-blue rim round the drawing and a deeper shadow under them)
  drawShadow(ctx) {
    if (this.imp !== 'ice') { super.drawShadow(ctx); return; }
    const sx = this.x - this.game.camX, sy = FLOOR_TOP + this.y, k = clamp(1 - this.z / 260, 0.35, 1), r = (this.shadowR || this.w * 1.5) * k * 1.15;
    ctx.fillStyle = `rgba(20,44,96,${0.42 * k})`; ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.32, 0, 0, TAU); ctx.fill();
  }
  draw(ctx) {
    if (this.imp !== 'ice') { super.draw(ctx); return; }
    const m = ctx.getTransform(), ds = Math.hypot(m.a, m.b) || 1;
    ctx.save(); ctx.shadowColor = 'rgba(18,42,100,0.9)'; ctx.shadowBlur = 5 * ds; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    try { super.draw(ctx); } finally { ctx.restore(); }
  }
  /** where a throw / a breath leaves (world): the pack's landmark, else the kobold's bomb hand */
  from(pose, lm) {
    const P = this.painted && CHARS[this.art].point ? CHARS[this.art].point(pose, lm) : null;
    const h = P || (lm === 'mouth' ? [40, -100] : CHARS.kobold?.BOMB_HAND || [20, -120]);
    return { x: this.x + this.facing * h[0] * this.scale, z: -h[1] * this.scale };
  }
  update() {
    const g = this.game, p = this.player;
    if (this.imp === 'ice') return this.iceUpdate(g, p);
    if (this.state === 'throw') {             // (a pebble / a ball of green fire, not the bomber's bomb)
      this.tick();
      if (this.st === 6) {
        const o = this.from(this.anim('throw', 6 / 16), 'hand');
        g.actors.push(new Lob(g, o.x, this.y, o.z, this.facing, clamp(p.x + rnd(-20, 20), g.camX + 40, g.camX + W - 40), clamp(p.y + rnd(-10, 10), depthLo(g), depthHi(g)), this.I.lob));
        audio.sfx(this.imp === 'greenfire' ? 'fire_small' : 'throw');
      }
      if (this.st >= 16) { this.releaseToken(); this.cool = rnd(110, 170); this.set('wait'); }
      this.integrate();
      return;
    }
    super.update();
  }
  /** the ice imps: hop, hop -- and a frost breath where the others stab */
  iceUpdate(g, p) {
    if (this.state === 'windup' && this.st + 1 >= 18) { this.tick(); this.set('breathWind'); this.vx = this.vy = 0; this.integrate(); return; }
    if (this.state === 'breathWind') { this.tick(); this.vx = this.vy = 0; if (this.st >= 18) { this.set('breath'); this.hitSet = new Set(); audio.sfx('dodge', { pitch: 1.6, vol: 0.6 }); } this.integrate(); return; }
    if (this.state === 'breath') {
      this.tick();
      const o = this.from(this.anim('breath', Math.min(1, this.st / 26)), 'mouth'), reach = 30 + Math.min(this.st, 14) * 7;
      if (this.st % 2 === 0) g.fx.add({ type: 'star', x: o.x + this.facing * rnd(0, reach - 30), y: this.y + rnd(-6, 6), z: Math.max(20, o.z - rnd(0, 30)), vx: this.facing * rnd(1, 3), vz: rnd(-0.3, 0.6), life: 20, r: rnd(2, 4), col: '#dff6ff' });
      if (this.st >= 4 && this.st <= 20) for (const q of g.players) {
        const dx = (q.x - this.x) * this.facing;
        if (q.hittable && !this.hitSet.has(q) && dx > 10 && dx < reach + 10 && Math.abs(q.y - this.y) < 18 && q.z < 120) { this.hitSet.add(q); q.takeHit(this, { dmg: 6, kind: 'light', push: 2, stun: 26, stop: 3, sfx: 'hit_light', spark: 'cool' }); }
      }
      if (this.st >= 26) { this.releaseToken(); this.cool = rnd(...this.S.cool); this.set('wait'); }
      this.integrate();
      return;
    }
    this.lunging = false;
    super.update();
    if (this.state === 'lunge') this.set('wait');    // (no lunge: it has no spear)
    // (hop, hop: its approach is a run of hops -- the 'hop' clip, 24 frames a hop)
    if (this.state === 'approach') { this.hopT = ((this.hopT || 0) + 1) % 24; this.z = Math.sin(this.hopT / 24 * Math.PI) * 14; } else { this.hopT = 0; if (this.state !== 'fly') this.z = 0; }
  }
  pose() {
    if (this.state === 'breathWind') return this.anim('breathWind', Math.min(1, this.st / 18));
    if (this.state === 'breath') return this.anim('breath', Math.min(1, this.st / 26));
    if (this.imp === 'ice' && this.state === 'approach' && this.painted) return this.anim('hop', (this.hopT || 0) / 24);
    if (this.imp === 'ice' && this.state === 'windup') return this.anim('breathWind', 0);
    return super.pose();
  }
  drawOpts() { return { ...super.drawOpts(), variant: this.painted ? undefined : this.look }; }
}

// ==================================================================================================== ARMOUR KNIGHTS
// The painted builder's armour knights (tools/sprite3d/chars/armor_knight.py: armor_knight / _axe / _halberd): idle, walk,
// hurt, hurt2, the weapon's wind-up and strike (slashWind / slash, chopWind / chop, thrustWind / thrust), collapse (knocked
// apart: the heap) and reassemble; landmarks tip, helm, back (the string).  No shield: they don't block.  Without its
// pack a knight is the guard's art under a steel wash, its clips mapped to the guard's (KNIGHT_RIG).
const KNIGHT = {
  sword: { art: 'armor_knight', names: ['SIR CLANK', 'SIR RATTLE', 'DAME TINCAN'], hp: 64, wind: 'slashWind', hit: 'slash', windT: 22, dur: 24, a0: 8, a1: 14,
    box: { x0: 10, x1: 130, z0: 30, z1: 180, dy: 18 }, hd: { dmg: 8, kind: 'light', push: 4, stun: 22, stop: 5, sfx: 'hit_heavy' }, wash: 'rgba(160,168,182,0.62)' },
  axe: { art: 'armor_knight_axe', names: ['SIR CHOPPS', 'SIR DENT', 'DAME HATCHET'], hp: 74, wind: 'chopWind', hit: 'chop', windT: 30, dur: 28, a0: 10, a1: 16,
    box: { x0: 10, x1: 120, z0: 0, z1: 190, dy: 18 }, hd: { dmg: 11, kind: 'knock', push: 6, lift: 5, stop: 6, sfx: 'hit_heavy' }, wash: 'rgba(140,146,160,0.66)' },
  halberd: { art: 'armor_knight_halberd', names: ['SIR LONGPOKE', 'SIR PIKE', 'DAME POLE'], hp: 70, wind: 'thrustWind', hit: 'thrust', windT: 26, dur: 26, a0: 8, a1: 14,
    box: { x0: 40, x1: 200, z0: 40, z1: 150, dy: 16 }, hd: { dmg: 9, kind: 'light', push: 4, stun: 22, stop: 5, sfx: 'hit_heavy' }, wash: 'rgba(176,180,190,0.6)' },
};
const KNIGHT_RIG = { slashWind: 'bashWind', slash: 'bash', chopWind: 'bashWind', chop: 'bash', collapse: 'down', reassemble: 'getup' };
const KNIGHT_REJOIN = 0.35, KNIGHT_HALL_K = 0.75;   // (a re-formed knight's share of its HP; the hall's knights' HP share)
export class Knight extends Enemy {
  constructor(game, x, y, opt = {}) {
    const v = KNIGHT[opt.variant] ? opt.variant : 'sword', K = KNIGHT[v];
    super(game, x, y, { name: opt.name || pick(K.names) });
    this.kv = v; this.K = K;
    this.painted = !!CHARS[K.art];
    this.art = this.painted ? K.art : 'guard';
    if (!this.painted) this.wash = K.wash;
    // (the hall's own fights: KNIGHT_HALL_K of the table's HP -- the stage ran twice as long as the others; the gem's
    //  knights, in its boss arena, as tuned for that fight)
    this.hp = this.maxHp = Math.round(K.hp * (game.L?.arenas?.[game.arenaIdx]?.boss ? 1 : KNIGHT_HALL_K));
    const hb = CHARS.guard?.HURTBOX || { w: 78, h: 186 };
    this.w = hb.w / 2; this.h = hb.h; this.heavy = true; this.shadowR = 46; this.balloonH = 230;
    // (polish: a stage's first fight teaches the knights -- they don't re-form there; later they re-form once, at KNIGHT_REJOIN)
    this.firstArena = game.arenaIdx === 0 && !game.L?.arenas?.[0]?.boss;   // (its waves spawn as the fight engages -- fighting not yet set for the first)
    this.rejoins = 0; this.score = 1500; this.range = rnd(90, 110) + (v === 'halberd' ? 60 : 0);
    // (in the hall, a suit steps down out of its alcove on screen -- src/stages/mmhall.js HOOKS.armour, setSuit)
    const A = game.hooks?.armour, used = game._suitsUsed;
    if (A && used) {
      const i = A.findIndex((sx, k) => !used.has(k) && sx > game.camX + 90 && sx < game.camX + W - 90);
      if (i >= 0) { used.add(i); this.x = A[i]; this.y = depthLo(game) + 10; this.entered = true; game.stage?.setSuit?.(i, 0); game.fx.dust(this.x, this.y, 4, 24); }
    }
    this.set('approach');
  }
  get hittable() { return this.alive && this.inv <= 0 && !['apart', 'rejoin', 'collapse', 'dying'].includes(this.state); }
  onHurtSfx() { audio.sfx('shield_block', { pitch: 0.8, vol: 0.7 }); }
  /** the gem still up?  (the gem's fight: src/mmbosses.js RubyGem; any other hall: once) */
  canRejoin() { const gem = this.game.mmGem; return gem && this.game.L.arenas[this.game.arenaIdx]?.boss ? gem.alive : this.rejoins < 1 && !this.firstArena; }
  /** a heavy hit staggers it back (it never falls over -- a KO knocks it apart) */
  knock(dir, lift, push) {
    this.releaseToken();
    if (this.hp <= 0) { this.die(); return; }
    this.reset('hurt'); this.stun = 26; this.vx = dir * push * 0.9; this.hurtAlt = !this.hurtAlt;
  }
  hurt(hd, from) { this.reset('hurt'); this.stun = hd.stun || 18; this.vx = -from * (hd.push || 2) * 0.6; this.vy = 0; this.hurtAlt = !this.hurtAlt; }
  die() {
    const g = this.game;
    this.releaseToken();
    this.set('collapse'); this.vx = this.vy = 0; this.hp = 0;
    audio.sfx('break', { pitch: 1.3, vol: 0.8 });
    g.fx.label(this.x, this.y, 120, 'CLATTER!', '#d8dde8', 26, 50);
  }
  /** strings cut: just empty armour now (the gem broken, or done re-forming) */
  collapse() {
    const g = this.game;
    if (this.state !== 'apart' && this.state !== 'collapse') { this.set('collapse'); this.vx = this.vy = 0; }
    this.alive = false; this.releaseToken(); this.ended = true;
    g.fx.debris(this.x, this.y, 60, ['#9aa2b2', '#6a7282', '#c8cdd8'], 6);
  }
  update() {
    const g = this.game, p = this.player, K = this.K;
    this.tick();
    if (this.cool > 0) this.cool--;
    switch (this.state) {
      case 'approach': case 'wait': {
        if (!p.alive || p.down) { this.moveTo(this.standX(p, 200), p.y, 1); this.set(this.vx || this.vy ? 'approach' : 'wait'); break; }
        const dist = Math.abs(p.x - this.x), dy = Math.abs(p.y - this.y);
        if (this.cool <= 0 && this.entered && dy < 18 && dist < this.range + 30 && this.takeToken()) { this.face(p); this.windup('wind'); break; }
        if (this.moveTo(this.standX(p, this.range), clamp(p.y + (this.cool > 30 ? this.yOff : 0), depthLo(g), depthHi(g)), 1.1)) { this.set('wait'); this.face(p); }
        else { this.set('approach'); this.ph = (this.ph + 0.02) % 1; this.face(p); }
        this.separate();
        break;
      }
      case 'wind': this.vx = this.vy = 0; if (this.st >= K.windT) { this.set('strike'); this.hitDone = false; audio.sfx(this.kv === 'halberd' ? 'swing_heavy' : 'sword_slash', { pitch: 0.8 }); } break;
      case 'strike':
        this.vx = this.st < 6 ? this.facing * 2 : 0;
        if (!this.hitDone && this.st >= K.a0 && this.st <= K.a1 && this.hitHeroes(boxOf(this, K.box), K.hd)) this.hitDone = true;
        if (this.st >= K.dur) { this.releaseToken(); this.cool = rnd(90, 140); this.set('wait'); }
        break;
      case 'hurt': this.vx *= 0.8; if (this.st >= this.stun) this.set('wait'); break;
      case 'collapse':                       // (it comes to pieces on the floor -- then the heap)
        this.vx = this.vy = 0;
        if (this.st >= 30) { if (this.ended) { this.set('dying'); break; } this.set('apart'); }
        break;
      case 'apart':
        if (!this.canRejoin() && this.st > 10) { this.collapse(); this.set('dying'); break; }
        if (this.st >= 150) { this.set('rejoin'); audio.sfx('charge_hum', { pitch: 1.4, vol: 0.4 }); }
        break;
      case 'rejoin':
        if (this.st >= 44) { this.rejoins++; this.hp = Math.round(this.maxHp * KNIGHT_REJOIN); this.set('wait'); this.cool = 40; this.inv = 20; g.fx.label(this.x, this.y, 210, 'BACK TOGETHER!', '#ff8080', 22, 50); }
        break;
      case 'dying':                          // (the empty suit, still: then a puff of dust)
        if (this.st >= 40) { this.gone = true; g.fx.dust(this.x, this.y, 6, 30); g.score += this.score; g.onFoeGone(this); }
        break;
    }
    this.integrate();
  }
  clip(key) { return this.painted ? key : (KNIGHT_RIG[key] || key); }
  pose() {
    const g = this.game, K = this.K;
    // (the anim audit #11: mid-combo, hurt -> walk -> hurt flickered between the hits -- the last hurt drawing held 7 frames)
    if (this.state === 'hurt') this.hurtLast = g.frame;
    else if (['approach', 'wait', 'idle'].includes(this.state) && g.frame - (this.hurtLast ?? -99) <= 7 && g.players.some((q) => !q.out && (q.state === 'atk' || q.state === 'runAtk' || g.frame - (q.lastAtkEnd ?? -99) < 12) && Math.abs(q.x - this.x) < 160 && Math.abs(q.y - this.y) < 50)) return this.anim(this.clip(this.hurtAlt ? 'hurt2' : 'hurt'), 1);
    switch (this.state) {
      case 'approach': return this.anim(this.clip('walk'), this.ph);
      case 'wind': return this.anim(this.clip(K.wind), Math.min(1, this.st / K.windT));
      case 'strike': return this.anim(this.clip(K.hit), Math.min(1, this.st / K.dur));
      case 'hurt': return this.anim(this.clip(this.hurtAlt ? 'hurt2' : 'hurt'), Math.min(1, this.st / this.stun));
      case 'collapse': return this.anim(this.clip('collapse'), Math.min(1, this.st / 30));
      case 'apart': case 'dying': return this.anim(this.clip('collapse'), 1);
      case 'rejoin': return this.anim(this.clip('reassemble'), Math.min(1, this.st / 44));
      default: return this.anim(this.clip('idle'), g.time + this.ph * 3);
    }
  }
  draw(ctx) {
    if (this.state === 'dying' && this.st > 30 && (this.st >> 2) % 2) return;
    if (!this.painted && this.state === 'rejoin') {   // (the stand-in: the pieces float back up together, wobbling)
      ctx.save(); ctx.translate(0, -Math.sin(Math.min(1, this.st / 44) * Math.PI) * 18); super.draw(ctx); ctx.restore();
    } else super.draw(ctx);
    // the red eye slits in the empty helmet (the painted knight's are its own)
    if (!this.painted && this.alive && !['apart', 'collapse', 'dying'].includes(this.state)) {
      const t = this.game.time, x = this.sx + this.facing * 16, y = this.sy - 172;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(x, y, 1, x, y, 16); gr.addColorStop(0, `rgba(255,70,50,${0.7 + 0.2 * Math.sin(t * 6)})`); gr.addColorStop(1, 'rgba(255,30,30,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 16, 0, TAU); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#ff4a3a';
      for (const dx of [-6, 6]) { ctx.beginPath(); ctx.ellipse(x + dx * this.facing, y, 4, 1.6, 0, 0, TAU); ctx.fill(); }
    }
    // (a live painted knight: its eyes glow -- the hall's empty suits in their alcoves don't)
    if (this.painted && this.alive && !['apart', 'collapse', 'dying'].includes(this.state)) {
      const P = CHARS[this.art].point?.(this.pose(), 'helm'), s = this.scale || 1;
      if (P) {
        const t = this.game.time, x = this.sx + this.facing * (P[0] + 6) * s, y = this.sy + P[1] * s, r = 22 * s;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const gr = ctx.createRadialGradient(x, y, 1, x, y, r); gr.addColorStop(0, `rgba(255,80,50,${0.75 + 0.2 * Math.sin(t * 6 + this.ph * 7)})`); gr.addColorStop(0.45, 'rgba(255,40,30,0.3)'); gr.addColorStop(1, 'rgba(255,30,30,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore();
      }
    }
  }
  /** where its string meets the suit (screen): the pack's 'back' landmark, else over its shoulders */
  stringFrom() {
    const P = this.painted && CHARS[this.art].point ? CHARS[this.art].point(this.pose(), 'back') : null;
    if (P) return [this.sx + this.facing * P[0], this.sy + P[1]];
    return [this.sx, this.state === 'apart' || this.state === 'collapse' ? this.sy - 30 : this.sy - 200];
  }
  /** the red puppet string, up to the gem -- or, with no gem about, out of the top of the screen toward it */
  drawOverMM(ctx) {
    if (!this.alive || this.state === 'dying') return;
    const g = this.game, t = g.time, gem = g.mmGem;
    const [x0, y0] = this.stringFrom();
    const onGem = gem && gem.alive && gem.x > g.camX - 200 && gem.x < g.camX + W + 200;
    const x1 = onGem ? gem.sx : x0 + 120 + Math.sin(this.ph * 9) * 60, y1 = onGem ? gem.sy - 40 : -10;
    ctx.save();
    const mx = (x0 + x1) / 2 + Math.sin(t * 2 + this.ph * 5) * 12, my = (y0 + y1) / 2 + 14;
    // (a glowing string: the live knights stand out from the hall's empty suits)
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,70,50,${this.state === 'apart' ? 0.18 : 0.32})`; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = `rgba(255,70,60,${this.state === 'apart' ? 0.6 : 0.95})`; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
    ctx.restore();
  }
}

void FLOOR_TOP; void ShamanFire;
