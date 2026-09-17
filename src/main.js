import { Game } from './core/Game.js';

const canvas = document.getElementById('game');
const getViewport = () => ({
  width: window.innerWidth,
  height: window.innerHeight,
  pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
});

const game = new Game(canvas, getViewport());
game.start();

window.addEventListener('resize', () => {
  game.resizeViewport(getViewport());
}, { passive: true });

// Handy during prototyping from the browser console.
window.raidforge = game;
