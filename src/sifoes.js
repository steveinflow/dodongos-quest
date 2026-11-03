// SKULL ISLAND's foes (docs/SKULL_ISLAND.md, src/silevels.js): BLUNDERBEARD'S CREW.  Grown men in navy uniforms, five faces
// (src/chars/sailor.js), four kits -- stern, never scary; nobody is hurt for real, a beaten sailor is bowled over and poofs.
//   sailor v club    plain melee: an overhead belaying-pin chop (a telegraphed wind-up)
//   sailor v bandana the purple-bandana thug (Malachar's colour): quick, with a long low cutlass lunge
//   sailor v rope    a LASSO: fling it (a wind-up spin, a slow loop along the floor); a hero it catches is held and reeled in
//                    -- they mash ATTACK to wriggle loose, and ANY hit on the lasso's sailor (a friend's!) frees them
//   sailor v net     hauls a NET from the rigging: a ring on the floor grows, then the net falls on whoever stands in it;
//                    any hit cuts it (Shadow cuts himself free), or mash ATTACK
// The holds themselves (the pull, the mashing, the freeing) are src/siworld.js's (g.mm.hold); the sailors and their lasso /
// net only start them.  Spawn: { k: 'sailor', v: 'club' | 'rope' | 'net' | 'bandana', face: 0..4 }.
import { Enemy, CHARS } from './enemies.js';
import { Actor, boxOf, GRAV } from './actors.js';
import { audio } from './audio-proxy.js';
import { W, DEPTH, FLOOR_TOP, INK } from './config.js';
import { clamp, TAU } from './rig.js';
import { baseOf } from './heroes.js';
import { strikeZone, windSound } from './sitele.js';

const rnd = (a, b) => a + Math.random() * (b - a);
/** flash safety: a telegraph's last-moment urgency is a smooth ~1.9 Hz pulse (0.55..1), never an on/off blink */
const pulse = (n) => 0.775 + 0.225 * Math.cos(n * 0.2);
const pick = (a) => a[(Math.random() * a.length) | 0];

const KIT = {
  club: { hp: 40, sp: 1.8, wind: 36, dmg: 8, cool: [70, 120], range: [74, 86], score: 500 },
  bandana: { hp: 34, sp: 2.7, wind: 36, dmg: 9, cool: [50, 90], range: [112, 130], score: 600 },
  rope: { hp: 38, sp: 1.7, wind: 36, dmg: 8, cool: [150, 220], range: [215, 270], score: 700 },
  net: { hp: 36, sp: 1.6, wind: 38,   // (QA2: 30-34 f wind-ups were the floor of the bar -- 36-40 for 6-year-olds)
  dmg: 0, cool: [230, 310], range: [250, 320], score: 700 },
};
const FACE_NAMES = ['LANKY', 'BARNACLE', 'OLD SALT', 'BIG MOE', 'SPIKE'];
// where a sailor loiters while his attack cools down: a depth row and a distance of his own (a crowd, not a clump)
const LANES = [0, -40, 40, -70, 70, 20, -20], SLOTS = [0, 60, 120, 30, 90, 150, 45];
let crowdN = 0;
/** a sailor's bark: only when no one else's balloon is up (a hero's line is never covered) */
const bark = (g, e, text, life) => { if (!g.fx.list.some((q) => q.type === 'balloon' && q.actor !== e && !q.actor?.gone)) g.fx.balloon(e, text, life, { villain: true }); };
const BARKS = {
  club: ['Get them, mates!', 'For the Captain!', 'Come here, runts!', "Master wants 'em!"],
  bandana: ['Heh heh heh!', 'Quick as a gull!', 'Master wants you!'],
  rope: ['Yeehaw! ...I mean, arr!', 'Lasso time!', 'Got ye!'],
  net: ['Haul away!', 'Net time!', 'Stand still, mates!'],
};

