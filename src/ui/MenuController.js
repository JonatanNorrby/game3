import { GAME_CONFIG } from '../config/game.js';
import { KEYBIND_DEFINITIONS, formatKey } from '../core/keybindings.js';

export class MenuController {
  constructor(game, bossRoster, hudCustomizer) {
    this.game = game;
    this.bossRoster = bossRoster;
    this.hudCustomizer = hudCustomizer;
    this.app = document.getElementById('app');
    this.overlay = document.getElementById('menu-overlay');
    this.views = {
      main: document.getElementById('menu-main'),
      bosses: document.getElementById('menu-bosses'),
      settings: document.getElementById('menu-settings'),
    };
    this.bossList = document.getElementById('boss-list');
    this.keybindList = document.getElementById('keybind-list');
    this.versionLabels = document.querySelectorAll('[data-game-version]');

    this.bindStaticButtons();
    this.game.input.onBindingsChanged(() => this.renderKeybinds());
    this.renderBosses();
    this.renderKeybinds();
    this.versionLabels.forEach((element) => { element.textContent = `v${GAME_CONFIG.version}`; });
    this.openMain();
  }

  bindStaticButtons() {
    document.getElementById('menu-play').addEventListener('click', () => this.show('bosses'));
    document.getElementById('menu-settings-button').addEventListener('click', () => this.show('settings'));
    document.getElementById('boss-back').addEventListener('click', () => this.show('main'));
    document.getElementById('settings-back').addEventListener('click', () => this.show('main'));
    document.getElementById('reset-keybinds').addEventListener('click', () => this.game.input.resetBindings());
    document.getElementById('hud-menu-button').addEventListener('click', () => this.openMain());
    document.getElementById('customize-hud').addEventListener('click', () => this.openHudCustomizer());
  }

  openMain() {
    if (this.hudCustomizer.isOpen()) this.hudCustomizer.close();
    this.game.enterMenu();
    this.overlay.classList.remove('hidden');
    this.app.classList.add('menu-open');
    this.show('main');
  }

  close() {
    this.overlay.classList.add('hidden');
    this.app.classList.remove('menu-open');
  }

  show(viewName) {
    for (const [name, element] of Object.entries(this.views)) {
      element.classList.toggle('hidden', name !== viewName);
    }
    if (viewName === 'bosses') this.renderBosses();
    if (viewName === 'settings') this.renderKeybinds();
  }

  openHudCustomizer() {
    this.overlay.classList.add('hidden');
    this.app.classList.remove('menu-open');
    this.hudCustomizer.open(() => {
      this.overlay.classList.remove('hidden');
      this.app.classList.add('menu-open');
      this.show('settings');
    });
  }

  renderBosses() {
    this.bossList.innerHTML = '';
    this.bossRoster.forEach((entry, index) => {
      const card = document.createElement('button');
      card.className = `boss-card${entry.unlocked ? '' : ' locked'}`;
      card.disabled = !entry.unlocked;
      card.innerHTML = `<span class="boss-card-title">${entry.name}</span><span class="boss-card-description">${entry.description}</span><span class="boss-card-state">${entry.unlocked ? 'Fight boss' : `Locked${entry.unlockRequirement ? ` · ${entry.unlockRequirement}` : ''}`}</span>`;
      if (entry.unlocked) {
        card.addEventListener('click', () => {
          this.game.startEncounter(index);
          this.close();
        });
      }
      this.bossList.appendChild(card);
    });
  }

  renderKeybinds() {
    this.keybindList.innerHTML = '';
    for (const definition of KEYBIND_DEFINITIONS) {
      const row = document.createElement('div');
      row.className = 'keybind-row';
      const label = document.createElement('span');
      label.textContent = definition.label;
      const button = document.createElement('button');
      button.className = 'keybind-button';
      button.textContent = formatKey(this.game.input.getBinding(definition.id));
      button.addEventListener('click', () => {
        button.textContent = 'Press a key…';
        button.classList.add('listening');
        this.game.input.beginRebind(definition.id, () => this.renderKeybinds());
      });
      row.append(label, button);
      this.keybindList.appendChild(row);
    }
  }
}
