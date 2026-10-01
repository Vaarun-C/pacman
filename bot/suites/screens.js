// Menus, cast screen, tower map, dialog, pause and input handling outside of gameplay.
const L = require('../lib');
const FULL = JSON.stringify({ v: 4, unlocked: 30, won: true, best: [], ck: {} });

module.exports = async function screens({ newPage }) {
  console.log('\n== screens ==');
  // ---- fresh main menu ----
  let p = await newPage({ storage: {}, label: 'menu-fresh' });
  let s = await L.snap(p);
  await L.shot(p, 'menu-fresh');
  if (s.menu.items.includes('CONTINUE')) L.finding('screens', 'high', 'Fresh install shows CONTINUE');
  // wrap-around both ways
  await L.key(p, 'ArrowUp'); s = await L.snap(p);
  if (s.menu.sel !== s.menu.items.length - 1) L.finding('screens', 'low', 'Menu does not wrap from top to bottom');
  await L.key(p, 'ArrowDown'); s = await L.snap(p);
  if (s.menu.sel !== 0) L.finding('screens', 'low', 'Menu does not wrap from bottom to top');
  // pause keys on the menu should do nothing
  await L.key(p, 'p'); s = await L.snap(p);
  if (s.paused) L.finding('screens', 'medium', 'P pauses the game on the main menu');
  const pauseLabel = await p.locator('#pauseBtn').textContent();
  await p.click('#pauseBtn'); s = await L.snap(p);
  if (s.paused || (await p.locator('#pauseBtn').textContent()) !== pauseLabel) L.finding('screens', 'low', 'PAUSE button changes state/label on the main menu');
  // SKIP LEVEL on the menu: must not start or save anything
  await p.click('#skipBtn'); s = await L.snap(p);
  if (s.state !== 'menu' || s.save.unlocked !== 0) L.finding('screens', 'high', 'SKIP LEVEL button acts from the main menu', { state: s.state, save: s.save });
  // Space on the menu = select (it's also the dash key)
  // ---- cast screen ----
  await L.key(p, 'ArrowDown'); await L.key(p, 'Enter');
  s = await L.snap(p);
  if (s.state !== 'cast') L.finding('screens', 'high', 'Selecting CAST does not open the cast screen', { state: s.state });
  await p.waitForTimeout(1500); await L.shot(p, 'cast');
  await L.key(p, 'ArrowLeft'); await L.key(p, 'p');
  s = await L.snap(p);
  if (s.state !== 'cast' || s.paused) L.finding('screens', 'medium', 'Arrow/P keys change state on the cast screen', { state: s.state, paused: s.paused });
  await L.key(p, 'Escape'); s = await L.snap(p);
  if (s.state !== 'menu') L.finding('screens', 'medium', 'Esc does not leave the cast screen');
  if (s.menu.sel !== 0) L.finding('qol', 'low', 'Returning from CAST resets the menu cursor to the top instead of remembering CAST', { sel: s.menu.sel });
  // ---- NEW GAME -> prologue -> skip -> ready ----
  await p.evaluate(() => { window.__bot.snap(); });
  s = await L.snap(p); const ng = s.menu.items.indexOf('NEW GAME');
  while ((await L.snap(p)).menu.sel !== ng) await L.key(p, 'ArrowDown');
  await L.key(p, 'Enter');
  s = await L.snap(p);
  if (s.state !== 'dialog') L.finding('screens', 'high', 'NEW GAME does not open the prologue');
  await p.waitForTimeout(400); await L.shot(p, 'prologue-typing');
  // P during dialog
  await L.key(p, 'p'); s = await L.snap(p);
  if (s.paused) L.finding('screens', 'medium', 'P pauses during dialog (pause state leaks into the dialog screen)');
  // Esc skips the whole conversation (prologue + floor intro)
  await L.key(p, 'Escape'); s = await L.snap(p);
  if (s.state !== 'ready') L.finding('screens', 'medium', 'Esc in the prologue does not skip to the level', { state: s.state });
  else L.finding('ux', 'info', 'Esc skips the prologue AND the floor 1 intro in one press (no way to skip only the current line block)');
  await p.waitForTimeout(800); await L.shot(p, 'ready-1F');
  // pausing in ready then ESC
  await L.key(p, 'Escape'); s = await L.snap(p);
  if (!s.paused) L.finding('screens', 'low', 'Esc during READY does not pause');
  await L.shot(p, 'paused-ready');
  // there is no quit-to-menu from a level?
  await L.key(p, 'Escape'); await L.key(p, 'Escape');
  s = await L.snap(p);
  if (!['menu', 'tower'].includes(s.state)) L.finding('ux', 'medium', 'No way to quit a level back to the tower/menu from the keyboard: Esc only toggles pause', { state: s.state });
  await p.context().close();

  // ---- CONTINUE / tower map with full progress ----
  p = await newPage({ storage: { 'pacman.story': FULL }, label: 'tower-full' });
  s = await L.snap(p);
  if (s.menu.items[0] !== 'CONTINUE') L.finding('screens', 'high', 'CONTINUE missing with saved progress');
  await L.key(p, 'Enter'); await p.waitForTimeout(1200);
  s = await L.snap(p); await L.shot(p, 'tower-top');
  if (s.state !== 'tower') L.finding('screens', 'high', 'CONTINUE does not open the tower');
  if (s.tower.sel !== s.save.unlocked && !(s.save.won && s.tower.sel === 31)) L.finding('screens', 'low', 'Tower opens on an unexpected floor', { sel: s.tower.sel });
  // walk every reachable floor down then up and make sure every floor is visited exactly once
  const visited = [s.tower.sel];
  for (let i = 0; i < 40; i++) { await L.key(p, 'ArrowDown', 1, 30); const t = (await L.snap(p)).tower.sel; if (t === visited[visited.length - 1]) break; visited.push(t); }
  await p.waitForTimeout(1200); await L.shot(p, 'tower-bottom');
  const all = [...Array(32).keys()];
  const missing = all.filter(i => !visited.includes(i));
  if (missing.length) L.finding('screens', 'medium', 'Some floors cannot be reached with Up/Down on the tower map', { missing });
  const dupes = visited.filter((v, i) => visited.indexOf(v) !== i);
  if (dupes.length) L.finding('screens', 'medium', 'Tower Up/Down visits a floor twice', { order: visited });
  L.finding('ux', 'info', 'Tower Down-arrow order from the top', { order: visited.join(',') });
  // left/right do nothing on the tower — fine, but check
  await L.key(p, 'ArrowLeft'); await L.key(p, 'ArrowRight');
  // click floors on the tower
  await L.clickTile(p, 14, 18); s = await L.snap(p);
  await L.shot(p, 'tower-click');
  // Enter a floor from the tower, then game over flow
  await L.key(p, 'Escape'); s = await L.snap(p);
  if (s.state !== 'menu') L.finding('screens', 'medium', 'Esc on tower does not return to the menu');
  if (s.menu.sel !== 0) L.finding('qol', 'low', 'Menu cursor resets after leaving the tower');
  await p.context().close();

  // ---- NEW GAME with progress asks to confirm ----
  p = await newPage({ storage: { 'pacman.story': FULL }, label: 'newgame-confirm' });
  await L.key(p, 'ArrowDown'); await L.key(p, 'Enter');
  s = await L.snap(p); await L.shot(p, 'newgame-confirm');
  if (!s.menu.confirm) L.finding('save', 'high', 'NEW GAME wipes progress without a confirmation');
  await L.key(p, 'Escape'); s = await L.snap(p);
  if (s.menu.confirm) L.finding('qol', 'low', 'Esc does not cancel the "erase progress?" confirmation on the main menu', { state: s.state });
  await L.key(p, 'ArrowUp'); await L.key(p, 'ArrowDown'); s = await L.snap(p);
  if (s.menu.confirm) L.finding('save', 'medium', 'Moving the cursor away does not cancel the NEW GAME confirmation');
  await p.context().close();

  // ---- phone-size layout ----
  for (const vp of [{ width: 375, height: 667 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1920, height: 1080 }]) {
    p = await newPage({ storage: { 'pacman.story': FULL }, viewport: vp, touch: vp.width < 900, label: `vp-${vp.width}` });
    await p.waitForTimeout(500);
    const m = await p.evaluate(() => {
      const c = document.getElementById('game').getBoundingClientRect(), b = document.getElementById('bar').getBoundingClientRect();
      const d = document.getElementById('dpad').getBoundingClientRect();
      return { canvas: [c.left, c.top, c.width, c.height].map(Math.round), bar: [b.top, b.bottom].map(Math.round), dpad: [d.top, d.bottom, d.height].map(Math.round),
        scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight };
    });
    const name = `${vp.width}x${vp.height}`;
    await p.screenshot({ path: `${L.OUT}/shots/viewport-${name}.png` });
    if (m.scrollW > m.iw + 1) L.finding('screens', 'medium', `Horizontal overflow at ${name}`, m);
    if (m.bar[1] > m.ih + 1 || m.dpad[1] > m.ih + 1) L.finding('screens', 'medium', `Controls fall below the fold at ${name} (body has overflow:hidden so they cannot be scrolled to)`, m);
    if (m.canvas[2] < Math.min(vp.width, vp.height) * 0.5) L.finding('screens', 'low', `Game canvas is small at ${name}`, m);
    await p.context().close();
  }

  // ---- mashing keys on every screen ----
  p = await newPage({ storage: { 'pacman.story': FULL }, label: 'mash' });
  const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', ' ', 'p', 'm', 'f', 'n', 'u'];
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const states = new Set();
  for (let i = 0; i < 600; i++) {
    const k = keys[Math.floor(rnd() * keys.length)];
    await p.keyboard.press(k);
    if (i % 10 === 0) { const s = await L.snap(p); states.add(s.state); }
    await p.waitForTimeout(25);
  }
  L.finding('screens', 'info', 'Key mash visited states', { states: [...states].join(',') });
  for (const f of await L.pageFindings(p)) L.finding('screens', f.kind === 'error' ? 'high' : 'medium', `[mash] ${f.msg}`, { at: f.at, count: f.count });
  await p.context().close();
};