export class Sailor extends Enemy {
  constructor(game, x, y, opt = {}) {
    const v = KIT[opt.variant] ? opt.variant : 'club';
    const face = opt.face !== undefined && opt.face !== null ? ((opt.face | 0) % 5 + 5) % 5 : (Math.random() * 5) | 0;
    super(game, x, y, { name: opt.name || FACE_NAMES[face] });
    this.art = 'sailor'; this.variant = v; this.faceIdx = face; this.K = KIT[v];
    this.hp = this.maxHp = this.K.hp;
    this.w = 26; this.h = 160;
    this.range = rnd(...this.K.range);
    this.score = this.K.score;
    this.balloonH = 196;
    this.shadowR = 34;
    this.scale = [1.04, 0.94, 1.0, 1.08, 0.98][face];
    this.barks = BARKS[v];
    this.lane = LANES[crowdN % LANES.length]; this.slotX = SLOTS[(crowdN * 3 + 1) % SLOTS.length]; crowdN++;
    this.set('approach');
  }
  onHurtSfx() { audio.sfx('brute_hurt', { pitch: 1.05 + this.faceIdx * 0.04 }); }
  drawOpts() { return { ...super.drawOpts(), face: this.faceIdx, kit: this.variant }; }
  /** the hand's world point (the lasso's / the rope's end) */
  hand() {
    // (the fist as drawn: the 'hand' landmark of the drawing showing -- the throw's fling at st 4, the rope loop's drawing -- at his scale and
    //  his body's width / stout squash (src/chars/sailor3d.js bodyXform; the code rig its own build); the fixed exports missed both)
    const A = CHARS.sailor, q = A?.point?.(this.pose(), 'hand', { face: this.faceIdx, kit: this.variant });
    if (q && Number.isFinite(q[0]) && (this.state === 'roping' || this.state === 'throwWind' || this.state === 'throw')) {
      const X = A.bodyXform?.(this.variant, this.faceIdx) || { wx: 1, sy: 1 };
      return { x: this.x + this.facing * q[0] * this.scale * X.wx, y: this.y, z: -q[1] * this.scale * X.sy };
    }
    const E = A && A.ATLAS_SCALE ? A.EXPORTS : null, P = E && (this.state === 'roping' ? E.ROPE_HAND : this.state === 'throwWind' || this.state === 'throw' ? E.THROW_HAND : null);
    if (P) return { x: this.x + this.facing * P[0] * this.scale, y: this.y, z: -P[1] * this.scale };   // (the toon pack's measured fist: the fling at st 4, the taut rope)
    return { x: this.x + this.facing * 34, y: this.y, z: 96 + (this.state === 'throwWind' || this.state === 'throw' ? 70 : 0) };
  }

