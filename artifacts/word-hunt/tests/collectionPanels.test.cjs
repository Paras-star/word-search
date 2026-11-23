const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const jsx = (type, props) => ({ type, props });
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function load(file, mocks) {
  const module = { exports: {} };
  const js = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', js)(name => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.png')) return name;
    throw Error(`Unexpected dependency: ${name}`);
  }, module, module.exports);
  return module.exports;
}
const native = {
  Image: 'Image', View: 'View', Text: 'Text', Pressable: 'Pressable',
  FlatList: 'FlatList', ImageBackground: 'ImageBackground',
  StyleSheet: { create: x => x, absoluteFill: { position: 'absolute' } },
  Animated: {
    View: 'AnimatedView',
    Value: class { interpolate() { return {}; } },
  },
  Easing: {},
  Platform: { OS: 'web' },
};
const colors = load('components/collection/collectionTheme.ts', {}).collectionColors;
const data = load('data/dumplings.ts', { '@/constants/homePalette': { homeColors: {} } });
const geometry = load('components/collection/panelGeometry.ts', {}).PANEL_GEOMETRY;
const statelessReact = {
  useState: x => [x, () => {}], useRef: x => ({ current: x }),
  useCallback: x => x, useEffect() {},
};
const panelModule = load('components/collection/RarityPanel.tsx', {
  react: statelessReact,
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'react-native': native,
  '@expo/vector-icons': { Feather: 'Feather' },
  '@/data/dumplings': data,
  './panelGeometry': { PANEL_GEOMETRY: geometry },
  './collectionTheme': { collectionColors: colors },
});
function all(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(all)];
}
const find = (tree, id) => all(tree).find(n => n.props?.testID === id);
const text = tree => [tree?.props?.children].flat(Infinity).filter(x => typeof x === 'string' || typeof x === 'number').join('');
const counts = { Legendary: 2, Epic: 4, Rare: 5, Uncommon: 7, Common: 12 };

test('exactly 30 unique catalog entries map one-to-one to distinct pedestal spaces', () => {
  assert.equal(data.DUMPLINGS.length, 30);
  assert.equal(new Set(data.DUMPLINGS.map(d => d.id)).size, 30);
  assert.deepEqual(Object.keys(geometry), Object.keys(counts));
  for (const [rarity, count] of Object.entries(counts)) {
    const g = geometry[rarity];
    assert.equal(data.DUMPLINGS.filter(d => d.rarity === rarity).length, count);
    assert.equal(g.slots.length, count);
    assert.equal(g.rows.reduce((a, b) => a + b), count);
    assert.equal(new Set(g.slots.map(s => `${s.cx},${s.dumplingTop}`)).size, count);
    const png = fs.readFileSync(path.join(root, `assets/images/collection/${rarity.toLowerCase()}-panel.png`));
    assert.equal(png.readUInt32BE(16), g.width);
    assert.equal(png.readUInt32BE(20), g.height);
    assert.equal(png[25], 6, 'RGBA preserves transparent exterior');
  }
  assert.deepEqual(geometry.Rare.rows, [3, 2]);
  assert.deepEqual(geometry.Uncommon.rows, [4, 3]);
  assert.deepEqual(geometry.Common.rows, [4, 4, 4]);
});

for (const [width, height] of [[360, 640], [412, 915]]) {
  test(`${width} × ${height}: panels keep aspect ratio and every slot stays aligned within its own pedestal space`, () => {
    for (const rarity of Object.keys(counts)) {
      const g = geometry[rarity], w = width - 20, k = w / g.width;
      assert.ok(Math.abs(panelModule.panelHeight(rarity, w) - g.height * k) <= 0.5);
      for (const s of g.slots) {
        assert.ok(s.cx - s.dumplingSize / 2 > 0);
        assert.ok(s.cx + s.dumplingSize / 2 < g.width);
        assert.ok(s.dumplingTop > 0 && s.pedestalBottom < g.height);
        assert.ok(s.dumplingTop + s.dumplingSize > s.pedestalTop, 'art meets the pedestal top');
        assert.ok(s.dumplingTop + s.dumplingSize < s.label.y, 'art never covers the name plaque');
        assert.ok(Math.abs(s.label.x + s.label.w / 2 - s.cx) < 2);
        for (const other of g.slots) {
          if (s === other || s.dumplingTop !== other.dumplingTop) continue;
          assert.ok(Math.abs(s.cx - other.cx) > s.dumplingSize);
        }
      }
    }
  });
}

