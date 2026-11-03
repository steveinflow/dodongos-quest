// A sailor of Blunderbeard's crew, toon-3D (the painted builder's layered packs, assets/sprites/sailor_*): ONE model rendered as pixel-aligned
// LAYERS that share clips, drawings, timing and the feet anchor -- drawn in this order at the same feet point, each layer already cut where an
// earlier one is in front of it:  BODY (the navy uniform, or the bandana thug's striped shirt) -> HANDS (light; the burly face takes dark) ->
// HEAD (one of five faces, with the navy or the purple bandana; the expression is baked per clip) -> PROP (club | rope | net | cutlass).
// Twenty combinations out of 18 small packs (11.6 MB at 1x).  Clips (the rig's keys): idle walk taunt windup swing lungeWind lunge throwWind throw
// pullWind pull hurt fly down getup; `flee` is the walk at double phase.  The bandana thug has only idle walk taunt lungeWind lunge hurt fly down getup;
// the net prop only pullWind / pull (every other clip: an empty fist -- no prop drawn).  Landmarks (point(pose, name)): hand, head, tip, tipC, loop.
// Drawn once 'sailor' is listed in src/chars.js SI_ART3D; until then -- and for any layer pack that did not load -- ./sailor.js (the code rig).
import * as RIG from './sailor.js';
import { spriteArt } from '../sprite3d.js';

const FACES = ['ginger', 'bald', 'patch', 'burly', 'spiky'];
const WIDTH = [0.95, 1.15, 1.05, 1.15, 0.95];   // (the bodies are one build: each face stands a little slimmer / stouter -- the x scale of the body, hands and prop)
// (the model round, #4: the crew sheet is ~4.5 heads tall, the packs ~6 -- the HEAD layer drawn HEAD_K x, uniform, about the neck: a point
//  NECK_K of the way from the body's 'head' landmark to its 'hips' (any pose: lying, flying).  Drawn after the body and before the hands,
//  so a fist stays in front of the bigger head)
//  (since the re-render the packs carry the bigger head themselves -- tools/sprite3d/chars/sailor.py GAME head_scale 1.54, the fists
//   moved out in front of it -- so HEAD_K is 1: the head layer is still drawn un-widened, at its neck on the widened body)
const HEAD_K = 1.0, NECK_K = 0.35;
// (critic B: the jacketless striped thug body needs ~+0.1 over the navy widths -- a big head on a stick otherwise)
const WIDTH_THUG = [1.05, 1.2, 1.1, 1.2, 1.05];
// (the stout body packs, critics A + B on 1x line-ups: their own bulk + a stretch, and SQUAT -- the body, hands and prop
//  drawn HEIGHT_STOUT tall about the feet, the head unsquashed at the squashed neck (critic A: the sheet's bald man the
//  shortest of the five; a runtime squash instead of a shorter-legged re-render, whose club grips are absolute).  'M2':
//  bald 0.92 tall, 1.225 wide (thug 1.25); burly 0.95, 1.175 (thug 1.2).  A missing stout pack: the standard body at
//  WIDTH / WIDTH_THUG above, no squash)
const WIDTH_STOUT = [0.95, 1.225, 1.05, 1.175, 0.95], WIDTH_THUG_STOUT = [1.05, 1.25, 1.1, 1.2, 1.05], HEIGHT_STOUT = [1, 0.92, 1, 0.95, 1];
const NAMES = ['sailor_body', 'sailor_thug_body', 'sailor_body_stout', 'sailor_thug_body_stout', 'sailor_hands_light', 'sailor_hands_dark', 'sailor_prop_club', 'sailor_prop_rope', 'sailor_prop_net', 'sailor_prop_cutlass',
  ...FACES.flatMap((f) => [`sailor_head_${f}`, `sailor_head_${f}_thug`])];
const L = {};
await Promise.all(NAMES.map(async (n) => { try { L[n] = await spriteArt(n); } catch (e) { console.warn('sailor layer not loaded:', n, e && e.message); } }));
const have = (n) => !!(L[n] && L[n].ATLAS_SCALE);
const READY = have('sailor_body') && have('sailor_hands_light');   // (the core layers: without them the code rig draws)

export const ATLAS_SCALE = READY ? L.sailor_body.ATLAS_SCALE : 0;
export const META = (READY && L.sailor_body.META) || RIG.META;
export const HURTBOX = RIG.HURTBOX;
export const FACE_NAMES = RIG.FACE_NAMES;
export const HEIGHT = RIG.HEIGHT;

// the clips: a pose is the layers' shared { s3d, clip, f_<clip> } (any layer that has the clip builds the same one); keys no layer has come from the rig
const ANIM = {};
if (READY) {
  for (const n of NAMES) if (have(n)) for (const k of Object.keys(L[n].ANIM)) { const f = L[n].ANIM[k]; const isSpr = ((typeof f === 'function' ? f(0) : f) || {}).s3d >= 0.5; if (isSpr && !ANIM[k]) ANIM[k] = f; }
  if (!ANIM.roping && ANIM.throw) ANIM.roping = () => ANIM.throw(1);   // (no 'roping' clip in the packs yet: the throw's last drawing)
  for (const k of Object.keys(RIG.ANIM)) if (!ANIM[k]) { const f = RIG.ANIM[k]; ANIM[k] = typeof f === 'function' ? (x) => Object.assign({}, f(x), { s3dRig: k }) : Object.assign({}, f, { s3dRig: k }); }   // (tagged with its key: draw maps it to a painted clip)
  if (ANIM.walk) ANIM.flee = (ph) => ANIM.walk(((ph * 2) % 1 + 1) % 1);   // (as in the rig)
} else Object.assign(ANIM, RIG.ANIM);
export { ANIM };

