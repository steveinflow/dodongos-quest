// DRAGON DODONGO's swing FX (all books; the FX/UI agent's): painter 3's move-pack clips -- bite / claw / tailWhip / rearUp
// (src/chars/dragon_hero.js, the 'dodongo_dragon:move' pack) -- get their own fire and motion, keyed to the drawing that is
// showing and its landmarks (mouth, mouthF, clawR, tail), never to a fixed point -- the bite's fire and the finisher's cone ride
// the drawing that is showing (an ANCHOR moved each frame: painter 3's critic pass 3), and go when a combo cancels the clip:
//   bite      a puff of fire out of the mouth as the jaws open, and a CHOMP on contact (two jaw arcs snapping shut, sparks)
//   claw      a smear arc -- three claw streaks -- along clawR's path through the swipe
//   tailWhip  a pale whoosh along the tail's path (no fire)
//   rearUp    the finisher's fire CONE (~100 px) out of the mouth on the lunge drawing, held through the blow, fading
//   (an old duel clip -- the move pack left out of the plan: hasNow false -- a small puff at that drawing's mouth, as before)
// Material-shaped particles as Book 2's src/sifx.js draws them: glowing embers that rise and fade bright, fire sparks (a glow,
// a hot line, a white core), soot wisps -- never flat shapes.  Flash safety: no screen wash; every bright shape ramps in over
// 2-4 frames and stays local (the cone ~100 x 70 px).  Reduced motion: no flicker or jitter, fewer bits, slower ramps.
// One FX actor per dragon (team 'fx', drawn just in front of him in the actor sort); it steps with the world (frozen in a
// hit-stop like everything else).
import { Actor } from './actors.js';
import { FLOOR_TOP } from './config.js';

const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const EMBER = ['#fff1b0', '#ffd27a', '#ffb03a', '#ff7a2a'];

