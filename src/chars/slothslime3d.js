// The small SLOTH SLIME (Skull Island's Cell of Sloth), toon-3D: tools/sprite3d/chars/sloth_slime.py -> assets/sprites/sloth_slime/ (1x only): idle crawl windup leap land hurt fly down getup splat.  Landmarks: mouth, eyes,
// top, ankleL/R, hips.  Export LEAP [23, -11].  The body stays put in 'leap': src/sicell.js moves it along the arc.  The last 'splat' drawing is a flat blob ~153 px wide (the puddle it leaves is sized to match).
// The Sloth Beast stays on the code rig (art 'slime', ./slime.js).
import * as RIG from './slothslime.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('sloth_slime', RIG);
export const { ANIM, META, ATLAS_SCALE, point, draw, EXPORTS } = M;
export const HURTBOX = RIG.HURTBOX;
