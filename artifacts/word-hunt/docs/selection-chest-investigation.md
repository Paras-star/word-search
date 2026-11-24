# Selection responsiveness and chest scenery investigation

Date: 2026-11-24. **Investigation only; no performance fixes implemented.**

## Conclusions for review

1. **Selection-driven React work is the largest measured application-side cost
   in this development-browser sample.** Coordinate mapping and PanResponder
   processing are much smaller. This supports a narrowly scoped render-isolation
   experiment, not a gesture-system rewrite.
2. **Fast swipes create bursts of serialized drag sounds.** Dispatching those
   sounds is cheap synchronously, but later sounds wait in the playback queue.
   This establishes audible-start scheduling latency, not that audio is the
   primary cause of visual frame gaps.
3. **Chest scenery has no preparation before navigation and no connection to
   animation readiness.** Cold entry downloads the 2.36 MB PNG after scene mount.
   A controlled delayed-image experiment made confirmation available about
   2.6 seconds before scenery decoding completed.
4. **Warm same-document entry was substantially quicker and made no additional
   scenery request.** Do not treat this as persistent HTTP caching: responses
   explicitly say `no-store`, and both React Native Web and Chromium retain
   in-document image state.

These findings do **not** establish the cause or magnitude of lag on the user's
physical phone or in the published optimized bundle. No physical phone, Safari,
native Android profiler, production build, or publication was used here.

## Baseline and preservation

- Initial working tree was clean at
  `95aec2f06954af2d7db211e1203c596571d1446b`.
- Generator optimization `cc6c8ff`, night-background preparation `f80e162`,
  introductory completion `d0525fd`, and dependency repairs `4a56690` are ancestors.
  Current source retains allocation-free candidate validation and the session
  puzzle ref, retained night/Animal image preparation, and the patched dependency
  lockfile. Existing deterministic and runtime/dependency security tests passed.
- The preceding UI repairs are present: decoded static asset path lookup and
  explicit Collection Room inner-image dimensions. Their separate evidence is
  in [mobile-ui-verification.md](mobile-ui-verification.md); this investigation
  did not repeat their full introductory-progression browser pass.
- No application, asset, dependency, transaction, gameplay, gesture, timer,
  audio, routing, or animation source was edited for this investigation.
  Browser-only instrumentation was injected into an intercepted development
  bundle in disposable browser contexts, never written into application code.
- Test balances/progression existed only in isolated browser localStorage.
  Chest tests opened confirmation and **cancelled**; no purchase was attempted.
  Each control chest case ended with its original test balance of 1,400 coins.
  No real user storage, balances, or collection records were accessed or changed.

## Measurement conditions and reproduction

### Browser and limits

- Linux headless Chromium **155.0.0.0**, Playwright/CDP touch emulation,
  `isMobile=true`, `hasTouch=true`, DPR 3, four reported logical CPUs.
- Main selection cases: **390 × 844** CSS pixels. Independent chest/control cases:
  **393 × 852**. UA:
  `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36`.
- Existing running Expo/Metro **development** preview over its HTTPS proxy;
  React Compiler enabled, `dev=true`, no build/export performed. No CPU or
  bandwidth throttling. The delayed-scenery case adds only an explicit 3,000 ms
  request hold, not a simulated mobile network.
- Request timings include preview proxy/server variability. Cold means a fresh
  browser context with no browser asset cache; Metro/server caches may be warm.
  Warm means Home → chest → cancel → browser Back → settled Home → chest in the
  same document, not app restart, reload, or a physical-device cache test.

### Repeatable puzzle cases

All positions below are zero-based. The same fixed seed is used for both category
cases; Level 3 uses its existing fixed onboarding seed.

| Case | Route relative to preview origin | Isolated saved progress | Grid / measured content bounds |
| --- | --- | --- | --- |
| Introductory Level 3, Classic | `/game?onboardingStep=3` | onboarding step 3 | 8 × 8; x20 y155, 350 × 350 |
| First Animals, Classic | `/game?categoryId=animals&mode=classic&seed=investigate-selection-20261124` | onboarding 6, no completed categories | 10 × 10; x20 y129, 350 × 350 |
| Human Anatomy, Time | `/game?categoryId=human-anatomy&mode=time&seed=investigate-selection-20261124` | onboarding 6, preceding 15 categories completed | 12 × 12; x20 y129, 350 × 350 |

For each grid, after 1.8 seconds settling (2.3 seconds in controls):

- Fast horizontal: cell (0,0) → (0,N−1), three evenly spaced touch moves, no
  intentional delay between CDP commands.
