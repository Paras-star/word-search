const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const PROGRESS_KEY = '@word-hunt/progress-v2';

function loadTypeScript(relativePath, mockRequire = () => {
  throw new Error('Unexpected runtime import');
}) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const loadedModule = { exports: {} };
  new Function('require', 'module', 'exports', output)(mockRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

function loadDaily() {
  const categories = loadTypeScript('data/categories.ts');
  const dailyWords = loadTypeScript('data/dailyWords.ts');
  return loadTypeScript('game/daily.ts', (name) => {
    if (name === '@/data/categories' || name === '../data/categories') return categories;
    if (name === '@/data/dailyWords' || name === '../data/dailyWords') return dailyWords;
    throw new Error(`Unexpected daily runtime import: ${name}`);
  });
}

function storageHarness(initial = {}) {
  const values = new Map(Object.entries(initial));
  let failure = 'none';
  const daily = loadDaily();
  const storage = {
    getItem: async (key) => values.get(key) ?? null,
    multiGet: async (keys) => keys.map((key) => [key, values.get(key) ?? null]),
    setItem: async (key, value) => {
      if (failure === 'before') throw new Error('Storage unavailable');
      values.set(key, value);
      if (failure === 'after') throw new Error('Storage response lost');
    },
  };
  const api = loadTypeScript('services/storage.ts', (name) => {
    if (name === '@react-native-async-storage/async-storage') return { __esModule: true, default: storage };
    if (name.includes('daily')) return daily;
    throw new Error(`Unexpected storage runtime import: ${name}`);
  });
  return { api, values, fail: (mode) => { failure = mode; } };
}

function localDate(year, monthIndex, day, hour = 12, minute = 0, second = 0) {
  return new Date(year, monthIndex, day, hour, minute, second);
}

function keysAround(daily, date) {
  return daily.dailyWindow(date);
}

test('September 25 is playable in the inclusive six-day window, then rolls forward', () => {
  const daily = loadDaily();
  const sep25 = localDate(2025, 8, 25);
  assert.deepEqual(keysAround(daily, sep25), [
    '2025-09-20', '2025-09-21', '2025-09-22',
    '2025-09-23', '2025-09-24', '2025-09-25',
  ]);
  for (let day = 20; day <= 25; day++) {
    assert.equal(daily.isDailyDatePlayable(`2025-09-${day}`, sep25), true);
  }
  assert.equal(daily.isDailyDatePlayable('2025-09-19', sep25), false);
  assert.equal(daily.isDailyDatePlayable('2025-09-26', sep25), false);

  const sep26 = localDate(2025, 8, 26);
  assert.deepEqual(keysAround(daily, sep26), [
    '2025-09-21', '2025-09-22', '2025-09-23',
    '2025-09-24', '2025-09-25', '2025-09-26',
  ]);
  assert.equal(daily.isDailyDatePlayable('2025-09-20', sep26), false);
  assert.equal(daily.isDailyDatePlayable('2025-09-26', sep26), true);
});

test('daily windows use local calendar dates across month, year, and leap-day edges', () => {
  const daily = loadDaily();
  assert.deepEqual(daily.dailyWindow(localDate(2024, 2, 1)), [
    '2024-02-25', '2024-02-26', '2024-02-27',
    '2024-02-28', '2024-02-29', '2024-03-01',
  ]);
  assert.deepEqual(daily.dailyWindow(localDate(2025, 0, 2)), [
    '2024-12-28', '2024-12-29', '2024-12-30',
    '2024-12-31', '2025-01-01', '2025-01-02',
  ]);
  assert.deepEqual(daily.dailyWindow(localDate(2024, 11, 31)), [
    '2024-12-26', '2024-12-27', '2024-12-28',
    '2024-12-29', '2024-12-30', '2024-12-31',
  ]);
});

test('date keys and the playable window turn over at local midnight', () => {
  const daily = loadDaily();
  const beforeMidnight = localDate(2025, 8, 25, 23, 59, 59);
  const midnight = localDate(2025, 8, 26, 0, 0, 0);
  assert.equal(daily.localDateKey(beforeMidnight), '2025-09-25');
  assert.equal(daily.localDateKey(midnight), '2025-09-26');
  assert.equal(daily.parseLocalDateKey('2025-09-25').getTime(), localDate(2025, 8, 25, 0).getTime());
  assert.equal(daily.isDailyDatePlayable('2025-09-20', beforeMidnight), true);
  assert.equal(daily.isDailyDatePlayable('2025-09-20', midnight), false);
});

test('invalid date keys are rejected rather than normalized to another day', () => {
  const daily = loadDaily();
  for (const key of ['', '2025-9-25', '2025-02-29', '2025-04-31', 'not-a-date']) {
    assert.equal(daily.parseLocalDateKey(key), null, `expected ${key} to be rejected`);
    assert.equal(daily.isDailyDatePlayable(key, localDate(2025, 8, 25)), false);
  }
  assert.equal(daily.parseLocalDateKey('2024-02-29').getDate(), 29);
});

test('a daily puzzle is deterministic for the same local date and differs on another date', () => {
  const daily = loadDaily();
  const { generatePuzzle } = loadTypeScript('game/puzzle.ts');
  const key = '2026-09-25';
  const category = daily.dailyCategory(key);
  const first = generatePuzzle(category, daily.dailySeed(key));
  const reopened = generatePuzzle(daily.dailyCategory(key), daily.dailySeed(key));

  assert.equal(category.id, daily.dailyCategory(key).id);
  assert.deepEqual(reopened, first);
  assert.equal(daily.dailySeed(key), daily.dailySeed(key));
  assert.notEqual(daily.dailySeed('2026-09-26'), daily.dailySeed(key));
  assert.ok(category.words.every((word) => !daily.dailyCategory('2026-09-26').words.includes(word)));
  assert.notDeepEqual(
    generatePuzzle(daily.dailyCategory('2026-09-26'), daily.dailySeed('2026-09-26')),
    first,
  );
});

test('reopening a Daily date uses its cached grid while a second date keeps its own grid', () => {
  const daily = loadDaily();
  const puzzle = loadTypeScript('game/puzzle.ts');
  let generations = 0;
  const { getDailyPuzzle } = loadTypeScript('game/dailyPuzzle.ts', (name) => {
    if (name === './daily') return daily;
    if (name === './puzzle') return {
      generatePuzzle: (...args) => {
        generations += 1;
        return puzzle.generatePuzzle(...args);
      },
    };
    throw new Error(`Unexpected Daily puzzle import: ${name}`);
  });
  const first = getDailyPuzzle('2026-09-25');
  const second = getDailyPuzzle('2026-09-24');
  assert.equal(generations, 2);
  assert.strictEqual(getDailyPuzzle('2026-09-25'), first);
  assert.strictEqual(getDailyPuzzle('2026-09-24'), second);
  assert.equal(generations, 2);
  assert.deepEqual(first, puzzle.generatePuzzle(daily.dailyCategory('2026-09-25'), daily.dailySeed('2026-09-25')));
  assert.notDeepEqual(first, second);
});

test('curated target pools stay unique while preserving the approved cross-mode Emotions reuse', () => {
  const categoryWords = loadTypeScript('data/categories.ts').CATEGORIES.flatMap((category) => category.words);
  const onboarding = loadTypeScript('game/onboarding.ts').ONBOARDING_STEPS.flatMap((step) => step.words);
  const dailyWords = loadTypeScript('data/dailyWords.ts').DAILY_WORDS;
  const categorySet = new Set(categoryWords);
  const onboardingSet = new Set(onboarding);
  assert.equal(onboarding.length, 53);
  assert.equal(onboardingSet.size, onboarding.length);
  assert.equal(dailyWords.length, 432);
  assert.equal(new Set(dailyWords).size, dailyWords.length);
  assert.deepEqual(onboarding.filter(word => categorySet.has(word)), ['WONDER'],
    'keep the existing onboarding target under the approved cross-mode reuse');
  assert.deepEqual(dailyWords.filter(word => categorySet.has(word)).sort(),
    ['COURAGE', 'EMPATHY', 'PATIENCE', 'PRIDE'],
    'keep existing Daily content and allow only these user-approved cross-mode repeats');
  assert.ok(dailyWords.every((word) => !onboardingSet.has(word)));
  assert.ok(dailyWords.every((word) => /^[A-Z]{3,9}$/.test(word)));
});

test('Daily target sets stay disjoint across nearby dates and generate with the existing engine', () => {
  const daily = loadDaily();
  const { generatePuzzle } = loadTypeScript('game/puzzle.ts');
  const cutoverWindow = Array.from({ length: 11 }, (_, index) =>
    new Date(Date.UTC(2026, 8, 20 + index)).toISOString().slice(0, 10));
  for (let index = 0; index < cutoverWindow.length; index++) {
    const words = new Set(daily.dailyCategory(cutoverWindow[index]).words);
    for (let other = index + 1; other < Math.min(index + 6, cutoverWindow.length); other++) {
      assert.ok(daily.dailyCategory(cutoverWindow[other]).words.every((word) => !words.has(word)),
        `${cutoverWindow[index]} overlaps ${cutoverWindow[other]}`);
    }
  }
  const keys = Array.from({ length: 365 }, (_, index) =>
    new Date(Date.UTC(2026, 8, 25 + index)).toISOString().slice(0, 10));
  const sets = keys.map((key) => {
    const category = daily.dailyCategory(key);
    assert.equal(category.words.length, 9, key);
    assert.equal(new Set(category.words).size, 9, key);
    const puzzle = generatePuzzle(category, daily.dailySeed(key));
    assert.equal(Object.keys(puzzle.placements).length, 9, key);
    assert.deepEqual(daily.dailyCategory(key).words, category.words, key);
    return new Set(category.words);
  });
  for (const length of [30, 90, 365]) {
    let adjacentRepeatedWords = 0;
    let maxSixDayOverlap = 0;
    let maxSixDayRepeatedWords = 0;
    for (let index = 0; index < length; index++) {
      const window = sets.slice(index, Math.min(index + 6, length));
      const unique = new Set(window.flatMap((words) => [...words]));
      maxSixDayRepeatedWords = Math.max(maxSixDayRepeatedWords, window.length * 9 - unique.size);
      for (let other = index + 1; other < Math.min(index + 6, length); other++) {
        const overlap = [...sets[index]].filter((word) => sets[other].has(word)).length;
        maxSixDayOverlap = Math.max(maxSixDayOverlap, overlap);
        if (other === index + 1) adjacentRepeatedWords += overlap;
      }
    }
    const completeRepeatedSets = length - new Set(sets.slice(0, length).map((words) =>
      [...words].sort().join(','))).size;
    console.log(`${length} Daily dates: adjacent repeated words=${adjacentRepeatedWords}, maximum pair overlap within six days=${maxSixDayOverlap}, maximum repeated words in six days=${maxSixDayRepeatedWords}, complete repeated sets=${completeRepeatedSets}`);
    assert.equal(adjacentRepeatedWords, 0);
    assert.equal(maxSixDayOverlap, 0);
    assert.equal(maxSixDayRepeatedWords, 0);
    assert.equal(completeRepeatedSets, 0);
  }
});

test('daily completion adds 20 coins once without changing level or onboarding progress', async () => {
  const initial = {
    coins: 135,
    completedLevels: ['animals', 'food'],
    onboardingStep: 6,
  };
  const { api, values } = storageHarness({ [PROGRESS_KEY]: JSON.stringify(initial) });
  const progress = await api.loadProgress();
  const earned = api.awardDailyPuzzle(progress, '2025-09-25', localDate(2025, 8, 25));

  assert.ok(earned);
  assert.equal(progress.coins, 135, 'award calculation must not mutate its input');
  assert.equal(earned.coins, 155);
  assert.deepEqual(earned.completedLevels, initial.completedLevels);
  assert.equal(earned.onboardingStep, initial.onboardingStep);
  assert.deepEqual(earned.completedDailyPuzzles, ['2025-09-25']);

  await api.saveProgress(earned);
  const stored = JSON.parse(values.get(PROGRESS_KEY));
  assert.equal(stored.coins, 155);
  assert.deepEqual(stored.completedLevels, initial.completedLevels);
  assert.equal(stored.onboardingStep, initial.onboardingStep);
  assert.deepEqual(stored.completedDailyPuzzles, ['2025-09-25']);
  assert.deepEqual([...values.keys()], [PROGRESS_KEY], 'daily reward is persisted in the single progress JSON');

  const reloaded = await api.loadProgress();
  assert.deepEqual(reloaded, earned);
  assert.equal(api.awardDailyPuzzle(reloaded, '2025-09-25', localDate(2025, 8, 25)), null);
  assert.equal((await api.loadProgress()).coins, 155);
});

test('daily completion cannot bypass onboarding', async () => {
  const { api } = storageHarness({ [PROGRESS_KEY]: JSON.stringify({
    coins: 90, completedLevels: [], onboardingStep: 4,
  }) });
  const progress = await api.loadProgress();
  assert.throws(() => api.awardDailyPuzzle(progress, '2025-09-25', localDate(2025, 8, 25)), /not available/);
});

test('retry after a lost storage response reloads the recorded award and cannot award twice', async () => {
  const initial = {
    coins: 80,
    completedLevels: ['sports'],
    onboardingStep: 6,
  };
  const { api, values, fail } = storageHarness({ [PROGRESS_KEY]: JSON.stringify(initial) });
  const loaded = await api.loadProgress();
  const earned = api.awardDailyPuzzle(loaded, '2025-09-25', localDate(2025, 8, 25));
  assert.ok(earned);

  fail('after');
  await assert.rejects(api.saveProgress(earned), /response lost/);
  fail('none');

  const freshlyLoaded = await api.loadProgress();
  assert.equal(freshlyLoaded.coins, 100);
  assert.deepEqual(freshlyLoaded.completedDailyPuzzles, ['2025-09-25']);
  assert.equal(
    api.awardDailyPuzzle(freshlyLoaded, '2025-09-25', localDate(2025, 8, 25)),
    null,
    'a retry based on the post-write reload must not grant another reward',
  );
  assert.equal(JSON.parse(values.get(PROGRESS_KEY)).coins, 100);
});
function loadSelection() {
  const daily = loadDaily();
  return loadTypeScript('components/dailyCalendarState.ts', (name) => {
    if (name === '@/game/daily') return daily;
    throw new Error(`Unexpected selection runtime import: ${name}`);
  });
}

test('calendar redesign: default selection is today, even when completed', () => {
  const sel = loadSelection();
  const now = localDate(2026, 10, 25);
  assert.equal(sel.effectiveSelection(null, now), '2026-11-25');
  const done = new Set(['2026-11-25']);
  const cell = sel.dailyCellModel(localDate(2026, 10, 25), now, done, sel.effectiveSelection(null, now));
  assert.equal(cell.state, 'completed');
  assert.equal(cell.selected, true);
  assert.equal(sel.launchableDate('2026-11-25', now, done), null);
  assert.match(sel.ctaAccessibilityLabel('2026-11-25', now, done), /already completed/);
});

test('calendar redesign: selection moves, regular / golden / crowned / plain states', () => {
  const sel = loadSelection();
  const now = localDate(2026, 10, 25);
  const done = new Set(['2026-11-24']);
  const state = (d, s) => sel.dailyCellModel(localDate(2026, 10, d), now, done, s).state;
  assert.equal(state(25, '2026-11-25'), 'selected');
  assert.equal(state(22, '2026-11-25'), 'available');
  assert.equal(state(24, '2026-11-25'), 'completed');
  assert.equal(state(22, '2026-11-22'), 'selected');
  assert.equal(state(25, '2026-11-22'), 'available');
  assert.equal(state(19, '2026-11-22'), 'plain');
  assert.equal(state(26, '2026-11-22'), 'plain');
  const golden = sel.monthCells(localDate(2026, 10, 1)).filter(Boolean)
    .map((d) => sel.dailyCellModel(d, now, done, '2026-11-22')).filter((c) => c.selected);
  assert.equal(golden.length, 1);
  assert.equal(done.size, 1, 'selection never touches completion records');
});

test('calendar redesign: completed dates are selectable but never launch; catch-up launches', () => {
  const sel = loadSelection();
  const now = localDate(2026, 10, 25);
  const done = new Set(['2026-11-24']);
  assert.equal(sel.isDailyDateSelectable('2026-11-24', now), true);
  const cell = sel.dailyCellModel(localDate(2026, 10, 24), now, done, '2026-11-24');
  assert.equal(cell.state, 'completed');
  assert.equal(cell.selected, true);
  assert.match(cell.label, /selected, completed/);
  assert.equal(sel.launchableDate('2026-11-24', now, done), null);
  assert.equal(sel.launchableDate('2026-11-20', now, done), '2026-11-20');
  assert.match(sel.ctaAccessibilityLabel('2026-11-20', now, done), /catch-up hunt for November 20/);
});

test('calendar redesign: eligibility window, future disabled, expired selection cannot launch', () => {
  const sel = loadSelection();
  const now = localDate(2026, 10, 25);
  assert.equal(sel.isDailyDateSelectable('2026-11-20', now), true);
  assert.equal(sel.isDailyDateSelectable('2026-11-19', now), false);
  assert.equal(sel.isDailyDateSelectable('2026-11-26', now), false);
  const future = sel.dailyCellModel(localDate(2026, 10, 26), now, new Set(), '2026-11-25');
  assert.equal(future.selectable, false);
  assert.match(future.label, /unavailable/);
  const later = localDate(2026, 10, 27);
  assert.equal(sel.launchableDate('2026-11-20', later, new Set()), null);
  assert.equal(sel.effectiveSelection('2026-11-20', later), '2026-11-27');
});

test('calendar redesign: dynamic month grids incl. six-week months', () => {
  const sel = loadSelection();
  assert.equal(sel.monthCells(localDate(2026, 10, 1)).length, 35);
  assert.equal(sel.monthCells(localDate(2026, 7, 1)).length, 42); // Aug 2026 starts Saturday
  assert.equal(sel.monthCells(localDate(2026, 1, 1)).length, 28); // Feb 2026 starts Sunday
  const cells = sel.monthCells(localDate(2026, 7, 1));
  assert.equal(cells[6].getDate(), 1);
  assert.equal(cells.filter(Boolean).length, 31);
});

test('calendar redesign: screen wiring, assets and month navigation', () => {
  const screen = fs.readFileSync(path.join(root, 'app/daily.tsx'), 'utf8');
  const calendar = fs.readFileSync(path.join(root, 'components/DailyCalendar.tsx'), 'utf8');
  assert.doesNotMatch(screen, /CoinPill|November|legend/i);
  assert.doesNotMatch(calendar, /November|2026/);
  assert.match(screen, /setSelectedKey\(key\)/);
  assert.match(screen, /const key = launchKey;\s*if \(!key\) return;\s*playSound\('tap'\);\s*openPuzzle\(key\)/);
  assert.match(screen, /params: \{ dailyDate: key \}/);
  assert.match(screen, /canGoNext=\{!isCurrentMonth\}/);
  assert.match(screen, /previous\.getMonth\(\) \+ offset/);
  for (const id of ['daily-back', 'daily-play-today']) assert.match(screen, new RegExp(id));
  for (const id of ['daily-prev-month', 'daily-next-month', 'daily-date-']) assert.match(calendar, new RegExp(id));
  const pairs = {
    'regular-dumpling.png': 'regular_dumpling_1795603968691.png',
    'crowned-dumpling.png': 'crowned_dumpling_1795603968699.png',
    'golden-selected-dumpling.png': 'golden_selected_dumpling_1795603968702.png',
    'calendar.png': 'Calendar_1795603968708.png',
    'play-todays-hunt.png': "Play_Today's_Hunt_Button_1795603968712.png",
    'calendar-background.png': 'Calendar_Background_1795603968718.png',
  };
  const attached = path.resolve(root, '../../attached_assets');
  for (const [local, source] of Object.entries(pairs)) {
    const mine = fs.readFileSync(path.join(root, 'assets/images/daily', local));
    if (fs.existsSync(path.join(attached, source))) assert.ok(mine.equals(fs.readFileSync(path.join(attached, source))), local);
    assert.match(screen + calendar, new RegExp(local.replace('.', '\\.')));
  }
  assert.doesNotMatch(screen + calendar, /\p{Extended_Pictographic}/u);
});

// Rendered screen harness: executes app/daily.tsx and components/DailyCalendar.tsx
// with deterministic hooks and host-component stubs, then fires real handlers.
function dailyScreenHarness({ now = localDate(2026, 10, 25), completed = [], width = 390, height = 844, platform = 'ios', insets = { top: 47, bottom: 34, left: 0, right: 0 } } = {}) {
  const RealDate = Date;
  const fixed = now.getTime();
  global.Date = class extends RealDate {
    constructor(...args) { if (args.length) super(...args); else super(fixed); }
    static now() { return fixed; }
  };
  const calls = { navigation: [], sounds: [], generated: [] };
  const slots = [];
  let cursor = 0, tree;
  const react = {
    createElement: (type, props, ...children) => typeof type === 'function'
      ? type({ ...props, children })
      : { type, props: { ...props, children } },
    useState: (value) => {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof value === 'function' ? value() : value;
      return [slots[i], (next) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
    },
    useEffect: () => { cursor++; },
    memo: fn => fn,
    useMemo: fn => fn(),
    useCallback: fn => fn,
    useRef: value => ({ current: value }),
  };
  const daily = loadDaily();
  const transpile = (file, req) => {
    const out = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
    }).outputText;
    const m = { exports: {} };
    new Function('require', 'module', 'exports', out)(req, m, m.exports);
    return m.exports;
  };
  const selection = loadSelection();
  const hosts = ['View', 'Text', 'Image', 'ImageBackground', 'Pressable', 'ScrollView'];
  const native = Object.fromEntries(hosts.map((h) => [h, h]));
  const base = (name) => {
    if (name === 'react') return { __esModule: true, default: react, ...react };
    if (name === 'react-native') return {
      ...native, StyleSheet: { create: (s) => s }, Platform: { OS: platform },
      Animated: {
        View: 'AnimatedView',
        Value: class {
          constructor(value) { this.value = value; }
          interpolate() { return { value: 1 - this.value }; }
        },
      },
      AppState: { addEventListener: () => ({ remove() {} }) },
      useWindowDimensions: () => ({ width, height }),
    };
    if (name === '@expo/vector-icons') return { Feather: 'Feather' };
    if (name === '@/game/daily') return daily;
    if (name === '@/components/dailyCalendarState') return selection;
    if (name.startsWith('@/assets/')) return { asset: name };
    throw new Error(`Unexpected import ${name}`);
  };
  const calendar = transpile('components/DailyCalendar.tsx', base);
  const screen = transpile('app/daily.tsx', (name) => {
    if (name === 'expo-router') return { Redirect: 'Redirect', useFocusEffect: () => { cursor++; }, useRouter: () => ({ push: (d) => calls.navigation.push(d), canGoBack: () => true, back() {}, replace() {} }) };
    if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => insets };
    if (name === '@/components/GameUI') return { Screen: 'Screen' };
    if (name === '@/components/DailyCalendar') return calendar;
    if (name === '@/hooks/useColors') return { useColors: () => ({}) };
    if (name === '@/context/GameProvider') return { useGame: () => ({ completedDailyPuzzles: completed, hydrated: true, onboardingStep: 6 }) };
    if (name === '@/game/dailyPuzzle') return { getDailyPuzzle: (k) => calls.generated.push(k) };
    if (name === '@/services/audio') return { playSound: (s) => calls.sounds.push(s) };
    if (name === '@/services/nightBackgroundPreparation') return { warmNightBackground() {} };
    return base(name);
  });
  const render = () => { cursor = 0; tree = screen.default(); return tree; };
  const all = (node, match, acc = []) => {
    if (!node || typeof node !== 'object') return acc;
    if (Array.isArray(node)) { node.forEach((n) => all(n, match, acc)); return acc; }
    if (match(node.props ?? {}, node)) acc.push(node);
    all(node.props?.children, match, acc);
    return acc;
  };
  const byId = (id) => all(tree, (p) => p.testID === id)[0];
  const press = (id) => { const n = byId(id); assert.ok(n, `missing ${id}`); if (!n.props.disabled) n.props.onPress(); render(); };
  const monthTitle = () => all(tree, (p, n) => n.type === 'Text' && p.accessibilityRole === 'header')
    .map((n) => [].concat(n.props.children).join('')).find((t) => /\d{4}/.test(t));
  const restore = () => { global.Date = RealDate; };
  render();
  return { calls, byId, press, render, all, tree: () => tree, monthTitle, calendar, restore };
}

