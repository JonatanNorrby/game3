import { ArcaneMage } from './arcane-mage/ArcaneMage.js';
import { ARCANE_MAGE_CONFIG } from './arcane-mage/config.js';
import { Paladin } from './paladin/Paladin.js';
import { PALADIN_CONFIG } from './paladin/config.js';
import { Hunter } from './hunter/Hunter.js';
import { HUNTER_CONFIG } from './hunter/config.js';
import { Rogue } from './rogue/Rogue.js';
import { ROGUE_CONFIG } from './rogue/config.js';

export const CLASS_ROSTER = [
  {
    id: ARCANE_MAGE_CONFIG.id,
    name: ARCANE_MAGE_CONFIG.name,
    role: 'Ranged caster / self-sustain',
    description: 'Build Arcane Stacks with Arcane Bolt, then spend them on damage or healing while managing movement casts.',
    PlayerClass: ArcaneMage,
    config: ARCANE_MAGE_CONFIG,
  },
  {
    id: PALADIN_CONFIG.id,
    name: PALADIN_CONFIG.name,
    role: PALADIN_CONFIG.role,
    description: 'Fight close to the boss, manage mana, maintain a holy damage-over-time effect, and trade casting time for powerful healing and recovery.',
    PlayerClass: Paladin,
    config: PALADIN_CONFIG,
  },
  {
    id: HUNTER_CONFIG.id,
    name: HUNTER_CONFIG.name,
    role: HUNTER_CONFIG.role,
    description: 'Build Fury with Bow Shot, coordinate a damageable Tiger companion, and choose when to expose or recall the pet during raid mechanics.',
    PlayerClass: Hunter,
    config: HUNTER_CONFIG,
  },
  {
    id: ROGUE_CONFIG.id,
    name: ROGUE_CONFIG.name,
    role: ROGUE_CONFIG.role,
    description: 'Run in and out of melee, retrieve poison vials, sustain through poison lifesteal, and turn poison uptime into more frequent Sprints.',
    PlayerClass: Rogue,
    config: ROGUE_CONFIG,
  },
];
