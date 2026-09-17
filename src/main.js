import { Game } from './core/Game.js';
import { BOSS_ROSTER } from './content/bosses/roster.js';
import { MenuController } from './ui/MenuController.js';

const canvas = document.getElementById('game');
const getViewport = () => ({
  width: window.innerWidth,
  height: window.innerHeight,
  pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
});

const game = new Game(canvas, getViewport());
const menu = new MenuController(game, BOSS_ROSTER);
game.start();

window.addEventListener('resize', () => {
  game.resizeViewport(getViewport());
}, { passive: true });

// Handy during prototyping from the browser console.
window.raidforge = { game, menu };