test('rendered: today selected by default, date tap moves golden selection without navigating', (t) => {
  const h = dailyScreenHarness();
  t.after(h.restore);
  assert.ok(h.byId('daily-art-selected-2026-11-25'));
  assert.ok(h.byId('daily-art-available-2026-11-22'));
  h.press('daily-date-2026-11-22');
  assert.deepEqual(h.calls.navigation, []);
  assert.ok(h.byId('daily-art-selected-2026-11-22'));
  assert.ok(h.byId('daily-art-available-2026-11-25'));
  assert.equal(h.all(h.tree(), (p) => /^daily-art-selected-/.test(p.testID ?? '')).length, 1);
  h.press('daily-play-today');
  assert.deepEqual(h.calls.navigation, [{ pathname: '/game', params: { dailyDate: '2026-11-22' } }]);
});

test('rendered: CTA launches today; future dates disabled and inert', (t) => {
  const h = dailyScreenHarness();
  t.after(h.restore);
  const future = h.byId('daily-date-2026-11-26');
  assert.equal(future.props.disabled, true);
  h.press('daily-date-2026-11-26');
  assert.ok(h.byId('daily-art-selected-2026-11-25'));
  h.press('daily-play-today');
  assert.deepEqual(h.calls.navigation, [{ pathname: '/game', params: { dailyDate: '2026-11-25' } }]);
});

