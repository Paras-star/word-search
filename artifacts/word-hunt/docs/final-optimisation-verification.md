# Final performance and Android readiness optimisation

Date: 2026-11-26.

## Scope and boundaries

Focused implementation following the pre-AAB audit. No production build, native
build, AAB, publishing, dependency changes, commits, pushes, merges, or history
changes. No gameplay, scoring, hint economy, reward weighting, persistence,
AdMob, audio content, or approved artwork/geometry changes.

## Changes

1. **Android upload rules:** keep attachments excluded by default, with six exact
   root-level exceptions for the five transparent reward banners and Continue.
   Required original paths are unchanged. The regression scans literal runtime
   media and configured icon/splash paths against the upload exclusion file.
2. **Background ownership:** Categories adopts the existing Animal prepared
   image; Collection adopts the existing Night prepared image. The new hook
   consumes those two existing single-flight caches; it does not create another
   bitmap cache or change dimensions. Native retains an immediate original-source
   fallback; web avoids a competing original URL while preparation is pending.
   Failed preparation exposes the original source and logs a warning. Departed
   consumers ignore late results without discarding reusable shared preparation.
3. **Collection mounting:** calculate an initial batch sufficient for the
   viewport, starting at the requested rarity. A 400×800 viewport requests three
   panels instead of the old default's five. Later batches contain one panel,
   with a three-viewport render window. New-item jumps and item geometry are
   unchanged. Low-priority batches can complete before a browser observation;
   this is not a promise that only three panels remain mounted.
4. **Collection activity:** suspend slot animations on route blur or application
   backgrounding, even when list viewability still says items are visible.
   Decorative timings/springs use `isInteraction: false`, so their loops cannot
   hold an interaction handle that defers progressive list rendering. Animation
   durations, easing, scale, rotation, and artwork are unchanged.
5. **Daily lifecycle:** minute refresh and the existing six staggered preparation
   timers are focus-scoped and cleaned up on departure. Focus refreshes date
   eligibility; unchanged local dates retain the same Date reference rather than
   invalidating every memoized cell. Day rollover still updates eligibility.
   Selection artwork and its approved 200 ms transition are unchanged.
6. **Chest preparation:** after the independent closed image, one sequential
   atlas lane overlaps one sequential rim/collectible lane. There is still at
   most one large-atlas decode at a time, at most two total loads, the same five
   atlases, the same thirty reward references, and the same 384 px collectible
   cap. Both lanes settle before failure becomes retryable, preventing retries
   from overlapping an unfinished failed attempt. Rendering/readiness gates,
   animation timing, audio start, purchase safety, and reward selection are
   unchanged.

## Before/after evidence

Three fresh, isolated Chromium development-browser contexts per arm, 400×800
CSS pixels, DPR 2, mobile/touch emulation, no CPU/network throttling. Each tour
visits Collection twice, Calendar and Daily gameplay, Categories and normal
gameplay, then the paid chest without purchasing. Development WebSockets were
closed only in disposable measurement contexts. No application source was edited
while an individual measurement arm ran.

| Measured requests per tour | Before, all three trials | After, all three trials |
| --- | ---: | ---: |
| Night background | 2 | 1 |
| Animal background | 2 | 1 |
| Chest scenery | 1 | 1 |

The eliminated source PNGs total approximately 12.1 MiB. This is an estimate from
file sizes for the removed requests, not a measurement of GPU/native memory.
All six browser tours reported zero page errors.

Transition samples varied substantially and do not establish a general latency
improvement. Most final-arm medians were slower, so reduced request counts must
not be presented as a demonstrated interaction-speed improvement.

| Automated action → visible route element, median ms (n=3) | Before | Final after |
| --- | ---: | ---: |
| Collection first visit | 545 | 555 |
| Collection repeat visit | 182 | 221 |
| Calendar first visit | 170 | 264 |
| Daily puzzle first visit | 133 | 153 |
| Daily puzzle repeat visit | 102 | 127 |
| Categories first visit | 117 | 183 |
| Normal puzzle first visit | 139 | 154 |
| Chest wrapper mounted | 68 | 81 |

For context, original Collection first-visit samples ranged from 260 to 2531 ms;
final samples ranged from 489 to 658 ms. These observations include development
routing, browser automation, network/server scheduling, and React work. They are
not first painted pixels, pure render CPU time, physical touch latency, or a
controlled statistical claim of improvement/regression.

Final browser chest **interaction readiness**, measured separately by observing
the enabled tap control without purchasing:

| Visit | Three samples, ms | Median ms |
| --- | --- | ---: |
| First chest visit; animation resources cold | 679, 584, 651 | 651 |
| Repeat visit in the same document | 151, 124, 93 | 124 |

Home had settled before these chest visits, so scenery idle preparation could
complete. The first visit is not a cold process/direct-link test. The original
arm did not record this enabled-control milestone: **there is no measured
before/after browser readiness speedup to claim**, and native readiness is still
unmeasured.

The original broad panel selector counted both panels and count labels. Its ten
matches represented **five panels**, not ten panels. Later observations exclude
count labels. The changed browser observed four panels by its first post-ready
sample and all five after settling; the deterministic configured initial batch
is three at 400×800. Do not describe progressive mounting as permanent unloading.

### Simulated native scheduling, not device timing

With every mocked image load taking exactly 10 ms, the old sequential dependency
chain requires 370 ms. The two bounded lanes complete in 320 ms:
closed (10) + max(five atlases (50), rim plus thirty collectibles (310)).
The test verifies a maximum of two active loads, one active atlas decode, all
37 original resources, unchanged thumbnail bounds, and zero extra warm loads.
**The 50 ms difference is a model, not measured Android improvement.**

