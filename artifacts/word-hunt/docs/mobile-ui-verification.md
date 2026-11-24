# Mobile completion and Collection Room repair

## Scope

Two targeted UI repairs only. No source artwork, puzzle generation, gesture handling,
progression, rewards, chest behavior, ads, dependencies or security fixes changed.
No build, manual commit, push, merge or publish was performed.

## Confirmed causes

### Introductory completion artwork

The published page at `https://word-hunt.replit.app/results?onboardingStep=0`
rendered the correct component and nonzero image/button boxes, but the three
completion PNG requests returned HTTP 404:

- `Nice%20Work.ed63aac4f03da95bafd05d29cebcac71.png`
- `Next%20Panel.1c23ada5939e4a79e93bcade3a8d83f7.png`
- `Home%20Panel.50fd6ed54738cd9468981af60e8ca189.png`

The background loaded successfully. The supplied panel bytes match those content
hashes. All four images loaded in development. At 390 × 844 the NICE WORK box
measured 358 × 209, NEXT 322 × 88, HOME 294 × 83, within the viewport.

The production server passed `new URL(...).pathname` directly to filesystem lookup.
That pathname retains `%20`, whereas the export uses literal spaces in filenames.
A focused regression with the actual PNG bytes and literal exported filenames
reproduced the 404 using the original server, then passed with the repaired server.
This establishes a serving defect, not an introductory route, clipping, aspect-ratio
or safe-area defect. Initial browser-only suspicion of missing uploaded assets was
not sufficient evidence of an incomplete upload; no publication/rebuild is needed
to demonstrate the server bug.

The fix decodes the pathname once before lookup, with an explicit HTTP 400 for
malformed escapes. Existing export-root containment checks and the narrow audio
fallback remain in place. No completion component or navigation edits were needed.

### Collection Room background

Both published and development pages rendered the background image at its intrinsic
1440 × 3200 dimensions, even though the ancestors matched the phone viewport.
The document consequently had a 1440 × 3200 overflow area. The panel list itself
was correctly sized (390 × 628 at y=216 on a 390 × 844 viewport).

React Native Web's `ImageBackground` proxies explicit wrapper width/height onto its
inner `Image`. The wrapper specified only `flex: 1`, leaving those dimensions
undefined; the inner image then used its source's intrinsic dimensions. Absolute
insets did not override those explicit intrinsic dimensions.

The fix gives only the background image `width: '100%'` and `height: '100%'`
through `imageStyle`. Its existing centered `cover` composition remains unchanged.
Panel widths, geometry, slots, list sizing, safe areas and collection data are
untouched.

## Exact changed files

- `artifacts/word-hunt/server/serve.js` — decode encoded asset paths before lookup.
- `artifacts/word-hunt/app/collection.tsx` — constrain the inner background image.
- `artifacts/word-hunt/tests/webServing.test.cjs` — actual PNG byte/URL regressions,
  malformed escapes and encoded-path containment cases.
- `artifacts/word-hunt/tests/collectionPanels.test.cjs` — background sizing and
  unchanged five-panel/30-slot connections at the three phone sizes.
- `artifacts/word-hunt/tests/introCompletion.test.cjs` — add the requested phone
  sizes to the existing safe-bounds and asset-ratio checks.
- `artifacts/word-hunt/docs/mobile-ui-verification.md` — this report.
- `.agents/memory/MEMORY.md` and
  `.agents/memory/published-artwork-verification.md` — retained the diagnostic
  lesson that working development images do not prove production availability.

## Automated checks

- `node --test artifacts/word-hunt/tests/*.test.cjs`: **325 passed, 0 failed**.
- All **201** deterministic generator fixtures matched their full expected outputs,
  including property/placement ordering and random-call fingerprints.
- `pnpm run typecheck`: **passed**, including libraries and all artifact/script
  TypeScript projects.
- `git diff --check`: **passed**.
- Original artwork and protected gameplay/security behavior checks passed unchanged;
  no source-preservation guards were relaxed.

The Expo workflow was restarted once after the edits and serves the browser preview.
Existing startup warnings about native DevTools shared libraries and iOS AdMob
configuration remain outside this repair's scope; browser rendering works.

## Final mobile browser pass

A fresh isolated browser context completed every introductory puzzle with real
drags, starting from Home → PLAY → Tutorial. No progress was seeded or skipped.
Each board's letters were compared with the app's generated grid before solving.

| Completed | Words dragged | Saved next step | Coins | NEXT destination |
| --- | ---: | ---: | ---: | --- |
| Tutorial | 5 | 1 | 60 | Level 1 |
| Level 1 | 5 | 2 | 70 | Level 2 |
| Level 2 | 7 | 3 | 80 | Level 3 |
| Level 3 | 9 | 4 | 90 | Level 4 |
| Level 4 | 12 | 5 | 100 | Level 5 |
| Level 5 | 15 | 6 | 110 | Animals Mode Selection |

At all six real completion routes, background/NICE WORK/NEXT/HOME images were
loaded with nonzero natural widths (547/654/956/941), and the panels had nonzero
visible bounds within 390 × 844. HOME was exercised from the still-valid final
completion route after revisiting it; it returned Home without changing progress.

Collection Room was reached from Home and verified in locked, mixed and all-owned
states at each size:

| Phone viewport | Background box | Document scroll area | Panel list box | List scroll height |
| --- | --- | --- | --- | ---: |
| 390 × 844 | 390 × 844 | 390 × 844 | 390 × 628 | 1420 |
| 393 × 852 | 393 × 852 | 393 × 852 | 393 × 636 | 1430 |
| 360 × 780 | 360 × 780 | 360 × 780 | 360 × 564 | 1316 |

The background retained `cover`; ancestors no longer overflowed. All five panels
and 30 slots were reached by scrolling, including the last slot fully visible at
the bottom. Locked state displayed 0/30; mixed state displayed 8/30 (27%) with
rarity counts 1/2, 1/4, 2/5, 1/7, 3/12; all-owned displayed 30/30 (100%) and full
rarity counts. Only collection test storage was seeded for these ownership checks.
Header back/history navigation returned Home. The Fire Dumpling deep link scrolled
to Rare with its panel 4 px below the list top.

Screenshots, placement-generation helper/data, and the detailed browser report
are retained outside Git/deployment under `.local/verification/word-hunt-mobile-ui/`.
Representative files:

- `step0-results-390x844.png`, `step5-results-390x844.png`
- `collection-mixed-390x844.png`
- `collection-mixed-393x852.png`
- `collection-mixed-360x780.png`
- `collection-allowned-bottom-390x844.png`
- `FINAL-PASS-REPORT.md`

## Limitations

The published app has deliberately not been updated. Its existing 404 responses and
background defect remain live until the reviewed changes are incorporated and a
separately authorized publication occurs. The production-handler regressions use
an in-memory export filesystem with original source PNG bytes: no export/build was
generated. Physical iOS/Android devices and Safari were not tested in this task.
One stale hot-reloaded tab reported a FlatList callback invariant; the fresh
context did not reproduce it. A browser worker timed out during an initial Level 5
drag batch; the reported final run restarted fresh and completed all six puzzles.
The Level 3 completion was verified but its screenshot was not saved. The browser
gesture/assertion code ran in the tester notebook; the retained helper generates
placements and is not a standalone browser test runner.

Selection/chest readiness investigation is separate planned work; no speculative
performance changes were made here.
