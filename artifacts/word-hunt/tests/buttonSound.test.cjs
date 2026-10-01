const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const pressable = 'Pressable';

function loadGameUI(platform = 'ios') {
  const sounds = [];
  const routerCalls = [];
  const colors = {
    background: '#fff',
    border: '#ddd',
    primary: '#123',
    card: '#eee',
    buttonBorder: '#ddd',
    foreground: '#000',
    mutedForeground: '#888',
    accent: '#aaa',
    success: '#0a0',
  };
  const source = fs.readFileSync(path.join(root, 'components/GameUI.tsx'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const jsx = (type, props) => ({ type, props });
  const mockRequire = (name) => {
    if (name === 'react') return {};
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (name === 'react-native') {
      return {
        ActivityIndicator: 'ActivityIndicator',
        Platform: { OS: platform },
        Pressable: pressable,
        StyleSheet: { create: (styles) => styles },
        Text: 'Text',
        View: 'View',
      };
    }
    if (name === '@expo/vector-icons') return { Feather: 'Feather' };
    if (name === 'expo-router') {
      return {
        usePathname: () => '/categories',
        useRouter: () => ({
          canGoBack: () => false,
          back: () => routerCalls.push(['back']),
          replace: (route) => routerCalls.push(['replace', route]),
        }),
      };
    }
    if (name === '@/hooks/useColors') return { useColors: () => colors };
    if (name === '@/services/audio') {
      return { playSound: (sound) => sounds.push(sound) };
    }
    throw new Error(`Unexpected GameUI runtime import: ${name}`);
  };
  const loadedModule = { exports: {} };
  new Function('require', 'module', 'exports', output)(
    mockRequire,
    loadedModule,
    loadedModule.exports,
  );
  return { ui: loadedModule.exports, sounds, routerCalls };
}

for (const buttonName of ['PrimaryButton', 'SoftButton']) {
  test(`${buttonName} taps once, preserves the event, and invokes its handler`, () => {
    const { ui, sounds } = loadGameUI();
    const event = { nativeEvent: { target: 12 } };
    let receivedEvent;
    const element = ui[buttonName]({
      children: 'Go',
      onPress: (pressEvent) => { receivedEvent = pressEvent; },
      testID: 'button-sound-test',
    });

    assert.equal(element.type, pressable);
    assert.equal(element.props.testID, 'button-sound-test');
    assert.equal(element.props.onPress(event), undefined);
    assert.deepEqual(sounds, ['tap']);
    assert.equal(receivedEvent, event);
  });

  test(`${buttonName} honors disabled, suppressed, and missing handlers`, () => {
    const { ui, sounds } = loadGameUI();
    let handlerCalls = 0;
    const disabled = ui[buttonName]({
      children: 'Disabled',
      disabled: true,
      onPress: () => { handlerCalls += 1; },
    });
    disabled.props.onPress();
    assert.equal(handlerCalls, 0);
    assert.equal(disabled.props.disabled, true);

    const suppressed = ui[buttonName]({
      children: 'Dedicated cue',
      suppressClickSound: true,
      onPress: () => { handlerCalls += 1; },
    });
    suppressed.props.onPress();
    assert.equal(suppressed.props.suppressClickSound, undefined);
    assert.equal(handlerCalls, 1);

    const noHandler = ui[buttonName]({ children: 'No handler' });
    assert.equal(noHandler.props.onPress, undefined);
    assert.deepEqual(sounds, []);
  });
}

test('shared header back handler plays exactly one tap before its callback', () => {
  const { ui, sounds } = loadGameUI();
  let callbackCount = 0;
  const header = ui.Header({ title: 'Categories', onBack: () => { callbackCount += 1; } });
  const backButton = header.props.children[0];

  backButton.props.onPress();
  assert.deepEqual(sounds, ['tap']);
  assert.equal(callbackCount, 1);
});

test('raw home, category, and daily navigation handlers include ordinary taps', () => {
  const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
  const home = read('app/index.tsx');
  const categories = read('app/categories.tsx');
  const daily = read('app/daily.tsx');

  assert.match(home, /playSound\('tap'\);\s*router\.push\('\/daily'\)/);
  assert.match(categories, /playSound\('tap'\);\s*router\.push\(\{\s*pathname: '\/mode'/);
  assert.match(daily, /playSound\('tap'\);\s*router\.canGoBack\(\)/);
  assert.match(daily, /playSound\('tap'\);\s*setMonth\(/);
  assert.match(daily, /playSound\('tap'\);\s*router\.push\(\{\s*pathname: '\/game', params: \{ dailyDate: key \}/);
});