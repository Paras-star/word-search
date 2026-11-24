# Selection render-isolation experiment

Date: 2026-11-24.

## Scope and approval

The user reviewed the proposal based on
[selection-chest-investigation.md](selection-chest-investigation.md) and selected
**“Approve the experiment”** before implementation.

This is a presentation-only experiment in `app/game.tsx`. It does not change
gestures, move generation, drop or batch input events, change drift tolerance,
alter puzzle sizes, or change audio cue policy. Chest preparation is separate
work and was not touched. No app build, export, publication, or submission ran.

## What changed

- Memoized grid presentation retains the same measured content `View`, explicit
  rows, border/padding/layout, ref, layout callback and responder props.
- Each grid cell receives primitive visual props. React's normal shallow memo
  comparison skips cells whose letter/fill/border/radius/text color did not change.
  There is no custom comparator that can hide a changed selection or hint.
- The target list is separately memoized. Background, header/coin pill and
  rewarded-hint footer retain their presentation between unrelated selections.
- The measurement callback and rewarded-hint press callback use stable identities;
  their actual callback bodies are unchanged.
- The timer still runs in the session, with its original state, effect, countdown
  cues, ad pause and finish behavior. An independent timer owner was deliberately
  **not** introduced: stable grid props already allow timer ticks to skip the grid,
  and moving timing state would unnecessarily expand the gameplay-risk surface.

Found-word discovery still invalidates target-list and grid presentation. Hints
and selection still invalidate affected cell props, with unchanged priority:
selection → hint → found fill → ordinary card. Clearing selection restores the
underlying hint/found state. Theme subscriptions remain inside memoized consumers.

## Preservation and checks

- **333 tests passed, 0 failed, 0 skipped**, using
  `node --test artifacts/word-hunt/tests/*.test.cjs`.
- **`pnpm run typecheck` passed** across shared libraries, all artifacts and scripts.
- **`git diff --check` passed.** Measurement outputs remain ignored.
- New regression checks compare normalized syntax hashes taken from the
  pre-experiment source for input mapping, drift handling, selection grant/move/
  release, PanResponder and its dependencies, board sizing, mode/seed/puzzle ref
  installation, hint/reward handlers, completion and every existing effect
  (including timer and focus handling).
- Additional presentation checks exercise all 8/10/12 layouts, original measured
  ref and responder identity, primitive unaffected-cell props, clearing selection,
  and selected/hint/found style priority.
- The 201 complete deterministic puzzle fixtures remain in the complete suite.
  Original audio/asset protection checks also remain in that suite.
- Existing source-shape assertions were updated for the extracted target-list/
  grid presentation. The approved whole-screen golden snapshot was updated
  deliberately; the separate pre-experiment logic hashes were **not** regenerated
  from the changed screen.
- The mobile workflow was restarted once after the application edit batch and
  served the updated preview. Existing native DevTools shared-library and iOS ad
  configuration warnings remain outside this Android/render-isolation scope.

## Matched browser measurement protocol

These are **development-browser observations**, not native Android timings,
published-bundle timings, hardware dropped-frame counts or phone acceptance.

- Headless Linux Chromium 155.0.8059.79, UA Chromium 155.0.0.0, four reported logical
  CPUs, touch/mobile emulation, 390 × 844 CSS pixels, DPR 3.
- Existing HTTPS Expo/Metro development preview, `dev=true`, React Compiler enabled.
  No CPU/network throttling. No native/production build was used.
- Each case uses a fresh isolated browser context. Only its localStorage contains
  the synthetic progress/balance. No real player data is read or changed.
- The old and new development entry bundles are captured separately, then served
  only in disposable measurement contexts. Development update sockets are blocked
  in those contexts so Fast Refresh cannot replace an intercepted old bundle with
  current workspace code. Ordinary application Fast Refresh is unchanged.
- Initial exploratory harness runs that did not pin the source, or sampled bounds
  before fonts/layout settled, are discarded. They are not performance evidence.
