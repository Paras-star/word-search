# 700-coin chest: background readiness diagnosis

Date: 2026-11-24. **Diagnosis only. No optimization implemented.**

## 1. Confirmed cause and limits

The confirmed lifecycle problem is **late, independent scenery preparation**:

1. Home's chest tap navigates immediately. It does not prepare the scenery.
2. The scenery's React Native `Image` mounts only on the chest route. Its first-use
   loading work therefore starts after navigation, not before the tap.
3. The native decoded chest cache excludes the scenery. Preparing the closed
   chest, animation atlases, front rim or collectibles does not prepare it.
4. Neither chest interaction nor animation readiness includes scenery readiness.
   The chest and confirmation can therefore become available without scenery.

The preceding browser investigation experimentally confirmed that independence:
holding the scenery request for three seconds did not stop confirmation appearing.
It did **not** execute a paid opening, so actual opening-before-scenery was not
observed; the absence of that dependency is established by source inspection.

**This is not a confirmed diagnosis of the phone's dominant cost.** Android disk
read/decode time, view mounting, texture upload, render-thread contention and
perceived first-painted timing have not been measured. It would be inaccurate to
call decoding, navigation or GPU rendering the proven Android root cause.

Current chest source was rechecked for this diagnosis. Browser numbers below
come from the earlier
[selection/chest investigation](selection-chest-investigation.md), not a fresh
benchmark. Its original `measurements.json` and `control.json` are unavailable in
this workspace snapshot, so these historical figures cannot be re-audited from
raw captures here. Do not confuse the separate selection experiment's newer
`baseline.json`/`after.json` with chest measurements.

## 2. Exact files and loading lifecycle

All paths below are relative to `artifacts/word-hunt/`.

| Stage | File | Current behavior |
| --- | --- | --- |
| App startup | `app/_layout.tsx` | Warms only `CHEST_CLOSED`: native `prepareClosedChest()`, web RN image prefetch. Audio initialization is separate. Scenery is not a startup or font/splash dependency. |
| Home tap | `app/index.tsx` | `treasure-chest-button` plays `tap` and calls `router.push('/treasure-chest')`. No scenery press-in/focus/idle preparation. |
| Route mount/layout | `app/treasure-chest.tsx` | Calls `useChestSceneLayout()`, renders `ChestScene` and `ChestReveal` immediately. Root `onLayout` installs measured dimensions. |
| Scenery | `components/ChestScene.tsx` | Requires `assets/images/chests/chest-background.png` and renders RN `Image`, not Expo decoded `ImageRef`. There is no scenery load/display/error callback, retained preparation service or readiness state. |
| Closed-first scheduling | `services/chestEntryScheduling.ts` | After the independent closed image's load/display signal, yields through rAF then idle callback (or timer fallback) before heavier opening preparation. Does not wait for scenery. |
| Web reveal preparation | `components/ChestReveal.tsx` | Loads five atlases/front via `Asset.loadAsync`, then waits for renderer and front image callbacks. The scenery is outside these gates. |
| Web atlas display | `components/ChestFrameRenderer.tsx` | Uses RN `Image` atlas views and reports ready after their load callbacks. Not a scenery loader. |
| Native reveal preparation | `components/ChestReveal.native.tsx` | Prepares native animation assets and audio, waits for closed/layout readiness, and incrementally mounts atlas renderers. Scenery is not an input. |
| Native retained bitmaps | `services/chestPreparation.ts` | Strong references retain closed, atlases, front and bounded collectible `ImageRef`s across routes. No scenery reference or load call. |
| Native atlas display | `components/ChestFrameRenderer.native.tsx` | Displays prepared Expo `ImageRef`s; Android load / iOS display callbacks report atlas readiness. These callbacks say nothing about the shared RN scenery image. |
| Confirmation/purchase | `app/treasure-chest.tsx`, `services/treasureChest.ts` | Eligibility plus reveal-asset readiness controls chest tapping. Confirmation precedes the recoverable 700-coin transaction; only a successful purchase supplies the winner and starts opening. No scenery dependency exists. |
| Free puzzle reward | `app/reward.tsx` | Uses the same scene/reveal presentation, but retains its separate free reward logic. A shared scenery change could affect this route too. |