class DragonFx extends Actor {
  constructor(game, owner) {
    super(game, owner.x, owner.y);
    this.owner = owner; this.team = 'fx'; this.solid = false; this.w = 0; this.h = 0; this.shadowR = 0;
    this.parts = []; this.arcs = []; this.cones = []; this.chomps = []; this.whooshes = []; this.ancs = [];
  }
  /** an anchor at a world point: parts and chomps on it ride its moves (src/chars/dragon_hero.js moves it to the landmark of the
   *  drawing that is showing, each frame); dead (a combo cancelled the clip): what rode it fades out over 3 frames where it is */
  anchor(x, y, z) { const a = { x, y, z, px: x, py: y, pz: z, dead: false }; this.ancs.push(a); return a; }
  get hittable() { return false; }
  takeHit() { return false; }
  drawShadow() {}
  update() {
    this.tick();
    const P = this.owner;
    this.x = P.x; this.y = P.y; this.sortY = P.y + 40;   // (sorted in front of him and of a foe at his depth: the puff and the chomp read over the foe)
    for (const p of this.parts) {
      p.t++; p.x += p.vx; p.z += p.vz; p.vz += p.g; p.vx *= p.dr; p.vz *= p.dr;
      if (p.k === 'ember') p.vx += Math.sin(p.t * 0.3 + p.ph) * 0.04;
      const a = p.anc; if (a) { if (a.dead) { p.life = Math.min(p.life, p.t + 3); p.anc = null; } else { p.x += a.x - a.px; p.y += a.y - a.py; p.z += a.z - a.pz; } }
    }
    for (const c of this.chomps) { const a = c.anc; if (a) { if (a.dead) { c.life = Math.min(c.life, c.t + 3); c.anc = null; } else { c.x += a.x - a.px; c.y += a.y - a.py; c.z += a.z - a.pz; } } }
    for (const a of this.ancs) { a.px = a.x; a.py = a.y; a.pz = a.z; }
    for (const c of this.cones) if (c.dir) { const d = c.dir(); if (d !== null && d !== undefined) { let e = d - (c.angS ?? d); while (e > Math.PI) e -= TAU; while (e < -Math.PI) e += TAU; c.angS = (c.angS ?? d) + e * 0.5; } }   // (its aim eases after the snout, drawing to drawing)
    this.parts = this.parts.filter((p) => p.t < p.life);
    for (const A of [this.arcs, this.cones, this.whooshes, this.chomps]) for (const a of A) a.t++;
    this.arcs = this.arcs.filter((a) => a.t < a.life); this.cones = this.cones.filter((c) => c.t < c.life); this.chomps = this.chomps.filter((c) => c.t < c.life); this.whooshes = this.whooshes.filter((w) => w.t < w.life);
    this.ancs = this.ancs.filter((a) => !a.dead && (this.parts.some((p) => p.anc === a) || this.chomps.some((c) => c.anc === a) || a.keep > 0 && a.keep--));
    if (!this.game.players.includes(P) && !this.parts.length && !this.arcs.length && !this.cones.length && !this.chomps.length && !this.whooshes.length) this.gone = true;
  }
  // ---------------------------------------------------------------- spawners (world coords: x, y depth, z height)
  embers(x, y, z, n, dir = 0, sp = 1, maxLife = 30) {
    for (let i = 0; i < (REDUCED ? Math.ceil(n * 0.5) : n); i++) {
      const a = rnd(-1.1, 1.1) + (dir < 0 ? Math.PI : 0), v = rnd(1, 3.4) * sp * (REDUCED ? 0.7 : 1);
      this.parts.push({ k: 'ember', x: x + rnd(-5, 5), y: y + rnd(-3, 3), z: z + rnd(-5, 5), vx: dir ? Math.cos(a) * v : rnd(-1, 1) * v, vz: Math.abs(Math.sin(a)) * v * 0.8 + rnd(0.6, 1.6), g: -0.05, dr: 0.94,
        t: 0, life: rnd(Math.min(16, maxLife - 4), maxLife), s: rnd(1.8, 3.6), c: EMBER[(Math.random() * EMBER.length) | 0], ph: rnd(0, TAU) });
    }
  }
  sparks(x, y, z, n, dir = 1, col = '#ffb43a') {
    for (let i = 0; i < (REDUCED ? Math.ceil(n * 0.4) : n); i++) {
      const a = rnd(-1.0, 1.0) + (dir < 0 ? Math.PI : 0), v = rnd(4, 7.5);
      this.parts.push({ k: 'spark', x, y, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v + 1.5, g: -0.25, dr: 0.9, t: 0, life: rnd(8, 13), s: 2.4, c: col });
    }
  }
  soot(x, y, z, n, dir = 0) {
    for (let i = 0; i < n; i++) this.parts.push({ k: 'soot', x: x + rnd(-6, 6), y, z: z + rnd(-4, 6), vx: dir * rnd(0.3, 1) + rnd(-0.4, 0.4), vz: rnd(0.3, 0.9), g: 0, dr: 0.94, t: 0, life: rnd(20, 30), s: rnd(6, 10), c: Math.random() < 0.5 ? '#4a3436' : '#5e4440' });
  }
  /** a soft little flame puff (a few hot blobs that swell and fade) at (x, y, z), blown along ang; anc: it rides that anchor */
  puff(x, y, z, ang, k = 1, anc = null) {
    const n0 = this.parts.length;
    for (let i = 0; i < Math.round((REDUCED ? 3 : 5) * k); i++) {
      const v = rnd(1.6, 3.4) * k, a = ang + rnd(-0.35, 0.35);
      this.parts.push({ k: 'blob', x, y: y + rnd(-2, 2), z, vx: Math.cos(a) * v, vz: -Math.sin(a) * v + 0.4, g: 0.02, dr: 0.9, t: 0, life: rnd(12, 18), s: rnd(5, 8) * k });
    }
    this.embers(x, y, z, Math.round(3 * k), Math.cos(ang) < 0 ? -1 : 1, 0.8, 16);   // (short-lived: specks hanging by the foe's feet read as confetti)
    if (anc) for (let i = n0; i < this.parts.length; i++) this.parts[i].anc = anc;
  }
  /** the tail whip's whoosh: a crescent swept round his body centre b from the tail at a to the tail at c (world points), trailing
   *  the tip -- wide at the tip, tapering back, a pale fill with a soft darker rim (it read as a thin stick through a foe) */
  whoosh(b, a, c, facing) {
    const ang = (p) => Math.atan2(p[2] - b[2], p[0] - b[0]), r = (p) => Math.hypot(p[0] - b[0], p[2] - b[2]);
    const a0 = ang(a); let a1 = ang(c);
    while (a1 - a0 > Math.PI) a1 -= TAU; while (a0 - a1 > Math.PI) a1 += TAU;   // (the short way round)
    this.whooshes.push({ b, a0, a1, r0: r(a), r1: r(c), t: 0, grow: 5, life: 13 });
  }
  // ---------------------------------------------------------------- drawing
  draw(ctx) {
    const g = this.game, cam = g.camX, t = g.time;
    const S = (x, y, z) => [x - cam, FLOOR_TOP + y - z];
    ctx.save();
    // (the claw / tail smears: under the fire)
    for (const a of this.arcs) drawArc(ctx, a, S);
    for (const w of this.whooshes) drawWhoosh(ctx, w, S);
    for (const c of this.cones) drawCone(ctx, c, S, t);
    for (const c of this.chomps) drawChomp(ctx, c, S);
    for (const p of this.parts) {
      const [sx, sy] = S(p.x, p.y, p.z), k = p.t / p.life;
      if (p.k === 'ember') {   // (a hot dot and its glow, fading out still bright)
        const f = 1 - k, fl = REDUCED ? 1 : 0.8 + 0.2 * Math.sin(p.t * 0.9 + p.ph);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.3 * f * fl; ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.arc(sx, sy, p.s * 2.4, 0, TAU); ctx.fill();
        ctx.globalAlpha = f * fl; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(sx, sy, p.s * (1 - k * 0.3), 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      } else if (p.k === 'spark') {   // (a fire spark: an orange glow round a hot line with a white core, short)
        ctx.globalAlpha = 1 - k * k; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - p.vx * 2.2, sy + p.vz * 2.2);
        ctx.strokeStyle = 'rgba(255,110,30,0.45)'; ctx.lineWidth = p.s + 3.2; ctx.stroke();
        ctx.strokeStyle = p.c; ctx.lineWidth = p.s; ctx.stroke();
        ctx.strokeStyle = '#fff6d0'; ctx.lineWidth = Math.max(1, p.s * 0.4); ctx.stroke();
      } else if (p.k === 'soot') {
        ctx.globalAlpha = 0.32 * (k < 0.3 ? k / 0.3 : (1 - k) / 0.7); ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(sx, sy, p.s * (0.7 + k * 0.8), 0, TAU); ctx.fill();
      } else if (p.k === 'blob') {   // (a soft fire blob: white-hot core, orange rim, swelling and fading)
        const r = p.s * (0.7 + k * 0.9), a = (k < 0.15 ? k / 0.15 : (1 - k) / 0.85) * 0.85;
        const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        gr.addColorStop(0, `rgba(255,248,210,${a})`); gr.addColorStop(0.45, `rgba(255,186,70,${a * 0.85})`); gr.addColorStop(1, 'rgba(255,90,20,0)');
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.restore();
  }
}

/** a swipe smear: three claw streaks (or one whoosh) along a Catmull-Rom path through the landmark points, revealed over
 *  `grow` frames, then thinning and fading over the rest of its life */
function drawArc(ctx, a, S) {
  const pts = a.pts.map((q) => S(q[0], q[1], q[2]));
  if (pts.length < 2) return;
  const path = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < 8; j++) {
      const u = j / 8, u2 = u * u, u3 = u2 * u;
      path.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3)]);
    }
  }
  path.push(pts[pts.length - 1]);
  const reveal = clamp01((a.t + 1) / a.grow), fade = a.t < a.grow ? 1 : 1 - (a.t - a.grow) / (a.life - a.grow);
  const n = Math.max(2, Math.round(path.length * reveal)), tail = Math.max(0, Math.round(n - path.length * 0.75));   // (the streak's tail catches up as it fades)
  const seg = path.slice(a.t < a.grow ? 0 : Math.min(n - 2, tail + Math.round((a.t - a.grow) * 2)), n);
  if (seg.length < 2) return;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (a.gy !== undefined) { const gy = S(0, a.gy, 0)[1]; ctx.beginPath(); ctx.rect(-1e4, -1e4, 3e4, 1e4 + gy - 2); ctx.clip(); }   // (never below the ground he flies over)
  const lanes = a.claw ? [-7, 0, 7] : [0];
  for (const off of lanes) {
    const L = seg.map((q, i) => {   // (each streak offset along the path's normal)
      const r = seg[Math.min(seg.length - 1, i + 1)], l = seg[Math.max(0, i - 1)], dx = r[0] - l[0], dy = r[1] - l[1], m = Math.hypot(dx, dy) || 1;
      return [q[0] - (dy / m) * off, q[1] + (dx / m) * off];
    });
    for (const [w, col, al] of a.claw ? [[7, a.col, 0.45], [3.2, '#fff4d8', 0.95]] : [[9, 'rgba(255,255,255,1)', 0.18], [3, 'rgba(255,255,255,1)', 0.4]]) {
      ctx.globalAlpha = al * fade; ctx.strokeStyle = col; ctx.lineWidth = w * (a.claw ? (off ? 0.8 : 1) : 1) * (0.6 + 0.4 * fade);
      ctx.beginPath(); L.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke();
    }
  }
  ctx.restore();
}