  update() {
    const g = this.game, p = this.player, K = this.K;
    this.tick();
    if (this.cool > 0) this.cool--;
    switch (this.state) {
      case 'approach': case 'wait': case 'taunt': this.think(p); break;
      case 'windup':
        this.vx = this.vy = 0;
        if (this.st === 1) windSound(this, 'swing');
        if (this.st === 1 && Math.random() < 0.3) bark(g, this, pick(this.barks), 70);
        if (this.st >= K.wind) { this.set('swing'); this.hitDone = false; audio.sfx('swing_light', { pitch: 0.7 }); }
        break;
      case 'swing':   // the overhead chop: the club comes down at k ~ .22 of 26 frames
        if (!this.hitDone && this.st >= 5 && this.st <= 11) {
          const b = boxOf(this, { x0: 18, x1: 106, z0: 0, z1: 175, dy: 17 });
          if (this.hitHeroes(b, { dmg: K.dmg, kind: 'light', push: 3.5, stun: 22, stop: 5, sfx: 'hit_heavy' })) this.hitDone = true;
        }
        if (this.st === 7) g.fx.dust(this.x + this.facing * 90, this.y, 2, 10);
        if (this.st >= 26) this.attackDone();
        break;
      case 'lungeWind':
        this.vx = this.vy = 0;
        if (this.st === 1) windSound(this, 'lunge');
        if (this.st === 1 && Math.random() < 0.3) bark(g, this, pick(this.barks), 70);
        if (this.st >= K.wind) { this.set('lunge'); this.hitDone = false; audio.sfx('sword_slash', { pitch: 1.1 }); }
        break;
      case 'lunge':   // a long low lunge: slides ~55 px, the cutlass out front at k .25
        this.vx = this.st >= 5 && this.st < 13 ? this.facing * 6.8 : 0;
        if (!this.hitDone && this.st >= 7 && this.st <= 17) {
          const b = boxOf(this, { x0: 26, x1: 138, z0: 20, z1: 130, dy: 15 });
          if (this.hitHeroes(b, { dmg: K.dmg, kind: 'light', push: 3.2, stun: 19, stop: 4, sfx: 'hit_light' })) this.hitDone = true;
        }
        if (this.st >= 30) this.attackDone();
        break;
      case 'throwWind':   // the lasso spins over his head: the telegraph
        this.vx = this.vy = 0;
        if (this.st === 1) windSound(this, 'spin');
        if (this.st === 1) bark(g, this, pick(this.barks), 80);
        if (this.st % 9 === 0) audio.sfx('wind_gust', { pitch: 1.6, vol: 0.25 });
        if (this.st >= K.wind) { this.set('throw'); this.thrown = false; }
        break;
      case 'throw':
        if (!this.thrown && this.st === 4) {
          this.thrown = true; audio.sfx('throw', { pitch: 0.9 });
          const h = this.hand();
          g.actors.push(new Lasso(g, h.x, this.y, h.z, this.facing, this));
        }
        if (this.st >= 20 && !this.lassoOut) this.attackDone();
        else if (this.st >= 20) this.set('roping');
        break;
      case 'roping': {   // holding the rope taut: a friend's hit on him frees the hero (src/siworld.js)
        this.vx = this.vy = 0;
        const held = g.mm?.heldBy?.(this);
        if (held) { if (Math.abs(held.x - this.x) > 4) this.facing = held.x > this.x ? 1 : -1; }
        else { this.lassoOut = false; this.attackDone(); }
        break;
      }
      case 'pullWind':   // the net: a ring on the floor (the Net actor) grows while he hauls
        this.vx = this.vy = 0;
        if (this.st === 1) windSound(this, 'spin');
        if (this.st === 1) bark(g, this, pick(this.barks), 80);
        if (this.st >= K.wind) { this.set('pull'); audio.sfx('swing_heavy', { pitch: 0.6, vol: 0.6 }); }
        break;
      case 'pull': this.vx = this.vy = 0; if (this.st >= 22) { this.relAt = g.frame; this.attackDone(); } break;
      case 'hurt': this.vx *= 0.8; if (this.st >= this.stun) this.set('wait'); break;
      case 'fly': this.flyUpdate(); break;
      case 'down': this.downUpdate(); break;
      case 'getup': if (this.st >= 26) { this.set('wait'); this.cool = Math.max(this.cool, 30); } break;
      case 'dying': this.dyingUpdate(); break;
    }
    if (this.state === 'approach' || this.state === 'wait') this.separate();
    this.integrate();
  }
  /** the walk cycle advances with the distance covered (58 px a cycle, the toon pack's stride): the feet stay planted at any speed, a depth-only move still steps, and a
   * retreat while facing the hero plays the walk backwards (no moonwalk) */
  walkAdv() { const v = Math.hypot(this.vx, this.vy), dir = this.vx * this.facing < -0.2 ? -1 : 1; this.ph = (((this.ph + dir * v / 58) % 1) + 1) % 1; }
  attackDone() { this.releaseToken(); this.lassoOut = false; this.cool = rnd(...this.K.cool); this.set('wait'); }

