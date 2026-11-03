// SKULL ISLAND's bosses (docs/SKULL_ISLAND.md, src/silevels.js).  Phase 1: CAPTAIN BLUNDERBEARD, the Blue Gull's master -- a very
// tall, thin, bony pantomime pirate with a cutlass, a crew whistle and a purple conch horn from his master, Malachar.
//   Phase 1 (100%..50%): a long-reach LUNGE (a red lane on the floor first: step out of it sideways, or roll), a low sweeping
//     SLASH (a ring on the floor: JUMP it), and the CREW WHISTLE (he calls two sailors in -- and stands whistling: hit him!).
//     Enough hits and he goes DIZZY (a free flurry).
//   At 50%: SCARLET SWINGS IN on a rope (src/siworld.js: an AI helper, or a free pad's own seat), cutlasses clang, and the
//     fight goes on a little faster with her beside the heroes.
//   At ~24%: she flicks his cutlass away -- "Drop your sword, Blunderbeard! ...Oh. You already did." -- the crew is bowled
//     over, and he blows the PURPLE CONCH: the deck shakes and a tentacle rises at the rail.  (No one is killed: the stage
//     ends on that cliffhanger -- the Kraken is the next stage.)
// He can never be brought below 6% by damage: the finish is the scripted beat above.  Co-op scaling: World.begin / spawn.
import { Enemy, CHARS } from './enemies.js';
import { Actor } from './actors.js';
import { audio } from './audio-proxy.js';
import { W, DEPTH, FLOOR_TOP, INK } from './config.js';
import { clamp, TAU } from './rig.js';
import * as SIFX from './sifx.js';   // (the boss-defeat beat: the FX agent's)

/** how many drawings a character's clip has (0: no painted clip) -- the code stop-gaps of the anim audit (#8 / #12 / #15) switch
 *  themselves off once the painter's fuller clip lands; cached per loaded module */
const CLIPN = new Map();
export function clipDrawings(art, clip) {
  const M = CHARS[art], f = M?.ANIM?.[clip]; if (!M?.ATLAS_SCALE || f === undefined) return 0;
  const key = art + '|' + clip, c = CLIPN.get(key); if (c && c.m === M) return c.n;
  const seen = new Set(); for (let i = 0; i <= 360; i++) { const p = typeof f === 'function' ? f(i / 40) : f; if (p && p.s3d >= 0.5) seen.add(p['f_' + p.clip]); }
  CLIPN.set(key, { m: M, n: seen.size }); return seen.size;
}

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const lo = (g) => (g.lane ? g.lane[0] : 6), hi = (g) => (g.lane ? g.lane[1] : DEPTH - 6);
const live = (g) => g.players.filter((p) => !p.out && p.alive);
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** flash safety: a telegraph's last-moment urgency is a smooth ~1.9 Hz pulse (0.55..1), never an on/off blink */
const pulse = (n) => 0.775 + 0.225 * Math.cos(n * 0.2);

/** flash safety (Book 2: the Storm Sea ride's rule; Book 1's troll strobed under a mashing party): a big foe's hit flash is a soft white
 * tint -- ramped in over 3 frames, at most 0.2, at most once per 96 frames, none with reduced motion.  The hit word, the spark, the shake
 * and the ouch face carry every other hit.  (SIBoss and the palace's feelings: `get flashAlpha() { return siSoftFlash(this); }`) */
export function siSoftFlash(a) {
  const f = a.game?.frame ?? 0;
  if (a.flash >= 4 && f - (a._flashF ?? -1e9) >= 96) a._flashF = f;
  const d = f - (a._flashF ?? -1e9);
  if (REDUCED || d >= 9) return 0;
  return 0.2 * (d < 3 ? (d + 1) / 3 : 1 - (d - 3) / 6);
}