test('every rarity renders actual owned art and locked placeholders from its own catalog assignments', () => {
  for (const rarity of Object.keys(counts)) {
    const dumplings = data.DUMPLINGS.filter(d => d.rarity === rarity);
    for (const owned of [new Set(), new Set(dumplings.map(d => d.id)), new Set([dumplings[0].id])]) {
      const panel = panelModule.RarityPanel({
        rarity, dumplings, width: 340, owned, visibleIds: new Set(),
        newDumplingId: dumplings[0].id,
      });
      assert.equal(text(find(panel, `panel-count-${rarity.toLowerCase()}`)), `${owned.size} / ${dumplings.length}`);
      const slots = all(panel).filter(n => typeof n.type === 'function');
      assert.equal(slots.length, counts[rarity]);
      for (const slot of slots) {
        const d = slot.props.dumpling;
        assert.equal(d.rarity, rarity);
        assert.equal(slot.props.isNew, d.id === dumplings[0].id);
        assert.equal(slot.props.isVisible, false);
        const rendered = slot.type(slot.props);
        assert.ok(find(rendered, `slot-${d.id}`));
        if (owned.has(d.id)) {
          const art = find(rendered, `dumpling-art-${d.id}`);
          assert.equal(art.props.source, d.asset);
          assert.equal(art.props.resizeMode, 'contain');
          assert.equal(find(rendered, `locked-${d.id}`), undefined);
        } else {
          assert.ok(find(rendered, `locked-${d.id}`));
          assert.equal(find(rendered, `dumpling-art-${d.id}`), undefined);
          assert.ok(all(rendered).some(n => n.type === 'Text' && text(n) === '???'));
        }
      }
    }
  }
});

function screenHarness({ ids = [], fail = false, newId } = {}) {
  const hooks = [];
  let cursor = 0, effects = [], tree;
  const react = {
    useState(value) {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = value;
      return [hooks[i], next => { hooks[i] = typeof next === 'function' ? next(hooks[i]) : next; }];
    },
    useRef: value => ({ current: value }),
    useCallback: fn => fn,
    useEffect(fn) { if (!hooks.loaded) { effects.push(fn); hooks.loaded = true; } },
  };
  let calls = 0;
  const screen = load('app/collection.tsx', {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { ...native, useWindowDimensions: () => ({ width: 360, height: 640 }) },
    'expo-router': { useRouter: () => ({ back() {} }), useLocalSearchParams: () => ({ newDumplingId: newId }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@/components/GameUI': { Header: 'Header', LoadingScreen: 'LoadingScreen' },
    '@/data/dumplings': data,
    '@/services/dumplingRewards': {
      getCollection: async () => { calls++; if (fail && calls === 1) throw Error('storage error'); return { ownedDumplingIds: ids }; },
    },
    '@/components/collection/RarityPanel': { RarityPanel: 'RarityPanel', panelHeight: panelModule.panelHeight },
    '@/components/collection/collectionTheme': { collectionColors: colors },
  }).default;
  const h = {
    render() { cursor = 0; tree = screen(); const batch = effects; effects = []; batch.forEach(fn => fn()); return tree; },
    async settle() { for (let i = 0; i < 6; i++) await Promise.resolve(); return h.render(); },
    get tree() { return tree; },
  };
  h.render();
  return h;
}

test('collection progress, new-item scroll/highlight, visibility and live rarity counts remain connected to saved data', async () => {
  const ids = ['ivory-classic', 'dragon-jade', 'solar-gold'];
  const h = screenHarness({ ids, newId: 'ivory-classic' });
  await h.settle();
  const progress = find(h.tree, 'collection-progress');
  assert.ok(all(progress).some(n => n.type === 'Text' && text(n) === '10%'));
  assert.ok(all(progress).some(n => n.type === 'Text' && text(n) === '3 of 30 collected'));
  const list = find(h.tree, 'collection-panels');
  assert.deepEqual(list.props.data.map(p => p.rarity), Object.keys(counts));
  assert.equal(list.props.initialScrollIndex, 4);
  const common = list.props.data[4];
  list.props.onViewableItemsChanged({ viewableItems: [{ item: common }] });
  h.render();
  const nextList = find(h.tree, 'collection-panels');
  const rendered = nextList.props.renderItem({ item: common }).props.children;
  assert.equal(rendered.props.newDumplingId, 'ivory-classic');
  assert.deepEqual([...rendered.props.owned], ids);
  assert.deepEqual([...rendered.props.visibleIds], common.items.map(d => d.id));
  for (let i = 1; i < list.props.data.length; i++) {
    const previous = list.props.getItemLayout(list.props.data, i - 1);
    const current = list.props.getItemLayout(list.props.data, i);
    assert.equal(current.offset, previous.offset + previous.length);
  }
});

test('failed collection reads retain the explicit error and retry without resetting saved data', async () => {
  const h = screenHarness({ ids: ['dragon-jade'], fail: true });
  await h.settle();
  const retry = find(h.tree, 'collection-retry');
  assert.ok(retry);
  assert.match(JSON.stringify(h.tree), /It has not been reset/);
  retry.props.onPress();
  await h.settle();
  assert.ok(find(h.tree, 'collection-progress'));
  assert.equal(find(h.tree, 'collection-retry'), undefined);
});
