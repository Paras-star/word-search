const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const jsx = (type, props) => ({ type, props });
const nodes = tree => !tree || typeof tree !== 'object' ? [] : [
  tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes),
];
const find = (tree, id) => nodes(tree).find(node => node.props?.testID === id);
const expand = tree => {
  if (!tree || typeof tree !== 'object') return tree;
  if (typeof tree.type === 'function') return expand(tree.type(tree.props));
  return { ...tree, props: { ...tree.props, children: [tree.props?.children].flat(Infinity).map(expand) } };
};
const style = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
function readPngTransparency(file) {
  const data = fs.readFileSync(file);
  assert.equal(data.toString('hex', 0, 8), '89504e470d0a1a0a');
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  assert.equal(data[24], 8, 'banner must use 8-bit channels');
  assert.equal(data[25], 6, 'banner must use RGBA channels');
  assert.equal(data[28], 0, 'interlaced PNGs are not expected');
  const chunks = [];
  for (let offset = 8; offset < data.length;) {
    const length = data.readUInt32BE(offset);
    if (data.toString('ascii', offset + 4, offset + 8) === 'IDAT') {
      chunks.push(data.subarray(offset + 8, offset + 8 + length));
    }
    offset += length + 12;
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  let prior = Buffer.alloc(stride);
  let transparent = 0;
  let opaqueBlack = 0;
  const corners = [];
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    const row = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const left = i >= 4 ? row[i - 4] : 0;
      const above = prior[i];
      const upperLeft = i >= 4 ? prior[i - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) {
        const p = left + above - upperLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - above);
        const pc = Math.abs(p - upperLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? above : upperLeft;
      } else assert.equal(filter, 0, 'unsupported PNG filter');
      row[i] = (raw[rowStart + i + 1] + predictor) & 255;
    }
    for (let x = 0; x < width; x++) {
      const i = x * 4;
      if (row[i + 3] === 0) transparent++;
      if (row[i + 3] === 255 && row[i] === 0 && row[i + 1] === 0 && row[i + 2] === 0) opaqueBlack++;
      if ((x === 0 || x === width - 1) && (y === 0 || y === height - 1)) corners.push(row[i + 3]);
    }
    prior = row;
  }
  return { width, height, transparent, opaqueBlack, corners };
}
function load(file, mocks = {}) {
  const module = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', output)(name => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.png')) return name;
    throw Error(`Unexpected dependency: ${name}`);
  }, module, module.exports);
  return module.exports;
}
const palette = load('constants/homePalette.ts');
const catalog = load('data/dumplings.ts', { '@/constants/homePalette': palette });
const react = {
  useState: value => [typeof value === 'function' ? value() : value, () => {}],
  useEffect() {},
};
const scenery = {
  CHEST_SCENERY_SOURCE: 'original-beach',
  getPreparedChestScenery: () => 'prepared-beach',
  prepareChestScenery: async () => 'prepared-beach',
};
function harness({ width = 393, height = 852, dumpling = catalog.DUMPLINGS[0], revealed = true,
  opening = true, loading = false, busy = false, error = null, insets = {}, platform = 'web' } = {}) {
  const native = { Platform: { OS: platform }, Pressable: 'Pressable', ScrollView: 'ScrollView',
    Text: 'Text', View: 'View', StyleSheet: { create: s => s, absoluteFill: {} },
    useWindowDimensions: () => ({ width, height }) };
  const shared = load('components/ChestScene.tsx', {
    react, 'react-native': native, 'expo-image': { Image: 'Image' },
    'react/jsx-runtime': { jsx, jsxs: jsx }, '@/services/chestSceneryPreparation': scenery,
  });
  const api = load('components/NormalRewardScene.tsx', {
    react, 'react-native': native, 'expo-image': { Image: 'Image' },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    '@expo/vector-icons': { Feather: 'Feather' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0, ...insets }) },
    '@/constants/homePalette': palette, './ChestReveal': { ChestReveal: 'ChestReveal' },
    './ChestScene': { ...shared, ChestScene: 'ChestScene' }, '@/services/chestSceneryPreparation': scenery,
  });
  const calls = [];
  const props = { dumpling, revealed, opening, loading, busy, error, collected: false,
    score: '1830', time: '02:17', coins: '+50', onOpen: () => calls.push('open'),
    onRevealed: () => calls.push('revealed'), onCollection: () => calls.push('collection'),
    onContinue: () => calls.push('continue'), onHome: () => calls.push('home') };
  return { api, props, calls, tree: expand(api.default(props)), shared };
}

