import { ArcaneWarden } from './arcane-warden/ArcaneWarden.js';

// Boss progression lives here. Add future bosses as new entries and switch
// `unlocked` from false to true when progression requirements are satisfied.
export const BOSS_ROSTER = [
  {
    id: 'arcane-warden',
    name: 'Arcane Warden',
    description: 'A fundamentals encounter built around raid damage, telegraphed movement checks, and healing pressure.',
    unlocked: true,
    unlockRequirement: null,
    BossClass: ArcaneWarden,
  },
];
