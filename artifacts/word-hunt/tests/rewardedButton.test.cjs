const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function buttonHarness() {
  const announcements = [];
  const createElement = (type, props, ...children) => ({ type, props: { ...props, children } });
  const mockRequire = name => {
    if (name === 'react') return { __esModule: true, default: { createElement }, useEffect: fn => fn() };
    if (name === 'react-native') return {
      AccessibilityInfo: { announceForAccessibility: text => announcements.push(text) },
      ActivityIndicator: 'ActivityIndicator', Image: 'Image', Pressable: 'Pressable', Text: 'Text', View: 'View',
      StyleSheet: { create: styles => styles },
    };
    if (name === '@expo/vector-icons') return { Feather: 'Feather' };
    if (name === '@/constants/homePalette') return { homeColors: { teal: 'teal', tile: 'tile', gold: 'gold', goldSoft: 'goldSoft' } };
    throw new Error(`Unexpected import ${name}`);
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../components/RewardedAdButton.tsx'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(mockRequire, module, module.exports);
  return { render: module.exports.RewardedAdButton, announcements };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...(tree.props?.children ?? []).flat(Infinity).flatMap(nodes)];
}
const message = 'No ads at the moment';

for (const variant of ['artwork', 'bar']) {
  test(`${variant} shows the exact unavailable-ad message and announces it accessibly`, () => {
    const { render, announcements } = buttonHarness();
    const tree = render({ variant, source: 'local-artwork', status: 'unavailable', label: 'WATCH AD ·', reward: '+3 HINTS', onPress() {} });
    const text = nodes(tree).filter(node => node.type === 'Text').flatMap(node => node.props.children);
    assert.ok(text.includes(message));
    assert.equal(nodes(tree).some(node => node.type === 'Image' || node.type === 'Feather'), false,
      'the reward artwork/icon must be replaced, not left above the message');
    assert.equal(text.includes('WATCH AD ·'), false);
    assert.deepEqual(announcements, [message]);
  });

  test(`${variant} does not replace a successful earned reward with unavailable feedback`, () => {
    const { render, announcements } = buttonHarness();
    const tree = render({ variant, source: 'local-artwork', status: 'earned', label: 'WATCH AD ·', reward: '+3 HINTS', onPress() {} });
    const text = nodes(tree).filter(node => node.type === 'Text').flatMap(node => node.props.children);
    assert.ok(text.includes('ADDED'));
    assert.ok(!text.includes(message));
    assert.deepEqual(announcements, ['+3 HINTS added']);
  });

  test(`${variant} blocks taps during loading and presentation; tapping the unavailable message only dismisses it`, () => {
    const { render } = buttonHarness();
    let taps = 0;
    for (const state of [{ status: 'idle', loading: true }, { status: 'pending' }, { status: 'idle', disabled: true }]) {
      const tree = render({ variant, source: 'local-artwork', label: 'WATCH AD', reward: '+3 HINTS', onPress: () => taps++, ...state });
      const button = nodes(tree).find(node => node.type === 'Pressable');
      assert.equal(button.props.disabled, true);
      button.props.onPress();
    }
    assert.equal(taps, 0);
    let dismissals = 0;
    const tree = render({ variant, source: 'local-artwork', status: 'unavailable', label: 'WATCH AD', reward: '+3 HINTS', onPress: () => taps++, onDismiss: () => dismissals++ });
    const button = nodes(tree).find(node => node.type === 'Pressable');
    assert.notEqual(button.props.disabled, true);
    button.props.onPress();
    assert.equal(taps, 0);
    assert.equal(dismissals, 1);
  });
}

test('the artwork button renders the exact local source proportionally with no cropping', () => {
  const { render } = buttonHarness();
  const source = { uri: 'local-artwork' };
  const tree = render({ variant: 'artwork', source, artworkSize: 64, status: 'idle', label: 'FREE COINS', reward: '+100 COINS', onPress() {} });
  const image = nodes(tree).find(node => node.type === 'Image');
  assert.equal(image.props.source, source);
  assert.equal(image.props.resizeMode, 'contain');
  assert.equal(image.props.style.width, image.props.style.height);
  assert.equal(image.props.style.width, 64);
  const button = nodes(tree).find(node => node.type === 'Pressable');
  assert.ok(nodes(button).includes(image), 'the full artwork must be inside the tap target');
});

test('artwork and replacement message occupy the exact same fixed-size slot without below-button feedback', () => {
  const { render } = buttonHarness();
  for (const status of ['idle', 'pending', 'unavailable', 'earned']) {
    const tree = render({ variant: 'artwork', source: 'local-artwork', artworkSize: 64, status, label: 'FREE COINS', reward: '+100 COINS', onPress() {} });
    assert.equal(tree.type, 'View');
    assert.ok(tree.props.style.some(style => style?.width === 64 && style?.height === 64));
    const children = tree.props.children.flat(Infinity).filter(Boolean);
    assert.equal(children.length, 1, 'feedback cannot introduce a second layout child underneath the action');
    assert.equal(children[0].type, 'Pressable');
  }
});
