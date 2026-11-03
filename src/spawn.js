// One place that knows every enemy kind (avoids an import cycle between the two enemy files).
import { Kobold, Whelp, Brute, Grimscale } from './enemies.js';
import { Salamander, Wyvern, Guard, Magmaw, Tempest, DragonKing } from './enemies2.js';
import { BruteChief, WyvernAlpha } from './minibosses.js';
import { CurseWraith } from './wraith.js';
import { ShadowWolf, CliffBat, StormCrow, Snowman, MMImp, Knight } from './mmfoes.js';
import { WolfAlpha, StoneTroll, IceWyvern, RubyGem, Morvath } from './mmbosses.js';
import { Sailor } from './sifoes.js';
import { StormCrab, CollarImp } from './sifoes2.js';
import { Blunderbeard, BlunderbeardRematch } from './sibosses.js';
import { Kraken } from './sikraken.js';
import { RageBeast, RageAlpha } from './sirage.js';
import { SwampTree, ElderTree } from './siswamp.js';
import { SlothSlime, SlothBeast } from './sicell.js';
import { SadCloud, FearShade, SlothLump, Malachar } from './sipalace.js';
import { Leviathan } from './sileviathan.js';

export function makeEnemy(game, kind, x, y, opt = {}) {
  switch (kind) {
    case 'kobold': return new Kobold(game, x, y, opt);
    case 'whelp': return new Whelp(game, x, y, opt);
    case 'brute': return new Brute(game, x, y, opt);
    case 'boss': case 'grimscale': return new Grimscale(game, x, y, opt);
    case 'salamander': return new Salamander(game, x, y, opt);
    case 'wyvern': return new Wyvern(game, x, y, opt);
    case 'guard': return new Guard(game, x, y, opt);
    case 'magmaw': return new Magmaw(game, x, y, opt);
    case 'tempest': return new Tempest(game, x, y, opt);
    case 'dragonking': return new DragonKing(game, x, y, opt);
    // the secret stages' mini-bosses (src/minibosses.js); the Curse Wraith's stand-in until it's built
    case 'chief': return new BruteChief(game, x, y, opt);
    case 'alpha': return new WyvernAlpha(game, x, y, opt);
    case 'wraith': return new CurseWraith(game, x, y, opt);
    // Mystic Mountain (docs/MYSTIC_MOUNTAIN.md: src/mmfoes.js, src/mmbosses.js)
    case 'wolf': return new ShadowWolf(game, x, y, opt);
    case 'bat': return new CliffBat(game, x, y, opt);
    case 'crow': return new StormCrow(game, x, y, opt);
    case 'snowman': return new Snowman(game, x, y, opt);
    case 'imp': return new MMImp(game, x, y, opt);
    case 'knight': return new Knight(game, x, y, opt);
    case 'wolfpack': return new WolfAlpha(game, x, y, opt);
    case 'troll': return new StoneTroll(game, x, y, opt);
    case 'icewyvern': return new IceWyvern(game, x, y, opt);
    case 'gem': return new RubyGem(game, x, y, opt);
    case 'morvath': return new Morvath(game, x, y, opt);
    // Skull Island (docs/SKULL_ISLAND.md: src/sifoes.js, src/sibosses.js)
    case 'sailor': return new Sailor(game, x, y, opt);
    case 'blunderbeard': return new Blunderbeard(game, x, y, opt);
    case 'blunderbeard_rematch': return new BlunderbeardRematch(game, x, y, opt);   // (the Treasure Room: src/sisecrets.js)
    case 'crab': return new StormCrab(game, x, y, opt);
    case 'collarimp': return new CollarImp(game, x, y, opt);
    case 'kraken': return new Kraken(game, x, y, opt);
    case 'ragebeast': return new RageBeast(game, x, y, opt);
    case 'ragealpha': return new RageAlpha(game, x, y, opt);
    case 'swamptree': return new SwampTree(game, x, y, opt);
    case 'sapling': return new SwampTree(game, x, y, { ...opt, small: true });
    case 'elder': return new ElderTree(game, x, y, opt);
    case 'slime': return new SlothSlime(game, x, y, opt);
    case 'slothbeast': return new SlothBeast(game, x, y, opt);
    case 'sadcloud': return new SadCloud(game, x, y, opt);
    case 'fearshade': return new FearShade(game, x, y, opt);
    case 'slothlump': return new SlothLump(game, x, y, opt);
    case 'malachar': return new Malachar(game, x, y, opt);
    case 'leviathan': return new Leviathan(game, x, y, opt);   // (Stage 1's night-deck mini-boss: src/sileviathan.js)
  }
  throw new Error('unknown enemy ' + kind);
}
