// Injected inside the game's IIFE (just before the boot line), so it can see every closure:
// G, pac, save, M, W, H, LEVELS, STORY, pacOK, centiSegments, ventState ...
// Exposes window.__bot: a state reader, an invariant monitor, a perf sampler and an autopilot
// that plays by dispatching real keyboard events.
window.__bot = (() => {
  const KEY = { U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight' };
  const nameOf = d => d === U ? 'U' : d === D ? 'D' : d === L ? 'L' : d === R ? 'R' : null;
  const key = (type, k) => window.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
  const tap = k => { key('keydown', k); key('keyup', k); };

  // ---------- findings ----------
  const findings = [], seen = new Map();
  function flag(kind, msg, extra = {}) {
    const sig = kind + '|' + msg;
    const n = (seen.get(sig) || 0) + 1; seen.set(sig, n);
    if (n > 1) { const f = findings.find(f => f.sig === sig); if (f) f.count = n; return; }
    findings.push({ sig, kind, msg, count: 1, at: ctxInfo(), t: performance.now(), ...extra });
  }
  const ctxInfo = () => ({ state: G.state, level: G.lvIndex, label: G.lvIndex >= ROOF ? 'ROOF' : floorLabel(G.lvIndex),
    name: FLOOR_NAMES[G.lvIndex] || 'ROOF', pac: { x: +pac.x.toFixed(2), y: +pac.y.toFixed(2) }, lives: G.lives, score: G.score });

  // ---------- perf ----------
  const perf = { frames: [], longFrames: [], byLevel: {} };
  let lastFrame = 0;

  // Time the game's own update() and render() (function declarations are rebindable in this scope).
  const cost = { render: {}, update: {} };
  const tally = (bucket, ms) => { const k = `${G.state}|${G.lvIndex}`; const b = bucket[k] || (bucket[k] = { n: 0, sum: 0, max: 0, over8: 0 }); b.n++; b.sum += ms; b.max = Math.max(b.max, ms); if (ms > 8) b.over8++; };
  const _render = render, _update = update;
  render = function () { const t = performance.now(); _render(); tally(cost.render, performance.now() - t); };
  update = function (dt) { const t = performance.now(); _update(dt); tally(cost.update, performance.now() - t); };
  perf.cost = cost;

  // ---------- invariants, checked every animation frame ----------
  const watch = { state: null, since: 0, timer: null, timerSince: 0, dots: -1, dotsSince: 0, pos: '', posSince: 0, score: 0, lv: -1 };
  const bad = v => typeof v !== 'number' || !Number.isFinite(v);
  const actorLists = () => ({ ghost: G.ghosts, wraith: G.wraiths, slime: G.slimes, hound: G.hounds, gargoyle: G.gargoyles,
    spider: G.spiders, minion: G.minions, bone: G.bones, blobule: G.blobules, buddy: G.buddies, orb: G.orbs });
  function check(now) {
    const dt = lastFrame ? now - lastFrame : 0; lastFrame = now;
    if (dt && !document.hidden) {
      const k = `${G.state}|${G.lvIndex}`;
      const b = perf.byLevel[k] || (perf.byLevel[k] = { n: 0, sum: 0, max: 0, over33: 0 });
      b.n++; b.sum += dt; b.max = Math.max(b.max, dt); if (dt > 33.4) b.over33++;
      if (dt > 50 && perf.longFrames.length < 400) perf.longFrames.push({ dt: Math.round(dt), ...ctxInfo(), fx: fxOn, sprites: SPR.size });
    }
    const st = G.state, inLevel = !MENU_STATES.has(st) && st !== 'over';
    if (st !== watch.state || G.lvIndex !== watch.stLv) { watch.state = st; watch.stLv = G.lvIndex; watch.since = now; }
    // positions
    if (bad(pac.x) || bad(pac.y)) flag('glitch', 'Pac-Man position is NaN/Infinity');
    for (const [kind, list] of Object.entries(actorLists())) for (const a of list || []) {
      if (bad(a.x) || bad(a.y)) flag('glitch', `${kind} position is NaN/Infinity`, { state: a.state });
      else if (inLevel && a.state !== 'saved' && (a.y < -6 || a.y > H + 6 || a.x < -8 || a.x > W + 8)) flag('glitch', `${kind} wandered far outside the maze`, { ax: a.x, ay: a.y, state: a.state });
    }
    if (G.boss && (bad(G.boss.x) || bad(G.boss.y) || bad(G.boss.hp))) flag('glitch', 'Boss position/hp is NaN');
    if (inLevel && st === 'play') {
      const c = Math.round(pac.x), r = Math.round(pac.y);
      if (c >= 0 && c < W && !pacOK(c, r) && !G.reform.on) flag('glitch', 'Pac-Man is standing inside a wall tile', { tile: M[r] && M[r][c] });
      if (Math.abs(pac.x - Math.round(pac.x)) > 0.02 && Math.abs(pac.y - Math.round(pac.y)) > 0.02) flag('glitch', 'Pac-Man is off the grid on both axes (moving diagonally)');
      for (const g of G.ghosts) if (g.mode === 'active' && !g.eaten && Number.isInteger(g.x) && Number.isInteger(g.y) && !ghostOK(g.x, g.y) && !G.reform.on)
        flag('glitch', `ghost ${g.name} is inside a wall`);
    }
    if (G.lives < 0) flag('glitch', 'Lives went negative');
    if (G.dotsLeft < 0) flag('glitch', 'dotsLeft went negative', { dotsLeft: G.dotsLeft });
    if (inLevel && st === 'play' && !G.flyDots.length && !G.respawns.length && !G.reform.on) {
      let n = 0; for (let i = 0; i < W * H; i++) if (G.dots[i]) n++;
      if (n !== G.dotsLeft) flag('glitch', 'dotsLeft counter disagrees with dots on the board', { counter: G.dotsLeft, board: n, cfg: G.cfg.maze });
    }
    if (G.paused && MENU_STATES.has(st)) flag('glitch', `Game is paused while on a ${st} screen`);
    if (G.lvIndex !== watch.lv) { watch.lv = G.lvIndex; watch.score = G.score; }
    if (G.score < watch.score && inLevel) flag('glitch', 'Score went down mid-level', { from: watch.score, to: G.score });
    watch.score = G.score;
    // stuck timers in states that should run out on their own
    const auto = { ready: 6, dying: 5, clear: 8, eatpause: 3, phase: 6 };
    if (!G.paused && auto[st] && now - watch.since > auto[st] * 1000 / (window.__speed || 1) + 1500)
      flag('glitch', `Stuck in '${st}' for over ${auto[st]}s`, { timer: G.timer });
    // pac frozen in play while a key is held
    const pos = `${pac.x.toFixed(2)},${pac.y.toFixed(2)}`;
    if (pos !== watch.pos || st !== 'play' || G.paused) { watch.pos = pos; watch.posSince = now; }
    else if (held.length && now - watch.posSince > 4000 / (window.__speed || 1)) {
      flag('stuck', 'Pac-Man has not moved for 4s while a direction is held', { held: held.map(nameOf), want: nameOf(G.want), dir: nameOf(pac.dir) });
      watch.posSince = now;
    }
    if (st === 'play' && G.dotsLeft !== watch.dots) { watch.dots = G.dotsLeft; watch.dotsSince = now; }
  }

  // ---------- reading the board ----------
  const inb = (c, r) => r >= 0 && r < H && c >= 0 && c < W;
  function nbrs(c, r) {
    const out = [];
    for (const d of [U, L, D, R]) {
      let nc = c + d.x; const nr = r + d.y;
      if (nc < 0 || nc >= W) { if (!tunnelRows.has(r)) continue; nc = (nc + W) % W; }
      if (!inb(nc, nr) || !pacOK(nc, nr)) continue;
      out.push([nc, nr, d]);
    }
    return out;
  }
  // Every thing that can kill Pac-Man right now, and every thing worth chasing.
  function threats() {
    const danger = [], prey = [], fr = G.fright, chill = G.chill > 0;
    const scared = fr > 0.8 || chill;
    for (const g of G.ghosts) {
      if (g.mode === 'house' || g.eaten) continue;
      if ((g.frightened && fr > 0.8) || chill) prey.push(g); else if (!g.frightened || fr < 0.8) danger.push({ x: g.x, y: g.y, r: 3 });
    }
    for (const w of G.wraiths) if (w.state === 'active' || w.state === 'leave') (chill ? prey.push(w) : danger.push({ x: w.x, y: w.y, r: 3, walls: true }));
    for (const s of G.slimes) if (s.state === 'active') (scared ? prey.push(s) : danger.push({ x: s.x, y: s.y, r: s.kind === 'big' ? 3 : 2 }));
    for (const h of G.hounds) if (h.state === 'hunt') (scared ? prey.push(h) : danger.push({ x: h.x, y: h.y, r: 4 }));
    for (const g of G.gargoyles) if (g.state === 'active' || g.state === 'perch') danger.push({ x: g.x, y: g.y, r: g.state === 'active' ? 2 : 1 });
    for (const s of G.spiders) if (s.state === 'active') (scared ? prey.push(s) : danger.push({ x: s.x, y: s.y, r: 2 }));
    for (const m of G.minions) (scared ? prey.push(m) : danger.push({ x: m.x, y: m.y, r: 2 }));
    for (const s of G.bones) prey.push(s);
    for (const s of G.blobules) prey.push(s);
    for (const s of G.buddies) if (s.state === 'active') prey.push(s);
    for (const o of G.orbs) if (!o.web) danger.push({ x: o.x, y: o.y, r: 2, walls: true });
    for (const cp of G.centipedes) for (const s of centiSegments(cp)) danger.push({ x: s.x, y: s.y, r: 2, walls: true });
    for (const v of G.vents) if (ventState(v) !== 'idle') for (const [c, r] of v.tiles) danger.push({ x: c, y: r, r: 0, hard: true });
    const b = G.boss;
    if (b && b.state !== 'dead') {
      const rad = b.kind === 'blob' ? Math.ceil(blobR(b)) + 1 : 2;
      const hittable = fr > 0.6 && b.inv <= 0 && b.state !== 'recoil' && (b.kind !== 'skull' || b.state === 'chase');
      if (hittable) prey.push({ x: b.x, y: b.y, boss: true }); else danger.push({ x: b.x, y: b.y, r: rad + 1, walls: true });
    }
    return { danger, prey };
  }
  function costField(danger) {
    const cost = new Float64Array(W * H);
    for (const d of danger) {
      const c0 = Math.round(d.x), r0 = Math.round(d.y);
      if (d.hard) { if (inb(c0, r0)) cost[r0 * W + c0] += 500; continue; }
      if (d.walls) { // passes walls: plain radius
        for (let r = r0 - d.r; r <= r0 + d.r; r++) for (let c = c0 - d.r; c <= c0 + d.r; c++) {
          if (!inb(c, r)) continue; const k = Math.hypot(c - d.x, r - d.y); if (k <= d.r + 0.5) cost[r * W + c] += 120 / (k + 0.6);
        }
        continue;
      }
      // walks the maze: spread along corridors
      const seen = new Map(); const q = [[Math.max(0, Math.min(W - 1, c0)), Math.max(0, Math.min(H - 1, r0)), 0]]; seen.set(q[0][1] * W + q[0][0], 0);
      while (q.length) {
        const [c, r, k] = q.shift();
        cost[r * W + c] += 160 / (k + 0.6);
        if (k >= d.r) continue;
        for (const [nc, nr] of nbrs(c, r)) { const i = nr * W + nc; if (!seen.has(i)) { seen.set(i, k + 1); q.push([nc, nr, k + 1]); } }
      }
    }
    return cost;
  }
  function dijkstra(sc, sr, cost) {
    const dist = new Float64Array(W * H).fill(Infinity), first = new Array(W * H).fill(null);
    const i0 = sr * W + sc; dist[i0] = 0;
    const open = [[0, sc, sr]];
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [d, c, r] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (d > dist[r * W + c]) continue;
      for (const [nc, nr, dir] of nbrs(c, r)) {
        const j = nr * W + nc, nd = d + 1 + cost[j];
        if (nd < dist[j]) { dist[j] = nd; first[j] = first[r * W + c] || dir; open.push([nd, nc, nr]); }
      }
    }
    return { dist, first };
  }

  // ---------- autopilot ----------
  const ap = { on: false, dir: null, lastDecide: 0, mode: 'dots', dashAt: 0, wiggle: 0, stall: 0, lastPos: '' };
  function setDir(d) {
    const n = nameOf(d);
    if (ap.dir === n) return;
    if (ap.dir) key('keyup', KEY[ap.dir]);
    ap.dir = n;
    if (n) key('keydown', KEY[n]);
  }
  function decide() {
    if (G.state !== 'play' || G.paused) return;
    const c = Math.max(0, Math.min(W - 1, Math.round(pac.x))), r = Math.round(pac.y);
    if (!inb(c, r)) return;
    const { danger, prey } = threats();
    const cost = costField(danger);
    const { dist, first } = dijkstra(c, r, cost);
    let best = null, bv = Infinity, why = '';
    const consider = (x, y, bonus, tag) => {
      const tc = Math.round(x), tr = Math.round(y);
      if (!inb(tc, tr)) return;
      const v = dist[tr * W + tc] - bonus;
      if (v < bv && first[tr * W + tc]) { bv = v; best = first[tr * W + tc]; why = tag; }
    };
    for (const p of prey) consider(p.x, p.y, p.boss ? 60 : 25, p.boss ? 'boss' : 'prey');
    const wantPower = G.boss && G.boss.state !== 'dead' && G.fright <= 0;
    for (let i = 0; i < W * H; i++) {
      const v = G.dots[i]; if (!v) continue;
      const bonus = (v === 2 && wantPower) ? 40 : (v === 2 && danger.length && Math.min(...danger.map(d => Math.hypot(d.x - i % W, d.y - (i / W | 0)))) < 4) ? 15 : v === 5 ? 6 : v === 3 && G.wraiths.length ? 8 : 0;
      consider(i % W, (i / W) | 0, bonus, v === 2 ? 'pellet' : 'dot');
    }
    if (G.fruit) consider(meta.fruit.x, meta.fruit.y, 10, 'fruit');
    // In danger with nothing worth the risk: run to the safest reachable tile.
    const here = cost[r * W + c];
    if (here > 60 || !best) {
      let sb = null, sv = Infinity;
      for (const [nc, nr, d] of nbrs(c, r)) { const v = cost[nr * W + nc]; if (v < sv) { sv = v; sb = d; } }
      if (sb && (!best || here > 120)) { best = sb; why = 'flee'; }
      if (G.cfg.dash && G.dashCharge >= 1 && here > 150 && performance.now() - ap.dashAt > 500) { ap.dashAt = performance.now(); tap(' '); }
    }
    ap.mode = why;
    if (best) setDir(best);
  }
  function apTick() {
    if (!ap.on) return;
    if (G.state === 'play' && !G.paused) {
      const near = Math.abs(pac.x - Math.round(pac.x)) < 0.35 && Math.abs(pac.y - Math.round(pac.y)) < 0.35;
      const now = performance.now();
      if (near || now - ap.lastDecide > 120) { ap.lastDecide = now; decide(); }
    } else if (ap.dir) setDir(null);
  }

  function frame() { const now = performance.now(); try { check(now); apTick(); } catch (e) { flag('bot', 'probe error: ' + e.message); } requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
  window.addEventListener('error', e => flag('error', 'Uncaught: ' + e.message));

  // ---------- public ----------
  return {
    findings, perf, flag,
    snap: () => ({ ...ctxInfo(), paused: G.paused, dotsLeft: G.dotsLeft, dotsTotal: G.dotsTotal, timer: G.timer, fright: G.fright, chill: G.chill,
      menu: { ...G.menu, items: menuItems() }, tower: G.tower && { sel: G.tower.sel, fresh: G.tower.fresh }, boss: G.boss && { kind: G.boss.kind, hp: G.boss.hp, state: G.boss.state, phase: bossPhase(G.boss) },
      dlg: G.dlg && { i: G.dlg.i, n: G.dlg.lines.length, speaker: G.dlg.lines[G.dlg.i][0], text: G.dlg.lines[G.dlg.i][1], then: G.dlg.then },
      save: JSON.parse(JSON.stringify(save)), hi, infinite, fx: fxOn, muted, sprites: SPR.size, parts: parts.length, frz: typeof frz === 'undefined' ? null : { blooms: frz.blooms.length, cold: +frz.cold.toFixed(2), ice: +frz.ice.toFixed(2), comp: +frz.comp.t.toFixed(2), wave: !!frz.wave, hitstop: G.hitstop }, apMode: ap.mode,
      heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null }),
    autopilot(on) { ap.on = on; if (!on) setDir(null); },
    tap, key,
    // Read-only views of game data for the story/static checks.
    data: () => ({ LEVELS: LEVELS.map(l => ({ ...l, schedule: undefined })), FLOOR_NAMES, STAGE_NAMES, STAGE_SHORT, STORY, SPEAKERS: Object.fromEntries(Object.entries(SPEAKERS).map(([k, v]) => [k, v.name])),
      BOSSES: Object.fromEntries(Object.entries(BOSSES).map(([k, v]) => [k, { hp: v.hp, per: v.per, lines: v.lines, retry: [1, 2, 3].map(p => v.retry(p)) }])),
      KING_LINES, BLOB_LINES, SKULL_LINES, ROOF, KING_FLOOR, BLOB_FLOOR, SKULL_FLOOR, BASEMENT, SKY, labels: [...Array(ROOF + 1).keys()].map(floorLabel) }),
    // Test hooks: these only *read* or jump state the way the game's own debug keys do.
    jump(i) { startLevel(i); },
    ck: () => JSON.parse(JSON.stringify(save.ck || {})),
    hasProgress, topFloor, canEnter,
    // What's within 2 tiles of Pac-Man (for diagnosing deaths).
    near() {
      const out = [], d = a => Math.hypot(a.x - pac.x, a.y - pac.y);
      for (const [kind, list] of Object.entries(actorLists())) for (const a of list || []) if (d(a) < 2) out.push(`${kind}${a.name ? ':' + a.name : ''}(${a.state || a.mode}${a.frightened ? ',scared' : ''}) @${a.x.toFixed(1)},${a.y.toFixed(1)}`);
      for (const v of G.vents) if (ventState(v) !== 'idle' && v.tiles.some(([c, r]) => Math.abs(c - pac.x) < 1 && Math.abs(r - pac.y) < 1)) out.push(`vent@${v.c},${v.r}:${ventState(v)}`);
      if (G.webs.has(webKey(pac.x, pac.y))) out.push('webbed');
      return out;
    },
    freeze(on) { window.__frozen = on; },
    // Run code inside the game's scope, for setting up a specific moment in a test.
    exec: src => eval(src),
  };
})();