  takeHit(att, hd) {
    const ok = super.takeHit(att, hd);
    // (a hit on the lasso's sailor lets go of the rope -- src/siworld.js sees it: his state is hurt / fly)
    return ok;
  }
  /** a crowd keeps apart: a firm push when two stand within a body's width */
  separate() {
    for (const o of this.game.actors) {
      if (o === this || o.team !== 'foe' || !o.alive || o.flying) continue;
      const dx = this.x - o.x, dy = this.y - o.y;
      if (Math.abs(dx) < 74 && Math.abs(dy) < 24) {
        this.y += dy >= 0 ? 1.3 : -1.3;
        this.x += dx >= 0 ? 1.0 : -1.0;
      }
    }
  }
  // knocked over mid-attack: the lasso / net go slack
  knock(dir, lift, push, thrown) { this.lassoOut = false; super.knock(dir, lift, push, thrown); this.flyAt = this.game.frame; }
  // (painter 1's clips: hurt / hurtB take turns hit by hit -- Enemy.takeHit's hitN, as enemies2.js' hurt / hurt2; bounceAt -- the frame of the first floor contact)
  flyUpdate() { const b = this.bounced; super.flyUpdate(); if (!b && this.bounced) this.bounceAt = this.game.frame; }
  /** a painted clip (not the code rig's stand-in) */
  painted(k) { const f = CHARS[this.art]?.ANIM?.[k], p = typeof f === 'function' ? f(0) : f; return !!(p && p.s3d >= 0.5); }
  get hurtClip() { return this.hitN && this.hitN % 2 === 0 && this.painted('hurtB') ? 'hurtB' : 'hurt'; }

  think(p) {
    const g = this.game, K = this.K, v = this.variant;
    const side = this.x < p.x ? -1 : 1;
    if (!p.alive || p.down || p.state === 'victory') {   // (a hero down: keep a respectful distance and taunt)
      this.moveTo(p.x + side * 170, clamp(p.y + this.yOff * 3, 4, DEPTH - 4), K.sp * 0.7);
      if (this.vx === 0 && this.vy === 0) { if (this.state !== 'taunt') this.set('taunt'); this.face(p); }
      else { this.set('approach'); this.walkAdv(); this.facing = this.vx ? Math.sign(this.vx) : this.facing; }
      return;
    }
    const wait = this.cool > 25 && !(v === 'rope' || v === 'net');   // (loitering: in his own slot; ready to attack: in reach, on the hero's row)
    const tx = this.standX(p, this.range + (wait ? this.slotX : 0)), ty = clamp(p.y + (wait ? this.lane : this.cool > 20 ? this.yOff : 0), 4, DEPTH - 4);
    const dx = Math.abs(this.x - p.x), dyy = Math.abs(this.y - p.y);
    const near = Math.abs(this.x - tx) < 10 && dyy < 8;
    if (v === 'club' || v === 'bandana') {
      if (this.cool <= 0 && near && this.entered && this.takeToken()) { this.face(p); this.windup(v === 'club' ? 'windup' : 'lungeWind'); return; }
    } else if (v === 'rope') {
      if (this.cool <= 0 && this.entered && dx > 140 && dx < 340 && dyy < 26 && !g.mm?.holds?.size && this.takeToken()) { this.face(p); this.lassoOut = false; this.windup('throwWind'); return; }
      if (this.cool <= 0 && this.entered && dx < 100 && dyy < 14 && this.takeToken()) { this.face(p); this.windup('windup'); return; }   // (up close he clubs: a short belaying pin on his belt)
    } else if (v === 'net') {
      if (this.cool <= 0 && this.entered && dx < 400 && this.takeToken()) {
        this.face(p); this.windup('pullWind');
        // the net's ring is on the floor already, where the hero stands now -- step out of it!
        g.actors.push(new Net(g, p.x + p.vx * 14, clamp(p.y + p.vy * 8, 16, DEPTH - 16), this));
        return;
      }
    }
    if (v === 'rope' || v === 'net') {   // (these keep their distance, drifting in depth)
      if (this.moveTo(tx, clamp(p.y + this.yOff * 2, 4, DEPTH - 4), K.sp)) { this.set('wait'); this.face(p); }
      else { this.set('approach'); this.walkAdv(); this.face(p); }
      return;
    }
    const sp = this.cool > 40 && Math.abs(this.x - p.x) < 140 ? K.sp * 0.55 : K.sp;
    if (this.moveTo(tx, ty, sp)) { this.set('wait'); this.face(p); }
    else {
      this.set('approach'); this.walkAdv();
      if (Math.abs(this.vx) > 0.2) this.facing = Math.sign(this.vx);
      if (Math.abs(this.x - p.x) < 160) this.face(p);
    }
  }