// ------------------------------------------------------------------------------------------------ the boss base
export class SIBoss extends Enemy {
  constructor(game, x, y, opt, name, title, hp) {
    super(game, x, y, { name });
    this.title = title;
    this.hp = this.maxHp = opt.hp || hp;
    this.entered = true; this.facing = -1; this.score = 15000; this.home = { x, y };
    this.heavy = true; this.ouch = 0;
    this.set('intro');
  }
  get boss() { return true; }
  get flashAlpha() { return siSoftFlash(this); }   // (a soft, rate-limited hit flash: siSoftFlash)
  get freedNow() { return false; }   // (no golden glow: the fight ends on a cliffhanger, not a freeing)
  get open() { return true; }
  get hittable() { return this.alive && this.inv <= 0 && this.game.fighting && !this.game.cut && this.open; }
  /** the damage a hit does (null: it doesn't land at all) */
  dmgOf(att, hd) { void att; return hd.dmg; }
  onDamage() {}
  onZero() { this.defeat(); }
  // (the anim audit #6 -- a hit lands: `ouch` was set and never read.  In a calm state the painted 'hurt' plays out over the ouch,
  //  where the pack has one and the boss opts in (flinchArt); in an attack -- or with no hurt drawing yet -- a 6-frame recoil in the
  //  drawing: -4 px back, a 4 % squash.  The state goes on: a wind-up is never cut)
  get calmStates() { return ['idle', 'stalk', 'wait']; }
  hasHurtArt() { if (this.flinchArt === false) return false; const f = CHARS[this.art]?.ANIM?.hurt; const p = typeof f === 'function' ? f(0) : f; return !!(p && p.s3d >= 0.5); }
  flinchPose() { return this.ouch > 0 && this.calmStates.includes(this.state) && this.hasHurtArt() ? this.anim('hurt', clamp(1 - this.ouch / (this.ouchMax || 12), 0, 1)) : null; }
  draw(ctx) {
    const g = this.game;
    if (this.ouch > (this.ouchSeen ?? 0)) { this.recoilAt = g.frame; this.ouchMax = this.ouch; }   // (a new hit: ouch went up)
    this.ouchSeen = this.ouch;
    const r = this.recoilAt !== undefined && !this.noRecoil ? 1 - (g.frame - this.recoilAt) / 6 : 0;
    if (r > 0 && !(this.calmStates.includes(this.state) && this.hasHurtArt())) {
      const sx = this.sx, sy = this.sy, k = r * r;
      ctx.save(); ctx.translate(sx - this.facing * 4 * k, sy); ctx.scale(1 + 0.04 * k, 1 - 0.04 * k); ctx.translate(-sx, -sy);
      try { super.draw(ctx); } finally { ctx.restore(); }
      return;
    }
    super.draw(ctx);
  }
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
  /** its key hint (keyHint(): [key, text]) again after 20 s without a scratch */
  nag() {
    const g = this.game, m = g.mm;
    if (!m || !this.alive || !g.fighting || g.cut || !this.keyHint) return;
    if (!g.L?.arenas?.[g.arenaIdx]?.boss || this.state === 'intro') return;
    if (this.nagOk && !this.nagOk()) return;   // (a boss's own fighting states only: QA2 M4 -- no stale nag over a finisher)
    if (this.fightAt === undefined) { this.fightAt = g.frame; this.hurtAt = Math.max(this.hurtAt ?? 0, g.frame); }
    if (g.frame - this.hurtAt < 1200 || g.frame - (this.nagAt ?? -1e9) < 1200) return;
    this.nags = (this.nags || 0) + 1;
    const H = this.keyHint(this.nags);
    if (H) { this.nagAt = g.frame; m.hint(H[0] + '_again', H[1], 360, true); }
  }
  shout(text, col = '#ffe066', size = 40, z = null) { const g = this.game; g.fx.label(clamp(this.x, g.camX + 120, g.camX + W - 120), this.y, z ?? (this.h + 20), text, col, size, 70); }
}

