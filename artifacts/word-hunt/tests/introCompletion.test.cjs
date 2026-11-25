const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const jsx = (type, props) => ({ type, props });
const nodes = tree => !tree || typeof tree !== 'object' ? [] : [
  tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes),
];
const find = (tree, id) => nodes(tree).find(node => node.props.testID === id);
function load(file, mocks) {
  const module = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    },
  }).outputText;
  new Function('require', 'module', 'exports', output)(name => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.png')) return name;
    throw Error(`Unexpected dependency: ${name}`);
  }, module, module.exports);
  return module.exports;
}
const onboarding = load('game/onboarding.ts', {});
function harness({ step = 0, savedStep = step + 1, width = 360, height = 640,
  os = 'web', params = { onboardingStep: String(step) } } = {}) {
  const routes = [], sounds = [], effects = [];
  const react = { useEffect: fn => effects.push(fn), useRef: value => ({ current: value }), useState: value => [value, () => {}] };
  const native = {
    View: 'View', Text: 'Text', ScrollView: 'ScrollView', Pressable: 'Pressable',
    Platform: { OS: os }, useWindowDimensions: () => ({ width, height }),
    StyleSheet: { create: s => s, absoluteFill: { position: 'absolute' } },
  };
  const base = { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native };
  const IntroCompletion = load('components/IntroCompletion.tsx', {
    ...base, 'expo-image': { Image: 'Image' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) },
    '@/services/audio': { playSound: value => sounds.push(value) },
  }).default;
  const Results = load('app/results.tsx', {
    ...base,
    'expo-router': {
      Redirect: 'Redirect', useLocalSearchParams: () => params,
      useRouter: () => ({ replace: route => routes.push(route) }),
    },
    '@expo/vector-icons': { Feather: 'Feather' },
    '@/components/GameUI': { Screen: 'Screen', Header: 'Header', PrimaryButton: 'PrimaryButton', SoftButton: 'SoftButton' },
    '@/components/IntroCompletion': { __esModule: true, default: IntroCompletion },
    '@/components/DailyCompletion': { __esModule: true, default: 'DailyCompletion' },
    '@/data/categories': { CATEGORIES: [], getCategory: () => ({ id: 'animals', name: 'Animals' }) },
    '@/game/progression': { nextCategoryId: () => 'food' },
    '@/game/onboarding': onboarding,
    '@/services/nightBackgroundPreparation': { warmNightBackground() {} },
    '@/game/daily': { parseLocalDateKey: () => ({}) },
    '@/game/scoring': { formatTime: () => '0:10' },
    '@/hooks/useColors': { useColors: () => ({}) },
    '@/context/GameProvider': { useGame: () => ({ onboardingStep: savedStep, completedDailyPuzzles: ['2026-11-24'] }) },
    '@/services/ads': {
      isAdsSupported: () => false, isRewardedReady: () => false,
      prepareAds: () => { throw Error('Intro results must not prepare ads'); },
    },
    '@/services/adConfig': { REWARDED_COINS: 10 },
    '@/services/adDiagnostics': { logAd: () => {} },
  }).default;
  const result = Results();
  const tree = result.type === IntroCompletion ? IntroCompletion(result.props) : result;
  return { tree, routes, sounds, effects };
}

test('all six introductory states show exactly four images, no old UI, and no ad preparation', () => {
  for (let step = 0; step < 6; step++) {
    const h = harness({ step });
    h.effects.forEach(fn => fn());
    const elements = nodes(h.tree);
    assert.equal(elements.filter(node => node.type === 'Image').length, 4);
    assert.equal(elements.filter(node => node.type === 'Pressable').length, 2);
    assert.ok(elements.every(node => ['View', 'Pressable', 'Image'].includes(node.type)));
    assert.equal(find(h.tree, 'intro-completion-background').props.children.props.contentFit, 'cover');
    assert.equal(find(h.tree, 'intro-completion-background').props.children.props.contentPosition, 'center');
    assert.ok(elements.filter(node => node.type === 'Image').slice(1).every(node => node.props.contentFit === 'contain'));
  }
});

test('NEXT preserves every destination, including Level 5 to Animals, and HOME replaces the home route', () => {
  for (let step = 0; step < 6; step++) {
    const h = harness({ step });
    const next = find(h.tree, 'intro-next');
    const home = find(h.tree, 'intro-home');
    assert.equal(next.props.accessibilityRole, 'button');
    assert.equal(home.props.accessibilityRole, 'button');
    next.props.onPress();
    home.props.onPress();
    assert.deepEqual(h.routes, [
      step < 5 ? { pathname: '/game', params: { onboardingStep: String(step + 1) } }
        : { pathname: '/mode', params: { categoryId: 'animals' } },
      '/',
    ]);
    assert.deepEqual(h.sounds, ['tap', 'tap']);
  }
});

test('invalid and stale results keep existing guards, and normal/Daily results do not use intro artwork', () => {
  for (const step of [-1, 6, 1.5]) assert.equal(harness({ step }).tree.type, 'Redirect');
  assert.equal(harness({ step: 0, savedStep: 3 }).tree.props.href, '/');
  assert.equal(harness({ params: { categoryId: 'animals' }, savedStep: 2 }).tree.type, 'Redirect');
  for (const params of [{ categoryId: 'animals' }, { dailyDate: '2026-11-24' }]) {
    const { tree } = harness({ params, savedStep: 6 });
    assert.equal(tree.type, params.dailyDate ? 'DailyCompletion' : 'Screen');
    assert.equal(find(tree, 'intro-completion'), undefined);
  }
});

test('requested viewports and shorter devices fit inside safe bounds with original ratios and descending widths', () => {
  for (const [width, height] of [[390, 844], [393, 852], [360, 780], [360, 640], [412, 915], [320, 480], [915, 412]]) {
    for (const os of ['web', 'ios', 'android']) {
      const { tree } = harness({ width, height, os });
      const content = tree.props.children[1];
      const padding = Object.assign({}, ...content.props.style);
      const panel = find(tree, 'intro-nice-work').props.style;
      const next = Object.assign({}, ...find(tree, 'intro-next').props.style({ pressed: false }));
      const home = Object.assign({}, ...find(tree, 'intro-home').props.style({ pressed: false }));
      const gap = Object.assign({}, ...content.props.children[1].props.style).gap;
      assert.equal(panel.aspectRatio, 654 / 382);
      assert.equal(next.aspectRatio, 956 / 261);
      assert.equal(home.aspectRatio, 941 / 265);
      assert.ok(panel.width > next.width && next.width > home.width);
      assert.ok(panel.width <= width - padding.paddingLeft - padding.paddingRight);
      const total = panel.width / panel.aspectRatio + next.width / next.aspectRatio + home.width / home.aspectRatio + gap * 2;
      assert.ok(total <= height - padding.paddingTop - padding.paddingBottom + 0.001, `${width}x${height} ${os}`);
    }
  }
});

test('image copies preserve the supplied bytes and existing background', () => {
  const assets = [
    ['Nice Work.png', 'Nice_Work_1795509164125.png'],
    ['Next Panel.png', 'Next_Panel_1795509164120.png'],
    ['Home Panel.png', 'Home_Panel_1795509164124.png'],
  ];
  for (const [destination, supplied] of assets) {
    assert.deepEqual(fs.readFileSync(path.join(root, 'assets/images', destination)),
      fs.readFileSync(path.join(root, '../../attached_assets', supplied)));
  }
});