- Diagonal: (0,0) → (N−1,N−1), 2N moves, 16 ms intentional inter-command wait.
- Reverse diagonal: (N−1,N−1) → (0,0), same 2N moves and 16 ms wait.
- Timer overlap: (N−1,0) → (0,N−1), 3N moves, 40 ms wait.
- Three repetitions per path; 180 ms before each and 350 ms after release.
  **36 instrumented swipes**, plus **36 swipes without application-function
  wrappers or the React commit hook** as a lower-overhead control.

Touch coordinates are cell centers:
`x = bounds.x + (col + 0.5) × bounds.width / N`, similarly for y.
CDP command latency and browser event scheduling add to the intentional waits.
For example, first fast swipes lasted approximately 197/209/252 ms for 8/10/12;
these are not claims of 0 ms human swipes. Full-grid paths deliberately avoid
completing any puzzle. These are selection stress paths, not proof that every
target word was successfully recognized. Found-highlight-heavy late-game states,
8/10/12 mode cross-products, drift/out-of-bounds gestures and Time's final
30 seconds were not profiled.

### Observations collected

- `performance.now()` entry/finally timings for grid mapping, cell-event mapping,
  selection handlers, PanResponder's move method, synchronous sound dispatch,
  the game component body, and its one-second timer callback.
- DOM capture timestamps for trusted browser-generated CDP touch/pointer events;
  capture-to-cell-mapping intervals separate responder dispatch from input age.
- React devtools commit hook: performed-work game-component counts and fiber
  `actualDuration`. That duration includes descendant render work; it is **not
  DOM commit-phase duration**, and concurrent work need not be one blocking task.
- `requestAnimationFrame` intervals and Long Tasks API entries. These show
  callback gaps and main-thread tasks ≥50 ms, not hardware/compositor dropped-frame
  counts or a causal CPU stack trace.
- Existing HTML media `play`/`pause` calls and play-promise resolution. They do not
  measure speaker output or hardware latency.
- CDP resource requests/transfer counts/cache headers; DOM image mounting/load;
  a diagnostic `img.decode()` after load; and, in the instrumented run, a
  double-rAF paint opportunity. Load, decode resolution, and actual painted pixels
  are distinct. The diagnostic decode promise also includes scheduling delay.

Sub-millisecond zeros below mean **below the browser clock's useful resolution**,
not no work. Nested function timings overlap and must not be added together.
Instrumentation and development React inflate costs; controls corroborate
occasional frame gaps, not production-equivalent timings.

## Selection results

### Function/render timings, milliseconds

Each grid includes 12 swipes. Mapping sample counts are 189/228/270; move-handler
counts are 177/216/258. Render sample counts are 109/127/149.

| Measured stage | 8 × 8 p50 / p95 | 10 × 10 p50 / p95 | 12 × 12 p50 / p95 |
| --- | ---: | ---: | ---: |
| DOM capture → cell mapping entry | 0.1 / 0.2 | 0.1 / 0.2 | 0.1 / 0.2 |
| PanResponder move processing, including app callback | <0.1 / 0.3 | <0.1 / 0.2 | <0.1 / 0.2 |
| `cellFromEvent`, including coordinate conversion | <0.1 / 0.1 | <0.1 / 0.1 | <0.1 / 0.1 |
| `gridCellFromPoint` alone | <0.1 / 0.1 | <0.1 / <0.1 | <0.1 / <0.1 |
| `updateSelection` synchronous work | <0.1 / 0.1 | <0.1 / 0.1 | <0.1 / 0.1 |
| Game component body | 6.3 / 9.8 | 8.4 / 10.7 | 11.8 / 15.3 |
| React game-subtree render `actualDuration` | 18.7 / 32.5 | 24.1 / 30.4 | 33.4 / 42.3 |
| Sound request synchronous dispatch | <0.1 / 0.1 | <0.1 / <0.1 | <0.1 / <0.1 |
| One-second timer callback | <0.1 / 0.2 | <0.1 / 0.2 | <0.1 / 0.2 |

The largest coordinate-only sample was 0.1 ms. PanResponder's maximum move cost
was 1.0 ms. Capture-to-mapping maxima were 0.9/2.1/2.1 ms.
This does **not** support changing coordinate conversion, explicit grid rows,
PanResponder, drift tolerance, or reverse-direction matching.

