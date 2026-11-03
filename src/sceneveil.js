// BOOKS ONE and THREE (Mystic Mountain, Dodongo's Quest) -- their scene transitions (docs/SI_AA_BAR.md item 9: "no hard cuts
// between gameplay, stories and menus"; the all-books flash pass, 2026-10-25: a level's cut into its LOADING card darkened 37 % of
// Book 1's screen in one frame).  src/main.js calls sceneVeil(app, next) at the top of setScene() and drawSceneVeil(ctx, app) last
// in render(), for Books 1 and 3 -- Book 2 has its own, src/siveil.js, and this follows it:
//
// It never holds a scene back: the next scene (or the LOADING card) starts at once, exactly as before -- the veil only covers its
// first frames.  A skip stays instant; nothing is added to any chain.  Every change is a DIP, never a cross-fade: the last frame on
// screen (a copy) darkens to the LOADING card's own dark (#1b1426) over OUT frames, then it is gone and the dark lifts off whatever
// is up by then -- the LOADING card itself (its own dark: no seam), or the new scene.
// The dip runs in seen DEPTH (v = 1 - (1 - alpha)^2.2, the share of a cell's light it takes -- the canvas mixes in sRGB, as
// src/showcase.js's cut-in veil): out at an even rate no faster than ~0.075 a frame (no frame darkens a bright cell by 0.1), in at
// 0.025 a frame -- Book 1's 40-frame lift out of its LOADING card (App.drawMMLift, MM_LIFT), now every change's in both books: a
// 16-frame lift lit a bright stage ~0.18 in 3 frames.
//   FULL dip (to solid dark: 14 + 40 f): at most one per DIP_GAP frames.
//   QUICK dip (to 60 % dark: 10 + 30 f): menu to menu, a change soon after a full dip (a kid skipping through stories), and every
//   change under prefers-reduced-motion.  A story's page turn: a short one too (9 + 24 f).  It only ever darkens and returns.
// One canvas holds the outgoing frame (960 x 540, ~2 MB, made once through src/canvasmem.js; refused -> a plain dark dip).
import { W, H } from './config.js';
import { cacheCanvas } from './canvasmem.js';

const DARK = [27, 20, 38];   // (#1b1426: the LOADING card's -- src/hud.js drawLoading, Books 1 / 3)
const vOf = (a) => 1 - Math.pow(1 - Math.min(1, Math.max(0, a)), 2.2), aOf = (v) => (v >= 1 ? 1 : 1 - Math.pow(1 - Math.max(0, v), 1 / 2.2));
const FULL = { out: 14, in: 40, peak: 1 }, QUICK = { out: 10, in: 30, peak: 0.6 }, PAGE = { out: 9, in: 24, peak: 0.6 }, DIP_GAP = 96;
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
export function sceneVeil(app, next) {
  const prev = app.scene, f = app.frame;
  if (prev === next || prev === 'boot' || !prev) return;
  if (prev === 'loading') {                                  // (the next scene is up: the dark lifts -- after the OUT, if it's running)
    if (V.waitLoad) { V.in0 = V.out0 !== null && f - V.out0 < V.d.out ? V.out0 + V.d.out : f; V.waitLoad = false; }
    return;
  }
  if (V.out0 !== null && f - V.out0 < V.d.out) return;       // (already darkening: let it run)
  // (a menu row pressed this very frame: the scene going is drawn once more first, so the copy shows the pressed row's flash)
  if (app._menuPressT === app.time && (MENUS.has(prev) || prev === 'clear')) { try { app.render(); } catch { /* (the copy: as it was) */ } }
  const quick = REDUCED || (MENUS.has(prev) && MENUS.has(next)) || f - V.lastDip < DIP_GAP;
  V.d = next === 'loading' ? FULL : quick ? QUICK : FULL;   // (into the LOADING card: always to its full dark -- the card follows without a seam)
  if (V.d === FULL) V.lastDip = f;
  V.has = grab(app);
  V.out0 = f; V.in0 = f + V.d.out; V.waitLoad = next === 'loading';
}
/** a story's page turn (inside one scene): the old page -- grabbed while its last line was up -- darkens a little and the new page
 *  comes up out of it (a page vanished in one frame) */
function pageTurn(app, f) {
  const S = app.scene === 'story' ? app.story : null;
  if (!S || S.done) { V.page = null; return; }
  const key = S.id + ':' + S.page;
  if (V.page !== null && V.page !== key && f - V.pageGrab < 12 && !(V.out0 !== null && V.d !== PAGE)) { V.d = PAGE; V.has = true; V.out0 = f - 1; V.in0 = f - 1 + PAGE.out; V.waitLoad = false; }
  V.page = key;
  if (f % 4 === 0 && V.out0 === null && grab(app)) V.pageGrab = f;   // (a clean copy of the page every 4 frames -- never while a dip darkens from its own)
}
/** last in App.render (game px, clipped to the frame) */
export function drawSceneVeil(ctx, app) {
  const f = app.frame;
  pageTurn(app, f);
  const D = V.d, vp = vOf(D.peak);
  let v = 0, snap = false;
  if (V.out0 !== null) {
    const t = f - V.out0;
    if (t < D.out) { snap = V.has; v = vp * (t + 1) / (D.out + 1); }
    else if (f < V.in0 && !V.waitLoad) v = vp;               // (an IN still to start)
    else V.out0 = null;                                       // (into the LOADING card: the card is up -- its own dark, no veil)
  }
  if (V.out0 === null && V.in0 !== null && !V.waitLoad) {
    const t = f - V.in0;
    if (t < 0) v = vp;
    else if (t < D.in) v = Math.max(v, vp * (1 - (t + 1) / (D.in + 1)));
    else V.in0 = null;
  }
  if (snap && V.snap) ctx.drawImage(V.snap, 0, 0, W, H);
  const a = aOf(v);
  if (a > 0.003) { ctx.save(); ctx.fillStyle = `rgba(${DARK[0]},${DARK[1]},${DARK[2]},${Math.min(1, a).toFixed(3)})`; ctx.fillRect(0, 0, W, H); ctx.restore(); }
}
/** (tests) the veil's state */
export function sceneVeilState() { return { out0: V.out0, in0: V.in0, quick: V.d === QUICK, page: V.d === PAGE, snap: !!V.snap, waitLoad: V.waitLoad }; }
