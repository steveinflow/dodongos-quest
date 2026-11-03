// The quests on the title (docs/MYSTIC_MOUNTAIN.md): DODONGO'S QUEST (Shadow Stories book three, the four stages, the
// secret stages and the sky duel: src/levels.js), MYSTIC MOUNTAIN (book one: src/mmlevels.js) and SKULL ISLAND (book two:
// src/silevels.js, docs/SKULL_ISLAND.md -- built in phases; its end card says "to be continued" until the last stage lands).  Each keeps its own save
// and stage progress (src/save.js keys); the secret forms unlocked -- Dragon Dodongo, the Archmage, Legend Shadow -- are
// shared (src/secrets.js reads Dodongo's Quest's meta whichever quest is on).  Mystic Mountain is the trio's story: no
// Scarlet, three players at most.
//   setQuest(id) switches the levels (src/levels.js levelAt / mainLevels / secretLevels), the save keys and the heroes;
//   the title's QUEST row calls it, and ?quest=mm picks it for a test URL.  Remembered in localStorage 'dq.quest'.
import { setSaveQuest } from './save.js';
import { useQuestLevels } from './levels.js';
import { SI_ENABLED } from './sienabled.js';   // (Skull Island is in the game only when Book Two ships, or ?si=1 / ?quest=si)
export { SI_ENABLED };

export const QUESTS = {
  dq: { id: 'dq', name: "DODONGO'S QUEST", book: 'BOOK 3', saga: 'The Dragon King Saga', heroes: ['dodongo', 'ana', 'shadow', 'scarlet'], maxPlayers: 4 },
  mm: { id: 'mm', name: 'MYSTIC MOUNTAIN', book: 'BOOK 1', saga: "The Trio's First Adventure", heroes: ['dodongo', 'ana', 'shadow'], maxPlayers: 4 },   // (four players: two may be the same hero)
  // (Book Two: Scarlet joins in stage 1's boss fight -- the select offers the trio there (L.noScarlet), four seats all the same
  //  (two players may be the same hero); she is a full hero from stage 2 on; the palace is the book's last stage: meta.cleared once it is won -- src/main.js levelCleared)
  si: { id: 'si', name: 'SKULL ISLAND', book: 'BOOK 2', saga: 'Scarlet and the Blue Gull', heroes: ['dodongo', 'ana', 'shadow', 'scarlet'], maxPlayers: 4 },
};
export const QUEST_ORDER = SI_ENABLED ? ['mm', 'si', 'dq'] : ['mm', 'dq'];      // (the title's order: the books in story order; Book Two's row only once it is switched on -- src/sienabled.js)

let cur = 'dq';
/** the quest being played (its levels, saves, heroes) */
export const quest = () => QUESTS[cur];
export const questId = () => cur;
export const isMM = () => cur === 'mm';
export const isSI = () => cur === 'si';
export function setQuest(id, remember = true) {
  cur = QUESTS[id] && (id !== 'si' || SI_ENABLED) ? id : 'dq';
  setSaveQuest(cur); useQuestLevels(cur);
  if (remember) { try { localStorage.setItem('dq.quest', cur); } catch { /* (no storage) */ } }
  return cur;
}
/** at boot: ?quest=mm|si|dq, else the quest last chosen on the title, else Dodongo's Quest */
export function initQuest() {
  let q = null;
  try { q = new URLSearchParams(location.search).get('quest'); } catch { /* */ }
  if (!QUESTS[q]) { try { q = localStorage.getItem('dq.quest'); } catch { q = null; } }
  return setQuest(QUESTS[q] && (q !== 'si' || SI_ENABLED) ? q : 'dq', false);
}
