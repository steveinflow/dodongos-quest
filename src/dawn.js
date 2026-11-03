// Mystic Mountain's bonus: THE DAWN RIDE (docs/MYSTIC_MOUNTAIN.md, the comic's chapter seven) -- Dragon Dodongo flies the
// friends home over the valley while a wave of colour sweeps back over it, Morvath's grey gone.  On the sky-duel engine
// (src/skyduel.js SkyDuel: the same flight, riders, wingmen, fireballs, flame and rolls), with no foes at all: collect
// the sparkles.  It can't be failed -- a minute or so of flying, then the village and home (main.js dawnDone: mm_dawn,
// mm_epilogue, the end card).
//   The flyer (Dodongo's player, else P1) steers; a co-op rider's FIRE, the wingmen's fireballs and the dragon's own
//   fire and flame all collect the sparkles they touch; a full meter's SUPER (anyone's) is a SPARKLE BURST that gathers
//   every sparkle on screen.  Gold sparkles are worth five.  The colour wave runs with the ride, and a little ahead for
//   every sparkle caught.
//   Stage: src/stages/mmvalley.js (setColor(k): the wave front; RIDE_LEN of camX a lap).  Test hooks: window.DUEL_BOT
//   drives the dragon (as the duel's); DQ.duel is the ride.
import { SkyDuel, TUNE } from './skyduel.js';
import { useArt } from './sprite3d.js';
import { audio } from './audio-proxy.js';
import { LINES, heroLine } from './story.js';
import * as HUD from './hud.js';
import { W, H, INK, PLAYER_COLS } from './config.js';
import { clamp, TAU } from './rig.js';

const RIDE_T = 60 * 60;          // the ride: about a minute of flying
const CAM_SPEED = 1.8;           // (the valley's lap is ~63 s at the engine's 1.7)
const SPAWN = 22;                // frames between sparkle groups
const PICK_R = 52, SHOT_R = 22;  // the dragon's reach for a sparkle (round his body), a shot's
const FONT = 'Bangers, Impact, sans-serif', TITLE = '"Luckiest Guy", Bangers, sans-serif';

export class DawnRide extends SkyDuel {
  /** opts: as SkyDuel's (heroes, forms, ctrls, players) + stage (the valley, src/stages/mmvalley.js) */
  constructor(app, opts = {}) {
    super(app, { ...opts, phase: 0 });
    this.dawn = true;
    // (Book One's trio: the dragon's two seats take the other players first -- Anastasia, Shadow, in seat order; a
    //  second Dodongo never rides on himself.  Four players, or a Dodongo twin: whoever has no seat flies a whelp wingman
    //  alongside, as in Book Three's sky duel.  A party of three or fewer without twins rides exactly as before.)
    const others = [...this.riders.filter((r) => r.slot !== undefined), ...this.wingmen].sort((a, b) => a.slot - b.slot);
    const seated = others.filter((m) => m.hero !== 'dodongo').slice(0, 2);
    this.riders = seated.map((m) => ({ hero: m.hero, form: m.form, slot: m.slot, ctrl: m.ctrl, cd: 50, anim: 0, meter: 40, mk: 1 }));
    const WING_Y = [420, 190, 300];   // (below him first: clear of the ride's sparkle count and meter, top left)
    this.wingmen = others.filter((m) => m.ctrl && !seated.includes(m)).map((m, k) => ({ wing: true, slot: m.slot, hero: m.hero, form: m.form, ctrl: m.ctrl, x: 150, y: WING_Y[Math.min(2, k)], vx: 0, vy: 0, cd: 30, blink: 0, fire: 0, t: m.slot * 37, mem: {} }));
    // (and whoever isn't playing rides along anyway: all three friends fly home together)
    for (const h of ['ana', 'shadow']) if (this.riders.length < 2 && !this.riders.some((r) => r.hero === h)) this.riders.push({ hero: h, ctrl: null, cd: 60, anim: 0 });
    this.riders = this.riders.slice(0, 2);
    this.members = [...this.riders.filter((r) => r.ctrl), ...this.wingmen];
    for (const m of this.members) { if (m.meter === undefined) m.meter = 40; m.mk = m.mk || 1; }
    this.onWon = () => app.dawnDone?.();
  }
  async load() {
    const set = new Set(['dodongo_dragon']);
    for (const r of this.riders) set.add(r.hero + ':scene');
    if (this.wingmen.length) set.add('whelp');   // (a wingman's whelp: four players, or a Dodongo twin)
    await useArt(set);
    audio.music('title');
  }

