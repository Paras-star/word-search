// Development measurement inputs, deliberately outside tests/*.test.cjs.
const seed = 'late-selection-20261124';
const preceding = [
  'animals', 'food', 'sports', 'countries', 'colors', 'fruits', 'space',
  'ocean-life', 'music', 'movies', 'nature', 'technology', 'jobs', 'clothing', 'vegetables',
];
const cases = [
  { id: '8-classic', size: 8, mode: 'classic', route: '/game?onboardingStep=3', step: 3, completed: [] },
  ...[10, 12].flatMap(size => ['classic', 'time'].map(mode => ({
    id: `${size}-${mode}`, size, mode, step: 6,
    completed: size === 12 ? preceding : [],
    route: `/game?categoryId=${size === 10 ? 'animals' : 'human-anatomy'}&mode=${mode}&seed=${seed}`,
  }))),
].map(item => ({
  ...item,
  progress: { coins: 1400, onboardingStep: item.step, completedLevels: item.completed, completedDailyPuzzles: [] },
}));

// Coordinates are cell indices with fractional drift, not screen pixels.
// Stay at least 0.5 CSS pixels inside the content at near-edge samples.
function paths(size) {
  const n = size - 1;
  return [
    { id: 'fast-edge', wait: 0, points: [[0, 0], [0, n / 3], [0, 2 * n / 3], [0, n]] },
    { id: 'diagonal-return', wait: 16, points: [
      ...Array.from({ length: size }, (_, i) => [i, i]),
      ...Array.from({ length: size - 1 }, (_, i) => [n - i - 1, n - i - 1]),
    ] },
    { id: 'drift-and-reentry', wait: 24, points: [
      [n, 0], [n, 1], [n, 2], [n - 1, 3], [n, 4],
      [size + 0.3, 5], [n, 5], [n, n], [n - 2, n - 1], [n, n],
    ] },
    { id: 'outside-corners', wait: 24, points: [
      [0, n], [1, n], [2, n], [3, n - 1], [4, n],
      [5, size + 0.3], [5, n], [n, n], [size + 0.3, size + 0.3], [n, n],
    ] },
  ];
}
module.exports = { seed, cases, paths, states: ['early', 'late', 'late-hint'] };