## Preserved work and deliberate non-changes

- Home's 800 ms scenery-only idle preparation, cancellation, and press-in fallback.
- Native closed-first display, incremental atlas mounting, and Reanimated playback.
- Puzzle gestures, coordinate mapping, selection tolerance, memoized cells/targets,
  found-highlight calculations, deterministic generation, and all timing rules.
- Daily's six-entry cache, staggered preparation, designs, and selection animation.
- Shared successful image references across route exits: no aggressive cache clear.
- Original Home, mode, completion, and reward artwork and layouts.
- Original audio players, one looping music player, foreground handling, files,
  volumes, and cue policy. No measured startup-contention evidence justified
  rescheduling or recompressing audio.
- No speculative background resizing: actual Android decoded allocation, device
  density/quality tradeoffs, and memory peaks were not measurable here.

## Verification

- Complete automated suite, including selection-harness infrastructure: **406 passed**.
- Follow-up Daily/lifecycle/selection checks after the date-identity refinement:
  **39 passed**.
- Word Hunt TypeScript: passed.
- Runtime/config asset existence and upload exclusions: passed.
- Exact attachment allowlist and exclusion of unrelated attachments: passed.
- Installed Expo SDK comparison from the audit: 32 relevant package versions
  matched installed recommendations; package manifests and lockfile are unchanged.
- Existing selection browser harness: the 8×8 Classic **probe** completed its
  instrumented and control arms without page errors. This is not a rerun of the
  full historical 8/10/12-grid late-game matrix.
- Collection screenshot at 400×800 retained the existing composition and artwork.
- Browser functional/visual tour passed at 400×800, with 360×640 spot checks:
  Home, Categories, mode, normal/intro/Daily gameplay, hint consumption and
  highlight, invalid selection, Daily date eligibility/selection/re-entry,
  Collection locked/fully-owned scrolling, and paid-chest confirmation/cancel.
  The disposable confirmation fixture retained its 1000 coins.
- Separate disposable completion fixtures covered Intro, Daily, category Results,
  and the normal reward reveal. Continue saved the reward and reached Results;
  Collection independently saved the reward and reached the Common panel via
  `newDumplingId`. Both stored `collected`, cleared the pending ID, and retained
  the correct owned item without charging coins.
- The new-item Collection opened at Common (scrollTop 871 of 871); upward scroll
  returned to Legendary. The tester observed Legendary unmounted at scrollTop
  521 and mounted again by 171, confirming progressive range rendering rather
  than a list that only changes its configuration props.
- No browser page errors, failed requests, or error boundaries were observed.
- Protected game, reward, audio, AdMob, Home preparation, artwork, and dependency
  files were compared against the starting source and remain unchanged.

The audit's Node/V8 generator baseline remains applicable because generator
source was not changed: 579 distinct inputs, 1899 samples per implementation,
current p50 0.66 ms, p95 4.74 ms, max 29.00 ms. These are not Hermes measurements.

Generated raw browser evidence and the disposable measurement script are under
`.local/verification/final-performance/`, excluded from Git and uploads.

## Browser visual limitations and unchanged details

Browser emulation cannot establish audible latency, native-thread frame timing,
GPU allocation, Android low-memory behaviour, or exact first-painted pixels.
The tester did not measure collection glow opacity separately.

Existing design details were deliberately left unchanged: catch-up dates retain
the supplied “PLAY TODAY'S HUNT” image while their accessibility label describes
the selected date; reward controls/statistics require scrolling on short screens;
the reward scene retains its existing cream top inset; some collection names
truncate inside their approved labels. The corresponding protected artwork,
reward component, and calendar component were not edited. These observations
are not permission to redesign them.

The test helper unnecessarily restarted the Expo workflow once at the start of
its tour. The app was already available; this was not an application repair.

## Native release limitations

No physical Android phone or release binary was exercised. The nominal retained
image-surface budget is not a measured RSS/GPU allocation, and this work does
not establish a reduction in the approximately 86 MiB audit estimate.

Device validation must cover cold/warm entry, first interactive chest readiness,
large-grid gestures, fully owned Collection scrolling, repeated navigation,
background/resume, audible latency, low-memory recovery, and display quality.
Actual release signing, version-code availability, merged permissions, target
SDK, and native library/page-size compatibility still need release evidence.
Existing iOS AdMob and Linux DevTools warnings were not modified.

## Verdict

**READY FOR ANDROID DEVICE VALIDATION**

This is not approval or evidence for generating the final AAB or publishing.

## Exact project files changed

```text
.easignore
artifacts/word-hunt/app/categories.tsx
artifacts/word-hunt/app/collection.tsx
artifacts/word-hunt/app/daily.tsx
artifacts/word-hunt/components/collection/RarityPanel.tsx
artifacts/word-hunt/hooks/usePreparedBackground.ts
artifacts/word-hunt/hooks/useScreenActivity.ts
artifacts/word-hunt/services/chestPreparation.ts
artifacts/word-hunt/tests/assetUpload.test.cjs
artifacts/word-hunt/tests/categoryBackground.test.cjs
artifacts/word-hunt/tests/chestNativePerformance.test.cjs
artifacts/word-hunt/tests/collectionPanels.test.cjs
artifacts/word-hunt/tests/daily.test.cjs
artifacts/word-hunt/tests/preparedBackgroundConsumers.test.cjs
artifacts/word-hunt/docs/final-optimisation-verification.md
```

The additional disposable script `.local/verification/final-performance/measure.cjs`
and its generated JSON evidence are ignored development artifacts, not shipped
application code.
