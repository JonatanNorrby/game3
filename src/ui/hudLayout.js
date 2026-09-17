export const HUD_LAYOUT_STORAGE_KEY = 'raidforge.hud-layout.v1';

export const HUD_ELEMENTS = [
  { id: 'topbar', label: 'Top Bar', defaultLayout: { x: 0.5, y: 0.045, scale: 1, opacity: 1, visible: true } },
  { id: 'boss', label: 'Boss Frame', defaultLayout: { x: 0.5, y: 0.115, scale: 1, opacity: 1, visible: true } },
  { id: 'player', label: 'Player Frame', defaultLayout: { x: 0.5, y: 0.80, scale: 1, opacity: 1, visible: true } },
  { id: 'actions', label: 'Action Bar', defaultLayout: { x: 0.5, y: 0.925, scale: 1, opacity: 1, visible: true } },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const cloneDefaults = () => Object.fromEntries(HUD_ELEMENTS.map(({ id, defaultLayout }) => [id, { ...defaultLayout }]));

export class HudLayout {
  constructor(root = document) {
    this.root = root;
    this.layouts = this.load();
    this.listeners = new Set();
    this.applyAll();
  }

  load() {
    const defaults = cloneDefaults();
    try {
      const saved = JSON.parse(localStorage.getItem(HUD_LAYOUT_STORAGE_KEY) ?? '{}');
      for (const definition of HUD_ELEMENTS) {
        const value = saved?.[definition.id];
        if (value) defaults[definition.id] = this.sanitize({ ...defaults[definition.id], ...value });
      }
    } catch {
      // Invalid/unavailable storage falls back to defaults.
    }
    return defaults;
  }

  sanitize(layout) {
    return {
      x: clamp(Number(layout.x) || 0.5, 0.02, 0.98),
      y: clamp(Number(layout.y) || 0.5, 0.02, 0.98),
      scale: clamp(Number(layout.scale) || 1, 0.55, 1.6),
      opacity: clamp(Number(layout.opacity) || 1, 0.2, 1),
      visible: layout.visible !== false,
    };
  }

  element(id) { return this.root.querySelector(`[data-hud-id="${id}"]`); }
  get(id) { return { ...this.layouts[id] }; }

  update(id, patch, { persist = true } = {}) {
    if (!this.layouts[id]) return;
    this.layouts[id] = this.sanitize({ ...this.layouts[id], ...patch });
    this.apply(id);
    if (persist) this.save();
    this.emit(id);
  }

  apply(id) {
    const element = this.element(id);
    const layout = this.layouts[id];
    if (!element || !layout) return;
    element.style.setProperty('--hud-x', `${layout.x * 100}vw`);
    element.style.setProperty('--hud-y', `${layout.y * 100}vh`);
    element.style.setProperty('--hud-scale', layout.scale);
    element.style.setProperty('--hud-opacity', layout.opacity);
    element.classList.toggle('hud-user-hidden', !layout.visible);
  }

  applyAll() { for (const { id } of HUD_ELEMENTS) this.apply(id); }

  reset(id) {
    const definition = HUD_ELEMENTS.find((entry) => entry.id === id);
    if (!definition) return;
    this.layouts[id] = { ...definition.defaultLayout };
    this.apply(id);
    this.save();
    this.emit(id);
  }

  resetAll() {
    this.layouts = cloneDefaults();
    this.applyAll();
    this.save();
    this.emit(null);
  }

  save() {
    try { localStorage.setItem(HUD_LAYOUT_STORAGE_KEY, JSON.stringify(this.layouts)); } catch { /* session still works */ }
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(id) { for (const listener of this.listeners) listener(id); }
}