/** the tail whip's whoosh: a crescent from the swing's start angle to the tip's current one, thickest at the tip (world angle:
 *  x right, z up -- screen y is minus z) */
function drawWhoosh(ctx, w, S) {
  const [cx, cy] = S(w.b[0], w.b[1], w.b[2]);
  const reveal = clamp01((w.t + 1) / w.grow), fade = w.t < w.grow ? 1 : 1 - (w.t - w.grow) / (w.life - w.grow);
  const aEnd = w.a0 + (w.a1 - w.a0) * reveal, aStart = w.a0 + (w.a1 - w.a0) * (w.t >= w.grow ? 0.6 * (1 - fade) : 0);
  const N = 16, out = [], inn = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, a = aStart + (aEnd - aStart) * u, q = (a - w.a0) / ((w.a1 - w.a0) || 1), rr = (w.r0 + (w.r1 - w.r0) * q) * 1.05, th = 3 + 15 * u * u;   // (thin at the start, wide at the tip)
    out.push([cx + Math.cos(a) * (rr + th * 0.5), cy - Math.sin(a) * (rr + th * 0.5)]); inn.push([cx + Math.cos(a) * (rr - th * 0.5), cy - Math.sin(a) * (rr - th * 0.5)]);
  }
  const p = new Path2D(); out.forEach((q, i) => (i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1]))); for (let i = inn.length - 1; i >= 0; i--) p.lineTo(inn[i][0], inn[i][1]); p.closePath();
  ctx.save();
  // (warm, with a dark warm rim: a pale one was lost on the snow -- painter 3's critic pass 3)
  ctx.globalAlpha = 0.7 * fade; ctx.lineWidth = 2.6; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(96,36,16,0.8)'; ctx.stroke(p);
  ctx.globalAlpha = 0.68 * fade; ctx.fillStyle = '#ffd99a'; ctx.fill(p);
  ctx.restore();
}

