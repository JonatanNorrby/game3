// All Arcane Mage tuning lives here. Keep gameplay values out of the class logic.
export const ARCANE_MAGE_CONFIG = {
  id: 'arcane-mage',
  name: 'Arcane Mage',
  maxHealth: 100,
  moveSpeed: 255,
  radius: 18,
  spawn: { x: 0.5, y: 0.79 },
  visual: {
    body: '#79b8ff',
    core: '#d8efff',
    anchor: '#78f0dc',
  },
  abilities: {
    renew: {
      key: '1',
      name: 'Temporal Mend',
      description: 'Heal over time: 48 health over 6 sec.',
      cooldown: 8,
      duration: 6,
      tickEvery: 1,
      healPerTick: 8,
    },
    directHeal: {
      key: '2',
      name: 'Arcane Restoration',
      description: '1.1 sec cast. Restore 34 health.',
      cooldown: 3.5,
      castTime: 1.1,
      heal: 34,
    },
    barrage: {
      key: '3',
      name: 'Arcane Barrage',
      description: 'Instant heavy hit. 6 sec cooldown.',
      cooldown: 6,
      damage: 92,
    },
    filler: {
      key: '4',
      name: 'Arcane Bolt',
      description: '0.9 sec cast. Your repeatable filler.',
      cooldown: 0,
      castTime: 0.9,
      damage: 34,
    },
    teleport: {
      key: '5',
      name: 'Recall Anchor',
      description: 'Place an anchor; press again to teleport back.',
      cooldownAfterRecall: 12,
    },
  },
};
