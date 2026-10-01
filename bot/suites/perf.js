// Per-floor frame cost: the bot plays each floor for a few seconds while update()/render() are timed.
const L = require('../lib');

module.exports = async function perf({ newPage, opts }) {
  console.log('\n== performance ==');
  const secs = opts.perfSecs || 12;
  const p = await newPage({ storage: { 'pacman.story': JSON.stringify({ v: 4, unlocked: 30, won: true, best: [], ck: {} }), 'pacman.infinite': '1' }, label: 'perf', viewport: { width: 760, height: 980 } });
  const rows = [];
  const floors = opts.perfFloors || [...Array(32).keys()];
  for (const fx of [true, false]) {
    await p.evaluate(fx => { if (window.__bot.snap().fx !== fx) window.__bot.tap('f'); }, fx);
    for (const i of fx ? floors : [floors[floors.length - 2], 20, 9]) {
      await p.evaluate(i => { window.__bot.jump(i); for (let k = 0; k < 50 && window.__bot.snap().state === 'dialog'; k++) window.__bot.tap('Escape'); }, i);
      await L.waitState(p, 'play', 8000);
      await p.evaluate(() => { const c = window.__bot.perf.cost; c.render = {}; c.update = {}; window.__bot.perf.byLevel = {}; window.__bot.perf.longFrames.length = 0; window.__bot.autopilot(true); });
      await p.waitForTimeout(secs * 1000);
      const r = await p.evaluate(() => {
        const sum = o => Object.values(o).reduce((a, b) => ({ n: a.n + b.n, sum: a.sum + b.sum, max: Math.max(a.max, b.max), over: a.over + (b.over8 ?? b.over33) }), { n: 0, sum: 0, max: 0, over: 0 });
        const pf = window.__bot.perf, s = window.__bot.snap();
        return { render: sum(pf.cost.render), update: sum(pf.cost.update), frame: sum(pf.byLevel), long: pf.longFrames.slice(0, 5), sprites: s.sprites, heap: s.heap, label: s.label, name: s.name };
      });
      await p.evaluate(() => window.__bot.autopilot(false));
      const row = { floor: i, label: r.label, name: r.name, fx,
        renderAvg: +(r.render.sum / r.render.n).toFixed(2), renderMax: +r.render.max.toFixed(1), renderOver8: r.render.over,
        updAvg: +(r.update.sum / r.update.n).toFixed(3), updMax: +r.update.max.toFixed(1),
        fps: +(1000 / (r.frame.sum / r.frame.n)).toFixed(0), frameMax: +r.frame.max.toFixed(0), framesOver33: r.frame.over, sprites: r.sprites, heap: r.heap };
      rows.push(row);
      console.log(`  ${fx ? 'fx ' : 'nofx'} ${row.label.padEnd(4)} ${String(row.name).padEnd(16)} render ${row.renderAvg}ms (max ${row.renderMax}) update ${row.updAvg}ms (max ${row.updMax}) fps ${row.fps} sprites ${row.sprites} heap ${row.heap}MB`);
      if (row.renderAvg > 8) L.finding('perf', 'medium', `${row.label} ${row.name}: render averages ${row.renderAvg}ms/frame${fx ? '' : ' even with FX off'} (half a 60fps budget)`, row);
      if (row.updMax > 16) L.finding('perf', 'medium', `${row.label} ${row.name}: a single update() took ${row.updMax}ms`, row);
      if (row.framesOver33 > 3) L.finding('perf', 'low', `${row.label} ${row.name}: ${row.framesOver33} frames over 33ms in ${secs}s`, { ...row, long: r.long });
    }
  }
  const first = rows[0], last = rows.filter(r => r.fx).pop();
  if (last && first && last.sprites > first.sprites * 4 && last.sprites > 400) L.finding('perf', 'low', `Sprite cache only grows: ${first.sprites} -> ${last.sprites} entries after visiting every floor (never evicted)`, { first: first.sprites, last: last.sprites });
  if (last && first && last.heap - first.heap > 80) L.finding('perf', 'low', `JS heap grew ${first.heap} -> ${last.heap} MB across floors`);
  await p.context().close();
  return rows;
};
