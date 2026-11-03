// A secret form's art (src/heroes.js: ARCHMAGE ANASTASIA 'ana_archmage', LEGEND SHADOW 'shadow_legend', PIRATE QUEEN
// SCARLET 'scarlet_pirate'): its hero's art module behind the hero contract, drawn from the form's own painted atlas --
// an outfit recolour of the hero's render: the same clips and drawings, so the hero's poses index it -- where that atlas
// is in (and has the clip); else the hero's own drawing under a placeholder colour wash (the runtime tint, until the
// painted pack lands).  Built at boot by src/chars.js.
import { spriteArt } from '../sprite3d.js';

const TB_W = 470, TB_H = 470, TF_X = 235, TF_Y = 440;   // (the offscreen box round the feet, local px)
let off = null, octx = null, oScale = 0;
/** draw(ctx) under a colour wash, at the current transform (feet at 0, 0): drawn into a box, washed (source-atop),
 * drawn back -- no buffer (the iOS canvas cap): unwashed */
function washed(ctx, draw, wash) {
  const m = ctx.getTransform(), ds = Math.min(3, Math.hypot(m.a, m.b) || 1);
  if (!off || oScale !== ds) {
    try {
      off = off || document.createElement('canvas');
      off.width = Math.ceil(TB_W * ds); off.height = Math.ceil(TB_H * ds);
      octx = off.getContext('2d'); oScale = ds;
    } catch { octx = null; }
  }
  if (!octx) { draw(ctx); return; }
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.clearRect(0, 0, off.width, off.height);
  octx.setTransform(ds, 0, 0, ds, TF_X * ds, TF_Y * ds);
  draw(octx);
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.globalCompositeOperation = 'source-atop';
  octx.fillStyle = wash; octx.fillRect(0, 0, off.width, off.height);
  octx.globalCompositeOperation = 'source-over';
  ctx.drawImage(off, -TF_X, -TF_Y, TB_W, TB_H);
}

/** base: the hero's art module (CHARS.ana ...); name: the form's atlas ('ana_archmage'); wash: the placeholder tint */
export async function make(base, name, wash) {
  let FA = null;
  try { FA = await spriteArt(name, { fallback: null, extraPacks: ['move'] }); } catch { FA = null; }   // (extraPacks: ['move']: the form's own movement-clip pack)
  const has = !!(FA && FA.ATLAS_SCALE);
  const draw = (ctx, pose, o = {}) => {
    if (!base?.draw) return;
    if (has && pose && pose.s3d >= 0.5 && FA.clipInfo?.(pose.clip)) { FA.draw(ctx, pose, o); return; }
    washed(ctx, (c) => base.draw(c, pose, o), wash);
  };
  // (hasNow: the form's own pack for the clip is decoded -- src/player.js hasClip gates painter 3's hooks on it; the form's
  //  atlas, not the hero's, whose packs a form's scene never decodes)
  const hasNow = (k) => (has && FA.clipInfo?.(k) ? !!FA.hasNow?.(k) : !!base?.hasNow?.(k));
  return Object.assign({}, base, { draw, hasNow, FORM_ART: has, FORM_ATLAS: name });
}
