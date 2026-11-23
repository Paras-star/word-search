const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const jsx = (type, props) => ({ type, props });
function load(file, mocks = {}) {
  const module = { exports: {} };
  const js = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', js)(name => {
    if (name in mocks) return mocks[name];
    throw Error(`Unexpected dependency ${name}`);
  }, module, module.exports);
  return module.exports;
}
const { CATEGORIES } = load('data/categories.ts');
const progression = load('game/progression.ts');
const find = (tree, predicate) => {
  if (!tree || typeof tree !== 'object') return undefined;
  if (predicate(tree)) return tree;
  return [tree.props?.children].flat(Infinity).map(child => find(child, predicate)).find(Boolean);
};
function harness(overrides = {}, os = 'android') {
  const routes = [], sounds = [], measurements = [];
  const state = { coins: 777, completedLevels: ['animals'], hydrated: true, onboardingStep: 6, ...overrides };
  const colors = { background: '#FFF9EF', card: '#FFFEFA', muted: '#eee', success: '#050', border: '#aaa' };
  const screen = load('app/categories.tsx', {
    react: { useState: initial => [initial, value => measurements.push(value)] },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': {
      FlatList: 'FlatList', Pressable: 'Pressable', Text: 'Text', View: 'View',
      Platform: { OS: os }, StyleSheet: { create: x => x, absoluteFill: { position: 'absolute' } },
    },
    'expo-image': { Image: 'Image' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 16 }) },
    'expo-router': { Redirect: 'Redirect', useRouter: () => ({ back: () => routes.push('back'), push: route => routes.push(route) }) },
    '@expo/vector-icons': { Feather: 'Feather' },
    '@/components/GameUI': { Header: 'Header', Screen: 'Screen', CoinPill: 'CoinPill', SectionLabel: 'SectionLabel' },
    '@/data/categories': { CATEGORIES },
    '@/game/progression': progression,
    '@/context/GameProvider': { useGame: () => state },
    '@/hooks/useColors': { useColors: () => colors },
    '@/components/AdBanner': { AdBanner: 'AdBanner' },
    '@/services/audio': { playSound: sound => sounds.push(sound) },
    '@/services/animalBackgroundPreparation': { ANIMALS_BACKGROUND_SOURCE: 123 },
    '../assets/images/category-title.png': 456,
  }).default;
  return { tree: screen(), routes, sounds, state, measurements };
}

test('category background reuses the Animal puzzle image with identical centered cover and a non-interactive full-screen layer', () => {
  const { tree } = harness();
  const background = find(tree, n => n.props.testID === 'categories-background');
  assert.equal(background.props.pointerEvents, 'none');
  assert.deepEqual(background.props.style, { position: 'absolute' });
  const image = background.props.children;
  assert.equal(image.props.source, 123);
  assert.equal(image.props.contentFit, 'cover');
  assert.equal(image.props.contentPosition, 'center');
  assert.equal(image.props.transition, 0);
  assert.deepEqual(image.props.style[1], { width: '100%', height: '100%' });
  assert.equal(image.props.accessible, false);
  assert.equal(tree.props.style.paddingHorizontal, 0);
  assert.match(read('services/animalBackgroundPreparation.ts'), /require\('\.\.\/assets\/images\/backgrounds\/animals-background\.png'\)/);
});

test('category grid, cleared/ready/locked statuses, coins, navigation and banner are preserved', () => {
  const h = harness();
  const header = find(h.tree, n => n.type === 'Header');
  assert.equal(header.props.title, '');
  assert.equal(header.props.right.props.children.props.coins, 777);
  header.props.onBack();
  assert.deepEqual(h.routes, ['back']);
  const list = find(h.tree, n => n.type === 'FlatList');
  assert.equal(list.props.data, CATEGORIES);
  assert.equal(list.props.numColumns, 2);
  assert.ok(find(h.tree, n => n.type === 'AdBanner'));
  const rows = CATEGORIES.map((item, index) => list.props.renderItem({ item, index }));
  for (const [index, card] of rows.entries()) {
    assert.equal(card.props.disabled, !progression.isCategoryUnlocked(index, ['animals'], CATEGORIES));
    assert.ok(find(card, n => n.type === 'Text' && n.props.children === CATEGORIES[index].name));
    assert.ok(find(card, n => n.type === 'Text' && n.props.children === CATEGORIES[index].emoji));
    assert.equal(card.props.style({ pressed: false })[1].opacity, 1, 'locked indicators remain readable over artwork');
  }
  assert.match(JSON.stringify(rows[0]), /CLEARED/);
  assert.match(JSON.stringify(rows[1]), /READY/);
  assert.match(JSON.stringify(rows[2]), /LOCKED/);
  rows[1].props.onPress();
  assert.deepEqual(h.routes.at(-1), { pathname: '/mode', params: { categoryId: CATEGORIES[1].id } });
  assert.deepEqual(h.sounds, ['tap']);
  assert.equal(h.state.coins, 777);
});

test('transparent title image stays within the unchanged header row without intercepting either control', () => {
  const h = harness();
  const area = find(h.tree, n => n.props.testID === 'category-title-area');
  const image = find(h.tree, n => n.props.testID === 'category-title-image');
  assert.equal(area.props.pointerEvents, 'none');
  assert.equal(area.props.accessibilityLabel, 'Category');
  assert.equal(area.props.accessibilityRole, 'header');
  assert.deepEqual(area.props.style[0], { position: 'absolute', left: 44, top: 4, bottom: 4 });
  assert.equal(area.props.style[1].right, 108);
  assert.equal(image.props.contentFit, 'contain');
  assert.equal(image.props.contentPosition, 'center');
  assert.equal(image.props.source, 456);
  assert.deepEqual(image.props.style, { width: '100%', height: '100%' });
  find(h.tree, n => n.type === 'Header').props.right.props.onLayout({ nativeEvent: { layout: { width: 72 } } });
  assert.deepEqual(h.measurements, [72], 'title width follows the real coin width, never moves the control');
  const png = fs.readFileSync(path.join(root, 'assets/images/category-title.png'));
  assert.equal(png.readUInt32BE(16), 865);
  assert.equal(png.readUInt32BE(20), 289);
  assert.equal(png[25], 6, 'original RGBA format is retained');
  const crypto = require('node:crypto');
  assert.equal(crypto.createHash('sha256').update(png).digest('hex'),
    '60d80756be64f76022754020c9718084ae2ea1ae0a29a83c7706dd02d952d3d6',
    'asset is byte-for-byte identical to the supplied transparent PNG');
});

test('hydration and tutorial redirects remain intact; native and web headers respect their safe areas', () => {
  assert.equal(harness({ hydrated: false }).tree, null);
  assert.deepEqual(harness({ onboardingStep: 2 }).tree.props.href, {
    pathname: '/game', params: { onboardingStep: '2' },
  });
  for (const os of ['android', 'ios', 'web']) {
    const { tree } = harness({}, os);
    const content = tree.props.children[1];
    assert.equal(content.props.style[1].paddingTop, os === 'web' ? 67 : 24);
    assert.equal(content.props.style[1].paddingBottom, os === 'web' ? 34 : 16);
  }
});
