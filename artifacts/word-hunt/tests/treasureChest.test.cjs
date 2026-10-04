const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const PROGRESS = '@word-hunt/progress-v2';
const REWARDS = '@word-hunt/dumpling-rewards-v1';
const JOURNAL = '@word-hunt/treasure-transaction-v1';
const fresh = coins => ({ coins, completedLevels: ['animals'], onboardingStep: 6, completedDailyPuzzles: ['2026-10-01'] });
const empty = () => ({ rewards: [], ownedDumplingIds: [], pendingRewardId: null });

function harness(coins = 1400, collection = empty()) {
  const values = new Map([[PROGRESS, JSON.stringify(fresh(coins))], [REWARDS, JSON.stringify(collection)]]);
  let failure = null, cache = new Map();
  const storage = {
    getItem: async key => values.get(key) ?? null,
    multiGet: async keys => keys.map(key => [key, values.get(key) ?? null]),
    setItem: async (key, value) => {
      // Deliberately let concurrent operations interleave if there were no lock.
      await new Promise(resolve => setImmediate(resolve));
      if (failure?.key === key && failure.when === 'before') throw new Error('Storage unavailable');
      values.set(key, value);
      if (failure?.key === key && failure.when === 'after') throw new Error('Write acknowledgment lost');
    },
    removeItem: async key => {
      if (failure?.key === key && failure.when === 'remove') throw new Error('Cleanup unavailable');
      values.delete(key);
    },
  };
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const m = { exports: {} };
    cache.set(relative, m.exports);
    const output = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    new Function('require', 'module', 'exports', 'console', output)(name => {
      if (name === '@react-native-async-storage/async-storage') return { __esModule: true, default: storage };
      if (name === 'react-native') return { Platform: { OS: 'android' } };
      if (name.endsWith('.png')) return name;
      const target = name.startsWith('@/') ? name.slice(2)
        : path.posix.join(path.posix.dirname(relative), name);
      return load(target + '.ts');
    }, m, m.exports, { warn() {} });
    cache.set(relative, m.exports);
    return m.exports;
  }
  return {
    values, load,
    get api() { return load('services/treasureChest.ts'); },
    get rewards() { return load('services/dumplingRewards.ts'); },
    get progress() { return load('services/storage.ts'); },
    get lock() { return load('services/gameStateLock.ts'); },
    fail: (key, when = 'before') => { failure = key ? { key, when } : null; },
    restart: () => { cache = new Map(); },
  };
}

test('visiting or reading a treasure chest never charges coins or generates a reward', async () => {
  const h = harness(700);
  await h.progress.loadProgress();
  await h.rewards.getCollection();
  assert.equal(JSON.parse(h.values.get(PROGRESS)).coins, 700);
  assert.equal(JSON.parse(h.values.get(REWARDS)).rewards.length, 0);
  assert.equal(h.values.has(JOURNAL), false);
});

test('balances below 700 cannot purchase and neither record changes', async () => {
  for (const coins of [0, 1, 50, 699]) {
    const h = harness(coins), before = [...h.values];
    await assert.rejects(h.api.purchaseTreasureChest('insufficient'), /700 coins are required/);
    assert.deepEqual([...h.values], before);
  }
});

test('exactly 700 purchases one collected reward and leaves zero, never a negative balance', async () => {
  const h = harness(700);
  const r = await h.api.purchaseTreasureChest('exact');
  assert.equal(r.progress.coins, 0);
  assert.equal(r.reward.collectionState, 'collected');
  assert.ok(['Rare', 'Epic'].includes(r.reward.rarity));
  const c = await h.rewards.getCollection();
  assert.equal(c.rewards.length, 1);
  assert.deepEqual(c.ownedDumplingIds, [r.reward.dumplingId]);
  assert.deepEqual(await h.progress.loadProgress(), { ...fresh(700), coins: 0 });
});

