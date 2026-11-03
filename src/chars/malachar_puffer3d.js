// POOF, the pufferfish Malachar shrinks into, toon-3D: tools/sprite3d/chars/malachar_puffer.py -> assets/sprites/malachar_puffer/ (1x / 2x): puff idle bounce bowl.  The bowl clip draws the fishbowl round it
// (the code rig's o.bowl flag does the same).  Drawn once 'malachar_puffer' is listed in src/chars.js SI_ART3D; the code rig (./malachar_puffer.js) draws until then / where the pack is not resident.
import * as RIG from './malachar_puffer.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('malachar_puffer', RIG);
export const { ANIM, META, ATLAS_SCALE, point, EXPORTS } = M;
export const HURTBOX = RIG.HURTBOX;
// (the glass bowl is drawn by the rig's own two layers round the pack's fish: back = the water, front = the glass; a pose with no pack drawing is the rig's, which draws its own)
export function draw(ctx, pose, o = {}) {
  if (o.bowl && pose && pose.s3d >= 0.5) { RIG.drawBowl(ctx, o, 'back'); M.draw(ctx, pose, { ...o, bowl: false }); RIG.drawBowl(ctx, o, 'front'); } else M.draw(ctx, pose, o);
}
