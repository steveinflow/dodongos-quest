// The sky duel's SUPERS for every player (src/skyduel.js): the dragon's flyer has his flame wave; now each RIDER a player
// steers (P2 on his back) and each WINGMAN whelp (P3 / P4) has a meter of its own too -- fed by its own hits (scaled by
// what it deals, so it fills about as fast as the flyer's: SkyDuel.feed), the whelps it gets and the slow regen -- and
// SUPER (special) with it full fires a duel version of its hero's super:
//   ANASTASIA  STARFALL         stars rain down on the King and on every whelp   (the Archmage's STARFALL+: more, golden)
//   SHADOW     SHADOW STRIKE    he leaps off the dragon, slashes across the King three times and lands back in the saddle
//                               (Legend Shadow's LEGEND STRIKE: five quick golden slashes)
//   SCARLET    CRIMSON CYCLONE  her hook spun into a cyclone: it pulls the whelps in and grinds into the King
//                               (the Pirate Queen's BROADSIDE: her galleon sails across the sky and its guns open up)
//   DODONGO    DRAGON FLARE     (riding while another hero flies the dragon) a big fireball that bursts on the King
//   a WINGMAN  FIRE BURST       a little fire wave from its whelp that curves onto the King
// Each one deals TUNE.superDmg x TUNE.memberSuper (0.6) to the King in all (the fight stays easy; a 4-player team fires
// three of them), clears the whelps it reaches, and gets a short flash in the hero's colour and its name popping up --
// no freeze.  Only in the fight: a phase's end, a lost try or the breath clash ends them (endSupers).
import { W, H, INK, PLAYER_COLS } from './config.js';
import { CHARS } from './chars.js';
import { HEROES } from './heroes.js';
import { audio } from './audio-proxy.js';
import * as HUD from './hud.js';
import { drawGalleon } from './galleon.js';
import { clamp, TAU } from './rig.js';

const VEL0 = { x: 0, y: 0, z: 0 };
const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u));
const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(String(hex).slice(i, i + 2), 16) || 255).join(',');

/** which super a member fires */
export function superKind(m) {
  if (m.wing) return 'burst';
  if (m.hero === 'ana') return 'starfall';
  if (m.hero === 'shadow') return 'strike';
  if (m.hero === 'scarlet') return m.form === 'pirate' ? 'broadside' : 'cyclone';
  return 'flare';
}
/** its name, as the levels call it (the form's own: STARFALL+, LEGEND STRIKE, BROADSIDE ...) */
export function superName(m) {
  if (m.wing) return 'FIRE BURST';
  return (HEROES[m.form] || HEROES[m.hero])?.special?.name || 'SUPER';
}
const accentOf = (m) => (m.wing ? PLAYER_COLS[m.slot] || '#ff9a3a' : (HEROES[m.form] || HEROES[m.hero])?.accent || '#ffd23a');

/** where the member is on screen (a rider: at her chest on her seat; a wingman: its whelp) */
function originOf(d, m) {
  if (m.wing) return [m.x + 26, m.y - 4];
  const [sx, sy] = d.seat(d.riders.indexOf(m));
  return [sx + 8, sy - 20];
}
export const memberAt = originOf;
/** the King's hit circle right now */
const kc = (d) => d.kingCircle();
/** damage on the King: only while he can be hit (a phase's end, the clash: nothing) */
function hitK(d, dmg, x, y, flash = 6) { if (!d.kingTarget()) return false; d.hitKing(dmg, true, x, y, flash); return true; }