  // ---------------------------------------------------------------------------------------------- the ride
  /** (SkyDuel's constructor calls this: the ride's own state, no King) */
  beginPhase() {
    this.phase = 0;
    this.player = { x: 220, y: 300, vx: 0, vy: 0, hearts: TUNE.hearts, inv: 0, roll: null, rollCd: 0, fireCd: 0, holdT: 0, flaming: false, anim: 'flyLoop', animT: 0, meter: 40, superCd: 0 };
    // (the engine's King, parked far off and beaten: nothing ever targets him)
    this.king = { x: 99999, y: 300, hp: 0, maxHp: 1, act: null, t: 0, hurt: 0, flash: 0, next: { cast: 1e9, whelp: 1e9, tail: 1e9, charge: 1e9 }, anim: 'fly', animK: 0 };
    this.shots = []; this.kshots = []; this.whelps = []; this.orbs = []; this.fx = []; this.wave = null; this.warn = null; this.clash = null; this.fall = null;
    this.sparkles = []; this.caught = 0; this.rideT = 0; this.gold = 0; this.lines = 0;
    this.R = Math.random;
    for (const m of this.members) m.meter = 40;
    this.state = 'intro'; this.stateT = 0;
    this.banner = 'Collect the sparkles!';
    this.stage.setColor?.(0);
    this.player.y = 600;
  }
  restartPhase() { /* (it can't be lost) */ }
  get colourK() { return clamp(this.rideT / RIDE_T * 0.92 + Math.min(0.2, this.caught * 0.0008), 0, 1); }

  update() {
    this.t++; this.stateT++;
    const P = this.player;
    this.camX += this.state === 'intro' ? 1.0 : CAM_SPEED;
    this.fx = this.fx.filter((e) => ++e.t < e.life);
    if (this.hintT < 600) this.hintT++;
    if (this.state === 'intro') {                 // (up into the morning sky)
      P.y = Math.max(300, 600 - this.stateT * 4); this.animate(P, 'flyLoop');
      const i = this.input();
      this.stepWingmen(false);
      if (this.stateT > 110 || (this.stateT > 30 && (i.firePress || i.roll))) { this.state = 'ride'; this.stateT = 0; this.say('mmvalley'); }
      return;
    }
    if (this.state === 'home') {                  // (the village: down they glide)
      P.x += (W + 200 - P.x) * 0.012; P.y += (260 - P.y) * 0.02; this.animate(P, 'flyLoop');
      this.stepWingmen(false);
      this.stage.setColor?.(1);
      this.stepSparkles(false);
      if (this.stateT > 170) this.won = true;
      return;
    }
    // the ride
    this.rideT++;
    this.stepPlayer(false);
    this.stepWingmen(true);
    this.stepRiders();
    this.stepMembers();
    this.stepShots();
    this.stepSparkles(true);
    this.stage.setColor?.(this.colourK);
    if (this.lines === 1 && this.colourK > 0.3) { this.lines = 2; this.say('colours'); }
    if (this.rideT >= RIDE_T) {
      this.state = 'home'; this.stateT = 0; this.banner = 'HOME!';
      audio.jingle('freed_big');
      this.endBeams();
    }
  }
  endBeams() { this.riders.forEach((r) => this.endBeam(r)); this.player.flaming = false; this.player.holdT = 0; }
  /** a word from the riders (Anastasia's -- "LOOK! The colors are coming back!" -- or the dragon's WOO-HOO!) */
  say(key) {
    this.lines = Math.max(this.lines, 1);
    const ana = this.riders.findIndex((r) => r.hero === 'ana');
    let text, x, y;
    if (key === 'colours' && ana >= 0) { text = heroLine(LINES.levelStart.mmvalley?.[1], 'ana') || 'LOOK! The colors are coming back!'; [x, y] = this.seat(ana); }
    else { text = 'WOO-HOO!'; x = this.player.x + 60; y = this.player.y - 40; }
    // (under the "Collect the sparkles!" banner while it's up -- the ride's first 240 frames)
    const yMin = this.state === 'ride' && this.stateT < 240 ? 215 : 120;
    this.fx.push({ k: 'text', x: clamp(x + 40, 140, W - 140), y: Math.max(yMin, y - 70), t: 0, life: 150, text, col: '#fff6e0', size: 22 });
  }

