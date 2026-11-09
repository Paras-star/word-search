const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const removedModules = [
  'components/PlayUpdateGate.tsx',
  'services/playUpdates.android.ts',
  'services/playUpdates.ts',
  'services/playUpdateSession.ts',
];

test('custom update modules and their dedicated native dependency are absent', () => {
  for (const file of removedModules) assert.equal(fs.existsSync(path.join(root, file)), false, file);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    assert.equal(pkg[section]?.['react-native-store-update'], undefined);
  }
  const lock = fs.readFileSync(path.join(root, '../../pnpm-lock.yaml'), 'utf8');
  assert.doesNotMatch(lock, /react-native-store-update/);
});

test('application source has no remaining custom-update imports, actions, or listeners', () => {
  function inspect(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) inspect(file);
      else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
        assert.doesNotMatch(fs.readFileSync(file, 'utf8'),
          /PlayUpdateGate|playUpdateSession|playUpdates|react-native-store-update|checkForUpdate|completeUpdate|addInstallStatusListener/,
          path.relative(root, file));
      }
    }
  }
  for (const dir of ['app', 'components', 'services', 'context', 'hooks', 'game']) {
    inspect(path.join(root, dir));
  }
});

function renderLayout({ fontsLoaded = true, fontError = null, chestPrepared = true } = {}) {
  const element = (type, props) => typeof type === 'function' ? type(props) : { type, props };
  const Stack = props => element('Stack', props);
  Stack.Screen = 'Screen';
  // Deliberately provide no update service or native-update mocks: any new
  // runtime import of an updater must fail instead of silently being stubbed.
  const mocks = {
    react: {
      __esModule: true, default: {},
      useEffect() {},
      useState: () => [chestPrepared, () => {}],
    },
    'react/jsx-runtime': { jsx: element, jsxs: element },
    '@tanstack/react-query': { QueryClient: class {}, QueryClientProvider: 'QueryClientProvider' },
    'react-native-gesture-handler': { GestureHandlerRootView: 'GestureHandlerRootView' },
    'react-native-keyboard-controller': { KeyboardProvider: 'KeyboardProvider' },
    'react-native-safe-area-context': { SafeAreaProvider: 'SafeAreaProvider' },
    '@/components/ErrorBoundary': { ErrorBoundary: 'ErrorBoundary' },
    '@expo-google-fonts/inter': { useFonts: () => [fontsLoaded, fontError] },
    'expo-router': { Stack },
    'expo-splash-screen': { preventAutoHideAsync() {} },
    '@/context/GameProvider': { GameProvider: 'GameProvider' },
    '@/services/ads': { prepareAds() {} },
    'react-native': { Platform: { OS: 'android' }, AppState: {}, Image: {} },
    'expo-asset': { Asset: {} },
    '@/services/audio': { resumeBackgroundMusic() {} },
    '@/services/audioSettings': {},
    '@/services/dumplingAudio': {},
    '@/services/chestPreparation': {},
    '@/components/chestAnimationData': {},
  };
  const source = fs.readFileSync(path.join(root, 'app/_layout.tsx'), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'exports', 'module', js)(name => {
    assert.ok(Object.hasOwn(mocks, name), `Unexpected startup import: ${name}`);
    return mocks[name];
  }, module.exports, module);
  return module.exports.default();
}

test('ready Android startup renders every game route directly under existing providers', () => {
  let node = renderLayout();
  for (const provider of [
    'SafeAreaProvider', 'ErrorBoundary', 'QueryClientProvider', 'GameProvider',
    'GestureHandlerRootView', 'KeyboardProvider', 'Stack',
  ]) {
    assert.equal(node.type, provider);
    if (provider !== 'Stack') node = node.props.children;
  }
  assert.deepEqual(node.props.children.map(screen => screen.props.name), [
    'index', 'categories', 'mode', 'game', 'daily', 'reward',
    'treasure-chest', 'collection', 'results',
  ]);
  assert.equal(node.props.children.find(screen => screen.props.name === 'treasure-chest').props.options.gestureEnabled, false);
});

test('font and chest preparation gates remain intact, including font-error recovery', () => {
  assert.equal(renderLayout({ fontsLoaded: false }), null);
  assert.equal(renderLayout({ chestPrepared: false }), null);
  assert.notEqual(renderLayout({ fontsLoaded: false, fontError: new Error('Font unavailable') }), null);
});