Touchmove event timestamp → DOM capture p50/p95 was 26.4/35.3, 26.1/45.3,
29.0/51.3 ms respectively. Pointermove p50/p95 was 26.3/35.3, 26.0/45.3,
28.6/50.8 ms. Touchstart medians were 9.9/13.6/7.1 ms; touchend medians
13.1/9.3/13.4 ms. Input age includes browser dispatch/coalescing, CDP scheduling
and any main-thread queueing; it cannot be attributed solely to app logic.
Pointer and touch observations describe overlapping input streams, not twice
the number of selection updates.

### Update/render counts and frame evidence

| Grid | Game renders per fast swipe | Per diagonal | Per reverse | Per timer-overlap | Instrumented rAF gaps >25 ms / intervals | Long tasks |
| --- | --- | --- | --- | --- | ---: | --- |
| 8 | 6,6,5 | 9,10,10 | 10,10,10 | 11,11,11 | 5 / 724; max 49.9 ms | 1; 56 ms |
| 10 | 5,6,5 | 12,12,12 | 12,12,12 | 13,13,13 | 6 / 835; max 83.4 ms | 1; 51 ms |
| 12 | 5,6,5 | 14,15,14 | 15,14,14 | 16,15,16 | 23 / 987; max 83.4 ms | 5; 50–74 ms |

Typical rAF interval was 16.7 ms. In controls with no application-function wrappers
or React hook, gaps >25 ms were **2/717**, **4/833**, **15/978**; maxima
33.5/50.0/100.1 ms. Long tasks were 0/1/8, with maxima none/59/75 ms.
These small samples are not an instrumentation-overhead estimate or a statistical
benchmark; load and scheduling varied between runs.

Fast swipes delivered all three requested touch moves and produced paths of
lengths `1→3→6→8→0`, `1→4→7→10→0`, `1→5→8→12→0`.
Diagonal and reverse swipes accepted each successive cell before clearing on
release; no missed endpoint was observed on these center-to-center paths.
The full line is recalculated between delivered endpoints, so a jump over cells
does not by itself indicate dropped gameplay input.

Each changed selection requests state and evaluates the game/grid JSX again;
current source maps every row/cell inside the game component. Measured render
work grows with grid size and is much larger than handler work. This establishes
a local cost concentration, **not a proven physical-phone root cause** or proof
that every descendant DOM node changes.

Timer callbacks numbered 13/14/18 across the windows. Renders attributed to the
latest timer marker had component-body medians 6.2/8.1/12.4 ms, similar to
selection-triggered medians 6.4/8.5/11.7 ms. Timer-overlap paths added two or three
ticks/renders; some updates coalesced. The callback arithmetic is cheap; it is the
shared rendering scope that adds work. No trace here proves the timer caused a
particular long task, and no timer-rule change is justified.

### Drag audio

Every full-length swipe requested N drag cues, including fast swipes with only
three move events. A single 12-grid move can add four cells and synchronously
request four cues. Across each grid's cases, 96/120/144 drag requests matched
96/120/144 media play calls and resolved starts.

| Grid | Fast swipe cue request → `play()` p50 / p95 / max | `play()` → play-promise resolution p50 / p95 across all paths |
| --- | ---: | ---: |
| 8 | 30.3 / 108.1 / 109.9 ms | 22.6 / 48.5 ms |
| 10 | 71.1 / 124.2 / 124.3 ms | 29.6 / 38.4 ms |
| 12 | 55.4 / 130.5 / 134.6 ms | 39.8 / 51.2 ms |

For the slower diagonal/reverse paths, request→play median was about 0.3 ms;
p95 reached 48.9 ms on the 12-grid diagonal. Source inspection confirms one
shared player and serialized ready → pause → seek → play operations per cue.
The handler does not await this queue. An audible backlog is plausible and
scheduling backlog is measured; audio-caused visual jank remains unproven.
No muting/queue-dropping ablation was performed, and default effects/music
settings were retained.

## Chest scenery results

### Lifecycle: source facts versus observations