test('rendered: completed today keeps crown + selection, CTA disabled with reason', (t) => {
  const h = dailyScreenHarness({ completed: ['2026-11-25', '2026-11-23'] });
  t.after(h.restore);
  assert.ok(h.byId('daily-art-completed-2026-11-25'));
  assert.equal(h.byId('daily-date-2026-11-25').props.accessibilityState.selected, true);
  const cta = h.byId('daily-play-today');
  assert.equal(cta.props.disabled, true);
  assert.match(cta.props.accessibilityLabel, /already completed/);
  h.press('daily-play-today');
  assert.deepEqual(h.calls.navigation, []);
  h.press('daily-date-2026-11-23');
  assert.ok(h.byId('daily-art-completed-2026-11-23'));
  assert.equal(h.byId('daily-play-today').props.disabled, true);
  h.press('daily-date-2026-11-24');
  assert.equal(h.byId('daily-play-today').props.disabled, false);
  h.press('daily-play-today');
  assert.deepEqual(h.calls.navigation, [{ pathname: '/game', params: { dailyDate: '2026-11-24' } }]);
});

test('rendered: month navigation is dynamic and next is disabled on current month', (t) => {
  const h = dailyScreenHarness();
  t.after(h.restore);
  assert.equal(h.monthTitle(), 'November 2026');
  assert.equal(h.byId('daily-next-month').props.disabled, true);
  h.press('daily-prev-month');
  assert.equal(h.monthTitle(), 'October 2026');
  assert.ok(h.byId('daily-date-2026-10-31'));
  assert.equal(h.byId('daily-date-2026-10-20').props.disabled, true);
  h.press('daily-prev-month'); h.press('daily-prev-month');
  assert.equal(h.monthTitle(), 'August 2026');
  assert.equal(h.all(h.tree(), (p) => /^daily-date-/.test(p.testID ?? '')).length, 31);
  h.press('daily-next-month'); h.press('daily-next-month'); h.press('daily-next-month');
  assert.equal(h.monthTitle(), 'November 2026');
  assert.ok(h.calls.sounds.length >= 6);
});