// ==================================================================================================== CAPTAIN BLUNDERBEARD
const LUNGE_REACH = 246, LUNGE_WIND = 42, SLASH_WIND = 36;   // (the drawn point reaches ~+239 px at st 8: the hit and the lane agree with the picture)
const bwind = (w, speed) => Math.max(36, w / speed);   // (a wind-up is never under 36 f, however quick he gets: QAF N1)
export class Blunderbeard extends SIBoss {
  constructor(game, x, y, opt = {}) {
    super(game, x, y, opt, 'CAPTAIN BLUNDERBEARD', 'Finest Sailor on the Seven Seas', 450);   // (QA2 M5: 330 was a 14-23 s fight; 450: 32-45 s skilled alone)
    this.art = 'blunderbeard'; this.scale = 1; this.w = 40; this.h = 262; this.shadowR = 64; this.balloonH = 322; this.talkGap = 320;
    this.sword = true; this.glow = 0.4; this.cool = 80; this.stunMeter = 0; this.scarlet = 0; this.disarmed = false; this.disarmSeq = false;
    this.whistleAt = 0; this.wt = 0; this.hurtSfx = 'brute_hurt'; this.hurtPitch = 0.62; this.ownFinish = true;
  }
  bossIntro() { this.set('laugh'); audio.sfx('king_laugh', { pitch: 0.8 }); }
  bossFight() {
    this.set('stalk'); this.cool = 130;
    this.game.mm?.hint?.('sibossintro', 'RED lane = a lunge. Step aside or ROLL! || YELLOW ring = a low sweep. JUMP! || He whistles for his crew? He stands still: HIT him!', 300, true);
  }
  nagOk() { return this.state !== 'crewCall'; }   // (no 'HIT him' nag while he can't be hit: R5)
  keyHint(n) {
    if (n % 2) return ['sibossA', "He lunges straight! Leave the red lane, or ROLL!"];
    return ['sibossB', 'He whistles for his crew? Now HIT him!'];
  }
  get speed() { return this.scarlet ? 1.15 : 1; }
  get open() { return !['intro', 'laugh', 'shock', 'clash', 'disarm', 'disarmed', 'conchWind', 'conch', 'defeated', 'crewCall'].includes(this.state); }
  get stunAt() { return Math.round(120 * (1 + 0.5 * (live(this.game).length - 1))); }   // (84: dizzy every few seconds -- QA2 M5)
  dmgOf(att, hd) {
    // (Scarlet's helper chips him too, but never takes the fight: a share; and nobody empties him -- the finish is the scripted beat)
    let d = hd.dmg * (this.state === 'stagger' ? 1.4 : 1);
    if (att && att.helper) d *= 0.6;
    const floor = this.maxHp * (this.scarlet ? 0.06 : !this.crewDone ? 0.74 : 0.3);   // (before Scarlet comes in, a super can't take him past ~half either; nor past the crew call before it)
    d = Math.min(d, this.hp - floor);
    return d > 0 ? Math.round(d) : 0;
  }
  onDamage(att, hd, d) {
    const g = this.game;
    if (d > 0 && !['stagger'].includes(this.state)) this.stunMeter += d * (hd.kind === 'knock' ? 1.6 : 1);
    if (!this.crewDone && !this.crewCalled && this.hp <= this.maxHp * 0.75 + 1) { this.beginCrew(); return; }
    if (!this.scarlet && this.crewDone && this.hp <= this.maxHp * 0.5 + 1) { this.beginScarlet(); return; }
    if (this.scarlet === 2 && !this.disarmSeq && this.hp <= this.maxHp * 0.24 + 1) { this.beginDisarm(); return; }
    if (this.stunMeter >= this.stunAt && ['stalk', 'lungeWind', 'slashWind', 'whistle'].includes(this.state) && this.alive) {
      this.stunMeter = 0; this.set('stagger'); this.vx = this.vy = 0; this.walkOn = false; this.releaseToken(); this.dizzyUntil = g.frame + 150;
      this.shout('DIZZY! HIT HIM!', '#fff2a8', 34, 300);
      audio.sfx('charge_full', { pitch: 0.7 });
    }
  }
  /** the CREW WHISTLE phase (QA2 M5): at 75% he backs off to the rail, whistles the crew in and can't be touched until they're down */
  beginCrew() {
    const g = this.game;
    this.crewCalled = true; this.crewAt = g.frame; this.releaseToken(); this.vx = this.vy = 0; this.walkOn = false; this.set('crewCall'); this.dizzyUntil = 0; this.stunMeter = 0; g.fx.alert(this);
    { const re = /whistles for his crew/i;   // (QAF re-check R5: his "He stands still: HIT him!" beat never plays in the crew call -- he can't be hit then)
      if (g.hint?.key === 'sibossintro') { if (re.test(g.hint.text)) { g.hint.next = []; g.hint.life = g.hint.t + 1; } else g.hint.next = (g.hint.next || []).filter((b) => !re.test(b.text)); }
      if (g.hintQ) g.hintQ = g.hintQ.map((h) => (h.key === 'sibossintro' ? { ...h, text: h.text.split(/\s*\|\|\s*/).filter((b) => !re.test(b)).join(' || ') } : h)).filter((h) => h.text); }
    g.mm?.hint?.('sicrew', 'He calls his CREW! Beat the sailors first!', 240, true);
  }
  onZero() { if (!this.disarmSeq) { this.hp = Math.max(1, Math.round(this.maxHp * 0.05)); if (!this.scarlet) this.beginScarlet(); else this.beginDisarm(); } }

  // ---- the beats ----
  beginScarlet() {
    const g = this.game;
    this.scarlet = 1; this.releaseToken(); this.vx = this.vy = 0; this.set('shock'); this.dizzyUntil = 0;
    g.fx.balloon(this, 'SCARLET?!', 110, { villain: true });
    g.mm?.scarletSwingIn?.();
  }
  /** Scarlet touched down: the cutlasses clang (the captain holds the parry a while) */
  onScarletLanded() { this.set('clash'); this.vx = this.vy = 0; this.scarlet = 2; this.releaseToken(); }
  beginDisarm() {
    const g = this.game;
    this.disarmSeq = true; this.set('disarm'); this.vx = this.vy = 0; this.releaseToken(); this.dizzyUntil = 0;
    // the crew is bowled over (nobody is hurt: they scramble off) and the heroes hold still for the beat
    for (const a of g.actors) if (a.team === 'foe' && a !== this && a.alive) { a.releaseToken?.(); a.hp = 0; a.knock?.(a.x < this.x ? -1 : 1, 7, 6); g.fx.word(a.x, a.y, a.h || 120, true, 'BONK!'); }   // (bowled over, then off they scramble)
    g.pending = []; g.talk = [];
    g.fx.list = g.fx.list.filter((q) => q.type !== 'balloon');
    for (const p of g.players) p.stopCharge?.();
  }
  dropSword() {
    const g = this.game;
    this.sword = false; this.disarmed = true;
    g.fx.label(this.x, this.y, 300, 'DISARMED!', '#9fe7ff', 40, 70);   // (as the cutlass leaves his hand)
    audio.sfx('sword_slash', { pitch: 1.4 }); audio.sfx('hit_finisher', { pitch: 1.2, vol: 0.6 });
    g.fx.word(this.x + this.facing * 90, this.y, 190, true, 'CLANG!'); g.fx.spark(this.x + this.facing * 90, this.y, 190, true);
    g.shake = Math.max(g.shake, 8);
    g.actors.push(new FlyingSword(g, this.x + this.facing * 70, this.y, -this.facing));
  }
  lockHeroes(on) { for (const p of this.game.players) { if (p.out) continue; p.ctl = !on; if (on) { p.autoDx = p.autoDy = 0; if (['walk', 'run'].includes(p.state)) p.set('idle'); } } }

