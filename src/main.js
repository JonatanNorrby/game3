import { Game } from './core/Game.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);
game.start();

// Handy during prototyping from the browser console.
window.raidforge = game;
