# QA bot findings — 2026-10-01

Tested against `index.html` on `graphics-overhaul`, including the uncommitted Big Blob changes. Line numbers refer to that file.

**Coverage:**
- **Playthrough:** the bot played the whole story from NEW GAME, through the menus and tower, from 1F to the roof. It cleared 29 of 31 floors and all three bosses. It skipped B2 and 13F only because those two ran while other heavy jobs were starving the CPU. At normal speed, B2 cleared with 3 deaths and 13F with 2 deaths a minute.
- **Other suites:** menus and screens, 30 save/reload scenarios (17 of them corrupt or legacy saves), edge cases, and a per-floor performance pass.
- **Glitch checks:** every frame of the playthrough was checked for NaN positions, Pac-Man or ghosts inside walls, diagonal movement, actors leaving the maze, the dot counter disagreeing with the board, the score dropping, stuck timers and a frozen Pac-Man. **None fired on any floor.**

---

## 1. Gameplay glitches and edge cases

| Severity | Finding | Where |
|---|---|---|
| **high** | **A floor clear is lost if the game is closed during the "clear" flash.** Progress is saved in `finishLevel()`, which only runs after the flash ends (3s, or 5.5s on bosses). Closing or reloading in that window means replaying the floor, and on a boss that means the whole fight. Reproduced: the floor was cleared, the page reloaded mid-flash, and the save still said `unlocked: 0`. **Fix:** call `recordClear()` the moment the state becomes `'clear'`. | `2856`, `1231` |
| medium | **Esc on the roof's game-over screen throws away your best roof score.** Only Enter saves `save.best[ROOF]`, so Esc, or a reload on that screen, loses it. | `5854` vs `5861` |
| low | Pressing N during the Skeleton King fight goes straight to the roof. The ending cutscene is skipped and never shown. | `skipLevel()` |
| info | During the Big Blob fight, rescued ghosts fly up and out of the maze as eyes. That's intended; I mention it because the bot flagged it at first. | — |

## 2. Quality of life

| Severity | Suggestion | Where |
|---|---|---|
| **medium** | **There's no way to quit a floor.** Esc only toggles pause. Getting back to the tower or menu means dying three times or reloading the page. Add QUIT to the pause screen. | `5861` |
| **medium** | **Debug controls are exposed to players.** The SKIP LEVEL, UNLOCK ALL and INFINITE LIVES buttons always show under the game. The U key on the menu silently unlocks every floor and the ending. N mid-floor marks the floor cleared and saves it. All of these are permanent. Hide them behind `?debug` or similar. | `120`, `5881-5882` |
| **medium** | **Infinite lives is remembered across reloads and silently turns off high scores.** A player who toggles it once never sets a record again, and the HUD's HIGH SCORE just sits at 00 with no explanation. | `1098`, `5891` |
| low | Sound on/off isn't remembered, though FX and infinite lives are. | `5831` |
| low | Switching to another app while the browser stays visible doesn't pause the game. Only hiding the tab does. | `5924` |
| low | Any arrow key unpauses the game instantly, with no countdown. Pac-Man can unpause into a ghost. | `5836` |
| low | Esc doesn't cancel the NEW GAME "THIS ERASES YOUR SAVE" confirmation. Only moving the cursor does. | `5861` |
| low | Leaving the tower or the cast screen resets the menu cursor to the top. | `toMenu()` |
| low | With two tabs open, the stale tab overwrites the other tab's progress when it saves. | `writeSave` |
| low | When storage is blocked (private mode), nothing saves and the player isn't told. | — |

## 3. Performance

Performance is in good shape.

- **Frame rate:** 60fps on all 32 floors.
- **Cost per frame:**
  - `render()` averages 1.3–2.8ms, with a worst single frame of 7.2ms on B6.
  - `update()` stays under 0.03ms.
  - Not one frame went over 33ms during play.
- **FX off:** about halves render cost on the Throne Room.
- **Memory:** the heap stays flat at 10MB, and the sprite cache levels off at about 250 entries.

The only hitch is one frame of 30–57ms the first time each floor is drawn, worst on 17F, 18F and the roof. It happens under the READY banner, so it's invisible in practice. If you want to remove it, pre-bake the next floor's art while the tower climb plays.

## 4. Hard to understand

