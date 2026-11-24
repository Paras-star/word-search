# Late-game selection performance coverage

Date: 2026-11-24.

## Scope

Development-browser measurements only. This extends the empty-board,
center-to-center observations in [selection-render-isolation.md](selection-render-isolation.md)
and [selection-chest-investigation.md](selection-chest-investigation.md).
No application logic, gesture rules, scoring, timer, audio, puzzle generation,
assets, saved progress, rewards, or coin balance code is changed.
No build, export, native submission or publication is authorized or performed.

The comparison here is **early versus late presentation on the same pinned
source**, each with a matched lower-overhead control. It is not a new historical
before/after optimization result. The old disposable bundles referenced by the
previous report are not available in this workspace. That report's historical
results remain separate; they are not reconstructed or mixed into these samples.

## Repeatable fixtures

Inputs live in `../performance/selection-fixtures.cjs`, separate from the existing
deterministic/gameplay preservation suite:

- Level 3 onboarding: fixed onboarding seed, 8 × 8, Classic.
- First Animals: `late-selection-20261124`, no completed categories, 10 × 10,
  both Classic and Time.
- Human Anatomy: same category seed, preceding fifteen categories completed,
  12 × 12, both Classic and Time.
- The 8-grid onboarding route always uses Classic in the actual game; an
  artificial 8-grid Time combination is not introduced.
- Synthetic progress: 1,400 coins, onboarding step 3 or 6, no completed Daily
  puzzles. Each arm uses a fresh non-persistent browser context with no real
  storage state loaded. Protected progress/coin/collection writes are rejected;
  saved progress must remain byte-equivalent as parsed JSON at the end.
- Early means no found words; late means all but the last generated target found,
  in target order, with their exact generated placement paths. This excludes
  completion, rewards and Results navigation. It measures steady-state
  found-highlight-heavy presentation, not the cost of discovering all those words.
- Late-with-hint uses the actual unchanged manual hint handler. Exactly one
  remaining target makes the choice repeatable without patching random numbers.
  Its real 1,500 ms timeout runs; hints are replenished between windows only by
  the disposable fixture setup, never by an ad or a persisted transaction.

Each state gets two repetitions of four normalized paths:

1. Three-move fast horizontal along the top edge, 0.5 CSS pixels inside the
   measured content boundary.
2. Main diagonal forward and back, 16 ms intentional inter-command waits.
3. Bottom-edge straight direction, one-cell tolerated drift, bottom
   out-of-bounds movement, reentry, and a two-cell invalid drift, 24 ms waits.
4. Right-edge equivalent, right-side and corner out-of-bounds, then reentry,
   24 ms waits.

Cell-center coordinates are derived from **settled, freshly read** content
bounds before each path. Browser scheduling/CDP round trips add to intentional
waits, and readbacks add overhead. Right-side out-of-bounds x is clamped within
the viewport, but remains outside the measured grid. All delivered checkpoint
selections must match between arms and early/late states.

CDP command acknowledgement can precede browser event delivery. Each command
therefore waits for the corresponding trusted DOM touch event before the live
handler-ref readback; it does **not** wait for a desired selection value or a
React render. The fast path adds no intentional inter-move delay beyond this
delivery acknowledgement. Its checkpoint lengths must be `3→6→8`,
`4→7→10`, or `5→8→12`. This is a controlled dispatch stress path, not a claim
about the duration of an unpaced physical swipe.

Hint expiry is observed after release for three paths; the fourth holds the
selection through expiry and verifies that selected cells remain selected,
then clear back to the same underlying found colors. Hint activation itself is
outside the eight swipe windows, while expiry is inside. Hint windows have
longer observation tails than early/late windows: **do not compare raw frame
denominators or total render counts as equal-duration workloads**.

In Time mode, a separate late-board fixture starts at 31 seconds and observes
every real one-second tick from 30 through 1, including the warning threshold
and unchanged countdown audio dispatch. Fast gestures at 28/22/16/10 seconds
overlap the countdown; real hints at 28 and 16 also expire naturally.
Observation stops before zero to avoid game-over navigation. This does not
measure game-over, completion or reward behavior.

