// TEMPEST, 3D-rendered sprites (loaded instead of ./tempest.js with ?art3d=1 once 'tempest' is in ART3D_NAMES; see
// src/chars.js, docs/SPRITE3D.md).  Model: assets-src/tempest/ (tools/sprite3d/models/tempest_build.py on the shared
// dragon rig); clips: tools/sprite3d/chars/tempest.py -> assets/sprites/tempest/.  Rendered facing right, mirrored.
// Every pose carries the code rig's pose too (a key without an atlas clip draws the rig).  The rig's effects stay 2D
// and are drawn over the sprite from those fields and the 3D landmarks: the horn crackle (glow) with its soft halo and
// the bolt tip flashing, the cursed gem's pulsing glow, the gust gathering at her wings (gustWind), the gust streams,
// the speed streaks, the collar shards (shatter).  o.talk (cutscenes): freed / glide / glideCursed flap to their jaw-open twins.
// Engine points from the 3D drawings: SADDLE + SEATS (glide: the heroes' hips), MOUTH (roar), HORNS (boltWind end).
import * as RIG from './tempest.js';
import { spriteArt, rigOnly, rigDrawn } from '../sprite3d.js';

export * from './tempest.js';          // BODY_Y, BASE, HURTBOX, HURTBOX_GROUND, HEADBOX, boxesOf, headOf, saddleOf, drawCollar

const A = await spriteArt('tempest', { fallback: RIG });
const one = (f, a) => (typeof f === 'function' ? f(a) : f);
const isSpr = (key) => { const f = A.ANIM[key]; return f !== undefined && ((one(f, 0) || {}).s3d >= 0.5); };

export const ANIM = {};
for (const key of new Set([...Object.keys(RIG.ANIM), ...Object.keys(A.ANIM)])) {
  const rig = RIG.ANIM[key];
  if (!isSpr(key)) { if (rig !== undefined) ANIM[key] = rigOnly(key, rig, !!A.ATLAS_SCALE); continue; }
  const spr = A.ANIM[key];
  ANIM[key] = typeof spr === 'function' || typeof rig === 'function'
    ? (a) => Object.assign({}, rig !== undefined ? one(rig, a) : {}, one(spr, a))
    : Object.assign({}, rig || {}, spr);
}
// gustWind's progress rides on the pose (the drawing index alone can't grow the gathering-gust cue)
if (typeof ANIM.gustWind === 'function') { const gw = ANIM.gustWind; ANIM.gustWind = (k) => Object.assign({}, gw(k), { gather: k || 0 }); }
const FREED = new Set(['freed', 'freedTalk', 'glide', 'glideTalk']);       // (the clips with no collar)
// the painted collar's jewel faces the camera (tempest_painted.py collar_jewel): its centre off the 'collar' landmark
const GEM_OFF = [-7, 3.5];
// the drawings where her bolt is hidden behind the wing (the 'bolt' landmark still has a place there): no flash
// (painted readtech N-4; model r6: #5 shows the bolt again, #4's landmark sits on the wing's lower edge)
const BOLT_HIDDEN = { boltWind: new Set([4]) };
// the cursed gem's glow, sized for model r6's gem (x 1.3): fill radius, ring radius + its pulse, the twinkle's offset
const GEM_GLOW = { fill: 21, ring: 16.25, ringPulse: 2.5, tw: [5, -6.25] };

const jit = (n, t) => { const x = Math.sin(n * 127.1 + Math.floor(t * 20) * 311.7) * 43758.5453; return x - Math.floor(x) - 0.5; };
function boltLine(ctx, x0, y0, x1, y1, n, amp, seed, t) {
  ctx.moveTo(x0, y0);
  for (let i = 1; i < n; i++) { const u = i / n; ctx.lineTo(x0 + (x1 - x0) * u + jit(seed + i, t) * amp, y0 + (y1 - y0) * u + jit(seed + i + 50, t) * amp); }
  ctx.lineTo(x1, y1);
}

