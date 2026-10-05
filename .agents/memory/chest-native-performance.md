---
name: Native chest performance acceptance
description: Android performance is authoritative; preparation must not alter source timing or transaction safety.
---

Judge chest performance on Android separately from the browser. Do not call physical-device latency or memory usage verified on the strength of mocked native tests or a successful native bundle.

**Why:** Browser verification passed, but the user subsequently reported noticeable loading, opening, mid-animation, and reward-appearance delays on the actual Android app.

**How to apply:** Distinguish code-path/bundling checks from device measurements in reports. Keep performance work scoped to preparation and playback; do not redesign the supplied-video sequence or accelerate it to hide loading.

Keep a bounded, decoded cache across chest visits rather than releasing all images on route exit. Prepare all possible winners without choosing or granting a reward before the paid transaction commits.

**Why:** The user requires instant entry and an already-ready dumpling, while forbidding changes to rarity weighting or transaction safety. Route-local file prefetch does not guarantee native bitmap readiness; retaining full-resolution collectibles unnecessarily increases Android memory pressure.

**How to apply:** Preserve the source assets and timeline, separate paid/free logic, and budget retained decoded images. Prewarm the lightweight entry visual, but never make full opening preparation a prerequisite for showing the chest. Route exit should cancel playback, not discard reusable preparation.

Treat decoded-cache readiness and native first-display readiness as different stages. Keep the initial closed-chest visual independent of storage reads, audio readiness, and mounting the opening renderer.

**Why:** The user reported delayed chest appearance on actual Android even after startup decoding and native-clock opening optimizations. A decoded bitmap does not mean a newly mounted native image view has rendered it.

**How to apply:** Prioritize a lightweight exact-source idle visual, confirm its native display before scheduling larger renderer work, and keep that work incremental and cancellable. Do not claim physical-device entry latency is verified by a bundle or mocked display events.

When a reported loading message contradicts the native renderer, inspect the shared/fallback path too and verify which source snapshot/platform the evidence actually exercises.

**Why:** A native-only entry fix left the other renderer waiting for the entire animation resource set. Blocking those requests in a browser reproduced the missing first-visual dependency independently of purchase logic.

**How to apply:** Check all supported renderer variants, hold heavy resources unresolved to prove that the idle visual remains independent, and keep browser evidence separate from installed Android-binary evidence. Do not infer that a user's installed build matches the workspace.

The independent closed-first entry approach is confirmed working by the user on a physical Android device.

**Why:** On 2026-10-05, the user explicitly confirmed that the Treasure Chest entry/loading fix passed physical Android testing.

**How to apply:** Preserve this confirmed entry approach in future work. This confirmation covers entry/loading, not blanket approval of future changes or permission to build or publish.