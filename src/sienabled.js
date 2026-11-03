// THE SWITCH for Skull Island (Book Two, docs/SKULL_ISLAND.md): is the book part of the game this session?
//   SI_SHIPPED  false until Book Two is released (the release flow flips it -- nobody else): with it false a build of this tree
//               shows Book One and Book Three only -- the title's QUEST row is Book 1 <-> Book 3 and Book One's own words (its
//               epilogue's last caption, its end card) still point on to Dodongo's Quest, as they always did.
//   ?si=1 or ?quest=si   turn it on for one page load (testing: tools/si_clip.mjs, tools/soak.mjs DQ_QUEST=si ...).
// No imports (src/quests.js, src/story.js and src/hud.js read it; node tools import those too).
const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
export const SI_SHIPPED = true;
export const SI_ENABLED = SI_SHIPPED || Q.get('si') === '1' || Q.get('quest') === 'si';
