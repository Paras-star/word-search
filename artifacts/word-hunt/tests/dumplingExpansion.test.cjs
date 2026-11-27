const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const REWARDS = '@word-hunt/dumpling-rewards-v1';
const PROGRESS = '@word-hunt/progress-v2';

const additions = [
  ['phoenix-blaze', 'Phoenix Blaze', 'Legendary', 'Legendary-Phoenix-Blaze_1795795943824.png', 'cdf0af5b4629e3c79914edfa77eaaa96adb0fca612eb1ff6f085921814f7ac2b'],
  ['deep-oceanic', 'Deep Oceanic', 'Epic', 'Epic-Deep-Oceanic_1795795943823.png', 'e53efa7c00d26878920ecd8e83e1ca4a92bf927efb4e6d994495e47454151861'],
  ['forest-sprite', 'Forest Sprite', 'Rare', 'Rare-Forest-Sprite_1795795943822.png', '7d2262760aa1fb7da88a17578e8271ca7f7e3d735061003832014f9d0d3049d2'],
  ['cosmic-stardust', 'Cosmic Stardust', 'Rare', 'Rare-Cosmic-Stardust_1795795943822.png', '1b942bc55353706e6cbcf5a11efdb7602f448f5370fa92db024eeebc876d6390'],
  ['berry-swirl', 'Berry Swirl', 'Uncommon', 'Uncommon-Berry-Swirl_1795795943819.png', 'f7a65c420371b6350e4a47bffe1a6d22cdd3d863eb8d7dce54608db20f1ccbc9'],
  ['honey-butter', 'Honey Butter', 'Uncommon', 'Uncommon-Honey-Butter_1795795943818.png', 'b36cd349006c1913aafa8d2073c8fad2ffe7725415ce4ef396d68eb933fe14da'],
  ['blueberry', 'Blueberry', 'Uncommon', 'Uncommon-Blueberry_1795795943819.png', '02346ba888454659c1766658340847cf465855fe1ca5672a8b24a91db1c74bee'],
  ['plum-velvet', 'Plum Velvet', 'Common', 'Common-Plum-Velvet_1795795943821.png', '12d41cb51217b616e194642ac91c452dd3a1781a04ca1f7522c5fa43c247bf46'],
  ['choco-drizzle', 'Choco Drizzle', 'Common', 'Common-Choco-Drizzle_1795795943821.png', '44973dca90fc06ec43824a27eb861c08725e1817de7178cfda61d2da889affcf'],
  ['lemon-zing', 'Lemon Zing', 'Common', 'Common-Lemon-Zing_1795795943820.png', 'dce849fdb3e853887a6346e5b413d62b0eb1efca91890be620184ac3e12e49ac'],
];

function harness() {
  const values = new Map();
  let cache = new Map();
  const random = Object.create(Math);
  random.random = () => 0.1;
  const storage = {
    getItem: async key => values.get(key) ?? null,
    multiGet: async keys => keys.map(key => [key, values.get(key) ?? null]),
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => { values.delete(key); },
  };
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const module = { exports: {} };
    const js = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    new Function('require', 'module', 'exports', 'Math', js)(name => {
      if (name === '@react-native-async-storage/async-storage') return { __esModule: true, default: storage };
      if (name === 'react-native') return { Platform: { OS: 'android' } };
      if (name.endsWith('.png')) return name;
      return load((name.startsWith('@/') ? name.slice(2) : path.posix.join(path.posix.dirname(relative), name)) + '.ts');
    }, module, module.exports, random);
    cache.set(relative, module.exports);
    return module.exports;
  }
  return { values, load, random, restart() { cache = new Map(); } };
}

test('ten exact original PNGs are registered once with the required names, IDs and rarities', () => {
  const { DUMPLINGS, DUMPLING_BY_ID } = harness().load('data/dumplings.ts');
  assert.equal(DUMPLINGS.length, 40);
  assert.equal(new Set(DUMPLINGS.map(d => d.id)).size, 40);
  assert.equal(new Set(DUMPLINGS.map(d => d.asset)).size, 40);
  assert.deepEqual(DUMPLINGS.slice(30).map(d => d.id), additions.map(([id]) => id));
  for (const [id, name, rarity, file, sha] of additions) {
    const d = DUMPLING_BY_ID[id];
    assert.deepEqual(d, { id, name, rarity, asset: `../../../attached_assets/${file}` });
    assert.equal(DUMPLINGS.filter(item => item.asset === d.asset).length, 1);
    const bytes = fs.readFileSync(path.resolve(root, 'data', d.asset));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), sha, 'uploaded artwork is byte-identical');
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(bytes[25], 6, 'original RGBA transparency is retained');
    assert.ok(bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0);
  }
});

