const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const jsx = (type, props, key) => ({ type, props, key });
const nodes = tree => !tree || typeof tree !== 'object' ? [] : [
  tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes),
];
const find = (tree, id) => nodes(tree).find(n => n.props?.testID === id);
function load(file, mocks) {
  const m = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', output)(name => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.png')) return { asset: name };
    throw Error(`Unexpected import: ${name}`);
  }, m, m.exports);
  return m.exports;
}
const daily = load('game/daily.ts', { '@/data/dailyWords': { DAILY_WORDS: [] } });
const state = load('components/dailyCalendarState.ts', { '@/game/daily': daily });
const same = (a, b) => a?.length === b?.length && a.every((v, i) => Object.is(v, b[i]));
const shallow = (a, b) => Object.keys(a).length === Object.keys(b).length
  && Object.keys(a).every(k => Object.is(a[k], b[k]));
function harness() {
  const frames = new Map(), animations = [], calls = [];
  let current;
  function render(id, fn) {
    const frame = frames.get(id) ?? { slots: [] };
    frames.set(id, frame);
    current = frame; frame.cursor = 0; frame.effects = [];
    const tree = fn();
    frame.effects.forEach(fn => fn());
    return tree;
  }
  const react = {
    memo: render => ({ render }),
    useMemo: (fn, deps) => {
      const i = current.cursor++;
      if (!current.slots[i] || !same(current.slots[i].deps, deps)) current.slots[i] = { deps, value: fn() };
      return current.slots[i].value;
    },
    useRef: value => {
      const i = current.cursor++;
      return current.slots[i] ??= { current: value };
    },
    useEffect: (fn, deps) => {
      const i = current.cursor++, frame = current;
      if (!frame.slots[i] || !same(frame.slots[i].deps, deps)) {
        const previous = frame.slots[i];
        frame.effects.push(() => {
          previous?.cleanup?.();
          frame.slots[i] = { deps, cleanup: fn() };
        });
      }
    },
  };
  const Animated = {
    View: 'AnimatedView',
    Value: class {
      constructor(value) { this.value = value; }
      interpolate(config) { return { parent: this, config }; }
    },
    timing(value, config) {
      const animation = {
        value, config, startValue: value.value, stopped: false,
        start() { animations.push(this); }, stop() { this.stopped = true; },
      };
      return animation;
    },
  };
  const calendar = load('components/DailyCalendar.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Animated, Image: 'Image', View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: x => x } },
    '@expo/vector-icons': { Feather: 'Feather' }, '@/game/daily': daily,
    '@/components/dailyCalendarState': {
      ...state, dailyCellModel: (...args) => { calls.push(args); return state.dailyCellModel(...args); },
    },
  });
  const props = {
    width: 360, month: new Date(2026, 10, 1), now: new Date(2026, 10, 25),
    completed: new Set(['2026-11-23']), selected: '2026-11-25',
    canGoNext: false, onShiftMonth() {}, onSelect() {},
  };
  const cells = overrides => nodes(render('calendar', () => calendar.DailyCalendar({ ...props, ...overrides })))
    .filter(n => n.type?.render?.name === 'DailyDateCell');
  const draw = cell => cell.type.render(cell.props);
  const layer = tree => nodes(tree).find(n => n.type?.name === 'DumplingLayers');
  const layers = (element, selected) => render('layers', () => element.type({ ...element.props, selected }));
  return { calendar, props, cells, draw, layer, layers, animations, calls };
}

test('a selection move changes props and date-model work for exactly the old and new selected dates', () => {
  const h = harness(), first = h.cells(), second = h.cells({ selected: '2026-11-22' });
  assert.equal(first.length, 30);
  const changed = second.filter((n, i) => !shallow(first[i].props, n.props));
  assert.deepEqual(changed.map(n => n.key), ['2026-11-22', '2026-11-25']);
  first.forEach(h.draw);
  assert.equal(h.calls.length, 30);
  h.calls.length = 0;
  changed.forEach(h.draw); // The default React.memo shallow comparison admits only these props.
  assert.equal(h.calls.length, 2);
  const again = h.cells({ selected: '2026-11-22' });
  assert.ok(again.every((n, i) => shallow(n.props, second[i].props)));
});