test('rendered layout: transparent padding cropped, overlay in cropped space, ~90% width', (t) => {
  const h = dailyScreenHarness({ width: 390 });
  t.after(h.restore);
  const frame = h.byId('daily-calendar');
  const flat = (st) => Object.assign({}, ...[].concat(st).flat(Infinity).filter(Boolean));
  const fs_ = flat(frame.props.style);
  assert.equal(fs_.overflow, 'hidden');
  assert.ok(fs_.width / 390 > 0.88 && fs_.width / 390 < 0.95, `width ${fs_.width}`);
  const s = fs_.width / 404;
  assert.ok(Math.abs(fs_.height - 347 * s) < 0.01);
  const img = flat(h.byId('daily-calendar-art').props.style);
  assert.ok(Math.abs(img.left + 28 * s) < 0.01 && Math.abs(img.top + 65 * s) < 0.01);
  assert.ok(Math.abs(img.width / img.height - 448 / 556) < 1e-9, 'aspect preserved');
  const mask = flat(h.byId('daily-calendar-mask').props.style);
  assert.ok(Math.abs(mask.left - 16 * s) < 0.01 && Math.abs(mask.top - 54 * s) < 0.01);
});

test('layout: six-week rows stay >= 32pt, images never exceed a row, narrow screens scroll', () => {
  const h = dailyScreenHarness();
  h.restore();
  const { calendarWidth, calendarLayout } = h.calendar;
  for (const vw of [320, 360, 375, 390, 430]) {
    const six = calendarWidth(vw, 0, 0, 6);
    const L = calendarLayout(six.width, 6);
    assert.ok(L.rowH >= 32, `${vw}: ${L.rowH}`);
    assert.ok(L.art <= L.rowH && L.art <= L.cellW);
    assert.equal(six.scrollsHorizontally, six.width + 8 > six.available);
  }
  assert.equal(calendarWidth(320, 0, 0, 6).scrollsHorizontally, true);
  assert.equal(calendarWidth(390, 0, 0, 6).scrollsHorizontally, false);
  assert.equal(calendarWidth(390, 0, 0, 5).width, 390 * 0.92);
  assert.equal(calendarWidth(430, 44, 44, 5).available, 342);
});

