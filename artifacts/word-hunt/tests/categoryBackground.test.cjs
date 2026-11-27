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
function harness(overrides = {}, os = 'android', width = 400, height = 844) {
  const routes = [], sounds = [], measurements = [];
  const state = { coins: 777, completedLevels: ['animals'], hydrated: true, onboardingStep: 6, ...overrides };
const colors = {
  background: '#FFF9EF', card: '#FFFEFA', muted: '#eee', success: '#050',
  border: '#aaa', warning: '#B77024', accent: '#FFF0D0', foreground: '#153d48',
  mutedForeground: '#59686b',
};
  const screen = load('app/categories.tsx', {
    react: { useState: initial => [initial, value => measurements.push(value)] },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': {
      FlatList: 'FlatList', Pressable: 'Pressable', Text: 'Text', View: 'View',
      Platform: { OS: os }, StyleSheet: { create: x => x, absoluteFill: { position: 'absolute' } },
      useWindowDimensions: () => ({ width, height }),
    },
    'expo-image': { Image: 'Image' },
    'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 16 }) },
    'expo-router': { Redirect: 'Redirect', useRouter: () => ({ back: () => routes.push('back'), push: route => routes.push(route) }) },
    '@expo/vector-icons': { Feather: 'Feather', MaterialCommunityIcons: 'MaterialCommunityIcons' },
    '@/components/GameUI': { Header: 'Header', Screen: 'Screen', CoinPill: 'CoinPill' },
    '@/data/categories': { CATEGORIES },
    '@/game/progression': progression,
    '@/context/GameProvider': { useGame: () => state },
    '@/hooks/useColors': { useColors: () => colors },
    '@/components/AdBanner': { AdBanner: 'AdBanner' },
    '@/services/audio': { playSound: sound => sounds.push(sound) },
    '@/services/animalBackgroundPreparation': { ANIMALS_BACKGROUND_SOURCE: 123 },
    '@/hooks/usePreparedBackground': { usePreparedBackground: kind => { assert.equal(kind, 'animals'); return 123; } },
    '../assets/images/category-title.png': 456,
  }).default;
  return { tree: screen(), routes, sounds, state, measurements, colors };
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