| Stage | Scenery path | Animation/preparation path |
| --- | --- | --- |
| Root/Home | No scenery loader/preparation call. Home displays its separate small chest icon. | Root warms the independent closed frame. Audio initialization creates cue players, including chest audio; this is not scenery preparation. |
| Scene navigation/mount | `ChestScene` mounts RN `Image` using the original scenery PNG; no retained scenery ImageRef/service. | Closed frame displays first. After its load/display, `afterChestDisplay` yields rAF/idle before opening preparation. |
| Web opening preparation | Scenery loads independently. | `Asset.loadAsync` for five atlases/front, then renderer/front load callbacks gate interaction. It does not call native `prepareChestAssets`. |
| Native opening preparation | Shared scenery remains RN `Image`, separate from Expo ImageRefs. | Sequential decoded atlas preparation plus bounded collectible ImageRefs; dedicated audio readiness and incrementally mounted native renderers gate interaction. Strong preparation refs persist across routes. |
| Confirmation | No scenery-ready condition is checked. | Chest interaction requires the closed/animation resources, no opening underway, and caller eligibility. |
| Purchase | No scenery input to purchase. **Not executed.** | Paid transaction must commit first; only then does caller set the selected dumpling and `animating`. |
| Opening | No scenery-ready gate exists. Actual source frame sequence preserved. | Web waits for dumpling/assets/front/renderer, then sound start and JS frame clock; native uses prepared audio and the native clock. Neither includes scenery readiness. |

The absence of a scenery gate means opening **can** precede scenery readiness by
code dependency, but no purchase or paid opening was run to observe that ordering.
The delayed test below proves the prerequisite state (interactive chest and
confirmation while scenery is absent) without deducting coins or choosing rewards.

### Timelines relative to navigation marker

The marker is recorded immediately before the automated Home chest tap, so times
include tap dispatch/navigation. "Interactive" is sampled after the disabled
attribute clears and is an upper bound on readiness, not its exact React commit.

| 393 × 852 control case | Scenery `<img>` mount | Load | Diagnostic decode resolved | Chest interactive | Confirmation visible |
| --- | ---: | ---: | ---: | ---: | ---: |
| Cold | 81.7 ms | 119.2 ms | 183.1 ms | 459.8 ms | 534.0 ms |
| Warm, same document | 73.2 ms | Already complete at mount | 76.2 ms | 109.6 ms | 170.2 ms |
| Fresh, scenery request held 3,000 ms | 80.4 ms | 3,115.1 ms | 3,135.8 ms | 417.9 ms | 491.1 ms |

Warm mount-complete sampling and a later load event both occurred for the same
element; those observations are **not** two downloads. Screenshot evidence shows
normal original scenery once loaded, and an available confirmation over absent
scenery in the held-request case. The latter screenshot was taken during the
modal transition and is not evidence of a separate modal-layout defect.

At 390 × 844, the independent instrumented cold/warm pair gave:

- Scenery mount 96.0 / 85.1 ms; cold load 354.8 ms.
- First decode resolution 391.4 / 97.9 ms; paint opportunities 423.5 / 107.1 ms.
- Chest interaction readiness sampled at 628.6 / 141.3 ms.
- Confirmation was deliberately later (1,815.8 / 1,289.9 ms), because screenshot
  capture preceded the chest tap; do not interpret these as dialog latency.

The two ordinary cold runs downloaded scenery in about **205.3 ms** and
**28.6 ms** respectively. Load→decode-resolution waits were **36.6 ms** and
**63.8 ms**. These waits include decoding *and scheduling*; no claim that decoder
CPU alone took those durations is warranted. Network/first-use preparation is
confirmed; render/GPU upload cost is not separately isolated.

### Requests, retained state, and duplicate paths

- Source PNG: **937 × 1,678**, **2,357,344 file bytes**, roughly **6.0 MiB**
  uncompressed RGBA before platform overhead. Cold transfer was approximately
  2.359 MB including response overhead; one completed scenery request.
- Both ordinary warm visits added **zero** completed scenery transfers.
  Requests reported `fromDiskCache=false` and
  `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate`.
  Successful warm reuse despite this policy demonstrates same-document retention,
  not guaranteed reuse on a new document or on native.
- At both tested tall phone aspect ratios `safeCover=true`: one scenery Image
  view, not a foreground/backing pair. Other aspect ratios can intentionally
  mount a second view of the **same PNG** for edge fill. That is a duplicate
  rendering path in source, not evidence of two transfers at the measured sizes.
  Do not remove/reframe that backing art.
- In the 390 cold pair, five atlas requests occurred once each; the front image
  transferred **twice** (approximately 114 KB per transfer) at the same URL.
  `Asset.loadAsync` and later displayed RN Image loading are separate paths.
  Atlases can coalesce overlapping requests; the repeated front request shows
  that URL preloading alone does not guarantee sharing. Warm added no chest
  image transfers. This is separate from the scenery delay.
- Web module asset retention/browser image state differs from the native
  `prepareChestAssets` strong decoded ImageRef cache. Native prep covers
  closed/atlases/front/collectibles but **not scenery**.
