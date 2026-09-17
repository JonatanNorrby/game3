// All Arcane Mage tuning and presentation metadata lives here.
const MAX_ARCANE_MISSILES = 6;

export const ARCANE_MAGE_CONFIG = {
  id: 'arcane-mage',
  name: 'Arcane Mage',
  maxHealth: 100,
  moveSpeed: 255,
  radius: 18,
  spawn: { x: 0.5, y: 0.58 },
  visual: {
    body: '#79b8ff',
    core: '#d8efff',
    anchor: '#78f0dc',
  },
  resources: {
    arcaneMissiles: {
      name: 'Stored Missiles',
      max: MAX_ARCANE_MISSILES,
    },
  },
  abilities: {
    renew: {
      name: 'Temporal Mend',
      description: 'Heal over time: 48 health over 6 sec.',
      icon: './assets/classes/arcane-mage/abilities/temporal-mend.svg',
      cooldown: 8,
      duration: 6,
      tickEvery: 1,
      healPerTick: 8,
    },
    directHeal: {
      name: 'Arcane Restoration',
      description: 'Restore 34 health after a short cast.',
      icon: './assets/classes/arcane-mage/abilities/arcane-restoration.svg',
      cooldown: 3.5,
      castTime: 1.1,
      heal: 34,
    },
    missiles: {
      legacyIds: ['barrage'],
      name: 'Arcane Missiles',
      description: 'Channel every stored missile at the boss while moving. Arcane Bolt stores one missile, up to 6.',
      icon: './assets/classes/arcane-mage/abilities/arcane-missiles.svg',
      cooldown: 0,
      castDisplay: 'Mobile channel · 0.22 sec per missile',
      resource: 'arcaneMissiles',
      timePerMissile: 0.22,
      damagePerMissile: 28,
      projectileDuration: 0.18,
    },
    filler: {
      name: 'Arcane Bolt',
      description: 'Deal 34 damage and store 1 Arcane Missile, up to 6.',
      icon: './assets/classes/arcane-mage/abilities/arcane-bolt.svg',
      cooldown: 0,
      castTime: 0.9,
      damage: 34,
      generates: {
        resource: 'arcaneMissiles',
        amount: 1,
      },
    },
    teleport: {
      name: 'Recall Anchor',
      description: 'Place an anchor; press again to teleport back.',
      icon: './assets/classes/arcane-mage/abilities/recall-anchor.svg',
      cooldownAfterRecall: 12,
    },
  },
};
