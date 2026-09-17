export const KEYBIND_DEFINITIONS = [
  { id: 'moveUp', label: 'Move Up', defaultKey: 'w' },
  { id: 'moveLeft', label: 'Move Left', defaultKey: 'a' },
  { id: 'moveDown', label: 'Move Down', defaultKey: 's' },
  { id: 'moveRight', label: 'Move Right', defaultKey: 'd' },
  { id: 'targetNext', label: 'Cycle Target', defaultKey: 'tab' },
  { id: 'interact', label: 'Interact', defaultKey: 'e' },
  { id: 'ability1', label: 'Ability 1', defaultKey: '1' },
  { id: 'ability2', label: 'Ability 2', defaultKey: '2' },
  { id: 'ability3', label: 'Ability 3', defaultKey: '3' },
  { id: 'ability4', label: 'Ability 4', defaultKey: '4' },
  { id: 'ability5', label: 'Ability 5', defaultKey: '5' },
  { id: 'ability6', label: 'Ability 6', defaultKey: '6' },
];

export const DEFAULT_KEYBINDS = Object.fromEntries(
  KEYBIND_DEFINITIONS.map(({ id, defaultKey }) => [id, defaultKey]),
);

export function normalizeKey(rawKey) {
  if (!rawKey) return '';
  if (rawKey === ' ') return 'space';
  return rawKey.toLowerCase();
}

export function formatKey(key) {
  if (!key) return '—';
  if (key === 'space') return 'Space';
  if (key.startsWith('arrow')) return key.replace('arrow', 'Arrow ');
  return key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1);
}