test('both state images mount on entry, remain identical sources through selection and preserve semantic test IDs', () => {
  const h = harness();
  const cell = h.cells().find(n => n.key === '2026-11-22');
  const element = h.layer(h.draw(cell));
  const regular = h.layers(element, false);
  const initial = nodes(regular).filter(n => n.type === 'Image');
  assert.equal(initial.length, 2, 'the invisible golden image is already mounted/preloading, not conditionally mounted on tap');
  assert.equal(initial[0].props.source, h.calendar.DAILY_ART.regular);
  assert.equal(initial[1].props.source, h.calendar.DAILY_ART.golden);
  assert.ok(find(regular, 'daily-art-available-2026-11-22'));
  assert.equal(find(regular, 'daily-art-selected-2026-11-22'), undefined);
  assert.equal(h.animations.length, 0, 'first render has the correct opacity without a mounting fade or readiness gate');
  const selected = h.layers(element, true);
  const next = nodes(selected).filter(n => n.type === 'Image');
  assert.equal(next.length, 2);
  next.forEach((n, i) => assert.equal(n.props.source, initial[i].props.source));
  assert.ok(find(selected, 'daily-art-selected-2026-11-22'));
  assert.equal(find(selected, 'daily-art-available-2026-11-22'), undefined);
  assert.deepEqual(regular.props.style, selected.props.style, 'art frame geometry does not change');
});

test('opacity starts without an application timer, uses a 200 ms native-driver animation and interrupts rapid retaps safely', () => {
  const h = harness();
  const cell = h.cells().find(n => n.key === '2026-11-22');
  const element = h.layer(h.draw(cell));
  h.layers(element, false);
  h.layers(element, true);
  assert.equal(h.animations.length, 1);
  const first = h.animations[0];
  assert.deepEqual(first.config, { toValue: 1, duration: 200, useNativeDriver: true });
  first.value.value = 0.4; // Partway through a frame-driven transition.
  h.layers(element, false);
  assert.equal(first.stopped, true);
  assert.equal(h.animations[1].startValue, 0.4);
  assert.equal(h.animations[1].config.toValue, 0);
  h.animations[1].value.value = 0;
  const restored = h.layers(element, false);
  assert.equal(h.animations.length, 2, 'same selection does not restart the animation');
  assert.ok(find(restored, 'daily-art-available-2026-11-22'));
  assert.equal(find(restored, 'daily-layer-golden-2026-11-22').props.style[1].opacity.value, 0);
});

test('completed cells never use golden layers, retain their crown/selection outline, and keep their original labels', () => {
  const h = harness();
  for (const selected of ['2026-11-25', '2026-11-23', '2026-11-22']) {
    const cell = h.cells({ selected }).find(n => n.key === '2026-11-23');
    const tree = h.draw(cell);
    const crown = find(tree, 'daily-art-completed-2026-11-23');
    assert.equal(crown.props.source, h.calendar.DAILY_ART.crowned);
    assert.equal(h.layer(tree), undefined);
    assert.equal(find(tree, 'daily-date-2026-11-23').props.accessibilityLabel,
      selected === '2026-11-23' ? 'November 23, selected, completed' : 'November 23, completed');
    assert.equal(Boolean(tree.props.style[2]), selected === '2026-11-23');
  }
});

test('new completion, day rollover and resized geometry invalidate cell props rather than retaining stale eligibility or art', () => {
  const h = harness(), original = h.cells();
  const completed = h.cells({ completed: new Set(['2026-11-23', '2026-11-24']) });
  assert.deepEqual(completed.filter((n, i) => !shallow(n.props, original[i].props)).map(n => n.key), ['2026-11-24']);
  const updated = h.draw(completed.find(n => n.key === '2026-11-24'));
  assert.ok(find(updated, 'daily-art-completed-2026-11-24'));
  const tomorrow = h.cells({ now: new Date(2026, 10, 26) });
  const expired = h.draw(tomorrow.find(n => n.key === '2026-11-20'));
  assert.equal(find(expired, 'daily-date-2026-11-20').props.disabled, true);
  assert.equal(h.layer(expired), undefined);
  const resized = h.cells({ width: 400 });
  assert.ok(resized.every((n, i) => n.props.art !== original[i].props.art));
});

test('selection callback is stable and the refactor contains no blocking prefetch or deferred-selection timer', () => {
  const screen = fs.readFileSync(path.join(root, 'app/daily.tsx'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'components/DailyCalendar.tsx'), 'utf8');
  assert.match(screen, /const selectDate = useCallback\(/);
  assert.match(screen, /setSelectedKey\(key\);\s*\}, \[now\]\)/);
  assert.match(source, /const DailyDateCell = memo\(function DailyDateCell/);
  assert.doesNotMatch(source, /setTimeout|\.prefetch\(|\.loadAsync\(/);
});
