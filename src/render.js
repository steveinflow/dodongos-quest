// Character rendering with the white hit-flash (rendered through a small offscreen buffer only while flashing).
const BOX_W = 900, BOX_H = 560, FEET_X = 450, FEET_Y = 440;
let off = null, octx = null, offScale = 0;
let SIL = null;
/** an impact frame (game.js World.impact): every character drawn as a flat silhouette in this colour (null: off) */
export function setSilhouette(col) { SIL = col || null; }

// a colour wash over a character (a secret stage's recoloured enemy until its painted variant exists): its own small
// buffer, a box round the feet (TB_*), so the wash costs a fraction of the hit-flash buffer's fill
const TB_W = 460, TB_H = 440, TF_X = 230, TF_Y = 400;
let toff = null, tctx = null, tScale = 0;
export function drawTinted(ctx, sx, sy, flash, draw, wash) {
  if (!wash || SIL) { drawWithFlash(ctx, sx, sy, flash, draw); return; }
  const m = ctx.getTransform();
  const ds = Math.hypot(m.a, m.b) || 1;
  if (!toff || tScale !== ds) {
    toff = toff || document.createElement('canvas');
    toff.width = Math.ceil(TB_W * ds); toff.height = Math.ceil(TB_H * ds);
    tctx = toff.getContext('2d'); tScale = ds;
  }
  if (!tctx) { drawWithFlash(ctx, sx, sy, flash, draw); return; }   // (no buffer -- the iOS canvas cap: unwashed)
  tctx.setTransform(1, 0, 0, 1, 0, 0);
  tctx.clearRect(0, 0, toff.width, toff.height);
  tctx.setTransform(ds, 0, 0, ds, TF_X * ds, TF_Y * ds);
  draw(tctx);
  tctx.setTransform(1, 0, 0, 1, 0, 0);
  tctx.globalCompositeOperation = 'source-atop';
  tctx.fillStyle = wash; tctx.fillRect(0, 0, toff.width, toff.height);
  if (flash > 0.02) { tctx.fillStyle = `rgba(255,252,240,${Math.min(1, flash)})`; tctx.fillRect(0, 0, toff.width, toff.height); }
  tctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(toff, sx - TF_X, sy - TF_Y, TB_W, TB_H);
}

/** the flash and wash buffers let go (iOS: a stage change -- up to ~12 MB of backing store outside the canvas memory
 *  count, src/canvasmem.js); the next flash makes them again */
export function releaseFlash() {
  for (const c of [off, toff]) if (c) { c.width = 0; c.height = 0; }
  off = octx = null; offScale = 0; toff = tctx = null; tScale = 0;
}

/** draw(ctx) draws the character with its feet at (0, 0). */
export function drawWithFlash(ctx, sx, sy, flash, draw) {
  if (SIL) flash = 1;
  if (flash <= 0.02) { ctx.save(); ctx.translate(sx, sy); draw(ctx); ctx.restore(); return; }
  const m = ctx.getTransform();
  const ds = Math.hypot(m.a, m.b) || 1;
  if (!off || offScale !== ds) {
    off = off || document.createElement('canvas');
    off.width = Math.ceil(BOX_W * ds); off.height = Math.ceil(BOX_H * ds);
    octx = off.getContext('2d'); offScale = ds;
  }
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.clearRect(0, 0, off.width, off.height);
  octx.setTransform(ds, 0, 0, ds, FEET_X * ds, FEET_Y * ds);
  draw(octx);
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.globalCompositeOperation = 'source-atop';
  octx.fillStyle = SIL || `rgba(255,252,240,${Math.min(1, flash)})`;
  octx.fillRect(0, 0, off.width, off.height);
  octx.globalCompositeOperation = 'source-over';
  ctx.drawImage(off, sx - FEET_X, sy - FEET_Y, BOX_W, BOX_H);
}