test('category grid keeps all categories scrollable and preserves coins, navigation and banner', () => {
  const h = harness();
  const header = find(h.tree, n => n.type === 'Header');
  assert.equal(header.props.title, '');
  assert.equal(header.props.right.props.children.props.coins, 777);
  header.props.onBack();
  assert.deepEqual(h.routes, ['back']);
  const list = find(h.tree, n => n.type === 'FlatList');
  assert.equal(list.props.data, CATEGORIES);
  assert.equal(list.props.numColumns, 2);
  assert.equal(list.props.scrollEnabled, true);
  assert.equal(CATEGORIES.length, 22);
  assert.deepEqual(CATEGORIES.slice(-5).map(({ id }) => id), ['workshop', 'mythology', 'kitchen', 'transport', 'buildings']);
  assert.deepEqual(CATEGORIES.slice(-4).map(({ id, emoji }) => [id, emoji]), [
    ['mythology', '🐉'], ['kitchen', '🍴'], ['transport', '✈️'], ['buildings', '🏢'],
  ]);
  assert.deepEqual(['animals', 'food'].map(id => {
    const category = CATEGORIES.find(item => item.id === id);
    return [id, category?.emoji];
  }), [['animals', '🐾'], ['food', '🥗']]);
  assert.equal(list.props.data.at(-1).id, 'buildings');
  assert.ok(find(h.tree, n => n.type === 'AdBanner'));
  const rows = CATEGORIES.map((item, index) => list.props.renderItem({ item, index }));
  for (const [index, card] of rows.entries()) {
    assert.equal(card.props.disabled, !progression.isCategoryUnlocked(index, ['animals'], CATEGORIES));
    assert.ok(find(card, n => n.type === 'Text' && n.props.children === CATEGORIES[index].name));
    assert.ok(find(card, n => n.type === 'Text' && n.props.children === CATEGORIES[index].emoji));
    assert.equal(card.props.accessibilityRole, 'button');
    assert.equal(card.props.testID, `category-card-${CATEGORIES[index].id}`);
  }
  const completed = rows[0].props.style({ pressed: false });
  const available = rows[1].props.style({ pressed: false });
  const locked = rows[2].props.style({ pressed: false });
  for (const [index, card] of rows.entries()) {
    assert.equal(find(card, n => n.props?.testID === 'category-crown'), undefined,
      `${CATEGORIES[index].name} has no completion crown`);
    assert.equal(find(card, n => n.type === 'MaterialCommunityIcons'), undefined,
      `${CATEGORIES[index].name} has no replacement symbol`);
    assert.equal(card.props.style({ pressed: false })[1].paddingTop, undefined,
      `${CATEGORIES[index].name} has no reserved top spacing`);
    assert.equal(card.props.style({ pressed: false })[0].justifyContent, 'center',
      `${CATEGORIES[index].name} content stays vertically centered`);
  }
  assert.equal(completed[2].backgroundColor, h.colors.warning, 'completed categories use gold');
  assert.equal(completed[2].borderColor, h.colors.warning, 'completed categories retain the darker outer gold edge');
  assert.equal(completed[2].boxShadow, `0px 2px 8px ${h.colors.warning}66`,
    'completed categories have a restrained gold glow');
  const rim = find(rows[0], n => n.props?.testID === 'completed-category-rim');
  assert.ok(rim, 'completed categories have a metallic gradient rim');
  assert.deepEqual(rim.props.colors, [h.colors.warning, h.colors.accent, h.colors.warning, h.colors.accent, h.colors.warning]);
  assert.deepEqual(rim.props.locations, [0, 0.22, 0.5, 0.78, 1]);
  assert.equal(find(rows[0], n => n.props?.testID === 'completed-category-highlight').props.style[0].opacity, 0.58);
  assert.equal(find(rows[1], n => n.props?.testID === 'completed-category-rim'), undefined,
    'available categories have no gold achievement border');
  assert.equal(find(rows[2], n => n.props?.testID === 'completed-category-rim'), undefined,
    'locked categories have no gold achievement border');
  assert.equal(available[2].backgroundColor, h.colors.card, 'the next category is white');
  assert.equal(available[2].borderColor, h.colors.card, 'the available border stays clean and white');
  assert.equal(locked[2].opacity, 0.58, 'locked categories are faded');
  assert.equal(rows[2].props.disabled, true, 'locked categories cannot be opened');
  assert.equal(rows[0].props.disabled, false, 'completed categories remain playable');
  rows[1].props.onPress();
  assert.deepEqual(h.routes.at(-1), { pathname: '/mode', params: { categoryId: CATEGORIES[1].id } });
  assert.deepEqual(h.sounds, ['tap']);
  rows[0].props.onPress();
  assert.deepEqual(h.routes.at(-1), { pathname: '/mode', params: { categoryId: CATEGORIES[0].id } });
  assert.equal(h.state.coins, 777);
});

