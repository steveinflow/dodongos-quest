// SKULL ISLAND stage 4, "THE SKULL PALACE": MALACHAR (docs/SKULL_ISLAND.md, src/silevels.js sipalace; the book's chapter eight).  The fight in three beats, each one the book's lesson:
//   1  THE FEELINGS (two at a time, so the floor stays readable): Malachar pours his four feelings out of his storm orb and hides behind them -- nothing hurts him yet.
//      RAGE      the cave's calm rule (src/sirage.js RageBeast: poke once and step back; mashing makes it grow)  -> a puppy
//      SADNESS   a droopy blue rain cloud: a blue ring on the floor, then rain; a soaked hero is SAD (held).  A friend stands close and presses ATTACK to SHIELD them
//                (Dodongo's round shield; the others' light umbrella) -- or a lone hero mashes.  Each comfort shrinks the cloud; the last one turns it into a tiny happy cloud and a RAINBOW
//      FEAR      a tall shivering pale-yellow shadow: a yellow ring, then a stare that FREEZES whoever is in it (mash, or a friend's light).  LIGHT (a charged hit, a charged shot, a super) pushes it back
//                and shrinks it -- and then any hit POPS it like a soap bubble
//      SLOTH     a fat grey-green slime: a green ring, then it SWALLOWS a hero.  They mash to wriggle, friends whack it (and flash it with light) -- the hero SPIN-KICKS out and it splats
//   2  MALACHAR HIMSELF ("ENOUGH! I'll finish you MYSELF!"): purple LIGHTNING (a violet lane on the floor first: step out, jump, roll -- or Dodongo blocks it with his shield, "Somebody needs
//      to be a calm little cloud"); at 60% the BEAM CLASH: one caster (Anastasia first) and ANY hero mash ATTACK to push his beam back (a clash always ends: never a loss); then a dizzy spell to hit him;
//   3  at 28% a ROPE drops from the rafters: any hero presses ATTACK beside it and SCARLET swings in -- "Malachar! The princess is HOME!" -- and strikes his mask.  The orb shatters, the mask cracks,
//      he shrinks into a robe pile and a tiny furious PUFFERFISH.  (The bowl is the story's: Dodongo, "Somebody's going in the aquarium.")  The crystal over the throne starts to crack.
// Nobody is hurt for real: bolts only bump, a held hero is never damaged, and every hold ends.
import { Enemy, CHARS } from './enemies.js';
import { SIBoss, siSoftFlash, clipDrawings } from './sibosses.js';
import { krakenPal, testPal } from './sisecrets.js';   // (the Cave's FULL CALM brings the friendly kraken to the beam clash, once per fight)
import { Actor } from './actors.js';
import { SlimePuddle } from './sicell.js';
import { isLight } from './mmworld.js';
import { baseOf } from './heroes.js';
import { audio } from './audio-proxy.js';
import { W, DEPTH, FLOOR_TOP, INK } from './config.js';
import { clamp, TAU } from './rig.js';
import { rimGlow } from './sitele.js';
import * as SIFX from './sifx.js';   // (Book 2's material particles: the FX agent's src/sifx.js)
import { PAL } from './sipalace_layout.js';   // (the King's crystal: the Sad Cloud passes behind it)
const KRAKEN_PAL_SKIN = { skinD: '#7a4a9e', skin: '#c89aec', belly: '#ffe08a' };   // (the friendly kraken's arm in the palace: lilac, gold suckers)

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const lo = (g) => (g.lane ? g.lane[0] : 6), hi = (g) => (g.lane ? g.lane[1] : DEPTH - 6);
const live = (g) => g.players.filter((p) => !p.out && p.alive);
const inEll = (p, cx, cy, rx) => { const ex = (p.x - cx) / rx, ey = (p.y - cy) / (rx * 0.36); return ex * ex + ey * ey <= 1; };
const pressed = (g, p) => { const c = g.app.ctrl(p.ctrlId).pressed; return !!(c.attack || c.jump || c.shoot || c.dodge); };
const pressedAtk = (g, p) => !!g.app.ctrl(p.ctrlId).pressed.attack;
const MAGENTA = '#ff3cd8', VIOLET = '#a050ff';
const HERO_COL = { ana: '#8fd0ff', dodongo: '#ff8a2a', shadow: '#a89aff', scarlet: '#ff6a7a' };

