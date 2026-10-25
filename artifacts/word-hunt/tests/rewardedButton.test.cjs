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
const message = 'Ads not ready - please try later';

for (const variant of ['artwork', 'bar']) {
  test(`${variant} shows the exact unavailable-ad message and announces it accessibly`, () => {
    const { render, announcements } = buttonHarness();
    const tree = render({ variant, source: 'local-artwork', status: 'unavailable', label: 'WATCH AD ·', reward: '+3 HINTS', onPress() {} });
    const text = nodes(tree).filter(node => node.type === 'Text').flatMap(node => node.props.children);
    assert.ok(text.includes(message));
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

  test(`${variant} blocks taps during loading and presentation but permits unavailable-ad retries`, () => {
    const { render } = buttonHarness();
    let taps = 0;
    for (const state of [{ status: 'idle', loading: true }, { status: 'pending' }, { status: 'idle', disabled: true }]) {
      const tree = render({ variant, source: 'local-artwork', label: 'WATCH AD', reward: '+3 HINTS', onPress: () => taps++, ...state });
      const button = nodes(tree).find(node => node.type === 'Pressable');
      assert.equal(button.props.disabled, true);
      button.props.onPress();
    }
    assert.equal(taps, 0);
    const tree = render({ variant, source: 'local-artwork', status: 'unavailable', label: 'WATCH AD', reward: '+3 HINTS', onPress: () => taps++ });
    const button = nodes(tree).find(node => node.type === 'Pressable');
    assert.equal(button.props.disabled, false);
    button.props.onPress();
    assert.equal(taps, 1);
  });
}

test('the artwork button renders the exact local source proportionally with no cropping', () => {
  const { render } = buttonHarness();
  const source = { uri: 'local-artwork' };
  const tree = render({ variant: 'artwork', source, artworkSize: 168, status: 'idle', label: 'FREE COINS', reward: '+100 COINS', onPress() {} });
  const image = nodes(tree).find(node => node.type === 'Image');
  assert.equal(image.props.source, source);
  assert.equal(image.props.resizeMode, 'contain');
  assert.equal(image.props.style.width, image.props.style.height);
  assert.equal(image.props.style.width, 168);
  const button = nodes(tree).find(node => node.type === 'Pressable');
  assert.ok(nodes(button).includes(image), 'the full artwork must be inside the tap target');
});

test('artwork feedback reserves the same two-line space even while idle to avoid moving the Home layout', () => {
  const { render } = buttonHarness();
  for (const status of ['idle', 'pending', 'unavailable', 'earned']) {
    const tree = render({ variant: 'artwork', source: 'local-artwork', status, label: 'FREE COINS', reward: '+100 COINS', onPress() {} });
    const slot = nodes(tree).find(node => node.type === 'View' && Array.isArray(node.props.style)
      && node.props.style.some(style => style?.minHeight === 32));
    assert.ok(slot, `${status} must retain the feedback slot`);
    const text = nodes(slot).find(node => node.type === 'Text');
    if (text) {
      assert.equal(text.props.numberOfLines, 2);
      assert.equal(text.props.style[0].lineHeight, 14);
      assert.ok(text.props.numberOfLines * text.props.style[0].lineHeight <= 32);
    }
  }
});
