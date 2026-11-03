// Mystic Mountain's bosses (docs/MYSTIC_MOUNTAIN.md).  Kid-friendly: nobody dies -- the alpha fades into the dawn, the
// troll sneezes himself off his bridge ("...thank you."), the wyvern flies away, the gem's strings are cut, Morvath
// shrinks into a tiny furious crow.  Co-op scales their health (World.begin COOP_BOSS); a super or a charged spell does
// to them what it does to the main game's bosses.
//   WolfAlpha  THE WOLF PACK: a giant smoke alpha that calls wolves.  It only really takes LIGHT (src/mmworld.js
//              isLight); anything else chips it and builds its STUN -- stunned, LIGHT hits land extra hard.
//   StoneTroll THE STONE TROLL, filling the bridge's far end: fist smashes (a dodge through one -- or three hits on the
//              resting fist -- stuns it: "Not today, PEBBLE!") and a two-handed press (jump or roll).  The stunned arm is
//              a RAMP: climb it, hit his NOSE -- three tickles, then AAAH-CHOOOOO! and he topples off the bridge.
//   IceWyvern  THE ICE WYVERN: circles high (its shadow sweeping the ledge), then swoops, breathes frost or SNATCHES a
//              hero.  Hit its talons -- or launch someone off Dodongo's shield onto its head: BONK, down on the ledge.
//   RubyGem    THE RUBY GEM, floating high, threaded to every knight (they re-form while it stands): only a hero
//              launched off Dodongo's shield, a charged shot or spell, or a super reaches it.  Three cracks: Lights OUT!
//   Morvath    MORVATH: lightning lanes, staff blasts, lightning chains that lift a hero.  At ~40%: the dragon
//              (mm_dragon; Dodongo's player -- else P1 -- becomes DRAGON DODONGO).  Worn down: STEAL THE STAFF (any hero
//              but the dragon -- or Shadow, out of nowhere), then BLAST THE STAFF, and he shrinks into a crow.
import { Enemy, CHARS } from './enemies.js';
import { EnemyShot } from './projectiles.js';
import { DODGE } from './player.js';
import { isLight, drawMeterBar, FIGHT_LINES } from './mmworld.js';
import { audio } from './audio-proxy.js';
import { drawWithFlash, drawTinted } from './render.js';
import { W, H, DEPTH, FLOOR_TOP, INK } from './config.js';
import { clamp, lerp, TAU } from './rig.js';
import { baseOf } from './heroes.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const lo = (g) => (g.lane ? g.lane[0] : 6), hi = (g) => (g.lane ? g.lane[1] : DEPTH - 6);
const live = (g) => g.players.filter((p) => !p.out && p.alive);
void FIGHT_LINES;

// ------------------------------------------------------------------------------------------------ holding a hero
// (the wyvern's talons, Morvath's chains: the hero rides along, can't act -- nor be hit -- and mashes ATTACK to wriggle)
function grabHero(p) {
  p.dropCarry?.(); p.stopCharge?.();
  if (p.shot?.beam) { p.shot.beam.gone = true; p.shot.beam = null; }
  p.set('cutscene'); p.cutPose = 'hurt'; p.cutPoseArg = 0.35;
  p.ctl = false; p.vx = p.vy = p.vz = 0; p.inv = 99999; p.mmHeld = true;
}
function freeHero(p, hurt = false) {
  if (!p || !p.mmHeld) return;
  p.mmHeld = false; p.cutPose = null; p.cutPoseArg = undefined; p.ctl = true; p.inv = 0; p.sortY = undefined;
  if (hurt && p.hp > 1) { p.hp = Math.max(1, p.hp - 8); p.flash = 8; }
  p.set('air'); p.vz = 0; p.vx = 0; p.airAtkT = -1; p.hitSet = new Set(); p.inv = 50;
}
/** the held hero's mashing (ATTACK / JUMP presses) */
const mashed = (g, p) => { const c = g.app.ctrl(p.ctrlId).pressed; return !!(c.attack || c.jump || c.shoot); };

// ------------------------------------------------------------------------------------------------ the boss base
/** flash safety (AA item 6, as Book 2's siSoftFlash): a boss's hit flash is a soft white tint -- ramped in over 3 frames, at most 0.2, at most
 * once per 96 frames, none with reduced motion; the flinch / ouch face, the knockback, the spark and the hit word carry every other hit
 * (it was 0.45-0.75 every hit: 7 frames apart under a mashing party) */
const MM_REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
function mmSoftFlash(a) {
  const f = a.game?.frame ?? 0;
  if (a.flash >= 4 && f - (a._flashF ?? -1e9) >= 96) a._flashF = f;
  const d = f - (a._flashF ?? -1e9);
  if (MM_REDUCED || d >= 9) return 0;
  return 0.2 * (d < 3 ? (d + 1) / 3 : 1 - (d - 3) / 6);
}
/** (RC3) the shield launch's callout -- ROLL INTO ME! over Dodongo, drawn by src/mmworld.js drawLaunchRing -- as a priority spot while it
 *  shows (on and off its blink alike): the floating words keep off it (fx keep13), the TEAM UP! cards and the P-tags give way to it
 *  (fx.prio13 -- src/game.js).  4P: the P1 / P2 / P3 tags sat on its letters, a card clipped it to "ROLL INTO" */
function launchCallout13(ctx, g, boss) {
  const m = g.mm, d = m?.launchPair?.();
  if (!d || !boss.alive || !g.fighting || g.cut || d.z > 4 || boss.launchOpen === false || m.ringSaid === undefined || g.frame - m.ringSaid >= 420) return;
  const t = g.app?.lastCtrl === 'touch' ? `${m.keyName?.('dodge') || 'ROLL'} INTO ME!` : 'ROLL INTO ME!';
  ctx.save(); ctx.font = 'bold 26px Bangers, Impact, sans-serif'; const w = ctx.measureText(t).width; ctx.restore();
  const x = d.x - g.camX, ty = FLOOR_TOP + d.y - (d.h || 130) - 40, r = [x - w / 2 - 6, ty - 24, x + w / 2 + 6, ty + 9];
  g.fx.keep13?.(r, 2, false, 'callout'); g.fx.prio13?.push(r);
}
class MMBoss extends Enemy {
  get flashAlpha() { return mmSoftFlash(this); }
  constructor(game, x, y, opt, name, title, hp) {
    super(game, x, y, { name });
    this.title = title;
    this.hp = this.maxHp = opt.hp || hp;
    this.entered = true; this.facing = -1; this.score = 15000; this.home = { x, y };
    this.heavy = true; this.ouch = 0;
    this.set('intro');
  }
  get boss() { return true; }
  get freedNow() { return this.state === 'defeated'; }
  get open() { return true; }
  get hittable() { return this.alive && this.inv <= 0 && this.game.fighting && !this.game.cut && this.open; }
  /** the damage a hit does (null: it doesn't land at all) */
  dmgOf(att, hd) { void att; return hd.dmg; }
  onDamage() {}
  onZero() { this.defeat(); }
  takeHit(att, hd) {
    if (!this.hittable) return false;
    const g = this.game;
    const d = this.dmgOf(att, hd);
    if (d === null || d === undefined) return false;
    this.hp = Math.max(0, this.hp - d); this.flash = 6; this.ouch = 12;
    if (d > 0) this.hurtAt = g.frame;
    g.engage(this);
    if (!hd.quiet) audio.sfx(this.hurtSfx || 'hit_heavy', { pitch: this.hurtPitch || 0.8, vol: 0.7 });
    this.onDamage(att, hd, d);
    if (this.hp <= 0 && this.alive) this.onZero(att, hd);
    return true;
  }
  defeat() {
    if (!this.alive) return;
    this.alive = false; this.hp = 0; this.releaseToken();
    this.set('defeated');
    this.game.onBossDefeated(this);
  }
  /** its key hint (keyHint(): [key, text]) again when it has gone 20 s without a scratch -- a boss's hint is never lost
   * under another (MMWorld.hint force) */
  nag() {
    const g = this.game, m = g.mm;
    if (!m || !this.alive || !g.fighting || g.cut || !this.keyHint) return;
    // (only its own fight: not the stage's arenas before it -- g.fighting is any arena's fight -- nor its intro)
    if (!g.L?.arenas?.[g.arenaIdx]?.boss || this.state === 'intro') return;
    if (this.fightAt === undefined) { this.fightAt = g.frame; this.hurtAt = Math.max(this.hurtAt ?? 0, g.frame); }   // (its 20 s from the fight's start)
    if (g.frame - this.hurtAt < 1200 || g.frame - (this.nagAt ?? -1e9) < 1200) return;
    this.nags = (this.nags || 0) + 1;
    const H = this.keyHint(this.nags);
    if (H) { this.nagAt = g.frame; m.hint(H[0] + '_again', H[1], 360, true); }
  }
  /** "MASH [J]!" over a hero held by a talon or a chain, flashing */
  drawMash(ctx, q) {
    if (!q || !q.mmHeld || (this.game.frame >> 3) % 2) return;
    const k = this.game.mm?.keyName('attack', q) || '[J]';
    ctx.save(); ctx.font = 'bold 24px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.strokeText(`MASH ${k}!`, q.sx, q.sy - 150);
    ctx.fillStyle = '#ffe066'; ctx.fillText(`MASH ${k}!`, q.sx, q.sy - 150); ctx.restore();
  }
  /** a big word over the boss */
  shout(text, col = '#ffe066', size = 40, z = null) { const g = this.game; g.fx.label(clamp(this.x, g.camX + 120, g.camX + W - 120), this.y, z ?? (this.h + 20), text, col, size, 70); }
}