test('rendered: web uses minimum safe-area header/footer padding', (t) => {
  const h = dailyScreenHarness({ platform: 'web', insets: { top: 0, bottom: 0, left: 0, right: 0 } });
  t.after(h.restore);
  const src = fs.readFileSync(path.join(root, 'app/daily.tsx'), 'utf8');
  assert.match(src, /Math\.max\(insets\.top, 67\)/);
  assert.match(src, /Math\.max\(insets\.bottom, 34\)/);
  const header = h.all(h.tree(), (p) => [].concat(p.style).some((s) => s && s.paddingTop === 73))[0];
  assert.ok(header, 'web header pads 67 + 6');
});

test('visual: paper texture is clipped, decorative, from a date-free background region', (t) => {
  const h = dailyScreenHarness({ width: 393 });
  t.after(h.restore);
  const flat = (st) => Object.assign({}, ...[].concat(st).flat(Infinity).filter(Boolean));
  const { PAPER_SOURCE, PAPER_ART, paperTexture, calendarLayout, DAILY_ART } = h.calendar;
  assert.equal(DAILY_ART.paper.asset, '@/assets/images/daily/calendar-background.png');
  assert.ok(PAPER_SOURCE.y >= 345 && PAPER_SOURCE.y + PAPER_SOURCE.height <= 1090, 'avoids wood and clouds');
  assert.ok(PAPER_SOURCE.x + PAPER_SOURCE.width <= PAPER_ART.width);
  const mask = flat(h.byId('daily-calendar-mask').props.style);
  assert.equal(mask.overflow, 'hidden');
  const paper = h.byId('daily-calendar-paper');
  assert.equal(flat(paper.props.style).pointerEvents, 'none');
  assert.equal(paper.props.accessible, false);
  const p = flat(paper.props.style);
  const k = p.width / PAPER_ART.width;
  assert.ok(Math.abs(p.height / PAPER_ART.height - k) < 1e-9, 'uniform scale');
  // Visible window maps strictly inside the clean source region.
  assert.ok(-p.left / k >= PAPER_SOURCE.x - 1e-6 && -p.top / k >= PAPER_SOURCE.y - 1e-6);
  assert.ok((-p.left + mask.width) / k <= PAPER_SOURCE.x + PAPER_SOURCE.width + 1e-6);
  assert.ok((-p.top + mask.height) / k <= PAPER_SOURCE.y + PAPER_SOURCE.height + 1e-6);
  for (const w of [280, 404, 500]) for (const rows of [4, 5, 6]) {
    const L = calendarLayout(w, rows); const tx = paperTexture(L.mask.width, L.mask.height);
    assert.ok((-tx.left + L.mask.width) / tx.k <= PAPER_SOURCE.x + PAPER_SOURCE.width + 1e-6);
    assert.ok((-tx.top + L.mask.height) / tx.k <= PAPER_SOURCE.y + PAPER_SOURCE.height + 1e-6);
  }
  const bg = h.byId('daily-background-art');
  assert.equal(flat(bg.props.style).pointerEvents, 'none');
  assert.equal(bg.props.accessible, false);
});