test('all new rewards can be earned, collected and reloaded while preserving all 30 legacy collectibles', async () => {
  const rarityRoll = { Common: 0.1, Uncommon: 0.6, Rare: 0.8, Epic: 0.93, Legendary: 0.99 };
  for (const [id, , rarity] of additions) {
    const h = harness();
    const { DUMPLINGS } = h.load('data/dumplings.ts');
    const legacy = DUMPLINGS.slice(0, 30);
    const legacyRewards = legacy.map((d, i) => ({
      id: `legacy-${i}`, dumplingId: d.id, rarity: d.rarity, earnedAt: '2026-11-01T00:00:00.000Z',
      collectionState: 'collected', puzzleId: `previous-${i}`,
    }));
    const saved = { rewards: legacyRewards, ownedDumplingIds: legacy.map(d => d.id), pendingRewardId: null };
    h.values.set(REWARDS, JSON.stringify(saved));
    h.values.set(PROGRESS, JSON.stringify({ coins: 1432, onboardingStep: 6, completedLevels: ['animals'], completedDailyPuzzles: ['2026-11-01'] }));
    const originalProgress = h.values.get(PROGRESS);
    const service = h.load('services/dumplingRewards.ts');
    assert.deepEqual(await service.loadRewardStore(), saved, 'legacy ownership/history survive without migration');
    assert.equal(h.values.get(REWARDS), JSON.stringify(saved), 'reading does not rewrite saved data');
    const pool = DUMPLINGS.filter(d => d.rarity === rarity && !saved.ownedDumplingIds.includes(d.id));
    assert.ok(pool.some(d => d.id === id));
    assert.equal(service.chooseDumpling(rarityRoll[rarity], saved.ownedDumplingIds,
      (pool.findIndex(d => d.id === id) + 0.5) / pool.length).id, id);
    let calls = 0;
    h.random.random = () => calls++ === 0 ? rarityRoll[rarity] :
      (pool.findIndex(d => d.id === id) + 0.5) / pool.length;
    const reward = await service.generateAndPersistReward({ puzzleId: `new-${id}` });
    assert.equal(reward.dumplingId, id);
    assert.equal(reward.rarity, rarity);
    assert.equal(reward.collectionState, 'earned');
    assert.deepEqual((await service.getCollection()).ownedDumplingIds, saved.ownedDumplingIds);
    const collected = await service.collectReward(reward.id);
    assert.equal(collected.isDuplicate, false);
    assert.equal(collected.reward.collectionState, 'collected');
    h.restart();
    const reloaded = h.load('services/dumplingRewards.ts');
    const store = await reloaded.loadRewardStore();
    assert.deepEqual(store.ownedDumplingIds, [...saved.ownedDumplingIds, id]);
    assert.deepEqual(store.rewards.slice(0, 30), legacyRewards);
    assert.equal(store.pendingRewardId, null);
    assert.equal((await reloaded.collectReward(reward.id)).isDuplicate, true);
    assert.equal((await reloaded.getCollection()).ownedDumplingIds.length, 31);
    assert.equal(h.values.get(PROGRESS), originalProgress, 'coins, levels and Daily progress are untouched');
  }
});

test('normal rarity distribution remains exactly 50/27/14/7/2 with the expanded catalog', () => {
  const service = harness().load('services/dumplingRewards.ts');
  const actual = { Common: 0, Uncommon: 0, Rare: 0, Epic: 0, Legendary: 0 };
  for (let i = 0; i < 10000; i++) actual[service.chooseDumpling((i + 0.5) / 10000, [], 0).rarity]++;
  assert.deepEqual(actual, { Common: 5000, Uncommon: 2700, Rare: 1400, Epic: 700, Legendary: 200 });
});
