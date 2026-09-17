import { Golem } from './golem/Golem.js';
import { GOLEM_CONFIG } from './golem/config.js';

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
];
