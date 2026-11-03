// THE KRAKEN's HEAD + collar (Skull Island Stage 2), toon-3D: the painted builder's 'kraken_head' pack (assets/sprites/kraken_head/, 0.75x / 1x):
// rise(k) idle(t) roar(k) stunned(k) dizzy(t) hurt(k) recover(k) collapse(k) freed(t), anchored at the RAIL LINE (screen y 304 on the Kraken
// stage), its arms draped over the rail onto the deck.  Landmarks: eyeL eyeR gem crown chin.  No code rig: while the pack is not resident the
// stage draws its own head (src/stages/sikraken.js drawKraken); when it is, the boss draws this one in its floor pass (src/sikraken.js
// Kraken.drawFloor) and hands the stage no head.  Listed in src/chars.js SI_ART3D.
import { mmArt } from './mm3d.js';

const M = await mmArt('kraken_head', null);
export const { ANIM, META, ATLAS_SCALE, point, draw, EXPORTS } = M;
export const HURTBOX = { x: 0, w: 230, h: 260 };