/** the rearUp finisher's fire cone: from the mouth along ang, `len` long, half-angle ~0.36 rad -- ramped in, flickering
 *  tongues at its edge (none in reduced motion), a white-hot core, then fading */
function drawCone(ctx, c, S, time) {
  const o = c.at(), [sx, sy] = S(o[0], o[1], o[2]);
  const inK = clamp01((c.t + 1) / (REDUCED ? 4 : 2)), outK = c.t < c.hold ? 1 : 1 - (c.t - c.hold) / (c.life - c.hold);
  const a = inK * outK, L = c.len * (0.55 + 0.45 * inK), ang = c.angS ?? c.ang, half = 0.36;
  if (a <= 0.01) return;
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang);
  const ft = REDUCED ? 0 : time * 30;
  // (the body: a fan of tongues, their tips jagged by a flicker)
  ctx.beginPath(); ctx.moveTo(0, -7);   // (a root as tall as his snout: a needle-thin one read as the flame starting in mid-air)
  const N = 9;
  for (let i = 0; i <= N; i++) {
    const u = i / N, an = -half + 2 * half * u, r = L * (0.82 + 0.18 * Math.sin(ft + i * 1.7)) * (0.9 + 0.1 * Math.cos(u * Math.PI * 2));
    ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r);
  }
  ctx.lineTo(0, 7); ctx.closePath();
  // (painted, not additive: an additive cone washed out to a pale streak on a bright stage -- the desert, the snow)
  const gr = ctx.createRadialGradient(0, 0, 2, 0, 0, L);
  // (its root a warm yellow, not near-white: a pale root vanished on the snow and the cone read as starting in mid-air)
  gr.addColorStop(0, `rgba(255,222,120,${0.95 * a})`); gr.addColorStop(0.28, `rgba(255,186,64,${0.92 * a})`); gr.addColorStop(0.62, `rgba(255,112,30,${0.82 * a})`); gr.addColorStop(0.88, `rgba(214,52,24,${0.5 * a})`); gr.addColorStop(1, 'rgba(180,30,20,0)');
  ctx.fillStyle = gr; ctx.fill();
  // (a hot core streak along its axis: additive, small)
  ctx.globalCompositeOperation = 'lighter';
  const cg = ctx.createLinearGradient(0, 0, L * 0.7, 0);
  cg.addColorStop(0, `rgba(255,255,240,${0.8 * a})`); cg.addColorStop(1, 'rgba(255,220,140,0)');
  ctx.fillStyle = cg; ctx.beginPath(); ctx.moveTo(0, -5); ctx.quadraticCurveTo(L * 0.4, -9, L * 0.7, 0); ctx.quadraticCurveTo(L * 0.4, 9, 0, 5); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/** the CHOMP: two jaw arcs (an upper and a lower row of teeth) snapping shut on the contact point over 4 frames, a white
 *  flash ring at the close, fading -- in the dragon's warm accent, inked */
