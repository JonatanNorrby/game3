// All Arcane Mage tuning and presentation metadata lives here.
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
    barrage: {
      name: 'Arcane Barrage',
      description: 'Instant heavy arcane hit.',
      icon: './assets/classes/arcane-mage/abilities/arcane-barrage.svg',
      cooldown: 6,
      damage: 92,
    },
    filler: {
      name: 'Arcane Bolt',
      description: 'Your repeatable filler spell.',
      icon: './assets/classes/arcane-mage/abilities/arcane-bolt.svg',
      cooldown: 0,
      castTime: 0.9,
      damage: 34,
    },
    teleport: {
      name: 'Recall Anchor',
      description: 'Place an anchor; press again to teleport back.',
      icon: './assets/classes/arcane-mage/abilities/recall-anchor.svg',
      cooldownAfterRecall: 12,
    },
  },
};
