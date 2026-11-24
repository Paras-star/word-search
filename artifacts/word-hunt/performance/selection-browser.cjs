// Usage and evidence limits: ../docs/selection-late-game-performance.md
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { hash, prepare } = require('./selection-bundle.cjs');
const { cases, paths, states } = require('./selection-fixtures.cjs');
const root = path.resolve(__dirname, '../../..');
const output = path.join(root, '.local/verification/selection-late-game');
const origin = `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`;
const progressKey = '@word-hunt/progress-v2';
const sourceHash = () => hash(execFileSync('git', ['ls-files', '-z', 'artifacts/word-hunt'], { cwd: root })
  .toString().split('\0').filter(file => file && !file.includes('/docs/') && !file.includes('/performance/'))
  .map(file => `${file}\0${hash(fs.readFileSync(path.join(root, file)))}`).join('\0'));

async function capture() {
  assert.ok(process.env.REPLIT_EXPO_DEV_DOMAIN, 'Expo preview domain required');
  const before = sourceHash();
  const html = await (await fetch(`${origin}/game?onboardingStep=3`)).text();
  const entry = html.match(/<script src="([^"]+entry\.bundle[^"]*)"/)?.[1];
  assert.ok(entry, 'Expected Metro development entry');
  const url = new URL(entry.replace('lazy=true', 'lazy=false'), origin).href;
  const response = await fetch(url);
  assert.ok(response.ok);
  const bundle = await response.text();
  prepare(bundle, true); // Fail closed on unsupported Metro output.
  assert.equal(sourceHash(), before, 'Source changed during capture');
  const id = hash(bundle);
  const dir = path.join(output, id);
  fs.mkdirSync(dir, { recursive: true });
  const manifest = {
    id, sourceHash: before, git: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(),
    capturedAt: new Date().toISOString(), origin, url, html,
  };
  for (const [file, data] of [['entry.bundle', bundle], ['manifest.json', JSON.stringify(manifest, null, 2)]]) {
    // Snapshots are immutable; recapturing cannot silently overwrite evidence.
    if (!fs.existsSync(path.join(dir, file))) fs.writeFileSync(path.join(dir, file), data, { flag: 'wx' });
  }
  console.log(dir);
}