test('larger balances lose exactly 700 and keep all existing progression', async () => {
  const h = harness(1734);
  const r = await h.api.purchaseTreasureChest('larger');
  assert.deepEqual(r.progress, fresh(1034));
  assert.equal((await h.progress.loadProgress()).coins, 1034);
});

test('simultaneous taps with the same ID charge once and return one reward', async () => {
  const h = harness(2100);
  const results = await Promise.all(Array.from({ length: 12 }, () => h.api.purchaseTreasureChest('double-tap')));
  assert.equal(new Set(results.map(r => r.reward.id)).size, 1);
  assert.equal((await h.progress.loadProgress()).coins, 1400);
  assert.equal((await h.rewards.getCollection()).rewards.length, 1);
});

test('concurrent different requests cannot overspend 700 coins', async () => {
  const h = harness(700);
  const results = await Promise.allSettled([h.api.purchaseTreasureChest('first'), h.api.purchaseTreasureChest('second')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await h.progress.loadProgress()).coins, 0);
  assert.equal((await h.rewards.getCollection()).rewards.length, 1);
});

test('one screen purchase ID remains idempotent even after a fresh service/app reload', async () => {
  const h = harness(1400);
  const original = await h.api.purchaseTreasureChest('persisted');
  h.restart();
  const replay = await h.api.purchaseTreasureChest('persisted');
  assert.equal(replay.reward.id, original.reward.id);
  assert.equal(replay.progress.coins, 700);
  assert.equal((await h.rewards.getCollection()).rewards.length, 1);
  assert.ok((await h.rewards.getCollection()).ownedDumplingIds.includes(original.reward.dumplingId));
});

test('premium pool contains only Rare/Epic with deterministic 75/25 weighting', () => {
  const h = harness(), counts = { Rare: 0, Epic: 0 };
  assert.equal(h.api.TREASURE_CHEST_COST, 700);
  for (let i = 0; i < 1000; i++) {
    const reward = h.api.chooseTreasureDumpling(i / 1000, [], (i % 100) / 100);
    counts[reward.rarity]++;
  }
  assert.deepEqual(counts, { Rare: 750, Epic: 250 });
  assert.equal(h.api.chooseTreasureDumpling(0.749999).rarity, 'Rare');
  assert.equal(h.api.chooseTreasureDumpling(0.75).rarity, 'Epic');
  assert.equal(h.api.chooseTreasureDumpling(1, [], 1).rarity, 'Epic');
  assert.throws(() => h.api.chooseTreasureDumpling(NaN), /Invalid/);
});

test('premium selection prefers unowned dumplings within the selected rarity', () => {
  const h = harness(), catalog = h.load('data/dumplings.ts').DUMPLINGS;
  for (const [roll, rarity] of [[0, 'Rare'], [0.9, 'Epic']]) {
    const candidates = catalog.filter(d => d.rarity === rarity);
    const remaining = candidates.at(-1);
    assert.equal(h.api.chooseTreasureDumpling(roll, candidates.slice(0, -1).map(d => d.id), 0).id, remaining.id);
  }
});

test('duplicates have their own reward history, not duplicate owned entries; retry preserves status', async () => {
  const h = harness();
  const catalog = h.load('data/dumplings.ts').DUMPLINGS.filter(d => ['Rare', 'Epic'].includes(d.rarity));
  const owned = catalog.map(d => d.id);
  h.values.set(REWARDS, JSON.stringify({ ...empty(), ownedDumplingIds: owned }));
  const result = await h.api.purchaseTreasureChest('duplicate');
  assert.equal(result.isDuplicate, true);
  assert.equal((await h.rewards.getCollection()).ownedDumplingIds.length, owned.length);
  assert.equal((await h.rewards.getCollection()).rewards.length, 1);
  assert.equal((await h.api.purchaseTreasureChest('duplicate')).isDuplicate, true);
});

