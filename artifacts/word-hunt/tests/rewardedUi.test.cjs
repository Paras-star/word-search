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
});

test('gameplay uses existing hint state, active-puzzle focus guard, and distinct free/rewarded controls', () => {
  const source = read('app/game.tsx');
  assert.match(source, /const \[hints, setHints\] = useState\(3\)/);
  assert.match(source, /testID="use-hint-button"/);
  assert.match(source, /testID="hint-rewarded-button"/);
  assert.match(source, /label="WATCH AD"/);
  assert.match(source, /setHints\(\(prev\) => prev \+ amount\)/);
  assert.match(source, /activePuzzleKey\.current = null/);
  assert.match(source, /completionStarted\.current \? null : activePuzzleKey\.current/);
  assert.match(source, /completionStarted\.current \|\| adPaused\.current/);
  assert.match(source, /startTime\.current \+= Date\.now\(\) - pausedAt/);
  assert.doesNotMatch(source, /showInterstitialAtTransition/);
});

test('the original free hint, level completion and touch mapping implementations are preserved exactly', () => {
  const source = read('app/game.tsx');
  const hashes = {
    '  const useHint =': 'd548618fca6137b1e71cf619994be04395adfd65ff07cbe7bda2c99a72f0f78f',
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
  assert.match(button, /AD NOT READY/);
  assert.match(button, /accessibilityLiveRegion="polite"/);
});
