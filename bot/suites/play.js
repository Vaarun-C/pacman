// The bot plays the story floor by floor (through the real tower UI), with the probe watching for
// glitches and frame hitches. Floors it can't clear in time are skipped with the game's own N key.
const L = require('../lib');

module.exports = async function play({ newPage, opts }) {
  console.log('\n== playthrough ==');
  const from = opts.from ?? 0, to = opts.to ?? 31, budget = (opts.floorSecs || 150) * 1000;
  const storage = { 'pacman.infinite': opts.lives ? '0' : '1' };
  if (from > 0) storage['pacman.story'] = JSON.stringify({ v: 4, unlocked: Math.min(from, 30), won: from > 30, best: [], ck: {} });
  const p = await newPage({ storage, label: 'playthrough', viewport: { width: 760, height: 980 } });
  const results = [];
  const log = [];
  // Start: NEW GAME (or CONTINUE) through the menu, like a player would.
  let s = await L.snap(p);
  await L.key(p, 'Enter', 1, 200);
  if (from === 0) { log.push(...await L.readDialog(p)); }
  else { await p.waitForTimeout(1500); await L.key(p, 'Enter'); }
  await p.evaluate(() => window.__bot.autopilot(true));
  for (let floor = from; floor <= to; floor++) {
    s = await L.snap(p);
    if (s.state === 'dialog') log.push(...(await L.readDialog(p)).map(l => ({ ...l, floor })));
    s = await L.snap(p);
    if (s.level !== floor) { L.finding('play', 'medium', `Expected to be on floor index ${floor}, found ${s.level} (${s.state})`); floor = s.level; }
    const label = s.label, name = s.name, t0 = Date.now(); let deaths = 0, last = s.state, phases = new Set(), skipped = false;
    await p.waitForTimeout(1200); await L.shot(p, `floor-${String(floor).padStart(2, '0')}-${label}-start`);
    let midShot = false;
    while (true) {
      s = await L.snap(p);
      if (s.state === 'dying' && last !== 'dying') deaths++;
      if (s.boss) phases.add(s.boss.phase);
      last = s.state;
      if (!midShot && Date.now() - t0 > 8000 && s.state === 'play') { midShot = true; await L.shot(p, `floor-${String(floor).padStart(2, '0')}-${label}-mid`); }
      if (s.state === 'over') { // only when playing with real lives
        await L.shot(p, `floor-${label}-gameover`);
        results.push({ floor, label, name: s.name, result: 'game over', secs: (Date.now() - t0) / 1000, deaths });
        await p.waitForTimeout(1700); await L.key(p, 'Enter'); await p.waitForTimeout(500);
        s = await L.snap(p); if (s.state === 'tower') await L.key(p, 'Enter');
        continue;
      }
      if (['clear', 'tower', 'ending'].includes(s.state) || (s.state === 'dialog' && s.dlg && s.dlg.then !== 'ready')) break;
      if (Date.now() - t0 > budget) { skipped = true; await L.shot(p, `floor-${label}-timeout`); await p.keyboard.press('n'); break; }
      await p.waitForTimeout(200);
    }
    const secs = (Date.now() - t0) / 1000;
    s = await L.snap(p);
    if (s.state === 'clear') await L.shot(p, `floor-${String(floor).padStart(2, '0')}-${label}-clear`);
    results.push({ floor, label, name, result: skipped ? 'SKIPPED (bot timed out)' : 'cleared', secs: +secs.toFixed(1), deaths, phases: [...phases].join('') || undefined, score: s.score });
    console.log(`  ${label.padEnd(4)} ${String(name).padEnd(16)} ${skipped ? 'SKIPPED' : 'cleared'} in ${secs.toFixed(0)}s, ${deaths} deaths`);
    if (floor === to) break;
    // Wait through the clear flash, the outro, and the tower climb, then enter the next floor via the tower.
    await L.waitFor(p, () => ['dialog', 'tower', 'ending', 'ready'].includes(window.__bot.snap().state), null, 15000);
    s = await L.snap(p);
    if (s.state === 'dialog') log.push(...(await L.readDialog(p)).map(l => ({ ...l, floor, outro: true })));
    s = await L.snap(p);
    if (s.state === 'ending') {
      await p.waitForTimeout(3000); await L.shot(p, 'ending'); await L.key(p, 'Enter'); await p.waitForTimeout(500);
      s = await L.snap(p);
    }
    if (s.state === 'tower') {
      await p.waitForTimeout(1600); await L.shot(p, `tower-after-${label}`);
      s = await L.snap(p);
      if (s.tower.sel !== floor + 1) L.finding('play', 'low', `After clearing ${label} the tower cursor is on ${s.tower.sel}, not the next floor`);
      await L.key(p, 'Enter');
    }
  }
  const pf = await L.pageFindings(p);
  const perf = await p.evaluate(() => window.__bot.perf);
  await p.context().close();
  return { results, dialog: log, pageFindings: pf, perf };
};
