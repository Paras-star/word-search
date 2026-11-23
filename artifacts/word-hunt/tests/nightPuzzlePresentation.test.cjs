const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'constants/nightPuzzlePresentation.ts'), 'utf8');
const moduleRef = { exports: {} };
new Function('module', 'exports', ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(moduleRef, moduleRef.exports);
const { getNightHeaderTitleStyle, nightPuzzleColors, nightPuzzleTextStyle } = moduleRef.exports;

test('short-screen night titles stay to the right of the unchanged moon inside the existing header', () => {
  for (const [width, height] of [[360, 640], [360, 720], [375, 667], [412, 800], [320, 568]]) {
    const style = getNightHeaderTitleStyle(width, height);
    const scale = Math.max(width / 1440, height / 3200);
    const moonRight = (width - 1440 * scale) / 2 + 420 * scale;
    const titleLeft = 16 + 24 + style.marginLeft;
    assert.ok(titleLeft >= moonRight + 12, `${width} × ${height} keeps the title clear of the moon`);
    assert.equal(style.flex, 1);
    assert.equal(style.flexShrink, 1);
    assert.equal(style.fontSize, 18);
    assert.equal(style.lineHeight, 22);
    assert.ok(style.lineHeight * 2 <= 64, 'two lines fit without increasing header height');
    assert.ok(width - titleLeft - 16 - 72 - style.marginRight >= 100, 'title retains usable wrapping space');
  }
});

test('tall phones keep the original title size without unnecessary moon clearance', () => {
  for (const [width, height] of [[412, 915], [360, 800], [393, 873], [480, 1067]]) {
    const style = getNightHeaderTitleStyle(width, height);
    assert.equal(style.marginLeft, 12);
    assert.equal(style.fontSize, 20);
    assert.equal(style.lineHeight, 24);
    assert.equal(style.textAlign, 'center');
    assert.equal(style.height, undefined);
    assert.equal(style.paddingTop, undefined);
    assert.equal(style.transform, undefined);
  }
});

test('night contrast is text-only with no artwork-covering background or panel', () => {
  assert.equal(nightPuzzleTextStyle.color, nightPuzzleColors.foreground);
  assert.equal(nightPuzzleTextStyle.textShadowColor, nightPuzzleColors.textShadow);
  assert.deepEqual(nightPuzzleTextStyle.textShadowOffset, { width: 0, height: 1 });
  assert.equal(nightPuzzleTextStyle.textShadowRadius, 3);
  assert.equal(nightPuzzleTextStyle.backgroundColor, undefined);
  assert.equal(nightPuzzleTextStyle.padding, undefined);
});

test('night typography is opt-in and does not change the grid, control layout, or global theme', () => {
  const game = fs.readFileSync(path.join(root, 'app/game.tsx'), 'utf8');
  assert.match(game, /const nightTextStyle = usesCategoryBackground \? undefined : nightPuzzleTextStyle/);
  assert.match(game, /foregroundColor=\{usesCategoryBackground \? undefined : nightPuzzleColors.foreground\}/);
  assert.match(game, /titleStyle=\{usesCategoryBackground \? undefined : \[nightPuzzleTextStyle, getNightHeaderTitleStyle\(width, height\)\]\}/);
  assert.equal((game.match(/, nightTextStyle\]/g) ?? []).length, 4, 'only score label/value and intro/Daily instructions');
  for (const file of ['app/index.tsx', 'hooks/useColors.ts', 'constants/colors.ts']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), /nightPuzzlePresentation|nightPuzzleTextStyle/);
  }
});