- The three routes, saved progress and seed exactly follow the investigation:
  Level 3 Classic at onboarding step 3; first Animals Classic at step 6 with no
  completed categories; Human Anatomy Time at step 6 with the preceding fifteen
  categories completed. Category seed: `investigate-selection-20261124`.
- After settling 1.8 seconds (instrumented) or 2.3 seconds (controls), measure
  content bounds **again** and use the final cell centers for input.
- Each case repeats fast horizontal (3 moves, no intentional wait), diagonal and
  reverse diagonal (2N moves, 16 ms wait), and opposite diagonal across timer ticks
  (3N moves, 40 ms wait) three times. Each swipe has 180 ms before and 350 ms after
  release. CDP/browser scheduling adds to those intentional waits.
- There are 36 instrumented and 36 lower-overhead control swipes **per source
  version**, 144 swipes total in the final paired comparison.
- Instrumented contexts record game-body entry/finally timing, actual child
  function-entry counts, committed game-subtree render duration, selected paths,
  trusted touch-event counts/age, rAF intervals and long tasks. Baseline cell counts
  are evaluations of the original inline cell-style function; new cell counts are
  actual memoized `GridCell` invocations. Both quantify work, not DOM mutations.
- Child counts use function-entry counters, **not** a walk of retained descendant
  performed-work flags. Bailout descendants can retain old flags. The React commit
  hook is used for game-subtree `actualDuration`, not DOM commit-phase duration.
- Controls have no application-function wrappers, snapshot/path injection, child
  counters or React commit hook. Only event/rAF/long-task observations remain;
  the same source pinning and isolated progress setup apply.
- Compare steady swipe windows for subtree duration, child counts and frame
  observations. Game-body timing samples include initial setup and timer renders
  as well as swipes and are reported separately, not added to subtree duration.

## Browser results

### Rendering cost and work counts

Times below are milliseconds, p50 / p95, **before → after**.

| Grid | Game body, all samples | Game-subtree render, swipe windows | Game renders in swipe windows |
| --- | --- | --- | --- |
| 8 × 8 | 5.1 / 8.5 → 0.7 / 1.6 | 14.8 / 21.5 → 3.9 / 8.5 | 109 → 106 |
| 10 × 10 | 6.8 / 11.2 → 0.6 / 1.9 | 19.4 / 32.2 → 4.9 / 9.8 | 127 → 129 |
| 12 × 12 | 9.6 / 14.4 → 0.6 / 1.0 | 27.2 / 37.3 → 5.4 / 8.4 | 147 → 147 |

Body sample counts before/after: 115/112, 135/134, 155/155. The body and subtree
timings overlap and must not be added. They are not production timings.

| Grid | Original inline cell presentations evaluated | New memoized cells actually rendered | Header / coin pill / rewarded button calls, each |
| --- | ---: | ---: | --- |
| 8 × 8 | 6,976 | 192 | 109 → 0 |
| 10 × 10 | 12,700 | 240 | 127 → 0 |
| 12 × 12 | 21,168 | 288 | 147 → 0 |

All counts cover the same twelve swipe windows per grid. Each new-cell total is
exactly twelve swipes × N selected cells × two visual changes (select and clear).
`WordTargets` has zero calls during those windows. `PuzzleGrid` ran 96/113/132
times, skipping timer-only updates; the timer's ownership/rules were not changed.

This supports the limited experiment: application render work decreased and
unchanged presentation stopped rebuilding. Whole-game render counts are **not**
an optimization target by themselves: selection updates are still delivered.
Small count differences reflect timer-window alignment/batching, not dropped input.

### Matched input and puzzle output

- All three complete puzzle objects (grid, words, placements, size and ID) were
  identical before and after.
- Every recorded selected-cell sequence was identical, per swipe and repetition,
  before and after, including clearing on release.
- Settled content bounds matched: 8-grid x20 y155; 10/12-grid x20 y129; all 350².
- The selected paths exercise stress selection, not puzzle completion. Existing
  gameplay tests, not these invalid full-grid swipes, cover scoring/completion.

