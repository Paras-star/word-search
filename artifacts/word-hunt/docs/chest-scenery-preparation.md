# Intent-time chest scenery preparation

Date: 2026-11-24.

## Approval and scope

The user reviewed the proposed experiment based on
[selection-chest-investigation.md](selection-chest-investigation.md) and selected
**“Approve scenery experiment”** before implementation.

Implemented the smaller **intent-time** option, not focused-Home idle work:

- Home chest press-in starts only the exact original scenery PNG. The press
  handler also starts it for accessibility/programmatic activation, then
  navigates synchronously. Merely visiting Home does not request scenery.
- A separate scenery service avoids importing the opening/collectible preparation
  dependency tree into Home. Concurrent callers share one promise; successful
  visits share one strongly retained, original-size ImageRef.
- Native uses Expo's decoded ImageRef. On web, Expo's installed `loadAsync`
  fetches a blob and waits for image **load**, not explicit decode. Preparation
  additionally awaits `HTMLImageElement.decode()` on that blob and retains its
  element. Display consumes the ImageRef's same blob, not the original URL.
- Both foreground and exceptional-aspect-ratio backing use the same ref.
  Nominal retained source budget: one 937 × 1678 RGBA image, 6,289,144 bytes
  (about 6 MiB). This is not a measurement of platform CPU/GPU allocation.
- Direct paid links and free reward entry start the same loader on scene mount.
  They remain functional without visiting Home first.
- A failed attempt clears the pending promise. Scene failure logs a warning and
  displays the original-source fallback; a later entry/intent retries. Unmount
  prevents late state writes without discarding successful shared preparation.

No startup gate, Home idle preload, navigation delay, purchase delay, scenery
interaction gate, atlas/reward prewarm, new dependency, asset conversion, or
production publication was added. The original cover/contain/backing equations,
pedestal placement, closed-first renderer, original animation/artwork/audio,
700-coin transaction, recovery, rarity selection and free rewards are unchanged.
Paid/free route logic and animation preparation were not edited.

## Browser measurement conditions

Disposable Chromium 155 contexts through the existing HTTPS Expo development
preview; 393 × 852 CSS pixels, DPR 3, mobile viewport, mouse input to Pressable.
These are not physical touch latency or optimized/native measurements.
Each context had isolated test progress with 1,400 coins. Confirmation was
opened and **cancelled**, never purchased. All checked balances stayed 1,400.
No real user's progress, collection or balance was accessed.

Cold means fresh browser context, not a cold Metro server. Warm means a second
visit after browser Back and a 1.2-second settled Home in the same document.
The baseline and initial changed-source runs were sequential, with no parallel
measurement contexts. Metro was restarted once after the code batch; its
compilation/cache state and proxy/network load differ between samples.
Fast Refresh connections were disabled only in disposable measurement contexts.

Instrumentation wrapped image `src` assignments, observed load events, called
diagnostic `decode()`, and recorded double-rAF paint **opportunities**. CDP
counted original scenery requests and transfers. Diagnostic decode promises
include scheduling time and can perturb timings; double-rAF does not prove
actual painted pixels or GPU readiness.

### Primary before/after observations

Times are milliseconds from the release/navigation marker. Presses were held
approximately 120 ms by the driver; actual marker intervals varied 129–168 ms.
“Display load” and “display decode” refer to the connected DOM image, not the
detached preparation element.

| Case | Original PNG requests added | Network request duration | Display load | Display diagnostic decode | Paint opportunity | Chest interactive sampled |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Before cold | 1 | 29.2 | 51.9 | 96.9 | 111.2 | 351.9 |
| After cold | 1 | 80.3 | 173.9 | 196.1 | 200.9 | 607.2 |
| Before warm | 0 | — | 44.7 | 48.8 | 73.2 | 166.5 |
| After warm | 0 | — | 23.1 | 27.2 | 49.7 | 134.6 |
| Before, request held 3,000 ms | 1 | 3,041.6 | 3,074.5 | 3,093.7 | 3,105.2 | 357.3 |
| After, request held 3,000 ms | 1 | 3,039.1 | 3,027.2 | 3,029.5 | 3,056.4 | 609.8 |

