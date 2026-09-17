import { formatKey } from '../core/keybindings.js';

const STORAGE_PREFIX = 'raidforge.hotbar-order';

export class AbilityBar {
  constructor({ container, classId, abilities, input, onUse }) {
    this.container = container;
    this.classId = classId;
    this.abilities = abilities;
    this.input = input;
    this.onUse = onUse;
    this.defaultOrder = Object.keys(abilities);
    this.order = this.loadOrder();
    this.drag = null;

    this.render();
  }

  get storageKey() {
    return `${STORAGE_PREFIX}.${this.classId}.v1`;
  }

  resolveSavedId(savedId) {
    if (this.abilities[savedId]) return savedId;
    for (const [id, ability] of Object.entries(this.abilities)) {
      if (ability.legacyIds?.includes(savedId)) return id;
    }
    return null;
  }

  loadOrder() {
    try {
      const saved = JSON.parse(localStorage.getItem(this.storageKey) ?? '[]');
      if (!Array.isArray(saved)) return [...this.defaultOrder];

      const migrated = saved.map((id) => this.resolveSavedId(id)).filter(Boolean);
      const valid = migrated.filter((id, index) => migrated.indexOf(id) === index);
      for (const id of this.defaultOrder) {
        if (!valid.includes(id)) valid.push(id);
      }
      return valid;
    } catch {
      return [...this.defaultOrder];
    }
  }

  saveOrder() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.order));
    } catch {
      // Restricted browser contexts can disable local storage; reordering still works for this session.
    }
  }

  get slotCount() {
    return this.order.length;
  }

  getAbilityIdAtSlot(index) {
    return this.order[index] ?? null;
  }

  render() {
    this.container.innerHTML = '';
    this.container.setAttribute('aria-label', 'Abilities. Hold Shift and drag to reorder.');

    for (const id of this.order) {
      const ability = this.abilities[id];
      const button = document.createElement('button');
      button.className = 'ability';
      button.dataset.ability = id;
      button.type = 'button';

      const facts = [];
      facts.push(ability.castDisplay ?? (ability.castTime ? `${ability.castTime.toFixed(1)} sec cast` : 'Instant'));
      const cooldown = ability.cooldown ?? ability.cooldownAfterRecall ?? 0;
      facts.push(cooldown > 0 ? `${cooldown} sec cooldown` : 'No cooldown');

      button.innerHTML = `<img class="ability-icon" src="${ability.icon}" alt="" draggable="false"><span class="ability-resource hidden"></span><span class="ability-key"></span><span class="ability-cd hidden"></span><span class="ability-tooltip" role="tooltip"><strong>${ability.name}</strong><span class="ability-tooltip-description">${ability.description}</span><span class="ability-tooltip-meta">${facts.join(' · ')}</span><span class="ability-tooltip-drag">Shift + drag to move</span></span>`;
      button.setAttribute('aria-label', `${ability.name}: ${ability.description}`);

      button.addEventListener('click', (event) => {
        if (button.dataset.suppressClick === 'true') {
          delete button.dataset.suppressClick;
          event.preventDefault();
          return;
        }
        if (event.shiftKey) {
          event.preventDefault();
          return;
        }
        this.onUse?.(id);
      });

      button.addEventListener('pointerdown', (event) => this.beginDrag(event, button));
      button.addEventListener('pointermove', (event) => this.moveDrag(event));
      button.addEventListener('pointerup', (event) => this.endDrag(event));
      button.addEventListener('pointercancel', (event) => this.endDrag(event));

      this.container.appendChild(button);
    }

    this.refreshBindings();
  }

  beginDrag(event, button) {
    if (!event.shiftKey || event.button !== 0) return;

    event.preventDefault();
    button.dataset.suppressClick = 'true';
    button.setPointerCapture?.(event.pointerId);
    button.classList.add('ability-dragging');
    this.container.classList.add('ability-reordering');
    this.drag = {
      pointerId: event.pointerId,
      button,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  }

  moveDrag(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    event.preventDefault();

    const distance = Math.hypot(event.clientX - this.drag.startX, event.clientY - this.drag.startY);
    if (distance < 4 && !this.drag.moved) return;
    this.drag.moved = true;

    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.ability');
    const dragged = this.drag.button;
    if (!target || target === dragged || !this.container.contains(target)) return;

    const rect = target.getBoundingClientRect();
    const placeAfter = event.clientX > rect.left + rect.width / 2;
    if (placeAfter) this.container.insertBefore(dragged, target.nextSibling);
    else this.container.insertBefore(dragged, target);
  }

  endDrag(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    event.preventDefault();

    const { button, moved } = this.drag;
    button.releasePointerCapture?.(event.pointerId);
    button.classList.remove('ability-dragging');
    this.container.classList.remove('ability-reordering');

    if (moved) {
      this.order = [...this.container.querySelectorAll('.ability')].map((element) => element.dataset.ability);
      this.saveOrder();
      this.refreshBindings();
    }

    this.drag = null;
    setTimeout(() => {
      if (button.dataset.suppressClick === 'true') delete button.dataset.suppressClick;
    }, 0);
  }

  refreshBindings() {
    [...this.container.querySelectorAll('.ability')].forEach((button, index) => {
      const action = `ability${index + 1}`;
      button.dataset.action = action;
      button.querySelector('.ability-key').textContent = formatKey(this.input.getBinding(action));
    });
  }

  updateCooldowns(cooldowns) {
    for (const button of this.container.querySelectorAll('.ability')) {
      const cooldown = cooldowns[button.dataset.ability] ?? 0;
      const overlay = button.querySelector('.ability-cd');
      if (cooldown > 0.05) {
        overlay.textContent = cooldown.toFixed(cooldown < 1 ? 1 : 0);
        overlay.classList.remove('hidden');
      } else {
        overlay.classList.add('hidden');
      }
    }
  }

  updatePlayerState(player) {
    for (const button of this.container.querySelectorAll('.ability')) {
      const state = player.getAbilityResourceState?.(button.dataset.ability) ?? null;
      const badge = button.querySelector('.ability-resource');
      button.classList.toggle('ability-empty', Boolean(state && state.current <= 0));

      if (!state) {
        badge.classList.add('hidden');
        continue;
      }

      badge.textContent = `${state.current}/${state.max}`;
      badge.title = state.label;
      badge.classList.remove('hidden');
    }
  }
}
