// THE SWAMP ROOT (Skull Island Stage 3B, the Swamp of Despair): no code rig of its own -- the code art for a root is the bark
// Tentacle tube in src/sikraken.js (src/siswamp.js Root.PAL), and Root.draw falls back to it whenever the painted pack
// ('swamp_root', src/chars/swamp_root3d.js) is not resident.  This module is the stand-in CHARS.swamp_root loads when the
// pack is not listed (SI_ART3D) or the toon-3D art is off: it draws nothing and has no drawRoot, so Root draws its tube.
// Contract of the pack (tools/sprite3d/chars/swamp_root.py): clips up(t) hold(t) seg seg2 head knot; landmarks tip segL segR sgbL sgbR headB.
export const META = { id: 'swamp_root', name: 'ROOT', height: 250 };
const P = (part) => ({ part });
export const ANIM = { up: () => P('up'), hold: () => P('hold'), seg: P('seg'), seg2: P('seg2'), head: P('head'), knot: P('knot') };
export function point() { return null; }
export function draw() {}