The changed cold sample was **slower**, while warm and delayed samples were
earlier. These single samples do not establish a general latency improvement
or regression; network and development scheduling varied substantially.
Preparation's detached decode resolved at +152.7 ms in the ordinary changed
cold sample and +3,021.7 ms in its held-request case.

The established improvement is lifecycle/ownership: preparation can start
before navigation, and prepared data is shared with display. It is **not**
a guarantee that scenery will be ready before confirmation. In the held-request
changed case, confirmation appeared at +628.6 ms, well before scenery.
No readiness gate was added to conceal that limitation.

### Additional phase and failure checks

An additional changed-source run recorded wall-clock-aligned request start and
Resource Timing entries. It ran alongside the ancillary scenarios below, so
its latency is **not** a controlled before/after benchmark. It established:

- Cold scenery request began **71.3 ms before** release/navigation. Response/blob
  arrived at −15.2 ms; detached decode resolved +27.4 ms; display adopted the
  prepared blob +34.3 ms. One completed PNG request, encoded body 2,357,344 bytes.
- Warm added zero PNG requests and reused the identical retained blob.
- The 3,000 ms held request began −74.4 ms and finished about +2,947 ms.
- Responses still said `no-store, no-cache, must-revalidate, proxy-revalidate`;
  no disk-cache hits were reported. Retained blob reuse, not HTTP caching,
  accounts for the shared display path.

Ancillary isolated 393 × 600 scenarios covered the two-layer backing layout:

1. Settled Home: **zero** scenery and opening-atlas/front requests.
2. Deliberately held 800 ms chest intent: scenery decoded about **648 ms before**
   release, with Home still visible and no atlas/front requests before release.
   The displayed backing/foreground shared one blob; one original PNG request.
   This is an intentionally long hold, not a representative quick tap.
3. Failed intent and scene preparation: injected two failed PNG requests; original
   fallback then displayed successfully and emitted the expected warning.
   Back/re-entry successfully prepared a blob shared by both layers. Four total
   requests: two injected failures, one fallback, one successful retry.
4. Direct free reward entry with a synthetic pending reward: original closed
   chest/scenery displayed, with one PNG request shared by both layers. No reveal,
   collect or purchase action was taken.

Fresh screenshot checks at 393 × 852 and 393 × 600 showed the original scenery,
closed chest and pedestal alignment; short-screen sky backing remained intact.

## Verification and limits

- `node --test artifacts/word-hunt/tests/*.test.cjs`: **340 passed**, no failures,
  skips or cancellations.
- `pnpm run typecheck`: **passed** across shared libraries, artifacts and scripts.
- `git diff --check`: **passed**.
- Added regressions cover single-flight retention, exact-source-only preparation,
  native/web branches, explicit web decode, sync/async/decode failures, warmup
  diagnostics, no navigation await, two-layer sharing, direct scene entry,
  failure fallback/re-entry, warm first render and unmount cancellation.
- Existing full transaction, free-reward, native closed-first and original
  animation/artwork tests passed unchanged.
- Workflow restarted and served the app. Existing native DevTools missing-system-
  library and iOS ad-configuration startup warnings remain outside this scope.

No physical Android, iOS, native profiler or published optimized build was tested.
Native memory, first-display/GPU latency, and Android performance acceptance
remain unverified. A press-in-only experiment cannot hide a slow cold network.
Any future Home idle policy or hard gate needs a separate UX decision.

Raw JSON, screenshots, diagnostic scripts and full check output are retained in
ignored `.local/verification/chest-scenery/`, excluded from Git and deployment.
They are not shipped instrumentation. `before.json` / `after.json` contain
the primary samples; `after-detailed.json` contains additional request phases;
`checks.json` contains failure/direct-entry/long-hold checks.