  pose() {
    const g = this.game;
    // (the anim audit #11: mid-combo, between two hits it went hurt -> walk for 2-4 f -> hurt -- the last hurt drawing held 7 frames)
    if (this.state === 'hurt') this.hurtLast = g.frame;
    else if (['approach', 'wait', 'taunt', 'idle'].includes(this.state) && g.frame - (this.hurtLast ?? -99) <= 7 && g.players.some((q) => !q.out && (q.state === 'atk' || q.state === 'runAtk' || g.frame - (q.lastAtkEnd ?? -99) < 12) && Math.abs(q.x - this.x) < 160 && Math.abs(q.y - this.y) < 50)) return this.anim(this.hurtClip, 1);
    switch (this.state) {
      case 'approach': return this.anim('walk', this.ph);
      case 'wait': if (this.relAt !== undefined && g.frame - this.relAt < 6) return this.anim('pullWind', 1 - (g.frame - this.relAt) / 6);   // (the net let go: the arms come down over 6 frames, no one-frame cut)
        return this.anim('idle', g.time + this.ph * 3);
      case 'taunt': return this.anim('taunt', g.time + this.ph * 3);
      case 'windup': return this.anim('windup', Math.min(1, this.st / this.K.wind));
      case 'swing': return this.anim('swing', Math.min(1, this.st / 26));
      case 'lungeWind': return this.anim('lungeWind', Math.min(1, this.st / this.K.wind));
      case 'lunge': return this.anim('lunge', Math.min(1, this.st / 30));
      case 'throwWind': return this.anim('throwWind', Math.min(1, this.st / this.K.wind));
      case 'throw': return this.anim('throw', Math.min(1, this.st / 20));
      case 'roping': return this.anim('roping', g.time);   // (leaning back on the taut rope, tugging)
      case 'pullWind': return this.anim('pullWind', Math.min(1, this.st / this.K.wind));
      case 'pull': return this.anim('pull', g.time);
      case 'hurt': return this.anim(this.hurtClip, Math.min(1, this.st / this.stun));
      case 'fly': {   // (from the knock's frame, 7 f a drawing; the first floor contact: down's LAND squash 4 f, then flat and up off the deck for the rest of the 10 f hop -- painter 1)
        const n = g.frame - (this.flyAt ?? g.frame);
        if (!this.painted('bounce')) return this.anim('fly', n / 60);
        if (!this.bounced) {   // (0 1 2 3, then a 1-3 ping-pong: never back to the upright drawing 0 in the air -- critic B)
          let i = (n / 7) | 0;
          if (i > 0 && n - i * 7 < 3) { let z = this.z, v = this.vz, k = 0; while (z > 0 && k < 3) { v -= GRAV; z += v; k++; } if (z <= 0 && n - i * 7 + k < 3) i--; }   // (a drawing that would show under 3 f before the deck: the last one holds on)
          return this.anim('fly', ((i <= 3 ? i : [3, 2, 1, 2][(i - 3) % 4]) * 7 + 3.5) / 60);
        }
        return g.frame - (this.bounceAt ?? -99) < 4 ? this.anim('down', 0) : this.anim('bounce');
      }
      case 'down': return this.painted('bounce') ? this.anim('down', 1) : this.anim('down', Math.min(1, this.st / 30));   // (the second contact: straight from the hop's bounce to settled -- down0's head sat ~6 px above the bounce's, a hitch up; down1 is the hop's bounce again)
      case 'dying': return this.anim('down', 1);   // (out of down only: the settled drawing, held while he blinks out)
      case 'getup': return this.anim('getup', Math.min(1, this.st / 26));
      default: return this.anim('idle', g.time);
    }
  }
  /** the wind-ups' floor markers (src/sitele.js): the club's chop, the bandana's lunge, the lasso's throw (the net has its own ring) */
  drawShadow(ctx) {
    super.drawShadow(ctx);
    const K = this.K;
    if (this.state === 'windup') strikeZone(ctx, this, 18, 106, this.st / K.wind);
    else if (this.state === 'lungeWind') strikeZone(ctx, this, 26, 192, this.st / K.wind, { halfH: 12 });   // (the cutlass 138 out + the ~54 px slide)
    else if (this.state === 'throwWind') strikeZone(ctx, this, 70, 420, this.st / K.wind, { halfH: 11, dashed: true, col: '255,170,50' });   // (the lasso flies up to 420 px)
  }
  draw(ctx) {
    super.draw(ctx);
    // (the lasso's rope while he holds it taut is the Lasso actor's.)  The net sailor's hauling rope runs from his fists up out of the picture, into the rigging
    // (the toon pack's prop ends ~110 px above the fist; the rig draws its own rope up)
    if (this.variant === 'net' && (this.state === 'pullWind' || this.state === 'pull') && CHARS.sailor?.ATLAS_SCALE) {
      const x = this.sx + this.facing * 14 * this.scale, y1 = this.sy - 258 * this.scale;
      ctx.save(); ctx.lineCap = 'round';
      for (const [lw, col] of [[7, INK], [3.6, '#d8c590']]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x + Math.sin(this.game.time * 8) * 1.5, -20); ctx.stroke(); }
      ctx.restore();
    }
  }
}

