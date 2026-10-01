// Shared harness: launches Chromium, serves index.html with the probe injected, and records findings.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(__dirname, process.env.BOT_OUT || 'out');
const URL = 'http://pacman.test/';
const BOOT = 'window.claude?.hot?.ready ? window.claude.hot.ready(start)';

function gameHtml() {
  const html = fs.readFileSync(process.env.BOT_GAME || path.join(ROOT, 'index.html'), 'utf8');
  const probe = fs.readFileSync(path.join(__dirname, 'probe.js'), 'utf8');
  const at = html.lastIndexOf(BOOT);
  if (at < 0) throw new Error('Could not find the boot line in index.html; update BOOT in bot/lib.js');
  return html.slice(0, at) + probe + '\n' + html.slice(at);
}

// Findings from the node side (scenario assertions). In-page findings are merged at the end.
const findings = [];
let shotN = 0;
function finding(area, severity, title, detail = {}, shot = null) {
  const f = { area, severity, title, ...detail, shot };
  findings.push(f);
  console.log(`  [${severity}] ${area}: ${title}`);
  return f;
}

async function launch({ watch = false, speed = 1, video = false, slowMo = 0 } = {}) {
  fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
  const browser = await chromium.launch({ headless: !watch, slowMo, args: ['--autoplay-policy=no-user-gesture-required'] });
  const html = gameHtml();
  async function newPage({ storage = null, viewport = { width: 900, height: 1000 }, label = 'run', touch = false, blockStorage = false } = {}) {
    const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch,
      ...(video ? { recordVideo: { dir: path.join(OUT, 'video'), size: viewport } } : {}) });
    await context.route(URL + '**', r => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
    await context.addInitScript(([speed, storage, blockStorage]) => {
      window.__speed = speed;
      if (speed !== 1) { // fast-forward: hand the game a sped-up clock
        const raf = window.requestAnimationFrame.bind(window), t0 = performance.now();
        window.requestAnimationFrame = cb => raf(t => cb(t0 + (t - t0) * speed));
      }
      if (storage && !sessionStorage.getItem('__seeded')) {
        sessionStorage.setItem('__seeded', '1');
        localStorage.clear();
        for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
      }
      if (blockStorage) Object.defineProperty(window, 'localStorage', { get() { throw new Error('SecurityError: storage blocked'); } });
    }, [speed, storage, blockStorage]);
    const page = await context.newPage();
    page.label = label;
    page.errors = [];
    page.on('pageerror', e => { page.errors.push(e.message); finding('crash', 'high', `Uncaught page error (${label}): ${e.message}`); });
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) page.errors.push(m.text()); });
    await page.goto(URL);
    await page.waitForFunction(() => window.__bot && true);
    return page;
  }
  return { browser, newPage };
}

const snap = page => page.evaluate(() => window.__bot.snap());
async function waitFor(page, fn, arg, timeout = 15000) {
  try { await page.waitForFunction(fn, arg, { timeout, polling: 50 }); return true; } catch { return false; }
}
const waitState = (page, states, timeout) => waitFor(page, s => s.includes(window.__bot.snap().state), [].concat(states), timeout);
async function key(page, k, n = 1, gap = 60) { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await page.waitForTimeout(gap); } }
async function shot(page, name) {
  const file = `shots/${String(++shotN).padStart(3, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
  await page.locator('#game').screenshot({ path: path.join(OUT, file) }).catch(() => page.screenshot({ path: path.join(OUT, file) }));
  return file;
}
async function reload(page) { await page.reload(); await page.waitForFunction(() => window.__bot && true); }
// Click on the canvas at screen-tile coordinates (28 cols x 36 rows).
async function clickTile(page, col, row) {
  const b = await page.locator('#game').boundingBox();
  await page.mouse.click(b.x + col / 28 * b.width, b.y + row / 36 * b.height);
}
async function pageFindings(page) { return page.evaluate(() => window.__bot.findings.map(f => ({ ...f }))).catch(() => []); }
// Advance through every dialog line, collecting the text.
async function readDialog(page, max = 80) {
  const lines = [];
  for (let i = 0; i < max; i++) {
    const s = await snap(page);
    if (s.state !== 'dialog') break;
    if (!lines.length || lines[lines.length - 1].i !== s.dlg.i) lines.push({ i: s.dlg.i, speaker: s.dlg.speaker, text: s.dlg.text });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(40);
  }
  return lines;
}

module.exports = { OUT, launch, finding, findings, snap, waitFor, waitState, key, shot, reload, clickTile, pageFindings, readDialog };