Delivered touch counts matched before/after in **both** instrumented and control
cases: twelve starts and ends per grid, and 177/216/258 moves for 8/10/12. Fast
swipe selection lengths matched on all repetitions: `1→3→6→8→0`,
`1→4→7→10→0`, `1→5→8→12→0`. Audio dispatch and its serialized playback queue
were not changed or reprofiled; existing sound-behavior tests remain authoritative
for the unchanged every-added-cell policy.

### Per-swipe game render counts

Each group lists the three repetitions, **before → after**. These include any
timer/feedback render falling in that swipe's observation window.

| Grid | Fast horizontal | Diagonal | Reverse diagonal | Timer overlap |
| --- | --- | --- | --- | --- |
| 8 | 5,6,5 → 5,6,5 | 10,10,10 → 10,10,10 | 10,10,10 → 10,10,10 | 11,11,11 → 11,10,9 |
| 10 | 5,6,5 → 6,5,5 | 12,12,12 → 13,12,12 | 13,12,12 → 12,13,12 | 13,13,12 → 13,13,13 |
| 12 | 5,6,5 → 6,6,5 | 14,14,14 → 14,14,14 | 15,14,14 → 14,14,15 | 15,15,16 → 15,15,15 |

### Frame and lower-overhead controls

Only swipe observation windows are counted. Gaps are rAF intervals **>25 ms**;
long tasks are browser Long Tasks API entries **≥50 ms**. They are not measured
hardware dropped frames. Values are **before → after**.

| Grid | Instrumented gaps / intervals | Instrumented max gap | Instrumented long tasks |
| --- | --- | --- | --- |
| 8 | 1/723 → 2/710 | 33.3 → 33.4 ms | 1 (56 ms) → 0 |
| 10 | 5/822 → 2/815 | 83.3 → 49.9 ms | 2 (54–65 ms) → 0 |
| 12 | 8/962 → 3/917 | 83.3 → 33.4 ms | 4 (55–71 ms) → 0 |

| Grid | Unwrapped-control gaps / intervals | Control max gap | Control long tasks |
| --- | --- | --- | --- |
| 8 | 4/720 → 0/705 | 50.0 → 16.8 ms | 0 → 0 |
| 10 | 3/822 → 6/823 | 100.0 → 66.6 ms | 0 → 1 (54 ms) |
| 12 | 13/968 → 2/908 | 150.0 → 99.9 ms | 9 (56–135 ms) → 0 |

The 10-grid control has **more**, not fewer, >25 ms gaps after the change. The
8-grid instrumented gap count also does not improve. Do not average away these
exceptions or claim universal frame smoothness. The strongest supported finding
is the directly measured reduction in render work, with matching delivered events,
paths and puzzle output. Frame observations are mixed on the smaller grids and
encouraging on the largest grid. A single sequential before/after series is not
a statistical benchmark or an estimate of instrumentation overhead.

The ordinary uninstrumented `/game?onboardingStep=0` preview also displayed the
board, header, targets, hint balance and footer without an uncaught browser error.
That first-viewport screenshot is neither artwork-readiness nor phone-performance
evidence.

## Physical-phone acceptance

**Accepted separately by the user.** Acceptance was recorded on 2026-11-24.
The user confirmed that they had previously tested the updated puzzle-selection
experience on their phone and that “the smoothness now feels fine.”

This is the user's physical Android acceptance, separate from the browser
measurements above. The exact test date, device model, runtime/binary and individual
paths or modes exercised were not supplied; no broader device coverage or
production-binary benchmark is claimed. The earlier inability to test immediately
is superseded by this explicit acceptance.

The user requested successful closure of the selection task with its implementation
preserved. The nearly-completed-puzzle and fast-swipe-audio follow-ups are not
authorized to start as part of this closure.

## Evidence location

Disposable source snapshots, harness, raw observations and check logs are retained
under `.local/verification/word-hunt-performance/`, excluded from Git/deployment:
`baseline.json`, `after.json`, `summary.json`, `comparison.txt`, `tests.log`, and
`typecheck.log`. They contain synthetic puzzle state only. No profiling code or
logging is shipped in the application, and no dependency was added.
