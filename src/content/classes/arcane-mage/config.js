// All Arcane Mage tuning and presentation metadata lives here.
const MAX_ARCANE_STACKS = 6;

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
    arcaneStacks: {
      name: 'Arcane Stacks',
      max: MAX_ARCANE_STACKS,
    },
  },
  abilities: {
    renew: {
      name: 'Temporal Mend',
      description: 'Consume all Arcane Stacks to heal over time. Each stack adds 12 healing and 2 sec duration, up to 6 stacks.',
      icon: './assets/classes/arcane-mage/abilities/temporal-mend.svg',
      cooldown: 8,
      castDisplay: 'Instant · consumes all Arcane Stacks',
      resource: 'arcaneStacks',
      healPerStack: 12,
      durationPerStack: 2,
      tickEvery: 1,
    },
    missiles: {
      legacyIds: ['barrage'],
      name: 'Arcane Missiles',
      description: 'Channel one missile per Arcane Stack at the boss while moving. Arcane Bolt builds up to 6 stacks.',
      icon: './assets/classes/arcane-mage/abilities/arcane-missiles.svg',
      cooldown: 0,
      castDisplay: 'Mobile channel · 0.22 sec per missile',
      resource: 'arcaneStacks',
      timePerMissile: 0.22,
      damagePerMissile: 28,
      projectileDuration: 0.18,
    },
    filler: {
      name: 'Arcane Bolt',
      description: 'Deal 34 damage and gain 1 Arcane Stack, up to 6.',
      icon: './assets/classes/arcane-mage/abilities/arcane-bolt.svg',
      cooldown: 0,
      castTime: 0.9,
      damage: 34,
      generates: {
        resource: 'arcaneStacks',
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
