// THE SWAMP ROOT, painted (QA1 A1 -- it replaces the code-drawn ringed tube): painter 2's 'swamp_root' pack
// (assets/sprites/swamp_root/, 1x; tools/sprite3d/chars/swamp_root.py + _painted.py): the swamp tree's and the Elder's own
// black braided bark, claw-tipped, dripping olive moss, a warm ochre rim (the hazard's accent).  Clips: up (t: swaying, 250 px -- the code's tipH) and hold (t: the
// shaft 48 px to one side of a held hero, a rootlet wrapped round their waist), and the SWEEP's parts seg / seg2 / head / knot (statics:
// a length of root lying on the mud, seg2 a shorter arched one, its rising curled claw end, a bark gnarl); landmarks tip segL segR sgbL sgbR headB.
//
// drawRoot(ctx, r) draws a src/siswamp.js Root (a src/sikraken.js Tentacle) with the pack and returns true, or returns false
// (the pack not resident: Root.draw then draws the code tube).  The warning rings, the hole and the '!' stay the Tentacle's.
//   SLAM / GRAB  'up', pushed down by (250 - tipH) and clipped just below the floor line: it bursts out of the mud and sinks
//                back (and breathes with the code's 14 px bob); a hit flashes it (drawWithFlash).
//   GRAB, held   'hold', anchored at the held hero's x, rising out of the mud in 12 frames.
//   SWEEP        the head at the tip (its claw at tipX: only the tip hits), then segments back to the off-screen base with a
//                knot over every joint; per tile a flip, a scale step and a little wave so the run never reads as one
//                repeating module (coordinator, A1 approval).
import * as RIG from './swamp_root.js';
import { mmArt } from './mm3d.js';
import { packHas } from '../sprite3d.js';
import { drawWithFlash } from '../render.js';
import { W, FLOOR_TOP } from '../config.js';

const M = await mmArt('swamp_root', RIG);
export const { ANIM, META, ATLAS_SCALE, point, draw, EXPORTS } = M;
const CLIPS = ['up', 'hold', 'seg', 'seg2', 'head', 'knot'];
/** the pack is decoded and has every clip the root draws */
export const ready = () => !!M.ATLAS_SCALE && packHas('swamp_root', CLIPS);

const pose = (k, x) => { const a = ANIM[k]; return typeof a === 'function' ? a(x) : a; };
const lm = (k, n) => { const p = pose(k, 0), q = p && p.s3d >= 0.5 ? point(p, n) : null; return q || null; };
let SEG = null;   // { seg, seg2 (lengths), headB } in game px (facing right), measured once from the pack's landmarks
function seg() {
  if (SEG) return SEG;
  const L = lm('seg', 'segL'), R = lm('seg', 'segR'), L2 = lm('seg2', 'sgbL'), R2 = lm('seg2', 'sgbR'), hb = lm('head', 'headB');
  if (!L || !R || !L2 || !R2 || !hb) return null;
  return (SEG = { seg: Math.abs(L[0] - R[0]), seg2: Math.abs(L2[0] - R2[0]), headB: hb[0] });
}
// the tiles from the head back to the base, an irregular cycle (critics r4: one even module read as logs end to end):
// [clip, scale, flip]; the body thickens toward the off-screen base (a root growing out of the bog), each tile overlaps the
// next a little and a gnarl sits on every joint, jittered
const TILES = [['seg2', 1.0, 1], ['seg', 1.04, -1], ['seg', 0.96, 1], ['seg2', 1.06, -1], ['seg', 1.0, -1], ['seg2', 0.94, 1], ['seg', 1.02, 1]];
const hash = (n) => { n = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; return (n >>> 0) / 4294967296; };

export function drawRoot(ctx, r) {
  if (!ready()) return false;
  const g = r.game, t = g.time || 0;
  if (r.kind === 'sweep') {
    if (r.phase !== 'go') return true;
    const S = seg();
    if (!S) return false;
    const d = r.dir > 0 ? 1 : -1, sy = FLOOR_TOP + r.y, tipSx = r.tipX - g.camX, baseSx = d > 0 ? -140 : W + 140;
    const hx = tipSx - d * 14;                                    // (the head's claw a little past its origin: at tipX)
    const tiles = [];
    let x = hx + d * S.headB, i = 0;                              // (headB < 0: the head's joint behind it)
    while (i < 10 && (d > 0 ? x > baseSx - 40 : x < baseSx + 40)) {
      const [clip, k, f] = TILES[i % TILES.length], L = S[clip] * k;
      const th = 0.92 + 0.07 * Math.min(i, 3);                    // (thicker toward the base)
      tiles.push({ x, cx: x - d * L / 2, clip, k, f, th, dy: -2.5 * Math.sin(t * 6 + i * 1.3) });
      x -= d * L * 0.94; i++;
    }
    for (let j = tiles.length - 1; j >= 0; j--) {                 // (the far tiles first: the head in front)
      const T = tiles[j];
      ctx.save(); ctx.translate(T.cx, sy + T.dy); ctx.scale(1, T.th); draw(ctx, pose(T.clip), { facing: d * T.f, scale: T.k }); ctx.restore();
    }
    for (let j = tiles.length - 1; j >= 0; j--) {                 // (a gnarl on every joint, jittered)
      const T = tiles[j], h = hash(j * 7 + 3);
      ctx.save(); ctx.translate(T.x + (h - 0.5) * 14, sy + T.dy + (h - 0.5) * 4); ctx.scale(1, T.th);
      draw(ctx, pose('knot'), { facing: (h < 0.5 ? -1 : 1) * d, scale: 0.7 + 0.5 * hash(j * 13 + 1) }); ctx.restore();   // (r5c: sizes 0.7-1.2 -- two alike read as tiling)
    }
    ctx.save(); ctx.translate(hx, sy - 3 * Math.sin(t * 6 - 1.3)); draw(ctx, pose('head'), { facing: d }); ctx.restore();
    return true;
  }
  if (r.phase === 'tele' || r.phase === 'gone') return true;      // (the warning ring and the '!' are the Tentacle's)
  if (r._rtF === undefined) { const h = hash(Math.round(r.x * 3) + (r.kind === 'grab' ? 7 : 0)); r._rtF = h < 0.5 ? 1 : -1; r._rtT = h * 10; }
  const flash = r.flash > 0 ? r.flash / 6 : 0, sy = FLOOR_TOP + r.y;
  const held = r.phase === 'hold' && r.held;
  const x = held ? r.held.sx : r.sx;
  const H = r.phase === 'hold' ? 250 * Math.min(1, (r.age + 1) / 12) : r.tipH;
  if (H <= 2) return true;
  const D = Math.max(0, 250 - H), p = held ? pose('hold', t + r._rtT) : pose('up', t + r._rtT);
  ctx.save();
  if (D > 0.5) { ctx.beginPath(); ctx.rect(x - 320, sy - 420, 640, 432); ctx.clip(); }   // (out of the mud: nothing below the floor line)
  drawWithFlash(ctx, x, sy + D, flash, (c) => draw(c, p, { facing: r._rtF, t }));
  ctx.restore();
  return true;
}