test('category completion promotes the next item and circle dimensions fit narrow and short screens', () => {
  const completedProgress = harness({ completedLevels: ['animals', 'food'] }, 'android', 360, 568);
  const list = find(completedProgress.tree, n => n.type === 'FlatList');
  const newlyCompleted = list.props.renderItem({ item: CATEGORIES[1], index: 1 });
  const newlyAvailable = list.props.renderItem({ item: CATEGORIES[2], index: 2 });
  const stillLocked = list.props.renderItem({ item: CATEGORIES[3], index: 3 });
  assert.equal(find(newlyCompleted, n => n.props?.testID === 'category-crown'), undefined);
  assert.equal(find(newlyCompleted, n => n.type === 'MaterialCommunityIcons'), undefined);
  assert.ok(find(newlyCompleted, n => n.props?.testID === 'completed-category-rim'));
  assert.ok(find(newlyCompleted, n => n.props?.testID === 'completed-category-highlight'));
  assert.equal(newlyCompleted.props.style({ pressed: false })[1].paddingTop, undefined);
  assert.equal(newlyCompleted.props.style({ pressed: false })[0].justifyContent, 'center');
  assert.equal(find(newlyAvailable, n => n.props?.testID === 'category-crown'), undefined);
  assert.equal(newlyAvailable.props.disabled, false);
  assert.equal(stillLocked.props.disabled, true);
  assert.equal(list.props.scrollEnabled, true, 'short screens keep the full category list scrollable');

  for (const width of [320, 360, 412, 768]) {
    const responsive = harness({}, 'android', width, 568);
    const responsiveList = find(responsive.tree, n => n.type === 'FlatList');
    const firstCard = responsiveList.props.renderItem({ item: CATEGORIES[0], index: 0 });
    const cardStyle = firstCard.props.style({ pressed: false });
    const expectedSize = Math.min(210, Math.floor((width - 60) / 2));
    const completedRim = find(firstCard, n => n.props?.testID === 'completed-category-rim');
    const rimCutout = find(firstCard, n => n.type === 'View' && n.props?.style?.[0]?.position === 'absolute' &&
      n.props?.style?.[1]?.backgroundColor === responsive.colors.warning);
    const rimStyle = completedRim.props.style[1];
    const rimWidth = Math.max(5, Math.round(expectedSize * 0.03));
    assert.equal(cardStyle[1].width, expectedSize);
    assert.equal(cardStyle[1].height, expectedSize);
    assert.equal(cardStyle[0].justifyContent, 'center');
    assert.equal(cardStyle[1].paddingTop, undefined);
    assert.equal(rimStyle.top, 2);
    assert.equal(rimStyle.right, 2);
    assert.equal(rimStyle.bottom, 2);
    assert.equal(rimStyle.left, 2);
    assert.ok(rimStyle.borderRadius > 0);
    assert.equal(rimCutout.props.style[1].top, rimWidth);
    assert.equal(rimCutout.props.style[1].right, rimWidth);
    assert.equal(rimCutout.props.style[1].bottom, rimWidth);
    assert.equal(rimCutout.props.style[1].left, rimWidth);
  }
});

test('transparent title image stays within the unchanged header row without intercepting either control', () => {
  const h = harness();
  const area = find(h.tree, n => n.props.testID === 'category-title-area');
  const image = find(h.tree, n => n.props.testID === 'category-title-image');
  assert.equal(area.props.pointerEvents, 'none');
  assert.equal(area.props.accessibilityLabel, 'Category');
  assert.equal(area.props.accessibilityRole, 'header');
  assert.deepEqual(area.props.style[0], { position: 'absolute', top: 4, bottom: 4 });
  assert.equal(area.props.style[1].left, 108);
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

test('title centers on the full screen and has no instruction, backing or control overlap', () => {
  const { tree } = harness();
  const area = find(tree, n => n.props.testID === 'category-title-area');
  const { left, right } = area.props.style[1];
  for (const width of [360, 412]) {
    const rowWidth = width - 40;
    const titleLeft = 20 + left;
    const titleWidth = rowWidth - left - right;
    assert.equal(titleLeft + titleWidth / 2, width / 2);
    assert.ok(titleLeft >= 44 + 12, 'back icon and touch target remain clear');
    assert.equal(20 + rowWidth - 96 - (titleLeft + titleWidth), 12, 'coin gap remains 12 pixels');
  }
  const source = read('app/categories.tsx');
  assert.doesNotMatch(source, /Complete (?:a|the) hunt to unlock|headerBacking|styles\.intro/);
  assert.doesNotMatch(source.slice(source.indexOf('<View style={styles.titleRow}>'), source.indexOf('    <FlatList')),
    /backgroundColor|borderColor|borderWidth/);
  assert.doesNotMatch(JSON.stringify(area.props.style), /backgroundColor|border/);
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
