const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const jsx = (type, props) => ({ type, props });
let dimensions = { width: 360, height: 640 }, box = null;
const moduleRef = { exports: {} };
const js = ts.transpileModule(read('components/ChestScene.tsx'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
new Function('require', 'module', 'exports', js)(name => {
  if (name === 'react') return {
    useState: initial => typeof initial === 'function' ? [initial(), () => {}] : [box, next => { box = next; }],
    useEffect: () => {},
  };
  if (name === 'expo-image') return { Image: 'Image' };
  if (name === '@/services/chestSceneryPreparation') return {
    CHEST_SCENERY_SOURCE: 789, getPreparedChestScenery: () => null,
  };
  if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
  if (name === 'react-native') return {
    View: 'View', Image: 'Image', StyleSheet: { absoluteFill: { position: 'absolute' } },
    useWindowDimensions: () => dimensions,
  };
  if (name.endsWith('chest-background.png')) return 789;
  throw Error(name);
}, moduleRef, moduleRef.exports);
const { getChestSceneLayout, ChestScene, useChestSceneLayout } = moduleRef.exports;
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`);

test('shared chest scenery reuses the exact supplied paid-chest PNG without a duplicate or conversion', () => {
  const bytes = fs.readFileSync(path.join(root, 'assets/images/chests/chest-background.png'));
  assert.equal(bytes.length, 2357344);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16), 937);
  assert.equal(bytes.readUInt32BE(20), 1678);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),
    'fb21ad5c984eb61f22314ad75c3a8be74f9ea83ec5d37ea66243ed7994f98caa');
});

test('chest center and visible base track the artwork pedestal at every supported aspect ratio', () => {
  for (const [w, h] of [[360, 640], [412, 915], [320, 568], [393, 873], [600, 960], [800, 600], [360, 1100]]) {
    const l = getChestSceneLayout(w, h);
    close(l.imgW / l.imgH, 937 / 1678);
    close(l.chestLeft + l.stage / 2, l.imgX + l.imgW * 0.5);
    close(l.chestTop + l.stage * (356 / 384), l.imgY + l.imgH * 0.548);
    close(l.stage, Math.min(380, l.imgW * 0.46));
    assert.ok(l.stage <= 380);
    assert.ok(l.chestTop >= 0);
    assert.ok(l.chestTop + l.stage <= h, `${w} × ${h} keeps the chest within the viewport`);
  }
});

test('short and tall phone layouts preserve the original paid-chest cover decisions', () => {
  const short = getChestSceneLayout(360, 640);
  const tall = getChestSceneLayout(412, 915);
  assert.equal(short.safeCover, true);
  assert.equal(tall.safeCover, true);
  close(short.imgW, 360);
  close(short.stage, 165.6);
  close(tall.imgH, 915);
  close(tall.stage, (937 * 915 / 1678) * 0.46);
  assert.ok(short.imgY < 0 && short.imgY > -3);
  assert.ok(tall.imgX < 0, 'existing tall-phone proportional side crop is retained');
});

test('exceptional ratios retain the complete artwork and fill margins only with the existing sky backing', () => {
  for (const [w, h] of [[800, 600], [360, 1400]]) {
    const l = getChestSceneLayout(w, h);
    assert.equal(l.safeCover, false);
    assert.ok(l.imgX >= 0 && l.imgY >= 0);
    assert.ok(l.imgW <= w && l.imgH <= h);
    const scene = ChestScene({ layout: l, children: 'chest' });
    const [background, placement] = scene.props.children;
    assert.equal(background.props.children.filter(Boolean).length, 2);
    assert.equal(background.props.pointerEvents, 'none');
    assert.equal(placement.props.children, 'chest');
  }
});

test('measured screen bounds take precedence and invalid layout events cannot collapse the scene', () => {
  box = null;
  dimensions = { width: 412, height: 915 };
  let scene = useChestSceneLayout();
  assert.equal(scene.layout.W, 412);
  scene.onLayout({ nativeEvent: { layout: { width: 360, height: 640 } } });
  scene = useChestSceneLayout();
  assert.equal(scene.layout.W, 360);
  assert.equal(scene.layout.H, 640);
  scene.onLayout({ nativeEvent: { layout: { width: 0, height: 0 } } });
  assert.equal(useChestSceneLayout().layout.W, 360);
  box = null;
  dimensions = { width: 360, height: 640 };
});

test('paid and normal reward routes share the same presentation and chest layout without sharing transactions', () => {
  const paid = read('app/treasure-chest.tsx');
  const reward = read('app/reward.tsx');
  const normalScene = read('components/NormalRewardScene.tsx');
  assert.match(paid, /<NormalRewardScene/);
  assert.doesNotMatch(paid, /<ChestScene|<ChestReveal|useChestSceneLayout/);
  assert.match(paid, /opening=\{phase === 'animating' \|\| phase === 'done'\}/);
  assert.match(paid, /chestDisabled=\{!canBuy\}/);
  assert.doesNotMatch(paid, /collectReward\(|awardCoins\(/);
  assert.match(reward, /<NormalRewardScene/);
  assert.match(normalScene, /getChestSceneLayout\(W, artH\)/);
  assert.match(normalScene, /<ChestScene layout=\{L\.scene\}>/);
  assert.match(normalScene, /<ChestReveal/);
  assert.match(normalScene, /p\.showHomeButton !== false/);
  assert.doesNotMatch(reward, /purchaseTreasureChest|TREASURE_CHEST_COST|\b700\b/);
  assert.match(reward, /collectReward\(reward\.id\)/);
  const shared = read('components/ChestScene.tsx');
  assert.doesNotMatch(shared, /categoryId|purchaseTreasureChest|collectReward|Math\.random|setTimeout/);
});