// Runs before any app code in a fresh, non-persistent browser context.
function initialize({ progress, instrumented, progressKey }) {
  localStorage.setItem(progressKey, JSON.stringify(progress));
  const originalSet = Storage.prototype.setItem;
  const originalRemove = Storage.prototype.removeItem;
  const protectedKey = key => /@word-hunt\/(progress|coins|completed|dumpling|treasure)/.test(key);
  const m = window.__measure = { counts: {}, bodies: [], paths: [], commits: [], frames: [], tasks: [], events: [], writes: [] };
  Storage.prototype.setItem = function(key, value) {
    if (protectedKey(key)) { m.writes.push({ key }); throw Error('Performance fixture attempted a protected storage write'); }
    return originalSet.call(this, key, value);
  };
  Storage.prototype.removeItem = function(key) {
    if (protectedKey(key)) { m.writes.push({ key }); throw Error('Performance fixture attempted a protected storage delete'); }
    return originalRemove.call(this, key);
  };
  Storage.prototype.clear = () => { throw Error('Performance fixture attempted to clear storage'); };
  m.count = name => { m.counts[name] = (m.counts[name] || 0) + 1; };
  for (const type of ['touchstart', 'touchmove', 'touchend']) {
    document.addEventListener(type, event => m.events.push({
      type, t: performance.now(), age: performance.now() - event.timeStamp, trusted: event.isTrusted,
    }), { capture: true, passive: true });
  }
  let last;
  function frame(t) { if (last !== undefined) m.frames.push({ t, ms: t - last }); last = t; requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
  new PerformanceObserver(list => m.tasks.push(...list.getEntries().map(e => ({ t: e.startTime, ms: e.duration }))))
    .observe({ type: 'longtask', buffered: false });
  if (instrumented) {
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true, renderers: new Map(),
      inject(renderer) { const id = this.renderers.size + 1; this.renderers.set(id, renderer); return id; },
      onCommitFiberUnmount() {},
      onCommitFiberRoot(_id, root) {
        function find(fiber) {
          if (!fiber) return;
          if (fiber.type?.name === 'GameSession') {
            m.commits.push({ t: performance.now(), ms: fiber.actualDuration }); return;
          }
          find(fiber.child); find(fiber.sibling);
        }
        find(root.current);
      },
    };
  }
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function run(dir, probe = false) {
  const { chromium } = require('playwright');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json')));
  const bundle = fs.readFileSync(path.join(dir, 'entry.bundle'), 'utf8');
  assert.equal(hash(bundle), manifest.id);
  assert.equal(sourceHash(), manifest.sourceHash, 'Recapture after source changes');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium',
    headless: true, args: ['--no-sandbox'] });
  const harnessFiles = ['selection-browser.cjs', 'selection-bundle.cjs', 'selection-fixtures.cjs'];
  const harness = Object.fromEntries(harnessFiles.map(file => [file, hash(fs.readFileSync(path.join(__dirname, file)))]));
  const report = { manifest, harness, probe, browser: browser.version(), startedAt: new Date().toISOString(), runs: [] };
  const resultFile = path.join(dir, probe ? 'probe-results.json' : 'results.json');
  try {
    // Alternate arm order by case; state order is fixed and reported, not randomized.
    for (const [caseIndex, fixture] of (probe ? cases.slice(0, 1) : cases).entries()) {
      for (const instrumented of caseIndex % 2 ? [false, true] : [true, false]) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 },
          deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
        try {
          await context.routeWebSocket('**/*', socket => socket.close());
          await context.addInitScript(initialize, { progress: fixture.progress, instrumented, progressKey });
          const prepared = prepare(bundle, instrumented);
          await context.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (url.pathname.endsWith('entry.bundle')) return route.fulfill({ body: prepared, contentType: 'application/javascript' });
            if (url.pathname.endsWith('.bundle')) return route.abort('blockedbyclient');
            if (url.origin !== manifest.origin) return route.abort('blockedbyclient');
            if (url.pathname === '/game') return route.fulfill({ body: manifest.html.replace('lazy=true', 'lazy=false'), contentType: 'text/html' });
            return route.continue();
          });
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', error => { errors.push(error.message); console.error('page error:', error.stack); });
          await page.goto(manifest.origin + fixture.route, { waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => window.__fixture?.read().bounds?.width > 0, null, { timeout: 60000 });
          await page.waitForTimeout(2300);
          const initial = await page.evaluate(() => window.__fixture.read());
          assert.equal(initial.puzzle.size, fixture.size);
          const cdp = await context.newCDPSession(page);
          let delivered = 0;
          async function touch(type, points) {
            const eventType = { touchStart: 'touchstart', touchMove: 'touchmove', touchEnd: 'touchend' }[type];
            await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
            delivered++;
            // CDP acknowledgement can precede trusted DOM dispatch. Wait for
            // delivery, not for a React render or a particular selected value.
            await page.waitForFunction(({ delivered, eventType }) =>
              window.__measure.events.length >= delivered &&
              window.__measure.events[delivered - 1].type === eventType,
            { delivered, eventType }, { polling: 5, timeout: 5000 });
          }
          const environment = await page.evaluate(() => ({
            ua: navigator.userAgent, cpus: navigator.hardwareConcurrency,
            width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
          }));
          const item = { id: fixture.id, instrumented, fixture, puzzle: initial.puzzle, environment, states: [], errors };
          report.runs.push(item);
          for (const state of (probe ? states.slice(0, 1) : states)) {
            await page.evaluate(({ state }) => window.__fixture.setup(state !== 'early', 120), { state });
            await page.waitForTimeout(200);
            const baseline = await page.evaluate(() => window.__fixture.read());
            assert.equal(baseline.foundWords.length, state === 'early' ? 0 : baseline.puzzle.words.length - 1);
            const observations = [];
            // Each hint uses the unchanged manual handler and expires after 1500 ms.
            // One remaining target makes hint choice deterministic without replacing RNG.
            for (let repetition = 0; repetition < (probe ? 1 : 2); repetition++) {
              for (const gesture of paths(fixture.size)) {
                if (state === 'late-hint') {
                  await page.evaluate(() => window.__fixture.hint());
                  await page.waitForTimeout(30);
                }
                const before = await page.evaluate(() => ({
                  t: performance.now(), counts: { ...window.__measure.counts }, state: window.__fixture.read(),
                }));
                if (state === 'late-hint') assert.ok(before.state.hintCells.length > 0);
                const bounds = before.state.bounds;
                const points = gesture.points.map(([row, col]) => ({
                  x: Math.max(0.5, Math.min(389, bounds.x + (col + 0.5) * bounds.width / fixture.size)),
                  y: bounds.y + (row + 0.5) * bounds.height / fixture.size,
                }));
                // Near-edge starts are 0.5 px inside the outer border.
                if (gesture.id === 'fast-edge') points.forEach(p => { p.y = bounds.y + 0.5; });
                await touch('touchStart', [points[0]]);
                const checkpoints = [];
                for (const point of points.slice(1)) {
                  await touch('touchMove', [point]);
                  if (gesture.wait) await sleep(gesture.wait);
                  checkpoints.push(await page.evaluate(() => window.__fixture.read().selectedCells));
                }
                if (gesture.id === 'fast-edge') assert.deepEqual(checkpoints.map(p => p.length),
                  gesture.points.slice(1).map(([, col]) => Math.floor(col + 0.5) + 1), 'Fast endpoint dispatch/readback mismatch');
                const selected = await page.evaluate(() => window.__fixture.read().selectedCells);
                const letters = selected.map(c => initial.puzzle.grid[c.row][c.col]).join('');
                assert.ok(!initial.puzzle.words.filter(w => !baseline.foundWords.includes(w))
                  .some(w => w === letters || w === [...letters].reverse().join('')), 'Stress path must not complete a target');
                // One overlap window per repetition keeps selection held through
                // real hint expiry; the other windows observe expiry after release.
                if (state === 'late-hint' && gesture.id === 'outside-corners') {
                  await page.waitForTimeout(1600);
                  const held = await page.evaluate(() => window.__fixture.read());
                  assert.deepEqual(held.hintCells, []);
                  assert.deepEqual(held.selectedCells, selected);
                }
                const releaseAt = await page.evaluate(() => performance.now());
                await touch('touchEnd', []);
                // Include natural hint expiry while a selection is already cleared.
                await page.waitForTimeout(state === 'late-hint' ? 1550 : 180);
                const after = await page.evaluate(() => ({
                  t: performance.now(), counts: { ...window.__measure.counts }, state: window.__fixture.read(),
                }));
                assert.deepEqual(after.state.selectedCells, []);
                assert.deepEqual(after.state.foundWords, baseline.foundWords);
                assert.deepEqual(after.state.foundColors, baseline.foundColors);
                assert.deepEqual(after.state.hintCells, []);
                observations.push({ gesture: gesture.id, repetition, before, releaseAt, after, checkpoints });
                // Reset only hint balance; state setup is outside observation windows.
                if (state === 'late-hint') {
                  await page.evaluate(() => window.__fixture.setup(true, 120));
                  await page.waitForTimeout(60);
                }
              }
            }
            item.states.push({ state, baseline, observations });
          }
          if (fixture.mode === 'time') {
            await page.evaluate(() => window.__fixture.setup(true, 31));
            await page.waitForFunction(() => window.__fixture.read().timeLeft === 30);
            const start = await page.evaluate(() => ({ t: performance.now(), counts: { ...window.__measure.counts } }));
            const ticks = [], swipes = [];
            for (let remaining = 30; remaining >= 1; remaining--) {
              await page.waitForFunction(value => window.__fixture.read().timeLeft === value, remaining);
              ticks.push(await page.evaluate(() => ({
                t: performance.now(), state: window.__fixture.read(), counts: { ...window.__measure.counts },
              })));
              if ([28, 22, 16, 10].includes(remaining)) {
                if (remaining === 28 || remaining === 16) await page.evaluate(() => window.__fixture.hint());
                const before = await page.evaluate(() => ({ t: performance.now(), state: window.__fixture.read() }));
                const b = before.state.bounds;
                const gesture = paths(fixture.size)[0];
                const points = gesture.points.map(([row, col]) => ({
                  x: b.x + (col + 0.5) * b.width / fixture.size, y: b.y + (row + 0.5) * b.height / fixture.size,
                }));
                await touch('touchStart', [points[0]]);
                const checkpoints = [];
                for (const point of points.slice(1)) {
                  await touch('touchMove', [point]);
                  checkpoints.push(await page.evaluate(() => window.__fixture.read().selectedCells));
                }
                await touch('touchEnd', []);
                swipes.push({ remaining, before, checkpoints });
              }
            }
            await page.waitForTimeout(650);
            // Stop before game-over navigation; no completion or rewards are exercised.
            const end = await page.evaluate(() => ({ t: performance.now(), counts: { ...window.__measure.counts } }));
            item.countdown = { start, end, ticks, swipes };
          }
          item.metrics = await page.evaluate(() => window.__measure);
          item.saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), progressKey);
          assert.deepEqual(item.saved, fixture.progress);
          assert.deepEqual(item.metrics.writes, []);
          assert.deepEqual(errors, []);
          console.log('measured', fixture.id, instrumented ? 'instrumented' : 'control');
          fs.writeFileSync(resultFile, JSON.stringify(report));
        } finally { await context.close(); }
      }
    }
    assert.equal(sourceHash(), manifest.sourceHash, 'Workspace changed while measuring');
    for (const file of harnessFiles) assert.equal(hash(fs.readFileSync(path.join(__dirname, file))), harness[file], 'Harness changed while measuring');
    report.completedAt = new Date().toISOString();
  } finally {
    await browser.close();
    fs.writeFileSync(resultFile, JSON.stringify(report));
  }
}
if (require.main === module) {
  (process.argv[2] === '--capture' ? capture() : run(path.resolve(process.argv[2] || output), process.argv.includes('--probe')))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