// ------------------------------------------------------------------------------------------------ the lasso
/** a loop of rope flung along the floor: it flies, and a hero it touches is held and reeled in (g.mm.hold, src/siworld.js).
 * A hero can swat it out of the air, jump it or roll through it. */
class Lasso extends Actor {
  constructor(game, x, y, z, dir, owner) {
    super(game, x, y);
    this.z = z; this.vx = dir * 7.4; this.facing = dir; this.owner = owner;
    this.team = 'shot'; this.w = 22; this.h = 40; this.hz0 = -20; this.life = 70; this.solid = false; this.shadowR = 18;
    this.start = x; this.caught = null;
    owner.lassoOut = true;
  }
  get hittable() { return this.alive && !this.caught; }
  takeHit() {   // swatted out of the air
    if (this.caught) return false;
    this.alive = false; this.gone = true; this.owner.lassoOut = false;
    this.game.fx.spark(this.x, this.y, this.z, false);
    audio.sfx('block', { pitch: 1.3, vol: 0.6 });
    return true;
  }
  update() {
    const g = this.game;
    this.tick();
    const o = this.owner;
    if (this.caught) {   // the tether: follows the held hero until the hold ends
      const p = this.caught;
      if (!g.mm?.holds?.has(p) || !o.alive || o.gone) { this.gone = true; o.lassoOut = false; return; }
      this.x = p.x; this.y = p.y; this.z = 70;
      return;
    }
    this.x += this.vx; this.z += (66 - this.z) * 0.1;
    for (const p of g.players) {
      if (!p.hittable || p.out || Math.abs(p.y - this.y) > 20 || Math.abs(p.x - this.x) > p.w + 14 || p.z > 80) continue;
      if (g.mm?.hold?.(p, { by: o, kind: 'rope' })) { this.caught = p; this.vx = 0; audio.sfx('hit_light', { pitch: 0.7 }); g.fx.word(p.x, p.y, 150, true, 'GOT YE!'); return; }
    }
    if (--this.life <= 0 || Math.abs(this.x - this.start) > 420 || o.gone || !o.alive) { this.gone = true; o.lassoOut = false; }
  }
  draw(ctx) {
    const o = this.owner;
    if (!o || o.gone) return;
    const hp = o.hand(), hx = o.sx + (hp.x - o.x), hy = o.sy - hp.z, t = this.game.time;
    const x = this.sx, y = this.sy - this.z, taut = !!this.caught;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // the rope from his fist: slack in a curve while flying, taut when it has caught someone
    const sag = taut ? 2 : 22 + Math.sin(t * 14) * 4;
    for (const [lw, col] of [[7, INK], [3.6, '#d8c590']]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo((hx + x) / 2, (hy + y) / 2 + sag, x, y); ctx.stroke();
    }
    // the loop
    const r = taut ? 30 : CHARS.sailor?.ATLAS_SCALE ? 30 : 17;   // (the pack's spinning loop is ~72 px wide: it must not shrink at the release)
    for (const [lw, col] of [[8, INK], [4.4, '#e6d6a0']]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.ellipse(x, y, r, r * (taut ? 1.2 : 0.62), 0, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }
}

// ------------------------------------------------------------------------------------------------ the net
const NET_R = 66, NET_TELE = 56, NET_DROP = 12;
/** a net hauled from the rigging: a ring grows on the floor (the telegraph), the net falls on whoever is inside it, and it
 * lies there a while: any hit on it cuts it (Shadow cuts himself free; the others mash ATTACK -- src/siworld.js) */
export class Net extends Actor {
  constructor(game, x, y, owner) {
    super(game, x, y);
    this.owner = owner; this.team = 'hazard'; this.w = NET_R; this.h = 34; this.hz0 = 0; this.solid = false; this.shadowR = 0;
    this.phase = 'tele'; this.age = 0; this.held = []; this.depthR = 16;
    this.sortY = this.y + 40;
  }
  get hittable() { return this.alive && this.phase === 'down'; }
  get active() { return this.phase === 'tele' || this.phase === 'fall'; }
  /** cut open: whoever is under it goes free (SNIP!) */
  cut(by) {
    if (this.phase === 'cut' || !this.alive) return;
    const g = this.game;
    this.phase = 'cut'; this.age = 0;
    audio.sfx('sword_slash', { pitch: 1.2 }); audio.sfx('shuriken_hit', { vol: 0.6 });
    g.fx.word(this.x, this.y, 110, true, 'SNIP!');
    g.fx.spark(this.x, this.y, 30, true);
    for (const p of this.held.slice()) g.mm?.release?.(p);
    this.held = [];
    void by;
  }
  takeHit(att) {
    if (!this.hittable) return false;
    this.cut(att);
    this.game.score += 100;
    return true;
  }
  update() {
    const g = this.game;
    this.tick(); this.age++;
    const o = this.owner;
    if (this.phase === 'tele') {
      // (the sailor knocked out of his haul: the net goes slack and never falls)
      if (!o || o.gone || !o.alive || ['hurt', 'fly', 'down', 'dying', 'getup'].includes(o.state)) { this.alive = false; this.gone = true; return; }   // (its sailor knocked out of his haul: the net goes slack)
      if (this.age >= NET_TELE) { this.phase = 'fall'; this.age = 0; audio.sfx('wind_gust', { pitch: 0.7, vol: 0.5 }); }
    } else if (this.phase === 'fall') {
      this.z = 280 * (1 - Math.min(1, this.age / NET_DROP)) ** 2;
      if (this.age >= NET_DROP) {
        this.phase = 'down'; this.age = 0; this.z = 0; g.shake = Math.max(g.shake, 3); audio.sfx('land', { vol: 0.8 }); g.fx.dust(this.x, this.y, 4, NET_R);
        for (const p of g.players) {
          if (!p.hittable || p.out || p.z > 36 || Math.abs(p.x - this.x) > NET_R || Math.abs(p.y - this.y) > 30) continue;
          if (g.mm?.hold?.(p, { by: this, kind: 'net' })) { this.held.push(p); g.fx.word(p.x, p.y, 150, true, 'NETTED!'); }
        }
      }
    } else if (this.phase === 'down') {
      this.held = this.held.filter((p) => g.mm?.holds?.get(p)?.by === this);
      if (this.age > 60 * 5 && !this.held.length || this.age > 60 * 8) this.cut(null);   // (it frays: let go after a while)
    } else if (this.phase === 'cut') {
      if (this.age > 26) { this.alive = false; this.gone = true; }
    }
  }
  drawShadow() {}
  /** the net: a bold ring on the floor (the telegraph: it tightens and blinks, "!" over it), then a bell of rope mesh over whoever it holds */
  draw(ctx) {
    const sx = this.sx, sy = FLOOR_TOP + this.y, t = this.game.time;   // (the floor: the net's own height is this.z, applied to the mesh below)
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const ring = (k, blink) => {   // (a warm yellow disc with a thick ink ring and a white dashed one: unmistakable on any planks)
      ctx.globalAlpha = 0.38 + 0.3 * k; ctx.fillStyle = '#ffcf2a'; ctx.beginPath(); ctx.ellipse(sx, sy, NET_R, NET_R * 0.32, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = blink; ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.beginPath(); ctx.ellipse(sx, sy, NET_R * (1.14 - 0.14 * k), NET_R * 0.32 * (1.14 - 0.14 * k), 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.setLineDash([12, 8]); ctx.stroke(); ctx.setLineDash([]);
    };
    if (this.phase === 'tele' || this.phase === 'fall') {
      const k = this.phase === 'fall' ? 1 : Math.min(1, this.age / NET_TELE), blink = this.phase === 'tele' && this.age > NET_TELE - 22 ? pulse(this.age - NET_TELE + 22) : 1;
      ring(k, blink);
      ctx.globalAlpha = 1; ctx.font = 'bold 46px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 7; ctx.strokeStyle = INK;
      ctx.strokeText('!', sx, sy - 52 + Math.sin(t * 14) * 3); ctx.fillStyle = '#fff2a0'; ctx.fillText('!', sx, sy - 52 + Math.sin(t * 14) * 3);
      if (this.phase === 'tele') { ctx.restore(); return; }
    }
    const fall = this.phase === 'fall', k = fall ? clamp(this.age / NET_DROP, 0, 1) : 1;
    const cut = this.phase === 'cut' ? Math.min(1, this.age / 26) : 0;
    const y = sy - this.z;
    ctx.globalAlpha = cut ? 1 - cut : 1;
    // the bell: an apex over the middle and three rings widening toward the floor; spokes between them; it parts in two when cut
    const R = NET_R * (fall ? 0.7 + 0.3 * k : 1), part = cut * 44;
    const rings = [[0.42, -96], [0.74, -52], [1, -8]];
    for (const half of [-1, 1]) {
      ctx.save(); ctx.translate(half * part, -cut * 10 * half * half); ctx.rotate(half * cut * 0.5);
      ctx.beginPath(); ctx.rect(half < 0 ? sx - R * 2 : sx, y - 140, R * 2, 190); ctx.clip();
      ctx.fillStyle = 'rgba(214,196,150,0.26)'; ctx.beginPath(); ctx.moveTo(sx, y - 108); ctx.lineTo(sx + R, y - 8); ctx.lineTo(sx - R, y - 8); ctx.closePath(); ctx.fill();
      for (const [lw, col] of [[8, INK], [4, '#e6d6a0']]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw;
        for (const [rk, dy] of rings) { ctx.beginPath(); ctx.ellipse(sx, y + dy, R * rk, R * rk * 0.34, 0, 0, TAU); ctx.stroke(); }
        ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ctx.moveTo(sx, y - 108); ctx.lineTo(sx + Math.cos(a) * R, y - 8 + Math.sin(a) * R * 0.34); } ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }
}
void CHARS; void W; void FLOOR_TOP; void baseOf;
