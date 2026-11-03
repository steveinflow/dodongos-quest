// MORVATH without his staff (stolen in phase 2): ./morvath.js drawn empty-handed -- the stand-in until the painted pack
// morvath_nostaff (idle, stagger, grab, hurt, shrink) lands.
import * as M from './morvath.js';

export const ANIM = M.ANIM;
export const HEIGHT = M.HEIGHT;
export const HURTBOX = M.HURTBOX;
export const META = { id: 'morvath_nostaff', name: 'MORVATH', height: M.HEIGHT };
export function draw(ctx, pose, o = {}) { M.draw(ctx, pose, { ...o, staff: false }); }
export const point = M.point;
