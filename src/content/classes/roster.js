import { ArcaneMage } from './arcane-mage/ArcaneMage.js';
import { ARCANE_MAGE_CONFIG } from './arcane-mage/config.js';
import { Paladin } from './paladin/Paladin.js';
import { PALADIN_CONFIG } from './paladin/config.js';

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
];