test('failure before the durable commit does not deduct or grant anything', async () => {
  const h = harness(700);
  h.fail(JOURNAL);
  await assert.rejects(h.api.purchaseTreasureChest('retryable'));
  assert.equal((await h.progress.loadProgress()).coins, 700);
  assert.equal((await h.rewards.getCollection()).rewards.length, 0);
  h.fail(null);
  assert.equal((await h.api.purchaseTreasureChest('retryable')).progress.coins, 0);
});

test('lost commit acknowledgement is safely recovered and retry cannot charge/grant twice', async () => {
  const h = harness(1400);
  h.fail(JOURNAL, 'after');
  await assert.rejects(h.api.purchaseTreasureChest('response-lost'));
  // Both readers see the same durable commit, even before recovery succeeds.
  assert.equal((await h.progress.loadProgress()).coins, 700);
  assert.equal((await h.rewards.getCollection()).rewards.length, 1);
  h.restart();
  h.fail(null);
  const result = await h.api.purchaseTreasureChest('response-lost');
  assert.equal(result.progress.coins, 700);
  assert.equal((await h.rewards.getCollection()).rewards.length, 1);
  assert.equal(h.values.has(JOURNAL), false);
});

for (const [key, when] of [[PROGRESS, 'before'], [PROGRESS, 'after'], [REWARDS, 'before'], [REWARDS, 'after'], [JOURNAL, 'remove']]) {
  test(`interrupted save (${key}, ${when}) keeps both sides of the purchase and recovers after restart`, async () => {
    const h = harness(700);
    h.fail(key, when);
    const result = await h.api.purchaseTreasureChest('interrupted');
    assert.equal(result.recoveryPending, true);
    assert.equal((await h.progress.loadProgress()).coins, 0);
    assert.equal((await h.rewards.getCollection()).rewards.length, 1);
    assert.ok(h.values.has(JOURNAL));
    h.restart();
    h.fail(null);
    const recovered = await h.api.purchaseTreasureChest('interrupted');
    assert.equal(recovered.progress.coins, 0);
    assert.equal(recovered.reward.id, result.reward.id);
    assert.equal((await h.rewards.getCollection()).rewards.length, 1);
    assert.equal(h.values.has(JOURNAL), false);
  });
}

test('a later coin award first recovers the purchase instead of overwriting it', async () => {
  const h = harness(1400);
  h.fail(REWARDS);
  await h.api.purchaseTreasureChest('before-award');
  await assert.rejects(h.lock.withGameStateLock(async () => {
    const progress = await h.progress.loadProgress();
    await h.progress.saveProgress({ ...progress, coins: progress.coins + 50 });
  }));
  h.fail(null);
  await h.lock.withGameStateLock(async () => {
    const progress = await h.progress.loadProgress();
    await h.progress.saveProgress({ ...progress, coins: progress.coins + 50 });
  });
  assert.equal((await h.progress.loadProgress()).coins, 750);
  assert.equal((await h.rewards.getCollection()).rewards.length, 1);
});

test('corrupted transaction, progress, or collection fails explicitly without replacing player data', async () => {
  for (const [key, value] of [[JOURNAL, '{}'], [PROGRESS, '{}'], [REWARDS, '{}']]) {
    const h = harness();
    h.values.set(key, value);
    const before = [...h.values];
    await assert.rejects(h.api.purchaseTreasureChest('bad-data'));
    assert.deepEqual([...h.values], before);
  }
});

test('normal puzzle rarity distribution remains 50/27/14/7/2 and never charges 700', async () => {
  const h = harness(110);
  const counts = { Common: 0, Uncommon: 0, Rare: 0, Epic: 0, Legendary: 0 };
  for (let i = 0; i < 100; i++) counts[h.rewards.chooseDumpling((i + 0.5) / 100, [], 0).rarity]++;
  assert.deepEqual(counts, { Common: 50, Uncommon: 27, Rare: 14, Epic: 7, Legendary: 2 });
  const reward = await h.rewards.generateAndPersistReward({ puzzleId: 'normal', categoryId: 'animals', mode: 'classic', score: 10 });
  assert.equal(reward.collectionState, 'earned');
  assert.equal((await h.progress.loadProgress()).coins, 110);
  await h.rewards.collectReward(reward.id);
  assert.equal((await h.progress.loadProgress()).coins, 110);
  assert.equal((await h.rewards.getCollection()).rewards.length, 1);
});

