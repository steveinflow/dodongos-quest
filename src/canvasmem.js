// Canvas memory on iOS / iPadOS WebKit (every browser on an iPad): the backing stores of all canvases and ImageBitmaps
// share one cap (~384 MB on many iPads, less on older ones).  Past it a new canvas gets no 2D context -- or one that
// silently draws nothing -- and the console's "Total canvas memory use exceeds the maximum limit" is all that's said.
// On desktop WebKit / Chromium there's no such cap, which is why a stage could draw black only on the iPad.
//
//   IOS          iPadOS reports itself as a Mac with touch: maxTouchPoints > 1 and Mac / iPhone / iPad (?ios=1 / ?ios=0
//                forces it, for tests)
//   STAGE_CS     the stage caches' scale caps: near layers / far layers (iOS: 1.5 / 1, else 2 / 1.5)
//   cacheCanvas  a cache canvas with its 2D context, or null when it can't be had (no context; on iOS a test pixel that
//                doesn't read back) -- reported once to the game's error ring (shown in the pause menu)
//   layerCanvas  the same at a scale, retried down a ladder of lower scales before giving up
//   ?canvascap=<MB> stubs the cap for tests: a cache canvas that would take the caches still held (freed ones given
//                back, as iOS does) past that many MB gets no context
//   PRESSURE     after a refusal, later layers start lower down the scale ladder (a small canvas almost always fits);
//                memory freed in bulk eases it again
//   liveCanvas   the last resort, painted each draw -- into a scratch canvas reserved at boot, then copied: a paint that
//                composites (destination-in / -out, source-atop ...) never touches the frame itself
const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
export const IOS = Q.has('ios') ? Q.get('ios') !== '0'
  : typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1 && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
export const STAGE_CS = IOS ? { near: 1.5, far: 1 } : { near: 2, far: 1.5 };
const CAP = +(Q.get('canvascap') || 0) * 1048576;

/** the cache canvases made so far: px (w x h, all of them -- a stage's rebuilt caches count again), n, fails */
export const CANVAS_MEM = { px: 0, live: 0, n: 0, fails: 0, first: '' };
const SIZE = new WeakMap();   // a cache canvas -> the px it holds (given back to `live` by freeCanvases)
let PRESSURE = 0;             // refusals so far (up to 3): later layers start that many rungs down the ladder
/** the first failure, reported now that the game's error ring is up (main.js) */
export function reportCanvasFailure() { if (CANVAS_MEM.first && !reported && globalThis.DQ?.reportError) { reported = true; globalThis.DQ.reportError(new Error(CANVAS_MEM.first), 'canvas memory'); } }
let reported = false;
function fail(w, h, why) {
  CANVAS_MEM.fails++; PRESSURE = Math.min(3, PRESSURE + 1);
  if (typeof console !== 'undefined') console.warn(`canvas ${w}x${h} not allocated (${why})`);
  // (once a session: the pause menu's error line, for a screenshot from the iPad; before the game's error ring is up --
  //  a level loaded at boot -- it waits in CANVAS_MEM.first: main.js reports it then)
  if (!CANVAS_MEM.first) CANVAS_MEM.first = `canvas ${w}x${h} not allocated (${why}; ${Math.round(CANVAS_MEM.px * 4 / 1048576)} MB of caches made)`;
  if (!reported && globalThis.DQ?.reportError) { reported = true; try { globalThis.DQ.reportError(new Error(CANVAS_MEM.first), 'canvas memory'); } catch { /* */ } }
  return null;
}
let PROBE;   // (the iOS read-back's own 1 x 1 canvas: cacheCanvas)
function probeCtx() {
  if (PROBE === undefined) {
    PROBE = null;
    try { const p = document.createElement('canvas'); p.width = p.height = 1; PROBE = p.getContext('2d', { willReadFrequently: true }) || null; } catch { PROBE = null; }
  }
  return PROBE;
}
/** a canvas w x h (device px) and its 2D context -- or null when the memory cap refuses it */
export function cacheCanvas(w, h) {
  if (IOS) probeCtx();     // (made with the first cache, while memory is free)
  w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
  if (CAP && (CANVAS_MEM.live + w * h) * 4 > CAP) return fail(w, h, 'test cap');
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  let g = null;
  try { g = c.getContext('2d'); } catch { g = null; }
  if (g && IOS) {        // (iOS can hand out a context that draws nothing: one pixel written and read back)
    // (read back through PROBE, a 1 x 1 canvas made while memory was free: WebKit logs a console error -- "Unable to get
    //  image data from canvas" -- for a getImageData on a canvas that has no pixels; a drawImage from one draws nothing)
    try {
      g.fillStyle = '#010203'; g.fillRect(0, 0, 1, 1);
      const P = probeCtx();
      let d;
      if (P) { P.clearRect(0, 0, 1, 1); P.drawImage(c, 0, 0, 1, 1, 0, 0, 1, 1); d = P.getImageData(0, 0, 1, 1).data; }
      else d = g.getImageData(0, 0, 1, 1).data;
      if (d[0] !== 1 || d[1] !== 2 || d[2] !== 3) g = null; else g.clearRect(0, 0, 1, 1);
    } catch { g = null; }
  }
  if (!g) { c.width = c.height = 1; return fail(w, h, 'no 2D context: memory cap'); }
  CANVAS_MEM.px += w * h; CANVAS_MEM.live += w * h; CANVAS_MEM.n++; SIZE.set(c, w * h);
  return { c, g };
}
/** a layer w x h (logical px) at scale sc: { c, g, sc } -- sc lowered (2 -> 1.5 -> 1 -> 0.5 -> 0.25) until a canvas is had;
 * null if none could be */
