const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');

function load(file, mocks) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)(
    name => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
    module, module.exports,
  );
  return module.exports;
}

function linkHarness(fail = false) {
  const opened = [], alerts = [];
  const service = load('services/informationLinks.ts', {
    'react-native': {
      Linking: { openURL: async url => { opened.push(url); if (fail) throw Error('No handler'); } },
      Alert: { alert: (...args) => alerts.push(args) },
    },
  });
  return { ...service, opened, alerts };
}

test('homepage removes website information and keeps the existing settings and game controls', () => {
  const source = fs.readFileSync(path.join(root, 'app/index.tsx'), 'utf8');
  assert.doesNotMatch(source, /WebsiteInfo|Support contact|mailto:|Privacy Policy|Terms of Service|wordhuntmysterydumpling@gmail\.com/);
  assert.equal((source.match(/testID="settings-button"/g) || []).length, 1);
  for (const id of ['play-button', 'collection-button', 'treasure-chest-button', 'home-rewarded-coins-button', 'daily-calendar-button', 'privacy-options-button']) {
    assert.ok(source.includes(`testID="${id}"`), `${id} remains`);
  }
  assert.ok(source.includes('<CoinPill coins={coins} />'));
  for (const artwork of ['tropical.png', 'play-button.png', 'collection-button.png']) {
    assert.ok(source.includes(`../assets/images/home/${artwork}`), `${artwork} is used on Home`);
  }
  assert.doesNotMatch(source, /styles\.previewGrid|FIND YOUR FOCUS|Spot the hidden words/);
  assert.ok(source.includes('<AudioSettingsModal visible={settingsOpen}'));
});

test('all three information links dispatch exact destinations to the platform URL handler', async () => {
  const h = linkHarness();
  assert.deepEqual(h.INFORMATION_LINKS.map(({ label, url }) => [label, url]), [
    ['Support', 'mailto:wordhuntmysterydumpling@gmail.com'],
    ['Privacy Policy', 'https://paras-star.github.io/word-hunt-privacy-policy/'],
    ['Terms of Service', 'https://paras-star.github.io/word-hunt-privacy-policy/terms.html'],
  ]);
  for (const link of h.INFORMATION_LINKS) assert.equal(await h.openInformationLink(link), true);
  assert.deepEqual(h.opened, h.INFORMATION_LINKS.map(link => link.url));
  assert.deepEqual(h.alerts, []);
});

test('unavailable email and browser handlers show actionable errors without unhandled rejections', async () => {
  const h = linkHarness(true);
  for (const link of h.INFORMATION_LINKS) assert.equal(await h.openInformationLink(link), false);
  assert.equal(h.alerts.length, 3);
  assert.match(h.alerts[0][1], /set up an email app.*wordhuntmysterydumpling@gmail\.com/);
  assert.ok(h.alerts[1][1].includes(h.INFORMATION_LINKS[1].url));
  assert.ok(h.alerts[2][1].includes(h.INFORMATION_LINKS[2].url));
});

test('existing Settings renders audio controls and the Information & Support section, and rows open links', async () => {
  const h = linkHarness();
  const rows = [];
  const host = tag => ({ children }) => React.createElement(tag, null, children);
  const Pressable = props => {
    rows.push(props);
    return React.createElement('button', { 'data-testid': props.testID }, props.children);
  };
  const { AudioSettingsModal } = load('components/AudioSettingsModal.tsx', {
    'react-native': {
      Modal: host('div'), View: host('div'), ScrollView: host('div'), Text: host('span'), Pressable,
      StyleSheet: { create: s => s, absoluteFill: {} },
    },
    '@/constants/homePalette': { homeColors: {} },
    '@/components/GameUI': { SoftButton: host('button') },
    '@/components/VolumeSlider': { VolumeSlider: ({ label }) => React.createElement('label', null, label) },
    '@/hooks/useAudioSettings': { useAudioSettings: () => ({ musicVolume: 0.5, soundEffectsVolume: 1, hydrated: true }) },
    '@/services/audioSettings': { retryAudioSettingsSave() {}, setAudioVolume() {} },
    '@/services/informationLinks': h,
  });
  const html = renderToStaticMarkup(React.createElement(AudioSettingsModal, { visible: true, onClose() {} }));
  for (const text of ['Settings', 'Audio Settings', 'Background Music', 'Game Sounds', 'Information &amp; Support', 'Support', 'Privacy Policy', 'Terms of Service', 'CLOSE']) {
    assert.ok(html.includes(text), `${text} is present`);
  }
  for (const link of h.INFORMATION_LINKS) {
    const row = rows.find(row => row.testID === `settings-${link.id}-link`);
    assert.equal(row.accessibilityRole, 'link');
    row.onPress();
  }
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.opened, h.INFORMATION_LINKS.map(link => link.url));
});
