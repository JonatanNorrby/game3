import { DEFAULT_KEYBINDS, normalizeKey } from './keybindings.js';

const STORAGE_KEY = 'raidforge.keybinds.v1';

export class Input {
  constructor() {
    this.held = new Set();
    this.pressed = new Set();
    this.bindings = this.loadBindings();
    this.bindingListeners = new Set();
    this.rebinding = null;

    window.addEventListener('keydown', (event) => this.handleKeyDown(event));
    window.addEventListener('keyup', (event) => this.held.delete(normalizeKey(event.key)));
    window.addEventListener('blur', () => this.clear());
  }

  loadBindings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      return { ...DEFAULT_KEYBINDS, ...saved };
    } catch {
      return { ...DEFAULT_KEYBINDS };
    }
  }

  saveBindings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bindings));
    } catch {
      // Local storage can be unavailable in restricted browser contexts.
    }
  }

  handleKeyDown(event) {
    const key = normalizeKey(event.key);

    if (this.rebinding) {
      event.preventDefault();
      const { action, callback } = this.rebinding;
      this.rebinding = null;
      if (key !== 'escape') this.setBinding(action, key);
      callback?.();
      return;
    }

    if (Object.values(this.bindings).includes(key)) event.preventDefault();
    if (!this.held.has(key)) this.pressed.add(key);
    this.held.add(key);
  }

  getBinding(action) {
    return this.bindings[action] ?? '';
  }

  setBinding(action, key) {
    if (!(action in DEFAULT_KEYBINDS) || !key) return;

    const previousKey = this.bindings[action];
    const conflictingAction = Object.keys(this.bindings)
      .find((id) => id !== action && this.bindings[id] === key);

    if (conflictingAction) this.bindings[conflictingAction] = previousKey;
    this.bindings[action] = key;
    this.saveBindings();
    this.notifyBindingsChanged();
    this.clear();
  }

  resetBindings() {
    this.bindings = { ...DEFAULT_KEYBINDS };
    this.saveBindings();
    this.notifyBindingsChanged();
    this.clear();
  }

  beginRebind(action, callback) {
    if (!(action in DEFAULT_KEYBINDS)) return;
    this.clear();
    this.rebinding = { action, callback };
  }

  onBindingsChanged(listener) {
    this.bindingListeners.add(listener);
    return () => this.bindingListeners.delete(listener);
  }

  notifyBindingsChanged() {
    for (const listener of this.bindingListeners) listener(this.bindings);
  }

  isHeld(key) {
    return this.held.has(normalizeKey(key));
  }

  consume(key) {
    const normalized = normalizeKey(key);
    if (!this.pressed.has(normalized)) return false;
    this.pressed.delete(normalized);
    return true;
  }

  isActionHeld(action) {
    return this.isHeld(this.getBinding(action));
  }

  consumeAction(action) {
    return this.consume(this.getBinding(action));
  }

  clear() {
    this.held.clear();
    this.pressed.clear();
  }

  endFrame() {
    this.pressed.clear();
  }
}
