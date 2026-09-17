import { HUD_ELEMENTS } from './hudLayout.js';

export class HudCustomizer {
  constructor(layout) {
    this.layout = layout;
    this.app = document.getElementById('app');
    this.panel = document.getElementById('hud-customizer');
    this.elementList = document.getElementById('hud-element-list');
    this.scaleInput = document.getElementById('hud-scale');
    this.opacityInput = document.getElementById('hud-opacity');
    this.visibleInput = document.getElementById('hud-visible');
    this.scaleValue = document.getElementById('hud-scale-value');
    this.opacityValue = document.getElementById('hud-opacity-value');
    this.selectedLabel = document.getElementById('hud-selected-label');
    this.selectedId = HUD_ELEMENTS[0].id;
    this.returnCallback = null;
    this.dragState = null;

    this.renderElementList();
    this.bindControls();
    this.bindDraggableElements();
    this.layout.onChange(() => this.syncControls());
  }

  renderElementList() {
    this.elementList.innerHTML = '';
    for (const definition of HUD_ELEMENTS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hud-element-button';
      button.dataset.hudSelect = definition.id;
      button.textContent = definition.label;
      button.addEventListener('click', () => this.select(definition.id));
      this.elementList.appendChild(button);
    }
    this.syncControls();
  }

  bindControls() {
    this.scaleInput.addEventListener('input', () => {
      this.layout.update(this.selectedId, { scale: Number(this.scaleInput.value) });
    });
    this.opacityInput.addEventListener('input', () => {
      this.layout.update(this.selectedId, { opacity: Number(this.opacityInput.value) });
    });
    this.visibleInput.addEventListener('change', () => {
      this.layout.update(this.selectedId, { visible: this.visibleInput.checked });
    });
    document.getElementById('hud-reset-selected').addEventListener('click', () => this.layout.reset(this.selectedId));
    document.getElementById('hud-reset-all').addEventListener('click', () => this.layout.resetAll());
    document.getElementById('hud-customizer-done').addEventListener('click', () => this.close());
  }

  bindDraggableElements() {
    for (const definition of HUD_ELEMENTS) {
      const element = this.layout.element(definition.id);
      if (!element) continue;
      element.addEventListener('pointerdown', (event) => {
        if (!this.isOpen() || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        this.select(definition.id);
        const current = this.layout.get(definition.id);
        this.dragState = {
          id: definition.id,
          startPointerX: event.clientX,
          startPointerY: event.clientY,
          startX: current.x,
          startY: current.y,
        };
        element.setPointerCapture(event.pointerId);
      });
      element.addEventListener('pointermove', (event) => {
        if (!this.dragState || this.dragState.id !== definition.id) return;
        const dx = (event.clientX - this.dragState.startPointerX) / window.innerWidth;
        const dy = (event.clientY - this.dragState.startPointerY) / window.innerHeight;
        this.layout.update(definition.id, { x: this.dragState.startX + dx, y: this.dragState.startY + dy }, { persist: false });
      });
      const finishDrag = (event) => {
        if (!this.dragState || this.dragState.id !== definition.id) return;
        if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
        this.dragState = null;
        this.layout.save();
      };
      element.addEventListener('pointerup', finishDrag);
      element.addEventListener('pointercancel', finishDrag);
    }
  }

  select(id) {
    if (!HUD_ELEMENTS.some((entry) => entry.id === id)) return;
    this.selectedId = id;
    this.syncControls();
  }

  syncControls() {
    const definition = HUD_ELEMENTS.find((entry) => entry.id === this.selectedId);
    const value = this.layout.get(this.selectedId);
    if (!definition || !value) return;
    this.selectedLabel.textContent = definition.label;
    this.scaleInput.value = value.scale;
    this.opacityInput.value = value.opacity;
    this.visibleInput.checked = value.visible;
    this.scaleValue.textContent = `${Math.round(value.scale * 100)}%`;
    this.opacityValue.textContent = `${Math.round(value.opacity * 100)}%`;
    for (const button of this.elementList.querySelectorAll('[data-hud-select]')) {
      button.classList.toggle('selected', button.dataset.hudSelect === this.selectedId);
    }
    for (const entry of HUD_ELEMENTS) {
      this.layout.element(entry.id)?.classList.toggle('hud-selected', entry.id === this.selectedId);
    }
  }

  open(returnCallback = null) {
    this.returnCallback = returnCallback;
    this.panel.classList.remove('hidden');
    this.app.classList.add('hud-editing');
    this.select(this.selectedId);
  }

  close() {
    this.dragState = null;
    this.panel.classList.add('hidden');
    this.app.classList.remove('hud-editing');
    for (const entry of HUD_ELEMENTS) this.layout.element(entry.id)?.classList.remove('hud-selected');
    const callback = this.returnCallback;
    this.returnCallback = null;
    callback?.();
  }

  isOpen() { return !this.panel.classList.contains('hidden'); }
}
