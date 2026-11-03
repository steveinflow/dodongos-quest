// MAGMAW, 3D-rendered sprites (loaded instead of ./magmaw.js with ?art3d=1 once 'magmaw' is in ART3D_NAMES; see
// src/chars.js, docs/SPRITE3D.md).  Model: assets-src/magmaw/ (tools/sprite3d/models/magmaw_build.py); clips:
// tools/sprite3d/chars/magmaw.py -> assets/sprites/magmaw/.  Rendered facing right, mirrored.  The pool centre is the
// sprite's origin; whatever is below the lava surface is clipped away here (magmaw.js's hiddenPath), as the code rig
// does, so the 3D body just carries on down into the pool.  Every pose carries the code rig's pose too (a key without
// an atlas clip draws the rig; 'submerged' is the painted coil's fins + the 2D bubbles, below).  The effects stay 2D: magmaw.js's own (drawFx: the surface rings at
// this drawing's lava crossings (cr0 / cr1 landmarks), fins, dome, splash, drips, slam dust, the bite smear, collar
// shards, nostril smoke, stars) plus, from the 3D landmarks, the belly glow climbing to the throat, the fire licking
// from the jaws, the curse's glow round the eye, the wind-up twinkle, the dazed spiral and the collar's cracks.
// o.talk (cutscenes): freed flaps to its jaw-open twin.  Engine points from the 3D drawings: MOUTH = BREATH_MOUTH
// (breath at BREATH_K, [x, y, angle]), BITE + BITE_REACH (bite at BITE_K).
import * as RIG from './magmaw.js';
import { spriteArt, rigOnly, rigDrawn } from '../sprite3d.js';
import { INK } from '../config.js';

export * from './magmaw.js';          // POOL, BASE, FRAMES, drawPool, drawCollar, mouthOf, biteOf, headOf, spineOf, SLAM_BOX ...

const A = await spriteArt('magmaw', { fallback: RIG });
// CRYSTAL MAGMAW (the Crystal Deep's mini-boss, docs/SECRETS.md): magmaw_crystal, the same model and rig in a crystal
// palette with a LIGHT clip set (emerge, idle, biteWind, bite, dive, submerged, stagger, defeated); drawn for o.variant
// 'crystal' with its own poses (ANIM_CRYSTAL: the clips it has, the rig's -- in magmaw.js's crystal palette -- for the
// rest) where its atlas is in; else the lava Magmaw's (washed: src/enemies2.js).  The 2D pool, splashes, rings and
// glows switch to the crystal / water palette (teal #5ff0e0, violet #9a6ce0) for it either way.
const AC = await spriteArt('magmaw_crystal', { fallback: RIG });
export const CRYSTAL_ART = !!AC.ATLAS_SCALE;
const one = (f, a) => (typeof f === 'function' ? f(a) : f);
const isSprOf = (AT, key) => { const f = AT.ANIM[key]; return f !== undefined && ((one(f, 0) || {}).s3d >= 0.5); };
const isSpr = (key) => isSprOf(A, key);
function buildAnim(AT) {
  const out = {};
  for (const key of new Set([...Object.keys(RIG.ANIM), ...Object.keys(AT.ANIM)])) {
    const rig = RIG.ANIM[key];
    if (!isSprOf(AT, key)) { if (rig !== undefined) out[key] = rigOnly(key, rig, !!AT.ATLAS_SCALE); continue; }
    const spr = AT.ANIM[key];
    out[key] = typeof spr === 'function' || typeof rig === 'function'
      ? (a) => Object.assign({}, rig !== undefined ? one(rig, a) : {}, one(spr, a))
      : Object.assign({}, rig || {}, spr);
  }
  return out;
}
export const ANIM = buildAnim(A);
export const ANIM_CRYSTAL = CRYSTAL_ART ? buildAnim(AC) : ANIM;
let X = A;   // the atlas this draw call uses (draw(): the crystal one for o.variant 'crystal', where it's in)