test('paid purchase leaves an existing normal pending reward intact', async () => {
  const h = harness(1400);
  const normal = await h.rewards.generateAndPersistReward({ puzzleId: 'normal-first', categoryId: 'animals', mode: 'classic', score: 5 });
  await h.api.purchaseTreasureChest('paid-next');
  assert.equal((await h.rewards.getPendingReward()).id, normal.id);
  assert.equal((await h.rewards.getPendingReward()).collectionState, 'earned');
  await h.rewards.collectReward(normal.id);
  assert.equal((await h.rewards.getCollection()).rewards.length, 2);
  assert.equal((await h.progress.loadProgress()).coins, 700);
});

test('paid and normal collections remain valid with concurrent normal generation and paid purchase', async () => {
  const h = harness(700);
  await Promise.all([
    h.api.purchaseTreasureChest('concurrent-paid'),
    h.rewards.generateAndPersistReward({ puzzleId: 'concurrent-normal', categoryId: 'animals', mode: 'classic', score: 3 }),
  ]);
  const c = await h.rewards.getCollection();
  assert.equal(c.rewards.length, 2);
  assert.equal(c.rewards.filter(r => r.collectionState === 'collected').length, 1);
  assert.equal(c.rewards.filter(r => r.collectionState === 'earned').length, 1);
  assert.equal((await h.progress.loadProgress()).coins, 0);
  assert.equal((await h.rewards.getPendingReward()).puzzleId, 'concurrent-normal');
});

test('Home button uses the supplied icon beneath the unchanged settings gear and opens the paid route', () => {
  const source = fs.readFileSync(path.join(root, 'app/index.tsx'), 'utf8');
  assert.ok(source.indexOf('testID="settings-button"') < source.indexOf('testID="treasure-chest-button"'));
  assert.match(source, /router\.push\('\/treasure-chest'\)/);
  assert.match(source, /assets\/images\/chests\/treasure-chest\.png/);
  assert.match(source, /testID="daily-calendar-button"/);
  assert.match(source, /<AudioSettingsModal/);
});