## Isolation and measurements

`selection-browser.cjs --capture` captures the existing running development
Metro entry with `lazy=false`. Snapshot directories are named by bundle SHA-256
and written exclusively; the manifest also records a fingerprint of tracked
application files and the Git source checkpoint. The run verifies the bundle
hash and source fingerprint and rejects changed workspace source.

Both arms intercept the same entry snapshot. Every other development bundle is
blocked, service workers are disabled, and all development WebSockets are
closed **only in the disposable browser contexts**. This prevents Fast Refresh
from silently replacing the pinned snapshot. Ordinary preview behavior and
application code are untouched.

Both arms share minimal synthetic-state setup/readback injection, CDP input,
trusted touch-event observation, rAF intervals, and browser long tasks.
**Unwrapped control** means no application-function counters/timing, no
render-path log, and no React commit hook; it does not mean zero harness overhead.
The instrumented arm adds:

- Actual function-entry counts for `GameSession`, `PuzzleGrid`, `GridCell`,
  `WordTargets`, `Header`, `CoinPill`, and `RewardedAdButton`.
- Game body entry/finally duration, sampled only inside reported windows.
- Committed game-subtree `actualDuration`. Child render counts never come from
  retained descendant fiber flags.
- Rendered selected paths, hint cells and countdown state.

The summary requires identical full puzzle objects, per-event checkpoint
selections, hint placement, restored found colors, delivered touch-event
counts and synthetic progress between arms. It rejects partial measurements
or missing counters/commit observations. Early/late windows may invoke at most
16N cells across their eight paths (fewer is allowed if React batches an
intermediate presentation), and hint windows may add only the hinted
cells' expiry work. Unchanged targets/header/coin/reward-button entries must stay
zero. Seven quiet countdown intervals must not invoke the grid or its cells.
Timing percentiles are reported, not used as flaky pass/fail thresholds.
Static harness tests fail closed when
compiled source anchors change, so a different Metro/compiler version requires
an explicit harness update, not a guessed replacement.

Body and subtree durations overlap and **must not be added**. React subtree
duration is render work, not DOM commit time. rAF gaps above 25 ms and Long Tasks
API entries at least 50 ms are browser scheduling evidence, not native hardware
dropped frames. This short sequential comparison is not a statistical benchmark,
a measurement of instrumentation overhead, or evidence of a production regression.

## Reproduction

Use the existing `artifacts/word-hunt: expo` development workflow; do not start
a second Metro server, build or export. Requires Playwright available to Node,
Chromium, and the preview domain already supplied to this workspace. No new
application dependency is needed or added.

```sh
# Capture prints the content-addressed snapshot directory.
node artifacts/word-hunt/performance/selection-browser.cjs --capture

# Set NODE_PATH only if Playwright is installed in the environment rather than
# resolvable from the workspace. CHROMIUM_PATH can override the installed binary.
NODE_PATH=/mnt/pid2/node_modules \
  node artifacts/word-hunt/performance/selection-browser.cjs <snapshot-directory>
node artifacts/word-hunt/performance/selection-summary.cjs <snapshot-directory>

# Infrastructure checks stay separate from gameplay preservation checks.
node --test artifacts/word-hunt/performance/selection-harness.test.cjs
node --test artifacts/word-hunt/tests/*.test.cjs
```

Outputs are under `.local/verification/selection-late-game/`, ignored by Git and
deployment. No snapshot, raw trace or transformed bundle belongs in application
source. The checked-in harness is outside the Expo route tree, imported by no
runtime code and excluded by `.replitignore`.

For a quick infrastructure probe after a Metro/compiler update, append `--probe`
to the run command. It exercises one repetition of the four 8-grid early-board
paths in both arms and writes `probe-results.json`, never the accepted results.
The summary refuses a probe, an interrupted run, or a partial matrix.