Requiring an asset resolves its source metadata; it is not evidence of an eagerly
decoded, display-ready bitmap. On Android, mounting RN `Image` invokes the native
image pipeline, but its internal read/decode stages are not instrumented here.

### Asset and geometry

- Original PNG: **937 × 1,678**, **2,357,344 bytes**.
- Nominal full-size RGBA surface: **6,289,144 bytes ≈ 6.0 MiB**, excluding native/
  browser object overhead, decoder temporaries and GPU copies. Actual allocation
  and display downsampling were not measured.
- The pedestal is baked into that scenery. There is no independent pedestal
  load/display event, so a separate “pedestal fully visible” timing is unavailable.
- `getChestSceneLayout()` preserves cover/contain behavior in artwork coordinates,
  the artwork's 54.8% anchor and the closed frame's 356/384 base relationship.
  The initial window-based layout can be followed by a measured root layout;
  this may cause another render, but is not evidence of another download or of
  layout being the main delay.

## 3. Historical measurements and conditions

Linux headless Chromium 155, touch/mobile emulation, DPR 3, four reported logical
CPUs, existing HTTPS Expo/Metro **development** preview, React Compiler enabled.
No CPU/bandwidth throttling except the explicitly held request. No physical
Android profiler, optimized app build, purchase or actual speaker/display timing.
Cold means fresh browser context; warm means repeated navigation in the same
document, not an app restart or persistent disk-cache test.

Times below are milliseconds after the marker immediately before the Home tap.
Interaction is sampled readiness, not its exact commit time.

| 393 × 852 case | Scenery element mounted | Image load | Diagnostic decode resolved | Chest interactive | Confirmation visible |
| --- | ---: | ---: | ---: | ---: | ---: |
| Cold | 81.7 | 119.2 | 183.1 | 459.8 | 534.0 |
| Warm, same document | 73.2 | Complete at mount | 76.2 | 109.6 | 170.2 |
| Fresh, scenery request held 3,000 ms | 80.4 | 3,115.1 | 3,135.8 | 417.9 | 491.1 |

The delayed case establishes confirmation without scenery, approximately 2.6 s
before diagnostic decode completed. It does not establish native latency.

A separate instrumented 390 × 844 cold/warm pair recorded:

- Scenery element mount: **96.0 / 85.1 ms**.
- Cold load: **354.8 ms**.
- Diagnostic decode resolution: **391.4 / 97.9 ms**.
- Double-rAF paint opportunities: **423.5 / 107.1 ms**.
- Chest interaction readiness: **628.6 / 141.3 ms**.

**Not measured:** exact first visible background frame, full chest-and-pedestal
paint, native decoder CPU time, native memory, GPU upload, layout/React CPU
attribution or production-phone performance. An element mounting, a load event,
`decode()` resolving and a later paint opportunity are different observations;
none alone proves when pixels reached the user's screen.

The ordinary cold scenery transfers took approximately **28.6 ms** and
**205.3 ms** in the two runs. Load-to-diagnostic-decode-resolution waits were
**63.8 ms** and **36.6 ms**. Those waits include scheduling; they are not pure
decoder CPU measurements. Route mount timings likewise include dispatch,
navigation, React work and scheduling, not isolated navigation overhead.

### Cache and duplicate-work findings

- One completed scenery transfer occurred per ordinary cold case; both ordinary
  warm visits added **zero** scenery transfers.
- Responses used `Cache-Control: no-store, no-cache, must-revalidate,
  proxy-revalidate`; `fromDiskCache` was false. Warm browser image/module retention
  is therefore not proof of persistent HTTP caching, let alone Android caching.
- Both measured tall aspect ratios used one scenery image view (`safeCover=true`).
  Other aspect ratios intentionally add a backing view using the **same PNG**.
  Two views do not necessarily mean two downloads or two decoded bitmaps.
  Preserve the backing image: it fills edges without moving the pedestal.
- A separate front-rim resource transferred twice in the instrumented cold
  sequence: asset loading followed by RN image display did not reliably share that
  resource. This is an animation-front inefficiency, **not duplicated scenery**.