// the lava's interior below its surface (magmaw.js hiddenPath): the near half of the pool + a column under it and,
// behind him (x < 0, facing right), everything under the surface out past the rim -- nothing of his lies on the floor
// back there, but the dive's back spikes and a coil sliver showed beside the pool (painted round 3: dive d7 ~175 px).
// The dive (mode 'dive') also hides the front out past the rim: his head plunges in at the pool's front edge (the
// other clips keep the hand gripping the rim there).  The emerge (mode 'emerge') hides the front column out to the same
// x below y +30, under the rim's grip (painted r4: a 10-16 px claw tuft stood on the floor in front, emerge #2).
function hidden(c, mode = '') {
  const rx = RIG.POOL.rx, ry = RIG.POOL.ry + 1, a1 = Math.acos(0.8), B = rx + 90;
  // (rx + 26: a horn tip stood on the floor at the end of every dive, d9-d10 -- painted r4)
  if (mode === 'dive') { c.moveTo(rx + 26, -1); c.lineTo(rx + 26, 3000); c.lineTo(-B, 3000); c.lineTo(-B, -1); c.closePath(); return; }
  if (mode === 'emerge') { c.moveTo(rx * 0.8, 30); c.lineTo(rx + 26, 30); c.lineTo(rx + 26, 3000); c.lineTo(rx * 0.8, 3000); c.closePath(); }
  c.moveTo(rx, -1);
  c.ellipse(0, -1, rx, ry, 0, 0, a1);
  c.lineTo(rx * 0.8, 3000); c.lineTo(-B, 3000); c.lineTo(-B, -1);
  c.closePath();
}
// the face the drawing on screen was rendered with: the rig's at that drawing's own time (a 'drawings' clip holds each
// drawing for a few frames, so the rig's face can move on while the old lids are still shown -- stagger st 13 drew the
// dazed spiral over a shut lid)
function drawnFace(pose) {
  const ci = X.clipInfo(pose.clip), rig = RIG.ANIM[pose.clip];
  if (!ci || ci.arg !== 'k' || !ci.g || !ci.dur || typeof rig !== 'function') return pose.face;
  const g = ci.g[Math.max(0, Math.min(ci.g.length - 1, pose['f_' + pose.clip] | 0))];
  return (rig(Math.min(1, g / ci.dur)) || {}).face || pose.face;
}
// the 'ouch' squint (stagger's first hit, defeated k .16 .. .46): magmaw.js eye()'s '<' over the shut lid, at the 3D
// eye, turned with the head (along eye -> 'nose', head frame (64, -27) -> (122, -24): 0.7 x that angle, within +-20 deg,
// so a thrown-back head's mark still reads '<', not a tick), 1 px toward the snout and 0.9 x the size that distance
// gives, so both arms sit inside the lid (critic, model r2: the lidline crease alone didn't read as pain)
const EYE_NOSE = Math.hypot(122 - 64, -24 + 27), EYE_NOSE_A = Math.atan2(-24 + 27, 122 - 64), OUCH_MAX = 20 * Math.PI / 180;
function ouchMark(ctx, pose, f, S) {
  const qe = X.point3d(pose, 'eye'), qn = X.point3d(pose, 'nose');
  if (!qe || !qn) return;
  const k = 0.9 * Math.hypot(qn[0] - qe[0], qn[1] - qe[1]) / EYE_NOSE;
  if (!(k > 0.4)) return;
  const rot = Math.max(-OUCH_MAX, Math.min(OUCH_MAX, 0.7 * (Math.atan2(qn[1] - qe[1], qn[0] - qe[0]) - EYE_NOSE_A)));
  ctx.save();
  ctx.scale(f * S, S); ctx.translate(qe[0], qe[1]);
  ctx.rotate(rot); ctx.translate(1, 0); ctx.scale(k, k);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 3.4 / k;
  ctx.beginPath(); ctx.moveTo(-8, -5); ctx.lineTo(5, 0); ctx.lineTo(-8, 5); ctx.stroke();
  ctx.restore();
}
function twinkle(ctx, x, y, r) {
  ctx.fillStyle = '#eaffdf'; ctx.beginPath();
  ctx.moveTo(x, y - r * 1.6); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r * 1.6);
  ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r * 1.6); ctx.closePath(); ctx.fill();
}