Exploratory samples with an incomplete development-tools shim, stale render
readbacks, unacknowledged browser dispatch or concurrent validation load are
discarded. Only the completed event-acknowledged run is reportable. Keep tests,
type checking and other CPU-heavy work outside the measurement interval.

## Accepted browser results

The accepted run lasted **17:49:50–17:58:03 UTC on 2026-11-24**. Linux headless
Chromium 155.0.8059.79, four reported logical CPUs, mobile/touch emulation, 390 × 844 CSS
pixels, DPR 3, existing HTTPS Expo development preview, React Compiler enabled,
no CPU/network throttling. Audio settings/cue policy were not changed. This
does not measure audible playback latency.

There are **120 instrumented and 120 control main-path swipes**, plus four
countdown-overlap swipes in each of the two Time cases in each arm:
**256 swipes total**. Infrastructure probe and discarded exploratory samples
are excluded. Each Time arm separately observes every tick from 30 through 1
over approximately 29.65 seconds; it intentionally excludes the zero boundary.

Snapshot identifiers:

- Bundle SHA-256:
  `5a7abbbdd9e56c51775651cb45444f718ae7387567631a91d483a52777cdfa3a`.
- Tracked application-source fingerprint:
  `b23c522ff60303415b0376d4b1f34942dc0e6f803d3bcc64e12bbac4f465a7b1`.
- The content-addressed directory retains `manifest.json`, the original entry
  bundle, copies of the three measurement modules, their verified hashes in
  `results.json`, and `summary.json`. The parent directory retains
  `comparison.txt`, `gameplay-tests.log` and `typecheck.log`.

### Function timing and actual child entries

Times are milliseconds, **p50 / p95**, within the eight observation windows
for each row. They are not production or physical-device timings.

| Case | State | Found cells | Game body | Game-subtree render | Game / grid / cell entries |
| --- | --- | --- | --- | --- | --- |
| 8 Classic | Early | 0/64 | 0.6 / 1.0 | 3.7 / 7.2 | 80 / 74 / 128 |
| 8 Classic | Late | 38/64 | 0.6 / 1.0 | 3.4 / 7.5 | 79 / 74 / 128 |
| 8 Classic | Late + hint | 38/64 | 0.6 / 0.7 | 3.0 / 5.8 | 102 / 82 / 160 |
| 10 Classic | Early | 0/100 | 0.6 / 0.8 | 4.2 / 6.4 | 86 / 82 / 160 |
| 10 Classic | Late | 37/100 | 0.6 / 0.9 | 4.2 / 8.3 | 87 / 82 / 160 |
| 10 Classic | Late + hint | 37/100 | 0.6 / 1.1 | 4.2 / 8.6 | 110 / 90 / 208 |
| 10 Time | Early | 0/100 | 0.6 / 0.8 | 4.2 / 6.8 | 88 / 82 / 160 |
| 10 Time | Late | 37/100 | 0.6 / 0.9 | 4.2 / 8.8 | 87 / 82 / 160 |
| 10 Time | Late + hint | 37/100 | 0.5 / 0.8 | 3.7 / 5.7 | 110 / 90 / 208 |
| 12 Classic | Early | 0/144 | 0.6 / 0.9 | 5.1 / 9.3 | 97 / 90 / 192 |
| 12 Classic | Late | 85/144 | 0.6 / 0.9 | 5.0 / 7.0 | 96 / 90 / 192 |
| 12 Classic | Late + hint | 85/144 | 0.5 / 0.7 | 4.5 / 6.6 | 118 / 98 / 256 |
| 12 Time | Early | 0/144 | 0.6 / 0.9 | 5.3 / 10.1 | 96 / 90 / 192 |
| 12 Time | Late | 85/144 | 0.6 / 0.8 | 5.0 / 9.6 | 96 / 90 / 192 |
| 12 Time | Late + hint | 85/144 | 0.5 / 0.9 | 4.5 / 6.8 | 118 / 98 / 256 |