/** Draw with the floor point under her at (0, 0) (the engine lifts her by z).  o: as ./tempest.js. */
export function draw(ctx, pose, o = {}) {
  if (!pose || !(pose.s3d >= 0.5)) { rigDrawn('tempest', pose); RIG.draw(ctx, pose, o); return; }
  const f = o.facing || 1, S = o.scale || 1, t = o.t || 0;
  let p = pose;
  const twin = { freed: 'freedTalk', glide: 'glideTalk', glideCursed: 'glideCursedTalk' }[pose.clip];
  if (o.talk && twin && isSpr(twin) && Math.floor(t * 8) % 2 === 0) p = { s3d: 1, clip: twin, ['f_' + twin]: pose['f_' + pose.clip] };
  const at = (lm) => { const q = A.point3d(pose, lm); return q ? [q[0] * f * S, q[1] * S] : null; };
  if (pose.streak > 0.01) {                                   // speed lines behind the low pass
    const b = at('body');
    if (b) {
      ctx.save(); ctx.strokeStyle = '#f4fbff'; ctx.lineCap = 'round'; ctx.globalAlpha = 0.7 * pose.streak;
      for (const [y, x0, L, w] of [[-40, -70, 70, 3], [-10, -90, 90, 4], [16, -76, 60, 3]]) {
        const off = ((t * 420 + y * 13) % 60 + 60) % 60;
        ctx.lineWidth = w * S; ctx.beginPath(); ctx.moveTo(b[0] + f * (x0 - off) * S, b[1] + y * S); ctx.lineTo(b[0] + f * (x0 - off - L) * S, b[1] + y * S); ctx.stroke();
      }
      ctx.restore();
    }
  }
  const g = Math.max(0, Math.min(1, pose.glow || 0));
  const atR = (lm) => A.point3d(pose, lm);                    // (unmirrored, scale 1)
  const mir = (q) => [q[0] * f * S, q[1] * S];
  if (g > 0.02) {                                             // the storm glow gathering behind the horns (tempest.js)
    const h = atR('horns'), hd = atR('head');
    if (h && hd) {
      const k = Math.hypot(hd[0] - h[0], hd[1] - h[1]) / 84;   // (head-frame units -> px: the rig's horns-to-head span)
      ctx.save(); ctx.fillStyle = '#fff1a0';
      for (const [u, r0, r1, a] of [[0.27, 26, 16, 0.16], [0.22, 15, 10, 0.2]]) {
        const c = mir([h[0] + (hd[0] - h[0]) * u, h[1] + (hd[1] - h[1]) * u]);
        ctx.globalAlpha = a * g * 1.6; ctx.beginPath(); ctx.arc(c[0], c[1], (r0 + r1 * g) * k * S, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }
  A.draw(ctx, p, o);
  if (g > 0.02) {                                             // lightning crackling round the horns
    const h = at('horns');
    if (h) {
      const arcs = (c) => {
        boltLine(c, h[0], h[1], h[0] + f * 12 * S, h[1] - 6 * S, 4, 5 * S, 1, t);
        if (g > 0.3) boltLine(c, h[0], h[1], h[0] - f * (6 + 10 * g) * S, h[1] - (20 + 26 * g) * S, 5, 8 * S, 20, t);
        if (g > 0.55) boltLine(c, h[0] + f * 10 * S, h[1], h[0] + f * 18 * S, h[1] - (22 + 26 * g) * S, 5, 8 * S, 30, t);
        if (g > 0.8) boltLine(c, h[0] + f * 20 * S, h[1] + 16 * S, h[0] + f * 10 * S, h[1] - (12 + 22 * g) * S, 4, 7 * S, 40, t);
      };
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); arcs(ctx); ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = (5 + 2 * g) * S; ctx.stroke();
      ctx.beginPath(); arcs(ctx); ctx.strokeStyle = '#fffbe0'; ctx.lineWidth = 2 * S; ctx.stroke();
      ctx.restore();
    }
  }
  const boltHidden = BOLT_HIDDEN[pose.clip]?.has(pose['f_' + pose.clip]);
  if (g > 0.3 && !boltHidden && Math.sin(t * 40) > -0.3) {     // the bolt tip flashing white-hot while she's charged
    const bo = atR('bolt');                                   // (the atlas' 'bolt' landmark: no landmark, no flash)
    if (bo) {
      const c = mir(bo);
      ctx.save();
      const gr = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], 34 * S);
      gr.addColorStop(0, 'rgba(255,251,224,0.85)'); gr.addColorStop(0.45, 'rgba(255,225,77,0.45)'); gr.addColorStop(1, 'rgba(255,225,77,0)');
      ctx.globalAlpha = Math.min(1, g * 1.2); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(c[0], c[1], 34 * S, 0, Math.PI * 2); ctx.fill();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
      boltLine(ctx, c[0], c[1], c[0] + (8 + 14 * jit(7, t)) * S, c[1] - (16 + 8 * g) * S, 3, 5 * S, 60, t);
      boltLine(ctx, c[0], c[1], c[0] - (10 + 12 * jit(8, t)) * S, c[1] + (12 + 6 * g) * S, 3, 5 * S, 70, t);
      ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 3.5 * S; ctx.stroke();
      ctx.strokeStyle = '#fffbe0'; ctx.lineWidth = 1.4 * S; ctx.stroke();
      ctx.restore();
    }
  }
  const crack = Math.max(0, Math.min(1, pose.crack || 0));
  if (o.cursed !== false && !FREED.has(pose.clip) && !(pose.shatter > 0) && crack < 0.67) {   // the cursed gem's glow
    // (the atlas' 'gem' landmark where it has one -- painted readtech N-3: the old collar offset sat ~6 px off the
    //  re-modelled gem -- else the collar's plus the measured offset)
    const cl = atR('collar'), gm = atR('gem');
    if (gm || cl) {
      const c = mir(gm || [cl[0] + GEM_OFF[0], cl[1] + GEM_OFF[1]]);
      const pulse = 0.7 + 0.3 * Math.sin(t * 4.4), live = 1 - 0.75 * crack;
      ctx.save();
      ctx.globalAlpha = 0.3 * pulse; ctx.fillStyle = '#5cff7e'; ctx.beginPath(); ctx.arc(c[0], c[1], GEM_GLOW.fill * S, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.55 * pulse; ctx.strokeStyle = '#5cff7e'; ctx.lineWidth = 2.4 * S;
      ctx.beginPath(); ctx.arc(c[0], c[1], (GEM_GLOW.ring + GEM_GLOW.ringPulse * pulse) * S, 0, Math.PI * 2); ctx.stroke();
      if (live > 0.4) {                                       // the twinkle (tempest.js twinkle())
        const r = (2.6 + 2.2 * pulse) * S, x = c[0] + GEM_GLOW.tw[0] * f * S, y = c[1] + GEM_GLOW.tw[1] * S;
        ctx.globalAlpha = 1; ctx.fillStyle = '#eaffdf'; ctx.beginPath();
        ctx.moveTo(x, y - r * 1.6); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r * 1.6);
        ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r * 1.6); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  }
  if (pose.clip === 'gustWind' && pose.gather > 0.05) {       // the gust gathering: wind swirling in round her wings
    const w = atR('wingR'), bd = atR('body');
    if (w && bd) {
      const k = Math.min(1, pose.gather), c = mir([bd[0] + (w[0] - bd[0]) * 0.55, bd[1] + (w[1] - bd[1]) * 0.55]);
      const R = (78 - 34 * k) * S;                            // (closing in as it gathers)
      ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = '#f4faff';
      for (let i = 0; i < 4; i++) {
        const a0 = t * 5.5 * f + i * Math.PI / 2, r = R * (1 - 0.12 * i);
        ctx.globalAlpha = (0.35 + 0.5 * k) * (1 - 0.15 * i); ctx.lineWidth = (4.2 - 0.6 * i) * S;
        ctx.beginPath();
        for (let j = 0; j <= 10; j++) {                       // a spiral arc: the radius shrinking along it
          const a = a0 + f * j * 0.16, rr = r * (1 - 0.035 * j);
          const x = c[0] + Math.cos(a) * rr, y = c[1] + Math.sin(a) * rr * 0.62;
          if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 0.5 * k; ctx.fillStyle = '#f4faff';   // specks sucked in
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05 + t * 3 * f, rr = R * (1.25 - ((t * 1.4 + i * 0.17) % 1) * 0.9);
        ctx.beginPath(); ctx.arc(c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr * 0.62, 2.2 * S, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }
  if (pose.gust > 0.02) {                                     // the wing clap's wind blasting forward
    const w = at('wingR'), m = at('mouth');
    if (w && m) {
      const gg = Math.min(1, pose.gust), x0 = Math.max(w[0] * f, m[0] * f) * f, y0 = (w[1] + m[1]) / 2;
      ctx.save(); ctx.globalAlpha = 0.8 * gg; ctx.strokeStyle = '#f4faff'; ctx.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const y = y0 + (i - 2) * 22 * S, xs = x0 + f * (8 + (i % 2) * 14 + (1 - gg) * 40) * S, L = (70 + 30 * gg) * S;
        ctx.lineWidth = (4 - (i % 2) * 1.4) * S;
        ctx.beginPath(); ctx.moveTo(xs, y); ctx.quadraticCurveTo(xs + f * L * 0.5, y - 8 * S, xs + f * L, y + 6 * S); ctx.stroke();
      }
      ctx.restore();
    }
  }
  if (pose.shatter > 0 && pose.shatter < 1) {                 // the collar bursting into shards
    const c = at('collar');
    if (c) {
      const u = pose.shatter;
      ctx.save(); ctx.fillStyle = '#3b3d47'; ctx.strokeStyle = '#21141c'; ctx.lineWidth = 2 * S; ctx.globalAlpha = 1 - u * 0.8;
      for (let i = 0; i < 8; i++) {
        const a = i * 0.785 + 0.3, r = (20 + 120 * u) * S, x = c[0] + Math.cos(a) * r, y = c[1] + Math.sin(a) * r * 0.7 + 60 * u * u * S;
        ctx.beginPath(); ctx.moveTo(x - 6 * S, y); ctx.lineTo(x, y - 8 * S); ctx.lineTo(x + 7 * S, y + 2 * S); ctx.lineTo(x - 1 * S, y + 7 * S); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = '#4cf571'; ctx.beginPath(); ctx.arc(c[0], c[1] - 30 * u * S, 8 * S * (1 - u), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
}
export { draw as drawTempest };

const pt = (key, k, lm) => { const g = A.ANIM[key]; return typeof g === 'function' ? A.point3d(g(k), lm) : null; };
const r2 = (p) => (p ? p.map((c) => Math.round(c)) : null);
const seats = [0, 1, 2].map((i) => r2(pt('glide', 0, 'seat' + i)));
export const SEATS = seats.every(Boolean) ? seats : RIG.SEATS;
export const SADDLE = SEATS[0] || RIG.SADDLE;
export const MOUTH = r2(pt('roar', 0, 'mouth')) || RIG.MOUTH;
export const HORNS = r2(pt('boltWind', 1, 'horns')) || RIG.HORNS;
export const META = A.META;
export const ATLAS_SCALE = A.ATLAS_SCALE;