test('all 30 actual catalog rewards use their exact catalog name, rarity banner and unchanged artwork', () => {
  const expected = {
    Common: 'Common_Transparent_Banner_1795631362659.png', Uncommon: 'Uncommon_Transparent_Banner_1795631362659.png',
    Rare: 'Rare_Transparent_Banner_1795631362661.png', Epic: 'Epic_Transparent_Banner_1795631362660.png',
    Legendary: 'Legendary_Transparent_Banner_1795631362661.png',
  };
  const seen = new Set();
  for (const dumpling of catalog.DUMPLINGS) {
    const { tree, api } = harness({ dumpling });
    seen.add(dumpling.rarity);
    const banner = find(tree, 'reward-rarity-banner');
    const image = nodes(banner).find(n => n.type === 'Image');
    assert.equal(path.basename(image.props.source), expected[dumpling.rarity]);
    assert.equal(api.getRarityBanner(dumpling.rarity), image.props.source);
    assert.match(banner.props.accessibilityLabel, new RegExp(dumpling.rarity));
    assert.equal(find(tree, 'reward-dumpling-name').props.children[0], dumpling.name.toUpperCase());
    assert.equal(find(tree, 'reward-chest-tap').props.dumpling, dumpling);
    assert.equal(find(tree, 'reward-chest-tap').props.dumpling.asset, dumpling.asset);
    assert.ok(fs.existsSync(path.resolve(root, 'data', dumpling.asset)));
    assert.ok(fs.existsSync(path.resolve(root, 'components', image.props.source)));
  }
  assert.deepEqual([...seen], catalog.DUMPLING_RARITIES);
  assert.throws(() => harness().api.getRarityBanner('Unknown'), /Unknown rarity/);
});

test('all five replacement rarity banners preserve their original transparent artwork without black backdrops', () => {
  const expected = {
    Common: 'Common_Transparent_Banner_1795631362659.png',
    Uncommon: 'Uncommon_Transparent_Banner_1795631362659.png',
    Rare: 'Rare_Transparent_Banner_1795631362661.png',
    Epic: 'Epic_Transparent_Banner_1795631362660.png',
    Legendary: 'Legendary_Transparent_Banner_1795631362661.png',
  };
  assert.equal(harness().api.BANNER_RATIO, 866 / 288);
  for (const filename of Object.values(expected)) {
    const image = readPngTransparency(path.resolve(root, '..', '..', 'attached_assets', filename));
    assert.deepEqual([image.width, image.height], [866, 288]);
    assert.ok(image.transparent > 0, `${filename} has transparent pixels`);
    assert.deepEqual(image.corners, [0, 0, 0, 0], `${filename} corners reveal the scene behind it`);
    assert.equal(image.opaqueBlack, 0, `${filename} contains no opaque black background`);
  }
});

test('closed-first entry and opening preserve the real ChestReveal contract and prevent premature navigation', () => {
  for (const state of [
    { loading: true, dumpling: null, opening: false, revealed: false },
    { opening: false, revealed: false }, { opening: true, revealed: false },
  ]) {
    const { tree, props, calls } = harness(state);
    const chest = find(tree, 'reward-chest-tap');
    assert.equal(chest.props.opening, props.opening);
    assert.equal(chest.props.disabled, props.loading || !props.dumpling || props.opening || props.revealed);
    assert.equal(find(tree, 'reward-collection').props.disabled, true);
    assert.equal(find(tree, 'reward-continue').props.disabled, true);
    assert.equal(find(tree, 'reward-dumpling-name'), undefined);
    chest.props.onPress();
    chest.props.onRevealed();
    assert.deepEqual(calls, ['open', 'revealed']);
  }
});