The late states contain **8/9 found targets** on 8/10 grids and **15/16**
on the 12 grid. Actual `WordTargets`, `Header`, `CoinPill`, and
`RewardedAdButton` function-entry counts are **zero in every row**.
Selection still updates the game and affected cells; those updates are not
dropped to reduce render counts.

The strongest finding is the identical **128/160/192** cell-entry count between
early and late boards of each size. Found highlights do not expand the affected
cell work in this fixture. Hints add only affected-cell work, including expiry;
the 10-grid hint overlaps the held right-edge selection, so expiry does not
reinvoke cells that remain visibly selected.

This does **not** establish universal timing improvement: the 10-grid late
subtree p95 increases from **6.4 to 8.3 ms** in Classic and **6.8 to 8.8 ms**
in Time. Even the 8-grid late p95 rises slightly, 7.2 to 7.5 ms. The short
series cannot distinguish small presentation-cost changes from scheduling
variation. The hint rows have longer observation windows and must not be
interpreted as a faster equal-duration workload.

### Matched controls and browser scheduling

Full puzzle objects, every path checkpoint (including drift rejection,
out-of-bounds retention and reentry), hint placement, cleared selection and
restored found colors matched across arms and early/late presentation states.
Protected storage writes and uncaught page errors were **zero**. Every
context ended with exactly its original synthetic progress and 1,400 coins.

All unwrapped main-path controls had **zero >25 ms rAF intervals** and
**zero ≥50 ms long tasks**. The corresponding instrumented windows also had
zero long tasks; only 10 Classic with a hint had gaps: **2/1,197 intervals**,
maximum **33.3 ms**, versus **0/1,188**, maximum **16.8 ms**, in its control.
Other instrumented/control main-path maximum intervals were 16.8 ms.
These observations do not prove an instrumentation-overhead amount or absence
of jank on a phone.

Delivered moves per state per arm were **70 / 78 / 86** for 8/10/12 grids,
with eight starts and eight ends. Fast checkpoint lengths were exactly
`3→6→8`, `4→7→10`, and `5→8→12`, then empty after release. Input-age
distributions and raw selected paths remain in the machine-readable evidence.

### Final Time countdown

| Case | Game / grid / cell entries | Subtree render p50 / p95 | Instrumented rAF gaps | Control rAF gaps |
| --- | --- | --- | --- | --- |
| 10 Time, 30→1 | 53 / 24 / 112 | 2.9 / 5.4 ms | 0/1,779 | 0/1,779 |
| 12 Time, 30→1 | 53 / 24 / 128 | 2.4 / 8.3 ms | 0/1,779 | 0/1,779 |

Both cases have zero long tasks and zero target/header/coin/reward-button
entries. All four swipes and two natural hints run during this interval.
Seven quiet tick intervals per case (24→23, 20→19, 14→13, 8→7, 6→5,
4→3 and 2→1) have **zero grid and cell invocations**. This supports timer-only
grid isolation even in the warning period, not moving the timer or changing
its countdown/finish rules.

### Preservation and preview checks

- Existing deterministic/gameplay suite: **340 passed, 0 failed, 0 skipped**,
  `node --test artifacts/word-hunt/tests/*.test.cjs`.
- Separate measurement-infrastructure suite: **3 passed, 0 failed**,
  `node --test artifacts/word-hunt/performance/selection-harness.test.cjs`.
- Workspace `pnpm run typecheck` passed.
- Tests/type checking finished before the accepted measurement interval.
- The ordinary uninstrumented Home preview was separately screenshotted and
  rendered without an uncaught page error. This is a startup check only.
- No app/runtime source, dependencies, gameplay fixtures or preservation
  hashes were changed. No instrumented code is imported into the application.
- No build, export or publishing command ran.

## Physical-device evidence

**No new physical-device measurements were taken.** Earlier user acceptance of
ordinary selection smoothness is documented separately in the original report;
it does not establish late-game, active-hint, drift or final-countdown behavior
on Android. Browser results must not be presented as physical-phone acceptance.
