// Shadow, 3D-rendered cel sprites (loaded instead of ./shadow.js with ?art3d=1; see src/chars.js, docs/SPRITE3D.md).
// The atlas is built by tools/sprite3d (chars/shadow.py); any ANIM key without a rendered clip falls back to the code rig.
// One view (facing right, the sword arm near the camera), mirrored when he faces left, like the rig.
import * as RIG from './shadow.js';
import { spriteArt } from '../sprite3d.js';
import { HEROES } from '../heroes.js';

export * from './shadow.js';            // drawShuriken (the engine's shuriken projectiles), BASE, mix ... (locals win)
const A = await spriteArt('shadow', { fallback: RIG, carryStride: 75, extraPacks: ['move'] });   // (extraPacks: ['move']: painter 3's movement clips, their own pack)
export const { META, SHOOT_ORIGIN, CARRY_POINT, ATLAS_SCALE, point3d, WALK_STRIDE, RUN_STRIDE, CARRY_STRIDE, hasNow, EXPORTS } = A;   // (EXPORTS: the atlas' DODGE_BACK_V -- the handspring's own back-dodge, src/player.js dodging; painter 3)

// SHADOW STRIKE: he vanishes from k .15 to .80 (the engine hides him and draws the slash streaks); a rendered special
// returns hide: true there, so nothing is drawn even where the engine's own `hidden` does not apply (menus, sheets)
const SP = HEROES.shadow.special;
export const ANIM = Object.assign({}, A.ANIM);
if (typeof A.ANIM.special === 'function' && A.ANIM.special(0).s3d) {
  const f = A.ANIM.special;
  ANIM.special = (k) => (k > SP.key && k < SP.until ? Object.assign({}, f(k), { hide: true }) : f(k));
}

// after a sword move ends in the idle, the sword is sheathed: the rendered 'sheathe' clip plays once (from o.mem)
// before the idle drawings (walking or anything else cancels it)
const SWORD_CLIPS = new Set(['atk1', 'atk2', 'atk3', 'atk4', 'runAtk']);
const SHEATHE_FRAMES = 16;              // chars/shadow.py SHEATHE_DUR

/** Draw with the feet at (0, 0) (docs/CONTRACTS.md).  hide: nothing (the Shadow Strike vanish). */
export function draw(ctx, pose, o = {}) {
  if (pose && pose.hide) return;
  let p = pose;
  const m = o.mem;
  if (m && p && p.s3d >= 0.5 && typeof A.ANIM.sheathe === 'function' && A.ANIM.sheathe(0).s3d) {
    if (SWORD_CLIPS.has(p.clip)) { m.s3dSword = true; m.s3dSheathe = -1; }
    else if (m.s3dSword) {
      if (p.clip === 'idle') {
        if (!(m.s3dSheathe >= 0)) m.s3dSheathe = o.t || 0;
        const k = ((o.t || 0) - m.s3dSheathe) * 60 / SHEATHE_FRAMES;
        if (k < 1) p = A.ANIM.sheathe(k); else m.s3dSword = false;
      } else m.s3dSword = false;
    }
  }
  A.draw(ctx, p, o);
}