- Five 1,536² RGBA atlas surfaces alone nominally total **45 MiB**; actual native
  CPU/GPU allocation was not measured. Preparing all that earlier on Home would
  add substantially more work than preparing only one 6 MiB scenery surface.
  Do not expand startup gates or prewarm full rewards/atlases to fix scenery.

## Smallest recommended experiments — approval required

1. **Reduce selection-driven render scope, preserving input exactly.**
   Isolate the existing grid/cell presentation from static header, target list
   and footer; keep stable props for unaffected cells, with the current puzzle
   ref, geometry, selection arrays, refs and PanResponder semantics unchanged.
   The first experiment should compare identical paths/render counts before and
   after. Separating only the timer display can then avoid its once-per-second
   whole-screen work while preserving elapsed/countdown/finish semantics.
   Do not batch/drop gesture events or move puzzle generation.
2. **Prepare only original scenery near chest intent and reuse the result.**
   Evaluate one retained, retryable, decoded scenery preparation shared by
   preparation and displayed views. Prefer bounded intent-time work (Home chest
   press-in/focus or a short cancellable idle opportunity while Home is focused)
   over unconditional startup work. Press-in lead time is short and cannot
   guarantee cold readiness; a Home idle opportunity uses more bandwidth and
   memory. Limit ownership to one source surface and retry failures; preserve
   the existing cover/backing and pedestal geometry. Establish a shared
   preparation/display mechanism rather than assuming URL prefetch suffices.
   A hard navigation/purchase delay is **not** recommended without separate UX
   approval. The existing closed-first animation preparation must stay intact.
3. **Re-measure audio after render isolation before changing cue policy.**
   If fast-swipe backlog remains audible on target phones, review whether one
   cue per delivered change or a bounded stale-cue policy is acceptable. Either
   changes today's every-added-cell cue behavior and needs explicit product
   approval; do not silently discard cues, alter supplied clips, or introduce a
   gesture-handler await. A new gesture system is not justified by these data.

The front-image repeated transfer is a lower-priority measured inefficiency;
address only through the same verified preload/display-sharing approach, not an
unrelated asset/cache-policy rewrite.

Success must be assessed with the same seed/progress/grid/path and production
phone-browser conditions, with separate physical Android acceptance if native
behavior changes. Local browser measurements cannot certify Android improvements.

## Evidence, verification, and exact remaining changes

Large/raw evidence is deliberately outside Git and deployment under
`.local/verification/word-hunt-performance/` (already excluded by both ignore
files):

- `measurements.json`: all 36 wrapped runs, two cold/warm chest timelines,
  event/render/long-task/rAF/audio samples and completed resource observations.
- `control.json`: 36 lower-overhead swipes and three 393 × 852 chest cases.
- `chest-0.png`, `chest-1.png`: instrumented cold/warm scenes.
- `control-chest-false-0.png`, `control-chest-false-1.png`: ordinary control scenes.
- `delayed-scenery-confirmation.png`, `control-chest-true-0.png`: request-held
  confirmation and eventual scenery.
- `tests.log`, `typecheck.log`: complete check output.

Preview origins are redacted in saved JSON; request paths/timings/counts and cache
evidence remain. Completed-request observations do not claim to count speculative
decoder invocations or internal cache hits.

Verification on the unchanged application:

- `node --test artifacts/word-hunt/tests/*.test.cjs`: **325 passed, 0 failed,
  0 skipped**, including all 201 full deterministic puzzle fixtures and current
  transaction/reward/audio/chest/security/UI regressions.
- `pnpm run typecheck`: **passed** for shared libraries, all artifacts and scripts.
- `git diff --check`: **passed**.
- Fresh ordinary preview screenshot at `/treasure-chest`, 393 × 852: original
  scenery, closed chest and insufficient-balance presentation rendered.
- No workflow restart was needed: no application/run/dependency code changed.
  Existing native DevTools shared-library/iOS ad configuration startup warnings
  were not repaired or used as performance evidence.
- Browser contexts were closed, injected code discarded, and temporary bundle,
  profiling scripts and working files removed. No persistent diagnostics,
  logging, new dependency, build, commit, push, merge or publication was added.

Remaining reviewable changes:

1. `artifacts/word-hunt/docs/selection-chest-investigation.md` — this findings report.
2. `.agents/memory/chest-native-performance.md` — append the durable measurement
   boundary: synthetic browser render/audio/scenery observations are not
   physical-phone/native performance evidence.

The ignored evidence files listed above are retained as investigation output,
not application instrumentation. No application source changes remain.
