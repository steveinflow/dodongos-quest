// MALACHAR (Skull Island's Skull Palace boss), toon-3D: tools/sprite3d/chars/malachar.py -> assets/sprites/malachar/ -- one gameplay atlas (0.75 / 1 / 2x), clips named as the code rig's (./malachar.js):
// idle talk laugh drift clap summon lightningWind lightning beamWind beamHold hurt stagger maskCrack shrink.  The code rig keeps `rise` and `point` (the stories' beats) and draws wherever the pack is not resident.
// Landmarks (point(pose, name)): orb, handL, fistR, mask, head, mouth, hem, chest.  Exports BOLT [152, -157] and BEAM [151, -147] (the staff orb as drawn at lightning frame 4 / beamHold).
// Drawn once 'malachar' is listed in src/chars.js SI_ART3D.
import * as RIG from './malachar.js';
import { mmArt } from './mm3d.js';

const M = await mmArt('malachar', RIG);
export const { ANIM, META, ATLAS_SCALE, point, draw, EXPORTS } = M;
export const HURTBOX = RIG.HURTBOX;
export const BOLT = RIG.BOLT, BEAM = RIG.BEAM;