function drawChomp(ctx, c, S) {
  const [sx, sy] = S(c.x, c.y, c.z), k = c.t;
  const shut = clamp01(k / 3), gap = 9 + 10 * (1 - shut * shut), a = k < 3 ? 1 : 1 - (k - 3) / (c.life - 3);   // (the jaws close to 9 px apart, not shut: they frame the hit star at the bite, which draws over them)
  const R = 21 * c.size, f = c.facing;
  ctx.save(); ctx.translate(sx, sy); ctx.scale(f, 1); ctx.globalAlpha = Math.max(0, a); ctx.lineJoin = 'round';
  for (const s of [-1, 1]) {   // (the upper jaw comes down, the lower one up)
    ctx.save(); ctx.translate(0, s * (gap + 3));
    // (s -1: the upper jaw, its back bulging up; +1: the lower one; the teeth along the inner edge point at the bite)
    const jaw = new Path2D(), T = 5, step = (2 * R) / T;
    jaw.moveTo(-R, 0); jaw.quadraticCurveTo(0, s * R * 0.9, R, 0);
    for (let i = 0; i < T; i++) { const x = R - i * step; jaw.lineTo(x - step / 2, -s * 5); jaw.lineTo(x - step, 0); }
    jaw.closePath();
    ctx.fillStyle = '#fff6e2'; ctx.fill(jaw); ctx.lineWidth = 2; ctx.strokeStyle = '#21141c'; ctx.stroke(jaw);
    ctx.restore();
  }
  if (k >= 2 && k < 9) {   // (the snap: a quick ring at the close)
    const u = (k - 2) / 7;
    ctx.globalAlpha = (1 - u) * 0.85; ctx.strokeStyle = c.col; ctx.lineWidth = 4 * (1 - u) + 1;
    ctx.beginPath(); ctx.ellipse(0, 0, R * (0.8 + u * 0.9), R * (0.45 + u * 0.5), 0, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- the dragon art's hooks (src/chars/dragon_hero.js)
/** the FX actor for this player (made on first use, again after a level change) */
export function fxOf(P) {
  let F = P._dfx;
  if (!F || F.gone || F.game !== P.game || !P.game.actors.includes(F)) { F = new DragonFx(P.game, P); P.game.actors.push(F); P._dfx = F; }
  return F;
}
/** world point of a landmark of the pose showing, or null: lm = art.point3d(pose, which, 1) -- [x, y] feet-relative, facing right */
export function worldOf(P, lm) {
  if (!lm) return null;
  const k = P.bigV || 1;
  return [P.x + P.facing * lm[0] * k, P.y, P.z - lm[1] * k];
}
export const DRAGON_FX_REDUCED = REDUCED;
export { DragonFx };
