// THE STORM BAT (Skull Island's Storm Sea ride, AA QA A5), painted: tools/sprite3d/chars/storm_bat_painted.py -> assets/sprites/storm_bat/
// (1x / 2x) -- the Book 1 cliff bat's paint recoloured for the night storm (dark slate-violet fur, glowing violet wings, yellow eyes).
// Clips (the cliff bat's): fly(t) swoop(k) hurt(k) fly_knock(k) down(k) getup(k); anchored bottom-centre (the body ~40 px above it at
// scale 1), facing R (mirrored: not handed).  Until the pack is in -- and for any clip it lacks -- the cliff bat's code rig (./cliff_bat.js).
// Listed in src/chars.js SI_ART3D; the ride asks for 'storm_bat' in its art set (src/stormride.js).
import * as RIG from './cliff_bat.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('storm_bat', RIG);
export const { ANIM, META, ATLAS_SCALE, point, draw } = M;
export const HURTBOX = RIG.HURTBOX;