// ------------------------------------------------------------------------------------------------ SADNESS
const SAD = { R: 66, tele: 64, rain: 140, z: 150 };
/** a droopy blue rain cloud: rain on a hero makes them SAD (held); a friend's SHIELD (or a lone hero's mashing) comforts them and the cloud shrinks; comforted enough, it is a tiny happy cloud and a rainbow */
export class SadCloud extends Enemy {
  get flashAlpha() { return siSoftFlash(this); }   // (flash safety: src/sibosses.js)
  constructor(game, x, y, opt = {}) {
    super(game, x, y, { name: opt.name || 'SADNESS' });
    this.art = 'sadcloud'; this.maxHp = this.hp = 100; this.w = 44; this.h = 70; this.shadowR = 54; this.balloonH = 230; this.score = 800;
    this.z = SAD.z; this.sortY = -40; this.entered = true; this.comfort = 0; this.aim = null; this.cool = 420; this.resolved = false; this.shields = []; this.soaked = false; this.lastAt = game.frame; this.told = false;
    this.set('enter');
  }
  get hittable() { return false; }
  takeHit() { return false; }
  get size() { return this.state === 'happy' ? 0.36 : 1 - 0.58 * this.comfort / 100; }
  get raining() { return this.state === 'rain'; }
  get R() { return SAD.R * (0.7 + 0.3 * this.size) + Math.min(90, Math.max(0, (this.game.frame - this.lastAt - 600) / 8)); }   // (it rains wider the longer nobody is comforted: nobody can dodge it for ever)
  update() {
    const g = this.game, m = g.mm, ps = live(g);
    this.tick();
    if (this.cool > 0) this.cool--;
    for (const p of g.players) if (p.sadImmune > 0) p.sadImmune--;
    if (g.cut) return;
    const sad = [...(m?.holds || [])].filter(([, H]) => H.kind === 'sad' && H.by === this);
    // a friend beside a soaked hero presses ATTACK: the shield goes up
    for (const [p] of sad) {
      const fr = ps.find((q) => q !== p && !m.holds.has(q) && q.hittable && Math.abs(q.x - p.x) < 130 && Math.abs(q.y - p.y) < 46 && pressedAtk(g, q));
      if (fr) { this.shield(p, fr); break; }
    }
    for (const s of this.shields) s.t++;
    this.shields = this.shields.filter((s) => s.t < 64);
    switch (this.state) {
      case 'enter': { const t = this.pickTarget(ps); if (t) this.glide(t.x, t.y, 2.4, 1.6); if (this.st > 70 || (t && Math.abs(this.x - t.x) < 40)) { this.set('drift'); this.cool = 40; } break; }
      case 'drift': {
        const t = this.pickTarget(ps);
        if (t) { this.glide(t.x - 10, t.y, 1.25 + 0.5 * (1 - this.size), 0.9); if (this.cool <= 0 && Math.abs(this.x - t.x) < 36 && Math.abs(this.y - t.y) < 26 && !g.cut) { this.set('tele'); this.aim = { x: this.x, y: this.y }; g.fx.alert?.(this); audio.sfx('wind_gust', { pitch: 0.7, vol: 0.5 }); if (!this.told) { this.told = true; m?.hint?.('sipalsad', `A BLUE ring = SADNESS rain. It makes you SAD. || A sad friend? Stand close, press ${m.keyName('attack')}: SHIELD them! || Alone and sad? MASH ${m.keyName('attack')}! || Each comfort shrinks the cloud. Make it HAPPY!`, 560, true); } } }
        break;
      }
      case 'tele': this.vx = this.vy = 0; if (this.st >= SAD.tele) { this.set('rain'); this.soaked = false; audio.sfx('sad_rain'); } break;
      case 'rain':
        this.rainStep(ps, m);
        if (this.st >= SAD.rain) {
          if (!this.soaked && this.comfort < 100) this.addComfort(20, null, 'A LITTLE BRIGHTER...');   // (a rain that fell on nobody still cheers it up a little: dodging for ever is no way to wait)
          if (this.state !== 'happy') { this.set('drift'); this.cool = rnd(70, 110); }
        }
        break;
      case 'happy': {
        this.x += 1.1; this.y += (60 - this.y) * 0.01; this.z += 0.55;
        if (this.st === 1) this.joy();
        if (this.st >= 150 || this.x > g.camX + W + 90) this.finish();
        break;
      }
    }
    if (g.frame - this.lastAt > 1800 && this.state !== 'happy' && !g.cut) { g.fx.label(this.x, this.y, SAD.z + 120, 'IT CRIED ITSELF OUT!', '#ffd0e0', 30, 90); this.addComfort(100, null, ''); }   // (a pity: nobody can dodge a cloud for ever, and a cloud that is never soaked would never end)
    this.clampDepth();
  }
  pickTarget(ps) { const free = ps.filter((p) => !(p.sadImmune > 0)); const pool = free.length ? free : ps; return pool.sort((a, b) => Math.abs(a.x - this.x) + 2 * Math.abs(a.y - this.y) - (Math.abs(b.x - this.x) + 2 * Math.abs(b.y - this.y)))[0] || null; }
  glide(tx, ty, sx, sy) { const dx = tx - this.x, dy = ty - this.y; this.x += clamp(dx, -sx, sx); this.y += clamp(dy, -sy, sy); this.facing = dx >= 0 ? 1 : -1; }
  rainStep(ps, m) {
    const A = this.aim || this, g = this.game;
    for (const p of ps) {
      if (p.sadImmune > 0 || !p.hittable || p.z > 70 || p.state === 'dodge' || m.holds.has(p) || !inEll(p, A.x, A.y, this.R)) continue;
      if (this.shields.some((s) => s.p === p)) continue;
      if (m.hold(p, { by: this, kind: 'sad' })) {
        const T = { dodongo: "I'm okay... I guess...", ana: "What's the point...\nit's all hopeless...", shadow: '...', scarlet: 'Why even try...' };
        g.fx.label(p.x, p.y, 175, (T[baseOf(p.heroId)] || 'So sad...').replace('\n', ' '), '#9fb8e8', 26, 70); audio.sfx('gloom_sad');
        this.lastHold = g.frame; this.soaked = true;
      }
    }
  }
  /** a friend (or the hero themselves, mashing) comforts a soaked hero: the cloud shrinks */
  shield(p, friend) {
    const g = this.game, m = g.mm;
    if (friend) { this.shields.push({ p, q: friend, t: 0 }); p.sadHow = 'shield'; g.say?.(friend, baseOf(friend.heroId) === 'shadow' ? '...' : baseOf(friend.heroId) === 'dodongo' ? "It's okay to be sad.\nWe've GOT you." : 'We have got you!', 110, { villain: false }); }
    m.release(p);
  }
  /** the hold's end (src/siworld.js release): comforted -- by a shield, or by the hero's own mashing / the rain's end */
  onHoldEnd(p, H) {
    const g = this.game;
    if (H.kind !== 'sad') return;
    p.sadImmune = 320; p.inv = Math.max(p.inv, 60);
    const how = p.sadHow; p.sadHow = null;
    this.addComfort(how === 'shield' ? 40 : 26, p, how === 'shield' ? 'SHIELDED!' : 'CHIN UP!');
    g.fx.hearts?.(p.x, p.y, 120, 3); audio.sfx('gloom_cheer');
  }
  addComfort(n, p, label) {
    const g = this.game;
    this.comfort = clamp(this.comfort + n, 0, 100); this.lastAt = g.frame;
    if (label) g.fx.label(this.x, this.y, SAD.z + 110, label, '#ffd0e0', 28, 60);
    g.boss?.progress?.();
    if (this.comfort >= 100 && this.state !== 'happy') { this.set('happy'); this.releaseAll(); }
    else if (this.state === 'rain') { this.set('drift'); this.cool = rnd(110, 150); }
    void p;
  }
  releaseAll() { const m = this.game.mm; for (const [p, H] of [...(m?.holds || [])]) if (H.by === this) { p.sadHow = 'shield'; m.release(p); } }
  joy() {
    const g = this.game;
    g.actors.push(new Rainbow(g, this.x, this.y));
    g.fx.label(this.x, this.y, SAD.z + 120, 'A RAINBOW!', '#ffe9a0', 34, 90); audio.sfx('rainbow'); g.fx.hearts?.(this.x, this.y, SAD.z, 6);
    for (const p of live(g)) { p.hp = Math.min(p.maxHp, p.hp + 12); g.fx.label(p.x, p.y, 170, 'AAAH...', '#bff0ff', 22, 40); }
  }
  finish() {
    if (this.resolved) return;
    this.resolved = true; this.gone = true; this.alive = false; this.game.score += this.score;
    this.game.boss?.beastDone?.('sad');
  }
  drawShadow(ctx) {   // the rain's ring on the floor: blue and dashed while it winds up, a rippling puddle while it falls
    const g = this.game, st = this.state;
    super.drawShadow(ctx);
    if ((st !== 'tele' && st !== 'rain') || !this.aim) return;
    const k = st === 'rain' ? 1 : Math.min(1, this.st / SAD.tele), R = this.R, sx = this.aim.x - g.camX, sy = FLOOR_TOP + this.aim.y, blink = st === 'tele' && this.st > 40 ? pulse(this.st - 40) : 1;
    ctx.save();
    ctx.globalAlpha = 0.26 + 0.3 * k; ctx.fillStyle = 'rgb(90,150,235)'; ctx.beginPath(); ctx.ellipse(sx, sy, R, R * 0.36, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = blink; ctx.strokeStyle = INK; ctx.lineWidth = 7; ctx.beginPath(); ctx.ellipse(sx, sy, R * (1.12 - 0.12 * k), R * 0.36 * (1.12 - 0.12 * k), 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#cfe4ff'; ctx.lineWidth = 3; ctx.setLineDash(st === 'tele' ? [9, 6] : []); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = blink; ctx.font = 'bold 30px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.strokeText('RAIN!', sx, sy - 12); ctx.fillStyle = '#cfe4ff'; ctx.fillText('RAIN!', sx, sy - 12); ctx.globalAlpha = 1;
    if (st === 'rain') for (let i = 0; i < 3; i++) { const u = ((g.time * 1.4 + i / 3) % 1); ctx.strokeStyle = `rgba(220,240,255,${0.7 * (1 - u)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx + (i - 1) * 24, sy + 2, 8 + u * 26, (8 + u * 26) * 0.36, 0, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }
  /** the shields over comforted heroes (Dodongo's round red shield held flat like an umbrella; the others' a glowing umbrella) and the comfort bar over the cloud */
  drawOverMM(ctx) {
    const g = this.game;
    for (const s of this.shields) {
      const p = s.p, q = s.q, a = Math.min(1, s.t / 8) * Math.min(1, (64 - s.t) / 14), sx = (p.sx + q.sx) / 2, sy = Math.min(p.sy, q.sy) - 178;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(sx, sy); ctx.lineJoin = 'round';
      if (baseOf(q.heroId) === 'dodongo') {   // the round wooden shield, a red dragon on it, held flat over both
        ctx.fillStyle = '#7a4a26'; ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(0, 0, 54, 16, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#c8402a'; ctx.beginPath(); ctx.ellipse(0, -2, 30, 8, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e8c070'; ctx.beginPath(); ctx.ellipse(0, -5, 10, 3.4, 0, 0, TAU); ctx.fill();
      } else {   // a dome of light, ribs and a gold tip
        const col = HERO_COL[baseOf(q.heroId)] || '#9fd0ff';
        ctx.fillStyle = col; ctx.globalAlpha = a * 0.55; ctx.beginPath(); ctx.moveTo(-56, 6); ctx.quadraticCurveTo(0, -56, 56, 6); ctx.quadraticCurveTo(28, -4, 0, 6); ctx.quadraticCurveTo(-28, -4, -56, 6); ctx.fill();
        ctx.globalAlpha = a; ctx.strokeStyle = INK; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(-56, 6); ctx.quadraticCurveTo(0, -56, 56, 6); ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(0, -6); ctx.moveTo(-26, -14); ctx.lineTo(-12, 0); ctx.moveTo(26, -14); ctx.lineTo(12, 0); ctx.stroke();
      }
      ctx.restore();
      // the rain bouncing off it
      ctx.save(); ctx.strokeStyle = 'rgba(190,225,255,0.8)'; ctx.lineWidth = 2; for (let i = 0; i < 6; i++) { const u = ((g.time * 2 + i / 6) % 1), x = sx - 50 + i * 20; ctx.globalAlpha = a * (1 - u); ctx.beginPath(); ctx.moveTo(x, sy - 28 + u * 24); ctx.lineTo(x + 5 + u * 8, sy - 36 + u * 20); ctx.stroke(); } ctx.restore();
    }
    if (this.state !== 'happy' && this.comfort > 0) {
      let sx = this.sx; const sy = Math.max(126, this.sy - 120 * this.size - 36), w = 62, f = this.comfort / 100;
      if (g.L?.palace) { const kx = PAL.CRYSTAL_X - g.camX; if (Math.abs(sx - kx) < 50 + w / 2 + 4 && sy + 9 > PAL.CRYSTAL_Y - 80 && sy - 2 < PAL.CRYSTAL_Y + 20) sx = kx + (sx >= kx ? 1 : -1) * (50 + w / 2 + 4); }   // (its comfort bar beside the King's head, never on it -- QAF3)
      ctx.save(); ctx.fillStyle = INK; ctx.fillRect(sx - w / 2 - 2, sy - 2, w + 4, 11); ctx.fillStyle = '#34405a'; ctx.fillRect(sx - w / 2, sy, w, 7); ctx.fillStyle = '#ff9ab8'; ctx.fillRect(sx - w / 2, sy, w * f, 7); ctx.restore();
    }
  }
  drawOpts() { return { ...super.drawOpts(), scale: 1, size: this.size, rain: this.raining ? 1 : this.state === 'tele' ? 0.25 : this.state === 'happy' ? 0.7 : 0.16, mood: this.state === 'happy' ? 1 : this.comfort / 140 }; }
  pose() {
    const g = this.game, st = this.state;
    if (st === 'happy') return this.anim('happy', g.time);
    if (st === 'rain') return this.anim([...(g.mm?.holds || [])].some(([, H]) => H.by === this) ? 'sob' : 'rain', g.time);
    if (st === 'tele') return this.anim('rain', g.time);
    return this.anim('drift', g.time);
  }
  draw(ctx) {
    if (this.gone) return;
    const g = this.game, kx = PAL.CRYSTAL_X - g.camX;
    // (a stop-gap, the anim audit #15: a soft bob and squash while it drifts -- off by itself once painter 2's doubled drift lands)
    if (this.state !== 'happy' && !this.bobbing && clipDrawings(this.art, 'drift') <= 4) {   // (4 drawings today; painter 2's doubled drift: off)
      const b = Math.sin(g.time * 2.1 + this.x * 0.01), sx = this.sx, sy = this.sy;
      ctx.save(); ctx.translate(sx, sy - 5 * b); ctx.scale(1 + 0.03 * b, 1 - 0.03 * b); ctx.translate(-sx, -sy);
      this.bobbing = true;
      try { this.draw(ctx); } finally { this.bobbing = false; ctx.restore(); }
      return;
    }
    if (g.L?.palace && Math.abs(this.sx - kx) < 200) {   // (QAF3: it floated in front of the King's crystal at 1P -- the crystal hangs in front of it: the cloud is drawn with the gem's shape cut out)
      const C = [[0, -128], [44, -86], [56, 0], [44, 92], [0, 138], [-44, 92], [-56, 0], [-44, -86]], s = 0.8, cy = PAL.CRYSTAL_Y;   // (src/stages/sipalace.js drawCrystal's gem at 0.78 -- 0.8 keeps its ink outline whole)
      ctx.save(); ctx.beginPath(); ctx.rect(-4000, -4000, 8000 + W, 8000);
      ctx.moveTo(kx + C[0][0] * s, cy + C[0][1] * s); for (let i = 1; i < C.length; i++) ctx.lineTo(kx + C[i][0] * s, cy + C[i][1] * s); ctx.closePath();
      ctx.clip('evenodd'); super.draw(ctx); ctx.restore();
    } else super.draw(ctx);
  }
}

/** the rainbow a comforted cloud leaves: an arc over the heroes that fades out */
class Rainbow extends Actor {
  constructor(game, x, y) { super(game, x, y); this.team = 'fx'; this.solid = false; this.life = 170; this.cx = clamp(x, game.camX + 220, game.camX + W - 220); this.sortY = -50; this.shadowR = 0; }
  get hittable() { return false; }
  update() { this.tick(); if (this.st === 1) SIFX.sparkles(this.cx, this.y, 150, 8); if (this.st >= this.life) this.gone = true; }
  drawShadow() {}
  draw(ctx) {
    const g = this.game, k = Math.min(1, this.st / 24) * Math.min(1, (this.life - this.st) / 40), sx = this.cx - g.camX, base = FLOOR_TOP + 40;
    ctx.save(); ctx.globalAlpha = 0.8 * k; ctx.lineCap = 'round';
    const cols = ['#ff6a6a', '#ffb44a', '#ffe85a', '#7ed87a', '#6ab4ff', '#9a7aff'];
    cols.forEach((c, i) => { ctx.strokeStyle = c; ctx.lineWidth = 10; ctx.beginPath(); ctx.ellipse(sx, base, 290 - i * 9, (170 - i * 6) * Math.min(1, this.st / 30 + 0.3), 0, Math.PI, TAU); ctx.stroke(); });
    ctx.restore();
  }
}

// ------------------------------------------------------------------------------------------------ FEAR
const FEAR = { R: 104, tele: 56, stare: 16, shrinkAt: 56, light: 56 };
/** a tall shivering yellow shadow: a ring, then a stare that FREEZES; LIGHT pushes it back and shrinks it; then any hit pops it */
export class FearShade extends Enemy {
  get flashAlpha() { return siSoftFlash(this); }
  constructor(game, x, y, opt = {}) {
    super(game, x, y, { name: opt.name || 'FEAR' });
    this.art = 'fearshade'; this.maxHp = this.hp = 100; this.fear = 100; this.w = 26; this.h = 150; this.shadowR = 46; this.balloonH = 210; this.score = 800;
    this.entered = true; this.cool = 300; this.resolved = false; this.told = false; this.lightAt = -99; this.puffAt = -99; this.rear = 0; this.lastProg = game.frame;
    this.set('rise');
  }
  get size() { return 0.34 + 0.66 * clamp(this.fear / 100, 0, 1); }
  get shrunk() { return this.fear <= FEAR.shrinkAt; }
  get hittable() { return this.alive && !['rise', 'pop'].includes(this.state); }
  update() {
    const g = this.game, m = g.mm, ps = live(g), sz = this.size;
    this.tick();
    if (this.cool > 0) this.cool--;
    this.w = 24 * sz + 8; this.h = 160 * sz; this.balloonH = 200 * sz + 30; this.shadowR = 46 * (0.6 + 0.4 * sz);
    if (g.cut) return;
    if (this.shrunk && this.state !== 'pop') this.fear = Math.min(100, this.fear + 0.024);   // (it slowly finds its nerve again: hit it while it is small!)
    else if (!this.shrunk && g.frame - this.lastProg > 1500 && this.state !== 'rise') this.fear = Math.max(FEAR.shrinkAt - 1, this.fear - 0.14);   // (a pity: after 25 s with no progress the light of Anastasia's crystal reaches it)
    // a frozen hero whose shade is gone: free
    switch (this.state) {
      case 'rise': this.vx = this.vy = 0; if (this.st === 1) { g.fx.dust?.(this.x, this.y, 5, 24); audio.sfx('wind_gust', { pitch: 0.5, vol: 0.5 }); } if (this.st >= 40) this.set('wait'); break;
      case 'wait': case 'approach': {
        const p = this.nearest(ps);
        if (!p) break;
        this.facing = p.x > this.x ? 1 : -1;
        const dx = Math.abs(p.x - this.x);
        if (this.cool <= 0 && dx < FEAR.R + 70 && Math.abs(p.y - this.y) < 60 && !g.cut) { this.set('tele'); g.fx.alert?.(this); audio.sfx('shade_shiver'); this.hint(m); break; }
        const sp = this.shrunk ? 0.5 : 0.95;
        this.x += clamp(p.x - this.x - Math.sign(p.x - this.x) * (FEAR.R - 22), -sp, sp) * (dx > FEAR.R - 26 ? 1 : 0);
        this.y += clamp(p.y - this.y, -0.6, 0.6);
        this.set(dx > FEAR.R - 26 ? 'approach' : 'wait');
        break;
      }
      case 'tele': this.vx = this.vy = 0; if (this.st >= FEAR.tele) { this.set('stare'); this.stare(ps, m); } break;
      case 'stare': if (this.st >= FEAR.stare) { this.set('wait'); this.cool = rnd(120, 170); } break;
      case 'push': this.x += this.vx; this.vx *= 0.9; if (this.st >= 44) { this.set('wait'); this.cool = Math.max(this.cool, 90); } break;
      case 'pop': if (this.st >= 26) { this.gone = true; this.finish(); } break;
    }
    this.x = clamp(this.x, g.camX + 40, g.camX + W - 40);
    this.clampDepth();
  }
  nearest(ps) { return ps.sort((a, b) => Math.abs(a.x - this.x) + 2 * Math.abs(a.y - this.y) - (Math.abs(b.x - this.x) + 2 * Math.abs(b.y - this.y)))[0] || null; }
  hint(m) {
    if (this.told || !m) return; this.told = true;
    m.hint('sipalfear', `FEAR! A YELLOW ring = a FREEZING stare. || JUMP or ROLL out of it! || Frozen? MASH ${m.keyName('attack')}! || HOLD ${m.keyName('attack')}, let go: LIGHT shrinks it! || Small now? Any hit POPS it!`, 600, true);
  }
  /** the stare: whoever is in the ring (and not jumping or rolling) is frozen with fear */
  stare(ps, m) {
    const g = this.game;
    audio.sfx('swing_heavy', { pitch: 1.6, vol: 0.5 }); g.shake = Math.max(g.shake, 3);
    g.fx.ring(this.x, this.y, { rx: FEAR.R * (0.7 + 0.3 * this.size), ry: FEAR.R * 0.36 * (0.7 + 0.3 * this.size), shock: true, col: '#f0e060', life: 20 });
    for (const p of ps) {
      if (!p.hittable || p.z > 40 || p.state === 'dodge' || m.holds.has(p) || !inEll(p, this.x, this.y, FEAR.R * (0.7 + 0.3 * this.size))) continue;
      if (m.hold(p, { by: this, kind: 'frozen' })) { g.fx.label(p.x, p.y, 175, baseOf(p.heroId) === 'scarlet' ? '...I cannot move...' : 'FROZEN!', '#f2e87a', 28, 70); }
    }
  }
  /** light! it recoils: the ring of frozen heroes thaws */
  recoil(att) {
    const g = this.game, m = g.mm, dir = att && att.x > this.x ? -1 : 1;
    this.fear = Math.max(0, this.fear - FEAR.light); this.lightAt = g.frame; this.reset('push'); this.vx = dir * 3.4; this.cool = 140;
    g.fx.label(this.x, this.y, 150 * this.size + 40, 'LIGHT! IT RECOILS!', '#fff6b0', 30, 70); g.fx.flare?.(this.x, this.y, 80, 130, 20, '#fff6c0'); audio.sfx('charge_full', { pitch: 1.2, vol: 0.7 });
    for (const [p, H] of [...(m?.holds || [])]) if (H.by === this) { m.release(p); g.fx.label(p.x, p.y, 170, 'THAWED!', '#fff6b0', 24, 50); p.inv = Math.max(p.inv, 40); }
    g.boss?.progress?.();
    if (att && baseOf(att.heroId) === 'ana') g.say?.(att, "You are NOT alone!\nLight is with you.", 110, { villain: false });
    if (this.fear <= 0) this.pop(att);
  }
  takeHit(att, hd) {
    if (!this.hittable) return false;
    const g = this.game;
    if (isLight(att, hd) || (hd.shot && hd.charged)) { if (g.frame - this.lightAt > 22) { this.recoil(att); } return true; }
    if (this.shrunk) { this.pop(att); return true; }
    this.fear = Math.max(0, this.fear - 6); this.lastProg = g.frame; g.boss?.progress?.();   // (courage: every plain hit chips it, so a masher gets there too)
    if (g.frame - this.puffAt > 40) { this.puffAt = g.frame; g.fx.label(this.x, this.y, 130, this.fear <= FEAR.shrinkAt ? 'IT IS SHRINKING!' : 'BRAVER...', '#f2e87a', 24, 40); g.fx.spark?.(this.x, this.y, 70, false, 'warm'); if (!this.hintedLight) { this.hintedLight = true; g.mm?.hint?.('sifearlight', `Every hit makes you BRAVER: it shrinks! || HOLD ${g.mm.keyName('attack')}, let go: LIGHT shrinks it FAST!`, 360, true); } }
    return true;
  }
  /** shrunk, a brave hit pops it like a soap bubble */
  pop(att) {
    if (this.state === 'pop') return;
    const g = this.game;
    this.set('pop'); this.alive = false; this.vx = 0;
    for (const [p, H] of [...(g.mm?.holds || [])]) if (H.by === this) g.mm.release(p);
    g.fx.word(this.x, this.y, 120, true, 'POP!'); g.fx.spark?.(this.x, this.y, 80, true, 'gold'); audio.sfx('shade_pop');
    if (att && baseOf(att.heroId) === 'scarlet') g.say?.(att, "I'm scared...\nbut I'm not RUNNING!", 120, { villain: false });
    else g.fx.label(att ? att.x : this.x, att ? att.y : this.y, 190, 'BRAVE!', '#ffe9a0', 30, 60);
    g.score += this.score;
  }
  finish() {
    if (this.resolved) return;
    this.resolved = true; this.alive = false; this.game.fx.poof?.(this.x, this.y, 30, false);
    this.game.boss?.beastDone?.('fear');
  }
  drawShadow(ctx) {
    const g = this.game, st = this.state;
    super.drawShadow(ctx);
    if (st !== 'tele' && st !== 'stare') return;
    const k = st === 'stare' ? 1 : Math.min(1, this.st / FEAR.tele), R = FEAR.R * (0.7 + 0.3 * this.size), sx = this.sx, sy = FLOOR_TOP + this.y, blink = st === 'tele' && this.st > 36 ? pulse(this.st - 36) : 1;
    ctx.save();
    ctx.globalAlpha = 0.26 + 0.3 * k; ctx.fillStyle = 'rgb(235,220,70)'; ctx.beginPath(); ctx.ellipse(sx, sy, R, R * 0.36, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = blink; ctx.strokeStyle = INK; ctx.lineWidth = 8; ctx.beginPath(); ctx.ellipse(sx, sy, R * (1.12 - 0.12 * k), R * 0.36 * (1.12 - 0.12 * k), 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#fff6a0'; ctx.lineWidth = 3.4; ctx.setLineDash([10, 7]); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = blink; ctx.font = 'bold 34px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.strokeText('BOO!', sx, sy - 12); ctx.fillStyle = '#fff6a0'; ctx.fillText('BOO!', sx, sy - 12);
    ctx.restore();
    void g;
  }
  /** COURAGE: how brave the heroes have made themselves (it shrinks as the bar fills).  Drawn in the HUD pass (src/siworld.js drawHud's
   *  drawCard loop: after the actors and the words -- a hero walking by drew over its left end), under the world's punch-in so it stays on
   *  the shade; and its box an 'avoid' keep-out for the fx words (src/fx.js keepOut: they step round it -- DRAGON SLAM! landed on it) -- QAF3 */
  drawCard(ctx) {
    const g = this.game;
    if (!(this.alive && this.fear < 100 && this.state !== 'rise' && !g.cut)) return;
    const sx = this.sx, sy = Math.max(132, this.sy - 170 * this.size - 30), w = 74, f = clamp((100 - this.fear) / 100, 0, 1);   // (the FX agent's QAF3 fix: the label read ~8 px at 4P -- 19 px now, its top at ~sy - 21, under a 4P HUD band)
    g.fx.keepOut?.([sx - w / 2 - 6, sy - 26, sx + w / 2 + 6, sy + 15], 3, true);
    ctx.save();
    const Z = g.zoomK || 1, S = g.slow;   // (a super's punch-in zooms the world, not the HUD: the meter keeps to the shade -- through a cut-in too, as the world does now)
    if (Z > 1.001 && S) { const fx = S.x - g.camX, fy = FLOOR_TOP + S.y - S.z; ctx.translate(fx, fy); ctx.scale(Z, Z); ctx.translate(-fx, -fy); }
    ctx.fillStyle = INK; ctx.fillRect(sx - w / 2 - 2, sy - 2, w + 4, 13); ctx.fillStyle = '#34405a'; ctx.fillRect(sx - w / 2, sy, w, 9); ctx.fillStyle = '#8fd0ff'; ctx.fillRect(sx - w / 2, sy, w * f, 9);
    ctx.font = 'bold 19px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.strokeText('COURAGE', sx, sy - 7); ctx.fillStyle = '#e8f4ff'; ctx.fillText('COURAGE', sx, sy - 7);
    ctx.restore();
  }
  /** a frozen hero's shiver: pale shake lines round them */
  drawOverMM(ctx) {
    const g = this.game;
    for (const [p, H] of g.mm?.holds || []) {
      if (H.by !== this) continue;
      ctx.save(); ctx.strokeStyle = 'rgba(245,232,110,0.85)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + g.time * 0.5, rx = 40 + 4 * Math.sin(g.time * 40 + i), x = p.sx + Math.cos(a) * rx, y = p.sy - 80 + Math.sin(a) * 70; ctx.beginPath(); ctx.moveTo(x - 4, y - 6); ctx.lineTo(x + 3 * Math.sin(g.time * 60 + i), y + 6); ctx.stroke(); }
      ctx.restore();
    }
  }
  drawOpts() { return { ...super.drawOpts(), scale: 1, size: this.size, shiver: this.state === 'push' ? 1 : this.shrunk ? 0.8 : 0 }; }
  pose() {
    const g = this.game, st = this.state;
    switch (st) {
      case 'rise': return this.anim('loom', Math.min(1, this.st / 40));
      case 'tele': return this.st < 30 ? this.anim('loom', Math.min(1, this.st / 30)) : this.anim('stare', g.time);   // (loom up, then BOO: both hands up by its head -- then the lunge)
      case 'stare': return this.anim('lunge', Math.min(1, this.st / FEAR.stare));
      case 'push': return this.anim('push', Math.min(1, this.st / 44));
      case 'pop': return this.anim('pop', Math.min(1, this.st / 26));
      default: return this.shrunk ? this.anim('hurt', g.time) : this.anim('idle', g.time);
    }
  }
  draw(ctx) {
    if (this.gone) return;
    if (this.state === 'rise') { ctx.save(); ctx.beginPath(); ctx.rect(-50, -50, W + 100, FLOOR_TOP + this.y + 8 + 50); ctx.clip(); super.draw(ctx); ctx.restore(); return; }   // (it rises out of the floor)
    super.draw(ctx);
  }
}

// ------------------------------------------------------------------------------------------------ SLOTH
const LUMP = { hp: 46, sp: 0.62, R: 76, tele: 54, groggy: 200, chew: 760, scale: 2.5 };
/** a fat sleepy grey-green slime: a green ring, then it SWALLOWS a hero; they mash, friends whack it; they SPIN-KICK out and it splats into puddles */
export class SlothLump extends Enemy {
  get flashAlpha() { return siSoftFlash(this); }
  constructor(game, x, y, opt = {}) {
    super(game, x, y, { name: opt.name || 'SLOTH' });
    this.art = 'slime'; this.hp = this.maxHp = LUMP.hp; this.scale = LUMP.scale; this.w = 62; this.h = 100; this.shadowR = 96; this.balloonH = 190; this.score = 800;
    this.entered = true; this.cool = 640; this.rescue = 0; this.swallowed = null; this.aim = null; this.resolved = false; this.told = false; this.chewT = 0; this.lastMash = 0; this.groggyT = 0; this.lightAt = -99; this.hitAt = -99;
    this.facing = 1; this.set('rise');
  }
  get hittable() { return this.alive && !['rise', 'splat'].includes(this.state); }
  get groggy() { return this.state === 'groggy'; }
  update() {
    const g = this.game, ps = live(g), solo = ps.length < 2;
    this.tick();
    if (this.cool > 0) this.cool--;
    if (g.cut) return;
    switch (this.state) {
      case 'rise': this.vx = this.vy = 0; if (this.st === 1) { audio.sfx('knockdown', { pitch: 0.5, vol: 0.6 }); g.fx.dust?.(this.x, this.y, 6, 40); } if (this.st >= 70) this.set('ooze'); break;
      case 'ooze': {
        const p = ps.sort((a, b) => Math.abs(a.x - this.x) + 2 * Math.abs(a.y - this.y) - (Math.abs(b.x - this.x) + 2 * Math.abs(b.y - this.y)))[0];
        if (!p) break;
        this.facing = p.x > this.x ? 1 : -1;
        const dx = Math.abs(p.x - this.x);
        if (this.cool <= 0 && dx < 190 && Math.abs(p.y - this.y) < 50 && !g.cut) { this.set('gulpWind'); this.aim = { x: p.x, y: p.y }; this.gulpTarget = p; g.fx.alert?.(this); audio.sfx('sloth_inhale'); this.hint(); break; }
        this.x += clamp(p.x - this.x, -LUMP.sp, LUMP.sp) * (dx > 80 ? 1 : 0); this.y += clamp(p.y - this.y, -0.4, 0.4);
        break;
      }
      case 'gulpWind': { const t = this.gulpTarget; if (this.st < LUMP.tele - 26 && t && t.alive && !t.out) this.aim = { x: t.x, y: t.y }; if (this.st >= LUMP.tele) { this.set('gulp'); this.gulp(); } break; }
      case 'gulp': if (this.st >= 26) { if (this.swallowed) { this.set('chew'); this.chewT = 0; } else if (this.state === 'gulp') { this.set('groggy'); this.groggyT = LUMP.groggy; } } break;
      case 'chew': this.stepChew(solo); break;
      case 'groggy': if (this.st >= this.groggyT) { this.set('ooze'); this.cool = 100; g.fx.word(this.x, this.y, 160, true, 'WAKING UP!'); } break;
      case 'splat': if (this.st >= 40) { this.gone = true; this.finish(); } break;
    }
    this.x = clamp(this.x, g.camX + 60, g.camX + W - 60);
    this.clampDepth();
  }
  hint() {
    const g = this.game, m = g.mm;
    if (this.told || !m) return; this.told = true;
    m.hint('sipalsloth', `SLOTH! GREEN ring = a GULP: ROLL out! || Swallowed? MASH ${m.keyName('attack')} to get out!${live(g).length > 1 ? ' || Friends: whack it, or FLASH it!' : ''}`, 480, true);
  }
  gulp() {
    const g = this.game, A = this.aim || this;
    audio.sfx('swing_heavy', { pitch: 0.4, vol: 0.9 }); g.shake = Math.max(g.shake, 6);
    const hits = live(g).filter((p) => p.hittable && p.state !== 'dodge' && p.z < 40 && inEll(p, A.x, A.y, LUMP.R)).sort((a, b) => Math.hypot(a.x - A.x, (a.y - A.y) * 2.4) - Math.hypot(b.x - A.x, (b.y - A.y) * 2.4));
    if (!hits.length) { g.fx.word(A.x, A.y, 140, true, 'MISSED!'); g.fx.word(this.x, this.y, 190, true, 'STUCK! HIT IT!'); this.set('groggy'); this.groggyT = LUMP.groggy; return; }
    this.swallow(hits[0]);
  }
  swallow(p) {
    const g = this.game, m = g.mm;
    if (!m || !m.hold(p, { by: this, kind: 'swallow' })) return;
    this.swallowed = p; this.rescue = 0; this.chewT = 0; this.lastMash = 0;
    g.fx.word(p.x, p.y, 150, true, 'GULP!'); audio.sfx('sloth_gulp'); g.shake = Math.max(g.shake, 6);
    p.x = this.x; p.y = this.y + 1; p.z = 50;
    const friends = live(g).filter((q) => q !== p).length;
    m.hint(friends ? 'sirescue' : 'sirescue1', friends ? `A friend is SWALLOWED! || WHACK the slime! Flash it with LIGHT! || The swallowed hero: MASH ${m.keyName('attack')}!` : `SWALLOWED! MASH ${m.keyName('attack')} to wriggle free!`, 420, true);
  }
  stepChew(solo) {
    const g = this.game, p = this.swallowed;
    if (!p || p.out || !p.alive) { this.swallowed = null; this.set('groggy'); this.groggyT = LUMP.groggy; return; }
    const H = g.mm?.holds?.get(p);
    if (!H) { this.spitOut(false); return; }
    if (this.chewT === 0) this.chewF = g.frame - 1;
    this.chewT += g.frame - (this.chewF ?? g.frame - 1); this.chewF = g.frame;   // (wall time: a co-op hit-pause no longer stretches the chew -- QA2 M1)
    const dm = H.mash - this.lastMash; this.lastMash = H.mash;
    if (dm > 0) this.rescue = Math.min(100, this.rescue + dm * (solo ? 15 : 10));
    p.x = this.x + Math.sin(g.time * 3) * 6; p.y = this.y + 1; p.z = 50 + 5 * Math.sin(g.time * 4); p.vx = p.vy = 0; p.inv = Math.max(p.inv, 3); p.facing = this.x < g.camX + W / 2 ? 1 : -1;
    if (this.rescue >= 100) this.spinOut(p);
    else if (this.chewT > LUMP.chew) { g.fx.word(this.x, this.y, 190, true, 'BLEH! TOO CHEWY!'); this.spitOut(true); }
  }
  /** the hero spin-kicks out and the slime splats */
  spinOut(p) {
    const g = this.game, m = g.mm;
    this.swallowed = null; this.rescue = 0;
    if (p && m?.holds?.has(p)) m.release(p);
    const dir = p && p.x < g.camX + W / 2 ? 1 : -1;
    if (p && !p.out) { p.x = clamp(this.x + dir * 130, g.camX + 60, g.camX + W - 60); p.y = clamp(this.y + 14, lo(g), hi(g)); p.z = 20; p.knock?.(dir, 5, 4.2); p.inv = Math.max(p.inv, 90); g.fx.label(p.x, p.y, 175, baseOf(p.heroId) === 'shadow' ? 'SPIN-KICK!' : 'BREAK OUT!', '#ffe9a0', 34, 70); g.fx.hearts?.(p.x, p.y); }
    m?.clearHint?.('sirescue', 'sirescue1');
    this.splat();
  }
  spitOut(groggy) {
    const g = this.game, p = this.swallowed, m = g.mm;
    this.swallowed = null; this.rescue = 0;
    if (p && m?.holds?.has(p)) m.release(p);
    if (p && !p.out) { const dir = p.x < g.camX + W / 2 ? 1 : -1; p.x = clamp(this.x + dir * 130, g.camX + 60, g.camX + W - 60); p.y = clamp(this.y + 14, lo(g), hi(g)); p.z = 10; p.knock?.(dir, 5, 4.2); p.inv = Math.max(p.inv, 90); g.fx.word(p.x, p.y, 150, true, 'PTOOEY!'); }
    this.set('groggy'); this.groggyT = LUMP.groggy; void groggy;
    m?.clearHint?.('sirescue', 'sirescue1');
  }
  splat() {
    if (this.state === 'splat') return;
    const g = this.game;
    this.set('splat'); this.alive = false; this.hp = 0;
    g.fx.word(this.x, this.y, 180, true, 'SPLOOOSH!'); audio.sfx('slime_splat'); g.shake = Math.max(g.shake, 8);
    for (let i = 0; i < 5; i++) g.actors.push(new SlimePuddle(g, this.x + rnd(-110, 110), clamp(this.y + rnd(-20, 40), 8, DEPTH - 8), rnd(0.9, 1.6)));
    g.score += this.score;
  }
  finish() { if (this.resolved) return; this.resolved = true; this.game.boss?.beastDone?.('sloth'); }
  takeHit(att, hd) {
    if (!this.hittable) return false;
    const g = this.game;
    this.flash = 4;
    if (this.swallowed) {   // the rescue: whacks and light
      if (g.frame - this.hitAt > 8) { this.hitAt = g.frame; this.rescue = Math.min(100, this.rescue + 14); g.fx.word(this.x + rnd(-30, 30), this.y, 110, false, pick(['WHACK!', 'BONK!', 'SPLORCH!'])); audio.sfx('hit_light', { pitch: 0.6, vol: 0.6 }); }
      if (isLight(att, hd) && g.frame - this.lightAt > 40) { this.lightAt = g.frame; this.rescue = Math.min(100, this.rescue + 30); g.fx.label(this.x, this.y, 150, 'FLASH! IT SQUINTS!', '#ffe9a0', 26, 60); }
      return true;
    }
    const d = Math.max(1, Math.round(hd.dmg * (this.groggy ? 0.8 : 0.2)));
    this.hp = Math.max(0, this.hp - d); this.hitAt = g.frame;
    if (!hd.quiet) audio.sfx('hit_slime', { pitch: 0.8 });
    if (d > 0 && this.groggy && g.frame % 6 === 0) g.fx.word(this.x + rnd(-30, 30), this.y, 130, false, pick(['SPLORCH!', 'BLORP!', 'SQUISH!']));
    if (this.hp <= 0) this.splat();
    g.engage?.(this);
    return true;
  }
  drawShadow(ctx) {
    const st = this.state;
    super.drawShadow(ctx);
    if ((st !== 'gulpWind' && st !== 'gulp') || !this.aim) return;
    const g = this.game, k = st === 'gulp' ? 1 : Math.min(1, this.st / LUMP.tele), R = LUMP.R, sx = this.aim.x - g.camX, sy = FLOOR_TOP + this.aim.y, blink = this.st > 34 && st === 'gulpWind' ? pulse(this.st - 34) : 1;
    ctx.save();
    ctx.globalAlpha = 0.3 + 0.32 * k; ctx.fillStyle = 'rgb(110,230,100)'; ctx.beginPath(); ctx.ellipse(sx, sy, R, R * 0.36, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = blink; ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.beginPath(); ctx.ellipse(sx, sy, R * (1.14 - 0.14 * k), R * 0.36 * (1.14 - 0.14 * k), 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#d8ffb0'; ctx.lineWidth = 4; ctx.setLineDash([10, 7]); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = blink; ctx.font = 'bold 36px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.strokeText('GULP!', sx, sy - 12); ctx.fillStyle = '#d8ffb0'; ctx.fillText('GULP!', sx, sy - 12);
    ctx.restore();
  }
  /** the swallowed hero inside a green jelly bubble, and the rescue bar */
  drawOverMM(ctx) {
    const g = this.game;
    if (!this.swallowed || g.cut) return;
    const p = this.swallowed, sx = p.sx, sy = p.sy - 56, a = 0.4 + 0.08 * Math.sin(g.time * 4);
    ctx.save(); const gr = ctx.createRadialGradient(sx - 14, sy - 22, 6, sx, sy, 78); gr.addColorStop(0, `rgba(190,255,180,${a * 0.5})`); gr.addColorStop(0.7, `rgba(120,215,120,${a})`); gr.addColorStop(1, `rgba(70,170,90,${a + 0.2})`);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(sx, sy, 56, 80, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(30,90,50,0.75)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(sx - 24, sy - 40, 9, 20, -0.4, 0, TAU); ctx.fill();
    for (let i = 0; i < 4; i++) { const u = ((g.time * 0.5 + i * 0.25) % 1); ctx.fillStyle = `rgba(230,255,225,${0.7 * (1 - u)})`; ctx.beginPath(); ctx.arc(sx + Math.sin(i * 2.3 + g.time) * 26, sy + 60 - u * 120, 3 + 2 * (i % 2), 0, TAU); ctx.fill(); }
    ctx.restore();
    const bx = this.sx, by = this.sy - 168, w = 150, f = this.rescue / 100;
    ctx.save(); ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.font = 'bold 24px Bangers, Impact, sans-serif'; ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.strokeText('RESCUE!', bx, by - 6); ctx.fillStyle = '#ffd24a'; ctx.fillText('RESCUE!', bx, by - 6);
    ctx.fillStyle = INK; ctx.fillRect(bx - w / 2 - 3, by, w + 6, 16); ctx.fillStyle = '#2a3a30'; ctx.fillRect(bx - w / 2, by + 3, w, 10);
    const gg = ctx.createLinearGradient(bx - w / 2, 0, bx + w / 2, 0); gg.addColorStop(0, '#6ad060'); gg.addColorStop(1, '#ffe066'); ctx.fillStyle = gg; ctx.fillRect(bx - w / 2, by + 3, w * f, 10);
    ctx.restore();
  }
  drawOpts() { return { ...super.drawOpts(), beast: true }; }
  pose() {
    const g = this.game, st = this.state;
    switch (st) {
      case 'rise': return this.anim('rise', Math.min(1, this.st / 70));
      case 'gulpWind': return this.anim('gulpWind', Math.min(1, this.st / LUMP.tele));
      case 'gulp': return this.anim('gulp', Math.min(1, this.st / 26));
      case 'chew': return this.anim('chew', g.time);
      case 'groggy': return this.anim('groggy', g.time);
      case 'splat': return this.anim('defeat', Math.min(1, this.st / 36));
      default: return this.anim('idle', g.time * 0.8);
    }
  }
  draw(ctx) {
    if (this.gone) return;
    this.mem.frame = this.game.frame;
    if (this.state === 'rise') { ctx.save(); ctx.beginPath(); ctx.rect(-50, -50, W + 100, FLOOR_TOP + this.y + 14 + 50); ctx.clip(); super.draw(ctx); ctx.restore(); }
    else { if (this.state === 'gulpWind') rimGlow(ctx, this, '#ffa04a', 0.3 + 0.4 * Math.min(1, this.st / 30)); super.draw(ctx); }   // (its gulp's wind-up: the Beast's warm rim)
  }
}

// ------------------------------------------------------------------------------------------------ the finale's props
/** the rope that drops from the rafters (Shadow's, in the book): hangs; a hero's ATTACK beside it hands the swing to Scarlet */
class RafterRope extends Actor {
  constructor(game, x, y, boss) {
    super(game, x, y);
    this.team = 'fx'; this.solid = false; this.boss = boss; this.shadowR = 0; this.sortY = 400; this.carrier = null; this.grabbed = false; this.drop = 0; this.w = 0; this.h = 0;
  }
  get hittable() { return false; }
  update() {
    const g = this.game, B = this.boss;
    this.tick(); this.drop = Math.min(1, this.st / 34);
    if (this.st === 2) { audio.sfx('wind_gust', { pitch: 1.3, vol: 0.6 }); }
    if (this.st === 34) { audio.sfx('land', { vol: 0.5 }); g.fx.dust?.(this.x, this.y, 4, 16); }
    if (this.grabbed || !B || B.state !== 'ropeWait' || g.cut) return;
    if (this.st >= 60) for (const p of live(g)) if (Math.abs(p.x - this.x) < 90 && Math.abs(p.y - this.y) < 46 && p.hittable && pressedAtk(g, p)) { this.grabbed = true; B.ropeGrabbed(p); break; }   // (after its drop has played a second, as the hit path: QAF M-C)
    // (QA2 M8: a hero who simply stands by it -- within ~150 px -- for half a second grabs it too)
    const by = this.drop >= 1 && !this.grabbed ? live(g).find((p) => Math.abs(p.x - this.x) < 150 && Math.abs(p.y - this.y) < 60 && p.hittable) : null;
    this.nearT = by ? (this.nearT || 0) + 1 : 0;
    if (by && this.nearT >= 30) { this.grabbed = true; B.ropeGrabbed(by); }
  }
  get tipY() { return FLOOR_TOP + this.y - 120; }
  drawShadow() {}
  draw(ctx) {
    const g = this.game, sx = this.x - g.camX, sway = Math.sin(g.time * 1.8) * 5 * (this.carrier ? 0 : 1);
    let ex = sx + sway, ey = lerpY(-30, this.tipY, this.drop);
    if (this.carrier) { ex = this.carrier.sx + 8; ey = this.carrier.sy - 150; }
    const ax = sx;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // (QAF: a painted rope, not a pole -- hanging with a little slack (taut while carried), its strands twisted, a knot above the loop)
    const ay = -30, slack = this.carrier ? 0 : 7 + sway * 1.4, mx = (ax + ex) / 2, my = (ay + ey) / 2, ln = Math.hypot(ex - ax, ey - ay) || 1, nx = -(ey - ay) / ln, ny = (ex - ax) / ln;
    const cx = mx + nx * slack, cy = my + ny * slack, at = (u) => { const v = 1 - u; return [v * v * ax + 2 * v * u * cx + u * u * ex, v * v * ay + 2 * v * u * cy + u * u * ey]; };
    const path = () => { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(cx, cy, ex, ey); };
    path(); ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.stroke();
    path(); ctx.strokeStyle = '#c8a466'; ctx.lineWidth = 5.6; ctx.stroke();
    ctx.save(); ctx.translate(-1.3, -0.6); path(); ctx.strokeStyle = 'rgba(248,226,168,0.75)'; ctx.lineWidth = 1.6; ctx.stroke(); ctx.restore();   // (its lit side)
    { const n = Math.max(4, Math.floor(ln / 8)); ctx.strokeStyle = 'rgba(96,64,30,0.85)'; ctx.lineWidth = 1.5; ctx.beginPath();   // (the twist: a short slanted strand line every 8 px)
      for (let i = 1; i < n; i++) { const u = i / n, [px, py] = at(u), [qx, qy] = at(Math.min(1, u + 0.01)), tl = Math.hypot(qx - px, qy - py) || 1, tx = (qx - px) / tl, ty = (qy - py) / tl, a = 0.95;
        const dx = Math.cos(a) * ty * -1 + Math.sin(a) * tx, dy = Math.cos(a) * tx + Math.sin(a) * ty;   // (across the rope, slanted along it)
        ctx.moveTo(px - dx * 3, py - dy * 3); ctx.lineTo(px + dx * 3, py + dy * 3); }
      ctx.stroke(); }
    if (!this.carrier) {   // a fat stopper knot at the end and a frayed brush of strands below it (QAF: no loop -- never a noose), and the prompt
      ctx.fillStyle = '#b8945a'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
      for (const [dy, rx, ry] of [[-2, 8.5, 6], [6, 9.5, 7.5]]) { ctx.beginPath(); ctx.ellipse(ex, ey + dy, rx, ry, 0, 0, TAU); ctx.fill(); ctx.stroke(); }   // (two stacked wraps)
      ctx.strokeStyle = 'rgba(96,64,30,0.85)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(ex - 7, ey - 3); ctx.quadraticCurveTo(ex, ey + 2, ex + 7, ey - 2); ctx.moveTo(ex - 8, ey + 5); ctx.quadraticCurveTo(ex, ey + 10, ex + 8, ey + 5); ctx.stroke();
      ctx.fillStyle = 'rgba(248,226,168,0.6)'; ctx.beginPath(); ctx.ellipse(ex - 3.5, ey + 3, 3, 2, -0.4, 0, TAU); ctx.fill();
      for (const [lw, col] of [[3.4, INK], [1.6, '#d8b878']]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); for (const [dx2, l, b] of [[-6, 13, -4], [-2.5, 16, -1], [1, 15, 2], [4.5, 14, 4], [7, 11, 6]]) { ctx.moveTo(ex + dx2 * 0.8, ey + 12); ctx.quadraticCurveTo(ex + dx2 + b * 0.4, ey + 12 + l * 0.6, ex + dx2 + b, ey + 12 + l); } ctx.stroke(); }   // (the frayed strands fanning out below it)
      const near = live(g).find((p) => Math.abs(p.x - this.x) < 90 && Math.abs(p.y - this.y) < 46);
      if (this.drop >= 1 && this.boss?.state === 'ropeWait') {
        ctx.save(); ctx.globalAlpha = 0.85 + 0.15 * Math.sin(g.time * 6); ctx.textAlign = 'center'; ctx.font = 'bold 26px Bangers, Impact, sans-serif'; ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
        let py = ey - 34;   // (above every head -- and its P-tag -- by the rope: at 4P the prompt sat on the party, QAF capture)
        for (const q of live(g)) if (Math.abs(q.sx - ex) < 140) py = Math.min(py, FLOOR_TOP + q.y - (q.z || 0) - (q.art?.META?.height || 140) - 52);
        py = Math.max(py, 104);
        const tw = ctx.measureText('GRAB THE ROPE!').width, kx = PAL.CRYSTAL_X - g.camX, cr = [kx - 52, PAL.CRYSTAL_Y - 112, kx + 52, PAL.CRYSTAL_Y + 114];   // (the King's crystal, its outline in: the prompt and its pad glyph keep off it -- the glyph sat on his face, final art pass)
        const hitC = (x0, y0, x1, y1) => x0 < cr[2] && x1 > cr[0] && y0 < cr[3] && y1 > cr[1];
        let px = ex; if (hitC(px - tw / 2 - 4, py - 26, px + tw / 2 + 4, py + 6)) px = ex < kx ? cr[0] - tw / 2 - 6 : cr[2] + tw / 2 + 6;
        px = clamp(px, 48 + tw / 2 + 3, 912 - tw / 2 - 3);
        ctx.strokeText('GRAB THE ROPE!', px, py); ctx.fillStyle = '#ffe066'; ctx.fillText('GRAB THE ROPE!', px, py);
        if (near) { let gx = px, gy = py - 48; if (hitC(gx - 20, gy - 20, gx + 20, gy + 20)) { gx = clamp(px + (px < kx ? -1 : 1) * (tw / 2 + 26), 70, 890); gy = py - 9; } g.app.drawGlyph?.(ctx, 'attack', near.ctrlId, gx, gy, 30); }
        ctx.restore();
      }
    }
    ctx.restore();
  }
}
const lerpY = (a, b, t) => a + (b - a) * (1 - Math.pow(1 - t, 3));

/** Scarlet when she is not one of the party: swings in, strikes, cheers -- an actor of the heroes' side, drawn with her own art (the player Scarlet is driven directly: finishBeat) */
class SwingScarlet extends Actor {
  constructor(game, x, y) {
    super(game, x, y);
    this.team = 'ally'; this.solid = false; this.helper = true; this.heroId = 'scarlet'; this.w = 22; this.h = 150; this.balloonH = 214; this.shadowR = 30; this.mem = { frame: 0 };
    this.cutPose = 'idle'; this.cutArg = 0.5; this.facing = 1; this.z = 0; this.swing = 0;
  }
  get hittable() { return false; }
  update() { this.tick(); this.mem.frame = this.game.frame; }
  draw(ctx) {
    const art = CHARS.scarlet, g = this.game;
    if (!art || this.gone) return;
    const A = art.ANIM || {};
    let f = A[this.cutPose]; if (f === undefined) f = A.idle;
    const pose = typeof f === 'function' ? f(this.cutArg ?? g.time) : f || {};
    ctx.save(); ctx.translate(this.sx, this.sy);
    art.draw(ctx, pose, { facing: this.facing, t: g.time, mem: this.mem, vel: { x: 0, y: 0, z: 0 }, talk: false });
    ctx.restore();
  }
}

/** what is left of Malachar: a heap of violet robes on the floor, the two halves of his mask lying apart */
class RobePile extends Actor {
  constructor(game, x, y) { super(game, x, y); this.team = 'fx'; this.solid = false; this.shadowR = 0; this.sortY = y - 2; this.w = 0; this.h = 0; }
  get hittable() { return false; }
  update() { this.tick(); }
  drawShadow() {}
  draw(ctx) {
    const k = Math.min(1, this.st / 16), sx = this.sx, sy = this.sy, art = this.game.stage;
    if (art?.robePile) { art.robePile(ctx, sx, sy, { w: 84, h: 64, s: 30, lx: -104, rx: 108, k }); return; }   // (the book's c42_puff: the empty robe heap and the cracked cream mask halves, laughing / weeping -- the stage builder's drawRobePile)
    ctx.save(); ctx.translate(sx, sy); ctx.scale(1, 0.4 + 0.6 * k); ctx.lineJoin = 'round';
    ctx.fillStyle = '#3a1d6a'; ctx.strokeStyle = INK; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-62, 2); ctx.quadraticCurveTo(-58, -26, -30, -30); ctx.quadraticCurveTo(-6, -46, 22, -32); ctx.quadraticCurveTo(54, -28, 64, 2); ctx.quadraticCurveTo(0, 14, -62, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#6a3ca8'; ctx.beginPath(); ctx.moveTo(-40, -8); ctx.quadraticCurveTo(-18, -34, 10, -26); ctx.quadraticCurveTo(-14, -14, -40, -8); ctx.fill();
    ctx.strokeStyle = MAGENTA; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-30, -14); ctx.bezierCurveTo(-18, -26, -4, -22, -8, -12); ctx.moveTo(20, -18); ctx.bezierCurveTo(32, -26, 44, -18, 38, -10); ctx.stroke();
    // the mask's two halves
    for (const [dx, white] of [[-82, true], [84, false]]) {
      ctx.save(); ctx.translate(dx, -4); ctx.rotate(white ? -0.25 : 0.3);
      ctx.fillStyle = white ? '#f2ecf6' : '#18101e'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -26); ctx.quadraticCurveTo(white ? -22 : 22, -14, white ? -18 : 18, 14); ctx.lineTo(0, 22); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = MAGENTA; ctx.beginPath(); ctx.ellipse(white ? -8 : 8, -6, 6, 2.4, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}

/** POOF the pufferfish, flopping out from under the robes: it puffs and bounces about, furious */
class PuffFish extends Actor {
  constructor(game, x, y) { super(game, x, y); this.team = 'fx'; this.solid = false; this.shadowR = 22; this.sortY = y + 4; this.w = 0; this.h = 0; this.hx = x; this.hopT = 0; }
  get hittable() { return false; }
  update() { this.tick(); }
  draw(ctx) {
    const g = this.game, art = CHARS.malachar_puffer;
    if (!art) return;
    const A = art.ANIM || {}, u = this.st < 24 ? this.st / 24 : 1;
    const pose = this.st < 24 ? (A.puff ? A.puff(u) : {}) : (A.bounce ? A.bounce(g.time) : {});
    const e = this.st < 24 ? 0 : Math.min(1, (this.st - 24) / 40);   // (the flop eases in after the puff: no 40 px jump when the bob starts)
    ctx.save(); ctx.translate(this.sx + e * Math.sin(g.time * 1.1) * 40, this.sy + e * Math.sin(g.time * 3.3) * 3);   // (a little sine bob: it flops in its bowl)
    art.draw(ctx, pose, { facing: Math.cos(g.time * 1.1) > 0 ? 1 : -1, t: g.time, scale: 1.3 * (this.st < 12 ? 0.6 + 0.4 * this.st / 12 : 1), mem: this.mem || (this.mem = {}) });
    ctx.restore();
    if (this.st === 2) g.fx.label(this.x, this.y, 70, 'PFFFT!', '#e0b0ff', 36, 60);
  }
}

// ------------------------------------------------------------------------------------------------ MALACHAR
/** flash safety: a telegraph's last-moment urgency is a smooth ~1.9 Hz pulse (0.55..1), never an on/off blink */
const pulse = (n) => 0.775 + 0.225 * Math.cos(n * 0.2);
const SHUT = ['break', 'fizzle', 'wobble', 'ropeWait'];   // (phase 2 moments he can't be hurt: a hit gets a clank and a word, never nothing)
const MAL = { hp: 300, boltWind: 58, bolt: 24, beamWind: 76, clashMax: 420, stagger: 230, lanes: 24 };
export class Malachar extends SIBoss {
  get calmStates() { return ['drift', 'boltWind', 'bolt', 'stagger']; }   // (his own hurt plays here, pose(); the recoil in his other states -- the anim audit #6)
  get flinchArt() { return true; }
  constructor(game, x, y, opt = {}) {
    super(game, x, y, opt, 'MALACHAR', 'Master of Feelings', MAL.hp);
    this.art = 'malachar'; this.scale = 1; this.w = 56; this.h = 232; this.shadowR = 66; this.balloonH = 330; this.talkGap = 330; this.ownFinish = true; this.hideFoeBars = true;
    this.hurtSfx = 'hit_heavy'; this.hurtPitch = 1.05; this.facing = -1;
    this.phase = 0; this.wave = 0; this.done = { rage: false, sad: false, fear: false, sloth: false }; this.refs = {}; this.cool = 80; this.clashes = 0; this.needClash = false; this.ropeCalled = false;
    this.lanes = []; this.dest = null; this.q = []; this.clashMeter = 0; this.rope = null; this.fin = null; this.waveT = 0; this.assist = 0; this.blockSaid = false; this.hide = false; this.dodgeHinted = false;
  }
  get open() { return this.phase === 2 && ['drift', 'boltWind', 'bolt', 'stagger'].includes(this.state); }
  get hittable() { return this.alive && this.inv <= 0 && this.game.fighting && !this.game.cut && (this.open || (this.phase === 1 && ['summon', 'watch', 'taunt', 'clap'].includes(this.state)) || (this.phase === 2 && SHUT.includes(this.state))); }
  /** his feelings still loose: a hit bounces off a violet bubble (a clank, a flash, a word) and does nothing */
  takeHit(att, hd) {
    if (this.open) return super.takeHit(att, hd);
    if (!this.hittable) return false;
    const g = this.game;
    const fresh = g.frame - (this.bubbleAt ?? -99) > 60;   // (one clank and word per second: later hits pass through, so punching the bubble earns no super meter or score)
    if (this.state === 'ropeWait' && att && att.team === 'hero' && (this.rope?.st ?? 0) >= 60) { this.ropeGrabbed(att); return true; }   // (after its drop has played a second: QA2 round 2)   // (a hit on him while the rope hangs: it is grabbed -- QA2 M8)
    if (!fresh && !hd.quiet && g.frame - (this.tinkAt ?? -99) > 12) { this.tinkAt = g.frame; audio.sfx('shield_block', { pitch: 1.7, vol: 0.18 }); }   // (a pass-through hit: a small tink, never nothing)
    if (fresh) {
      this.bubbleAt = g.frame; audio.sfx('shield_block', { pitch: 1.3, vol: 0.5 }); g.fx.flare?.(this.x, this.y, 120, 60, 14, '#e8a0ff');
      // (phase 2's shut moments say what to do instead: the rope is down -- GRAB it; the beam just broke or fizzled -- a moment's guard)
      if (this.state === 'wobble') { /* (the rope is not down yet: no word -- they piled up, QA2) */ }
      else if (this.state === 'ropeWait') { /* (no word: the rope's own GRAB THE ROPE! prompt says it -- a second one overlapped it for ~0.4 s, final art pass) */ }
      else g.fx.label(this.x, this.y, 250, this.phase === 2 ? 'PROTECTED... WAIT!' : 'PROTECTED BY HIS FEELINGS!', '#ff9af0', 24, 50);
    }
    void att; void hd;
    return fresh;
  }
  later(frames, fn) { this.q.push({ at: this.game.frame, d: frames, fn }); }
  progress() { this.hurtAt = this.game.frame; }
  /** (QA2 M4) his nag only while he fights -- never over the wave's end, the clash, the rope or the finisher */
  nagOk() { return !this.ropeCalled && !['enough', 'wobble', 'ropeWait', 'finish', 'break', 'fizzle', 'beamClash', 'beamWind', 'defeated', 'intro', 'laugh'].includes(this.state); }
  bossIntro() { this.set('laugh'); audio.sfx('king_laugh', { pitch: 0.6 }); }
  bossFight() {
    const g = this.game, m = g.mm;
    this.phase = 1; this.wave = 0; this.set('summon'); this.cool = 60; this.hurtAt = g.frame; this.fightAt = g.frame;
    m?.hint?.('sipalfeel', `MALACHAR hides behind his FEELINGS! || Beat his four beasts, two at a time. || Each has its own trick: watch the floor RINGS!`, 420, true);
  }
  keyHint(n) {
    if (this.phase === 1) {
      const solo = live(this.game).length < 2;   // (alone: the cloud is cheered by mashing, there is no friend to shield)
      const w = this.wave === 0 ? (solo ? ['RAGE: poke once, then step back. || Sad and soaked? MASH ATTACK to cheer up!', 'The wolf GROWS when you mash. Let go! || The cloud: dodge its BLUE ring!'] : ['RAGE: poke once, then step back. || A sad friend? Stand close, press ATTACK: SHIELD!', 'The wolf GROWS when you mash. Let go! || Shield your sad friend: "We have got you!"']) : ['FEAR: hit it to get BRAVER! || Or HOLD ATTACK, let go: LIGHT shrinks it! || SLOTH: swallowed? MASH out!' + (solo ? '' : ' || Friends: whack the slime!'), 'YELLOW ring = a freezing stare. || GREEN ring = a gulp: ROLL out!'];
      return ['sipalA' + this.wave, w[n % 2]];
    }
    if (this.phase === 2 && this.state !== 'beamClash') return n % 2 ? ['sipalB', 'Purple LIGHTNING! Step out of the violet lane!' + (this.game.players.some((q) => baseOf(q.heroId) === 'dodongo') ? ' || Dodongo: face him, your shield blocks it!' : '')] : ['sipalC', 'Hit Malachar between bolts: he is open then!'];
    return null;
  }
  dmgOf(att, hd) {
    let d = hd.dmg * (this.state === 'stagger' ? 1.5 : 1);
    if (att && att.helper) d *= 0.6;
    const floor = this.maxHp * (this.clashes < 1 ? 0.6 : 0.28);   // (the finish is the scripted beat: no hit takes him past a step before it)
    d = Math.min(d, this.hp - floor);
    return d > 0 ? Math.round(d) : 0;
  }
  onDamage(att, hd, d) {
    void att; void hd;
    if (d > 0) this.hurtAt = this.game.frame;
    if (this.phase !== 2 || this.ropeCalled) return;
    if (this.clashes < 1 && !this.needClash && this.hp <= this.maxHp * 0.6 + 1) this.needClash = true;
    if (this.clashes >= 1 && !this.ropeCalled && this.hp <= this.maxHp * 0.28 + 1) this.beginRope();
  }
  onZero() { this.hp = Math.max(1, Math.round(this.maxHp * 0.28)); if (this.clashes < 1) this.needClash = true; else this.beginRope(); }

  // ---------------------------------------------------------------- the feelings
  spawnWave() {
    const g = this.game, ps = live(g), p = ps[(Math.random() * ps.length) | 0];
    const kinds = this.wave === 0 ? ['rage', 'sad'] : ['fear', 'sloth'];
    audio.sfx('roar', { pitch: 0.5, vol: 0.8 }); g.shake = Math.max(g.shake, 8);
    this.streams = { t: g.frame, kinds };
    for (const k of kinds) {
      let e = null;
      if (k === 'rage') { e = g.spawn({ k: 'ragebeast', side: 'R', y: clamp(this.y + rnd(-20, 30), 30, DEPTH - 20) }); }
      else if (k === 'sad') { e = g.spawn({ k: 'sadcloud', side: 'R', y: p ? p.y : 70 }); if (e) { e.x = clamp(this.x - 40, g.camX + 100, g.camX + W - 100); e.entered = true; } }
      else if (k === 'fear') { e = g.spawn({ k: 'fearshade', side: 'R', y: clamp(rnd(50, 110), 20, DEPTH - 20) }); if (e) { e.x = g.camX + W * 0.58; e.entered = true; } }
      else if (k === 'sloth') { e = g.spawn({ k: 'slothlump', side: 'L', y: clamp(rnd(50, 110), 20, DEPTH - 20) }); if (e) { e.x = g.camX + W * 0.26; e.entered = true; } }
      if (e) { this.refs[k] = e; this.done[k] = false; }
    }
    this.waveAt = g.frame;
    if (this.wave === 0) g.mm?.hint?.('sipalcalm', `RAGE: the wolf GROWS when you mash! || Poke ONCE, then step back. || Or HOLD ${g.mm.keyName('attack')}, let go: a calm strong strike! || Calm it all the way: a PUPPY!`, 480, true);
  }
  beastDone(k) {
    const g = this.game;
    if (this.done[k]) return;
    this.done[k] = true; this.hurtAt = g.frame;
    g.mm?.clearHint?.(...{ rage: ['sipalcalm', 'sicalm2'], sad: ['sipalsad'], fear: ['sipalfear', 'sifearlight'], sloth: ['sipalsloth'] }[k]);
    g.fx.label(this.x, this.y, 250, { rage: 'RAGE TAMED!', sad: 'SADNESS COMFORTED!', fear: 'FEAR POPPED!', sloth: 'SLOTH SPLATTED!' }[k], '#ffe9a0', 32, 80);
    audio.sfx('hit_finisher', { pitch: 1.1, vol: 0.5 });
  }
  /** a feeling is done: its flag, or its beast gone (it left, it popped) */
  isDone(k) { const e = this.refs[k]; return this.done[k] || !e || e.gone || e.alive === false || e.resolved; }
  stepWave() {
    const g = this.game, ks = this.wave === 0 ? ['rage', 'sad'] : ['fear', 'sloth'];
    for (const k of ks) if (!this.done[k] && this.refs[k] && (this.refs[k].gone || this.refs[k].alive === false || this.refs[k].resolved)) this.beastDone(k);
    const wolf = this.refs.rage;
    if (this.wave === 0 && wolf && wolf.alive && wolf.addRage && !this.wolfTired && g.frame - (this.waveAt ?? g.frame) > 1200) { this.wolfTired = true; wolf.label?.('SO TIRED...', '#9fe7ff'); wolf.addRage(-150); }   // (a pity: a wolf that was mashed all the way runs out of steam and curls up as a puppy)
    if (!this.advancing && ks.every((k) => this.done[k])) {
      this.advancing = true;
      this.later(30, () => { this.advancing = false; if (this.phase !== 1) return; this.wave++; if (this.wave >= 2) this.beginEnough(); else { this.set('clap'); this.shout('Bravo.', '#e8a0ff', 38, 300); audio.sfx('king_laugh', { pitch: 0.8, vol: 0.5 }); } });
    }
    void g;
  }
  beginEnough() {
    const g = this.game, m = g.mm;
    this.set('enough'); this.phase = 1.5; g.mm?.clearHint?.('sipalfeel', 'sipalcalm', 'sipalsad', 'sipalfear', 'sipalsloth');
    this.later(10, () => m?.line?.('palGone'));
    this.later(150, () => { g.fx.list = g.fx.list.filter((q) => q.type !== 'balloon'); });   // (Dodongo's line gets ~2.5 s to be read before the big word)
    this.later(154, () => { this.shout('ENOUGH!', '#ff7af0', 54, 320); audio.sfx('roar', { pitch: 0.4, vol: 0.9 }); g.shake = Math.max(g.shake, 12); g.fx.ring(this.x, this.y, { rx: 360, ry: 120, shock: true, col: '#c050ff', life: 30 }); audio.sfx('lightning', { vol: 0.8 }); });
    this.later(232, () => m?.line?.('palEnough'));   // (after the big word has gone: the two used to pile up over his head)
  }

  // ---------------------------------------------------------------- the update
  update() {
    const g = this.game, M = g.mm;
    this.tick();
    if (this.ouch > 0) this.ouch--;
    if (this.cool > 0) this.cool--;
    for (let i = this.q.length - 1; i >= 0; i--) { const e = this.q[i]; if (g.frame - e.at >= e.d && !g.cut) { this.q.splice(i, 1); try { e.fn(); } catch (err) { console.error('malachar queue', err); } } }
    if (this.state !== 'defeated') this.nag();
    this.stage()?.setStorm?.(this.phase >= 2 ? 1 : 0.7);
    if (g.cut && this.state !== 'defeated') return;
    const live_ = live(g);
    if (this.kraken) { this.kraken.t++; if (this.kraken.t === 30 && this.state === 'beamClash') this.krakenTap(30); if (this.kraken.t > 110) this.kraken = null; }
    switch (this.state) {
      case 'intro': case 'laugh': this.vx = this.vy = 0; break;
      case 'summon':   // the four streams pour from the orb: the wave appears
        this.hover(g, 0);
        if (this.st === 24) this.spawnWave();
        if (this.st >= 92) { this.set('watch'); this.waveT = 0; }
        break;
      case 'watch': this.hover(g, 0.4); this.waveT++; this.stepWave(); if (this.waveT % 540 === 300 && this.wave < 2) this.set('taunt'); break;
      case 'taunt': this.hover(g, 0); this.stepWave(); if (this.st >= 70) this.set('watch'); break;
      case 'clap': this.hover(g, 0); if (this.st >= 74) { this.set('summon'); } break;
      case 'enough': this.hover(g, 0); if (this.st >= 262) { this.phase = 2; this.set('drift'); this.cool = 70; this.dest = null; this.hurtAt = g.frame; M?.hint?.('sipalbolt', `Purple LIGHTNING! Step out of the violet lane! || JUMP or ROLL if you are in it! || ${g.players.some((q) => baseOf(q.heroId) === 'dodongo') ? 'Dodongo: FACE him and your shield BLOCKS it! || ' : ''}Hit Malachar between his bolts!`, 520, true); } break;
      case 'drift': {
        this.driftMove(g, live_);
        if (this.cool <= 0 && g.fighting && !g.cut && live_.length) this.chooseAttack(live_);
        break;
      }
      case 'boltWind': this.stepBoltWind(g, live_); break;
      case 'bolt': this.hover(g, 0); if (this.st === 1) this.strike(g); if (this.st >= MAL.bolt) { this.set('drift'); this.cool = rnd(70, 110) * (this.clashes ? 0.8 : 1); this.lanes = []; } break;
      case 'beamWind': this.stepBeamWind(g, live_); break;
      case 'beamClash': this.stepClash(g, live_, M); break;
      case 'break': this.hover(g, 0); if (this.st >= 54) { this.set('stagger'); this.shout('DIZZY! HIT HIM!', '#fff2a8', 36, 300); audio.sfx('charge_full', { pitch: 0.7 }); } break;
      case 'fizzle': this.hover(g, 0); if (this.st >= 54) { this.set('drift'); this.cool = 110; } break;
      case 'stagger': this.hover(g, 0); if (this.st >= MAL.stagger) { this.set('drift'); this.cool = 50; } break;
      case 'wobble': this.hover(g, 0); if (this.st === 1) { this.shout('NO...!', '#ff7af0', 46, 300); audio.sfx('roar', { pitch: 0.6, vol: 0.8 }); g.shake = Math.max(g.shake, 8); } if (this.st >= 74) { this.set('ropeWait'); this.dropRope(); } break;
      case 'ropeWait': this.hover(g, 0); if (this.st >= 360) this.ropeGrabbed(null); break;   // (6 s and it grabs itself: QA2 M8)
      case 'finish': this.finishBeat(this.st); break;
      case 'defeated': this.stepDefeated(); break;
      default: break;
    }
    if (this.state !== 'intro') this.x = clamp(this.x, g.camX + 90, g.camX + W - 90);
    this.clampDepth();
  }
  stage() { return this.game.stage; }
  /** he floats: a slow bob, a drift toward where he wants to be */
  hover(g, k) { this.vx = this.vy = 0; if (k) this.x += Math.sin(g.time * 0.8) * k; }
  driftMove(g, ps) {
    const p = ps.sort((a, b) => Math.abs(a.x - this.x) - Math.abs(b.x - this.x))[0];
    if (!this.dest || this.st % 300 === 299) { const xs = [W - 150, W * 0.66, W * 0.46, W * 0.3, W - 220]; this.dest = { x: g.camX + xs[(Math.random() * xs.length) | 0], y: rnd(40, 110) }; }
    this.x += clamp(this.dest.x - this.x, -1.5, 1.5); this.y += clamp(this.dest.y - this.y, -0.7, 0.7);
    if (p) this.facing = p.x > this.x ? 1 : -1;
  }
  chooseAttack(ps) {
    const g = this.game;
    this.releaseToken?.();
    if (this.needClash && !this.clashing) { this.set('beamWind'); this.cool = 0; g.fx.alert?.(this); return; }
    const n = this.clashes >= 1 && Math.random() < 0.55 ? Math.min(2, ps.length) : 1;
    this.lanes = [];
    const order = [...ps].sort(() => Math.random() - 0.5);
    for (let i = 0; i < n; i++) { const t = order[i % order.length]; this.lanes.push({ t, y: t.y, dir: t.x > this.x ? 1 : -1 }); }
    this.set('boltWind'); g.fx.alert?.(this); audio.sfx('charge', { pitch: 0.7, vol: 0.6 });
  }
  stepBoltWind(g, ps) {
    this.hover(g, 0);
    for (const L of this.lanes) { if (this.st < MAL.boltWind - 38 && L.t && L.t.alive && !L.t.out) { L.y = clamp(L.y + clamp(L.t.y - L.y, -2, 2), lo(g), hi(g)); L.dir = L.t.x > this.x ? 1 : -1; } }
    if (this.lanes[0]) this.facing = this.lanes[0].dir;
    if (this.st >= MAL.boltWind) { this.set('bolt'); }
    void ps;
  }
  /** the strike: every hero in a lane is bumped (Dodongo, facing him, blocks it with his shield) */
  strike(g) {
    const M = g.mm;
    audio.sfx('lightning', { vol: 0.9 }); g.shake = Math.max(g.shake, 7);
    for (const L of this.lanes) {
      for (const q of live(g)) {
        const dx = (q.x - this.x) * L.dir;
        if (!q.hittable || dx < -30 || Math.abs(q.y - L.y) > 25 || q.z > 70) continue;
        const toward = this.x > q.x ? 1 : -1;
        if (baseOf(q.heroId) === 'dodongo' && q.facing === toward && !['hurt', 'fly', 'down', 'getup', 'cutscene', 'special', 'air'].includes(q.state)) {   // (the round shield up: calm, sparks flying)
          g.fx.word(q.x, q.y, 150, true, 'BLOCKED!'); g.fx.spark?.(q.x + toward * 28, q.y, 80, true, 'gold'); audio.sfx('shield_block', { vol: 0.8 }); g.shake = Math.max(g.shake, 3);
          if (!this.blockSaid) { this.blockSaid = true; M?.line?.('palBlock', q); }
          continue;
        }
        q.takeHit(this, { dmg: 8, kind: 'light', push: 4, stun: 22, stop: 5, sfx: 'hit_heavy', spark: 'warm' });
      }
    }
  }

  // ---------------------------------------------------------------- the beam clash
  stepBeamWind(g, ps) {
    this.hover(g, 0);
    if (this.st === 1) {
      const ana = ps.find((q) => baseOf(q.heroId) === 'ana'), c = ana || ps.sort((a, b) => Math.abs(a.x - this.x) - Math.abs(b.x - this.x))[0];
      this.caster = c || null; this.clashing = true;
      if (c) { c.dropCarry?.(); c.stopCharge?.(); c.ctl = false; c.autoDx = c.autoDy = 0; c.vx = c.vy = 0; c.reset('cutscene'); c.cutPose = 'shoot'; c.cutPoseArg = 0.4; }
      this.shout('BEAM CLASH!', '#ff9af0', 46, 320); this.clashHum?.stop?.(0.15); this.clashHum = audio.sfx('beam_clash', { hold: true });
    }
    const c = this.caster;
    if (c && !c.out) {
      const side = c.x < this.x ? -1 : 1, tx = clamp(this.x + side * 400, g.camX + 90, g.camX + W - 90), ty = clamp(this.y + 6, lo(g), hi(g));
      c.x += clamp(tx - c.x, -7, 7); c.y += clamp(ty - c.y, -3, 3); c.facing = this.x > c.x ? 1 : -1; c.inv = Math.max(c.inv, 3);
      if (c.state !== 'cutscene') c.reset('cutscene'); c.cutPose = 'shoot'; c.cutPoseArg = 0.4;
    }
    this.facing = c ? (c.x > this.x ? 1 : -1) : this.facing;
    if (this.st >= MAL.beamWind) { this.set('beamClash'); this.clashMeter = 45 + this.assist * 25; this.clashT = 0; this.pushT = 0; this.clashP = null; g.mm?.hint?.('sipalclash', `BEAM CLASH! EVERYBODY: MASH ${g.mm.keyName('attack')}! Push his purple beam back!`, 400, true); }
  }
  stepClash(g, ps) {
    const c = this.caster;
    this.hover(g, 0); this.clashT++;
    if (c && this.clashT % 6 === 0) {   // (magic motes where the two beams meet: the same point as drawOverMM's)
      const o = CHARS.malachar?.point?.(this.pose(), 'orb'), u = 1 - clamp(this.clashMeter / 100, 0, 1) * 0.8 - 0.1;
      const ox = this.x + this.facing * (o ? o[0] : 140), oz = (this.z || 0) - (o ? o[1] : -150), cx = c.x + (c.facing || 1) * 34;
      SIFX.motes(cx + (ox - cx) * u, c.y + (this.y - c.y) * u, 92 + (oz - 92) * u, 2, 'magic');
    }
    if (this.clashT === 8 && !this.krakenUsed && (testPal() || krakenPal())) this.krakenHelp();
    const push = Math.max(0.12, 0.3 - this.clashT * 0.0003) * (this.assist ? 0.75 : 1);
    let add = 0;
    const P = this.clashP || (this.clashP = new Map());
    for (const q of ps) { const n = (q.siPress || 0) - (P.get(q) ?? (q.siPress || 0)); P.set(q, q.siPress || 0); if (n > 0) add += n * (q === c ? 5.2 : 3.2); }   // (every press: src/game.js siPress, QA2 M1)
    if (add) this.pushT = this.clashT;
    if (c && !c.out) { c.inv = Math.max(c.inv, 3); c.cutPose = 'shoot'; c.cutPoseArg = 0.55 + 0.1 * Math.sin(this.clashT * 0.6); c.facing = this.x > c.x ? 1 : -1; }
    if (add) audio.sfx('beam_push', { pitch: 1 + this.clashMeter * 0.006, vol: 0.7 });
    this.clashMeter = clamp(this.clashMeter + add - push, 0, 120);
    g.shake = Math.max(g.shake, 2 + (this.clashMeter > 70 ? 2 : 0));
    if (this.clashMeter >= 100) { this.endClash(true); return; }
    const idle = this.clashT >= 150 && this.clashT - (this.pushT ?? 0) > 150;   // (nobody pushing for 2.5 s: it ends now -- QA2 M8)
    if (this.clashT >= MAL.clashMax || idle) { const win = this.clashMeter >= 28 || this.assist >= 1; if (win) { this.clashMeter = 100; g.fx.label(this.x, this.y, 280, 'THE LIGHT SURGES!', '#9fe7ff', 34, 70); } this.endClash(win); }
  }
  /** the friendly KRAKEN (the Cave's full calm: src/sisecrets.js) -- one tentacle swings in from above, taps the beam and the clash tips toward the heroes: once per fight */
  krakenHelp() {
    const c = this.caster;
    this.krakenUsed = true; this.kraken = { t: 0, tapped: false, wx: c ? c.x + (c.facing || 1) * 190 : this.x - 260 * (this.facing || 1) };   // (wx: where it hangs, in the world: it stays put when the clash ends)
    import('./stages/sikraken.js').then((m) => { this.krArm = m.drawKrakenArm; }).catch(() => {});
    audio.sfx('roar', { pitch: 1.3, vol: 0.6 });
    // (no tip over the MASH call: the clash's own hint stays; Dodongo's line comes when the clash is over)
  }
  /** the tentacle taps the beam: the clash tips toward the heroes (push), "KRAKEN PAL!" up high; once (a clash won before the tap still gets its cheer) */
  krakenTap(push = 0) {
    const g = this.game, K = this.kraken;
    if (!K || K.tapped) return;
    K.tapped = true;
    if (push) this.clashMeter = Math.min(115, this.clashMeter + push);
    g.fx.label(this.x > g.camX + 480 ? g.camX + 230 : g.camX + 730, this.y, 300, 'KRAKEN PAL!', '#bfffd0', 40, 90); g.fx.flare?.(K.wx, this.y, 140, 80, 22, '#d8ffe0');   // (the word goes to the side AWAY from Malachar, where BEAM BROKEN! and DIZZY! are not)
    audio.sfx('explosion', { vol: 0.5, pitch: 0.8 }); g.shake = Math.max(g.shake, 6);
  }
  endClash(win) {
    const g = this.game, c = this.caster;
    this.clashing = false; g.mm?.clearHint?.('sipalclash'); this.clashHum?.stop?.(0.15); this.clashHum = null;
    if (this.kraken) {   // (the pal: a tap that did not come yet comes now, the tentacle leaves, and Dodongo says his line once)
      if (!this.kraken.tapped) this.krakenTap(0);
      this.kraken.t = Math.max(this.kraken.t, 76);
      if (!this.krakenSaid) { this.krakenSaid = true; g.mm?.line?.('palKraken'); }
    }
    if (c && !c.out) { c.ctl = true; c.cutPose = null; c.cutPoseArg = undefined; c.set('idle'); c.inv = Math.max(c.inv, 50); }
    g.shake = Math.max(g.shake, 9);
    if (win) {
      this.clashes++; this.needClash = false; this.assist = 0; this.hurtAt = g.frame;
      g.fx.label(this.x, this.y, 240, 'BEAM BROKEN!', '#9fe7ff', 40, 90); g.fx.flare?.(this.x, this.y, 130, 80, 24, '#ffe6ff'); g.flashScreen = Math.max(g.flashScreen || 0, 0.3); g.flashAt = { x: this.x, y: this.y, z: 130 }; audio.sfx('beam_break'); audio.sfx('hit_finisher', { vol: 0.6 });   // (flash safety: a small flare + the gated wash)
      this.set('break');
    } else {
      this.assist++; g.fx.label(this.x, this.y, 240, 'FZZZT!', '#ff9af0', 40, 70); audio.sfx('knockdown', { pitch: 1.2, vol: 0.6 });
      for (const q of live(g)) if (Math.abs(q.x - this.x) < 520) { q.knock?.(q.x < this.x ? -1 : 1, 3, 3); q.inv = Math.max(q.inv, 60); }
      this.set('fizzle');
    }
    this.caster = null;
  }

  // ---------------------------------------------------------------- the rope and Scarlet's finisher
  beginRope() {
    const g = this.game;
    this.ropeCalled = true; this.set('wobble'); this.clashing = false; this.lanes = [];
    for (const a of g.actors) if (a.team === 'foe' && a !== this && a.alive) { a.alive = false; a.gone = true; g.fx.poof(a.x, a.y, a.z); }
    g.mm?.clearHint?.('sipalbolt', 'sipalclash', 'sipalfeel', 'sipalcalm', 'sipalA0_again', 'sipalA1_again', 'sipalB_again', 'sipalC_again');   // (QA2 M4: nothing stale over the rope and the finisher)
  }
  dropRope() {
    const g = this.game, side = this.x < g.camX + W / 2 ? 1 : -1, y = clamp(this.y + 8, lo(g), hi(g));
    let x = clamp(this.x + side * 330, g.camX + 170, g.camX + W - 200);
    const onHead = (x2) => live(g).some((p) => Math.abs(p.x - x2) < 56 && p.y - y > -48 && p.y - y < 64);   // (QAF3: its end -- 92..128 px over the deck at its depth -- never lands on a hero's head: beside them, still in reach)
    if (onHead(x)) for (const d of [70, -70, 140, -140, 210, -210]) { const x2 = clamp(x + d, g.camX + 170, g.camX + W - 200); if (!onHead(x2)) { x = x2; break; } }
    this.rope = new RafterRope(g, x, y, this); g.actors.push(this.rope);
    g.mm?.hint?.('sipalrope', `A ROPE drops! Stand by it, press ${g.mm.keyName('attack')}!`, 600, true);
    this.shout('...', '#ff7af0', 30, 200);
  }
  /** a hero grabbed the rope (or the wait ran out): Scarlet's finisher begins */
  ropeGrabbed(p) {
    if (this.state !== 'ropeWait') return;
    const g = this.game;
    this.set('finish'); this.grabber = p; g.mm?.clearHint?.('sipalrope'); audio.sfx('swing_heavy', { pitch: 0.7, vol: 0.7 });
  }
  scarlet() { const g = this.game; return g.players.find((q) => baseOf(q.heroId) === 'scarlet' && !q.out) || null; }
  finishBeat(t) {
    const g = this.game, P = this.scarlet(), R = this.rope;
    this.vx = this.vy = 0;
    if (!this.fin) {
      this.fin = { side: 1 }; g.pending = []; g.talk = []; g.fx.list = g.fx.list.filter((q) => q.type !== 'balloon');
      for (const p of g.players) { if (p.out) continue; p.ctl = false; p.autoDx = p.autoDy = 0; p.dropCarry?.(); p.stopCharge?.(); p.vx = p.vy = 0; if (['walk', 'run'].includes(p.state)) p.set('idle'); }
      if (!P) { this.helper = new SwingScarlet(g, R ? R.x : this.x - 300, R ? R.y : this.y); g.actors.push(this.helper); }
    }
    const S = P || this.helper;
    if (!S || !R) { if (t > 20) this.set('defeated'); return; }
    for (const p of g.players) if (!p.out) p.inv = Math.max(p.inv, 3);
    const side = R.x < this.x ? -1 : 1, bx = this.x + side * -1 * 0, hit = { x: this.x - side * 100, y: clamp(this.y + 8, lo(g), hi(g)) };
    void bx;
    const setPose = (pose, arg) => { if (P) { if (P.state !== 'cutscene') P.reset('cutscene'); P.cutPose = pose; P.cutPoseArg = arg; P.vx = P.vy = 0; } else { S.cutPose = pose; S.cutArg = arg; } };
    if (this.fin.x0 === undefined) { this.fin.x0 = S.x; this.fin.y0 = S.y; }
    const T0 = 26, T1 = 70, TS = 70;   // run to the rope; swing; strike
    if (this.state === 'finish' && (this.st === 94 || this.st === 119)) audio.sfx('mask_crack', { vol: 0.5 });   // (the mask's two cracks: drawOverMM's shudders)
    if (t === 3) { g.say(S, 'Malachar!\nThe princess is HOME!', 64, { villain: false }); audio.sfx('whelp_chirp', { pitch: 0.8, vol: 0.7 }); }   // (said low, on the run, and gone before the strike: it used to cover her face and then his mask)
    if (t < T0) {
      const u0 = t / T0, e0 = u0 * u0 * (3 - 2 * u0);
      S.x = this.fin.x0 + (R.x - this.fin.x0) * e0; S.y = this.fin.y0 + (R.y - this.fin.y0) * e0; S.facing = R.x > S.x ? 1 : -1; S.z = 0; setPose('walk', (t / 9) % 1);
      if (t === 1) { this.facing = R.x > this.x ? 1 : -1; }
    } else if (t < T1) {
      const u = (t - T0) / (T1 - T0), e = u * u * (3 - 2 * u);
      if (t === T0) { R.carrier = S; if (P) { P.carryRope = true; } }
      S.x = R.x + (hit.x - R.x) * e; S.y = R.y + (hit.y - R.y) * e; S.z = 18 + 98 * e + 46 * Math.sin(Math.PI * u) * (1 - 0.5 * u); S.facing = this.x > S.x ? 1 : -1; if (R) R.carrier.swing = u;
      setPose(u < 0.74 ? 'fall' : 'atk4', u < 0.74 ? 0 : Math.min(1, (u - 0.74) / 0.26 * 0.7));
      this.set('finish');
    } else if (t === TS) {   // the strike: the mask cracks, the orb shatters
      SIFX.bossBeat?.(g, this);   // (the final blow: slow-mo + a camera nudge + its material burst, src/sifx.js)
      R.carrier = null; setPose('atk4', 0.7);
      g.hitstop = Math.max(g.hitstop || 0, 10); g.shake = Math.max(g.shake, 14); g.flashScreen = Math.max(g.flashScreen || 0, 0.4);
      audio.sfx('hit_finisher', { pitch: 0.7, vol: 1 }); audio.sfx('mask_crack');
      const o = CHARS.malachar?.point?.(this.pose(), 'orb'); const ox = o ? this.x + this.facing * o[0] : this.x, oz = o ? -o[1] : 215;
      g.fx.word(this.x, this.y, 300, true, 'KRRRAK!'); g.fx.debris(ox, this.y, oz - 20, ['#a050ff', '#ff3cd8', '#f2d8ff', '#6a2aa0'], 18); g.fx.flare?.(ox, this.y, oz, 80, 24, '#e8b0ff');   // (a local flare: the screen's wash is the gated one, src/game.js siWashStep)
      g.fx.spark?.(this.x, this.y, 130, true, 'warm');
    } else if (t > TS && t < TS + 22) { S.z = Math.max(0, S.z - 7); setPose('atk4', Math.min(1, 0.7 + (t - TS) * 0.02)); }
    else if (t >= TS + 22 && t < TS + 40) { S.z = 0; setPose('idle', g.time); }
    else if (t >= TS + 40) { S.z = 0; setPose(P ? 'victory' : 'cheer', g.time); S.facing = this.x > S.x ? 1 : -1; }
    if (t === TS + 20 && R) R.gone = true;
    if (t === TS + 66) { this.shout('NOOO!', '#ff7af0', 46, 300); }
    if (t === TS + 150) { audio.sfx('knockdown', { pitch: 0.9, vol: 0.8 }); g.shake = Math.max(g.shake, 10); g.actors.push(new RobePile(g, this.x, this.y)); this.hide = true; }
    if (t === TS + 156) { g.actors.push(new PuffFish(g, this.x + 6, this.y + 2)); audio.sfx('puffer_pop'); g.fx.poof?.(this.x, this.y, 30, true); }
    if (t >= TS + 250) { if (P) { P.cutPose = null; P.cutPoseArg = undefined; P.set('idle'); } this.defeat(); }
  }
  defeat() { if (!this.alive) return; this.hide = true; super.defeat(); }
  stepDefeated() {
    const k = clamp(this.st / 200, 0, 0.35);
    this.vx = this.vy = 0;
    this.stage()?.setCrystal?.(k, 1);   // (the crystal over the throne starts to crack: the stories finish it)
  }

  // ---------------------------------------------------------------- drawing
  /** the lightning lanes on the floor (violet, and a jagged bolt when it strikes) */
  drawFloor(ctx) {
    const g = this.game;
    if (this.kraken && this.krArm) {   // the friendly kraken's tentacle hangs in from above (behind everyone), taps the beam and goes; lilac with gold suckers and a gold glow: the pal, not a villain's arm
      const K = this.kraken, T = K.t, u = T < 24 ? T / 24 : T < 76 ? 1 : Math.max(0, 1 - (T - 76) / 30), e = u * u * (3 - 2 * u), x = K.wx - g.camX, tap = T >= 20 && T < 44 ? Math.sin((T - 20) / 24 * Math.PI) : 0;
      const kk = 0.12 + 0.88 * e + 0.05 * tap;
      ctx.save(); ctx.translate(x, -6); ctx.scale(0.8, -0.8);
      try { this.krArm(ctx, 0, 0, 640, 1, g.time * 1.6, 0.4, kk, 1.35, 0.25 * (1 - e), KRAKEN_PAL_SKIN, 2.2); } catch { /* */ }
      ctx.restore();
      const tx = x + 0.8 * (190 - 17 * (1 - e)), ty = -6 + 0.8 * (640 * kk * 0.9 - 40 * (1 - kk));
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55 * e;
      const gg = ctx.createRadialGradient(tx, ty, 2, tx, ty, 60 + 10 * tap); gg.addColorStop(0, 'rgba(255,240,170,0.9)'); gg.addColorStop(1, 'rgba(255,200,60,0)'); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(tx, ty, 70, 0, TAU); ctx.fill();
      ctx.restore();
    }
    if (this.state === 'boltWind' || (this.state === 'bolt' && this.st < 14)) {
      for (const L of this.lanes) {
        const k = this.state === 'bolt' ? 1 : Math.min(1, this.st / 30), sx = this.sx, sy = FLOOR_TOP + L.y, x0 = sx + L.dir * 24, x1 = sx + L.dir * 1100, blink = this.state === 'boltWind' && this.st > 34 ? pulse(this.st - 34) : 1;
        ctx.save(); ctx.globalAlpha = (0.3 + 0.4 * k) * (0.6 + 0.4 * blink); ctx.fillStyle = '#9a32e8';
        ctx.beginPath(); ctx.moveTo(x0, sy - MAL.lanes); ctx.lineTo(x1, sy - MAL.lanes); ctx.lineTo(x1, sy + MAL.lanes); ctx.lineTo(x0, sy + MAL.lanes); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = blink; ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.setLineDash([14, 9]); ctx.stroke(); ctx.strokeStyle = '#f0c8ff'; ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]);
        if (this.state === 'boltWind') {   // ZAP! in the lane, near him (for non-readers: a little bolt beside it)
          const zx = sx + L.dir * 150;
          ctx.globalAlpha = blink; ctx.font = 'bold 30px Bangers, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
          ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.strokeText('ZAP!', zx, sy + 1); ctx.fillStyle = '#f6d8ff'; ctx.fillText('ZAP!', zx, sy + 1);
          const bx = zx + L.dir * 52; ctx.beginPath(); ctx.moveTo(bx + 4, sy - 16); ctx.lineTo(bx - 6, sy + 2); ctx.lineTo(bx + 1, sy + 2); ctx.lineTo(bx - 4, sy + 16); ctx.lineTo(bx + 8, sy - 3); ctx.lineTo(bx + 1, sy - 3); ctx.closePath(); ctx.fillStyle = '#ffe066'; ctx.fill(); ctx.lineWidth = 2.4; ctx.stroke();
          ctx.textBaseline = 'alphabetic';
        }
        if (this.state === 'bolt') {   // the bolt itself: a jagged line of light down the lane
          ctx.globalAlpha = Math.min(1, (this.st + 1) / 3) * (this.st > 8 ? Math.max(0, 1 - (this.st - 8) / 6) : 1); ctx.lineJoin = 'round'; ctx.lineCap = 'round';   // (flash safety: ramped in over 3 frames, out over 6)
          for (const [lw, col] of [[10, '#7a20c0'], [5, '#ff9af0'], [2.4, '#ffffff']]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x0, sy); for (let i = 1; i <= 22; i++) ctx.lineTo(x0 + (x1 - x0) * i / 22, sy + (((i * 7919 + this.st * 13) % 17) - 8) * 1.3); ctx.stroke(); }
        }
        ctx.restore();
      }
    }
    void g;
  }
  /** the beam clash (over everyone): his beam and the caster's, meeting where the meter says; the MASH call */
  drawOverMM(ctx) {
    const g = this.game, c = this.caster;
    if (this.state === 'beamWind' || this.state === 'beamClash') {
      const o = CHARS.malachar?.point?.(this.pose(), this.state === 'beamClash' ? 'orb' : 'orb'), ox = this.sx + this.facing * (o ? o[0] : 140), oy = this.sy + (o ? o[1] : -150);
      const cx = c ? c.sx + (c.facing || 1) * 34 : ox - 400, cy = c ? c.sy - 92 : oy;
      const k = this.state === 'beamClash' ? clamp(this.clashMeter / 100, 0, 1) : 0.5, w = this.state === 'beamClash' ? 1 : Math.min(1, this.st / MAL.beamWind);
      const mx = cx + (ox - cx) * (1 - k * 0.8 - 0.1), my = cy + (oy - cy) * (1 - k * 0.8 - 0.1), col = HERO_COL[baseOf(c?.heroId)] || '#8fd0ff';
      ctx.save(); ctx.lineCap = 'round'; ctx.globalCompositeOperation = 'lighter';
      for (const [lw, a] of [[22, 0.3], [11, 0.6], [4, 1]]) {
        ctx.globalAlpha = a * w; ctx.strokeStyle = MAGENTA; ctx.lineWidth = lw * (0.8 + 0.2 * Math.sin(g.time * 12)); ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(mx, my); ctx.stroke();
        ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(mx, my); ctx.stroke();
      }
      ctx.globalAlpha = w; const gr = ctx.createRadialGradient(mx, my, 2, mx, my, 56 + 8 * Math.sin(g.time * 10)); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.5, 'rgba(255,170,255,0.5)'); gr.addColorStop(1, 'rgba(160,60,255,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(mx, my, 70, 0, TAU); ctx.fill();
      ctx.restore();
      if (this.state === 'beamClash') {   // the meter and the call
        const bx = (ox + cx) / 2, by = Math.min(oy, cy) - 70, bw = 220;
        ctx.save(); ctx.textAlign = 'center'; ctx.lineJoin = 'round';
        { ctx.globalAlpha = 0.8 + 0.2 * Math.cos(g.frame * 0.2); ctx.font = 'bold 34px Bangers, Impact, sans-serif'; ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.strokeText(`MASH ${g.mm.keyName('attack')}!`, bx, by - 14); ctx.fillStyle = '#ffe066'; ctx.fillText(`MASH ${g.mm.keyName('attack')}!`, bx, by - 14); ctx.globalAlpha = 1; }
        ctx.fillStyle = INK; ctx.fillRect(bx - bw / 2 - 3, by, bw + 6, 20); ctx.fillStyle = '#3a2250'; ctx.fillRect(bx - bw / 2, by + 3, bw, 14);
        const gg = ctx.createLinearGradient(bx - bw / 2, 0, bx + bw / 2, 0); gg.addColorStop(0, col); gg.addColorStop(1, '#fff'); ctx.fillStyle = gg; ctx.fillRect(bx - bw / 2, by + 3, bw * clamp(this.clashMeter / 100, 0, 1), 14);
        ctx.restore();
      }
    }
    if ((this.state === 'boltWind' || this.state === 'beamWind') && this.st > 6) {   // the charge (the bolt's and the beam's): a violet glow gathering at the orb -- "the orb lights up, then it fires" (the staff swings low and back: it follows the drawn orb)
      const o = CHARS.malachar?.point?.(this.pose(), 'orb'), ox = this.sx + this.facing * (o ? o[0] : 140), oy = this.sy + (o ? o[1] : -150), k = Math.min(1, this.st / (this.state === 'beamWind' ? MAL.beamWind : MAL.boltWind));
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; const gg = ctx.createRadialGradient(ox, oy, 2, ox, oy, 24 + 46 * k); gg.addColorStop(0, `rgba(255,170,255,${0.7 * k})`); gg.addColorStop(1, 'rgba(160,60,255,0)'); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(ox, oy, 24 + 46 * k, 0, TAU); ctx.fill(); ctx.restore();
    }
    if (this.state === 'finish' && this.st >= 90 && this.st < 150) {   // the mask's cracks (the pack's frames 14 and 28): one slow pale glow at the mask (flash safety: a 10-frame rise and a 24-frame fade, no flash -- the KRRRAK wash was the one flash)
      const m = CHARS.malachar?.point?.(this.pose(), 'mask'), mx = this.sx + this.facing * (m ? m[0] : 0), my = this.sy + (m ? m[1] : -200), a = Math.min(1, (this.st - 90) / 10) * Math.min(1, (150 - this.st) / 24);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; const gg = ctx.createRadialGradient(mx, my, 2, mx, my, 64); gg.addColorStop(0, `rgba(255,240,200,${0.45 * a})`); gg.addColorStop(1, 'rgba(255,140,240,0)'); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(mx, my, 64, 0, TAU); ctx.fill(); ctx.restore();
    }
    if (this.state === 'clap' && ((this.st >= 12 && this.st < 24) || (this.st >= 33 && this.st < 45))) {   // the two pats (the pack's frames 12 and 33): a violet-white sparkle where the hands meet
      const h = CHARS.malachar?.point?.(this.pose(), 'handL'), hx = this.sx + this.facing * (h ? h[0] : 40), hy = this.sy + (h ? h[1] : -120), u = (this.st - 12) % 21, a = Math.min(1, (u + 1) / 3) * Math.max(0, 1 - u / 12);   // (ramped in over 3 frames)
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; const gg = ctx.createRadialGradient(hx, hy, 1, hx, hy, 46); gg.addColorStop(0, `rgba(255,250,255,${0.8 * a})`); gg.addColorStop(0.4, `rgba(230,150,255,${0.5 * a})`); gg.addColorStop(1, 'rgba(170,70,255,0)'); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(hx, hy, 46, 0, TAU); ctx.fill(); ctx.restore();
    }
    // the four streams of feeling pouring out of the orb as a wave arrives
    if (this.state === 'summon' && this.st > 8 && this.st < 70) {
      const o = CHARS.malachar?.point?.(this.pose(), 'orb'), ox = this.sx + this.facing * (o ? o[0] : 140), oy = this.sy + (o ? o[1] : -150), u = Math.min(1, (this.st - 8) / 26), cols = { rage: '#ff5a3a', sad: '#5a9cf2', fear: '#f0e060', sloth: '#7ac880' };
      ctx.save(); ctx.lineCap = 'round'; ctx.globalCompositeOperation = 'lighter';
      (this.streams?.kinds || []).forEach((k, i) => {
        const e = this.refs[k], tx = e ? e.sx : ox - 200 - i * 120, ty = e ? e.sy - (e.h || 80) * 0.5 : oy + 60;
        ctx.globalAlpha = (1 - Math.max(0, (this.st - 50) / 20)) * 0.9; ctx.strokeStyle = cols[k]; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(ox, oy);
        ctx.bezierCurveTo(ox - 60, oy - 90 - i * 30, tx + 60, ty - 120, ox + (tx - ox) * u, oy + (ty - oy) * u); ctx.stroke();
      });
      ctx.restore();
    }
  }
  /** the four feelings in a row under the boss's bar: lit when beaten, pulsing while they are loose */
  /** the meter's height under the boss bar (src/hud.js _hudBottom: words and balloons stay under it) -- the FEELINGS row: icons r 17 at +16, +14 in 3-4P */
  get meterH() { return this.phase > 1.5 ? 28 : 37 + (this.game.players.length > 2 ? 14 : 0); }
  get meterLeft() { return this.phase > 1.5 ? 0 : 178; }   // (how far left of the bar's centre the FEELINGS row reaches: hud.js keeps it in the safe area -- the FX agent's)
  meterHud(ctx) {
    if (this.phase > 1.5) return;
    const g = this.game, y = (g._bossBarBottom ?? 77) + 16 + (g.players.length > 2 ? 14 : 0), ks = ['rage', 'sad', 'fear', 'sloth'], cols = { rage: '#ff5a3a', sad: '#5a9cf2', fear: '#f0e060', sloth: '#7ac880' };   // (3-4P: a little lower, clear of the score under the compact panels)
    const active = this.wave === 0 ? ['rage', 'sad'] : ['fear', 'sloth'];
    ctx.save(); ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    ks.forEach((k, i) => {
      const x = (g._bossBarCX ?? W / 2) + (i - 1.5) * 64, on = this.done[k], act = active.includes(k) && !on && this.phase === 1, pulse = act ? 1 + 0.08 * Math.sin(g.time * 7) : 1;
      ctx.save(); ctx.translate(x, y); ctx.scale(pulse, pulse);
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, 0, 17, 0, TAU); ctx.fill(); ctx.fillStyle = on ? cols[k] : act ? mixC(cols[k], 0.45) : '#3a3048'; ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.fill();
      ctx.strokeStyle = on ? INK : 'rgba(255,255,255,0.55)'; ctx.fillStyle = on ? '#fff' : 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      if (k === 'rage') { ctx.beginPath(); ctx.moveTo(-6, 7); ctx.quadraticCurveTo(-8, -2, 0, -9); ctx.quadraticCurveTo(0, -2, 4, -4); ctx.quadraticCurveTo(8, 2, 6, 7); ctx.closePath(); ctx.fill(); }
      else if (k === 'sad') { ctx.beginPath(); ctx.arc(-4, -1, 5, 0, TAU); ctx.arc(3, -3, 6, 0, TAU); ctx.arc(8, 0, 4.4, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(-3, 6); ctx.lineTo(-4, 10); ctx.moveTo(4, 6); ctx.lineTo(3, 10); ctx.stroke(); }
      else if (k === 'fear') { ctx.beginPath(); ctx.arc(-4.5, -1, 4.2, 0, TAU); ctx.arc(4.5, -1, 4.2, 0, TAU); ctx.fill(); ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-4, -1, 1.6, 0, TAU); ctx.arc(5, -1, 1.6, 0, TAU); ctx.fill(); }
      else { ctx.beginPath(); ctx.ellipse(0, 3, 9, 6, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(-1, -3, 4, Math.PI, 0); ctx.fill(); }
      ctx.restore();
      if (on) { ctx.font = 'bold 15px Bangers, Impact, sans-serif'; ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeText('✓', x + 13, y - 8); ctx.fillStyle = '#ffe066'; ctx.fillText('✓', x + 13, y - 8); }
    });
    ctx.font = 'bold 18px Bangers, Impact, sans-serif'; ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.textAlign = 'right'; ctx.strokeText('FEELINGS', (g._bossBarCX ?? W / 2) - 1.5 * 64 - 24, y + 5); ctx.fillStyle = '#e8c8ff'; ctx.fillText('FEELINGS', (g._bossBarCX ?? W / 2) - 1.5 * 64 - 24, y + 5);   // (right beside the first icon, not out on its own)
    ctx.restore();
  }
  drawOpts() { return { ...super.drawOpts(), scale: 1 }; }
  pose() {
    const g = this.game, st = this.state, t = g.time;
    if (this.ouch > 6 && ['drift', 'boltWind', 'bolt', 'stagger'].includes(st)) return this.anim('hurt', 1 - (this.ouch - 6) / 6);
    switch (st) {
      case 'intro': case 'laugh': return this.anim('laugh', t);
      case 'summon': return this.anim('summon', Math.min(1, this.st / 92));
      case 'watch': return this.anim('idle', t);
      case 'taunt': return this.anim('laugh', t);
      case 'clap': return this.anim('clap', Math.min(1, this.st / 74));
      case 'enough': return this.st < 150 ? this.anim('stagger', t) : this.anim('lightningWind', Math.min(1, (this.st - 150) / 60));
      case 'drift': return Math.abs(this.dest ? this.dest.x - this.x : 0) > 6 ? this.anim('drift', t * 0.7) : this.anim('idle', t);
      case 'boltWind': return this.anim('lightningWind', Math.min(1, this.st / MAL.boltWind));
      case 'bolt': return this.anim('lightning', Math.min(1, this.st / MAL.bolt));
      case 'beamWind': return this.anim('beamWind', Math.min(1, this.st / MAL.beamWind));
      case 'beamClash': return this.anim('beamHold', this.clashT / 60);
      case 'break': case 'fizzle': return this.st < 18 ? this.anim('beamEnd', this.st / 18) : this.anim('hurt', Math.min(1, (this.st - 18) / 30));
      case 'stagger': case 'wobble': case 'ropeWait': return this.anim('stagger', t);
      case 'finish': { const T = 70; return this.st < T ? this.anim('stagger', t) : this.st < T + 70 ? this.anim('maskCrack', (this.st - T) / 70) : this.anim('shrink', Math.min(1, (this.st - T - 70) / 80)); }
      default: return this.anim('idle', t);
    }
  }
  /** a violet glow on the floor under him (he stands in a very dark hall: the robe needs something to stand out against) */
  drawShadow(ctx) {
    super.drawShadow(ctx);
    if (this.hide || this.state === 'defeated' || this.sx < -200 || this.sx > W + 200) return;
    const sx = this.sx, sy = FLOOR_TOP + this.y, k = this.state === 'finish' && this.st > 140 ? Math.max(0, 1 - (this.st - 140) / 60) : 1;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 * k;
    const g = ctx.createRadialGradient(sx, sy, 6, sx, sy, 110); g.addColorStop(0, 'rgba(210,110,255,0.55)'); g.addColorStop(1, 'rgba(150,50,220,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(sx, sy, 110, 36, 0, 0, TAU); ctx.fill(); ctx.restore();
  }
  draw(ctx) {
    if (this.hide || this.state === 'defeated') return;
    if (this.sx < -300 || this.sx > W + 300) return;
    // a soft violet aura behind him: a rim of light round the dark robe
    const k = this.state === 'finish' && this.st > 140 ? Math.max(0, 1 - (this.st - 140) / 60) : 1;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.3 * k;
    const g = ctx.createRadialGradient(this.sx, this.sy - 120, 20, this.sx, this.sy - 120, 150); g.addColorStop(0, 'rgba(190,100,255,0.55)'); g.addColorStop(1, 'rgba(120,40,200,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(this.sx, this.sy - 120, 100, 150, 0, 0, TAU); ctx.fill(); ctx.restore();
    // the mask's two cracks (the pack's maskCrack holds still from tick 8 to 40): a small shudder at k .35 and .7
    let sh = 0;
    if (this.state === 'finish' && this.st >= 70 && this.st < 140) { const k = (this.st - 70) / 70; for (const c of [0.35, 0.7]) { const d = Math.abs(k - c); if (d < 0.07) sh += Math.sin(this.st * 2.6) * 4 * (1 - d / 0.07); } }
    if (sh) { ctx.save(); ctx.translate(sh, 0); super.draw(ctx); ctx.restore(); return; }
    super.draw(ctx);
  }
}
const mixC = (hex, k) => { const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255; return `rgb(${Math.round(r * k + 58 * (1 - k))},${Math.round(gg * k + 48 * (1 - k))},${Math.round(b * k + 72 * (1 - k))})`; };