test('supplied image buttons preserve their proportions and forward the existing actions across their full area', () => {
  const { tree, calls, api } = harness();
  for (const [id, action, ratio, filename] of [
    ['reward-collection', 'collection', api.COLLECTION_RATIO, 'collection-button.png'],
    ['reward-continue', 'continue', api.CONTINUE_RATIO, 'Continue_1795628061907.png'],
  ]) {
    const button = find(tree, id);
    const geometry = style(button.props.style({ pressed: false }));
    assert.equal(button.props.disabled, false);
    assert.ok(Math.abs(geometry.width / geometry.height - ratio) < 1e-9);
    assert.equal(path.basename(nodes(button).find(n => n.type === 'Image').props.source), filename);
    button.props.onPress();
    assert.equal(calls.at(-1), action);
  }
  const busy = harness({ busy: true });
  assert.equal(find(busy.tree, 'reward-collection').props.disabled, true);
  assert.equal(find(busy.tree, 'reward-continue').props.disabled, true);
  const failed = harness({ error: 'Save failed; tap to retry' });
  assert.equal(find(failed.tree, 'reward-continue').props.disabled, false);
  assert.ok(find(failed.tree, 'reward-error'));
});

test('narrow, short and desktop layouts scroll without collisions and retain exact pedestal alignment', () => {
  for (const [width, height] of [[280, 480], [320, 568], [393, 852], [768, 600], [1440, 900]]) {
    const { tree, api, shared } = harness({ width, height });
    const L = api.getNormalRewardLayout(width);
    assert.deepEqual(L.scene, shared.getChestSceneLayout(L.W, L.artH));
    assert.ok(L.W <= width && L.W <= 480);
    assert.ok(L.bannerTop + L.bannerH <= L.scene.chestTop + 0.01);
    assert.ok(L.collectionTop > L.scene.chestTop + L.scene.stage);
    assert.ok(L.continueTop > L.collectionTop + L.collectionH);
    assert.ok(L.statsTop > L.continueTop + L.continueH);
    assert.ok(L.totalH >= L.statsTop + 78);
    assert.equal(find(tree, 'reward-scroll').type, 'ScrollView');
    for (const d of catalog.DUMPLINGS) {
      const panel = api.getBannerNameLayout(L.bannerW, d.name);
      assert.ok(panel.left >= L.bannerW * 0.30);
      assert.ok(panel.left + panel.width <= L.bannerW * 0.84);
      assert.ok(panel.top > 0 && panel.height > 0 && panel.fontSize >= 9);
      assert.ok(panel.fontSize * 0.6 * d.name.length <= panel.width + 0.01);
    }
  }
});

test('reward artwork renders once at the safe-area-aware scene position', () => {
  const { tree, api } = harness({ width: 393, height: 852, platform: 'ios', insets: { top: 47 } });
  const rootStyle = style(find(tree, 'normal-reward-scene').props.style);
  const scroll = find(tree, 'reward-scroll');
  assert.equal(rootStyle.backgroundColor, palette.homeColors.background);
  assert.equal(scroll.props.contentContainerStyle.paddingTop, 47);
  assert.equal(nodes(tree).filter(node => node.type === 'ChestScene').length, 1);
  assert.equal(nodes(tree).filter(node => node.type === 'Image' && node.props.blurRadius).length, 0);
  assert.equal(nodes(tree).filter(node => node.props.testID === 'chest-scene-background').length, 0);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'components/NormalRewardScene.tsx'), 'utf8'), /blurRadius|styles\.veil/);
  assert.equal(api.getNormalRewardLayout(393).scene.imgY, 0);
});

test('result panel reuses Daily completion styling with actual normal-level values and no old cream sheet', () => {
  const { tree } = harness();
  assert.equal(find(tree, 'reward-score').props.children[0], '1830');
  assert.equal(find(tree, 'reward-time').props.children[0], '02:17');
  assert.equal(find(tree, 'reward-coins').props.children[0], '+50');
  const stats = style(find(tree, 'reward-result-stats').props.style);
  assert.equal(stats.backgroundColor, palette.homeColors.goldSoft);
  assert.equal(stats.borderColor, palette.homeColors.gold);
  assert.equal(stats.borderWidth, 2);
  assert.equal(stats.borderRadius, 18);
  for (const file of ['app/reward.tsx', 'components/NormalRewardScene.tsx']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'),
      /rewardSheet|A surprise is waiting|A little magic is happening|now lives in your Collection Room|VIEW COLLECTION ROOM/);
  }
});
