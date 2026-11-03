// Royal Drake Guard, 3D-rendered sprites (loaded instead of ./guard.js with ?art3d=1 once 'guard' is in ART3D_NAMES; see
// src/chars.js, docs/SPRITE3D.md).  Model: assets-src/guard/, built by tools/sprite3d/models/guard_build.py on the
// shared lizard-folk rig; atlas: assets/sprites/guard/, rendered by tools/sprite3d chars/guard.py.
//
// Clips: idle, guard, taunt (t), walk (ph), block, bashWind, bash, thrustWind, thrust, guardBreak, hurt, hurt2, getup (k),
// fly, down -- every key Guard.pose() samples (src/enemies2.js) plus the cutscene taunt.  Keys without a rendered clip
// fall back to the code rig.  Rendered facing right and mirrored (unhanded, like the rig).
// Engine points: src/enemies2.js reads HURTBOX (the body box, also the shield-post box); it comes from ./guard.js (the
// 3D model is built to the rig's proportions).  SPEAR_TIP / BASH_POINT / GUARD_SHIELD are measured on the 3D drawings
// at the frames the rig measures them (the thrust and bash contacts, the guard stance), the rig's until the atlas exists.
import * as RIG from './guard.js';
import { spriteArt } from '../sprite3d.js';

export * from './guard.js';              // BASE, measure, HEIGHT, HURTBOX ... (local exports win)

const A = await spriteArt('guard', { fallback: RIG });
export const { META, ATLAS_SCALE } = A;

// The 2D tells the drawings can't carry, drawn over the sprite at the 3D landmarks and timed by the code rig's own
// values (guard.js): the shield's crown sigil flaring at the end of the bash wind-up (sflash) and the spear tip
// glinting before the thrust (glint).
const TELLS = { bashWind: 'sflash', thrustWind: 'glint' };
export const ANIM = Object.assign({}, A.ANIM);
for (const [key, prop] of Object.entries(TELLS)) {
  const spr = A.ANIM[key], rig = RIG.ANIM[key];
  if (typeof spr !== 'function' || typeof rig !== 'function') continue;
  ANIM[key] = (k) => { const p = spr(k); if (p && p.s3d >= 0.5) p[prop] = rig(k)[prop] || 0; return p; };
}
// the flare carries into the bash: held full through its first ticks (st 0-5 of 22, up to the contact at st 6) and
// gone by the contact, so the white-hot core is up for ~8 ticks, not 2 (readtech N7-3)
const HOLD0 = 5 / 22, HOLD1 = 6 / 22;
if (typeof A.ANIM.bash === 'function') {
  const spr = A.ANIM.bash;
  ANIM.bash = (k) => {
    const p = spr(k);
    if (p && p.s3d >= 0.5) p.sflash = k <= HOLD0 ? 1 : Math.max(0, (HOLD1 - k) / (HOLD1 - HOLD0));
    return p;
  };
}
const GLOW_A = (a) => `rgba(92,255,126,${a})`, GEM_C = '#eaffdf';     // (the glow: guard.js C.glow #5cff7e)

/** Draw with the feet at (0, 0) (docs/CONTRACTS.md); sprite poses get the sigil flare and the tip glint on top. */
export function draw(ctx, pose, o = {}) {
  A.draw(ctx, pose, o);
  if (!pose || !(pose.s3d >= 0.5) || !(pose.sflash > 0.01 || pose.glint > 0.05)) return;
  const f = o.facing || 1, S = o.scale || 1, T = o.t || 0;
  const at = (lm) => { const q = A.point3d(pose, lm); return q ? [q[0] * f * S, q[1] * S] : null; };
  ctx.save();
  if (pose.sflash > 0.01) {           // guard.js sigil(): the glow swells round the crown, which turns white-hot
    // centred on the painted crown emblem: 27 px over the shield face's boss ('bash', on the face -- the 'shield'
    // empty sits mid-thickness, ~6 px off the emblem sideways); measured in bashWind st 16 and 20, within 2 px
    const c = at('bash') || at('shield');
    if (c) {
      const fl = pose.sflash, R = (25 + 11.5 * fl) * S, y = c[1] - 27 * S;
      // an additive radial glow peaking at ~0.7 (readtech N7-3; a flat 0.7 fill hid the crown): the painted crown
      // under it burns white-hot and keeps its shape
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, fl * (0.58 + 0.12 * (0.85 + 0.15 * Math.sin(T * 4))));
      ctx.translate(c[0], y); ctx.scale(0.62, 1);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, GLOW_A(1)); g.addColorStop(0.5, GLOW_A(0.75)); g.addColorStop(1, GLOW_A(0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (fl > 0.5) {
        ctx.globalAlpha = (fl - 0.5) * 2; ctx.fillStyle = GEM_C;
        ctx.beginPath(); ctx.ellipse(c[0], y, 5 * S, 9 * S, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  if (pose.glint > 0.05) {            // guard.js spear(): an 8-point white star just behind the tip
    const tp = at('tip'), md = at('mid');
    if (tp) {
      const ang = md ? Math.atan2(tp[1] - md[1], tp[0] - md[0]) : (f > 0 ? 0 : Math.PI);
      const g = pose.glint, r = (6 + 8 * g * (0.8 + 0.2 * Math.sin(T * 22))) * S;
      const x0 = tp[0] - Math.cos(ang) * 4 * S, y0 = tp[1] - Math.sin(ang) * 4 * S;
      ctx.globalAlpha = Math.min(1, g); ctx.fillStyle = '#ffffff'; ctx.beginPath();
      for (let j = 0; j < 8; j++) {
        const rr = j % 2 ? r * 0.22 : r, aa = ang + j * Math.PI / 4 + 0.4;
        const x = x0 + Math.cos(aa) * rr, y = y0 + Math.sin(aa) * rr;
        if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();
}
export { draw as drawGuard };

const at = (key, k, lm) => {
  const f = A.ANIM[key];
  return typeof f === 'function' ? A.point3d(f(k), lm) : null;
};
const r2 = (p) => (p ? p.map((c) => Math.round(c)) : null);
export const SPEAR_TIP = r2(at('thrust', 7 / 24, 'tip')) || RIG.SPEAR_TIP;              // thrust contact (hit st 7..13)
export const BASH_POINT = r2(at('bash', 6 / 22, 'bash')) || RIG.BASH_POINT;             // bash contact (hit st 6..11)
export const GUARD_SHIELD = r2(at('guard', 0, 'shield')) || RIG.GUARD_SHIELD;          // shield centre in the guard stance