| Severity | Finding | Where |
|---|---|---|
| low | The game-over prompt ("ENTER: BACK TO TOWER" / "ENTER: RETRY FROM PHASE n") only appears after 1.5s and blinks, so a quick glance can miss it. *(This first said there was no prompt; the screenshot was taken before it appeared.)* | `5745` |
| medium | **The cast screen is incomplete and inconsistent.** Wraith and Slime show from a fresh save, but Hound, Gargoyle and Spider only appear "once met". The three bosses never appear. Mechanics like dash, vents, the magnet, currents, darkness and webs are explained only by a one-line banner for 4 seconds before the floor starts. That's too short for "FACE THEM TO FREEZE. DASH TO SMASH". | `3760` |
| medium | **The minimap covers part of the maze.** It sits over the top-right corner of the play area and can hide enemies; the orange ghost is partly covered in the B2 screenshot. | `5543` |
| low | Once the story is beaten, the roof shows "NOT CLEARED YET" until you set a score. Endless rounds can never be cleared, so "ENDLESS" or "NO BEST YET" would read better. | `4085` |
| low | Esc in the prologue skips the prologue and the 1F intro together. | `backKey` |

## 5. Story inconsistencies

The dialog is from `bot/out/story.md`. A second pass checked every mechanics claim against the level config.

| Severity | Finding |
|---|---|
| **medium** | **The 9F banner says "FINAL LEVEL"**, but 22 floors follow. It looks like a leftover from the 9-floor version (`450`). |
| **medium** | **There are two penthouses.** Stage 4 (10F) is "PENTHOUSE", and the Skeleton King says "THE KING RENTS THE PENTHOUSE". Then ten floors stack above it, ending at **20F PENTHOUSE CRYPT**. |
| **medium** | **The 20F calcium joke appears twice.** Before the fight the King says "FRUIT DOESN'T HAVE ANY CALCIUM". In the ending he says "FRUIT HAS NO CALCIUM, BY THE WAY", and the Skeleton King reacts as if hearing it for the first time. |
| **medium** | **The 20F ending eats the milk, then uses it.** The Blob says "MILK. I ATE ALL OF IT. SORRY.", and the next line is "SO THEY MADE A SMOOTHIE. FRUIT, MILK, …". |
| medium | **The 19F banner "EVERYTHING AT ONCE. AGAIN" isn't true.** The floor has no hounds, wraiths, slimes, vents or currents. |
| medium | **Ghosts speak in intros of floors they aren't on:** Clyde on B1, B4, B5, B9 and 13F; Inky on B5 and 17F. In the B7 outro the Wraith speaks too, but B7 has no wraith. |
| medium | **B3's outro says "NEXT FLOOR DOWN IS FLOODED"**, but B4 is the Kennel. The water starts at B5. |
| low | Clyde says "I'VE BEEN FIRED TWICE TODAY" (9F), but he's only fired once on screen (3F). |
| low | The ghosts switch to working for the Blob in B1 with no explanation of how they got to the basement. |
| low | B11 says the fruit floats "PAST THE THRONE ROOM", but the throne room collapsed at the end of 10F. |
| low | The Skeleton King calls Pac-Man a "TENANT", and "RAISED MY RENT **AGAIN**" (19F) refers to a first raise that's never mentioned. |
| low | The narrator writes "FLOOR 1:" in Act 1 but "B1:" and "11F:" later. The tense also switches between past and present. |

## 6. Other screens (menu, tower, cast, dialog)

| Severity | Finding |
|---|---|
| **medium** | **On phones, the controls fall below the fold and can't be scrolled to** (`body { overflow: hidden }`). At 375×667 the last button row is cut off. In landscape (844×390) the canvas shrinks to about 200px wide and the whole button bar is off-screen. |
| info | Menu wraparound, the cast screen, Up/Down on the tower (all 32 floors reachable in physical order), tower clicks, the boss-retry dialog, the ending screen and 600 random key presses all worked without errors. |

## 7. Saving and loading

| Severity | Finding |
|---|---|
| **high** | The floor clear is lost if you close during the clear flash (see section 1). |
| medium | **A save with `"unlocked": 2.5` crashes the game** (`LEVELS[2.5]` is undefined). `-5` loads as-is. This only happens with hand-edited or corrupted saves, but `Math.floor` plus a clamp to `0` in the loader would close it (`1121`). |
| info | **These all work:** a reload during the outro keeps the clear; CONTINUE lands on the next floor; the King checkpoint survives a reload and the retry starts at phase 2; and settings and the high score persist. Garbage JSON, `null`, arrays, string or huge `unlocked`, bad `ck` values, v1, v2, v3 and future-version saves all load cleanly. |
| info | Reloading mid-floor drops that floor's dots, score and lives. That's probably intended, but nothing tells the player. |