  // ---------------------------------------------------------------------------------------------- sparkles
  stepSparkles(spawn) {
    const P = this.player, R = this.R;
    if (spawn && this.rideT % SPAWN === 1 && this.rideT < RIDE_T - 90) {
      const kind = R(), y0 = 130 + R() * 300;
      if (kind < 0.55) this.addSparkle(W + 30, y0);
      else if (kind < 0.85) { const up = R() < 0.5 ? -1 : 1; for (let i = 0; i < 5; i++) this.addSparkle(W + 30 + i * 42, clamp(y0 + up * Math.sin(i / 4 * Math.PI) * 60, 120, 450)); }   // (an arc of five)
      else this.addSparkle(W + 30, y0, true);   // (a gold one: worth five)
    }
    const [mx, my] = [P.x + 20, P.y - 10];
    for (const s of this.sparkles) {
      s.t++; s.x += s.vx; s.y += Math.sin(s.t * 0.08 + s.ph) * 0.6;
      if (s.got) continue;
      if (s.x < -40) { s.dead = true; continue; }
      if ((s.x - mx) * (s.x - mx) + (s.y - my) * (s.y - my) < PICK_R * PICK_R) { this.catch(s, null); continue; }
      this.riders.forEach((r, i) => { if (s.got) return; const [sx, sy] = this.seat(i); if ((s.x - sx) ** 2 + (s.y - sy + 30) ** 2 < 34 * 34) this.catch(s, r.meter !== undefined ? r : null); });
      for (const m of this.wingmen) if (!s.got && (s.x - m.x) ** 2 + (s.y - m.y) ** 2 < 40 * 40) this.catch(s, m);
    }
    this.sparkles = this.sparkles.filter((s) => !s.dead && !(s.got && s.t - s.got > 24));
  }
  addSparkle(x, y, gold = false) { this.sparkles.push({ x, y, vx: -(2.6 + this.R() * 0.9) - (gold ? 0.6 : 0), t: 0, ph: this.R() * TAU, gold, got: 0 }); }
  /** a sparkle caught (by: the player whose meter it feeds; null: the flyer's) */
  catch(s, by) {
    s.got = s.t;
    const n = s.gold ? 5 : 1;
    this.caught += n; if (s.gold) this.gold++;
    this.app.run.score = (this.app.run.score || 0) + 100 * n;
    const m = by || this.player;
    m.meter = Math.min(TUNE.meterMax, (m.meter || 0) + (s.gold ? 18 : 5));
    audio.sfx('pickup_coin', { vol: 0.35, pitch: 1.2 + Math.min(0.8, (this.caught % 12) * 0.06) });
    this.fx.push({ k: 'spark', x: s.x, y: s.y, t: 0, life: 16, rgb: s.gold ? '255,220,90' : '255,250,210' });
    if (s.gold) this.fx.push({ k: 'text', x: s.x, y: s.y - 30, t: 0, life: 40, text: '+5!', col: '#ffe066', size: 22 });
  }
  /** a SPARKLE BURST (a full meter's SUPER): every sparkle on the screen, gathered in a rainbow ring */
  burst(by) {
    const P = this.player;
    for (const s of this.sparkles) if (!s.got && s.x < W + 20) this.catch(s, by === this.player ? null : by);
    this.fx.push({ k: 'ring', x: P.x, y: P.y, t: 0, life: 30 });
    this.fx.push({ k: 'text', x: clamp(P.x + 60, 160, W - 160), y: Math.max(120, P.y - 100), t: 0, life: 70, text: 'SPARKLE BURST!', col: '#fff1a6', size: 30 });
    audio.sfx('special'); audio.jingle('freed_big');
  }

