// Captain Blunderbeard (Skull Island stage 1's boss; the Kraken's dangling captain), toon-3D: assets/sprites/blunderbeard/ -- one gameplay atlas
// (0.75 / 1 / 2x, one view mirrored), clips named as the code rig's: idle walk laugh lungeWind lunge slashWind slash whistleWind whistle hurt stagger
// clash disarmed conchWind conch down.  The cutlass, the conch and the face are baked per clip (the sword shows in every clip but disarmed, conchWind
// and conch); `flee` is the walk at double phase.  Landmarks (point(pose, name)): tip, mid, hand, conch, conchBelt, ring, head, mouth, handL.
// Drawn once 'blunderbeard' is listed in src/chars.js SI_ART3D; until then -- and for any clip its pack lacks (the 'shock' beat) -- ./blunderbeard.js.
import * as RIG from './blunderbeard.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('blunderbeard', RIG);
export const { META, ATLAS_SCALE, point, draw, EXPORTS } = M;
export const HURTBOX = RIG.HURTBOX;
export const SWORD_TIP = RIG.SWORD_TIP;
// (flee: the walk at double phase, as in the rig -- the pack has no clip of its own)
export const ANIM = M.ATLAS_SCALE && M.ANIM.walk ? { ...M.ANIM, flee: (ph) => M.ANIM.walk(((ph * 2) % 1 + 1) % 1) } : M.ANIM;
