const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const app = path.resolve(__dirname, '..');
const workspace = path.resolve(app, '../..');

// Git and the configured upload file use gitignore-style matching. Include
// tracked and untracked candidates; this never changes the index or worktree.
function excluded(files) {
  const result = execFileSync('git', [
    'ls-files', '--cached', '--others', '--ignored',
    '--exclude-from=.easignore', '--', ...files,
  ], { cwd: workspace, encoding: 'utf8' });
  return new Set(result.trim().split('\n').filter(Boolean));
}

function runtimeAssets() {
  const assets = new Set();
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(file); continue; }
      if (!/\.[jt]sx?$/.test(file)) continue;
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(/(?:require\(\s*|from\s+)['"]([^'"]+\.(?:png|jpe?g|webp|mp3|wav|m4a|aac|ttf|otf|mp4))['"]/gi)) {
        const target = path.resolve(match[1].startsWith('@/') ? app : path.dirname(file), match[1].replace(/^@\//, ''));
        assert.ok(fs.existsSync(target), `Missing runtime asset: ${target}`);
        assets.add(path.relative(workspace, target).split(path.sep).join('/'));
      }
    }
  }
  for (const dir of ['app', 'components', 'services', 'data', 'hooks', 'constants']) walk(path.join(app, dir));
  function configurationAssets(value) {
    if (typeof value === 'string' && value.startsWith('./')) {
      const target = path.resolve(app, value);
      assert.ok(fs.existsSync(target), `Missing configured asset: ${value}`);
      assets.add(path.relative(workspace, target).split(path.sep).join('/'));
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(configurationAssets);
    }
  }
  configurationAssets(JSON.parse(fs.readFileSync(path.join(app, 'app.json'), 'utf8')));
  return [...assets];
}

test('every literal runtime media reference exists and survives configured Android upload exclusions', () => {
  const files = runtimeAssets();
  assert.ok(files.length >= 89, 'Asset scan must cover the complete application');
  assert.deepEqual([...excluded(files)], []);
});

test('only the six exact reward images are included from attached_assets', () => {
  const expected = new Set([
    'Common_Transparent_Banner_1795631362659.png',
    'Uncommon_Transparent_Banner_1795631362659.png',
    'Rare_Transparent_Banner_1795631362661.png',
    'Epic_Transparent_Banner_1795631362660.png',
    'Legendary_Transparent_Banner_1795631362661.png',
    'Continue_1795628061907.png',
  ].map(file => `attached_assets/${file}`));
  const files = fs.readdirSync(path.join(workspace, 'attached_assets'), { recursive: true })
    .map(file => `attached_assets/${file}`)
    .filter(file => fs.statSync(path.join(workspace, file)).isFile());
  const omitted = excluded(files);
  assert.deepEqual(new Set(files.filter(file => !omitted.has(file))), expected);
  const rules = fs.readFileSync(path.join(workspace, '.easignore'), 'utf8');
  assert.ok(rules.includes('/attached_assets/*'));
  assert.ok(rules.includes('/.git'));
});
