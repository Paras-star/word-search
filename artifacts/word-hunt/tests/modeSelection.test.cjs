const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const jsx = (type, props) => ({ type, props });
function load(file, mocks = {}) {
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', 'Date', js)(name => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.png')) return name;
    throw Error(`Unexpected dependency: ${name}`);
  }, module, module.exports, { now: () => 1795457000000 });
  return module.exports;
}
const catalog = load('data/categories.ts');
const progression = load('game/progression.ts');
const all = tree => !tree || typeof tree !== 'object' ? [] : [
  tree, ...[tree.props?.children].flat(Infinity).flatMap(all),
];
const find = (tree, id) => all(tree).find(n => n.props.testID === id);
function harness({ categoryId = 'animals', completedLevels = catalog.CATEGORIES.map(c => c.id),
  hydrated = true, onboardingStep = 6, width = 360, height = 640, os = 'web' } = {}) {
  const routes = [], sounds = [], effects = [];
  let preparations = 0;
  const screen = load('app/mode.tsx', {
    react: { useEffect: fn => effects.push(fn) },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': {
      View: 'View', Pressable: 'Pressable', Platform: { OS: os },
      useWindowDimensions: () => ({ width, height }),
      StyleSheet: { create: s => s, absoluteFill: { position: 'absolute' } },
    },
    'expo-image': { Image: 'Image' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 16 }) },
    'expo-router': {
      Redirect: 'Redirect', useLocalSearchParams: () => ({ categoryId }),
      useRouter: () => ({ replace: route => routes.push(route) }),
    },
    '@/data/categories': catalog,
    '@/game/progression': progression,
    '@/context/GameProvider': { useGame: () => ({ completedLevels, hydrated, onboardingStep }) },
    '@/services/animalBackgroundPreparation': {
      prepareAnimalBackground: () => { preparations++; return Promise.resolve({}); },
    },
    '@/services/audio': { playSound: sound => sounds.push(sound) },
  }).default;
  const tree = screen();
  effects.forEach(fn => fn());
  return { tree, routes, sounds, preparations };
}

test('shared Mode Selection renders only the three supplied images and two accessible interactive buttons', () => {
  const { tree } = harness();
  const nodes = all(tree);
  assert.equal(nodes.filter(n => n.type === 'Image').length, 3);
  assert.equal(nodes.filter(n => n.type === 'Pressable').length, 2);
  assert.ok(nodes.every(n => ['View', 'Image', 'Pressable'].includes(n.type)));
  assert.ok(nodes.every(n => !Object.values(n.props).some(v => typeof v === 'string' && /PLAY CLASSIC|Pick your pace|Every hunt/.test(v))));
  const bg = find(tree, 'mode-selection-background');
  assert.equal(bg.props.pointerEvents, 'none');
  assert.equal(bg.props.children.props.contentFit, 'cover');
  assert.equal(bg.props.children.props.contentPosition, 'center');
  for (const id of ['classic-mode-button', 'time-mode-button']) {
    const button = find(tree, id);
    assert.equal(button.props.accessibilityRole, 'button');
    assert.equal(typeof button.props.onPress, 'function');
    assert.equal(button.props.children.props.contentFit, 'contain');
    assert.equal(button.props.children.props.contentPosition, 'center');
    assert.deepEqual(button.props.children.props.style, { width: '100%', height: '100%' });
  }
});

test('every normal category and a future category preserve route, mode, timestamp seed and one tap sound', () => {
  const future = { ...catalog.CATEGORIES.at(-1), id: 'future-category' };
  catalog.CATEGORIES.push(future);
  try {
    for (const category of catalog.CATEGORIES) {
      for (const [id, mode] of [['classic-mode-button', 'classic'], ['time-mode-button', 'time']]) {
        const h = harness({ categoryId: category.id });
        find(h.tree, id).props.onPress();
        assert.deepEqual(h.routes, [{
          pathname: '/game', params: { categoryId: category.id, mode, seed: '1795457000000' },
        }]);
        assert.deepEqual(h.sounds, ['tap']);
        assert.equal(h.preparations, 1);
      }
    }
  } finally {
    catalog.CATEGORIES.pop();
  }
});

test('hydration, all six onboarding redirects and locked/unknown category guards remain intact', () => {
  assert.equal(harness({ hydrated: false }).tree, null);
  assert.equal(harness({ hydrated: false }).preparations, 0);
  for (let step = 0; step < 6; step++) {
    const h = harness({ onboardingStep: step });
    assert.equal(h.tree.type, 'Redirect');
    assert.deepEqual(h.tree.props.href, { pathname: '/game', params: { onboardingStep: String(step) } });
    assert.equal(h.preparations, 0);
  }
  for (const categoryId of [catalog.CATEGORIES[1].id, 'not-a-category']) {
    const h = harness({ categoryId, completedLevels: [] });
    assert.equal(h.tree.type, 'Redirect');
    assert.equal(h.tree.props.href, '/categories');
    assert.deepEqual(h.routes, []);
  }
});

test('both requested sizes and shorter devices keep centered, equal-width buttons inside safe bounds at original ratios', () => {
  for (const [width, height] of [[360, 640], [412, 915], [320, 480], [915, 412]]) {
    for (const os of ['web', 'android', 'ios']) {
      const { tree } = harness({ width, height, os });
      const content = tree.props.children[1];
      const style = Object.assign({}, ...content.props.style);
      assert.equal(style.alignItems, 'center');
      assert.equal(style.justifyContent, 'center');
      const classic = Object.assign({}, ...find(tree, 'classic-mode-button').props.style({ pressed: false }));
      const time = Object.assign({}, ...find(tree, 'time-mode-button').props.style({ pressed: false }));
      assert.equal(classic.width, time.width);
      assert.equal(classic.aspectRatio, 786 / 273);
      assert.equal(time.aspectRatio, 788 / 309);
      assert.ok(classic.width <= width - 40);
      const pairHeight = classic.width / classic.aspectRatio + time.width / time.aspectRatio + style.gap;
      assert.ok(pairHeight <= height - style.paddingTop - style.paddingBottom - 31,
        `${width} × ${height}, ${os}: both buttons retain vertical clearance`);
    }
  }
});

test('all three application assets retain the exact supplied PNG bytes, dimensions and transparency formats', () => {
  const assets = [
    ['assets/images/classic-mode-button.png', 786, 273, 6, '7e7268b4a7fe977cccde65910c53dc8c6ac60975833814d2b518a359d038b844'],
    ['assets/images/time-mode-button.png', 788, 309, 6, '9dc82c0ba402811472396277bacd9cf178f7a5bcd75878ac7ea405bb81868cd9'],
    ['assets/images/backgrounds/mode-selection-background.png', 547, 878, 6, 'be937ff0a2363d81695420981e6aede3ab2bb0987a13488d77bed955ca37cdce'],
  ];
  for (const [file, width, height, colorType, hash] of assets) {
    const bytes = fs.readFileSync(path.join(root, file));
    assert.equal(bytes.readUInt32BE(16), width);
    assert.equal(bytes.readUInt32BE(20), height);
    assert.equal(bytes[25], colorType);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), hash);
  }
});