  // ---------------------------------------------------------------------------------------------- the engine's parts, for the ride
  /** the dragon's SUPER: the flame wave, and a sparkle burst */
  superWave() { super.superWave(); this.burst(this.player); }
  /** the riders' and the wingmen's SUPER: a sparkle burst (their duel supers aim at the King) */
  stepMembers() {
    for (const m of this.members) {
      if (m.meter < TUNE.meterMax) m.meter = Math.min(TUNE.meterMax, m.meter + TUNE.meterRegen);
      if (m.away || !this.superPressed(m)) continue;
      if (m.meter >= TUNE.meterMax) { m.meter = 0; this.burst(m); }
    }
  }
  /** shots and beams: they catch sparkles (there's nothing else to hit) */
  stepShots() {
    for (const s of this.shots) {
      s.x += s.vx; s.y += s.vy; s.life--;
      if (s.life <= 0 || s.x > W + 40) { s.dead = true; continue; }
      for (const q of this.sparkles) if (!q.got && (q.x - s.x) ** 2 + (q.y - s.y) ** 2 < (SHOT_R + s.r) ** 2) this.catch(q, s.by || null);
    }
    this.riders.forEach((r, i) => {
      if (!r.beam) return;
      const [sx, sy] = this.seat(i), B = r.beam; B.x = sx + 10; B.y = sy - 18; B.hitX = null;
      if (B.t % 3 === 1) for (const q of this.sparkles) if (!q.got && q.x > B.x && Math.abs(q.y - B.y) < 24) this.catch(q, r.meter !== undefined ? r : null);
    });
    if (this.player.flaming) {                    // (the flame stream sweeps them up too)
      const [mx, my] = this.mouth();
      for (const q of this.sparkles) if (!q.got && q.x > mx && q.x < mx + TUNE.flameRange && Math.abs(q.y - my) < 30 + (q.x - mx) * 0.12) this.catch(q, null);
    }
    if (this.wave) { this.wave.t++; this.wave.x += 14; if (this.wave.x > W + 200) this.wave = null; }
    this.shots = this.shots.filter((s) => !s.dead);
  }
  kingTarget() { return false; }
  drawKing() {}
  drawTail() {}

