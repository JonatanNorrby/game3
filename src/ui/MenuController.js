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
      classes: document.getElementById('menu-classes'),
      bosses: document.getElementById('menu-bosses'),
      settings: document.getElementById('menu-settings'),
    };
    this.classList = document.getElementById('class-list');
    this.bossList = document.getElementById('boss-list');
    this.keybindList = document.getElementById('keybind-list');
    this.versionLabels = document.querySelectorAll('[data-game-version]');
    this.resumeButton = document.getElementById('menu-resume');
    this.canResumeEncounter = false;

    this.bindStaticButtons();
    this.game.input.onBindingsChanged(() => this.renderKeybinds());
    this.renderClasses();
    this.renderBosses();
    this.renderKeybinds();
    this.versionLabels.forEach((element) => { element.textContent = `v${GAME_CONFIG.version}`; });
    this.openMain();
  }

  bindStaticButtons() {
    this.resumeButton.addEventListener('click', () => this.resumeEncounter());
    document.getElementById('menu-play').addEventListener('click', () => this.show('classes'));
    document.getElementById('menu-settings-button').addEventListener('click', () => this.show('settings'));
    document.getElementById('class-back').addEventListener('click', () => this.show('main'));
    document.getElementById('boss-back').addEventListener('click', () => this.show('classes'));
    document.getElementById('settings-back').addEventListener('click', () => this.show('main'));
    document.getElementById('reset-keybinds').addEventListener('click', () => this.game.input.resetBindings());
    document.getElementById('hud-menu-button').addEventListener('click', () => this.openMain());
    document.getElementById('customize-hud').addEventListener('click', () => this.openHudCustomizer());
  }

  openMain() {
    if (this.hudCustomizer.isOpen()) this.hudCustomizer.close();

    if (this.game.state === 'playing') this.canResumeEncounter = true;
    if (this.game.state === 'defeat' || this.game.state === 'victory') this.canResumeEncounter = false;

    this.game.enterMenu();
    this.overlay.classList.remove('hidden');
    this.app.classList.add('menu-open');
    this.syncResumeButton();
    this.show('main');
  }

  resumeEncounter() {
    if (!this.canResumeEncounter || !this.game.player?.alive || !this.game.boss?.alive) {
      this.canResumeEncounter = false;
      this.syncResumeButton();
      return;
    }

    this.canResumeEncounter = false;
    this.game.state = 'playing';
    this.game.input.clear();
    this.close();
  }

  syncResumeButton() {
    this.resumeButton.classList.toggle('hidden', !this.canResumeEncounter);
  }

  close() {
    this.overlay.classList.add('hidden');
    this.app.classList.remove('menu-open');
  }

  show(viewName) {
    for (const [name, element] of Object.entries(this.views)) {
      element.classList.toggle('hidden', name !== viewName);
    }
    if (viewName === 'main') this.syncResumeButton();
    if (viewName === 'classes') this.renderClasses();
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

  renderClasses() {
    this.classList.innerHTML = '';
    this.game.classRoster.forEach((entry, index) => {
      const selected = index === this.game.classIndex;
      const card = document.createElement('button');
      card.className = `boss-card class-card${selected ? ' selected' : ''}`;
      card.innerHTML = `<span class="boss-card-title">${entry.name}</span><span class="class-card-role">${entry.role}</span><span class="boss-card-description">${entry.description}</span><span class="boss-card-state">${selected ? 'Selected · Continue' : 'Choose class'}</span>`;
      card.addEventListener('click', () => {
        this.canResumeEncounter = false;
        this.game.selectClass(index);
        this.renderKeybinds();
        this.show('bosses');
      });
      this.classList.appendChild(card);
    });
  }

  renderBosses() {
    this.bossList.innerHTML = '';
    this.bossRoster.forEach((entry, index) => {
      const card = document.createElement('button');
      card.className = `boss-card${entry.unlocked ? '' : ' locked'}`;
      card.disabled = !entry.unlocked;
      card.innerHTML = `<span class="boss-card-title">${entry.name}</span><span class="boss-card-description">${entry.description}</span><span class="boss-card-state">${entry.unlocked ? `Fight as ${this.game.player.config.name}` : `Locked${entry.unlockRequirement ? ` · ${entry.unlockRequirement}` : ''}`}</span>`;
      if (entry.unlocked) {
        card.addEventListener('click', () => {
          this.canResumeEncounter = false;
          this.game.startEncounter(index);
          this.close();
        });
      }
      this.bossList.appendChild(card);
    });
  }

  renderKeybinds() {
    this.keybindList.innerHTML = '';
    const slotCount = this.game.player?.config?.maxAbilitySlots ?? this.game.abilityBar?.slotCount ?? 0;
    const visibleDefinitions = KEYBIND_DEFINITIONS.filter((definition) => {
      if (!definition.id.startsWith('ability')) return true;
      const slot = Number(definition.id.replace('ability', ''));
      return slot <= slotCount;
    });

    for (const definition of visibleDefinitions) {
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
