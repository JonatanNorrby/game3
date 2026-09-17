// All Golem encounter tuning and arena settings live here.
export const GOLEM_CONFIG = {
  id: 'golem',
  name: 'Golem',
  arena: {
    width: 1700,
    height: 1050,
    playerSpawn: { x: 0.5, y: 0.75 },
  },
  maxHealth: 1700,
  radius: 46,
  position: { x: 0.5, y: 0.32 },
  visual: {
    body: '#b05a9e',
    core: '#f1b0e5',
    danger: '#ff596f',
    warning: '#ffb24a',
  },
  encounter: {
    openingDelay: 1.5,
    delayBetweenMechanics: 1.0,
    phaseTwoHealthPercent: 50,
    phaseTwoSpeedMultiplier: 0.78,
  },
  mechanics: {
    arcanePulse: { name: 'Arcane Pulse', castTime: 1.6, damage: 12, description: 'Unavoidable raid damage. Heal through it.' },
    nova: { name: 'Expanding Nova', castTime: 2.2, radius: 245, damage: 34, description: 'Move outside the ring.' },
    frontal: { name: 'Astral Cleave', castTime: 1.9, range: 560, halfAngle: 0.42, damage: 42, description: 'Move out of the frontal cone.' },
    rain: { name: 'Falling Stars', castTime: 2.0, count: 4, radius: 68, damage: 30, description: 'Dodge the marked impact zones.' },
  },
  sequence: ['arcanePulse', 'frontal', 'nova', 'arcanePulse', 'rain', 'frontal', 'nova'],
};
