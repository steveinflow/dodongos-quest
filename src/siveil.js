// SKULL ISLAND (Book Two) -- its scene transitions (docs/SI_AA_BAR.md item 9: "no hard cuts between gameplay, stories and
// menus").  Book 2 only: src/main.js calls siSceneVeil(app, next) at the top of setScene() and drawSiVeil(ctx, app) last
// in render(), both under isSI().
//
// It never holds a scene back: the next scene (or the LOADING card) starts at once, exactly as in Book 1 -- the veil only
// covers its first frames.  A skip stays instant; nothing is added to any chain.
// Every change is a DIP, never a cross-fade (two scenes' text on top of each other read as a mess -- the batch-2 critic):
//   the last frame on screen (a copy) darkens toward the book's navy over OUT frames, then it is gone and the navy lifts off
//   whatever is up by then (the LOADING card, or the new scene) over IN frames.
//   FULL dip (to solid navy, 9 + 14 f): at most one per DIP_GAP frames.
//   QUICK dip (to 85% navy, 8 + 12 f; a page turn 8 + 10 f): menu to menu, a change soon after a full dip (a kid skipping through stories), and
//   every change under prefers-reduced-motion.  It only ever darkens and returns -- never a bright flash.
// One canvas holds the outgoing frame (960 x 540, ~2 MB, made once through src/canvasmem.js; refused -> a plain navy dip).
import { W, H } from './config.js';
import { cacheCanvas } from './canvasmem.js';

const NAVY = [15, 26, 51];   // (#0f1a33: the loading card's navy -- src/hud.js SI_NAVY)
const FULL = { out: 12, in: 16, peak: 1 }, QUICK = { out: 8, in: 12, peak: 0.85 }, PAGE = { out: 8, in: 10, peak: 0.85 }, DIP_GAP = 96;
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const MENUS = new Set(['title', 'levels', 'controls', 'select']);
const V = { snap: null, g: null, has: false, out0: null, in0: null, d: FULL, lastDip: -1e9, waitLoad: false, page: null, pageGrab: -1 };

function grab(app) {
  if (!V.snap) { const r = cacheCanvas(W, H); if (!r) return false; V.snap = r.c; V.g = r.g; }
  if (!V.g) return false;
  try {
    const cw = Math.min(app.canvas.width, Math.round(W * app.scale)), ch = Math.min(app.canvas.height, Math.round(H * app.scale));
    V.g.drawImage(app.canvas, 0, 0, cw, ch, 0, 0, W, H);
    return true;
  } catch { return false; }
}
/** setScene(next) is about to run (the canvas still shows the scene going) */
export function siSceneVeil(app, next) {
  const prev = app.scene, f = app.frame;
  if (prev === next || prev === 'boot' || !prev) return;
  if (prev === 'loading') {                                  // (the next scene is up: the navy lifts -- after the OUT, if it's running)
    if (V.waitLoad) { V.in0 = V.out0 !== null && f - V.out0 < V.d.out ? V.out0 + V.d.out : f; V.waitLoad = false; }
    return;
  }
  if (V.out0 !== null && f - V.out0 < V.d.out) return;       // (already darkening: let it run)
  // (a menu row pressed this very frame: the scene going is drawn once more first, so the copy the dip darkens from shows the
  //  pressed row's flash -- src/hud.js siFocus)
  if (app._menuPressT === app.time && (MENUS.has(prev) || prev === 'clear')) { try { app.render(); } catch { /* (the copy: as it was) */ } }
  const quick = REDUCED || (MENUS.has(prev) && MENUS.has(next)) || f - V.lastDip < DIP_GAP;
  V.d = quick ? QUICK : FULL;
  if (!quick) V.lastDip = f;
  V.has = grab(app);
  V.out0 = f; V.in0 = f + V.d.out; V.waitLoad = next === 'loading';
}
/** a story's page turn (inside one scene): the old page -- grabbed while its last line was up -- darkens a little and the new
 * page comes up out of it, as the scene changes do (a page used to vanish in one frame) */
function pageTurn(app, f) {
  const S = app.scene === 'story' ? app.story : null;
  if (!S || S.done) { V.page = null; return; }
  const key = S.id + ':' + S.page;
  if (V.page !== null && V.page !== key && f - V.pageGrab < 12 && !(V.out0 !== null && V.d !== PAGE)) { V.d = PAGE; V.has = true; V.out0 = f - 1; V.in0 = f - 1 + PAGE.out; V.waitLoad = false; }   // (also over a lift still running: a kid skipping fast)
  V.page = key;
  // (keep a copy of the page every 4 frames -- drawn before the veil, so clean -- the turn darkens from it)
  if (f % 4 === 0 && V.out0 === null && grab(app)) V.pageGrab = f;   // (never while a dip is darkening from its own copy)
}
/** last in App.render (game px, clipped to the frame) */
export function drawSiVeil(ctx, app) {
  const f = app.frame;
  pageTurn(app, f);
  const D = V.d;
  let navy = 0, snap = false;
  if (V.out0 !== null) {
    const t = f - V.out0;
    if (t < D.out) { snap = V.has; navy = D.peak * (t + 1) / (D.out + 1); }
    else if (V.waitLoad || f < V.in0) navy = D.peak;          // (the LOADING card still up: held at the peak)
    else V.out0 = null;
  }
  if (V.out0 === null && V.in0 !== null && !V.waitLoad) {
    const t = f - V.in0;
    if (t < 0) navy = D.peak;
    else if (t < D.in) { const k = 1 - t / D.in; navy = Math.max(navy, D.peak * k * k * (3 - 2 * k)); }
    else V.in0 = null;
  }
  if (snap && V.snap) ctx.drawImage(V.snap, 0, 0, W, H);
  if (navy > 0.003) { ctx.save(); ctx.fillStyle = `rgba(${NAVY[0]},${NAVY[1]},${NAVY[2]},${Math.min(1, navy).toFixed(3)})`; ctx.fillRect(0, 0, W, H); ctx.restore(); }
}
/** (tests) the veil's state */
export function siVeilState() { return { out0: V.out0, in0: V.in0, quick: V.d === QUICK, snap: !!V.snap }; }
