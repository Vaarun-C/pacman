// Saving and loading: quit at awkward moments, reload, corrupt the save, block storage.
const L = require('../lib');
const S = o => JSON.stringify({ v: 4, unlocked: 0, won: false, best: [], ck: {}, ...o });

async function toLevel(p, i) { // from anywhere: jump to floor i and skip its talk
  await p.evaluate(i => window.__bot.jump(i), i);
  await p.evaluate(() => { for (let k = 0; k < 50 && window.__bot.snap().state === 'dialog'; k++) window.__bot.tap('Escape'); });
}
async function playUntil(p, pred, timeout = 120000) {
  await p.evaluate(() => window.__bot.autopilot(true));
  const ok = await L.waitFor(p, pred, null, timeout);
  await p.evaluate(() => window.__bot.autopilot(false));
  return ok;
}

module.exports = async function save({ newPage }) {
  console.log('\n== save/load ==');
  let p, s;

  // 1. Clear floor 1, quit during the 3s clear flash, reload: is the clear kept?
  p = await newPage({ storage: {}, label: 'quit-during-clear' });
  await L.key(p, 'Enter'); await L.key(p, 'Escape'); // NEW GAME, skip talk
  await playUntil(p, () => window.__bot.snap().state === 'clear');
  s = await L.snap(p);
  await L.reload(p); s = await L.snap(p);
  if (s.save.unlocked < 1) L.finding('save', 'high', 'Closing the game during the "clear" flash (3s, 5.5s on bosses) loses the floor clear: progress is only written after the flash', { save: s.save });
  await p.context().close();

  // 2. Clear floor 1, quit during the outro dialog, reload
  p = await newPage({ storage: {}, label: 'quit-during-outro' });
  await L.key(p, 'Enter'); await L.key(p, 'Escape');
  await playUntil(p, () => ['dialog', 'tower'].includes(window.__bot.snap().state) && window.__bot.snap().dotsLeft === 0);
  await L.reload(p); s = await L.snap(p);
  if (s.save.unlocked < 1) L.finding('save', 'high', 'Reload during the outro loses the clear', { save: s.save });
  if (!s.menu.items.includes('CONTINUE')) L.finding('save', 'high', 'CONTINUE missing after clearing floor 1 and reloading');
  await L.key(p, 'Enter'); s = await L.snap(p);
  if (s.state !== 'tower' || s.tower.sel !== 1) L.finding('save', 'medium', 'CONTINUE does not land on the next unplayed floor', { tower: s.tower, state: s.state });
  await p.context().close();

  // 3. Mid-level reload: is anything kept (score, dots, lives)?
  p = await newPage({ storage: { 'pacman.story': S({ unlocked: 2 }) }, label: 'mid-level' });
  await toLevel(p, 2);
  await playUntil(p, () => window.__bot.snap().dotsLeft < window.__bot.snap().dotsTotal * 0.6, 60000);
  const before = await L.snap(p);
  await L.reload(p); s = await L.snap(p);
  L.finding('save', 'info', 'Reloading mid-floor drops all floor progress (dots, score, lives); you restart the floor from the tower', { before: { dotsLeft: before.dotsLeft, score: before.score }, after: { state: s.state } });
  await p.context().close();

  // 4. Boss checkpoint: get the King to phase 2, die/reload, does the retry start at phase 2?
  p = await newPage({ storage: { 'pacman.story': S({ unlocked: 9 }), 'pacman.infinite': '1' }, label: 'boss-ck' });
  await toLevel(p, 9);
  const reached = await playUntil(p, () => { const b = window.__bot.snap().boss; return b && b.phase >= 2 && window.__bot.snap().state === 'play'; }, 120000);
  if (reached) {
    const ck = await p.evaluate(() => window.__bot.ck());
    await L.reload(p); s = await L.snap(p);
    if (!ck[9]) L.finding('save', 'high', 'Reaching King phase 2 did not write a boss checkpoint');
    await L.key(p, 'Enter'); await L.key(p, 'Enter'); // CONTINUE -> tower -> enter 10F
    s = await L.snap(p);
    if (s.state === 'dialog') { await L.shot(p, 'boss-retry-dialog'); if (!/PHASE 2/.test(s.dlg.text)) L.finding('save', 'medium', 'Boss retry dialog does not mention the phase reached', { text: s.dlg.text }); }
    await L.key(p, 'Escape'); s = await L.snap(p);
    if (!s.boss || s.boss.phase < 2) L.finding('save', 'high', 'Boss checkpoint not applied after reload', { boss: s.boss, ck });
  } else L.finding('bot', 'info', 'Bot could not reach King phase 2 for the checkpoint test');
  await p.context().close();

  // 5. Corrupted / odd saves must not crash the boot.
  const odd = {
    'garbage JSON': '{not json', 'null': 'null', 'array': '[]', 'unlocked string': '{"unlocked":"5"}',
    'unlocked huge': S({ unlocked: 9999 }), 'unlocked negative': S({ unlocked: -5 }), 'unlocked fractional': S({ unlocked: 2.5 }),
    'unlocked NaN-ish': '{"v":4,"unlocked":1e999}', 'best not array': S({ unlocked: 3, best: 'x' }), 'ck null': S({ unlocked: 9, ck: null }),
    'ck bad hp': S({ unlocked: 9, ck: { 9: 'abc' } }), 'ck over max': S({ unlocked: 9, ck: { 9: 999 } }), 'ck negative': S({ unlocked: 9, ck: { 9: -3 } }),
    'v1 save (pre basement)': '{"unlocked":9,"won":true,"best":[100,200],"bossCk":6}', 'v2 save won': '{"v":2,"unlocked":20,"won":true,"best":[]}',
    'v3 save': '{"v":3,"unlocked":15,"won":false,"best":[]}', 'future v9': '{"v":9,"unlocked":5,"won":false,"best":[],"ck":{}}',
  };
  for (const [name, raw] of Object.entries(odd)) {
    p = await newPage({ storage: { 'pacman.story': raw }, label: 'odd-' + name });
    await p.waitForTimeout(300);
    s = await L.snap(p);
    const errs = p.errors.length;
    // try to continue and enter the floor shown
    if (s.menu.items[0] === 'CONTINUE') { await L.key(p, 'Enter'); await p.waitForTimeout(400); await L.key(p, 'Enter'); await p.waitForTimeout(300); }
    const after = await L.snap(p);
    const pf = await L.pageFindings(p);
    const detail = { raw, loaded: s.save, menu: s.menu.items, after: { state: after.state, level: after.level, boss: after.boss } };
    if (errs || p.errors.length) L.finding('save', 'high', `Save "${name}" crashes the game`, { ...detail, errors: p.errors });
    else if (after.boss && !(after.boss.hp > 0)) L.finding('save', 'medium', `Save "${name}" starts a boss with invalid HP`, detail);
    else if (s.save.unlocked < 0 || !Number.isInteger(s.save.unlocked)) L.finding('save', 'medium', `Save "${name}" loads with unlocked=${s.save.unlocked}`, detail);
    else if (pf.length) L.finding('save', 'medium', `Save "${name}" leads to: ${pf.map(f => f.msg).join('; ')}`, detail);
    else L.finding('save', 'info', `Save "${name}" handled`, detail);
    await p.context().close();
  }

  // 6. Storage blocked (private mode / disabled cookies)
  p = await newPage({ storage: {}, blockStorage: true, label: 'no-storage' });
  await L.key(p, 'Enter'); await L.key(p, 'Escape');
  s = await L.snap(p);
  if (p.errors.length || s.state !== 'ready') L.finding('save', 'high', 'Game breaks when localStorage is blocked', { state: s.state, errors: p.errors });
  else L.finding('save', 'info', 'Blocked storage: game runs, nothing persists, no warning shown to the player');
  await p.context().close();

  // 7. Settings persistence: FX, sound, infinite lives
  p = await newPage({ storage: {}, label: 'settings' });
  await L.key(p, 'f'); await L.key(p, 'm'); await L.key(p, 'i');
  const a = await L.snap(p);
  await L.reload(p); s = await L.snap(p);
  if (s.fx !== a.fx) L.finding('save', 'low', 'FX setting not kept after reload');
  if (s.muted !== a.muted) L.finding('save', 'low', 'Sound on/off is not remembered after reload (FX and infinite lives are)', { before: a.muted, after: s.muted });
  if (s.infinite) L.finding('save', 'info', 'INFINITE LIVES persists across reloads (a test aid that also silently disables high scores)');
  await p.context().close();

  // 8. High score persistence and the infinite-lives rule
  p = await newPage({ storage: {}, label: 'hiscore' });
  await L.key(p, 'Enter'); await L.key(p, 'Escape');
  await playUntil(p, () => window.__bot.snap().score >= 300, 60000);
  s = await L.snap(p);
  await L.reload(p); const s2 = await L.snap(p);
  if (s2.hi < s.score) L.finding('save', 'medium', 'High score not kept after reload', { score: s.score, hi: s2.hi });
  await p.context().close();

  // 9. Two tabs at once: last writer wins?
  p = await newPage({ storage: { 'pacman.story': S({ unlocked: 5 }) }, label: 'tab-a' });
  const ctx = p.context(); const p2 = await ctx.newPage(); await p2.goto('http://pacman.test/'); await p2.waitForFunction(() => window.__bot);
  await p.evaluate(() => window.__bot.tap('u')); // tab A unlocks everything
  await p2.evaluate(() => { window.__bot.tap('Enter'); }); // tab B continue
  await toLevel(p2, 0);
  await playUntil(p2, () => window.__bot.snap().state === 'clear' || window.__bot.snap().state === 'dialog', 60000);
  await p2.waitForTimeout(4000);
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem('pacman.story')));
  if (raw.unlocked < 30) L.finding('save', 'low', 'Two open tabs overwrite each other\'s progress (the stale tab rewrites its in-memory save)', { finalUnlocked: raw.unlocked, won: raw.won });
  await ctx.close();
};