  update() {
    const g = this.game, p = this.player, M = g.mm;
    this.tick();
    if (this.cool > 0) this.cool--;
    if (this.ouch > 0) this.ouch--;
    this.whistleAt++;
    // (QA2 round 2: watchdogs on the wall clock -- a timed state that outlives its limit falls back to stalking; it can never stick)
    if (this.state !== this.wdS) { this.wdS = this.state; this.wdAt = g.frame; }
    { const lim = { crewCall: 900, whistle: 360, stagger: 360, shock: 420, clash: 420, lungeWind: 240, slashWind: 240, lunge: 180, slash: 180 }[this.state];
      if (lim && !g.cut && g.frame - this.wdAt > lim) { if (this.state === 'shock') this.onScarletLanded(); else { if (this.state === 'crewCall') this.crewDone = true; this.set('stalk'); this.cool = 40; } } }
    if (this.stunMeter > 0 && this.state === 'stalk') this.stunMeter = Math.max(0, this.stunMeter - 0.12);   // (a pause lets the dizziness ebb)
    this.nag(); this.stepMercy();
    if (this.scarlet === 2 && !this.disarmSeq && this.hp <= this.maxHp * 0.24 + 1 && ['stalk', 'stagger'].includes(this.state)) this.beginDisarm();
    switch (this.state) {
      case 'intro': this.vx = this.vy = 0; break;
      case 'laugh': this.vx = this.vy = 0; if (this.st >= 60 && !g.cut) this.set('stalk'); break;
      case 'stalk': {
        const tx = this.standX(p, 215), ty = clamp(p.y, lo(g), hi(g));
        this.moveTo(tx, ty, 2.1 * this.speed, 1.4); this.face(p); this.wt += CHARS[this.art]?.ATLAS_SCALE ? Math.abs(this.vx) / 126 : (Math.abs(this.vx) > 0.8 ? 1 : 0.3) / 60;   // (the toon pack's walk is 126 px a cycle: the feet stay planted at any speed)
        this.walkStep();
        if (this.cool <= 0 && g.fighting && !g.cut && !p.down) this.chooseAttack(p);
        break;
      }
      case 'lungeWind':   // the lane on the floor lights up: it locks where the hero stands
        this.vx = this.vy = 0; this.face(p);
        if (this.st < 12) this.aimY = clamp(lerpTo(this.aimY ?? this.y, p.y, 0.4), lo(g), hi(g));
        this.y += clamp((this.aimY ?? this.y) - this.y, -2, 2);
        if (this.st === 2) audio.sfx('charge', { pitch: 0.7, vol: 0.5 });
        if (this.st >= bwind(LUNGE_WIND, this.speed)) { this.set('lunge'); this.lungeX = this.x; this.hitSetB = new Set(); audio.sfx('sword_slash', { pitch: 0.8 }); }
        break;
      case 'lunge':   // a huge stride: slides ~70 px, the point 260 px out
        this.vx = this.st >= 5 && this.st < 15 ? this.facing * 7 : 0;
        if (this.st >= 8 && this.st <= 20) {
          for (const q of g.players) {
            const dx = (q.x - this.x) * this.facing;
            if (q.hittable && !this.hitSetB.has(q) && dx > 20 && dx < LUNGE_REACH && Math.abs(q.y - this.y) < 24 && q.z < 160) {
              this.hitSetB.add(q);
              q.takeHit(this, { dmg: this.scarlet ? 11 : 8, kind: 'light', push: 4, stun: 22, stop: 5, sfx: 'hit_heavy', spark: 'warm' });   // (8 before Scarlet swings in: a first boss -- QAF N7)
            }
          }
        }
        if (this.st >= 50) { this.set('stalk'); this.cool = rnd(70, 120) / this.speed; }
        break;
      case 'slashWind':   // the low sweep: a ring on the floor -- JUMP
        this.vx = this.vy = 0; this.face(p);
        if (this.st === 2) audio.sfx('charge', { pitch: 0.6, vol: 0.5 });
        if (this.st >= bwind(SLASH_WIND, this.speed)) { this.set('slash'); this.hitSetB = new Set(); audio.sfx('swing_heavy', { pitch: 0.55 }); }
        break;
      case 'slash':
        this.vx = 0;
        if (this.st >= 10 && this.st <= 21) {
          for (const q of g.players) {
            const dx = (q.x - this.x) * this.facing;
            if (q.hittable && !this.hitSetB.has(q) && dx > -150 && dx < (this.st < 14 ? 150 : 196) && Math.abs(q.y - this.y) < 44 && q.z < 62) {   // (the drawn blade is at +143 px to st 13, +197 after)
              this.hitSetB.add(q);
              q.takeHit(this, { dmg: 9, kind: 'knock', push: 5, lift: 4.5, stop: 5, sfx: 'hit_heavy', spark: 'warm' });
            }
          }
        }
        if (this.st === 12) { g.shake = Math.max(g.shake, 5); g.fx.dust(this.x + this.facing * 120, this.y, 5, 50); }
        if (this.st >= 44) { this.set('stalk'); this.cool = rnd(70, 120) / this.speed; }
        break;
      case 'crewCall': {   // (QA2 M5) the crew phase: to the rail, a long TWEEEET, the crew in -- he conducts until they're down (12 s at most)
        const bx = g.camX + (this.x > g.camX + W / 2 ? W - 120 : 120);
        if (this.st < 40) { this.moveTo(bx, clamp(this.y, lo(g), hi(g)), 3.2, 1.4); this.wt += Math.abs(this.vx) / 126; } else { this.vx = this.vy = 0; }
        this.walkStep();
        this.face(p);
        if (this.st === 40) {
          audio.sfx('whelp_chirp', { pitch: 2.3, vol: 0.9 }); audio.sfx('whelp_chirp', { pitch: 2.0, vol: 0.7 });
          g.fx.label(this.x, this.y, 330, 'ALL HANDS! TWEEEEET!', '#9fe7ff', 36, 70);
          const n = Math.min(3, 1 + Math.ceil(live(g).length / 2));
          if (live(g).length < 2) {   // (alone: ONE club sailor, 60% health, at once -- a masher clears him in time: QA2 round 2)
            const e = g.spawn({ k: 'sailor', v: 'club', side: this.x > g.camX + W / 2 ? 'L' : 'R', y: clamp(p.y, lo(g), hi(g)), face: (Math.random() * 5) | 0 });
            if (e) e.hp = e.maxHp = Math.max(1, Math.round(e.maxHp * 0.6));
          } else for (let i = 0; i < n; i++) g.pending.push({ spec: { k: 'sailor', v: i % 2 ? 'bandana' : 'club', side: this.x > g.camX + W / 2 ? 'L' : 'R', y: clamp(p.y + (i - 1) * 40, lo(g), hi(g)), face: (Math.random() * 5) | 0 }, at: g.frame + i * 24 });
        }
        if (this.st > 40 && this.st % 30 === 0) g.fx.label(this.x + this.facing * 34, this.y, 262, '♪', '#9fe7ff', 30, 40);
        const crew = g.actors.filter((a) => a.art === 'sailor' && a.alive).length + g.pending.filter((q) => q.spec?.k === 'sailor').length;
        if ((this.st > 120 && !crew) || g.frame - (this.crewAt ?? g.frame) > 720) {   // (by the wall clock: it can never stick -- QA2 round 2)
          this.crewDone = true; this.set('stalk'); this.cool = 50; this.whistleAt = 0; this.shout('MY TURN!', '#ffe066', 38, 300); g.mm?.clearHint?.('sicrew'); }
        break;
      }
      case 'whistle':   // the crew whistle: he stands still, blowing -- a free flurry for the heroes
        this.vx = this.vy = 0; this.face(p);
        if (this.st === 26) {
          audio.sfx('whelp_chirp', { pitch: 2.3, vol: 0.9 }); audio.sfx('whelp_chirp', { pitch: 2.0, vol: 0.7 });
          g.fx.label(this.x, this.y, 330, 'TWEEEEET!', '#9fe7ff', 38, 60);
          const n = Math.min(3, 1 + Math.ceil(live(g).length / 2));
          for (let i = 0; i < n; i++) g.spawn({ k: 'sailor', v: i % 2 ? 'bandana' : 'club', side: i % 2 ? 'R' : 'L', y: clamp(p.y + (i - 0.5) * 40, lo(g), hi(g)), face: (Math.random() * 5) | 0, delay: i * 20 });
        }
        if (this.st > 26 && this.st % 16 === 0) g.fx.label(this.x + this.facing * 34, this.y, 262, '♪', '#9fe7ff', 30, 40);   // (whistle notes at the lips: the hand-to-mouth is small at 1x)
        if (this.st >= 90) { this.set('stalk'); this.cool = rnd(80, 130); }
        break;
      case 'stagger': this.vx = this.vy = 0; if (this.st >= 90) { this.set('stalk'); this.cool = 40; this.dizzyUntil = 0; } break;
      case 'shock':   // Scarlet is on her way in: he stares up (a watchdog: never longer than 4 s -- the beat goes on without her touchdown)
        this.vx = this.vy = 0;
        if (this.st > 240) this.onScarletLanded();
        break;
      case 'clash':
        this.vx = this.vy = 0;
        if (this.st === 8) { M?.line?.('notBad'); }
        if (this.st >= 120) { this.set('stalk'); this.cool = 40; }
        break;
      case 'disarm': {   // the captain rocked back; Scarlet's flick; "...Oh. You already did."; then the conch
        this.vx = this.vy = 0;
        this.lockHeroes(true);
        M?.flickBeat?.(this.st, this);   // (Scarlet steps to the front of him, then flicks: src/siworld.js)
        if (this.st === 52) { this.dropSword(); M?.line?.('disarm'); SIFX.bossBeat?.(g, this); }   // (the final blow: the cutlass flies -- the beat, src/sifx.js)
        if (this.st >= 52 && !this.sword) this.disarmedState();
        break;
      }
      case 'disarmed': {
        this.vx = this.vy = 0;
        if (this.st === 120) g.fx.list = g.fx.list.filter((q) => q.type !== 'balloon');
        if (this.st >= 130) { this.set('conchWind'); audio.sfx('charge', { pitch: 0.5 }); }
        break;
      }
      case 'conchWind':
        this.vx = this.vy = 0;
        if (this.st === 4) M?.line?.('conchLine');
        if (this.st >= 84) { this.set('conch'); }
        break;
      case 'conch': {
        this.vx = this.vy = 0;
        const k = Math.min(1, this.st / 150);
        if (this.st === 1) { audio.sfx('roar', { pitch: 0.4, vol: 0.9 }); audio.sfx('wind_gust', { pitch: 0.5 }); g.fx.list = g.fx.list.filter((q) => q.type !== 'balloon'); g.fx.label(this.x, this.y, 340, 'HOOOOONK!', '#d9a0ff', 46, 110); }
        g.shake = Math.max(g.shake, 4 + 6 * k);
        g.stage.setConch?.(Math.sin(Math.min(1, this.st / 60) * Math.PI / 2) * (this.st > 130 ? 1 - (this.st - 130) / 30 : 1));
        g.stage.setKraken?.(Math.max(0, (this.st - 30) / 120));
        if (this.st % 24 === 12) audio.sfx('knockdown', { pitch: 0.4, vol: 0.6 });
        if (this.st >= 168) { g.stage.setConch?.(0); this.lockHeroes(false); this.defeat(); }
        break;
      }
      case 'defeated': this.vx = this.vy = 0; break;
    }
    this.x += this.vx; this.y += this.vy;
    this.clampDepth();
    if (this.state !== 'intro') this.x = clamp(this.x, g.camX + 70, g.camX + W - 70);
  }
  disarmedState() { if (this.state === 'disarm') this.set('disarmed'); }
  /** (QAF N7) a hero low on health finds a drumstick near the front of the deck: twice a fight at most, 20 s apart (the Leviathan's SNACK) */
  stepMercy() {
    const g = this.game;
    if ((this.mercy || 0) >= 2 || g.frame - (this.mercyAt ?? -1e9) < 1200 || !g.fighting || g.cut || !g.L?.arenas?.[g.arenaIdx]?.boss) return;
    if (!['stalk', 'lungeWind', 'slashWind', 'lunge', 'slash', 'crewCall', 'whistle', 'stagger'].includes(this.state)) return;
    const q = live(g).find((p) => p.hp < 35);
    if (!q) return;
    this.mercy = (this.mercy || 0) + 1; this.mercyAt = g.frame;
    const sx = clamp(q.x + (this.x > q.x ? 56 : -56), g.camX + 80, g.camX + W - 80);   // (a stride from them on their lane, toward him: a masher walks onto it)
    g.spawnPickup('drumstick', sx, q.y);
    g.fx.label(sx, q.y, 90, 'SNACK!', '#ffe9a0', 26, 50);
  }
  draw(ctx) { if (this.sx < -280 || this.sx > W + 280) return; super.draw(ctx); }   // (off screen until the fight: no drawing)
  chooseAttack(p) {
    const g = this.game;
    const crew = g.actors.filter((a) => a.art === 'sailor' && a.alive).length, maxCrew = 1 + live(g).length;
    const r = Math.random(), dx = Math.abs(p.x - this.x);
    if (crew < maxCrew && this.whistleAt > (this.scarlet ? 360 : 460) && r < 0.4) {
      this.set('whistle'); this.whistleAt = 0; g.fx.alert(this);
      return;
    }
    if (dx < 130 && r < 0.6) { this.set('slashWind'); this.face(p); g.fx.alert(this); return; }
    this.set('lungeWind'); this.face(p); this.aimY = this.y; g.fx.alert(this);
  }

