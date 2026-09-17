# Raidforge Prototype

A dependency-free, browser-based 2D top-down boss-rush prototype aimed at capturing some of the feel of soloing a WoW-style raid encounter: telegraphed mechanics, cast bars, movement checks, healing pressure, damage uptime, and cooldown decisions.

## Current prototype

Playable class: **Arcane Mage**

- `1` Temporal Mend — heal over time
- `2` Arcane Restoration — direct cast-time heal
- `3` Arcane Barrage — instant burst damage
- `4` Arcane Bolt — repeatable cast-time filler
- `5` Recall Anchor — place an anchor, press again to teleport back
- `WASD` — movement; moving interrupts cast-time spells

Boss: **Arcane Warden**

- Arcane Pulse — unavoidable raid damage
- Astral Cleave — frontal cone
- Expanding Nova — move out of the boss-centered danger zone
- Falling Stars — dodge ground telegraphs
- Phase 2 at 50% health accelerates mechanics

## Project structure

```text
src/
  core/                         # reusable engine/input/helpers
  content/
    classes/
      arcane-mage/
        config.js               # all class stats + ability tuning
        ArcaneMage.js           # class behavior
        animations/             # future animation frames
    bosses/
      arcane-warden/
        config.js               # all boss stats + mechanic tuning
        ArcaneWarden.js         # boss behavior
        animations/             # future animation frames
```

Each class and boss owns its configuration, behavior, and art folder. Core systems do not contain class/boss tuning values.

## Run locally

Because the game uses JavaScript modules, serve the folder instead of opening `index.html` directly. For example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages

The included Pages workflow deploys the root of `main` whenever the branch is updated.
