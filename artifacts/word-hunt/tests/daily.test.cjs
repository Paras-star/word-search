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

test('curated target pools are unique and pairwise disjoint', () => {
  const categoryWords = loadTypeScript('data/categories.ts').CATEGORIES.flatMap((category) => category.words);
  const onboarding = loadTypeScript('game/onboarding.ts').ONBOARDING_STEPS.flatMap((step) => step.words);
  const dailyWords = loadTypeScript('data/dailyWords.ts').DAILY_WORDS;
  const categorySet = new Set(categoryWords);
  const onboardingSet = new Set(onboarding);
  assert.equal(onboarding.length, 53);
  assert.equal(onboardingSet.size, onboarding.length);
  assert.equal(dailyWords.length, 432);
  assert.equal(new Set(dailyWords).size, dailyWords.length);
  assert.ok(onboarding.every((word) => !categorySet.has(word)));
  assert.ok(dailyWords.every((word) => !categorySet.has(word) && !onboardingSet.has(word)));
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