test('visual: cream header sits above the wood strip and CTA gap is bounded', (t) => {
  const h = dailyScreenHarness({ platform: 'web', insets: { top: 0, bottom: 0, left: 0, right: 0 } });
  t.after(h.restore);
  const flat = (st) => Object.assign({}, ...[].concat(st).flat(Infinity).filter(Boolean));
  const src = fs.readFileSync(path.join(root, 'app/daily.tsx'), 'utf8');
  const header = h.all(h.tree(), (p) => flat(p.style).paddingTop === 73)[0];
  assert.equal(flat(h.tree().props.style).overflow, 'hidden', 'overscaled background cannot expand the page viewport');
  const hs = flat(header.props.style);
  assert.equal(hs.backgroundColor, '#FFF0D2');
  assert.equal(hs.height, 67 + 56);
  const bg = flat(h.byId('daily-background-art').props.style);
  const k = bg.width / 1182;
  assert.ok(Math.abs(bg.top + 115 * k - hs.height) < 1e-6, 'wood begins under header');
  assert.ok(Math.abs(bg.height / bg.width - 1330 / 1182) < 1e-9);
  for (const [width, height] of [[393, 852], [320, 568], [430, 932]]) {
    const sample = dailyScreenHarness({ width, height, platform: 'web' });
    try {
      const art = flat(sample.byId('daily-background-art').props.style);
      assert.ok(art.top + art.height >= height - 1e-6, 'background covers tall viewports without a bottom seam');
    } finally { sample.restore(); }
  }
  assert.match(src, /flexGrow: 0, flexShrink: 0/);
  const cta = h.byId('daily-play-today');
  const gap = flat(cta.props.style({ pressed: false })).marginTop;
  assert.ok(gap >= 12 && gap <= 32, `gap ${gap}`);
});
