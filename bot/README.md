# QA bot

A Playwright bot that plays `../index.html`, watches the game's internals for glitches, and writes a report.

```sh
cd bot && npm install && npx playwright install chromium
npm run watch                                 # visible browser, real speed: watch it play from 1F
node run.js --watch --suites=play --from=9 --to=10   # watch just the King fight
npm test                                      # every suite, headless, 3x speed (~1h, most of it the playthrough)
node run.js --suites=story,screens,save,edge  # the quick suites (~5 min)
node run.js --suites=play --video             # also record videos to out/video
```

Output lands in `out/` (or `$BOT_OUT`): `report.md`, `report.json`, `shots/`, `story.md` (every line of dialog in play order).

## How it works

`lib.js` serves `index.html` with `probe.js` spliced in just before the boot line, inside the game's closure, so the probe can read `G`, `pac`, `save` and the rest without changing the game. The probe:

- **monitors invariants** every frame: NaN positions, Pac-Man inside walls or off the grid, actors outside the maze, the dot counter disagreeing with the board, negative lives, the score dropping, timed states that never end, and Pac-Man stuck while a key is held
- **times** the game's `update()` and `render()`, plus every frame
- **plays**, by dispatching real `keydown`/`keyup` events. It runs Dijkstra over the maze with a danger field around every enemy, steam vent and projectile. It goes for dots, or for prey and the boss while powered up, flees when cornered, and dashes when it's about to be caught.

`--speed=N` hands the game a sped-up clock (the game caps a frame at 0.1s). The `perf` suite always runs at 1x.

## Suites

| suite | what it does |
|---|---|
| `story` | dumps every line of dialog and checks banners against the level config |
| `screens` | menu, cast screen, tower map, dialog, pausing on menus, phone/landscape layouts, a 600-key mash |
| `save` | quits during the clear flash and the outro, reloads mid-floor, boss checkpoints, 17 corrupt or legacy saves, blocked storage, settings, high score, two tabs |
| `edge` | focus loss, pausing during ready/dying, game over flow, debug keys, roof rounds, two held keys, resizing |
| `perf` | plays each floor for 10s with FX on, then a few floors with FX off |
| `play` | plays the whole story through the real menus and tower, 1F to the roof, with infinite lives on (`--lives` turns them off) |