// (the model round #4: the sheet's bald and burly men are barrel-chested -- their STOUT body pack, the same rig and clips, when in)
const STOUT = new Set([1, 3]);
const layersOf = (kit, face) => {
  const bd = kit === 'bandana', fi = ((face | 0) % 5 + 5) % 5, f = FACES[fi];
  const body = bd ? 'sailor_thug_body' : 'sailor_body', stout = body + '_stout';
  return [STOUT.has(fi) && have(stout) ? stout : body, face === 3 ? 'sailor_hands_dark' : 'sailor_hands_light', `sailor_head_${f}${bd ? '_thug' : ''}`,
    bd ? 'sailor_prop_cutlass' : kit === 'rope' ? 'sailor_prop_rope' : kit === 'net' ? 'sailor_prop_net' : 'sailor_prop_club'];
};
export function point(pose, lm, o = {}) {
  if (pose && pose.s3d >= 0.5 && READY) { for (const n of ['sailor_body', 'sailor_thug_body', 'sailor_hands_light', 'sailor_prop_club']) { const q = have(n) && L[n].point3d(pose, lm); if (q) return [q[0], q[1]]; } return null; }
  return RIG.point ? RIG.point(pose, lm, o) : null;   // (o.face: the rig's builds differ)
}
/** the body's draw scale for a kit and a face: { wx, sy } -- the width and the stout squash draw() applies about the feet (the hands, the
 *  prop and so the fist with it).  1, 1 while that body's pack is not in (the code rig: its own builds).  Sailor.hand(): the lasso's fist */
export function bodyXform(kit, face) {
  const fi = ((face | 0) % 5 + 5) % 5, ls = layersOf(kit || 'club', fi);
  if (!READY || !have(ls[0])) return { wx: 1, sy: 1 };
  const st = ls[0].endsWith('_stout');
  return { wx: (kit === 'bandana' ? (st ? WIDTH_THUG_STOUT : WIDTH_THUG) : (st ? WIDTH_STOUT : WIDTH))[fi], sy: st ? HEIGHT_STOUT[fi] : 1 };
}
// (the nearest painted clip for a move a body has no drawing of -- AA bar, QAF3: a bandana thug at the palace door was drawn by the code
//  rig.  Each body's own moves are its kit's; these only stand in (a painter may draw them later: docs/SI_POLISH.md)
const NEAR = {
  sailor_thug_body: { windup: 'lungeWind', swing: 'lunge', throwWind: 'taunt', throw: 'lunge', pullWind: 'taunt', pull: 'taunt', roping: 'taunt' },
  sailor_body: { lungeWind: 'windup', lunge: 'swing' },
};
NEAR.sailor_body_stout = NEAR.sailor_body;            // (the stout bodies: the same kits' moves)
NEAR.sailor_thug_body_stout = NEAR.sailor_thug_body;
const infoOf = (clip) => { for (const n of NAMES) { const c = have(n) && L[n].clipInfo(clip); if (c) return c; } return null; };
/** the pose as the kit's body draws it: its own clip, else the nearest one it has at the same point in the move, else its idle; null only
 *  when the body's pack is not in */
function forBody(pose, body) {
  if (!pose || !have(body)) return null;
  const B = L[body], sp = pose.s3d >= 0.5, clip = sp ? pose.clip : pose.s3dRig;
  if (sp && B.clipInfo(clip)) return pose;
  const to = [clip && NEAR[body]?.[clip], 'idle'].find((c) => c && B.clipInfo(c));
  if (!to) return null;
  const si = sp ? infoOf(clip) : null, ti = B.clipInfo(to), i = sp ? pose['f_' + clip] | 0 : 0;
  return { s3d: 1, clip: to, ['f_' + to]: Math.round((si && si.n > 1 ? i / (si.n - 1) : 0) * Math.max(0, (ti.n || 1) - 1)) };
}
export function draw(ctx, pose, o = {}) {
  const face = o.face ?? 0, kit = o.kit || 'club', ls = layersOf(kit, face), P = READY ? forBody(pose, ls[0]) : null;
  if (!P) { RIG.draw(ctx, pose, o); return; }   // (only while the packs are not in: the code rig)
  ctx.save();
  const BX = bodyXform(kit, face), w = BX.wx, hh = BX.sy;   // (one source with Sailor.hand(): bodyXform)
  if (w !== 1 || hh !== 1) ctx.scale(w, hh);
  const B = L[ls[0]], hd = (HEAD_K !== 1 || w !== 1 || hh !== 1) && B.point3d(P, 'head'), hp = hd && B.point3d(P, 'hips');
  const S = o.scale || 1, fc = o.facing || 1;
  const pv = hd && hp ? [fc * (hd[0] + NECK_K * (hp[0] - hd[0])) * S, (hd[1] + NECK_K * (hp[1] - hd[1])) * S] : null;
  for (const n of pv ? [ls[0], ls[2], ls[1], ls[3]] : ls) {
    if (!have(n) || !L[n].clipInfo(P.clip)) continue;
    if (pv && n === ls[2]) {   // the head: the body's width undone, then HEAD_K about the neck (its spot on the widened body)
      ctx.save(); ctx.scale(1 / w, 1 / hh); ctx.translate(w * pv[0], hh * pv[1]); ctx.scale(HEAD_K, HEAD_K); ctx.translate(-pv[0], -pv[1]);
      try { L[n].draw(ctx, P, o); } finally { ctx.restore(); }
    } else L[n].draw(ctx, P, o);
  }
  ctx.restore();
}
export const EXPORTS = READY ? Object.assign({}, L.sailor_body.EXPORTS, L.sailor_thug_body && L.sailor_thug_body.EXPORTS) : {};