// SUBMERGED (between pools): the painted coil's spikes are the fins cutting the surface (chars/magmaw.py: magmaw.js
// fins() -- gliding sin(0.9 t) x 18 px); the rest stays magmaw.js's 2D: the dark shape under the surface, the rings
// where the fins cut it and the bubbles.  Nothing below the surface shows (the coil's lower spikes stand out sideways
// under the lava).  The overlay follows the drawing's own glide (its time on the loop, sampled where the render sampled
// it); the rings sit where each fin's landmarks (fin0..2 base, finT0..2 tip) cross the surface in that drawing -- a fin
// whose tip is under the lava gets none -- else (an atlas without them) at magmaw.js's three fins, 17 px apart.
const SUB_LAVA = { dark: '#5a1a10', mol: '#ff9b2e', molH: '#ffe066', molC: '#fff6c4', ink: '#21141c', glow: '#ffe066', glowC: '#fff6c4' };
const SUB_CRYSTAL = { dark: '#1a2a5a', mol: '#5ff0e0', molH: '#a8fff4', molC: '#e8fffc', ink: '#21141c', glow: '#a8fff4', glowC: '#e8fffc' };
let SUB = SUB_LAVA;
function subRings(ctx, xs, near) {
  ctx.lineWidth = 2; ctx.strokeStyle = SUB.molC;
  for (const x of xs) {
    ctx.beginPath(); ctx.ellipse(x, -1, 9, 3, 0, near ? 0 : Math.PI, near ? Math.PI : Math.PI * 2); ctx.stroke();
  }
}
function drawSubmerged(ctx, pose, o) {
  const f = o.facing || 1, S = o.scale || 1, t = o.t || 0;
  const ci = X.clipInfo('submerged');
  const Td = ci && ci.cycle ? ((pose.f_submerged | 0) / ci.n) * ci.cycle / 60 : t;   // this drawing's glide
  const sx = Math.sin(Td * 0.9) * 18, dir = Math.cos(Td * 0.9) >= 0 ? 1 : -1;
  let xs = [-1, 0, 1].map((i) => sx + i * 17 * dir);
  if (X.point3d(pose, 'fin0')) {
    xs = [];
    for (let j = 0; j < 3; j++) {
      const b = X.point3d(pose, 'fin' + j), e = X.point3d(pose, 'finT' + j);
      if (b && e && b[1] > -1 && e[1] < -1) xs.push(b[0] + (e[0] - b[0]) * ((-1 - b[1]) / (e[1] - b[1])));
    }
  }
  ctx.save();
  ctx.scale(f * S, S); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.save();                                                    // the dark shape gliding under the surface
  ctx.beginPath(); ctx.ellipse(0, 0, RIG.POOL.rx - 6, RIG.POOL.ry - 3, 0, 0, Math.PI * 2); ctx.clip();
  ctx.globalAlpha = 0.32; ctx.fillStyle = SUB.dark;
  ctx.beginPath(); ctx.ellipse(sx, 2, 46, 9, Math.sin(t * 0.9 + 1) * 0.08, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(sx + 34 * Math.cos(t * 0.9), 0, 16, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  subRings(ctx, xs, false);                                      // the rings' far halves: the fins cut through them
  ctx.beginPath(); ctx.rect(-4000, -4000, 8000, 3999); ctx.clip();          // nothing below the surface
  ctx.scale(1 / (f * S), 1 / S);
  X.draw(ctx, pose, o);
  ctx.restore();
  ctx.save();
  ctx.scale(f * S, S); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  subRings(ctx, xs, true);
  const n = 2 + Math.round(3 * Math.max(0, Math.min(1, pose.bub ?? 1)));   // magmaw.js submerged(): the bubbles
  for (let i = 0; i < n; i++) {
    const u = (t * 0.8 + i * 0.31) % 1, x = sx + Math.sin(i * 2.3) * 26, y = Math.cos(i * 1.7) * 7;
    if (u < 0.75) {
      const r = 2 + u * 8;
      ctx.beginPath(); ctx.ellipse(x, y - r * 0.4, r, r * 0.75, 0, 0, Math.PI * 2);
      ctx.fillStyle = SUB.mol; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = SUB.ink; ctx.stroke();
      ctx.fillStyle = SUB.molC; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.7, r * 0.28, 0, Math.PI * 2); ctx.fill();
    } else {
      const v = (u - 0.75) / 0.25;
      ctx.globalAlpha = 1 - v; ctx.strokeStyle = SUB.molH; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y, 8 + v * 14, 3 + v * 5, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

/** Draw with the centre of his pool at (0, 0) (the engine draws the pool itself first).  o: as ./magmaw.js. */
export function draw(ctx, pose, o = {}) {
  const crystal = o.variant === 'crystal';
  X = crystal && CRYSTAL_ART ? AC : A; SUB = crystal ? SUB_CRYSTAL : SUB_LAVA;
  if (pose && pose.s3d >= 0.5 && pose.clip === 'submerged') { drawSubmerged(ctx, pose, o); return; }
  if (!pose || !(pose.s3d >= 0.5) || !pose.vis) { rigDrawn('magmaw', pose); RIG.draw(ctx, pose, o); return; }
  const f = o.facing || 1, S = o.scale || 1, t = o.t || 0;
  let p = pose;
  const twin = { freed: 'freedTalk' }[pose.clip];
  if (o.talk && twin && isSpr(twin) && Math.floor(t * 8) % 2 === 0) p = { s3d: 1, clip: twin, ['f_' + twin]: pose['f_' + pose.clip] };
  const lm = (k) => X.point3d(pose, k);
  const sunk = (q) => q[1] > -1 && Math.abs(q[0]) < RIG.POOL.rx;      // under the lava (the clip hides it)
  const at = (k) => { const q = lm(k); return q ? [q[0] * f * S, q[1] * S] : null; };
  const atUp = (k) => { const q = lm(k); return q && !sunk(q) ? [q[0] * f * S, q[1] * S] : null; };
  const rings = [];
  for (const k of ['cr0', 'cr1']) {                          // where this drawing's body pierces the lava
    const c = lm(k), w = lm(k + 'w');
    if (c && w && c[1] < 200) rings.push([c[0], Math.abs(w[0] - c[0])]);
  }
  const fxo = Object.assign({}, o, { talk: false });
  RIG.drawFx(ctx, pose, fxo, 'back', rings);
  ctx.save();                                                // everything below the lava surface is hidden
  ctx.scale(f * S, S);
  ctx.beginPath(); ctx.rect(-4000, -4000, 8000, 8000); hidden(ctx, pose.clip === 'dive' || pose.clip === 'emerge' ? pose.clip : ''); ctx.clip('evenodd');
  ctx.scale(1 / (f * S), 1 / S);
  X.draw(ctx, p, o);
  const g = Math.max(0, Math.min(1, pose.glow || 0));
  if (g > 0.05) {                                            // fire climbing up the belly into the throat
    const B = [0, 1, 2, 3, 4].map((i) => at('bel' + i)).filter(Boolean);
    if (B.length === 5) {
      const top = g * 4;
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(B[0][0], B[0][1]);
      for (let i = 1; i <= 4 && i - 1 < top; i++) {
        const u = Math.min(1, top - (i - 1));
        ctx.lineTo(B[i - 1][0] + (B[i][0] - B[i - 1][0]) * u, B[i - 1][1] + (B[i][1] - B[i - 1][1]) * u);
      }
      ctx.globalAlpha = 0.5; ctx.strokeStyle = SUB.glow; ctx.lineWidth = (12 + 8 * g) * S; ctx.stroke();
      ctx.globalAlpha = 0.9; ctx.strokeStyle = SUB.glowC; ctx.lineWidth = (5 + 4 * g * (0.85 + 0.15 * Math.sin(t * 14))) * S; ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
  const m = atUp('mouth'), mf = at('mouthF'), jaw = pose.jaw || 0;
  if (g > 0.05 && jaw > 8 && m && mf) {                       // flames licking out of the jaws (the engine draws the stream)
    ctx.save(); ctx.translate(m[0], m[1]); ctx.rotate(Math.atan2(mf[1] - m[1], mf[0] - m[0])); ctx.scale(0.9 * S, 0.9 * S);
    for (let i = 0; i < 3; i++) {
      const ph = t * 13 + i * 2.1, L = (16 + 14 * g) * (0.75 + 0.25 * Math.sin(ph)), off = (i - 1) * 7 * g;
      ctx.beginPath(); ctx.moveTo(-4, off - 6 * g); ctx.quadraticCurveTo(L * 0.6, off - 7 * g + Math.sin(ph) * 3, L, off + Math.sin(ph * 1.3) * 3);
      ctx.quadraticCurveTo(L * 0.5, off + 6 * g, -4, off + 6 * g); ctx.closePath();
      ctx.fillStyle = i === 1 ? SUB.glowC : SUB.glow; ctx.fill();
    }
    ctx.restore();
  }
  const e = atUp('eye'), free = pose.free || pose.face === 'freed' || o.cursed === false;
  if (e) {
    // (closed lids: the drawn drawing's own, where the atlas lists its blink drawings -- a trimmed loop may have dropped
    //  the blink the rig's timer still calls; painted round 3 -- else the rig's)
    const ci = X.clipInfo(pose.clip), shut = ci && ci.blink ? ci.blink.includes(pose['f_' + pose.clip]) : !!pose.blink;
    const face = drawnFace(pose);
    if (!free && face !== 'ouch' && face !== 'tired' && !shut) {   // the curse's glow round the eye
      ctx.save(); ctx.globalAlpha = 0.28 + 0.1 * Math.sin(t * 7); ctx.fillStyle = '#5cff7e';
      ctx.beginPath(); ctx.ellipse(e[0], e[1], 16 * S, 12.6 * S, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    if (face === 'ouch') ouchMark(ctx, pose, f, S);           // (the 3D lid shuts for ouch and tired alike)
    if (face === 'dazed') {                              // the dazed spiral
      ctx.save(); ctx.strokeStyle = '#2a1f1f'; ctx.lineWidth = 1.8 * S; ctx.beginPath();
      for (let a = 0; a < 4 * Math.PI; a += 0.35) {
        const r = 6.3 * S * a / (4 * Math.PI), aa = a + t * 5;
        if (a) ctx.lineTo(e[0] + Math.cos(aa) * r, e[1] + Math.sin(aa) * r * 0.85); else ctx.moveTo(e[0], e[1]);
      }
      ctx.stroke(); ctx.restore();
    }
    if (!free && pose.ef > 0.02) { ctx.save(); ctx.globalAlpha = pose.ef; twinkle(ctx, e[0] + f * 6.5 * S, e[1] - 5 * S, (4 + 5 * pose.ef) * S); ctx.restore(); }
  }
  const gm = atUp('gem');
  if (gm && !free && !(pose.shatter > 0)) {                  // the gem's pulse + (defeated) the cracks leaking light
    const crack = Math.max(0, Math.min(1, pose.crack || 0));
    const pulse = pose.stars ? 0.5 + 0.5 * Math.abs(Math.sin(t * 13)) : 0.7 + 0.3 * Math.sin(t * 4.4);
    ctx.save();
    if (crack < 0.66) {
      ctx.globalAlpha = 0.3 * pulse; ctx.fillStyle = '#5cff7e'; ctx.beginPath(); ctx.arc(gm[0], gm[1], 22 * S, 0, Math.PI * 2); ctx.fill();
    }
    if (crack > 0.02) {
      const gx = gm[0], gy = gm[1], gh = 13 * S, gw = 10 * S;
      const cracks = (c) => {
        c.moveTo(gx - 1 * S, gy - gh); c.lineTo(gx + 2.5 * S, gy - 4 * S); c.lineTo(gx - 3 * S, gy + 1 * S); c.lineTo(gx + 1 * S, gy + gh);
        if (crack > 0.3) { c.moveTo(gx + 2.5 * S, gy - 4 * S); c.lineTo(gx + gw, gy - 1 * S); c.moveTo(gx - 3 * S, gy + S); c.lineTo(gx - gw, gy + 2.5 * S); }
        if (crack > 0.55) { c.moveTo(gx - 22 * S, gy - 10 * S); c.lineTo(gx - 16 * S, gy); c.lineTo(gx - 22 * S, gy + 9 * S); }
        if (crack > 0.8) { c.moveTo(gx + 20 * S, gy - 9 * S); c.lineTo(gx + 15 * S, gy + 2 * S); c.lineTo(gx + 22 * S, gy + 10 * S); }
      };
      const lk = 0.5 + 0.5 * Math.abs(Math.sin(t * (8 + crack * 14)));
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.55 * lk; ctx.strokeStyle = '#5cff7e'; ctx.lineWidth = (6 + crack * 4) * S; ctx.beginPath(); cracks(ctx); ctx.stroke();
      ctx.globalAlpha = 1; ctx.strokeStyle = '#eaffdf'; ctx.lineWidth = 2.6 * S; ctx.beginPath(); cracks(ctx); ctx.stroke();
      ctx.strokeStyle = '#21141c'; ctx.lineWidth = 1 * S; ctx.beginPath(); cracks(ctx); ctx.stroke();
    }
    ctx.restore();
  }
  RIG.drawFx(ctx, pose, fxo, 'front', rings);
}
export { draw as drawMagmaw };

const pt = (key, k, lm) => { const g = A.ANIM[key]; return typeof g === 'function' ? A.point3d(g(k), lm) : null; };
const m3 = pt('breath', RIG.BREATH_K, 'mouth'), mF = pt('breath', RIG.BREATH_K, 'mouthF'), b3 = pt('bite', RIG.BITE_K, 'bite');
/** Mouth (fire stream origin) + angle at the start of the breath sweep, from the 3D drawing. */
export const MOUTH = m3 && mF ? [Math.round(m3[0]), Math.round(m3[1]), +Math.atan2(mF[1] - m3[1], mF[0] - m3[0]).toFixed(3)] : RIG.MOUTH;
export const BREATH_MOUTH = MOUTH;
/** The bite at contact (jaw tip) and its reach in front of the pool centre, from the 3D drawing. */
export const BITE = b3 ? b3.map((c) => Math.round(c)) : RIG.BITE;
export const BITE_REACH = BITE[0];
export const META = A.META;
export const ATLAS_SCALE = A.ATLAS_SCALE;
