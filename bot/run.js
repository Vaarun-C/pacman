#!/usr/bin/env node
// QA bot for index.html.
//   node run.js                       all suites, headless, 3x speed
//   node run.js --watch               open a visible browser and play at normal speed
//   node run.js --suites=play --from=9 --to=12 --watch
//   node run.js --video               also record .webm videos of every page into out/video
// Suites: story, screens, save, edge, perf, play. Output: out/report.md, out/report.json, out/shots, out/story.md
const fs = require('fs');
const path = require('path');
const L = require('./lib');

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v === undefined ? true : v]; }));
const watch = !!args.watch;
const opts = {
  speed: +(args.speed || (watch ? 1 : 3)),
  from: args.from !== undefined ? +args.from : undefined, to: args.to !== undefined ? +args.to : undefined,
  floorSecs: +(args.floorSecs || 150), perfSecs: +(args.perfSecs || 10), lives: !!args.lives,
};
const suites = (args.suites || 'story,screens,save,edge,perf,play').split(',');

(async () => {
  fs.rmSync(L.OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(L.OUT, 'shots'), { recursive: true });
  const report = { started: new Date().toISOString(), opts, suites };
  for (const name of suites) {
    // perf always runs at real speed so frame timings mean something
    const env = await L.launch({ watch, speed: name === 'perf' ? 1 : opts.speed, video: !!args.video });
    const t0 = Date.now();
    try { report[name] = await require(`./suites/${name}`)({ ...env, opts }); }
    catch (e) { L.finding('bot', 'high', `Suite ${name} crashed: ${e.message}`, { stack: e.stack }); }
    await env.browser.close();
    console.log(`  (${name}: ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  // Probe findings from the playthrough
  if (report.play) for (const f of report.play.pageFindings) {
    const sev = f.kind === 'error' ? 'high' : f.kind === 'glitch' ? 'medium' : f.kind === 'stuck' ? 'low' : 'info';
    L.finding('play', sev, f.msg, { at: f.at, count: f.count, extra: Object.fromEntries(Object.entries(f).filter(([k]) => !['sig', 'kind', 'msg', 'count', 'at', 't'].includes(k))) });
  }
  report.findings = L.findings;
  fs.writeFileSync(path.join(L.OUT, 'report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(L.OUT, 'report.md'), toMarkdown(report));
  console.log(`\n${L.findings.length} findings -> ${path.join(L.OUT, 'report.md')}`);
})().catch(e => { console.error(e); process.exit(1); });

function toMarkdown(r) {
  const order = { high: 0, medium: 1, low: 2, info: 3 };
  const out = [`# Pac-Man QA bot report`, '', `Run ${r.started}, suites: ${r.suites.join(', ')}`, ''];
  const byArea = {};
  for (const f of [...r.findings].sort((a, b) => order[a.severity] - order[b.severity])) (byArea[f.area] = byArea[f.area] || []).push(f);
  for (const [area, list] of Object.entries(byArea)) {
    out.push(`## ${area}`, '');
    for (const f of list) {
      const { area: _, severity, title, shot, ...rest } = f;
      out.push(`- **[${severity}]** ${title}${f.count > 1 ? ` (x${f.count})` : ''}${shot ? ` — ![](${shot})` : ''}`);
      const detail = JSON.stringify(rest); if (detail.length > 2) out.push(`  <details><summary>detail</summary><code>${detail.slice(0, 1200)}</code></details>`);
    }
    out.push('');
  }
  if (r.play) {
    out.push('## Playthrough', '', '| Floor | Name | Result | Time (s) | Deaths | Boss phases |', '|---|---|---|---|---|---|');
    for (const x of r.play.results) out.push(`| ${x.label} | ${x.name} | ${x.result} | ${x.secs} | ${x.deaths} | ${x.phases || ''} |`);
    out.push('');
  }
  if (r.perf) {
    out.push('## Frame cost per floor', '', '| Floor | FX | render avg ms | render max | update avg | update max | fps | frames >33ms | sprites | heap MB |', '|---|---|---|---|---|---|---|---|---|---|');
    for (const x of r.perf) out.push(`| ${x.label} ${x.name} | ${x.fx ? 'on' : 'off'} | ${x.renderAvg} | ${x.renderMax} | ${x.updAvg} | ${x.updMax} | ${x.fps} | ${x.framesOver33} | ${x.sprites} | ${x.heap} |`);
  }
  return out.join('\n');
}