  /** walk above 1.0 px/f, idle under 0.4, the switch on a foot contact only (wt 0 / 0.5): he flipped walk / idle 18 times in 3000 f
   *  (the anim audit #14) -- stopping, the stride plays on to its contact first */
  // (entering a crewCall or a stagger clears walkOn: its first frames -- a hit's hitstop -- drew the stale walk:9 from his stalk, critic B)
  walkStep() {
    const v = Math.abs(this.vx);
    if (!this.walkOn) { if (v > 1.0) { this.walkOn = true; this.wt = Math.round(this.wt * 2) / 2; } return; }
    if (v >= 0.4) return;
    if (this.ouch > 0) { this.walkOn = false; return; }   // (flinching on the spot: the hurt hands straight to the idle -- no walk drawing between, critic B)
    const n = CHARS[this.art]?.ATLAS_SCALE ? clipDrawings(this.art, 'walk') : 0;
    if (n >= 8) {   // (the painted walk: idle on a double-support drawing -- either foot planted, a contact +-1 -- critic B: no moonwalk to the half-cycle)
      const ds = (w) => { const d = Math.floor(((w % 1) + 1) % 1 * n), h = n / 2; return [0, 1, n - 1, h - 1, h, h + 1].includes(d); };
      if (ds(this.wt)) { this.walkOn = false; return; }
      this.wt += 0.03; if (ds(this.wt)) this.walkOn = false;   // (on to the next one: <= 3 drawings)
      return;
    }
    const w0 = this.wt; this.wt += Math.max(0, 0.03 - v / 126);
    if (Math.floor(w0 * 2) !== Math.floor(this.wt * 2)) { this.wt = Math.round(this.wt * 2) / 2; this.walkOn = false; }
  }
  pose() {
    const g = this.game, t = g.time;
    { const fp = this.flinchPose(); if (fp) return fp; }   // (a hit in a calm state: his hurt -- the anim audit #6)
    switch (this.state) {
      case 'laugh': return this.anim('laugh', t);
      case 'stalk': return this.walkOn ? this.anim('walk', this.wt) : this.anim('idle', t);
      case 'lungeWind': return this.anim('lungeWind', Math.min(1, this.st / (bwind(LUNGE_WIND, this.speed))));
      case 'lunge': return this.anim('lunge', Math.min(1, this.st / 50));
      case 'slashWind': return this.anim('slashWind', Math.min(1, this.st / (bwind(SLASH_WIND, this.speed))));
      case 'slash': return this.anim('slash', Math.min(1, this.st / 44));
      case 'whistle': return this.st < 26 ? this.anim('whistleWind', this.st / 26) : this.anim('whistle', t);
      case 'crewCall': return this.st < 40 ? (this.walkOn ? this.anim('walk', this.wt) : this.anim('idle', t)) : this.st < 66 ? this.anim('whistleWind', (this.st - 40) / 26) : this.anim('whistle', t);
      case 'stagger': return this.anim('stagger', t);
      case 'shock': { const A = CHARS[this.art]; return this.anim(A?.ANIM?.shock ? 'shock' : A?.ATLAS_SCALE ? 'stagger' : 'disarmed', t); }   // (his sword still in hand: the pack's 'disarmed' has none -- 'stagger' until its 'shock' clip lands)
      case 'clash': return this.anim('clash', t);
      case 'disarm': return this.sword ? this.anim('stagger', t) : this.anim('disarmed', t);
      case 'disarmed': return this.anim('disarmed', t);
      case 'conchWind': return this.anim('conchWind', Math.min(1, this.st / 60));
      case 'conch': return this.anim('conch', t);
      case 'defeated': return this.disarmed ? this.anim('conch', t) : this.anim('laugh', t);   // (QA1 A8: the laugh clip has the cutlass baked -- disarmed means disarmed)
      default: return this.anim('idle', t);
    }
  }
  drawOpts() { return { ...super.drawOpts(), sword: this.sword, glow: ['conchWind', 'conch'].includes(this.state) ? 1 : 0.35, horn: ['conchWind', 'conch'].includes(this.state) ? 1 : 0 }; }
  starsAt() {   // (centred on the head: the toon pack's 'head' landmark swings +5..+22 px in the stagger)
    const q = CHARS[this.art]?.ATLAS_SCALE ? CHARS[this.art].point?.(this.pose(), 'head') : null;
    return q ? [this.sx + this.facing * q[0], this.sy + q[1] - 34, 1.5] : [this.sx + this.facing * 6, this.sy - 262, 1.5];
  }
  /** the lunge's lane (a red strip on the floor from his feet, where the point will go) and the slash's ring */
  drawFloor(ctx) {
    const g = this.game;
    if (this.state === 'lungeWind' || (this.state === 'lunge' && this.st < 10)) {
      const k = this.state === 'lunge' ? 1 : Math.min(1, this.st / 16), f = this.facing, sx = this.state === 'lunge' && this.lungeX != null ? this.lungeX - g.camX : this.sx, sy = FLOOR_TOP + this.y;
      const x0 = sx + f * 20, x1 = sx + f * (LUNGE_REACH + 70),   // (+70: the stride slides him ~70 px while the point is out -- the lane covers the whole reach, from where he started)
      blink = this.state === 'lungeWind' && this.st > 24 ? pulse(this.st - 24) : 1;
      ctx.save(); ctx.globalAlpha = (0.34 + 0.4 * k) * (0.6 + 0.4 * blink); ctx.fillStyle = '#ff3426';
      ctx.beginPath(); ctx.moveTo(x0, sy - 24); ctx.lineTo(x1, sy - 24); ctx.lineTo(x1, sy + 24); ctx.lineTo(x0, sy + 24); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = blink; ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.setLineDash([14, 9]); ctx.stroke(); ctx.strokeStyle = '#ffe2d8'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
    }
    if (this.state === 'slashWind' || (this.state === 'slash' && this.st < 12)) {
      const k = this.state === 'slash' ? 1 : Math.min(1, this.st / 24), sx = this.sx, sy = FLOOR_TOP + this.y, f = this.facing;
      ctx.save(); ctx.translate(sx + f * 24, sy);
      ctx.globalAlpha = 0.3 + 0.35 * k; ctx.fillStyle = '#ffc61a'; ctx.beginPath(); ctx.ellipse(0, 0, 172, 46, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.9; ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.setLineDash([14, 9]); ctx.stroke(); ctx.strokeStyle = '#fff1a0'; ctx.lineWidth = 2.4; ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = pulse(this.st); ctx.font = 'bold 34px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
      ctx.strokeText('JUMP!', 0, 8); ctx.fillStyle = '#fff1a0'; ctx.fillText('JUMP!', 0, 8);
      ctx.restore();
    }
    void g;
  }
}
const lerpTo = (a, b, k) => a + (b - a) * k;

// ==================================================================================================== the TREASURE ROOM: the rematch
/** Captain Blunderbeard's rematch on the Gull's wreck (the Treasure Room, src/sisecrets.js): the same captain -- lunge, sweep, crew whistle, dizzy -- but Scarlet is already
 * at the heroes' side (no swing-in), there is no disarm and no conch: a little tougher (more crew, a quicker whistle), and when his health is gone he gives up ("All right, ALL
 * RIGHT! The doubloons are yours!") and sits on his treasure.  Nobody is hurt. */
export class BlunderbeardRematch extends Blunderbeard {
  constructor(game, x, y, opt = {}) {
    super(game, x, y, opt);
    this.name = 'CAPTAIN BLUNDERBEARD'; this.title = 'The Treasure Room Rematch';
    this.hp = this.maxHp = opt.hp || 300; this.scarlet = 2; this.disarmSeq = true; this.surrendered = false; this.rematch = true;   // (rematch: siworld.js tells it from the disarm show -- QAF N4)   // (scarlet 2 + disarmSeq: the base's beats never start)
  }
  get speed() { return 1.1; }
  dmgOf(att, hd) { let d = hd.dmg * (this.state === 'stagger' ? 1.4 : 1); if (att && att.helper) d *= 0.6; return Math.round(d); }
  onDamage(att, hd, d) {
    const g = this.game;
    if (d > 0 && this.state !== 'stagger') this.stunMeter += d * (hd.kind === 'knock' ? 1.6 : 1);
    if (this.stunMeter >= this.stunAt && ['stalk', 'lungeWind', 'slashWind', 'whistle'].includes(this.state) && this.alive) {
      this.stunMeter = 0; this.set('stagger'); this.vx = this.vy = 0; this.walkOn = false; this.releaseToken(); this.dizzyUntil = g.frame + 150;
      this.shout('DIZZY! HIT HIM!', '#fff2a8', 34, 300); audio.sfx('charge_full', { pitch: 0.7 });
    }
  }
  onZero() { if (!this.surrendered) this.surrender(); }
  surrender() {
    const g = this.game;
    this.surrendered = true; this.hp = 0; this.set('giveup'); this.vx = this.vy = 0; this.releaseToken(); this.sword = false;
    SIFX.bossBeat?.(g, this);   // (the final blow: slow-mo + a camera nudge + its material burst, src/sifx.js)
    for (const a of g.actors) if (a.team === 'foe' && a !== this && a.alive) { a.releaseToken?.(); a.hp = 0; a.knock?.(a.x < this.x ? -1 : 1, 7, 6); }
    g.pending = []; g.talk = [];
    g.fx.balloon(this, 'All right, ALL RIGHT!' + String.fromCharCode(10) + 'The doubloons are yours!', 200, { villain: true });
    audio.sfx('king_laugh', { pitch: 0.9, vol: 0.6 });
  }
  update() {
    if (this.state === 'giveup') {
      const g = this.game;
      this.tick(); this.vx = this.vy = 0;
      if (this.st === 40) { for (let i = 0; i < 14; i++) g.spawnPickup('coin', this.x + (Math.random() - 0.5) * 260, clamp(this.y + (Math.random() - 0.5) * 60, 4, DEPTH - 4)); g.spawnPickup('gem', this.x - 60, this.y); g.spawnPickup('drumstick', this.x + 60, this.y); g.fx.label(this.x, this.y, 300, 'TREASURE!', '#ffd86a', 40, 80); audio.sfx('pickup_coin', { pitch: 1.3 }); }
      if (this.st >= 160) this.defeat();
      return;
    }
    super.update();
  }
  pose() { return this.state === 'giveup' || this.state === 'defeated' ? this.anim('disarmed', this.game.time) : super.pose(); }   // (hands up to the end: he does not pick the cutlass up again)
  get open() { return this.state !== 'giveup' && super.open; }
  chooseAttack(p) { this.whistleAt += 1.5; super.chooseAttack(p); }   // (a quicker whistle: more crew)
}

/** the captain's cutlass, flicked out of his hand: it spins up and away over the rail, into the sea */
class FlyingSword extends Actor {
  constructor(game, x, y, dir) {
    super(game, x, y);
    this.team = 'fx'; this.solid = false; this.vx = dir * 5.2; this.vz = 11; this.z = 190; this.rot = 0; this.sortY = 9999; this.life = 100;
  }
  get hittable() { return false; }
  update() {
    this.tick(); this.x += this.vx; this.z += this.vz; this.vz -= 0.45; this.rot += 0.42 * Math.sign(this.vx || 1);
    if (--this.life <= 0 || this.z < -60) this.gone = true;
  }
  drawShadow() {}
  draw(ctx) {
    ctx.save(); ctx.translate(this.sx, this.sy); ctx.rotate(this.rot); ctx.lineJoin = 'round';
    ctx.fillStyle = '#e2e6ee'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-5, -4); ctx.quadraticCurveTo(-8, -50, 12, -80); ctx.quadraticCurveTo(4, -46, 5, -4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e6bc4a'; ctx.beginPath(); ctx.rect(-12, -4, 24, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#5c3a22'; ctx.beginPath(); ctx.rect(-5, 2, 10, 14); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
void CHARS; void pick;
