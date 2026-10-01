// Dumps every line of story text the game can show, plus mechanical consistency checks.
// The transcript (out/story.md) is what a reviewer reads for plot holes.
const fs = require('fs');
const L = require('../lib');

module.exports = async function story({ newPage }) {
  console.log('\n== story ==');
  const p = await newPage({ storage: {}, label: 'story' });
  const d = await p.evaluate(() => window.__bot.data());
  await p.context().close();
  const out = ['# Story transcript', '', 'Every line the game can show, in play order.', ''];
  const sp = k => d.SPEAKERS[k] || `??${k}`;
  const lines = (arr, tag) => (arr || []).forEach(([who, text, mood]) => {
    out.push(`- **${sp(who)}**${mood ? ` _(${mood})_` : ''}: ${text}`);
    if (!d.SPEAKERS[who]) L.finding('story', 'medium', `Unknown speaker "${who}" in ${tag}`);
    if (/DASH_HINT/.test(text)) L.finding('story', 'low', `Raw DASH_HINT placeholder in dialog ${tag}`);
  });
  out.push('## Prologue'); lines(d.STORY.prologue, 'prologue');
  for (let i = 0; i <= d.ROOF; i++) {
    const lv = d.LEVELS[i];
    out.push('', `## ${d.labels[i]}${d.FLOOR_NAMES[i] ? ' ' + d.FLOOR_NAMES[i] : ''}${lv ? ` (stage ${lv.stage} "${d.STAGE_NAMES[lv.stage]}", ${lv.lv})` : ''}`);
    if (lv) out.push(`Banner: **${lv.intro[0]}** / ${lv.intro[1]}`, '');
    if (d.STORY.pre[i]) { out.push('Before:'); lines(d.STORY.pre[i], `pre ${i}`); }
    if (d.STORY.post[i]) { out.push('After:'); lines(d.STORY.post[i], `post ${i}`); }
    if (lv && !d.STORY.pre[i]) L.finding('story', 'low', `Floor ${d.labels[i]} ${d.FLOOR_NAMES[i]} has no intro dialog`);
  }
  for (const k of Object.keys(d.STORY)) if (!['prologue', 'pre', 'post'].includes(k)) { out.push('', `## STORY.${k}`); lines(d.STORY[k], k); }
  out.push('', '## Boss barks');
  for (const [k, b] of Object.entries(d.BOSSES)) {
    out.push('', `### ${k} (hp ${b.hp}, ${b.hp / b.per} phases x ${b.per})`);
    out.push(...b.retry.slice(1).map((t, i) => `- retry at phase ${i + 2}: ${t}`)); // checkpoints only exist from phase 2
    for (const [key, v] of Object.entries(b.lines)) out.push(`- ${key}: ${JSON.stringify(v)}`);
  }
  fs.writeFileSync(`${L.OUT}/story.md`, out.join('\n'));

  // Mechanical checks
  const king = d.BOSSES.king;
  const kIntro = d.LEVELS[d.KING_FLOOR].intro[1];
  const m = kIntro.match(/(\d+) PHASES x (\d+) HITS/);
  if (m && (+m[1] !== king.hp / king.per || +m[2] !== king.per)) L.finding('story', 'medium', `King banner says "${m[0]}" but the boss has ${king.hp / king.per} phases of ${king.per}`);
  d.LEVELS.forEach((lv, i) => {
    if (/FINAL LEVEL/.test(lv.intro.join(' ')) && i !== d.SKULL_FLOOR) L.finding('story', 'low', `Floor ${d.labels[i]} banner says "FINAL LEVEL" but it is floor ${i + 1} of ${d.LEVELS.length}`);
    const nm = (lv.intro[0].match(/^NEW: (.*)/) || [])[1];
    if (nm) { const earlier = d.LEVELS.slice(0, i).map(l => l.intro[0]).find(t => t === lv.intro[0]); if (earlier) L.finding('story', 'low', `"${lv.intro[0]}" announced twice`); }
    if (/TWO WRAITHS/.test(lv.intro[1]) && lv.wraiths !== 2) L.finding('story', 'low', `${d.labels[i]} says two wraiths but has ${lv.wraiths}`);
    const counts = { 'TWO SLIMES': ['slimes', 2], 'TWO HOUNDS': ['hounds', 2], 'TWO SPIDERS': ['spiders', 2], 'TWO GHOSTS': ['ghosts', 2] };
    for (const [t, [f, n]] of Object.entries(counts)) if (lv.intro[1].includes(t)) { const v = Array.isArray(lv[f]) ? lv[f].length : lv[f]; if (v !== n) L.finding('story', 'low', `${d.labels[i]} banner says "${t}" but config has ${f}=${v}`); }
    if (/FULL HOUSE/.test(lv.intro.join(' ')) && (lv.ghosts || []).length !== 4) L.finding('story', 'low', `${d.labels[i]} says FULL HOUSE but has ghosts ${lv.ghosts}`);
    if (/PELLETS/.test(lv.intro.join(' ')) && !lv.pellets) L.finding('story', 'low', `${d.labels[i]} mentions pellets but the floor has none`);
  });
  // A ghost speaking in a floor's intro should be on that floor.
  for (const [i, arr] of Object.entries(d.STORY.pre)) {
    const lv = d.LEVELS[i]; if (!lv || lv.boss) continue;
    for (const [who] of arr) if (['BLINKY', 'PINKY', 'INKY', 'CLYDE'].includes(who) && !(lv.ghosts || []).includes(who.toLowerCase()))
      L.finding('story', 'low', `${who} speaks in the ${d.labels[i]} ${d.FLOOR_NAMES[i]} intro but isn't on that floor`, { ghosts: (lv.ghosts || []).join(',') || 'none' });
  }
  const ten = JSON.stringify(d.STORY.prologue).match(/ONLY (\w+) FLOORS/);
  if (ten) L.finding('story', 'info', `Prologue promises "ONLY ${ten[1]} FLOORS"; the tower has ${d.KING_FLOOR + 1} floors to the King (Act 1) and ${d.LEVELS.length} overall`);
  return d;
};
