// Targeted gameplay edge cases: pausing at odd moments, focus loss, game over, debug keys, roof rounds.
const L = require('../lib');
const S = o => JSON.stringify({ v: 4, unlocked: 0, won: false, best: [], ck: {}, ...o });
async function toLevel(p, i) {
  await p.evaluate(i => window.__bot.jump(i), i);
  await p.evaluate(() => { for (let k = 0; k < 50 && window.__bot.snap().state === 'dialog'; k++) window.__bot.tap('Escape'); });
}
const ap = (p, on) => p.evaluate(on => window.__bot.autopilot(on), on);

module.exports = async function edge({ newPage }) {
  console.log('\n== edge cases ==');
  let p, s;

  // Focus loss mid-level: hiding the tab should pause; so should the window losing focus (alt-tab).
  p = await newPage({ storage: { 'pacman.story': S({ unlocked: 2 }) }, label: 'focus' });
  await toLevel(p, 2); await L.waitState(p, 'play'); await ap(p, true); await p.waitForTimeout(1500); await ap(p, false);
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  s = await L.snap(p);
  if (!s.paused) L.finding('edge', 'medium', 'Hiding the tab mid-level does not pause the game', { state: s.state });
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { get: () => false, configurable: true }); });
  await p.keyboard.press('p'); await p.evaluate(() => window.dispatchEvent(new Event('blur')));
  s = await L.snap(p);
  if (!s.paused && s.state === 'play') L.finding('qol', 'low', 'Alt-tabbing to another app (window blur, tab still visible) does not pause; only hiding the tab does');
  await p.keyboard.press('ArrowLeft'); s = await L.snap(p);
  if (!s.paused) L.finding('ux', 'low', 'Any arrow key silently unpauses the game (easy to unpause by accident; no countdown before play resumes)');
  await p.context().close();

  // Pause during each transient state.
  p = await newPage({ storage: { 'pacman.story': S({ unlocked: 2 }), 'pacman.infinite': '1' }, label: 'pause-transient' });
  await toLevel(p, 2);
  await L.key(p, 'p'); const r0 = await L.snap(p); await p.waitForTimeout(1500); const r1 = await L.snap(p);
  if (r1.state !== 'ready' || Math.abs(r0.timer - r1.timer) > 0.01) L.finding('edge', 'medium', 'READY countdown keeps running while paused');
  await L.key(p, 'p');
  // Pause during dying
  await L.waitState(p, 'play'); // let a ghost catch us
  const died = await L.waitState(p, 'dying', 90000);
  if (died) {
    await L.key(p, 'p'); const d0 = await L.snap(p); await p.waitForTimeout(1200); const d1 = await L.snap(p);
    if (d0.timer !== d1.timer) L.finding('edge', 'medium', 'Death animation keeps running while paused');
    await L.shot(p, 'paused-while-dying');
    await L.key(p, 'p');
  }
  await p.context().close();

  // Game over with real lives on floor 2, then Enter/Esc behaviour.
  p = await newPage({ storage: { 'pacman.story': S({ unlocked: 1 }), 'pacman.infinite': '0' }, label: 'gameover' });
  await toLevel(p, 1);
  const over = await L.waitState(p, 'over', 200000);
  if (over) {
    s = await L.snap(p); await L.shot(p, 'game-over');
    if (s.lives !== 0) L.finding('edge', 'low', 'Lives not 0 on the game over screen', { lives: s.lives });
    await p.keyboard.press('Enter'); s = await L.snap(p);
    if (s.state !== 'over') L.finding('edge', 'low', 'Enter on game over acts before the 1.5s guard', { timer: s.timer });
    await L.waitFor(p, () => window.__bot.snap().timer > 1.6, null, 10000); await p.keyboard.press('Enter'); s = await L.snap(p);
    if (s.state !== 'tower') L.finding('edge', 'medium', 'Enter on game over (normal floor) does not return to the tower', { state: s.state });
    else if (s.tower.sel !== 1) L.finding('ux', 'low', 'After game over the tower cursor is not on the floor you died on', { sel: s.tower.sel });
    L.finding('ux', 'info', 'Game over on a normal floor sends you to the tower; on a boss floor Enter restarts the fight. The two screens look the same but behave differently.');
  } else L.finding('bot', 'info', 'Idle Pac-Man was never caught on floor 2 within 200s');
  await p.context().close();

  // Debug keys reachable by players: N skips floors, U unlocks everything, I gives infinite lives.
  p = await newPage({ storage: {}, label: 'debug-keys' });
  await L.key(p, 'u'); s = await L.snap(p);
  if (s.save.unlocked > 0) L.finding('ux', 'medium', 'Pressing U on the main menu silently unlocks every floor and the ending (debug key reachable by players), saved permanently', { save: s.save });
  await p.context().close();
  p = await newPage({ storage: {}, label: 'skip-key' });
  await L.key(p, 'Enter'); await L.key(p, 'Escape'); await L.key(p, 'n'); s = await L.snap(p);
  if (s.save.unlocked > 0) L.finding('ux', 'medium', 'Pressing N mid-level counts the floor as cleared and saves it (debug key; the SKIP LEVEL button is also always visible)', { save: s.save });
  await p.context().close();

  // N during the Skeleton King's clear flash skips the ending.
  p = await newPage({ storage: { 'pacman.story': S({ unlocked: 30 }) }, label: 'skip-ending' });
  await toLevel(p, 30); await L.key(p, 'n'); s = await L.snap(p);
  L.finding('edge', s.level === 31 ? 'low' : 'info', `Skipping the last boss with N goes to ${s.level === 31 ? 'the ROOF without the ending cutscene' : 'state ' + s.state}`, { state: s.state, level: s.level, won: s.save.won });
  await p.context().close();

  // Roof rounds: play a few, check numbering and the best score.
  p = await newPage({ storage: { 'pacman.story': S({ unlocked: 30, won: true }), 'pacman.infinite': '1' }, label: 'roof' });
  await L.key(p, 'Enter'); await p.waitForTimeout(1200); s = await L.snap(p);
  if (s.tower.sel !== 31) L.finding('screens', 'low', 'CONTINUE after winning does not land on the roof', { sel: s.tower.sel });
  await L.key(p, 'Enter'); await p.evaluate(() => { for (let k = 0; k < 50 && window.__bot.snap().state === 'dialog'; k++) window.__bot.tap('Escape'); });
  await ap(p, true);
  const roof = [];
  for (let k = 0; k < 3; k++) {
    s = await L.snap(p); roof.push({ level: s.level, label: s.label });
    if (k === 0) { await p.waitForTimeout(800); await L.shot(p, 'roof-round-1'); }
    const lv = s.level;
    if (!await L.waitFor(p, lv => window.__bot.snap().level > lv, lv, 150000)) break;
  }
  await ap(p, false);
  L.finding('edge', 'info', 'Roof rounds visited', { roof });
  await p.context().close();

  // Hold two directions, release one: does Pac-Man fall back to the other?
  p = await newPage({ storage: { 'pacman.story': S({ unlocked: 2 }) }, label: 'two-keys' });
  await toLevel(p, 0); await L.waitState(p, 'play');
  await p.keyboard.down('ArrowLeft'); await p.waitForTimeout(400); await p.keyboard.down('ArrowUp'); await p.waitForTimeout(400); await p.keyboard.up('ArrowUp');
  await p.waitForTimeout(600); await p.keyboard.up('ArrowLeft');
  for (const f of await L.pageFindings(p)) L.finding('edge', 'medium', `[two-keys] ${f.msg}`, { at: f.at });
  await p.context().close();

  // Resize mid-level.
  p = await newPage({ storage: { 'pacman.story': S({ unlocked: 2 }), 'pacman.infinite': '1' }, label: 'resize' });
  await toLevel(p, 2); await ap(p, true);
  for (const [w, h] of [[400, 700], [1400, 900], [700, 400], [900, 1000]]) { await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(700); }
  await L.shot(p, 'after-resize');
  for (const f of await L.pageFindings(p)) L.finding('edge', 'medium', `[resize] ${f.msg}`, { at: f.at });
  await p.context().close();
};