export function layerCanvas(w, h, sc) {
  const full = [sc, ...[1.5, 1, 0.5, 0.25].filter((s) => s < sc - 1e-6)];
  const ladder = full.slice(Math.min(PRESSURE, full.length - 1));   // (under pressure: start lower -- small canvases fit)
  for (const s of ladder) { const r = cacheCanvas(w * s, h * s); if (r) return { c: r.c, g: r.g, sc: s }; }
  return null;
}
/** an empty 1 x 1 canvas: what a cache that couldn't be had draws (nothing) */
export function blankCanvas() { const c = document.createElement('canvas'); c.width = c.height = 1; return c; }
/** shrink every canvas in a cache object (nested objects / arrays / Maps) to 1 x 1: its memory goes back at once */
export function freeCanvases(o, seen = new Set()) {
  if (!o || typeof o !== 'object' || seen.has(o)) return;
  const top = seen.size === 0, live0 = CANVAS_MEM.live;
  seen.add(o);
  const give = (c) => { const n = SIZE.get(c); if (n) { CANVAS_MEM.live -= n; SIZE.delete(c); } };
  if (typeof HTMLCanvasElement !== 'undefined' && o instanceof HTMLCanvasElement) { give(o); o.width = o.height = 1; return; }
  if (typeof OffscreenCanvas !== 'undefined' && o instanceof OffscreenCanvas) { give(o); o.width = o.height = 1; return; }
  for (const v of o instanceof Map ? o.values() : Object.values(o)) freeCanvases(v, seen);
  if (top && (live0 - CANVAS_MEM.live) * 4 > 8 * 1048576) PRESSURE = Math.max(0, PRESSURE - 1);   // (a stage's caches given back: ease off)
}
/** the scratch a live paint goes through: reserved at boot, so the cap never refuses it (false: none could be had) */
let SCR = null, SCR_BUSY = false;
function scratch() {
  if (SCR !== null) return SCR;
  try { const c = document.createElement('canvas'); c.width = 1280; c.height = 720; const g = c.getContext('2d'); SCR = g ? { c, g } : false; } catch { SCR = false; }
  return SCR;
}
if (typeof document !== 'undefined') scratch();
/** a cache that couldn't be had, painted LIVE instead: a 1 x 1 canvas carrying paint(g) for its vw x vh device px --
 * drawImage (patched below) runs the paint, mapped where the cache's pixels would have gone.  Slower, never missing. */
export function liveCanvas(vw, vh, paint) { const c = blankCanvas(); c.__live = { vw, vh, paint }; return c; }
(function patchDrawImage() {
  const protos = [typeof CanvasRenderingContext2D !== 'undefined' && CanvasRenderingContext2D.prototype,
    typeof OffscreenCanvasRenderingContext2D !== 'undefined' && OffscreenCanvasRenderingContext2D.prototype].filter(Boolean);
  for (const P of protos) {
    const di = P.drawImage;
    if (!di || di.__live) continue;
    const w = function (img, ...a) {
      const L = img && img.__live;
      if (!L) return di.call(this, img, ...a);
      // (painted into the scratch -- scaled to fit it -- and copied: the paint's own compositing stays in the scratch)
      const S = !SCR_BUSY && scratch();
      if (S) {
        SCR_BUSY = true;
        const k = Math.min(1, S.c.width / L.vw, S.c.height / L.vh), sw0 = Math.max(1, Math.ceil(L.vw * k)), sh0 = Math.max(1, Math.ceil(L.vh * k));
        const g = S.g;
        g.save();
        try {
          g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, sw0 + 2, sh0 + 2);
          g.beginPath(); g.rect(0, 0, sw0, sh0); g.clip(); g.setTransform(k, 0, 0, k, 0, 0);
          L.paint(g);
        } finally { g.restore(); SCR_BUSY = false; }
        if (a.length >= 8) { const [sx, sy, sw, sh, dx, dy, dw, dh] = a; return di.call(this, S.c, sx * k, sy * k, sw * k, sh * k, dx, dy, dw, dh); }
        const [dx, dy, dw = L.vw, dh = L.vh] = a;
        return di.call(this, S.c, 0, 0, sw0, sh0, dx, dy, dw, dh);
      }
      this.save();
      try {
        if (a.length >= 8) { const [sx, sy, sw, sh, dx, dy, dw, dh] = a; this.beginPath(); this.rect(dx, dy, dw, dh); this.clip(); this.translate(dx, dy); this.scale(dw / sw, dh / sh); this.translate(-sx, -sy); }
        else { const [dx, dy, dw = L.vw, dh = L.vh] = a; this.translate(dx, dy); this.scale(dw / L.vw, dh / L.vh); }
        L.paint(this);
      } finally { this.restore(); }
    };
    w.__live = di;
    P.drawImage = w;
  }
})();
