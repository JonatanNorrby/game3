import { Golem } from './golem/Golem.js';
import { GOLEM_CONFIG } from './golem/config.js';
import { Bellkeeper } from './bellkeeper/Bellkeeper.js';
import { BELLKEEPER_CONFIG } from './bellkeeper/config.js';
import { Astronomer } from './astronomer/Astronomer.js';
import { ASTRONOMER_CONFIG } from './astronomer/config.js';
import { FurnaceHeart } from './furnace-heart/FurnaceHeart.js';
import { FURNACE_HEART_CONFIG } from './furnace-heart/config.js';
import { Choir } from './choir/Choir.js';
import { CHOIR_CONFIG } from './choir/config.js';

// Boss progression lives here. Each entry exposes its config so the game can
// configure arena dimensions before spawning the player or boss.
export const BOSS_ROSTER = [
  {
    id: GOLEM_CONFIG.id,
    name: GOLEM_CONFIG.name,
    description: 'A fundamentals encounter built around raid damage, telegraphed movement checks, and healing pressure.',
    unlocked: true,
    unlockRequirement: null,
    config: GOLEM_CONFIG,
    BossClass: Golem,
  },
  {
    id: BELLKEEPER_CONFIG.id,
    name: BELLKEEPER_CONFIG.name,
    description: 'Silence four encounter bells in the correct order while their modifiers reshape casts, projectiles, movement space, and damage pressure.',
    unlocked: true,
    unlockRequirement: null,
    config: BELLKEEPER_CONFIG,
    BossClass: Bellkeeper,
  },
  {
    id: ASTRONOMER_CONFIG.id,
    name: ASTRONOMER_CONFIG.name,
    description: 'Trace illuminated constellation stars in order to interrupt catastrophic casts while the star map begins rotating beneath the fight.',
    unlocked: true,
    unlockRequirement: null,
    config: ASTRONOMER_CONFIG,
    BossClass: Astronomer,
  },
  {
    id: FURNACE_HEART_CONFIG.id,
    name: FURNACE_HEART_CONFIG.name,
    description: 'Your own spellcasting raises Heat: burst while the Heart is overexposed, then cool down as more furnace sectors ignite around you.',
    unlocked: true,
    unlockRequirement: null,
    config: FURNACE_HEART_CONFIG,
    BossClass: FurnaceHeart,
  },
  {
    id: CHOIR_CONFIG.id,
    name: CHOIR_CONFIG.name,
    description: 'Learn four distinct sung notes, then survive later movements where the floating heads combine those mechanics into simultaneous chords.',
    unlocked: true,
    unlockRequirement: null,
    config: CHOIR_CONFIG,
    BossClass: Choir,
  },
];
