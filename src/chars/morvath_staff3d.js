// Morvath's staff, alone (Mystic Mountain's summit: the stolen staff the dragon blasts -- src/mmbosses.js StaffTarget),
// painted: tools/sprite3d/chars/morvath_staff.py -> assets/sprites/morvath_staff_painted/ (idle: the flame's flicker;
// break: the shaft snaps, the flame blows out).  No rig of its own: without its pack StaffTarget draws its stand-in.
import { mmArt } from './mm3d.js';

const M = await mmArt('morvath_staff', null);
export const { ANIM, META, ATLAS_SCALE, point, draw, EXPORTS } = M;
