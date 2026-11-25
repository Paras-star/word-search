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
const find = (tree, id) => nodes(tree).find(node => node.props?.testID === id);
const style = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
const expand = tree => {
  if (!tree || typeof tree !== 'object') return tree;
  if (typeof tree.type === 'function') return expand(tree.type(tree.props));
  return { ...tree, props: { ...tree.props, children: [tree.props?.children].flat(Infinity).map(expand) } };
};
function load(file, mocks = {}) {
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
const palette = load('constants/homePalette.ts');
const daily = load('game/daily.ts', { '@/data/dailyWords': { DAILY_WORDS: [] } });
const scoring = load('game/scoring.ts', { '@/constants/homePalette': palette });

function harness({ params = { dailyDate: '2026-11-24', score: '270', time: '84' },
  completed = ['2026-11-24'], canGoBack = true, onboardingStep = 6,
  width = 393, height = 852, os = 'web',
  insets = { top: 24, bottom: 16, left: 0, right: 0 } } = {}) {
  const effects = [], routes = [], writes = [];
  const react = {
    useEffect: fn => effects.push(fn), useRef: value => ({ current: value }),
    useState: value => [value, () => {}],
  };
  const native = {
    View: 'View', Text: 'Text', ScrollView: 'ScrollView', Pressable: 'Pressable',
    Platform: { OS: os }, useWindowDimensions: () => ({ width, height }),
    StyleSheet: { create: value => value, absoluteFill: { position: 'absolute' } },
  };
  const base = { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native };
  const DailyCompletion = load('components/DailyCompletion.tsx', {
    ...base, 'expo-image': { Image: 'Image' }, '@/constants/homePalette': palette,
    'react-native-safe-area-context': { useSafeAreaInsets: () => insets },
  }).default;
  const forbiddenAd = () => { throw Error('Daily results must not prepare or play ads'); };
  const Results = load('app/results.tsx', {
    ...base,
    'expo-router': {
      Redirect: 'Redirect', useLocalSearchParams: () => params,
      useRouter: () => ({
        canGoBack: () => canGoBack, back: () => routes.push('back'),
        replace: route => routes.push(route),
      }),
    },
    '@expo/vector-icons': { Feather: 'Feather' },
    '@/components/GameUI': { Screen: 'Screen', Header: 'Header', PrimaryButton: 'PrimaryButton', SoftButton: 'SoftButton' },
    '@/components/IntroCompletion': { __esModule: true, default: 'IntroCompletion' },
    '@/components/DailyCompletion': { __esModule: true, default: DailyCompletion },
    '@/data/categories': { CATEGORIES: [], getCategory: () => ({ id: 'animals', name: 'Animals' }) },
    '@/game/progression': { nextCategoryId: () => undefined },
    '@/game/onboarding': { getOnboardingStep: () => undefined },
    '@/game/daily': daily, '@/game/scoring': scoring,
    '@/hooks/useColors': { useColors: () => ({}) },
    '@/context/GameProvider': { useGame: () => ({
      onboardingStep, completedDailyPuzzles: completed,
      awardCoins: (...args) => writes.push(['awardCoins', ...args]),
      completeDailyPuzzle: (...args) => writes.push(['completeDailyPuzzle', ...args]),
    }) },
    '@/services/ads': {
      isAdsSupported: () => false, isRewardedReady: () => false,
      prepareAds: forbiddenAd, subscribeToAds: forbiddenAd, watchRewardedForCoins: forbiddenAd,
    },
    '@/services/adConfig': { REWARDED_COINS: 10 },
    '@/services/adDiagnostics': { logAd() {} },
    '@/services/nightBackgroundPreparation': { warmNightBackground() {} },
  }).default;
  const render = () => {
    effects.length = 0;
    const tree = expand(Results());
    effects.forEach(fn => fn());
    return tree;
  };
  return { tree: render(), render, routes, writes };
}

test('Daily results show the original completion date, score, formatted time and exactly +20 coins', () => {
  const { tree } = harness();
  assert.ok(find(tree, 'daily-completion'));
  assert.deepEqual(find(tree, 'daily-completion-date').props.children, ['2026-11-24']);
  assert.deepEqual(find(tree, 'daily-completion-score').props.children, ['270']);
  assert.deepEqual(find(tree, 'daily-completion-time').props.children, ['1:24']);
  assert.deepEqual(find(tree, 'daily-completion-coins').props.children, ['+20']);
  for (const label of ['SCORE 270', 'TIME 1:24', 'COINS EARNED +20']) {
    assert.ok(nodes(tree).some(node => node.props.accessibilityLabel === label));
  }
  assert.ok(nodes(tree).some(node => node.type === 'Text'
    && node.props.children.includes('DAILY PUZZLE COMPLETE!')));
});

test('missing score/time retain zero defaults and a saved leap-day date is not shifted by timezone', () => {
  const { tree } = harness({ params: { dailyDate: '2024-02-29' }, completed: ['2024-02-29'] });
  assert.deepEqual(find(tree, 'daily-completion-date').props.children, ['2024-02-29']);
  assert.deepEqual(find(tree, 'daily-completion-score').props.children, ['0']);
  assert.deepEqual(find(tree, 'daily-completion-time').props.children, ['0:00']);
});

test('invalid dates and valid but unsaved completions still redirect to the calendar', () => {
  for (const date of ['', 'invalid', '2026-02-29', '2026-13-01', '2026-11-31', '2026-11-23']) {
    const { tree } = harness({ params: { dailyDate: date }, completed: [date === '2026-11-23' ? '2026-11-24' : date] });
    assert.equal(tree.type, 'Redirect', date);
    assert.equal(tree.props.href, '/daily', date);
    assert.equal(find(tree, 'daily-completion'), undefined);
  }
  const { tree } = harness({ onboardingStep: 3 });
  assert.equal(tree.type, 'Redirect');
  assert.deepEqual(tree.props.href, { pathname: '/game', params: { onboardingStep: '3' } });
});

test('Calendar preserves back-stack behavior and its direct-entry fallback; Home replaces the home route', () => {
  for (const canGoBack of [true, false]) {
    const h = harness({ canGoBack });
    const calendar = find(h.tree, 'daily-completion-calendar');
    const home = find(h.tree, 'daily-completion-home');
    assert.equal(calendar.type, 'Pressable');
    assert.equal(calendar.props.accessibilityLabel, 'Back to Calendar');
    assert.equal(calendar.props.accessibilityRole, 'button');
    assert.equal(home.props.accessibilityRole, 'button');
    assert.equal(home.props.accessibilityLabel, 'Home');
    calendar.props.onPress();
    home.props.onPress();
    assert.deepEqual(h.routes, [canGoBack ? 'back' : '/daily', '/']);
  }
});

test('rendering, re-rendering and navigation never award coins again or save another completion', () => {
  const h = harness();
  for (let i = 0; i < 3; i++) {
    const tree = h.render();
    find(tree, 'daily-completion-calendar').props.onPress();
    find(tree, 'daily-completion-home').props.onPress();
  }
  assert.deepEqual(h.writes, []);
  assert.equal(h.routes.length, 6);
  const source = fs.readFileSync(path.join(root, 'components/DailyCompletion.tsx'), 'utf8');
  assert.doesNotMatch(source, /useGame|awardCoins|completeDailyPuzzle|AsyncStorage|services\//);
});

test('all four original artworks are used with their source ratios and the Mode Selection background behavior', () => {
  const { tree } = harness();
  const background = find(tree, 'daily-completion-background').props.children[0];
  assert.match(background.props.source, /backgrounds\/mode-selection-background\.png$/);
  assert.equal(background.props.contentFit, 'cover');
  assert.equal(background.props.contentPosition, 'center');
  assert.equal(background.props.transition, 0);
  const crown = find(tree, 'daily-completion-crown');
  assert.match(crown.props.source, /daily\/crowned-dumpling\.png$/);
  assert.equal(style(crown.props.style).aspectRatio, 460 / 478);
  assert.equal(crown.props.contentFit, 'contain');
  for (const [id, ratio, filename] of [
    ['calendar', 865 / 289, /daily\/Calendar Button\.png$/],
    ['home', 941 / 265, /images\/Home Panel\.png$/],
  ]) {
    const button = find(tree, `daily-completion-${id}`);
    const image = button.props.children[0];
    assert.equal(style(button.props.style({ pressed: false })).aspectRatio, ratio);
    assert.match(image.props.source, filename);
    assert.equal(image.props.contentFit, 'contain');
    assert.equal(image.props.accessible, false);
    assert.ok(style(button.props.style({ pressed: true })).opacity < 1);
  }
});

test('mobile widths, safe areas, equal-width panels and short-screen scrolling preserve layout bounds', () => {
  for (const [width, height] of [[320, 480], [360, 640], [390, 844], [393, 852], [412, 915], [915, 412]]) {
    for (const os of ['web', 'ios', 'android']) {
      const insets = { top: 24, bottom: 16, left: 12, right: 12 };
      const { tree } = harness({ width, height, os, insets });
      const scroll = find(tree, 'daily-completion-content');
      assert.equal(scroll.type, 'ScrollView');
      assert.notEqual(scroll.props.scrollEnabled, false);
      const padding = style(scroll.props.contentContainerStyle);
      assert.equal(padding.paddingTop, (os === 'web' ? 67 : 24) + 16);
      assert.equal(padding.paddingBottom, (os === 'web' ? 34 : 16) + 16);
      const main = style(scroll.props.children[0].props.style);
      const available = width - padding.paddingLeft - padding.paddingRight;
      assert.ok(main.width > 0 && main.width <= available);
      const crown = style(find(tree, 'daily-completion-crown').props.style);
      assert.ok(crown.width > 0 && crown.width <= main.width);
      const calendar = style(find(tree, 'daily-completion-calendar').props.style({ pressed: false }));
      const home = style(find(tree, 'daily-completion-home').props.style({ pressed: false }));
      assert.equal(calendar.width, home.width);
      assert.ok(calendar.width > 0 && calendar.width <= available);
      assert.equal(calendar.flexShrink, 0);
      assert.equal(home.flexShrink, 0);
      assert.equal(find(tree, 'daily-completion-stats').props.style.flexDirection, 'row');
    }
  }
});

test('Calendar artwork is an exact copy with its original RGBA transparency and dimensions', () => {
  const copied = fs.readFileSync(path.join(root, 'assets/images/daily/Calendar Button.png'));
  assert.deepEqual(copied, fs.readFileSync(path.join(root, '../../attached_assets/Calendar_Button_1795608345687.png')));
  assert.equal(copied.readUInt32BE(16), 865);
  assert.equal(copied.readUInt32BE(20), 289);
  assert.equal(copied[25], 6);
});