// ==================================================================================================== THE WOLF PACK
export class WolfAlpha extends MMBoss {
  constructor(game, x, y, opt = {}) {
    super(game, x, y, opt, 'THE WOLF PACK', 'The Alpha of the Shadow Forest', 300);
    this.art = 'wolf_alpha'; this.scale = 1; this.w = 70; this.h = 160; this.shadowR = 100; this.balloonH = 230; this.talkGap = 270;
    this.stunMeter = 0; this.cool = 80; this.hurtSfx = 'hit_heavy';
  }
  bossIntro() { this.set('howl'); audio.sfx('roar', { pitch: 0.7 }); }
  bossFight() { this.set('prowl'); this.cool = 70; }
  /** nobody in the party has LIGHT but supers and charged strikes (Shadow alone): the alpha goes easier */
  get noLight() { return !live(this.game).some((q) => ['dodongo', 'ana', 'dragon', 'archmage'].includes(q.heroId)); }
  get stunAt() { return Math.round((this.noLight ? 30 : 42) * (1 + 0.3 * (live(this.game).length - 1))); }
  keyHint() {
    const m = this.game.mm, p = live(this.game)[0];
    if (this.noLight) return ['mmalpha', `Hit it until it's DIZZY! || Then HOLD ${m.keyName('attack', p)} and let go: a charged strike is LIGHT!`];
    // (the LIGHT this party has: Anastasia's magic, Dodongo's fire -- never a hero who isn't here)
    const has = (b) => live(this.game).some((q) => baseOf(q.heroId) === b || (b === 'dodongo' && q.heroId === 'dragon'));
    const L = [has('ana') && "Anastasia's magic", has('dodongo') && "Dodongo's fire"].filter(Boolean).join(' or ');
    return ['mmalpha', `Only LIGHT hurts it! Hit it until it's DIZZY. || Then LIGHT it up: ${L}!`];
  }
  get open() { return !['intro', 'howl', 'defeated'].includes(this.state); }
  dmgOf(att, hd) {
    const g = this.game, light = isLight(att, hd);
    if (this.state === 'stunned') {
      if (light && !g.flags.mm_hate) { g.flags.mm_hate = true; g.mm?.line('hateLight'); }   // ("Shadows hate light!")
      return Math.round(hd.dmg * (light ? 1.6 : this.noLight ? 1 : 0.5));
    }
    // (LIGHT before the stun: half, and half a plain hit's stun -- stun it first, then light: the rule for everyone)
    if (light) { g.fx.spark(this.x, this.y, 110, true, 'cool'); this.stunMeter += hd.dmg * 0.5; return Math.round(hd.dmg * 0.5); }
    this.stunMeter += hd.dmg;              // (a normal hit: a chip, and the stun builds)
    if ((!this._toldLight || g.frame - this._toldLight > 300) && g.frame - (this.stunAtF ?? -1e9) > 90) { this._toldLight = g.frame; g.fx.label(this.x, this.y, 200, 'NEEDS LIGHT!', '#fff1a6', 24, 50); }
    if (!g.flags.hint_mmalpha) { const H = this.keyHint(); g.mm?.hint(H[0], H[1], 400, true); }
    return Math.max(1, Math.round(hd.dmg * 0.2));
  }
  onDamage() {
    if (this.state !== 'stunned' && this.stunMeter >= this.stunAt && this.alive && this.hp > 0) {
      this.stunMeter = 0; this.set('stunned'); this.vx = this.vy = 0; this.releaseToken();
      this.stunAtF = this.game.frame;
      this.game.fx.list = this.game.fx.list.filter((q) => !(q.type === 'word' && q.text === 'NEEDS LIGHT!'));   // (one word at a time: fx.label's words)
      this.dizzyUntil = this.game.frame + (this.noLight ? 300 : 240);
      this.shout('STUNNED! NOW -- LIGHT!', '#fff2a8', 32);
      audio.sfx('charge_full', { pitch: 0.7 });
    }
  }
  onZero() {
    const g = this.game;
    g.fx.rays?.(this.x, this.y, 120, '#fff2c0', 260, 30);
    this.defeat();
  }
  update() {
    const g = this.game, p = this.player;
    this.tick();
    if (this.cool > 0) this.cool--;
    if (this.ouch > 0) this.ouch--;
    this.nag();
    switch (this.state) {
      case 'intro': this.vx = this.vy = 0; break;
      case 'howl': this.vx = this.vy = 0; if (this.st >= 70 && !g.cut) this.set('prowl'); break;
      case 'prowl': {
        const tx = this.standX(p, 230), ty = clamp(p.y, lo(g), hi(g));
        this.moveTo(tx, ty, 2.6, 1.6); this.face(p); this.wt = (this.wt || 0) + (Math.abs(this.vx) > 1 ? 1 : 0.4) / 60;
        if (this.cool <= 0 && g.fighting && !g.cut && !p.down) {
          const wolves = g.actors.filter((a) => a.art === 'shadow_wolf' && a !== this && a.alive).length;
          const maxW = 1 + live(g).length;
          const r = Math.random();
          if (wolves < maxW && r < 0.3) { this.set('call'); audio.sfx('roar', { pitch: 0.9, vol: 0.8 }); }
          else if (r < 0.65) { this.set('lungeWind'); this.face(p); g.fx.alert(this); }
          else { this.set('pounceWind'); this.face(p); this.tgt = { x: clamp(p.x, g.camX + 100, g.camX + W - 100), y: p.y }; g.fx.alert(this); }
          this.vx = this.vy = 0;
        }
        break;
      }
      case 'call':
        this.vx = this.vy = 0;
        if (this.st === 30) { g.spawn({ k: 'wolf', side: 'L', y: clamp(p.y - 30, lo(g), hi(g)) }); g.spawn({ k: 'wolf', side: 'R', y: clamp(p.y + 30, lo(g), hi(g)) }); }
        if (this.st >= 60) { this.set('prowl'); this.cool = rnd(110, 160); }
        break;
      case 'lungeWind': this.vx = this.vy = 0; if (this.st >= 45) { this.set('lunge'); this.hitSet = new Set(); audio.sfx('swing_heavy', { pitch: 0.6 }); } break;
      case 'lunge':
        this.vx = this.st < 22 ? this.facing * 9 : this.vx * 0.8;
        if (this.st >= 3 && this.st <= 22) for (const q of g.players) {
          const dx = (q.x - this.x) * this.facing;
          if (q.hittable && !this.hitSet.has(q) && dx > -20 && dx < 170 && Math.abs(q.y - this.y) < 26 && q.z < 140) { this.hitSet.add(q); q.takeHit(this, { dmg: 12, kind: 'knock', push: 6, lift: 5, stop: 6, sfx: 'hit_heavy', spark: 'cool' }); }
        }
        if (this.st >= 46) { this.set('prowl'); this.cool = rnd(90, 140); }
        break;
      case 'pounceWind': this.vx = this.vy = 0; if (this.st >= 30) { this.set('pounce'); this.p0 = { x: this.x, y: this.y }; audio.sfx('jump', { pitch: 0.6 }); } break;
      case 'pounce': {
        const u = Math.min(1, this.st / 40);
        this.x = lerp(this.p0.x, this.tgt.x, u); this.y = lerp(this.p0.y, this.tgt.y, u); this.z = Math.sin(u * Math.PI) * 110;   // (a leap that stays under the HUD)
        if (u >= 1) {
          this.z = 0; g.shake = Math.max(g.shake, 10); audio.sfx('knockdown', { pitch: 0.6 });
          g.fx.ring(this.x, this.y, { rx: 130, ry: 44, shock: true, col: '#8a7ad8', life: 20 });
          for (const q of g.players) if (q.hittable && Math.hypot((q.x - this.x) / 130, (q.y - this.y) / 44) < 1 && q.z < 60) q.takeHit(this, { dmg: 12, kind: 'knock', push: 6, lift: 6, stop: 6, sfx: 'hit_heavy', spark: 'cool' });
          this.set('recover');
        }
        break;
      }
      case 'recover': this.vx = this.vy = 0; if (this.st >= 50) { this.set('prowl'); this.cool = rnd(80, 130); } break;
      case 'stunned': this.vx = this.vy = 0; if (this.st >= (this.noLight ? 300 : 240)) { this.set('prowl'); this.cool = 50; } break;
      case 'defeated': this.vx = this.vy = 0; break;
    }
    if (this.state !== 'pounce') { this.x += this.vx; this.y += this.vy; }
    this.clampDepth();
    if (this.state !== 'intro') this.x = clamp(this.x, g.camX + 70, g.camX + W - 70);
    this.trail();
  }
  /** the alpha's smoke trail: thicker than a wolf's (comic p011), from its tail and all four paws while it moves */
  trail() {
    const g = this.game, m = g.mm, moving = Math.abs(this.vx) + Math.abs(this.vy) > 0.6 || ['lunge', 'pounce'].includes(this.state);
    if (!m || !this.alive || !moving || this.state === 'defeated' || g.frame % 3) return;
    const f = this.facing;
    m.puff(this, this.x - f * 130, this.y, 100 + Math.random() * 30 + this.z, 14 + Math.random() * 8, Math.random() < 0.4);   // (the tail tip)
    for (const dx of [62, -70]) m.puff(this, this.x + f * dx + (Math.random() - 0.5) * 20, this.y + (Math.random() - 0.5) * 10, 6 + this.z + Math.random() * 10, 9 + Math.random() * 6, Math.random() < 0.3);   // (the paws)
  }
  pose() {
    const g = this.game;
    switch (this.state) {
      case 'howl': case 'call': return this.anim('howl', Math.min(1, this.st / 40));
      case 'prowl': return Math.abs(this.vx) > 1 ? this.anim('prowl', this.wt || 0) : this.anim('idle', g.time);
      case 'lungeWind': case 'pounceWind': return this.anim('lungeWind', Math.min(1, this.st / 30));
      case 'lunge': return this.anim('lunge', Math.min(1, this.st / 46));
      case 'pounce': return this.anim('lunge', 0.3);
      case 'recover': return this.anim('idle', g.time);
      case 'stunned': return CHARS[this.art]?.ANIM?.dizzy ? this.anim('dizzy', g.time) : this.anim('hurt', 0.4 + 0.2 * Math.sin(g.time * 4));   // (the painted alpha's own dizzy clip, when its pack has it)
      case 'defeated': return this.anim('scatter', Math.min(1, this.st / 60));
      default: return this.anim('idle', g.time);
    }
  }
  drawOpts() { return { ...super.drawOpts(), alpha: true, fade: this.state === 'defeated' ? Math.min(1, this.st / 90) : 0 }; }
  /** the stun stars circle its drawing's 'head' landmark when the pack has one (else the default, h above its feet) */
  starsAt() {
    const P = CHARS[this.art]?.point?.(this.pose(), 'head');
    return P ? [this.sx + this.facing * P[0] * this.scale, this.sy + P[1] * this.scale - 52, 1.6] : null;   // (bigger: it's a big wolf)
  }
  /** where its pounce will land: a purple ring there from the wind-up to the landing */
  drawFloor(ctx) {
    if ((this.state !== 'pounceWind' && this.state !== 'pounce') || !this.tgt) return;
    const g = this.game, x = this.tgt.x - g.camX, y = FLOOR_TOP + this.tgt.y, k = this.state === 'pounce' ? 1 : Math.min(1, this.st / 30);
    ctx.save(); ctx.strokeStyle = `rgba(170,120,255,${0.5 + 0.4 * k})`; ctx.lineWidth = 4; ctx.setLineDash([12, 8]);
    ctx.beginPath(); ctx.ellipse(x, y, 130 * (0.6 + 0.4 * k), 44 * (0.6 + 0.4 * k), 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = `rgba(150,100,255,${0.12 * k})`; ctx.fill(); ctx.restore();
  }
  /** see-through while a hero is behind its smoke (it's big: nobody gets lost under it) */
  draw(ctx) {
    this.game.mm?.drawSmoke(ctx, this);
    const over = this.game.players.some((q) => !q.out && q.y < this.y && Math.abs(q.x - this.x) < 150 && this.y - q.y < 60);
    if (over) { ctx.save(); ctx.globalAlpha = 0.55; super.draw(ctx); ctx.restore(); } else super.draw(ctx);
  }
}

// ==================================================================================================== THE STONE TROLL
// The painted builder's two layer packs (tools/sprite3d/chars/stone_troll.py): stone_troll (all but the right arm: drawn
// behind the bridge's back wall and mist, src/stages/mmbridge.js setBehind) and stone_troll_arm (the right arm: drawn
// over the deck) -- the same clips, frames and camera: idle(t) fistWind(k) smash(k) press(k) stunned(t) tickle(k)
// sneezeWind(k) sneeze(k) topple(k); landmarks nose, mouth, fist, rampLow / rampHigh (the arm's walkable top in
// 'stunned').  The code rig (./chars/stone_troll.js) is the same contract, its two layers by o.part.  The drawing is
// placed so the nose in 'idle' sits at the stage's troll.headY (screen y), his head's centre at troll.x.
const TROLL_PRESS = 100, PRESS_WIND = 0.35;
// (polish: after the press lands, both fists lie on the deck PRESS_REST frames -- hit them! -- held on the press's
//  slam drawing, PRESS_HOLD; then the clip's last drawings lift them.  The fists are open from PRESS_OPEN)
const PRESS_HOLD = 0.62, PRESS_REST = 100, PRESS_OPEN = 60;
// The painted troll is COLOSSAL (the comic: p018's fist dwarfs the heroes, p020's face beside a crouching Shadow): drawn
// TROLL_PAINT_K x the first pack's size (its 420 px: TROLL_PAINT_H on screen, whatever size his pack is rendered at --
// META.height -- so a natively bigger pack needs no change here), TROLL_PAINT_DX right of the hook (his
// body the boss screen's right third), anchored so the smash lands his fist on the deck (SMASH_FIST at the deck's level:
// his skull's top ~105 px under the screen's top).  TICKLE (painted): on his arm, TICKLE_GAP px on the hero's side of
// the nose -- the face to the hero's right, never behind the hero -- and the arm's walkable top.
const TROLL_PAINT_K = 1.6, TROLL_PAINT_H = 420 * TROLL_PAINT_K, TROLL_PAINT_DX = 60, TICKLE_GAP = 100;
// (the clips where his arm lies under his face -- the ramp, the tickle, the sneeze: the face drawn over the arm)
const TROLL_ARM_UNDER = new Set(['stunned', 'tickle', 'sneezeWind', 'sneeze']);
export class StoneTroll extends MMBoss {
  constructor(game, x, y, opt = {}) {
    const T = game.hooks?.troll, painted = !!CHARS.stone_troll?.ATLAS_SCALE;
    // (the hook: his head's centre -- the stand-in rig's head sits 18 px in front of its origin; the painted pack's origin
    //  is TROLL_PAINT_DX right of the hook)
    super(game, T ? T.x + (painted ? TROLL_PAINT_DX : 18) : x, y, opt, 'THE STONE TROLL', 'Guardian of the Ancient Bridge', 300);
    this.colossal = true;                   // (a soft, rate-limited hit flash: src/actors.js flashAlpha)
    this.art = 'stone_troll'; this.scale = painted ? TROLL_PAINT_H / (CHARS.stone_troll.META?.height || 420) : 1; this.w = 60; this.h = 330; this.shadowR = 0; this.balloonH = 360; this.talkGap = 400;
    this.sortY = -60;                       // (he stands in the chasm beyond the deck: behind everyone)
    this.rise = 0;                          // (down in the chasm until his fight: he rises out of the mist)
    this.reach = 250; this.fdy = 0; this.fistHits = 0; this.tickles = 0; this.cool = 70; this.seq = 0;
    this.hurtSfx = 'hit_light'; this.hurtPitch = 1.4;
    this.headY = T?.headY ?? 200;
    this.dy = null;                         // (the drawing's offset: the idle nose on headY -- placed on first use)
    // (his body behind the bridge's back wall and the mist; the reaching arm over the deck)
    // (the stand-in's body goes behind the bridge's back wall; the painted troll -- the waist up, his waist at the mist
    //  line under the deck, his head coming down over the arm when he's stunned -- is drawn in the world, behind the heroes)
    this.behind = !!game.stage?.setBehind && !CHARS.stone_troll?.ATLAS_SCALE;
    if (this.behind) game.stage.setBehind((ctx) => { if (this.rise > 0.01) this.drawPart(ctx, 'body'); });
    else game.stage?.setBehind?.(null);
  }
  get painted() { return !!CHARS.stone_troll?.ATLAS_SCALE; }
  /** the smash's last drawing he holds while the fist rests: the painted pack's impact (its last drawings pull the arm
   *  back in -- the fist must stay on the deck), the rig's landing */
  get smashHold() { return this.painted ? 0.6 : 1; }
  /** his attack zones' scale: the painted troll's fist and arms are drawn TROLL_PAINT_K big (the press's sweep, the smash's
   *  reach and ring, the resting fist), the rig's as they were tuned */
  get zk() { return this.painted ? TROLL_PAINT_K : 1; }
  bossIntro() { this.set('roar'); audio.sfx('roar', { pitch: 0.5 }); }
  bossFight() { this.set('idle'); this.cool = 50; this.rise = Math.max(this.rise, 0.5); }   // (he rises on from where the cut left him -- a snap to 1 jumped the whole troll ~56 px in a frame, flash safety; the rise is drawing only)
  // (the nose stays open through his 'ah... ah...' too; the fists while they rest after a smash or a press)
  get open() { return this.state === 'rest' || this.state === 'stunned' || this.state === 'tickle' || this.pressOpen; }
  get pressOpen() { return this.state === 'press' && this.st >= PRESS_OPEN && this.st < Math.round(TROLL_PRESS * PRESS_HOLD) + PRESS_REST; }
  /** the drawing's offset (screen px) so the idle nose sits on the stage's headY */
  get drawDy() {
    // (the painted pack's origin is his waist, under the deck: drawn so the smash's fist (SMASH_FIST) lands on the deck --
    //  without that export, META.deckZ under it -- and its exports, measured up from the waist, read through the same
    //  offset.  The stand-in rig's idle nose is placed on the stage's headY)
    if (this.dy === null) {
      const X = CHARS.stone_troll.EXPORTS || {};
      if (this.painted) this.dy = X.SMASH_FIST ? -X.SMASH_FIST[1] * this.scale : (CHARS.stone_troll.META?.deckZ ?? X.META?.deckZ ?? 134) * this.scale;
      else { const N = CHARS.stone_troll?.point?.(this.anim('idle', 0), 'nose'); this.dy = N ? this.headY - (FLOOR_TOP + this.y + N[1] * this.scale) : 0; }
    }
    return this.dy;
  }
  /** the painted pack's measured points (from 'stunned' at 0: the ramp, the tickle spot, the nose; the smash's fist) */
  get X() { return this.painted ? (CHARS.stone_troll.EXPORTS || {}) : null; }
  /** a landmark in the world: { x, z } (z: height over the deck at his depth) -- null where the pose has none */
  lm(name, pose = this.pose()) {
    const XK = { nose: 'NOSE', rampLow: 'RAMP_LOW', rampHigh: 'RAMP_HIGH', tickle: 'TICKLE' }[name];
    const X = this.X, AX = this.painted ? (CHARS.stone_troll_arm?.EXPORTS || {}) : {};
    const P = (X && XK && (X[XK] || AX[XK])) || CHARS.stone_troll?.point?.(pose, name) || (this.painted ? CHARS.stone_troll_arm?.point?.(pose, name) : null);   // (the exports first; else the drawing's landmark -- either layer)
    if (!P) return null;
    return { x: this.x + this.facing * P[0] * this.scale, z: -(P[1] * this.scale + this.drawDy) };
  }
  fistAt(pose) { const F = this.lm('fist', pose) || { x: this.x + this.facing * this.reach, z: 4 }; return { x: F.x, y: this.y + this.fdy, z: Math.max(0, F.z - this.fdy) }; }
  noseAt() { return this.lm('nose') || { x: this.x + this.facing * 58, z: 232 }; }
  /** where a hero stands to tickle him: the painted troll's arm, TICKLE_GAP on the hero's side of his nose (the rig's
   *  own landmark) -- { x, z } */
  tickleAt() {
    if (!this.painted) return this.lm('tickle');
    const N = this.noseAt(), lo = this.lm('rampLow'), hi = this.lm('rampHigh');
    if (!lo || !hi) return this.lm('tickle');
    const x = N.x + this.facing * TICKLE_GAP;
    return { x, z: lo.z + (hi.z - lo.z) * (x - lo.x) / ((hi.x - lo.x) || 1) };
  }
  get postBox() {
    if (this.state === 'rest' || this.pressOpen) { const F = this.fistAt(); return { x: F.x, y: F.y, z: 0, w: 44 * this.zk, h: 90 * this.zk, depthR: 10 }; }
    if (this.state === 'stunned' || this.state === 'tickle') { const N = this.noseAt(), d = this.painted ? 20 : 0; return { x: N.x + this.facing * d, y: this.y, z: N.z - 30, w: 34 + d, h: 60, depthR: 30 }; }   // (painted: reaching to the TICKLE side of the nose)
    return { x: this.x, y: this.y, z: 9999, w: 1, h: 1 };
  }
  /** a hit's spark and word: on the fist / the nose (src/player.js landed) */
  get sparkBox() { return this.open ? this.postBox : null; }
  keyHint() { return this.state === 'stunned' ? ['mmramp', 'Climb his arm! Tickle his NOSE!'] : ['mmfist', 'ROLL through his smash -- or hit his fist while it rests on the bridge!']; }
  dmgOf(att, hd) {
    const g = this.game;
    if (this.state === 'rest' || this.pressOpen) {   // (the fist on the deck: three good hits and it's stunned)
      this.fistHits++;
      g.fx.word(this.fistAt().x, this.y, 70, true, this.fistHits >= 3 ? 'CRACK!' : 'TOK!');
      if (this.fistHits >= 3) this.stun(null);
      return 0;
    }
    // the nose: from up on the arm (or flying off Dodongo's shield), or a super
    // (from up on his arm -- the painted troll's: anywhere on it, its top at his face, TICKLE ~100 px under his nose -- or
    //  a jump there)
    const N = this.noseAt(), up = hd.special || hd.team || (att && (this.painted ? (att.onRamp || att.z > N.z - 110) && Math.abs(att.x - N.x) < 150 : att.z > N.z - 110));
    if (!up) { if ((!this._climbT || g.frame - this._climbT > 120) && !g.players.some((q) => q.onRamp)) { this._climbT = g.frame; g.fx.label(N.x, this.y, 150, 'CLIMB UP!', '#ffe066', 26, 50); } return null; }
    g.fx.word(N.x, this.y, N.z, false, 'TICKLE!');
    return hd.dmg;
  }
  onDamage() {
    // (a third of his patience gone: a tickle -- "ah... ah..." -- then he shakes it off; the third: the big one)
    const k = 1 - this.hp / this.maxHp, n = Math.min(3, Math.floor(k * 3 + 1e-6));
    if (this.hp > 0 && n > this.tickles) {
      this.tickles = n;
      this.set('tickle'); if (!this.painted) this.dropRamp();   // (the painted troll's arm stays put through his 'ah... ah...': the hero stays beside his face)
      audio.sfx('charge_hum', { pitch: 1.6, vol: 0.5 });
    }
  }
  onZero() { this.set('sneezeWind'); if (!this.painted) this.dropRamp(); this.game.mm?.line('holdOn'); audio.sfx('charge', { pitch: 0.5 }); }
  /** the fist is stunned: the arm lies along the deck as a ramp up to his nose */
  stun(by) {
    const g = this.game;
    this.set('stunned'); this.fistHits = 0; this.releaseToken();
    g.shake = Math.max(g.shake, 8); audio.sfx('hit_finisher', { pitch: 0.6 });
    this.shout('STUNNED!', '#ffe066', 38, 200);
    if (by) g.mm?.line('parry', by.team === 'hero' && baseOf(by.heroId) === 'dodongo' ? by : null);
    if (!g.flags.mm_ramp) { g.flags.mm_ramp = true; g.mm?.line(g.players.some((q) => !q.out && baseOf(q.heroId) === 'shadow') ? 'ramp' : 'rampNoSha'); }
    g.mm?.hint('mmramp', 'Climb his arm! Tickle his NOSE!', 400, true);
  }
  dropRamp() { const m = this.game.mm; if (m) m.ramps = m.ramps.filter((R) => R.owner !== this); }
  setRamp() {
    const m = this.game.mm;
    if (!m) return;
    const pose = this.pose(), lo = this.lm('rampLow', pose);
    let hi = this.lm('rampHigh', pose);
    if (!lo || !hi) return;
    // (the walkable line runs from where the arm meets the deck -- on down past the fist where the fist rests above it,
    //  no step up onto the arm -- to its top: the painted troll's ends just past TICKLE, by his face)
    const z0 = lo.z - this.fdy, slope = (hi.z - z0) / ((hi.x - lo.x) || 1), foot = slope ? lo.x - z0 / slope : lo.x;
    if (this.painted) { const T = this.tickleAt(), x1 = T.x - this.facing * 14; hi = { x: x1, z: z0 + slope * (x1 - lo.x) }; }
    m.ramps = m.ramps.filter((R) => R.owner !== this);
    m.ramps.push({ owner: this, x0: foot, z0: 0, x1: hi.x, z1: hi.z, y0: Math.min(this.y, this.y + this.fdy) - 26, y1: Math.max(this.y, this.y + this.fdy) + 26 });
  }
  /** the smash / press zone hits: a dodge through it (in its roll) is a PARRY -- the fist is stunned */
  smashHit(F, r, dmg) {
    const g = this.game;
    let parried = null;
    for (const q of g.players) {
      if (q.out || !q.alive || q.mmHeld) continue;
      if (Math.abs(q.x - F.x) > r || Math.abs(q.y - F.y) > 30 || q.z > 70) continue;
      if (q.state === 'dodge' && q.st <= DODGE.inv1) { parried = q; q.perfectDodge?.(); continue; }
      if (q.hittable) q.takeHit({ x: F.x, team: 'foe', facing: this.facing }, { dmg, kind: 'knock', push: 6, lift: 6, stop: 7, sfx: 'hit_heavy', spark: 'warm' });
    }
    return parried;
  }
  update() {
    const g = this.game, p = this.player;
    this.tick();
    if (this.cool > 0) this.cool--;
    if (this.ouch > 0) this.ouch--;
    this.nag();
    if (this.state !== 'stunned' && this.state !== 'tickle') g.mm?.clearHint('mmramp');   // (no nose to tickle now: its hint goes -- not on through the sneeze)
    if (this.state !== 'intro' && (this.rise < 1 || this.mistK > 0)) {   // (his rise thins the mist bank; its last 0.4 over 40 frames -- it went in one frame: a third of the screen brightened at once, flash safety)
      if (this.rise < 1) { this.rise = Math.min(1, this.rise + 1 / 70); this.mistK = 1 - this.rise * 0.6; } else this.mistK = Math.max(0, this.mistK - 0.01);
      g.stage.setTrollMist?.(this.mistK);
    }
    switch (this.state) {
      case 'intro': break;
      case 'roar': if (this.st >= 80 && !g.cut) this.set('idle'); break;
      case 'idle':
        if (this.cool <= 0 && g.fighting && !g.cut) {
          this.seq++;
          const tgt = live(g).sort((a, b) => Math.abs(a.x - this.x) - Math.abs(b.x - this.x))[0] || p;
          const after = this.afterTickle; this.afterTickle = false;   // (after a tickle: straight to the next smash)
          if (!after && this.seq % 3 === 0) { this.set('press'); this.fistHits = 0; this.hitSet = new Set(); g.fx.label(this.x + this.facing * 200 * this.zk, this.y, 160, 'JUMP!', '#ffe066', 32, 60); audio.sfx('charge', { pitch: 0.6 }); }
          else {
            // (the stand-in reaches for the hero; the painted arm lands where its drawing does)
            if (!this.painted) { this.reach = clamp((tgt.x - this.x) * this.facing, 150, 330); this.fdy = clamp(tgt.y - this.y, -40, 40); } else this.fdy = 0;
            this.set('smashWind'); audio.sfx('charge', { pitch: 0.5, vol: 0.7 });
            const F = this.fistAt(this.armed(this.anim('smash', this.smashHold))); this.mark = { x: F.x, y: F.y };   // (where it will land: a shadow on the deck)
          }
        }
        break;
      case 'smashWind': if (this.st >= 54) { this.set('smash'); this.landed = false; } break;
      case 'smash': {
        const F = this.fistAt();
        if (!this.landed && this.st >= 3 && F.z < 30) {   // (the impact: the fist reaches the deck)
          this.landed = true; this.mark = null;
          g.shake = Math.max(g.shake, 4); audio.sfx('knockdown', { pitch: 0.45 }); g.fx.dust(F.x, F.y, 10, 50);   // (4 px, was 12: the jitter over his arm's sweep brightened >25 % of the bright bridge in 3 frames -- flash safety)
          g.fx.ring(F.x, F.y, { rx: 90 * this.zk, ry: 30, shock: true, col: '#d8cfb8', life: 16 });
          const par = this.smashHit(F, 70 * this.zk, 13);
          if (par) { this.stun(par); break; }
        }
        if (this.st >= 24) { this.set('rest'); this.fistHits = 0; this.mark = null; }
        break;
      }
      case 'rest':                           // (the fist lies on the deck: hit it!)
        if (this.st === 2) g.mm?.hint('mmfist', 'Hit his fist while it rests -- or ROLL right through a smash!', 330, !g.flags.hint_mmfist);
        if (this.st >= 150) { this.set('lift'); this.liftFromRest = true; }   // (the push off the deck: liftSquash)
        break;
      case 'lift': if (this.st >= 30) { this.set('idle'); this.cool = rnd(18, 36); } break;
      case 'press': {                        // (the first third raises both arms; then they come down across the near deck)
        const st0 = Math.round(TROLL_PRESS * PRESS_WIND);
        if (this.st >= st0 + 10 && this.st <= st0 + 22) for (const q of g.players) {
          const dx = (q.x - this.x) * this.facing;
          if (q.hittable && !this.hitSet.has(q) && dx > 90 * this.zk && dx < 360 * this.zk && q.z < 36) { this.hitSet.add(q); q.takeHit({ x: this.x, team: 'foe', facing: this.facing }, { dmg: 10, kind: 'knock', push: 5, lift: 6, stop: 6, sfx: 'hit_heavy', spark: 'warm' }); }
        }
        if (this.st === st0 + 12) { g.shake = Math.max(g.shake, 5); audio.sfx('knockdown', { pitch: 0.5 }); for (let i = 0; i < 6; i++) g.fx.dust(this.x + this.facing * rnd(100, 340) * this.zk, rnd(lo(g), hi(g)), 2, 20); }
        if (this.st === PRESS_OPEN) g.mm?.hint('mmfist', 'Hit his fist while it rests -- or ROLL right through a smash!', 330, !g.flags.hint_mmfist);
        if (this.st >= TROLL_PRESS + PRESS_REST) { this.set('idle'); this.cool = 24; }
        break;
      }
      case 'stunned':
        this.setRamp();
        if (this.st >= 480 + 60 * (live(g).length - 1)) { this.dropRamp(); this.set('lift'); this.liftFromRest = false; }
        break;
      case 'tickle':
        if (this.st === 10) g.fx.balloon(this, 'Ah... ah...', 70, { villain: true });
        if (this.st === 70) g.fx.balloon(this, '...hmph.', 50, { villain: true });
        if (this.st >= 100) { this.set('idle'); this.cool = 20; this.afterTickle = true; this.dropRamp(); }
        break;
      case 'sneezeWind':
        if (this.st === 6) g.fx.balloon(this, 'AAAH...', 80, { villain: true });
        // (the painted troll rears back for the big one, his arm pulled in off the deck: whoever's on it drops off)
        if (this.painted && this.game.mm?.ramps.some((R) => R.owner === this)) {
          const F = this.lm('fist'), F0 = this.lm('fist', this.anim('stunned', 0));
          if (F && F0 && Math.abs(F.x - F0.x) > 30) this.dropRamp();
        }
        if (this.st >= 80) {
          this.set('sneeze'); this.dropRamp();   // (blown off his arm)
          g.fx.balloon(this, FIGHT_LINES.sneeze[1], 120, { villain: true });
          g.shake = Math.max(g.shake, 16); audio.sfx('roar', { pitch: 1.6 });
          const M = this.lm('mouth');
          if (M) for (let i = 0; i < 16; i++) g.fx.add({ type: 'star', x: M.x, y: this.y + rnd(-20, 20), z: M.z, vx: this.facing * rnd(4, 12), vz: rnd(-1, 1.5), life: 40, r: rnd(6, 14), col: '#f2f2ea' });
          for (const q of g.players) if (!q.out) { q.vx = this.facing * 7; }   // (blown back -- a big, harmless gust)
        }
        break;
      case 'sneeze': if (this.st >= 50) { this.set('topple'); audio.sfx('knockdown', { pitch: 0.4 }); } break;
      case 'topple':
        if (this.st % 10 === 0) g.shake = Math.max(g.shake, 6);
        this.game.stage.setTrollMist?.(Math.min(1, this.st / 80));
        if (this.st >= 100) this.defeat();
        break;
      case 'defeated': break;
    }
  }
  pose() {
    const g = this.game;
    let P;
    switch (this.state) {
      case 'roar': P = this.anim('fistWind', 0.3 * Math.sin(Math.min(1, this.st / 80) * Math.PI)); break;
      case 'smashWind': P = this.anim('fistWind', Math.min(1, this.st / 54)); break;
      case 'smash': P = this.anim('smash', Math.min(this.smashHold, this.st / 24)); break;
      case 'rest': P = this.trollClip('rest') ? this.anim('rest', (this.st >= 135 ? this.st - 90 : this.st) / 60) : this.anim('smash', this.smashHold); break;   // (painter 1: the fist planted, the head and the free arm alive -- 15 f a drawing; else the smash's held drawing.  The last slot, st 135-149, is rest3 -- the exhale, his face at its lowest -- not rest1, the breath's peak: the lift's face starts there)
      case 'lift': P = this.anim('fistWind', 0.3 * (1 - Math.min(1, this.st / 30))); break;   // (0.3: the wind-up's low drawings only -- at 0.5 the 6-drawing fistWind flashed its raised arm for a frame, critic B)
      case 'press': {
        const h = Math.round(TROLL_PRESS * PRESS_HOLD);
        if (this.st >= h && this.st < h + PRESS_REST && this.trollClip('pressHold')) { P = this.anim('pressHold', (this.st - h) / 60); break; }   // (painter 1: the press's held drawing, breathing -- 16 f a drawing)
        P = this.anim('press', Math.min(1, (this.st < h ? this.st : this.st < h + PRESS_REST ? h : this.st - PRESS_REST) / TROLL_PRESS)); break;
      }
      case 'stunned': P = this.anim('stunned', g.time); break;
      case 'tickle': P = this.anim('tickle', Math.min(1, this.st / 100)); break;
      case 'sneezeWind': P = this.anim('sneezeWind', Math.min(1, this.st / 80)); break;
      case 'sneeze': P = this.anim('sneeze', Math.min(1, this.st / 50)); break;
      case 'topple': P = this.anim('topple', Math.min(1, this.st / 100)); break;
      case 'defeated': P = this.anim('topple', 1); break;
      default: P = this.anim('idle', g.time);
    }
    return this.armed(P);
  }
  /** painter 1's own painted clip k in the troll's pack (named so: not a stand-in) -- the rest / pressHold loops */
  trollClip(k) { const f = CHARS.stone_troll?.ANIM?.[k], p = typeof f === 'function' ? f(0) : f; return !!(this.painted && p && p.s3d >= 0.5 && p.clip === k); }
  /** a pose with the stand-in's reach (the rig's fist lands where he aims; the painted arm where its drawing does) */
  armed(P) { return this.painted ? P : { ...P, reach: this.reach, fdy: this.fdy }; }
  /** one layer: 'body' (behind the wall), 'arm' (over the deck), or both (no setBehind: a stand-in floor) */
  /** rest -> lift, the push off the deck (critic B: it snapped): the rest's last 6 frames squash him down about his planted fist (it stays
   *  put) -- { k: 0..1, at: 'fist' } or null.  The lift's own ease (the face carried across its drawing changes): drawPart.  Drawing only */
  liftSquash() {
    if (!this.painted) return null;
    const A = 6, e = (u) => u * u * (3 - 2 * u);
    if (this.state === 'rest' && this.st > 149 - A) return { k: e(Math.min(1, (this.st - (149 - A)) / A)), at: 'fist' };
    return null;
  }
  drawPart(ctx, part) {
    const body = CHARS.stone_troll, arm = CHARS.stone_troll_arm;
    if (!body) return;
    const pose = this.pose(), o = this.drawOpts(), y = this.sy + this.drawDy + (1 - this.rise) * 330 * this.zk;
    // (the push off the deck: the rest's last frames press him down about the planted fist; then, at each of the lift's drawing changes,
    //  the new drawing starts scaled about his feet to the height his FACE had a frame before and eases to its own over 8 frames)
    const SQ = this.liftSquash(); let Q = null;
    // (above the deck line only -- the fist's line: the fist stays planted on it, and everything under it, his feet, is drawn as is)
    if (SQ && SQ.at === 'fist' && SQ.k > 0.001) { const F = body.point?.(pose, 'fist'), ax = F ? this.sx + this.facing * F[0] * this.scale : this.sx, ay = F ? y + F[1] * this.scale : y; Q = { ax, ay, sx: 1, sy: 1 - 0.05 * SQ.k, above: true }; }
    // (the face, not the crown: 'head' rises in the lift's opener while the face drops.  +-5% at most, about his feet; and only as much
    //  as keeps the face's step <= FACE_STEP px -- the crown rides the same scale, so the less stretch, the nearer the art's own crown step)
    //  ('eye' where the pack has it -- the amber eyes, what the eye reads; 'nose' sits 15-55 px under them depending on the head's tilt)
    const N = body.point?.(pose, 'eye') || body.point?.(pose, 'nose'), fy = N ? y + N[1] * this.scale : null, FACE_STEP = 10;
    if (this.painted && this.state === 'lift' && this.liftFromRest && fy != null) {
      const key = pose.clip + ':' + pose['f_' + pose.clip];
      if (key !== this._liftKey) {
        const h = y - fy, dh = this._faceH - h, need = Math.abs(dh) <= FACE_STEP ? 1 : (this._faceH - Math.sign(dh) * FACE_STEP) / h;
        this._liftKey = key; this._liftT0 = this.st; this._liftS0 = h > 1 && this._faceH > 1 ? clamp(need, 0.95, 1.05) : 1;
      }
      const u = Math.min(1, Math.max(0, this.st - this._liftT0) / 8), s = this._liftS0 + (1 - this._liftS0) * u * u * (3 - 2 * u);
      if (Math.abs(s - 1) > 0.001) Q = { ax: this.sx, ay: y, sx: 1 + 0.4 * (1 - s), sy: s };
    } else this._liftKey = null;
    this._faceH = fy == null ? 0 : y - (Q ? Q.ay + (fy - Q.ay) * Q.sy : fy);
    this._sq = Q;
    const one = (mod, opt) => {
      const Q = this._sq, d = () => drawWithFlash(ctx, this.sx, y, this.flashAlpha, (c) => mod.draw(c, pose, { ...o, ...opt }));
      if (Q && Q.above) {   // (two pieces: under the line as drawn; over it, pressed about the line -- the same pixels at the seam)
        ctx.save(); try { ctx.beginPath(); ctx.rect(-1e5, Q.ay, 2e5, 1e5); ctx.clip(); d(); } finally { ctx.restore(); }
        ctx.save(); try { ctx.beginPath(); ctx.rect(-1e5, Q.ay - 1e5, 2e5, 1e5 + 0.5); ctx.clip(); ctx.translate(Q.ax, Q.ay); ctx.scale(Q.sx, Q.sy); ctx.translate(-Q.ax, -Q.ay); d(); } finally { ctx.restore(); }
        return;
      }
      if (Q) { ctx.save(); ctx.translate(Q.ax, Q.ay); ctx.scale(Q.sx, Q.sy); ctx.translate(-Q.ax, -Q.ay); }
      try { d(); } finally { if (Q) ctx.restore(); }
    };
    if (this.painted && arm?.ATLAS_SCALE) {   // (the painted layer packs: the arm over him, or under his face)
      const under = TROLL_ARM_UNDER.has(this.state);
      if (under && part !== 'body') one(arm, {});
      if (part !== 'arm') one(body, {});
      if (!under && part !== 'body') one(arm, {});
    } else one(body, { part });                // (the rig's own layers)
  }
  /** while he's stunned: a bouncing arrow over the TICKLE spot on his arm, until someone stands there */
  drawTickle(ctx) {
    if (this.state !== 'stunned') return;
    const T = this.tickleAt(), g = this.game;
    if (!T || g.players.some((q) => q.onRamp && Math.abs(q.x - T.x) < 26)) return;
    const x = T.x - g.camX, y = FLOOR_TOP + this.y - T.z - 70 - Math.abs(Math.sin(g.time * 5)) * 12;
    ctx.save(); ctx.fillStyle = '#ffe066'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.lineTo(x + 14, y); ctx.lineTo(x + 14, y + 16); ctx.lineTo(x + 24, y + 16); ctx.lineTo(x, y + 38); ctx.lineTo(x - 24, y + 16); ctx.lineTo(x - 14, y + 16); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  draw(ctx) {
    if (this.rise <= 0.01) return;
    this.drawTickle(ctx);
    if (this.mark && (this.state === 'smashWind')) {   // (the fist's shadow, growing where it will land)
      const k = Math.min(1, this.st / 54), x = this.mark.x - this.game.camX, yy = FLOOR_TOP + this.mark.y;
      ctx.fillStyle = `rgba(40,30,20,${0.15 + 0.3 * k})`; ctx.beginPath(); ctx.ellipse(x, yy, (30 + 40 * k) * this.zk, 10 + 12 * k, 0, 0, TAU); ctx.fill();
    }
    if (this.state === 'defeated' || (this.state === 'topple' && this.st > 70)) { if (!this.behind) this.drawPart(ctx, 'body'); return; }   // (off the bridge: no arm left on the deck)
    if (this.behind) this.drawPart(ctx, 'arm'); else this.drawPart(ctx, undefined);
  }
  drawShadow() {}
  /** the SNEEZE meter (three tickles) */
  meterHud(ctx) {
    const k = 1 - this.hp / this.maxHp;
    const y = (this.game._bossBarBottom ?? 77) + 12;   // (under the boss's bar, wherever the party's panels put it: src/hud.js)
    drawMeterBar(ctx, W / 2 - 60, y, 180, k, 'SNEEZE', '#bff0ff');
    ctx.fillStyle = INK; for (let i = 1; i < 3; i++) ctx.fillRect(W / 2 - 60 + 180 * i / 3 - 1, y, 2, 12);
  }
}

// ==================================================================================================== THE ICE WYVERN
const ICE_WASH = 'rgba(206,238,255,0.55)';
const WYV_UP = 250, WYV_UP_WIND = 290, WYV_LOW = 150;
export class IceWyvern extends MMBoss {
  constructor(game, x, y, opt = {}) {
    super(game, x, y, opt, 'THE ICE WYVERN', 'The Ice Dragon of the Cliffs', 320);
    this.painted = !!CHARS.ice_wyvern; this.colossal = true;
    this.art = this.painted ? 'ice_wyvern' : 'wyvern'; this.variant = 'ice'; this.rider = false; this.cursed = false;
    if (!this.painted) this.wash = ICE_WASH;   // (its own pack not in: the wyvern, frosted over)
    this.scale = 1.7; this.w = 58; this.h = 92; this.hz0 = -8; this.depthR = 10; this.shadowR = 70;
    this.flying = true; this.z = 230; this.balloonH = 200; this.talkGap = 260;
    this.cool = 90; this.held = null; this.talon = 0; this.mash = 0; this.hurtSfx = 'hit_heavy'; this.hurtPitch = 1.1;
  }
  bossIntro() { this.set('screech'); audio.sfx('roar', { pitch: 1.5 }); }
  /** its cruising height: high, but its wings under the HUD (the co-op panels sit deeper) -- and never so high that its
   *  raised wings (WYV_UP px over its feet; WYV_UP_WIND in the dive wind-up, measured off the painted pack) leave the
   *  screen's top edge, though never down into easy sword reach (WYV_LOW) */
  get high() { return Math.max(WYV_LOW, Math.min(this.game.players.length > 1 ? 165 : 205, this.roof())); }
  roof(up = WYV_UP) { return FLOOR_TOP + this.y - up; }
  /** its entrance height (no fighting yet): low enough that it isn't lost behind the hero panels while it talks */
  get introZ() { return clamp(FLOOR_TOP + this.y - WYV_UP - (this.game.players.length > 1 ? 80 : 60), 90, 230); }
  bossFight() {
    this.set('circle'); this.cool = 90; this.dir = -1;
    const H = this.keyHint();
    this.game.mm?.hint(H[0], H[1], 400, true);
  }
  get usesLaunch() { return true; }
  keyHint() {
    const m = this.game.mm, p = live(this.game)[0];
    return ['mmwyvern', `It's flying too high! Press ${m.keyName('shoot', p)} to shoot it -- swing when it swoops LOW!`];
  }
  get open() { return !['intro', 'screech', 'defeated'].includes(this.state); }
  dmgOf(att, hd) {
    if (this.state === 'grounded') return Math.round(hd.dmg * 1.5);
    if (this.held) {                       // (its talons: three good hits and it lets go)
      this.talon++;
      this.game.fx.word(this.x, this.y, this.z - 20, false, this.talon >= 3 ? 'LET GO!' : 'CLANG!');
      if (this.talon >= 3) this.letGo(false);
    }
    return hd.dmg;
  }
  onZero() { this.letGo(false); this.defeat(); audio.sfx('roar', { pitch: 1.7 }); }
  /** where a carried hero hangs (world): the pack's talons, else under it */
  talons() {
    const C = CHARS[this.art], pose = this.pose(), s = this.scale;
    let P = C?.point?.(pose, 'talons');
    if (P && Array.isArray(P[0])) P = [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2];
    if (!P) { const L = C?.point?.(pose, 'talonL'), R2 = C?.point?.(pose, 'talonR'); if (L && R2) P = [(L[0] + R2[0]) / 2, (L[1] + R2[1]) / 2]; }
    return P ? { x: this.x + this.facing * P[0] * s, z: this.z - P[1] * s } : { x: this.x + this.facing * 10, z: this.z - 10 };
  }
  letGo(hurt) {
    const p = this.held;
    if (!p) return;
    this.held = null; this.talon = 0; this.mash = 0;
    freeHero(p, hurt);
    if (!hurt && baseOf(p.heroId) === 'ana') this.game.mm?.line('anaFreed');
    if (this.alive) { this.set('hover'); this.cool = rnd(60, 90); }
  }
  /** a hero launched off Dodongo's shield, onto its head: BONK -- down to the ledge */
  checkHead() {
    const g = this.game, m = g.mm;
    if (!m || this.state === 'grounded' || !this.alive) return;
    for (const q of g.players) {
      if (!m.launchedHigh(q, 90, 80) || Math.abs(q.x - this.x) > 90 || Math.abs(q.y - this.y) > 44 || Math.abs(q.z - this.z) > 110) continue;
      q.vz = Math.max(q.vz, 6); q.launchedAt = 0;
      this.hp = Math.max(1, this.hp - Math.ceil(this.maxHp / 10)); this.flash = 8;
      g.fx.word(this.x, this.y, this.z + 40, true, 'BONK!'); g.shake = Math.max(g.shake, 12); audio.sfx('hit_finisher', { pitch: 0.8 });
      this.letGo(false);
      this.set('fall'); this.vx = 0; this.fallZ0 = Math.max(1, this.z);
      return;
    }
  }
  update() {
    const g = this.game, p = this.player;
    this.tick();
    if (this.cool > 0) this.cool--;
    if (this.ouch > 0) this.ouch--;
    const bob = Math.sin(g.time * 2.4) * 8;
    this.nag();
    this.checkHead();
    if (this.state === 'carry' && this.held && this.st === 1 && !(g.frame - (this.mashAt ?? -1e9) < 60)) this.mashAt = g.frame;
    switch (this.state) {
      case 'intro': this.z += (this.introZ - this.z) * 0.05; break;
      case 'screech': this.z += (Math.min(160, Math.max(this.introZ, this.roof())) - this.z) * 0.06; if (this.st >= 80 && !g.cut) this.set('circle'); break;
      case 'circle': {                      // (high over the ledge, its shadow sweeping across)
        this.z += (this.high + bob - this.z) * 0.06;
        this.vx = (this.dir || -1) * 3.2;
        if (this.x < g.camX + 120) this.dir = 1; if (this.x > g.camX + W - 120) this.dir = -1;
        this.facing = this.vx > 0 ? 1 : -1;
        this.vy = clamp((p.y - this.y) * 0.03, -1, 1);
        if (this.cool <= 0 && g.fighting && !g.cut && !p.down) {
          this.tgt = p; this.vx = this.vy = 0; this.face(p);
          const r = Math.random(), n = live(g).length;
          this.next = r < (n > 1 ? 0.38 : 0.28) ? 'snatch' : r < 0.68 ? 'swoop' : 'breath';
          this.set('diveWind'); g.fx.alert(this); audio.sfx('whelp_chirp', { pitch: 0.5 });
        }
        break;
      }
      case 'diveWind': this.z += (Math.max(WYV_LOW, Math.min(this.high + 15, this.roof(WYV_UP_WIND))) - this.z) * 0.1; this.face(this.tgt);
        if (this.next === 'snatch' && this.st % 6 === 0) g.fx.add({ type: 'star', x: this.x + rnd(-30, 30), y: this.y, z: this.z - 20 + rnd(-10, 10), vz: -0.5, life: 16, r: 5, col: '#7ff8ff' });   // (talons glinting: a grab coming)
        if (this.st >= 34) {
          if (this.next === 'breath') { this.set('breathGo'); }
          else { this.set('dive'); this.hitDone = false; audio.sfx('swing_heavy', { pitch: 0.9 }); }
        }
        break;
      case 'dive': {                         // (a swoop -- or a snatch: the same dive, its talons open)
        const t = this.tgt || p;
        this.vx = this.facing * 9; this.vy = clamp((t.y - this.y) * 0.08, -2, 2);
        this.z = Math.max(40, this.z - 7);
        if (!this.hitDone) for (const q of g.players) {
          if (q.out || q.mmHeld || q.state === 'special' || Math.abs(q.x - (this.x + this.facing * 40)) > 60 || Math.abs(q.y - this.y) > 24 || this.z > q.z + 130) continue;
          if (q.state === 'dodge' && q.st <= DODGE.inv1) { q.perfectDodge?.(); continue; }
          if (!q.hittable) continue;
          this.hitDone = true;
          if (this.next === 'snatch' && !this.held) {
            this.held = q; this.talon = 0; this.mash = 0; grabHero(q); this.set('carry');
            audio.sfx('roar', { pitch: 1.6, vol: 0.7 });
            const dod = g.players.find((a) => !a.out && a !== q && baseOf(a.heroId) === 'dodongo');   // ("ANASTASIA!" -- Dodongo's, never her own)
            if (baseOf(q.heroId) === 'ana' && dod) g.mm?.line('anaGrabbed', dod); else g.mm?.line('grabbed', q);
            const alone = live(g).filter((a) => a !== q).length === 0;
            g.mm?.hint('mmsnatch', alone ? `It grabbed you! MASH ${g.mm.keyName('attack', q)} to wriggle free!`
              : g.mm.canLaunch() ? 'It grabbed a friend! Hit its TALONS! || Or roll into Dodongo\'s shield and fly at its HEAD!' : 'It grabbed a friend! Hit its TALONS to make it let go!');
          } else q.takeHit(this, { dmg: 12, kind: 'knock', push: 6, lift: 5, stop: 6, sfx: 'hit_heavy', spark: 'cool' });
          break;
        }
        const edge = this.facing > 0 ? this.x > g.camX + W - 80 : this.x < g.camX + 80;
        if (this.state === 'dive' && (this.st >= 48 || edge)) this.set('hover');
        break;
      }
      case 'carry': {                         // (up it goes with a hero in its talons, drifting over the ledge)
        const q = this.held;
        this.z += (170 - this.z) * 0.05; this.vx = Math.sin(this.st * 0.03) * 1.6; this.vy = 0;
        if (q && !g.players.includes(q)) { this.letGo(false); break; }   // (CHANGE HERO: that hero isn't here any more)
        if (q) {
          const T = this.talons();
          q.x = T.x; q.y = this.y; q.z = Math.max(0, T.z - (q.h || 120) * 0.75);
          q.sortY = this.y + 1;                // (drawn in front of the wyvern that carries him)
          if (mashed(g, q) && ++this.mash >= 12) { this.shout('WRIGGLE!', '#ffe066', 30); this.letGo(false); break; }
          if (this.st >= 200) { this.letGo(true); break; }
        } else this.set('hover');
        break;
      }
      case 'breathGo': {                      // (down low at the side, breathing frost along the ledge)
        const side = this.tgt && this.tgt.x > g.camX + W / 2 ? -1 : 1;
        const tx = side > 0 ? g.camX + 140 : g.camX + W - 140;
        this.vx = clamp((tx - this.x) * 0.08, -7, 7); this.vy = clamp(((this.tgt?.y ?? 70) - this.y) * 0.06, -1.5, 1.5);
        this.z += (110 - this.z) * 0.1; this.facing = side;
        if (this.st >= 40) { this.set('breath'); this.vx = this.vy = 0; this.hitSet = new Set(); audio.sfx('dodge', { pitch: 0.4, vol: 0.9 }); }
        break;
      }
      case 'breath': {
        const reach = Math.min(420, 60 + this.st * 9), M = CHARS[this.art]?.point?.(this.pose(), 'mouth');
        const mx = M ? this.x + this.facing * M[0] * this.scale : this.x + this.facing * 50, mz = M ? this.z - M[1] * this.scale : this.z;
        if (this.st % 2 === 0) for (let i = 0; i < 3; i++) { const u = Math.random(); g.fx.add({ type: 'frost', x: lerp(mx, this.x + this.facing * reach, u), y: this.y + rnd(-20, 20), z: lerp(mz, rnd(10, 60), Math.min(1, u * 2)), vx: this.facing * rnd(1, 3), vz: rnd(-0.4, 0.6), life: 26, r: rnd(6, 10) }); }   // (soft frost puffs: no inked stars)
        // (each hero once a breath: a frosty shove, never a freeze-lock)
        for (const q of g.players) {
          const dx = (q.x - this.x) * this.facing;
          if (q.hittable && !this.hitSet.has(q) && dx > 30 && dx < reach && Math.abs(q.y - this.y) < 32 && q.z < 90) { this.hitSet.add(q); q.takeHit(this, { dmg: 10, kind: 'light', push: 3, stun: 14, stop: 3, sfx: 'hit_light', spark: 'cool' }); }
        }
        if (this.st >= 80) this.set('hover');
        break;
      }
      case 'hover':                           // (low and slow for a moment: the opening)
        this.vx *= 0.9; this.vy *= 0.9; this.z += (120 + bob - this.z) * 0.08;
        if (this.st >= 100) { this.set('climb'); }
        break;
      case 'climb': this.z += (this.high - this.z) * 0.06; if (this.st >= 40) { this.set('circle'); this.cool = rnd(80, 130); } break;
      case 'fall':                            // (BONK: down to the ledge)
        this.vx = 0; this.vy = 0; this.z = Math.max(0, this.z - 9);
        if (this.z <= 0) { this.set('grounded'); g.shake = Math.max(g.shake, 10); audio.sfx('knockdown', { pitch: 0.6 }); g.fx.dust(this.x, this.y, 8, 40); this.dizzyUntil = g.frame + 240; }
        break;
      case 'grounded': this.vx = this.vy = 0; if (this.st >= 240) { this.set('climb'); } break;
      case 'defeated':                        // (away it flies, over the peaks, for good)
        this.vx = this.facing * 4; this.vy = 0; this.z += 3;
        if (this.st === 2) { this.facing = this.x < g.camX + W / 2 ? -1 : 1; this.shout('SKREEE...!', '#e8f8ff', 34); }
        break;
    }
    this.x += this.vx; this.y += this.vy;
    this.clampDepth();
    if (this.state !== 'defeated' && this.state !== 'intro') this.x = clamp(this.x, g.camX + 50, g.camX + W - 50);
  }
  pose() {
    const g = this.game;
    switch (this.state) {
      case 'diveWind': return this.anim('diveWind', Math.min(1, this.st / 34));
      case 'dive': return this.anim('dive', g.time);
      case 'carry': return this.painted ? this.anim('snatch', g.time) : this.anim('swoopUp', 0.5);
      case 'breath': return this.painted ? this.anim('breath', Math.min(1, this.st / 30)) : this.anim('diveWind', 0.4);
      case 'climb': return this.anim('swoopUp', Math.min(1, this.st / 40));
      case 'fall': return this.anim('fall', this.fallZ0 ? Math.min(1, 1 - this.z / this.fallZ0) : 0.6);   // (its tumble, timed to the drop)
      case 'grounded': return this.anim('down');
      case 'defeated': return this.painted ? this.anim('flyAway', g.time) : this.anim('fly', g.time * 1.5);
      default: return this.anim('fly', g.time);
    }
  }
  drawOpts() { return { ...super.drawOpts(), cursed: false, rider: false, variant: 'ice' }; }
  /** the frost's lane, on the ice before it breathes (and while it does) */
  drawFloor(ctx) {
    this.game.mm?.drawLaunchRing(ctx, this); launchCallout13(ctx, this.game, this);
    if (this.state !== 'breathGo' && this.state !== 'breath') return;
    const g = this.game, k = this.state === 'breath' ? 1 : Math.min(1, this.st / 40), x0 = this.x - g.camX + this.facing * 30, x1 = x0 + this.facing * 420, y = FLOOR_TOP + this.y;
    ctx.save(); ctx.fillStyle = `rgba(127,216,255,${0.18 + 0.2 * k * (0.7 + 0.3 * Math.sin(g.time * 12))})`;
    ctx.fillRect(Math.min(x0, x1), y - 32, Math.abs(x1 - x0), 64);
    ctx.strokeStyle = `rgba(60,150,220,${0.5 * k})`; ctx.lineWidth = 2; ctx.setLineDash([14, 8]); ctx.strokeRect(Math.min(x0, x1), y - 32, Math.abs(x1 - x0), 64); ctx.restore();
  }
  drawOverMM(ctx) { this.drawMash(ctx, this.held); }
  drawShadow(ctx) {   // (its big shadow sweeps the ledge while it circles: the comic's beat)
    const sx = this.x - this.game.camX, sy = FLOOR_TOP + this.y, k = clamp(1 - this.z / 400, 0.45, 1);
    ctx.fillStyle = `rgba(30,40,70,${0.3 * k + (this.state === 'circle' ? 0.12 : 0)})`;
    ctx.beginPath(); ctx.ellipse(sx, sy, 110 * k + (this.state === 'circle' ? 40 : 0), 26 * k, 0, 0, TAU); ctx.fill();
  }
}

// ==================================================================================================== THE RUBY GEM
class GemZap {   // (a red mark on the floor, then a bolt from the gem down onto it)
  constructor(gem, x, y) { this.gem = gem; this.x = x; this.y = y; this.t = 0; }
}
// (the gem: up and shielded GEM_GUARD frames after each crack's dip; a dip of its own after GEM_SELFDIP unscratched)
const GEM_GUARD = 360, GEM_GUARD_COOP = 480, GEM_SELFDIP = 1500;   // (co-op: a longer guard -- launches come quicker)
export class RubyGem extends MMBoss {
  constructor(game, x, y, opt = {}) {
    const G = game.hooks?.gem;
    super(game, G?.x ?? x, y, opt, 'THE RUBY GEM', 'It Pulls Every String in the Hall', 180);
    this.art = null; this.scale = 1; this.w = 40; this.h = 74; this.flying = true; this.shadowR = 50; this.balloonH = 120; this.talkGap = 220;
    this.ownFinish = true;                  // (its LIGHTS OUT! is the finish: no generic KRAK! on top -- game.js onBossDefeated)
    // (the hook's y: a screen y -- 150 -- as a height over the floor at its depth)
    // (never so high its cracks hide under the HUD's bars: its top stays below ~y 150)
    this.zHome = Math.min(196, G && G.y > 100 ? Math.max(180, FLOOR_TOP + this.y - G.y) : 196);
    this.z = this.zHome; this.cracks = 0; this.cool = 120; this.spawnT = 60; this.zaps = []; this.hurtSfx = 'shield_block'; this.hurtPitch = 1.5;
    this.depthR = 40;                         // (a charged shot from a little in front of / behind its depth still reaches it)
    this.dipT = 0;                            // (after a crack it sinks low for a while: swords reach it)
    // (after that dip it rises SHIELDED while its knights re-form -- no crack lands until it glows again: GEM_GUARD; a
    //  post-crack dip can't crack it again either, dipCrack -- every crack is earned in the open, the fight 30-45 s in
    //  co-op, not 3; and a gem nobody has scratched for GEM_SELFDIP dips by itself: the swing-only kid's way in)
    this.guardT = 0; this.dipCrack = false;
    game.mmGem = this;
  }
  bossIntro() { this.set('glow'); audio.sfx('charge_hum', { pitch: 0.7 }); }
  bossFight() {
    this.set('float'); this.cool = 100;
    const g = this.game;
  }
  get open() { return this.state !== 'intro' && this.state !== 'glow' && this.state !== 'defeated'; }
  get usesLaunch() { return true; }
  /** up, glowing, unshielded: a launch (or a charged shot) cracks it now -- the launch ring shows only then */
  get launchOpen() { return this.state === 'float' && this.dipT <= 0 && this.guardT <= 0; }
  keyHint(nag = 0) {
    const m = this.game.mm, p = live(this.game)[0];
    // (the second nag: the SUPER too)
    const sup = nag >= 2 ? ` || Or use your SUPER: ${m.keyName('special', p)}!` : '';
    return ['mmgem', (m.canLaunch() ? "Roll into Dodongo's shield to fly up to the gem! || Or HOLD " + m.keyName('shoot', p) + ' for a charged shot!' : 'HOLD ' + m.keyName('shoot', p) + ' for a big charged shot! || Stand on the red ring!') + sup];
  }
  dmgOf(att, hd) {
    const g = this.game, m = g.mm;
    if (this.guardT > 0 && this.dipT <= 0) {   // (risen, shielded: its knights re-form -- nothing lands)
      if (!this._shT || g.frame - this._shT > 90) { this._shT = g.frame; g.fx.label(this.x, this.y, this.z + 60, 'SHIELDED!', '#ffd0d0', 24, 46); }
      return null;
    }
    if (att && att.team === 'hero' && m && this.launchOpen && (m.launchedHigh(att, 100, 90) || att._gemBonk === g.frame)) { att.launchedAt = 0; return Math.ceil(this.maxHp / 3); }   // (off the shield: a whole crack)
    if (hd.special || hd.team || hd.spell || hd.charged) return this.capDip(hd.dmg);
    if (this.dipT > 0 && att && att.team === 'hero') return this.capDip(hd.dmg);   // (dipped low: anything reaches)
    if (!this._highT || g.frame - this._highT > 90) { this._highT = g.frame; g.fx.label(this.x, this.y, this.z + 60, 'TOO HIGH!', '#ffd0d0', 24, 46); }
    if (!g.flags.hint_mmgem) { const H = this.keyHint(); m?.hint(H[0], H[1], 400, true); }
    return null;
  }
  /** a post-crack dip (and its guard) chips it, but never to the next crack: that one is earned up in the open */
  capDip(d) {
    if (!this.dipCrack) return d;
    const next = Math.round(this.maxHp * (1 - (this.cracks + 1) / 3)) + 1;
    return Math.max(0, Math.min(d, this.hp - next));
  }
  onDamage() {
    const g = this.game, k = 1 - this.hp / this.maxHp, n = Math.min(3, Math.floor(k * 3 + 1e-6));
    if (this.hp > 0 && n > this.cracks) {
      this.cracks = n;
      this.shout('CRACK!', '#ff9a9a', 44, this.z + 40);
      this.dipT = 240;                        // (it sinks, dazed: 4 s within reach)
      this.guardT = 240 + (live(g).length > 1 ? GEM_GUARD_COOP : GEM_GUARD); this.dipCrack = true;   // (then up, shielded, while the knights come back)
      this.spawnT = Math.min(this.spawnT, 40);
      this.game.fx.label(this.x, this.y, 150, 'HIT IT NOW!', '#ffe066', 30, 80);
      g.shake = Math.max(g.shake, 8); audio.sfx('break', { pitch: 0.8 });
      for (const a of g.actors) if (a.kv && a.alive && !a.down) a.daze?.(60);   // (the knights reel)
      g.stage.setGemLight?.(1 - n / 3);
    }
  }
  onZero() {
    const g = this.game;
    this.cracks = 3;
    g.mm?.line('lightsOut');
    this.shout('LIGHTS OUT!', '#ffffff', 52, this.z + 40);
    g.flashScreen = 0.6; g.shake = Math.max(g.shake, 16); audio.sfx('break', { pitch: 0.5 }); audio.sfx('hit_finisher', { pitch: 0.7 });
    g.fx.debris(this.x, this.y, this.z, ['#ff4a5a', '#c81e34', '#ffb0b8'], 16);
    g.stage.setGemLight?.(0);
    this.zaps = [];
    this.alive = false;                     // (the strings go: every knight falls)
    for (const a of g.actors) if (a.kv && a.alive) a.collapse?.();
    this.alive = true;
    this.defeat();
  }
  update() {
    const g = this.game;
    this.tick();
    if (this.cool > 0) this.cool--;
    if (this.ouch > 0) this.ouch--;
    if (this.dipT > 0) this.dipT--;
    if (this.guardT > 0 && --this.guardT === 0) {   // (its shield down: it glows -- launch-ready again)
      this.dipCrack = false;
      if (this.state === 'float') { g.fx.label(this.x, this.y, this.z + 70, 'IT GLOWS -- NOW!', '#ffe066', 28, 70); audio.sfx('charge_full', { pitch: 1.3, vol: 0.5 }); }
    }
    this.z += ((this.dipT > 0 && this.state === 'float' ? 130 : this.zHome) + Math.sin(g.time * 1.6) * 10 - this.z) * (this.dipT > 0 ? 0.12 : 0.08);
    if (this.state === 'defeated') { this.zHome = Math.max(20, this.zHome - 6); return; }
    this.nag();
    // nobody's scratched it for GEM_SELFDIP (a kid who only swings): it dips by itself -- and this dip can crack it
    if (this.state === 'float' && g.fighting && !g.cut && this.launchOpen && this.fightAt !== undefined && g.frame - Math.max(this.hurtAt ?? 0, this.fightAt, this.selfDipAt ?? 0) > GEM_SELFDIP) {
      this.selfDipAt = g.frame; this.dipT = 240; this.dipCrack = false;
      g.fx.label(this.x, this.y, 150, 'HIT IT NOW!', '#ffe066', 30, 80); audio.sfx('charge_hum', { pitch: 0.9, vol: 0.6 });
    }
    // a hero flying off Dodongo's shield who reaches it: CRACK (no swing needed -- the comic's beat, kid-sized)
    const m = g.mm;
    if (m && this.launchOpen && g.fighting && !g.cut) for (const q of g.players) {
      if (!m.launchedHigh(q, 110, 90) || Math.abs(q.x - this.x) > 84 || q.z + (q.h || 120) < this.z - 10) continue;
      q.launchedAt = 0; q.vz = Math.min(q.vz, 2); q.vx = (q.x < this.x ? -1 : 1) * 3; q._gemBonk = g.frame;
      g.fx.word(this.x, this.y, this.z + 30, true, 'BONK!');
      this.takeHit(q, { dmg: 0, kind: 'light', push: 0, stun: 0, stop: 6 });   // (dmgOf: a launched hero -- a whole crack)
    }
    if (this.state === 'glow' && this.st >= 60 && !g.cut) this.set('float');
    if (this.state !== 'float' || !g.fighting || g.cut) return;
    // the knights: on their strings, from the alcoves
    // (1P: one knight at a time -- two after the first crack; co-op: one more than the heroes)
    const n = live(g).length, maxK = n > 1 ? 1 + n : this.cracks >= 1 ? 2 : 1, knights = g.actors.filter((a) => a.kv && a.alive).length;
    if (--this.spawnT <= 0 && knights < maxK) {
      const A = g.hooks?.armour, side = Math.random() < 0.5 ? 'L' : 'R';
      g.spawn({ k: 'knight', v: pick(['sword', 'axe', 'halberd']), side: A ? side : side, y: rnd(lo(g) + 10, hi(g) - 10) });
      this.spawnT = n > 1 ? 240 : 360;
    }
    // its red bolts
    if (this.cool <= 0) {
      const q = pick(live(g));
      if (q) this.zaps.push(new GemZap(this, q.x, q.y));
      this.cool = rnd(170, 240);
      audio.sfx('charge_hum', { pitch: 1.8, vol: 0.4 });
    }
    for (const Z of this.zaps) {
      Z.t++;
      if (Z.t === 60) {
        audio.sfx('fire_small', { pitch: 0.6 }); g.shake = Math.max(g.shake, 4);
        for (const q of g.players) if (q.hittable && Math.hypot((q.x - Z.x) / 56, (q.y - Z.y) / 20) < 1 && q.z < 80) q.takeHit({ x: Z.x, team: 'foe', facing: 1 }, { dmg: 8, kind: 'light', push: 3, stun: 20, stop: 4, sfx: 'hit_light', spark: 'warm' });
      }
    }
    this.zaps = this.zaps.filter((Z) => Z.t < 76);
  }
  drawShadow() {}
  drawFloor(ctx) {
    const g = this.game;
    g.mm?.drawLaunchRing(ctx, this); launchCallout13(ctx, g, this);
    if (this.state !== 'defeated') {          // (its depth, marked: stand on the ring to hit it with a shot)
      const x = this.sx, y = FLOOR_TOP + this.y, k = 0.5 + 0.5 * Math.sin(g.time * 4);
      ctx.save(); ctx.strokeStyle = `rgba(255,70,90,${0.45 + 0.35 * k})`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(x, y, 90, 26, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = `rgba(255,60,80,${0.1 + 0.08 * k})`; ctx.fill(); ctx.restore();
    }
    for (const Z of this.zaps) {
      const x = Z.x - g.camX, y = FLOOR_TOP + Z.y, k = Math.min(1, Z.t / 60);
      ctx.strokeStyle = `rgba(255,60,70,${0.4 + 0.5 * k})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(x, y, 56, 20, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = `rgba(255,60,70,${0.15 * k})`; ctx.fill();
    }
  }
  draw(ctx) {
    const g = this.game, t = g.time, x = this.sx, y = this.sy - 40;
    // the bolts down from it
    for (const Z of this.zaps) if (Z.t >= 58 && Z.t < 70) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,90,90,0.9)'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(Z.x - g.camX + rnd(-8, 8), FLOOR_TOP + Z.y); ctx.stroke(); ctx.restore();
    }
    if (this.state === 'defeated' && this.st > 30) return;
    const s = this.state === 'defeated' ? Math.max(0, 1 - this.st / 30) : 1;
    drawWithFlash(ctx, x, y, this.flashAlpha, (c) => {
      c.scale(s, s);
      // its glow
      c.save(); c.globalCompositeOperation = 'lighter';
      const gl = c.createRadialGradient(0, 0, 6, 0, 0, 90); gl.addColorStop(0, `rgba(255,70,80,${0.55 - this.cracks * 0.12})`); gl.addColorStop(1, 'rgba(255,40,60,0)');
      c.fillStyle = gl; c.beginPath(); c.arc(0, 0, 90 + Math.sin(t * 4) * 6, 0, TAU); c.fill(); c.restore();
      // the faceted ruby
      const pts = [[0, -44], [30, -16], [24, 26], [0, 42], [-24, 26], [-30, -16]];
      c.beginPath(); pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py))); c.closePath();
      const rg = c.createLinearGradient(-30, -40, 30, 40); rg.addColorStop(0, '#ff8a96'); rg.addColorStop(0.45, '#e01e3a'); rg.addColorStop(1, '#7a0a1e');
      c.fillStyle = rg; c.fill(); c.lineWidth = 3.5; c.strokeStyle = INK; c.stroke();
      c.strokeStyle = 'rgba(255,200,210,0.7)'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(-30, -16); c.lineTo(0, -4); c.lineTo(30, -16); c.moveTo(0, -4); c.lineTo(0, 42); c.moveTo(-24, 26); c.lineTo(0, -4); c.lineTo(24, 26); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.ellipse(-10, -24, 6, 3, -0.6, 0, TAU); c.fill();
      // the cracks
      c.strokeStyle = '#2a0610'; c.lineWidth = 2.4;
      const CR = [[[-6, -40], [2, -20], [-8, -6], [4, 10]], [[22, -12], [10, 4], [16, 20]], [[-22, 20], [-8, 12], [-14, -4], [-26, -10]]];
      for (let i = 0; i < this.cracks; i++) { c.beginPath(); CR[i].forEach(([px, py], j) => (j ? c.lineTo(px, py) : c.moveTo(px, py))); c.stroke(); }
      if (this.guardT > 0 && this.dipT <= 0 && this.state === 'float') {   // (shielded: a pale bubble, flickering out at the end)
        const fade = this.guardT < 60 && (this.guardT >> 3) % 2 ? 0.4 : 1;
        c.save(); c.globalAlpha = (0.45 + 0.15 * Math.sin(t * 6)) * fade;
        c.fillStyle = 'rgba(255,214,228,0.18)'; c.strokeStyle = '#ffe2ec'; c.lineWidth = 3;
        c.beginPath(); c.arc(0, 0, 60, 0, TAU); c.fill(); c.stroke();
        c.lineWidth = 1.5; c.beginPath(); c.arc(-14, -18, 34, 3.6, 4.6); c.stroke(); c.restore();
      }
    });
  }
}

// ==================================================================================================== MORVATH
class GreenBolt extends EnemyShot {
  constructor(game, x, y, z, vx, vy) { super(game, x, y, z, vx > 0 ? 1 : -1); this.vx = vx; this.vy = vy; this.life = 140; this.w = 14; this.vzDrift = (70 - z) / 10; }
  update() {
    this.tick();
    if (this.st <= 10) this.z += this.vzDrift;   // (out of the skull up high, then down to the heroes' height)
    this.x += this.vx; this.y = clamp(this.y + this.vy, lo(this.game), hi(this.game));
    if (this.st % 2 === 0) this.game.fx.flames(this.x, this.y, this.z, 1, { green: true, scale: 0.6 });
    if (this.hitPlayers({ dmg: 9, kind: 'light', push: 3, stun: 18, stop: 4, sfx: 'hit_light', spark: 'green' }, 18, 12)) { this.gone = true; this.game.fx.spark(this.x, this.y, this.z, true, 'green'); return; }
    if (--this.life <= 0 || this.offscreen()) this.gone = true;
  }
  draw(ctx) {
    const x = this.sx, y = this.sy;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 2, x, y, 24); g.addColorStop(0, 'rgba(235,255,220,1)'); g.addColorStop(0.4, 'rgba(120,255,110,0.9)'); g.addColorStop(1, 'rgba(40,200,70,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 24, 0, TAU); ctx.fill(); ctx.restore();
  }
}
/** the stolen staff, hanging in the air: BLAST it (the dragon's fire -- any hero's hit counts, the dragon's breaks it) */
// (the painted staff: drawn STAFF_K x its pack -- 441 px tall at 1x, Morvath's own staff; ~220 px here, a little over the
//  stand-in's -- hung and swayed about its MID export, the visual centre, on the target's point)
const STAFF_K = 0.5, STAFF_SNAP = 8;
class StaffTarget extends Enemy {
  constructor(game, x, y, boss) {
    super(game, x, y, { name: 'THE STAFF' });
    this.boss0 = boss; this.team = 'foe'; this.hp = this.maxHp = 1; this.z = 130; this.w = 30; this.h = 120; this.hz0 = -30;
    this.flying = true; this.entered = true; this.shadowR = 24; this.hits = 0; this.score = 0;
    this.noAttackHint = true;               // (not the stage's 'Press [J] to attack!': mmblast says what to do)
    if (CHARS.morvath_staff?.ATLAS_SCALE) this.art = 'morvath_staff';   // (the painted staff -- else the stand-in drawing below)
    this.set('hang');
  }
  get boss() { return false; }
  get hittable() { return this.alive && this.state === 'hang'; }
  takeHit(att, hd) {
    if (!this.hittable) return false;
    const g = this.game, byDragon = att && att.heroId === 'dragon';
    this.hits += byDragon ? 3 : 1; this.flash = 6;
    g.fx.spark(this.x, this.y, this.z + 40, true, 'green');
    audio.sfx('shield_block', { pitch: 1.3 });
    if (this.hits >= 3) this.boss0.staffBroken(this);
    void hd;
    return true;
  }
  update() {
    this.tick();
    this.z += (130 + Math.sin(this.game.time * 2) * 10 - this.z) * 0.1;
    if (this.state === 'gone' && this.onBurst && this.st >= (this.burstAt || 0)) { const f = this.onBurst; this.onBurst = null; f(); }   // (the snap: Morvath's staffBroken)
    if (this.state === 'gone' && this.st > 30) this.gone = true;
  }
  draw(ctx) {
    const g = this.game, x = this.sx, y = this.sy, t = g.time, S = this.art === 'morvath_staff' ? CHARS.morvath_staff : null;
    if (S) {                                 // (the painted staff: its flame's flicker; broken, the snap -- 'gone' for 30 frames)
      if (this.state === 'gone' && this.st > 30) return;
      const pose = this.state === 'gone' ? this.anim('break', Math.min(1, this.st / 30)) : this.anim('idle', t);
      ctx.save(); ctx.translate(x, y); ctx.rotate(this.state === 'gone' ? 0 : Math.sin(t * 1.5) * 0.1);
      const butt = -(S.EXPORTS?.MID?.[1] ?? -216) * STAFF_K;
      if (this.state !== 'gone') {           // (a soft green halo behind the skull: the thin staff reads as the target)
        const sy = butt + (S.EXPORTS?.SKULL?.[1] ?? -360) * STAFF_K, gl = ctx.createRadialGradient(0, sy, 2, 0, sy, 45);
        gl.addColorStop(0, `rgba(150,255,120,${0.35 + 0.08 * Math.sin(t * 5)})`); gl.addColorStop(1, 'rgba(60,255,80,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, sy, 45, 0, TAU); ctx.fill();
      }
      drawWithFlash(ctx, 0, butt, this.flashAlpha, (c) => S.draw(c, pose, { facing: this.facing || 1, t, scale: STAFF_K }));
      ctx.restore();
    } else {
    if (this.state === 'gone') return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 1.5) * 0.2);
    ctx.fillStyle = '#4a3a2e'; ctx.strokeStyle = INK; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.rect(-4, -80, 8, 150); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8e2d2'; ctx.beginPath(); ctx.ellipse(0, -92, 15, 13, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    const gl = ctx.createRadialGradient(0, -100, 2, 0, -100, 40); gl.addColorStop(0, 'rgba(190,255,150,0.9)'); gl.addColorStop(1, 'rgba(60,255,80,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, -100, 40, 0, TAU); ctx.fill();
    ctx.restore();
    }
    if (this.state !== 'gone' && (t * 2) % 2 < 1.4) {   // the prompt
      const d = g.players.find((q) => !q.out && q.heroId === 'dragon');
      HUDlabel(ctx, d && g.players.length > 1 ? `P${d.slot + 1}: BLAST THE STAFF!` : 'BLAST THE STAFF!', x, Math.max(y - 150, (g._hudBottom || 0) + 20));   // (y is its screen y, its height in it already; never up in the HUD band)
    }
  }
}
/** his shoulder crow, off and away when he shrinks (not a foe: just a bird going home) */
class FlyAway {
  constructor(game, x, y, z, dir) { this.game = game; this.x = x; this.y = y; this.z = z; this.facing = dir; this.t = 0; this.team = 'fx'; this.alive = false; this.w = 0; this.h = 0; }
  get sx() { return this.x - this.game.camX; }
  get sy() { return FLOOR_TOP + this.y - this.z; }
  update() { this.t++; this.x += this.facing * 4; this.z += 2.6; if (this.t > 160) this.gone = true; }
  drawShadow() {}
  draw(ctx) {
    const C = CHARS.storm_crow;
    if (!C?.ANIM?.fly) return;
    ctx.save(); ctx.translate(this.sx, this.sy);
    C.draw(ctx, C.ANIM.fly(this.game.time * 1.3), { facing: this.facing, t: this.game.time, scale: 0.8, mem: {} });
    ctx.restore();
  }
}
function HUDlabel(ctx, text, x, y) {
  ctx.save(); ctx.font = 'bold 26px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.strokeText(text, x, y); ctx.fillStyle = '#ffe066'; ctx.fillText(text, x, y); ctx.restore();
}

// (the painted Morvath, drawn MORV_K of his pack's size -- ~340 px to his crown, the horned skull on his staff ~400 in idle --
//  with his feet no further back than MORV_BACK: the idle skull and his face stay on screen, clear of the HUD)
const MORV_K = 0.9, MORV_BACK = 50, MORV_P2 = 0.2;
export class Morvath extends MMBoss {
  /** his face, for the speech balloons to keep beside (src/fx.js drawBalloon): heights over his feet and its x, from the drawing's own 'head' /
   *  'mouth' -- since the model round his 1.25x head tops out under the HUD band, where a balloon over him lands (both critics, painter 1) */
  get balloonFace() {
    if (this.state === 'crow') return null;
    const C = CHARS[this.art], P = C?.point && this.pose(), hd = P && C.point(P, 'head'), m = P && C.point(P, 'mouth'), s = this.scale || 1;
    if (!hd) return null;
    return { x: this.x + (this.facing || 1) * hd[0] * s, top: -hd[1] * s + 62, bottom: -(m ? m[1] : hd[1] + 40) * s - 30, hw: 52 };
  }
  constructor(game, x, y, opt = {}) {
    super(game, x, y, opt, 'MORVATH', 'The Storm Wizard of Mystic Mountain', 480);
    this.colossal = true;
    this.art = 'morvath'; this.scale = CHARS.morvath?.ATLAS_SCALE ? MORV_K : 1; this.w = 46; this.h = 270; this.shadowR = 70; this.balloonH = 320; this.talkGap = 280;
    this.phase = 1; this.cool = 90; this.lanes = null; this.chain = null; this.staff = true; this.crow = true;
    this.hurtSfx = 'hit_heavy'; this.hurtPitch = 0.7;
  }
  bossIntro() { this.set('roar'); audio.sfx('roar', { pitch: 0.6 }); }
  /** a landmark of his drawing at his draw scale (local px, facing right) -- null where the pose has none */
  lmk(name, pose = this.pose()) { const P = CHARS[this.art]?.point?.(pose, name); return P ? [P[0] * this.scale, P[1] * this.scale] : null; }
  bossFight() { this.set('float'); this.cool = 70; this.game.mm?.line('climbDown'); }
  get open() { return !['intro', 'roar', 'shift', 'transform', 'staffless', 'shrink', 'crow', 'defeated'].includes(this.state); }
  dmgOf(att, hd) {
    const g = this.game;
    if (this.state === 'stagger') {         // (worn down: a hero's swing steals the staff)
      if (att && att.team === 'hero' && att.heroId !== 'dragon') { this.steal(att); return 0; }   // (any hit of a friend's: a swing, a shot)
      return Math.round(hd.dmg * 0.3);
    }
    if (this.chain) { this.chainHurt = (this.chainHurt || 0) + hd.dmg; if (this.chainHurt >= 26) this.endChain(false); }
    // (the dragon's phase: Morvath takes MORV_P2 of every hit -- 25-40 s of being the dragon, not 5)
    return this.phase === 2 ? Math.max(1, Math.round(hd.dmg * MORV_P2)) : hd.dmg;
  }
  onDamage() {
    const g = this.game, k = this.hp / this.maxHp;
    if (this.phase === 1 && k <= 0.4) { this.hp = Math.round(this.maxHp * 0.4); this.startShift(); return; }
    if (this.phase === 2 && k <= 0.15 && this.state !== 'stagger') { this.hp = Math.round(this.maxHp * 0.15); this.startStagger(); }
    void g;
  }
  onZero() { this.hp = 1; }                 // (never to 0 by hits: the staff ends it)
  // ---------------------------------------------------------------- the dragon
  startShift() {
    const g = this.game;
    this.endChain(false); this.lanes = null; this.releaseToken();
    this.set('shift'); this.inv = 99999; this.vx = this.vy = 0;
    g.shake = Math.max(g.shake, 8); audio.sfx('roar', { pitch: 0.8 });
  }
  /** how far back he may float (painted): his crown clear of the screen's top and -- as far as the floor allows -- of
   *  the HUD band (the co-op bars sit deeper: his face under them, not his crown's tips) */
  get backY() { return Math.max(MORV_BACK, Math.min(100, (this.game._hudBottom ?? 84) - 8)); }
  transform() {
    const g = this.game, run = g.app.run;
    let slot = g.players.findIndex((p) => !p.out && baseOf(p.heroId) === 'dodongo');
    if (slot < 0) slot = Math.max(0, g.players.findIndex((p) => !p.out));
    const p = g.players[slot];
    if (p && p.heroId !== 'dragon') {
      run.mmDragon = { slot, from: p.heroId };
      run.heroes[slot] = 'dragon';
      const np = g.swapHero(slot, 'dragon', true);
      if (np) {
        np.hp = np.maxHp; np.meter = Math.max(np.meter || 0, 100);
        // (the big dragon steps to the front: in front of his friends, never hidden behind them)
        const front = Math.max(np.y, ...g.players.filter((q) => q !== np && !q.out).map((q) => q.y + 18));
        np.y = clamp(front, lo(g), hi(g));
      }
      g.app.refreshLevelArt?.();               // (the dragon now a hero in play: its pack at a hero's scale, Dodongo's own released)
    }
    const d = g.players[slot];
    g.flashScreen = 0.8; g.flashAt = { x: d.x, y: d.y, z: 90 }; g.shake = Math.max(g.shake, 14);
    g.fx.rays?.(d.x, d.y, 90, '#ffb02e', 300, 40);
    g.fx.label(d.x, d.y, 230, 'DRAGON DODONGO!', '#ffb02e', 46, 100);
    if (run.mmDragon && baseOf(run.mmDragon.from) !== 'dodongo') g.fx.label(d.x, d.y, 186, "DODONGO'S DRAGON POWER -- FOR EVERYONE!", '#ffe9a0', 22, 140);
    audio.jingle('freed_big');
    this.phase = 2; this.inv = 30; this.set('float'); this.cool = 90;
    // (the dragon's controls, said once -- in its player's keys, or the touch buttons)
    const K = (a) => g.mm?.keyName(a, d) || a;
    g.mm?.hint('mmdragon', `You're a DRAGON! ${K('attack')} fire bite, ${K('shoot')} fireball! || HOLD ${K('shoot')}: a flame! ${K('special')}: DRAGON INFERNO!`, 330, true);
  }
  defeat() {
    super.defeat();
    const run = this.game.app.run, D = run.mmDragon;   // (the run's hero list is Dodongo again; he stays a dragon for the ending)
    if (D) { if (run.heroes[D.slot] === 'dragon') run.heroes[D.slot] = D.from; run.mmDragon = null; }
  }
  // ---------------------------------------------------------------- the staff
  startStagger() {
    const g = this.game;
    this.endChain(false); this.lanes = null; this.releaseToken();
    this.set('stagger'); this.vx = this.vy = 0; this.dizzyUntil = g.frame + 9999;
    const others = live(g).filter((q) => q.heroId !== 'dragon');
    if (others.length) this.shout('STEAL THE STAFF!', '#ffe066', 36, 220);
    g.mm?.hint('mmstaff', others.length ? 'He\'s dizzy! Run up and hit him to STEAL THE STAFF!' : 'He\'s dizzy! Get ready...', 300);
  }
  steal(by) {
    const g = this.game;
    if (this.state !== 'stagger') return;
    this.staff = false; this.dizzyUntil = 0;
    this.art = 'morvath_nostaff';             // (the painted builder's empty-handed pack: idle, stagger, grab, hurt, shrink)
    this.set('staffless');
    g.mm?.line('giveBack');
    const x = clamp(this.x - this.facing * -200, g.camX + 160, g.camX + W - 160);
    this.staffT = new StaffTarget(g, by ? clamp(by.x, g.camX + 120, g.camX + W - 120) : x, clamp(by ? by.y : this.y, lo(g), hi(g)), this);
    g.actors.push(this.staffT);
    g.fx.label(this.staffT.x, this.staffT.y, 260, by ? 'GOT IT!' : 'SHADOW!', '#c04ad8', 34, 70);
    if (!by) g.fx.label(this.staffT.x, this.staffT.y, 220, '...', '#e8dcff', 26, 70);
    audio.sfx('swing_heavy', { pitch: 1.4 });
    if (!by) for (let i = 0; i < 10; i++) g.fx.add({ type: 'star', x: this.x + rnd(-200, 200), y: this.y, z: rnd(40, 200), vx: 18, vz: 0, life: 18, r: 3, col: '#c04ad8' });   // (a shadow streaks past: Shadow, of course)
    if (g.players.some((q) => baseOf(q.heroId) === 'ana')) g.mm?.line('blastNow');
    // (the steal done: its hint and its STEAL THE STAFF! word go -- the BLAST one takes over)
    g.mm?.clearHint('mmstaff'); g.fx.list = g.fx.list.filter((q) => !(q.type === 'word' && q.text === 'STEAL THE STAFF!'));
    const d = g.players.find((q) => q.heroId === 'dragon');
    g.mm?.hint('mmblast', `BLAST THE STAFF! ${d ? 'Breathe your dragon fire at it!' : 'Hit it!'}`, 300, true);   // (forced: over the 'dizzy' one, whatever the gap)
  }
  staffBroken(st) {
    const g = this.game;
    st.set('gone'); st.alive = false;
    const D = g.app.run.mmDragon;   // (Anastasia in the party -- or Anastasia who became the dragon, alone)
    const ana = g.players.some((q) => !q.out && baseOf(q.heroId) === 'ana') || (D && baseOf(D.from) === 'ana');
    const burst = () => {
      g.flashScreen = 0.9; g.flashAt = { x: st.x, y: st.y, z: st.z }; g.shake = Math.max(g.shake, 18);
      g.fx.rays?.(st.x, st.y, st.z, ana ? '#dff6ff' : '#ffb02e', 340, 40);
      if (ana) g.fx.rays?.(st.x, st.y, st.z, '#9fd8ff', 240, 30);
      g.fx.label(st.x, st.y, st.z + 80, 'KRA-KOOM!', ana ? '#dff6ff' : '#ffd23a', 56, 90);
      audio.sfx('hit_finisher', { pitch: 0.5 });
    };
    // (the painted staff's break clip: its glowing cracks first, unflashed -- the flash, the rays and KRA-KOOM! at the
    //  snap, STAFF_SNAP frames in; the stand-in has no clip: at once)
    if (st.art === 'morvath_staff') { st.onBurst = burst; st.burstAt = STAFF_SNAP; } else burst();
    g.mm?.clearHint('mmstaff', 'mmblast');   // (the staff is gone: nothing left to steal or blast)
    audio.sfx('break', { pitch: 0.6 });
    this.set('shrink'); this.inv = 99999;
  }
  // ---------------------------------------------------------------- chains
  endChain(hurt) {
    if (!this.chain) return;
    const p = this.chain.p;
    this.chain = null; this.chainHurt = 0;
    freeHero(p, hurt);
    if (this.alive && this.state === 'chain') { this.set('tired'); }
  }
  update() {
    const g = this.game, p = this.player;
    this.tick();
    if (this.cool > 0) this.cool--;
    if (this.ouch > 0) this.ouch--;
    const bob = Math.sin(g.time * 1.4) * 6;
    switch (this.state) {
      case 'intro': break;
      case 'roar': if (this.st >= 90 && !g.cut) this.set('float'); break;
      case 'float': {
        const side = this.x < p.x ? -1 : 1;
        const tx = clamp(p.x + side * 220, g.camX + 120, g.camX + W - 120), ty = clamp(p.y + bob, CHARS.morvath?.ATLAS_SCALE ? Math.max(lo(g), this.backY) : lo(g), hi(g));   // (painted: never so far back his crown leaves the screen)
        this.moveTo(tx, ty, this.phase > 1 ? 2.2 : 1.8, 1.2); this.face(p);
        if (this.cool <= 0 && g.fighting && !g.cut && !p.down) {
          const r = Math.random(), held = g.players.some((q) => q.mmHeld);
          this.vx = this.vy = 0;
          if (r < 0.34) { this.set('castWind'); this.pickLanes(); audio.sfx('charge_hum', { pitch: 0.6, vol: 0.7 }); }
          else if (r < 0.72 || held || live(g).length < 2 && r < 0.85) { this.set('blastWind'); this.face(p); g.fx.alert(this); }
          else { this.set('chainWind'); this.face(p); g.fx.alert(this); audio.sfx('charge', { pitch: 0.7 }); }
        }
        break;
      }
      case 'castWind': this.vx = this.vy = 0;
        // (a hero standing in a marked lane: MOVE! over them -- at the start and again halfway)
        if ((this.st === 2 || this.st === 32) && this.lanes) for (const q of g.players) if (!q.out && q.alive && this.lanes.some(([a, b]) => q.y >= a && q.y <= b)) g.fx.label(q.x, q.y, 200, 'MOVE!', '#b6ff8a', 28, 34);
        if (this.st >= 60) { this.set('cast'); g.shake = Math.max(g.shake, 8); audio.sfx('fire_breath', { pitch: 0.5 }); this.hitSet = new Set(); } break;
      case 'cast':                          // (green lightning down the marked lanes)
        if (this.lanes) for (const q of g.players) {
          if (!q.hittable || this.hitSet.has(q) || q.z > 110) continue;
          if (this.lanes.some(([a, b]) => q.y >= a && q.y <= b)) { this.hitSet.add(q); q.takeHit({ x: q.x - 1, team: 'foe', facing: 1 }, { dmg: 10, kind: 'knock', push: 3, lift: 6, stop: 6, sfx: 'hit_heavy', spark: 'green' }); }
        }
        if (this.st >= 24) { this.lanes = null; this.set('tired'); }
        break;
      case 'blastWind': this.vx = this.vy = 0; if (this.st >= 30) this.set('blast'); break;
      case 'blast':
        if (this.st === 7) {                   // (the thrust: the skull comes forward -- the bolt leaves it there)
          const T = this.lmk('staffTip', this.anim('blast', 7 / 24)) || [120, -220];
          const sx = this.x + this.facing * T[0], sz = Math.max(60, -T[1]);
          const dx = p.x - sx, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1, sp = this.phase > 1 ? 7.5 : 6.5;
          g.actors.push(new GreenBolt(g, sx, this.y, sz, (dx / d) * sp, (dy / d) * sp * 0.5));
          if (this.phase > 1) g.actors.push(new GreenBolt(g, sx, this.y, sz, (dx / d) * sp, (dy / d) * sp * 0.5 + 0.8));
          audio.sfx('fireball_breath', { pitch: 0.7 });
        }
        if (this.st >= 24) this.set('tired');
        break;
      case 'chainWind': this.vx = this.vy = 0;
        if (this.st % 3 === 0) {               // (green crackle at the claw as it winds up)
          const Hd = this.lmk('hand') || [-20, -200];
          g.fx.add({ type: 'star', x: this.x + this.facing * Hd[0] + rnd(-12, 12), y: this.y, z: -Hd[1] + rnd(-12, 12), vz: rnd(-0.5, 0.8), life: 12, r: rnd(2, 4), col: '#9dff7a' });
        }
        if (this.st >= 40) {
          const q = live(g).filter((a) => !a.mmHeld && !a.down && a.hittable && !['dodge', 'special', 'portal'].includes(a.state) && a.heroId !== 'dragon').sort((a, b) => Math.abs(a.x - this.x) - Math.abs(b.x - this.x))[0];
          if (q) { grabHero(q); this.chain = { p: q, t: 0, mash: 0 }; this.chainHurt = 0; this.set('chain'); audio.sfx('charge_hum', { pitch: 1.2 }); g.mm?.hint('mmchain', 'A lightning chain! Hit Morvath to break it -- or mash ATTACK!'); }
          else this.set('tired');
        }
        break;
      case 'chain': {
        const C = this.chain;
        if (!C) { this.set('tired'); break; }
        if (!g.players.includes(C.p)) { this.endChain(false); break; }   // (CHANGE HERO: that hero isn't here any more)
        C.t++;
        C.p.z = Math.min(110, C.p.z + 3);
        if (mashed(g, C.p) && ++C.mash >= 12) { this.shout('BROKE FREE!', '#9dff8a', 30); this.endChain(false); break; }
        if (C.t >= 200) this.endChain(true);
        break;
      }
      case 'tired': this.vx *= 0.8; this.vy *= 0.8; if (this.st >= (this.phase > 1 ? 45 : 60)) { this.set('float'); this.cool = rnd(50, 90) / (this.phase > 1 ? 1.3 : 1); } break;
      case 'shift':                          // (~40%: the dragon -- mm_dragon (the world waits under it), then the change)
        this.vx = this.vy = 0;
        if (this.st === 40) this.shiftStory = !!g.mm?.story(g.L.mid, () => this.set('transform'));
        if (this.st >= 400) this.set('transform');   // (never stuck)
        break;
      case 'transform': {
        const busy = g.players.some((q) => !q.out && q.state === 'special');
        if (busy && this.st < 300) { this.st = 0; break; }   // (anyone's super plays out first)
        if (this.st === 1 || (this.st > 1 && !this.transformed)) { this.transformed = true; if (!this.shiftStory) g.mm?.line('hurtFriends'); this.transform(); }
        break;
      }
      case 'stagger': this.vx = this.vy = 0;
        if (this.st === 70 && !live(g).some((q) => q.heroId !== 'dragon')) this.steal(null);   // (no one but the dragon: Shadow, out of nowhere)
        if (this.st >= 480) { this.steal(null); }   // (no one's come for it: Shadow, out of nowhere)
        break;
      case 'staffless': this.vx = this.vy = 0; break;
      case 'shrink':
        if (this.st === 1) { audio.sfx('poof', { pitch: 0.5 }); }
        if (this.st === 45 && this.crow) {      // (k 0.5: his shoulder crow flies off -- away from all this, for good)
          this.crow = false;
          const C = this.lmk('crow') || [-22, -224];
          g.actors.push(new FlyAway(g, this.x + this.facing * C[0], this.y, -C[1], -this.facing));
          audio.sfx('whelp_chirp', { pitch: 1.1 });
        }
        if (this.st >= 90) { this.set('crow'); this.balloonH = CHARS.morvath_crow?.ATLAS_SCALE ? 96 : 60; this.shadowR = 26;   // (the painted crow's balloon over its crown, not on it; a crow-sized shadow)
        g.mm?.line('caw'); audio.sfx('whelp_chirp', { pitch: 0.7 }); this.crowZ = 0; this.defeat(); }
        break;
      case 'defeated': {                     // (the crow: hops, flaps, CAW?!; the tower falls, the sun comes back)
        this.crowZ = Math.abs(Math.sin(this.st * 0.12)) * 18;
        g.stage.setTowerFall?.(Math.min(1, this.st / 200));
        g.stage.setStorm?.(Math.max(0, 1 - this.st / 200));
        break;
      }
    }
    this.x += this.vx; this.y += this.vy;
    this.clampDepth();
    if (this.state !== 'intro') this.x = clamp(this.x, g.camX + 80, g.camX + W - 80);
  }
  pickLanes() {
    const g = this.game, a = lo(g), b = hi(g), span = (b - a) / 3, n = live(g).length > 1 ? 2 : pick([1, 2]);
    const all = [0, 1, 2].map((i) => [a + i * span, a + (i + 1) * span]);
    const out = []; while (out.length < n) { const L = pick(all); if (!out.includes(L)) out.push(L); }
    this.lanes = out;
  }
  drawFloor(ctx) {
    const g = this.game;
    if (!this.lanes) return;
    const k = this.state === 'castWind' ? Math.min(1, this.st / 60) : 1;
    for (const [a, b] of this.lanes) {
      const y0 = FLOOR_TOP + a, y1 = FLOOR_TOP + b;
      // (polish: a strong pulse -- the floor is green-grey, a faint tint got lost on it -- and bright chevrons along it)
      const pulse = 0.5 + 0.5 * Math.sin(g.time * 12);
      ctx.fillStyle = this.state === 'cast' ? 'rgba(160,255,130,0.5)' : `rgba(120,255,90,${0.22 + 0.3 * k * pulse})`;
      ctx.fillRect(0, y0, W, y1 - y0);
      ctx.strokeStyle = `rgba(200,255,150,${0.75 + 0.25 * pulse})`; ctx.lineWidth = 3 + 2 * k; ctx.strokeRect(-6, y0, W + 12, y1 - y0);
      if (this.state === 'castWind') {
        ctx.save(); ctx.globalAlpha = 0.35 + 0.5 * k * pulse; ctx.fillStyle = '#eaffd8'; const ym = (y0 + y1) / 2, hh = Math.min(10, (y1 - y0) * 0.3);
        for (let x = -((g.time * 90) % 80); x < W; x += 80) { ctx.beginPath(); ctx.moveTo(x, ym - hh); ctx.lineTo(x + 14, ym); ctx.lineTo(x, ym + hh); ctx.lineTo(x + 6, ym); ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }
    }
  }
  drawOverMM(ctx) {
    const g = this.game, t = g.time;
    if (this.state === 'cast' && this.lanes) {   // (the bolts down the lanes)
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(170,255,140,0.9)'; ctx.lineWidth = 4;
      for (const [a, b] of this.lanes) for (let i = 0; i < 6; i++) {
        const x = ((i * 173 + this.st * 37) % W), y = FLOOR_TOP + (a + b) / 2;
        ctx.beginPath(); ctx.moveTo(x, 0); for (let s = 1; s <= 6; s++) ctx.lineTo(x + rnd(-18, 18), (y * s) / 6); ctx.stroke();
      }
      ctx.restore();
    }
    if (this.chain) this.drawMash(ctx, this.chain.p);
    if (this.chain) {                          // (the lightning chain from his hand to the hero he holds)
      const q = this.chain.p, Hd = this.lmk('hand') || [-20, -200];
      const hx = this.sx + this.facing * Hd[0], hy = this.sy + Hd[1];
      const qx = q.sx, qy = q.sy - 70;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(150,255,120,0.9)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(hx, hy);
      for (let s = 1; s < 10; s++) ctx.lineTo(lerp(hx, qx, s / 10) + Math.sin(t * 30 + s) * 6, lerp(hy, qy, s / 10) + Math.cos(t * 27 + s) * 6);
      ctx.lineTo(qx, qy); ctx.stroke(); ctx.restore();
    }
  }
  pose() {
    const g = this.game;
    switch (this.state) {
      case 'roar': return this.anim('roar', Math.min(1, this.st / 90));
      case 'float': return this.anim(Math.abs(this.vx) > 0.6 ? 'walk' : 'idle', g.time);
      case 'castWind': return this.anim('cast', Math.min(0.4, this.st / 60));
      case 'cast': return this.anim('cast', 0.4 + 0.6 * Math.min(1, this.st / 12));
      case 'blastWind': return this.anim('blastWind', Math.min(1, this.st / 30));
      case 'blast': return this.anim('blast', Math.min(1, this.st / 24));
      case 'chainWind': return this.anim('chainWind', Math.min(1, this.st / 40));
      case 'chain': return this.anim('chain', g.time);
      case 'shift': case 'transform': case 'stagger': return this.anim('stagger', g.time);
      case 'staffless': return this.anim('grab', (this.st % 60) / 60);
      case 'shrink': return this.anim('shrink', Math.min(1, this.st / 90));
      case 'tired': return this.anim('idle', g.time);
      default: return this.anim('idle', g.time);
    }
  }
  drawOpts() { return { ...super.drawOpts(), staff: this.staff, crow: this.crow }; }
  /** (the painted staff: its flame flickers and sheds wisps -- the code rig draws its own fire) */
  drawFlame(ctx) {
    if (!this.staff || !CHARS.morvath?.ATLAS_SCALE || this.state === 'defeated') return;
    const g = this.game, T = this.lmk('staffTip');
    if (!T) return;
    const x = this.sx + this.facing * T[0], y = this.sy + T[1], fl = 0.8 + 0.2 * Math.sin(g.time * 23) * Math.sin(g.time * 7);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createRadialGradient(x, y - 8, 2, x, y - 8, 34 * fl); gr.addColorStop(0, 'rgba(220,255,200,0.75)'); gr.addColorStop(0.5, 'rgba(120,255,100,0.35)'); gr.addColorStop(1, 'rgba(60,255,80,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y - 8, 34 * fl, 0, TAU); ctx.fill(); ctx.restore();
    if (g.frame % 7 === 0) g.fx.add({ type: 'star', x: this.x + this.facing * T[0] + rnd(-6, 6), y: this.y, z: -T[1] + 10, vz: rnd(0.8, 1.6), life: 26, r: rnd(2, 4), col: '#b8ff9a' });
  }
  draw(ctx) {
    if (this.state === 'defeated' || this.state === 'crow') {   // (the tiny crow)
      const C = CHARS.morvath_crow || CHARS.storm_crow;
      if (!C) return;
      const A = C.ANIM || {}, f = this.st % 90 < 30 ? A.caw : A.hop, pose = typeof f === 'function' ? f(this.st % 90 < 30 ? (this.st % 90) / 30 : this.game.time) : f || {};
      drawWithFlash(ctx, this.sx, this.sy - (this.crowZ || 0), 0, (c) => C.draw(c, pose, { facing: this.facing, t: this.game.time, scale: 1.1, variant: 'morvath', mem: this.mem }));
      return;
    }
    super.draw(ctx);
    this.drawFlame(ctx);
  }
}
void H; void drawTinted;