  // ---------------------------------------------------------------------------------------------- drawing
  draw(ctx) {
    const t = this.t / 60, P = this.player;
    this.stage.drawBack(ctx, this.camX, t);
    this.drawSparkles(ctx, t);
    this.drawShots(ctx, t);
    if (P.flaming) { const [mx, my, ma] = this.mouth(), L = TUNE.flameRange; this.drawStream(ctx, mx, my, mx + L * Math.cos(ma), my + L * Math.sin(ma) + P.vy * 6, t, '255,140,40', '255,240,170', 22); }
    if (this.wave) this.drawWave(ctx, this.wave, t);
    this.drawWingmen(ctx);
    this.drawDragon(ctx, t);
    this.stage.drawFront(ctx, this.camX, t);
    for (const e of this.fx) this.drawFx(ctx, e);
    this.drawRideHud(ctx, t);
  }
  drawSparkles(ctx, t) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const s of this.sparkles) {
      const k = s.got ? 1 - (s.t - s.got) / 24 : 1;
      if (k <= 0) continue;
      const r = (s.gold ? 15 : 10) * (s.got ? 1 + (1 - k) * 1.2 : 1 + 0.12 * Math.sin(s.t * 0.2 + s.ph));
      const y = s.got ? s.y - (1 - k) * 30 : s.y;
      const g = ctx.createRadialGradient(s.x, y, 1, s.x, y, r * 2.4);
      g.addColorStop(0, `rgba(255,255,240,${k})`); g.addColorStop(0.35, s.gold ? `rgba(255,214,90,${0.85 * k})` : `rgba(190,240,255,${0.75 * k})`); g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, y, r * 2.4, 0, TAU); ctx.fill();
      // a four-point twinkle
      ctx.fillStyle = `rgba(255,255,255,${0.9 * k})`; ctx.beginPath();
      const a = s.t * 0.05 + s.ph, L = r * 1.6, w = r * 0.28;
      for (let i = 0; i < 8; i++) { const b = a + i * TAU / 8, rr = i % 2 ? w : L; i ? ctx.lineTo(s.x + Math.cos(b) * rr, y + Math.sin(b) * rr) : ctx.moveTo(s.x + Math.cos(b) * rr, y + Math.sin(b) * rr); }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // (an inked little star on top: they read on the pale dawn sky too)
    ctx.save(); ctx.lineJoin = 'round';
    for (const s of this.sparkles) {
      if (s.got) continue;
      const r = (s.gold ? 11 : 7) * (1 + 0.12 * Math.sin(s.t * 0.2 + s.ph)), a = s.t * 0.05 + s.ph;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const b = a + i * TAU / 8, rr = i % 2 ? r * 0.38 : r; i ? ctx.lineTo(s.x + Math.cos(b) * rr, s.y + Math.sin(b) * rr) : ctx.moveTo(s.x + Math.cos(b) * rr, s.y + Math.sin(b) * rr); }
      ctx.closePath(); ctx.fillStyle = s.gold ? '#ffd23a' : '#fffbe8'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = s.gold ? '#a8601a' : '#c8902a'; ctx.stroke();
    }
    ctx.restore();
  }
  drawRideHud(ctx, t) {
    const P = this.player;
    const band = ctx.createLinearGradient(0, 0, 0, 80); band.addColorStop(0, 'rgba(40,20,30,0.35)'); band.addColorStop(1, 'rgba(40,20,30,0)');
    ctx.fillStyle = band; ctx.fillRect(0, 0, W, 80);
    // the sparkle count
    ctx.save(); ctx.translate(34, 34); ctx.fillStyle = '#fff1a6'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.beginPath();
    for (let i = 0; i < 8; i++) { const b = i * TAU / 8 - Math.PI / 2, rr = i % 2 ? 5 : 15; i ? ctx.lineTo(Math.cos(b) * rr, Math.sin(b) * rr) : ctx.moveTo(Math.cos(b) * rr, Math.sin(b) * rr); }
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    HUD.outlined(ctx, `x ${this.caught}`, 56, 46, 30, '#fff6e0', FONT, 0.24, 'left');
    // the SUPER meter (the dragon's: a sparkle burst)
    const full = P.meter >= TUNE.meterMax;
    ctx.fillStyle = 'rgba(20,12,24,0.7)'; ctx.fillRect(16, 60, 160, 12);
    ctx.fillStyle = full ? (Math.floor(t * 6) % 2 ? '#fff1a6' : '#ffb03a') : '#ffd23a'; ctx.fillRect(18, 62, 156 * Math.min(1, P.meter / TUNE.meterMax), 8);
    ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.strokeRect(16, 60, 160, 12);
    const sg = this.app.lastCtrl === 'touch' ? 'SUPER' : this.app.glyphText('special', this.flyCtrl);
    HUD.outlined(ctx, full ? `${sg}: SPARKLE BURST!` : 'SUPER', 184, 71, 14, full ? '#fff1a6' : '#ffe9c0', FONT, 0.24, 'left');
    // the way home: a dragon on a ribbon to the village
    const k = clamp(this.rideT / RIDE_T, 0, 1), x0 = W / 2 - 170, x1 = W / 2 + 170;
    HUD.outlined(ctx, 'HOME TO THE VILLAGE', W / 2, 26, 18, '#fff6e0', FONT, 0.24, 'center');
    ctx.fillStyle = 'rgba(20,12,24,0.6)'; ctx.fillRect(x0, 34, x1 - x0, 10);
    const gr = ctx.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, '#ffb070'); gr.addColorStop(1, '#9de07a');
    ctx.fillStyle = gr; ctx.fillRect(x0, 34, (x1 - x0) * k, 10);
    ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.strokeRect(x0, 34, x1 - x0, 10);
    ctx.fillStyle = '#ff7a2a'; ctx.beginPath(); ctx.arc(x0 + (x1 - x0) * k, 39, 8, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f4e2c0'; ctx.fillRect(x1 + 8, 30, 14, 12); ctx.fillStyle = '#c8442a'; ctx.beginPath(); ctx.moveTo(x1 + 6, 31); ctx.lineTo(x1 + 15, 22); ctx.lineTo(x1 + 24, 31); ctx.fill();   // (a little house)
    // the co-op players: who's aboard and their SUPER
    let ry = 96;
    for (const m of this.members) {
      const name = m.wing ? `P${m.slot + 1} WINGMAN` : `P${m.slot + 1} ${m.hero === 'ana' ? 'ANASTASIA' : m.hero.toUpperCase()}`;
      const f = m.meter >= TUNE.meterMax;
      HUD.outlined(ctx, name + (f ? '  SUPER: SPARKLE BURST!' : ''), W - 20, ry, 15, f ? '#fff1a6' : PLAYER_COLS[m.slot] || '#fff1d6', FONT, 0.24, 'right');
      ry += 22;
    }
    // the prompt and the banners
    if (this.state === 'intro' || (this.state === 'ride' && this.stateT < 240) || this.state === 'home') {
      const a = this.state === 'home' ? clamp(this.stateT / 12, 0, 1) : this.state === 'intro' ? clamp(this.stateT / 12, 0, 1) : clamp((240 - this.stateT) / 30, 0, 1);
      ctx.save(); ctx.globalAlpha = a;
      HUD.outlined(ctx, this.state === 'home' ? 'HOME!' : 'Collect the sparkles!', W / 2, 150, 40, '#ffe066', TITLE, 0.15, 'center');
      if (this.state === 'home' && this.caught > 0) HUD.outlined(ctx, `${this.caught} sparkle${this.caught === 1 ? '' : 's'}!`, W / 2, 196, 28, '#fff6e0', FONT, 0.24, 'center');   // (the tally)
      ctx.restore();
    }
    if (this.state === 'ride' && this.hintT < 600) {   // (the controls, in the ride's first seconds)
      const id = this.flyCtrl, touch = this.app.lastCtrl === 'touch' && (id === 'any' || id === 'touch');
      const txt = touch ? 'Steer with the stick!   FIRE catches sparkles too   SUPER when the bar is full'
        : `Steer to catch them!   [${this.app.glyphText('attack', id)}] fire catches them too   [${this.app.glyphText('special', id)}] super`;
      ctx.save(); ctx.globalAlpha = clamp((600 - this.hintT) / 40, 0, 1);
      ctx.font = 'bold 18px "Comic Neue", "Comic Sans MS", sans-serif';
      const tw = ctx.measureText(txt).width + 30, by = H - 50;
      ctx.fillStyle = '#ffe58a'; ctx.fillRect(W / 2 - tw / 2, by, tw, 34); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeRect(W / 2 - tw / 2, by, tw, 34);
      ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, W / 2, by + 17);
      ctx.restore();
    }
  }
}
