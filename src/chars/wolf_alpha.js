// THE WOLF PACK's alpha (Mystic Mountain): the shadow wolf's code rig drawn as the pack leader -- big, a heavier ruff,
// ember eyes (./shadow_wolf.js o.alpha) -- the stand-in until its own painted pack (wolf_alpha: the shadow wolf's clips +
// howl(k), a bulkier model drawn native at its size) lands.  At scale 1 it is about the pack's size (~200 px tall).
import * as W from './shadow_wolf.js';

export const ANIM = W.ANIM;
export const HURTBOX = { x: 10, w: 150, h: 160 };
export const META = { id: 'wolf_alpha', name: 'WOLF ALPHA', height: 200 };
const RIG_SCALE = 2.3;
export function draw(ctx, pose, o = {}) { W.draw(ctx, pose, { ...o, alpha: true, scale: (o.scale || 1) * RIG_SCALE }); }
/** a landmark (local px, scale 1): the jaws, or the head (between the ears -- where its stun stars circle) */
export function point(pose, name) {
  if (name === 'mouth') return [W.MOUTH[0] * RIG_SCALE, W.MOUTH[1] * RIG_SCALE];
  if (name === 'head') return [(W.MOUTH[0] - 18) * RIG_SCALE, (W.MOUTH[1] - 21) * RIG_SCALE];
  return null;
}
