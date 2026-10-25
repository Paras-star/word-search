const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('Home wires a separate 100-coin action below the unchanged 700-coin chest', () => {
  const source = read('app/index.tsx');
  assert.match(source, /Treasure Chest, 700 coins/);
  assert.ok(source.indexOf('testID="treasure-chest-button"') < source.indexOf('testID="home-rewarded-coins-button"'));
  assert.match(source, /createCoinReward\(awardCoins\)/);
  assert.match(source, /reward=\{`\+\$\{HOME_REWARDED_COINS\} COINS`\}/);
  assert.match(source, /variant="artwork"/);
  assert.match(source, /source=\{require\('\.\.\/assets\/images\/rewards\/free-coins\.png'\)\}/);
  const bytes = fs.readFileSync(path.join(root, 'assets/images/rewards/free-coins.png'));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), 'ce74abcbfc675936782ce8e86db614fc0dc27e7029170b4465838f955fbf6e67',
    'the supplied transparent artwork must remain byte-identical');
  assert.equal(bytes.readUInt32BE(16), 500);
  assert.equal(bytes.readUInt32BE(20), 500);
  assert.equal(bytes[25], 6, 'original RGBA transparency is retained');
});

test('gameplay shares its additive hint balance between the top use button and bottom rewarded control', () => {
  const source = read('app/game.tsx');
  assert.match(source, /const \[hints, setHints\] = useState\(3\)/);
  assert.doesNotMatch(source, /testID="(?:use-hint-button|hint-button)"|USE HINT|NO HINTS LEFT/);
  assert.match(source, /testID="hint-rewarded-button"/);
  assert.equal((source.match(/<RewardedAdButton/g) ?? []).length, 1);
  assert.match(source, /<Pressable accessible accessibilityRole="button" onPress=\{useHint\}[^>]*testID="hint-balance"/);
  assert.match(source, /label="WATCH AD ·"/);
  assert.match(source, /setHints\(\(prev\) => prev \+ amount\)/);
  assert.match(source, /activePuzzleKey\.current = null/);
  assert.match(source, /completionStarted\.current \? null : activePuzzleKey\.current/);
  assert.match(source, /completionStarted\.current \|\| adPaused\.current/);
  assert.match(source, /startTime\.current \+= Date\.now\(\) - pausedAt/);
  assert.doesNotMatch(source, /showInterstitialAtTransition/);
  const rewardHandler = source.slice(source.indexOf('  const watchHintAd ='), source.indexOf('  const finish ='));
  assert.doesNotMatch(rewardHandler, /setHintCells|useHint\(|setHints\(3\)/);
  assert.match(source, /setHints\(value => Math\.max\(0, value - 1\)\)/);
});

test('level completion and touch mapping remain byte-identical after removing the free-hint action', () => {
  const source = read('app/game.tsx');
  const hashes = {
    '  const finish =': 'bfb066693b950f7470ca02d1d50b39d1b6e5108b06e6c6a00ed06fcf56e524b2',
    '  const cellFromEvent =': '15eeee31f7a4a81ed2fea14d53ee15d63a7beebb40f86f4f41486faede201846',
  };
  for (const [start, expected] of Object.entries(hashes)) {
    const from = source.indexOf(start);
    assert.notEqual(from, -1);
    const block = source.slice(from, source.indexOf('\n\n', from));
    assert.equal(crypto.createHash('sha256').update(block).digest('hex'), expected, start);
  }
});

test('Results keeps eligibility exclusions and ad-independent navigation; chest sequence has no interstitial call', () => {
  const source = read('app/results.tsx');
  assert.match(source, /isOnboardingRoute \|\| isDailyRoute \|\| onboardingStep < 6/);
  assert.match(source, /!gameOver && params\.puzzleId/);
  assert.match(source, /registerCompletedPuzzle\(params\.puzzleId\)/);
  assert.match(source, /showInterstitialAtTransition\(\)\.then\(\s*navigate,\s*navigate/);
  assert.doesNotMatch(read('app/reward.tsx'), /showInterstitialAtTransition/);
});

test('reward UI guards repeated taps and disables controls for load/presentation with retry feedback', () => {
  const hook = read('hooks/useRewardedAd.ts');
  assert.match(hook, /if \(inFlight\.current\) return null/);
  assert.match(hook, /inFlight\.current = true/);
  assert.match(hook, /watchRewarded\(onEarned, placement\)/);
  assert.match(hook, /inFlight\.current = false/);
  const button = read('components/RewardedAdButton.tsx');
  assert.match(button, /status === 'pending' \|\| loading/);
  assert.match(button, /disabled=\{blocked\}/);
  assert.match(button, /UNAVAILABLE_MESSAGE = 'No ads at the moment'/);
  assert.match(button, /unavailable: UNAVAILABLE_MESSAGE/);
  assert.match(button, /announceForAccessibility\(UNAVAILABLE_MESSAGE\)/);
  assert.match(button, /accessibilityLiveRegion="polite"/);
});
