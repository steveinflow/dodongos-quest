// THE KRAKEN's EYED TENTACLE (Skull Island Stage 2, the reworked fight), toon-3D: the painted builder's 'kraken_tentacle' pack
// (assets/sprites/kraken_tentacle/, 1x / 2x): popUp idle slapWind slap sweepWind sweep grab hold hurt wilt, anchored at the base (the middle
// of its hole in the deck), facing R (mirrored).  Landmarks: tip eye base hold.  Exports SLAP_TIP (the tip at the slap's hit) and HOLD (a held
// hero's spot).  The code rig (./kraken_tentacle.js) draws wherever the pack is not resident.  Drawn once 'kraken_tentacle' is in SI_ART3D.
import * as RIG from './kraken_tentacle.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('kraken_tentacle', RIG);
export const { ANIM, META, ATLAS_SCALE, point, draw, EXPORTS } = M;
export const HURTBOX = RIG.HURTBOX;
export const SLAP_TIP = (EXPORTS && EXPORTS.SLAP_TIP) || RIG.SLAP_TIP;
export const HOLD = (EXPORTS && EXPORTS.HOLD) || (M.ATLAS_SCALE && point(ANIM.hold ? ANIM.hold(0) : null, 'hold')) || RIG.HOLD;
