export class Input {
  constructor() {
    this.held = new Set();
    this.pressed = new Set();

    window.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (!this.held.has(key)) this.pressed.add(key);
      this.held.add(key);
      if (['w', 'a', 's', 'd', '1', '2', '3', '4', '5', ' '].includes(key)) event.preventDefault();
    });

    window.addEventListener('keyup', (event) => this.held.delete(event.key.toLowerCase()));
    window.addEventListener('blur', () => {
      this.held.clear();
      this.pressed.clear();
    });
  }

  isHeld(key) { return this.held.has(key); }
  consume(key) {
    if (!this.pressed.has(key)) return false;
    this.pressed.delete(key);
    return true;
  }

  endFrame() { this.pressed.clear(); }
}