test('both reward screens share the chest component but only the paid screen invokes purchase', () => {
  const paid = fs.readFileSync(path.join(root, 'app/treasure-chest.tsx'), 'utf8');
  const normal = fs.readFileSync(path.join(root, 'app/reward.tsx'), 'utf8');
  for (const source of [paid, normal]) assert.match(source, /<ChestReveal/);
  assert.match(paid, /game\.purchaseTreasureChest\(requestId\)/);
  assert.doesNotMatch(normal, /purchaseTreasureChest|TREASURE_CHEST_COST|\b700\b/);
  assert.doesNotMatch(paid, /collectReward\(|awardCoins\(/);
  assert.match(normal, /collectReward\(reward\.id\)/);
});

test('purchase button and back behavior have immediate ref guards, plus transaction-safe retries', () => {
  const source = fs.readFileSync(path.join(root, 'app/treasure-chest.tsx'), 'utf8');
  assert.match(source, /if \(inFlight\.current \|\| purchased\.current \|\| !canBuy\) return/);
  assert.ok(source.indexOf('inFlight.current = true') < source.indexOf('await game.purchaseTreasureChest'));
  assert.ok(source.indexOf('blockedRef.current = true') < source.indexOf('await game.purchaseTreasureChest'));
  assert.match(source, /disabled=\{!canBuy\}/);
  assert.match(source, /testID="treasure-chest-tap"/);
  assert.match(source, /testID="treasure-confirm"/);
  assert.match(source, /testID="treasure-cancel"/);
  assert.match(source, /setConfirming\(false\); void open\(\)/);
  assert.doesNotMatch(source, /testID="treasure-open"/);
  assert.match(source, /hardwareBackPress/);
  assert.match(source, /Platform\.OS !== 'web'\s*\? BackHandler\.addEventListener/);
  assert.match(source, /beforeRemove/);
  assert.match(source, /if \(blockedRef\.current\) e\.preventDefault\(\)/);
  assert.match(source, /const requestId = useRef/);
});

test('closed/open chest assets and immutable original uploads are correctly referenced', () => {
  // Original supplied PNGs stay available and unchanged; the new visual
  // source is the separate, isolated sprite animation from the supplied clip.
  const assets = [
    ['treasure-chest.png', 'treasure-chest_1791020049739.png'],
    ['treasure-chest-closed.png', 'treasure-chest-closed_1791020049738.png'],
    ['treasure-chest-open.png', 'treasure-chest-open_1791020049738.png'],
  ];
  for (const [copy, original] of assets) {
    const supplied = path.resolve(root, '../../attached_assets', original);
    // Uploaded-source comparison applies in this workspace; runtime assets are
    // still tested when attached_assets is omitted from a later distribution.
    const local = fs.readFileSync(path.join(root, 'assets/images/chests', copy));
    assert.equal(local.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(local[25], 6, 'RGBA transparency is preserved');
    if (fs.existsSync(supplied)) assert.deepEqual(local, fs.readFileSync(supplied));
  }
});

// Golden preservation checks for the user's explicitly protected surfaces.
// Update deliberately only when the user authorizes changes to that surface.
const protectedGroups = {
  sounds: [['assets/sounds'], '3058dc05d908de8cf76afbbee5614ec973b8faaf1f80cd0c5e93006a3323b0e6'],
  dumplings: [['assets/images/dumplings', 'data/dumplings.ts'], '3929ecc5225a9d7d0d4bfdffcedda08517997aa5c0c4e5423c5e77facef7a30f'],
  launcher: [['assets/launcher'], '136ee046e2237636381c94267ca00af85a447c1035dbd85d122b836c890191c9'],
  gameplay: [['game', 'app/game.tsx'], 'e5c6932148a1e27e10ee2ca918e267a2d034cb7cf5e771de86c0893e310431e1'],
  adsConfig: [['services/ads.ts', 'services/ads.native.ts', 'services/adConfig.ts', 'app.json'], 'f679803aac49bfc6152c26549377ce03ddc9695569f4f6e0df3cc881a2b5f171'],
  audioSettings: [['services/audio.ts', 'services/audioSettings.ts', 'services/dumplingAudio.ts', 'hooks/useAudioSettings.ts', 'components/AudioSettingsModal.tsx', 'components/VolumeSlider.tsx'], '89c8476007cc11b322a9c6f42a7710476a39d77a7b205d659bad480d14bc2894'],
};
function walk(relative) {
  return fs.statSync(path.join(root, relative)).isDirectory()
    ? fs.readdirSync(path.join(root, relative)).flatMap(name => walk(path.posix.join(relative, name)))
    : [relative];
}
for (const [name, [paths, expected]] of Object.entries(protectedGroups)) {
  test(`protected ${name} remains byte-for-byte unchanged`, () => {
    const hash = require('node:crypto').createHash('sha256');
    for (const relative of paths.flatMap(walk).sort()) {
      let bytes = fs.readFileSync(path.join(root, relative));
      if (relative === 'services/audio.ts') {
        bytes = Buffer.from(bytes.toString().replace(/\/\/ BEGIN prepared chest audio[\s\S]*?\/\/ END prepared chest audio\n\n/, ''));
        // Only the additional source entry is authorized. All original
        // volume/music/playback/lifecycle code remains byte-identical.
        bytes = Buffer.from(bytes.toString().replace("  chestOpening: Platform.OS === 'web'\n    ? require('../assets/chest-animation/chest-opening.wav')\n    : require('../assets/chest-animation/chest-opening.m4a'),\n", ''));
      }
      hash.update(relative).update('\0').update(bytes);
    }
    assert.equal(hash.digest('hex'), expected);
  });
}