// ------------------------------------------------------------------------------------------------ firing
/** fire member m's super (its meter is full: SkyDuel checks) */
export function fireSuper(d, m) {
  const kind = superKind(m), total = d.tune.superDmg * d.tune.memberSuper, [ox, oy] = originOf(d, m);
  m.meter = 0; m.superAt = d.t;
  const S = { kind, m, t: 0, total, dealt: 0, done: false, x: ox, y: oy };
  if (kind === 'starfall') {
    const plus = m.form === 'archmage';
    Object.assign(S, { plus, n: plus ? 12 : 8, every: plus ? 4 : 5, spawned: 0, stars: [] });
    for (const w of d.whelps) if (!w.dead && w.x > 40 && w.x < W - 70) S.stars.push(star(d, S, w));      // (one for every whelp on screen, at once)
    audio.sfx('starfall', { vol: 0.75 });
  } else if (kind === 'strike') {
    const legend = m.form === 'legend';
    Object.assign(S, { legend, n: legend ? 5 : 3, leap: 14, dash: legend ? 8 : 12, back: 16, trail: [] });
    S.dur = S.leap + S.n * S.dash + S.back;
    m.away = true;
    audio.sfx('shadow_strike', { vol: 0.8 });
  } else if (kind === 'cyclone') {
    Object.assign(S, { hits: 0, n: 4, R: 30, spin: 0, fade: 0, pulled: [] });
    audio.sfx('wind_gust', { vol: 0.6, pitch: 0.8 }); audio.sfx('swing_heavy', { vol: 0.7 });
  } else if (kind === 'broadside') {
    Object.assign(S, { dur: 112, sx: -160, sy: 212, balls: [], fired: 0, n: 6, flashes: [] });
    audio.sfx('swing_heavy', { vol: 0.7 }); audio.sfx('wind_gust', { vol: 0.5, pitch: 0.7 });
  } else if (kind === 'flare') {
    Object.assign(S, { r: 6, fly: false, bx: ox + 20, by: oy });
    audio.sfx('special', { vol: 0.8 });
  } else {   // burst
    Object.assign(S, { wx: m.x + 30, wy: m.y, hit: false, dy: d.wingmen.length > 1 ? (d.wingmen.indexOf(m) ? 66 : -66) : 0 });   // (two wingmen: an arc each, one high, one low)
    audio.sfx('fire_breath', { vol: 0.55, pitch: 1.3 }); audio.sfx('wind_gust', { vol: 0.4, pitch: 1.5 });
  }
  d.supers.push(S);
  if (m.wing) m.fire = 14; else m.anim = 20;
  // the flash in the hero's colour round them, and the name popping up -- short: nothing stops
  const rgb = rgbOf(accentOf(m));
  d.fx.push({ k: 'sup', t: 0, life: 14, x: ox, y: oy, rgb, draw: drawFlash });
  // the name: each player on a line of their own, top centre under the King's bar -- "P2 STARFALL!" -- so two or three at
  // once never pile up on each other or on the P tags round the dragon
  const lane = Math.max(0, d.members.indexOf(m));
  d.fx.push({ k: 'sup', t: 0, life: 62, x: W / 2, y: 112 + lane * 36, text: `P${m.slot + 1} ${superName(m)}!`, col: accentOf(m), draw: drawName });
  d.app.rumble?.({ ctrlId: m.ctrl }, 'special');
}
function drawFlash(ctx, e, u) {
  const a = 0.3 * (1 - u);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(e.x, e.y, 10, e.x, e.y, 560);
  g.addColorStop(0, `rgba(255,255,240,${a})`); g.addColorStop(0.25, `rgba(${e.rgb},${a * 0.8})`); g.addColorStop(1, `rgba(${e.rgb},0)`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
function drawName(ctx, e, u) {
  const k = e.t < 5 ? 0.6 + 0.6 * (e.t / 5) : e.t < 9 ? 1.2 - 0.2 * ((e.t - 5) / 4) : 1;   // (it pops: big, then settles)
  ctx.save(); ctx.globalAlpha = clamp((1 - u) * 4, 0, 1);
  HUD.outlined(ctx, e.text, e.x, e.y - u * 6, 28 * k, e.col, '"Luckiest Guy", Bangers, sans-serif', 0.18, 'center');
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ the tick
export function stepSupers(d) {
  for (const S of d.supers) { S.t++; STEP[S.kind](d, S); }
  d.supers = d.supers.filter((S) => !S.done);
}
/** a phase's end, a lost try, the clash: every super stops (a rider who leapt off is back in the saddle) */
export function endSupers(d) {
  for (const S of d.supers) if (S.m) S.m.away = false;
  d.supers = [];
}
/** is member m in the middle of its super */
export const superOn = (d, m) => d.supers.some((S) => S.m === m);

function star(d, S, w) {
  // (they appear in the sky up and to the left of what they fall on -- clear of the HUD's rows on the right -- and rain down)
  const C = kc(d), tx = w ? w.x : C.x, ty = w ? w.y : C.y;
  return { x: tx - 60 - Math.random() * 110, y: Math.max(70, ty - 230 - Math.random() * 60), age: 0, w: w || null, ox: w ? 0 : (Math.random() - 0.5) * C.r, oy: w ? 0 : (Math.random() - 0.5) * C.r * 0.9, trail: [], done: false, spin: Math.random() * TAU };
}
const STEP = {
  starfall(d, S) {
    if (S.spawned < S.n && S.t % S.every === 1) { S.stars.push(star(d, S, null)); S.spawned++; }
    const C = kc(d), v = S.plus ? 14 : 12.5;
    for (const s of S.stars) {
      if (s.done) continue;
      if (s.w && s.w.dead) { s.done = true; d.fx.push({ k: 'spark', x: s.x, y: s.y, t: 0, life: 12, rgb: '200,235,255' }); continue; }
      const tx = s.w ? s.w.x : C.x + s.ox, ty = s.w ? s.w.y : C.y + s.oy, dx = tx - s.x, dy = ty - s.y, L = Math.hypot(dx, dy) || 1;
      s.trail.push([s.x, s.y]); if (s.trail.length > 4) s.trail.shift();
      s.spin += 0.25; s.age++;
      if (L < v + 6) {
        s.done = true;
        if (s.w) d.killWhelp(s.w, true, S.m, false);
        else if (hitK(d, S.total / S.n, tx, ty)) audio.sfx('hit_light', { vol: 0.4, pitch: 1.5 });
        d.fx.push({ k: 'spark', x: tx, y: ty, t: 0, life: 16, rgb: S.plus ? '255,224,120' : '190,230,255' });
        d.fx.push({ k: 'sup', t: 0, life: 16, x: tx, y: ty, r: S.plus ? 30 : 24, gold: S.plus, draw: drawTwinkle });   // (a twinkle where it lands)
      } else { s.x += (dx / L) * v; s.y += (dy / L) * v; }
    }
    if (S.spawned >= S.n && S.stars.every((s) => s.done)) S.done = true;
    if (S.t > 260) S.done = true;
  },
  strike(d, S) {
    const C = kc(d), m = S.m, P = strikePos(d, S, C);
    S.pos = P;
    S.trail.push([P.x, P.y]); if (S.trail.length > 5) S.trail.shift();
    const u = S.t - S.leap;
    if (u >= 0 && u < S.n * S.dash && u % S.dash === Math.floor(S.dash / 2)) {   // (mid-dash: the slash lands)
      const j = Math.floor(u / S.dash);
      if (hitK(d, S.total / S.n, C.x, C.y)) audio.sfx('sword_slash', { vol: 0.6, pitch: 1 + j * 0.06 });
      const a = dashOf(C, j, S.legend);
      d.fx.push({ k: 'sup', t: 0, life: 12, a, legend: S.legend, draw: drawSlash });
      for (const w of d.whelps) if (!w.dead && segD(w.x, w.y, a) < 70) d.killWhelp(w, true, m, false);   // (a whelp on the slash's line goes too)
    }
    if (S.t >= S.dur) { S.done = true; m.away = false; m.anim = 10; d.fx.push({ k: 'spark', x: P.x, y: P.y + 20, t: 0, life: 14, rgb: '210,170,255' }); }
  },
  cyclone(d, S) {
    const C = kc(d);
    S.spin += 0.42; S.R = Math.min(64, S.R + 2);
    if (S.fade) { if (++S.fade > 9) S.done = true; return; }
    const dx = C.x - S.x, dy = C.y - S.y, L = Math.hypot(dx, dy) || 1, sp = Math.max(6, L * 0.08);
    if (L > C.r * 0.5) { S.x += (dx / L) * Math.min(sp, L); S.y += (dy / L) * Math.min(sp, L); }
    S.pulled = [];
    for (const w of d.whelps) {                 // (it drags the whelps in -- streaks of wind show it -- and they're gone)
      if (w.dead) continue;
      const q = Math.hypot(w.x - S.x, w.y - S.y);
      if (q < S.R + 22) d.killWhelp(w, true, S.m, false);
      else if (q < 520) { const k = 0.06 + 0.08 * (1 - q / 520); w.x += (S.x - w.x) * k - w.vx; w.by += (S.y - w.y) * k; w.hurt = 4; S.pulled.push(w); }
    }
    for (const q of d.kshots) if (!q.dead && Math.hypot(q.x - S.x, q.y - S.y) < S.R + q.r) { q.dead = true; d.spark(q.x, q.y, '255,140,150'); }
    if (L < C.r * 0.9 && S.t % 8 === 0 && S.hits < S.n) {
      S.hits++;
      if (hitK(d, S.total / S.n, S.x - S.R * 0.4, S.y + (S.hits % 2 ? -14 : 14))) audio.sfx('hit_heavy', { vol: 0.5 });
      if (S.hits >= S.n) S.fade = 1;
    }
    if (S.t > 150) S.fade = S.fade || 1;
  },
  broadside(d, S) {
    const k = 0.55;
    S.sx += (250 - S.sx) * 0.09;              // (in from the left, slowing to a stop off his left -- clear of him)
    const C = kc(d), port = (i) => [S.sx + k * (-113 + i * 46), S.sy - k * 18];
    if (S.fired < S.n && S.t >= 8 && (S.t - 8) % 8 === 0) {   // (its guns, one after another, on the King -- the first lands while its name is up)
      const i = S.fired % 6, [px, py] = port(i);
      S.balls.push({ x: px, y: py, vy: -3, w: null, done: false, trail: [] }); S.flashes.push({ i, t: S.t }); S.fired++;
      audio.sfx('bomb_blast', { vol: 0.22, pitch: 1.4 });
      const w = S.fired % 2 === 0 && d.whelps.find((q) => !q.dead && q.x < C.x && !S.balls.some((b) => b.w === q));   // (a whelp on this side of him: a ball for it too)
      if (w) S.balls.push({ x: px, y: py, vy: -3, w, done: false, trail: [] });
    }
    for (const b of S.balls) {
      if (b.done) continue;
      if (b.w && b.w.dead) { b.done = true; continue; }
      const tx = b.w ? b.w.x : C.x - C.r * 0.3, ty = b.w ? b.w.y : C.y, dx = tx - b.x, dy = ty - b.y, L = Math.hypot(dx, dy) || 1;
      b.trail.push([b.x, b.y]); if (b.trail.length > 5) b.trail.shift();
      if (L < 18) {
        b.done = true;
        if (b.w) d.killWhelp(b.w, true, S.m, false);
        else if (hitK(d, S.total / S.n, tx, ty)) audio.sfx('fireball_hit', { vol: 0.5, pitch: 0.8 });
        d.fx.push({ k: 'sup', t: 0, life: 18, x: tx, y: ty, r: 46, rgb: '255,170,70', draw: drawBoom });
      } else { b.vy = Math.min(b.vy + 0.2, 4); b.x += (dx / L) * 17; b.y += (dy / L) * 17 + b.vy * 0.3; }
    }
    if (S.t >= S.dur && S.balls.every((b) => b.done)) S.done = true;
    if (S.t > S.dur + 90) S.done = true;
  },
  flare(d, S) {
    const C = kc(d), [ox, oy] = originOf(d, S.m);
    if (!S.fly) {                                  // (it gathers in his hands, then he throws it)
      S.r = Math.min(26, S.r + 1.4); S.bx = ox + 26; S.by = oy - 6;
      if (S.t >= 18) { S.fly = true; audio.sfx('fireball_breath', { vol: 0.6, pitch: 0.8 }); }
      return;
    }
    const dx = C.x - S.bx, dy = C.y - S.by, L = Math.hypot(dx, dy) || 1;
    if (L < 22 || S.t > 110) {
      S.done = true;
      hitK(d, S.total, C.x - C.r * 0.3, C.y);
      for (const w of d.whelps) if (!w.dead && Math.hypot(w.x - S.bx, w.y - S.by) < 220) d.killWhelp(w, true, S.m, false);
      d.fx.push({ k: 'sup', t: 0, life: 26, x: S.bx, y: S.by, r: 120, rgb: '255,150,50', draw: drawBoom });
      audio.sfx('explosion', { vol: 0.6 });
      return;
    }
    S.bx += (dx / L) * 14; S.by += (dy / L) * 14;
  },
  burst(d, S) {
    const C = kc(d);
    S.wx += 11; S.wy += (C.y + S.dy - S.wy) * 0.07;
    for (const w of d.whelps) if (!w.dead && Math.abs(w.y - S.wy) < 80 && w.x < S.wx + 30 && w.x > S.wx - 100) d.killWhelp(w, true, S.m, false);
    for (const q of d.kshots) if (!q.dead && Math.abs(q.y - S.wy) < 80 && q.x < S.wx + 30) q.dead = true;
    if (!S.hit && S.wx > C.x - C.r && Math.abs(C.y - S.wy) < C.r + 40) {   // (it bursts on him, and it's gone)
      S.hit = true; S.done = true;
      if (hitK(d, S.total, C.x - C.r * 0.6, S.wy)) audio.sfx('fireball_hit', { vol: 0.6 });
      d.fx.push({ k: 'sup', t: 0, life: 22, x: C.x - C.r * 0.5, y: S.wy, r: 95, rgb: '255,120,40', draw: drawBoom });
    }
    if (S.wx > W + 160) S.done = true;
  },
};
const segD = (px, py, a) => { const dx = a.x1 - a.x0, dy = a.y1 - a.y0, L2 = dx * dx + dy * dy || 1, u = clamp(((px - a.x0) * dx + (py - a.y0) * dy) / L2, 0, 1); return Math.hypot(px - a.x0 - dx * u, py - a.y0 - dy * u); };
/** Shadow's j-th dash across the King: from one side to the other, alternate ways (a rising, then a falling slash ...) */
function dashOf(C, j, legend) {
  const dir = j % 2 ? -1 : 1, sg = j % 2 ? 1 : -1, span = legend ? 100 : 108, h = (legend ? 44 : 55) * (1 + 0.2 * (j % 3 === 2));   // (a sword cut across him, not a beam)
  return { x0: C.x - dir * span, y0: C.y - sg * h, x1: C.x + dir * (span - 10), y1: C.y + sg * h, dir };
}
/** where Shadow is during his strike: the leap off the dragon, the dashes, the leap back to his seat */
function strikePos(d, S, C) {
  const [sx, sy] = d.seat(d.riders.indexOf(S.m)), seat = { x: sx, y: sy - 24 };
  const u = S.t - S.leap, D = S.n * S.dash;
  if (S.t < S.leap) {
    const a = dashOf(C, 0, S.legend), k = ease(S.t / S.leap);
    return { x: seat.x + (a.x0 - seat.x) * k, y: seat.y + (a.y0 - seat.y) * k - Math.sin(Math.PI * k) * 70, pose: 'leap', face: 1 };
  }
  if (u < D) {
    const j = Math.floor(u / S.dash), a = dashOf(C, j, S.legend), k = ease((u % S.dash) / S.dash);
    // (between dashes he's at the end of one and the start of the next: they meet on the same side)
    return { x: a.x0 + (a.x1 - a.x0) * k, y: a.y0 + (a.y1 - a.y0) * k, pose: 'slash', face: a.dir };
  }
  const a = dashOf(C, S.n - 1, S.legend), k = ease(Math.min(1, (u - D) / S.back));
  return { x: a.x1 + (seat.x - a.x1) * k, y: a.y1 + (seat.y - a.y1) * k - Math.sin(Math.PI * k) * 60, pose: 'leap', face: -1 };
}
function drawSlash(ctx, e, u) {
  const a = e.a, gold = e.legend, al = 1 - u;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  const mx = (a.x0 + a.x1) / 2, my = (a.y0 + a.y1) / 2, nx = -(a.y1 - a.y0), ny = a.x1 - a.x0, L = Math.hypot(nx, ny) || 1, bow = 26 * a.dir;
  for (const [w, col] of [[16, gold ? '255,190,60' : '200,140,255'], [6, gold ? '255,236,170' : '255,255,255']]) {   // (Legend's: gold through and through)
    ctx.strokeStyle = `rgba(${col},${(w > 10 ? (gold ? 0.7 : 0.45) : 0.95) * al})`; ctx.lineWidth = w * (1 - u * 0.6);
    ctx.beginPath(); ctx.moveTo(a.x0, a.y0); ctx.quadraticCurveTo(mx + (nx / L) * bow, my + (ny / L) * bow, a.x1, a.y1); ctx.stroke();
  }
  ctx.restore();
}
/** a grappling hook at the origin, its eye up and its point down-left: a straight shank, the bend, a barbed point -- metal,
 * inked, a gold ring at the eye (Scarlet's) */
function drawHook(ctx) {
  const path = () => { ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(0, 6); ctx.arc(-8, 6, 8, 0, Math.PI * 0.95); };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = INK; ctx.lineWidth = 8; path(); ctx.stroke();
  ctx.strokeStyle = '#dfe0ea'; ctx.lineWidth = 4.5; path(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(1, -15); ctx.lineTo(1, 4); ctx.stroke();   // (a glint)
  ctx.fillStyle = '#dfe0ea'; ctx.strokeStyle = INK; ctx.lineWidth = 2.2;   // (the barbed point)
  ctx.beginPath(); ctx.moveTo(-17, 9); ctx.lineTo(-19, -4); ctx.lineTo(-11, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.arc(0, -20, 4.5, 0, TAU); ctx.fill(); ctx.stroke();   // (the ring her chain runs to)
}
/** a star landing: a four-point twinkle that flares and shrinks */
function drawTwinkle(ctx, e, u) {
  const k = u < 0.3 ? u / 0.3 : 1 - (u - 0.3) / 0.7, r = e.r * (0.5 + 0.5 * k);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(e.x, e.y); ctx.rotate(u * 0.8);
  ctx.fillStyle = e.gold ? `rgba(255,226,140,${k})` : `rgba(200,236,255,${k})`;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * 0.18 : r; i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(rr, 0); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = `rgba(255,255,255,${k})`; ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, TAU); ctx.fill();
  ctx.restore();
}
function drawBoom(ctx, e, u) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const r = e.r * (0.35 + 0.65 * Math.sqrt(u)), a = 1 - u;
  const g = ctx.createRadialGradient(e.x, e.y, 2, e.x, e.y, r);
  g.addColorStop(0, `rgba(255,250,220,${0.9 * a})`); g.addColorStop(0.4, `rgba(${e.rgb},${0.7 * a})`); g.addColorStop(1, `rgba(${e.rgb},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = `rgba(255,220,160,${0.8 * a})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.x, e.y, r * 1.05, 0, TAU); ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ drawing
/** behind the King: the Pirate Queen's galleon in the sky */
export function drawSupersBack(ctx, d) {
  for (const S of d.supers) {
    if (S.kind !== 'broadside') continue;
    const k = 0.55;
    ctx.save(); ctx.translate(S.sx, S.sy + Math.sin(d.t / 24) * 4); ctx.scale(k, k);
    ctx.globalAlpha = clamp(Math.min(S.t / 8, (S.dur - S.t) / 14), 0, 1);   // (it fades in coming on, and away once its guns are done)
    drawGalleon(ctx, d.t / 60, { sky: true });
    ctx.restore();
    for (const F of S.flashes) {                 // its guns' flashes
      const q = 1 - (S.t - F.t) / 14; if (q <= 0) continue;
      const fx = S.sx + k * (-113 + F.i * 46), fy = S.sy - k * 18;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(fx, fy, 2, fx, fy, 30 * q + 8); gr.addColorStop(0, `rgba(255,250,210,${q})`); gr.addColorStop(1, 'rgba(255,170,60,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(fx, fy, 30 * q + 8, 0, TAU); ctx.fill(); ctx.restore();
      ctx.fillStyle = `rgba(230,225,215,${0.5 * q})`; ctx.beginPath(); ctx.arc(fx + 14, fy - 4, 12 * (1.4 - q), 0, TAU); ctx.fill();
    }
    S.flashes = S.flashes.filter((F) => S.t - F.t < 14);
  }
}
/** over the King: the stars, Shadow on his strike, the cyclone, the cannonballs, the flare, the fire burst */
export function drawSupersFront(ctx, d) {
  for (const S of d.supers) if (S.kind === 'burst') DRAW.burst(ctx, d, S);   // (the wingmen's fire under the rest)
  for (const S of d.supers) if (S.kind !== 'burst') DRAW[S.kind]?.(ctx, d, S);
}
function starPath(ctx, x, y, r, a) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const q = a + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; i ? ctx.lineTo(x + Math.cos(q) * rr, y + Math.sin(q) * rr) : ctx.moveTo(x + Math.cos(q) * rr, y + Math.sin(q) * rr); }
  ctx.closePath();
}
const DRAW = {
  starfall(ctx, d, S) {
    const [ox, oy] = originOf(d, S.m), r = S.plus ? 17 : 13, glow = S.plus ? '255,214,110' : '150,215,255';
    if (S.t < 40) {                                // (a ring of little stars round her as she calls them)
      const a = 1 - S.t / 40;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) { const q = S.t * 0.12 + i * TAU / 6; ctx.fillStyle = `rgba(${glow},${a})`; starPath(ctx, ox + Math.cos(q) * 30, oy + Math.sin(q) * 18, 5, q); ctx.fill(); }
      ctx.restore();
    }
    for (const s of S.stars) {
      if (s.done) continue;
      const fa = Math.min(1, (s.age + 1) / 5);   // (fading in where it appears)
      ctx.save(); ctx.globalAlpha = fa; ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      if (s.trail.length) {                       // a short tail, thinning away from the star
        const [x0, y0] = s.trail[0], tg = ctx.createLinearGradient(x0, y0, s.x, s.y);
        tg.addColorStop(0, `rgba(${glow},0)`); tg.addColorStop(1, `rgba(${glow},0.6)`);
        ctx.strokeStyle = tg; ctx.lineWidth = r * 0.55; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(s.x, s.y); ctx.stroke();
      }
      const g = ctx.createRadialGradient(s.x, s.y, 1, s.x, s.y, r * 2.2);
      g.addColorStop(0, 'rgba(255,255,240,0.9)'); g.addColorStop(1, `rgba(${glow},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, r * 2.2, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.save(); ctx.globalAlpha = fa;
      ctx.fillStyle = S.plus ? '#ffe066' : '#fff6c8'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      starPath(ctx, s.x, s.y, r, s.spin); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  },
  strike(ctx, d, S) {
    const P = S.pos; if (!P) return;
    const art = CHARS[S.m.hero], A = art?.ANIM; if (!A) return;
    const f = P.pose === 'slash' ? (A.point || A.select || A.idle) : (A.portal || A.select || A.idle);
    const pose = typeof f === 'function' ? f(d.t / 60) : f || {};
    const draw = (x, y, alpha) => {
      ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y + 34);
      const m = ctx.getTransform(); ctx.shadowColor = S.legend ? '#ffd84a' : '#e2c8ff'; ctx.shadowBlur = (S.legend ? 4 : 2.5) * Math.hypot(m.a, m.b);   // (Legend: a golden rim)
      art.draw(ctx, pose, { facing: P.face, t: d.t / 60, scale: 0.5, mem: S.mem || (S.mem = {}), vel: VEL0 });
      if (S.legend && alpha >= 1) art.draw(ctx, pose, { facing: P.face, t: d.t / 60, scale: 0.5, mem: S.mem, vel: VEL0 });   // (twice: the rim doubles, bright)
      ctx.restore();
    };
    if (S.legend) {                                // (Legend Shadow: a golden glow round him all the way)
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(P.x, P.y, 4, P.x, P.y, 52); g.addColorStop(0, 'rgba(255,214,110,0.55)'); g.addColorStop(1, 'rgba(255,190,60,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(P.x, P.y, 52, 0, TAU); ctx.fill(); ctx.restore();
    }
    if (P.pose === 'slash') S.trail.slice(0, -1).forEach(([x, y], i, T) => draw(x, y, 0.12 + 0.25 * (i / Math.max(1, T.length))));   // (afterimages)
    draw(P.x, P.y, 1);
  },
  cyclone(ctx, d, S) {
    const a = S.fade ? 1 - S.fade / 9 : Math.min(1, S.t / 6), R = S.R * (S.fade ? 1 - S.fade / 12 : 1);
    const [ox, oy] = originOf(d, S.m);
    if (!S.fade) {                                 // her chain, out from her hand to the spinning heart of it: links
      const x1 = S.x, y1 = S.y - R * 0.2, L = Math.hypot(x1 - ox, y1 - oy) || 1, n = Math.floor(L / 11), ang = Math.atan2(y1 - oy, x1 - ox);
      ctx.save(); ctx.globalAlpha = a;
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        ctx.save(); ctx.translate(ox + (x1 - ox) * u, oy + (y1 - oy) * u); ctx.rotate(ang + (i % 2 ? Math.PI / 2 : 0));
        ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(0, 0, i % 2 ? 3 : 6.5, i % 2 ? 2.5 : 3.6, 0, 0, TAU); ctx.stroke();
        ctx.strokeStyle = '#cfd0dc'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, i % 2 ? 3 : 6.5, i % 2 ? 2.5 : 3.6, 0, 0, TAU); ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }
    for (const w of S.pulled) {                    // the wind dragging the whelps in
      ctx.save(); ctx.globalAlpha = 0.55 * a; ctx.strokeStyle = '#ffd0d6'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      const mx = (w.x + S.x) / 2, my = (w.y + S.y) / 2 - 30;
      for (const o of [-10, 10]) { ctx.beginPath(); ctx.moveTo(w.x, w.y + o); ctx.quadraticCurveTo(mx, my + o, S.x + R * 0.6, S.y + o * 0.5); ctx.stroke(); }
      ctx.restore();
    }
    // the whirlwind: a crimson tornado -- a funnel of spinning rings, wide at the top, narrowing to its tip, swaying --
    // with her two hooks whirling round its mouth and streaks of wind wrapped round it
    ctx.save(); ctx.translate(S.x, S.y); ctx.globalAlpha = a; ctx.lineCap = 'round';
    const H2 = R * 1.25, rings = 7;
    for (let i = 0; i < rings; i++) {
      const v = i / (rings - 1), y = -H2 + v * H2 * 2, rx = R * (1.15 - 0.85 * v), ry = rx * 0.28, sway = Math.sin(S.t * 0.15 + v * 2.5) * R * 0.18 * v;
      const ph = S.spin * (1.6 - v * 0.6) + i * 0.9;
      ctx.lineWidth = Math.max(3, R * 0.2 * (1 - v * 0.55));
      ctx.strokeStyle = i % 2 ? '#e8333f' : '#a81e2c';
      ctx.beginPath(); ctx.ellipse(sway, y, rx, ry, 0, ph, ph + 4.2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,200,206,0.9)'; ctx.lineWidth = Math.max(1.5, R * 0.05);
      ctx.beginPath(); ctx.ellipse(sway, y, rx, ry, 0, ph + 0.6, ph + 1.8); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,236,240,0.75)'; ctx.lineWidth = 2;   // (wind streaks round it)
    for (let i = 0; i < 3; i++) { const q = S.spin * 2 + i * 2.1, yy = -H2 * 0.6 + i * H2 * 0.5; ctx.beginPath(); ctx.ellipse(0, yy, R * 1.35 - i * 8, R * 0.32, 0, q, q + 1.4); ctx.stroke(); }
    for (let i = 0; i < 2; i++) {                  // her two hooks, big, whirling round its mouth
      const q = S.spin * 1.3 + i * Math.PI, hx = Math.cos(q) * R * 1.15, hy = -H2 + Math.sin(q) * R * 0.32;
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(q + Math.PI / 2); ctx.scale(1.25, 1.25);
      drawHook(ctx);
      ctx.restore();
    }
    ctx.restore();
  },
  broadside(ctx, d, S) {
    for (const b of S.balls) {
      if (b.done) continue;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      if (b.trail.length > 1) { ctx.strokeStyle = 'rgba(255,190,110,0.5)'; ctx.lineWidth = 6; ctx.beginPath(); b.trail.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      const bg = ctx.createRadialGradient(b.x, b.y, 4, b.x, b.y, 20); bg.addColorStop(0, 'rgba(255,190,90,0.7)'); bg.addColorStop(1, 'rgba(255,140,40,0)');   // (a glow: dark on the dark sky)
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(b.x, b.y, 20, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#26202a'; ctx.strokeStyle = '#ffcf7a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(b.x, b.y, 9, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(b.x - 3, b.y - 3, 2.5, 0, TAU); ctx.fill();
    }
  },
  flare(ctx, d, S) {
    const r = S.r * (1 + 0.08 * Math.sin(d.t * 0.8));
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(S.bx, S.by, 2, S.bx, S.by, r * 2);
    g.addColorStop(0, 'rgba(255,252,220,1)'); g.addColorStop(0.35, 'rgba(255,170,60,0.95)'); g.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(S.bx, S.by, r * 2, 0, TAU); ctx.fill();
    ctx.restore();
  },
  burst(ctx, d, S) {
    const x = S.wx, y = S.wy, t = d.t / 60;
    ctx.save();
    const g = ctx.createLinearGradient(x - 110, 0, x + 30, 0);   // (fire: orange-red to a yellow front, solid enough to read on the night sky)
    g.addColorStop(0, 'rgba(230,60,20,0)'); g.addColorStop(0.5, 'rgba(245,90,30,0.5)'); g.addColorStop(1, 'rgba(255,190,70,0.8)');
    // (a crescent of fire: its front wobbling, thinning to points top and bottom, a soft tail behind)
    const front = (i) => { const q = i / 8, yy = y - 72 + q * 144; return [x + 24 + Math.sin(yy * 0.07 + t * 14) * 8 - Math.pow(Math.abs(q - 0.5) * 2, 2) * 46, yy]; };
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(...front(0));
    for (let i = 1; i <= 8; i++) ctx.lineTo(...front(i));
    ctx.quadraticCurveTo(x - 40, y + 30, x - 110, y); ctx.quadraticCurveTo(x - 40, y - 30, ...front(0)); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';         // (the heat: a bright band along the front)
    const hg = ctx.createRadialGradient(x + 10, y, 4, x + 10, y, 70); hg.addColorStop(0, 'rgba(255,240,180,0.55)'); hg.addColorStop(1, 'rgba(255,170,60,0)');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(x + 10, y, 70, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,170,60,0.9)';                   // (flame tongues licking out of its front)
    for (let i = 1; i < 8; i++) {
      const [fx, fy] = front(i), L = 14 + 10 * Math.abs(Math.sin(t * 22 + i * 1.9)) - Math.abs(i - 4) * 2;
      ctx.beginPath(); ctx.moveTo(fx - 4, fy - 7); ctx.quadraticCurveTo(fx + L * 0.6, fy - 4, fx + L, fy + Math.sin(t * 30 + i) * 3); ctx.quadraticCurveTo(fx + L * 0.6, fy + 4, fx - 4, fy + 7); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,226,140,0.95)'; ctx.lineWidth = 3; ctx.beginPath();   // (its leading edge)
    for (let i = 0; i <= 8; i++) { const [fx, fy] = front(i); if (i) ctx.lineTo(fx, fy); else ctx.moveTo(fx, fy); }
    ctx.stroke();
    ctx.restore();
  },
};

// ------------------------------------------------------------------------------------------------ the HUD
/** a member's little meter bar, right-aligned to x1 at baseline y (full: flashing gold) */
export function drawMeter(ctx, m, x1, y, t) {
  const w = 64, h = 9, x0 = x1 - w, full = m.meter >= 100;
  ctx.fillStyle = 'rgba(20,12,24,0.8)'; ctx.fillRect(x0 - 2, y - h - 2, w + 4, h + 4);
  ctx.fillStyle = 'rgba(255,241,214,0.28)'; ctx.fillRect(x0, y - h, w, h);   // (the track: an empty bar still shows)
  ctx.fillStyle = full ? (Math.floor(t * 6) % 2 ? '#fff1a6' : '#ffb03a') : (PLAYER_COLS[m.slot] || '#ff8a2a');
  ctx.fillRect(x0, y - h, w * clamp(m.meter / 100, 0, 1), h);
  ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.strokeRect(x0 - 2, y - h - 2, w + 4, h + 4);
}