- Five 1,536² RGBA atlases nominally total **45 MiB**, before other resources.
  Preparing that entire set earlier would add much more work than preparing the
  single scenery. Actual native retained/peak memory remains unmeasured.

## 4. Is early preparation feasible?

**Yes, technically, without changing artwork or purchase rules.** The scenery is
known before navigation, independent of reward choice and shared by paid/free
presentation. The important requirement is preparation/display sharing, not just
issuing another URL-prefetch call.

An experiment could retain one retryable prepared source and let the displayed
view consume that same prepared result. Evaluate the already installed Expo Image
capability and the existing background preparation patterns; add no dependency.
Whether a single implementation can provide the desired native and web reuse
must be verified rather than assumed.

Press-in/focus can begin work near intent but offers little lead time. A short,
cancellable Home-idle opportunity offers more time, at the expense of memory,
bandwidth and work for players who never open the chest. Neither guarantees that
a newly mounted native view has already uploaded/painted the prepared bitmap.

## 5. Prioritized minimal fixes — proposals only

| Priority | Proposed experiment | Expected benefit | Main regression risks |
| --- | --- | --- | --- |
| 1 | Prepare only the original scenery near chest intent, retaining one retryable result that the scene itself consumes. Prefer press-in/focus first; consider bounded Home-idle work only if lead time proves insufficient. | Move first-use loading/decode earlier; make later entries reuse preparation rather than rely on implicit cache behavior. May reduce blank scenery time; no defensible Android millisecond guarantee yet. | Short press-in lead time; CPU/memory contention with Home/closed image; failed promise poisoning retries; RN/Expo display paths not actually sharing; geometry/fade differences if renderer changes. |
| 2 | Verify with controlled delayed/failing preparation that scenery readiness and the actual displayed view agree. Keep the independent closed-first display and current navigation behavior. | Establish whether preparation produces visible readiness, rather than only a successful promise. | Treating load/decode as paint; accidentally waiting for all animation assets; introducing a hidden navigation/purchase gate. |
| 3 | Separately investigate sharing the front-rim preload/display result if the repeated transfer remains material. | Remove an observed extra transfer, without assuming it explains the scenery delay. | Broader animation-readiness changes; resource lifecycle errors; interfering with the exact opening sequence. |

Do **not** fix this by warming all atlases/collectibles on Home, hiding the scene
behind a new hard delay, changing cache headers globally, changing artwork or
alignment, choosing a winner early, altering 700-coin/free behavior, or changing
animation/sound timing. Any navigation/purchase-blocking UX needs separate approval.

## 6. Android verification required before claiming success

On an approved existing device/preview, without initiating a build:

1. Record device model, Android version, Expo Go versus installed binary, source
   version, screen size/density, network and cache conditions. Do not assume an
   installed binary contains workspace edits.
2. Mark Home press/navigation, scene mount/layout, native image load/display where
   available, first visible scenery/pedestal, closed-chest display and interaction.
   Use video/trace evidence for visible pixels, not callback timing alone.
3. Compare repeated matched cold-process entry, warm same-session entry and route
   return cases. Report OS image-cache ambiguity; do not clear player data.
4. Measure JS/UI/render thread work, image decode and texture-upload stages and
   retained/peak memory where device tooling permits. Separate contention from
   missing preparation rather than assuming one cause.
5. Check quick press/release, rapid back/re-entry, background/foreground,
   unavailable preparation, retry and low-memory eviction. Ensure original
   pedestal alignment on tall and wider screens and no new startup gate.
6. Confirm paid/free separation, unchanged sounds/sequence and no effect on
   Collection, ads or puzzle backgrounds. Do not spend real coins to time scenery:
   open/cancel confirmation. Any transaction verification must use separately
   authorized isolated test data.

Physical Android access/acceptance is not available at this review, so those
measurements remain explicitly pending.

## 7. Changes and approval boundary

Only this findings document was added for the uploaded request. No application,
artwork, configuration, dependency, gesture, reward, storage, animation or audio
source was changed. No tests/benchmarks were rerun for this documentation-only
recheck; historical measurements are labeled above. No commit, push, merge,
publication or build was initiated.

**Review and explicit approval are required before any optimization.** The separate
word-selection task remains open pending its own Android acceptance; this chest
diagnosis does not complete or supersede that requirement.
